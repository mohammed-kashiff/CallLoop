import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { sampleAudit } from '../data/sampleAudit'
import { ApiError, audioUrl, fetchAudit, fetchCoaching, uploadCall } from '../lib/api'
import { mapBackendAudit } from '../lib/mapAudit'
import type { AuditReport, PipelineStepId, PipelineStatus } from '../types'

const STEP_ORDER: PipelineStepId[] = [
  'upload',
  'transcribe',
  'evaluate',
  'score',
  'report',
]

const idleStatuses = (): Record<PipelineStepId, PipelineStatus> => ({
  upload: 'idle',
  transcribe: 'idle',
  evaluate: 'idle',
  score: 'idle',
  report: 'idle',
})

interface AuditContextValue {
  report: AuditReport
  statuses: Record<PipelineStepId, PipelineStatus>
  activeStep: PipelineStepId | null
  running: boolean
  showReport: boolean
  scoreAnimate: boolean
  seekTo: number | null
  error: string | null
  runPipeline: (file: File) => void
  runDemo: () => void
  onSeek: (seconds: number) => void
  onSeekHandled: () => void
  clearError: () => void
}

const AuditContext = createContext<AuditContextValue | null>(null)

function markDone(
  setStatuses: React.Dispatch<
    React.SetStateAction<Record<PipelineStepId, PipelineStatus>>
  >,
  step: PipelineStepId,
) {
  setStatuses((s) => ({ ...s, [step]: 'done' }))
}

function markActive(
  setStatuses: React.Dispatch<
    React.SetStateAction<Record<PipelineStepId, PipelineStatus>>
  >,
  setActiveStep: (s: PipelineStepId | null) => void,
  step: PipelineStepId,
) {
  setActiveStep(step)
  setStatuses((s) => ({ ...s, [step]: 'active' }))
}

export function AuditProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState(idleStatuses)
  const [activeStep, setActiveStep] = useState<PipelineStepId | null>(null)
  const [running, setRunning] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [scoreAnimate, setScoreAnimate] = useState(false)
  const [seekTo, setSeekTo] = useState<number | null>(null)
  const [report, setReport] = useState<AuditReport>(sampleAudit)
  const [error, setError] = useState<string | null>(null)

  const finishSuccess = useCallback((mapped: AuditReport) => {
    setReport(mapped)
    markDone(setStatuses, 'evaluate')
    markActive(setStatuses, setActiveStep, 'score')
    window.setTimeout(() => {
      markDone(setStatuses, 'score')
      markActive(setStatuses, setActiveStep, 'report')
      window.setTimeout(() => {
        markDone(setStatuses, 'report')
        setActiveStep(null)
        setRunning(false)
        setShowReport(true)
        requestAnimationFrame(() => setScoreAnimate(true))
      }, 350)
    }, 350)
  }, [])

  const failPipeline = useCallback((message: string) => {
    setError(message)
    setStatuses((s) => {
      const next = { ...s }
      for (const id of STEP_ORDER) {
        if (next[id] === 'active') next[id] = 'error'
      }
      return next
    })
    setActiveStep(null)
    setRunning(false)
  }, [])

  const runPipeline = useCallback(
    (file: File) => {
      setError(null)
      setRunning(true)
      setShowReport(false)
      setScoreAnimate(false)
      setStatuses(idleStatuses())

      void (async () => {
        try {
          markActive(setStatuses, setActiveStep, 'upload')
          // Upload includes PyAI Hear transcription on the server.
          markActive(setStatuses, setActiveStep, 'transcribe')
          const uploaded = await uploadCall(file)
          markDone(setStatuses, 'upload')
          markDone(setStatuses, 'transcribe')

          markActive(setStatuses, setActiveStep, 'evaluate')
          const audit = await fetchAudit(uploaded.call_id)

          let coaching = audit.coaching || []
          try {
            const tips = await fetchCoaching(uploaded.call_id)
            coaching = tips.coaching || coaching
          } catch {
            // Coaching is optional; findings may still carry coaching_note.
          }

          const mapped = mapBackendAudit(audit, {
            fileName: file.name,
            coaching,
            audioUrl: audioUrl(uploaded.call_id),
          })
          finishSuccess(mapped)
        } catch (e) {
          const msg =
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : 'Audit pipeline failed.'
          failPipeline(msg)
        }
      })()
    },
    [failPipeline, finishSuccess],
  )

  const runDemo = useCallback(() => {
    setError(null)
    setRunning(true)
    setShowReport(false)
    setScoreAnimate(false)
    setStatuses(idleStatuses())
    setReport(sampleAudit)

    let i = 0
    markActive(setStatuses, setActiveStep, STEP_ORDER[0])

    const advance = () => {
      const current = STEP_ORDER[i]
      markDone(setStatuses, current)
      i += 1
      if (i >= STEP_ORDER.length) {
        setActiveStep(null)
        setRunning(false)
        setShowReport(true)
        requestAnimationFrame(() => setScoreAnimate(true))
        return
      }
      markActive(setStatuses, setActiveStep, STEP_ORDER[i])
      window.setTimeout(advance, 650)
    }

    window.setTimeout(advance, 600)
  }, [])

  const onSeek = useCallback((seconds: number) => {
    setShowReport(true)
    setSeekTo(seconds)
  }, [])

  const onSeekHandled = useCallback(() => setSeekTo(null), [])
  const clearError = useCallback(() => setError(null), [])

  const value = useMemo(
    () => ({
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
    }),
    [
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
    ],
  )

  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>
}

export function useAudit() {
  const ctx = useContext(AuditContext)
  if (!ctx) throw new Error('useAudit must be used within AuditProvider')
  return ctx
}
