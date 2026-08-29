/**
 * Plugin entry (main thread).
 *
 * The check config lives in the document's plugin data, so it travels with the
 * file and the whole team shares one policy — the same JSON the repo's
 * designci.config.json holds, parsed by the same core parser (invariant 12).
 * No network access is declared in the manifest: no AI, no telemetry, every
 * check runs locally (invariant 2).
 */

import {
  allRules,
  parseConfig,
  runCheck,
  type CheckConfig,
  type CheckResult,
  emptyConfig,
} from '@designci/core'

import { collectDocument } from './collect.js'
import { extractSnapshot } from './extract.js'

const CONFIG_KEY = 'designci.config'

interface UiMessage {
  readonly type: 'check' | 'export' | 'save-config' | 'load-config'
  readonly json?: string
}

function loadConfig(): { config: CheckConfig; error?: string; json: string } {
  const stored = figma.root.getPluginData(CONFIG_KEY)
  if (stored === '') return { config: emptyConfig, json: '' }

  let decoded: unknown
  try {
    decoded = JSON.parse(stored)
  } catch {
    return { config: emptyConfig, json: stored, error: 'stored config is not valid JSON' }
  }

  const parsed = parseConfig(decoded, { knownRuleIds: allRules.map((rule) => rule.id) })
  if (!parsed.ok) {
    return {
      config: emptyConfig,
      json: stored,
      error: parsed.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
    }
  }
  return { config: parsed.value, json: stored }
}

async function runDesignCheck(): Promise<{ result: CheckResult; tokenCount: number }> {
  const document = await collectDocument()
  const snapshot = extractSnapshot(document)
  const { config } = loadConfig()
  // One source only: cross-source rules (mismatch, missing) stand down by
  // construction, and single-source rules (duplicates) plus the extraction
  // diagnostics do the linting. The full comparison runs in CI, where the code
  // sources are.
  const result = runCheck({ snapshots: [snapshot], rules: allRules, config })
  return { result, tokenCount: snapshot.tokens.length }
}

figma.showUI(__html__, { width: 420, height: 560, themeColors: true })

figma.ui.onmessage = async (message: UiMessage) => {
  try {
    await handle(message)
  } catch (cause) {
    // A crash inside the sandbox would otherwise die silently; the designer
    // deserves at least a notification (invariant 7, applied to ourselves).
    const reason = cause instanceof Error ? cause.message : String(cause)
    figma.notify(`Design CI hit an error: ${reason}`, { error: true })
  }
}

async function handle(message: UiMessage): Promise<void> {
  switch (message.type) {
    case 'check': {
      const { result, tokenCount } = await runDesignCheck()
      figma.ui.postMessage({ type: 'result', result, tokenCount })
      return
    }
    case 'export': {
      const document = await collectDocument()
      const snapshot = extractSnapshot(document)
      // Stable filename so the repo path in designci.config.json never churns.
      figma.ui.postMessage({
        type: 'snapshot',
        json: JSON.stringify(snapshot, null, 2),
        fileName: 'figma.snapshot.json',
        tokenCount: snapshot.tokens.length,
      })
      return
    }
    case 'save-config': {
      const json = message.json ?? ''
      if (json.trim() === '') {
        figma.root.setPluginData(CONFIG_KEY, '')
        figma.ui.postMessage({ type: 'config', json: '', saved: true })
        return
      }
      let decoded: unknown
      try {
        decoded = JSON.parse(json)
      } catch (cause) {
        figma.ui.postMessage({
          type: 'config',
          json,
          error: `not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
        })
        return
      }
      const parsed = parseConfig(decoded, { knownRuleIds: allRules.map((rule) => rule.id) })
      if (!parsed.ok) {
        figma.ui.postMessage({
          type: 'config',
          json,
          error: parsed.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
        })
        return
      }
      figma.root.setPluginData(CONFIG_KEY, json)
      figma.ui.postMessage({ type: 'config', json, saved: true })
      return
    }
    case 'load-config': {
      const { json, error } = loadConfig()
      figma.ui.postMessage({ type: 'config', json, ...(error === undefined ? {} : { error }) })
      return
    }
  }
}
