import { useEffect, useRef, useState } from "react";

const FRACTION = { pass: 1, partial: 0.5, fail: 0, unverified: 0, error: 0 };

function fmtTime(s) {
  if (s == null || isNaN(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function bandClass(grade) {
  return (
    {
      "Star Performer": "band-excellent",
      Excelling: "band-excellent",
      "Solid Performer": "band-good",
      Developing: "band-fair",
      "Needs Improvement": "band-fair",
      "Needs Immediate Attention": "band-poor",
      Excellent: "band-excellent",
      Good: "band-good",
      "Needs improvement": "band-fair",
      Poor: "band-poor",
    }[grade] || "band-fair"
  );
}

function methodLabel(method) {
  if (!method) return "scored";
  if (method === "deterministic_hybrid") return "Hybrid rules";
  if (method === "llm" || String(method).includes("llm")) return "AI judgment";
  return "Rule check";
}

function sourceLabel(sources) {
  const set = new Set(sources || []);
  if (set.has("manual") && set.has("auto")) return "Manual + auto";
  if (set.has("manual")) return "Manual";
  if (set.has("auto")) return "Auto";
  return "Flagged";
}

function FlaggedCallDetail({ api, callId, onOpenCall }) {
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAudit(null);
    fetch(`${api}/api/calls/${callId}/audit`)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load this scorecard.");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setAudit(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Could not load this scorecard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, callId]);

  function jumpTo(seconds) {
    const a = audioRef.current;
    if (!a || seconds == null) return;
    a.currentTime = seconds;
    a.play();
  }

  if (loading) {
    return <p className="review-cascade-status">Loading scorecard…</p>;
  }
  if (error) {
    return <div className="banner error">{error}</div>;
  }
  if (!audit) return null;

  const segBySeq = {};
  (audit.segments || []).forEach((s) => {
    segBySeq[s.seq] = s;
  });
  const recap = audit.recap || null;
  const recapStatus = recap?.status ?? null;
  const recapItems = recap?.action_items ?? [];
  const churn = audit.churn ?? null;
  const churnRisk = churn?.risk ?? "unknown";

  return (
    <div className="review-cascade-detail">
      <div className="review-cascade-toolbar">
        <audio
          ref={audioRef}
          controls
          src={`${api}/api/calls/${callId}/audio`}
          onTimeUpdate={(e) => setNow(e.target.currentTime)}
        />
        {onOpenCall && (
          <button
            type="button"
            className="review-open-scoring"
            onClick={() => onOpenCall(callId)}
          >
            Open in scoring
          </button>
        )}
      </div>

      <div className="layout review-cascade-layout">
        <section className="col-left">
          <div className={`score-card ${bandClass(audit.grade)}`}>
            <div className="score-num">{audit.score}</div>
            <div className="score-meta">
              <div className="grade">{audit.grade}</div>
              <div className="outof">out of 100</div>
              {audit.tally && (
                <div className="tally">
                  {Object.entries(audit.tally).map(([k, n]) => (
                    <span key={k} className={`pill v-${k}`}>
                      {n} {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rubric-line">
            {fmtTime(audit.audio_seconds)}
            {" · agent "}
            {audit.agent_speaker}
            {audit.audit_mode ? ` · ${audit.audit_mode} audit` : ""}
          </div>

          <section className={`churn churn-${churnRisk}`}>
            <div className="churn-head">
              <span className="churn-title">
                Churn <b>{churnRisk === "unknown" ? "unavailable" : churnRisk}</b>
              </span>
            </div>
            {churn?.reasoning && <div className="churn-reason">{churn.reasoning}</div>}
          </section>

          {recap && (
            <section className={`call-recap panel recap-${recapStatus}`}>
              <h2 className="h">Recap</h2>
              {recapStatus === "ok" ? (
                <>
                  {(recap.tldr || recap.headline) && (
                    <p className="recap-tldr">{recap.tldr || recap.headline}</p>
                  )}
                  {recap.summary && <p className="recap-summary">{recap.summary}</p>}
                  {recapItems.length > 0 && (
                    <ul className="recap-actions">
                      {recapItems.map((it, i) => (
                        <li key={`recap-${i}`}>
                          <span className="recap-task">{it.task}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="recap-empty">{recap.error || "Recap unavailable."}</p>
              )}
            </section>
          )}

          <h2 className="h">Findings</h2>
          {(audit.findings || []).map((f) => {
            const pts =
              f.points != null ? f.points : (FRACTION[f.verdict] ?? 0) * f.weight;
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
                <div className="finding-tag">{methodLabel(f.method)}</div>
                <p className="finding-why">
                  <span className="finding-why-label">Why this score</span>
                  {f.why || f.reasoning}
                </p>
                {f.evidence_text && (
                  <div className="evidence">
                    <span className="quote">“{f.evidence_text}”</span>
                    {seg && (
                      <button className="jump" onClick={() => jumpTo(seg.start)}>
                        {fmtTime(seg.start)}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="col-right">
          <h2 className="h">
            Transcript <span className="hint">click a line to play</span>
          </h2>
          <div className="transcript">
            {(audit.segments || []).map((s) => {
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
      </div>
    </div>
  );
}

export default function ReviewQueue({ api, focusCallId, onBack, onOpenCall, onQueueChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("pending");
  const [openId, setOpenId] = useState(focusCallId ?? null);
  const [solvingId, setSolvingId] = useState(null);

  useEffect(() => {
    setOpenId(focusCallId ?? null);
    if (focusCallId != null) setTab("pending");
  }, [focusCallId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${api}/api/calls/flagged`)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load flagged calls.");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setItems(list);
        if (focusCallId != null) {
          const hit = list.find((i) => i.id === focusCallId);
          setTab(hit?.solved ? "solved" : "pending");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Could not load flagged calls.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, focusCallId]);

  const pending = items.filter((i) => !i.solved);
  const solved = items.filter((i) => i.solved);
  const visible = tab === "solved" ? solved : pending;

  function toggle(id) {
    setOpenId((cur) => (cur === id ? null : id));
  }

  async function solveReview(id) {
    if (solvingId != null) return;
    setSolvingId(id);
    setError(null);
    try {
      const r = await fetch(`${api}/api/calls/${id}/solve`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail =
          typeof d.detail === "string" ? d.detail : "Could not solve this review.";
        throw new Error(detail);
      }
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, solved: true } : it)),
      );
      setTab("solved");
      setOpenId(id);
      if (onQueueChange) onQueueChange();
    } catch (e) {
      setError(e.message || "Could not solve this review.");
    } finally {
      setSolvingId(null);
    }
  }

  return (
    <section className="review-page" aria-label="Review queue">
      <div className="review-page-head">
        <div>
          <h1 className="review-page-title">Review queue</h1>
          <p className="review-page-sub">
            {loading
              ? "Loading flagged calls…"
              : `${pending.length} pending · ${solved.length} solved`}
          </p>
        </div>
        <button type="button" className="library-refresh" onClick={onBack}>
          Back to scoring
        </button>
      </div>

      <div className="review-tabs" role="tablist" aria-label="Review status">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pending"}
          className={`review-tab ${tab === "pending" ? "on" : ""}`}
          onClick={() => setTab("pending")}
        >
          Pending
          <span className="review-tab-count">{pending.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "solved"}
          className={`review-tab ${tab === "solved" ? "on" : ""}`}
          onClick={() => setTab("solved")}
        >
          Solved
          <span className="review-tab-count">{solved.length}</span>
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {!loading && !error && visible.length === 0 && (
        <p className="review-empty">
          {tab === "solved"
            ? "No solved reviews yet. Use Solve review on a pending call."
            : items.length === 0
              ? "No flagged calls yet. Open a scorecard and click Flag for review."
              : "No pending reviews."}
        </p>
      )}

      <ul className="review-cascade">
        {visible.map((item) => {
          const open = openId === item.id;
          return (
            <li
              key={item.id}
              className={`review-item ${open ? "open" : ""}`}
            >
              <div className="review-item-head">
                <button
                  type="button"
                  className="review-item-toggle"
                  aria-expanded={open}
                  onClick={() => toggle(item.id)}
                >
                  <span className="review-chevron" aria-hidden="true">
                    {open ? "▾" : "▸"}
                  </span>
                  <span className="review-item-main">
                    <span className="review-item-name" title={item.filename}>
                      {item.filename}
                    </span>
                    <span className="review-item-meta">
                      {item.agent_name || "Unknown agent"}
                      {" · "}
                      {fmtTime(item.audio_seconds)}
                      {item.reasons ? ` · ${item.reasons}` : ""}
                    </span>
                  </span>
                  <span className="review-item-side">
                    <span className={`review-source src-${(item.sources || []).join("-") || "flagged"}`}>
                      {sourceLabel(item.sources)}
                    </span>
                    <span className={`review-score ${bandClass(item.grade)}`}>
                      {item.score != null ? item.score : "—"}
                    </span>
                  </span>
                </button>
                {tab === "pending" && (
                  <button
                    type="button"
                    className="review-solve"
                    disabled={solvingId != null}
                    onClick={() => solveReview(item.id)}
                  >
                    {solvingId === item.id ? "Solving…" : "Solve review"}
                  </button>
                )}
              </div>
              {open && (
                <div className="review-item-body">
                  <FlaggedCallDetail
                    api={api}
                    callId={item.id}
                    onOpenCall={onOpenCall}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
