/**
 * Config parsing and validation.
 *
 * Pure: this takes an already-decoded value — the result of `JSON.parse`, a YAML
 * loader, or a plugin's stored settings — and validates it. It never reads a
 * file. Reading `designci.config.json` off disk belongs to the CLI; the Figma
 * plugin runs in a sandbox with no filesystem at all and needs to parse the same
 * config from its own storage, so the boundary has to sit here.
 *
 * Invariant 7: a malformed config produces typed diagnostics, never a throw. A
 * config with a bad rule severity fails; a config with a typo'd top-level key
 * parses with a warning, because refusing to run over a stray key would be worse
 * than telling the author about it.
 */

import type { CheckConfig, RuleConfig, TokenMapping } from '../domain/config.js'
import {
  type ParseDiagnostic,
  type ParseResult,
  parseFailed,
  parseOk,
} from '../domain/diagnostic.js'
import { sourceId as asSourceId, tokenId as asTokenId } from '../domain/ids.js'
import type { Severity } from '../domain/violation.js'

const SEVERITIES: ReadonlySet<string> = new Set<Severity>(['off', 'info', 'warn', 'error'])

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(['rules', 'mappings', 'rootFontSizePx'])

export interface ParseConfigOptions {
  /**
   * Rule ids the engine knows about. When supplied, a config entry naming an
   * unknown rule produces a warning — a typo in a rule name would otherwise
   * silently do nothing, which is the worst way for a policy to fail.
   */
  readonly knownRuleIds?: readonly string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function error(message: string, path: string, raw?: unknown): ParseDiagnostic {
  return {
    severity: 'error',
    code: 'invalid-config',
    message,
    path,
    ...(raw === undefined ? {} : { raw: JSON.stringify(raw) }),
  }
}

function warning(code: string, message: string, path: string): ParseDiagnostic {
  return { severity: 'warning', code, message, path }
}

function parseRules(
  input: unknown,
  diagnostics: ParseDiagnostic[],
  options: ParseConfigOptions,
): Record<string, RuleConfig> {
  const rules: Record<string, RuleConfig> = {}
  if (input === undefined) return rules

  if (!isPlainObject(input)) {
    diagnostics.push(error('rules must be an object keyed by rule id', 'rules', input))
    return rules
  }

  const known = options.knownRuleIds === undefined ? undefined : new Set(options.knownRuleIds)

  for (const [id, value] of Object.entries(input)) {
    const path = `rules.${id}`

    if (known && !known.has(id)) {
      diagnostics.push(
        warning('unknown-rule', `no rule named ${id}; this entry has no effect`, path),
      )
    }

    // Shorthand: `"token-value-mismatch": "error"`.
    if (typeof value === 'string') {
      if (!SEVERITIES.has(value)) {
        diagnostics.push(error(`invalid severity ${JSON.stringify(value)}`, path, value))
        continue
      }
      rules[id] = { severity: value as Severity }
      continue
    }

    if (!isPlainObject(value)) {
      diagnostics.push(error('rule config must be a severity string or an object', path, value))
      continue
    }

    const severity = value['severity']
    if (typeof severity !== 'string' || !SEVERITIES.has(severity)) {
      diagnostics.push(
        error('rule config requires a severity of off, info, warn or error', path, severity),
      )
      continue
    }

    const rawOptions = value['options']
    if (rawOptions !== undefined && !isPlainObject(rawOptions)) {
      diagnostics.push(error('rule options must be an object', `${path}.options`, rawOptions))
      continue
    }

    // Invariant 10: omit `options` entirely rather than setting it undefined.
    rules[id] =
      rawOptions === undefined
        ? { severity: severity as Severity }
        : { severity: severity as Severity, options: rawOptions }
  }

  return rules
}

/**
 * Expands the authoring form of a mapping into pairs.
 *
 * A mapping entry names one token per source:
 *
 *   { "figma": "color.brand.primary", "css": "--color-brand-primary" }
 *
 * Every source in the entry is stated by the author to hold the same design
 * decision, so an entry naming three sources expands to all three pairs. That is
 * not inference — the author wrote them down together (invariant 4). There is
 * deliberately no pattern or prefix form: a glob that turns `color.*` into
 * `--color-*` would be exactly the name-based guessing the engine forbids.
 */
function parseMappings(input: unknown, diagnostics: ParseDiagnostic[]): TokenMapping[] {
  const mappings: TokenMapping[] = []
  if (input === undefined) return mappings

  if (!Array.isArray(input)) {
    diagnostics.push(error('mappings must be an array', 'mappings', input))
    return mappings
  }

  for (const [index, entry] of input.entries()) {
    const path = `mappings[${index}]`

    if (!isPlainObject(entry)) {
      diagnostics.push(error('a mapping must be an object of sourceId to tokenId', path, entry))
      continue
    }

    const pairs: { sourceId: string; tokenId: string }[] = []
    let malformed = false

    for (const [source, token] of Object.entries(entry)) {
      if (typeof token !== 'string' || token.length === 0) {
        diagnostics.push(error(`${source} must name a token id`, `${path}.${source}`, token))
        malformed = true
        continue
      }
      pairs.push({ sourceId: source, tokenId: token })
    }

    if (malformed) continue

    if (pairs.length < 2) {
      diagnostics.push(
        error('a mapping must name a token in at least two sources', path, entry),
      )
      continue
    }

    for (let i = 0; i < pairs.length; i += 1) {
      for (let j = i + 1; j < pairs.length; j += 1) {
        const from = pairs[i] as { sourceId: string; tokenId: string }
        const to = pairs[j] as { sourceId: string; tokenId: string }
        mappings.push({
          from: { sourceId: asSourceId(from.sourceId), tokenId: asTokenId(from.tokenId) },
          to: { sourceId: asSourceId(to.sourceId), tokenId: asTokenId(to.tokenId) },
        })
      }
    }
  }

  return mappings
}

function parseRootFontSize(input: unknown, diagnostics: ParseDiagnostic[]): number | undefined {
  if (input === undefined) return undefined
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) {
    diagnostics.push(error('rootFontSizePx must be a positive number', 'rootFontSizePx', input))
    return undefined
  }
  return input
}

/**
 * Validates a decoded config document.
 *
 * Returns `ok: false` only when the config cannot be trusted — a bad severity or
 * a malformed mapping is a policy the author did not get to state, and running
 * with it silently dropped would apply a policy nobody wrote. Warnings alone
 * still parse.
 */
export function parseConfig(
  input: unknown,
  options: ParseConfigOptions = {},
): ParseResult<CheckConfig> {
  const diagnostics: ParseDiagnostic[] = []

  if (!isPlainObject(input)) {
    return parseFailed([error('config must be an object', '', input)])
  }

  for (const key of Object.keys(input)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      diagnostics.push(warning('unknown-config-key', `unknown config key ${key}`, key))
    }
  }

  const rules = parseRules(input['rules'], diagnostics, options)
  const mappings = parseMappings(input['mappings'], diagnostics)
  const rootFontSizePx = parseRootFontSize(input['rootFontSizePx'], diagnostics)

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return parseFailed(diagnostics)
  }

  const config: CheckConfig =
    rootFontSizePx === undefined ? { rules, mappings } : { rules, mappings, rootFontSizePx }

  return parseOk(config, diagnostics)
}
