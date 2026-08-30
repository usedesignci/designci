/**
 * Canvas lint — the pure half of Design Check v2.
 *
 * Takes the serializable canvas shapes `collect.ts` reads off the current page
 * and judges them against the file's own tokens. Same architecture as
 * extraction (invariant 15): collect decides nothing, everything here is pure
 * and tested outside Figma.
 *
 * What "raw" means is binding state, never name matching (invariants 4/13): a
 * raw color is a visible solid paint with no bound variable and no paint
 * style. Suggestions come from VALUE equality against the file's tokens via
 * the core normalizer — "this exact value exists as color/brand/primary" is a
 * fact; a name-similarity guess would not be.
 *
 * Canvas findings never enter healthScore() (invariant 6): the health number
 * is the engine's, computed over token comparison. This is a pre-flight lint
 * for designers, reported alongside, not folded in.
 */

import {
  type CheckConfig,
  type ColorValue,
  type DesignSystemSnapshot,
  type Rgba,
  type Severity,
  ruleConfigFor,
  ruleId as asRuleId,
  tokenName,
} from '@designci/core'

import { aaThreshold, contrastRatio, passesAa } from './contrast.js'
import { contrastFix, nearestStep, type CanvasFix, type ColorTokenEntry } from './fix.js'
import { isIgnored } from './ignores.js'

/* ------------------------------------------------------------------ *
 * Serializable canvas shapes (produced by collect.ts, no decisions).
 * ------------------------------------------------------------------ */

export interface CanvasColor {
  readonly r: number
  readonly g: number
  readonly b: number
}

export interface CanvasSolidPaint {
  readonly type: 'SOLID'
  readonly color: CanvasColor
  readonly opacity?: number
  readonly visible?: boolean
  readonly bound?: boolean
}

export interface CanvasOtherPaint {
  readonly type: string
  readonly visible?: boolean
}

export type CanvasPaint = CanvasSolidPaint | CanvasOtherPaint

export interface CanvasLayoutData {
  readonly itemSpacing?: number
  readonly paddingTop?: number
  readonly paddingRight?: number
  readonly paddingBottom?: number
  readonly paddingLeft?: number
  /** Layout fields with a bound variable, e.g. ['itemSpacing', 'paddingTop']. */
  readonly boundFields: readonly string[]
}

export interface CanvasTextData {
  readonly fontSize: number | 'mixed'
  readonly fontWeight?: number | 'mixed'
}

export interface CanvasNodeData {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly visible: boolean
  readonly parentId?: string
  readonly fills?: readonly CanvasPaint[]
  readonly strokes?: readonly CanvasPaint[]
  /** Set when a fill style is applied; styled paint is not raw. */
  readonly hasFillStyle?: boolean
  readonly hasStrokeStyle?: boolean
  readonly cornerRadius?: number | 'mixed'
  readonly radiusBound?: boolean
  readonly layout?: CanvasLayoutData
  readonly text?: CanvasTextData
  readonly detached?: { readonly type: 'local' | 'library' }
  /** True inside an instance: children mirror the main component, not authored here. */
  readonly inInstance?: boolean
}

export interface CanvasComponentSet {
  readonly name: string
  readonly variantProperties: readonly { readonly name: string; readonly values: readonly string[] }[]
}

export interface ComponentInventory {
  readonly componentCount: number
  readonly sets: readonly CanvasComponentSet[]
}

export interface CanvasCollection {
  readonly pageName: string
  readonly nodes: readonly CanvasNodeData[]
}

/* ------------------------------------------------------------------ *
 * Findings.
 * ------------------------------------------------------------------ */

export type CanvasRuleId =
  | 'canvas-raw-color'
  | 'canvas-raw-spacing'
  | 'canvas-raw-radius'
  | 'canvas-detached-instance'
  | 'canvas-text-contrast'

