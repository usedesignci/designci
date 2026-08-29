/**
 * Color normalization.
 *
 * Every supported notation collapses to 8-bit sRGB plus alpha, so the engine can
 * decide `#FF6B00 === rgb(255 107 0)` without ever comparing the strings.
 *
 * Supported: hex (3, 4, 6, 8 digits), `rgb()`/`rgba()` in legacy comma form and
 * modern space form, `hsl()`/`hsla()` likewise, CSS named colors, `transparent`.
 *
 * Deliberately not supported: `currentColor`, `color(display-p3 …)`, `lab()`,
 * `oklch()`, and relative color syntax. These normalize to `unnormalized` with a
 * reason rather than a guess — a wrong conversion here is a false positive, and
 * false positives are the product's top risk.
 */

import { NAMED_COLORS } from './named-colors.js'
import { type ColorValue, type Rgba, round, type UnnormalizedValue, unnormalized } from './types.js'

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

const HEX = /^#([0-9a-f]{3,8})$/i
const FUNCTIONAL = /^([a-z]+)\((.*)\)$/is

export type ColorResult = ColorValue | UnnormalizedValue

/** Clamps to [min, max]. NaN clamps to min, which keeps output finite. */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return value < min ? min : value > max ? max : value
}

function channel(value: number): number {
  return Math.round(clamp(value, 0, 255))
}

function alpha(value: number): number {
  return round(clamp(value, 0, 1), 4)
}

function color(raw: string, rgba: Rgba): ColorValue {
  return { kind: 'color', raw, rgba }
}

/**
 * Parses one component of a color function. Percentages resolve against `scale`;
 * `none` (CSS Color 4 missing components) resolves to 0, matching how browsers
 * serialize a missing component in sRGB.
 */
