import { useState, useEffect, useRef, Fragment } from "react";
import JSZip from "jszip";
import { getHearFfmpeg, transcodeHearCopy } from "./hearTranscode";
import "./App.css";

const API = "http://localhost:8000";
const MAX_UPLOAD_MB = 25;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_BULK_FILES = 20;
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
      // v8 bands
      "Star Performer": "band-excellent",
      Excelling: "band-excellent",
      "Solid Performer": "band-good",
      Developing: "band-fair",
      "Needs Improvement": "band-fair",
      "Needs Immediate Attention": "band-poor",
      // legacy v3 bands
      Excellent: "band-excellent",
      Good: "band-good",
      "Needs improvement": "band-fair",
      Poor: "band-poor",
    }[grade] || "band-fair"
  );
}

function formatReviewReasons(triggers) {
  const labels = {
    hostile_language_override: "hostile language",
    low_overall_score: "low overall score",
  };
  return (triggers || [])
    .map((t) => labels[t.reason] || String(t.reason || "").replace(/_/g, " "))
    .filter(Boolean)
    .join("; ");
}

function shortRubricLabel(audit) {
  const id = audit?.rubric_id;
  if (id) return String(id).replace(/_/g, " ");
  const name = audit?.rubric || "";
  return name.length > 52 ? `${name.slice(0, 49)}…` : name;
}

function callLabel(c) {
  const name = (c?.filename || "").trim();
  return name || `call-${c?.id}.mp3`;
}

function methodLabel(method) {
  if (!method) return "scored";
  if (method === "deterministic_hybrid") return "Hybrid rules";
  if (method === "llm" || String(method).includes("llm")) return "AI judgment";
  return "Rule check";
}

