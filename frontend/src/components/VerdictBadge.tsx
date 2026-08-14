import type { Verdict } from '../types'

const LABELS: Record<Verdict, string> = {
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  FAIL: 'FAIL',
  UNVERIFIED: 'UNVERIFIED',
  'N/A': 'N/A',
  'GATE FAIL': 'GATE FAIL',
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const slug = verdict.toLowerCase().replace(/\s+/g, '-')
  return <span className={`verdict verdict-${slug}`}>{LABELS[verdict]}</span>
}
