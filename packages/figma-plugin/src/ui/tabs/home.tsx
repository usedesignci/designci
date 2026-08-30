import type { ScanPayload } from '../../messages.js'
import { Icon } from '../icons.js'

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
  const canvasIssues = scan === null ? 0 : scan.canvas.findings.length
  const tokenIssues = scan === null ? 0 : scan.result.counts.total
  const issueCount = scan === null ? null : canvasIssues + tokenIssues

  return (
    <>
      <h1>Design CI</h1>
      <p class="sub">Keep this file and production in sync — everything runs locally.</p>

      {scan !== null && issueCount !== null && (
        <div class={`status-card ${issueCount === 0 ? 'good' : 'bad'}`}>
          <span class="headline">
            <Icon name={issueCount === 0 ? 'check-circle' : 'exclamation-triangle'} size={14} />
            {issueCount === 0 ? (
              <strong class="clean">No issues on “{scan.pageName}”.</strong>
            ) : (
              <strong>
                {canvasIssues > 0 &&
                  `${canvasIssues} canvas ${canvasIssues === 1 ? 'issue' : 'issues'}`}
                {canvasIssues > 0 && tokenIssues > 0 && ' · '}
                {tokenIssues > 0 &&
                  `${tokenIssues} token ${tokenIssues === 1 ? 'issue' : 'issues'}`}{' '}
                on “{scan.pageName}”
              </strong>
            )}
          </span>
          <div class="muted">
            Tokens: {tokenIssues === 0 ? 'clean' : `${tokenIssues} issues`} · health{' '}
            {scan.result.health.overall}% · {scan.tokenCount} tokens ·{' '}
            {scan.inventory.componentCount} components
            {scan.canvas.ignored.length > 0 ? ` · ${scan.canvas.ignored.length} ignored` : ''}
          </div>
        </div>
      )}

      <h2>Quick actions</h2>
      <ul class="plain">
        <li>
          <button class="list-row" onClick={props.onScan} disabled={props.scanning}>
            <Icon name="magnifying-glass" size={16} />
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
            <Icon name="arrow-down-tray" size={16} />
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
            <Icon name="clipboard-document-list" size={16} />
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
