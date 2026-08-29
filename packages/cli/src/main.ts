#!/usr/bin/env node
/**
 * The `designci` executable.
 *
 * Argument handling is deliberately hand-rolled: two commands and three flags do
 * not justify a dependency, and the CLI's install weight is part of the product
 * — `npx designci check` should be near-instant in CI.
 */

import process from 'node:process'

import { check } from './commands/check.js'
import { init } from './commands/init.js'

const HELP = `designci — CI for your design system

Usage:
  designci init                 Write a starter designci.config.json
  designci check                Compare sources and report drift
  designci check --json         Print the CheckResult as JSON
  designci check --update-baseline
                                Accept all current drift into designci.baseline.json

Options:
  --no-color     Disable colour (also respects NO_COLOR)
  -h, --help     Show this help
  -v, --version  Show the version

Exit codes:
  0  no unaccepted error-severity drift
  1  drift that should block the merge
  2  the check could not run
`

export interface MainIo {
  readonly argv: readonly string[]
  readonly cwd: string
  readonly isTty: boolean
  readonly env: Readonly<Record<string, string | undefined>>
  readonly write: (text: string) => void
  readonly writeError: (text: string) => void
  readonly version: string
}

export async function main(io: MainIo): Promise<number> {
  const args = [...io.argv]
  const flags = new Set(args.filter((arg) => arg.startsWith('-')))
  const commands = args.filter((arg) => !arg.startsWith('-'))

  if (flags.has('-v') || flags.has('--version')) {
    io.write(io.version)
    return 0
  }

  if (flags.has('-h') || flags.has('--help')) {
    io.write(HELP)
    return 0
  }

  if (commands.length === 0) {
    io.write(HELP)
    return 2
  }

  // NO_COLOR (no-color.org): any value, even empty, disables colour.
  const color = !flags.has('--no-color') && io.env['NO_COLOR'] === undefined && io.isTty

  const known = new Set(['--json', '--update-baseline', '--no-color', '-h', '--help', '-v', '--version'])
  for (const flag of flags) {
    if (!known.has(flag)) {
      io.writeError(`unknown option ${flag}\n\n${HELP}`)
      return 2
    }
  }

  const [command] = commands
  switch (command) {
    case 'init':
      return init({ root: io.cwd, write: io.write, writeError: io.writeError })
    case 'check':
      return check({
        root: io.cwd,
        json: flags.has('--json'),
        color: color && !flags.has('--json'),
        updateBaseline: flags.has('--update-baseline'),
        write: io.write,
        writeError: io.writeError,
      })
    default:
      io.writeError(`unknown command ${command ?? ''}\n\n${HELP}`)
      return 2
  }
}

/* v8 ignore start -- the process wiring; everything it calls is tested above. */
const invokedDirectly = process.argv[1] !== undefined && import.meta.url.endsWith('main.js')
if (invokedDirectly) {
  const { version } = (await import('./version.js')) as { version: string }
  const code = await main({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    isTty: process.stdout.isTTY === true,
    env: process.env,
    write: (text) => process.stdout.write(`${text}\n`),
    writeError: (text) => process.stderr.write(`${text}\n`),
    version,
  })
  process.exitCode = code
}
/* v8 ignore stop */
