/**
 * Total ordering over violations.
 *
 * Invariant 1: identical inputs produce byte-identical JSON. Rules may emit
 * findings in any order — map iteration, parallel adapters, whatever — so the
 * runner sorts through this comparator before serializing.
 *
 * The ordering must be *total*: if any two distinct violations can compare 0,
 * their relative order depends on the input order and the guarantee is gone.
 * The final tiebreaker is a canonical serialization of the whole violation,
 * which is why this cannot silently degrade as fields are added.
 */

import type { Violation } from '../domain/violation.js'

const SEVERITY_RANK: Readonly<Record<Violation['severity'], number>> = {
  error: 0,
  warn: 1,
  info: 2,
}

/** Compares strings by code point, independent of locale and system settings. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareOptional(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0
  if (a === undefined) return -1
  if (b === undefined) return 1
  return compareStrings(a, b)
}

function compareNumbers(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0
  if (a === undefined) return -1
  if (b === undefined) return 1
  return a - b
}

/**
 * Canonical JSON: object keys sorted, so two structurally equal violations
 * serialize identically regardless of how they were constructed.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item
    const entries = Object.entries(item as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => compareStrings(left, right))
    return Object.fromEntries(entries)
  })
}

/**
 * Orders violations: severity, then source, then token, then rule, then message,
 * then location, then a canonical serialization as the final tiebreaker.
 */
export function compareViolations(a: Violation, b: Violation): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  if (bySeverity !== 0) return bySeverity

  const bySource = compareStrings(a.sourceId, b.sourceId)
  if (bySource !== 0) return bySource

  const byTokenName = compareOptional(a.tokenName, b.tokenName)
  if (byTokenName !== 0) return byTokenName

  const byTokenId = compareOptional(a.tokenId, b.tokenId)
  if (byTokenId !== 0) return byTokenId

  const byRule = compareStrings(a.ruleId, b.ruleId)
  if (byRule !== 0) return byRule

  const byCode = compareStrings(a.code, b.code)
  if (byCode !== 0) return byCode

  const byFile = compareOptional(a.location?.file, b.location?.file)
  if (byFile !== 0) return byFile

  const byLine = compareNumbers(a.location?.line, b.location?.line)
  if (byLine !== 0) return byLine

  const byColumn = compareNumbers(a.location?.column, b.location?.column)
  if (byColumn !== 0) return byColumn

  const byMessage = compareStrings(a.message, b.message)
  if (byMessage !== 0) return byMessage

  return compareStrings(canonicalize(a), canonicalize(b))
}

/** Sorts a copy; never mutates the input. */
export function sortViolations(violations: readonly Violation[]): Violation[] {
  return [...violations].sort(compareViolations)
}
