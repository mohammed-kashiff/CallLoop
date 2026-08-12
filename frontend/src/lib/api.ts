/** CallProof API base. Override with VITE_API_BASE if needed. */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function readDetail(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    return JSON.stringify(data)
  } catch {
    return res.statusText || 'Request failed'
  }
}

export interface UploadResult {
  call_id: number
  status?: string
  audio_seconds?: number
}

export async function uploadCall(file: File): Promise<UploadResult> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new ApiError(res.status, await readDetail(res))
  return res.json()
}

/** Backend audit payload (subset we care about). */
export interface BackendAudit {
  call_id: number
  audio_seconds?: number
  agent_speaker?: string
  rubric?: string
  rubric_id?: string
  score: number
  grade: string
  flagged?: boolean
  gate_fails?: string[]
  manager_review?: unknown[]
  findings?: BackendFinding[]
  segments?: BackendSegment[]
  churn?: {
    risk?: string
    reasoning?: string
    evidence_text?: string | null
    evidence_seq?: number | null
  }
  feedback?: {
    status?: string
    agent?: BackendFeedbackItem[]
    product?: BackendFeedbackItem[]
  }
  coaching?: { criterion?: string; tip?: string }[]
  recap?: {
    status?: string
    tldr?: string
    headline?: string
    summary?: string
    action_items?: Array<string | { task?: string; owner?: string; due?: string }>
    error?: string
  }
}

export interface BackendFinding {
  id: string
  name: string
  method?: string
  weight: number
  is_gate?: boolean
  verdict: string
  reasoning?: string
  points?: number | null
  evidence_text?: string | null
  evidence_seq?: number | null
  evidence_verified?: boolean | null
  coaching_note?: string | null
}

export interface BackendSegment {
  seq: number
  speaker: string
  start: number
  end: number
  text: string
}

export interface BackendFeedbackItem {
  summary?: string
  sentiment?: string
  quote?: string | null
  seq?: number | null
}

export async function fetchAudit(callId: number): Promise<BackendAudit> {
  const res = await fetch(`${API_BASE}/api/calls/${callId}/audit`)
  if (!res.ok) throw new ApiError(res.status, await readDetail(res))
  return res.json()
}

export async function fetchCoaching(
  callId: number,
): Promise<{ call_id: number; coaching: { criterion?: string; tip?: string }[] }> {
  const res = await fetch(`${API_BASE}/api/calls/${callId}/coaching`, {
    method: 'POST',
  })
  if (!res.ok) throw new ApiError(res.status, await readDetail(res))
  return res.json()
}

export function audioUrl(callId: number): string {
  return `${API_BASE}/api/calls/${callId}/audio`
}
