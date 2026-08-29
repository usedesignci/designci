import { describe, expect, it } from 'vitest'

import { colorsEqual, formatColor, normalizeColor } from './color.js'
import type { ColorValue } from './types.js'

function rgba(input: string): ColorValue['rgba'] {
  const result = normalizeColor(input)
  if (result.kind !== 'color') throw new Error(`expected a color, got: ${result.reason}`)
  return result.rgba
}

describe('normalizeColor', () => {
  it('reads hex in every legal digit count', () => {
    expect(rgba('#f60')).toEqual({ r: 255, g: 102, b: 0, a: 1 })
    expect(rgba('#f60c')).toEqual({ r: 255, g: 102, b: 0, a: 0.8 })
    expect(rgba('#FF6B00')).toEqual({ r: 255, g: 107, b: 0, a: 1 })
    expect(rgba('#FF6B0080')).toEqual({ r: 255, g: 107, b: 0, a: 0.502 })
  })

  it('reads rgb() in legacy and modern syntax', () => {
    expect(rgba('rgb(255, 107, 0)')).toEqual({ r: 255, g: 107, b: 0, a: 1 })
    expect(rgba('rgb(255 107 0)')).toEqual({ r: 255, g: 107, b: 0, a: 1 })
    expect(rgba('rgba(255, 107, 0, 0.5)')).toEqual({ r: 255, g: 107, b: 0, a: 0.5 })
    expect(rgba('rgb(255 107 0 / 50%)')).toEqual({ r: 255, g: 107, b: 0, a: 0.5 })
    expect(rgba('rgb(100% 0% 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('reads hsl(), including angle units', () => {
    expect(rgba('hsl(0 100% 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(rgba('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 })
    expect(rgba('hsl(0.5turn 100% 50%)')).toEqual({ r: 0, g: 255, b: 255, a: 1 })
    expect(rgba('hsl(200grad 100% 50%)')).toEqual({ r: 0, g: 255, b: 255, a: 1 })
    expect(rgba('hsla(0, 0%, 100%, 0.25)')).toEqual({ r: 255, g: 255, b: 255, a: 0.25 })
  })

  it('reads named colors and transparent', () => {
    expect(rgba('rebeccapurple')).toEqual({ r: 102, g: 51, b: 153, a: 1 })
    expect(rgba('WHITE')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(rgba('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('treats the same colour in different notations as one value (invariant 3)', () => {
    const notations = ['#FF6B00', '#ff6b00', 'rgb(255, 107, 0)', 'rgb(255 107 0)', 'rgb(255 107 0 / 1)']
    const [first, ...rest] = notations.map(normalizeColor) as [ColorValue, ...ColorValue[]]
    for (const other of rest) expect(colorsEqual(first, other)).toBe(true)
  })

  it('keeps the author raw untouched (invariant 8)', () => {
    const result = normalizeColor('  #FF6B00  ')
    expect(result.raw).toBe('  #FF6B00  ')
    expect(result.kind).toBe('color')
  })

  it('refuses to guess at values it cannot resolve', () => {
    for (const input of ['currentColor', 'color(display-p3 1 0 0)', 'oklch(70% 0.1 40)', 'var(--x)']) {
      const result = normalizeColor(input)
      expect(result.kind).toBe('unnormalized')
      expect(result.raw).toBe(input)
    }
  })

  it('reports malformed input rather than throwing (invariant 7)', () => {
    for (const input of ['#12345', '#zzz', 'rgb(1, 2)', 'rgb(1 2 3 / abc)', '']) {
      expect(normalizeColor(input).kind).toBe('unnormalized')
    }
  })

  it('clamps out-of-range components the way CSS does', () => {
    expect(rgba('rgb(300 -20 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(rgba('rgb(0 0 0 / 4)')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })

  it('formats a canonical hex for reports', () => {
    const opaque = normalizeColor('rgb(255 107 0)')
    const translucent = normalizeColor('rgb(255 107 0 / 0.5)')
    if (opaque.kind !== 'color' || translucent.kind !== 'color') throw new Error('expected colors')
    expect(formatColor(opaque)).toBe('#ff6b00')
    expect(formatColor(translucent)).toBe('#ff6b0080')
  })
})
