import type { ParseDiagnostic } from './diagnostic.js'
import type { HealthScore } from '../health.js'
import type { ActiveSeverity, Violation } from './violation.js'

/** Invariant 9: wire formats carry a schema version. */
export const RESULT_SCHEMA_VERSION = 1

export interface ViolationCounts {
  readonly error: number
  readonly warn: number
  readonly info: number
  readonly total: number
}

/**
 * The output of a check run. Serializes to byte-identical JSON for identical
 * inputs (invariant 1) — which is what makes it usable as a baseline, a cache
 * key, and a diffable CI artifact.
 */
export interface CheckResult {
  readonly schemaVersion: number
  /** Sorted by `compareViolations`. */
  readonly violations: readonly Violation[]
  readonly counts: ViolationCounts
  /** Every source's parse diagnostics, gathered (invariant 7). */
  readonly diagnostics: readonly ParseDiagnostic[]
  readonly health: HealthScore
  /** Rules skipped because config set them to `off`. Sorted. */
  readonly skippedRules: readonly string[]
}

export function countViolations(violations: readonly Violation[]): ViolationCounts {
  const counts: Record<ActiveSeverity, number> = { error: 0, warn: 0, info: 0 }
  for (const violation of violations) counts[violation.severity] += 1
  return { ...counts, total: violations.length }
}

/** True when a run should fail CI: any `error`-severity violation. */
export function shouldFail(result: CheckResult): boolean {
  return result.counts.error > 0
}
