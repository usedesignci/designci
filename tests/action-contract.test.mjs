/**
 * The action's contract test, run in the monorepo only (it needs the engine;
 * the action/ staging tree itself stays dependency-free and is copied to
 * usedesignci/designci-action verbatim).
 *
 * Feeds a REAL CheckResult — the corpus stylesheet checked against the corpus
 * Figma variant — through the action's formatter. If the wire format the
 * engine emits drifts from what the action reads, this breaks here, in the
 * repo where the change happened, not in a consumer's PR.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { allRules, parseCss, runCheck, sourceId } from '../packages/core/dist/index.js'
import * as corpus from '../packages/core/dist/fixtures/small-system.js'
import { smallSystemCss } from '../packages/core/dist/fixtures/small-system-css.js'

import { toAnnotations, toOutputs, toSummary } from '../action/annotate.mjs'

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
assert.ok(css.ok, 'the corpus stylesheet must parse')

const result = runCheck({
  snapshots: [corpus.figmaSnapshot, css.value],
  rules: allRules,
  config: corpus.config,
})

test('annotates the real radius.lg drift at its real location', () => {
  const lines = toAnnotations(result)
  const mismatch = lines.find((line) => line.includes('token-value-mismatch'))
  assert.ok(mismatch, 'expected a mismatch annotation')
  const realLine =
    smallSystemCss.split('\n').findIndex((line) => line.includes('--radius-lg')) + 1
  assert.match(
    mismatch,
    new RegExp(`^::error file=src/styles/tokens\\.css,line=${realLine},col=3,`),
  )
  assert.match(mismatch, /Suggested fix: Set radius\.lg to 8px$/)
})

test('annotates every unaccepted violation exactly once', () => {
  assert.equal(toAnnotations(result).length, result.counts.total)
})

test('summary and outputs read the real result shape', () => {
  const summary = toSummary(result)
  assert.match(summary, new RegExp(`health ${result.health.overall}%`))
  assert.match(summary, /`radius\.lg`/)
  assert.deepEqual(toOutputs(result), [
    `health=${result.health.overall}`,
    `violations=${result.counts.total}`,
    `baselined=0`,
  ])
})
