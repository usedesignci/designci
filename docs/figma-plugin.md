# The Figma plugin

The Design CI plugin runs the designer's half of the loop inside Figma:
scanning the file against its own tokens, fixing findings in one click,
exporting the snapshot CI compares against — and, optionally, pushing that
snapshot straight to GitHub as a pull request.

**Privacy model, up front:** every check runs locally in the plugin sandbox.
No AI, no telemetry. The only network call the plugin can ever make is to
`api.github.com`, only when you push to a repo you connected, and the
manifest allowlists exactly that one host. With no repo connected, nothing
leaves Figma.

## Scanning — it happens by itself

The plugin scans when it opens and re-scans automatically while it's open:
canvas edits and style changes are picked up from Figma's events, variable
edits by a lightweight poll. A burst of edits settles into one silent
refresh about a second later. **Run Design Check** is still there for an
explicit re-scan with the staged progress view.

A scan produces:

- **Canvas issues** on the current page — see the
  [canvas rules](./rules.md#canvas-rules): raw colors (with the matching
  token named when its value already exists), off-scale spacing and radii,
  detached instances, WCAG AA text contrast. Every issue lists its layers
  with jump-to-layer selection.
- **Token checks** over the file's own variables and styles (duplicates and
  the like), plus the token inventory and component sets.

Canvas issues are a designer's pre-flight and never enter the health score —
that number belongs to the design↔code comparison CI runs.

### The two kinds of "changed a color" (worth knowing)

Editing a **variable's value** (Variables panel) changes the design system —
the snapshot changes, and the repo copy shows as behind. Recoloring a
**layer** with the color picker changes the canvas only — and if the fill was
bound to a variable, the picker silently *unbinds* it, which is precisely
what the raw-color rule then flags. The plugin's cards reflect this honestly:
canvas edits don't move the sync state, because they don't change any token.

## One-click fixes

Findings that have a remedy which invents nothing carry a fix button:

- **Raw color with a matching token** → bind every offending fill/stroke to
  that variable.
- **Off-scale spacing/radius** → snap to the nearest scale step, bound to
  the token that holds it.
- **Failing text contrast** → switch the text to the nearest *existing*
  color token that passes AA against its background — the fix keeps the
  design inside its own system — or, when no token passes, the current color
  nudged toward black or white by the smallest step that passes.

Fixes are surgical: only the offending value moves, bound fields are never
touched, and the automatic re-scan shows the finding disappear.

## Promoting a value to a variable

A raw color that matches no token — or an off-scale value that genuinely
deserves to be a new scale step — can be **promoted**: the plugin proposes a
name from deterministic facts (the hue family for a color, the pixel value
for a step, prefixed with the file's own naming convention), you confirm or
rewrite it, and the variable is created in the collection where its peers
live and bound to the offending layers. Names are never invented silently;
the proposal is a placeholder and the input copy says so.

## Ignores and rule policy

- **Ignore this value / this layer** moves a finding aside without deleting
  it — ignores are stored in the file and shared with the team, and ignored
  findings stay counted.
- **Disable rule** sets its severity to `off` in the stored check config —
  the same policy channel the CLI uses. Paste your project's
  [`designci.config.json`](./configuration.md) under Settings → Check config
  so the plugin and CI enforce one policy.

## Exporting the snapshot

**Home → Export snapshot** downloads `figma.snapshot.json`: every variable
and style with normalized values, stamped with an export time (the CLI nudges
when the committed copy goes stale). Commit it to the repo —
`design/figma.snapshot.json` by convention — like a lockfile for design
decisions.

## Repo sync

Skip the download-and-hand-off entirely: connect the repo once and pushing
updates is one click, always as a pull request.

**Setup (Settings → Repo sync):**

1. Enter the repo owner and name (snapshot path and base branch are
   optional; defaults are `design/figma.snapshot.json` and the repo's
   default branch). These are stored in the Figma file for the whole team.
2. Create a **fine-grained personal access token** on GitHub
   (Settings → Developer settings → Fine-grained tokens): set the *resource
   owner* to the org that owns the repo, scope it to **only that
   repository**, and grant exactly two repository permissions —
   **Contents: read & write** and **Pull requests: read & write**.
3. Paste the token. It is stored in Figma's client storage on your machine —
   never in the shared file — and each teammate who pushes uses their own.

**How pushing works:** the Home card always shows whether the repo's copy of
the snapshot is current (content-compared, so a re-export with identical
tokens is not a change). When it's behind, one click commits the snapshot to
a `design-ci/snapshot` branch and opens — or updates — a pull request, where
the check runs. Identical content short-circuits: no empty commits, no
duplicate PRs. Design CI never commits to your default branch; the PR is
where a human decides which side of a disagreement is right.

## Troubleshooting

- **"Repo copy is up to date" after canvas edits** — expected: bindings and
  layer edits don't change token values. Only variable/style value changes
  sync. There's a *Push anyway* link if you want to force the comparison.
- **Token rejected / repo not found on push** — the token expired, or it
  lacks access: check the resource owner, the selected repository, and the
  two permissions above. Save a new token in Settings.
- **A fix says the variable no longer exists** — it was deleted since the
  scan; re-scan and the finding recomputes.
