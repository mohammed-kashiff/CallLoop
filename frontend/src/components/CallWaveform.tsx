import type { CSSProperties } from 'react'

const AGENT_PEAKS = [
  0.18, 0.22, 0.28, 0.55, 0.82, 0.64, 0.36, 0.2, 0.24, 0.48, 0.76, 0.58, 0.3, 0.18, 0.2, 0.26, 0.62,
  0.88, 0.7, 0.42, 0.22, 0.18, 0.32, 0.5, 0.34, 0.2, 0.18, 0.22, 0.4, 0.28, 0.2, 0.18,
]

const CUSTOMER_PEAKS = [
  0.18, 0.2, 0.22, 0.18, 0.2, 0.26, 0.44, 0.7, 0.86, 0.6, 0.34, 0.2, 0.18, 0.22, 0.38, 0.72, 0.8,
  0.52, 0.28, 0.18, 0.2, 0.48, 0.66, 0.4, 0.22, 0.18, 0.24, 0.3, 0.2, 0.18, 0.2, 0.18,
]

export function CallWaveform() {
  return (
    <div className="call-wave" aria-hidden="true">
      <div className="call-wave-row is-agent">
        {AGENT_PEAKS.map((peak, i) => (
          <span
            key={`a-${i}`}
            className="call-wave-bar"
            style={{ '--peak': peak, '--i': i } as CSSProperties}
          />
        ))}
      </div>
      <div className="call-wave-axis" />
      <div className="call-wave-row is-customer">
        {CUSTOMER_PEAKS.map((peak, i) => (
          <span
            key={`c-${i}`}
            className="call-wave-bar"
            style={{ '--peak': peak, '--i': i } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}
