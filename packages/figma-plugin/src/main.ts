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
import type { MainMessage, ScanPayload, ScanStepId, UiMessage } from './messages.js'
import {
  buildCommitMessage,
  buildPrBody,
  buildPrTitle,
  parseSyncSettings,
  snapshotHash,
  type SyncSettings,
} from './sync.js'

const CONFIG_KEY = 'designci.config'
const IGNORES_KEY = 'designci.canvasIgnores'
/** Repo + last-pushed hash: shared via the document, so the whole team sees
 * the same current/behind answer. The token is NOT here — see TOKEN_KEY. */
const SYNC_KEY = 'designci.sync'
/** Per-user client storage: the token never enters the shared document. */
const TOKEN_KEY = 'designci.githubToken'

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

const postProgress = (step: ScanStepId): void => post({ type: 'scan-progress', step })

function loadSync(): { settings?: SyncSettings; lastPushedHash?: string } {
  const stored = figma.root.getPluginData(SYNC_KEY)
  const settings = parseSyncSettings(stored)
  let lastPushedHash: string | undefined
  try {
    const decoded = JSON.parse(stored) as Record<string, unknown>
    if (typeof decoded['lastPushedHash'] === 'string') lastPushedHash = decoded['lastPushedHash']
  } catch {
    /* absent or malformed: no recorded push */
  }
  return {
    ...(settings === undefined ? {} : { settings }),
    ...(lastPushedHash === undefined ? {} : { lastPushedHash }),
  }
}

function saveSync(settings: SyncSettings | undefined, lastPushedHash: string | undefined): void {
  if (settings === undefined) {
    figma.root.setPluginData(SYNC_KEY, '')
    return
  }
  figma.root.setPluginData(
    SYNC_KEY,
    JSON.stringify({
      ...settings,
      ...(lastPushedHash === undefined ? {} : { lastPushedHash }),
    }),
  )
}

async function loadToken(): Promise<string> {
  const stored: unknown = await figma.clientStorage.getAsync(TOKEN_KEY)
  return typeof stored === 'string' ? stored : ''
}

/** The export payload: the snapshot stamped at the boundary (extract stays
 * pure) plus its content hash — exportedAt excluded from identity by design. */
async function stampedExport(): Promise<{
  snapshot: ReturnType<typeof extractSnapshot>
  json: string
  hash: string
}> {
  const document = await collectDocument()
  const snapshot = extractSnapshot(document)
  const json = JSON.stringify({ ...snapshot, exportedAt: new Date().toISOString() }, null, 2)
  return { snapshot, json, hash: snapshotHash(snapshot) }
}

/** Posts the sync state; recomputes the document hash unless one is passed. */
async function postSyncState(currentHash?: string): Promise<void> {
  const { settings, lastPushedHash } = loadSync()
  const token = await loadToken()
  let hash = currentHash
  if (hash === undefined) {
    const document = await collectDocument()
    hash = snapshotHash(extractSnapshot(document))
  }
  post({
    type: 'sync-state',
    state: {
      ...(settings === undefined ? {} : { settings }),
      hasToken: token !== '',
      ...(lastPushedHash === undefined ? {} : { lastPushedHash }),
      currentHash: hash,
    },
  })
}

