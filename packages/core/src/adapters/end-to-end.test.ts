/**
 * The whole pipeline, on real input.
 *
 * Everything up to now has checked hand-built snapshots. This parses the corpus
 * stylesheet with the CSS adapter, checks it against the Figma variant using the
 * corpus config, and asserts it finds exactly the seeded drifts — so the
 * adapters, normalizer, mappings and runner are proven to agree on real text
 * rather than on data written to match.
 */

import { describe, expect, it } from 'vitest'

import type { CheckConfig } from '../domain/config.js'
import { sourceId } from '../domain/ids.js'
import type { Source } from '../domain/source.js'
import { smallSystemCss } from '../fixtures/small-system-css.js'
import * as fixture from '../fixtures/small-system.js'
import { allRules } from '../rules/index.js'
import { runCheck } from '../runner/run.js'
import { shouldFail } from '../domain/result.js'
import { parseCss } from './css.js'

const cssSource: Source = {
  id: fixture.CSS_SOURCE_ID,
  kind: 'css',
  role: 'code',
  label: 'tokens.css',
  origin: 'src/styles/tokens.css',
}

const parsed = parseCss(smallSystemCss, cssSource, { file: 'src/styles/tokens.css' })
if (!parsed.ok) throw new Error('the corpus stylesheet must parse')

/** The corpus config, unchanged: real config against real stylesheet text. */
const config: CheckConfig = fixture.config

const result = runCheck({
  snapshots: [fixture.figmaSnapshot, parsed.value],
  rules: allRules,
  config,
})

describe('checking a parsed stylesheet against the Figma variant', () => {
  it('finds the three seeded drifts, and nothing else that is drift', () => {
    expect(
      result.violations
        .filter((violation) => !(violation.tokenName ?? '').startsWith('type.'))
        .map((violation) => `${violation.ruleId}:${violation.tokenName ?? ''}`),
    ).toEqual([
      'token-value-mismatch:radius.lg',
      'missing-token:color.feedback.destructive',
      'duplicate-token:color.primary',
    ])
    expect(shouldFail(result)).toBe(true)
  })

  it('also reports the type ramp as missing, which is correct', () => {
    // Figma holds `type.body` as one typography composite; a stylesheet can only
    // express the ramp as separate properties, so no single custom property
    // exists for the mapping to point at. That is a real structural gap in the
    // pairing, and reporting it is the honest outcome — the alternative would be
    // to guess that three properties add up to one composite, which is exactly
    // the inference invariant 4 forbids.
    expect(
      result.violations
        .filter((violation) => (violation.tokenName ?? '').startsWith('type.'))
        .map((violation) => `${violation.ruleId}:${violation.tokenName ?? ''}`),
    ).toEqual([
      'missing-token:type.body',
      'missing-token:type.heading',
      'missing-token:type.mono',
    ])
  })

  it('points at the real line the drift is on', () => {
    // Straight from the scanner, not from hand-written fixture data.
    const mismatch = result.violations[0]
    expect(mismatch?.location).toMatchObject({ file: 'src/styles/tokens.css' })
    expect(smallSystemCss.split('\n')[(mismatch?.location?.line ?? 1) - 1]).toContain('--radius-lg')
  })

  it('does not flag any of the notation differences (invariant 3)', () => {
    // rgb() against hex, rem against px, a CSS shadow string against a Figma
    // shadow object, 0.15s against 150ms — every one of these is the same value
    // written differently, and every one of them reaching the report would be a
    // false positive.
    const flagged = new Set(result.violations.map((violation) => violation.tokenName))
    for (const name of [
      'color.brand.primary',
      'color.surface.default',
      'color.text.muted',
      'space.md',
      'space.lg',
      'shadow.sm',
      'shadow.md',
      'motion.fast',
    ]) {
      expect(flagged.has(name), `${name} should not be flagged`).toBe(false)
    }
  })

  it('surfaces the skipped dark-mode declaration as a diagnostic (invariant 7)', () => {
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'conditional-declaration',
    ])
  })

  it('stays deterministic end to end (invariant 1)', () => {
    // Parsed again from the same text, with the snapshots and rules in the
    // opposite order: the adapter must be deterministic too, not just the runner.
    const reparsed = parseCss(smallSystemCss, cssSource, { file: 'src/styles/tokens.css' })
    if (!reparsed.ok) throw new Error('the corpus stylesheet must parse')
    expect(JSON.stringify(reparsed.value)).toBe(JSON.stringify(parsed.value))

    const rerun = runCheck({
      snapshots: [reparsed.value, fixture.figmaSnapshot],
      rules: [...allRules].reverse(),
      config,
    })
    expect(JSON.stringify(rerun)).toBe(JSON.stringify(result))
  })
})
