import { describe, expect, it } from 'vitest'

import { sourceId } from '../domain/ids.js'
import type { Source } from '../domain/source.js'
import { tokenName } from '../domain/token.js'
import { smallSystemCss } from '../fixtures/small-system-css.js'
import * as fixture from '../fixtures/small-system.js'
import { valuesEqual } from '../normalize/equal.js'
import { parseCss } from './css.js'

const source: Source = {
  id: sourceId('css'),
  kind: 'css',
  role: 'code',
  label: 'tokens.css',
  origin: 'src/styles/tokens.css',
}

function parse(css: string) {
  const result = parseCss(css, source, { file: 'tokens.css' })
  if (!result.ok) throw new Error('css parse should never fail outright')
  return result.value
}

describe('parseCss', () => {
  it('reads custom properties out of a rule block', () => {
    const snapshot = parse(':root { --radius-lg: 8px; --color-brand: #FF6B00; }')
    expect(snapshot.tokens.map((token) => token.id)).toEqual(['--radius-lg', '--color-brand'])
  })

  it('records the line and column of each declaration', () => {
    const snapshot = parse(':root {\n  --a: 1px;\n  --b: 2px;\n}')
    expect(snapshot.tokens.map((token) => token.location?.line)).toEqual([2, 3])
    expect(snapshot.tokens[0]?.location?.column).toBe(3)
  })

  it('infers type from the value syntax, never from the property name', () => {
    // Named `--color-x` but holding a length: the length wins, because the name
    // is not evidence of anything.
    const snapshot = parse(':root { --color-x: 4px; --radius-y: #FF6B00; }')
    expect(snapshot.tokens.map((token) => token.type)).toEqual(['dimension', 'color'])
  })

  it('keeps the author raw exactly (invariant 8)', () => {
    const snapshot = parse(':root { --a:   rgb(255 107 0)  ; }')
    expect(snapshot.tokens[0]?.raw).toBe('rgb(255 107 0)')
  })

  it('splits the property name into a display path', () => {
    const snapshot = parse(':root { --color-brand-primary: red; }')
    expect(snapshot.tokens[0]?.path).toEqual(['color', 'brand', 'primary'])
    // The id stays the whole property name: mappings key on this, not the path.
    expect(snapshot.tokens[0]?.id).toBe('--color-brand-primary')
  })

  it('reads a var() reference as an alias rather than a value', () => {
    const snapshot = parse(':root { --a: #FF6B00; --b: var(--a); }')
    expect(snapshot.tokens[1]?.value).toMatchObject({ kind: 'alias', target: '--a' })
  })

  it('ignores declarations that are not custom properties', () => {
    const snapshot = parse('.button { color: red; border-radius: 8px; --radius: 8px; }')
    expect(snapshot.tokens.map((token) => token.id)).toEqual(['--radius'])
  })

  it('ignores commented-out declarations', () => {
    const snapshot = parse(':root { /* --a: 1px; */ --b: 2px; }')
    expect(snapshot.tokens.map((token) => token.id)).toEqual(['--b'])
  })

  it('does not end a value early on a semicolon inside a string or parens', () => {
    const snapshot = parse(':root { --a: rgb(0, 0, 0); --b: "a;b"; }')
    expect(snapshot.tokens[0]?.raw).toBe('rgb(0, 0, 0)')
    expect(snapshot.tokens[1]?.raw).toBe('"a;b"')
  })

  it('strips !important from the value', () => {
    const snapshot = parse(':root { --a: 4px !important; }')
    expect(snapshot.tokens[0]?.raw).toBe('4px')
    expect(snapshot.tokens[0]?.value).toMatchObject({ kind: 'dimension', px: 4 })
  })

  it('finds properties under any selector, and inside a non-conditional at-rule', () => {
    const snapshot = parse('@layer base { .theme-dark { --a: 1px; } }')
    expect(snapshot.tokens.map((token) => token.id)).toEqual(['--a'])
  })

  it('skips a conditional override rather than treating it as the default', () => {
    // A dark-mode value is a different mode of the token. Reading it as the
    // token's value would compare a dark colour against a light design variable
    // and report drift that does not exist.
    const snapshot = parse(
      ':root { --a: #fff; }\n@media (prefers-color-scheme: dark) { :root { --a: #000; } }',
    )
    expect(snapshot.tokens).toHaveLength(1)
    expect(snapshot.tokens[0]?.raw).toBe('#fff')
    expect(snapshot.diagnostics[0]).toMatchObject({
      code: 'conditional-declaration',
      severity: 'warning',
    })
  })

  it('treats a block nested inside a conditional one as conditional too', () => {
    const snapshot = parse('@supports (display: grid) { @layer base { :root { --a: 1px; } } }')
    expect(snapshot.tokens).toEqual([])
    expect(snapshot.diagnostics[0]?.code).toBe('conditional-declaration')
  })

  it('lets the last unconditional declaration win, and says so (invariant 7)', () => {
    // Matches what a browser does, rather than silently keeping the first.
    const snapshot = parse(':root { --a: 1px; }\n.theme { --a: 2px; }')
    expect(snapshot.tokens).toHaveLength(1)
    expect(snapshot.tokens[0]?.raw).toBe('2px')
    expect(snapshot.diagnostics[0]).toMatchObject({ code: 'redeclared-property' })
  })

  it('reads a value it cannot type as a string rather than failing', () => {
    const snapshot = parse(':root { --easing: cubic-bezier(0.4, 0, 0.2, 1); }')
    expect(snapshot.tokens[0]?.value).toMatchObject({ kind: 'string' })
  })

  it('returns an empty snapshot for a stylesheet with no custom properties', () => {
    const snapshot = parse('.a { color: red; }')
    expect(snapshot.tokens).toEqual([])
    expect(snapshot.diagnostics).toEqual([])
  })
})

