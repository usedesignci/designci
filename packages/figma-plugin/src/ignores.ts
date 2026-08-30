/**
 * Canvas ignores: drift a designer has accepted in this file.
 *
 * The plugin-side analogue of the CLI's baseline, deliberately simpler: a flat
 * list of keys stored in the document's plugin data, so the whole team shares
 * one accepted-set per file. Value-level keys (`canvas-raw-color|#ff6b6b`)
 * survive layer renames and re-draws — the same reasoning as the baseline's
 * fingerprints ignoring location. Node-level keys are for findings with no
 * value identity (a specific detached instance).
 *
 * Pure module: storage stays in main.ts (invariant 15 discipline — this file
 * decides, the sandbox reads and writes).
 */

/** Separator escaped so the key stays injective, as baseline fingerprints do. */
const SEPARATOR = '|'

function escape(part: string): string {
  return part.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

/** Value-level ignore: this rule, this canonical value, anywhere in the file. */
export function valueIgnoreKey(code: string, value: string): string {
  return [code, 'value', value].map(escape).join(SEPARATOR)
}

/** Node-level ignore: this rule on this specific node. */
export function nodeIgnoreKey(code: string, nodeId: string): string {
  return [code, 'node', nodeId].map(escape).join(SEPARATOR)
}

export interface Ignorable {
  readonly code: string
  readonly value?: string
  readonly nodes: readonly { readonly id: string }[]
}

/** The key that would suppress this finding — value-level when it has one. */
export function ignoreKeyFor(finding: Ignorable): string {
  if (finding.value !== undefined) return valueIgnoreKey(finding.code, finding.value)
  return nodeIgnoreKey(finding.code, finding.nodes[0]?.id ?? '')
}

export function isIgnored(finding: Ignorable, ignores: readonly string[]): boolean {
  const keys = new Set(ignores)
  if (finding.value !== undefined && keys.has(valueIgnoreKey(finding.code, finding.value))) {
    return true
  }
  // A node-level finding is ignored only when every node it points at is.
  return (
    finding.nodes.length > 0 &&
    finding.nodes.every((node) => keys.has(nodeIgnoreKey(finding.code, node.id)))
  )
}

/** Parses the stored JSON, tolerating an empty or corrupt value (never throws). */
export function parseIgnores(stored: string): string[] {
  if (stored.trim() === '') return []
  try {
    const decoded: unknown = JSON.parse(stored)
    if (!Array.isArray(decoded)) return []
    return decoded.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}
