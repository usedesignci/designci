import { describe, expect, it } from 'vitest'

import * as corpus from '../../core/src/fixtures/small-system.js'

import { tokenBreakdown } from './lint.js'
import {
  buildCommitMessage,
  buildPrBody,
  buildPrTitle,
  parseSyncSettings,
  snapshotHash,
} from './sync.js'

const snapshot = corpus.figmaSnapshot

describe('snapshotHash', () => {
  it('is stable across key order and JSON round trips', () => {
    const roundTripped = JSON.parse(JSON.stringify(snapshot))
    const reordered = { tokens: snapshot.tokens, source: snapshot.source, schemaVersion: 1, diagnostics: [] }
    expect(snapshotHash(roundTripped)).toBe(snapshotHash(snapshot))
    expect(snapshotHash(reordered as typeof snapshot)).toBe(snapshotHash(snapshot))
  })

  it('ignores exportedAt: a re-export with identical tokens is not a change', () => {
    const stamped = { ...snapshot, exportedAt: '2026-08-30T12:00:00.000Z' }
    const restamped = { ...snapshot, exportedAt: '2026-09-15T08:30:00.000Z' }
    expect(snapshotHash(stamped)).toBe(snapshotHash(snapshot))
    expect(snapshotHash(restamped)).toBe(snapshotHash(stamped))
  })

  it('changes when any token value changes', () => {
    const first = snapshot.tokens[0]
    if (first === undefined) throw new Error('corpus is empty')
    const edited = {
      ...snapshot,
      tokens: [{ ...first, raw: `${first.raw} ` }, ...snapshot.tokens.slice(1)],
    }
    expect(snapshotHash(edited)).not.toBe(snapshotHash(snapshot))
  })
})

describe('parseSyncSettings', () => {
  it('parses stored settings and fills the default path', () => {
    expect(parseSyncSettings('{"owner":"acme","repo":"web"}')).toEqual({
      owner: 'acme',
      repo: 'web',
      path: 'design/figma.snapshot.json',
    })
    expect(
      parseSyncSettings('{"owner":"acme","repo":"web","path":"tokens/f.json","baseBranch":"dev"}'),
    ).toEqual({ owner: 'acme', repo: 'web', path: 'tokens/f.json', baseBranch: 'dev' })
  })

  it('returns undefined for absent or malformed storage, never throws', () => {
    expect(parseSyncSettings('')).toBeUndefined()
    expect(parseSyncSettings('not json')).toBeUndefined()
    expect(parseSyncSettings('{"owner":""}')).toBeUndefined()
    expect(parseSyncSettings('[1,2]')).toBeUndefined()
  })
})

describe('push copy', () => {
  it('writes the commit message with the token count', () => {
    expect(buildCommitMessage(snapshot)).toBe('design: update figma.snapshot.json (25 tokens)')
  })

  it('writes a PR body with the breakdown and what a failure means', () => {
    const body = buildPrBody(snapshot, tokenBreakdown(snapshot))
    expect(buildPrTitle()).toBe('Design tokens update from Figma')
    expect(body).toContain('25 design tokens')
    expect(body).toContain('- Colors: 10')
    expect(body).toContain('designci check')
    expect(body).toContain('fix whichever side is wrong')
  })
})
