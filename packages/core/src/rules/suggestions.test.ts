import { describe, expect, it } from 'vitest'

import { emptyConfig, type CheckConfig } from '../domain/config.js'
import { sourceId, tokenId } from '../domain/ids.js'
import { createSnapshot } from '../domain/snapshot.js'
import type { DesignToken } from '../domain/token.js'
import { normalizeDimension } from '../normalize/index.js'
import { runCheck } from '../runner/run.js'
import { allRules } from './index.js'

/**
 * Figma writes dimensions as bare numbers — a radius exports with raw "6".
 * Suggested fixes must render the canonical value ("6px"), because "Set
 * radius.control to 6" is not something anyone can paste into a stylesheet.
 * The wrote/expected fields still carry the raws (invariant 8).
 */

const FIGMA = sourceId('figma')
const CSS = sourceId('css')

function figmaDimension(name: string, raw: string): DesignToken {
  return {
    id: tokenId(name),
    sourceId: FIGMA,
    path: name.split('.'),
    type: 'dimension',
    raw,
    value: normalizeDimension(`${raw}px`),
  }
}

const design = createSnapshot({
  source: { id: FIGMA, kind: 'figma', role: 'design', label: 'Figma' },
  tokens: [figmaDimension('radius.control', '6'), figmaDimension('radius.orphan', '10')],
})

const code = createSnapshot({
  source: { id: CSS, kind: 'css', role: 'code', label: 'tokens.css' },
  tokens: [
    {
      id: tokenId('--radius-control'),
      sourceId: CSS,
      path: ['radius', 'control'],
      type: 'dimension',
      raw: '4px',
      value: normalizeDimension('4px'),
    },
  ],
})

const config: CheckConfig = {
  ...emptyConfig,
  mappings: [
    {
      from: { sourceId: FIGMA, tokenId: tokenId('radius.control') },
      to: { sourceId: CSS, tokenId: tokenId('--radius-control') },
    },
  ],
}

const result = runCheck({ snapshots: [design, code], rules: allRules, config })

describe('suggested fixes carry canonical values, never bare raws', () => {
  it('value-mismatch suggests the unit-complete value', () => {
    const mismatch = result.violations.find(
      (violation) => violation.ruleId === 'token-value-mismatch',
    )
    expect(mismatch?.suggestion).toBe('Set radius.control to 6px')
    // The raws stay quoted as written (invariant 8).
    expect(mismatch?.expected).toBe('6')
    expect(mismatch?.actual).toBe('4px')
  })

  it('missing-token suggests the unit-complete value', () => {
    const missing = result.violations.find((violation) => violation.ruleId === 'missing-token')
    expect(missing?.suggestion).toBe(
      'Define radius.orphan in tokens.css as 10px, or map it in your Design CI config',
    )
  })
})
