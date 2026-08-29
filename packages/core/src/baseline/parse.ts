/**
 * Baseline parsing.
 *
 * Pure, like config parsing: the caller decodes the file, this validates it.
 *
 * A baseline that cannot be read is an error, never a silent empty baseline.
 * Treating an unreadable baseline as "accept nothing" would fail CI on drift the
 * team already accepted; treating it as "accept everything" would hide real
 * regressions. Both are worse than saying the file is broken.
 */

import {
  type Baseline,
  BASELINE_SCHEMA_VERSION,
  type BaselineEntry,
} from '../domain/baseline.js'
import {
  type ParseDiagnostic,
  type ParseResult,
  parseFailed,
  parseOk,
} from '../domain/diagnostic.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function error(message: string, path: string, raw?: unknown): ParseDiagnostic {
  return {
    severity: 'error',
    code: 'invalid-baseline',
    message,
    path,
    ...(raw === undefined ? {} : { raw: JSON.stringify(raw) }),
  }
}

function optionalString(
  value: unknown,
  key: string,
  path: string,
  diagnostics: ParseDiagnostic[],
): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    diagnostics.push(error(`${key} must be a string`, `${path}.${key}`, value))
    return undefined
  }
  return value
}

function requiredString(
  value: unknown,
  key: string,
  path: string,
  diagnostics: ParseDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    diagnostics.push(error(`${key} is required`, `${path}.${key}`, value))
    return undefined
  }
  return value
}

export function parseBaseline(input: unknown): ParseResult<Baseline> {
  const diagnostics: ParseDiagnostic[] = []

  if (!isPlainObject(input)) {
    return parseFailed([error('baseline must be an object', '', input)])
  }

  const schemaVersion = input['schemaVersion']
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return parseFailed([
      error('baseline requires an integer schemaVersion', 'schemaVersion', schemaVersion),
    ])
  }
  if (schemaVersion > BASELINE_SCHEMA_VERSION) {
    // Written by a newer engine. Guessing at a format we do not know would be a
    // silent misread of what the team accepted (invariant 9).
    return parseFailed([
      error(
        `baseline schemaVersion ${schemaVersion} is newer than this engine supports (${BASELINE_SCHEMA_VERSION}); upgrade Design CI`,
        'schemaVersion',
        schemaVersion,
      ),
    ])
  }

  const rawEntries = input['entries']
  if (!Array.isArray(rawEntries)) {
    return parseFailed([error('baseline entries must be an array', 'entries', rawEntries)])
  }

  const entries: BaselineEntry[] = []
  const seen = new Set<string>()

  for (const [index, raw] of rawEntries.entries()) {
    const path = `entries[${index}]`

    if (!isPlainObject(raw)) {
      diagnostics.push(error('a baseline entry must be an object', path, raw))
      continue
    }

    const fingerprint = requiredString(raw['fingerprint'], 'fingerprint', path, diagnostics)
    const ruleId = requiredString(raw['ruleId'], 'ruleId', path, diagnostics)
    const code = requiredString(raw['code'], 'code', path, diagnostics)
    const sourceId = requiredString(raw['sourceId'], 'sourceId', path, diagnostics)
    if (!fingerprint || !ruleId || !code || !sourceId) continue

    if (seen.has(fingerprint)) {
      // Harmless — the second entry would suppress the same violation — but it
      // means a hand-edited file has drifted from what the tool writes.
      diagnostics.push({
        severity: 'warning',
        code: 'duplicate-baseline-entry',
        message: `duplicate baseline entry for ${fingerprint}`,
        path,
      })
      continue
    }
    seen.add(fingerprint)

    const tokenId = optionalString(raw['tokenId'], 'tokenId', path, diagnostics)
    const tokenName = optionalString(raw['tokenName'], 'tokenName', path, diagnostics)
    const note = optionalString(raw['note'], 'note', path, diagnostics)

    entries.push({
      fingerprint,
      ruleId,
      code,
      sourceId,
      ...(tokenId === undefined ? {} : { tokenId }),
      ...(tokenName === undefined ? {} : { tokenName }),
      ...(note === undefined ? {} : { note }),
    })
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return parseFailed(diagnostics)
  }

  return parseOk({ schemaVersion: BASELINE_SCHEMA_VERSION, entries }, diagnostics)
}
