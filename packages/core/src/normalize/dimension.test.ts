import { describe, expect, it } from 'vitest'

import {
  normalizeDimension,
  normalizeDuration,
  normalizeFontWeight,
  normalizeNumber,
} from './dimension.js'

describe('normalizeDimension', () => {
  it('converts absolute units to px', () => {
    expect(normalizeDimension('16px')).toMatchObject({ kind: 'dimension', px: 16, unit: 'px' })
    expect(normalizeDimension('1rem')).toMatchObject({ kind: 'dimension', px: 16, unit: 'rem' })
    expect(normalizeDimension('0.25rem')).toMatchObject({ kind: 'dimension', px: 4 })
    expect(normalizeDimension('12pt')).toMatchObject({ kind: 'dimension', px: 16 })
    expect(normalizeDimension('1in')).toMatchObject({ kind: 'dimension', px: 96 })
    expect(normalizeDimension('2.54cm')).toMatchObject({ kind: 'dimension', px: 96 })
  })

  it('treats 1rem and 16px as one value (invariant 3)', () => {
    const rem = normalizeDimension('1rem')
    const px = normalizeDimension('16px')
    if (rem.kind !== 'dimension' || px.kind !== 'dimension') throw new Error('expected dimensions')
    expect(rem.px).toBe(px.px)
    // The unit as authored survives, for reports.
    expect(rem.unit).toBe('rem')
    expect(rem.raw).toBe('1rem')
  })

  it('honours a project root font size', () => {
    expect(normalizeDimension('1rem', { rootFontSizePx: 10 })).toMatchObject({ px: 10 })
  })

  it('keeps context-dependent units relative rather than guessing a px value', () => {
    expect(normalizeDimension('50%')).toMatchObject({ kind: 'relative', value: 50, unit: '%' })
    expect(normalizeDimension('1.5em')).toMatchObject({ kind: 'relative', value: 1.5, unit: 'em' })
    expect(normalizeDimension('100vw')).toMatchObject({ kind: 'relative', unit: 'vw' })
  })

  it('accepts a bare zero but not other unitless numbers', () => {
    expect(normalizeDimension('0')).toMatchObject({ kind: 'dimension', px: 0 })
    expect(normalizeDimension('4')).toMatchObject({ kind: 'unnormalized' })
    // Callers that know the convention opt in explicitly.
    expect(normalizeDimension('4', { unitlessAsPx: true })).toMatchObject({ px: 4 })
  })

  it('reports unsupported units instead of throwing (invariant 7)', () => {
    expect(normalizeDimension('10furlongs')).toMatchObject({ kind: 'unnormalized' })
    expect(normalizeDimension('calc(1rem + 2px)')).toMatchObject({ kind: 'unnormalized' })
    expect(normalizeDimension('')).toMatchObject({ kind: 'unnormalized' })
  })

  it('handles negative and fractional lengths', () => {
    expect(normalizeDimension('-2px')).toMatchObject({ px: -2 })
    expect(normalizeDimension('.5rem')).toMatchObject({ px: 8 })
  })
})

describe('normalizeDuration', () => {
  it('collapses seconds and milliseconds', () => {
    expect(normalizeDuration('150ms')).toMatchObject({ ms: 150 })
    expect(normalizeDuration('0.15s')).toMatchObject({ ms: 150 })
    expect(normalizeDuration(200)).toMatchObject({ ms: 200 })
  })

  it('rejects values that are not durations', () => {
    expect(normalizeDuration('fast')).toMatchObject({ kind: 'unnormalized' })
  })
})

describe('normalizeFontWeight', () => {
  it('maps keywords onto the numeric scale', () => {
    expect(normalizeFontWeight('bold')).toMatchObject({ weight: 700 })
    expect(normalizeFontWeight('normal')).toMatchObject({ weight: 400 })
    expect(normalizeFontWeight('Semi Bold')).toMatchObject({ weight: 600 })
    expect(normalizeFontWeight('semi-bold')).toMatchObject({ weight: 600 })
    expect(normalizeFontWeight(600)).toMatchObject({ weight: 600 })
  })

  it('does not invent a weight for an unknown name', () => {
    expect(normalizeFontWeight('chunky')).toMatchObject({ kind: 'unnormalized' })
  })
})

describe('normalizeNumber', () => {
  it('parses finite numbers only', () => {
    expect(normalizeNumber('1.5')).toMatchObject({ value: 1.5 })
    expect(normalizeNumber('abc')).toMatchObject({ kind: 'unnormalized' })
    expect(normalizeNumber(Number.POSITIVE_INFINITY)).toMatchObject({ kind: 'unnormalized' })
  })
})
