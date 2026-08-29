/**
 * Figma document extraction — the pure half.
 *
 * Takes a serializable description of a file's variables and styles (the shapes
 * `collect.ts` reads off the `figma` global) and produces the same
 * DesignSystemSnapshot the CLI consumes. Nothing here touches the plugin API,
 * which is what makes this module testable outside Figma and keeps invariant 12
 * intact: the sandbox boundary is `collect.ts`, and it contains no decisions.
 *
 * Two Figma-specific judgments, both derived from declared metadata rather than
 * names (invariant 13):
 *
 * - A FLOAT variable is just a number until its *scopes* say otherwise. Scopes
 *   are authored in Figma's UI ("use this variable for corner radius"), and
 *   Figma's canonical unit for lengths is px — so a CORNER_RADIUS-scoped float
 *   is a px dimension by the platform's own schema. An unscoped float stays a
 *   number, the honest fallback.
 *
 * - Only a collection's default mode is exported. A second mode is a theme
 *   (dark, compact), and comparing a dark value against a code source's default
 *   would manufacture drift — the same reasoning as invariant 14 for `@media`.
 *   Collections with extra modes are surfaced in a diagnostic, not silently
 *   truncated.
 */

import {
  type DesignToken,
  type DesignSystemSnapshot,
  type NormalizedValue,
  type ParseDiagnostic,
  type Source,
  type TokenType,
  createSnapshot,
  inferValue,
  normalizeFontWeight,
  normalizeTypography,
  round,
  sourceId as asSourceId,
  tokenId as asTokenId,
  type TypographyInput,
} from '@designci/core'

/* ------------------------------------------------------------------ *
 * The serializable input shapes, mirroring Figma's plugin API objects.
 * ------------------------------------------------------------------ */

export interface ExportedRgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a?: number
}

export interface ExportedAlias {
  readonly type: 'VARIABLE_ALIAS'
  readonly id: string
}

export type ExportedVariableValue = ExportedRgba | ExportedAlias | number | string | boolean

export interface ExportedVariableCollection {
  readonly id: string
  readonly name: string
  readonly defaultModeId: string
  readonly modes: readonly { readonly modeId: string; readonly name: string }[]
}

export interface ExportedVariable {
  readonly id: string
  /** Figma variable name, slash-separated: `color/brand/primary`. */
  readonly name: string
  /**
   * Kept as string rather than Figma's current union: the platform grows types
   * (EASING arrived after BOOLEAN), and an unknown one must land in the
   * unsupported branch, not fail to compile against older shapes.
   */
  readonly resolvedType: string
  readonly scopes: readonly string[]
  readonly valuesByMode: Readonly<Record<string, ExportedVariableValue>>
  readonly variableCollectionId: string
  readonly description?: string
}

export interface ExportedSolidPaint {
  readonly type: 'SOLID'
  readonly color: { readonly r: number; readonly g: number; readonly b: number }
  readonly opacity?: number
  readonly visible?: boolean
}

export interface ExportedOtherPaint {
  readonly type: string
  readonly visible?: boolean
}

export type ExportedPaint = ExportedSolidPaint | ExportedOtherPaint

export interface ExportedPaintStyle {
  readonly id: string
  readonly name: string
  readonly paints: readonly ExportedPaint[]
  readonly description?: string
}

export interface ExportedTextStyle {
  readonly id: string
  readonly name: string
  readonly fontName: { readonly family: string; readonly style: string }
  readonly fontSize: number
  readonly lineHeight:
    | { readonly unit: 'PIXELS' | 'PERCENT'; readonly value: number }
    | { readonly unit: 'AUTO' }
  readonly letterSpacing: { readonly unit: 'PIXELS' | 'PERCENT'; readonly value: number }
  readonly description?: string
}

export interface ExportedShadowEffect {
  readonly type: 'DROP_SHADOW' | 'INNER_SHADOW'
  readonly color: ExportedRgba
  readonly offset: { readonly x: number; readonly y: number }
  readonly radius: number
  readonly spread?: number
  readonly visible: boolean
}

export interface ExportedOtherEffect {
  readonly type: string
  readonly visible: boolean
}

export type ExportedEffect = ExportedShadowEffect | ExportedOtherEffect

export interface ExportedEffectStyle {
  readonly id: string
  readonly name: string
  readonly effects: readonly ExportedEffect[]
  readonly description?: string
}

