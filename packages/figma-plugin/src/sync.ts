/**
 * Repo sync, the pure parts: knowing whether the repo's copy of the snapshot
 * is current, and the words a push writes into git.
 *
 * No Figma global, no network — main.ts stores and compares hashes, ui/github.ts
 * talks to GitHub, and both lean on this module so every judgment is testable.
 */

import type { DesignSystemSnapshot } from '@designci/core'

/** Where a push goes. Shared, non-secret — stored in the document's plugin
 * data so the whole team sees the same "current / behind" answer. The token is
 * deliberately NOT part of this shape; it lives per-user in clientStorage. */
export interface SyncSettings {
  readonly owner: string
  readonly repo: string
  /** Repo-relative path of the committed snapshot. */
  readonly path: string
  /** PR base; when absent the repo's default branch is used. */
  readonly baseBranch?: string
}

export const DEFAULT_SNAPSHOT_PATH = 'design/figma.snapshot.json'

/** The branch pushes commit to. One branch, one reused PR — never the default
 * branch: the PR is where the check runs and a human decides. */
export const SYNC_BRANCH = 'design-ci/snapshot'

/** Tolerant parse of stored settings JSON; undefined when absent/malformed. */
export function parseSyncSettings(stored: string): SyncSettings | undefined {
  try {
    const value: unknown = JSON.parse(stored)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const record = value as Record<string, unknown>
    const owner = record['owner']
    const repo = record['repo']
    const path = record['path']
    const baseBranch = record['baseBranch']
    if (typeof owner !== 'string' || owner === '') return undefined
    if (typeof repo !== 'string' || repo === '') return undefined
    return {
      owner,
      repo,
      path: typeof path === 'string' && path !== '' ? path : DEFAULT_SNAPSHOT_PATH,
      ...(typeof baseBranch === 'string' && baseBranch !== '' ? { baseBranch } : {}),
    }
  } catch {
    return undefined
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Content identity of a snapshot: what "the repo copy is current" compares.
 *
 * `exportedAt` is excluded on purpose — it is metadata about the act of
 * exporting, so a re-export with identical tokens must hash identically, or
 * every push would report itself out of date a second later.
 */
export function snapshotHash(snapshot: DesignSystemSnapshot): string {
  const { exportedAt: _exportedAt, ...content } = snapshot
  const text = stableStringify(content)
  // FNV-1a, 32-bit: tiny, dependency-free, and deterministic. This is a
  // change detector between two copies we hold, not a security boundary.
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildCommitMessage(snapshot: DesignSystemSnapshot): string {
  const count = snapshot.tokens.length
  return `design: update figma.snapshot.json (${count} token${count === 1 ? '' : 's'})`
}

export function buildPrTitle(): string {
  return 'Design tokens update from Figma'
}

export function buildPrBody(
  snapshot: DesignSystemSnapshot,
  breakdown: readonly { readonly label: string; readonly count: number }[],
): string {
  const rows = breakdown.map((entry) => `- ${entry.label}: ${entry.count}`).join('\n')
  return [
    `Snapshot of **${snapshot.tokens.length} design tokens**, pushed from the Design CI Figma plugin.`,
    '',
    rows,
    '',
    'The `designci check` on this PR compares these design decisions against the',
    'code sources in `designci.config.json`. If it fails, design and code disagree:',
    'fix whichever side is wrong, or merge to accept the design as stated.',
  ].join('\n')
}
