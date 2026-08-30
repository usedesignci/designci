/**
 * Auto-fix, the pure half: WHAT to change is decided here, fully tested;
 * main.ts only applies the decision to nodes (invariant 15).
 *
 * Every fix is deterministic and never invents a design decision:
 * - a raw color binds to the variable its value already equals (a fact, not a
 *   name guess — invariant 4);
 * - an off-scale dimension snaps to the nearest existing scale step;
 * - failing text prefers an existing token that passes AA, and only when none
 *   does falls back to the mathematically nearest passing color.
 * Creating new variables is deliberately not a fix: naming is a human act.
 */

import type { Rgba } from '@designci/core'

import { aaThreshold, contrastRatio } from './contrast.js'

export type CanvasFix =
  /** Bind every matching raw solid paint to the named color variable. */
  | { readonly kind: 'bind-color'; readonly variableName: string }
  /** Snap the offending spacing/radius fields to a scale step, bound to the
   * variable that holds it. */
  | { readonly kind: 'snap-dimension'; readonly px: number; readonly variableName: string }
  /** Recolor the text so it passes AA — an existing token when one passes,
   * otherwise the computed nearest passing color. */
  | {
      readonly kind: 'recolor-text'
      readonly hex: string
      readonly variableName?: string
      readonly ratio: number
    }

/** Nearest step on a scale; ties break toward the smaller step. Undefined on
 * an empty scale — there is nothing to snap to. */
export function nearestStep(value: number, scale: readonly number[]): number | undefined {
  let best: number | undefined
  for (const step of [...scale].sort((a, b) => a - b)) {
    if (best === undefined || Math.abs(step - value) < Math.abs(best - value)) best = step
  }
  return best
}

export interface ColorTokenEntry {
  readonly name: string
  readonly rgba: Rgba
}

const hexPair = (value: number): string => value.toString(16).padStart(2, '0')

export function rgbaHex(rgba: Rgba): string {
  return `#${hexPair(rgba.r)}${hexPair(rgba.g)}${hexPair(rgba.b)}`
}

function distance(a: Rgba, b: Rgba): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2
}

function mix(from: Rgba, toward: number, t: number): Rgba {
  const blend = (channel: number): number => Math.round(channel + (toward - channel) * t)
  return { r: blend(from.r), g: blend(from.g), b: blend(from.b), a: 1 }
}

/**
 * The color a failing text should become. Existing tokens that pass AA against
 * this background are preferred — nearest to the current color wins, name
 * breaks ties — so the fix keeps the design inside its own system. Only when
 * no token passes is a color computed: the current color mixed toward black or
 * white in 1% steps, whichever direction passes with the smaller change
 * (darker wins a tie). Pure math; identical inputs, identical fix.
 */
export function contrastFix(
  text: Rgba,
  background: Rgba,
  fontSize: number,
  fontWeight: number | undefined,
  tokens: readonly ColorTokenEntry[],
): { hex: string; variableName?: string; ratio: number } {
  const threshold = aaThreshold(fontSize, fontWeight)

  const passing = tokens.filter(
    (token) => token.rgba.a === 1 && contrastRatio(token.rgba, background) >= threshold,
  )
  if (passing.length > 0) {
    const best = [...passing].sort(
      (a, b) =>
        distance(a.rgba, text) - distance(b.rgba, text) || (a.name < b.name ? -1 : 1),
    )[0] as ColorTokenEntry
    return {
      hex: rgbaHex(best.rgba),
      variableName: best.name,
      ratio: contrastRatio(best.rgba, background),
    }
  }

  for (let percent = 1; percent <= 100; percent += 1) {
    const t = percent / 100
    const darker = mix(text, 0, t)
    if (contrastRatio(darker, background) >= threshold) {
      return { hex: rgbaHex(darker), ratio: contrastRatio(darker, background) }
    }
    const lighter = mix(text, 255, t)
    if (contrastRatio(lighter, background) >= threshold) {
      return { hex: rgbaHex(lighter), ratio: contrastRatio(lighter, background) }
    }
  }
  // Unreachable: pure black or pure white passes 4.5:1 on any opaque
  // background (max(L+0.05, 1.05)/min ≥ √21). Kept as an honest fallback.
  return { hex: '#000000', ratio: contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, background) }
}

/** One-line description of a fix, shared by the button and notifications. */
export function describeFix(fix: CanvasFix): string {
  switch (fix.kind) {
    case 'bind-color':
      return `Bind to ${fix.variableName}`
    case 'snap-dimension':
      return `Snap to ${fix.px}px (${fix.variableName})`
    case 'recolor-text':
      return fix.variableName === undefined
        ? `Recolor text to ${fix.hex} — passes AA at ${fix.ratio}:1`
        : `Switch text to ${fix.variableName} — passes AA at ${fix.ratio}:1`
  }
}
