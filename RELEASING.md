# Releasing

The first publish is M4's irreversible step: an npm name, once taken, is taken.
Everything below is prepared; the `npm publish` itself is a human action.

## Package names

- `@designci/core` — the engine.
- `designci` — the CLI. Unscoped so `npx designci check` works, which every
  README and blog post will quote. Verified unclaimed as of 2026-08-29.

Both are `private: true` in the repo. That flag is the only thing standing
between `pnpm publish -r` and an accidental publish, so it stays until the
moment of release.

## Releasing (repeatable)

One script runs the whole checklist in order and stops before anything
irreversible:

```bash
pnpm release 0.1.0             # rehearsal: bump, validate, build, dry-run pack
pnpm release 0.1.0 --publish   # publish core then CLI, commit, tag, push
```

The rehearsal touches nothing outside the working tree and restores it when
done; inspect the dry-run file lists it prints (expect dist/, package.json,
README.md, LICENSE only). --publish will prompt for your npm 2FA code.

Still human, by design:

1. **Once, before the first release**: create the `designci` org on npm (owns
   the `@designci` scope), enable 2FA, and `npm login`.
2. **Once, after the first release**: flip this repo public (checklist below)
   and split the Action repo (see "Publishing the GitHub Action").
3. Smoke-test each release from the registry:
   `npx designci@<version> --version` in an empty directory.

The script bumps `packages/core/package.json`, `packages/cli/package.json`
and `packages/cli/src/version.ts` together, removes `private: true` at
release time (idempotent afterwards), validates (typecheck, both test
suites, plugin build), verifies the built CLI reports the new version, and
publishes core before the CLI, which depends on it.

## Before the repo goes public (same milestone)

- `git log --all -p | grep -iE 'token|secret|key'` — no credentials in history.
- LICENSE (Apache-2.0) present; every package.json says `"license": "Apache-2.0"`.
- README quotes only commands that work against the published version.
- Enable branch protection on `main` (require CI).

## Every release after

Steps 2, 3, 5, 6, 7, 8. Version bumps follow semver against the *wire formats*
as much as the API: a change to `DesignSystemSnapshot`, `CheckResult`, config or
baseline schema is at least a minor, with the schemaVersion bumped and the old
version still readable.

## Publishing the GitHub Action (M6 human steps)

The action is developed in this repo under `action/` — that directory's
contents ARE the future `usedesignci/designci-action` repo root, verbatim,
except `tests/action-contract.test.mjs`, which stays here (it needs the
engine). The Marketplace requires the action to live in its own repository
with `action.yml` at the root.

1. ~~Create the repo~~ Done: `usedesignci/designci-action` exists, public,
   populated from `action/` (2026-08-29).
2. On later action releases, re-copy the tree:
   `cp -r action/* action/.github <clone>/`, commit, push.
   `node --test '*.test.mjs'` must pass there with no install step.
3. The action runs `npx designci@<version>`, so the CLI must be on npm before
   tagging (see "Releasing" above).
4. ~~Tag v1.0.0 + v1~~ Done (2026-08-29), pointing at the 'Design CI Check'
   rename — the Marketplace requires a globally unique display name. On later
   releases, move `v1` forward (`git tag -f v1 && git push -f origin v1`).
5. ~~Marketplace~~ Live: https://github.com/marketplace/actions/design-ci-check

`action/` in this repo stays the source of truth; releasing a new action
version means re-copying and re-tagging.
