/**
 * The CLI, end to end: a real project in a temp directory, driven through
 * `main()` exactly as the executable drives it, asserting output, exit codes,
 * and the files written.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { smallSystemCss } from '../../core/src/fixtures/small-system-css.js'
import * as fixture from '../../core/src/fixtures/small-system.js'
import { main } from './main.js'

let root = ''

interface Run {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

async function run(...argv: string[]): Promise<Run> {
  return runWith(undefined, ...argv)
}

/** Like `run`, but attached to a scripted "terminal" that answers prompts. */
async function runWith(answers: readonly string[] | undefined, ...argv: string[]): Promise<Run> {
  const stdout: string[] = []
  const stderr: string[] = []
  const remaining = answers === undefined ? undefined : [...answers]
  const code = await main({
    argv,
    cwd: root,
    isTty: false,
    env: {},
    write: (text) => stdout.push(text),
    writeError: (text) => stderr.push(text),
    ...(remaining === undefined
      ? {}
      : {
          ask: (question: string) => {
            stdout.push(question)
            return Promise.resolve(remaining.shift() ?? '')
          },
        }),
    version: '0.0.0-test',
  })
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') }
}

/** The corpus, laid out on disk the way a real repo would hold it. */
async function writeProject(withMappings = true): Promise<void> {
  await writeFile(
    path.join(root, 'designci.config.json'),
    JSON.stringify(
      {
        name: 'Small System',
        sources: [
          { id: 'figma', kind: 'figma', path: 'design/figma.snapshot.json' },
          { id: 'css', kind: 'css', path: 'src/styles/tokens.css' },
        ],
        mappings: withMappings
          ? (fixture.configDocument.mappings as Record<string, string>[]).map((entry) => ({
              figma: entry['figma'],
              css: entry['css'],
            }))
          : [],
      },
      null,
      2,
    ),
  )
  const { mkdir } = await import('node:fs/promises')
  await mkdir(path.join(root, 'design'), { recursive: true })
  await mkdir(path.join(root, 'src/styles'), { recursive: true })
  await writeFile(
    path.join(root, 'design/figma.snapshot.json'),
    JSON.stringify(fixture.figmaSnapshot),
  )
  await writeFile(path.join(root, 'src/styles/tokens.css'), smallSystemCss)
}

async function readConfig(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, 'designci.config.json'), 'utf8'))
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'designci-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('designci init', () => {
  it('writes a starter config and points at next steps', async () => {
    const result = await run('init')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('designci check')
    const written = await readConfig()
    expect(written['sources']).toHaveLength(2)
  })

  it('detects conventional source files and declares them', async () => {
    await writeProject(false)
    await rm(path.join(root, 'designci.config.json'))
    const result = await run('init')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('design/figma.snapshot.json')
    const written = await readConfig()
    const paths = (written['sources'] as { path: string }[]).map((source) => source.path)
    expect(paths).toContain('design/figma.snapshot.json')
    expect(paths).toContain('src/styles/tokens.css')
  })

  it('never clobbers an existing config', async () => {
    await writeFile(path.join(root, 'designci.config.json'), '{"name":"precious"}\n')
    const result = await run('init')
    expect(result.code).toBe(0)
    expect(await readFile(path.join(root, 'designci.config.json'), 'utf8')).toContain('precious')
  })

  it('prints suggestions without writing when not a terminal', async () => {
    await writeProject(false)
    const result = await run('init')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('agree in value')
    expect(result.stdout).toContain('disagreeing values')
    expect(result.stdout).toContain('Nothing was written')
    expect((await readConfig())['mappings']).toEqual([])
  })

  it('accepts value matches in bulk with --accept-suggestions, never drift pairs', async () => {
    await writeProject(false)
    const result = await run('init', '--accept-suggestions')
    expect(result.code).toBe(0)
    const mappings = (await readConfig())['mappings'] as Record<string, string>[]
    // 20, not 25: the drifted radius is excluded, the missing destructive
    // colour has no counterpart, and the stylesheet splits typography into
    // per-field variables that cannot match the composite Figma tokens.
    expect(mappings).toHaveLength(20)
    expect(mappings.some((entry) => entry['figma'] === 'radius.lg')).toBe(false)
    // The drifted radius stays unmapped, so check reports it as missing, not
    // as a mismatch — no policy was invented on the team's behalf.
    const check = await run('check')
    expect(check.code).toBe(0)
  })

  it('confirms interactively and records confirmed drift pairs', async () => {
    await writeProject(false)
    // 'a' accepts every remaining value match; '' takes the default Y on the
    // drift question.
    const result = await runWith(['a', ''], 'init')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Values disagree')
    const mappings = (await readConfig())['mappings'] as Record<string, string>[]
    expect(mappings).toHaveLength(21)
    expect(
      mappings.some(
        (entry) => entry['figma'] === 'radius.lg' && entry['css'] === '--radius-lg',
      ),
    ).toBe(true)
    // The confirmed drift pair is now a real finding.
    const check = await run('check')
    expect(check.code).toBe(1)
    expect(check.stdout).toContain('radius.lg')
  })

  it('has nothing to suggest for a fully mapped project', async () => {
    await writeProject()
    const result = await run('init')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('already mapped')
  })
})

