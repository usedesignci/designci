import type { SourceId } from './ids.js'

/**
 * Where a snapshot came from. `design` sources describe intent, `code` sources
 * describe what actually ships; a check compares across that boundary.
 */
export type SourceKind =
  | 'figma'
  | 'tokens-json'
  | 'css'
  | 'tailwind'
  | 'code'

export type SourceRole = 'design' | 'code'

export interface Source {
  readonly id: SourceId
  readonly kind: SourceKind
  readonly role: SourceRole
  /** Human-readable label used in output. */
  readonly label: string
  /** Repo-relative path or Figma file key, when the source has one. */
  readonly origin?: string
}

/** Where in a source a token was declared. Absent for sources without files. */
export interface SourceLocation {
  /** Repo-relative file path, or the Figma node id for Figma sources. */
  readonly file: string
  /** 1-based. */
  readonly line?: number
  /** 1-based. */
  readonly column?: number
}
