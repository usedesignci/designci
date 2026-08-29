/**
 * @designci/core — the Design CI engine.
 *
 * The domain model, value normalization and the deterministic rule runner.
 * Adapters (M3), the CLI (M4), the Figma plugin (M5) and the Action (M6) all
 * build on this package and none of them reimplement any of it.
 */

export * from './domain/index.js'
export * from './config/index.js'
export * from './baseline/index.js'
export * from './normalize/index.js'
export * from './runner/index.js'
export * from './rules/index.js'
export * from './health.js'
