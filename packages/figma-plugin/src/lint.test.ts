import { describe, expect, it } from 'vitest'

import { emptyConfig, type CheckConfig } from '@designci/core'
import * as corpus from '../../core/src/fixtures/small-system.js'

import { valueIgnoreKey } from './ignores.js'
import { lintCanvas, tokenBreakdown, type LintInput } from './lint.js'
import { smallSystemCanvas } from './fixtures/small-system-canvas.js'

const base: LintInput = {
  canvas: smallSystemCanvas,
  snapshot: corpus.figmaSnapshot,
  config: emptyConfig,
  ignores: [],
}

const result = lintCanvas(base)
const codes = result.findings.map((finding) => `${finding.code}:${finding.value ?? ''}`)

describe('lintCanvas — the seeded issues, and only those', () => {
  it('finds exactly the six seeded issues', () => {
    expect(codes).toEqual([
      'canvas-text-contrast:#999999 on #ffffff',
      'canvas-detached-instance:',
      'canvas-raw-color:#123456',
      'canvas-raw-color:#ff6b00',
      'canvas-raw-radius:5px',
      'canvas-raw-spacing:10px',
    ])
  })

  it('groups a repeated raw color and suggests the value-equal token', () => {
    const orange = result.findings.find((finding) => finding.value === '#ff6b00')
    expect(orange?.nodes.map((node) => node.name)).toEqual(['Card', 'Chip'])
    expect(orange?.suggestions).toEqual(['color.brand.primary'])
    expect(orange?.message).toContain('color.brand.primary')
  })

  it('reports a raw color that matches nothing without inventing a suggestion', () => {
    const stroke = result.findings.find((finding) => finding.value === '#123456')
    expect(stroke?.suggestions).toBeUndefined()
    expect(stroke?.message).toContain('matches no token')
  })

  it('does not flag bound, styled, on-scale, invisible or in-instance values', () => {
    const flaggedNodes = result.findings.flatMap((finding) =>
      finding.nodes.map((node) => node.name),
    )
    for (const clean of ['Screen', 'Bound card', 'Hidden draft', 'Instance internals', 'Body']) {
      expect(flaggedNodes, `${clean} should not be flagged`).not.toContain(clean)
    }
    // Toolbar appears only for its off-scale gap, not the on-scale padding.
    expect(codes.filter((code) => code.startsWith('canvas-raw-spacing'))).toEqual([
      'canvas-raw-spacing:10px',
    ])
  })

  it('fails contrast with the ratio and threshold in the message', () => {
    const contrast = result.findings.find((finding) => finding.code === 'canvas-text-contrast')
    expect(contrast?.severity).toBe('error')
    expect(contrast?.message).toMatch(/2\.85:1/)
    expect(contrast?.message).toMatch(/4\.5:1/)
  })

  it('surfaces what it could not judge instead of staying silent (invariant 7)', () => {
    expect(
      result.skipped.map((note) => `${note.code}:${note.nodeName}`).sort(),
    ).toEqual(['canvas-raw-radius:Mixed corners', 'canvas-text-contrast:Watermark'])
  })
})

describe('lintCanvas — policy and determinism', () => {
  it('takes severity from config and off skips the rule (invariant 5)', () => {
    const config: CheckConfig = {
      ...emptyConfig,
      rules: {
        'canvas-raw-color': { severity: 'error' },
        'canvas-text-contrast': { severity: 'off' },
      },
    }
    const tuned = lintCanvas({ ...base, config })
    const colors = tuned.findings.filter((finding) => finding.code === 'canvas-raw-color')
    expect(colors.every((finding) => finding.severity === 'error')).toBe(true)
    expect(tuned.findings.some((finding) => finding.code === 'canvas-text-contrast')).toBe(false)
    expect(tuned.skipped.some((note) => note.code === 'canvas-text-contrast')).toBe(false)
  })

  it('is order-independent over the node list (invariant 1)', () => {
    const shuffled = lintCanvas({
      ...base,
      canvas: { ...base.canvas, nodes: [...base.canvas.nodes].reverse() },
    })
    // Node order within a group follows document order, so compare identities.
    expect(shuffled.findings.map((finding) => `${finding.code}:${finding.value ?? ''}`)).toEqual(
      codes,
    )
  })

  it('moves ignored findings aside without deleting them', () => {
    const ignored = lintCanvas({
      ...base,
      ignores: [valueIgnoreKey('canvas-raw-color', '#ff6b00')],
    })
    expect(
      ignored.findings.some((finding) => finding.value === '#ff6b00'),
    ).toBe(false)
    expect(ignored.ignored.map((finding) => finding.value)).toEqual(['#ff6b00'])
    // The other raw color is untouched.
    expect(ignored.findings.some((finding) => finding.value === '#123456')).toBe(true)
  })

  it('lints an empty page to an empty result', () => {
    const empty = lintCanvas({ ...base, canvas: { pageName: 'Empty', nodes: [] } })
    expect(empty).toEqual({ findings: [], ignored: [], skipped: [] })
  })
})

describe('tokenBreakdown', () => {
  it('buckets the corpus tokens for the scan tiles, largest first', () => {
    expect(tokenBreakdown(corpus.figmaSnapshot)).toEqual([
      { label: 'Colors', count: 10 },
      { label: 'Spacing & sizes', count: 5 },
      { label: 'Radii', count: 4 },
      { label: 'Typography', count: 3 },
      { label: 'Shadows', count: 2 },
      { label: 'Motion', count: 1 },
    ])
  })
})
