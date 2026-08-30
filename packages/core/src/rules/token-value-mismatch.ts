/**
 * token-value-mismatch — a mapped pair of tokens whose values disagree.
 *
 * This is the product's central check: Figma says the radius is 8px, the
 * stylesheet ships 6px. Comparison goes through the normalizer, so a hex in one
 * source and an `rgb()` in the other is not a finding (invariant 3), and the two
 * tokens are only compared because config said they are the same decision
 * (invariant 4).
 */

import { ruleId } from '../domain/ids.js'
import type { Rule, RuleContext } from '../domain/rule.js'
import { tokenName } from '../domain/token.js'
import type { RuleFinding } from '../domain/violation.js'
import { formatValue, isComparable, valuesEqual } from '../normalize/index.js'

export const tokenValueMismatch: Rule = {
  id: ruleId('token-value-mismatch'),
  category: 'tokens',
  description: 'Mapped tokens must resolve to the same value in design and code.',
  defaultSeverity: 'error',

  check(context: RuleContext): readonly RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const snapshot of context.designSnapshots) {
      for (const token of snapshot.tokens) {
        if (!isComparable(token.value)) continue

        for (const mapped of context.resolveMapping(snapshot.source.id, token.id)) {
          // Only design-to-code pairs are reported, and only once per pair: the
          // mapping index is symmetric, so walking design sources alone covers
          // every pair without double-reporting it from the other side.
          const target = context.getSnapshot(mapped.sourceId)
          if (!target || target.source.role !== 'code') continue
          if (!isComparable(mapped.token.value)) continue
          if (valuesEqual(token.value, mapped.token.value)) continue

          findings.push({
            code: 'value-mismatch',
            message: `${tokenName(mapped.token)} is ${formatValue(mapped.token.value)} in ${
              target.source.label
            } but ${formatValue(token.value)} in ${snapshot.source.label}`,
            // Reported against the code source: that is the file an author
            // opens to fix it.
            sourceId: mapped.sourceId,
            tokenId: mapped.tokenId,
            tokenName: tokenName(mapped.token),
            ...(mapped.token.location === undefined ? {} : { location: mapped.token.location }),
            actual: mapped.token.raw,
            expected: token.raw,
            relatedSourceId: snapshot.source.id,
            relatedTokenId: token.id,
            // The canonical form, not `raw`: Figma writes a radius as the bare
            // number "6", and "Set radius.control to 6" is not a usable fix.
            // The wrote/expected fields still quote the raws (invariant 8).
            suggestion: `Set ${tokenName(mapped.token)} to ${formatValue(token.value)}`,
          })
        }
      }
    }

    return findings
  },
}
