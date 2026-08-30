import { describe, expect, it } from 'vitest'

import { ignoreKeyFor, isIgnored, nodeIgnoreKey, parseIgnores, valueIgnoreKey } from './ignores.js'

describe('ignore keys', () => {
  it('prefers value-level identity when the finding has one', () => {
    const finding = { code: 'canvas-raw-color', value: '#ff6b00', nodes: [{ id: '1:2' }] }
    expect(ignoreKeyFor(finding)).toBe(valueIgnoreKey('canvas-raw-color', '#ff6b00'))
  })

  it('falls back to node identity for findings without a value', () => {
    const finding = { code: 'canvas-detached-instance', nodes: [{ id: '1:7' }] }
    expect(ignoreKeyFor(finding)).toBe(nodeIgnoreKey('canvas-detached-instance', '1:7'))
  })

  it('stays injective across separator characters', () => {
    expect(valueIgnoreKey('a|b', 'c')).not.toBe(valueIgnoreKey('a', 'b|c'))
  })

  it('a value ignore suppresses the finding wherever it appears', () => {
    const finding = {
      code: 'canvas-raw-color',
      value: '#ff6b00',
      nodes: [{ id: '1:2' }, { id: '9:9' }],
    }
    expect(isIgnored(finding, [valueIgnoreKey('canvas-raw-color', '#ff6b00')])).toBe(true)
    expect(isIgnored(finding, [valueIgnoreKey('canvas-raw-color', '#000000')])).toBe(false)
  })

  it('a node ignore suppresses only when every node is covered', () => {
    const finding = { code: 'canvas-detached-instance', nodes: [{ id: '1:7' }, { id: '1:8' }] }
    expect(isIgnored(finding, [nodeIgnoreKey('canvas-detached-instance', '1:7')])).toBe(false)
    expect(
      isIgnored(finding, [
        nodeIgnoreKey('canvas-detached-instance', '1:7'),
        nodeIgnoreKey('canvas-detached-instance', '1:8'),
      ]),
    ).toBe(true)
  })

  it('parses stored ignores tolerantly — corrupt data never throws', () => {
    expect(parseIgnores('')).toEqual([])
    expect(parseIgnores('not json')).toEqual([])
    expect(parseIgnores('{"a":1}')).toEqual([])
    expect(parseIgnores('["a", 2, "b"]')).toEqual(['a', 'b'])
  })
})
