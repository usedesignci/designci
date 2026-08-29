/**
 * `designci check` — the command CI runs.
 *
 * Exit codes are the contract the GitHub Action builds on:
 *   0  no unaccepted error-severity drift
 *   1  drift that should block the merge
 *   2  the check could not run at all (missing config, unreadable source)
 *
 * `--json` prints the CheckResult itself — byte-stable (invariant 1), so piping
 * it to a file yields a diffable artifact. The human report goes to stdout,
 * "could not run" failures to stderr.
 */

import { writeFile } from 'node:fs/promises'

import { allRules, createBaseline, runCheck, shouldFail } from '@designci/core'

import { renderFailure, renderReport } from '../output/render.js'
import { BASELINE_FILE, loadProject } from '../project.js'

export interface CheckOptions {
  readonly root: string
  readonly json: boolean
  readonly color: boolean
  readonly updateBaseline: boolean
  readonly write: (text: string) => void
  readonly writeError: (text: string) => void
}

export async function check(options: CheckOptions): Promise<number> {
  const loaded = await loadProject(options.root)
  if (!loaded.ok) {
    options.writeError(renderFailure(loaded.diagnostics, options.color))
    return 2
  }

  const { project } = loaded

  // A source that failed to load is a 2, not a passing check with fewer
  // sources: a check that silently compared less than it was asked to would
  // report green on a project it never actually checked.
  const loadErrors = project.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (loadErrors.length > 0) {
    options.writeError(renderFailure(loadErrors, options.color))
    return 2
  }

  const result = runCheck({
    snapshots: project.snapshots,
    rules: allRules,
    config: project.config,
    ...(project.baseline === undefined ? {} : { baseline: project.baseline }),
  })

  if (options.updateBaseline) {
    // Accept everything currently failing. Stale entries fall away because the
    // baseline is regenerated from what is actually violated now.
    const baseline = createBaseline(result.violations)
    await writeFile(project.baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
    options.write(
      `Wrote ${baseline.entries.length} accepted ${
        baseline.entries.length === 1 ? 'violation' : 'violations'
      } to ${BASELINE_FILE}`,
    )
    return 0
  }

  if (options.json) {
    options.write(JSON.stringify(result, null, 2))
  } else {
    options.write(
      renderReport(result, project.snapshots, {
        color: options.color,
        ...(project.config.name === undefined ? {} : { projectName: project.config.name }),
      }),
    )
  }

  return shouldFail(result) ? 1 : 0
}
