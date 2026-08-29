/**
 * The CLI's I/O layer: everything that touches the filesystem lives here, and
 * nothing here decides anything — files are read, decoded, and handed to core's
 * pure parsers (invariant 12). Every failure surfaces as a ParseDiagnostic;
 * this module never throws for a user mistake.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  type Baseline,
  type CheckConfig,
  type DesignSystemSnapshot,
  type ParseDiagnostic,
  type SourceConfig,
  allRules,
  parseBaseline,
  parseConfig,
  parseCss,
  parseSnapshot,
  parseTailwindTheme,
  parseTokensJson,
} from '@designci/core'

export const CONFIG_FILE = 'designci.config.json'
export const BASELINE_FILE = 'designci.baseline.json'

export interface LoadedProject {
  readonly config: CheckConfig
  readonly configPath: string
  readonly snapshots: readonly DesignSystemSnapshot[]
  readonly baseline: Baseline | undefined
  readonly baselinePath: string
  /** Faults from loading itself: unreadable files, undecodable JSON. */
  readonly diagnostics: readonly ParseDiagnostic[]
}

export interface LoadFailure {
  readonly ok: false
  readonly diagnostics: readonly ParseDiagnostic[]
}

export interface LoadSuccess {
  readonly ok: true
  readonly project: LoadedProject
}

export type LoadResult = LoadSuccess | LoadFailure

function ioError(message: string, file: string): ParseDiagnostic {
  return { severity: 'error', code: 'unreadable-file', message, path: file }
}

async function readText(file: string): Promise<string | ParseDiagnostic> {
  try {
    return await readFile(file, 'utf8')
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    return ioError(`could not read ${file}: ${reason}`, file)
  }
}

function decodeJson(text: string, file: string): unknown | ParseDiagnostic {
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    return ioError(`${file} is not valid JSON: ${reason}`, file)
  }
}

function isDiagnostic(value: unknown): value is ParseDiagnostic {
  return (
    typeof value === 'object' &&
    value !== null &&
    'severity' in value &&
    'code' in value &&
    'message' in value
  )
}

/** Reads one declared source into a snapshot. */
async function loadSource(
  source: SourceConfig,
  root: string,
  rootFontSizePx: number | undefined,
): Promise<DesignSystemSnapshot | ParseDiagnostic> {
  if (source.path === undefined) {
    return ioError(
      `source ${source.id} has no path; the CLI can only read file-based sources`,
      `sources.${source.id}`,
    )
  }

  const file = path.resolve(root, source.path)
  const text = await readText(file)
  if (isDiagnostic(text)) return text

  const dimensions = rootFontSizePx === undefined ? {} : { rootFontSizePx }
  const options = { ...dimensions, file: source.path }

  switch (source.kind) {
    case 'css': {
      const parsed = parseCss(text, source, options)
      return parsed.ok ? parsed.value : ioError(`could not parse ${source.path}`, source.path)
    }
    case 'tokens-json': {
      const decoded = decodeJson(text, source.path)
      if (isDiagnostic(decoded)) return decoded
      const parsed = parseTokensJson(decoded, source, options)
      return parsed.ok
        ? parsed.value
        : { ...(parsed.diagnostics[0] as ParseDiagnostic), path: source.path }
    }
    case 'figma': {
      // A Figma source is the plugin's exported snapshot file.
      const decoded = decodeJson(text, source.path)
      if (isDiagnostic(decoded)) return decoded
      const parsed = parseSnapshot(decoded)
      if (!parsed.ok) return { ...(parsed.diagnostics[0] as ParseDiagnostic), path: source.path }
      // The declaration in config wins over what the file claims about itself,
      // so mappings keyed on the declared id always resolve.
      return { ...parsed.value, source }
    }
    case 'tailwind': {
      // A resolved theme as JSON. Executing a tailwind.config.ts to resolve it
      // is deliberately not done here yet — that means running user code.
      const decoded = decodeJson(text, source.path)
      if (isDiagnostic(decoded)) return decoded
      const parsed = parseTailwindTheme(decoded, source, options)
      return parsed.ok
        ? parsed.value
        : { ...(parsed.diagnostics[0] as ParseDiagnostic), path: source.path }
    }
    case 'code':
      return ioError(
        `source ${source.id} has kind 'code', which no adapter reads yet`,
        `sources.${source.id}`,
      )
  }
}

/**
 * Loads config, baseline and every declared source. Partial failure is per
 * source: one unreadable file becomes a diagnostic while the others load, so a
 * report can say exactly what is missing instead of nothing at all.
 */
export async function loadProject(root: string): Promise<LoadResult> {
  const configPath = path.resolve(root, CONFIG_FILE)
  const baselinePath = path.resolve(root, BASELINE_FILE)

  const text = await readText(configPath)
  if (isDiagnostic(text)) {
    return {
      ok: false,
      diagnostics: [
        ioError(`no ${CONFIG_FILE} found; run \`designci init\` to create one`, configPath),
      ],
    }
  }

  const decoded = decodeJson(text, CONFIG_FILE)
  if (isDiagnostic(decoded)) return { ok: false, diagnostics: [decoded] }

  const parsed = parseConfig(decoded, { knownRuleIds: allRules.map((rule) => rule.id) })
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics }
  const config = parsed.value

  const diagnostics: ParseDiagnostic[] = [...parsed.diagnostics]
  const snapshots: DesignSystemSnapshot[] = []

  for (const source of config.sources) {
    const loaded = await loadSource(source, root, config.rootFontSizePx)
    if (isDiagnostic(loaded) && !('tokens' in loaded)) {
      diagnostics.push(loaded)
      continue
    }
    snapshots.push(loaded as DesignSystemSnapshot)
  }

  let baseline: Baseline | undefined
  const baselineText = await readText(baselinePath)
  if (!isDiagnostic(baselineText)) {
    // The file exists: a baseline that cannot be read is an error, never an
    // empty baseline — silently accepting nothing would re-fail accepted drift,
    // silently accepting everything would hide regressions.
    const decodedBaseline = decodeJson(baselineText, BASELINE_FILE)
    if (isDiagnostic(decodedBaseline)) return { ok: false, diagnostics: [decodedBaseline] }
    const parsedBaseline = parseBaseline(decodedBaseline)
    if (!parsedBaseline.ok) return { ok: false, diagnostics: parsedBaseline.diagnostics }
    baseline = parsedBaseline.value
    diagnostics.push(...parsedBaseline.diagnostics)
  }

  return {
    ok: true,
    project: { config, configPath, snapshots, baseline, baselinePath, diagnostics },
  }
}
