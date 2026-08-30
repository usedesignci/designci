import { RULE_DOCS } from '../../rule-docs.js'
import { Icon } from '../icons.js'

export interface RuleDetailProps {
  readonly ruleId: string
  readonly onBack: () => void
}

export function RuleDetail(props: RuleDetailProps) {
  const doc = RULE_DOCS[props.ruleId]

  return (
    <>
      <div class="panel-header">
        <button class="back" onClick={props.onBack} aria-label="Back">
          <Icon name="chevron-left" size={16} />
        </button>
        <h1>{doc?.title ?? props.ruleId}</h1>
      </div>

      {doc === undefined ? (
        <p class="muted">No documentation for {props.ruleId}.</p>
      ) : (
        <div class="doc">
          <h2>Rule</h2>
          <p>{doc.rule}</p>
          <h2>Why</h2>
          <p>{doc.why}</p>
          <h2>How to fix</h2>
          <p>{doc.howToFix}</p>
        </div>
      )}

      <p class="footer-note">
        Severity is policy: set <code>"rules": {'{'} "{props.ruleId}": "error" {'}'}</code> in the
        check config to change how this rule reports.{' '}
        <a
          href={`https://github.com/usedesignci/designci/blob/main/docs/rules.md#${props.ruleId}`}
          target="_blank"
          rel="noreferrer"
        >
          Full docs ›
        </a>
      </p>
    </>
  )
}
