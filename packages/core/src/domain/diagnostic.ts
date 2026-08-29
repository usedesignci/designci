/**
 * Invariant 7: parse failures are typed and surfaced. Adapters never throw and
 * never silently drop malformed input — every failure becomes a diagnostic that
 * travels with the snapshot into the result.
 */

import type { SourceId } from './ids.js'
import type { SourceLocation } from './source.js'

export type DiagnosticSeverity = 'error' | 'warning'

export interface ParseDiagnostic {
  readonly severity: DiagnosticSeverity
  /** Stable machine code, e.g. 'unparsable-value' or 'unsupported-token-type'. */
  readonly code: string
  readonly message: string
  readonly sourceId: SourceId
  /** The input that could not be parsed, verbatim (invariant 8). */
  readonly raw?: string
  readonly location?: SourceLocation
}

/**
 * Adapters return this rather than throwing. A parse can succeed *and* carry
 * diagnostics: one unreadable declaration should not discard the other 300.
 */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly ParseDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly ParseDiagnostic[] }

export function parseOk<T>(
  value: T,
  diagnostics: readonly ParseDiagnostic[] = [],
): ParseResult<T> {
  return { ok: true, value, diagnostics }
}

export function parseFailed<T>(diagnostics: readonly ParseDiagnostic[]): ParseResult<T> {
  return { ok: false, diagnostics }
}
