import { Link, useNavigate } from 'react-router-dom'
import { formatTime } from '../lib/format'
import { useAudit } from '../context/AuditContext'
import type { ChurnLevel } from '../types'

const LEVELS: { level: ChurnLevel; label: string; hint: string }[] = [
  { level: 'none', label: 'None', hint: 'No churn language detected' },
  { level: 'low', label: 'Low', hint: 'Mild dissatisfaction, no switch threat' },
  { level: 'medium', label: 'Medium', hint: 'Explicit provider-switch risk' },
  { level: 'high', label: 'High', hint: 'Imminent cancel / escalate language' },
]

export function ChurnRisk() {
  const navigate = useNavigate()
  const { report, showReport, onSeek } = useAudit()
  const { churn } = report

  return (
    <>
      <section className="hero page-hero">
        <div className="section-kicker">Churn risk</div>
        <h1>
          Rated{' '}
          <span className={`churn-level churn-${churn.level}`}>{churn.level}</span>
        </h1>
        <p className="hero-lede">
          CALL LOOP reads the customer&apos;s words and rates churn risk with the exact quote that
          drove the rating — so retention can act before the loop breaks.
        </p>
      </section>

      {!showReport && (
        <p className="idle-hint">
          Showing sample churn analysis from the demo call.{' '}
          <Link to="/" className="inline-link">
            Run an audit on Agents Pulse
          </Link>{' '}
          to refresh.
        </p>
      )}

      <section className="page-panel" aria-label="Churn risk detail">
        <div className="churn-band-list" role="list">
          {LEVELS.map((band) => (
            <div
              key={band.level}
              role="listitem"
              className={[
                'churn-band',
                band.level === churn.level ? 'is-current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={`churn-level churn-${band.level}`}>{band.label}</span>
              <span>{band.hint}</span>
            </div>
          ))}
        </div>

        <div className="enrich-block">
          <div className="section-kicker">Driving quote</div>
          <h2 className="panel-title">Why this rating</h2>
          <blockquote className="evidence">
            <p>“{churn.quote}”</p>
            <button
              type="button"
              className="timestamp-btn"
              onClick={() => {
                onSeek(churn.timestamp)
                navigate('/')
              }}
            >
              Moment at {formatTime(churn.timestamp)} — play on Agents Pulse
            </button>
          </blockquote>
          <p className="meta-line">
            Customer on {report.fileName} · Agent {report.agentName}
          </p>
        </div>

        <div className="enrich-block">
          <div className="section-kicker">Suggested loop close</div>
          <h2 className="panel-title">Retention actions</h2>
          <ol className="action-items">
            {report.summary.actionItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>
    </>
  )
}
