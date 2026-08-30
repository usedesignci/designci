import { useState } from 'preact/hooks'

import { describeFix } from '../../fix.js'
import type { CanvasFinding } from '../../lint.js'
import { ignoreKeyFor } from '../../ignores.js'
import { RULE_DOCS } from '../../rule-docs.js'
import { Icon } from '../icons.js'
import { send } from '../state.js'

export interface IssueDetailProps {
  readonly finding: CanvasFinding
  readonly onBack: () => void
  readonly onRule: (ruleId: string) => void
}

export function IssueDetail(props: IssueDetailProps) {
  const { finding } = props
  const doc = RULE_DOCS[finding.code]
  const isColor = finding.code === 'canvas-raw-color'
  const [promoting, setPromoting] = useState(false)
  const [promoteName, setPromoteName] = useState(finding.promote?.name ?? '')

  const submitPromote = (): void => {
    if (finding.value === undefined || promoteName.trim() === '') return
    send({
      type: 'promote-value',
      code: finding.code,
      value: finding.value,
      nodes: finding.nodes.map((node) => node.id),
      name: promoteName.trim(),
    })
    props.onBack()
  }

  return (
    <>
      <div class="panel-header">
        <button class="back" onClick={props.onBack} aria-label="Back">
          <Icon name="chevron-left" size={16} />
        </button>
        <h1 class="grow">{doc?.title ?? finding.code}</h1>
        <span class={`badge ${finding.severity}`}>{finding.severity}</span>
      </div>

      <div class="finding-card">
        {finding.value !== undefined && (
          <div class="finding-value">
            {isColor && <span class="swatch large" style={`background:${finding.value}`} />}
            <code>{finding.value}</code>
          </div>
        )}
        <p class="finding-message">{finding.message}</p>

        {finding.scale !== undefined && (
          <div class="scale">
            <span class="scale-label">Scale</span>
            <div class="chips">
              {finding.scale.map((step) => (
                <span key={step} class="chip">
                  {step}
                </span>
              ))}
              <span class="chip off">{finding.value}</span>
            </div>
          </div>
        )}

        {finding.suggestions !== undefined && finding.suggestions.length > 0 && (
          <div class="suggestion">
            <Icon name="information-circle" size={13} />
            <span>
              Same value as <code>{finding.suggestions.join(', ')}</code> — bind it instead of
              hardcoding.
            </span>
          </div>
        )}
      </div>

      <div class="row section-head">
        <h2>
          {finding.nodes.length} {finding.nodes.length === 1 ? 'layer' : 'layers'}
        </h2>
        {finding.nodes.length > 1 && (
          <button
            class="small"
            onClick={() => send({ type: 'select-nodes', ids: finding.nodes.map((node) => node.id) })}
          >
            <Icon name="viewfinder-circle" size={12} /> Select all
          </button>
        )}
      </div>
      <ul class="plain layer-list">
        {finding.nodes.map((node) => (
          <li key={node.id} class="layer-row">
            <span class="grow">{node.name}</span>
            <button class="small" onClick={() => send({ type: 'select-nodes', ids: [node.id] })}>
              <Icon name="viewfinder-circle" size={12} /> Select
            </button>
          </li>
        ))}
      </ul>

      <div class="actions">
        {finding.fix !== undefined && (
          <button
            class="fix"
            onClick={() => {
              const fix = finding.fix
              if (fix === undefined) return
              send({
                type: 'apply-fix',
                code: finding.code,
                ...(finding.value === undefined ? {} : { value: finding.value }),
                nodes: finding.nodes.map((node) => node.id),
                fix,
              })
              props.onBack()
            }}
          >
            <Icon name="check-circle" size={13} />
            {describeFix(finding.fix)}
          </button>
        )}
        {finding.promote !== undefined && finding.value !== undefined && !promoting && (
          <button onClick={() => setPromoting(true)}>
            <Icon name="tag" size={13} />
            Create a variable from {finding.value}…
          </button>
        )}
        {promoting && (
          <div class="promote-form">
            <div class="field">
              <label>New variable name</label>
              <input
                type="text"
                value={promoteName}
                onInput={(event) => setPromoteName((event.target as HTMLInputElement).value)}
              />
            </div>
            <div class="row">
              <button class="fix" onClick={submitPromote} disabled={promoteName.trim() === ''}>
                <Icon name="tag" size={13} />
                Create &amp; bind {finding.nodes.length}{' '}
                {finding.nodes.length === 1 ? 'layer' : 'layers'}
              </button>
              <button onClick={() => setPromoting(false)}>Cancel</button>
            </div>
            <p class="footer-note">
              The proposed name comes from the value; rename it to what the decision means. Groups
              use “.” or “/”.
            </p>
          </div>
        )}
        <button onClick={() => send({ type: 'add-ignore', key: ignoreKeyFor(finding) })}>
          <Icon name="eye-slash" size={13} />
          Ignore {finding.value !== undefined ? 'this value' : 'this layer'}
        </button>
        <button onClick={() => send({ type: 'disable-rule', ruleId: finding.code })}>
          <Icon name="no-symbol" size={13} />
          Disable rule
        </button>
        <button onClick={() => props.onRule(finding.code)}>
          <Icon name="information-circle" size={13} />
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
