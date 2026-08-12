import {
  LEGACY_PERFORMANCE_BANDS,
  PERFORMANCE_BANDS,
} from '../data/sampleAudit'
import type { AuditReport } from '../types'

interface ScoreOverviewProps {
  report: AuditReport
  animate: boolean
}

export function ScoreOverview({ report, animate }: ScoreOverviewProps) {
  const circumference = 2 * Math.PI * 54
  const progress = Math.min(100, Math.max(0, report.overallScore)) / 100
  const offset = circumference * (1 - progress)

  const bands = PERFORMANCE_BANDS.some((b) => b.name === report.band)
    ? PERFORMANCE_BANDS
    : LEGACY_PERFORMANCE_BANDS.some((b) => b.name === report.band)
      ? LEGACY_PERFORMANCE_BANDS
      : PERFORMANCE_BANDS

  return (
    <section className="score-overview" aria-label="Overall score">
      <div className="score-ring-wrap">
        <svg className="score-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="score-ring-track" cx="60" cy="60" r="54" />
          <circle
            className={['score-ring-value', animate ? 'is-animating' : ''].join(' ')}
            cx="60"
            cy="60"
            r="54"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: animate ? offset : circumference,
            }}
          />
        </svg>
        <div className="score-ring-label">
          <span className="score-number">{report.overallScore}</span>
          <span className="score-grade">Grade {report.grade}</span>
        </div>
      </div>

      <div className="score-copy">
        <div className="section-kicker">Weighted score</div>
        <h2 className="panel-title">{report.band}</h2>
        <p className="panel-lede">
          {report.agentName} · {report.fileName} · {report.callId}
          {report.gateFailed ? ' · Manager review required' : ''}
        </p>

        <ul className="band-list">
          {bands.map((band) => (
            <li
              key={band.name}
              className={band.name === report.band ? 'is-current' : undefined}
            >
              <span>{band.name}</span>
              <span>{band.range}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
