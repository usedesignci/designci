import { describe, expect, it } from 'vitest'

import { aaThreshold, contrastRatio, isLargeText, passesAa, relativeLuminance } from './contrast.js'

const rgb = (r: number, g: number, b: number) => ({ r, g, b, a: 1 })
const WHITE = rgb(255, 255, 255)
const BLACK = rgb(0, 0, 0)

describe('contrast', () => {
  it('computes the canonical extremes', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5)
    expect(relativeLuminance(BLACK)).toBe(0)
    expect(contrastRatio(WHITE, BLACK)).toBe(21)
    expect(contrastRatio(BLACK, WHITE)).toBe(21)
    expect(contrastRatio(WHITE, WHITE)).toBe(1)
  })

  it('matches known WCAG reference pairs', () => {
    // #767676 on white is the canonical "just passes AA" gray.
    expect(contrastRatio(rgb(0x76, 0x76, 0x76), WHITE)).toBeCloseTo(4.54, 2)
    expect(passesAa(4.54, 14, 400)).toBe(true)
    // #777777 on white just fails.
    expect(contrastRatio(rgb(0x77, 0x77, 0x77), WHITE)).toBeCloseTo(4.48, 2)
    expect(passesAa(4.48, 14, 400)).toBe(false)
  })

  it('applies the large-text threshold', () => {
    expect(isLargeText(24, 400)).toBe(true)
    expect(isLargeText(23, 400)).toBe(false)
    expect(isLargeText(19, 700)).toBe(true)
    expect(isLargeText(19, 400)).toBe(false)
    expect(aaThreshold(24, 400)).toBe(3)
    expect(aaThreshold(14, 400)).toBe(4.5)
    // 3.5:1 passes for large text, fails for body text.
    expect(passesAa(3.5, 24, 400)).toBe(true)
    expect(passesAa(3.5, 14, 400)).toBe(false)
  })
})
