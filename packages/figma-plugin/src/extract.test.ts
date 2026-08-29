import { describe, expect, it } from 'vitest'

import {
  allRules,
  parseCss,
  parseSnapshot,
  runCheck,
  sourceId,
  valuesEqual,
} from '@designci/core'
import { smallSystemCss } from '../../core/src/fixtures/small-system-css.js'
import * as corpus from '../../core/src/fixtures/small-system.js'

import { extractSnapshot, type FigmaDocumentExport } from './extract.js'
import { smallSystemFigmaDocument } from './fixtures/small-system-figma.js'

const EMPTY: FigmaDocumentExport = {
  fileName: 'empty.fig',
  collections: [],
  variables: [],
  paintStyles: [],
  textStyles: [],
  effectStyles: [],
}

function document(overrides: Partial<FigmaDocumentExport>): FigmaDocumentExport {
  return { ...EMPTY, ...overrides }
}

const COLLECTION = {
  id: 'c1',
  name: 'Primitives',
  defaultModeId: 'm1',
  modes: [{ modeId: 'm1', name: 'Default' }],
}

describe('extractSnapshot — variables', () => {
  it('reads a COLOR variable into 8-bit sRGB with a hex raw', () => {
    const snapshot = extractSnapshot(
      document({
        collections: [COLLECTION],
        variables: [
          {
            id: 'v1',
            name: 'color/brand/primary',
            resolvedType: 'COLOR',
            scopes: ['ALL_SCOPES'],
            valuesByMode: { m1: { r: 1, g: 107 / 255, b: 0, a: 1 } },
            variableCollectionId: 'c1',
          },
        ],
      }),
    )
    expect(snapshot.tokens[0]).toMatchObject({
      id: 'color.brand.primary',
      path: ['color', 'brand', 'primary'],
      type: 'color',
      raw: '#ff6b00',
      value: { kind: 'color', rgba: { r: 255, g: 107, b: 0, a: 1 } },
    })
  })

  it('types a FLOAT by its declared scope, never its name (invariant 13)', () => {
    const variable = (name: string, scopes: string[], value: number) => ({
      id: name,
      name,
      resolvedType: 'FLOAT',
      scopes,
      valuesByMode: { m1: value },
      variableCollectionId: 'c1',
    })
    const snapshot = extractSnapshot(
      document({
        collections: [COLLECTION],
        variables: [
          variable('radius/lg', ['CORNER_RADIUS'], 8),
          variable('opacity/half', ['OPACITY'], 0.5),
          variable('weight/bold', ['FONT_WEIGHT'], 700),
          // Named like a length, scoped as nothing: stays a number.
          variable('space/mystery', ['ALL_SCOPES'], 4),
        ],
      }),
    )
    expect(snapshot.tokens.map((token) => [token.id, token.value.kind])).toEqual([
      ['radius.lg', 'dimension'],
      ['opacity.half', 'number'],
      ['weight.bold', 'fontWeight'],
      ['space.mystery', 'number'],
    ])
    expect(snapshot.tokens[0]?.value).toMatchObject({ px: 8, unit: 'px' })
  })

  it('infers a STRING variable type from its syntax, as the CSS adapter does', () => {
    const variable = (name: string, scopes: string[], value: string) => ({
      id: name,
      name,
      resolvedType: 'STRING',
      scopes,
      valuesByMode: { m1: value },
      variableCollectionId: 'c1',
    })
    const snapshot = extractSnapshot(
      document({
        collections: [COLLECTION],
        variables: [
          variable('motion/fast', ['ALL_SCOPES'], '150ms'),
          variable('font/sans', ['FONT_FAMILY'], 'Inter'),
          variable('easing/standard', ['ALL_SCOPES'], 'cubic-bezier(0.4, 0, 0.2, 1)'),
        ],
      }),
    )
    expect(snapshot.tokens.map((token) => token.value.kind)).toEqual([
      'duration',
      'fontFamily',
      'string',
    ])
  })

  it('exports only the default mode and says so (invariant 14 analogue)', () => {
    const snapshot = extractSnapshot(
      document({
        collections: [
          {
            id: 'c1',
            name: 'Theme',
            defaultModeId: 'light',
            modes: [
              { modeId: 'light', name: 'Light' },
              { modeId: 'dark', name: 'Dark' },
            ],
          },
        ],
        variables: [
          {
            id: 'v1',
            name: 'color/surface',
            resolvedType: 'COLOR',
            scopes: ['ALL_SCOPES'],
            valuesByMode: {
              light: { r: 1, g: 1, b: 1, a: 1 },
              dark: { r: 0, g: 0, b: 0, a: 1 },
            },
            variableCollectionId: 'c1',
          },
        ],
      }),
    )
    expect(snapshot.tokens[0]?.raw).toBe('#ffffff')
    expect(snapshot.diagnostics.map((d) => d.code)).toEqual(['multiple-modes'])
    expect(snapshot.diagnostics[0]?.message).toContain('"Light"')
  })

  it('keeps an alias unresolved, and reports a dangling one', () => {
    const snapshot = extractSnapshot(
      document({
        collections: [COLLECTION],
        variables: [
          {
            id: 'v1',
            name: 'color/brand/primary',
            resolvedType: 'COLOR',
            scopes: ['ALL_SCOPES'],
            valuesByMode: { m1: { r: 1, g: 0, b: 0 } },
            variableCollectionId: 'c1',
          },
          {
            id: 'v2',
            name: 'color/button/bg',
            resolvedType: 'COLOR',
            scopes: ['ALL_SCOPES'],
            valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v1' } },
            variableCollectionId: 'c1',
          },
          {
            id: 'v3',
            name: 'color/broken',
            resolvedType: 'COLOR',
            scopes: ['ALL_SCOPES'],
            valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'v-deleted' } },
            variableCollectionId: 'c1',
          },
        ],
      }),
    )
    expect(snapshot.tokens[1]?.value).toMatchObject({
      kind: 'alias',
      target: 'color.brand.primary',
    })
    expect(snapshot.tokens[2]?.value.kind).toBe('unnormalized')
    expect(snapshot.diagnostics.map((d) => d.code)).toEqual(['dangling-alias'])
  })

  it('surfaces unsupported variable types rather than skipping silently (invariant 7)', () => {
    const snapshot = extractSnapshot(
      document({
        collections: [COLLECTION],
        variables: [
          {
            id: 'v1',
            name: 'flags/new-nav',
            resolvedType: 'BOOLEAN',
            scopes: ['ALL_SCOPES'],
            valuesByMode: { m1: true },
            variableCollectionId: 'c1',
          },
        ],
      }),
    )
    expect(snapshot.tokens).toEqual([])
    expect(snapshot.diagnostics[0]).toMatchObject({ code: 'unsupported-variable-type' })
    expect(snapshot.diagnostics[0]?.message).toContain('BOOLEAN')
  })
})

