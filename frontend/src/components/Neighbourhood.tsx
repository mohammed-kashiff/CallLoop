type Row = {
  feature: string
  us: boolean
  them: boolean
}

function Tick({ on }: { on: boolean }) {
  if (!on) {
    return (
      <span className="hood-mark is-off" aria-label="No">
        —
      </span>
    )
  }

  return (
    <span className="hood-mark is-on" aria-label="Yes">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.16" />
        <path
          d="M5.6 10.4 8.4 13.2 14.4 6.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function CompareCard({
  name,
  blurb,
  rows,
}: {
  name: string
  blurb: string
  rows: Row[]
}) {
  return (
    <article className="hood-card">
      <p className="hood-vs">vs {name}</p>
      <p className="hood-blurb">{blurb}</p>
      <table className="hood-table">
        <thead>
          <tr>
            <th scope="col" className="hood-feat">
              <span className="visually-hidden">Capability</span>
            </th>
            <th scope="col">Call Loop</th>
            <th scope="col">{name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature}>
              <th scope="row">{row.feature}</th>
              <td>
                <Tick on={row.us} />
              </td>
              <td>
                <Tick on={row.them} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}

const MAESTRO: Row[] = [
  { feature: 'Quality scoring on conversations', us: true, them: true },
  { feature: 'Coaching tied to real interactions', us: true, them: true },
  { feature: 'Churn and retention signals', us: true, them: true },
  { feature: 'One upload closes score, coaching, and churn', us: true, them: false },
  { feature: 'Custom metrics across 100% of conversations', us: false, them: true },
  { feature: 'Conversation data warehouse / reverse-ETL', us: false, them: true },
  { feature: 'Pay for what you actually use', us: true, them: false },
]

const OBSERVE: Row[] = [
  { feature: 'Post-call scoring and coaching', us: true, them: true },
  { feature: 'Transcript evidence behind the score', us: true, them: true },
  { feature: 'Risk and churn language from calls', us: true, them: true },
  { feature: 'One recording closes the loop', us: true, them: false },
  { feature: 'Live agent-assist during the call', us: false, them: true },
  { feature: 'Contact-center OS / 100% coverage', us: false, them: true },
  { feature: 'Pay for what you actually use', us: true, them: false },
]

export function Neighbourhood() {
  return (
    <section className="neighbourhood" aria-labelledby="hood-heading">
      <header className="hood-head">
        <h2 id="hood-heading">How we sit next door</h2>
        <p className="hood-lede">
          Overlap where it matters — and a lighter loop from one recording where it doesn’t.
        </p>
      </header>

      <div className="hood-grid">
        <CompareCard
          name="MaestroQA"
          blurb="Conversation data and QA platform."
          rows={MAESTRO}
        />
        <CompareCard
          name="Observe.AI"
          blurb="Contact-center conversation intelligence."
          rows={OBSERVE}
        />
      </div>
    </section>
  )
}
