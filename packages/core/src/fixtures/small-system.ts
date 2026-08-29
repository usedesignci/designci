/**
 * small-system — the shared test corpus.
 *
 * A 25-token design system in two variants: a Figma export (the design source of
 * truth) and the stylesheet that ships it (the code source). Every downstream
 * milestone tests against this rather than inventing new data, so a change in
 * normalization or ordering shows up everywhere at once.
 *
 * The two variants agree on 22 tokens while disagreeing on *notation* almost
 * everywhere — hex against `rgb()`, px against rem, object shadows against CSS
 * shadow strings. That disagreement is the point: none of it may produce a
 * finding (invariant 3).
 *
 * Three drifts are seeded, one per shipped rule:
 *
 *   1. `radius.lg` is 8px in Figma and 6px in CSS   -> token-value-mismatch
 *   2. `color.feedback.destructive` has no CSS token -> missing-token
 *   3. `--color-primary` repeats `--color-brand-primary` -> duplicate-token
 *
 * Nothing else in the corpus may trip a rule. If a fourth finding appears, the
 * engine changed behaviour — that is what the fixture is for.
 */

import type { CheckConfig, TokenMapping } from '../domain/config.js'
import { sourceId, tokenId } from '../domain/ids.js'
import type { Source } from '../domain/source.js'
import { createSnapshot, type DesignSystemSnapshot } from '../domain/snapshot.js'
import type { DesignToken, TokenType } from '../domain/token.js'
import {
  normalizeColor,
  normalizeDimension,
  normalizeDuration,
  normalizeShadow,
  normalizeTypography,
  type ShadowInput,
  type TypographyInput,
} from '../normalize/index.js'

export const FIGMA_SOURCE_ID = sourceId('figma')
export const CSS_SOURCE_ID = sourceId('css')

const figmaSource: Source = {
  id: FIGMA_SOURCE_ID,
  kind: 'figma',
  role: 'design',
  label: 'Figma',
  origin: 'small-system.fig',
}

const cssSource: Source = {
  id: CSS_SOURCE_ID,
  kind: 'css',
  role: 'code',
  label: 'tokens.css',
  origin: 'src/styles/tokens.css',
}

interface TokenSpec {
  readonly path: readonly string[]
  readonly type: TokenType
  readonly raw: string
  readonly value: DesignToken['value']
}

function color(path: readonly string[], raw: string): TokenSpec {
  return { path, type: 'color', raw, value: normalizeColor(raw) }
}

function dimension(path: readonly string[], raw: string): TokenSpec {
  return { path, type: 'dimension', raw, value: normalizeDimension(raw) }
}

function duration(path: readonly string[], raw: string): TokenSpec {
  return { path, type: 'duration', raw, value: normalizeDuration(raw) }
}

function typography(path: readonly string[], input: TypographyInput): TokenSpec {
  return {
    path,
    type: 'typography',
    raw: JSON.stringify(input),
    value: normalizeTypography(input),
  }
}

function shadow(path: readonly string[], input: ShadowInput): TokenSpec {
  return {
    path,
    type: 'shadow',
    raw: typeof input === 'string' ? input : JSON.stringify(input),
    value: normalizeShadow(input),
  }
}

/** Figma token ids are the dotted variable path. */
function figmaToken(spec: TokenSpec, index: number): DesignToken {
  return {
    id: tokenId(spec.path.join('.')),
    sourceId: FIGMA_SOURCE_ID,
    path: spec.path,
    type: spec.type,
    raw: spec.raw,
    value: spec.value,
    location: { file: 'small-system.fig', line: index + 1 },
  }
}

/** CSS token ids are the custom property name. */
function cssToken(spec: TokenSpec, index: number): DesignToken {
  return {
    id: tokenId(`--${spec.path.join('-')}`),
    sourceId: CSS_SOURCE_ID,
    path: spec.path,
    type: spec.type,
    raw: spec.raw,
    value: spec.value,
    location: { file: 'src/styles/tokens.css', line: index + 2, column: 3 },
  }
}

/** The design source of truth: 25 tokens, as Figma variables and styles. */
const figmaSpecs: readonly TokenSpec[] = [
  color(['color', 'brand', 'primary'], '#FF6B00'),
  color(['color', 'brand', 'secondary'], '#1B1B1F'),
  color(['color', 'surface', 'default'], '#FFFFFF'),
  color(['color', 'surface', 'raised'], '#F7F7F8'),
  color(['color', 'text', 'primary'], '#18181B'),
  color(['color', 'text', 'muted'], '#6B6B76'),
  color(['color', 'border', 'default'], '#E4E4E7'),
  color(['color', 'feedback', 'success'], '#15803D'),
  color(['color', 'feedback', 'warning'], '#B45309'),
  color(['color', 'feedback', 'destructive'], '#DC2626'),

  dimension(['space', 'xs'], '4px'),
  dimension(['space', 'sm'], '8px'),
  dimension(['space', 'md'], '16px'),
  dimension(['space', 'lg'], '24px'),
  dimension(['space', 'xl'], '32px'),

  dimension(['radius', 'sm'], '2px'),
  dimension(['radius', 'md'], '4px'),
  dimension(['radius', 'lg'], '8px'),
  dimension(['radius', 'full'], '9999px'),

  typography(['type', 'body'], {
    fontFamily: 'Inter',
    fontSize: '16px',
    fontWeight: 400,
    lineHeight: 1.5,
  }),
  typography(['type', 'heading'], {
    fontFamily: 'Inter',
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: 1.25,
  }),
  typography(['type', 'mono'], {
    fontFamily: 'JetBrains Mono',
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: 1.5,
  }),

  shadow(['shadow', 'sm'], {
    offsetX: '0',
    offsetY: '1px',
    blur: '2px',
    color: 'rgba(0, 0, 0, 0.05)',
  }),
  shadow(['shadow', 'md'], [
    { offsetX: '0', offsetY: '4px', blur: '6px', spread: '-1px', color: 'rgba(0, 0, 0, 0.1)' },
    { offsetX: '0', offsetY: '2px', blur: '4px', spread: '-2px', color: 'rgba(0, 0, 0, 0.1)' },
  ]),

  duration(['motion', 'fast'], '150ms'),
]

