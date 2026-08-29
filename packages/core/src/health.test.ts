import { describe, expect, it } from 'vitest'

import { ruleId, sourceId } from './domain/ids.js'
import type { ActiveSeverity, Violation } from './domain/violation.js'
import { healthScore } from './health.js'

function violation(severity: ActiveSeverity): Violation {
  return {
    ruleId: ruleId('token-value-mismatch'),
    severity,
    code: 'value-mismatch',
    message: 'a message',
    sourceId: sourceId('css'),
  }
}

describe('healthScore', () => {
  it('is 100 for a clean system', () => {
    expect(healthScore({ violations: [], checkedUnits: 50 }).overall).toBe(100)
  })

  it('is 100 for an empty system rather than 0', () => {
    // Nothing is broken in a system with nothing in it. Reporting 0% would read
    // as a catastrophic failure on a first run against an unconfigured repo.
    expect(healthScore({ violations: [], checkedUnits: 0 }).overall).toBe(100)
  })

  it('weights errors above warnings and ignores info', () => {
    const units = 10
    const error = healthScore({ violations: [violation('error')], checkedUnits: units })
    const warn = healthScore({ violations: [violation('warn')], checkedUnits: units })
    const info = healthScore({ violations: [violation('info')], checkedUnits: units })
    expect(error.overall).toBeLessThan(warn.overall)
    expect(warn.overall).toBeLessThan(info.overall)
    expect(info.overall).toBe(100)
  })

  it('is order-independent', () => {
    const violations = [violation('warn'), violation('error'), violation('info')]
    const forwards = healthScore({ violations, checkedUnits: 20 })
    const backwards = healthScore({ violations: [...violations].reverse(), checkedUnits: 20 })
    expect(forwards).toEqual(backwards)
  })

  it('floors at 0 rather than going negative', () => {
    const violations = Array.from({ length: 40 }, () => violation('error'))
    expect(healthScore({ violations, checkedUnits: 10 }).overall).toBe(0)
  })

  it('returns an integer score and a rounded weighted total', () => {
    const score = healthScore({ violations: [violation('warn'), violation('warn')], checkedUnits: 7 })
    expect(Number.isInteger(score.overall)).toBe(true)
    expect(score.weightedViolations).toBe(0.68)
  })
})
