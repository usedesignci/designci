/**
 * Serialized snapshot adapter.
 *
 * Reads a `DesignSystemSnapshot` that crossed a process boundary — the Figma
 * plugin's export file, a cached snapshot, the cloud's stored copy. This is the
 * wire format invariant 9 exists for: the reader checks `schemaVersion` before
 * believing anything else, and refuses a version newer than it knows rather
 * than misreading what a newer writer meant.
 *
 * Validation is structural, not semantic: each token must have the right shape,
 * but a normalized value is taken as the writer produced it. Re-deriving values
 * here would mean the reader second-guessing the writer's normalizer — the two
 * are the same code at the same version when it matters, and a disagreement
 * between versions is exactly what the schema version is for.
 */

import type { ParseDiagnostic, ParseResult } from '../domain/diagnostic.js'
import { parseOk } from '../domain/diagnostic.js'
import { sourceId as asSourceId, tokenId as asTokenId } from '../domain/ids.js'
import type { Source, SourceKind, SourceRole } from '../domain/source.js'
import {
  createSnapshot,
  type DesignSystemSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
} from '../domain/snapshot.js'
import type { DesignToken, TokenType } from '../domain/token.js'
import type { NormalizedValue } from '../normalize/types.js'

const SOURCE_KINDS: ReadonlySet<string> = new Set<SourceKind>([
  'figma',
  'tokens-json',
  'css',
  'tailwind',
  'code',
])

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
  'unknown',
])

const VALUE_KINDS: ReadonlySet<string> = new Set<NormalizedValue['kind']>([
  'color',
  'dimension',
  'relative',
  'number',
  'duration',
  'fontWeight',
  'fontFamily',
  'string',
  'alias',
  'typography',
  'shadow',
  'unnormalized',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSnapshot(input: unknown): ParseResult<DesignSystemSnapshot> {
  const fail = (message: string, path: string, raw?: unknown): ParseResult<DesignSystemSnapshot> => ({
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'invalid-snapshot',
        message,
        path,
        ...(raw === undefined ? {} : { raw: typeof raw === 'string' ? raw : JSON.stringify(raw) }),
      },
    ],
  })

  if (!isPlainObject(input)) return fail('a snapshot must be an object', '', input)

  const schemaVersion = input['schemaVersion']
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return fail('a snapshot requires an integer schemaVersion', 'schemaVersion', schemaVersion)
  }
  if (schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
    return fail(
      `snapshot schemaVersion ${schemaVersion} is newer than this engine supports (${SNAPSHOT_SCHEMA_VERSION}); upgrade Design CI`,
      'schemaVersion',
      schemaVersion,
    )
  }

  const rawSource = input['source']
  if (!isPlainObject(rawSource)) return fail('a snapshot requires a source', 'source', rawSource)

  const sourceIdValue = rawSource['id']
  const kind = rawSource['kind']
  const role = rawSource['role']
  const label = rawSource['label']
  if (typeof sourceIdValue !== 'string' || sourceIdValue.length === 0) {
    return fail('source.id must be a non-empty string', 'source.id', sourceIdValue)
  }
  if (typeof kind !== 'string' || !SOURCE_KINDS.has(kind)) {
    return fail('source.kind is not a known kind', 'source.kind', kind)
  }
  if (role !== 'design' && role !== 'code') {
    return fail('source.role must be design or code', 'source.role', role)
  }
  if (typeof label !== 'string') {
    return fail('source.label must be a string', 'source.label', label)
  }

  const origin = rawSource['origin']
  const source: Source = {
    id: asSourceId(sourceIdValue),
    kind: kind as SourceKind,
    role: role as SourceRole,
    label,
    ...(typeof origin === 'string' ? { origin } : {}),
  }

  const rawTokens = input['tokens']
  if (!Array.isArray(rawTokens)) return fail('snapshot tokens must be an array', 'tokens', rawTokens)

  const diagnostics: ParseDiagnostic[] = []
  const tokens: DesignToken[] = []
  const seen = new Set<string>()

  for (const [index, raw] of rawTokens.entries()) {
    const path = `tokens[${index}]`
    const drop = (message: string, value?: unknown): void => {
      // One malformed token does not discard the other 300 (invariant 7).
      diagnostics.push({
        severity: 'error',
        code: 'invalid-snapshot-token',
        message,
        sourceId: source.id,
        path,
        ...(value === undefined
          ? {}
          : { raw: typeof value === 'string' ? value : JSON.stringify(value) }),
      })
    }

    if (!isPlainObject(raw)) {
      drop('a token must be an object', raw)
      continue
    }

    const id = raw['id']
    const tokenPath = raw['path']
    const type = raw['type']
    const rawText = raw['raw']
    const value = raw['value']

    if (typeof id !== 'string' || id.length === 0) {
      drop('token id must be a non-empty string', id)
      continue
    }
    if (seen.has(id)) {
      drop(`duplicate token id ${JSON.stringify(id)}`, id)
      continue
    }
    if (
      !Array.isArray(tokenPath) ||
      tokenPath.length === 0 ||
      !tokenPath.every((part) => typeof part === 'string')
    ) {
      drop('token path must be a non-empty array of strings', tokenPath)
      continue
    }
    if (typeof type !== 'string' || !TOKEN_TYPES.has(type)) {
      drop('token type is not a known type', type)
      continue
    }
    if (typeof rawText !== 'string') {
      drop('token raw must be a string (invariant 8)', rawText)
      continue
    }
    if (
      !isPlainObject(value) ||
      typeof value['kind'] !== 'string' ||
      !VALUE_KINDS.has(value['kind'])
    ) {
      drop('token value must be a normalized value', value)
      continue
    }

    seen.add(id)

    const deprecated = raw['deprecated']
    const description = raw['description']
    const location = raw['location']

    tokens.push({
      id: asTokenId(id),
      sourceId: source.id,
      path: tokenPath as string[],
      type: type as TokenType,
      raw: rawText,
      value: value as unknown as NormalizedValue,
      ...(deprecated === true ? { deprecated: true } : {}),
      ...(typeof description === 'string' ? { description } : {}),
      ...(isPlainObject(location) && typeof location['file'] === 'string'
        ? {
            location: {
              file: location['file'],
              ...(typeof location['line'] === 'number' ? { line: location['line'] } : {}),
              ...(typeof location['column'] === 'number' ? { column: location['column'] } : {}),
            },
          }
        : {}),
    })
  }

  // Diagnostics the writer recorded travel with the snapshot (invariant 7).
  const carried = Array.isArray(input['diagnostics'])
    ? (input['diagnostics'] as unknown[]).filter(
        (entry): entry is ParseDiagnostic =>
          isPlainObject(entry) &&
          (entry['severity'] === 'error' || entry['severity'] === 'warning') &&
          typeof entry['code'] === 'string' &&
          typeof entry['message'] === 'string',
      )
    : []

  const exportedAt = input['exportedAt']

  return parseOk(
    createSnapshot({
      source,
      tokens,
      diagnostics: [...carried, ...diagnostics],
      ...(typeof exportedAt === 'string' ? { exportedAt } : {}),
    }),
    diagnostics,
  )
}
