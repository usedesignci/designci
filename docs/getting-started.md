# Getting started

Setting up Design CI takes one designer and one engineer, about five minutes
each. If you want to see it working before wiring your own project, clone
[usedesignci/demo](https://github.com/usedesignci/demo) and run
`npx designci check` — it fails on three seeded drifts on purpose.

## The designer's five minutes (in Figma)

1. **Run the Design CI plugin** in your design-system file. It scans
   automatically when it opens: canvas issues (raw colors, off-scale spacing
   and radii, detached instances, WCAG text contrast) and your token
   inventory, with one-click fixes for most findings. No setup needed for
   this — it runs entirely locally.
2. **Export the snapshot** (Home → Export snapshot). The downloaded
   `figma.snapshot.json` is the design side of the conversation: every
   variable and style, with normalized values. Hand it to whoever owns the
   repo — or skip the handoff entirely by
   [connecting the repo once](./figma-plugin.md#repo-sync), after which
   pushing updates is one click and arrives as a pull request.

## The engineer's five minutes (in the repo)

```bash
mkdir -p design && mv ~/Downloads/figma.snapshot.json design/
npx designci init
```

`init` is a wizard, and it does four things:

1. **Detects your sources** — the committed snapshot, plus code tokens in
   conventional places (a tokens CSS file, a tokens JSON file, a resolved
   Tailwind theme) — and writes `designci.config.json` pointing at them.
2. **Proposes token mappings** where values agree across sources (through
   normalization, so `#FF6B00` pairs with `rgb(255 107 0)`), with stock
   Tailwind defaults batched separately from your own decisions. You confirm
   each pair — [equivalence is declared, never inferred](./configuration.md#mappings).
3. **Surfaces probable drift**: pairs whose names line up but whose values
   disagree. Confirming one records the pairing and hands you your first real
   finding before setup is even done.
4. **Offers the baseline** so you end green: accept today's drift, and CI
   fails only on drift introduced *after* this moment. Accepted violations
   still count against the health score — the number keeps telling the truth
   while the check stays quiet.

Then:

```bash
npx designci check
```

Exit code `0` means no unaccepted error-severity drift; `1` means drift that
should block a merge; `2` means the check could not run at all (a missing
config or an unreadable source is never a silent green).

## Put it on every pull request

```yaml
# .github/workflows/design-ci.yml
name: Design CI
on: pull_request
permissions:
  contents: read
  checks: write
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: usedesignci/designci-action@v1
```

Violations appear as inline annotations on the PR and a job summary table.
See [the GitHub Action](./github-action.md) for inputs.

## The loop, ongoing

- **Design decisions change** → the designer re-exports (or one-click pushes)
  the snapshot; the PR that updates it runs the check, so a design change
  that contradicts shipped code fails visibly at the moment it changed.
- **Code changes** → any PR touching tokens gets checked against the
  committed snapshot.
- **The snapshot goes stale** → `check` nudges when the committed snapshot is
  more than 30 days old, and the plugin's Home tab always shows whether the
  repo copy is current.

## What red means (and what it doesn't)

Red means **new drift**: design and code disagree about a decision, and
nobody has said which side is right yet. Fix whichever side is wrong, or —
if the drift is genuinely accepted for now — run
`designci check --update-baseline` and let the health score carry the debt
honestly. Red is never a backlog; the backlog lives in the score.
