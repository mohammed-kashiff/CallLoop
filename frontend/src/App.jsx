import { useState, useEffect, useRef } from "react";
import "./App.css";

const API = "http://localhost:8000";
const MAX_UPLOAD_MB = 25;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const FRACTION = { pass: 1, partial: 0.5, fail: 0, unverified: 0, error: 0 };

function fmtTime(s) {
  if (s == null || isNaN(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtElapsed(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function bandClass(grade) {
  return (
    {
      Excellent: "band-excellent",
      Good: "band-good",
      "Needs improvement": "band-fair",
      Poor: "band-poor",
    }[grade] || "band-fair"
  );
}

/** Client-side progress + elapsed timer (no server progress stream). */
function JobProgress({ active, phase, fromUpload }) {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(null);

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      setElapsed(0);
      return undefined;
    }
    if (startedAt.current == null) startedAt.current = Date.now();
    const tick = () => {
      setElapsed((Date.now() - startedAt.current) / 1000);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  // Upload→audit pipeline: transcribe 0–55%, then audit 55–95%.
  // Audit-only (Re-run): start at 0% so it doesn't jump to mid-bar.
  const pipelineAudit = phase === "audit" && fromUpload;
  const phaseFloor = pipelineAudit ? 55 : 0;
  const phaseSpan = pipelineAudit ? 40 : 90;
  const phaseExpected = phase === "audit" ? 40 : 35;
  const within = Math.min(
    phaseSpan - 1,
    phaseSpan * (1 - Math.exp(-elapsed / phaseExpected)),
  );
  const pct = Math.min(95, Math.round(phaseFloor + within));

  const label =
    phase === "transcribe"
      ? "Transcribing your call…"
      : phase === "audit"
        ? "Auditing the call…"
        : "Working…";
  const hint =
    phase === "transcribe"
      ? "Uploading audio and waiting on PyAI Hear (often 20–40s)."
      : "Running rubric, churn, feedback, and retention draft in parallel.";

  return (
    <div className="job-progress" aria-live="polite">
      <div className="job-progress-head">
        <span className="job-progress-label">{label}</span>
        <span className="job-progress-timer" title="Elapsed time">
          {fmtElapsed(elapsed)}
        </span>
      </div>
      <div
        className="job-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <div className="job-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="job-progress-meta">
        <span className="job-progress-hint">{hint}</span>
        <span className="job-progress-pct">{pct}%</span>
      </div>
    </div>
  );
}

export default function App() {
  const [calls, setCalls] = useState([]);
  const [callId, setCallId] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [jobFromUpload, setJobFromUpload] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // null | opening | opened | error
  const [emailMessage, setEmailMessage] = useState(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingError, setCoachingError] = useState(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  function refreshCalls() {
    return fetch(`${API}/api/calls`)
      .then((r) => r.json())
      .then((data) => {
        setCalls(data);
        return data;
      });
  }

  useEffect(() => {
    refreshCalls()
      .then((data) => {
        if (data.length) setCallId(data[0].id);
      })
      .catch(() =>
        setError("Could not reach the backend. Is uvicorn running on port 8000?")
      );
  }, []);

  function loadAudit(id, refresh = false) {
    setLoading(true);
    setError(null);
    setEmailStatus(null);
    setEmailMessage(null);
    setCoachingError(null);
    setCoachingLoading(false);
    if (!refresh) setAudit(null);
    fetch(`${API}/api/calls/${id}/audit${refresh ? "?refresh=true" : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setAudit)
      .catch(() => setError("Could not load the audit for this call."))
      .finally(() => {
        setLoading(false);
        setPipelineActive(false);
        setJobFromUpload(false);
      });
  }

  useEffect(() => {
    if (callId != null) loadAudit(callId);
  }, [callId]);

  async function loadCoaching() {
    if (callId == null || coachingLoading) return;
    setCoachingLoading(true);
    setCoachingError(null);
    try {
      const r = await fetch(`${API}/api/calls/${callId}/coaching`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const detail = typeof d.detail === "string" ? d.detail : "Could not generate coaching.";
        throw new Error(detail);
      }
      const data = await r.json();
      setAudit((prev) => (prev ? { ...prev, coaching: data.coaching || [] } : prev));
    } catch (e) {
      setCoachingError(e.message || "Could not generate coaching.");
    } finally {
      setCoachingLoading(false);
    }
  }

  async function openStakeholderGmail() {
    if (callId == null || emailStatus === "opening") return;
    setEmailStatus("opening");
    setEmailMessage(null);
    try {
      const r = await fetch(
        `${API}/api/calls/${callId}/stakeholder-email/compose`,
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail =
          typeof d.detail === "string"
            ? d.detail
            : "Could not open Gmail compose.";
        throw new Error(detail);
      }
      if (!d.gmail_url) throw new Error("Missing Gmail compose link.");
      const win = window.open(d.gmail_url, "_blank", "noopener,noreferrer");
      if (!win) {
        throw new Error(
          "Popup blocked. Allow popups for this site, then try again.",
        );
      }
      setEmailStatus("opened");
      setEmailMessage(
        d.to
          ? `Gmail compose opened (To: ${d.to}). Review and send.`
          : "Gmail compose opened. Add the stakeholder address, review, and send.",
      );
    } catch (e) {
      setEmailStatus("error");
      setEmailMessage(e.message || "Could not open Gmail compose.");
    }
  }

  async function handleFiles(files) {
    const f = files && files[0];
    if (!f) return;
    setUploadError(null);
    if (f.size > MAX_UPLOAD_BYTES) {
      const mb = (f.size / (1024 * 1024)).toFixed(1);
      setUploadError(
        `File too large for transcription (${mb} MB). Maximum is ${MAX_UPLOAD_MB} MB.`,
      );
      return;
    }
    setJobFromUpload(true);
    setPipelineActive(true);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(`${API}/api/upload`, { method: "POST", body: fd });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const detail = typeof d.detail === "string" ? d.detail : "Upload failed";
        throw new Error(detail);
      }
      const { call_id } = await r.json();
      await refreshCalls();
      setCallId(call_id);
      // Keep pipelineActive true until audit finishes so the timer doesn't reset.
    } catch (e) {
      setUploadError(e.message || "Upload failed");
      setPipelineActive(false);
      setJobFromUpload(false);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (!uploading) handleFiles(e.dataTransfer.files);
  }

  const segBySeq = {};
  if (audit) audit.segments.forEach((s) => (segBySeq[s.seq] = s));

  function jumpTo(seconds) {
    const a = audioRef.current;
    if (!a || seconds == null) return;
    a.currentTime = seconds;
    a.play();
  }

  const churn = audit?.churn ?? null;
  const churnRisk = churn?.risk ?? "unknown";
  const churnSeg = churn?.evidence_seq != null ? segBySeq[churn.evidence_seq] : null;

  const feedback = audit?.feedback ?? null;
  const feedbackStatus = feedback?.status ?? "ok";
  const agentFeedback = feedback?.agent ?? [];
  const productFeedback = feedback?.product ?? [];

  const callRecap = audit?.recap ?? null;
  const recapStatus = callRecap?.status ?? null;
  const recapItems = callRecap?.action_items ?? [];
  const retentionEmail = audit?.retention_email ?? null;
  const retentionReady = retentionEmail?.status === "ok" && !!retentionEmail?.body;

  const coaching = audit?.coaching ?? [];
  const weakCount =
    audit?.findings?.filter((f) =>
      ["fail", "partial", "unverified"].includes(f.verdict),
    ).length ?? 0;

  const jobActive = uploading || loading || pipelineActive;
  const jobPhase = uploading
    ? "transcribe"
    : loading || pipelineActive
      ? "audit"
      : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span>
          <span className="brand-name">CallProof</span>
          <span className="tagline">AI Call Quality Auditor</span>
        </div>
        {calls.length > 0 && (
          <select
            className="call-select"
            value={callId ?? ""}
            onChange={(e) => setCallId(Number(e.target.value))}
            disabled={jobActive}
          >
            {calls.map((c) => (
              <option key={c.id} value={c.id}>
                Call #{c.id} — {fmtTime(c.audio_seconds)}
              </option>
            ))}
          </select>
        )}
      </header>

      <div
        className={`dropzone ${dragOver ? "over" : ""} ${uploading ? "busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current && fileInputRef.current.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <span>Transcribing in progress — see timer below</span>
        ) : (
          <span>
            Drag a call recording here, or click to choose a file (max {MAX_UPLOAD_MB} MB)
          </span>
        )}
      </div>
      {uploadError && <div className="banner error">{uploadError}</div>}

      {error && <div className="banner error">{error}</div>}
      <JobProgress
        active={jobActive}
        phase={jobPhase}
        fromUpload={jobFromUpload}
      />

      {audit && (
        <main className="layout">
          <section className="col-left">
            <div className={`score-card ${bandClass(audit.grade)}`}>
              <div className="score-num">{audit.score}</div>
              <div className="score-meta">
                <div className="grade">{audit.grade}</div>
                <div className="outof">out of 100</div>
                <div className="tally">
                  {Object.entries(audit.tally).map(([k, n]) => (
                    <span key={k} className={`pill v-${k}`}>
                      {n} {k}
                    </span>
                  ))}
                </div>
              </div>
              <button className="rerun" onClick={() => loadAudit(callId, true)}>
                Re-run
              </button>
            </div>

            <div className="rubric-line">
              Rubric: <b>{audit.rubric}</b> · agent = {audit.agent_speaker} ·{" "}
              {fmtTime(audit.audio_seconds)}
            </div>

            <section className={`churn churn-${churnRisk}`}>
              <div className="churn-head">
                <span className="churn-title">
                  {churnRisk === "none" ? (
                    <>Churn risk: <b>None</b></>
                  ) : churnRisk === "unknown" ? (
                    <>Churn risk: <b>Unavailable</b></>
                  ) : (
                    <>Churn risk: <b>{churnRisk}</b></>
                  )}
                </span>
                {(churnRisk === "high" || churnRisk === "medium") && (
                  <div className="churn-email-wrap">
                    <button
                      className="churn-email"
                      onClick={openStakeholderGmail}
                      disabled={emailStatus === "opening"}
                    >
                      {emailStatus === "opening"
                        ? "Opening Gmail…"
                        : "Send email to stakeholder"}
                    </button>
                    {retentionReady && emailStatus !== "error" && (
                      <span className="churn-queued">
                        Retention email draft ready (from transcript)
                      </span>
                    )}
                    {emailStatus === "opened" && emailMessage && (
                      <span className="churn-queued">{emailMessage}</span>
                    )}
                    {emailStatus === "error" && emailMessage && (
                      <div className="churn-email-error">{emailMessage}</div>
                    )}
                  </div>
                )}
              </div>

              {churnRisk === "none" ? (
                <div className="churn-reason">No churn risk detected in this call.</div>
              ) : churnRisk === "unknown" ? (
                <div className="churn-reason">Churn risk could not be assessed for this call.</div>
              ) : (
                <>
                  <div className="churn-reason">{churn.reasoning}</div>
                  {churn.evidence_text && (
                    <div className="churn-evidence">
                      <span>“{churn.evidence_text}”</span>
                      {churn.evidence_verified && <span className="verify ok">verified</span>}
                      {churnSeg && (
                        <button className="jump" onClick={() => jumpTo(churnSeg.start)}>
                          {fmtTime(churnSeg.start)}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            {callRecap && (
              <section className={`call-recap recap-${recapStatus}`}>
                <h2 className="h">Call Recap</h2>
                {recapStatus === "ok" ? (
                  <>
                    {(callRecap.tldr || callRecap.headline) && (
                      <p className="recap-tldr">{callRecap.tldr || callRecap.headline}</p>
                    )}
                    {callRecap.summary && (
                      <p className="recap-summary">{callRecap.summary}</p>
                    )}
                    {recapItems.length > 0 && (
                      <ul className="recap-actions">
                        {recapItems.map((it, i) => (
                          <li key={`recap-action-${i}`}>
                            <span className="recap-task">{it.task}</span>
                            {(it.owner || it.due) && (
                              <span className="recap-meta">
                                {[it.owner, it.due].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!callRecap.tldr && !callRecap.headline && !callRecap.summary &&
                      recapItems.length === 0 && (
                        <p className="recap-empty">Recap completed with no notes.</p>
                      )}
                  </>
                ) : recapStatus === "pending" ? (
                  <p className="recap-empty">
                    {callRecap.error || "Recap still processing. Re-run shortly."}
                  </p>
                ) : callRecap.reason === "sandbox_key" ||
                  /sandbox/i.test(callRecap.error || "") ? (
                  <p className="recap-empty recap-sandbox">
                    Recap is unavailable on a sandbox PyAI key. Visit{" "}
                    <a
                      href="https://console.pyai.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      console.pyai.com
                    </a>{" "}
                    to create a live API key, add it to <code>.env</code> as{" "}
                    <code>PYAI_API_KEY</code>, restart the API, then re-run the audit.
                  </p>
                ) : (
                  <p className="recap-empty">
                    {callRecap.error || "Call recap is unavailable for this call."}
                  </p>
                )}
              </section>
            )}

            <h2 className="h">Findings</h2>
            {audit.findings.map((f) => {
              const pts = (FRACTION[f.verdict] ?? 0) * f.weight;
              const seg = f.evidence_seq != null ? segBySeq[f.evidence_seq] : null;
              return (
                <div className="finding" key={f.id}>
                  <div className="finding-head">
                    <span className={`badge v-${f.verdict}`}>{f.verdict}</span>
                    <span className="finding-name">{f.name}</span>
                    <span className="finding-pts">
                      {pts} / {f.weight}
                    </span>
                  </div>
                  <div className="finding-tag">
                    {f.method === "llm" ? "AI judgment" : "deterministic rule"}
                  </div>
                  <p className="finding-reason">{f.reasoning}</p>
                  {f.evidence_text && (
                    <div className="evidence">
                      <span className="quote">“{f.evidence_text}”</span>
                      {f.method === "llm" && (
                        <span className={`verify ${f.evidence_verified ? "ok" : "no"}`}>
                          {f.evidence_verified ? "✓ verified" : "✗ rejected"}
                        </span>
                      )}
                      {seg && (
                        <button className="jump" onClick={() => jumpTo(seg.start)}>
                          ▶ {fmtTime(seg.start)}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <section className="coaching-block">
              <div className="coaching-head">
                <h2 className="h">Coaching</h2>
                {weakCount > 0 && (
                  <button
                    className="coach-btn"
                    onClick={loadCoaching}
                    disabled={coachingLoading}
                  >
                    {coachingLoading
                      ? "Generating…"
                      : coaching.length > 0
                        ? "Regenerate coaching"
                        : "Generate coaching tips"}
                  </button>
                )}
              </div>
              {coachingError && <div className="banner error">{coachingError}</div>}
              {weakCount === 0 ? (
                <p className="coach-empty">No weak areas — coaching not needed for this call.</p>
              ) : coaching.length === 0 && !coachingLoading ? (
                <p className="coach-empty">
                  Coaching is optional and runs only when you ask — press the button to generate tips.
                </p>
              ) : (
                coaching.map((c, i) => (
                  <div className="coach" key={i}>
                    <div className="coach-crit">{c.criterion}</div>
                    <div className="coach-tip">{c.tip}</div>
                  </div>
                ))
              )}
            </section>

            {audit.feedback && (
              <section className="customer-feedback">
                <h2 className="h">Customer Feedback</h2>

                {feedbackStatus === "error" ? (
                  <div className="banner error">
                    Customer feedback could not be assessed for this call.
                  </div>
                ) : (
                  <div className="fb-grid">
                    <div className="fb-group">
                      <h3 className="fb-group-title">Feedback for agent</h3>
                      {agentFeedback.length > 0 ? (
                        agentFeedback.map((it, i) => {
                          const seg = it.seq != null ? segBySeq[it.seq] : null;
                          return (
                            <div className="fb-item" key={`agent-${i}`}>
                              <div className="fb-item-head">
                                <span className={`fb-sent fb-${it.sentiment}`}>{it.sentiment}</span>
                                <span className="fb-summary">{it.summary}</span>
                              </div>
                              {it.quote && (
                                <div className="fb-quote">
                                  <span>“{it.quote}”</span>
                                  {it.verified && <span className="verify ok">verified</span>}
                                  {seg && (
                                    <button className="jump" onClick={() => jumpTo(seg.start)}>
                                      {fmtTime(seg.start)}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="fb-empty">None detected.</div>
                      )}
                    </div>

                    <div className="fb-group">
                      <h3 className="fb-group-title">Feedback for product</h3>
                      {productFeedback.length > 0 ? (
                        productFeedback.map((it, i) => {
                          const seg = it.seq != null ? segBySeq[it.seq] : null;
                          return (
                            <div className="fb-item" key={`product-${i}`}>
                              <div className="fb-item-head">
                                <span className={`fb-sent fb-${it.sentiment}`}>{it.sentiment}</span>
                                <span className="fb-summary">{it.summary}</span>
                              </div>
                              {it.quote && (
                                <div className="fb-quote">
                                  <span>“{it.quote}”</span>
                                  {it.verified && <span className="verify ok">verified</span>}
                                  {seg && (
                                    <button className="jump" onClick={() => jumpTo(seg.start)}>
                                      {fmtTime(seg.start)}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="fb-empty">None detected.</div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

          </section>

          <section className="col-right">
            <h2 className="h">
              Transcript <span className="hint">click any line to hear it</span>
            </h2>
            <div className="transcript">
              {audit.segments.map((s) => {
                const isAgent = s.speaker === audit.agent_speaker;
                const active = now >= s.start && now < s.end;
                return (
                  <div
                    key={s.seq}
                    className={`turn ${isAgent ? "agent" : "customer"} ${
                      active ? "active" : ""
                    }`}
                    onClick={() => jumpTo(s.start)}
                  >
                    <div className="turn-meta">
                      <span className="who">{isAgent ? "AGENT" : "CUSTOMER"}</span>
                      <span className="ts">{fmtTime(s.start)}</span>
                    </div>
                    <div className="turn-text">{s.text}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      )}

      {audit && (
        <footer className="player">
          <audio
            ref={audioRef}
            controls
            src={`${API}/api/calls/${callId}/audio`}
            onTimeUpdate={(e) => setNow(e.target.currentTime)}
          />
        </footer>
      )}
    </div>
  );
}