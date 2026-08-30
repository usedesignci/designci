/**
 * Canvas fixture for lint tests: a small page shaped exactly as collect.ts
 * serializes it, using the small-system corpus as the token side.
 *
 * Seeded issues, one per rule:
 *   1. a card fill hardcoding #ff6b00 — the exact value of color.brand.primary
 *      (raw color WITH a suggestion), on two layers
 *   2. a badge stroke hardcoding #123456 — matching no token (raw, no match)
 *   3. an auto-layout with 10px itemSpacing — off the 4/8/16/24/32 space scale
 *   4. a 5px corner radius — off the 2/4/8/9999 radius scale
 *   5. a detached instance
 *   6. #999999 text on #ffffff at 12px — 2.85:1, fails AA 4.5:1
 *
 * Plus honesty cases that must NOT produce findings: a bound fill, a styled
 * fill, an on-scale-but-unbound gap, an invisible node with a raw color, a
 * raw color inside an instance, and skip-notes: mixed radius, translucent
 * text fill.
 */

import type { CanvasCollection } from '../lint.js'

export const smallSystemCanvas: CanvasCollection = {
  pageName: 'Screens',
  nodes: [
    // Page-level background frame: white, styled via paint style → not raw.
    {
      id: '1:1',
      name: 'Screen',
      type: 'FRAME',
      visible: true,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      hasFillStyle: true,
    },

    // Seed 1: raw brand orange on two layers (suggestion: color.brand.primary).
    {
      id: '1:2',
      name: 'Card',
      type: 'FRAME',
      visible: true,
      parentId: '1:1',
      fills: [{ type: 'SOLID', color: { r: 1, g: 107 / 255, b: 0 } }],
      cornerRadius: 4,
    },
    {
      id: '1:3',
      name: 'Chip',
      type: 'FRAME',
      visible: true,
      parentId: '1:1',
      fills: [{ type: 'SOLID', color: { r: 1, g: 107 / 255, b: 0 } }],
    },

    // Seed 2: raw stroke matching nothing.
    {
      id: '1:4',
      name: 'Badge',
      type: 'RECTANGLE',
      visible: true,
      parentId: '1:1',
      strokes: [{ type: 'SOLID', color: { r: 0x12 / 255, g: 0x34 / 255, b: 0x56 / 255 } }],
    },

    // Seed 3: off-scale gap. Also carries an on-scale padding (16) that must
    // not be flagged, and a bound padding field.
    {
      id: '1:5',
      name: 'Toolbar',
      type: 'FRAME',
      visible: true,
      parentId: '1:1',
      layout: {
        itemSpacing: 10,
        paddingTop: 16,
        paddingLeft: 7,
        boundFields: ['paddingLeft'],
      },
    },

    // Seed 4: off-scale radius.
    {
      id: '1:6',
      name: 'Avatar',
      type: 'RECTANGLE',
      visible: true,
      parentId: '1:1',
      cornerRadius: 5,
    },

    // Seed 5: detached instance.
    {
      id: '1:7',
      name: 'Button / Primary',
      type: 'FRAME',
      visible: true,
      parentId: '1:1',
      detached: { type: 'local' },
    },

    // Seed 6: low-contrast text (#999999 on the white screen behind it). The
    // fill is variable-bound — bound but illegible is exactly what the
    // contrast rule exists for, and keeps raw-color out of this seed.
    {
      id: '1:8',
      name: 'Caption',
      type: 'TEXT',
      visible: true,
      parentId: '1:1',
      fills: [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 }, bound: true }],
      text: { fontSize: 12, fontWeight: 400 },
    },

    // Honesty: bound fill — never raw.
    {
      id: '1:9',
      name: 'Bound card',
      type: 'FRAME',
      visible: true,
      parentId: '1:1',
      fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.9, b: 0.4 }, bound: true }],
      radiusBound: true,
      cornerRadius: 5,
    },

    // Honesty: invisible node — its raw color does not count.
    {
      id: '1:10',
      name: 'Hidden draft',
      type: 'FRAME',
      visible: false,
      parentId: '1:1',
      fills: [{ type: 'SOLID', color: { r: 0.5, g: 0, b: 0.5 } }],
    },

    // Honesty: raw color inside an instance mirrors the main component; the
    // fix belongs there, so no finding here.
    {
      id: '1:11',
      name: 'Instance internals',
      type: 'RECTANGLE',
      visible: true,
      parentId: '1:1',
      inInstance: true,
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3 } }],
    },

    // Skip: mixed radius cannot be judged as one value.
    {
      id: '1:12',
      name: 'Mixed corners',
      type: 'RECTANGLE',
      visible: true,
      parentId: '1:1',
      cornerRadius: 'mixed',
    },

    // Skip: translucent text depends on what is behind it.
    {
      id: '1:13',
      name: 'Watermark',
      type: 'TEXT',
      visible: true,
      parentId: '1:1',
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.4, bound: true }],
      text: { fontSize: 14, fontWeight: 400 },
    },

    // Contrast pass: large bold text at a ratio between 3:1 and 4.5:1.
    // #767676 on white is 4.54:1 — passes even as normal text.
    {
      id: '1:14',
      name: 'Body',
      type: 'TEXT',
      visible: true,
      parentId: '1:1',
      fills: [{ type: 'SOLID', color: { r: 0x76 / 255, g: 0x76 / 255, b: 0x76 / 255 }, bound: true }],
      text: { fontSize: 14, fontWeight: 400 },
    },
  ],
}
