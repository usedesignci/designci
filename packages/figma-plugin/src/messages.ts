/**
 * The typed message protocol between the plugin's two halves.
 *
 * The UI iframe and the main thread share no memory — only `postMessage` — so
 * this file is the single definition both sides import. A message that is not
 * one of these shapes is a bug, and the type system catches it on both ends.
 */

import type { CheckResult, DesignSystemSnapshot } from '@designci/core'

import type { CanvasLintResult, ComponentInventory } from './lint.js'

/* ------------------------------------------------------------------ *
 * UI -> main
 * ------------------------------------------------------------------ */

export type UiMessage =
  /** Run the full scan: extract tokens, run token rules, lint the canvas. */
  | { readonly type: 'scan' }
  /** Export the snapshot file for CI. */
  | { readonly type: 'export' }
  /** Persist the check config JSON into the document's plugin data. */
  | { readonly type: 'save-config'; readonly json: string }
  /** Ask for the stored config (sent once when the UI boots). */
  | { readonly type: 'load-config' }
  /** Select the given nodes on the canvas and scroll them into view. */
  | { readonly type: 'select-nodes'; readonly ids: readonly string[] }
  /** Add an ignore key (a value-level or node-level canvas ignore). */
  | { readonly type: 'add-ignore'; readonly key: string }
  /** Remove an ignore key. */
  | { readonly type: 'remove-ignore'; readonly key: string }
  /** Set one rule's severity to 'off' in the stored config. */
  | { readonly type: 'disable-rule'; readonly ruleId: string }

/* ------------------------------------------------------------------ *
 * main -> UI
 * ------------------------------------------------------------------ */

export interface ScanPayload {
  /** The engine's result over the extracted snapshot (token rules). */
  readonly result: CheckResult
  /** Canvas lint findings for the current page. */
  readonly canvas: CanvasLintResult
  /** Display-only component inventory. */
  readonly inventory: ComponentInventory
  /** Token count and per-type breakdown for the scan tiles. */
  readonly tokenCount: number
  readonly tokenBreakdown: readonly { readonly label: string; readonly count: number }[]
  /** The page that was scanned (canvas lint is current-page only). */
  readonly pageName: string
  /** Active ignore keys, for the settings list and issue detail state. */
  readonly ignores: readonly string[]
}

/** The real stages of a scan, in order, for the progress screen. */
export const SCAN_STEPS = [
  { id: 'document', label: 'Reading tokens & styles' },
  { id: 'canvas', label: 'Scanning the canvas' },
  { id: 'components', label: 'Scanning components' },
  { id: 'checks', label: 'Running checks' },
] as const

export type ScanStepId = (typeof SCAN_STEPS)[number]['id']

export type MainMessage =
  | { readonly type: 'scan-progress'; readonly step: ScanStepId }
  | { readonly type: 'scan-result'; readonly payload: ScanPayload }
  | {
      readonly type: 'snapshot'
      readonly json: string
      readonly fileName: string
      readonly tokenCount: number
    }
  | {
      readonly type: 'config'
      readonly json: string
      readonly saved?: boolean
      readonly error?: string
    }
  /** Ignores changed (after add/remove); the UI re-requests a scan if it wants. */
  | { readonly type: 'ignores'; readonly ignores: readonly string[] }

export type { CheckResult, DesignSystemSnapshot }
