/**
 * Normalizing a value when you know its type, and inferring the type when the
 * format does not state one.
 *
 * W3C token files declare `$type`. CSS custom properties declare nothing — a
 * stylesheet says `--radius-lg: 8px` and leaves the reader to work out that it
 * is a length. `inferValue` works that out *from the value's syntax*, never from
 * the token's name: `#FF6B00` is a colour because it parses as one, not because
 * the property is called `--color-brand-primary`. Name-based typing would be the
 * first step toward the name-based matching invariant 4 forbids.
 */

import { normalizeColor } from './color.js'
import {
  normalizeShadow,
  normalizeTypography,
  normalizeFontFamily,
  type ShadowInput,
  type TypographyInput,
} from './composite.js'
import {
  type DimensionOptions,
  normalizeDimension,
  normalizeDuration,
  normalizeFontWeight,
  normalizeNumber,
} from './dimension.js'
import { type NormalizedValue, unnormalized } from './types.js'

/** The types a value can be normalized as. Mirrors `TokenType` in the domain. */
export type NormalizableType =
  | 'color'
  | 'dimension'
  | 'duration'
  | 'number'
  | 'fontFamily'
  | 'fontWeight'
  | 'typography'
  | 'shadow'
  | 'string'

const ALIAS = /^\{([^{}]+)\}$/

/**
 * A `{color.brand.primary}` reference. Left unresolved here: resolving it needs
 * the whole document, which is the adapter's job, and an alias that cannot be
 * resolved must stay visible rather than becoming a silent value.
 */
export function asAlias(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const match = ALIAS.exec(input.trim())
  return match ? (match[1] as string) : undefined
}

function asString(input: unknown): string {
  return typeof input === 'string' ? input : JSON.stringify(input) ?? String(input)
}

/** Normalizes a value the format declared a type for. */
export function normalizeForType(
  type: NormalizableType,
  input: unknown,
  options: DimensionOptions = {},
): NormalizedValue {
  const alias = asAlias(input)
  if (alias !== undefined) return { kind: 'alias', raw: asString(input), target: alias }

  switch (type) {
    case 'color':
      return typeof input === 'string'
        ? normalizeColor(input)
        : unnormalized(asString(input), 'a color must be a string')
    case 'dimension':
      return typeof input === 'string' || typeof input === 'number'
        ? normalizeDimension(input, options)
        : unnormalized(asString(input), 'a dimension must be a string or number')
    case 'duration':
      return typeof input === 'string' || typeof input === 'number'
        ? normalizeDuration(input)
        : unnormalized(asString(input), 'a duration must be a string or number')
    case 'number':
      return typeof input === 'string' || typeof input === 'number'
        ? normalizeNumber(input)
        : unnormalized(asString(input), 'a number must be a string or number')
    case 'fontWeight':
      return typeof input === 'string' || typeof input === 'number'
        ? normalizeFontWeight(input)
        : unnormalized(asString(input), 'a font weight must be a string or number')
    case 'fontFamily':
      return typeof input === 'string' || Array.isArray(input)
        ? normalizeFontFamily(input as string | readonly string[])
        : unnormalized(asString(input), 'a font family must be a string or array')
    case 'typography':
      return typeof input === 'object' && input !== null && !Array.isArray(input)
        ? normalizeTypography(input as TypographyInput, options)
        : unnormalized(asString(input), 'typography must be an object')
    case 'shadow':
      return typeof input === 'string' || (typeof input === 'object' && input !== null)
        ? normalizeShadow(input as ShadowInput, options)
        : unnormalized(asString(input), 'a shadow must be a string or object')
    case 'string':
      return { kind: 'string', raw: asString(input), value: asString(input).trim() }
  }
}

const LENGTH_TOKEN = /^-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?[a-z%]*$/i

/**
 * Splits a value into top-level tokens, keeping `rgb(0 0 0 / 50%)` whole, so
 * shadow detection can count lengths without tripping over function arguments.
 */
function topLevelTokens(text: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (/[\s,]/.test(char) && depth === 0) {
      if (current.length > 0) tokens.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

/**
 * Looks like a shadow: at least two lengths and a colour.
 *
 * Deliberately conservative. `4px 8px` alone stays a string, because a pair of
 * lengths is just as likely to be an inset or a background position. Requiring a
 * colour alongside them is what separates `0 1px 2px rgb(0 0 0 / 5%)` from a
 * value we would only be guessing about.
 */
function looksLikeShadow(text: string): boolean {
  const tokens = topLevelTokens(text)
  let lengths = 0
  let colors = 0
  for (const token of tokens) {
    if (token.toLowerCase() === 'inset') continue
    if (LENGTH_TOKEN.test(token)) {
      lengths += 1
      continue
    }
    if (normalizeColor(token).kind === 'color') colors += 1
  }
  return lengths >= 2 && colors >= 1
}

export interface InferredValue {
  readonly type: NormalizableType
  readonly value: NormalizedValue
}

/**
 * Infers a type from the value's syntax, for formats that declare none.
 *
 * The order is fixed, and therefore deterministic: alias, colour, length,
 * duration, shadow, plain number, then string as the honest fallback. A value
 * that reaches `string` is not a failure — it is simply a value whose type this
 * format did not tell us and whose syntax did not settle.
 */
export function inferValue(input: string, options: DimensionOptions = {}): InferredValue {
  const text = input.trim()

  const alias = asAlias(text)
  if (alias !== undefined) {
    return { type: 'string', value: { kind: 'alias', raw: input, target: alias } }
  }

  const color = normalizeColor(input)
  if (color.kind === 'color') return { type: 'color', value: color }

  const dimension = normalizeDimension(input, options)
  if (dimension.kind === 'dimension' || dimension.kind === 'relative') {
    return { type: 'dimension', value: dimension }
  }

  if (/^-?[\d.]+\s*(ms|s)$/i.test(text)) {
    const duration = normalizeDuration(input)
    if (duration.kind === 'duration') return { type: 'duration', value: duration }
  }

  if (looksLikeShadow(text)) {
    const shadow = normalizeShadow(input, options)
    if (shadow.kind === 'shadow') return { type: 'shadow', value: shadow }
  }

  const number = normalizeNumber(input)
  if (number.kind === 'number') return { type: 'number', value: number }

  return { type: 'string', value: { kind: 'string', raw: input, value: text } }
}
