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

/* ------------------------------------------------------------------ *
 * Promoting a value to a variable.
 *
 * Creation is never automatic — the human confirms (or rewrites) the name,
 * because names carry meaning the value cannot supply. What CAN be computed
 * is a sensible proposal: the hue family for a color, the pixel value for a
 * scale step, prefixed with the file's own dominant naming convention.
 * ------------------------------------------------------------------ */

/** The hue-family word for a color — pure math over HSL, no cleverness. */
export function hueFamily(rgba: Rgba): string {
  const r = rgba.r / 255
  const g = rgba.g / 255
  const b = rgba.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  const saturation =
    delta === 0 ? 0 : delta / (lightness > 0.5 ? 2 - max - min : max + min)

  if (lightness >= 0.95) return 'white'
  if (lightness <= 0.08) return 'black'
  if (saturation < 0.12) return 'gray'

  let hue = 0
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue = (hue * 60 + 360) % 360
  }

  if (hue < 15 || hue >= 345) return 'red'
  if (hue < 45) return 'orange'
  if (hue < 70) return 'yellow'
  if (hue < 160) return 'green'
  if (hue < 200) return 'teal'
  if (hue < 260) return 'blue'
  if (hue < 300) return 'purple'
  return 'pink'
}

function unique(candidate: string, taken: ReadonlySet<string>): string {
  if (!taken.has(candidate)) return candidate
  for (let suffix = 2; ; suffix += 1) {
    const next = `${candidate}-${suffix}`
    if (!taken.has(next)) return next
  }
}

/** The dominant first path segment among tokens of a kind — the file's own
 * convention — falling back to the conventional default. */
export function dominantPrefix(
  names: readonly string[],
  fallback: string,
): string {
  const counts = new Map<string, number>()
  for (const name of names) {
    const head = name.split('.')[0]
    if (head === undefined || head === '') continue
    counts.set(head, (counts.get(head) ?? 0) + 1)
  }
  let best = fallback
  let bestCount = 0
  for (const [head, count] of [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (count > bestCount) {
      best = head
      bestCount = count
    }
  }
  return best
}

/** Proposed dotted name for promoting a raw color: `color.blue`, unique. */
export function proposeColorName(
  rgba: Rgba,
  existingColorNames: readonly string[],
): string {
  const prefix = dominantPrefix(existingColorNames, 'color')
  return unique(`${prefix}.${hueFamily(rgba)}`, new Set(existingColorNames))
}

/** Proposed dotted name for a new scale step: `space.10`, unique. */
export function proposeStepName(
  namespace: string,
  px: number,
  existingNames: readonly string[],
): string {
  return unique(`${namespace}.${px}`, new Set(existingNames))
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
