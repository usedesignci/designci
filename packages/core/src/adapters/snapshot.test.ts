import { describe, expect, it } from 'vitest'

import { SNAPSHOT_SCHEMA_VERSION } from '../domain/snapshot.js'
import * as fixture from '../fixtures/small-system.js'
import { parseSnapshot } from './snapshot.js'

/** The corpus snapshot after a JSON round trip, as the plugin export would be. */
const wire = (): unknown => JSON.parse(JSON.stringify(fixture.figmaSnapshot))

describe('parseSnapshot', () => {
  it('round-trips the corpus snapshot exactly', () => {
    const result = parseSnapshot(wire())
    if (!result.ok) throw new Error('expected the corpus snapshot to parse')
    expect(JSON.stringify(result.value)).toBe(JSON.stringify(fixture.figmaSnapshot))
  })

  it('refuses a snapshot written by a newer engine (invariant 9)', () => {
    const input = wire() as { schemaVersion: number }
    input.schemaVersion = SNAPSHOT_SCHEMA_VERSION + 1
    const result = parseSnapshot(input)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.message).toContain('newer than this engine supports')
  })

  it('fails on a document without the required shape, without throwing', () => {
    for (const input of [null, 42, [], {}, { schemaVersion: 1 }, { schemaVersion: 1, source: {} }]) {
      expect(parseSnapshot(input).ok, JSON.stringify(input)).toBe(false)
    }
  })

  it('drops a malformed token with a diagnostic, keeping the rest (invariant 7)', () => {
    const input = wire() as { tokens: unknown[] }
    input.tokens[3] = { id: 'broken' }
    const result = parseSnapshot(input)
    if (!result.ok) throw new Error('one bad token must not fail the snapshot')
    expect(result.value.tokens).toHaveLength(24)
    expect(result.value.diagnostics.map((d) => d.code)).toEqual(['invalid-snapshot-token'])
  })

  it('rejects a token whose raw is missing (invariant 8)', () => {
    const input = wire() as { tokens: Record<string, unknown>[] }
    delete (input.tokens[0] as Record<string, unknown>)['raw']
    const result = parseSnapshot(input)
    if (!result.ok) throw new Error('expected a per-token diagnostic')
    expect(result.value.tokens).toHaveLength(24)
    expect(result.value.diagnostics[0]?.message).toContain('invariant 8')
  })

  it('carries the writer diagnostics through', () => {
    const input = wire() as { diagnostics: unknown[] }
    input.diagnostics = [
      { severity: 'warning', code: 'unbound-variable', message: 'variable had no value' },
    ]
    const result = parseSnapshot(input)
    if (!result.ok) throw new Error('expected the snapshot to parse')
    expect(result.value.diagnostics.map((d) => d.code)).toEqual(['unbound-variable'])
  })

  it('parses into a snapshot the runner accepts end to end', () => {
    const result = parseSnapshot(wire())
    if (!result.ok) throw new Error('expected the snapshot to parse')
    expect(result.value.source.role).toBe('design')
    expect(result.value.tokens.every((token) => token.sourceId === result.value.source.id)).toBe(
      true,
    )
  })
})
