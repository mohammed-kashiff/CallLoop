import type { PipelineStepId, PipelineStatus } from '../types'

const STEPS: { id: PipelineStepId; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'transcribe', label: 'Transcribe' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'score', label: 'Score' },
  { id: 'report', label: 'Report' },
]

function statusLabel(status: PipelineStatus, isActive: boolean): string {
  if (isActive || status === 'active') return 'Running'
  if (status === 'done') return 'Done'
  if (status === 'error') return 'Error'
  return ''
}

interface PipelineProps {
  activeStep: PipelineStepId | null
  statuses: Record<PipelineStepId, PipelineStatus>
}

export function Pipeline({ activeStep, statuses }: PipelineProps) {
  const live = Boolean(activeStep) || Object.values(statuses).some((s) => s !== 'idle')
  const doneCount = STEPS.filter((step) => statuses[step.id] === 'done').length
  const progress = live ? (doneCount + (activeStep ? 0.45 : 0)) / STEPS.length : 0

  if (!live) return null

  return (
    <section
      className={['pipeline', live ? 'is-live' : ''].filter(Boolean).join(' ')}
      aria-label="Processing pipeline"
    >
      <div className="pipeline-rail" aria-hidden="true">
        <span className="pipeline-rail-fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      <ol className="pipeline-track">
        {STEPS.map((step, index) => {
          const status = statuses[step.id]
          const isActive = activeStep === step.id
          const label = statusLabel(status, isActive)
          return (
            <li
              key={step.id}
              className={[
                'pipeline-step',
                status === 'done' ? 'is-done' : '',
                isActive ? 'is-active' : '',
                status === 'error' ? 'is-error' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="pipeline-index">{index + 1}</span>
              <span className="pipeline-label">{step.label}</span>
              {label ? <span className="pipeline-status">{label}</span> : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