describe('extractSnapshot — styles', () => {
  it('reads a text style as typography, deriving weight from the font style', () => {
    const snapshot = extractSnapshot(
      document({
        textStyles: [
          {
            id: 's1',
            name: 'type/heading',
            fontName: { family: 'Inter', style: 'Semi Bold Italic' },
            fontSize: 24,
            lineHeight: { unit: 'PERCENT', value: 125 },
            letterSpacing: { unit: 'PIXELS', value: 0 },
          },
        ],
      }),
    )
    const value = snapshot.tokens[0]?.value
    if (value?.kind !== 'typography') throw new Error('expected typography')
    expect(value.fontWeight?.weight).toBe(600)
    expect(value.fontSize?.px).toBe(24)
    // 125% collapses to the unitless multiple a stylesheet would write.
    expect(value.lineHeight).toMatchObject({ kind: 'number', value: 1.25 })
  })

  it('reads an effect style with two shadows as one two-layer token', () => {
    const snapshot = extractSnapshot(smallSystemFigmaDocument)
    const shadow = snapshot.tokens.find((token) => token.id === 'shadow.md')?.value
    if (shadow?.kind !== 'shadow') throw new Error('expected a shadow')
    expect(shadow.layers).toHaveLength(2)
    expect(shadow.layers[0]).toMatchObject({ blur: { px: 6 }, spread: { px: -1 }, inset: false })
  })

  it('reports a gradient paint style as uncomparable rather than guessing', () => {
    const snapshot = extractSnapshot(
      document({
        paintStyles: [
          { id: 'p1', name: 'brand/gradient', paints: [{ type: 'GRADIENT_LINEAR' }] },
        ],
      }),
    )
    expect(snapshot.tokens[0]?.value.kind).toBe('unnormalized')
    expect(snapshot.diagnostics[0]).toMatchObject({ code: 'unsupported-paint' })
  })

  it('reports a name collision and keeps the first token', () => {
    const snapshot = extractSnapshot(
      document({
        collections: [COLLECTION],
        variables: [
          {
            id: 'v1',
            name: 'brand/primary',
            resolvedType: 'COLOR',
            scopes: ['ALL_SCOPES'],
            valuesByMode: { m1: { r: 1, g: 0, b: 0 } },
            variableCollectionId: 'c1',
          },
        ],
        paintStyles: [
          {
            id: 'p1',
            name: 'brand/primary',
            paints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1 } }],
          },
        ],
      }),
    )
    expect(snapshot.tokens).toHaveLength(1)
    expect(snapshot.tokens[0]?.raw).toBe('#ff0000')
    expect(snapshot.diagnostics[0]).toMatchObject({ code: 'duplicate-token-name' })
  })
})