export interface CanvasFinding {
  readonly code: CanvasRuleId
  readonly severity: Exclude<Severity, 'off'>
  /** Canonical value identity for grouped findings, e.g. '#ff6b6b' or '10px'. */
  readonly value?: string
  readonly message: string
  readonly nodes: readonly { readonly id: string; readonly name: string }[]
  /** Token names whose value equals — value matches, never name guesses. */
  readonly suggestions?: readonly string[]
  /** For scale rules: the allowed values, formatted, for structured display. */
  readonly scale?: readonly string[]
  /** One-click remedy, when one exists that invents nothing (see fix.ts). */
  readonly fix?: CanvasFix
}

export interface SkipNote {
  readonly code: CanvasRuleId
  readonly reason: string
  readonly nodeId: string
  readonly nodeName: string
}

export interface CanvasLintResult {
  readonly findings: readonly CanvasFinding[]
  /** Findings suppressed by ignores — counted, not hidden entirely. */
  readonly ignored: readonly CanvasFinding[]
  /** Nodes a rule could not judge confidently (invariant 7: visible, not silent). */
  readonly skipped: readonly SkipNote[]
}

export const CANVAS_RULE_IDS: readonly CanvasRuleId[] = [
  'canvas-raw-color',
  'canvas-raw-spacing',
  'canvas-raw-radius',
  'canvas-detached-instance',
  'canvas-text-contrast',
]

const DEFAULT_SEVERITY: Readonly<Record<CanvasRuleId, Severity>> = {
  'canvas-raw-color': 'warn',
  'canvas-raw-spacing': 'warn',
  'canvas-raw-radius': 'warn',
  'canvas-detached-instance': 'warn',
  'canvas-text-contrast': 'error',
}

/* ------------------------------------------------------------------ *
 * Helpers.
 * ------------------------------------------------------------------ */

const channel = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255)

function toRgba(paint: CanvasSolidPaint): Rgba {
  return {
    r: channel(paint.color.r),
    g: channel(paint.color.g),
    b: channel(paint.color.b),
    a: Math.round((paint.opacity ?? 1) * 10000) / 10000,
  }
}

function hex(rgba: Rgba): string {
  const pair = (n: number): string => n.toString(16).padStart(2, '0')
  const base = `#${pair(rgba.r)}${pair(rgba.g)}${pair(rgba.b)}`
  return rgba.a === 1 ? base : `${base}${pair(Math.round(rgba.a * 255))}`
}

function isVisibleSolid(paint: CanvasPaint): paint is CanvasSolidPaint {
  return paint.type === 'SOLID' && paint.visible !== false
}

/** Color tokens by canonical hex, for O(1) value-equality suggestions. */
function colorTokenIndex(snapshot: DesignSystemSnapshot): ReadonlyMap<string, string[]> {
  const index = new Map<string, string[]>()
  for (const token of snapshot.tokens) {
    if (token.value.kind !== 'color') continue
    const key = hex((token.value as ColorValue).rgba)
    const names = index.get(key)
    if (names) names.push(tokenName(token))
    else index.set(key, [tokenName(token)])
  }
  return index
}

/** Dimension token px values within a namespace (first path segment). */
function dimensionValues(snapshot: DesignSystemSnapshot, namespace: string): ReadonlyMap<number, string[]> {
  const index = new Map<number, string[]>()
  for (const token of snapshot.tokens) {
    if (token.value.kind !== 'dimension') continue
    if (token.path[0] !== namespace) continue
    const names = index.get(token.value.px)
    if (names) names.push(tokenName(token))
    else index.set(token.value.px, [tokenName(token)])
  }
  return index
}

interface Group {
  readonly value: string
  readonly nodes: { id: string; name: string }[]
  readonly suggestions: readonly string[]
}

/** The snap fix for an off-scale value: nearest step, bound to the token
 * holding it. The full-bleed 9999px "pill" step is excluded as a snap target —
 * snapping a 12px radius to a capsule would be a redesign, not a fix. */
