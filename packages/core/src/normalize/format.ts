/**
 * Human-readable rendering of normalized values, for violation messages.
 *
 * Reports quote the author's `raw` (invariant 8); this is the *canonical* form
 * shown alongside it, so a reader can see why two different-looking strings were
 * treated as the same value — or as different ones.
 */

import { formatColor } from './color.js'
import type { NormalizedValue } from './types.js'

export function formatValue(value: NormalizedValue): string {
  switch (value.kind) {
    case 'color':
      return formatColor(value)
    case 'dimension':
      return `${value.px}px`
    case 'relative':
      return `${value.value}${value.unit}`
    case 'number':
      return String(value.value)
    case 'duration':
      return `${value.ms}ms`
    case 'fontWeight':
      return String(value.weight)
    case 'fontFamily':
      return value.families.join(', ')
    case 'string':
      return value.value
    case 'alias':
      return `{${value.target}}`
    case 'typography': {
      const parts: string[] = []
      if (value.fontFamily) parts.push(formatValue(value.fontFamily))
      if (value.fontSize) parts.push(formatValue(value.fontSize))
      if (value.fontWeight) parts.push(`weight ${formatValue(value.fontWeight)}`)
      if (value.lineHeight) parts.push(`line-height ${formatValue(value.lineHeight)}`)
      if (value.letterSpacing) parts.push(`tracking ${formatValue(value.letterSpacing)}`)
      return parts.join(' / ')
    }
    case 'shadow':
      return value.layers
        .map((layer) => {
          const lengths = `${layer.offsetX.px}px ${layer.offsetY.px}px ${layer.blur.px}px ${layer.spread.px}px`
          return `${layer.inset ? 'inset ' : ''}${lengths} ${formatColor(layer.color)}`
        })
        .join(', ')
    case 'unnormalized':
      return value.raw
  }
}
