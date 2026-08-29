/**
 * Creating and applying baselines.
 *
 * Both operations are pure and order-stable, so a baseline written from one run
 * and applied on the next cannot perturb invariant 1.
 */

import {
  type Baseline,
  BASELINE_SCHEMA_VERSION,
  type BaselineEntry,
} from '../domain/baseline.js'
import type { Violation } from '../domain/violation.js'
import { fingerprintViolation } from './fingerprint.js'

function toEntry(violation: Violation): BaselineEntry {
  // Invariant 10: optional keys are omitted, not set undefined, so a committed
  // baseline diffs cleanly and its fingerprints stay stable.
  return {
    fingerprint: fingerprintViolation(violation),
    ruleId: violation.ruleId,
    code: violation.code,
    sourceId: violation.sourceId,
    ...(violation.tokenId === undefined ? {} : { tokenId: violation.tokenId }),
    ...(violation.tokenName === undefined ? {} : { tokenName: violation.tokenName }),
  }
}

/**
 * Builds a baseline accepting every violation given.
 *
 * Entries are deduplicated by fingerprint and sorted, so regenerating a baseline
 * from an unchanged system produces a byte-identical file.
 */
export function createBaseline(violations: readonly Violation[]): Baseline {
  const entries = new Map<string, BaselineEntry>()
  for (const violation of violations) {
    const entry = toEntry(violation)
    if (!entries.has(entry.fingerprint)) entries.set(entry.fingerprint, entry)
  }

  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    entries: [...entries.values()].sort((a, b) =>
      a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0,
    ),
  }
}

export interface AppliedBaseline {
  /** Every violation, with `baselined: true` set on the suppressed ones. */
  readonly violations: readonly Violation[]
  /**
   * Entries that matched nothing in this run, sorted by fingerprint. Usually
   * this means the drift was fixed and the entry can be deleted — pruning them
   * is what stops a baseline from silently re-accepting a drift that comes back.
   */
  readonly stale: readonly BaselineEntry[]
}

/**
 * Marks violations the baseline accepts. Nothing is removed: a suppressed
 * violation is still reported and still counts toward health.
 */
export function applyBaseline(
  violations: readonly Violation[],
  baseline: Baseline,
): AppliedBaseline {
  const accepted = new Map(baseline.entries.map((entry) => [entry.fingerprint, entry]))
  const matched = new Set<string>()

  const marked = violations.map((violation) => {
    const fingerprint = fingerprintViolation(violation)
    if (!accepted.has(fingerprint)) return violation
    matched.add(fingerprint)
    return { ...violation, baselined: true as const }
  })

  const stale = baseline.entries
    .filter((entry) => !matched.has(entry.fingerprint))
    .sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0))

  return { violations: marked, stale }
}
