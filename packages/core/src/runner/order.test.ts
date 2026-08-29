import { describe, expect, it } from 'vitest'

import { ruleId, sourceId, tokenId } from '../domain/ids.js'
import type { Violation } from '../domain/violation.js'
import { canonicalize, compareViolations, sortViolations } from './order.js'

function violation(overrides: Partial<Violation> = {}): Violation {
  return {
    ruleId: ruleId('token-value-mismatch'),
    severity: 'error',
    code: 'value-mismatch',
    message: 'a message',
    sourceId: sourceId('css'),
    ...overrides,
  }
}

describe('compareViolations', () => {
  it('orders errors before warnings before info', () => {
    const sorted = sortViolations([
      violation({ severity: 'info' }),
      violation({ severity: 'error' }),
      violation({ severity: 'warn' }),
    ])
    expect(sorted.map((entry) => entry.severity)).toEqual(['error', 'warn', 'info'])
  })

  it('orders by source, then token name, then rule', () => {
    const sorted = sortViolations([
      violation({ sourceId: sourceId('figma'), tokenName: 'a' }),
      violation({ sourceId: sourceId('css'), tokenName: 'b' }),
      violation({ sourceId: sourceId('css'), tokenName: 'a' }),
    ])
    expect(sorted.map((entry) => `${entry.sourceId}/${entry.tokenName ?? ''}`)).toEqual([
      'css/a',
      'css/b',
      'figma/a',
    ])
  })

  it('orders by line and column within a file', () => {
    const at = (line: number, column: number): Violation =>
      violation({ location: { file: 'tokens.css', line, column } })
    const sorted = sortViolations([at(10, 1), at(2, 5), at(2, 1)])
    expect(sorted.map((entry) => [entry.location?.line, entry.location?.column])).toEqual([
      [2, 1],
      [2, 5],
      [10, 1],
    ])
  })

  it('sorts strings by code point, not by locale', () => {
    // A locale-aware comparison would order these differently on some systems;
    // a byte-identical result across machines requires code point order.
    const sorted = sortViolations([
      violation({ tokenName: 'a' }),
      violation({ tokenName: 'B' }),
      violation({ tokenName: 'Z' }),
    ])
    expect(sorted.map((entry) => entry.tokenName)).toEqual(['B', 'Z', 'a'])
  })

  it('is a total order: only identical violations compare equal', () => {
    const candidates: Violation[] = [
      violation(),
      violation({ code: 'other-code' }),
      violation({ message: 'another message' }),
      violation({ tokenId: tokenId('--a') }),
      violation({ tokenName: 'a' }),
      violation({ ruleId: ruleId('missing-token') }),
      violation({ severity: 'warn' }),
      violation({ sourceId: sourceId('figma') }),
      violation({ location: { file: 'a.css' } }),
      violation({ location: { file: 'a.css', line: 1 } }),
      violation({ actual: '6px' }),
      violation({ expected: '8px' }),
      violation({ suggestion: 'do the thing' }),
      violation({ relatedSourceId: sourceId('figma') }),
      violation({ relatedTokenId: tokenId('radius.lg') }),
    ]

    for (const [i, a] of candidates.entries()) {
      for (const [j, b] of candidates.entries()) {
        if (i === j) {
          expect(compareViolations(a, b)).toBe(0)
        } else {
          expect(compareViolations(a, b)).not.toBe(0)
        }
      }
    }
  })

  it('is antisymmetric', () => {
    const a = violation({ tokenName: 'a' })
    const b = violation({ tokenName: 'b' })
    expect(Math.sign(compareViolations(a, b))).toBe(-Math.sign(compareViolations(b, a)))
  })

  it('does not mutate its input', () => {
    const input = [violation({ severity: 'warn' }), violation({ severity: 'error' })]
    const snapshot = [...input]
    sortViolations(input)
    expect(input).toEqual(snapshot)
  })
})

describe('canonicalize', () => {
  it('serializes equal objects identically regardless of key order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }))
  })

  it('preserves array order, which is meaningful', () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]))
  })

  it('drops undefined values so an omitted key and an undefined key agree', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }))
  })
})
