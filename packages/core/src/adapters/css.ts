/**
 * CSS custom property adapter.
 *
 * Scans stylesheet text for custom property declarations and turns each into a
 * token. This is a targeted scanner, not a full CSS parser: it tracks block
 * depth, strings and comments so it can find `--name: value;` declarations
 * wherever they appear — in `:root`, in a theme class, inside `@layer` — and
 * ignores everything else.
 *
 * Declarations inside a conditional at-rule (`@media`, `@supports`,
 * `@container`) are reported and skipped rather than read. A dark-theme override
 * is a different mode of a token, not its default value, and comparing it
 * against a design source's default would manufacture drift that is not there.
 *
 * A stylesheet declares no types, so each value's type is inferred from its
 * syntax (see `inferValue`), never from the property's name.
 *
 * The token id is the full property name, `--color-brand-primary`, and that is
 * what config mappings key on. `path` splits the name on hyphens purely so
 * output reads well and same-namespace grouping works; it never participates in
 * cross-source matching, so the split cannot cause a false equivalence.
 *
 * Pure (invariant 12): this takes stylesheet text, never a path.
 */

import type { ParseDiagnostic, ParseResult } from '../domain/diagnostic.js'
import { parseOk } from '../domain/diagnostic.js'
import { tokenId as asTokenId } from '../domain/ids.js'
import type { Source, SourceLocation } from '../domain/source.js'
import { createSnapshot, type DesignSystemSnapshot } from '../domain/snapshot.js'
import type { DesignToken, TokenType } from '../domain/token.js'
import type { DimensionOptions } from '../normalize/dimension.js'
import { inferValue } from '../normalize/value.js'

export interface CssOptions extends DimensionOptions {
  /** Repo-relative path recorded on each token, for reports. */
  readonly file?: string
}

interface Declaration {
  readonly name: string
  readonly value: string
  readonly line: number
  readonly column: number
  /**
   * True when the declaration sits inside `@media`, `@supports` or
   * `@container`. Such a value applies only in that context, so it is not the
   * token's default and must not be compared against a design source's default.
   */
  readonly conditional: boolean
}

const VAR_REFERENCE = /^var\(\s*(--[^\s,)]+)/

/**
 * At-rules whose contents apply only under a condition. `@layer` and `@scope`
 * are absent deliberately: they group declarations without making them
 * conditional, so tokens inside them are ordinary defaults.
 */
const CONDITIONAL_AT_RULES = /@(media|supports|container)\b/i

/**
 * Finds custom property declarations in stylesheet text.
 *
 * Walks character by character, skipping comments and string literals so a `;`
 * or `}` inside them cannot end a declaration early, and tracking brace depth so
 * a declaration is only read where one can legally appear.
 */
function scanDeclarations(css: string): Declaration[] {
  const declarations: Declaration[] = []
  let index = 0
  let line = 1
  let column = 1
  let depth = 0
  // One entry per open block, recording whether it is conditional. A block
  // nested inside a conditional one is conditional too.
  const conditional: boolean[] = []
  let prelude = ''

  const advance = (count: number): void => {
    for (let i = 0; i < count; i += 1) {
      if (css[index] === '\n') {
        line += 1
        column = 1
      } else {
        column += 1
      }
      index += 1
    }
  }

  while (index < css.length) {
    const char = css[index] as string

    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2)
      advance((end === -1 ? css.length : end + 2) - index)
      continue
    }

    if (char === '"' || char === "'") {
      let end = index + 1
      while (end < css.length && css[end] !== char) {
        if (css[end] === '\\') end += 1
        end += 1
      }
      advance(Math.min(end + 1, css.length) - index)
      continue
    }

    if (char === '{') {
      depth += 1
      conditional.push(
        (conditional.at(-1) ?? false) || CONDITIONAL_AT_RULES.test(prelude),
      )
      prelude = ''
      advance(1)
      continue
    }

    if (char === '}') {
      depth = Math.max(0, depth - 1)
      conditional.pop()
      prelude = ''
      advance(1)
      continue
    }

    if (char === ';' && depth === 0) {
      // An at-statement such as `@import` ends without a block.
      prelude = ''
      advance(1)
      continue
    }

    // A custom property declaration only means anything inside a rule block.
    if (depth > 0 && char === '-' && css[index + 1] === '-') {
      const startLine = line
      const startColumn = column
      const colon = css.indexOf(':', index)

      if (colon !== -1) {
        const name = css.slice(index, colon).trim()

        if (/^--[^\s:;{}]+$/.test(name)) {
          // The value runs to the next top-level `;` or the closing `}`, with
          // nested parens, strings and comments skipped.
          let cursor = colon + 1
          let parens = 0
          while (cursor < css.length) {
            const current = css[cursor] as string
            if (current === '/' && css[cursor + 1] === '*') {
              const end = css.indexOf('*/', cursor + 2)
              cursor = end === -1 ? css.length : end + 2
              continue
            }
            if (current === '"' || current === "'") {
              let end = cursor + 1
              while (end < css.length && css[end] !== current) {
                if (css[end] === '\\') end += 1
                end += 1
              }
              cursor = Math.min(end + 1, css.length)
              continue
            }
            if (current === '(') parens += 1
            else if (current === ')') parens = Math.max(0, parens - 1)
            else if (parens === 0 && (current === ';' || current === '}')) break
            cursor += 1
          }

          const raw = css.slice(colon + 1, cursor)
          const value = raw.replace(/!important\s*$/i, '').trim()

          if (value.length > 0) {
            declarations.push({
              name,
              value,
              line: startLine,
              column: startColumn,
              conditional: conditional.at(-1) ?? false,
            })
          }

          // Stop before a closing brace so the depth tracking still sees it.
          advance(cursor - index)
          continue
        }
      }
    }

    prelude += char
    advance(1)
  }

  return declarations
}

