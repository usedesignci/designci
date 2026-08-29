/**
 * Equality over normalized values.
 *
 * This is the only place the engine decides "same value". Rules call it; they
 * never reach into `raw` (invariant 3) and never compare across kinds.
 *
 * Two `unnormalized` values are never equal, even with identical `raw`. If we
 * could not understand the input we cannot assert the values agree, and saying
 * they do would smuggle raw string comparison back in through the side door.
 */

import { colorsEqual } from './color.js'
import { fontFamiliesEqual } from './composite.js'
import type {
  NormalizedValue,
  ShadowLayer,
  TypographyValue,
} from './types.js'

function layersEqual(a: ShadowLayer, b: ShadowLayer): boolean {
  return (
    a.offsetX.px === b.offsetX.px &&
    a.offsetY.px === b.offsetY.px &&
    a.blur.px === b.blur.px &&
    a.spread.px === b.spread.px &&
    a.inset === b.inset &&
    colorsEqual(a.color, b.color)
  )
}

const TYPOGRAPHY_FIELDS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
] as const satisfies readonly (keyof TypographyValue)[]

function typographyEqual(a: TypographyValue, b: TypographyValue): boolean {
  return TYPOGRAPHY_FIELDS.every((field) => {
    const left = a[field]
    const right = b[field]
    if (left === undefined || right === undefined) return left === right
    return valuesEqual(left, right)
  })
}

/** True when two normalized values represent the same design decision. */
export function valuesEqual(a: NormalizedValue, b: NormalizedValue): boolean {
  if (a.kind !== b.kind) return false

  switch (a.kind) {
    case 'color':
      return colorsEqual(a, b as typeof a)
    case 'dimension':
      return a.px === (b as typeof a).px
    case 'relative': {
      const other = b as typeof a
      return a.unit === other.unit && a.value === other.value
    }
    case 'number':
      return a.value === (b as typeof a).value
    case 'duration':
      return a.ms === (b as typeof a).ms
    case 'fontWeight':
      return a.weight === (b as typeof a).weight
    case 'fontFamily':
      return fontFamiliesEqual(a, b as typeof a)
    case 'string':
      return a.value === (b as typeof a).value
    case 'alias':
      return a.target === (b as typeof a).target
    case 'typography':
      return typographyEqual(a, b as typeof a)
    case 'shadow': {
      const other = b as typeof a
      if (a.layers.length !== other.layers.length) return false
      return a.layers.every((layer, index) => layersEqual(layer, other.layers[index] as ShadowLayer))
    }
    case 'unnormalized':
      return false
  }
}

/** True when a value carries enough information for a rule to act on it. */
export function isComparable(value: NormalizedValue): boolean {
  return value.kind !== 'unnormalized' && value.kind !== 'alias'
}
