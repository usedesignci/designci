/**
 * WCAG 2.x contrast math. Pure, and deliberately local to the plugin: this is
 * canvas accessibility linting, not token comparison, so it does not belong in
 * @designci/core's normalize layer.
 */

import type { Rgba } from '@designci/core'

/** WCAG relative luminance of an sRGB colour (alpha ignored — see lint.ts). */
export function relativeLuminance(color: Rgba): number {
  const channel = (value: number): number => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/** Contrast ratio between two colours, 1..21, rounded to 2 decimals. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la]
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
}

/**
 * WCAG "large text": at least 18pt (24 CSS px), or at least 14pt (~18.66px)
 * bold. Large text needs 3:1 for AA; everything else needs 4.5:1.
 */
export function isLargeText(fontSizePx: number, fontWeight: number | undefined): boolean {
  if (fontSizePx >= 24) return true
  return fontSizePx >= 18.66 && (fontWeight ?? 400) >= 700
}

export function aaThreshold(fontSizePx: number, fontWeight: number | undefined): number {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5
}

export function passesAa(
  ratio: number,
  fontSizePx: number,
  fontWeight: number | undefined,
): boolean {
  return ratio >= aaThreshold(fontSizePx, fontWeight)
}
