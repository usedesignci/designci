/**
 * UI-side plumbing: send typed messages to the main thread, subscribe to typed
 * messages back. The only place `postMessage` appears in the UI.
 */

import type { MainMessage, UiMessage } from '../messages.js'

export function send(message: UiMessage): void {
  parent.postMessage({ pluginMessage: message }, '*')
}

export function listen(handler: (message: MainMessage) => void): () => void {
  const onMessage = (event: MessageEvent): void => {
    const message = (event.data as { pluginMessage?: MainMessage }).pluginMessage
    if (message) handler(message)
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}

/** Triggers a browser download of a text file (the snapshot export). */
export function download(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
