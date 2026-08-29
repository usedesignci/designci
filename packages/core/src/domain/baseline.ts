/**
 * The baseline: drift a team has accepted for now.
 *
 * Adopting Design CI on a real design system surfaces drift that accumulated
 * over years. Failing the first build on all of it means the tool gets removed,
 * so a baseline records the current state as accepted and CI fails only on what
 * comes *after* it.
 *
 * A baseline suppresses the CI failure. It does not suppress the drift: baselined
 * violations stay in the result and still count against the health score, so the
 * dashboard keeps telling the truth and the number improves only when the system
 * actually improves. Otherwise a team could baseline everything and score 100%,
 * which would make the health trend worthless.
 */

/** Invariant 9: wire formats carry a schema version. */
export const BASELINE_SCHEMA_VERSION = 1

export interface BaselineEntry {
  /** Identity of the accepted drift. See `fingerprintViolation`. */
  readonly fingerprint: string
  /**
   * The fields the fingerprint is built from, stored so the committed file is
   * readable and reviewable on its own. The fingerprint remains the identity;
   * these are not re-derived at match time.
   */
  readonly ruleId: string
  readonly code: string
  readonly sourceId: string
  readonly tokenId?: string
  readonly tokenName?: string
  /** Free-form context an author may add, e.g. a ticket. Never matched on. */
  readonly note?: string
}

export interface Baseline {
  readonly schemaVersion: number
  /** Sorted by fingerprint, so the committed file has a stable diff. */
  readonly entries: readonly BaselineEntry[]
}

export const emptyBaseline: Baseline = {
  schemaVersion: BASELINE_SCHEMA_VERSION,
  entries: [],
}