describe('parseCss over the corpus stylesheet', () => {
  const snapshot = parse(smallSystemCss)
  const byId = new Map(snapshot.tokens.map((token) => [token.id as string, token]))

  it('reads every default declaration, and skips the dark-mode override', () => {
    // 25 properties in :root; the @media block redeclares one of them.
    expect(snapshot.tokens).toHaveLength(25)
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'conditional-declaration',
    ])
    expect(byId.get('--color-surface-default')?.raw).toBe('#fff')
  })

  it('agrees with the hand-built CSS snapshot on every shared token', () => {
    // The corpus's expected values were written by hand; these come out of the
    // scanner. Where both express a token, the normalized values must agree.
    const handBuilt = fixture.cssSnapshot.tokens.filter((token) => byId.has(token.id))
    expect(handBuilt.length).toBeGreaterThan(15)

    for (const expected of handBuilt) {
      const parsed = byId.get(expected.id)
      if (!parsed) throw new Error(`missing ${expected.id}`)
      expect(parsed.raw, `${tokenName(expected)} raw`).toBe(expected.raw)
      expect(
        valuesEqual(parsed.value, expected.value),
        `${tokenName(expected)}: ${parsed.value.kind} vs ${expected.value.kind}`,
      ).toBe(true)
    }
  })

  it('types the corpus values the way the Figma variant declares them', () => {
    expect(byId.get('--color-brand-primary')?.type).toBe('color')
    expect(byId.get('--space-md')?.type).toBe('dimension')
    expect(byId.get('--motion-fast')?.type).toBe('duration')
    expect(byId.get('--shadow-md')?.type).toBe('shadow')
  })

  it('reads the two-layer shadow as two layers', () => {
    const shadow = byId.get('--shadow-md')?.value
    if (shadow?.kind !== 'shadow') throw new Error('expected a shadow')
    expect(shadow.layers).toHaveLength(2)
    expect(shadow.layers[0]?.spread.px).toBe(-1)
  })
})
