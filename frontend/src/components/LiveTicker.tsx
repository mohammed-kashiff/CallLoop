import { useEffect, useState } from 'react'
import { API, fmtUsd } from '../lib/api'
import type { PyaiStatus } from '../types'

export function LiveTicker() {
  const [status, setStatus] = useState<PyaiStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch(`${API}/api/pyai/status`)
        .then((r) => r.json() as Promise<PyaiStatus>)
        .then((data) => {
          if (!cancelled) setStatus(data)
        })
        .catch(() => {
          if (!cancelled) {
            setStatus({
              ok: false,
              healthy: false,
              label: 'PyAI',
              quota_label: 'Status unavailable',
            })
          }
        })
    }
    load()
    const id = window.setInterval(load, 15000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const stats =
    status?.quota_label ||
    [
      status?.pyai_actions != null ? `${status.pyai_actions} PyAI` : null,
      status?.pyai_polls ? `${status.pyai_polls} polls` : null,
      status?.claude_hits != null ? `${status.claude_hits} Claude` : null,
    ]
      .filter(Boolean)
      .join(' · ') ||
    'Waiting…'

  return (
    <div className="live-ticker" aria-label="Live usage">
      <span className="live-pill">
        <span
          className={['live-dot', status?.healthy ? 'is-ok' : ''].filter(Boolean).join(' ')}
          aria-hidden="true"
        />
        <strong>{(status?.label || 'LIVE').toUpperCase()}</strong>
        <span className="live-stats">{stats}</span>
      </span>
      {status?.cost_today && (
        <span
          className="live-today"
          title="Approximate spend today (UTC), not a provider invoice."
        >
          <span className="live-today-kicker">Today</span>
          {fmtUsd(status.cost_today.total_usd)}
        </span>
      )}
    </div>
  )
}
