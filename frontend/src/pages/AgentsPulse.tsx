import { BrandLogo } from '../components/BrandLogo'
import { CriteriaFindings } from '../components/CriteriaFindings'
import { Pipeline } from '../components/Pipeline'
import { ScoreOverview } from '../components/ScoreOverview'
import { TranscriptPlayer } from '../components/TranscriptPlayer'
import { UploadZone } from '../components/UploadZone'
import { useAudit } from '../context/AuditContext'

export function AgentsPulse() {
  const {
    report,
    statuses,
    activeStep,
    running,
    showReport,
    scoreAnimate,
    seekTo,
    error,
    runPipeline,
    runDemo,
    onSeek,
    onSeekHandled,
    clearError,
  } = useAudit()

  const tips = report.criteria.filter((c) => c.coachingTip)
  const criteriaCount = report.criteria.length || 4

  return (
    <>
      <section className="hero">
        <BrandLogo size="hero" stacked surface="dark" className="hero-brand-lockup" />
        <h1>Not just a call auditing tool, we close the loop</h1>
        <p className="hero-process">Listen · Analyze · Improve</p>
        <p className="hero-lede">
          Upload a recording — CALL LOOP transcribes with PyAI Hear, evaluates the CallProof
          rubric, scores 0–100, and surfaces coaching tips with an evidence-backed audit pulse.
        </p>
      </section>

      <Pipeline activeStep={activeStep} statuses={statuses} />

      <UploadZone
        disabled={running}
        onValidFile={runPipeline}
        onDemo={runDemo}
      />

      {error && (
        <p className="upload-error" role="alert">
          {error}{' '}
          <button type="button" className="inline-link" onClick={clearError}>
            Dismiss
          </button>
        </p>
      )}

      {showReport && (
        <div className="report-stack reveal">
          <ScoreOverview report={report} animate={scoreAnimate} />
          <CriteriaFindings
            criteria={report.criteria}
            onSeek={onSeek}
            criteriaCount={criteriaCount}
          />

          <section className="enrichment" aria-label="Coaching tips">
            <div className="enrich-block">
              <div className="section-kicker ai-kicker">AI Insights · Coaching</div>
              <h2 className="panel-title">Actionable tips</h2>
              {tips.length === 0 ? (
                <p className="panel-lede">No coaching tips for this call.</p>
              ) : (
                <ul className="tip-list">
                  {tips.map((c) => (
                    <li key={c.id}>
                      <p className="tip-criterion">{c.name}</p>
                      <p>{c.coachingTip}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="enrich-block">
              <div className="section-kicker">PyAI Recap</div>
              <h2 className="panel-title">{report.summary.headline}</h2>
              <p className="panel-lede">{report.summary.narrative}</p>
              {report.summary.actionItems.length > 0 && (
                <ol className="action-items">
                  {report.summary.actionItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <TranscriptPlayer
            segments={report.transcript}
            durationSec={report.durationSec}
            seekTo={seekTo}
            onSeekHandled={onSeekHandled}
            audioSrc={report.audioUrl}
          />

          <section className="verdict-legend" aria-label="Verdict meanings">
            <div className="section-kicker">What each verdict means</div>
            <ul>
              <li>
                <strong>PASS</strong> — criterion fully met
              </li>
              <li>
                <strong>PARTIAL</strong> — partially met (half points)
              </li>
              <li>
                <strong>FAIL</strong> — not met
              </li>
              <li>
                <strong>UNVERIFIED</strong> — AI quote not found in transcript
              </li>
              <li>
                <strong>N/A</strong> — criterion did not apply
              </li>
              <li>
                <strong>GATE FAIL</strong> — critical failure; manager review
              </li>
            </ul>
          </section>
        </div>
      )}

      {!showReport && !running && (
        <p className="idle-hint">
          Drop an MP3 under 25 MB to run a live CallProof audit, or use the sample audit to explore
          the UI without the backend.
        </p>
      )}
    </>
  )
}
