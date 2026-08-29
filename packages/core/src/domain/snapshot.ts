import type { ParseDiagnostic } from './diagnostic.js'
import type { Source } from './source.js'
import type { DesignToken } from './token.js'

/**
 * Invariant 9: wire formats carry a schema version. A snapshot exported by the
 * Figma plugin may be read by a different version of the CLI; the version is
 * what lets the reader say so instead of misreading the payload.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1

/**
 * One source, extracted. This is the only shape the engine reads — a Figma
 * export, a tokens JSON file and a stylesheet all become this, which is why
 * rules never need to know where a value came from.
 */
export interface DesignSystemSnapshot {
  readonly schemaVersion: number
  readonly source: Source
  readonly tokens: readonly DesignToken[]
  /** Parse failures encountered producing this snapshot (invariant 7). */
  readonly diagnostics: readonly ParseDiagnostic[]
}

export interface SnapshotInput {
  readonly source: Source
  readonly tokens: readonly DesignToken[]
  readonly diagnostics?: readonly ParseDiagnostic[]
}

export function createSnapshot(input: SnapshotInput): DesignSystemSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    source: input.source,
    tokens: input.tokens,
    diagnostics: input.diagnostics ?? [],
  }
}
