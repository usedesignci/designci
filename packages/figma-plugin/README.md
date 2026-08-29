# Design CI — Figma plugin

Run **Design Check** on a Figma file's variables and styles, and export the
snapshot that `designci check` compares against production.

## What it does

- **Export snapshot** — reads local variables (colours, scoped floats as px
  lengths, strings), paint styles, text styles and effect styles into a
  `figma.snapshot.json`. Commit it to the repo and point a `figma` source at it
  in `designci.config.json`; CI does the comparing where the code lives.
- **Run Design Check** — runs the same engine on the file alone: duplicate
  values under different names, dangling aliases, unsupported paints, multi-mode
  collections. Cross-source rules stand down without a code source, by design.
- **Check config** — paste the project's `designci.config.json`; it is stored in
  the file's plugin data so the whole team shares one policy.

No network access is declared in the manifest: no AI, no telemetry, everything
runs locally (invariant 2).

## What it deliberately does not do

- Only a collection's **default mode** is exported. A second mode is a theme,
  and comparing a dark value against code's default would manufacture drift —
  the same rule the CSS adapter applies to `@media` blocks (invariant 14).
- Booleans, easing variables, gradient paints and non-shadow effects are
  surfaced as diagnostics, never guessed at.

## Development

```bash
pnpm install
pnpm --filter @designci/figma-plugin build   # bundles dist/main.js + dist/ui.html
```

In the Figma desktop app: Plugins → Development → Import plugin from manifest →
pick `packages/figma-plugin/manifest.json`. Figma assigns the real plugin `id`
on first Community publish; the placeholder in the manifest only matters then.
