import type { ScanPayload } from '../../messages.js'

export interface HomeProps {
  readonly scan: ScanPayload | null
  readonly scanning: boolean
  readonly exporting: boolean
  readonly exportNote: string
  readonly onScan: () => void
  readonly onExport: () => void
  readonly onViewRules: () => void
}

export function HomeTab(props: HomeProps) {
  const { scan } = props
  const issueCount =
    scan === null ? null : scan.canvas.findings.length + scan.result.counts.total

  return (
    <>
      <h1>Design CI</h1>
      <p class="sub">Keep this file and production in sync — everything runs locally.</p>

      {scan !== null && issueCount !== null && (
        <div class={`status-card ${issueCount === 0 ? 'good' : 'bad'}`}>
          {issueCount === 0 ? (
            <strong class="clean">No issues on “{scan.pageName}”.</strong>
          ) : (
            <strong>
              {issueCount} {issueCount === 1 ? 'issue' : 'issues'} on “{scan.pageName}” — design
              health {scan.result.health.overall}%
            </strong>
          )}
          <div class="muted">
            {scan.tokenCount} tokens · {scan.inventory.componentCount} components
            {scan.canvas.ignored.length > 0 ? ` · ${scan.canvas.ignored.length} ignored` : ''}
          </div>
        </div>
      )}

      <h2>Quick actions</h2>
      <ul class="plain">
        <li>
          <button class="list-row" onClick={props.onScan} disabled={props.scanning}>
            <span class="grow">
              <strong>{props.scanning ? 'Scanning…' : 'Run Design Check'}</strong>
              <br />
              <span class="muted">Tokens, duplicates and canvas issues on the current page</span>
            </span>
            <span class="chevron">›</span>
          </button>
        </li>
        <li>
          <button class="list-row" onClick={props.onExport} disabled={props.exporting}>
            <span class="grow">
              <strong>{props.exporting ? 'Exporting…' : 'Export snapshot'}</strong>
              <br />
              <span class="muted">figma.snapshot.json for CI — commit it like a lockfile</span>
            </span>
            <span class="chevron">›</span>
          </button>
        </li>
        <li>
          <button class="list-row" onClick={props.onViewRules}>
            <span class="grow">
              <strong>View scan results</strong>
              <br />
              <span class="muted">Issues, rules and token inventory</span>
            </span>
            <span class="chevron">›</span>
          </button>
        </li>
      </ul>

      {props.exportNote !== '' && <p class="ok-text">{props.exportNote}</p>}

      <p class="footer-note">
        No network access: nothing leaves Figma. The full design↔code comparison runs in CI with
        <code> npx designci check</code>.
      </p>
    </>
  )
}
