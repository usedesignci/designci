/**
 * The plugin UI: three tabs (Home, Scan, Settings) over one shared state.
 *
 * All data comes from typed MainMessages; all actions go out as typed
 * UiMessages. Everything the panel shows was computed on the main thread by
 * the pure modules — the UI renders and routes, it does not judge.
 */

import { useEffect, useState } from 'preact/hooks'

import type { CanvasFinding } from '../lint.js'
import type { ScanPayload } from '../messages.js'
import { HomeTab } from './tabs/home.js'
import { ScanTab } from './tabs/scan.js'
import { SettingsTab } from './tabs/settings.js'
import { download, listen, send } from './state.js'

export type Tab = 'home' | 'scan' | 'settings'

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
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState('')
  const [config, setConfig] = useState<ConfigState>({ json: '' })
  const [detail, setDetail] = useState<Detail>(null)

  useEffect(() => {
    const stop = listen((message) => {
      switch (message.type) {
        case 'scan-result':
          setScan(message.payload)
          setScanning(false)
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
          send({ type: 'scan' })
          break
      }
    })
    send({ type: 'load-config' })
    return stop
  }, [])

  const startScan = (): void => {
    setScanning(true)
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
            onViewRules={() => {
              setTab('scan')
              setDetail(null)
            }}
          />
        )}
        {tab === 'scan' && (
          <ScanTab
            scan={scan}
            scanning={scanning}
            detail={detail}
            onScan={startScan}
            onDetail={setDetail}
          />
        )}
        {tab === 'settings' && <SettingsTab config={config} scan={scan} />}
      </div>
      <nav class="tabs">
        {(['home', 'scan', 'settings'] as const).map((name) => (
          <button
            key={name}
            class={tab === name ? 'active' : ''}
            onClick={() => {
              setTab(name)
              if (name !== 'scan') setDetail(null)
            }}
          >
            {name === 'home' ? 'Home' : name === 'scan' ? 'Scan' : 'Settings'}
          </button>
        ))}
      </nav>
    </>
  )
}
