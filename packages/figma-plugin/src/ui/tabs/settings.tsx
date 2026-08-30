import { useEffect, useState } from 'preact/hooks'

import type { ScanPayload } from '../../messages.js'
import type { ConfigState } from '../app.js'
import { send } from '../state.js'

export interface SettingsProps {
  readonly config: ConfigState
  readonly scan: ScanPayload | null
}

export function SettingsTab(props: SettingsProps) {
  const [draft, setDraft] = useState(props.config.json)

  // Adopt saved config when it arrives (boot load, save round-trips).
  useEffect(() => {
    setDraft(props.config.json)
  }, [props.config.json])

  const ignores = props.scan?.ignores ?? []

  return (
    <>
      <h1>Settings</h1>

      <h2>Check config</h2>
      <p class="sub">
        Paste your project's <code>designci.config.json</code>. It is stored in this file, so the
        whole team shares one policy.
      </p>
      <textarea
        spellcheck={false}
        value={draft}
        onInput={(event) => setDraft((event.target as HTMLTextAreaElement).value)}
        placeholder={'{ "rules": { "canvas-raw-color": "error" } }'}
      />
      <div class="row">
        <button onClick={() => send({ type: 'save-config', json: draft })}>Save config</button>
        {props.config.error !== undefined && (
          <span class="error-text">{props.config.error}</span>
        )}
        {props.config.saved === true && props.config.error === undefined && (
          <span class="ok-text">Saved to this file.</span>
        )}
      </div>

      <h2>Ignored canvas issues</h2>
      {ignores.length === 0 ? (
        <p class="muted">
          Nothing ignored{props.scan === null ? ' (run a scan to load this file’s ignores)' : ''}.
        </p>
      ) : (
        <ul class="plain">
          {ignores.map((key) => (
            <li key={key} class="layer-row">
              <span class="grow">
                <code>{key}</code>
              </span>
              <button class="small" onClick={() => send({ type: 'remove-ignore', key })}>
                Un-ignore
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>About</h2>
      <p class="muted">
        Design CI runs entirely inside Figma: no network access, no AI, no telemetry. Scans cover
        the current page. The design↔code comparison runs in CI via{' '}
        <code>npx designci check</code>.
      </p>
    </>
  )
}
