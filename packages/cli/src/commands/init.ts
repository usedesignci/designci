/**
 * `designci init` — the onboarding wizard.
 *
 * Three stages, each skipped when there is nothing for it to do:
 *
 *   1. No config yet: detect conventional source files and write a starter
 *      config pointing at what was found. Never overwrites an existing config.
 *   2. Sources load: run the mapping suggester (core's `suggestMappings`) over
 *      every design/code source pair.
 *   3. Confirm: interactively when attached to a terminal, in bulk with
 *      `--accept-suggestions`, or print-only otherwise. Confirmed pairs are
 *      appended to the config's `mappings` — a human said yes, which is
 *      exactly the explicit statement invariant 4 requires. Nothing is ever
 *      written without that yes.
 */

import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  type DesignSystemSnapshot,
  type MappingSuggestion,
  allRules,
  createBaseline,
  runCheck,
  suggestMappings,
} from '@designci/core'

import { BASELINE_FILE, CONFIG_FILE, loadProject } from '../project.js'

export interface InitOptions {
  readonly root: string
  readonly write: (text: string) => void
  readonly writeError: (text: string) => void
  /** Prompt the user and resolve their answer; absent when not a terminal. */
  readonly ask?: (question: string) => Promise<string>
  /** Accept every value-agreeing suggestion without prompting. */
  readonly acceptSuggestions?: boolean
}

/* ------------------------------------------------------------------ *
 * Stage 1: starter config with detected sources
 * ------------------------------------------------------------------ */

/** Conventional locations, most specific first. Detection only chooses paths
 * to *declare* — whether they parse is the check's business, not init's. */
const SOURCE_CANDIDATES: readonly { kind: string; paths: readonly string[] }[] = [
  {
    kind: 'figma',
    paths: ['design/figma.snapshot.json', 'figma.snapshot.json', 'tokens/figma.snapshot.json'],
  },
  {
    kind: 'css',
    paths: [
      'src/styles/tokens.css',
      'styles/tokens.css',
      'src/tokens.css',
      'tokens.css',
      'app/assets/stylesheets/tokens.css',
    ],
  },
  {
    kind: 'tokens-json',
    paths: ['tokens.json', 'design-tokens.json', 'tokens/tokens.json', 'design/tokens.json'],
  },
  { kind: 'tailwind', paths: ['tailwind.theme.json', 'design/tailwind.theme.json'] },
]

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

async function detectSources(root: string): Promise<{ kind: string; path: string }[]> {
  const found: { kind: string; path: string }[] = []
  for (const candidate of SOURCE_CANDIDATES) {
    for (const relative of candidate.paths) {
      if (await exists(path.resolve(root, relative))) {
        found.push({ kind: candidate.kind, path: relative })
        break
      }
    }
  }
  return found
}

const DEFAULT_SOURCES = [
  { id: 'figma', kind: 'figma', path: 'design/figma.snapshot.json' },
  { id: 'css', kind: 'css', path: 'src/styles/tokens.css' },
]

function starter(detected: readonly { kind: string; path: string }[]): unknown {
  const sources =
    detected.length === 0
      ? DEFAULT_SOURCES
      : detected.map((entry) => ({ id: entry.kind, kind: entry.kind, path: entry.path }))
  return {
    name: 'My design system',
    sources,
    rules: {
      'token-value-mismatch': 'error',
      'missing-token': 'warn',
      'duplicate-token': 'warn',
    },
    mappings: [],
  }
}

/* ------------------------------------------------------------------ *
 * Stage 3 helpers: presentation and confirmation
 * ------------------------------------------------------------------ */

interface PairSuggestions {
  readonly designId: string
  readonly codeId: string
  readonly suggestions: readonly MappingSuggestion[]
}

function clip(raw: string, max = 36): string {
  return raw.length <= max ? raw : `${raw.slice(0, max - 1)}…`
}

function describe(suggestion: MappingSuggestion): string {
  const left = `${suggestion.design.id}`.padEnd(28)
  const base = `${left} ↔  ${suggestion.code.id}`
  if (suggestion.kind === 'drift') {
    return `${base}   design wrote ${clip(suggestion.design.raw)}, code wrote ${clip(suggestion.code.raw)}`
  }
  const alternates =
    suggestion.alternates === undefined
      ? ''
      : `   (also matches ${suggestion.alternates.join(', ')})`
  return `${base}   ${clip(suggestion.design.raw)}${alternates}`
}

function isYes(answer: string, fallback: boolean): boolean {
  const trimmed = answer.trim().toLowerCase()
  if (trimmed === '') return fallback
  return trimmed === 'y' || trimmed === 'yes'
}

