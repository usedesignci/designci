import type { RuleId, SourceId, TokenId } from './ids.js'
import type { SourceLocation } from './source.js'

/**
 * Invariant 5: severity is policy, not rule logic. Rules emit findings with no
 * severity; the runner attaches it from config. `off` means the rule does not
 * run at all, so an expensive disabled rule costs nothing.
 */
export type Severity = 'off' | 'info' | 'warn' | 'error'

/** Severities that can appear on a violation. `off` never reaches output. */
export type ActiveSeverity = Exclude<Severity, 'off'>

/** One thing a rule found. Severity-free by construction. */
export interface RuleFinding {
  /** Machine-readable subtype, e.g. 'value-mismatch'. Stable across releases. */
  readonly code: string
  readonly message: string
  /** The source the finding is reported against — where an author would fix it. */
  readonly sourceId: SourceId
  readonly tokenId?: TokenId
  /** Dotted token name, for output that reads naturally. */
  readonly tokenName?: string
  readonly location?: SourceLocation
  /** What the author wrote, verbatim (invariant 8). */
  readonly actual?: string
  /** What the design source says it should be, verbatim. */
  readonly expected?: string
  /** The other side of a cross-source comparison, when there is one. */
  readonly relatedSourceId?: SourceId
  readonly relatedTokenId?: TokenId
  /** A concrete edit an author could make. Never a guess at intent. */
  readonly suggestion?: string
}

/** A finding with its rule identity and the severity policy assigned it. */
export interface Violation extends RuleFinding {
  readonly ruleId: RuleId
  readonly severity: ActiveSeverity
}
