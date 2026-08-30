/**
 * The GitHub side of repo sync: commit the snapshot to the dedicated branch
 * and open (or reuse) the PR. The only module that talks to the network, and
 * it talks to exactly one host — https://api.github.com, the single entry on
 * the manifest's allowlist.
 *
 * `fetch` is injected so every path through here is tested against a scripted
 * fake; errors come back as typed results, never throws. The check path never
 * touches this module: sync is the handoff, not the check (invariant 2).
 */

import { parseSnapshot } from '@designci/core'

import { SYNC_BRANCH, snapshotHash, type SyncSettings } from '../sync.js'

const API = 'https://api.github.com'

/** The minimal fetch surface used, so tests can script it. */
export type FetchLike = (
  url: string,
  init?: {
    readonly method?: string
    readonly headers?: Readonly<Record<string, string>>
    readonly body?: string
  },
) => Promise<{ readonly status: number; json(): Promise<unknown> }>

export interface PushInput {
  readonly settings: SyncSettings
  readonly token: string
  /** The stamped export text, committed verbatim. */
  readonly json: string
  /** snapshotHash of the export — content identity, exportedAt excluded. */
  readonly localHash: string
  readonly commitMessage: string
  readonly prTitle: string
  readonly prBody: string
  readonly fetchFn?: FetchLike
}

export type PushResult =
  /** opened: committed and created the PR. updated: committed into the
   * existing open PR. unchanged: the repo copy already matches — no commit. */
  | { readonly kind: 'opened' | 'updated' | 'unchanged'; readonly prUrl?: string }
  | { readonly kind: 'error'; readonly message: string }

/* Base64 over UTF-8 without btoa's Latin-1 limit. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] as number
    const b = bytes[index + 1]
    const c = bytes[index + 2]
    out += B64[a >> 2] as string
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)] as string
    out += b === undefined ? '=' : (B64[((b & 15) << 2) | ((c ?? 0) >> 6)] as string)
    out += c === undefined ? '=' : (B64[c & 63] as string)
  }
  return out
}

export function decodeBase64(encoded: string): string {
  const clean = encoded.replace(/[^A-Za-z0-9+/]/g, '')
  const bytes: number[] = []
  for (let index = 0; index < clean.length; index += 4) {
    const chunk = [0, 1, 2, 3].map((offset) => {
      const char = clean[index + offset]
      return char === undefined ? -1 : B64.indexOf(char)
    })
    const [a, b, c, d] = chunk as [number, number, number, number]
    bytes.push((a << 2) | (b >> 4))
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2))
    if (d >= 0) bytes.push(((c & 3) << 6) | d)
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function pushSnapshot(input: PushInput): Promise<PushResult> {
  const { settings, token } = input
  const fetchFn = input.fetchFn ?? (fetch as unknown as FetchLike)
  const contentPath = settings.path.split('/').map(encodeURIComponent).join('/')

  const api = async (
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ status: number; data: unknown }> => {
    const response = await fetchFn(`${API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    })
    const data = await response.json().catch(() => undefined)
    return { status: response.status, data }
  }

  const failure = (step: string, status: number): PushResult => {
    if (status === 401) return { kind: 'error', message: 'GitHub rejected the token — it is invalid or expired. Save a new fine-grained token in Settings.' }
    if (status === 403) return { kind: 'error', message: `GitHub refused ${step} (403). The token likely lacks permission — it needs Contents and Pull requests read & write on this repo.` }
    if (status === 404) return { kind: 'error', message: `GitHub could not find the repo for ${step}. Check owner/repo in Settings, and that the token grants access to it.` }
    return { kind: 'error', message: `GitHub returned ${status} during ${step}.` }
  }

  const repoPath = `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`

  // 1. The repo itself: validates access and yields the default branch.
  const repo = await api(repoPath)
  if (repo.status !== 200 || !isRecord(repo.data)) return failure('reading the repo', repo.status)
  const base =
    settings.baseBranch ??
    (typeof repo.data['default_branch'] === 'string' ? repo.data['default_branch'] : 'main')

  // 2. The sync branch, created from base on first push.
  const branchRef = await api(`${repoPath}/git/ref/heads/${SYNC_BRANCH}`)
  if (branchRef.status === 404) {
    const baseRef = await api(`${repoPath}/git/ref/heads/${base}`)
    const baseSha =
      isRecord(baseRef.data) && isRecord(baseRef.data['object'])
        ? baseRef.data['object']['sha']
        : undefined
    if (baseRef.status !== 200 || typeof baseSha !== 'string') {
      return failure(`reading branch ${base}`, baseRef.status)
    }
    const created = await api(`${repoPath}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/heads/${SYNC_BRANCH}`, sha: baseSha },
    })
    if (created.status !== 201) return failure('creating the sync branch', created.status)
  } else if (branchRef.status !== 200) {
    return failure('reading the sync branch', branchRef.status)
  }

  const openPrUrl = async (): Promise<string | undefined> => {
    const pulls = await api(
      `${repoPath}/pulls?head=${encodeURIComponent(`${settings.owner}:${SYNC_BRANCH}`)}&state=open`,
    )
    if (pulls.status !== 200 || !Array.isArray(pulls.data)) return undefined
    const first: unknown = pulls.data[0]
    return isRecord(first) && typeof first['html_url'] === 'string' ? first['html_url'] : undefined
  }

  // 3. The current committed copy — identical content means no commit at all.
  const existing = await api(`${repoPath}/contents/${contentPath}?ref=${encodeURIComponent(SYNC_BRANCH)}`)
  let existingSha: string | undefined
  if (existing.status === 200 && isRecord(existing.data)) {
    const sha = existing.data['sha']
    const content = existing.data['content']
    if (typeof sha === 'string') existingSha = sha
    if (typeof content === 'string') {
      try {
        const parsed = parseSnapshot(JSON.parse(decodeBase64(content)))
        if (parsed.ok && snapshotHash(parsed.value) === input.localHash) {
          const prUrl = await openPrUrl()
          return { kind: 'unchanged', ...(prUrl === undefined ? {} : { prUrl }) }
        }
      } catch {
        // Unreadable committed copy: treat as changed and overwrite it.
      }
    }
  } else if (existing.status !== 404) {
    return failure('reading the committed snapshot', existing.status)
  }

  // 4. The commit.
  const put = await api(`${repoPath}/contents/${contentPath}`, {
    method: 'PUT',
    body: {
      message: input.commitMessage,
      content: encodeBase64(input.json),
      branch: SYNC_BRANCH,
      ...(existingSha === undefined ? {} : { sha: existingSha }),
    },
  })
  if (put.status !== 200 && put.status !== 201) return failure('committing the snapshot', put.status)

  // 5. The PR: reuse the open one, otherwise open it.
  const reused = await openPrUrl()
  if (reused !== undefined) return { kind: 'updated', prUrl: reused }

  const created = await api(`${repoPath}/pulls`, {
    method: 'POST',
    body: { title: input.prTitle, body: input.prBody, head: SYNC_BRANCH, base },
  })
  if (created.status !== 201 || !isRecord(created.data)) {
    return failure('opening the pull request', created.status)
  }
  const prUrl = created.data['html_url']
  return { kind: 'opened', ...(typeof prUrl === 'string' ? { prUrl } : {}) }
}
