/**
 * Static rule documentation shown in the UI's rule-detail panel: what the rule
 * enforces, why it matters, how to fix it. Prose only — no logic.
 */

export interface RuleDoc {
  readonly title: string
  readonly rule: string
  readonly why: string
  readonly howToFix: string
}

export const RULE_DOCS: Readonly<Record<string, RuleDoc>> = {
  'token-value-mismatch': {
    title: 'Token value mismatch',
    rule: 'Mapped tokens must resolve to the same value in design and code.',
    why: 'A mapped pair is one design decision written down twice. When the values disagree, one side shipped something the other did not decide.',
    howToFix: 'Change whichever side is wrong to match the decision, or update the decision in both places.',
  },
  'missing-token': {
    title: 'Missing token',
    rule: 'Every design token should map to a token in each code source.',
    why: 'A token that exists only in design gets hardcoded in code — and hardcoded values drift silently.',
    howToFix: 'Define the token in the code source, then map it in designci.config.json.',
  },
  'duplicate-token': {
    title: 'Duplicate token',
    rule: 'A source should not define the same value under two token names.',
    why: 'Two names for one value fork the moment either is edited. Six months later they are two decisions nobody made.',
    howToFix: 'Alias one token to the other, or delete the redundant one.',
  },
  'canvas-raw-color': {
    title: 'Raw color',
    rule: 'Visible fills and strokes should use a color variable or paint style, not a raw value.',
    why: 'Raw colors do not follow the system when it changes, and they are invisible to token comparison in CI.',
    howToFix: 'Bind the fill to a color variable. When the value matches an existing token, the issue names it.',
  },
  'canvas-raw-spacing': {
    title: 'Off-system spacing',
    rule: 'Auto-layout gaps and padding should come from the spacing scale.',
    why: 'Arbitrary spacing values erode the rhythm of the system one layout at a time.',
    howToFix: 'Use a value from the space scale, or bind the field to a space variable. If the scale genuinely needs a new step, add the token first.',
  },
  'canvas-raw-radius': {
    title: 'Off-system radius',
    rule: 'Corner radii should come from the radius scale.',
    why: 'Mixed radii across surfaces read as sloppiness even when nobody can name why.',
    howToFix: 'Use a value from the radius scale, or bind the corners to a radius variable.',
  },
  'canvas-detached-instance': {
    title: 'Detached instance',
    rule: 'Detached component instances should be reattached or intentionally promoted.',
    why: 'A detached copy no longer receives component updates — it is a fork of the component frozen at the moment of detachment.',
    howToFix: 'Replace it with a fresh instance of the component, or if the divergence is intentional, make it a new component.',
  },
  'canvas-text-contrast': {
    title: 'Text contrast',
    rule: 'Text must meet WCAG AA contrast against its background: 4.5:1, or 3:1 for large text.',
    why: 'Low-contrast text excludes low-vision readers and fails accessibility audits after shipping, when fixes are expensive.',
    howToFix: 'Darken the text or lighten the background until the ratio in the issue meets the threshold. The check only fires when both colors are confidently solid.',
  },
}
