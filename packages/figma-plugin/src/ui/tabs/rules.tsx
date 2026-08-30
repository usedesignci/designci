/**
 * The Rules tab: every check the plugin can run, with its default severity.
 *
 * Severity shown here is the rule's default — actual severity is policy from
 * the check config (invariant 5), which the rule-detail panel explains.
 */

import { RULE_DOCS } from '../../rule-docs.js'

export interface RulesProps {
  readonly onRule: (ruleId: string) => void
}

export function RulesTab(props: RulesProps) {
  return (
    <>
      <h1>Rules</h1>
      <p class="sub">What Design CI checks, and how each issue is treated by default.</p>

      <ul class="card card-group">
        {Object.entries(RULE_DOCS).map(([ruleId, doc]) => (
          <li key={ruleId}>
            <button class="list-row" onClick={() => props.onRule(ruleId)}>
              <span class="grow">
                <strong>{doc.title}</strong>
                <span class="desc">{doc.rule}</span>
              </span>
              <span class={`badge ${doc.defaultSeverity}`}>{doc.defaultSeverity}</span>
              <span class="chevron">›</span>
            </button>
          </li>
        ))}
      </ul>

      <p class="footer-note">
        Severities are the defaults — the check config in Settings overrides them per rule, and
        “off” skips a rule entirely.
      </p>
    </>
  )
}
