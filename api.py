"""
CallProof - FastAPI backend (v3, with logging + auto sandbox key).

Every request logs what it does. Crucially, /audit logs whether it served from
CACHE (stable score) or recomputed (MISS) - so you can see, per request, why a
score is or isn't changing.

On first run with no PYAI_API_KEY in the environment, the server automatically
mints a free PyAI sandbox key (POST /v1/sandbox/keys — no auth, no card) and
writes it to .env so it survives restarts until expiry.

Note: sandbox keys only include hear:transcribe (not transcribe:jobs / recap:*).
CallProof QA needs speaker-labelled async Hear jobs — use a live key for the
full stack. Sandbox minting is a bootstrap aid, not a production substitute.
"""

import os
import json
import hashlib
import logging
import sqlite3
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

load_dotenv()

import qa_engine as qa
import transcribe
import recap as pyai_recap

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("callproof.api")

DB_PATH = qa.DB_PATH
AUDIO_DIR = "audio"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

PYAI_SANDBOX_MINT_URL = "https://api.pyai.com/v1/sandbox/keys"
ENV_FILE = ".env"

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


def _apply_pyai_key(api_key: str):
    """Push a key into the process + both PyAI client modules."""
    transcribe.set_api_key(api_key)
    pyai_recap.set_api_key(api_key)


# ── Auto sandbox key mint ─────────────────────────────────────────────────────
def _mint_sandbox_key():
    """
    If PYAI_API_KEY is not set, hit POST /v1/sandbox/keys (no auth needed)
    to get a free pyai_test_... key. Writes it to .env so it persists across
    restarts until expiry. Called once at startup.
    """
    try:
        resp = httpx.post(
            PYAI_SANDBOX_MINT_URL,
            json={"label": "callproof"},
            timeout=10,
        )
        if resp.status_code == 404:
            log.warning(
                "sandbox key minting is disabled on this PyAI deployment.\n"
                "   ➤ Add a live PYAI_API_KEY to .env manually and restart."
            )
            return None

        if resp.status_code == 429:
            log.warning(
                "sandbox key rate limited. Try again in a moment.\n"
                "   ➤ Or add a live PYAI_API_KEY to .env manually."
            )
            return None

        if resp.status_code != 201:
            log.warning(
                "unexpected response minting sandbox key: %s %s",
                resp.status_code, resp.text[:200],
            )
            return None

        data = resp.json()
        api_key = data.get("api_key")
        expires = data.get("expires_at")  # Unix epoch ms

        if not api_key:
            log.warning("sandbox key response had no api_key field")
            return None

        expiry_str = "unknown"
        if expires:
            try:
                expiry_str = datetime.fromtimestamp(
                    expires / 1000, tz=timezone.utc
                ).strftime("%Y-%m-%d %H:%M UTC")
            except Exception:
                pass

        _write_key_to_env(api_key)
        _apply_pyai_key(api_key)

        scopes = data.get("scopes") or []
        log.info(
            "PyAI sandbox key minted (expires %s; scopes: %s). "
            "Sandbox keys cannot run diarized Hear jobs or Recap — "
            "replace with a live key in .env for the full CallProof stack.",
            expiry_str,
            ", ".join(scopes) if scopes else "unknown",
        )
        return api_key

    except httpx.RequestError as e:
        log.warning(
            "could not reach PyAI to mint sandbox key: %s\n"
            "   ➤ Check your internet connection, or add PYAI_API_KEY to .env.",
            e,
        )
        return None


def _write_key_to_env(api_key: str):
    """
    Upsert PYAI_API_KEY in .env. Creates the file if it doesn't exist.
    Replaces a blank PYAI_API_KEY= line; never overwrites a non-empty key.
    """
    try:
        lines = []
        if os.path.exists(ENV_FILE):
            with open(ENV_FILE, "r") as f:
                lines = f.readlines()

        new_lines = []
        replaced = False
        for line in lines:
            if line.startswith("PYAI_API_KEY="):
                existing = line.split("=", 1)[1].strip().strip('"').strip("'")
                if existing:
                    # Keep a manually configured key; do not clobber.
                    new_lines.append(line)
                    replaced = True
                else:
                    new_lines.append(f"PYAI_API_KEY={api_key}\n")
                    replaced = True
            else:
                new_lines.append(line)

        if not replaced:
            if new_lines and not new_lines[-1].endswith("\n"):
                new_lines[-1] = new_lines[-1] + "\n"
            new_lines.append(f"PYAI_API_KEY={api_key}\n")

        with open(ENV_FILE, "w") as f:
            f.writelines(new_lines)

    except OSError as e:
        log.warning("could not write sandbox key to .env: %s", e)


