/**
 * The typed message protocol between the plugin's two halves.
 *
 * The UI iframe and the main thread share no memory — only `postMessage` — so
 * this file is the single definition both sides import. A message that is not
 * one of these shapes is a bug, and the type system catches it on both ends.
 */

import type { CheckResult, DesignSystemSnapshot } from '@designci/core'

import type { CanvasFix } from './fix.js'
import type { CanvasLintResult, CanvasRuleId, ComponentInventory } from './lint.js'
import type { SyncSettings } from './sync.js'

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
  /** Ask for the current sync state (sent once when the UI boots). */
  | { readonly type: 'load-sync' }
  /** Persist repo sync settings into the document; null disconnects. */
  | { readonly type: 'save-sync-settings'; readonly settings: SyncSettings | null }
  /** Persist this user's GitHub token in clientStorage; '' clears it. */
  | { readonly type: 'save-sync-token'; readonly token: string }
  /** Ask main for everything a push needs (replied with push-context). */
  | { readonly type: 'push-snapshot' }
  /** The UI's push succeeded; record the pushed content hash. */
  | { readonly type: 'record-push'; readonly hash: string }
  /** Apply a lint finding's one-click fix to its nodes (see fix.ts). */
  | {
      readonly type: 'apply-fix'
      readonly code: CanvasRuleId
      /** The finding's grouped value, e.g. '#ff6b00' or '10px'. */
      readonly value?: string
      readonly nodes: readonly string[]
      readonly fix: CanvasFix
    }

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

/** Everything the UI needs to render "connected / current / behind". The
 * token itself never rides this message — only whether one is saved. */
export interface SyncState {
  readonly settings?: SyncSettings
  readonly hasToken: boolean
  /** Content hash recorded by the last successful push, if any. */
  readonly lastPushedHash?: string
  /** Content hash of the document's tokens right now. */
  readonly currentHash: string
}

export type MainMessage =
  | { readonly type: 'scan-progress'; readonly step: ScanStepId }
  /** `auto` marks a background refresh: the UI updates data in place without
   * the progress screen and without closing whatever panel is open. */
  | { readonly type: 'scan-result'; readonly payload: ScanPayload; readonly auto?: boolean }
  | { readonly type: 'sync-state'; readonly state: SyncState }
  /** Reply to push-snapshot: the UI performs the push (network lives in the
   * iframe); the token crosses here at push time only, never stored UI-side. */
  | {
      readonly type: 'push-context'
      readonly json: string
      readonly hash: string
      readonly settings: SyncSettings
      readonly token: string
      readonly commitMessage: string
      readonly prTitle: string
      readonly prBody: string
    }
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
