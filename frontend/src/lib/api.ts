export const API = 'http://localhost:8000'

export async function readError(r: Response, fallback: string): Promise<string> {
  const d = (await r.json().catch(() => ({}))) as { detail?: unknown }
  return typeof d.detail === 'string' ? d.detail : fallback
}

export function fmtUsd(n: number | null | undefined): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v < 0.01 && v > 0) return `~$${v.toFixed(3)}`
  return `~$${v.toFixed(2)}`
}
