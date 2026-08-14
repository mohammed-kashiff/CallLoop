import { useEffect, useState } from 'react'
import { formatTime, scoreHue } from '../lib/format'

const ACTIVE = new Set(['transcoding', 'uploading', 'auditing'])

function progressFor(status: string, elapsedSec: number): number {
  if (status === 'queued') return 0
  if (status === 'done') return 100
  if (status === 'failed') return 100
  const floor = status === 'transcoding' ? 4 : status === 'uploading' ? 28 : 58
  const span = status === 'transcoding' ? 24 : status === 'uploading' ? 28 : 36
  const expected = status === 'transcoding' ? 18 : status === 'uploading' ? 30 : 40
  return Math.min(
    floor + span - 1,
    Math.round(floor + span * (1 - Math.exp(-Math.max(0, elapsedSec) / expected))),
  )
}

interface CallProgressProps {
  status: string
  startedAt?: number | null
  elapsedMs?: number | null
  /** When done, tint the ring by score band. */
  score?: number | null
}

export function CallProgress({ status, startedAt, elapsedMs, score }: CallProgressProps) {
  const [now, setNow] = useState(() => Date.now())
  const active = ACTIVE.has(status)

  useEffect(() => {
    if (!active) return undefined
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [active])

  const elapsedSec =
    active && startedAt
      ? (now - startedAt) / 1000
      : elapsedMs != null
        ? elapsedMs / 1000
        : 0
  const pct = progressFor(status, elapsedSec)
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100)
  const showTime = active || elapsedMs != null || Boolean(startedAt)
  const label = status === 'done' ? 'Audit time' : 'Elapsed'
  const scoreStroke =
    (status === 'done' || status === 'completed') && score != null ? scoreHue(score) : undefined

  return (
    <span
      className={['call-progress', `is-${status}`].join(' ')}
      title={`${label} ${formatTime(elapsedSec)}`}
    >
      <svg className="call-progress-ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle className="call-progress-track" cx="20" cy="20" r={radius} />
        <circle
          className="call-progress-value"
          cx="20"
          cy="20"
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            ...(scoreStroke ? { stroke: scoreStroke } : null),
          }}
        />
      </svg>
      {showTime ? (
        <span className="call-progress-time">{formatTime(elapsedSec)}</span>
      ) : (
        <span className="call-progress-time is-empty">—</span>
      )}
    </span>
  )
}
