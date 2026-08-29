/**
 * Design tokens JSON adapter.
 *
 * Reads the W3C Design Tokens format — `$value`, `$type`, `$description`,
 * `$deprecated`, with `$type` inherited from enclosing groups — and the
 * unprefixed `value`/`type` spelling that Style Dictionary and Tokens Studio
 * files still use. The `$` forms win where both appear.
 *
 * A node is a token when it carries a value key and a group otherwise. The one
 * ambiguous case is a group whose child is literally named `value`; that parses
 * as a token with an object value, fails to normalize, and surfaces as a
 * diagnostic rather than silently producing nonsense.
 *
 * Pure (invariant 12): this takes a decoded document, never a path.
 */

import type { ParseDiagnostic } from '../domain/diagnostic.js'
import { type ParseResult, parseOk } from '../domain/diagnostic.js'
import { tokenId as asTokenId } from '../domain/ids.js'
import { createSnapshot, type DesignSystemSnapshot } from '../domain/snapshot.js'
import type { DesignToken, TokenType } from '../domain/token.js'
import type { Source } from '../domain/source.js'
import type { DimensionOptions } from '../normalize/dimension.js'
import { inferValue, type NormalizableType, normalizeForType } from '../normalize/value.js'

const TOKEN_TYPES: ReadonlySet<string> = new Set<TokenType>([
  'color',
  'dimension',
  'duration',
  'number',
  'fontFamily',
  'fontWeight',
  'typography',
  'shadow',
  'string',
])

export interface TokensJsonOptions extends DimensionOptions {
  /** File path recorded on each token's location, for reports. */
  readonly file?: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `$value` wins over `value`; a node with neither is a group. */
function valueOf(node: Record<string, unknown>): { present: boolean; value: unknown } {
  if (Object.hasOwn(node, '$value')) return { present: true, value: node['$value'] }
  if (Object.hasOwn(node, 'value')) return { present: true, value: node['value'] }
  return { present: false, value: undefined }
}

function declaredType(node: Record<string, unknown>): string | undefined {
  const type = node['$type'] ?? node['type']
  return typeof type === 'string' ? type : undefined
}

/** The author's text for a value, kept verbatim (invariant 8). */
function rawOf(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
}

export function parseTokensJson(
  input: unknown,
  source: Source,
  options: TokensJsonOptions = {},
): ParseResult<DesignSystemSnapshot> {
  const diagnostics: ParseDiagnostic[] = []
  const tokens: DesignToken[] = []

  const dimensionOptions: DimensionOptions =
    options.rootFontSizePx === undefined ? {} : { rootFontSizePx: options.rootFontSizePx }

  const fail = (message: string, path: string, raw?: unknown): void => {
    diagnostics.push({
      severity: 'error',
      code: 'unreadable-token',
      message,
      sourceId: source.id,
      path,
      ...(raw === undefined ? {} : { raw: rawOf(raw) }),
      ...(options.file === undefined ? {} : { location: { file: options.file } }),
    })
  }

  const walk = (node: unknown, path: readonly string[], inheritedType: string | undefined): void => {
    if (!isPlainObject(node)) {
      fail('expected a token or a group object', path.join('.'), node)
      return
    }

    const type = declaredType(node) ?? inheritedType
    const { present, value } = valueOf(node)

    if (present) {
      // Type is only inferred when the document declares none. A declared type
      // is authoritative even if the value fails to normalize under it — that
      // disagreement is a diagnostic, not a reason to silently pick another.
      const normalized =
        type === undefined
          ? inferValue(rawOf(value), dimensionOptions)
          : {
              type: (TOKEN_TYPES.has(type) ? type : 'string') as NormalizableType,
              value: normalizeForType(
                (TOKEN_TYPES.has(type) ? type : 'string') as NormalizableType,
                value,
                dimensionOptions,
              ),
            }

      if (type !== undefined && !TOKEN_TYPES.has(type)) {
        diagnostics.push({
          severity: 'warning',
          code: 'unsupported-token-type',
          message: `unsupported $type ${JSON.stringify(type)}; read as a string`,
          sourceId: source.id,
          path: path.join('.'),
          raw: type,
        })
      }

      if (normalized.value.kind === 'unnormalized') {
        diagnostics.push({
          severity: 'warning',
          code: 'unnormalizable-value',
          message: `could not normalize ${path.join('.')}: ${normalized.value.reason}`,
          sourceId: source.id,
          path: path.join('.'),
          raw: normalized.value.raw,
          ...(options.file === undefined ? {} : { location: { file: options.file } }),
        })
      }

      const description = node['$description'] ?? node['description']
      const deprecated = node['$deprecated'] ?? node['deprecated']

      tokens.push({
        id: asTokenId(path.join('.')),
        sourceId: source.id,
        path,
        type: normalized.type as TokenType,
        raw: rawOf(value),
        value: normalized.value,
        ...(deprecated === true ? { deprecated: true } : {}),
        ...(typeof description === 'string' ? { description } : {}),
        ...(options.file === undefined ? {} : { location: { file: options.file } }),
      })
      return
    }

    for (const [key, child] of Object.entries(node)) {
      // `$type`, `$description` and friends are metadata on the group itself.
      if (key.startsWith('$')) continue
      walk(child, [...path, key], type)
    }
  }

  if (!isPlainObject(input)) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'unreadable-document',
          message: 'a tokens document must be an object',
          sourceId: source.id,
          path: '',
          raw: rawOf(input),
        },
      ],
    }
  }

  walk(input, [], undefined)

  return parseOk(createSnapshot({ source, tokens, diagnostics }), diagnostics)
}
