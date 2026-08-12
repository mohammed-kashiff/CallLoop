import type { PipelineStepId, PipelineStatus } from '../types'

const STEPS: { id: PipelineStepId; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'transcribe', label: 'Transcribe' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'score', label: 'Score' },
  { id: 'report', label: 'Report' },
]

interface PipelineProps {
  activeStep: PipelineStepId | null
  statuses: Record<PipelineStepId, PipelineStatus>
}

export function Pipeline({ activeStep, statuses }: PipelineProps) {
  return (
    <section className="pipeline" aria-label="Processing pipeline">
      <div className="section-kicker">The big picture</div>
      <ol className="pipeline-track">
        {STEPS.map((step, index) => {
          const status = statuses[step.id]
          const isActive = activeStep === step.id
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
              {index < STEPS.length - 1 && <span className="pipeline-connector" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
