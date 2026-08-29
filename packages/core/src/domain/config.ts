/**
 * Check configuration.
 *
 * The *types* live here because the runner needs them from M1 — severity comes
 * from config (invariant 5) and cross-source equivalence comes from explicit
 * mappings (invariant 4). Loading and validating a config file, and the baseline
 * format, are M2b; nothing here touches the filesystem.
 */

import type { RuleId, SourceId, TokenId } from './ids.js'
import type { Severity } from './violation.js'

/**
 * An explicit statement that two tokens in two sources are the same design
 * decision. Invariant 4: this is the *only* way the engine relates tokens across
 * sources. It never infers that `color/brand/primary` means `--color-primary`.
 */
export interface TokenMapping {
  readonly from: { readonly sourceId: SourceId; readonly tokenId: TokenId }
  readonly to: { readonly sourceId: SourceId; readonly tokenId: TokenId }
}

export interface RuleConfig {
  readonly severity: Severity
  /** Rule-specific options, passed through to the rule unread by the runner. */
  readonly options?: Readonly<Record<string, unknown>>
}

export interface CheckConfig {
  /** Severity per rule. A rule absent from this map uses its default severity. */
  readonly rules: Readonly<Record<string, RuleConfig>>
  readonly mappings: readonly TokenMapping[]
  /** Pixel value of `1rem` in this project. Defaults to 16 in the normalizer. */
  readonly rootFontSizePx?: number
}

export const emptyConfig: CheckConfig = { rules: {}, mappings: [] }

export function ruleConfigFor(config: CheckConfig, id: RuleId): RuleConfig | undefined {
  return Object.hasOwn(config.rules, id) ? config.rules[id] : undefined
}
