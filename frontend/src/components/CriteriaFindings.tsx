import { formatTime } from '../lib/format'
import type { CriterionFinding } from '../types'
import { VerdictBadge } from './VerdictBadge'

interface CriteriaFindingsProps {
  criteria: CriterionFinding[]
  onSeek: (seconds: number) => void
  criteriaCount?: number
}

export function CriteriaFindings({
  criteria,
  onSeek,
  criteriaCount,
}: CriteriaFindingsProps) {
  const n = criteriaCount ?? criteria.length
  return (
    <section className="criteria-panel" aria-label="Per-criterion findings">
      <div className="section-kicker">
        Quality rubric · {n} dimension{n === 1 ? '' : 's'}
      </div>
      <h2 className="panel-title">Findings with evidence</h2>
      <p className="panel-lede">
        RULE, AI, and BOTH checks. Evidence quotes are verified word-for-word — inventing citations
        becomes UNVERIFIED.
      </p>

      <ul className="criteria-list">
        {criteria.map((c) => (
          <li key={c.id} className="criterion">
            <div className="criterion-top">
              <div>
                <h3>
                  {c.name}
                  {c.isGate && <span className="gate-tag">GATE</span>}
                </h3>
                <p className="criterion-meta">
                  {c.checkType} · weight {c.weight} · {c.pointsEarned}/{c.pointsPossible} pts
                </p>
              </div>
              <VerdictBadge verdict={c.verdict} />
            </div>
            <p className="criterion-rationale">{c.rationale}</p>
            {c.evidenceQuote && (
              <blockquote className="evidence">
                <p>“{c.evidenceQuote}”</p>
                {c.evidenceTimestamp != null && (
                  <button
                    type="button"
                    className="timestamp-btn"
                    onClick={() => onSeek(c.evidenceTimestamp!)}
                  >
                    Jump to {formatTime(c.evidenceTimestamp)}
                  </button>
                )}
              </blockquote>
            )}
            {!c.evidenceQuote && c.evidenceTimestamp != null && (
              <button
                type="button"
                className="timestamp-btn ghost"
                onClick={() => onSeek(c.evidenceTimestamp!)}
              >
                Related moment {formatTime(c.evidenceTimestamp)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
