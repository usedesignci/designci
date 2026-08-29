import { describe, expect, it } from 'vitest'

import { parseConfig } from './parse.js'

function expectOk(input: unknown, options?: Parameters<typeof parseConfig>[1]) {
  const result = parseConfig(input, options)
  if (!result.ok) {
    throw new Error(`expected a valid config, got: ${result.diagnostics.map((d) => d.message).join('; ')}`)
  }
  return result
}

describe('parseConfig', () => {
  it('reads an empty config', () => {
    const { value } = expectOk({})
    expect(value).toEqual({ rules: {}, mappings: [] })
  })

  it('accepts both the shorthand and object rule forms', () => {
    const { value } = expectOk({
      rules: {
        'token-value-mismatch': 'error',
        'missing-token': { severity: 'warn' },
        'duplicate-token': { severity: 'off', options: { scope: 'namespace' } },
      },
    })
    expect(value.rules).toEqual({
      'token-value-mismatch': { severity: 'error' },
      'missing-token': { severity: 'warn' },
      'duplicate-token': { severity: 'off', options: { scope: 'namespace' } },
    })
  })

  it('omits options when none were given (invariant 10)', () => {
    const { value } = expectOk({ rules: { 'missing-token': 'warn' } })
    expect(Object.hasOwn(value.rules['missing-token'] as object, 'options')).toBe(false)
  })

  it('expands a mapping into a pair', () => {
    const { value } = expectOk({
      mappings: [{ figma: 'color.brand.primary', css: '--color-brand-primary' }],
    })
    expect(value.mappings).toEqual([
      {
        from: { sourceId: 'figma', tokenId: 'color.brand.primary' },
        to: { sourceId: 'css', tokenId: '--color-brand-primary' },
      },
    ])
  })

  it('expands a three-source mapping into all three pairs', () => {
    // The author listed them together, so all pairs are stated, not inferred.
    const { value } = expectOk({
      mappings: [{ figma: 'radius.lg', tokens: 'radius.lg', css: '--radius-lg' }],
    })
    expect(value.mappings).toHaveLength(3)
    expect(value.mappings.map((m) => `${m.from.sourceId}->${m.to.sourceId}`)).toEqual([
      'figma->tokens',
      'figma->css',
      'tokens->css',
    ])
  })

  it('rejects a mapping that names only one source', () => {
    const result = parseConfig({ mappings: [{ figma: 'radius.lg' }] })
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', path: 'mappings[0]' })
  })

  it('rejects an invalid severity rather than ignoring it', () => {
    // Silently dropping this would run a policy the author never wrote.
    const result = parseConfig({ rules: { 'missing-token': 'loud' } })
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      path: 'rules.missing-token',
      raw: '"loud"',
    })
  })

  it('rejects a malformed rootFontSizePx', () => {
    for (const value of [0, -16, 'sixteen', Number.NaN]) {
      expect(parseConfig({ rootFontSizePx: value }).ok).toBe(false)
    }
    expect(expectOk({ rootFontSizePx: 10 }).value.rootFontSizePx).toBe(10)
  })

  it('omits rootFontSizePx when absent rather than setting undefined', () => {
    const { value } = expectOk({})
    expect(Object.hasOwn(value, 'rootFontSizePx')).toBe(false)
  })

  it('warns about an unknown rule id instead of failing', () => {
    // A typo would otherwise silently configure nothing at all.
    const result = expectOk(
      { rules: { 'missing-tokens': 'warn' } },
      { knownRuleIds: ['missing-token'] },
    )
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'warning',
      code: 'unknown-rule',
      path: 'rules.missing-tokens',
    })
  })

  it('warns about an unknown top-level key instead of failing', () => {
    const result = expectOk({ rulez: {} })
    expect(result.diagnostics[0]).toMatchObject({ severity: 'warning', code: 'unknown-config-key' })
    expect(result.value.rules).toEqual({})
  })

  it('reports every fault it finds, not just the first', () => {
    const result = parseConfig({
      rules: { a: 'nope', b: { severity: 'alsonope' } },
      mappings: [{ figma: 'x' }],
    })
    expect(result.ok).toBe(false)
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(3)
  })

  it('rejects input that is not an object, without throwing (invariant 7)', () => {
    for (const input of [null, undefined, 42, 'config', [], true]) {
      const result = parseConfig(input)
      expect(result.ok).toBe(false)
      expect(result.diagnostics).toHaveLength(1)
    }
  })
})
