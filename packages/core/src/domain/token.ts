import type { NormalizedValue } from '../normalize/types.js'
import type { SourceId, TokenId } from './ids.js'
import type { SourceLocation } from './source.js'

/**
 * Token types follow the W3C Design Tokens types where they exist. `unknown` is
 * an honest answer for a CSS custom property whose type we cannot infer — the
 * normalized value still carries what we could determine.
 */
export type TokenType =
  | 'color'
  | 'dimension'
  | 'duration'
  | 'number'
  | 'fontFamily'
  | 'fontWeight'
  | 'typography'
  | 'shadow'
  | 'string'
  | 'unknown'

export interface DesignToken {
  /** Unique within the owning source. */
  readonly id: TokenId
  readonly sourceId: SourceId
  /** Hierarchical path, e.g. ['color', 'brand', 'primary']. */
  readonly path: readonly string[]
  readonly type: TokenType
  /**
   * Exactly what the author wrote (invariant 8). Normalization annotates this;
   * reports quote it.
   */
  readonly raw: string
  readonly value: NormalizedValue
  readonly deprecated?: boolean
  readonly description?: string
  readonly location?: SourceLocation
}

/** Dotted display name: `color.brand.primary`. */
export function tokenName(token: DesignToken): string {
  return token.path.join('.')
}
