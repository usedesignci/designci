# Design CI — agent guide

CI for design systems. Compares Figma design-system definitions (via exported
snapshots) with production design tokens and code to catch drift before it ships.

## Commands
pnpm install
pnpm typecheck      # tsc -b across the workspace
pnpm test           # vitest run

Node 22, pnpm 9. Always run `pnpm typecheck && pnpm test` before committing.

## Repositories
- usedesignci/designci — this repo. Engine, adapters, CLI, Figma plugin. Apache-2.0, public at M4.
- usedesignci/designci-action — GitHub Action. Separate repo; Marketplace requires it. Thin wrapper over the published CLI.
- usedesignci/cloud — Rails control plane. Private, permanently.
- usedesignci/demo — Demo kit (Beacon): seeded-drift app + plugin-exported
  snapshot; README walkthrough verified against the real CLI.

## Invariants
These are not preferences. Breaking one silently is worse than not shipping the feature.

1. Determinism. Rules are pure functions of RuleContext — no file access, no
   network, no clock, no randomness. The runner sorts through compareViolations
   so identical inputs produce byte-identical JSON. The test asserting this must
   never be deleted or weakened.
2. No AI in the check path. Ever, in V1.
3. No raw string comparison of values. Everything routes through
   packages/core/src/normalize. #FF6B00 equals rgb(255 107 0); 1rem equals 16px.
   This module is the defense against false positives, the top product risk.
4. Names are never inferred. Cross-source equivalence comes only from explicit
   config mappings via RuleContext.resolveMapping. Never heuristically match
   color/brand/primary to --color-primary. The `init` suggester (core/suggest)
   may *propose* pairs from values and names, but nothing is written without a
   human confirming each one, and the check path never calls it.
5. Severity is policy, not rule logic. Rules emit RuleFinding with no severity;
   the runner attaches it from config. 'off' skips execution.
6. One health score. healthScore() in packages/core/src/health.ts. CLI, plugin,
   Action, and dashboard all import it. Never reimplement.
7. Parse failures are typed and surfaced. ParseResult discriminated union. Never
   throw, never silently skip malformed input — it becomes a ParseDiagnostic.
8. `raw` is never discarded. Normalization annotates; violations show the author
   what they actually wrote.
9. Schema versions on wire formats. DesignSystemSnapshot and CheckResult both
   carry schemaVersion.
10. Optional means absent. exactOptionalPropertyTypes is on; omit optional keys
    rather than setting undefined. Keeps JSON and baseline fingerprints stable.
11. Baselines suppress CI failure, never the drift. Baselined violations stay in
    CheckResult and still count in healthScore(). If suppressing raised the
    score, the drift trend would measure how much teams baseline rather than how
    healthy their system is.
12. Core never touches the filesystem. parseConfig, parseBaseline and every
    adapter take an already-decoded value or raw text; the CLI reads files, and
    the Figma plugin — which has no filesystem at all — parses the same formats
    from its own storage. parseTailwindTheme takes a resolved theme object, never
    a config path: resolving one means running a bundler over user code.
13. Types come from the value, never the name. A format that declares a type is
    authoritative; where none is declared, inferValue reads the value's syntax.
    `--color-x: 4px` is a dimension. Typing by name is the first step toward the
    name-based matching invariant 4 forbids.
14. Conditional values are not defaults. CSS declarations inside @media,
    @supports or @container are reported and skipped; Figma collections export
    only their default mode, with extra modes surfaced in a diagnostic. A theme
    override compared against the other side's default would manufacture drift.
15. In the plugin, the sandbox boundary is collect.ts and it contains no
    decisions. Every judgment lives in extract.ts, which is pure over
    serializable shapes and fully tested outside Figma.

## Status
M1 core domain + rule runner — done
M2a value normalization — done
M2b config, mappings, baseline — done
M3 adapters (tokens JSON, CSS, Tailwind) — done
M4 CLI + first npm publish + repo goes public — built; publish + public flip are
   human steps, see RELEASING.md
M5 Figma plugin (lint + snapshot export) — done; Community publish is a human
   step (Figma assigns the plugin id then)
M6 GitHub Action — done; action/ is the source of truth, copied verbatim to
   usedesignci/designci-action. Tags + Marketplace publish wait on the first
   npm publish, see RELEASING.md
