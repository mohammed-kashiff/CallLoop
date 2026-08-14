import { useEffect, useRef, type CSSProperties } from 'react'

const GAPS = [
  {
    tone: 'teal',
    title: 'Coaching that doesn’t stick',
    body: 'Feedback lands without the transcript evidence behind it — agents don’t trust a score they can’t verify.',
  },
  {
    tone: 'purple',
    title: 'Product signal, lost',
    body: 'The same complaint shows up on call after call, buried in transcripts nobody has time to read.',
  },
  {
    tone: 'blue',
    title: 'Churn found too late',
    body: 'At-risk accounts get flagged after the renewal conversation, not before it.',
  },
] as const

export function ProblemSection() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        el.classList.add('is-in')
        io.disconnect()
      },
      { threshold: 0.08, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} className="problem-section" aria-labelledby="problem-heading">
      <div className="problem-intro">
        <p className="problem-kicker reveal">The problem</p>
        <h2 id="problem-heading" className="problem-title reveal">
          The score ends where the impact should begin.
        </h2>
        <p className="problem-lede reveal">
          Most QA tools grade a call and stop. What happens next — coaching that lands, a fix that ships, a
          churn signal that reaches someone in time — is left to chance.
        </p>
      </div>

      <div className="problem-grid">
        {GAPS.map((gap, i) => (
          <article
            key={gap.title}
            className={`problem-card reveal is-${gap.tone}`}
            style={{ '--d': `${180 + i * 90}ms` } as CSSProperties}
          >
            <h3>{gap.title}</h3>
            <p>{gap.body}</p>
          </article>
        ))}
      </div>

      <p className="problem-close reveal">
        <span className="problem-dot" aria-hidden="true" />
        CALL LOOP is built to close every one of those gaps.
      </p>
    </section>
  )
}
