/**
 * Tailwind theme adapter.
 *
 * Takes a *resolved* theme object — what `resolveConfig(config).theme` returns —
 * rather than a config file path. Resolving a `tailwind.config.ts` means running
 * a bundler and executing user code; doing that inside the engine would break
 * purity (invariant 12) and drag a toolchain into the Figma plugin's sandbox.
 * The CLI resolves the config and hands the plain object here.
 *
 * Each theme scale maps to a token type, so `borderRadius.lg` is read as a
 * dimension and `colors.brand.primary` as a colour. That mapping is a property
 * of Tailwind's own schema — the framework defines what `borderRadius` holds —
 * not an inference from the token's name.
 */

import type { ParseDiagnostic, ParseResult } from '../domain/diagnostic.js'
import { parseOk } from '../domain/diagnostic.js'
import { tokenId as asTokenId } from '../domain/ids.js'
import type { Source } from '../domain/source.js'
import { createSnapshot, type DesignSystemSnapshot } from '../domain/snapshot.js'
import type { DesignToken, TokenType } from '../domain/token.js'
import type { DimensionOptions } from '../normalize/dimension.js'
import { normalizeTypography } from '../normalize/composite.js'
import { type NormalizableType, normalizeForType } from '../normalize/value.js'

export interface TailwindOptions extends DimensionOptions {
  /** Path recorded on each token, for reports. */
  readonly file?: string
  /**
   * Extra scales to read, as scale name to token type. Merged over the defaults,
   * so a project with a custom scale can declare its type rather than have one
   * guessed.
   */
  readonly scales?: Readonly<Record<string, NormalizableType>>
}

/** Tailwind's scales and what each one holds, per the framework's own schema. */
const DEFAULT_SCALES: Readonly<Record<string, NormalizableType>> = {
  colors: 'color',
  spacing: 'dimension',
  borderRadius: 'dimension',
  borderWidth: 'dimension',
  fontSize: 'dimension',
  fontFamily: 'fontFamily',
  fontWeight: 'fontWeight',
  lineHeight: 'dimension',
  letterSpacing: 'dimension',
  boxShadow: 'shadow',
  transitionDuration: 'duration',
  opacity: 'number',
  zIndex: 'number',
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rawOf(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
}

/**
 * Tailwind's `fontSize` entries may be `'1rem'` or
 * `['1rem', { lineHeight: '1.5rem' }]`. The tuple form carries a whole type
 * ramp, so it is read as typography rather than flattened to a size.
 */
function readFontSizeTuple(
  value: readonly unknown[],
  options: DimensionOptions,
): { type: TokenType; value: ReturnType<typeof normalizeTypography> } | undefined {
  const [size, config] = value
  if (typeof size !== 'string') return undefined

  const extras = isPlainObject(config)
    ? config
    : typeof config === 'string'
      ? { lineHeight: config }
      : {}

  const lineHeight = extras['lineHeight']
  const letterSpacing = extras['letterSpacing']
  const fontWeight = extras['fontWeight']

  return {
    type: 'typography',
    value: normalizeTypography(
      {
        fontSize: size,
        ...(typeof lineHeight === 'string' || typeof lineHeight === 'number'
          ? { lineHeight }
          : {}),
        ...(typeof letterSpacing === 'string' || typeof letterSpacing === 'number'
          ? { letterSpacing }
          : {}),
        ...(typeof fontWeight === 'string' || typeof fontWeight === 'number'
          ? { fontWeight }
          : {}),
      },
      options,
    ),
  }
}

export function parseTailwindTheme(
  theme: unknown,
  source: Source,
  options: TailwindOptions = {},
): ParseResult<DesignSystemSnapshot> {
  const diagnostics: ParseDiagnostic[] = []
  const tokens: DesignToken[] = []

  const dimensionOptions: DimensionOptions =
    options.rootFontSizePx === undefined ? {} : { rootFontSizePx: options.rootFontSizePx }

  if (!isPlainObject(theme)) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'unreadable-document',
          message: 'a Tailwind theme must be an object; pass resolveConfig(config).theme',
          sourceId: source.id,
          path: '',
          raw: rawOf(theme),
        },
      ],
    }
  }

  const scales = { ...DEFAULT_SCALES, ...(options.scales ?? {}) }

  const emit = (path: readonly string[], type: NormalizableType, value: unknown): void => {
    let normalized = normalizeForType(type, value, dimensionOptions)
    let tokenType: TokenType = type

    // A `fontSize` tuple is a type ramp, not a length.
    if (type === 'dimension' && Array.isArray(value)) {
      const tuple = readFontSizeTuple(value, dimensionOptions)
      if (tuple) {
        normalized = tuple.value
        tokenType = tuple.type
      }
    }

    if (normalized.kind === 'unnormalized') {
      diagnostics.push({
        severity: 'warning',
        code: 'unnormalizable-value',
        message: `could not normalize ${path.join('.')}: ${normalized.reason}`,
        sourceId: source.id,
        path: path.join('.'),
        raw: normalized.raw,
        ...(options.file === undefined ? {} : { location: { file: options.file } }),
      })
    }

    tokens.push({
      id: asTokenId(path.join('.')),
      sourceId: source.id,
      path,
      type: tokenType,
      raw: rawOf(value),
      value: normalized,
      ...(options.file === undefined ? {} : { location: { file: options.file } }),
    })
  }

  const walk = (node: unknown, path: readonly string[], type: NormalizableType): void => {
    // A font stack is an array of families, not a group to descend into.
    if (Array.isArray(node) && type === 'fontFamily') {
      emit(path, type, node)
      return
    }

    // A fontSize tuple is likewise a leaf.
    if (Array.isArray(node)) {
      emit(path, type, node)
      return
    }

    if (isPlainObject(node)) {
      for (const [key, child] of Object.entries(node)) {
        walk(child, [...path, key], type)
      }
      return
    }

    if (node === undefined || node === null) return
    emit(path, type, node)
  }

  for (const [scale, type] of Object.entries(scales)) {
    const node = theme[scale]
    if (node === undefined) continue
    // Tailwind theme values can be functions (`({ theme }) => …`) before
    // resolution. Reporting that is more useful than reading a stringified
    // function as a token value.
    if (typeof node === 'function') {
      diagnostics.push({
        severity: 'warning',
        code: 'unresolved-theme-scale',
        message: `theme.${scale} is a function; pass a resolved theme (resolveConfig)`,
        sourceId: source.id,
        path: scale,
      })
      continue
    }
    walk(node, [scale], type)
  }

  return parseOk(createSnapshot({ source, tokens, diagnostics }), diagnostics)
}