/** Walks every suggestion past the user. `a` accepts all remaining matches;
 * drift pairs are always asked one by one — each is a claim worth a look. */
async function confirmInteractively(
  pairs: readonly PairSuggestions[],
  ask: (question: string) => Promise<string>,
  write: (text: string) => void,
): Promise<MappingSuggestion[]> {
  const accepted: MappingSuggestion[] = []
  let acceptRest = false

  for (const pair of pairs) {
    write(`\nSuggested mappings — ${pair.designId} ↔ ${pair.codeId}:`)

    const custom = pair.suggestions.filter((s) => s.kind === 'match' && !s.stock)
    const stock = pair.suggestions.filter((s) => s.kind === 'match' && s.stock)
    const drift = pair.suggestions.filter((s) => s.kind === 'drift')

    for (const suggestion of custom) {
      if (acceptRest) {
        accepted.push(suggestion)
        continue
      }
      const answer = await ask(`  ${describe(suggestion)}\n  Map it? [Y/n/a=rest/q=stop] `)
      const trimmed = answer.trim().toLowerCase()
      if (trimmed === 'q') return accepted
      if (trimmed === 'a') acceptRest = true
      if (trimmed === 'a' || isYes(answer, true)) accepted.push(suggestion)
    }

    if (stock.length > 0) {
      if (acceptRest) {
        accepted.push(...stock)
      } else {
        const answer = await ask(
          `  ${stock.length} pair${stock.length === 1 ? '' : 's'} are stock Tailwind defaults (unchanged framework values).\n  Map them all? [Y/n] `,
        )
        if (isYes(answer, true)) accepted.push(...stock)
      }
    }

    for (const suggestion of drift) {
      const answer = await ask(
        `  ${describe(suggestion)}\n  Values disagree — map them so \`check\` reports this drift? [Y/n] `,
      )
      if (isYes(answer, true)) accepted.push(suggestion)
    }
  }

  return accepted
}

function printSuggestions(pairs: readonly PairSuggestions[], write: (text: string) => void): void {
  for (const pair of pairs) {
    write(`\nSuggested mappings — ${pair.designId} ↔ ${pair.codeId}:`)
    const matches = pair.suggestions.filter((s) => s.kind === 'match')
    const drift = pair.suggestions.filter((s) => s.kind === 'drift')
    if (matches.length > 0) {
      write(`  ${matches.length} pair${matches.length === 1 ? '' : 's'} agree in value:`)
      for (const suggestion of matches) write(`    ${describe(suggestion)}`)
    }
    if (drift.length > 0) {
      write(`  ${drift.length} likely pair${drift.length === 1 ? '' : 's'} with disagreeing values:`)
      for (const suggestion of drift) write(`    ${describe(suggestion)}`)
    }
  }
}

/** Appends confirmed pairs to the config's `mappings`, touching nothing else. */
async function writeMappings(
  configPath: string,
  accepted: readonly MappingSuggestion[],
): Promise<void> {
  const document = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>
  const current = Array.isArray(document['mappings']) ? (document['mappings'] as unknown[]) : []
  const added = accepted.map((suggestion) => ({
    [suggestion.design.sourceId as string]: suggestion.design.id as string,
    [suggestion.code.sourceId as string]: suggestion.code.id as string,
  }))
  document['mappings'] = [...current, ...added]
  await writeFile(configPath, `${JSON.stringify(document, null, 2)}\n`)
}

/* ------------------------------------------------------------------ *
 * The last step: green is the happy path.
 *
 * A first check that fails on years of accumulated drift teaches "this tool
 * is red", and red tools get removed. So init ends by offering the baseline:
 * accept what exists today, fail only on drift introduced after. Accepted
 * drift still counts against the health score (invariant 11) — the baseline
 * suppresses the failure, never the truth. Never written without a yes, and
 * never over an existing baseline.
 * ------------------------------------------------------------------ */

async function offerBaseline(options: InitOptions): Promise<void> {
  const baselinePath = path.resolve(options.root, BASELINE_FILE)
  if (await exists(baselinePath)) return

  const loaded = await loadProject(options.root)
  if (!loaded.ok) return
  const { config, snapshots, diagnostics } = loaded.project
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return
  if (snapshots.length < 2) return

  const result = runCheck({ snapshots, rules: allRules, config })
  if (result.violations.length === 0) {
    options.write('\n`designci check` is clean — green from day one.')
    return
  }

  const count = result.violations.length
  const plural = count === 1 ? 'existing issue' : 'existing issues'
  if (options.ask === undefined) {
    options.write(
      `\nThe check currently finds ${count} ${plural}. Green is the happy path: run \`designci check --update-baseline\` to accept today's drift, so CI fails only on drift introduced after.`,
    )
    return
  }

  const answer = await options.ask(
    `\nThe check currently finds ${count} ${plural}. Accept them into ${BASELINE_FILE} so CI starts green and fails only on NEW drift? They still count against the health score. [Y/n] `,
  )
  if (!isYes(answer, true)) return

  const baseline = createBaseline(result.violations)
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`)
  options.write(
    `Accepted ${baseline.entries.length} into ${BASELINE_FILE} — \`designci check\` is green, and the health score keeps telling the truth.`,
  )
}

