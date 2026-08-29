# @designci/core

The Design CI engine: domain model, value normalization, and the deterministic
rule runner. The [`designci` CLI](https://www.npmjs.com/package/designci), the
Figma plugin, the GitHub Action and the dashboard are all built on this package
— none of them reimplement any of it.

```ts
import { allRules, runCheck } from '@designci/core'

const result = runCheck({ snapshots, rules: allRules, config })
result.health.overall  // one health score, computed here and nowhere else
```

Pure throughout: no filesystem, no network, no clock. Identical inputs
serialize to byte-identical JSON.

Most users want the CLI: `npx designci check`.

Docs and source: https://github.com/usedesignci/designci
