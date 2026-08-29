/**
 * duplicate-token — two tokens in one source holding the same value.
 *
 * Duplicates are how a design system quietly forks: `--color-primary` and
 * `--color-brand-primary` are the same colour today, and in six months they are
 * not. Equality is decided by the normalizer, so a duplicate spelled `#FF6B00`
 * in one declaration and `rgb(255 107 0)` in another is still caught.
 *
 * The rule reports the *later* token of each group, keyed by declaration order
 * within the source, and names the first as the canonical one — so the finding
 * points at the token to delete, not the one to keep.
 */

import { ruleId } from '../domain/ids.js'
import type { Rule, RuleContext } from '../domain/rule.js'
import type { DesignToken } from '../domain/token.js'
import { tokenName } from '../domain/token.js'
import type { RuleFinding } from '../domain/violation.js'
import { formatValue, isComparable } from '../normalize/index.js'

/**
 * Groups by canonical value within a token namespace.
 *
 * `formatValue` is a total function over comparable values and equal values
 * format identically, which makes it a sound grouping key — and unlike a raw
 * string it groups `#FF6B00` with `rgb(255 107 0)`.
 *
 * The namespace — the first path segment — is part of the key because
 * `space.xs: 4px` and `radius.md: 4px` are not duplicates. They are two scales
 * that happen to meet at one value, and they will diverge the moment either
 * scale is retuned. Scoping is a comparison boundary, not a claim that two
 * tokens mean the same thing; nothing here infers equivalence by name.
 */
function groupKey(token: DesignToken): string {
  const namespace = token.path.length > 1 ? token.path[0] : ''
  return `${namespace}:${token.type}:${token.value.kind}:${formatValue(token.value)}`
}

export const duplicateToken: Rule = {
  id: ruleId('duplicate-token'),
  category: 'tokens',
  description: 'A source should not define the same value under two token names.',
  defaultSeverity: 'warn',

  check(context: RuleContext): readonly RuleFinding[] {
    const findings: RuleFinding[] = []

    for (const snapshot of context.snapshots) {
      const groups = new Map<string, DesignToken[]>()

      for (const token of snapshot.tokens) {
        if (!isComparable(token.value)) continue
        const key = groupKey(token)
        const existing = groups.get(key)
        if (existing) existing.push(token)
        else groups.set(key, [token])
      }

      for (const group of groups.values()) {
        if (group.length < 2) continue
        const [canonical, ...duplicates] = group as [DesignToken, ...DesignToken[]]

        for (const duplicate of duplicates) {
          findings.push({
            code: 'duplicate-value',
            message: `${tokenName(duplicate)} duplicates ${tokenName(canonical)} (both are ${formatValue(duplicate.value)})`,
            sourceId: snapshot.source.id,
            tokenId: duplicate.id,
            tokenName: tokenName(duplicate),
            ...(duplicate.location === undefined ? {} : { location: duplicate.location }),
            actual: duplicate.raw,
            expected: canonical.raw,
            relatedSourceId: snapshot.source.id,
            relatedTokenId: canonical.id,
            suggestion: `Alias ${tokenName(duplicate)} to ${tokenName(canonical)} or remove it`,
          })
        }
      }
    }

    return findings
  },
}