describe('the corpus document, extracted', () => {
  const snapshot = extractSnapshot(smallSystemFigmaDocument)

  it('yields the corpus 25 tokens with matching ids', () => {
    expect(snapshot.tokens).toHaveLength(25)
    expect([...snapshot.tokens.map((token) => token.id as string)].sort()).toEqual(
      [...corpus.figmaSnapshot.tokens.map((token) => token.id as string)].sort(),
    )
  })

  it('agrees with the hand-built Figma snapshot on every value', () => {
    const expected = new Map(corpus.figmaSnapshot.tokens.map((token) => [token.id, token]))
    for (const token of snapshot.tokens) {
      const other = expected.get(token.id)
      if (!other) throw new Error(`unexpected token ${token.id}`)
      expect(
        valuesEqual(token.value, other.value),
        `${token.id}: ${JSON.stringify(token.value)} vs ${JSON.stringify(other.value)}`,
      ).toBe(true)
    }
  })

  it('survives the wire format round trip (invariant 9)', () => {
    const parsed = parseSnapshot(JSON.parse(JSON.stringify(snapshot)))
    if (!parsed.ok) throw new Error('the exported snapshot must parse')
    expect(JSON.stringify(parsed.value)).toBe(JSON.stringify(snapshot))
  })

  it('checks against the corpus stylesheet and finds exactly the seeded drifts', () => {
    // The whole product pipeline in one assertion: plugin export on one side,
    // stylesheet scanner on the other, corpus config in between.
    const css = parseCss(
      smallSystemCss,
      {
        id: sourceId('css'),
        kind: 'css',
        role: 'code',
        label: 'tokens.css',
        origin: 'src/styles/tokens.css',
      },
      { file: 'src/styles/tokens.css' },
    )
    if (!css.ok) throw new Error('the corpus stylesheet must parse')

    const result = runCheck({
      snapshots: [snapshot, css.value],
      rules: allRules,
      config: corpus.config,
    })

    const drift = result.violations
      .filter((violation) => !(violation.tokenName ?? '').startsWith('type.'))
      .map((violation) => `${violation.ruleId}:${violation.tokenName ?? ''}`)
    expect(drift).toEqual([
      'token-value-mismatch:radius.lg',
      'missing-token:color.feedback.destructive',
      'duplicate-token:color.primary',
    ])
  })
})
