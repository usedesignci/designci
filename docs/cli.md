# The CLI

```bash
npm install -D designci    # or run everything through npx
```

Two commands. `init` sets a project up; `check` is what CI runs.

## `designci init`

The onboarding wizard. Safe to re-run at any time — it never overwrites an
existing config or baseline, only extends them.

1. **No config yet?** It detects source files in conventional locations
   (`design/figma.snapshot.json`, `src/styles/tokens.css`, `tokens.json`,
   `tailwind.theme.json`, …) and writes a starter
   [`designci.config.json`](./configuration.md).
2. **Sources load?** It proposes token mappings: pairs whose values agree
   through normalization, ranked by how well the names line up, with stock
   Tailwind defaults batched separately from your own decisions. Pairs whose
   names align but whose values *disagree* are surfaced as probable drift.
   You confirm each pair (`y`/`n`, `a` for all remaining matches, `q` to
   stop); confirmed pairs are appended to the config.
3. **It ends green.** If the check currently finds issues, the wizard offers
   to accept them into the baseline so CI starts green and fails only on new
   drift.

Flags:

- `--accept-suggestions` — accept every value-agreeing proposal without
  prompting (for scripted setups). Drift pairs and the baseline still
  require an interactive yes; nothing contentious is ever decided silently.

## `designci check`

Loads the config, reads every declared source, runs all
[rules](./rules.md), applies the baseline, and reports.

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

Exit codes are a contract (the GitHub Action builds on them):

| Code | Meaning |
| --- | --- |
| `0` | No unaccepted error-severity drift |
| `1` | Drift that should block the merge |
| `2` | The check could not run — missing config, unreadable source, invalid policy |

A source that fails to load is always a `2`, never a green check that
silently compared less than it was asked to.

Flags:

- `--json` — print the raw `CheckResult` instead of the report.
  Byte-stable: identical inputs serialize identically, so the output works
  as a cache key, a diffable artifact, or input to other tooling.
- `--update-baseline` — accept all current violations into
  `designci.baseline.json` (see below).
- `--no-color` — disable color (also respects `NO_COLOR`).

The human report also nudges when a committed snapshot is more than 30 days
old — a stale copy of Figma shouldn't quietly green-light old truth. The
nudge never appears in `--json` output and never moves the exit code.

## Baselines

`designci.baseline.json` records **accepted** drift. With a baseline in
place, `check` fails only on violations that are *not* in it — so a team
adopts Design CI without turning CI red on years of accumulated drift, and
red comes to mean exactly one thing: *something changed since we agreed*.

Three properties keep baselines honest:

- **Accepted drift still counts against the health score.** The baseline
  suppresses the failure, never the truth: the score improves only when the
  system does.
- **Stale entries are reported.** An entry that no longer matches anything
  (the drift was fixed) is surfaced, so a fixed drift cannot silently come
  back later behind an old acceptance.
- **A corrupt baseline is exit 2**, never treated as empty — silently
  accepting nothing would re-fail accepted drift; silently accepting
  everything would hide regressions.

Re-run `--update-baseline` whenever you deliberately accept the current
state; it regenerates the file from what is actually violated now.