/* ------------------------------------------------------------------ *
 * The command
 * ------------------------------------------------------------------ */

export async function init(options: InitOptions): Promise<number> {
  const configPath = path.resolve(options.root, CONFIG_FILE)
  const hadConfig = await exists(configPath)

  if (!hadConfig) {
    const detected = await detectSources(options.root)
    await writeFile(configPath, `${JSON.stringify(starter(detected), null, 2)}\n`)
    options.write(
      detected.length === 0
        ? `Wrote ${CONFIG_FILE} with the conventional source layout — point sources at your real files.`
        : `Wrote ${CONFIG_FILE} — detected ${detected
            .map((entry) => `${entry.kind} (${entry.path})`)
            .join(', ')}.`,
    )
  }

  const loaded = await loadProject(options.root)
  if (!loaded.ok) {
    for (const diagnostic of loaded.diagnostics) {
      options.writeError(`${diagnostic.path}: ${diagnostic.message}`)
    }
    return hadConfig ? 2 : 0
  }

  const { config, snapshots } = loaded.project
  const bySource = new Map(snapshots.map((snapshot) => [snapshot.source.id, snapshot]))
  const designs: DesignSystemSnapshot[] = []
  const codes: DesignSystemSnapshot[] = []
  for (const source of config.sources) {
    const snapshot = bySource.get(source.id)
    if (snapshot === undefined) continue
    ;(source.role === 'design' ? designs : codes).push(snapshot)
  }

  if (designs.length === 0 || codes.length === 0) {
    options.write(
      [
        '',
        'Next steps:',
        '  1. Export design/figma.snapshot.json with the Design CI Figma plugin and commit it.',
        '  2. Point sources at your code tokens (CSS custom properties, tokens JSON, or a resolved Tailwind theme).',
        '  3. Re-run `designci init` — it will propose token mappings for you to confirm.',
        '  4. Run `designci check`.',
        '',
        'Docs: https://github.com/usedesignci/designci#readme',
      ].join('\n'),
    )
    return 0
  }

  const pairs: PairSuggestions[] = []
  for (const design of designs) {
    for (const code of codes) {
      const suggestions = suggestMappings(design, code, { existing: config.mappings })
      if (suggestions.length > 0) {
        pairs.push({
          designId: design.source.id as string,
          codeId: code.source.id as string,
          suggestions,
        })
      }
    }
  }

  if (pairs.length === 0) {
    options.write(
      config.mappings.length === 0
        ? 'No mapping suggestions: no token values or names line up across sources yet.'
        : 'No new mapping suggestions — every pair that lines up is already mapped.',
    )
    await offerBaseline(options)
    return 0
  }

  let accepted: readonly MappingSuggestion[]
  if (options.acceptSuggestions === true) {
    // Bulk mode accepts only agreeing pairs. A drift pair is a claim that two
    // tokens disagree; that claim gets a human eye or it stays out of config.
    accepted = pairs.flatMap((pair) => pair.suggestions.filter((s) => s.kind === 'match'))
    printSuggestions(pairs, options.write)
  } else if (options.ask !== undefined) {
    accepted = await confirmInteractively(pairs, options.ask, options.write)
  } else {
    printSuggestions(pairs, options.write)
    options.write(
      '\nNothing was written. Re-run in a terminal to confirm pairs interactively, or pass --accept-suggestions to accept every value match.',
    )
    return 0
  }

  if (accepted.length === 0) {
    options.write('\nNo mappings accepted; the config is unchanged.')
    await offerBaseline(options)
    return 0
  }

  await writeMappings(configPath, accepted)
  const drifted = accepted.filter((suggestion) => suggestion.kind === 'drift').length
  options.write(
    [
      '',
      `Added ${accepted.length} mapping${accepted.length === 1 ? '' : 's'} to ${CONFIG_FILE}.`,
      ...(drifted > 0
        ? [
            `${drifted} of them pair${drifted === 1 ? 's' : ''} tokens whose values disagree — \`designci check\` will report that drift.`,
          ]
        : []),
      'Run `designci check`.',
    ].join('\n'),
  )
  await offerBaseline(options)
  return 0
}
