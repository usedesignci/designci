import { describe, expect, it } from 'vitest'

import { sourceId } from '../domain/ids.js'
import type { Source } from '../domain/source.js'
import { parseTokensJson } from './tokens-json.js'

const source: Source = {
  id: sourceId('tokens'),
  kind: 'tokens-json',
  role: 'design',
  label: 'tokens.json',
}

function parse(input: unknown) {
  const result = parseTokensJson(input, source)
  if (!result.ok) throw new Error('expected the document to parse')
  return result.value
}

describe('parseTokensJson', () => {
  it('reads a W3C token with a declared type', () => {
    const snapshot = parse({
      color: { brand: { primary: { $value: '#FF6B00', $type: 'color' } } },
    })
    expect(snapshot.tokens).toHaveLength(1)
    expect(snapshot.tokens[0]).toMatchObject({
      id: 'color.brand.primary',
      path: ['color', 'brand', 'primary'],
      type: 'color',
      raw: '#FF6B00',
    })
  })

  it('inherits $type from the enclosing group', () => {
    const snapshot = parse({
      space: { $type: 'dimension', sm: { $value: '8px' }, md: { $value: '16px' } },
    })
    expect(snapshot.tokens.map((token) => token.type)).toEqual(['dimension', 'dimension'])
  })

  it('lets a token override the group type', () => {
    const snapshot = parse({
      group: { $type: 'dimension', a: { $value: '#FF6B00', $type: 'color' } },
    })
    expect(snapshot.tokens[0]?.type).toBe('color')
  })

  it('reads the unprefixed Style Dictionary spelling', () => {
    const snapshot = parse({ space: { md: { value: '16px', type: 'dimension' } } })
    expect(snapshot.tokens[0]).toMatchObject({ type: 'dimension', raw: '16px' })
  })

  it('prefers the $ spelling when both are present', () => {
    const snapshot = parse({ a: { $value: '8px', value: '16px', $type: 'dimension' } })
    expect(snapshot.tokens[0]?.raw).toBe('8px')
  })

  it('infers a type when the document declares none', () => {
    const snapshot = parse({
      a: { $value: '#FF6B00' },
      b: { $value: '16px' },
      c: { $value: '150ms' },
    })
    expect(snapshot.tokens.map((token) => token.type)).toEqual(['color', 'dimension', 'duration'])
  })

  it('reads an alias without resolving it', () => {
    // An unresolvable reference must stay visible rather than become a value.
    const snapshot = parse({ a: { $value: '{color.brand.primary}', $type: 'color' } })
    expect(snapshot.tokens[0]?.value).toMatchObject({
      kind: 'alias',
      target: 'color.brand.primary',
    })
  })

  it('reads composite typography and shadow values', () => {
    const snapshot = parse({
      type: {
        body: {
          $type: 'typography',
          $value: { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400 },
        },
      },
      shadow: {
        sm: {
          $type: 'shadow',
          $value: { offsetX: '0', offsetY: '1px', blur: '2px', color: '#00000010' },
        },
      },
    })
    expect(snapshot.tokens[0]?.value.kind).toBe('typography')
    expect(snapshot.tokens[1]?.value.kind).toBe('shadow')
  })

  it('carries $description and $deprecated through', () => {
    const snapshot = parse({
      a: { $value: '8px', $type: 'dimension', $description: 'legacy', $deprecated: true },
    })
    expect(snapshot.tokens[0]).toMatchObject({ description: 'legacy', deprecated: true })
  })

  it('omits deprecated when it is false rather than writing it (invariant 10)', () => {
    const snapshot = parse({ a: { $value: '8px', $type: 'dimension', $deprecated: false } })
    expect(Object.hasOwn(snapshot.tokens[0] as object, 'deprecated')).toBe(false)
  })

  it('skips group metadata keys rather than reading them as tokens', () => {
    const snapshot = parse({
      space: { $type: 'dimension', $description: 'the spacing scale', sm: { $value: '8px' } },
    })
    expect(snapshot.tokens.map((token) => token.id)).toEqual(['space.sm'])
  })

  it('keeps a value it cannot normalize, with a diagnostic (invariants 7 and 8)', () => {
    const snapshot = parse({ a: { $value: 'not-a-colour', $type: 'color' } })
    expect(snapshot.tokens[0]?.value.kind).toBe('unnormalized')
    expect(snapshot.tokens[0]?.raw).toBe('not-a-colour')
    expect(snapshot.diagnostics[0]).toMatchObject({
      severity: 'warning',
      code: 'unnormalizable-value',
      path: 'a',
    })
  })

  it('does not silently retype a value that fails its declared type', () => {
    // '16px' is a perfectly good dimension, but the document called it a colour.
    // Quietly reading it as a dimension would hide an authoring mistake.
    const snapshot = parse({ a: { $value: '16px', $type: 'color' } })
    expect(snapshot.tokens[0]?.type).toBe('color')
    expect(snapshot.tokens[0]?.value.kind).toBe('unnormalized')
  })

  it('warns about an unsupported $type and reads the value as a string', () => {
    const snapshot = parse({ a: { $value: 'cubic-bezier(0, 0, 1, 1)', $type: 'cubicBezier' } })
    expect(snapshot.diagnostics[0]).toMatchObject({ code: 'unsupported-token-type' })
    expect(snapshot.tokens[0]?.value.kind).toBe('string')
  })

  it('fails on a document that is not an object, without throwing', () => {
    for (const input of [null, 42, 'tokens', []]) {
      const result = parseTokensJson(input, source)
      expect(result.ok).toBe(false)
      expect(result.diagnostics[0]?.code).toBe('unreadable-document')
    }
  })

  it('reads an empty document as an empty snapshot', () => {
    const snapshot = parse({})
    expect(snapshot.tokens).toEqual([])
  })
})
