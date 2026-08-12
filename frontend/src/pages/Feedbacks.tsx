import { Link } from 'react-router-dom'
import { useAudit } from '../context/AuditContext'

export function Feedbacks() {
  const { report, showReport } = useAudit()

  return (
    <>
      <section className="hero page-hero">
        <div className="section-kicker">Feedbacks</div>
        <h1>What customers said</h1>
        <p className="hero-lede">
          CALL LOOP splits feedback into service (agent) and product buckets so QA and product can
          each close their loop.
        </p>
      </section>

      {!showReport && (
        <p className="idle-hint">
          Showing sample feedback from the demo call.{' '}
          <Link to="/" className="inline-link">
            Run an audit on Agents Pulse
          </Link>{' '}
          to refresh from a new upload.
        </p>
      )}

      <section className="page-panel" aria-label="Customer feedback">
        <div className="feedback-columns page-feedback">
          <div className="enrich-block">
            <div className="section-kicker">Service</div>
            <h2 className="panel-title">About the agent</h2>
            <p className="panel-lede">Signals about {report.agentName}&apos;s handling of the call.</p>
            <ul className="feedback-list">
              {report.feedback.aboutAgent.length === 0 ? (
                <li className="muted">None detected.</li>
              ) : (
                report.feedback.aboutAgent.map((item) => (
                  <li key={item}>{item}</li>
                ))
              )}
            </ul>
          </div>
          <div className="enrich-block">
            <div className="section-kicker">Product</div>
            <h2 className="panel-title">About the product</h2>
            <p className="panel-lede">What the customer said about billing, plans, and experience.</p>
            <ul className="feedback-list">
              {report.feedback.aboutProduct.length === 0 ? (
                <li className="muted">None detected.</li>
              ) : (
                report.feedback.aboutProduct.map((item) => (
                  <li key={item}>{item}</li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div className="enrich-block span-block">
          <div className="section-kicker">Call context</div>
          <h2 className="panel-title">{report.summary.headline}</h2>
          <p className="panel-lede">{report.summary.narrative}</p>
          <p className="meta-line">
            {report.fileName} · {report.callId} · Agent {report.agentName}
          </p>
        </div>
      </section>
    </>
  )
}
