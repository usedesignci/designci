/**
 * `designci init` — writes a starter config.
 *
 * The starter declares the two most common sources and one example mapping,
 * commented through `//`-free JSON the only way JSON allows: descriptive keys
 * and a README pointer. It never overwrites an existing config — a config is
 * policy, and clobbering policy on a re-run would be destructive.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { CONFIG_FILE } from '../project.js'

const STARTER = {
  name: 'My design system',
  sources: [
    { id: 'figma', kind: 'figma', path: 'design/figma.snapshot.json' },
    { id: 'css', kind: 'css', path: 'src/styles/tokens.css' },
  ],
  rules: {
    'token-value-mismatch': 'error',
    'missing-token': 'warn',
    'duplicate-token': 'warn',
  },
  mappings: [{ figma: 'color.brand.primary', css: '--color-brand-primary' }],
}

export interface InitOptions {
  readonly root: string
  readonly write: (text: string) => void
  readonly writeError: (text: string) => void
}

export async function init(options: InitOptions): Promise<number> {
  const file = path.resolve(options.root, CONFIG_FILE)

  try {
    // wx: fail if the file exists rather than overwriting it.
    await writeFile(file, `${JSON.stringify(STARTER, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'EEXIST') {
      options.writeError(`${CONFIG_FILE} already exists; not overwriting it.`)
      return 2
    }
    const reason = cause instanceof Error ? cause.message : String(cause)
    options.writeError(`could not write ${CONFIG_FILE}: ${reason}`)
    return 2
  }

  options.write(
    [
      `Wrote ${CONFIG_FILE}.`,
      '',
      'Next steps:',
      '  1. Point sources at your real files (Figma snapshot export, tokens CSS).',
      '  2. Declare mappings: each entry names the same design decision in each source.',
      '  3. Run `designci check`.',
      '',
      'Docs: https://github.com/usedesignci/designci#readme',
    ].join('\n'),
  )
  return 0
}
