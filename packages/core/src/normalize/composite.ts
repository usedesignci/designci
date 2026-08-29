/**
 * Composite value normalization: typography and shadow.
 *
 * Both arrive in two shapes — as an object (W3C design tokens, Figma styles) or
 * as a CSS string (`0 1px 2px rgb(0 0 0 / 0.05)`). Both shapes normalize to the
 * same structure, which is what lets a Figma text style be compared against a
 * Tailwind config without either side being re-serialized to a string first.
 */

import { normalizeColor } from './color.js'
import { type DimensionOptions, normalizeDimension, normalizeFontWeight, normalizeNumber } from './dimension.js'
import {
  type DimensionValue,
  type FontFamilyValue,
  type LengthValue,
  type NumberValue,
  type ShadowLayer,
  type ShadowValue,
  type TypographyValue,
  type UnnormalizedValue,
  unnormalized,
} from './types.js'

const ZERO_PX: DimensionValue = { kind: 'dimension', raw: '0', px: 0, unit: 'px' }

/**
 * Splits a font stack into families, dropping quotes and collapsing whitespace.
 * Case is preserved in `families` for display but compared case-insensitively.
 */
export function normalizeFontFamily(input: string | readonly string[]): FontFamilyValue {
  const raw = Array.isArray(input) ? input.join(', ') : String(input)
  const parts = (Array.isArray(input) ? [...input] : String(input).split(','))
    .map((part) => String(part).trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' '))
    .filter((part) => part.length > 0)
  return { kind: 'fontFamily', raw, families: parts }
}

export function fontFamiliesEqual(a: FontFamilyValue, b: FontFamilyValue): boolean {
  if (a.families.length !== b.families.length) return false
  return a.families.every(
    (family, index) => family.toLowerCase() === (b.families[index] as string).toLowerCase(),
  )
}

/**
 * Line height is the one field where unitless and dimensional forms are both
 * idiomatic and genuinely different: `1.5` scales with font size, `24px` does
 * not. We keep the distinction rather than multiplying one into the other.
 */
function normalizeLineHeight(
  input: string | number,
  options: DimensionOptions,
): LengthValue | NumberValue | UnnormalizedValue {
  const text = String(input).trim()
  if (/^-?[\d.]+$/.test(text)) return normalizeNumber(text)
  return normalizeDimension(text, options)
}

export interface TypographyInput {
  readonly fontFamily?: string | readonly string[]
  readonly fontSize?: string | number
  readonly fontWeight?: string | number
  readonly lineHeight?: string | number
  readonly letterSpacing?: string | number
}

/**
 * Normalizes a typography composite. Fields absent from the input stay absent
 * from the output (invariant 10) — an omitted `letterSpacing` is not `0`, and
 * treating it as `0` would invent a mismatch.
 */
export function normalizeTypography(
  input: TypographyInput,
  options: DimensionOptions = {},
): TypographyValue | UnnormalizedValue {
  const raw = JSON.stringify(input)
  const value: {
    -readonly [K in keyof TypographyValue]: TypographyValue[K]
  } = { kind: 'typography', raw }

  if (input.fontFamily !== undefined) {
    value.fontFamily = normalizeFontFamily(input.fontFamily)
  }

  if (input.fontSize !== undefined) {
    const size = normalizeDimension(input.fontSize, options)
    if (size.kind !== 'dimension') {
      return unnormalized(raw, `fontSize is not an absolute length: ${String(input.fontSize)}`)
    }
    value.fontSize = size
  }

  if (input.fontWeight !== undefined) {
    const weight = normalizeFontWeight(input.fontWeight)
    if (weight.kind !== 'fontWeight') {
      return unnormalized(raw, `unrecognized fontWeight: ${String(input.fontWeight)}`)
    }
    value.fontWeight = weight
  }

  if (input.lineHeight !== undefined) {
    const lineHeight = normalizeLineHeight(input.lineHeight, options)
    if (lineHeight.kind === 'unnormalized') {
      return unnormalized(raw, `unrecognized lineHeight: ${String(input.lineHeight)}`)
    }
    value.lineHeight = lineHeight
  }

  if (input.letterSpacing !== undefined) {
    const letterSpacing = normalizeDimension(input.letterSpacing, options)
    if (letterSpacing.kind === 'unnormalized') {
      return unnormalized(raw, `unrecognized letterSpacing: ${String(input.letterSpacing)}`)
    }
    value.letterSpacing = letterSpacing
  }

  return value
}