M7 Rails control plane — done (usedesignci/cloud): ingest API + dashboard;
   billing, GitHub App and Figma OAuth deliberately deferred
M8 release pipeline + demo kit — done: pnpm release (scripts/release.mjs) and
   usedesignci/demo (Beacon, 3 seeded drifts, verified against the real CLI).
   Publishing the Beacon starter file to Figma Community is a human step

All packages stay private: true until the human-run first publish (RELEASING.md)
— an accidental `pnpm publish -r` burns a name permanently. The CLI package is
named `designci` (unscoped, so `npx designci check` works); the engine is
@designci/core.

CLI exit codes are a contract the GitHub Action builds on: 0 clean, 1 unaccepted
error-severity drift, 2 could not run. A source that fails to load is a 2, never
a green check that silently compared less than it was asked to.

## Layout
packages/figma-plugin/src/
  extract.ts   pure: serializable Figma shapes -> DesignSystemSnapshot
  lint.ts      pure: canvas shapes + snapshot -> canvas findings (raw colors,
               off-scale spacing/radii, detached instances, WCAG contrast).
               Judgments are binding state + value equality only; findings
               never enter healthScore()
  fix.ts       pure auto-fix decisions: bind value-equal colors, snap to the
               nearest scale step, recolor failing text (existing passing token
               preferred, computed color only as fallback); never invents a
               name or variable. Promotion PROPOSES names (hue family, px
               value, the file's own prefix) — a human confirms in an input
               before anything is created. main.ts applies at the boundary
  contrast.ts  pure WCAG math; ignores.ts pure ignore keys; rule-docs.ts prose
  sync.ts      pure: snapshot content hash (exportedAt excluded), commit/PR
               copy, SyncSettings parsing — the judgments behind repo sync
  ui/github.ts the only networked module anywhere in the plugin: pushes the
               snapshot to a design-ci/snapshot branch + reused PR via
               api.github.com, the manifest's single allowlisted host. fetch is
               injected and every path is tested against a scripted fake. The
               check path never touches it (invariant 2); the PAT lives in
               figma.clientStorage (per-user), never in the shared document
  collect.ts   the only module touching the figma global; contains no decisions
  main.ts      plugin entry / message router; messages.ts the typed protocol
  ui/          Preact app (Home/Scan/Settings), bundled inline into dist/ui.html
               by build.mjs; tsconfig.ui.json is its DOM/JSX project
action/         staging tree for usedesignci/designci-action: action.yml,
                annotate.mjs (dependency-free formatter), node:test suite;
                tests/action-contract.test.mjs runs it against a real engine
                result, monorepo-only
packages/cli/src/
  main.ts      the designci executable; commands/ init + check; output/ render.
               init is the onboarding wizard: detects source files, runs the
               core suggester, confirms pairs interactively (or in bulk with
               --accept-suggestions; drift pairs always need a human yes), and
               ends by offering the baseline so setup finishes green
  project.ts   the CLI's only I/O: read config, baseline and sources off disk
packages/core/src/
  domain/      token, snapshot, source, rule, violation, result
  normalize/   color, dimension, composite (typography+shadow), equal, value, types
  config/      parse (pure validation of a decoded config document)
  adapters/    tokens-json (W3C + Style Dictionary), css, tailwind, snapshot
  baseline/    fingerprint (drift identity), apply, parse
  runner/      run (the rule runner), order (total ordering), context
  suggest/     mapping proposals for init — value matches, drift candidates,
               stock-Tailwind awareness (table generated by
               scripts/generate-tailwind-stock.mjs); never in the check path
  rules/       one rule per file
  fixtures/    small-system: 25 tokens, Figma + CSS variants, 3 seeded drifts

fixtures/small-system.ts is the shared test corpus, with small-system-css.ts
holding the same system as real stylesheet text and the plugin's
fixtures/small-system-figma.ts holding it as a Figma document export. Every downstream milestone tests
against these rather than inventing new data.

Adapters live in core rather than in separate packages: they are pure and
dependency-free, so isolating them buys nothing while cross-package version skew
against the domain types would be a real hazard. Split them out if one ever needs
a dependency of its own.
