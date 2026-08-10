"""
CallProof - FastAPI backend (v3-capable).

Exposes the audit as JSON, serves call audio, and accepts drag-and-drop uploads.
Reuses qa_engine.py (analysis) and transcribe.py (transcription).

The audit is cached in SQLite, keyed to a hash of rubric.json, so editing the
rubric (e.g. in Cursor) auto-invalidates stale audits.

Run from ~/callproof (venv active):
  uvicorn api:app --reload --port 8000
"""

import os
import json
import hashlib
import sqlite3

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import qa_engine as qa
import transcribe

DB_PATH = qa.DB_PATH
AUDIO_DIR = "audio"

app = FastAPI(title="CallProof API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def _startup():
    transcribe.init_db().close()
    with _conn() as c:
        c.execute("CREATE TABLE IF NOT EXISTS audits ("
                  "call_id INTEGER PRIMARY KEY, audit_json TEXT, "
                  "rubric_hash TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        cols = [r[1] for r in c.execute("PRAGMA table_info(audits)").fetchall()]
        if "rubric_hash" not in cols:
            c.execute("ALTER TABLE audits ADD COLUMN rubric_hash TEXT")
    os.makedirs(AUDIO_DIR, exist_ok=True)


_startup()


def _rubric_hash():
    with open(qa.RUBRIC_PATH, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def analyze_call(call_id, agent_override=None):
    with _conn() as c:
        exists = c.execute(
            "SELECT 1 FROM calls WHERE id=? AND status='completed'", (call_id,)).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail=f"No completed call with id {call_id}")

    call_id, meta, segments = qa.load_call(call_id)
    if not segments:
        raise HTTPException(status_code=422, detail=f"Call {call_id} has no segments")

    agent = agent_override or qa.identify_agent(segments)
    transcript_text = qa.format_transcript(segments, agent)
    with open(qa.RUBRIC_PATH) as f:
        rubric = json.load(f)

    results = [(cr, qa.evaluate_criterion(cr, segments, agent, transcript_text))
               for cr in rubric["criteria"]]

    _rows, score, _e, _p, tally, gate_fails = qa.score_results(results)
    grade = qa.performance_band(score)
    weak = [(c, r) for c, r in results if r["verdict"] in ("fail", "partial", "unverified")]
    coaching = qa.generate_coaching(weak) if weak else []

    findings = [{
        "id": cr["id"], "name": cr["name"], "method": cr["method"], "weight": cr["weight"],
        "is_gate": bool(cr.get("is_gate")),
        "verdict": res["verdict"], "reasoning": res.get("reasoning", ""),
        "points": qa.awarded_points(cr, res["verdict"]),
        "evidence_text": res.get("evidence_text"), "evidence_seq": res.get("evidence_seq"),
        "evidence_verified": res.get("evidence_verified"),
    } for cr, res in results]

    return {
        "call_id": call_id, "audio_seconds": meta.get("audio_seconds"),
        "agent_speaker": agent, "rubric": rubric["name"],
        "score": score, "grade": grade, "tally": tally,
        "gate_fails": gate_fails, "flagged": bool(gate_fails),
        "segments": segments, "findings": findings, "coaching": coaching,
    }


@app.get("/api/calls")
def list_calls():
    with _conn() as c:
        rows = c.execute(
            "SELECT id, audio_seconds, speakers FROM calls "
            "WHERE status='completed' ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


@app.get("/api/calls/{call_id}/audit")
def get_audit(call_id: int, refresh: bool = False):
    rh = _rubric_hash()
    if not refresh:
        with _conn() as c:
            row = c.execute(
                "SELECT audit_json, rubric_hash FROM audits WHERE call_id=?", (call_id,)).fetchone()
        if row and row["rubric_hash"] == rh:
            return json.loads(row["audit_json"])
    audit = analyze_call(call_id)
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO audits (call_id, audit_json, rubric_hash) VALUES (?, ?, ?)",
                  (call_id, json.dumps(audit), rh))
    return audit


@app.get("/api/calls/{call_id}/audio")
def get_audio(call_id: int):
    path = os.path.join(AUDIO_DIR, f"{call_id}.mp3")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404,
                            detail=f"No audio at {path}. Copy the call's file there as {call_id}.mp3.")
    return FileResponse(path, media_type="audio/mpeg")


@app.post("/api/upload")
def upload(file: UploadFile = File(...)):
    """Accept a dropped audio file, transcribe it, store it, return the new call id."""
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file was empty.")

    os.makedirs(AUDIO_DIR, exist_ok=True)
    tmp = os.path.join(AUDIO_DIR, "_upload_tmp")
    with open(tmp, "wb") as f:
        f.write(data)

    try:
        identity = transcribe.identity_for(tmp)
        conn = sqlite3.connect(DB_PATH)
        existing = transcribe.find_existing_call(conn, identity)
        if existing:
            call_id = existing[0]
        else:
            job_id = transcribe.submit_job_file(tmp)
            result = transcribe.poll_job(job_id)
            call_id = transcribe.save_transcript(conn, identity, job_id, result)
        conn.close()
        os.replace(tmp, os.path.join(AUDIO_DIR, f"{call_id}.mp3"))
    except HTTPException:
        raise
    except (Exception, SystemExit) as e:   # transcribe.py uses sys.exit on API errors
        msg = str(e)
        if "daily_cap_exceeded" in msg:
            raise HTTPException(status_code=429,
                detail="Daily transcription cap reached (resets 00:00 UTC). Try a fresh key or later.")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {msg}")
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

    return {"call_id": call_id}
