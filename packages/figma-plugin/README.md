# Design CI — Figma plugin

Run **Design Check** on a Figma file's variables and styles, and export the
snapshot that `designci check` compares against production.

📚 **[Full plugin guide](https://github.com/usedesignci/designci/blob/main/docs/figma-plugin.md)** —
auto-scan, one-click fixes, promoting values to variables, repo sync setup.

## What it does

- **Run Design Check** — a full scan of the current page:
  - **Canvas lint**: raw colors (visible solid paints with no bound variable
    and no paint style — with the matching token named when the value already
    exists in the system), off-scale spacing and radii, detached component
    instances, and WCAG AA text contrast. Every issue links to its layers —
    Select jumps straight to them — and can be ignored per file or the rule
    disabled outright.
  - **Token checks**: the same engine CI runs — duplicate values under
    different names, dangling aliases, unsupported paints, multi-mode
    collections. Cross-source rules stand down without a code source, by
    design, and canvas findings never enter the health score: that number is
    computed by the engine over token comparison, nowhere else.
  - **Inventory**: token counts by category and component sets with their
    variant properties (display only).
- **Export snapshot** — reads local variables (colours, scoped floats as px
  lengths, strings), paint styles, text styles and effect styles into a
  `figma.snapshot.json`. Commit it to the repo and point a `figma` source at it
  in `designci.config.json`; CI does the comparing where the code lives.
- **Settings** — paste the project's `designci.config.json` (stored in the
  file's plugin data so the whole team shares one policy — canvas rule
  severities use the same `rules` map, e.g. `"canvas-raw-color": "error"`),
  and manage the file's ignored canvas issues.

No network access is declared in the manifest: no AI, no telemetry, everything
runs locally (invariant 2).

## What it deliberately does not do

- Only a collection's **default mode** is exported. A second mode is a theme,
  and comparing a dark value against code's default would manufacture drift —
  the same rule the CSS adapter applies to `@media` blocks (invariant 14).
- Booleans, easing variables, gradient paints and non-shadow effects are
  surfaced as diagnostics, never guessed at.
- Canvas lint judges **binding state and value equality only** — a raw color's
  suggestion is a token whose value is identical, never a name-similarity
  guess (invariant 4). What it cannot judge confidently (mixed radii,
  translucent text, gradient backgrounds) is reported as skipped, never
  guessed at. Scans cover the current page.

## Development

```bash
pnpm install
pnpm --filter @designci/figma-plugin build   # bundles dist/main.js + dist/ui.html
```

In the Figma desktop app: Plugins → Development → Import plugin from manifest →
pick `packages/figma-plugin/manifest.json`. Figma assigns the real plugin `id`
on first Community publish; the placeholder in the manifest only matters then.