export interface FigmaDocumentExport {
  readonly fileName: string
  readonly collections: readonly ExportedVariableCollection[]
  readonly variables: readonly ExportedVariable[]
  readonly paintStyles: readonly ExportedPaintStyle[]
  readonly textStyles: readonly ExportedTextStyle[]
  readonly effectStyles: readonly ExportedEffectStyle[]
}

/* ------------------------------------------------------------------ *
 * Extraction.
 * ------------------------------------------------------------------ */

/** Scopes Figma defines as lengths; its canonical length unit is px. */
const LENGTH_SCOPES: ReadonlySet<string> = new Set([
  'CORNER_RADIUS',
  'WIDTH_HEIGHT',
  'GAP',
  'STROKE_FLOAT',
  'EFFECT_FLOAT',
  'FONT_SIZE',
  'LINE_HEIGHT',
  'LETTER_SPACING',
  'PARAGRAPH_SPACING',
  'PARAGRAPH_INDENT',
])

function isAlias(value: ExportedVariableValue): value is ExportedAlias {
  return typeof value === 'object' && value !== null && 'type' in value
}

function isRgba(value: ExportedVariableValue): value is ExportedRgba {
  return typeof value === 'object' && value !== null && 'r' in value
}

/** Figma colour channels are floats in [0, 1]. */
function channel(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
}

function hex(rgba: { r: number; g: number; b: number; a: number }): string {
  const pair = (n: number): string => n.toString(16).padStart(2, '0')
  const base = `#${pair(rgba.r)}${pair(rgba.g)}${pair(rgba.b)}`
  return rgba.a === 1 ? base : `${base}${pair(Math.round(rgba.a * 255))}`
}

function colorValue(input: ExportedRgba): { value: NormalizedValue; raw: string } {
  const rgba = {
    r: channel(input.r),
    g: channel(input.g),
    b: channel(input.b),
    a: round(Math.min(1, Math.max(0, input.a ?? 1)), 4),
  }
  const raw = hex(rgba)
  return { value: { kind: 'color', raw, rgba }, raw }
}

