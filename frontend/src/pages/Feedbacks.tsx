import { FeedbackCue } from '../components/LoopCues'
import { SketchWallpaper } from '../components/SketchWallpaper'
import { KpiCard } from '../components/KpiCard'
import { Workspace } from '../components/Workspace'
import { useAudit } from '../context/AuditContext'

export function Feedbacks() {
  const { report, showReport, loadFeedback, feedbackLoading } = useAudit()
  const ready = report.feedback.status === 'ok'
  const empty = ready && !report.feedback.aboutAgent.length && !report.feedback.aboutProduct.length

  return (
    <>
      <header className="page-bar">
        <div>
          <p className="crumb">Loop / Voice of customer</p>
          <h1>Feedbacks</h1>
        </div>
        {showReport && !ready && (
          <button
            type="button"
            className="choose-btn"
            disabled={feedbackLoading}
            onClick={() => {
              void loadFeedback()
            }}
          >
            {feedbackLoading ? 'Reading transcript…' : 'Load areas of improvement'}
          </button>
        )}
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
              value={String(report.feedback.aboutAgent.length)}
              hint="agent signals"
            />
            <KpiCard
              label="Product"
              value={String(report.feedback.aboutProduct.length)}
              hint="product signals"
            />
            <KpiCard label="Agent" value={report.agentName} hint={report.callId} />
          </div>

          {!ready && (
            <p className="panel-lede">
              Optional — runs one Claude call when you ask for areas of improvement.
            </p>
          )}
          {empty && <p className="panel-lede">None detected on this call.</p>}

          {ready && (
            <Workspace
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
