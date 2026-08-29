# Design CI

**CI for your design system.** Catch design drift between Figma and production
before it ships.

Design CI compares a design system's stated definitions — Figma variables and
styles — against what production actually ships: design tokens, CSS custom
properties, Tailwind config. Drift becomes a violation, violations fail a check,
and the check runs where the work happens.

Deterministic rules, no AI in the check path.

## Status

Pre-release, and not yet published to npm. The engine (`@designci/core`), the
CLI (`designci`) and the Figma plugin are built; the GitHub Action and dashboard
land in later milestones — see the Status section of [CLAUDE.md](./CLAUDE.md).

The [Figma plugin](./packages/figma-plugin) exports the `figma.snapshot.json`
that the CLI's `figma` source reads, and runs the same engine inside Figma for
single-file checks — duplicate values, dangling aliases, unsupported paints.

## Quick start

```bash
npx designci init    # writes designci.config.json
npx designci check   # compares your sources, exits 1 on drift
```

```
Design CI — Acme

  ✓ 48 of 50 tokens clean

  ✕ radius.lg  src/styles/tokens.css:32
    radius.lg is 6px in src/styles/tokens.css but 8px in Figma
      wrote:    6px
      expected: 8px
      fix: Set radius.lg to 8px

  Design health: 95%

  1 error, 5 warnings, 0 info
```

Sources are declared in config: a Figma snapshot (exported by the Design CI
plugin), a tokens JSON file, a stylesheet, or a resolved Tailwind theme. Already
drifted? `designci check --update-baseline` accepts the current state; CI then
fails only on drift introduced after it.

## What the engine does today

```ts
import { allRules, runCheck } from '@designci/core'

const result = runCheck({ snapshots, rules: allRules, config })

result.health.overall  // 97
result.counts          // { error: 1, warn: 2, info: 0, total: 3 }
result.violations      // sorted, deterministic, JSON-stable
```

Each source — a Figma export, a tokens file, a stylesheet — becomes a
`DesignSystemSnapshot`. Rules read snapshots and emit findings; the runner
attaches severity from config, applies any baseline, sorts, and scores.

Config is written as policy plus explicit mappings:

```json
{
  "rules": { "token-value-mismatch": "error", "duplicate-token": "warn" },
  "mappings": [
    { "figma": "radius.lg", "css": "--radius-lg" }
  ]
}
```

Core validates that document but never reads it off disk — `parseConfig` and
`parseBaseline` take an already-decoded value. The CLI does the file I/O; the
Figma plugin has no filesystem and parses the same formats from plugin storage.

### Real sources, read as they are written

Three adapters turn source formats into snapshots:

- **Tokens JSON** — the W3C Design Tokens format, with `$type` inherited from
  groups, plus the unprefixed `value`/`type` spelling Style Dictionary and Tokens
  Studio still emit.
- **CSS** — custom properties, found wherever they are declared. Declarations
  inside `@media`, `@supports` or `@container` are reported and skipped: a
  dark-theme override is a different *mode* of a token, not its default, and
  comparing it against a light design variable would manufacture drift.
- **Tailwind** — a resolved theme object (`resolveConfig(config).theme`), with
  each scale typed from Tailwind's own schema. `fontSize: ['1rem', '1.5rem']` is
  read as a type ramp, not a length.

A format that declares types is believed. Where none is declared, the type comes
from the value's syntax: `--radius-lg: 8px` is a length because `8px` parses as
one, not because of what the property is called.

### Values are compared, never strings

`#FF6B00` and `rgb(255 107 0)` are one colour. `1rem` and `16px` are one length.
`0.15s` and `150ms` are one duration. An object shadow from Figma and a CSS
shadow string are one shadow. Everything routes through `normalize/` first,
because a linter that cries wolf on a spelling difference gets switched off.

Values that cannot be resolved — `currentColor`, `calc()`, an unsupported colour
space — are marked unnormalized with a reason and skipped, never guessed at.

### Equivalence is declared, never inferred

The engine will not decide that `color/brand/primary` means `--color-primary`.
Cross-source relationships come from explicit mappings in config. A design token
with no mapping is reported as unmapped, which is a fact; guessing at a match
would produce a confident report about a relationship nobody stated.

### Adoption does not start with a red build

A real design system has years of accumulated drift, so failing the first build
on all of it just gets the tool removed. A baseline records the current state as
accepted; CI then fails only on drift introduced *after* it.

A baseline suppresses the failure, not the drift. Accepted violations stay in the
result and still count against the health score, so the dashboard keeps telling
the truth and the number improves only when the system does. Entries that stop
matching are reported as stale, so a fixed drift cannot silently come back.

### Runs are reproducible

Rules are pure functions of their context — no file access, no network, no
clock, no randomness. The runner imposes a total order on violations, so
identical inputs serialize to byte-identical JSON. That is what makes results
usable as baselines, cache keys, and diffable CI artifacts.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
```

Node 22, pnpm 9+.

`packages/core/src/fixtures/small-system.ts` is the shared test corpus: a
25-token system in a Figma variant and a CSS variant, agreeing on values while
disagreeing on notation almost everywhere, with three drifts seeded — one value
mismatch, one missing token, one duplicate. Downstream milestones test against
it rather than inventing new data.

## License

Apache-2.0. See [LICENSE](./LICENSE).
