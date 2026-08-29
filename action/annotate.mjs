/**
 * Turns a designci CheckResult into GitHub PR annotations, a job summary, and
 * step outputs. Formatting only — every judgment already happened in the CLI.
 *
 * Deliberately dependency-free plain Node: this file ships as the action, and
 * an action that needs an install step to format ten lines of output would be
 * heavier than the CLI it wraps. Pure functions here, I/O in main() below;
 * tests run with `node --test`.
 */

import { appendFileSync, readFileSync } from 'node:fs'

/**
 * Workflow-command escaping, per GitHub's rules: message data escapes %, CR
 * and LF; property values additionally escape : and ,.
 */
export function escapeData(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

export function escapeProperty(value) {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C')
}

const COMMAND_BY_SEVERITY = { error: 'error', warn: 'warning', info: 'notice' }

/**
 * One `::error file=…,line=…::message` line per unaccepted violation.
 *
 * Baselined violations get no annotation: they are accepted debt, and a wall
 * of annotations for drift the team already signed off on would train
 * reviewers to ignore the real ones. They still appear in the summary.
 *
 * Annotation paths are repo-root-relative, so a working-directory prefix is
 * folded in when the check ran in a subdirectory.
 */
export function toAnnotations(result, workdir = '.') {
  const prefix = workdir === '.' || workdir === '' ? '' : `${workdir.replace(/\/+$/, '')}/`
  const lines = []

  for (const violation of result.violations) {
    if (violation.baselined === true) continue

    const command = COMMAND_BY_SEVERITY[violation.severity] ?? 'notice'
    const properties = []
    if (violation.location?.file) {
      properties.push(`file=${escapeProperty(prefix + violation.location.file)}`)
      if (violation.location.line !== undefined) {
        properties.push(`line=${escapeProperty(violation.location.line)}`)
      }
      if (violation.location.column !== undefined) {
        properties.push(`col=${escapeProperty(violation.location.column)}`)
      }
    }
    properties.push(`title=${escapeProperty(`Design CI: ${violation.ruleId}`)}`)

    const message =
      violation.suggestion === undefined
        ? violation.message
        : `${violation.message}\nSuggested fix: ${violation.suggestion}`

    lines.push(`::${command} ${properties.join(',')}::${escapeData(message)}`)
  }

  return lines
}

const SUMMARY_LIMIT = 50

/** The job-summary markdown. Everything the terminal report says, for the PR. */
export function toSummary(result) {
  const active = result.violations.filter((violation) => violation.baselined !== true)
  const baselined = result.violations.length - active.length

  const lines = [
    `## Design CI — health ${result.health.overall}%`,
    '',
    `| | error | warn | info | total |`,
    `| --- | --- | --- | --- | --- |`,
    `| unaccepted | ${result.counts.error} | ${result.counts.warn} | ${result.counts.info} | ${result.counts.total} |`,
    `| baselined | ${result.baselinedCounts.error} | ${result.baselinedCounts.warn} | ${result.baselinedCounts.info} | ${result.baselinedCounts.total} |`,
    '',
  ]

  if (active.length > 0) {
    lines.push('### Drift')
    for (const violation of active.slice(0, SUMMARY_LIMIT)) {
      const where = violation.location?.file
        ? ` — \`${violation.location.file}${violation.location.line === undefined ? '' : `:${violation.location.line}`}\``
        : ''
      lines.push(`- **${violation.severity}** \`${violation.tokenName ?? violation.code}\`: ${violation.message}${where}`)
    }
    if (active.length > SUMMARY_LIMIT) {
      lines.push(`- …and ${active.length - SUMMARY_LIMIT} more`)
    }
    lines.push('')
  } else {
    lines.push('No unaccepted drift.', '')
  }

  if (baselined > 0) {
    lines.push(
      `${baselined} accepted ${baselined === 1 ? 'violation' : 'violations'} in the baseline still count against the health score.`,
      '',
    )
  }

  if (result.staleBaselineEntries.length > 0) {
    lines.push(
      `${result.staleBaselineEntries.length} baseline ${
        result.staleBaselineEntries.length === 1 ? 'entry' : 'entries'
      } no longer match anything — prune with \`designci check --update-baseline\`.`,
      '',
    )
  }

  if (result.diagnostics.length > 0) {
    lines.push('### Source diagnostics')
    for (const diagnostic of result.diagnostics.slice(0, SUMMARY_LIMIT)) {
      lines.push(`- \`${diagnostic.code}\`: ${diagnostic.message}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** `name=value` lines for $GITHUB_OUTPUT. */
export function toOutputs(result) {
  return [
    `health=${result.health.overall}`,
    `violations=${result.counts.total}`,
    `baselined=${result.baselinedCounts.total}`,
  ]
}

function main() {
  const [resultPath, annotations = 'true', workdir = '.'] = process.argv.slice(2)
  const result = JSON.parse(readFileSync(resultPath, 'utf8'))

  if (annotations !== 'false') {
    for (const line of toAnnotations(result, workdir)) process.stdout.write(`${line}\n`)
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) appendFileSync(summaryPath, `${toSummary(result)}\n`)

  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath) appendFileSync(outputPath, `${toOutputs(result).join('\n')}\n`)
}

if (process.argv[1] && import.meta.url.endsWith('annotate.mjs') && process.argv[1].endsWith('annotate.mjs')) {
  main()
}
