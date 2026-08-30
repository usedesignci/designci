import { describe, expect, it } from 'vitest'

import { parseTailwindTheme } from '../adapters/tailwind.js'
import { parseTokensJson } from '../adapters/tokens-json.js'
import { sourceId } from '../domain/ids.js'
import type { Source } from '../domain/source.js'
import type { DesignSystemSnapshot } from '../domain/snapshot.js'
import * as corpus from '../fixtures/small-system.js'
import { isStockTailwind, suggestMappings } from './mappings.js'

const suggestions = suggestMappings(corpus.figmaSnapshot, corpus.cssSnapshot)
const byKind = (kind: 'match' | 'drift') => suggestions.filter((s) => s.kind === kind)

describe('suggestMappings over the corpus', () => {
  it('proposes every agreeing pair and only those', () => {
    // 22 agreeing tokens plus radius.md/space.xs sharing 4px: both still map
    // to their name-aligned partner, so 23 matches.
    expect(byKind('match')).toHaveLength(23)
    const pairs = new Map(byKind('match').map((s) => [s.design.id as string, s.code.id as string]))
    expect(pairs.get('color.brand.primary')).toBe('--color-brand-primary')
    expect(pairs.get('space.sm')).toBe('--space-sm')
  })

  it('surfaces the seeded value drift as a drift candidate, not a match', () => {
    // radius.lg is 8px in Figma and 6px in CSS. 8px also happens to equal
    // --space-sm — a name-blind value coincidence that must not win over the
    // name-aligned drifted partner.
    expect(byKind('drift')).toEqual([
      expect.objectContaining({
        design: expect.objectContaining({ id: 'radius.lg' }),
        code: expect.objectContaining({ id: '--radius-lg' }),
      }),
    ])
  })

  it('proposes nothing for a token with no counterpart', () => {
    // color.feedback.destructive exists only in Figma (seeded drift 2); the
    // missing-token rule owns that story, not a guessed mapping.
    expect(suggestions.some((s) => (s.design.id as string).includes('destructive'))).toBe(false)
  })

  it('names passed-over value-equal tokens as alternates', () => {
    const brand = suggestions.find((s) => s.design.id === 'color.brand.primary')
    // --color-primary duplicates the brand value (seeded drift 3).
    expect(brand?.alternates).toEqual(['--color-primary'])
  })

  it('skips tokens on either side of an existing mapping', () => {
    const remaining = suggestMappings(corpus.figmaSnapshot, corpus.cssSnapshot, {
      existing: corpus.mappings,
    })
    // Everything is already mapped except the deliberately unmapped
    // destructive token, which has nothing to pair with.
    expect(remaining).toEqual([])
  })

  it('is order-independent over both token lists (invariant 1)', () => {
    const shuffled = suggestMappings(
      { ...corpus.figmaSnapshot, tokens: [...corpus.figmaSnapshot.tokens].reverse() },
      { ...corpus.cssSnapshot, tokens: [...corpus.cssSnapshot.tokens].reverse() },
    )
    expect(shuffled).toEqual(suggestions)
  })
})

describe('stock Tailwind awareness', () => {
  const tailwindSource: Source = {
    id: sourceId('tailwind'),
    kind: 'tailwind',
    role: 'code',
    label: 'tailwind',
  }
  const designSource: Source = {
    id: sourceId('figma'),
    kind: 'figma',
    role: 'design',
    label: 'Figma',
  }

  const theme = {
    colors: { blue: { 500: '#3b82f6' }, brand: '#6366f1' },
    borderRadius: { lg: '0.5rem' },
    spacing: { 4: '1rem' },
  }
  const code = parseTailwindTheme(theme, tailwindSource)
  const design = parseTokensJson(
    {
      color: {
        blue: { 500: { $type: 'color', $value: '#3b82f6' } },
        brand: { $type: 'color', $value: '#6366f1' },
      },
      radius: { lg: { $type: 'dimension', $value: '8px' } },
      space: { 4: { $type: 'dimension', $value: '16px' } },
    },
    designSource,
  )
  if (!code.ok || !design.ok) throw new Error('fixture failed to parse')

  const result = suggestMappings(design.value, code.value)

  it('flags unmodified framework defaults and sorts the team’s own decisions first', () => {
    const stock = result.filter((s) => s.stock).map((s) => s.code.id as string)
    expect(stock.sort()).toEqual(['borderRadius.lg', 'colors.blue.500', 'spacing.4'])
    // The customized brand colour outranks the stock values in the list.
    const ids = result.filter((s) => s.kind === 'match').map((s) => s.design.id as string)
    expect(ids[0]).toBe('color.brand')
  })

  it('bridges naming conventions when ranking: radius.lg pairs with borderRadius.lg', () => {
    // 8px in design vs Tailwind's stock 0.5rem (8px): notation differs,
    // values agree (invariant 3), the suffix rule aligns the names.
    const radius = result.find((s) => s.design.id === 'radius.lg')
    expect(radius?.kind).toBe('match')
    expect(radius?.code.id).toBe('borderRadius.lg')
    expect(radius?.stock).toBe(true)
  })

  it('detects stock values through normalize, not raw strings', () => {
    const source: Source = { id: sourceId('tw'), kind: 'tailwind', role: 'code', label: 'tw' }
    // Same colour, different notation than the shipped table.
    const parsed = parseTailwindTheme({ colors: { blue: { 500: 'rgb(59 130 246)' } } }, source)
    if (!parsed.ok) throw new Error('unreachable')
    const token = parsed.value.tokens[0]
    expect(token && isStockTailwind(token)).toBe(true)
  })

  it('treats an overridden default as the team’s own decision', () => {
    const source: Source = { id: sourceId('tw'), kind: 'tailwind', role: 'code', label: 'tw' }
    const parsed = parseTailwindTheme({ colors: { blue: { 500: '#0000ff' } } }, source)
    if (!parsed.ok) throw new Error('unreachable')
    const token = parsed.value.tokens[0]
    expect(token && isStockTailwind(token)).toBe(false)
  })
})
