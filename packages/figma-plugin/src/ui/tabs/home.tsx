import type { ScanPayload, SyncState } from '../../messages.js'
import type { PushState } from '../app.js'
import { Icon } from '../icons.js'

export interface HomeProps {
  readonly scan: ScanPayload | null
  readonly scanning: boolean
  readonly exporting: boolean
  readonly exportNote: string
  readonly sync: SyncState | null
  readonly push: PushState
  readonly onPush: () => void
  readonly onConnect: () => void
  readonly onScan: () => void
  readonly onExport: () => void
  readonly onViewResults: () => void
  readonly onViewRules: () => void
}

/** The repo-sync card: connect prompt, or current/behind with one-click push. */
function SyncCard(props: {
  readonly sync: SyncState
  readonly push: PushState
  readonly onPush: () => void
  readonly onConnect: () => void
}) {
  const { sync, push } = props
  const settings = sync.settings

  if (settings === undefined || !sync.hasToken) {
    return (
      <ul class="card card-group sync-card">
        <li>
          <button class="list-row" onClick={props.onConnect}>
            <span class="icon-tile">
              <Icon name="arrow-up-tray" size={15} />
            </span>
            <span class="grow">
              <strong>{settings === undefined ? 'Connect your repo' : 'Add your GitHub token'}</strong>
              <span class="desc">
                {settings === undefined
                  ? 'Open snapshot PRs from here with one click'
                  : `Pushes to ${settings.owner}/${settings.repo} need your own token — Settings → Repo sync`}
              </span>
            </span>
            <span class="chevron">›</span>
          </button>
        </li>
      </ul>
    )
  }

  const behind = sync.lastPushedHash === undefined || sync.lastPushedHash !== sync.currentHash
  const result = push.result
  const prUrl = result !== undefined && result.kind !== 'error' ? result.prUrl : undefined

  return (
    <div class={`card sync-card ${behind ? '' : 'sync-current'}`}>
      <div class="row">
        <span class={`status-icon ${behind ? 'behind' : 'current'}`}>
          <Icon name={behind ? 'arrow-up-tray' : 'check-circle'} size={13} />
        </span>
        <span class="grow" style="flex: 1; min-width: 0">
          <strong>
            {behind
              ? sync.lastPushedHash === undefined
                ? 'Snapshot not pushed yet'
                : 'Repo copy is behind'
              : 'Repo copy is up to date'}
          </strong>
          <span class="desc">
            {settings.owner}/{settings.repo} · {settings.path}
          </span>
        </span>
      </div>
      {behind && (
        <button class="primary" onClick={props.onPush} disabled={push.busy}>
          {push.busy ? 'Pushing…' : `Push update to ${settings.owner}/${settings.repo}`}
        </button>
      )}
      {result?.kind === 'error' && <p class="error-text sync-note">{result.message}</p>}
      {prUrl !== undefined && (
        <p class="sync-note">
          <a href={prUrl} target="_blank" rel="noreferrer">
            {result?.kind === 'opened' ? 'Pull request opened ›' : 'View the open pull request ›'}
          </a>
        </p>
      )}
    </div>
  )
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

      {props.sync !== null && (
        <SyncCard
          sync={props.sync}
          push={props.push}
          onPush={props.onPush}
          onConnect={props.onConnect}
        />
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

      {props.exportNote !== '' && (
        <div class="card export-next">
          <p class="ok-text">
            <Icon name="check-circle" size={14} /> {props.exportNote}
          </p>
          <p>
            Commit it to your repo — <code>design/figma.snapshot.json</code>, like a lockfile for
            design decisions. Then run <code>npx designci init</code> there: it finds your token
            sources and proposes mappings for you to confirm, and{' '}
            <code>npx designci check</code> catches drift from then on.
          </p>
        </div>
      )}

      <p class="footer-note">
        Checks run locally — nothing leaves Figma unless you push to your connected repo. The full
        design↔code comparison runs in CI with <code>npx designci check</code>.
      </p>
    </>
  )
}
