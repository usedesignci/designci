/**
 * Mapping suggestions: the onboarding drafting tool.
 *
 * Invariant 4 forbids the *check* from ever inferring that two names mean the
 * same token — but a human confirming a proposed pair and writing it into
 * config is exactly the explicit statement the invariant requires. This module
 * generates those proposals; it runs at `init` time, its output goes through a
 * person, and nothing in the check path calls it.
 *
 * Two kinds of proposal come out:
 *
 * - `match`: the values are equal (through normalize, invariant 3 — never raw
 *   strings), so pairing them is safe. Ranked by how well the names line up.
 * - `drift`: the names line up but the values disagree. Confirming one of
 *   these records the pairing *and* hands the team its first real drift —
 *   which is the point of the product, so these are surfaced, not hidden.
 *
 * Everything is deterministic: identical inputs produce an identical list,
 * whatever order the tokens arrived in.
 */

import type { TokenMapping } from '../domain/config.js'
import type { DesignSystemSnapshot } from '../domain/snapshot.js'
import type { DesignToken } from '../domain/token.js'
import { isComparable, valuesEqual } from '../normalize/equal.js'
import { normalizeForType } from '../normalize/value.js'
import { STOCK_TAILWIND_RAW } from './tailwind-stock-data.js'

export interface MappingSuggestion {
  /** `match`: values agree. `drift`: names align but values disagree. */
  readonly kind: 'match' | 'drift'
  readonly design: DesignToken
  readonly code: DesignToken
  /** Other value-equal code tokens that were passed over, by token id. */
  readonly alternates?: readonly string[]
  /**
   * The code token is an unmodified stock Tailwind default — a value the
   * framework shipped, not a decision this team made. Suggested last.
   */
  readonly stock: boolean
}

export interface SuggestOptions {
  /** Already-declared mappings; tokens on either side of one are skipped. */
  readonly existing?: readonly TokenMapping[]
}

/**
 * Folds naming-convention noise so `colors.blue.500`, `color/blue/500` and
 * `--color-blue-500` all canonicalize to the same segments. This fold exists
 * only to *rank and propose*; it never asserts equivalence on its own.
 */
const SEGMENT_ALIASES: Readonly<Record<string, string>> = {
  colors: 'color',
  spacing: 'space',
  spaces: 'space',
  sizes: 'size',
  radii: 'radius',
  shadows: 'shadow',
  fonts: 'font',
  durations: 'duration',
}

function canonicalSegments(token: DesignToken): readonly string[] {
  const segments = token.path
    .flatMap((segment) =>
      segment
        // camelCase boundaries become separators before the non-alnum split.
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^a-zA-Z0-9]+/),
    )
    .filter((part) => part.length > 0)
    .map((part) => {
      const lower = part.toLowerCase()
      return SEGMENT_ALIASES[lower] ?? lower
    })
  // Tailwind's scale is `borderRadius`; everyone else says radius.
  if (segments[0] === 'border' && segments[1] === 'radius') return segments.slice(1)
  return segments
}

/**
 * How well two token names line up: 3 = same canonical name, 2 = one is a
 * proper suffix of the other (`radius.lg` under `borderRadius.lg`), 1 = only
 * the last segment agrees, 0 = nothing does.
 */
function nameScore(a: readonly string[], b: readonly string[]): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  const suffix = long.slice(long.length - short.length)
  if (suffix.every((segment, index) => segment === short[index])) {
    return short.length === long.length ? 3 : 2
  }
  return a[a.length - 1] === b[b.length - 1] ? 1 : 0
}

/** True when the code token is an unmodified stock Tailwind default. */
export function isStockTailwind(token: DesignToken): boolean {
  const stockRaw = STOCK_TAILWIND_RAW[token.id]
  if (stockRaw === undefined) return false
  if (stockRaw === token.raw) return true
  // A different Tailwind version may phrase the same value differently; for
  // simple types, compare through normalize rather than giving up.
  if (token.type === 'color' || token.type === 'dimension') {
    return valuesEqual(token.value, normalizeForType(token.type, stockRaw, {}))
  }
  return false
}

function byId(a: DesignToken, b: DesignToken): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Proposes mappings between a design source and a code source.
 *
 * Matches come first, the team's own (non-stock) values before framework
 * defaults; drift candidates follow. Within each group the order is the design
 * token id — stable however the inputs were ordered.
 */
