export function FeedbackCue() {
  return (
    <div className="feedback-cue" aria-hidden="true">
      <div className="voc-lane is-service">
        <span style={{ ['--w' as string]: '78%', ['--d' as string]: '0s' }} />
        <span style={{ ['--w' as string]: '54%', ['--d' as string]: '0.7s' }} />
        <span style={{ ['--w' as string]: '66%', ['--d' as string]: '1.4s' }} />
        <span style={{ ['--w' as string]: '42%', ['--d' as string]: '2.1s' }} />
      </div>
      <div className="voc-quote">
        <svg viewBox="0 0 48 48">
          <path
            d="M8 32c0-10 6-16 14-18v7c-4 1-7 4-7 9h7v12H8V32Zm18 0c0-10 6-16 14-18v7c-4 1-7 4-7 9h7v12H26V32Z"
            fill="currentColor"
          />
        </svg>
      </div>
      <div className="voc-lane is-product">
        <span style={{ ['--w' as string]: '62%', ['--d' as string]: '0.35s' }} />
        <span style={{ ['--w' as string]: '80%', ['--d' as string]: '1.05s' }} />
        <span style={{ ['--w' as string]: '48%', ['--d' as string]: '1.75s' }} />
        <span style={{ ['--w' as string]: '70%', ['--d' as string]: '2.45s' }} />
      </div>
    </div>
  )
}

export function ChurnCue() {
  return (
    <div className="churn-cue" aria-hidden="true">
      <svg className="churn-spark" viewBox="0 0 240 56" fill="none">
        <path
          className="churn-spark-line"
          d="M4 34 C 28 32, 44 28, 62 30 S 96 42, 118 26 S 168 12, 192 22 S 220 38, 236 30"
        />
      </svg>
      <div className="churn-rail">
        <span className="churn-band is-none">None</span>
        <span className="churn-band is-low">Low</span>
        <span className="churn-band is-med">Med</span>
        <span className="churn-band is-high">High</span>
        <span className="churn-scan" />
      </div>
    </div>
  )
}

export function TrainingCue() {
  return (
    <div className="training-cue" aria-hidden="true">
      <span className="train-step" style={{ ['--d' as string]: '0s' }}>
        Listen
      </span>
      <span className="train-join" />
      <span className="train-step is-mid" style={{ ['--d' as string]: '0.35s' }}>
        Drill
      </span>
      <span className="train-join" />
      <span className="train-step is-end" style={{ ['--d' as string]: '0.7s' }}>
        Recap
      </span>
    </div>
  )
}
