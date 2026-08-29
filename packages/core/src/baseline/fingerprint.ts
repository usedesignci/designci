/**
 * Violation fingerprints.
 *
 * A fingerprint is the *identity* of a drift, and it decides what a baseline
 * keeps suppressing. Two things are deliberately excluded:
 *
 * - **Location.** Inserting a line at the top of a stylesheet would otherwise
 *   invalidate every entry below it.
 * - **The drifted value.** A baseline entry says "we accept that `radius.lg` is
 *   out of sync", not "we accept that it is 6px". Editing 6px to 7px is the same
 *   accepted drift and does not re-fail CI; fixing it properly makes the entry
 *   stale, which is reported so the baseline can be pruned. The tradeoff is real
 *   and worth stating: a drift that gets *worse* stays silent until someone
 *   prunes the baseline.
 *
 * The fingerprint is a readable joined string rather than a hash. Baselines get
 * committed and reviewed, so a human should be able to read a diff and see which
 * drift was accepted — and it avoids a hash dependency that would not exist in
 * the Figma plugin's sandbox anyway.
 */

import type { Violation } from '../domain/violation.js'

const SEPARATOR = '|'

/**
 * Escapes so the join is injective: without this, a token named `a|b` could
 * collide with a different violation and one baseline entry would silently
 * suppress the wrong drift.
 */
function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

/**
 * The identity of a violation, stable across reformatting and value edits.
 *
 * Two violations that differ only in fields excluded here share a fingerprint,
 * and one baseline entry suppresses both. That is intended: they are the same
 * accepted drift seen twice.
 */
export function fingerprintViolation(violation: Violation): string {
  return [
    violation.ruleId,
    violation.code,
    violation.sourceId,
    violation.tokenId ?? '',
    violation.tokenName ?? '',
    violation.relatedSourceId ?? '',
    violation.relatedTokenId ?? '',
  ]
    .map(escape)
    .join(SEPARATOR)
}
