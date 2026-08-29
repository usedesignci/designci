/**
 * RuleContext construction.
 *
 * Everything a rule can see is assembled here, once, from the snapshots and
 * config. Rules receive only this object — which is what keeps invariant 1
 * (purity) enforceable by inspection rather than by trust.
 */

import type { CheckConfig, TokenMapping } from '../domain/config.js'
import type { SourceId, TokenId } from '../domain/ids.js'
import type { MappedToken, RuleContext } from '../domain/rule.js'
import type { DesignSystemSnapshot } from '../domain/snapshot.js'
import type { DesignToken } from '../domain/token.js'
import type { DimensionOptions } from '../normalize/dimension.js'

const key = (sourceId: SourceId, tokenId: TokenId): string => `${sourceId} ${tokenId}`

interface MappingTarget {
  readonly sourceId: SourceId
  readonly tokenId: TokenId
}

/**
 * Mappings are symmetric: declaring a Figma-to-CSS mapping also lets a rule walk
 * from CSS back to Figma. A drift is one fact, and which side you happen to be
 * standing on when you find it should not change whether the engine can see it.
 */
function buildMappingIndex(
  mappings: readonly TokenMapping[],
): ReadonlyMap<string, readonly MappingTarget[]> {
  const index = new Map<string, MappingTarget[]>()

  const add = (from: MappingTarget, to: MappingTarget): void => {
    const id = key(from.sourceId, from.tokenId)
    const existing = index.get(id)
    if (existing) {
      const already = existing.some(
        (entry) => entry.sourceId === to.sourceId && entry.tokenId === to.tokenId,
      )
      if (!already) existing.push(to)
      return
    }
    index.set(id, [to])
  }

  for (const mapping of mappings) {
    add(mapping.from, mapping.to)
    add(mapping.to, mapping.from)
  }

  return index
}

export interface ContextInput {
  readonly snapshots: readonly DesignSystemSnapshot[]
  readonly config: CheckConfig
  readonly options: Readonly<Record<string, unknown>>
}

export function createRuleContext(input: ContextInput): RuleContext {
  const snapshots = input.snapshots
  const bySource = new Map<SourceId, DesignSystemSnapshot>()
  const tokens = new Map<string, DesignToken>()

  for (const snapshot of snapshots) {
    bySource.set(snapshot.source.id, snapshot)
    for (const token of snapshot.tokens) tokens.set(key(snapshot.source.id, token.id), token)
  }

  const mappingIndex = buildMappingIndex(input.config.mappings)

  const dimensions: DimensionOptions =
    input.config.rootFontSizePx === undefined ? {} : { rootFontSizePx: input.config.rootFontSizePx }

  const getSnapshot = (sourceId: SourceId): DesignSystemSnapshot | undefined =>
    bySource.get(sourceId)

  const getToken = (sourceId: SourceId, tokenId: TokenId): DesignToken | undefined =>
    tokens.get(key(sourceId, tokenId))

  return {
    snapshots,
    designSnapshots: snapshots.filter((snapshot) => snapshot.source.role === 'design'),
    codeSnapshots: snapshots.filter((snapshot) => snapshot.source.role === 'code'),
    options: input.options,
    dimensions,
    getSnapshot,
    getToken,
    resolveMapping(sourceId: SourceId, tokenId: TokenId): readonly MappedToken[] {
      const targets = mappingIndex.get(key(sourceId, tokenId)) ?? []
      const resolved: MappedToken[] = []
      for (const target of targets) {
        const token = getToken(target.sourceId, target.tokenId)
        // A mapping pointing at a token that does not exist is not an error
        // here: the missing-token rule reports it, with the context to explain
        // it. Silently dropping it there would hide the drift entirely.
        if (token) resolved.push({ sourceId: target.sourceId, tokenId: target.tokenId, token })
      }
      return resolved
    },
  }
}
