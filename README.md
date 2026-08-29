# Design CI

**CI for your design system.** Catch design drift between Figma and production
before it ships.

Design CI compares a design system's stated definitions — Figma variables and
styles — against what production actually ships: design tokens, CSS custom
properties, Tailwind config. Drift becomes a violation, violations fail a check,
and the check runs where the work happens.

Deterministic rules, no AI in the check path.

## Status

Pre-release, and not yet published to npm. `@designci/core` carries the engine:
the domain model, value normalization, and the rule runner. Adapters, the CLI,
the Figma plugin and the GitHub Action land in later milestones — see the Status
section of [CLAUDE.md](./CLAUDE.md) for where each one stands.

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
attaches severity from config, sorts, and scores.

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
