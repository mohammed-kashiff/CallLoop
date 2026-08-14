export function UsageMeter() {
  return (
    <section className="usage-meter is-sandbox" aria-label="Sandbox">
      <p className="usage-kicker">Sandbox</p>
      <div className="usage-unlimited">
        <span className="usage-infinity" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              d="M4.8 12c0-2.4 1.9-4.3 4.3-4.3 1.9 0 3.1 1.2 4.9 3.3 1.8-2.1 3-3.3 4.9-3.3 2.4 0 4.3 1.9 4.3 4.3s-1.9 4.3-4.3 4.3c-1.9 0-3.1-1.2-4.9-3.3-1.8 2.1-3 3.3-4.9 3.3-2.4 0-4.3-1.9-4.3-4.3Z"
            />
          </svg>
        </span>
        <span>Unlimited</span>
      </div>
    </section>
  )
}
