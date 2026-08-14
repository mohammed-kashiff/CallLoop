import { formatTime } from '../lib/format'
import type { CriterionFinding } from '../types'
import { VerdictBadge } from './VerdictBadge'

interface CriteriaFindingsProps {
  criteria: CriterionFinding[]
  onSeek: (seconds: number) => void
}

export function CriteriaFindings({ criteria, onSeek }: CriteriaFindingsProps) {
  return (
    <section className="criteria-panel" aria-label="Per-criterion findings">
      <ul className="criteria-list">
        {criteria.map((c) => (
          <li key={c.id} className="criterion">
            <div className="criterion-top">
              <div>
                <h3>
                  {c.name}
                  {c.isGate && <span className="gate-tag">GATE</span>}
                  <span className="check-chip">{c.checkType}</span>
                </h3>
                <p className="criterion-meta">
                  weight {c.weight} · {c.pointsEarned}/{c.pointsPossible} pts
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