function component(token: string, scale: number): number | undefined {
  const text = token.trim().toLowerCase()
  if (text === 'none') return 0
  if (text.endsWith('%')) {
    const percent = Number(text.slice(0, -1))
    return Number.isFinite(percent) ? (percent / 100) * scale : undefined
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

function alphaComponent(token: string): number | undefined {
  const text = token.trim().toLowerCase()
  if (text === 'none') return 0
  if (text.endsWith('%')) {
    const percent = Number(text.slice(0, -1))
    return Number.isFinite(percent) ? percent / 100 : undefined
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Splits color-function arguments, accepting both legacy `r, g, b, a` and modern
 * `r g b / a`. Returns components and an optional alpha slot.
 */
function splitArgs(body: string): { readonly parts: string[]; readonly alpha?: string } {
  const [main = '', ...rest] = body.split('/')
  const parts = main.trim().split(/[\s,]+/).filter((part) => part.length > 0)
  const slashAlpha = rest.join('/').trim()
  if (slashAlpha.length > 0) return { parts, alpha: slashAlpha }
  // Legacy form puts alpha in the 4th comma-separated slot.
  if (parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] as string }
  return { parts }
}

function hueToRgb(p: number, q: number, t: number): number {
  let position = t
  if (position < 0) position += 1
  if (position > 1) position -= 1
  if (position < 1 / 6) return p + (q - p) * 6 * position
  if (position < 1 / 2) return q
  if (position < 2 / 3) return p + (q - p) * (2 / 3 - position) * 6
  return p
}

/** h in degrees, s and l in [0, 1]. */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = (((h % 360) + 360) % 360) / 360
  if (s === 0) {
    const gray = l * 255
    return { r: gray, g: gray, b: gray }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  }
}

/** Converts an angle token (deg/grad/rad/turn/unitless) to degrees. */
function hueDegrees(token: string): number | undefined {
  const text = token.trim().toLowerCase()
  if (text === 'none') return 0
  const match = /^(-?[\d.]+)(deg|grad|rad|turn)?$/.exec(text)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  switch (match[2]) {
    case 'grad':
      return (value * 360) / 400
    case 'rad':
      return (value * 180) / Math.PI
    case 'turn':
      return value * 360
    default:
      return value
  }
}

function fromHex(raw: string, digits: string): ColorResult {
  const expand = (pair: string): number => Number.parseInt(pair, 16)
  switch (digits.length) {
    case 3:
    case 4: {
      const parts = [...digits].map((digit) => expand(digit + digit))
      return color(raw, {
        r: parts[0] as number,
        g: parts[1] as number,
        b: parts[2] as number,
        a: digits.length === 4 ? alpha((parts[3] as number) / 255) : 1,
      })
    }
    case 6:
    case 8: {
      const pairs = digits.match(/.{2}/g) as string[]
      const parts = pairs.map(expand)
      return color(raw, {
        r: parts[0] as number,
        g: parts[1] as number,
        b: parts[2] as number,
        a: digits.length === 8 ? alpha((parts[3] as number) / 255) : 1,
      })
    }
    default:
      return unnormalized(raw, `hex color must have 3, 4, 6 or 8 digits, got ${digits.length}`)
  }
}

/**
 * Normalizes a CSS color. Returns `unnormalized` — never throws, never guesses —
 * for anything outside the supported notations.
 */
export function normalizeColor(input: string): ColorResult {
  const raw = input
  const text = input.trim()
  if (text.length === 0) return unnormalized(raw, 'empty color value')

  const lower = text.toLowerCase()

  if (lower === 'transparent') return color(raw, TRANSPARENT)
  if (lower === 'currentcolor') {
    return unnormalized(raw, 'currentColor depends on inherited context and cannot be compared')
  }

  const named = Object.hasOwn(NAMED_COLORS, lower) ? NAMED_COLORS[lower] : undefined
  if (named !== undefined) {
    return color(raw, { r: (named >> 16) & 0xff, g: (named >> 8) & 0xff, b: named & 0xff, a: 1 })
  }

  const hex = HEX.exec(text)
  if (hex) return fromHex(raw, hex[1] as string)
  if (text.startsWith('#')) return unnormalized(raw, 'malformed hex color')

  const fn = FUNCTIONAL.exec(text)
  if (!fn) return unnormalized(raw, 'unrecognized color notation')

  const name = (fn[1] as string).toLowerCase()
  const { parts, alpha: alphaToken } = splitArgs(fn[2] as string)
  const alphaValue = alphaToken === undefined ? 1 : alphaComponent(alphaToken)
  if (alphaValue === undefined) return unnormalized(raw, 'malformed alpha component')

  if (name === 'rgb' || name === 'rgba') {
    if (parts.length !== 3) return unnormalized(raw, `${name}() expects 3 components`)
    const [r, g, b] = parts.map((part) => component(part, 255))
    if (r === undefined || g === undefined || b === undefined) {
      return unnormalized(raw, `malformed ${name}() component`)
    }
    return color(raw, { r: channel(r), g: channel(g), b: channel(b), a: alpha(alphaValue) })
  }

  if (name === 'hsl' || name === 'hsla') {
    if (parts.length !== 3) return unnormalized(raw, `${name}() expects 3 components`)
    const hue = hueDegrees(parts[0] as string)
    const saturation = component(parts[1] as string, 1)
    const lightness = component(parts[2] as string, 1)
    if (hue === undefined || saturation === undefined || lightness === undefined) {
      return unnormalized(raw, `malformed ${name}() component`)
    }
    const rgb = hslToRgb(hue, clamp(saturation, 0, 1), clamp(lightness, 0, 1))
    return color(raw, {
      r: channel(rgb.r),
      g: channel(rgb.g),
      b: channel(rgb.b),
      a: alpha(alphaValue),
    })
  }

  return unnormalized(raw, `unsupported color function ${name}()`)
}

/** True when two colors are the same in sRGB, including alpha. */
export function colorsEqual(a: ColorValue, b: ColorValue): boolean {
  return (
    a.rgba.r === b.rgba.r && a.rgba.g === b.rgba.g && a.rgba.b === b.rgba.b && a.rgba.a === b.rgba.a
  )
}

/** Canonical `#rrggbb` / `#rrggbbaa` form, for display in reports. */
export function formatColor(value: ColorValue): string {
  const hex = (n: number): string => n.toString(16).padStart(2, '0')
  const base = `#${hex(value.rgba.r)}${hex(value.rgba.g)}${hex(value.rgba.b)}`
  return value.rgba.a === 1 ? base : `${base}${hex(Math.round(value.rgba.a * 255))}`
}
