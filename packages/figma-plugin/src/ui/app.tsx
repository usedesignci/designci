/**
 * The plugin UI: four tabs (Home, Scan, Rules, Settings) over one shared state.
 *
 * All data comes from typed MainMessages; all actions go out as typed
 * UiMessages. Everything the panel shows was computed on the main thread by
 * the pure modules — the UI renders and routes, it does not judge.
 */

import { useEffect, useState } from 'preact/hooks'

import type { CanvasFinding } from '../lint.js'
import type { ScanPayload, ScanStepId } from '../messages.js'
import { Icon } from './icons.js'
import { RuleDetail } from './panels/rule-detail.js'
import { HomeTab } from './tabs/home.js'
import { RulesTab } from './tabs/rules.js'
import { ScanTab } from './tabs/scan.js'
import { SettingsTab } from './tabs/settings.js'
import { download, listen, send } from './state.js'

export type Tab = 'home' | 'scan' | 'rules' | 'settings'

export type Detail =
  | { readonly kind: 'issue'; readonly finding: CanvasFinding }
  | { readonly kind: 'rule'; readonly ruleId: string }
  | null

export interface ConfigState {
  readonly json: string
  readonly error?: string
  readonly saved?: boolean
}

export function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [scan, setScan] = useState<ScanPayload | null>(null)
  const [scanning, setScanning] = useState(false)
  const [step, setStep] = useState<ScanStepId | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState('')
  const [config, setConfig] = useState<ConfigState>({ json: '' })
  const [detail, setDetail] = useState<Detail>(null)

  useEffect(() => {
    const stop = listen((message) => {
      switch (message.type) {
        case 'scan-progress':
          setStep(message.step)
          break
        case 'scan-result':
          setScan(message.payload)
          setScanning(false)
          setStep(null)
          setDetail(null)
          break
        case 'snapshot':
          setExporting(false)
          setExportNote(`Exported ${message.tokenCount} tokens.`)
          download(message.fileName, message.json)
          break
        case 'config':
          setConfig({
            json: message.json,
            ...(message.error === undefined ? {} : { error: message.error }),
            ...(message.saved === undefined ? {} : { saved: message.saved }),
          })
          break
        case 'ignores':
          // Ignores changed; re-scan so counts and lists stay truthful.
          setScanning(true)
          setStep(null)
          send({ type: 'scan' })
          break
      }
    })
    send({ type: 'load-config' })
    return stop
  }, [])

  const startScan = (): void => {
    setScanning(true)
    setStep(null)
    setTab('scan')
    send({ type: 'scan' })
  }

  const startExport = (): void => {
    setExporting(true)
    setExportNote('')
    send({ type: 'export' })
  }

  return (
    <>
      <div class="content">
        {tab === 'home' && (
          <HomeTab
            scan={scan}
            scanning={scanning}
            exporting={exporting}
            exportNote={exportNote}
            onScan={startScan}
            onExport={startExport}
            onViewResults={() => {
              setTab('scan')
              setDetail(null)
            }}
            onViewRules={() => {
              setTab('rules')
              setDetail(null)
            }}
          />
        )}
        {tab === 'scan' && (
          <ScanTab
            scan={scan}
            scanning={scanning}
            step={step}
            detail={detail}
            onScan={startScan}
            onDetail={setDetail}
          />
        )}
        {tab === 'rules' &&
          (detail?.kind === 'rule' ? (
            <RuleDetail ruleId={detail.ruleId} onBack={() => setDetail(null)} />
          ) : (
            <RulesTab onRule={(ruleId) => setDetail({ kind: 'rule', ruleId })} />
          ))}
        {tab === 'settings' && <SettingsTab config={config} scan={scan} />}
      </div>
      <nav class="tabs">
        {(
          [
            { name: 'home', label: 'Home', icon: 'home' },
            { name: 'scan', label: 'Scan', icon: 'magnifying-glass' },
            { name: 'rules', label: 'Rules', icon: 'clipboard-document-list' },
            { name: 'settings', label: 'Settings', icon: 'cog-6-tooth' },
          ] as const
        ).map((entry) => (
          <button
            key={entry.name}
            class={tab === entry.name ? 'active' : ''}
            onClick={() => {
              setTab(entry.name)
              if (entry.name !== 'scan') setDetail(null)
            }}
          >
            <Icon name={entry.icon} size={16} />
            {entry.label}
          </button>
        ))}
      </nav>
    </>
  )
}
