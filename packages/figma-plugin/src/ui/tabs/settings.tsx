import { useEffect, useState } from 'preact/hooks'

import type { ScanPayload, SyncState } from '../../messages.js'
import { DEFAULT_SNAPSHOT_PATH } from '../../sync.js'
import type { ConfigState } from '../app.js'
import { send } from '../state.js'

export interface SettingsProps {
  readonly config: ConfigState
  readonly scan: ScanPayload | null
  readonly sync: SyncState | null
}

function RepoSync(props: { readonly sync: SyncState | null }) {
  const settings = props.sync?.settings
  const [owner, setOwner] = useState(settings?.owner ?? '')
  const [repo, setRepo] = useState(settings?.repo ?? '')
  const [path, setPath] = useState(settings?.path ?? '')
  const [baseBranch, setBaseBranch] = useState(settings?.baseBranch ?? '')
  const [token, setToken] = useState('')

  // Adopt stored settings when they arrive (boot load, save round-trips).
  useEffect(() => {
    setOwner(settings?.owner ?? '')
    setRepo(settings?.repo ?? '')
    setPath(settings?.path ?? '')
    setBaseBranch(settings?.baseBranch ?? '')
  }, [settings])

  const saveSettings = (): void => {
    if (owner.trim() === '' || repo.trim() === '') return
    send({
      type: 'save-sync-settings',
      settings: {
        owner: owner.trim(),
        repo: repo.trim(),
        path: path.trim() === '' ? DEFAULT_SNAPSHOT_PATH : path.trim(),
        ...(baseBranch.trim() === '' ? {} : { baseBranch: baseBranch.trim() }),
      },
    })
  }

  const saveToken = (): void => {
    if (token.trim() === '') return
    send({ type: 'save-sync-token', token: token.trim() })
    setToken('')
  }

  return (
    <>
      <h2>Repo sync</h2>
      <p class="sub">
        Push the snapshot straight to GitHub as a pull request — one click from Home. The repo
        details are stored in this file for the whole team; the token stays on your machine only.
      </p>

      <div class="field-row">
        <div class="field">
          <label>Owner</label>
          <input
            type="text"
            value={owner}
            placeholder="acme"
            onInput={(event) => setOwner((event.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label>Repository</label>
          <input
            type="text"
            value={repo}
            placeholder="web"
            onInput={(event) => setRepo((event.target as HTMLInputElement).value)}
          />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Snapshot path</label>
          <input
            type="text"
            value={path}
            placeholder={DEFAULT_SNAPSHOT_PATH}
            onInput={(event) => setPath((event.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label>Base branch (optional)</label>
          <input
            type="text"
            value={baseBranch}
            placeholder="repo default"
            onInput={(event) => setBaseBranch((event.target as HTMLInputElement).value)}
          />
        </div>
      </div>
      <div class="row">
        <button onClick={saveSettings} disabled={owner.trim() === '' || repo.trim() === ''}>
          Save repo
        </button>
        {settings !== undefined && (
          <>
            <span class="ok-text">
              Connected to {settings.owner}/{settings.repo}.
            </span>
            <button
              class="small"
              onClick={() => {
                send({ type: 'save-sync-settings', settings: null })
                send({ type: 'save-sync-token', token: '' })
              }}
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      <div class="field" style="margin-top: 12px">
        <label>Your GitHub token</label>
        <input
          type="password"
          value={token}
          placeholder={props.sync?.hasToken === true ? 'saved for your account' : 'github_pat_…'}
          onInput={(event) => setToken((event.target as HTMLInputElement).value)}
        />
      </div>
      <div class="row">
        <button onClick={saveToken} disabled={token.trim() === ''}>
          Save token
        </button>
        {props.sync?.hasToken === true && (
          <button class="small" onClick={() => send({ type: 'save-sync-token', token: '' })}>
            Remove token
          </button>
        )}
      </div>
      <p class="footer-note">
        Use a fine-grained personal access token scoped to just this repository, with Contents and
        Pull requests read &amp; write. It is stored in Figma’s client storage on this computer —
        never in the shared file — and is sent only to api.github.com when you push.
      </p>
    </>
  )
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

      <RepoSync sync={props.sync} />

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
        Every check runs locally inside Figma: no AI, no telemetry. The only network use is the
        optional repo sync above, which talks solely to api.github.com when you push a snapshot.
        Scans cover the current page; the design↔code comparison runs in CI via{' '}
        <code>npx designci check</code>.
      </p>
    </>
  )
}
