/**
 * Length, duration, number and font-weight normalization.
 *
 * Lengths in absolute units collapse to px, so `1rem` and `16px` are one value.
 * Lengths in context-dependent units (`%`, `em`, viewport units) stay relative:
 * they compare equal to each other by unit and magnitude and never to a px
 * value, because resolving them would require layout we do not have.
 */

import {
  type AbsoluteUnit,
  type DimensionValue,
  type DurationValue,
  type FontWeightValue,
  type NumberValue,
  type RelativeUnit,
  type RelativeValue,
  round,
  type UnnormalizedValue,
  unnormalized,
} from './types.js'

/** The CSS default root font size. Overridable per project, never guessed. */
export const DEFAULT_ROOT_FONT_SIZE_PX = 16

export interface DimensionOptions {
  /** Pixel value of `1rem`. Defaults to 16. */
  readonly rootFontSizePx?: number
}

/** px per unit, for units that do not depend on the root font size. */
const ABSOLUTE_FACTORS: Readonly<Record<Exclude<AbsoluteUnit, 'rem'>, number>> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 25.4 / 4,
}

const RELATIVE_UNITS: ReadonlySet<string> = new Set<RelativeUnit>([
  '%', 'em', 'ex', 'ch', 'vw', 'vh', 'vmin', 'vmax',
])

const LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))(?:e(-?\d+))?\s*([a-z%]*)$/i

export type LengthResult = DimensionValue | RelativeValue | UnnormalizedValue

interface ParsedLength {
  readonly value: number
  readonly unit: string
}

function parseLength(text: string): ParsedLength | undefined {
  const match = LENGTH.exec(text)
  if (!match) return undefined
  const mantissa = Number(match[1])
  if (!Number.isFinite(mantissa)) return undefined
  const exponent = match[2] === undefined ? 0 : Number(match[2])
  const value = mantissa * 10 ** exponent
  if (!Number.isFinite(value)) return undefined
  return { value, unit: (match[3] ?? '').toLowerCase() }
}

/**
 * Normalizes a length. A bare number is treated as px only when it is `0`;
 * every other unitless number is a `number`, not a length — inferring px for
 * `spacing: 4` in a token file would be exactly the kind of guess invariant 4
 * forbids, and callers that know the convention pass `unitlessAsPx`.
 */
export function normalizeDimension(
  input: string | number,
  options: DimensionOptions & { readonly unitlessAsPx?: boolean } = {},
): LengthResult {
  const raw = String(input)
  const text = raw.trim()
  if (text.length === 0) return unnormalized(raw, 'empty dimension value')

  const parsed = parseLength(text)
  if (!parsed) return unnormalized(raw, 'unrecognized dimension notation')

  const { value, unit } = parsed

  if (unit === '') {
    if (value === 0 || options.unitlessAsPx === true) {
      return { kind: 'dimension', raw, px: round(value, 4), unit: 'px' }
    }
    return unnormalized(raw, 'unitless number is not a length')
  }

  if (unit === 'rem') {
    const root = options.rootFontSizePx ?? DEFAULT_ROOT_FONT_SIZE_PX
    return { kind: 'dimension', raw, px: round(value * root, 4), unit: 'rem' }
  }

  if (Object.hasOwn(ABSOLUTE_FACTORS, unit)) {
    const factor = ABSOLUTE_FACTORS[unit as Exclude<AbsoluteUnit, 'rem'>]
    return { kind: 'dimension', raw, px: round(value * factor, 4), unit: unit as AbsoluteUnit }
  }

  if (RELATIVE_UNITS.has(unit)) {
    return { kind: 'relative', raw, value: round(value, 4), unit: unit as RelativeUnit }
  }

  return unnormalized(raw, `unsupported length unit ${unit}`)
}

export function normalizeNumber(input: string | number): NumberValue | UnnormalizedValue {
  const raw = String(input)
  const value = Number(raw.trim())
  if (!Number.isFinite(value)) return unnormalized(raw, 'not a finite number')
  return { kind: 'number', raw, value: round(value, 6) }
}

const DURATION = /^(-?[\d.]+)\s*(ms|s)$/i

/** `0.2s` and `200ms` are the same duration. */
export function normalizeDuration(input: string | number): DurationValue | UnnormalizedValue {
  const raw = String(input)
  const text = raw.trim()
  const match = DURATION.exec(text)
  if (!match) {
    const bare = Number(text)
    // A bare number in a duration token is milliseconds by W3C convention.
    if (text.length > 0 && Number.isFinite(bare)) {
      return { kind: 'duration', raw, ms: round(bare, 4) }
    }
    return unnormalized(raw, 'unrecognized duration notation')
  }
  const value = Number(match[1])
  if (!Number.isFinite(value)) return unnormalized(raw, 'unrecognized duration notation')
  const ms = (match[2] as string).toLowerCase() === 's' ? value * 1000 : value
  return { kind: 'duration', raw, ms: round(ms, 4) }
}

const FONT_WEIGHT_KEYWORDS: Readonly<Record<string, number>> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
}

/**
 * `bold` is 700. Keyword spellings are collapsed (`semi-bold`, `Semi Bold` and
 * `semibold` agree) because these are the names type designers actually ship.
 */
export function normalizeFontWeight(input: string | number): FontWeightValue | UnnormalizedValue {
  const raw = String(input)
  const text = raw.trim()
  const numeric = Number(text)
  if (text.length > 0 && Number.isFinite(numeric)) {
    return { kind: 'fontWeight', raw, weight: Math.round(numeric) }
  }
  const key = text.toLowerCase().replace(/[\s_-]/g, '')
  const weight = Object.hasOwn(FONT_WEIGHT_KEYWORDS, key) ? FONT_WEIGHT_KEYWORDS[key] : undefined
  if (weight === undefined) return unnormalized(raw, 'unrecognized font weight')
  return { kind: 'fontWeight', raw, weight }
}
