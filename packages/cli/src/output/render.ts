/**
 * Terminal rendering. Pure string building — no process, no TTY probing — so
 * the exact output is testable. The caller decides whether colour is wanted.
 */

import {
  type CheckResult,
  type DesignSystemSnapshot,
  type ParseDiagnostic,
  type Violation,
  shouldFail,
} from '@designci/core'

export interface RenderOptions {
  readonly color: boolean
  readonly projectName?: string
}

const CODES = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
} as const

type Paint = (text: string, code: keyof typeof CODES) => string

function painter(color: boolean): Paint {
  return color ? (text, code) => `${CODES[code]}${text}${CODES.reset}` : (text) => text
}

const MARKS = { error: '✕', warn: '⚠', info: 'ℹ' } as const
const COLORS = { error: 'red', warn: 'yellow', info: 'cyan' } as const

function renderViolation(violation: Violation, paint: Paint): string {
  const lines: string[] = []
  const mark = paint(MARKS[violation.severity], COLORS[violation.severity])
  const suffix = violation.baselined === true ? paint(' (baselined)', 'dim') : ''
  const where =
    violation.location === undefined
      ? ''
      : paint(
          `  ${violation.location.file}${violation.location.line === undefined ? '' : `:${violation.location.line}`}`,
          'dim',
        )

  lines.push(`  ${mark} ${paint(violation.tokenName ?? violation.code, 'bold')}${suffix}${where}`)
  lines.push(`    ${violation.message}`)
  if (violation.actual !== undefined && violation.expected !== undefined) {
    lines.push(`      wrote:    ${violation.actual}`)
    lines.push(`      expected: ${violation.expected}`)
  }
  if (violation.suggestion !== undefined) {
    lines.push(paint(`      fix: ${violation.suggestion}`, 'dim'))
  }
  return lines.join('\n')
}

function renderDiagnostic(diagnostic: ParseDiagnostic, paint: Paint): string {
  const mark =
    diagnostic.severity === 'error' ? paint('✕', 'red') : paint('⚠', 'yellow')
  const where = diagnostic.location?.file ?? diagnostic.path ?? ''
  return `  ${mark} ${where === '' ? '' : `${where}: `}${diagnostic.message}`
}

/** The check report, in the shape the business plan documents. */
export function renderReport(
  result: CheckResult,
  snapshots: readonly DesignSystemSnapshot[],
  options: RenderOptions,
): string {
  const paint = painter(options.color)
  const lines: string[] = []

  lines.push(paint(`Design CI${options.projectName === undefined ? '' : ` — ${options.projectName}`}`, 'bold'))
  lines.push('')

  const totalTokens = snapshots.reduce((total, snapshot) => total + snapshot.tokens.length, 0)
  const flagged = new Set(
    result.violations
      .filter((violation) => violation.tokenId !== undefined)
      .map((violation) => `${violation.sourceId} ${violation.tokenId ?? ''}`),
  )
  lines.push(`  ${paint('✓', 'green')} ${totalTokens - flagged.size} of ${totalTokens} tokens clean`)

  const active = result.violations.filter((violation) => violation.baselined !== true)
  const baselined = result.violations.filter((violation) => violation.baselined === true)

  if (active.length > 0) {
    lines.push('')
    for (const violation of active) lines.push(renderViolation(violation, paint), '')
  }

  if (baselined.length > 0) {
    lines.push('')
    lines.push(paint(`  ${baselined.length} accepted in the baseline:`, 'dim'))
    for (const violation of baselined) {
      lines.push(
        paint(`  ${MARKS[violation.severity]} ${violation.tokenName ?? violation.code}`, 'dim'),
      )
    }
  }

  if (result.staleBaselineEntries.length > 0) {
    lines.push('')
    lines.push(`  ${paint('⚠', 'yellow')} ${result.staleBaselineEntries.length} baseline ${
      result.staleBaselineEntries.length === 1 ? 'entry' : 'entries'
    } no longer match anything — prune them:`)
    for (const entry of result.staleBaselineEntries) {
      lines.push(paint(`    ${entry.ruleId}: ${entry.tokenName ?? entry.fingerprint}`, 'dim'))
    }
  }

  if (result.diagnostics.length > 0) {
    lines.push('')
    lines.push(paint('  Parse diagnostics:', 'bold'))
    for (const diagnostic of result.diagnostics) lines.push(renderDiagnostic(diagnostic, paint))
  }

  lines.push('')
  const health = `Design health: ${result.health.overall}%`
  lines.push(
    `  ${shouldFail(result) ? paint(health, 'red') : paint(health, 'green')}${
      baselined.length > 0 ? paint('  (baselined drift still counts)', 'dim') : ''
    }`,
  )
  lines.push('')

  const summary =
    result.counts.total === 0
      ? paint('  No unaccepted drift.', 'green')
      : `  ${result.counts.error} ${paint('error', result.counts.error > 0 ? 'red' : 'dim')}${
          result.counts.error === 1 ? '' : 's'
        }, ${result.counts.warn} warning${result.counts.warn === 1 ? '' : 's'}, ${
          result.counts.info
        } info`
  lines.push(summary)

  return lines.join('\n')
}

/** Load-failure rendering: config errors, unreadable files. */
export function renderFailure(diagnostics: readonly ParseDiagnostic[], color: boolean): string {
  const paint = painter(color)
  const lines = [paint('Design CI could not run:', 'bold'), '']
  for (const diagnostic of diagnostics) lines.push(renderDiagnostic(diagnostic, paint))
  return lines.join('\n')
}
