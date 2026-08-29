import { describe, expect, it } from 'vitest'

import { sourceId } from '../domain/ids.js'
import type { Source } from '../domain/source.js'
import { parseTailwindTheme } from './tailwind.js'

const source: Source = {
  id: sourceId('tailwind'),
  kind: 'tailwind',
  role: 'code',
  label: 'tailwind.config.ts',
}

function parse(theme: unknown, options?: Parameters<typeof parseTailwindTheme>[2]) {
  const result = parseTailwindTheme(theme, source, options)
  if (!result.ok) throw new Error('expected the theme to parse')
  return result.value
}

describe('parseTailwindTheme', () => {
  it('reads nested colour scales into dotted ids', () => {
    const snapshot = parse({ colors: { brand: { primary: '#FF6B00' } } })
    expect(snapshot.tokens[0]).toMatchObject({
      id: 'colors.brand.primary',
      path: ['colors', 'brand', 'primary'],
      type: 'color',
    })
  })

  it('types each scale from Tailwind own schema, not from key names', () => {
    const snapshot = parse({
      colors: { red: '#ff0000' },
      spacing: { 4: '1rem' },
      borderRadius: { lg: '0.5rem' },
      transitionDuration: { fast: '150ms' },
      opacity: { 50: '0.5' },
    })
    expect(snapshot.tokens.map((token) => token.type)).toEqual([
      'color',
      'dimension',
      'dimension',
      'duration',
      'number',
    ])
  })

  it('reads a font stack as one token rather than descending into the array', () => {
    const snapshot = parse({ fontFamily: { sans: ['Inter', 'sans-serif'] } })
    expect(snapshot.tokens).toHaveLength(1)
    expect(snapshot.tokens[0]?.value).toMatchObject({
      kind: 'fontFamily',
      families: ['Inter', 'sans-serif'],
    })
  })

  it('reads a fontSize tuple as a type ramp, not just a size', () => {
    const snapshot = parse({
      fontSize: { base: ['1rem', { lineHeight: '1.5rem', letterSpacing: '0.01em' }] },
    })
    const token = snapshot.tokens[0]
    expect(token?.type).toBe('typography')
    if (token?.value.kind !== 'typography') throw new Error('expected typography')
    expect(token.value.fontSize?.px).toBe(16)
    expect(token.value.lineHeight).toMatchObject({ px: 24 })
  })

  it('reads the shorthand tuple form where the second entry is a line height', () => {
    const snapshot = parse({ fontSize: { sm: ['0.875rem', '1.25rem'] } })
    const token = snapshot.tokens[0]
    if (token?.value.kind !== 'typography') throw new Error('expected typography')
    expect(token.value.lineHeight).toMatchObject({ px: 20 })
  })

  it('reads a plain fontSize string as a dimension', () => {
    const snapshot = parse({ fontSize: { sm: '0.875rem' } })
    expect(snapshot.tokens[0]).toMatchObject({ type: 'dimension' })
  })

  it('keeps a DEFAULT key as an ordinary segment', () => {
    const snapshot = parse({ borderRadius: { DEFAULT: '0.25rem' } })
    expect(snapshot.tokens[0]?.id).toBe('borderRadius.DEFAULT')
  })

  it('reads a boxShadow string as a shadow', () => {
    const snapshot = parse({ boxShadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.05)' } })
    expect(snapshot.tokens[0]?.value.kind).toBe('shadow')
  })

  it('ignores scales it does not know about', () => {
    // Reading an unknown scale would mean guessing what type it holds.
    const snapshot = parse({ colors: { red: '#ff0000' }, gridTemplateColumns: { 12: 'repeat(12)' } })
    expect(snapshot.tokens.map((token) => token.id)).toEqual(['colors.red'])
  })

  it('reads an extra scale when the project declares its type', () => {
    const snapshot = parse(
      { gridTemplateColumns: { 12: 'repeat(12, minmax(0, 1fr))' } },
      { scales: { gridTemplateColumns: 'string' } },
    )
    expect(snapshot.tokens[0]).toMatchObject({ id: 'gridTemplateColumns.12', type: 'string' })
  })

  it('reports an unresolved theme function rather than reading it as a value', () => {
    const snapshot = parse({ colors: () => ({ red: '#ff0000' }) })
    expect(snapshot.tokens).toEqual([])
    expect(snapshot.diagnostics[0]).toMatchObject({ code: 'unresolved-theme-scale' })
  })

  it('keeps an unnormalizable value with a diagnostic (invariants 7 and 8)', () => {
    const snapshot = parse({ colors: { bad: 'not-a-colour' } })
    expect(snapshot.tokens[0]?.raw).toBe('not-a-colour')
    expect(snapshot.tokens[0]?.value.kind).toBe('unnormalized')
    expect(snapshot.diagnostics[0]?.code).toBe('unnormalizable-value')
  })

  it('honours a project root font size when converting rem', () => {
    const snapshot = parse({ spacing: { 4: '1rem' } }, { rootFontSizePx: 10 })
    expect(snapshot.tokens[0]?.value).toMatchObject({ px: 10 })
  })

  it('fails on a theme that is not an object, pointing at resolveConfig', () => {
    const result = parseTailwindTheme('theme', source)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.message).toContain('resolveConfig')
  })
})