describe('designci check', () => {
  it('reports the seeded drifts and exits 1', async () => {
    await writeProject()
    const result = await run('check')
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('Design CI — Small System')
    expect(result.stdout).toContain('radius.lg')
    expect(result.stdout).toContain('wrote:    6px')
    expect(result.stdout).toContain('expected: 8px')
    expect(result.stdout).toContain('src/styles/tokens.css:32')
    expect(result.stdout).toContain('Design health:')
  })

  it('emits no ANSI codes when not a TTY', async () => {
    await writeProject()
    const result = await run('check')
    expect(result.stdout).not.toContain('\u001b[')
  })

  it('prints a byte-stable CheckResult with --json (invariant 1)', async () => {
    await writeProject()
    const first = await run('check', '--json')
    const second = await run('check', '--json')
    expect(first.stdout).toBe(second.stdout)
    const parsed = JSON.parse(first.stdout)
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.counts.error).toBe(1)
  })

  it('exits 2 with guidance when there is no config', async () => {
    const result = await run('check')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('designci init')
  })

  it('exits 2 when a declared source cannot be read, rather than passing on less', async () => {
    await writeProject()
    await rm(path.join(root, 'src/styles/tokens.css'))
    const result = await run('check')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('tokens.css')
  })

  it('exits 2 on a config with an invalid severity', async () => {
    await writeProject()
    const config = JSON.parse(await readFile(path.join(root, 'designci.config.json'), 'utf8'))
    config.rules = { 'missing-token': 'loud' }
    await writeFile(path.join(root, 'designci.config.json'), JSON.stringify(config))
    const result = await run('check')
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('severity')
  })
})

describe('snapshot staleness', () => {
  async function stampSnapshot(exportedAt: string): Promise<void> {
    const file = path.join(root, 'design/figma.snapshot.json')
    const snapshot = JSON.parse(await readFile(file, 'utf8'))
    await writeFile(file, JSON.stringify({ ...snapshot, exportedAt }))
  }

  it('nudges to re-export when the snapshot is old, without moving the exit code', async () => {
    await writeProject()
    await stampSnapshot('2020-01-01T00:00:00.000Z')
    const result = await run('check')
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('days ago')
    expect(result.stdout).toContain('re-export')
  })

  it('stays quiet for a fresh snapshot and for one carrying no timestamp', async () => {
    await writeProject()
    await stampSnapshot(new Date().toISOString())
    expect((await run('check')).stdout).not.toContain('days ago')

    await writeProject() // rewrites the snapshot without exportedAt
    expect((await run('check')).stdout).not.toContain('days ago')
  })

  it('never leaks the note into --json output (invariant 1)', async () => {
    await writeProject()
    await stampSnapshot('2020-01-01T00:00:00.000Z')
    const result = await run('check', '--json')
    expect(result.stdout).not.toContain('days ago')
    expect(() => JSON.parse(result.stdout)).not.toThrow()
  })
})

describe('designci check --update-baseline', () => {
  it('accepts current drift, then check passes and still reports it', async () => {
    await writeProject()

    const update = await run('check', '--update-baseline')
    expect(update.code).toBe(0)
    expect(update.stdout).toContain('designci.baseline.json')

    const baseline = JSON.parse(await readFile(path.join(root, 'designci.baseline.json'), 'utf8'))
    expect(baseline.schemaVersion).toBe(1)
    expect(baseline.entries.length).toBeGreaterThan(0)

    const after = await run('check')
    expect(after.code).toBe(0)
    expect(after.stdout).toContain('accepted in the baseline')
    // Health still reflects the drift (invariant 11).
    expect(after.stdout).not.toContain('Design health: 100%')
  })

  it('fails on drift introduced after the baseline', async () => {
    await writeProject()
    await run('check', '--update-baseline')

    // A new drift: darken the brand colour in CSS only.
    const cssPath = path.join(root, 'src/styles/tokens.css')
    const css = await readFile(cssPath, 'utf8')
    await writeFile(cssPath, css.replace('rgb(255 107 0);\n', '#e05e00;\n'))

    const result = await run('check')
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('color.brand.primary')
  })

  it('exits 2 rather than treating a corrupt baseline as empty', async () => {
    await writeProject()
    await writeFile(path.join(root, 'designci.baseline.json'), '{"entries": []}')
    const result = await run('check')
    expect(result.code).toBe(2)
  })
})

describe('argument handling', () => {
  it('prints help on --help and exits 0', async () => {
    const result = await run('--help')
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('designci check')
  })

  it('prints help and exits 2 when no command is given', async () => {
    const result = await run()
    expect(result.code).toBe(2)
  })

  it('rejects an unknown command and an unknown flag', async () => {
    expect((await run('lint')).code).toBe(2)
    expect((await run('check', '--fix')).code).toBe(2)
  })

  it('prints the version', async () => {
    const result = await run('--version')
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('0.0.0-test')
  })
})
