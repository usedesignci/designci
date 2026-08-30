import type { CanvasFinding } from '../../lint.js'
import type { ScanPayload } from '../../messages.js'
import type { Detail } from '../app.js'
import { Icon } from '../icons.js'
import { IssueDetail } from '../panels/issue-detail.js'
import { RuleDetail } from '../panels/rule-detail.js'

export interface ScanProps {
  readonly scan: ScanPayload | null
  readonly scanning: boolean
  readonly detail: Detail
  readonly onScan: () => void
  readonly onDetail: (detail: Detail) => void
}

const isColorValue = (finding: CanvasFinding): boolean =>
  finding.code === 'canvas-raw-color' && finding.value !== undefined

export function ScanTab(props: ScanProps) {
  const { scan, detail } = props

  if (detail?.kind === 'issue') {
    return <IssueDetail finding={detail.finding} onBack={() => props.onDetail(null)} onRule={(ruleId) => props.onDetail({ kind: 'rule', ruleId })} />
  }
  if (detail?.kind === 'rule') {
    return <RuleDetail ruleId={detail.ruleId} onBack={() => props.onDetail(null)} />
  }

  if (props.scanning) return <p class="sub">Scanning “current page”…</p>
  if (scan === null) {
    return (
      <>
        <h1>Scan</h1>
        <p class="sub">Discover tokens, components and issues on the current page.</p>
        <button class="primary" onClick={props.onScan}>
          Run Design Check
        </button>
      </>
    )
  }

  const canvasIssues = scan.canvas.findings.length
  const tokenIssues = scan.result.counts.total
  const issues = canvasIssues + tokenIssues

  return (
    <>
      <div class="row" style="justify-content: space-between; margin-bottom: 10px">
        <h1>“{scan.pageName}”</h1>
        <button class="small" onClick={props.onScan}>
          Re-scan
        </button>
      </div>

      <div class="tiles">
        <div class="tile">
          <Icon name="tag" size={14} />
          <span class="num">{scan.tokenCount}</span>
          <span class="muted">Tokens</span>
        </div>
        <div class="tile">
          <Icon name="squares-2x2" size={14} />
          <span class="num">{scan.inventory.componentCount}</span>
          <span class="muted">Components</span>
        </div>
        <div class={`tile ${issues > 0 ? 'bad' : ''}`}>
          <Icon name={issues > 0 ? 'exclamation-triangle' : 'check-circle'} size={14} />
          <span class="num">{issues}</span>
          <span class="muted">Issues</span>
        </div>
      </div>

      {issues === 0 && (
        <p class="clean">
          <Icon name="check-circle" size={14} /> No issues found. Ship it.
        </p>
      )}

      {canvasIssues > 0 && (
        <>
          <h2>Canvas issues</h2>
          <ul class="plain">
            {scan.canvas.findings.map((finding) => (
              <li key={`${finding.code}:${finding.value ?? finding.nodes[0]?.id}`}>
                <button class="list-row" onClick={() => props.onDetail({ kind: 'issue', finding })}>
                  <span class={`dot ${finding.severity}`} />
                  {isColorValue(finding) && (
                    <span class="swatch" style={`background:${finding.value ?? ''}`} />
                  )}
                  <span class="grow">{finding.value ?? finding.nodes[0]?.name}</span>
                  <span class="count">
                    {finding.nodes.length} {finding.nodes.length === 1 ? 'layer' : 'layers'}
                  </span>
                  <span class="chevron">›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tokenIssues > 0 && (
        <>
          <h2>Token issues · health {scan.result.health.overall}%</h2>
          {canvasIssues > 0 && (
            <p class="health-note">
              Canvas issues don't affect the health score — that number is the token comparison CI
              runs.
            </p>
          )}
          <ul class="plain">
            {scan.result.violations
              .filter((violation) => violation.baselined !== true)
              .map((violation) => (
                <li key={`${violation.ruleId}:${violation.tokenName ?? violation.code}`}>
                  <button
                    class="list-row"
                    onClick={() => props.onDetail({ kind: 'rule', ruleId: violation.ruleId })}
                  >
                    <span class={`dot ${violation.severity}`} />
                    <span class="grow">{violation.message}</span>
                    <span class="chevron">›</span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}

      <h2>Tokens discovered</h2>
      <ul class="plain">
        {scan.tokenBreakdown.map((bucket) => (
          <li key={bucket.label} class="layer-row">
            <span class="grow">{bucket.label}</span>
            <span class="count">{bucket.count}</span>
          </li>
        ))}
      </ul>

      {scan.inventory.sets.length > 0 && (
        <>
          <h2>Component sets</h2>
          <ul class="plain">
            {scan.inventory.sets.map((set) => (
              <li key={set.name} class="layer-row">
                <span class="grow">{set.name}</span>
                <span class="count">
                  {set.variantProperties.map((property) => property.name).join(', ') || '—'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {(scan.canvas.skipped.length > 0 || scan.canvas.ignored.length > 0) && (
        <p class="footer-note">
          {scan.canvas.ignored.length > 0 &&
            `${scan.canvas.ignored.length} ignored (manage in Settings). `}
          {scan.canvas.skipped.length > 0 &&
            `${scan.canvas.skipped.length} spots skipped — mixed values or non-solid colours the check will not guess about.`}
        </p>
      )}
    </>
  )
}
