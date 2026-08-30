/**
 * Standalone tests for the annotation formatter — plain `node --test`, no
 * dependencies, so the action repo needs no toolchain at all.
 *
 * The fixture is a hand-built CheckResult. It documents the wire contract from
 * the consumer's side; the designci monorepo additionally runs a contract test
 * that feeds a real engine result through these functions.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { escapeData, escapeProperty, toAnnotations, toOutputs, toSummary } from './annotate.mjs'

const violation = (overrides = {}) => ({
  ruleId: 'token-value-mismatch',
  severity: 'error',
  code: 'value-mismatch',
  message: 'radius.lg is 6px in tokens.css but 8px in Figma',
  sourceId: 'css',
  tokenName: 'radius.lg',
  location: { file: 'src/styles/tokens.css', line: 18, column: 3 },
  suggestion: 'Set radius.lg to 8px',
  ...overrides,
})

const result = (overrides = {}) => ({
  schemaVersion: 1,
  violations: [violation()],
  counts: { error: 1, warn: 0, info: 0, total: 1 },
  baselinedCounts: { error: 0, warn: 0, info: 0, total: 0 },
  staleBaselineEntries: [],
  diagnostics: [],
  health: { overall: 97, checkedUnits: 50, weightedViolations: 1 },
  skippedRules: [],
  ...overrides,
})

test('escapes workflow-command data and properties', () => {
  assert.equal(escapeData('a%b\nc'), 'a%25b%0Ac')
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc')
})

test('renders an error annotation with file, line, column and title', () => {
  const [line] = toAnnotations(result())
  assert.equal(
    line,
    '::error file=src/styles/tokens.css,line=18,col=3,title=Design CI%3A token-value-mismatch::' +
      'radius.lg is 6px in tokens.css but 8px in Figma%0ASuggested fix: Set radius.lg to 8px',
  )
})

test('maps severities to workflow commands', () => {
  const lines = toAnnotations(
    result({
      violations: [
        violation({ severity: 'error' }),
        violation({ severity: 'warn' }),
        violation({ severity: 'info' }),
      ],
    }),
  )
  assert.deepEqual(
    lines.map((line) => line.split(' ')[0]),
    ['::error', '::warning', '::notice'],
  )
})

test('skips baselined violations in annotations but counts them in the summary', () => {
  const output = result({
    violations: [violation({ baselined: true })],
    counts: { error: 0, warn: 0, info: 0, total: 0 },
    baselinedCounts: { error: 1, warn: 0, info: 0, total: 1 },
  })
  assert.deepEqual(toAnnotations(output), [])
  assert.match(toSummary(output), /1 accepted violation in the baseline/)
})

test('prefixes annotation paths with the working directory', () => {
  const [line] = toAnnotations(result(), 'apps/web')
  assert.match(line, /file=apps\/web\/src\/styles\/tokens\.css,/)
  const [unprefixed] = toAnnotations(result(), '.')
  assert.match(unprefixed, /file=src\/styles\/tokens\.css,/)
})

test('a violation without a location still annotates, without file properties', () => {
  const [line] = toAnnotations(result({ violations: [violation({ location: undefined })] }))
  assert.match(line, /^::error title=/)
})

test('summary carries health, counts, drift and stale-baseline guidance', () => {
  const summary = toSummary(
    result({
      staleBaselineEntries: [{ fingerprint: 'x', ruleId: 'r', code: 'c', sourceId: 's' }],
    }),
  )
  assert.match(summary, /## 🔴 Design CI/)
  assert.match(summary, /(?:🟩){10} \*\*97%\*\*/u)
  assert.match(summary, /\| \*\*unaccepted\*\* \| 1 \| 0 \| 0 \| \*\*1\*\* \|/)
  assert.match(summary, /\*\*error\*\* `radius\.lg`/)
  assert.match(summary, /`src\/styles\/tokens\.css:18`/)
  assert.match(summary, /1 baseline entry no longer match/)
  assert.match(summary, /--update-baseline/)
})

test('a clean result summarizes as no drift', () => {
  const summary = toSummary(
    result({ violations: [], counts: { error: 0, warn: 0, info: 0, total: 0 } }),
  )
  assert.match(summary, /## 🟢 Design CI/)
  assert.match(summary, /\*\*No unaccepted drift\*\*/)
})

test('outputs expose health and both counts', () => {
  assert.deepEqual(toOutputs(result()), ['health=97', 'violations=1', 'baselined=0'])
})
