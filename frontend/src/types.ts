export type Verdict =
  | 'PASS'
  | 'PARTIAL'
  | 'FAIL'
  | 'UNVERIFIED'
  | 'N/A'
  | 'GATE FAIL'

export type CheckType = 'RULE' | 'AI' | 'BOTH'

/** Legacy v3 + v8 band labels (display string from backend grade). */
export type PerformanceBand = string

export type ChurnLevel = 'none' | 'low' | 'medium' | 'high'

export type PipelineStepId =
  | 'upload'
  | 'transcribe'
  | 'evaluate'
  | 'score'
  | 'report'

export type PipelineStatus = 'idle' | 'active' | 'done' | 'error'

export interface CriterionFinding {
  id: string
  name: string
  weight: number
  checkType: CheckType
  isGate: boolean
  verdict: Verdict
  pointsEarned: number
  pointsPossible: number
  rationale: string
  evidenceQuote: string | null
  evidenceTimestamp: number | null
  coachingTip: string | null
}

export interface TranscriptSegment {
  id: string
  speaker: 'agent' | 'customer'
  start: number
  end: number
  text: string
}

export interface CustomerFeedback {
  aboutAgent: string[]
  aboutProduct: string[]
}

export interface CallSummary {
  headline: string
  narrative: string
  actionItems: string[]
}

export interface ChurnRisk {
  level: ChurnLevel
  quote: string
  timestamp: number
}

export interface AuditReport {
  callId: string
  fileName: string
  durationSec: number
  analyzedAt: string
  agentName: string
  customerLabel: string
  overallScore: number
  band: PerformanceBand
  grade: string
  gateFailed: boolean
  criteria: CriterionFinding[]
  churn: ChurnRisk
  feedback: CustomerFeedback
  summary: CallSummary
  transcript: TranscriptSegment[]
  /** When set, transcript player uses real CallProof audio. */
  audioUrl?: string | null
}