function snapFix(
  value: string,
  index: ReadonlyMap<number, string[]>,
): { fix: CanvasFix } | Record<string, never> {
  const px = Number.parseFloat(value)
  if (Number.isNaN(px)) return {}
  const steps = [...index.keys()].filter((step) => step < 999)
  const nearest = nearestStep(px, steps)
  const variableName = nearest === undefined ? undefined : index.get(nearest)?.[0]
  if (nearest === undefined || variableName === undefined) return {}
  return { fix: { kind: 'snap-dimension', px: nearest, variableName } }
}

function groupBy(): {
  add: (value: string, node: CanvasNodeData, suggestions: readonly string[]) => void
  groups: () => Group[]
} {
  const map = new Map<string, Group>()
  return {
    add(value, node, suggestions) {
      const existing = map.get(value)
      if (existing) {
        if (!existing.nodes.some((entry) => entry.id === node.id)) {
          existing.nodes.push({ id: node.id, name: node.name })
        }
        return
      }
      map.set(value, { value, nodes: [{ id: node.id, name: node.name }], suggestions })
    },
    groups: () => [...map.values()],
  }
}

const SEVERITY_RANK: Readonly<Record<Exclude<Severity, 'off'>, number>> = {
  error: 0,
  warn: 1,
  info: 2,
}

/** Total ordering so identical canvases lint to identical output (invariant 1). */
function compareFindings(a: CanvasFinding, b: CanvasFinding): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  if (bySeverity !== 0) return bySeverity
  if (a.code !== b.code) return a.code < b.code ? -1 : 1
  const av = a.value ?? ''
  const bv = b.value ?? ''
  if (av !== bv) return av < bv ? -1 : 1
  const an = a.nodes[0]?.id ?? ''
  const bn = b.nodes[0]?.id ?? ''
  return an < bn ? -1 : an > bn ? 1 : 0
}

/* ------------------------------------------------------------------ *
 * The lint.
 * ------------------------------------------------------------------ */

export interface LintInput {
  readonly canvas: CanvasCollection
  readonly snapshot: DesignSystemSnapshot
  readonly config: CheckConfig
  readonly ignores: readonly string[]
}

