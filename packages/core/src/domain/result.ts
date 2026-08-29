import type { BaselineEntry } from './baseline.js'
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
  /**
   * Every violation found, baselined ones included, sorted by
   * `compareViolations` — which puts unbaselined violations first.
   */
  readonly violations: readonly Violation[]
  /** Counts of violations that are *not* baselined. These decide CI. */
  readonly counts: ViolationCounts
  /**
   * Counts of violations a baseline suppressed. Reported so a team can see the
   * debt it has accepted; these do not fail CI but do affect the health score.
   */
  readonly baselinedCounts: ViolationCounts
  /** Baseline entries that matched nothing this run and can be pruned. */
  readonly staleBaselineEntries: readonly BaselineEntry[]
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

/**
 * True when a run should fail CI: any `error`-severity violation that a baseline
 * has not accepted.
 */
export function shouldFail(result: CheckResult): boolean {
  return result.counts.error > 0
}
