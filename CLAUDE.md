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
- usedesignci/demo — Demo kit: seeded-drift Tailwind app + starter Figma file.

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
   color/brand/primary to --color-primary.
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
14. Conditional CSS is not a default. Declarations inside @media, @supports or
    @container are reported and skipped — a dark-theme override is a different
    mode of a token, and comparing it against a design source's default would
    manufacture drift.

## Status
M1 core domain + rule runner — done
M2a value normalization — done
M2b config, mappings, baseline — done
M3 adapters (tokens JSON, CSS, Tailwind) — done
M4 CLI + first npm publish + repo goes public — built; publish + public flip are
   human steps, see RELEASING.md
M5 Figma plugin (lint + snapshot export) — next
M6 GitHub Action — not started
M7 Rails control plane — not started
M8 release pipeline + demo kit — not started

All packages stay private: true until the human-run first publish (RELEASING.md)
— an accidental `pnpm publish -r` burns a name permanently. The CLI package is
named `designci` (unscoped, so `npx designci check` works); the engine is
@designci/core.

CLI exit codes are a contract the GitHub Action builds on: 0 clean, 1 unaccepted
error-severity drift, 2 could not run. A source that fails to load is a 2, never
a green check that silently compared less than it was asked to.

## Layout
packages/cli/src/
  main.ts      the designci executable; commands/ init + check; output/ render
  project.ts   the CLI's only I/O: read config, baseline and sources off disk
packages/core/src/
  domain/      token, snapshot, source, rule, violation, result
  normalize/   color, dimension, composite (typography+shadow), equal, value, types
  config/      parse (pure validation of a decoded config document)
  adapters/    tokens-json (W3C + Style Dictionary), css, tailwind, snapshot
  baseline/    fingerprint (drift identity), apply, parse
  runner/      run (the rule runner), order (total ordering), context
  rules/       one rule per file
  fixtures/    small-system: 25 tokens, Figma + CSS variants, 3 seeded drifts

fixtures/small-system.ts is the shared test corpus, with small-system-css.ts
holding the same system as real stylesheet text. Every downstream milestone tests
against these rather than inventing new data.

Adapters live in core rather than in separate packages: they are pure and
dependency-free, so isolating them buys nothing while cross-package version skew
against the domain types would be a real hazard. Split them out if one ever needs
a dependency of its own.