/** Uncompressed zip so the server can extract and run Hear + Claude in parallel. */
async function zipAudioFiles(files) {
  if (!files || files.length < 2) {
    throw new Error("Zip is only used when importing more than one file.");
  }
  const zip = new JSZip();
  files.forEach((f, i) => {
    const name = String(f.name || `file-${i + 1}.mp3`).replace(/[/\\]/g, "_");
    zip.file(`${String(i).padStart(2, "0")}_${name}`, f);
  });
  return zip.generateAsync({ type: "blob", compression: "STORE" });
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
  // Audit-only load: start at 0% so it doesn't jump to mid-bar.
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
      ? "Transcribing…"
      : phase === "audit"
        ? "Scoring the call…"
        : "Working…";
  const hint =
    phase === "transcribe"
      ? "Usually 20–40 seconds."
      : "Roles from the recording channels; scoring follows AUDIT_MODE (hybrid: resolution + churn).";

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
  const [bulkJobs, setBulkJobs] = useState([]); // [{key,name,status,callId,score,error,sizeMb}]
  const [bulkNote, setBulkNote] = useState(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // null | opening | opened | error
  const [emailMessage, setEmailMessage] = useState(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingError, setCoachingError] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [manualReviewFlagged, setManualReviewFlagged] = useState(false);
  const [manualReviewMessage, setManualReviewMessage] = useState(null);
  const [pyaiStatus, setPyaiStatus] = useState(null);
  const [showDevLogs, setShowDevLogs] = useState(false);
  const [devLogLines, setDevLogLines] = useState([]);
  const [devLogUsage, setDevLogUsage] = useState(null);
  const [devLogError, setDevLogError] = useState(null);
  const [devLogLoading, setDevLogLoading] = useState(false);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const devLogBodyRef = useRef(null);
  const devLogStickRef = useRef(true);

  function refreshCalls() {
    return fetch(`${API}/api/calls`)
      .then((r) => r.json())
      .then((data) => {
        setCalls(data);
        return data;
      });
  }

  function refreshPyaiStatus() {
    return fetch(`${API}/api/pyai/status`)
      .then((r) => r.json())
      .then((data) => {
        setPyaiStatus(data);
        return data;
      })
      .catch(() => {
        setPyaiStatus({
          ok: false,
          healthy: false,
          label: "PyAI",
          quota_label: "Status unavailable",
        });
      });
  }

  function refreshDevLogs() {
    setDevLogLoading(true);
    return fetch(`${API}/api/dev/logs?lines=300`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok && data.error) {
          setDevLogError(data.message || data.error);
        } else {
          setDevLogError(null);
        }
        setDevLogLines(Array.isArray(data.lines) ? data.lines : []);
        setDevLogUsage(data.usage || null);
        return data;
      })
      .catch((e) => {
        setDevLogError(e.message || "Could not load logs.");
      })
      .finally(() => setDevLogLoading(false));
  }

  useEffect(() => {
    refreshCalls()
      .then((data) => {
        if (data.length) setCallId(data[0].id);
      })
      .catch(() =>
        setError("Could not reach the backend. Is uvicorn running on port 8000?")
      );
    refreshPyaiStatus();
    const id = setInterval(() => {
      refreshPyaiStatus();
    }, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!showDevLogs) return undefined;
    devLogStickRef.current = true;
    refreshDevLogs();
    const id = setInterval(() => {
      refreshDevLogs();
    }, 2000);
    return () => clearInterval(id);
  }, [showDevLogs]);

  useEffect(() => {
    if (!showDevLogs) return;
    const el = devLogBodyRef.current;
    if (!el || !devLogStickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [devLogLines, showDevLogs]);

  function loadAudit(id) {
    setLoading(true);
    setError(null);
    setEmailStatus(null);
    setEmailMessage(null);
    setCoachingError(null);
    setCoachingLoading(false);
    setFeedbackError(null);
    setFeedbackLoading(false);
    setManualReviewFlagged(false);
    setManualReviewMessage(null);
    setAudit(null);
    fetch(`${API}/api/calls/${id}/audit`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setAudit(data);
        if (data.flagged || (data.manager_review && data.manager_review.length)) {
          setManualReviewFlagged(true);
          const reasons = formatReviewReasons(data.manager_review);
          setManualReviewMessage(
            reasons
              ? `Auto-flagged for manager review: ${reasons}.`
              : `Call #${id} flagged for manual review.`,
          );
        }
      })
      .catch(() => setError("Could not load the audit for this call."))
      .finally(() => {
        setLoading(false);
        setPipelineActive(false);
        setJobFromUpload(false);
      });
  }

  useEffect(() => {
    // Bulk import loads audits itself; skip the auto-fetch until the batch finishes.
    if (bulkRunning) return;
    if (callId != null) loadAudit(callId);
  }, [callId, bulkRunning]);

  function patchBulkJob(key, patch) {
    setBulkJobs((prev) =>
      prev.map((j) => (j.key === key ? { ...j, ...patch } : j)),
    );
  }

  async function uploadOneFile(file) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API}/api/upload`, { method: "POST", body: fd });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      const detail = typeof d.detail === "string" ? d.detail : "Upload failed";
      throw new Error(detail);
    }
    const data = await r.json();
    return data.call_id;
  }

  async function fetchAuditJson(id) {
    const r = await fetch(`${API}/api/calls/${id}/audit`);
    if (!r.ok) throw new Error("Could not load the audit for this call.");
    return r.json();
  }

  function applyCompletedAudit(id, auditJson) {
    setCallId(id);
    setAudit(auditJson);
    if (
      auditJson.flagged ||
      (auditJson.manager_review && auditJson.manager_review.length)
    ) {
      setManualReviewFlagged(true);
      const reasons = formatReviewReasons(auditJson.manager_review);
      setManualReviewMessage(
        reasons
          ? `Auto-flagged for manager review: ${reasons}.`
          : `Call #${id} flagged for manual review.`,
      );
    } else {
      setManualReviewFlagged(false);
      setManualReviewMessage(null);
    }
  }

  async function uploadBatchZip(files) {
    if (!files || files.length < 2) {
      throw new Error("Zip is only used when importing more than one file.");
    }
    const blob = await zipAudioFiles(files);
    const fd = new FormData();
    fd.append("file", blob, "batch.zip");
    const r = await fetch(`${API}/api/upload-batch`, { method: "POST", body: fd });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      const detail = typeof d.detail === "string" ? d.detail : "Batch upload failed";
      throw new Error(detail);
    }
    const data = await r.json();
    return data.calls || [];
  }

  async function handleFiles(fileList) {
    const all = Array.from(fileList || []).filter(Boolean);
    if (!all.length || bulkRunning || uploading) return;

    setUploadError(null);
    setBulkNote(null);

    let selected = all;
    if (all.length > MAX_BULK_FILES) {
      selected = all.slice(0, MAX_BULK_FILES);
      setBulkNote(
        `Only the first ${MAX_BULK_FILES} files will be imported (${all.length} selected).`,
      );
    }

    const jobs = selected.map((f, i) => {
      const tooBig = f.size > MAX_UPLOAD_BYTES;
      const mb = (f.size / (1024 * 1024)).toFixed(1);
      return {
        key: `${Date.now()}-${i}-${f.name}`,
        name: f.name || `file-${i + 1}`,
        sizeMb: mb,
        status: tooBig ? "failed" : "queued",
        callId: null,
        score: null,
        error: tooBig
          ? `File too large (${mb} MB). Maximum is ${MAX_UPLOAD_MB} MB.`
          : null,
        file: f,
      };
    });
    const work = jobs.filter((j) => j.status !== "failed");
    const viaZip = work.length > 1;
    setBulkJobs(
      jobs.map(({ file, ...rest }) => ({
        ...rest,
        viaZip: viaZip && rest.status !== "failed",
      })),
    );

    if (!work.length) {
      setUploadError("No files within the 25 MB limit to import.");
      return;
    }

    setBulkRunning(true);
    setJobFromUpload(true);
    setPipelineActive(true);
    setUploading(true);

    let lastOkId = null;
    let lastAudit = null;

    try {
      if (!viaZip) {
        // One file: no zip. POST /api/upload transcodes a Hear copy and
        // keeps the original bytes for playback.
        const job = work[0];
        patchBulkJob(job.key, { status: "uploading", error: null });
        try {
          const call_id = await uploadOneFile(job.file);
          patchBulkJob(job.key, { status: "auditing", callId: call_id });
          setUploading(false);
          setLoading(true);
          const auditJson = await fetchAuditJson(call_id);
          patchBulkJob(job.key, {
            status: "done",
            callId: call_id,
            score: auditJson.score,
          });
          lastOkId = call_id;
          lastAudit = auditJson;
        } catch (e) {
          patchBulkJob(job.key, {
            status: "failed",
            error: e.message || "Import failed",
          });
        } finally {
          setLoading(false);
        }
      } else {
        work.forEach((job) =>
          patchBulkJob(job.key, { status: "transcoding", error: null }),
        );
        try {
          setLoading(true);
          await getHearFfmpeg();
          const ready = [];
          for (let i = 0; i < work.length; i++) {
            const job = work[i];
            patchBulkJob(job.key, { status: "transcoding", error: null });
            try {
              const wav = await transcodeHearCopy(job.file, i);
              ready.push({ job, file: wav });
              patchBulkJob(job.key, { status: "uploading" });
            } catch (e) {
              patchBulkJob(job.key, {
                status: "failed",
                error: e.message || "Hear transcode failed",
              });
            }
          }
          if (ready.length === 1) {
              const { job, file } = ready[0];
              const call_id = await uploadOneFile(file);
              patchBulkJob(job.key, { status: "auditing", callId: call_id });
              const auditJson = await fetchAuditJson(call_id);
              patchBulkJob(job.key, {
                status: "done",
                callId: call_id,
                score: auditJson.score,
              });
              lastOkId = call_id;
              lastAudit = auditJson;
            } else if (ready.length >= 2) {
            ready.forEach(({ job }) =>
              patchBulkJob(job.key, { status: "auditing" }),
            );
            const rows = await uploadBatchZip(ready.map((r) => r.file));
            ready.forEach((item, i) => {
              const row = rows[i];
              if (!row || row.status === "error" || row.call_id == null) {
                patchBulkJob(item.job.key, {
                  status: "failed",
                  error: (row && row.error) || "Import failed",
                  callId: row && row.call_id != null ? row.call_id : null,
                });
                return;
              }
              patchBulkJob(item.job.key, {
                status: "done",
                callId: row.call_id,
                score: row.score,
                error: null,
              });
              lastOkId = row.call_id;
            });
          }
        } catch (e) {
          const msg = e.message || "Import failed";
          setUploadError(msg);
          work.forEach((job) =>
            patchBulkJob(job.key, { status: "failed", error: msg }),
          );
        } finally {
          setLoading(false);
        }
      }

      await refreshCalls();
      if (lastOkId != null) {
        if (!lastAudit) {
          try {
            lastAudit = await fetchAuditJson(lastOkId);
          } catch {
            lastAudit = null;
          }
        }
        if (lastAudit) applyCompletedAudit(lastOkId, lastAudit);
        else setCallId(lastOkId);
      }
    } finally {
      setUploading(false);
      setPipelineActive(false);
      setJobFromUpload(false);
      setBulkRunning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (!bulkRunning && !uploading) handleFiles(e.dataTransfer.files);
  }

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

  async function loadFeedback() {
    if (callId == null || feedbackLoading) return;
    if ((audit?.feedback || {}).status === "ok") return;
    const id = callId;
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const r = await fetch(`${API}/api/calls/${id}/feedback`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const detail = typeof d.detail === "string" ? d.detail : "Could not load feedback.";
        throw new Error(detail);
      }
      const data = await r.json();
      setAudit((prev) =>
        prev && prev.call_id === id
          ? { ...prev, feedback: data.feedback || prev.feedback }
          : prev,
      );
    } catch (e) {
      setFeedbackError(e.message || "Could not load feedback.");
    } finally {
      setFeedbackLoading(false);
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
      setAudit((prev) =>
        prev && d.retention_email
          ? { ...prev, retention_email: d.retention_email }
          : prev,
      );
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

  function flagForManualReview() {
    if (callId == null || manualReviewFlagged) return;
    // Manual override (audit may already auto-flag via manager_review triggers).
    setManualReviewFlagged(true);
    setManualReviewMessage(
      `Call #${callId} flagged for manual review.`,
    );
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
  const feedbackStatus = feedback?.status ?? "skipped";
  const feedbackReady = feedbackStatus === "ok";
  const showFeedbackButton = !feedbackReady;
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

  const jobActive = uploading || loading || pipelineActive || bulkRunning;
  const jobPhase = uploading
    ? "transcribe"
    : loading || pipelineActive
      ? "audit"
      : null;

  const bulkDoneCount = bulkJobs.filter((j) => j.status === "done").length;
  const bulkFailedCount = bulkJobs.filter((j) => j.status === "failed").length;
  const viaZipImport = bulkJobs.some((j) => j.viaZip);
  const scoreByCallId = Object.fromEntries(
    bulkJobs.filter((j) => j.callId != null && j.score != null).map((j) => [j.callId, j.score]),
  );

  const auditMain = audit ? (
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
              <div className="score-actions">
                <button
                  type="button"
                  className={`flag-review ${manualReviewFlagged ? "flagged" : ""}`}
                  onClick={flagForManualReview}
                  disabled={manualReviewFlagged}
                >
                  {manualReviewFlagged ? "Flagged" : "Flag for review"}
                </button>
                {manualReviewMessage && (
                  <div className="flag-review-msg">{manualReviewMessage}</div>
                )}
              </div>
            </div>

            <div className="rubric-line">
              <b>{shortRubricLabel(audit)}</b>
              {" · "}
              {fmtTime(audit.audio_seconds)}
              {" · agent "}
              {audit.agent_speaker}
              {audit.audit_mode ? ` · ${audit.audit_mode} audit` : ""}
            </div>

            <section className={`churn churn-${churnRisk}`}>
              <div className="churn-head">
                <span className="churn-title">
                  Churn{" "}
                  {churnRisk === "none" ? (
                    <b>none</b>
                  ) : churnRisk === "unknown" ? (
                    <b>unavailable</b>
                  ) : (
                    <b>{churnRisk}</b>
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
                        ? "Drafting email…"
                        : "Email stakeholder"}
                    </button>
                    {retentionReady && emailStatus !== "error" && (
                      <span className="churn-queued">Draft ready</span>
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
                <div className="churn-reason">
                  {churn?.status === "skipped"
                    ? "Churn LLM skipped in hybrid audit mode."
                    : "Churn risk could not be assessed for this call."}
                </div>
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
              <section className={`call-recap panel recap-${recapStatus}`}>
                <h2 className="h">Recap</h2>
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
                    {callRecap.error || "Recap still processing. Try again shortly."}
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
                    <code>PYAI_API_KEY</code>, restart the API, then open this call again
                    after a fresh audit (e.g. new upload).
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
                      {String(f.method || "").includes("llm") && (
                        <span className={`verify ${f.evidence_verified ? "ok" : "no"}`}>
                          {f.evidence_verified ? "verified" : "unverified"}
                        </span>
                      )}
                      {seg && (
                        <button className="jump" onClick={() => jumpTo(seg.start)}>
                          {fmtTime(seg.start)}
                        </button>
                      )}
                    </div>
                  )}
                  {Array.isArray(f.subchecks) && f.subchecks.length > 0 && (
                    <ul className="subchecks">
                      {f.subchecks.map((c) => {
                        const cseg = c.evidence_seq != null ? segBySeq[c.evidence_seq] : null;
                        const jumpAt = c.jump_at != null ? c.jump_at : cseg?.start;
                        return (
                          <li className="subcheck" key={c.id}>
                            <span className={`badge v-${c.verdict}`}>{c.verdict}</span>
                            <span className="subcheck-body">
                              <span className="subcheck-name">{c.name}</span>
                              <span className="subcheck-reason">{c.reasoning}</span>
                              {c.evidence_text && (
                                <span className="subcheck-quote">“{c.evidence_text}”</span>
                              )}
                              {jumpAt != null && (
                                <button className="jump" onClick={() => jumpTo(jumpAt)}>
                                  {fmtTime(jumpAt)}
                                </button>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
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
                        ? "Refresh tips"
                        : "Get tips"}
                  </button>
                )}
              </div>
              {coachingError && <div className="banner error">{coachingError}</div>}
              {weakCount === 0 ? (
                <p className="coach-empty">Nothing to coach — all dimensions passed.</p>
              ) : coaching.length === 0 && !coachingLoading ? (
                <p className="coach-empty">Optional — runs one Claude call when you ask.</p>
              ) : (
                coaching.map((c, i) => (
                  <div className="coach" key={i}>
                    <div className="coach-crit">{c.criterion}</div>
                    <div className="coach-tip">{c.tip}</div>
                  </div>
                ))
              )}
            </section>

            <section className="customer-feedback">
              <div className="feedback-head">
                <h2 className="h">Feedback</h2>
                {showFeedbackButton && (
                  <button
                    type="button"
                    className="coach-btn"
                    onClick={loadFeedback}
                    disabled={feedbackLoading}
                  >
                    {feedbackLoading ? "Getting…" : "Get feedback"}
                  </button>
                )}
              </div>
              {feedbackError && <div className="banner error">{feedbackError}</div>}
              {feedbackStatus === "error" ? (
                <div className="banner error">
                  Customer feedback could not be assessed for this call.
                </div>
              ) : !feedbackReady ? (
                <p className="coach-empty">
                  {feedbackLoading
                    ? "Reading the transcript for customer feedback…"
                    : "Optional — runs one Claude call when you ask."}
                </p>
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

          </section>

          <section className="col-right">
            <h2 className="h">
              Transcript <span className="hint">click a line to play</span>
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
  ) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <span className="logo-ring" />
            <span className="logo-dot" />
          </span>
          <span className="brand-name">CallProof</span>
          <span className="tagline">Call QA · PyAI</span>
        </div>
        <div className="topbar-actions">
          {pyaiStatus && (
            <div
              className={`pyai-quota-chip ${pyaiStatus.healthy ? "is-ok" : "is-warn"}`}
              title={
                [
                  pyaiStatus.usage_label,
                  pyaiStatus.limits
                    ? `rps ${pyaiStatus.limits.rps ?? "—"} · burst ${pyaiStatus.limits.burst ?? "—"} · concurrency ${pyaiStatus.limits.concurrency ?? "—"}`
                    : null,
                  "Counts are CallProof outbound API hits today (UTC).",
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
              role="status"
              data-env={pyaiStatus.env || ""}
            >
              <span
                className={`pyai-quota-light ${pyaiStatus.healthy ? "on" : "off"}`}
                aria-hidden="true"
              />
              <span className="pyai-quota-env">
                {(pyaiStatus.label || "PyAI").toUpperCase()}
              </span>
              <span className="pyai-quota-sep" aria-hidden="true">
                ·
              </span>
              <span className="pyai-quota-text">
                {pyaiStatus.quota_label || "—"}
              </span>
            </div>
          )}
          <button
            type="button"
            className={`library-toggle ${showLibrary ? "on" : ""}`}
            onClick={() => setShowLibrary((v) => !v)}
          >
            {showLibrary ? "Hide calls" : "All calls"}
          </button>
          {calls.filter((c) => c.status === "completed" || !c.status).length > 0 && (
            <label className="call-select-wrap">
              <span className="call-select-label">Call</span>
              <select
                className="call-select"
                value={callId ?? ""}
                onChange={(e) => setCallId(Number(e.target.value))}
                disabled={jobActive}
              >
                {calls
                  .filter((c) => c.status === "completed" || !c.status)
                  .map((c) => {
                  const scored = scoreByCallId[c.id] ?? c.score;
                  const scoreLabel =
                    scored != null
                      ? ` · ${scored}`
                      : callId === c.id && audit?.score != null
                        ? ` · ${audit.score}`
                        : "";
                  return (
                    <option key={c.id} value={c.id}>
                      {callLabel(c)} · {fmtTime(c.audio_seconds)}
                      {scoreLabel}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
        </div>
      </header>

      {showLibrary && (
        <section className="calls-library" aria-label="Stored calls library">
          <div className="calls-library-head">
            <div>
              <h2 className="calls-library-title">All calls</h2>
              <p className="calls-library-sub">
                {calls.length} call{calls.length === 1 ? "" : "s"} saved
              </p>
            </div>
            <button
              type="button"
              className="library-refresh"
              disabled={jobActive}
              onClick={() => refreshCalls().catch(() => setError("Could not refresh calls."))}
            >
              Refresh
            </button>
          </div>
          {calls.length === 0 ? (
            <p className="calls-library-empty">No calls stored yet. Upload a recording to begin.</p>
          ) : (
            <div className="calls-library-table-wrap">
              <table className="calls-library-table">
                <thead>
                  <tr>
                    <th>Call</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Speakers</th>
                    <th>Segments</th>
                    <th>Score</th>
                    <th>Stored</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => {
                    const active = callId === c.id;
                    return (
                    <Fragment key={c.id}>
                      <tr
                        className={active ? "active" : ""}
                        onClick={() => {
                          if (!jobActive) setCallId(c.id);
                        }}
                        style={{ cursor: jobActive ? "default" : "pointer" }}
                      >
                        <td className="mono" title={`Internal id ${c.id}`}>
                          {callLabel(c)}
                        </td>
                        <td>
                          <span className={`lib-pill status-${c.status || "unknown"}`}>
                            {c.status || "unknown"}
                          </span>
                        </td>
                        <td>{fmtTime(c.audio_seconds)}</td>
                        <td>{c.speakers ?? "—"}</td>
                        <td>{c.segment_count ?? "—"}</td>
                        <td>
                          {c.has_audit ? (
                            <span title={c.audit_fresh ? "Audit cache is current" : "Rubric changed since this score was cached"}>
                              {c.score != null ? c.score : "—"}
                              {c.grade ? ` · ${c.grade}` : ""}
                              {!c.audit_fresh && c.has_audit ? " *" : ""}
                            </span>
                          ) : (
                            <span className="muted">not audited</span>
                          )}
                        </td>
                        <td className="muted small">
                          {(c.created_at || "").replace("T", " ").slice(0, 19) || "—"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="lib-open"
                            disabled={jobActive}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCallId(c.id);
                            }}
                          >
                            {active && audit && audit.call_id === c.id
                              ? "Viewing"
                              : active && loading
                                ? "…"
                                : "Open"}
                          </button>
                        </td>
                      </tr>
                      {active && (
                        <tr key={`${c.id}-audit`} className="library-audit-row">
                          <td colSpan={8}>
                            {loading && !audit && (
                              <p className="library-audit-loading">Loading audit…</p>
                            )}
                            {error && callId === c.id && (
                              <div className="banner error">{error}</div>
                            )}
                            {audit && audit.call_id === c.id && (
                              <div className="library-audit-panel">{auditMain}</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="calls-library-hint">
            * Stale after a rubric change — open the call to refresh the score.
          </p>
        </section>
      )}

      <div
        className={`dropzone ${dragOver ? "over" : ""} ${jobActive ? "busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!jobActive) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !jobActive && fileInputRef.current && fileInputRef.current.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        {bulkRunning ? (
          <span className="dropzone-title">
            Importing {bulkDoneCount + bulkFailedCount} / {bulkJobs.length}
          </span>
        ) : uploading ? (
          <span className="dropzone-title">Transcribing…</span>
        ) : (
          <>
            <span className="dropzone-title">Drop call recordings</span>
            <span className="dropzone-sub">
              Up to {MAX_BULK_FILES} files · {MAX_UPLOAD_MB} MB each · one file keeps the original for playback; two or more transcode to 8 kHz Hear copies, then zip
            </span>
          </>
        )}
      </div>
      {bulkNote && <div className="banner">{bulkNote}</div>}
      {uploadError && <div className="banner error">{uploadError}</div>}

      {bulkJobs.length > 0 && (
        <section className="bulk-progress" aria-live="polite">
          <div className="bulk-progress-head">
            <h2 className="bulk-progress-title">Import</h2>
            <span className="bulk-progress-count">
              {bulkDoneCount} done
              {bulkFailedCount ? ` · ${bulkFailedCount} failed` : ""}
              {" · "}
              {bulkJobs.length} total
            </span>
          </div>
          <ul className="bulk-job-list">
            {bulkJobs.map((j) => (
              <li key={j.key} className={`bulk-job status-${j.status}`}>
                <div className="bulk-job-main">
                  <span className="bulk-job-name" title={j.name}>
                    {j.name}
                  </span>
                  <span className="bulk-job-status">
                    {j.status === "queued" && "Queued"}
                    {j.status === "transcoding" && "Transcoding Hear copy…"}
                    {j.status === "uploading" &&
                      (j.viaZip ? "Zipping Hear copies…" : "Uploading / transcribing…")}
                    {j.status === "auditing" &&
                      (j.viaZip ? "Transcribe + QA in parallel…" : "Auditing…")}
                    {j.status === "done" && (
                      <>
                        Done
                        {j.callId != null && ` · Call #${j.callId}`}
                        {j.score != null && ` · score ${j.score}`}
                      </>
                    )}
                    {j.status === "failed" && "Failed"}
                  </span>
                </div>
                <div className="bulk-job-meta">
                  <span>{j.sizeMb} MB</span>
                  {j.status === "done" && j.callId != null && (
                    <button
                      type="button"
                      className="bulk-job-view"
                      disabled={jobActive || callId === j.callId}
                      onClick={() => setCallId(j.callId)}
                    >
                      View audit
                    </button>
                  )}
                </div>
                {j.error && <div className="bulk-job-error">{j.error}</div>}
              </li>
            ))}
          </ul>
          <p className="bulk-progress-hint">
            {viaZipImport
              ? "The browser transcodes each file to an 8 kHz stereo Hear copy, zips those copies, then PyAI and Claude run in parallel. Bulk playback is the Hear copy."
              : "This file is transcribed with a Hear copy; the original is kept for playback."}
          </p>
        </section>
      )}

      {error && <div className="banner error">{error}</div>}
      <JobProgress
        active={jobActive}
        phase={jobPhase}
        fromUpload={jobFromUpload}
      />

      {!showLibrary && auditMain}

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

      <div className={`dev-logs-fab-wrap${showDevLogs ? " open" : ""}`}>
        {showDevLogs && (
          <div className="dev-logs-popup" role="dialog" aria-label="Developer logs">
            <div className="dev-logs-head">
              <div>
                <h2 className="dev-logs-title">Dev logs</h2>
                <p className="dev-logs-sub">Live · secrets redacted</p>
              </div>
              <div className="dev-logs-actions">
                <button
                  type="button"
                  className="library-refresh"
                  disabled={devLogLoading}
                  onClick={() => refreshDevLogs()}
                >
                  {devLogLoading ? "…" : "Refresh"}
                </button>
                <button
                  type="button"
                  className="library-refresh"
                  onClick={() => setShowDevLogs(false)}
                >
                  Close
                </button>
              </div>
            </div>
            {devLogUsage && (
              <div className="dev-logs-usage">
                Today: {devLogUsage.total_actions ?? 0} PyAI ·{" "}
                {devLogUsage.total_polls ?? 0} polls ·{" "}
                {devLogUsage.by_provider?.anthropic?.hits ?? 0} Claude
                {devLogUsage.total_units
                  ? ` · ${devLogUsage.total_units} units`
                  : ""}
              </div>
            )}
            {devLogError && <div className="banner error">{devLogError}</div>}
            <pre
              className="dev-logs-body"
              ref={devLogBodyRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                devLogStickRef.current = dist < 48;
              }}
            >
              {devLogLines.length === 0
                ? "No log lines yet."
                : devLogLines.join("\n")}
            </pre>
          </div>
        )}
        <button
          type="button"
          className={`dev-logs-fab${showDevLogs ? " on" : ""}`}
          onClick={() => setShowDevLogs((v) => !v)}
          title={showDevLogs ? "Hide Dev logs" : "Open Dev logs"}
          aria-expanded={showDevLogs}
          aria-label={showDevLogs ? "Hide Dev logs" : "Open Dev logs"}
        >
          Logs
        </button>
      </div>
    </div>
  );
}