import { describe, expect, it } from 'vitest'

import { BASELINE_SCHEMA_VERSION, type Baseline } from '../domain/baseline.js'
import { ruleId, sourceId, tokenId } from '../domain/ids.js'
import type { Violation } from '../domain/violation.js'
import { applyBaseline, createBaseline } from './apply.js'
import { fingerprintViolation } from './fingerprint.js'
import { parseBaseline } from './parse.js'

function violation(overrides: Partial<Violation> = {}): Violation {
  return {
    ruleId: ruleId('token-value-mismatch'),
    severity: 'error',
    code: 'value-mismatch',
    message: 'radius.lg differs',
    sourceId: sourceId('css'),
    tokenId: tokenId('--radius-lg'),
    tokenName: 'radius.lg',
    actual: '6px',
    expected: '8px',
    ...overrides,
  }
}

describe('fingerprintViolation', () => {
  it('ignores the drifted value, so editing an accepted drift stays accepted', () => {
    // The baseline says "radius.lg is out of sync", not "it is 6px".
    expect(fingerprintViolation(violation({ actual: '7px' }))).toBe(
      fingerprintViolation(violation({ actual: '6px' })),
    )
  })

  it('ignores location, so inserting a line does not invalidate the baseline', () => {
    expect(fingerprintViolation(violation({ location: { file: 'a.css', line: 90 } }))).toBe(
      fingerprintViolation(violation({ location: { file: 'a.css', line: 2 } })),
    )
  })

  it('ignores the message, which is prose and may be reworded', () => {
    expect(fingerprintViolation(violation({ message: 'reworded' }))).toBe(
      fingerprintViolation(violation()),
    )
  })

  it('distinguishes rule, code, source, token and the related token', () => {
    const base = fingerprintViolation(violation())
    const variants = [
      violation({ ruleId: ruleId('missing-token') }),
      violation({ code: 'other' }),
      violation({ sourceId: sourceId('tailwind') }),
      violation({ tokenId: tokenId('--radius-md') }),
      violation({ tokenName: 'radius.md' }),
      violation({ relatedSourceId: sourceId('figma') }),
      violation({ relatedTokenId: tokenId('radius.lg') }),
    ]
    for (const variant of variants) {
      expect(fingerprintViolation(variant)).not.toBe(base)
    }
  })

  it('is injective across separator characters in token names', () => {
    // Without escaping, a token containing the separator could collide with a
    // different violation and one entry would suppress the wrong drift.
    const a = violation({ tokenName: 'a|b', code: 'c' })
    const b = violation({ tokenName: 'a', code: 'b|c' })
    expect(fingerprintViolation(a)).not.toBe(fingerprintViolation(b))
  })
})

describe('createBaseline', () => {
  it('accepts every violation given, sorted and deduplicated', () => {
    const baseline = createBaseline([
      violation({ tokenName: 'b' }),
      violation({ tokenName: 'a' }),
      violation({ tokenName: 'a' }),
    ])
    expect(baseline.schemaVersion).toBe(BASELINE_SCHEMA_VERSION)
    expect(baseline.entries).toHaveLength(2)
    expect(baseline.entries.map((entry) => entry.tokenName)).toEqual(['a', 'b'])
  })

  it('regenerates byte-identically from an unchanged system', () => {
    const violations = [violation({ tokenName: 'b' }), violation({ tokenName: 'a' })]
    const first = createBaseline(violations)
    const second = createBaseline([...violations].reverse())
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('omits optional fields rather than writing null (invariant 10)', () => {
    // Built without the optional keys at all, the way missing-token reports a
    // token that has no counterpart to point at.
    const bare: Violation = {
      ruleId: ruleId('missing-token'),
      severity: 'warn',
      code: 'missing-token',
      message: 'no counterpart',
      sourceId: sourceId('css'),
    }
    const baseline = createBaseline([bare])
    const entry = baseline.entries[0]
    if (!entry) throw new Error('expected an entry')
    expect(Object.hasOwn(entry, 'tokenId')).toBe(false)
    expect(Object.hasOwn(entry, 'tokenName')).toBe(false)
  })

  it('round-trips through parseBaseline', () => {
    const baseline = createBaseline([violation(), violation({ tokenName: 'space.md' })])
    const parsed = parseBaseline(JSON.parse(JSON.stringify(baseline)))
    if (!parsed.ok) throw new Error('expected the generated baseline to parse')
    expect(parsed.value).toEqual(baseline)
  })
})

describe('applyBaseline', () => {
  it('marks accepted violations without removing them', () => {
    const accepted = violation()
    const fresh = violation({ tokenName: 'space.md', tokenId: tokenId('--space-md') })
    const baseline = createBaseline([accepted])

    const applied = applyBaseline([accepted, fresh], baseline)
    expect(applied.violations).toHaveLength(2)
    expect(applied.violations[0]?.baselined).toBe(true)
    expect(Object.hasOwn(applied.violations[1] as object, 'baselined')).toBe(false)
  })

  it('keeps suppressing after the value changes', () => {
    const baseline = createBaseline([violation({ actual: '6px' })])
    const applied = applyBaseline([violation({ actual: '7px' })], baseline)
    expect(applied.violations[0]?.baselined).toBe(true)
    expect(applied.stale).toEqual([])
  })

  it('reports an entry that matched nothing so it can be pruned', () => {
    // The usual cause is that someone fixed the drift.
    const baseline = createBaseline([violation()])
    const applied = applyBaseline([], baseline)
    expect(applied.stale).toHaveLength(1)
    expect(applied.stale[0]?.tokenName).toBe('radius.lg')
  })

  it('does not mutate the violations it was given', () => {
    const input = [violation()]
    const snapshot = structuredClone(input)
    applyBaseline(input, createBaseline(input))
    expect(input).toEqual(snapshot)
  })

  it('is a no-op for an empty baseline', () => {
    const input = [violation()]
    const applied = applyBaseline(input, { schemaVersion: BASELINE_SCHEMA_VERSION, entries: [] })
    expect(applied.violations).toEqual(input)
    expect(applied.stale).toEqual([])
  })
})

describe('parseBaseline', () => {
  const valid: Baseline = createBaseline([violation()])

  it('reads a well-formed baseline', () => {
    const result = parseBaseline(JSON.parse(JSON.stringify(valid)))
    expect(result.ok).toBe(true)
  })

  it('refuses a baseline written by a newer engine (invariant 9)', () => {
    // Misreading what a team accepted is worse than refusing to run.
    const result = parseBaseline({ ...valid, schemaVersion: BASELINE_SCHEMA_VERSION + 1 })
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.message).toContain('newer than this engine supports')
  })

  it('fails rather than silently treating a broken file as empty', () => {
    for (const input of [null, 42, [], {}, { schemaVersion: 1 }, { entries: [] }]) {
      expect(parseBaseline(input).ok, JSON.stringify(input)).toBe(false)
    }
  })

  it('rejects an entry missing a required field', () => {
    const result = parseBaseline({
      schemaVersion: BASELINE_SCHEMA_VERSION,
      entries: [{ fingerprint: 'x', ruleId: 'r' }],
    })
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((d) => d.path)).toContain('entries[0].code')
  })

  it('warns about a duplicate entry and keeps the first', () => {
    const entry = valid.entries[0]
    const result = parseBaseline({ schemaVersion: BASELINE_SCHEMA_VERSION, entries: [entry, entry] })
    if (!result.ok) throw new Error('expected a duplicate to be a warning, not an error')
    expect(result.value.entries).toHaveLength(1)
    expect(result.diagnostics[0]?.code).toBe('duplicate-baseline-entry')
  })
})
