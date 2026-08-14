import { capFirst, capWords, scoreHue } from '../lib/format'
import type { AuditReport } from '../types'

interface ScoreOverviewProps {
  report: AuditReport
  animate: boolean
}

export function ScoreOverview({ report, animate }: ScoreOverviewProps) {
  const circumference = 2 * Math.PI * 54
  const score = Math.min(100, Math.max(0, report.overallScore))
  const progress = score / 100
  const offset = circumference * (1 - progress)
  const color = scoreHue(score)

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
            stroke={color}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: animate ? offset : circumference,
            }}
          />
        </svg>
        <div className="score-ring-label">
          <span className="score-number" style={{ color }}>
            {report.overallScore}
          </span>
          <span className="score-grade">/ 100</span>
        </div>
      </div>

      <div className="score-copy">
        <h2 className="panel-title">{report.band}</h2>
        <p className="panel-lede">
          {capWords(report.agentName)} · {capFirst(report.fileName)}
          {report.gateFailed ? ' · Review required' : ''}
        </p>
      </div>
    </section>
  )
}