/** Figma names are slash paths; the token id is the dotted form of the path. */
function toPath(name: string): string[] {
  return name
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function extractSnapshot(input: FigmaDocumentExport): DesignSystemSnapshot {
  const source: Source = {
    id: asSourceId('figma'),
    kind: 'figma',
    role: 'design',
    label: 'Figma',
    origin: input.fileName,
  }

  const diagnostics: ParseDiagnostic[] = []
  const tokens: DesignToken[] = []
  const seen = new Set<string>()

  const warn = (code: string, message: string, raw?: string): void => {
    diagnostics.push({
      severity: 'warning',
      code,
      message,
      sourceId: source.id,
      ...(raw === undefined ? {} : { raw }),
    })
  }

  const push = (token: DesignToken): void => {
    if (seen.has(token.id)) {
      // parseSnapshot enforces unique ids on read, so a collision between a
      // variable and a same-named style must be resolved here, visibly.
      warn(
        'duplicate-token-name',
        `${token.id} is defined more than once (a variable and a style may share a name); keeping the first`,
      )
      return
    }
    seen.add(token.id)
    tokens.push(token)
  }

  const variableNames = new Map(input.variables.map((variable) => [variable.id, variable.name]))
  const collections = new Map(input.collections.map((collection) => [collection.id, collection]))

  for (const collection of input.collections) {
    if (collection.modes.length > 1) {
      const defaultMode =
        collection.modes.find((mode) => mode.modeId === collection.defaultModeId)?.name ??
        'default'
      warn(
        'multiple-modes',
        `collection ${collection.name} has ${collection.modes.length} modes; only ${JSON.stringify(defaultMode)} is exported — Design CI does not model theme modes yet`,
      )
    }
  }

  for (const variable of input.variables) {
    const path = toPath(variable.name)
    if (path.length === 0) continue
    const id = path.join('.')

    const collection = collections.get(variable.variableCollectionId)
    const value =
      collection === undefined ? undefined : variable.valuesByMode[collection.defaultModeId]

    if (value === undefined) {
      warn('unbound-variable', `${id} has no value in its collection's default mode`, variable.name)
      continue
    }

    // Key order matters: the wire format serializes byte-identically through
    // parseSnapshot (invariant 1), so tokens are built in its canonical order.
    const describe =
      variable.description === undefined || variable.description === ''
        ? {}
        : { description: variable.description }

    if (isAlias(value)) {
      const target = variableNames.get(value.id)
      const raw = target === undefined ? value.id : `{${toPath(target).join('.')}}`
      push({
        id: asTokenId(id),
        sourceId: source.id,
        path,
        type: variable.resolvedType === 'COLOR' ? 'color' : 'unknown',
        raw,
        value:
          target === undefined
            ? { kind: 'unnormalized', raw, reason: 'alias to a variable that no longer exists' }
            : { kind: 'alias', raw, target: toPath(target).join('.') },
        ...describe,
      })
      if (target === undefined) {
        warn('dangling-alias', `${id} aliases a variable that no longer exists`, value.id)
      }
      continue
    }

    switch (variable.resolvedType) {
      case 'COLOR': {
        if (!isRgba(value)) {
          warn('unreadable-value', `${id} is a COLOR variable without a colour value`)
          continue
        }
        const color = colorValue(value)
        push({
          id: asTokenId(id),
          sourceId: source.id,
          path,
          type: 'color',
          raw: color.raw,
          value: color.value,
          ...describe,
        })
        continue
      }
      case 'FLOAT': {
        if (typeof value !== 'number') {
          warn('unreadable-value', `${id} is a FLOAT variable without a numeric value`)
          continue
        }
        const isLength = variable.scopes.some((scope) => LENGTH_SCOPES.has(scope))
        const isWeight = variable.scopes.includes('FONT_WEIGHT')
        const raw = String(value)
        const typed: Pick<DesignToken, 'type' | 'value'> = isLength
          ? {
              type: 'dimension',
              value: { kind: 'dimension', raw, px: round(value, 4), unit: 'px' },
            }
          : isWeight
            ? { type: 'fontWeight', value: { kind: 'fontWeight', raw, weight: Math.round(value) } }
            : { type: 'number', value: { kind: 'number', raw, value: round(value, 6) } }
        push({
          id: asTokenId(id),
          sourceId: source.id,
          path,
          type: typed.type,
          raw,
          value: typed.value,
          ...describe,
        })
        continue
      }
      case 'STRING': {
        if (typeof value !== 'string') {
          warn('unreadable-value', `${id} is a STRING variable without a string value`)
          continue
        }
        if (variable.scopes.includes('FONT_FAMILY')) {
          push({
            id: asTokenId(id),
            sourceId: source.id,
            path,
            type: 'fontFamily',
            raw: value,
            value: { kind: 'fontFamily', raw: value, families: [value] },
            ...describe,
          })
          continue
        }
        // Figma has no duration or easing type, so teams store them as strings.
        // The string's own syntax settles the type (invariant 13), exactly as
        // the CSS adapter does — `150ms` becomes a duration and compares equal
        // to a stylesheet's `0.15s`.
        const inferred = inferValue(value)
        push({
          id: asTokenId(id),
          sourceId: source.id,
          path,
          type: inferred.type,
          raw: value,
          value: inferred.value,
          ...describe,
        })
        continue
      }
      default: {
        // BOOLEAN, EASING, whatever Figma adds next: the domain does not model
        // it, and that is visible, never silent (invariant 7).
        warn(
          'unsupported-variable-type',
          `${id} is a ${variable.resolvedType} variable, which Design CI does not model`,
        )
        continue
      }
    }
  }

  for (const style of input.paintStyles) {
    const path = toPath(style.name)
    if (path.length === 0) continue
    const id = path.join('.')
    const visible = style.paints.filter((paint) => paint.visible !== false)
    const solid = visible.find((paint): paint is ExportedSolidPaint => paint.type === 'SOLID')

    if (solid === undefined) {
      const kinds = visible.map((paint) => paint.type).join(', ') || 'no visible paints'
      warn('unsupported-paint', `${id} has no solid paint (${kinds}); it cannot be compared`, style.name)
      push({
        id: asTokenId(id),
        sourceId: source.id,
        path,
        type: 'unknown',
        raw: kinds,
        value: { kind: 'unnormalized', raw: kinds, reason: 'paint style with no solid paint' },
        ...(style.description ? { description: style.description } : {}),
      })
      continue
    }

    if (visible.length > 1) {
      warn('multiple-paints', `${id} has ${visible.length} paints; only the solid one is compared`, style.name)
    }

    const color = colorValue({ ...solid.color, a: solid.opacity ?? 1 })
    push({
      id: asTokenId(id),
      sourceId: source.id,
      path,
      type: 'color',
      raw: color.raw,
      value: color.value,
      ...(style.description ? { description: style.description } : {}),
    })
  }

  for (const style of input.textStyles) {
    const path = toPath(style.name)
    if (path.length === 0) continue
    const id = path.join('.')

    // The weight lives in the font style name. `normalizeFontWeight` knows the
    // common names; an italic suffix is stripped and retried before giving up.
    let weight = normalizeFontWeight(style.fontName.style)
    if (weight.kind !== 'fontWeight') {
      weight = normalizeFontWeight(style.fontName.style.replace(/\s*(italic|oblique)\s*/i, ' '))
    }
    if (weight.kind !== 'fontWeight' && !/^(italic|oblique)$/i.test(style.fontName.style.trim())) {
      warn(
        'unrecognized-font-style',
        `${id}: could not derive a weight from font style ${JSON.stringify(style.fontName.style)}`,
      )
    }

    const typographyInput: TypographyInput = {
      fontFamily: style.fontName.family,
      fontSize: `${style.fontSize}px`,
      ...(weight.kind === 'fontWeight' ? { fontWeight: weight.weight } : {}),
      ...(style.lineHeight.unit === 'AUTO'
        ? {}
        : {
            lineHeight:
              style.lineHeight.unit === 'PIXELS'
                ? `${style.lineHeight.value}px`
                : `${style.lineHeight.value}%`,
          }),
      ...(style.letterSpacing.value === 0
        ? {}
        : {
            letterSpacing:
              style.letterSpacing.unit === 'PIXELS'
                ? `${style.letterSpacing.value}px`
                : `${style.letterSpacing.value}%`,
          }),
    }

    const value = normalizeTypography(typographyInput)
    const raw = JSON.stringify(typographyInput)
    if (value.kind === 'unnormalized') {
      warn('unreadable-value', `${id}: ${value.reason}`, raw)
    }
    push({
      id: asTokenId(id),
      sourceId: source.id,
      path,
      type: 'typography',
      raw,
      value,
      ...(style.description ? { description: style.description } : {}),
    })
  }

  for (const style of input.effectStyles) {
    const path = toPath(style.name)
    if (path.length === 0) continue
    const id = path.join('.')

    const visible = style.effects.filter((effect) => effect.visible)
    const shadows = visible.filter(
      (effect): effect is ExportedShadowEffect =>
        effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW',
    )
    const others = visible.filter(
      (effect) => effect.type !== 'DROP_SHADOW' && effect.type !== 'INNER_SHADOW',
    )

    if (others.length > 0) {
      warn(
        'unsupported-effect',
        `${id} includes ${others.map((effect) => effect.type).join(', ')}, which Design CI does not model; only its shadows are compared`,
        style.name,
      )
    }
    if (shadows.length === 0) continue

    const px = (value: number): { kind: 'dimension'; raw: string; px: number; unit: 'px' } => ({
      kind: 'dimension',
      raw: String(value),
      px: round(value, 4),
      unit: 'px',
    })

    const layers = shadows.map((shadow) => ({
      offsetX: px(shadow.offset.x),
      offsetY: px(shadow.offset.y),
      blur: px(shadow.radius),
      spread: px(shadow.spread ?? 0),
      color: colorValue(shadow.color).value as Extract<NormalizedValue, { kind: 'color' }>,
      inset: shadow.type === 'INNER_SHADOW',
    }))

    const raw = JSON.stringify(
      shadows.map((shadow) => ({
        type: shadow.type,
        offset: shadow.offset,
        radius: shadow.radius,
        spread: shadow.spread ?? 0,
        color: hex({
          r: channel(shadow.color.r),
          g: channel(shadow.color.g),
          b: channel(shadow.color.b),
          a: round(shadow.color.a ?? 1, 4),
        }),
      })),
    )

    push({
      id: asTokenId(id),
      sourceId: source.id,
      path,
      type: 'shadow',
      raw,
      value: { kind: 'shadow', raw, layers },
      ...(style.description ? { description: style.description } : {}),
    })
  }

  return createSnapshot({ source, tokens, diagnostics })
}
