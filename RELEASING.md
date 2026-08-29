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

## First release checklist

1. **npm org**: create the `designci` org on npm (owns the `@designci` scope)
   and enable 2FA for publishes.
2. **Verify the tree**: `pnpm install && pnpm typecheck && pnpm test` — green.
3. **Set the version** in `packages/core/package.json`,
   `packages/cli/package.json`, and `packages/cli/src/version.ts` (all three;
   the CLI reports the constant). First release: `0.1.0`.
4. **Flip `private`**: remove `"private": true` from both packages. Do not
   remove it from the workspace root.
5. **Build clean**: `pnpm clean && pnpm build`.
6. **Dry-run**: `pnpm --filter @designci/core publish --dry-run` and the same
   for `designci`. Check the file list — `dist/`, `package.json`, `README.md`,
   `LICENSE` only.
7. **Publish core first**, then the CLI (it depends on core):
   `pnpm --filter @designci/core publish --access public`
   `pnpm --filter designci publish --access public`
   pnpm rewrites `workspace:*` to the real version at pack time.
8. **Tag**: `git tag v0.1.0 && git push origin v0.1.0`.
9. **Smoke-test from the registry**: in an empty directory,
   `npx designci@latest init && npx designci check` (expect exit 2 with
   guidance, since the starter sources do not exist).

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

1. Create the empty repo `usedesignci/designci-action` (public — Marketplace
   requires it; do this together with this repo's public flip).
2. Copy the tree: `cp -r action/* action/.github <clone>/ && cd <clone>`,
   commit, push to main. `node --test '*.test.mjs'` must pass there with no
   install step.
3. The action runs `npx designci@<version>`, so the CLI must be on npm first
   (see the first-release checklist above).
4. Tag `v1.0.0` AND the moving major `v1` (`git tag v1 && git push origin
   v1 v1.0.0`) — workflows reference `usedesignci/designci-action@v1`. On
   later releases, move `v1` forward (`git tag -f v1 && git push -f origin v1`).
5. Publish to the Marketplace from the repo's Releases page (category:
   Continuous Integration).

`action/` in this repo stays the source of truth; releasing a new action
version means re-copying and re-tagging.