/**
 * Splits `--color-brand-primary` into a display path. A single-segment name
 * yields a single-segment path; nothing here is used for cross-source matching.
 */
function toPath(name: string): string[] {
  return name.replace(/^--/, '').split('-').filter((part) => part.length > 0)
}

export function parseCss(
  css: string,
  source: Source,
  options: CssOptions = {},
): ParseResult<DesignSystemSnapshot> {
  const diagnostics: ParseDiagnostic[] = []
  const tokens: DesignToken[] = []
  const seen = new Map<string, DesignToken>()

  const dimensionOptions: DimensionOptions =
    options.rootFontSizePx === undefined ? {} : { rootFontSizePx: options.rootFontSizePx }

  for (const declaration of scanDeclarations(css)) {
    const location: SourceLocation = {
      file: options.file ?? source.origin ?? '',
      line: declaration.line,
      column: declaration.column,
    }

    if (declaration.conditional) {
      // A dark-theme or breakpoint override is a different mode of the token,
      // not its default. Reading it as the token's value would compare a dark
      // colour against a light design variable and report drift that is not
      // there. Modes are a later milestone; until then this is surfaced, not
      // silently dropped (invariant 7).
      diagnostics.push({
        severity: 'warning',
        code: 'conditional-declaration',
        message: `${declaration.name} is declared inside a conditional at-rule and was skipped; Design CI does not model theme modes yet`,
        sourceId: source.id,
        raw: declaration.value,
        location,
      })
      continue
    }

    // `var(--other)` is a reference, not a value. It stays an alias so an
    // unresolvable reference is visible rather than silently becoming a string.
    const reference = VAR_REFERENCE.exec(declaration.value)
    const inferred = reference
      ? {
          type: 'string' as const,
          value: {
            kind: 'alias' as const,
            raw: declaration.value,
            target: reference[1] as string,
          },
        }
      : inferValue(declaration.value, dimensionOptions)

    const token: DesignToken = {
      id: asTokenId(declaration.name),
      sourceId: source.id,
      path: toPath(declaration.name),
      type: inferred.type as TokenType,
      raw: declaration.value,
      value: inferred.value,
      ...(location.file === '' ? {} : { location }),
    }

    const previous = seen.get(declaration.name)
    if (previous) {
      // A stylesheet may legitimately redeclare a property — a dark theme block,
      // a media query. The last declaration wins, as it would in a browser, and
      // the override is reported rather than hidden.
      diagnostics.push({
        severity: 'warning',
        code: 'redeclared-property',
        message: `${declaration.name} is declared more than once; the last declaration wins`,
        sourceId: source.id,
        raw: declaration.value,
        location,
      })
      tokens[tokens.indexOf(previous)] = token
      seen.set(declaration.name, token)
      continue
    }

    tokens.push(token)
    seen.set(declaration.name, token)
  }

  return parseOk(createSnapshot({ source, tokens, diagnostics }), diagnostics)
}