export function suggestMappings(
  design: DesignSystemSnapshot,
  code: DesignSystemSnapshot,
  options: SuggestOptions = {},
): readonly MappingSuggestion[] {
  const mapped = new Set<string>()
  for (const mapping of options.existing ?? []) {
    mapped.add(`${mapping.from.sourceId}::${mapping.from.tokenId}`)
    mapped.add(`${mapping.to.sourceId}::${mapping.to.tokenId}`)
  }
  const isMapped = (token: DesignToken): boolean => mapped.has(`${token.sourceId}::${token.id}`)

  const designTokens = [...design.tokens].filter((token) => !isMapped(token)).sort(byId)
  const codeTokens = [...code.tokens].filter((token) => !isMapped(token)).sort(byId)

  const canonical = new Map<DesignToken, readonly string[]>()
  const segmentsOf = (token: DesignToken): readonly string[] => {
    let segments = canonical.get(token)
    if (segments === undefined) {
      segments = canonicalSegments(token)
      canonical.set(token, segments)
    }
    return segments
  }

  // Pass 1: value-equal matches, provisionally. A match found only by value
  // with no name agreement (score 0) is kept tentative — it may be a value
  // coincidence hiding a real drift, which pass 2 gets to overrule.
  const matches = new Map<DesignToken, MappingSuggestion>()
  const matchScore = new Map<DesignToken, number>()

  for (const designToken of designTokens) {
    if (!isComparable(designToken.value)) continue

    const candidates = codeTokens.filter(
      (codeToken) =>
        isComparable(codeToken.value) && valuesEqual(designToken.value, codeToken.value),
    )
    if (candidates.length === 0) continue

    const top = Math.max(...candidates.map((c) => nameScore(segmentsOf(designToken), segmentsOf(c))))
    // Several tokens sharing a value with no name in agreement is coincidence
    // (#fff appears everywhere); proposing one of them would be a guess.
    if (top === 0 && candidates.length > 1) continue

    const best = candidates
      .filter((c) => nameScore(segmentsOf(designToken), segmentsOf(c)) === top)
      .sort(byId)
    const chosen = best[0] as DesignToken
    const alternates = candidates
      .filter((c) => c !== chosen)
      .sort(byId)
      .map((c) => c.id as string)

    matches.set(designToken, {
      kind: 'match',
      design: designToken,
      code: chosen,
      ...(alternates.length > 0 ? { alternates } : {}),
      stock: isStockTailwind(chosen),
    })
    matchScore.set(designToken, top)
  }

  const stronglyMatchedCode = new Set<DesignToken>()
  for (const [designToken, suggestion] of matches) {
    if ((matchScore.get(designToken) ?? 0) >= 1) stronglyMatchedCode.add(suggestion.code)
  }

  // Pass 2: drift candidates. Names must genuinely align (score >= 2): a drift
  // proposal claims two specific tokens disagree, which is a strong statement
  // to put in front of a person. Both sides must be comparable — "we could not
  // normalize it" is not evidence of disagreement (invariant 3). A strong
  // drift candidate beats a name-blind value match for the same design token:
  // `radius.lg` drifting against `--radius-lg` matters more than it happening
  // to share a value with `--space-sm`.
  const drifts: MappingSuggestion[] = []
  for (const designToken of designTokens) {
    if ((matchScore.get(designToken) ?? 0) >= 1 || !isComparable(designToken.value)) continue

    const candidates = codeTokens.filter(
      (codeToken) =>
        !stronglyMatchedCode.has(codeToken) &&
        isComparable(codeToken.value) &&
        nameScore(segmentsOf(designToken), segmentsOf(codeToken)) >= 2 &&
        !valuesEqual(designToken.value, codeToken.value),
    )
    if (candidates.length === 0) continue

    const top = Math.max(...candidates.map((c) => nameScore(segmentsOf(designToken), segmentsOf(c))))
    const best = candidates
      .filter((c) => nameScore(segmentsOf(designToken), segmentsOf(c)) === top)
      .sort(byId)
    // Two equally plausible drift partners means we do not actually know which
    // token this is; propose nothing rather than guess.
    if (best.length > 1) continue

    const chosen = best[0] as DesignToken
    drifts.push({ kind: 'drift', design: designToken, code: chosen, stock: isStockTailwind(chosen) })
    matches.delete(designToken)
  }

  const rank = (s: MappingSuggestion): number => (s.kind === 'match' ? (s.stock ? 1 : 0) : 2)
  return [...matches.values(), ...drifts].sort(
    (a, b) => rank(a) - rank(b) || byId(a.design, b.design),
  )
}
