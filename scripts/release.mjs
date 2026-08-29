#!/usr/bin/env node
/**
 * The release script: everything RELEASING.md's checklist does by hand,
 * repeatable and in order, stopping before anything irreversible unless told
 * not to.
 *
 *   pnpm release 0.1.0             # rehearse: bump, validate, build, dry-run
 *   pnpm release 0.1.0 --publish   # the real thing: publish, commit, tag, push
 *
 * The default is a full rehearsal that touches nothing outside the working
 * tree: versions are bumped, checks run, both packages pack --dry-run so the
 * shipped file list is inspectable — then the working tree is restored. With
 * --publish it keeps the changes, publishes core then the CLI, commits,
 * tags vX.Y.Z, and pushes. npm may prompt for a 2FA one-time password at
 * publish; in CI, provide NODE_AUTH_TOKEN instead.
 *
 * Two things stay human, by design: creating the npm org (once, before the
 * first release) and flipping the repo public (once, after it — see
 * RELEASING.md).
 *
 * Zero dependencies: a release tool that needs an install step is one more
 * thing that can drift.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const VERSIONED_FILES = [
  'packages/core/package.json',
  'packages/cli/package.json',
  'packages/cli/src/version.ts',
]

/** Publish order matters: the CLI depends on core. */
const PACKAGES = [
  { filter: '@designci/core', dir: 'packages/core' },
  { filter: 'designci', dir: 'packages/cli' },
]

const args = process.argv.slice(2)
const publish = args.includes('--publish')
const version = args.find((arg) => !arg.startsWith('-'))

function fail(message) {
  process.stderr.write(`\nrelease: ${message}\n`)
  process.exit(1)
}

function run(command, commandArgs, options = {}) {
  process.stdout.write(`\n$ ${command} ${commandArgs.join(' ')}\n`)
  return execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit', ...options })
}

function capture(command, commandArgs) {
  return execFileSync(command, commandArgs, { cwd: root, encoding: 'utf8' }).trim()
}

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`usage: pnpm release <semver> [--publish]  (got ${JSON.stringify(version ?? '')})`)
}

/* --- Preflight: a release starts from a clean, pushed main. ------------- */

if (capture('git', ['status', '--porcelain']) !== '') {
  fail('the working tree is not clean; commit or stash first')
}
const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main') fail(`releases cut from main, not ${branch}`)
run('git', ['fetch', 'origin', 'main'])
if (capture('git', ['rev-parse', 'HEAD']) !== capture('git', ['rev-parse', 'origin/main'])) {
  fail('local main is not in sync with origin/main')
}
if (capture('git', ['tag', '--list', `v${version}`]) !== '') {
  fail(`tag v${version} already exists`)
}

/* --- Bump versions and flip private (idempotent after first release). --- */

const restore = () => run('git', ['checkout', '--', ...VERSIONED_FILES, 'pnpm-lock.yaml'])

for (const file of ['packages/core/package.json', 'packages/cli/package.json']) {
  const manifest = JSON.parse(readFileSync(path.join(root, file), 'utf8'))
  manifest.version = version
  // The only thing standing between `pnpm publish -r` and an accidental
  // publish is this flag, so it is removed here, at release time, and at no
  // other moment.
  delete manifest.private
  writeFileSync(path.join(root, file), `${JSON.stringify(manifest, null, 2)}\n`)
}
{
  const file = path.join(root, 'packages/cli/src/version.ts')
  const source = readFileSync(file, 'utf8')
  const bumped = source.replace(/export const version = '[^']*'/, `export const version = '${version}'`)
  if (bumped === source) fail('could not find the version constant in packages/cli/src/version.ts')
  writeFileSync(file, bumped)
}

try {
  /* --- Validate exactly what ships. ------------------------------------ */

  run('pnpm', ['install', '--frozen-lockfile'])
  run('pnpm', ['typecheck'])
  run('pnpm', ['test'])
  run('pnpm', ['test:action'])
  run('pnpm', ['--filter', '@designci/figma-plugin', 'build'])
  run('pnpm', ['clean'])
  run('pnpm', ['build'])

  // The CLI must actually run from its build output before anything ships.
  const reported = capture('node', ['packages/cli/dist/main.js', '--version'])
  if (reported !== version) {
    fail(`built CLI reports version ${JSON.stringify(reported)}, expected ${version}`)
  }

  /* --- Show what would be published, always. --------------------------- */

  for (const pkg of PACKAGES) {
    run('pnpm', ['--filter', pkg.filter, 'publish', '--access', 'public', '--dry-run', '--no-git-checks'])
  }

  if (!publish) {
    restore()
    process.stdout.write(`\nRehearsal for v${version} passed; nothing was published or committed.\n`)
    process.stdout.write(`Inspect the file lists above, then run: pnpm release ${version} --publish\n`)
    process.exit(0)
  }

  /* --- The real thing: publish, then record it in git. ------------------ */

  for (const pkg of PACKAGES) {
    run('pnpm', ['--filter', pkg.filter, 'publish', '--access', 'public', '--no-git-checks'])
  }

  run('git', ['add', ...VERSIONED_FILES, 'pnpm-lock.yaml'])
  run('git', ['commit', '-m', `Release v${version}`])
  run('git', ['tag', `v${version}`])
  run('git', ['push', 'origin', 'main', `v${version}`])

  process.stdout.write(`\nReleased v${version}.\n`)
  process.stdout.write(`Smoke-test from the registry: npx designci@${version} --version\n`)
  process.stdout.write(`If this was the first release: flip the repo public and split the Action repo (RELEASING.md).\n`)
} catch (cause) {
  if (!publish) restore()
  // If --publish failed after npm accepted a package, git has recorded
  // nothing yet: fix the cause and re-run; already-published versions fail
  // fast and idempotently at npm.
  throw cause
}