export function lintCanvas(input: LintInput): CanvasLintResult {
  const { canvas, snapshot, config, ignores } = input

  const severityOf = (code: CanvasRuleId): Severity =>
    ruleConfigFor(config, asRuleId(code))?.severity ?? DEFAULT_SEVERITY[code]

  const enabled = (code: CanvasRuleId): boolean => severityOf(code) !== 'off'

  const findings: CanvasFinding[] = []
  const skipped: SkipNote[] = []

  const colors = colorTokenIndex(snapshot)
  const spacing = dimensionValues(snapshot, 'space')
  const radii = dimensionValues(snapshot, 'radius')
  const colorTokens: readonly ColorTokenEntry[] = snapshot.tokens
    .filter((token) => token.value.kind === 'color')
    .map((token) => ({ name: tokenName(token), rgba: (token.value as ColorValue).rgba }))
  const byId = new Map(canvas.nodes.map((node) => [node.id, node]))

  // Nodes inside instances mirror their main component; the fix belongs on the
  // component, so instance internals are excluded from authoring rules.
  const authored = canvas.nodes.filter((node) => node.visible && node.inInstance !== true)

  /* -- canvas-raw-color ------------------------------------------------ */
  if (enabled('canvas-raw-color')) {
    const groups = groupBy()
    for (const node of authored) {
      const paints: { list: readonly CanvasPaint[]; styled: boolean }[] = [
        { list: node.fills ?? [], styled: node.hasFillStyle === true },
        { list: node.strokes ?? [], styled: node.hasStrokeStyle === true },
      ]
      for (const { list, styled } of paints) {
        if (styled) continue
        for (const paint of list) {
          if (!isVisibleSolid(paint) || paint.bound === true) continue
          const value = hex(toRgba(paint))
          groups.add(value, node, colors.get(value) ?? [])
        }
      }
    }
    for (const group of groups.groups()) {
      const where = group.nodes.length === 1 ? '1 layer' : `${group.nodes.length} layers`
      findings.push({
        code: 'canvas-raw-color',
        severity: severityOf('canvas-raw-color') as Exclude<Severity, 'off'>,
        value: group.value,
        message:
          group.suggestions.length > 0
            ? `${group.value} is used raw on ${where}; its value exists as ${group.suggestions.join(', ')}`
            : `${group.value} is used raw on ${where} and matches no token in this file`,
        nodes: group.nodes,
        ...(group.suggestions.length > 0 ? { suggestions: group.suggestions } : {}),
        ...(group.suggestions[0] === undefined
          ? {}
          : { fix: { kind: 'bind-color', variableName: group.suggestions[0] } as CanvasFix }),
      })
    }
  }

  /* -- canvas-raw-spacing ---------------------------------------------- */
  if (enabled('canvas-raw-spacing')) {
    const groups = groupBy()
    const fields = ['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const
    for (const node of authored) {
      if (!node.layout) continue
      const bound = new Set(node.layout.boundFields)
      for (const field of fields) {
        const value = node.layout[field]
        if (value === undefined || value === 0 || bound.has(field)) continue
        // Off-system only: a value that equals a space token is not flagged —
        // unbound-but-on-system is a lower-stakes cleanup, not drift.
        if (spacing.has(value)) continue
        groups.add(`${value}px`, node, [])
      }
    }
    const scale = [...spacing.keys()].sort((a, b) => a - b).map((value) => `${value}px`)
    for (const group of groups.groups()) {
      findings.push({
        code: 'canvas-raw-spacing',
        severity: severityOf('canvas-raw-spacing') as Exclude<Severity, 'off'>,
        value: group.value,
        message:
          scale.length > 0
            ? `${group.value} spacing is not on the space scale`
            : `${group.value} spacing found, and this file defines no space tokens`,
        nodes: group.nodes,
        ...(scale.length > 0 ? { scale } : {}),
        ...snapFix(group.value, spacing),
      })
    }
  }

  /* -- canvas-raw-radius ------------------------------------------------ */
  if (enabled('canvas-raw-radius')) {
    const groups = groupBy()
    for (const node of authored) {
      if (node.cornerRadius === undefined || node.radiusBound === true) continue
      if (node.cornerRadius === 'mixed') {
        skipped.push({
          code: 'canvas-raw-radius',
          reason: 'mixed corner radii cannot be judged as one value',
          nodeId: node.id,
          nodeName: node.name,
        })
        continue
      }
      if (node.cornerRadius === 0 || radii.has(node.cornerRadius)) continue
      groups.add(`${node.cornerRadius}px`, node, [])
    }
    const scale = [...radii.keys()].sort((a, b) => a - b).map((value) => `${value}px`)
    for (const group of groups.groups()) {
      findings.push({
        code: 'canvas-raw-radius',
        severity: severityOf('canvas-raw-radius') as Exclude<Severity, 'off'>,
        value: group.value,
        message:
          scale.length > 0
            ? `${group.value} corner radius is not on the radius scale`
            : `${group.value} corner radius found, and this file defines no radius tokens`,
        nodes: group.nodes,
        ...(scale.length > 0 ? { scale } : {}),
        ...snapFix(group.value, radii),
      })
    }
  }

  /* -- canvas-detached-instance ----------------------------------------- */
  if (enabled('canvas-detached-instance')) {
    for (const node of authored) {
      if (!node.detached) continue
      findings.push({
        code: 'canvas-detached-instance',
        severity: severityOf('canvas-detached-instance') as Exclude<Severity, 'off'>,
        message: `"${node.name}" is a detached ${node.detached.type} component instance; it no longer receives component updates`,
        nodes: [{ id: node.id, name: node.name }],
      })
    }
  }

  /* -- canvas-text-contrast ---------------------------------------------- */
  if (enabled('canvas-text-contrast')) {
    for (const node of canvas.nodes) {
      if (node.type !== 'TEXT' || !node.visible) continue

      const skip = (reason: string): void => {
        skipped.push({ code: 'canvas-text-contrast', reason, nodeId: node.id, nodeName: node.name })
      }

      if (node.text === undefined) continue
      if (node.text.fontSize === 'mixed' || node.text.fontWeight === 'mixed') {
        skip('mixed font sizes or weights')
        continue
      }

      const textPaints = (node.fills ?? []).filter((paint) => paint.visible !== false)
      if (textPaints.length !== 1 || !isVisibleSolid(textPaints[0] as CanvasPaint)) {
        if (textPaints.length > 0) skip('text fill is not a single solid colour')
        continue
      }
      const textColor = toRgba(textPaints[0] as CanvasSolidPaint)
      if (textColor.a < 1) {
        skip('text fill is translucent; effective colour depends on what is behind it')
        continue
      }

      // Nearest ancestor with a confident, opaque solid fill.
      let background: Rgba | undefined
      let cursor = node.parentId === undefined ? undefined : byId.get(node.parentId)
      while (cursor) {
        const fills = (cursor.fills ?? []).filter((paint) => paint.visible !== false)
        if (fills.length > 0) {
          const top = fills[fills.length - 1] as CanvasPaint
          if (!isVisibleSolid(top)) {
            skip(`background of "${cursor.name}" is not a solid colour`)
            break
          }
          const rgba = toRgba(top)
          if (rgba.a < 1) {
            skip(`background of "${cursor.name}" is translucent`)
            break
          }
          background = rgba
          break
        }
        cursor = cursor.parentId === undefined ? undefined : byId.get(cursor.parentId)
      }
      if (background === undefined) continue

      const ratio = contrastRatio(textColor, background)
      const weight = node.text.fontWeight
      if (passesAa(ratio, node.text.fontSize, weight)) continue

      const remedy = contrastFix(textColor, background, node.text.fontSize, weight, colorTokens)
      findings.push({
        code: 'canvas-text-contrast',
        severity: severityOf('canvas-text-contrast') as Exclude<Severity, 'off'>,
        value: `${hex(textColor)} on ${hex(background)}`,
        message: `"${node.name}" has ${ratio}:1 contrast; WCAG AA needs ${aaThreshold(node.text.fontSize, weight)}:1 at ${node.text.fontSize}px`,
        nodes: [{ id: node.id, name: node.name }],
        fix: { kind: 'recolor-text', ...remedy },
      })
    }
  }

  const active: CanvasFinding[] = []
  const ignoredFindings: CanvasFinding[] = []
  for (const finding of findings) {
    if (isIgnored(finding, ignores)) ignoredFindings.push(finding)
    else active.push(finding)
  }

  return {
    findings: active.sort(compareFindings),
    ignored: ignoredFindings.sort(compareFindings),
    skipped: [...skipped].sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0)),
  }
}

/* ------------------------------------------------------------------ *
 * Scan display helpers.
 * ------------------------------------------------------------------ */

/** Display buckets for the scan tiles, derived from token type + namespace. */
export function tokenBreakdown(
  snapshot: DesignSystemSnapshot,
): { label: string; count: number }[] {
  const buckets = new Map<string, number>()
  const bump = (label: string): void => {
    buckets.set(label, (buckets.get(label) ?? 0) + 1)
  }
  for (const token of snapshot.tokens) {
    switch (token.type) {
      case 'color':
        bump('Colors')
        break
      case 'dimension':
        bump(token.path[0] === 'radius' ? 'Radii' : 'Spacing & sizes')
        break
      case 'typography':
      case 'fontFamily':
      case 'fontWeight':
        bump('Typography')
        break
      case 'shadow':
        bump('Shadows')
        break
      case 'duration':
        bump('Motion')
        break
      default:
        bump('Other')
    }
  }
  return [...buckets.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1))
}
