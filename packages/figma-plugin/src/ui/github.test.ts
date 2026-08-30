import { describe, expect, it } from 'vitest'

import * as corpus from '../../../core/src/fixtures/small-system.js'

import {
  buildCommitMessage,
  buildPrBody,
  buildPrTitle,
  snapshotHash,
  type SyncSettings,
} from '../sync.js'
import { tokenBreakdown } from '../lint.js'
import { decodeBase64, encodeBase64, pushSnapshot, type FetchLike, type PushInput } from './github.js'

const settings: SyncSettings = { owner: 'acme', repo: 'web', path: 'design/figma.snapshot.json' }
const snapshot = corpus.figmaSnapshot
const exportJson = JSON.stringify({ ...snapshot, exportedAt: '2026-08-30T12:00:00.000Z' }, null, 2)
const localHash = snapshotHash(snapshot)

interface Call {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: unknown
}

/** A scripted GitHub: `method url` -> response, recording every call. */
function fakeGitHub(routes: Record<string, { status: number; data?: unknown }>) {
  const calls: Call[] = []
  const fetchFn: FetchLike = (url, init) => {
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      url,
      headers: init?.headers ?? {},
      ...(init?.body === undefined ? {} : { body: JSON.parse(init.body) }),
    })
    const route = routes[`${method} ${url}`]
    if (route === undefined) throw new Error(`unscripted request: ${method} ${url}`)
    return Promise.resolve({ status: route.status, json: () => Promise.resolve(route.data) })
  }
  return { calls, fetchFn }
}

const REPO = 'https://api.github.com/repos/acme/web'
const routes = {
  repo: `GET ${REPO}`,
  syncRef: `GET ${REPO}/git/ref/heads/design-ci/snapshot`,
  mainRef: `GET ${REPO}/git/ref/heads/main`,
  createRef: `POST ${REPO}/git/refs`,
  contents: `GET ${REPO}/contents/design/figma.snapshot.json?ref=design-ci%2Fsnapshot`,
  put: `PUT ${REPO}/contents/design/figma.snapshot.json`,
  pulls: `GET ${REPO}/pulls?head=${encodeURIComponent('acme:design-ci/snapshot')}&state=open`,
  createPull: `POST ${REPO}/pulls`,
}

function input(fetchFn: FetchLike): PushInput {
  return {
    settings,
    token: 'ghp_test',
    json: exportJson,
    localHash,
    commitMessage: buildCommitMessage(snapshot),
    prTitle: buildPrTitle(),
    prBody: buildPrBody(snapshot, tokenBreakdown(snapshot)),
    fetchFn,
  }
}

