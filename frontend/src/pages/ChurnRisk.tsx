import { useNavigate } from 'react-router-dom'
import { ChurnCue } from '../components/LoopCues'
import { SketchWallpaper } from '../components/SketchWallpaper'
import { KpiCard } from '../components/KpiCard'
import { Workspace } from '../components/Workspace'
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
      <header className="page-bar">
        <div>
          <p className="crumb">Loop / Retention</p>
          <h1>Churn Risk</h1>
        </div>
      </header>

      {!showReport && (
        <div className="empty-card is-pulse">
          <SketchWallpaper variant="churn" />
          <ChurnCue />
          <p className="empty-title">No churn language yet</p>
          <p className="empty-copy">Ingest a recording to score retention risk before renewal.</p>
        </div>
      )}

      {showReport && (
        <>
          <div className="kpi-strip">
        <KpiCard
          label="Rating"
          value={churn.level}
          hint="From the driving quote"
          tone={churn.level === 'high' || churn.level === 'medium' ? 'warn' : 'good'}
        />
        <KpiCard label="Agent" value={report.agentName} hint={report.fileName} />
        <KpiCard
          label="Actions"
          value={String(report.summary.actionItems.length)}
          hint="to close this loop"
        />
      </div>

      <Workspace
        noteScopeKey={
          report.numericCallId != null
            ? `churn-${report.numericCallId}`
            : report.callId
              ? `churn-${report.callId}`
              : null
        }
        tabs={[
          {
            id: 'scale',
            label: 'Scale',
            panel: (
              <div className="risk-meter" role="list">
                {LEVELS.map((band) => (
                  <div
                    key={band.level}
                    role="listitem"
                    className={[
                      'risk-seg',
                      `churn-${band.level}`,
                      band.level === churn.level ? 'is-current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className={`risk-seg-label churn-level churn-${band.level}`}>
                      {band.label}
                    </span>
                    <span>{band.hint}</span>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: 'quote',
            label: 'Quote',
            panel: (
              <blockquote className="evidence">
                {churn.quote ? <p>“{churn.quote}”</p> : <p>No driving quote on this call.</p>}
                {churn.timestamp > 0 && (
                  <button
                    type="button"
                    className="timestamp-btn"
                    onClick={() => {
                      onSeek(churn.timestamp)
                      navigate('/agents-pulse')
                    }}
                  >
                    Play at {formatTime(churn.timestamp)}
                  </button>
                )}
              </blockquote>
            ),
          },
          {
            id: 'actions',
            label: 'Close the loop',
            panel: (
              <ol className="action-items">
                {report.summary.actionItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            ),
          },
        ]}
      />
        </>
      )}
    </>
  )
}
