# Design CI — GitHub Action

Fail pull requests on design-system drift between Figma and production design
tokens. A thin wrapper over the [`designci` CLI](https://github.com/usedesignci/designci):
it runs `designci check`, turns violations into inline PR annotations and a job
summary, and fails the job with the CLI's own exit code.

## Usage

```yaml
name: design-ci
on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: usedesignci/designci-action@v1
        with:
          version: '0.1.0'        # pin the CLI for reproducible checks
```

The repo needs a `designci.config.json` (run `npx designci init` once) and the
committed sources it names — a `figma.snapshot.json` exported by the Design CI
Figma plugin, tokens JSON, stylesheets.

## Inputs

| input | default | |
| --- | --- | --- |
| `version` | `latest` | `designci` CLI version to run. Pin an exact version. |
| `working-directory` | `.` | Directory containing `designci.config.json`. |
| `annotations` | `true` | Emit inline PR annotations for violations. |
| `node-version` | `22` | Node.js to set up (`designci` requires ≥ 22). |

## Outputs

| output | |
| --- | --- |
| `health` | Overall design health score, 0–100. |
| `violations` | Unaccepted violations — these decide the exit code. |
| `baselined` | Violations suppressed by the baseline (still scored). |
| `exit-code` | Raw CLI exit code: 0 clean, 1 blocking drift, 2 could not run. |

## Behaviour worth knowing

- **Baselined violations are not annotated.** They are accepted debt; a wall of
  annotations for drift the team signed off on would train reviewers to ignore
  the real ones. They still appear in the job summary and still count against
  the health score.
- **Exit code 2 fails the job without annotations** — the check could not run
  (missing config, unreadable source), and the CLI's stderr in the log says
  why. A source that fails to load is never a green check.
- No engine logic lives in this action. If the action and the CLI disagree,
  the CLI is right.

## License

Apache-2.0.
