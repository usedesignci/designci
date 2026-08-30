import { describe, expect, it } from 'vitest'

import type { Rgba } from '@designci/core'

import { contrastRatio } from './contrast.js'
import { contrastFix, describeFix, nearestStep, type ColorTokenEntry } from './fix.js'
import * as fixModule from './fix.js'

const rgba = (r: number, g: number, b: number): Rgba => ({ r, g, b, a: 1 })
const WHITE = rgba(255, 255, 255)

describe('nearestStep', () => {
  it('snaps to the closest step, ties toward the smaller', () => {
    expect(nearestStep(10, [4, 8, 16])).toBe(8)
    expect(nearestStep(5, [2, 4, 8])).toBe(4)
    // 6 is equidistant from 4 and 8: the smaller step wins, deterministically.
    expect(nearestStep(6, [4, 8])).toBe(4)
    expect(nearestStep(6, [8, 4])).toBe(4)
  })

  it('has nothing to snap to on an empty scale', () => {
    expect(nearestStep(10, [])).toBeUndefined()
  })
})

describe('contrastFix', () => {
  const tokens: readonly ColorTokenEntry[] = [
    { name: 'color.text.muted', rgba: rgba(0x6b, 0x6b, 0x76) },
    { name: 'color.text.primary', rgba: rgba(0x18, 0x18, 0x1b) },
    { name: 'color.surface.raised', rgba: rgba(0xf7, 0xf7, 0xf8) },
  ]

  it('prefers the nearest existing token that passes', () => {
    // #999999 on white fails 4.5:1; muted is nearer than primary and passes.
    const fix = contrastFix(rgba(0x99, 0x99, 0x99), WHITE, 14, 400, tokens)
    expect(fix.variableName).toBe('color.text.muted')
    expect(fix.ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('respects the large-text threshold when picking', () => {
    const fix = contrastFix(rgba(0x99, 0x99, 0x99), WHITE, 32, 400, tokens)
    // 3:1 suffices at 32px; muted still nearest and passing.
    expect(fix.variableName).toBe('color.text.muted')
  })

  it('computes the nearest passing color when no token passes', () => {
    const fix = contrastFix(rgba(0x99, 0x99, 0x99), WHITE, 14, 400, [])
    expect(fix.variableName).toBeUndefined()
    const parsed = rgba(
      Number.parseInt(fix.hex.slice(1, 3), 16),
      Number.parseInt(fix.hex.slice(3, 5), 16),
      Number.parseInt(fix.hex.slice(5, 7), 16),
    )
    expect(contrastRatio(parsed, WHITE)).toBeGreaterThanOrEqual(4.5)
    // Deterministic: same inputs, same fix.
    expect(contrastFix(rgba(0x99, 0x99, 0x99), WHITE, 14, 400, [])).toEqual(fix)
  })

  it('always lands on a passing color, even from the worst start', () => {
    const grey = rgba(0xbc, 0xbc, 0xbc)
    for (const background of [WHITE, rgba(0, 0, 0), rgba(0x77, 0x77, 0x77)]) {
      const fix = contrastFix(grey, background, 14, 400, [])
      const parsed = rgba(
        Number.parseInt(fix.hex.slice(1, 3), 16),
        Number.parseInt(fix.hex.slice(3, 5), 16),
        Number.parseInt(fix.hex.slice(5, 7), 16),
      )
      expect(contrastRatio(parsed, background)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('promotion proposals', () => {
  it('names colors by hue family, pure math', () => {
    const { hueFamily } = fixModule
    expect(hueFamily(rgba(0x18, 0x5e, 0xc1))).toBe('blue')
    expect(hueFamily(rgba(0xff, 0x6b, 0x00))).toBe('orange')
    expect(hueFamily(rgba(0x15, 0x80, 0x3d))).toBe('green')
    expect(hueFamily(rgba(0x99, 0x99, 0x99))).toBe('gray')
    expect(hueFamily(rgba(0xfa, 0xfa, 0xfa))).toBe('white')
    expect(hueFamily(rgba(0x0a, 0x0a, 0x0a))).toBe('black')
  })

  it('adopts the file’s own naming prefix and keeps names unique', () => {
    const existing = ['color.brand.primary', 'color.text.muted', 'palette.old']
    expect(fixModule.proposeColorName(rgba(0x18, 0x5e, 0xc1), existing)).toBe('color.blue')
    expect(
      fixModule.proposeColorName(rgba(0x18, 0x5e, 0xc1), [...existing, 'color.blue']),
    ).toBe('color.blue-2')
    // No color tokens at all: the conventional default.
    expect(fixModule.proposeColorName(rgba(0x18, 0x5e, 0xc1), [])).toBe('color.blue')
  })

  it('names scale steps by their value', () => {
    expect(fixModule.proposeStepName('space', 10, ['space.sm'])).toBe('space.10')
    expect(fixModule.proposeStepName('space', 10, ['space.10'])).toBe('space.10-2')
    expect(fixModule.proposeStepName('radius', 5, [])).toBe('radius.5')
  })
})

describe('describeFix', () => {
  it('reads as the action it performs', () => {
    expect(describeFix({ kind: 'bind-color', variableName: 'color.brand.primary' })).toBe(
      'Bind to color.brand.primary',
    )
    expect(describeFix({ kind: 'snap-dimension', px: 8, variableName: 'space.sm' })).toBe(
      'Snap to 8px (space.sm)',
    )
    expect(
      describeFix({ kind: 'recolor-text', hex: '#6b6b76', variableName: 'color.text.muted', ratio: 5.26 }),
    ).toBe('Switch text to color.text.muted — passes AA at 5.26:1')
  })
})
