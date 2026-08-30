/**
 * Plugin entry (main thread).
 *
 * A thin message router: reads come from collect.ts, judgments from the pure
 * modules, and the UI gets typed MainMessages back. The check config and the
 * canvas ignore list live in the document's plugin data, so the whole team
 * shares one policy and one accepted-set per file. No network access is
 * declared in the manifest: no AI, no telemetry, every check runs locally
 * (invariant 2).
 */

import {
  allRules,
  parseConfig,
  runCheck,
  type CheckConfig,
  emptyConfig,
} from '@designci/core'

import { collectCanvas, collectComponents, collectDocument } from './collect.js'
import { extractSnapshot } from './extract.js'
import { parseIgnores } from './ignores.js'
import { CANVAS_RULE_IDS, lintCanvas, tokenBreakdown } from './lint.js'
import type { MainMessage, ScanPayload, UiMessage } from './messages.js'

const CONFIG_KEY = 'designci.config'
const IGNORES_KEY = 'designci.canvasIgnores'

const KNOWN_RULE_IDS = [...allRules.map((rule) => rule.id as string), ...CANVAS_RULE_IDS]

const post = (message: MainMessage): void => figma.ui.postMessage(message)

function loadConfig(): { config: CheckConfig; error?: string; json: string } {
  const stored = figma.root.getPluginData(CONFIG_KEY)
  if (stored === '') return { config: emptyConfig, json: '' }

  let decoded: unknown
  try {
    decoded = JSON.parse(stored)
  } catch {
    return { config: emptyConfig, json: stored, error: 'stored config is not valid JSON' }
  }

  const parsed = parseConfig(decoded, { knownRuleIds: KNOWN_RULE_IDS })
  if (!parsed.ok) {
    return {
      config: emptyConfig,
      json: stored,
      error: parsed.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
    }
  }
  return { config: parsed.value, json: stored }
}

function loadIgnores(): string[] {
  return parseIgnores(figma.root.getPluginData(IGNORES_KEY))
}

function saveIgnores(ignores: readonly string[]): void {
  figma.root.setPluginData(IGNORES_KEY, JSON.stringify(ignores))
}

/** Lets the UI iframe paint between synchronous stages of a scan. */
const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

async function scan(): Promise<ScanPayload> {
  // Each progress step is a real stage, posted as it starts — no theatre.
  post({ type: 'scan-progress', step: 'document' })
  const document = await collectDocument()
  const snapshot = extractSnapshot(document)
  const { config } = loadConfig()
  const ignores = loadIgnores()

  post({ type: 'scan-progress', step: 'canvas' })
  await yieldToUi()
  const collectedCanvas = collectCanvas()

  post({ type: 'scan-progress', step: 'components' })
  await yieldToUi()
  const inventory = collectComponents()

  post({ type: 'scan-progress', step: 'checks' })
  await yieldToUi()
  // Token rules run through the engine; cross-source rules stand down with one
  // source, by construction. Canvas lint runs alongside — its findings never
  // enter healthScore() (invariant 6).
  const result = runCheck({ snapshots: [snapshot], rules: allRules, config })
  const canvas = lintCanvas({ canvas: collectedCanvas, snapshot, config, ignores })

  return {
    result,
    canvas,
    inventory,
    tokenCount: snapshot.tokens.length,
    tokenBreakdown: tokenBreakdown(snapshot),
    pageName: figma.currentPage.name,
    ignores,
  }
}

figma.showUI(__html__, { width: 440, height: 620, themeColors: true })

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
    case 'scan': {
      post({ type: 'scan-result', payload: await scan() })
      return
    }
    case 'export': {
      const document = await collectDocument()
      const snapshot = extractSnapshot(document)
      // The timestamp is stamped here at the boundary, not in extract (which
      // stays pure): it lets the CLI warn when a committed snapshot has gone
      // stale. Nothing in the check path reads it.
      const exported = { ...snapshot, exportedAt: new Date().toISOString() }
      // Stable filename so the repo path in designci.config.json never churns.
      post({
        type: 'snapshot',
        json: JSON.stringify(exported, null, 2),
        fileName: 'figma.snapshot.json',
        tokenCount: snapshot.tokens.length,
      })
      return
    }
    case 'save-config': {
      const json = message.json
      if (json.trim() === '') {
        figma.root.setPluginData(CONFIG_KEY, '')
        post({ type: 'config', json: '', saved: true })
        return
      }
      let decoded: unknown
      try {
        decoded = JSON.parse(json)
      } catch (cause) {
        post({
          type: 'config',
          json,
          error: `not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
        })
        return
      }
      const parsed = parseConfig(decoded, { knownRuleIds: KNOWN_RULE_IDS })
      if (!parsed.ok) {
        post({
          type: 'config',
          json,
          error: parsed.diagnostics.map((diagnostic) => diagnostic.message).join('; '),
        })
        return
      }
      figma.root.setPluginData(CONFIG_KEY, json)
      post({ type: 'config', json, saved: true })
      return
    }
    case 'load-config': {
      const { json, error } = loadConfig()
      post({ type: 'config', json, ...(error === undefined ? {} : { error }) })
      return
    }
    case 'select-nodes': {
      const nodes = (
        await Promise.all(message.ids.map((id) => figma.getNodeByIdAsync(id)))
      ).filter((node): node is SceneNode => node !== null && 'visible' in node)
      if (nodes.length === 0) {
        figma.notify('Those layers no longer exist; run the scan again.')
        return
      }
      figma.currentPage.selection = nodes
      figma.viewport.scrollAndZoomIntoView(nodes)
      return
    }
    case 'add-ignore': {
      const ignores = loadIgnores()
      if (!ignores.includes(message.key)) ignores.push(message.key)
      saveIgnores(ignores)
      post({ type: 'ignores', ignores })
      return
    }
    case 'remove-ignore': {
      const ignores = loadIgnores().filter((key) => key !== message.key)
      saveIgnores(ignores)
      post({ type: 'ignores', ignores })
      return
    }
    case 'disable-rule': {
      // "Ignore rule entirely" = severity off in the stored config, the same
      // policy channel the CLI uses (invariant 5).
      const { json } = loadConfig()
      let decoded: Record<string, unknown> = {}
      try {
        decoded = json.trim() === '' ? {} : (JSON.parse(json) as Record<string, unknown>)
      } catch {
        decoded = {}
      }
      const rules = (decoded['rules'] as Record<string, unknown> | undefined) ?? {}
      rules[message.ruleId] = 'off'
      decoded['rules'] = rules
      const next = JSON.stringify(decoded, null, 2)
      figma.root.setPluginData(CONFIG_KEY, next)
      post({ type: 'config', json: next, saved: true })
      return
    }
  }
}
