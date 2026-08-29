/**
 * The design health score.
 *
 * Invariant 6: one implementation. The CLI, the Figma plugin, the Action and the
 * dashboard all import this function. A team that sees 91% in their terminal and
 * 87% on the dashboard stops trusting both numbers, so there is exactly one
 * definition of the number and it lives here.
 *
 * The model: every checked unit starts perfect and loses points for the
 * violations against it, weighted by severity. `info` costs nothing — it is
 * advisory by definition, and letting it move the headline number would make
 * teams suppress advice to protect a score.
 */

import type { Violation } from './domain/violation.js'

/** Points deducted per violation, per severity. */
export const SEVERITY_WEIGHTS: Readonly<Record<Violation['severity'], number>> = {
  error: 1,
  warn: 0.34,
  info: 0,
}

export interface HealthInput {
  readonly violations: readonly Violation[]
  /**
   * How many things were checked — tokens compared, components mapped. The
   * denominator of the score. Zero checked units scores 100: nothing is broken
   * in an empty system, and reporting 0% would read as a catastrophic failure.
   */
  readonly checkedUnits: number
}

export interface HealthScore {
  /** 0–100, integer. */
  readonly overall: number
  readonly checkedUnits: number
  /** Weighted violation total, rounded to 2 decimals. */
  readonly weightedViolations: number
}

/**
 * Deterministic and order-independent: the weights are summed, so shuffling the
 * violation list cannot change the result.
 */
export function healthScore(input: HealthInput): HealthScore {
  const weighted = input.violations.reduce(
    (total, violation) => total + SEVERITY_WEIGHTS[violation.severity],
    0,
  )
  const weightedViolations = Math.round(weighted * 100) / 100

  if (input.checkedUnits <= 0) {
    return { overall: 100, checkedUnits: 0, weightedViolations }
  }

  const ratio = weightedViolations / input.checkedUnits
  const overall = Math.max(0, Math.min(100, Math.round((1 - ratio) * 100)))
  return { overall, checkedUnits: input.checkedUnits, weightedViolations }
}
