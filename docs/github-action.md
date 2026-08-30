# The GitHub Action

[**Design CI Check**](https://github.com/marketplace/actions/design-ci-check)
runs `designci check` on every pull request, turns violations into inline PR
annotations and a job summary, and fails the check with the CLI's own exit
code. It is a thin wrapper over the published CLI — no engine logic lives in
the Action, so what CI reports is exactly what `npx designci check` reports
locally.

## Usage

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

The repo needs a [`designci.config.json`](./configuration.md) and the
sources it declares (the committed snapshot, your tokens file). That's it.

## Inputs

| Input | Meaning | Default |
| --- | --- | --- |
| `version` | `designci` CLI version to run. Pin an exact version for reproducible checks. | `latest` |
| `working-directory` | Directory containing `designci.config.json` | `.` |
| `annotations` | Emit inline PR annotations for violations | `true` |
| `node-version` | Node.js to set up (designci needs 22+) | `22` |

## Outputs

| Output | Meaning |
| --- | --- |
| `health` | Overall design health score, 0–100 |
| `violations` | Count of unaccepted violations (these decide the exit code) |
| `baselined` | Count of violations suppressed by the [baseline](./cli.md#baselines) |
| `exit-code` | The raw CLI exit code (0, 1 or 2) |

Use outputs to build on top — for example, posting the health score
somewhere, or gating a deploy on `violations == 0`.

## What failure means

The Action fails when the CLI exits non-zero:

- **1** — unaccepted error-severity drift. The annotations name each token,
  what each side wrote, and a suggested fix.
- **2** — the check could not run: missing config, an unreadable source, an
  invalid severity. A source that fails to load is never a passing check
  that silently compared less than it was asked to.

With a [baseline](./cli.md#baselines) committed, a red check always means
drift introduced *after* the baseline — the happy path is green.