/**
 * The shipped stylesheet. Same system, different notation throughout — and three
 * seeded drifts, marked inline.
 */
const cssSpecs: readonly TokenSpec[] = [
  // Same colour, modern space-separated rgb().
  color(['color', 'brand', 'primary'], 'rgb(255 107 0)'),
  color(['color', 'brand', 'secondary'], '#1b1b1f'),
  // Same colour, 3-digit hex.
  color(['color', 'surface', 'default'], '#fff'),
  color(['color', 'surface', 'raised'], '#F7F7F8'),
  color(['color', 'text', 'primary'], '#18181B'),
  // Same colour, legacy comma-separated rgb().
  color(['color', 'text', 'muted'], 'rgb(107, 107, 118)'),
  color(['color', 'border', 'default'], '#E4E4E7'),
  color(['color', 'feedback', 'success'], '#15803D'),
  color(['color', 'feedback', 'warning'], '#B45309'),
  // DRIFT 2: color.feedback.destructive is never defined here.

  // Same lengths, expressed in rem against a 16px root.
  dimension(['space', 'xs'], '0.25rem'),
  dimension(['space', 'sm'], '0.5rem'),
  dimension(['space', 'md'], '1rem'),
  dimension(['space', 'lg'], '1.5rem'),
  dimension(['space', 'xl'], '2rem'),

  dimension(['radius', 'sm'], '2px'),
  dimension(['radius', 'md'], '4px'),
  // DRIFT 1: Figma says 8px.
  dimension(['radius', 'lg'], '6px'),
  dimension(['radius', 'full'], '9999px'),

  // Same type ramp: sizes in rem, weights as keywords, families quoted.
  typography(['type', 'body'], {
    fontFamily: '"Inter"',
    fontSize: '1rem',
    fontWeight: 'normal',
    lineHeight: 1.5,
  }),
  typography(['type', 'heading'], {
    fontFamily: '"Inter"',
    fontSize: '1.5rem',
    fontWeight: 'semibold',
    lineHeight: 1.25,
  }),
  typography(['type', 'mono'], {
    fontFamily: '"JetBrains Mono"',
    fontSize: '0.875rem',
    fontWeight: 'normal',
    lineHeight: 1.5,
  }),

  // Same shadows, as CSS strings rather than objects.
  shadow(['shadow', 'sm'], '0 1px 2px rgba(0, 0, 0, 0.05)'),
  shadow(['shadow', 'md'], '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)'),

  // Same duration, in seconds.
  duration(['motion', 'fast'], '0.15s'),

  // DRIFT 3: an unaliased repeat of --color-brand-primary.
  color(['color', 'primary'], 'rgb(255 107 0)'),
]

export const figmaSnapshot: DesignSystemSnapshot = createSnapshot({
  source: figmaSource,
  tokens: figmaSpecs.map(figmaToken),
})

export const cssSnapshot: DesignSystemSnapshot = createSnapshot({
  source: cssSource,
  tokens: cssSpecs.map(cssToken),
})

export const snapshots: readonly DesignSystemSnapshot[] = [figmaSnapshot, cssSnapshot]

/**
 * Explicit mappings, one per Figma token that exists in CSS (invariant 4). The
 * omission of `color.feedback.destructive` is deliberate and is drift 2.
 */
export const mappings: readonly TokenMapping[] = figmaSpecs
  .filter((spec) => spec.path.join('.') !== 'color.feedback.destructive')
  .map((spec) => ({
    from: { sourceId: FIGMA_SOURCE_ID, tokenId: tokenId(spec.path.join('.')) },
    to: { sourceId: CSS_SOURCE_ID, tokenId: tokenId(`--${spec.path.join('-')}`) },
  }))

/** Default policy for the corpus: every shipped rule at its default severity. */
export const config: CheckConfig = { rules: {}, mappings }

/**
 * The same mappings in the form a team actually commits, before `parseConfig`
 * expands them. Downstream milestones read config through the parser, so the
 * corpus carries the authoring shape as well as the parsed one; the suite
 * asserts the two agree.
 */
export const configDocument: {
  readonly mappings: readonly Record<string, string>[]
} = {
  mappings: figmaSpecs
    .filter((spec) => spec.path.join('.') !== 'color.feedback.destructive')
    .map((spec) => ({
      figma: spec.path.join('.'),
      css: `--${spec.path.join('-')}`,
    })),
}
