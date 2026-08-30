/**
 * missing-token — a design token with no counterpart in a code source.
 *
 * Invariant 4 shapes what this rule can and cannot say. It reports "this token
 * has no mapping to <source>", not "this token is absent from <source>" — those
 * differ, and the engine can only know the first. A team that has genuinely
 * implemented the token but not declared the mapping fixes it by declaring the
 * mapping, which is the behaviour we want: equivalence is stated, never guessed.
 */

import { ruleId } from '../domain/ids.js'
import type { Rule, RuleContext } from '../domain/rule.js'
import type { DesignSystemSnapshot } from '../domain/snapshot.js'
import { tokenName } from '../domain/token.js'
import type { RuleFinding } from '../domain/violation.js'
import { formatValue } from '../normalize/index.js'

export const missingToken: Rule = {
  id: ruleId('missing-token'),
  category: 'tokens',
  description: 'Every design token must map to a token in each code source.',
  defaultSeverity: 'warn',

  check(context: RuleContext): readonly RuleFinding[] {
    const findings: RuleFinding[] = []
    const codeSnapshots: readonly DesignSystemSnapshot[] = context.codeSnapshots
    if (codeSnapshots.length === 0) return findings

    for (const snapshot of context.designSnapshots) {
      for (const token of snapshot.tokens) {
        const mappedSources = new Set(
          context
            .resolveMapping(snapshot.source.id, token.id)
            .map((mapped) => mapped.sourceId as string),
        )

        for (const code of codeSnapshots) {
          if (mappedSources.has(code.source.id)) continue

          findings.push({
            code: 'missing-token',
            message: `${tokenName(token)} is defined in ${snapshot.source.label} but has no counterpart in ${code.source.label}`,
            // Reported against the code source: the fix is to add the token
            // there, or to declare the mapping if it already exists.
            sourceId: code.source.id,
            tokenName: tokenName(token),
            expected: token.raw,
            relatedSourceId: snapshot.source.id,
            relatedTokenId: token.id,
            // Canonical form, not `raw`: a Figma radius raw is the bare "6",
            // which is no value to paste into a stylesheet.
            suggestion: `Define ${tokenName(token)} in ${code.source.label} as ${formatValue(token.value)}, or map it in your Design CI config`,
          })
        }
      }
    }

    return findings
  },
}
