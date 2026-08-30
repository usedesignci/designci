import type { ScanPayload } from '../../messages.js'
import { Icon } from '../icons.js'

export interface HomeProps {
  readonly scan: ScanPayload | null
  readonly scanning: boolean
  readonly exporting: boolean
  readonly exportNote: string
  readonly onScan: () => void
  readonly onExport: () => void
  readonly onViewResults: () => void
  readonly onViewRules: () => void
}

export function HomeTab(props: HomeProps) {
  const { scan } = props
  const canvasIssues = scan === null ? 0 : scan.canvas.findings.length
  const tokenIssues = scan === null ? 0 : scan.result.counts.total
  const issueCount = canvasIssues + tokenIssues

  return (
    <>
      <div class="brand-row">
        <span class="brand-mark">
          <Icon name="check-circle" size={16} />
        </span>
        <h1 style="flex: 1">Design CI</h1>
        <span class="beta">BETA</span>
      </div>
      <p class="sub">Keep this file and production in sync — everything runs locally.</p>

      <button class="primary" onClick={props.onScan} disabled={props.scanning}>
        {props.scanning ? 'Scanning…' : 'Run Design Check'}
      </button>

      {scan !== null && (
        <button
          class={`status-card ${issueCount === 0 ? 'good' : 'bad'}`}
          onClick={props.onViewResults}
        >
          <span class="status-icon">
            <Icon name={issueCount === 0 ? 'check-circle' : 'exclamation-triangle'} size={14} />
          </span>
          <span class="grow" style="flex: 1; min-width: 0">
            <span class="headline">
              {issueCount === 0 ? (
                <>No issues on “{scan.pageName}”</>
              ) : (
                <>
                  {canvasIssues > 0 &&
                    `${canvasIssues} canvas ${canvasIssues === 1 ? 'issue' : 'issues'}`}
                  {canvasIssues > 0 && tokenIssues > 0 && ' · '}
                  {tokenIssues > 0 &&
                    `${tokenIssues} token ${tokenIssues === 1 ? 'issue' : 'issues'}`}{' '}
                  on “{scan.pageName}”
                </>
              )}
            </span>
            <span class="meta">
              Tokens: {tokenIssues === 0 ? 'clean' : `${tokenIssues} issues`} · health{' '}
              {scan.result.health.overall}% · {scan.tokenCount} tokens ·{' '}
              {scan.inventory.componentCount} components
              {scan.canvas.ignored.length > 0 ? ` · ${scan.canvas.ignored.length} ignored` : ''}
            </span>
          </span>
          <span class="chevron">›</span>
        </button>
      )}

      <h2>Quick actions</h2>
      <ul class="card card-group">
        <li>
          <button class="list-row" onClick={props.onExport} disabled={props.exporting}>
            <span class="icon-tile">
              <Icon name="arrow-down-tray" size={15} />
            </span>
            <span class="grow">
              <strong>{props.exporting ? 'Exporting…' : 'Export snapshot'}</strong>
              <span class="desc">figma.snapshot.json for CI — commit it like a lockfile</span>
            </span>
            <span class="chevron">›</span>
          </button>
        </li>
        <li>
          <button class="list-row" onClick={props.onViewResults}>
            <span class="icon-tile">
              <Icon name="magnifying-glass" size={15} />
            </span>
            <span class="grow">
              <strong>View scan results</strong>
              <span class="desc">Issues, token inventory and components</span>
            </span>
            <span class="chevron">›</span>
          </button>
        </li>
        <li>
          <button class="list-row" onClick={props.onViewRules}>
            <span class="icon-tile">
              <Icon name="clipboard-document-list" size={15} />
            </span>
            <span class="grow">
              <strong>Browse rules</strong>
              <span class="desc">What gets checked, and how to fix each issue</span>
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
