/**
 * The small-system corpus as a real stylesheet.
 *
 * Same design system as `small-system.ts`, written the way a team would ship it:
 * a comment header, a `:root` block, a `@media` override, hyphenated property
 * names, mixed colour notations, rem lengths, an `!important`, and the same
 * seeded drifts. Parsing this and checking it against the Figma variant is the
 * end-to-end proof that the adapters, normalizer and runner agree.
 *
 * Typography is expressed the way CSS actually expresses it — as separate
 * properties — rather than as a composite, since a stylesheet has no syntax for
 * a type ramp in one custom property.
 */

export const smallSystemCss = `/* Design tokens — generated, do not edit by hand */

:root {
  /* Brand */
  --color-brand-primary: rgb(255 107 0);
  --color-brand-secondary: #1b1b1f;

  /* Surfaces */
  --color-surface-default: #fff;
  --color-surface-raised: #F7F7F8;

  /* Text */
  --color-text-primary: #18181B;
  --color-text-muted: rgb(107, 107, 118);

  --color-border-default: #E4E4E7;

  /* Feedback — destructive is missing; see the Figma variant */
  --color-feedback-success: #15803D;
  --color-feedback-warning: #B45309;

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;

  /* Radius */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px; /* drifts from Figma, which says 8px */
  --radius-full: 9999px;

  /* Elevation */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);

  /* Motion */
  --motion-fast: 0.15s;

  /* Type ramp, as separate properties */
  --type-body-size: 1rem;
  --type-body-leading: 1.5;
  --type-body-weight: 400;

  /* A duplicate of --color-brand-primary under a second name */
  --color-primary: rgb(255 107 0);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-surface-default: #0b0b0d !important;
  }
}
`
