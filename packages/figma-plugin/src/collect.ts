/**
 * The sandbox boundary: the only module that touches the `figma` global.
 *
 * It reads the document's variables, styles, canvas nodes and components into
 * the serializable shapes `extract.ts` and `lint.ts` consume, and decides
 * nothing — every judgment lives in the pure modules where a test can reach
 * it (invariant 15). Async throughout because `documentAccess: dynamic-page`
 * makes the sync getters unavailable.
 */

import type {
  ExportedEffect,
  ExportedPaint,
  ExportedVariableValue,
  FigmaDocumentExport,
} from './extract.js'
import type {
  CanvasCollection,
  CanvasLayoutData,
  CanvasNodeData,
  CanvasPaint,
  ComponentInventory,
} from './lint.js'

export async function collectDocument(): Promise<FigmaDocumentExport> {
  const [collections, variables, paintStyles, textStyles, effectStyles] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
  ])

  return {
    fileName: figma.root.name,
    collections: collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map((mode) => ({ modeId: mode.modeId, name: mode.name })),
    })),
    variables: variables.map((variable) => ({
      id: variable.id,
      name: variable.name,
      resolvedType: variable.resolvedType,
      scopes: [...variable.scopes],
      valuesByMode: Object.fromEntries(
        Object.entries(variable.valuesByMode).map(([modeId, value]) => [
          modeId,
          value as ExportedVariableValue,
        ]),
      ),
      variableCollectionId: variable.variableCollectionId,
      ...(variable.description === '' ? {} : { description: variable.description }),
    })),
    paintStyles: paintStyles.map((style) => ({
      id: style.id,
      name: style.name,
      paints: style.paints.map((paint) => ({ ...paint }) as ExportedPaint),
      ...(style.description === '' ? {} : { description: style.description }),
    })),
    textStyles: textStyles.map((style) => ({
      id: style.id,
      name: style.name,
      fontName: { family: style.fontName.family, style: style.fontName.style },
      fontSize: style.fontSize,
      lineHeight:
        style.lineHeight.unit === 'AUTO'
          ? { unit: 'AUTO' }
          : { unit: style.lineHeight.unit, value: style.lineHeight.value },
      letterSpacing: { unit: style.letterSpacing.unit, value: style.letterSpacing.value },
      ...(style.description === '' ? {} : { description: style.description }),
    })),
    effectStyles: effectStyles.map((style) => ({
      id: style.id,
      name: style.name,
      effects: style.effects.map((effect) => ({ ...effect }) as ExportedEffect),
      ...(style.description === '' ? {} : { description: style.description }),
    })),
  }
}

/* ------------------------------------------------------------------ *
 * Canvas collection (for lint.ts).
 * ------------------------------------------------------------------ */

/** Serializes a paint list; `figma.mixed` becomes a non-solid marker paint. */
function readPaints(value: readonly Paint[] | typeof figma.mixed): CanvasPaint[] | undefined {
  if (value === figma.mixed) return [{ type: 'MIXED' }]
  if (value.length === 0) return undefined
  return value.map((paint) => {
    if (paint.type === 'SOLID') {
      return {
        type: 'SOLID',
        color: { r: paint.color.r, g: paint.color.g, b: paint.color.b },
        ...(paint.opacity === undefined ? {} : { opacity: paint.opacity }),
        ...(paint.visible === undefined ? {} : { visible: paint.visible }),
        ...(paint.boundVariables?.color === undefined ? {} : { bound: true }),
      }
    }
    return { type: paint.type, ...(paint.visible === undefined ? {} : { visible: paint.visible }) }
  })
}

const RADIUS_FIELDS = [
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
] as const

const LAYOUT_FIELDS = [
  'itemSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
] as const

function readNode(node: SceneNode, parentId: string | undefined, inInstance: boolean): CanvasNodeData {
  const data: {
    -readonly [K in keyof CanvasNodeData]: CanvasNodeData[K]
  } = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    ...(parentId === undefined ? {} : { parentId }),
    ...(inInstance ? { inInstance: true } : {}),
  }

  if ('fills' in node) {
    const fills = readPaints(node.fills)
    if (fills) data.fills = fills
    const styleId = node.fillStyleId
    if (styleId !== '') data.hasFillStyle = true
  }
  if ('strokes' in node && node.strokes.length > 0) {
    const strokes = readPaints(node.strokes)
    if (strokes) data.strokes = strokes
    if ('strokeStyleId' in node && node.strokeStyleId !== '') data.hasStrokeStyle = true
  }

  if ('cornerRadius' in node && node.cornerRadius !== undefined) {
    data.cornerRadius = node.cornerRadius === figma.mixed ? 'mixed' : node.cornerRadius
    const bound = node.boundVariables
    if (bound && RADIUS_FIELDS.some((field) => bound[field] !== undefined)) {
      data.radiusBound = true
    }
  }

  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    const bound = node.boundVariables
    const layout: {
      -readonly [K in keyof CanvasLayoutData]: CanvasLayoutData[K]
    } = {
      boundFields: LAYOUT_FIELDS.filter((field) => bound?.[field] !== undefined),
    }
    for (const field of LAYOUT_FIELDS) {
      const value = node[field]
      if (typeof value === 'number') layout[field] = value
    }
    data.layout = layout
  }

  if (node.type === 'TEXT') {
    data.text = {
      fontSize: node.fontSize === figma.mixed ? 'mixed' : node.fontSize,
      ...(node.fontWeight === figma.mixed
        ? { fontWeight: 'mixed' as const }
        : typeof node.fontWeight === 'number'
          ? { fontWeight: node.fontWeight }
          : {}),
    }
  }

  if (node.type === 'FRAME' && node.detachedInfo !== null && node.detachedInfo !== undefined) {
    data.detached = { type: node.detachedInfo.type === 'library' ? 'library' : 'local' }
  }

  return data
}

/** Walks the current page into flat serializable node data, no judgments. */
export function collectCanvas(): CanvasCollection {
  const nodes: CanvasNodeData[] = []

  const walk = (node: SceneNode, parentId: string | undefined, inInstance: boolean): void => {
    nodes.push(readNode(node, parentId, inInstance))
    const childrenInInstance = inInstance || node.type === 'INSTANCE'
    if ('children' in node) {
      for (const child of node.children) walk(child, node.id, childrenInInstance)
    }
  }

  for (const node of figma.currentPage.children) walk(node, undefined, false)

  return { pageName: figma.currentPage.name, nodes }
}

/** Component sets and counts on the current page. Display-only inventory. */
export function collectComponents(): ComponentInventory {
  const matches = figma.currentPage.findAllWithCriteria({
    types: ['COMPONENT', 'COMPONENT_SET'],
  })

  const sets = matches
    .filter((node): node is ComponentSetNode => node.type === 'COMPONENT_SET')
    .map((set) => {
      let properties: Record<string, { values: string[] }> = {}
      try {
        properties = set.variantGroupProperties
      } catch {
        // A set in an error state (conflicting variant names) has no readable
        // properties; the set still counts, with none listed.
      }
      return {
        name: set.name,
        variantProperties: Object.entries(properties).map(([name, group]) => ({
          name,
          values: [...group.values],
        })),
      }
    })

  const standalone = matches.filter(
    (node) => node.type === 'COMPONENT' && node.parent?.type !== 'COMPONENT_SET',
  ).length

  return { componentCount: standalone + sets.length, sets }
}
