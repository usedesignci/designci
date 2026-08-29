/**
 * The sandbox boundary: the only module that touches the `figma` global.
 *
 * It reads the document's variables and styles into the serializable shapes
 * `extract.ts` consumes, and decides nothing — every judgment lives in the pure
 * module where a test can reach it. Async throughout because `documentAccess:
 * dynamic-page` makes the sync getters unavailable.
 */

import type {
  ExportedEffect,
  ExportedPaint,
  ExportedVariableValue,
  FigmaDocumentExport,
} from './extract.js'

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
