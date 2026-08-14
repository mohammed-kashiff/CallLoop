export function Pyai() {
  return (
    <>
      <header className="page-bar">
        <div>
          <p className="crumb">Stack / PyAI</p>
          <h1>Powered by PyAI</h1>
        </div>
      </header>

      <p className="panel-lede pyai-lede">
        Call Loop uses two PyAI building blocks: <strong>Hear</strong> for telephony
        transcription and <strong>Recap</strong> for post-call intelligence. Excerpts below
        are from{' '}
        <a href="https://pyai.com/" target="_blank" rel="noopener noreferrer">
          pyai.com
        </a>
        .
      </p>

      <div className="pyai-grid">
        <article className="pyai-card">
          <p className="pyai-kicker">Hear</p>
          <h2>Speech-to-text, telephony-native</h2>
          <blockquote>
            <p>
              “Hear is PyAI’s speech-to-text (STT) API: telephony-grade transcription tuned
              for 8 kHz call audio, with eager streaming partials and an async batch tier.”
            </p>
          </blockquote>
          <ul className="pyai-points">
            <li>Tuned on narrowband 8 kHz call audio</li>
            <li>Streaming partials for live call audio</li>
            <li>Async batch for archives</li>
          </ul>
          <p className="pyai-use">
            In Call Loop, Hear turns an uploaded recording into a speaker-labelled transcript
            before scoring.
          </p>
          <a
            className="inline-link"
            href="https://pyai.com/hear"
            target="_blank"
            rel="noopener noreferrer"
          >
            Hear on pyai.com
          </a>
        </article>

        <article className="pyai-card">
          <p className="pyai-kicker">Recap</p>
          <h2>Structured intelligence after the call</h2>
          <blockquote>
            <p>
              “Recap turns raw conversations into structured post-call intelligence the
              second the call ends: a summary, a disposition, the next step, and CRM-ready
              fields.”
            </p>
          </blockquote>
          <ul className="pyai-points">
            <li>Summary, disposition, and next step</li>
            <li>Searchable call history</li>
            <li>Works on Hear transcriptions or your own stack</li>
          </ul>
          <p className="pyai-use">
            In Call Loop, Recap drafts the call recap and action items on Agents Pulse and
            Churn Risk.
          </p>
          <a
            className="inline-link"
            href="https://pyai.com/recap"
            target="_blank"
            rel="noopener noreferrer"
          >
            Recap on pyai.com
          </a>
        </article>
      </div>

      <a
        className="pyai-press"
        href="https://pyai.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="pyai-press-head">
          <img
            className="pyai-press-mark"
            src="/brand/pyai-mark-green.svg"
            alt=""
            width={40}
            height={40}
          />
          <span className="pyai-press-name">PyAI</span>
        </div>
        <p className="pyai-press-copy">
          Telephony-grade voice AI — speech-to-text, text-to-speech, and realtime agents
          from one OpenAI-compatible API. Built by a small team that actually answers.
        </p>
      </a>

      <p className="claude-cord">
        <svg className="claude-cord-plug" viewBox="0 0 24 24" aria-hidden="true">
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="2.15"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="translate(12 12) rotate(42) scale(0.84) translate(-12 -12)"
          >
            <path d="M9.1 3.6v3.4M14.9 3.6v3.4" />
            <path d="M7.2 7h9.6v4.4a4.8 4.8 0 0 1-9.6 0Z" />
            <path d="M9.1 10.1c.15-1.15 1-1.75 2.05-1.75" />
            <circle cx="9.55" cy="11.15" r="0.35" fill="currentColor" stroke="none" />
            <path d="M12 15.6c-.15 1.35-1.35 1.7-1.2 3.15.1.85.7 1.15 1.55 1.05" />
          </g>
        </svg>
        <span>Corded to</span>
        <img
          className="claude-cord-mark"
          src="/brand/claude-mark.svg"
          alt=""
          width={22}
          height={22}
        />
        <span>Claude</span>
      </p>
    </>
  )
}
