import type { BackendAudit, BackendFinding, BackendSegment } from './api'
import type {
  AuditReport,
  CheckType,
  ChurnLevel,
  CriterionFinding,
  PerformanceBand,
  TranscriptSegment,
  Verdict,
} from '../types'
import { bandForScore, gradeForScore } from '../data/sampleAudit'

const VERDICT_MAP: Record<string, Verdict> = {
  pass: 'PASS',
  partial: 'PARTIAL',
  fail: 'FAIL',
  unverified: 'UNVERIFIED',
  not_applicable: 'N/A',
  error: 'UNVERIFIED',
  'gate fail': 'GATE FAIL',
}

function mapVerdict(raw: string | undefined): Verdict {
  if (!raw) return 'UNVERIFIED'
  return VERDICT_MAP[raw.toLowerCase()] ?? 'UNVERIFIED'
}

function mapCheckType(method?: string): CheckType {
  if (!method) return 'AI'
  const m = method.toLowerCase()
  if (m === 'deterministic') return 'RULE'
  if (m.includes('deterministic') && m.includes('llm')) return 'BOTH'
  if (m.includes('llm')) return 'AI'
  return 'RULE'
}

function segStartBySeq(
  segments: BackendSegment[] | undefined,
  seq: number | null | undefined,
): number | null {
  if (seq == null || !segments?.length) return null
  const hit = segments.find((s) => s.seq === seq)
  return hit ? Number(hit.start) : null
}

function mapCriteria(
  findings: BackendFinding[] | undefined,
  segments: BackendSegment[] | undefined,
  coachingTips: { criterion?: string; tip?: string }[],
): CriterionFinding[] {
  const tipByName = new Map<string, string>()
  for (const t of coachingTips) {
    if (t.criterion && t.tip) tipByName.set(t.criterion.toLowerCase(), t.tip)
  }

  return (findings || []).map((f) => {
    const weight = Number(f.weight ?? 0)
    const points =
      f.points != null
        ? Number(f.points)
        : f.verdict === 'pass'
          ? weight
          : f.verdict === 'partial'
            ? weight * 0.5
            : 0
    const tipFromCoach = tipByName.get((f.name || '').toLowerCase())
    const tip = tipFromCoach || f.coaching_note || null
    return {
      id: f.id,
      name: f.name,
      weight,
      checkType: mapCheckType(f.method),
      isGate: Boolean(f.is_gate),
      verdict: mapVerdict(f.verdict),
      pointsEarned: points,
      pointsPossible: weight,
      rationale: f.reasoning || '',
      evidenceQuote: f.evidence_text || null,
      evidenceTimestamp: segStartBySeq(segments, f.evidence_seq),
      coachingTip: tip,
    }
  })
}

function mapTranscript(
  segments: BackendSegment[] | undefined,
  agentSpeaker?: string,
): TranscriptSegment[] {
  return (segments || []).map((s) => ({
    id: `seq-${s.seq}`,
    speaker: s.speaker === agentSpeaker ? 'agent' : 'customer',
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
    text: s.text || '',
  }))
}

function mapChurnLevel(risk?: string): ChurnLevel {
  if (risk === 'low' || risk === 'medium' || risk === 'high' || risk === 'none') {
    return risk
  }
  return 'none'
}

function mapActionItems(
  items: BackendAudit['recap'] extends infer R
    ? R extends { action_items?: infer A }
      ? A
      : never
    : never,
): string[] {
  const list = (items || []) as Array<
    string | { task?: string; owner?: string; due?: string }
  >
  return list
    .map((it) => {
      if (typeof it === 'string') return it.trim()
      const task = (it.task || '').trim()
      if (!task) return ''
      const meta = [it.owner, it.due].filter(Boolean).join(' · ')
      return meta ? `${task} (${meta})` : task
    })
    .filter(Boolean)
}

export interface MapOptions {
  fileName?: string
  coaching?: { criterion?: string; tip?: string }[]
  audioUrl?: string | null
}

/**
 * Normalize a CallProof `/api/calls/{id}/audit` payload into the CALL LOOP AuditReport.
 */
export function mapBackendAudit(audit: BackendAudit, opts: MapOptions = {}): AuditReport {
  const score = Number(audit.score ?? 0)
  const backendGrade = (audit.grade || '').trim()
  const band = (backendGrade || bandForScore(score)) as PerformanceBand
  const letter = gradeForScore(score)
  const segments = audit.segments || []
  const coaching = opts.coaching ?? audit.coaching ?? []

  const feedbackAgent = (audit.feedback?.agent || [])
    .map((i) => (i.summary || i.quote || '').trim())
    .filter(Boolean)
  const feedbackProduct = (audit.feedback?.product || [])
    .map((i) => (i.summary || i.quote || '').trim())
    .filter(Boolean)

  const recap = audit.recap || {}
  const headline =
    (recap.tldr || recap.headline || '').trim() ||
    (recap.status === 'ok' ? 'Call recap' : 'Recap unavailable')
  const narrative =
    (recap.summary || '').trim() ||
    (recap.error ? String(recap.error) : 'No summary returned for this call.')

  const churnSeq = audit.churn?.evidence_seq
  const churnTs = segStartBySeq(segments, churnSeq) ?? 0

  return {
    callId: String(audit.call_id),
    fileName: opts.fileName || `call-${audit.call_id}.mp3`,
    durationSec: Number(audit.audio_seconds ?? 0),
    analyzedAt: new Date().toISOString(),
    agentName: audit.agent_speaker ? `Agent (${audit.agent_speaker})` : 'Agent',
    customerLabel: 'Customer',
    overallScore: score,
    band,
    grade: letter,
    gateFailed: Boolean(audit.flagged || (audit.gate_fails || []).length),
    criteria: mapCriteria(audit.findings, segments, coaching),
    churn: {
      level: mapChurnLevel(audit.churn?.risk),
      quote: (audit.churn?.evidence_text || audit.churn?.reasoning || 'No churn quote.').trim(),
      timestamp: churnTs,
    },
    feedback: {
      aboutAgent: feedbackAgent,
      aboutProduct: feedbackProduct,
    },
    summary: {
      headline,
      narrative,
      actionItems: mapActionItems(recap.action_items),
    },
    transcript: mapTranscript(segments, audit.agent_speaker),
    audioUrl: opts.audioUrl ?? null,
  }
}
