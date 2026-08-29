import { describe, expect, it } from 'vitest'

import type { CheckConfig } from '../domain/config.js'
import { ruleId } from '../domain/ids.js'
import type { Rule } from '../domain/rule.js'
import { shouldFail } from '../domain/result.js'
import * as fixture from '../fixtures/small-system.js'
import { allRules } from '../rules/index.js'
import { canonicalize } from './order.js'
import { runCheck } from './run.js'

const base: CheckConfig = fixture.config

describe('runCheck', () => {
  it('produces byte-identical JSON for identical inputs (invariant 1)', () => {
    // This test guards the determinism invariant. It must never be deleted or
    // weakened: baselines, caches and CI diffs all rest on it.
    const first = runCheck({ snapshots: fixture.snapshots, rules: allRules, config: base })
    const second = runCheck({ snapshots: fixture.snapshots, rules: allRules, config: base })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('does not leak the order rules were registered in', () => {
    const forwards = runCheck({ snapshots: fixture.snapshots, rules: allRules, config: base })
    const backwards = runCheck({
      snapshots: fixture.snapshots,
      rules: [...allRules].reverse(),
      config: base,
    })
    expect(canonicalize(backwards)).toBe(canonicalize(forwards))
  })

  it('does not leak the order mappings were declared in', () => {
    const reversed: CheckConfig = { ...base, mappings: [...base.mappings].reverse() }
    const forwards = runCheck({ snapshots: fixture.snapshots, rules: allRules, config: base })
    const backwards = runCheck({ snapshots: fixture.snapshots, rules: allRules, config: reversed })
    expect(canonicalize(backwards)).toBe(canonicalize(forwards))
  })

  it('does not leak the order snapshots were supplied in', () => {
    const forwards = runCheck({ snapshots: fixture.snapshots, rules: allRules, config: base })
    const backwards = runCheck({
      snapshots: [...fixture.snapshots].reverse(),
      rules: allRules,
      config: base,
    })
    expect(canonicalize(backwards)).toBe(canonicalize(forwards))
  })

  it('takes severity from config, not from the rule (invariant 5)', () => {
    const config: CheckConfig = {
      ...base,
      rules: { 'missing-token': { severity: 'error' } },
    }
    const result = runCheck({ snapshots: fixture.snapshots, rules: allRules, config })
    const missing = result.violations.filter((entry) => entry.ruleId === 'missing-token')
    expect(missing).toHaveLength(1)
    expect(missing[0]?.severity).toBe('error')
  })

  it('skips rules configured off, and records them', () => {
    const config: CheckConfig = {
      ...base,
      rules: { 'token-value-mismatch': { severity: 'off' } },
    }
    const result = runCheck({ snapshots: fixture.snapshots, rules: allRules, config })
    expect(result.skippedRules).toEqual(['token-value-mismatch'])
    expect(result.violations.some((entry) => entry.ruleId === 'token-value-mismatch')).toBe(false)
    expect(shouldFail(result)).toBe(false)
  })

  it('passes rule options through without reading them', () => {
    const seen: unknown[] = []
    const probe: Rule = {
      id: ruleId('probe'),
      category: 'tokens',
      description: 'records the options it was handed',
      defaultSeverity: 'info',
      check(context) {
        seen.push(context.options)
        return []
      },
    }
    const config: CheckConfig = {
      ...base,
      rules: { probe: { severity: 'info', options: { allowed: [4, 8] } } },
    }
    runCheck({ snapshots: fixture.snapshots, rules: [probe], config })
    expect(seen).toEqual([{ allowed: [4, 8] }])
  })

  it('gathers diagnostics from every snapshot (invariant 7)', () => {
    const withDiagnostic = {
      ...fixture.cssSnapshot,
      diagnostics: [
        {
          severity: 'warning' as const,
          code: 'unparsable-value',
          message: 'could not read var(--x)',
          sourceId: fixture.CSS_SOURCE_ID,
          raw: 'var(--x)',
        },
      ],
    }
    const result = runCheck({
      snapshots: [fixture.figmaSnapshot, withDiagnostic],
      rules: allRules,
      config: base,
    })
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.raw).toBe('var(--x)')
  })

  it('carries a schema version on the result (invariant 9)', () => {
    const result = runCheck({ snapshots: fixture.snapshots, rules: allRules, config: base })
    expect(result.schemaVersion).toBe(1)
    expect(fixture.figmaSnapshot.schemaVersion).toBe(1)
  })

  it('omits optional keys rather than setting them undefined (invariant 10)', () => {
    const result = runCheck({ snapshots: fixture.snapshots, rules: allRules, config: base })
    const missing = result.violations.find((entry) => entry.ruleId === 'missing-token')
    if (!missing) throw new Error('expected a missing-token violation')
    // The token does not exist in the code source, so there is no id to report.
    expect(Object.hasOwn(missing, 'tokenId')).toBe(false)
    expect(JSON.stringify(result)).not.toContain('undefined')
  })

  it('reports no findings for an empty run, and full health', () => {
    const result = runCheck({ snapshots: [], rules: allRules })
    expect(result.violations).toEqual([])
    expect(result.counts).toEqual({ error: 0, warn: 0, info: 0, total: 0 })
    expect(result.health.overall).toBe(100)
  })
})
