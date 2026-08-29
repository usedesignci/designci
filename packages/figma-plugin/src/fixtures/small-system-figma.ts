/**
 * The small-system corpus as a Figma document export — the corpus's third
 * variant, shaped exactly as `collect.ts` reads it off the plugin API: colour
 * channels as floats in [0, 1], lengths as scoped FLOAT variables, the type
 * ramp as text styles, shadows as effect styles.
 *
 * Matches the 25 tokens of the Figma variant in core's fixture, drifts
 * included, so an extraction bug shows up as a corpus disagreement.
 */

import type {
  ExportedVariable,
  ExportedVariableCollection,
  FigmaDocumentExport,
} from '../extract.js'

const COLLECTION: ExportedVariableCollection = {
  id: 'VariableCollectionId:1:2',
  name: 'Primitives',
  defaultModeId: 'mode:light',
  modes: [{ modeId: 'mode:light', name: 'Light' }],
}

let nextId = 0
function id(): string {
  nextId += 1
  return `VariableID:1:${nextId}`
}

function colorVariable(name: string, r: number, g: number, b: number): ExportedVariable {
  return {
    id: id(),
    name,
    resolvedType: 'COLOR',
    scopes: ['ALL_SCOPES'],
    valuesByMode: { 'mode:light': { r, g, b, a: 1 } },
    variableCollectionId: COLLECTION.id,
  }
}

function lengthVariable(name: string, px: number, scope: string): ExportedVariable {
  return {
    id: id(),
    name,
    resolvedType: 'FLOAT',
    scopes: [scope],
    valuesByMode: { 'mode:light': px },
    variableCollectionId: COLLECTION.id,
  }
}

/** Channel helper: the corpus hex values, as Figma's 0–1 floats. */
const c = (value: number): number => value / 255

export const smallSystemFigmaDocument: FigmaDocumentExport = {
  fileName: 'small-system.fig',
  collections: [COLLECTION],
  variables: [
    colorVariable('color/brand/primary', c(0xff), c(0x6b), c(0x00)),
    colorVariable('color/brand/secondary', c(0x1b), c(0x1b), c(0x1f)),
    colorVariable('color/surface/default', 1, 1, 1),
    colorVariable('color/surface/raised', c(0xf7), c(0xf7), c(0xf8)),
    colorVariable('color/text/primary', c(0x18), c(0x18), c(0x1b)),
    colorVariable('color/text/muted', c(0x6b), c(0x6b), c(0x76)),
    colorVariable('color/border/default', c(0xe4), c(0xe4), c(0xe7)),
    colorVariable('color/feedback/success', c(0x15), c(0x80), c(0x3d)),
    colorVariable('color/feedback/warning', c(0xb4), c(0x53), c(0x09)),
    colorVariable('color/feedback/destructive', c(0xdc), c(0x26), c(0x26)),

    lengthVariable('space/xs', 4, 'GAP'),
    lengthVariable('space/sm', 8, 'GAP'),
    lengthVariable('space/md', 16, 'GAP'),
    lengthVariable('space/lg', 24, 'GAP'),
    lengthVariable('space/xl', 32, 'GAP'),

    lengthVariable('radius/sm', 2, 'CORNER_RADIUS'),
    lengthVariable('radius/md', 4, 'CORNER_RADIUS'),
    lengthVariable('radius/lg', 8, 'CORNER_RADIUS'),
    lengthVariable('radius/full', 9999, 'CORNER_RADIUS'),

    // Figma has no duration type; teams store motion tokens as strings.
    {
      id: id(),
      name: 'motion/fast',
      resolvedType: 'STRING',
      scopes: ['ALL_SCOPES'],
      valuesByMode: { 'mode:light': '150ms' },
      variableCollectionId: COLLECTION.id,
    },
  ],
  paintStyles: [],
  textStyles: [
    {
      id: 'S:text-body',
      name: 'type/body',
      fontName: { family: 'Inter', style: 'Regular' },
      fontSize: 16,
      lineHeight: { unit: 'PERCENT', value: 150 },
      letterSpacing: { unit: 'PIXELS', value: 0 },
    },
    {
      id: 'S:text-heading',
      name: 'type/heading',
      fontName: { family: 'Inter', style: 'Semi Bold' },
      fontSize: 24,
      lineHeight: { unit: 'PERCENT', value: 125 },
      letterSpacing: { unit: 'PIXELS', value: 0 },
    },
    {
      id: 'S:text-mono',
      name: 'type/mono',
      fontName: { family: 'JetBrains Mono', style: 'Regular' },
      fontSize: 14,
      lineHeight: { unit: 'PERCENT', value: 150 },
      letterSpacing: { unit: 'PIXELS', value: 0 },
    },
  ],
  effectStyles: [
    {
      id: 'S:shadow-sm',
      name: 'shadow/sm',
      effects: [
        {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.05 },
          offset: { x: 0, y: 1 },
          radius: 2,
          spread: 0,
          visible: true,
        },
      ],
    },
    {
      id: 'S:shadow-md',
      name: 'shadow/md',
      effects: [
        {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          offset: { x: 0, y: 4 },
          radius: 6,
          spread: -1,
          visible: true,
        },
        {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          offset: { x: 0, y: 2 },
          radius: 4,
          spread: -2,
          visible: true,
        },
      ],
    },
  ],
}