export interface ShadowLayerInput {
  readonly offsetX?: string | number
  readonly offsetY?: string | number
  readonly blur?: string | number
  readonly spread?: string | number
  readonly color?: string
  readonly inset?: boolean
}

export type ShadowInput = string | ShadowLayerInput | readonly ShadowLayerInput[]

function normalizeShadowLength(
  input: string | number | undefined,
  options: DimensionOptions,
): DimensionValue | undefined {
  if (input === undefined) return ZERO_PX
  const length = normalizeDimension(input, options)
  return length.kind === 'dimension' ? length : undefined
}

function normalizeShadowObject(
  input: ShadowLayerInput,
  options: DimensionOptions,
): ShadowLayer | undefined {
  const offsetX = normalizeShadowLength(input.offsetX, options)
  const offsetY = normalizeShadowLength(input.offsetY, options)
  const blur = normalizeShadowLength(input.blur, options)
  const spread = normalizeShadowLength(input.spread, options)
  if (!offsetX || !offsetY || !blur || !spread) return undefined
  const color = normalizeColor(input.color ?? '#000000')
  if (color.kind !== 'color') return undefined
  return { offsetX, offsetY, blur, spread, color, inset: input.inset === true }
}

/**
 * Splits a CSS shadow list on top-level commas — the ones between layers, not
 * the ones inside `rgba(0, 0, 0, 0.1)`.
 */
function splitLayers(text: string): string[] {
  const layers: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      layers.push(current)
      current = ''
      continue
    }
    current += char
  }
  layers.push(current)
  return layers.map((layer) => layer.trim()).filter((layer) => layer.length > 0)
}

/** Splits a layer into tokens, keeping `rgb(0 0 0 / 50%)` as one token. */
function splitTokens(text: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (/\s/.test(char) && depth === 0) {
      if (current.length > 0) tokens.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

const LENGTH_TOKEN = /^-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?[a-z%]*$/i

function normalizeShadowLayerString(
  text: string,
  options: DimensionOptions,
): ShadowLayer | undefined {
  const tokens = splitTokens(text)
  const inset = tokens.some((token) => token.toLowerCase() === 'inset')
  const rest = tokens.filter((token) => token.toLowerCase() !== 'inset')

  const lengths: DimensionValue[] = []
  const others: string[] = []
  for (const token of rest) {
    if (LENGTH_TOKEN.test(token) && lengths.length < 4 && others.length === 0) {
      const length = normalizeDimension(token, { ...options, unitlessAsPx: true })
      if (length.kind !== 'dimension') return undefined
      lengths.push(length)
      continue
    }
    others.push(token)
  }

  // CSS requires at least the two offsets; blur and spread default to zero.
  if (lengths.length < 2) return undefined
  if (others.length > 1) return undefined

  const color = normalizeColor(others[0] ?? '#000000')
  if (color.kind !== 'color') return undefined

  return {
    offsetX: lengths[0] as DimensionValue,
    offsetY: lengths[1] as DimensionValue,
    blur: lengths[2] ?? ZERO_PX,
    spread: lengths[3] ?? ZERO_PX,
    color,
    inset,
  }
}

/**
 * Normalizes a shadow, from either a CSS string or the W3C object form. Layer
 * order is significant and preserved: shadows paint front to back.
 */
export function normalizeShadow(
  input: ShadowInput,
  options: DimensionOptions = {},
): ShadowValue | UnnormalizedValue {
  if (typeof input === 'string') {
    const raw = input
    const text = input.trim()
    if (text.length === 0) return unnormalized(raw, 'empty shadow value')
    if (text.toLowerCase() === 'none') return { kind: 'shadow', raw, layers: [] }
    const layers: ShadowLayer[] = []
    for (const part of splitLayers(text)) {
      const layer = normalizeShadowLayerString(part, options)
      if (!layer) return unnormalized(raw, `unrecognized shadow layer: ${part}`)
      layers.push(layer)
    }
    if (layers.length === 0) return unnormalized(raw, 'shadow has no layers')
    return { kind: 'shadow', raw, layers }
  }

  const raw = JSON.stringify(input)
  const inputs = Array.isArray(input) ? input : [input as ShadowLayerInput]
  const layers: ShadowLayer[] = []
  for (const part of inputs) {
    const layer = normalizeShadowObject(part, options)
    if (!layer) return unnormalized(raw, `unrecognized shadow layer: ${JSON.stringify(part)}`)
    layers.push(layer)
  }
  return { kind: 'shadow', raw, layers }
}
