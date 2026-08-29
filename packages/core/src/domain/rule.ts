/**
 * The rule contract.
 *
 * Invariant 1: a rule is a pure function of its RuleContext. No file access, no
 * network, no clock, no randomness. Everything a rule may read is reachable from
 * the context object — which is also what makes the determinism test possible.
 */

import type { DimensionOptions } from '../normalize/dimension.js'
import type { RuleId, SourceId, TokenId } from './ids.js'
import type { DesignSystemSnapshot } from './snapshot.js'
import type { DesignToken } from './token.js'
import type { RuleFinding, Severity } from './violation.js'

export type RuleCategory = 'tokens' | 'components' | 'accessibility'

/** One end of a resolved mapping. */
export interface MappedToken {
  readonly sourceId: SourceId
  readonly tokenId: TokenId
  readonly token: DesignToken
}

export interface RuleContext {
  readonly snapshots: readonly DesignSystemSnapshot[]
  /** Snapshots whose source role is `design` — the stated intent. */
  readonly designSnapshots: readonly DesignSystemSnapshot[]
  /** Snapshots whose source role is `code` — what actually ships. */
  readonly codeSnapshots: readonly DesignSystemSnapshot[]
  /** Options for this rule, from config. Empty when unconfigured. */
  readonly options: Readonly<Record<string, unknown>>
  /** Normalization settings for any re-normalization a rule needs to do. */
  readonly dimensions: DimensionOptions

  getSnapshot(sourceId: SourceId): DesignSystemSnapshot | undefined
  getToken(sourceId: SourceId, tokenId: TokenId): DesignToken | undefined

  /**
   * The counterparts of a token in other sources, per explicit config mappings.
   *
   * Invariant 4: this is the only cross-source equivalence in the system. It
   * returns nothing rather than guessing, and a rule that finds nothing reports
   * an unmapped token — it never falls back to name similarity.
   */
  resolveMapping(sourceId: SourceId, tokenId: TokenId): readonly MappedToken[]
}

export interface Rule {
  readonly id: RuleId
  readonly category: RuleCategory
  /** One line, present tense, describing what the rule enforces. */
  readonly description: string
  /** Used when config does not mention the rule. */
  readonly defaultSeverity: Severity
  /**
   * Pure. Given the same context, returns the same findings in any order — the
   * runner imposes the total ordering, so a rule need not sort its own output.
   */
  check(context: RuleContext): readonly RuleFinding[]
}
