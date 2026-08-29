# designci

**CI for your design system.** Catch design drift between Figma and production
before it ships.

```bash
npx designci init    # write a starter designci.config.json
npx designci check   # compare sources and report drift
```

`designci check` compares your design sources (a Figma snapshot exported by the
Design CI plugin, tokens JSON) against what production ships (CSS custom
properties, Tailwind config) and reports drift — with the value the author
actually wrote, the value design says it should be, and a suggested fix.

- `#FF6B00` equals `rgb(255 107 0)`, `1rem` equals `16px`: values are compared,
  never strings, so notation differences are not drift.
- Cross-source matching comes only from explicit mappings in your config —
  names are never guessed.
- `--json` prints a byte-stable result for CI artifacts; a baseline lets you
  adopt on a drifted system without a red first build.

Exit codes: `0` clean, `1` unaccepted error-severity drift, `2` could not run.

Docs and source: https://github.com/usedesignci/designci