describe('pushSnapshot', () => {
  it('first push: creates the branch, commits the file, opens the PR', async () => {
    const { calls, fetchFn } = fakeGitHub({
      [routes.repo]: { status: 200, data: { default_branch: 'main' } },
      [routes.syncRef]: { status: 404 },
      [routes.mainRef]: { status: 200, data: { object: { sha: 'base-sha' } } },
      [routes.createRef]: { status: 201, data: {} },
      [routes.contents]: { status: 404 },
      [routes.put]: { status: 201, data: {} },
      [routes.pulls]: { status: 200, data: [] },
      [routes.createPull]: { status: 201, data: { html_url: 'https://github.com/acme/web/pull/7' } },
    })

    const result = await pushSnapshot(input(fetchFn))
    expect(result).toEqual({ kind: 'opened', prUrl: 'https://github.com/acme/web/pull/7' })

    const createRef = calls.find((call) => `${call.method} ${call.url}` === routes.createRef)
    expect(createRef?.body).toEqual({ ref: 'refs/heads/design-ci/snapshot', sha: 'base-sha' })

    const put = calls.find((call) => call.method === 'PUT')
    expect(put?.body).toMatchObject({
      branch: 'design-ci/snapshot',
      message: 'design: update figma.snapshot.json (25 tokens)',
    })
    // No sha on a first commit of the file.
    expect((put?.body as Record<string, unknown>)['sha']).toBeUndefined()
    expect(decodeBase64((put?.body as Record<string, string>)['content'] as string)).toBe(exportJson)

    const createPull = calls.find((call) => `${call.method} ${call.url}` === routes.createPull)
    expect(createPull?.body).toMatchObject({ head: 'design-ci/snapshot', base: 'main' })

    // Every request is authenticated and stays on api.github.com.
    for (const call of calls) {
      expect(call.url.startsWith('https://api.github.com/')).toBe(true)
      expect(call.headers['Authorization']).toBe('Bearer ghp_test')
    }
  })

  it('re-push: updates the existing file with its sha and reuses the open PR', async () => {
    const stale = { ...snapshot, tokens: snapshot.tokens.slice(1) }
    const { calls, fetchFn } = fakeGitHub({
      [routes.repo]: { status: 200, data: { default_branch: 'main' } },
      [routes.syncRef]: { status: 200, data: { object: { sha: 'tip' } } },
      [routes.contents]: {
        status: 200,
        data: { sha: 'file-sha', content: encodeBase64(JSON.stringify(stale)) },
      },
      [routes.put]: { status: 200, data: {} },
      [routes.pulls]: { status: 200, data: [{ html_url: 'https://github.com/acme/web/pull/7' }] },
    })

    const result = await pushSnapshot(input(fetchFn))
    expect(result).toEqual({ kind: 'updated', prUrl: 'https://github.com/acme/web/pull/7' })
    const put = calls.find((call) => call.method === 'PUT')
    expect((put?.body as Record<string, unknown>)['sha']).toBe('file-sha')
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('identical committed content short-circuits: no commit, no new PR', async () => {
    // The committed copy carries a different exportedAt — still unchanged,
    // because content identity excludes the timestamp.
    const committed = JSON.stringify({ ...snapshot, exportedAt: '2026-01-01T00:00:00.000Z' })
    const { calls, fetchFn } = fakeGitHub({
      [routes.repo]: { status: 200, data: { default_branch: 'main' } },
      [routes.syncRef]: { status: 200, data: { object: { sha: 'tip' } } },
      [routes.contents]: { status: 200, data: { sha: 'file-sha', content: encodeBase64(committed) } },
      [routes.pulls]: { status: 200, data: [{ html_url: 'https://github.com/acme/web/pull/7' }] },
    })

    const result = await pushSnapshot(input(fetchFn))
    expect(result).toEqual({ kind: 'unchanged', prUrl: 'https://github.com/acme/web/pull/7' })
    expect(calls.some((call) => call.method === 'PUT' || call.method === 'POST')).toBe(false)
  })

  it('maps auth and access failures to actionable messages, never throws', async () => {
    const unauthorized = fakeGitHub({ [routes.repo]: { status: 401 } })
    const denied = await pushSnapshot(input(unauthorized.fetchFn))
    expect(denied.kind).toBe('error')
    expect(denied.kind === 'error' && denied.message).toContain('invalid or expired')

    const missing = fakeGitHub({ [routes.repo]: { status: 404 } })
    const notFound = await pushSnapshot(input(missing.fetchFn))
    expect(notFound.kind === 'error' && notFound.message).toContain('owner/repo')

    const forbidden = fakeGitHub({
      [routes.repo]: { status: 200, data: { default_branch: 'main' } },
      [routes.syncRef]: { status: 200, data: {} },
      [routes.contents]: { status: 404 },
      [routes.put]: { status: 403 },
    })
    const refused = await pushSnapshot(input(forbidden.fetchFn))
    expect(refused.kind === 'error' && refused.message).toContain('Contents and Pull requests')
  })

  it('respects a configured base branch over the repo default', async () => {
    const { calls, fetchFn } = fakeGitHub({
      [routes.repo]: { status: 200, data: { default_branch: 'main' } },
      [routes.syncRef]: { status: 404 },
      [`GET ${REPO}/git/ref/heads/develop`]: { status: 200, data: { object: { sha: 'dev-sha' } } },
      [routes.createRef]: { status: 201, data: {} },
      [routes.contents]: { status: 404 },
      [routes.put]: { status: 201, data: {} },
      [routes.pulls]: { status: 200, data: [] },
      [routes.createPull]: { status: 201, data: { html_url: 'https://github.com/acme/web/pull/9' } },
    })

    const result = await pushSnapshot({
      ...input(fetchFn),
      settings: { ...settings, baseBranch: 'develop' },
    })
    expect(result.kind).toBe('opened')
    const createPull = calls.find((call) => `${call.method} ${call.url}` === routes.createPull)
    expect((createPull?.body as Record<string, unknown>)['base']).toBe('develop')
  })
})

describe('base64 round trip', () => {
  it('handles unicode content', () => {
    const text = '{"family":"Škoda Sans","note":"– em dash — ✓"}'
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })
})
