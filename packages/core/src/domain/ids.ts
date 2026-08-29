/**
 * Branded identifier types.
 *
 * These are strings at runtime — they stay JSON-friendly and comparable — but
 * the brand stops a SourceId being passed where a TokenId is expected.
 */

declare const brand: unique symbol

type Brand<T, B extends string> = T & { readonly [brand]: B }

/** Identifies a source within a check run. Stable across runs. */
export type SourceId = Brand<string, 'SourceId'>

/** Identifies a token within its source. Unique per (SourceId, TokenId). */
export type TokenId = Brand<string, 'TokenId'>

/** Identifies a rule. Matches the module name under `rules/`. */
export type RuleId = Brand<string, 'RuleId'>

export const sourceId = (value: string): SourceId => value as SourceId
export const tokenId = (value: string): TokenId => value as TokenId
export const ruleId = (value: string): RuleId => value as RuleId