# ── Startup ───────────────────────────────────────────────────────────────────
def _startup():
    pyai_key = (os.environ.get("PYAI_API_KEY") or "").strip()
    if not pyai_key:
        log.info("No PYAI_API_KEY found — minting a free sandbox key...")
        minted = _mint_sandbox_key()
        if not minted:
            log.warning(
                "No PYAI_API_KEY available. Uploads will fail until you add one."
            )
    else:
        # Ensure both client modules see the same key (import order / blank reload).
        _apply_pyai_key(pyai_key)
        kind = "sandbox" if pyai_key.startswith("pyai_test_") else "configured"
        log.info("PYAI_API_KEY present (%s key)", kind)
        if kind == "sandbox":
            log.warning(
                "Using a sandbox key: async diarized jobs and Recap are likely "
                "unavailable. Prefer a live key with transcribe:jobs + recap:read."
            )

    if not (os.environ.get("ANTHROPIC_API_KEY") or "").strip():
        log.warning(
            "ANTHROPIC_API_KEY is not set.\n"
            "   ➤ The QA engine and coaching tips need this.\n"
            "   ➤ Get one at https://console.anthropic.com and add to .env"
        )

    transcribe.init_db().close()
    with _conn() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS audits ("
            "call_id INTEGER PRIMARY KEY, audit_json TEXT, "
            "rubric_hash TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        cols = [r[1] for r in c.execute("PRAGMA table_info(audits)").fetchall()]
        if "rubric_hash" not in cols:
            c.execute("ALTER TABLE audits ADD COLUMN rubric_hash TEXT")
    os.makedirs(AUDIO_DIR, exist_ok=True)
    log.info("startup complete; db=%s", DB_PATH)


_startup()


# ── Helpers ───────────────────────────────────────────────────────────────────
def _rubric_hash():
    with open(qa.RUBRIC_PATH, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def analyze_call(call_id, agent_override=None):
    with _conn() as c:
        exists = c.execute(
            "SELECT 1 FROM calls WHERE id=? AND status='completed'", (call_id,)
        ).fetchone()
    if not exists:
        raise HTTPException(
            status_code=404, detail=f"No completed call with id {call_id}"
        )

    call_id, meta, segments = qa.load_call(call_id)
    if not segments:
        raise HTTPException(
            status_code=422, detail=f"Call {call_id} has no segments"
        )

    agent = agent_override or qa.classify_roles(segments)
    transcript_text = qa.format_transcript(segments, agent)
    with open(qa.RUBRIC_PATH) as f:
        rubric = json.load(f)

    log.info(
        "computing audit for call %d (%d criteria)", call_id, len(rubric["criteria"])
    )
    results = [
        (cr, qa.evaluate_criterion(cr, segments, agent, transcript_text))
        for cr in rubric["criteria"]
    ]

    _rows, score, _e, _p, tally, gate_fails = qa.score_results(results)
    grade = qa.performance_band(score)
    weak = [(c, r) for c, r in results if r["verdict"] in ("fail", "partial", "unverified")]
    coaching = qa.generate_coaching(weak) if weak else []
    churn = qa.assess_churn(transcript_text, segments)
    feedback = qa.extract_feedback(transcript_text, segments)

    try:
        call_recap = pyai_recap.ensure_recap(
            call_id, segments, agent,
            audio_seconds=meta.get("audio_seconds"),
            stored_pyai_id=meta.get("pyai_call_id"),
        )
    except Exception as e:  # noqa: BLE001
        log.error("recap failed for call %d: %s", call_id, e)
        call_recap = {"status": "error", "error": str(e)}

    findings = [
        {
            "id": cr["id"], "name": cr["name"], "method": cr["method"],
            "weight": cr["weight"], "is_gate": bool(cr.get("is_gate")),
            "verdict": res["verdict"], "reasoning": res.get("reasoning", ""),
            "points": qa.awarded_points(cr, res["verdict"]),
            "evidence_text": res.get("evidence_text"),
            "evidence_seq": res.get("evidence_seq"),
            "evidence_verified": res.get("evidence_verified"),
        }
        for cr, res in results
    ]

    return {
        "call_id": call_id, "audio_seconds": meta.get("audio_seconds"),
        "agent_speaker": agent, "rubric": rubric["name"],
        "score": score, "grade": grade, "tally": tally,
        "gate_fails": gate_fails, "flagged": bool(gate_fails),
        "segments": segments, "findings": findings, "coaching": coaching,
        "churn": churn, "feedback": feedback, "recap": call_recap,
    }


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/calls")
def list_calls():
    with _conn() as c:
        rows = c.execute(
            "SELECT id, audio_seconds, speakers FROM calls "
            "WHERE status='completed' ORDER BY id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/calls/{call_id}/audit")
def get_audit(call_id: int, refresh: bool = False):
    rh = _rubric_hash()
    if not refresh:
        with _conn() as c:
            row = c.execute(
                "SELECT audit_json, rubric_hash FROM audits WHERE call_id=?",
                (call_id,),
            ).fetchone()
        if row and row["rubric_hash"] == rh:
            cached = json.loads(row["audit_json"])
            log.info(
                "cache HIT  call %d (score %s) - returning stored audit",
                call_id, cached.get("score"),
            )
            return cached
    log.info(
        "cache %s call %d - computing fresh audit",
        "BYPASS (refresh)" if refresh else "MISS ", call_id,
    )
    audit = analyze_call(call_id)
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO audits (call_id, audit_json, rubric_hash) "
            "VALUES (?, ?, ?)",
            (call_id, json.dumps(audit), rh),
        )
    log.info("cached audit for call %d (score %s)", call_id, audit["score"])
    return audit


@app.get("/api/calls/{call_id}/audio")
def get_audio(call_id: int):
    path = os.path.join(AUDIO_DIR, f"{call_id}.mp3")
    if not os.path.isfile(path):
        raise HTTPException(
            status_code=404,
            detail=f"No audio at {path}. Copy the call's file there as {call_id}.mp3.",
        )
    return FileResponse(path, media_type="audio/mpeg")


@app.post("/api/upload")
def upload(file: UploadFile = File(...)):
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file was empty.")
    size = len(data)
    log.info("upload received: %s (%.2f MB)", file.filename, size / (1024 * 1024))
    if size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File too large for transcription ({size / (1024 * 1024):.1f} MB). "
                f"Maximum is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
            ),
        )

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
            log.info(
                "upload deduped to existing call %d (no re-transcription)", call_id
            )
        else:
            pyai_id = transcribe.new_pyai_call_id()
            job_id = transcribe.submit_job_file(tmp, call_id=pyai_id)
            result = transcribe.poll_job(job_id)
            call_id = transcribe.save_transcript(
                conn, identity, job_id, result, pyai_call_id=pyai_id
            )
            log.info(
                "transcription complete -> new call %d (pyai_call_id=%s)",
                call_id, pyai_id,
            )
        conn.close()
        os.replace(tmp, os.path.join(AUDIO_DIR, f"{call_id}.mp3"))
    except HTTPException:
        raise
    except (Exception, SystemExit) as e:
        msg = str(e)
        log.error("upload/transcription failed: %s", msg)
        if "daily_cap_exceeded" in msg:
            raise HTTPException(
                status_code=429,
                detail="Daily transcription cap reached (resets 00:00 UTC). "
                       "Try a fresh key or later.",
            )
        if "transcribe:jobs" in msg or "speaker-labelled" in msg:
            raise HTTPException(status_code=403, detail=msg)
        raise HTTPException(status_code=502, detail=f"Transcription failed: {msg}")
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

    return {"call_id": call_id}
