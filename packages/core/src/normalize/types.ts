/**
 * The normalized value model.
 *
 * Invariant 3: nothing in the engine compares raw strings. Every value an
 * adapter produces passes through this module first, so `#FF6B00` and
 * `rgb(255 107 0)` are one value, and so are `1rem` and `16px`.
 *
 * Invariant 8: every variant carries `raw`. Normalization annotates the author's
 * input; it never replaces it. Violations quote `raw` back to the author, so a
 * report says "you wrote #FF6B00", not "you wrote rgb(255,107,0)".
 */

/** Absolute length units, all convertible to px without layout context. */
export type AbsoluteUnit = 'px' | 'rem' | 'pt' | 'pc' | 'in' | 'cm' | 'mm' | 'q'

/** Units whose pixel value depends on layout context we do not have. */
export type RelativeUnit = '%' | 'em' | 'ex' | 'ch' | 'vw' | 'vh' | 'vmin' | 'vmax'

/**
 * sRGB with 8-bit channels and alpha in [0, 1].
 *
 * Channels are rounded to integers and alpha to 4 decimal places at parse time.
 * That rounding is what makes equality decidable: `hsl(25 100% 50%)` and
 * `#FF6A00` should compare equal despite the float math in between.
 */
export interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export interface ColorValue {
  readonly kind: 'color'
  readonly raw: string
  readonly rgba: Rgba
}

export interface DimensionValue {
  readonly kind: 'dimension'
  readonly raw: string
  /** Canonical pixel value. `1rem` with a 16px root becomes 16. */
  readonly px: number
  /** The unit as authored, kept for reporting. */
  readonly unit: AbsoluteUnit
}

/**
 * A length we cannot resolve to px without knowing the element's context.
 * Two relative values compare equal only when unit and magnitude both match —
 * `50%` is never asserted to equal any px value.
 */
export interface RelativeValue {
  readonly kind: 'relative'
  readonly raw: string
  readonly value: number
  readonly unit: RelativeUnit
}

export interface NumberValue {
  readonly kind: 'number'
  readonly raw: string
  readonly value: number
}

/** Durations normalize to milliseconds: `0.2s` and `200ms` are one value. */
export interface DurationValue {
  readonly kind: 'duration'
  readonly raw: string
  readonly ms: number
}

/** Font weights normalize to the numeric scale: `bold` is 700. */
export interface FontWeightValue {
  readonly kind: 'fontWeight'
  readonly raw: string
  readonly weight: number
}

/** An ordered font stack. Quotes and case are normalized away for comparison. */
export interface FontFamilyValue {
  readonly kind: 'fontFamily'
  readonly raw: string
  readonly families: readonly string[]
}

/** A value that is meaningfully a string (a keyword, an easing name). */
export interface StringValue {
  readonly kind: 'string'
  readonly raw: string
  readonly value: string
}

/** An unresolved reference to another token, e.g. `{color.brand.primary}`. */
export interface AliasValue {
  readonly kind: 'alias'
  readonly raw: string
  /** Dotted path of the referenced token, e.g. `color.brand.primary`. */
  readonly target: string
}

export type LengthValue = DimensionValue | RelativeValue

export interface TypographyValue {
  readonly kind: 'typography'
  readonly raw: string
  readonly fontFamily?: FontFamilyValue
  readonly fontSize?: DimensionValue
  readonly fontWeight?: FontWeightValue
  /** Unitless line heights stay numbers; `1.5` is not `1.5px`. */
  readonly lineHeight?: LengthValue | NumberValue
  readonly letterSpacing?: LengthValue
}

export interface ShadowLayer {
  readonly offsetX: DimensionValue
  readonly offsetY: DimensionValue
  readonly blur: DimensionValue
  readonly spread: DimensionValue
  readonly color: ColorValue
  readonly inset: boolean
}

export interface ShadowValue {
  readonly kind: 'shadow'
  readonly raw: string
  readonly layers: readonly ShadowLayer[]
}

/**
 * Input we could not normalize. This is not an error and not a silent drop: the
 * value stays in the model with the reason attached, rules skip it rather than
 * guessing, and the runner surfaces it. Comparing two unnormalized values is
 * never equality — that would be the raw string comparison invariant 3 forbids.
 */
export interface UnnormalizedValue {
  readonly kind: 'unnormalized'
  readonly raw: string
  readonly reason: string
}

export type NormalizedValue =
  | ColorValue
  | DimensionValue
  | RelativeValue
  | NumberValue
  | DurationValue
  | FontWeightValue
  | FontFamilyValue
  | StringValue
  | AliasValue
  | TypographyValue
  | ShadowValue
  | UnnormalizedValue

export type NormalizedKind = NormalizedValue['kind']

export function unnormalized(raw: string, reason: string): UnnormalizedValue {
  return { kind: 'unnormalized', raw, reason }
}

/** Rounds to `places` decimals, normalizing -0 to 0 so JSON stays stable. */
export function round(value: number, places: number): number {
  const factor = 10 ** places
  const rounded = Math.round(value * factor) / factor
  return rounded === 0 ? 0 : rounded
}
