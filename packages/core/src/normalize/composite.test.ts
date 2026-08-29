import { describe, expect, it } from 'vitest'

import { normalizeFontFamily, normalizeShadow, normalizeTypography } from './composite.js'
import { valuesEqual } from './equal.js'

describe('normalizeFontFamily', () => {
  it('strips quotes and splits a stack', () => {
    expect(normalizeFontFamily('"Inter", sans-serif').families).toEqual(['Inter', 'sans-serif'])
    expect(normalizeFontFamily(['Inter', 'sans-serif']).families).toEqual(['Inter', 'sans-serif'])
    expect(normalizeFontFamily("'JetBrains  Mono'").families).toEqual(['JetBrains Mono'])
  })
})

describe('normalizeTypography', () => {
  it('treats px and rem spellings of one ramp as equal', () => {
    const figma = normalizeTypography({
      fontFamily: 'Inter',
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: 1.5,
    })
    const css = normalizeTypography({
      fontFamily: '"Inter"',
      fontSize: '1rem',
      fontWeight: 'normal',
      lineHeight: 1.5,
    })
    expect(valuesEqual(figma, css)).toBe(true)
  })

  it('omits fields the input did not supply (invariant 10)', () => {
    const value = normalizeTypography({ fontSize: '16px' })
    if (value.kind !== 'typography') throw new Error('expected typography')
    expect(Object.hasOwn(value, 'letterSpacing')).toBe(false)
    expect(Object.hasOwn(value, 'fontFamily')).toBe(false)
  })

  it('does not treat an absent field as zero', () => {
    const withSpacing = normalizeTypography({ fontSize: '16px', letterSpacing: '0px' })
    const without = normalizeTypography({ fontSize: '16px' })
    expect(valuesEqual(withSpacing, without)).toBe(false)
  })

  it('keeps a unitless line height distinct from a length', () => {
    const unitless = normalizeTypography({ lineHeight: 1.5 })
    const length = normalizeTypography({ lineHeight: '1.5px' })
    expect(valuesEqual(unitless, length)).toBe(false)
  })

  it('surfaces an unreadable field rather than dropping it', () => {
    const value = normalizeTypography({ fontSize: 'huge' })
    expect(value.kind).toBe('unnormalized')
    expect(value.raw).toContain('huge')
  })
})

describe('normalizeShadow', () => {
  it('reads the CSS string and object forms into the same value', () => {
    const fromObject = normalizeShadow({
      offsetX: '0',
      offsetY: '1px',
      blur: '2px',
      color: 'rgba(0, 0, 0, 0.05)',
    })
    const fromString = normalizeShadow('0 1px 2px rgba(0, 0, 0, 0.05)')
    expect(valuesEqual(fromObject, fromString)).toBe(true)
  })

  it('splits layers on top-level commas only', () => {
    const value = normalizeShadow('0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)')
    if (value.kind !== 'shadow') throw new Error('expected a shadow')
    expect(value.layers).toHaveLength(2)
    expect(value.layers[0]?.spread.px).toBe(-1)
    expect(value.layers[1]?.blur.px).toBe(4)
  })

  it('defaults blur and spread to zero, as CSS does', () => {
    const value = normalizeShadow('1px 2px #000')
    if (value.kind !== 'shadow') throw new Error('expected a shadow')
    expect(value.layers[0]).toMatchObject({ blur: { px: 0 }, spread: { px: 0 }, inset: false })
  })

  it('reads inset', () => {
    const value = normalizeShadow('inset 0 1px 2px #000')
    if (value.kind !== 'shadow') throw new Error('expected a shadow')
    expect(value.layers[0]?.inset).toBe(true)
  })

  it('treats layer order as significant', () => {
    const a = normalizeShadow('0 1px 2px #000, 0 2px 4px #111')
    const b = normalizeShadow('0 2px 4px #111, 0 1px 2px #000')
    expect(valuesEqual(a, b)).toBe(false)
  })

  it('normalizes none to an empty layer list', () => {
    expect(normalizeShadow('none')).toMatchObject({ kind: 'shadow', layers: [] })
  })

  it('reports a malformed layer instead of guessing', () => {
    expect(normalizeShadow('0 1px 2px 3px 4px #000')).toMatchObject({ kind: 'unnormalized' })
    expect(normalizeShadow('nonsense')).toMatchObject({ kind: 'unnormalized' })
  })
})