async function scan(silent = false): Promise<ScanPayload> {
  // Each progress step is a real stage, posted as it starts — no theatre.
  // Background refreshes skip the announcements: the user did not ask.
  const progress = (step: Parameters<typeof postProgress>[0]): void => {
    if (!silent) postProgress(step)
  }
  progress('document')
  const document = await collectDocument()
  const snapshot = extractSnapshot(document)
  const { config } = loadConfig()
  const ignores = loadIgnores()

  progress('canvas')
  await yieldToUi()
  const collectedCanvas = collectCanvas()

  progress('components')
  await yieldToUi()
  const inventory = collectComponents()

  progress('checks')
  await yieldToUi()
  // Token rules run through the engine; cross-source rules stand down with one
  // source, by construction. Canvas lint runs alongside — its findings never
  // enter healthScore() (invariant 6).
  const result = runCheck({ snapshots: [snapshot], rules: allRules, config })
  const canvas = lintCanvas({ canvas: collectedCanvas, snapshot, config, ignores })

  // The scan already extracted the snapshot; refresh the sync state for free
  // and remember the document hash so the change poll stays quiet.
  const documentHash = snapshotHash(snapshot)
  lastDocumentHash = documentHash
  await postSyncState(documentHash)

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

/* ------------------------------------------------------------------ *
 * Auto-scan: the plugin notices changes itself.
 *
 * Figma's granular events cover canvas edits (`nodechange` on the current
 * page) and style edits (`stylechange`); variables have no event, so a light
 * poll hashes the document's tokens and triggers a refresh when they change.
 * `documentchange` would cover everything but requires loading every page —
 * too heavy for a panel that is just keeping itself honest. Auto scans are
 * silent: data updates in place, no progress screen, no closed panels.
 * ------------------------------------------------------------------ */

let scanBusy = false
let scanQueued = false
let autoTimer: ReturnType<typeof setTimeout> | undefined
let lastDocumentHash: string | undefined

async function runAutoScan(): Promise<void> {
  if (scanBusy) {
    scanQueued = true
    return
  }
  scanBusy = true
  try {
    const payload = await scan(true)
    post({ type: 'scan-result', payload, auto: true })
  } catch {
    // Background refreshes fail silently; a manual scan surfaces errors.
  }
  scanBusy = false
  if (scanQueued) {
    scanQueued = false
    scheduleAutoScan()
  }
}

/** Debounced: a burst of edits becomes one scan shortly after it settles. */
function scheduleAutoScan(delayMs = 900): void {
  if (autoTimer !== undefined) clearTimeout(autoTimer)
  autoTimer = setTimeout(() => {
    autoTimer = undefined
    void runAutoScan()
  }, delayMs)
}

function watchForChanges(): void {
  let watchedPage = figma.currentPage
  const onNodeChange = (): void => scheduleAutoScan()
  watchedPage.on('nodechange', onNodeChange)

  figma.on('currentpagechange', () => {
    watchedPage.off('nodechange', onNodeChange)
    watchedPage = figma.currentPage
    watchedPage.on('nodechange', onNodeChange)
    // A different page means different canvas findings; rescan promptly.
    scheduleAutoScan(200)
  })

  figma.on('stylechange', () => scheduleAutoScan())

  // Variable edits fire no event: compare the token hash every few seconds.
  setInterval(() => {
    if (scanBusy || autoTimer !== undefined) return
    void (async () => {
      try {
        const document = await collectDocument()
        const hash = snapshotHash(extractSnapshot(document))
        if (lastDocumentHash !== undefined && hash !== lastDocumentHash) scheduleAutoScan(0)
        lastDocumentHash = hash
      } catch {
        // Best-effort; the next tick tries again.
      }
    })()
  }, 4000)
}

figma.showUI(__html__, { width: 440, height: 620, themeColors: true })
watchForChanges()
// First scan on open — the panel arrives already knowing the file's state.
scheduleAutoScan(100)

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
      scanBusy = true
      try {
        post({ type: 'scan-result', payload: await scan() })
      } finally {
        scanBusy = false
      }
      return
    }
    case 'export': {
      const { snapshot, json } = await stampedExport()
      // Stable filename so the repo path in designci.config.json never churns.
      post({
        type: 'snapshot',
        json,
        fileName: 'figma.snapshot.json',
        tokenCount: snapshot.tokens.length,
      })
      return
    }
    case 'load-sync': {
      await postSyncState()
      return
    }
    case 'save-sync-settings': {
      // Changing the target repo resets the pushed-hash memory: the old
      // answer was about a different repo.
      saveSync(message.settings ?? undefined, undefined)
      await postSyncState()
      return
    }
    case 'save-sync-token': {
      await figma.clientStorage.setAsync(TOKEN_KEY, message.token)
      await postSyncState()
      return
    }
    case 'push-snapshot': {
      const { settings } = loadSync()
      const token = await loadToken()
      if (settings === undefined || token === '') {
        figma.notify('Connect a repo and save a GitHub token in Settings first.')
        await postSyncState()
        return
      }
      const { snapshot, json, hash } = await stampedExport()
      post({
        type: 'push-context',
        json,
        hash,
        settings,
        token,
        commitMessage: buildCommitMessage(snapshot),
        prTitle: buildPrTitle(),
        prBody: buildPrBody(snapshot, tokenBreakdown(snapshot)),
      })
      return
    }
    case 'record-push': {
      const { settings } = loadSync()
      saveSync(settings, message.hash)
      await postSyncState(message.hash)
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
      scheduleAutoScan(0)
      return
    }
    case 'remove-ignore': {
      const ignores = loadIgnores().filter((key) => key !== message.key)
      saveIgnores(ignores)
      post({ type: 'ignores', ignores })
      scheduleAutoScan(0)
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
