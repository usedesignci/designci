/**
 * The corpus contract.
 *
 * These assertions are what make `small-system` usable as the shared test data
 * for every downstream milestone: the shape is pinned, the three seeded drifts
 * are pinned, and — most importantly — the notation differences that must *not*
 * produce findings are pinned too.
 */

import { describe, expect, it } from 'vitest'

import { tokenName } from '../domain/token.js'
import { allRules } from '../rules/index.js'
import { runCheck } from '../runner/run.js'
import * as fixture from './small-system.js'

const result = runCheck({
  snapshots: fixture.snapshots,
  rules: allRules,
  config: fixture.config,
})

describe('small-system corpus', () => {
  it('holds 25 tokens per source variant', () => {
    expect(fixture.figmaSnapshot.tokens).toHaveLength(25)
    expect(fixture.cssSnapshot.tokens).toHaveLength(25)
  })

  it('normalizes every token value', () => {
    for (const snapshot of fixture.snapshots) {
      for (const token of snapshot.tokens) {
        expect(
          token.value.kind,
          `${snapshot.source.label} ${tokenName(token)} did not normalize`,
        ).not.toBe('unnormalized')
      }
    }
  })

  it('keeps each token raw exactly as authored (invariant 8)', () => {
    const primary = fixture.figmaSnapshot.tokens.find(
      (token) => tokenName(token) === 'color.brand.primary',
    )
    const cssPrimary = fixture.cssSnapshot.tokens.find(
      (token) => tokenName(token) === 'color.brand.primary',
    )
    expect(primary?.raw).toBe('#FF6B00')
    expect(cssPrimary?.raw).toBe('rgb(255 107 0)')
  })

  it('maps every design token except the one seeded as missing (invariant 4)', () => {
    expect(fixture.mappings).toHaveLength(24)
    const mapped = new Set(fixture.mappings.map((mapping) => mapping.from.tokenId as string))
    expect(mapped.has('color.feedback.destructive')).toBe(false)
  })
})

describe('checking the corpus', () => {
  it('finds exactly the three seeded drifts', () => {
    expect(
      result.violations.map((violation) => `${violation.ruleId}:${violation.tokenName ?? ''}`),
    ).toEqual([
      'token-value-mismatch:radius.lg',
      'missing-token:color.feedback.destructive',
      'duplicate-token:color.primary',
    ])
  })

  it('does not flag notation differences (invariant 3)', () => {
    // Every other token pair differs in spelling — hex against rgb(), px against
    // rem, object shadows against CSS strings. A finding on any of them is a
    // false positive, the failure mode the normalizer exists to prevent.
    const flagged = new Set(result.violations.map((violation) => violation.tokenName))
    for (const name of ['color.brand.primary', 'space.md', 'type.body', 'shadow.md', 'motion.fast']) {
      expect(flagged.has(name), `${name} should not be flagged`).toBe(false)
    }
  })

  it('reports the value mismatch against the code source, with both sides', () => {
    const mismatch = result.violations.find(
      (violation) => violation.ruleId === 'token-value-mismatch',
    )
    expect(mismatch).toMatchObject({
      severity: 'error',
      sourceId: fixture.CSS_SOURCE_ID,
      tokenName: 'radius.lg',
      actual: '6px',
      expected: '8px',
      relatedSourceId: fixture.FIGMA_SOURCE_ID,
    })
    expect(mismatch?.location).toEqual({ file: 'src/styles/tokens.css', line: 18, column: 3 })
    expect(mismatch?.suggestion).toBe('Set radius.lg to 8px')
  })

  it('reports the missing token against the source that lacks it', () => {
    const missing = result.violations.find((violation) => violation.ruleId === 'missing-token')
    expect(missing).toMatchObject({
      severity: 'warn',
      sourceId: fixture.CSS_SOURCE_ID,
      tokenName: 'color.feedback.destructive',
      expected: '#DC2626',
    })
  })

  it('reports the duplicate against the repeat, naming the original', () => {
    const duplicate = result.violations.find((violation) => violation.ruleId === 'duplicate-token')
    expect(duplicate).toMatchObject({
      severity: 'warn',
      sourceId: fixture.CSS_SOURCE_ID,
      tokenName: 'color.primary',
      relatedTokenId: '--color-brand-primary',
    })
    // Spelled differently in the stylesheet, caught anyway.
    expect(duplicate?.actual).toBe('rgb(255 107 0)')
  })

  it('does not treat two scales meeting at one value as duplicates', () => {
    // space.xs and radius.md are both 4px. They are different scales.
    const names = result.violations.map((violation) => violation.tokenName)
    expect(names).not.toContain('radius.md')
    expect(names).not.toContain('space.xs')
  })

  it('scores health from the seeded drifts', () => {
    expect(result.counts).toEqual({ error: 1, warn: 2, info: 0, total: 3 })
    expect(result.health.checkedUnits).toBe(50)
    expect(result.health.overall).toBe(97)
  })
})
