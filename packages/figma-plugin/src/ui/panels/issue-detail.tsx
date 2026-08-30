import type { CanvasFinding } from '../../lint.js'
import { ignoreKeyFor } from '../../ignores.js'
import { RULE_DOCS } from '../../rule-docs.js'
import { send } from '../state.js'

export interface IssueDetailProps {
  readonly finding: CanvasFinding
  readonly onBack: () => void
  readonly onRule: (ruleId: string) => void
}

export function IssueDetail(props: IssueDetailProps) {
  const { finding } = props
  const doc = RULE_DOCS[finding.code]

  return (
    <>
      <div class="panel-header">
        <button class="back" onClick={props.onBack} aria-label="Back">
          ←
        </button>
        <span class={`badge ${finding.severity}`}>{doc?.title ?? finding.code}</span>
      </div>

      {finding.value !== undefined && (
        <div class="value-chip">
          {finding.code === 'canvas-raw-color' && (
            <span class="swatch" style={`background:${finding.value}`} />
          )}
          {finding.value}
        </div>
      )}

      <p>{finding.message}</p>

      {finding.suggestions !== undefined && finding.suggestions.length > 0 && (
        <p class="muted">
          Same value as: <code>{finding.suggestions.join(', ')}</code> — bind instead of hardcoding.
        </p>
      )}

      <h2>Where</h2>
      <ul class="plain">
        {finding.nodes.map((node) => (
          <li key={node.id} class="layer-row">
            <span class="grow">{node.name}</span>
            <button class="small" onClick={() => send({ type: 'select-nodes', ids: [node.id] })}>
              Select
            </button>
          </li>
        ))}
      </ul>
      {finding.nodes.length > 1 && (
        <p>
          <button
            class="small"
            onClick={() => send({ type: 'select-nodes', ids: finding.nodes.map((node) => node.id) })}
          >
            Select all {finding.nodes.length}
          </button>
        </p>
      )}

      <h2>Actions</h2>
      <div class="row">
        <button onClick={() => send({ type: 'add-ignore', key: ignoreKeyFor(finding) })}>
          Ignore {finding.value !== undefined ? 'this value' : 'this layer'}
        </button>
        <button onClick={() => send({ type: 'disable-rule', ruleId: finding.code })}>
          Disable rule
        </button>
        <button class="small" onClick={() => props.onRule(finding.code)}>
          About this rule
        </button>
      </div>
      <p class="footer-note">
        Ignores are stored in this file and shared with the team. Disabling a rule sets its
        severity to “off” in the check config.
      </p>
    </>
  )
}
