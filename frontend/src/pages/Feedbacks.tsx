import { Link } from 'react-router-dom'
import { FeedbackCue } from '../components/LoopCues'
import { SketchWallpaper } from '../components/SketchWallpaper'
import { KpiCard } from '../components/KpiCard'
import { Workspace } from '../components/Workspace'
import { useAudit } from '../context/AuditContext'

export function Feedbacks() {
  const { report, showReport } = useAudit()
  const ready = report.feedback.status === 'ok'
  const empty = ready && !report.feedback.aboutAgent.length && !report.feedback.aboutProduct.length

  return (
    <>
      <header className="page-bar">
        <div>
          <p className="crumb">Loop / Voice of customer</p>
          <h1>Feedbacks</h1>
        </div>
      </header>

      {!showReport && (
        <div className="empty-card is-pulse">
          <SketchWallpaper variant="feedbacks" />
          <FeedbackCue />
          <p className="empty-title">No voice of customer yet</p>
          <p className="empty-copy">Ingest a recording to surface service and product signals.</p>
        </div>
      )}

      {showReport && (
        <>
          <div className="kpi-strip">
            <KpiCard
              label="Service"
              value={ready ? String(report.feedback.aboutAgent.length) : '—'}
              hint="agent signals"
            />
            <KpiCard
              label="Product"
              value={ready ? String(report.feedback.aboutProduct.length) : '—'}
              hint="product signals"
            />
            <KpiCard label="Agent" value={report.agentName} hint={report.callId} />
          </div>

          {!ready && (
            <p className="panel-lede">
              Load areas of improvement from{' '}
              <Link to="/agents-pulse" className="inline-link">
                Agent Pulse → Evaluation
              </Link>{' '}
              for this call. Switch calls there and load again without leaving Pulse.
            </p>
          )}
          {empty && <p className="panel-lede">None detected on this call.</p>}

          {ready && (
            <Workspace
              noteScopeKey={
                report.numericCallId != null
                  ? `feedback-${report.numericCallId}`
                  : report.callId
                    ? `feedback-${report.callId}`
                    : null
              }
              tabs={[
                {
                  id: 'service',
                  label: 'Service',
                  panel: (
                    <ul className="feedback-list">
                      {report.feedback.aboutAgent.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ),
                },
                {
                  id: 'product',
                  label: 'Product',
                  panel: (
                    <ul className="feedback-list">
                      {report.feedback.aboutProduct.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </>
  )
}
