/**
 * The scanning screen: a progress ring over the real stages of the scan.
 *
 * The steps are SCAN_STEPS from the message protocol — the main thread posts
 * `scan-progress` before each stage, so what this shows is what is actually
 * happening, not a theatrical timer.
 */

import { SCAN_STEPS, type ScanStepId } from '../../messages.js'
import { Icon } from '../icons.js'

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export interface ScanProgressProps {
  /** The step currently running; null before the first progress message. */
  readonly current: ScanStepId | null
}

export function ScanProgress(props: ScanProgressProps) {
  const index =
    props.current === null
      ? 0
      : Math.max(
          0,
          SCAN_STEPS.findIndex((step) => step.id === props.current),
        )
  const fraction = index / SCAN_STEPS.length
  const pct = Math.round(fraction * 100)

  return (
    <div class="progress-wrap">
      <h1>Scanning…</h1>
      <p class="sub">Checking this page against your design system.</p>

      <div class="progress-ring">
        <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="track" cx="60" cy="60" r={RADIUS} />
          <circle
            class="bar"
            cx="60"
            cy="60"
            r={RADIUS}
            stroke-dasharray={CIRCUMFERENCE}
            stroke-dashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        </svg>
        <span class="pct">{pct}%</span>
      </div>

      <div class="steps">
        {SCAN_STEPS.map((step, stepIndex) => {
          const state = stepIndex < index ? 'done' : stepIndex === index ? 'active' : 'pending'
          return (
            <div key={step.id} class={`step ${state}`}>
              <span>{step.label}</span>
              <span class="state">
                {state === 'done' && <Icon name="check-circle" size={16} />}
                {state === 'active' && <span class="spinner" />}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
