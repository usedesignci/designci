# Configuration

Everything lives in one file at the repo root: `designci.config.json`.
`designci init` writes and extends it; this page is the full reference.

```json
{
  "name": "Acme design system",
  "sources": [
    { "id": "figma", "kind": "figma", "path": "design/figma.snapshot.json" },
    { "id": "css", "kind": "css", "path": "src/styles/tokens.css" }
  ],
  "rules": {
    "token-value-mismatch": "error",
    "missing-token": "warn",
    "duplicate-token": "warn"
  },
  "mappings": [
    { "figma": "color.brand.primary", "css": "--color-brand-primary" }
  ]
}
```

A malformed config never runs a half-policy: a bad severity or mapping fails
the check with exit code 2 and a diagnostic naming the exact path. A stray
unknown key parses with a warning — refusing to run over a typo would be
worse than telling you about it.

## `sources`

Each source is one place design decisions are written down. `kind` is
required; everything else has a sensible default.

| Field | Meaning | Default |
| --- | --- | --- |
| `kind` | `figma`, `css`, `tokens-json`, or `tailwind` | required |
| `id` | How mappings refer to this source | the kind |
| `path` | File to read, relative to the config | required for the CLI |
| `role` | `design` or `code` | `design` for figma, `code` otherwise |
| `label` | Display name in reports | the path |

What each kind reads:

- **`figma`** — the snapshot exported by the Design CI plugin.
- **`css`** — custom properties, wherever they are declared. Declarations
  inside `@media`, `@supports` or `@container` are reported and skipped: a
  dark-theme override is a different *mode* of a token, not its default, and
  comparing it against a light design value would manufacture drift.
- **`tokens-json`** — the W3C Design Tokens format (`$type`/`$value`,
  inherited group types), plus the unprefixed spelling Style Dictionary and
  Tokens Studio emit.
- **`tailwind`** — a **resolved theme object** as JSON
  (`resolveConfig(config).theme`), each scale typed from Tailwind's own
  schema. Design CI deliberately does not execute your `tailwind.config.ts`;
  resolving it means running your code. A small script that writes
  `JSON.stringify(resolveConfig(config).theme)` to a committed JSON file is
  the usual bridge.

## `rules`

Severity is policy, not rule logic. Every rule id from the
[rules reference](./rules.md) can be set to `off`, `info`, `warn` or
`error` — shorthand string or object form:

```json
"rules": {
  "token-value-mismatch": "error",
  "canvas-raw-color": { "severity": "warn" }
}
```

`off` skips the rule entirely. The same config drives the CLI, the GitHub
Action, and the Figma plugin (paste it under Settings → Check config there —
it is stored in the file, so the whole team shares one policy). Only
error-severity violations move the exit code; warnings and info report
without blocking.

## `mappings`

A mapping states that two (or more) tokens are **the same design decision**:

```json
{ "figma": "radius.lg", "css": "--radius-lg" }
```

Keys are source ids; values are token ids in that source. An entry naming
three sources declares all three equivalent. There is deliberately no
pattern or prefix form — a glob that turned `color.*` into `--color-*` would
be exactly the name-based guessing the engine forbids. The
[init wizard](./cli.md#designci-init) proposes mappings from value equality
so you rarely write these by hand, but every pair in the file is one a human
confirmed.

## `rootFontSizePx`

Optional number (default `16`) used to convert `rem`/`em` values to px for
comparison. Set it if your product changes the root font size.

## The baseline file

`designci.baseline.json` sits next to the config and records accepted drift —
see [baselines](./cli.md#baselines). It is written by
`designci check --update-baseline` (or the init wizard's final step), never
by hand.
