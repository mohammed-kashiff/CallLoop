"""
CallProof - transcript spine (with logging).

Submit a local audio file (or public URL) to PyAI Hear, poll until done, and
save a speaker-labelled, timestamped transcript to SQLite. Each source is
transcribed once (cached by content hash). On a failed job, PyAI's actual error
is logged and raised - no more silent failures.
"""

import os
import sys
import time
import json
import logging
import sqlite3
import hashlib
import uuid

import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("callproof.transcribe")

PYAI_API_KEY = (os.getenv("PYAI_API_KEY") or "").strip() or None
BASE_URL = "https://api.pyai.com"
DB_PATH = "callproof.db"
RECAP_PACK_ID = os.getenv("RECAP_PACK_ID") or None

AUDIO_SOURCE = "/Users/mohammed.kashif/Downloads/test1.mp3"   # only used by the CLI main()
SEPARATION_MODE = "channel"    # "diarize" (mono or stereo) | "channel" (true dual-channel)
MODEL = "pyai-hear-telephony"

POLL_INTERVAL_SECONDS = 2
POLL_MAX_ATTEMPTS = 60

# Populated at import; may be refreshed by set_api_key() after sandbox mint.
HEADERS = {"Authorization": f"Bearer {PYAI_API_KEY}"} if PYAI_API_KEY else {}


def set_api_key(api_key: str):
    """Inject / rotate the PyAI key at runtime (used by api.py sandbox mint)."""
    global PYAI_API_KEY, HEADERS
    key = (api_key or "").strip()
    if not key:
        raise ValueError("PYAI_API_KEY cannot be empty")
    PYAI_API_KEY = key
    HEADERS = {"Authorization": f"Bearer {key}"}
    os.environ["PYAI_API_KEY"] = key


def _require_api_key():
    if not PYAI_API_KEY:
        raise RuntimeError(
            "PYAI_API_KEY not configured. Add it to .env, or start the API so it "
            "can mint a sandbox key (sandbox keys cannot diarize — use a live key "
            "with transcribe:jobs for CallProof)."
        )


def is_url(src):
    return src.startswith("http://") or src.startswith("https://")


# ---------- Database ----------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT, audio_url TEXT UNIQUE NOT NULL,
        job_id TEXT, status TEXT, full_text TEXT, speakers INTEGER,
        audio_seconds REAL, raw_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, call_id INTEGER NOT NULL,
        seq INTEGER, speaker TEXT, channel INTEGER, start REAL, end REAL, text TEXT)""")
    cols = [r[1] for r in conn.execute("PRAGMA table_info(calls)").fetchall()]
    if "pyai_call_id" not in cols:
        conn.execute("ALTER TABLE calls ADD COLUMN pyai_call_id TEXT")
    conn.commit()
    return conn


def new_pyai_call_id():
    return f"callproof_{uuid.uuid4().hex[:12]}"


def find_existing_call(conn, identity):
    return conn.execute(
        "SELECT id, pyai_call_id FROM calls WHERE audio_url = ? AND status = 'completed'",
        (identity,)).fetchone()


def save_transcript(conn, identity, job_id, result, pyai_call_id=None):
    segments = result.get("segments") or []
    cur = conn.execute(
        """INSERT INTO calls (audio_url, job_id, status, full_text, speakers, audio_seconds,
           raw_json, pyai_call_id)
           VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)""",
        (identity, job_id, result.get("text", ""), result.get("speakers"),
         result.get("audio_seconds"), json.dumps(result), pyai_call_id))
    call_id = cur.lastrowid
    for i, seg in enumerate(segments):
        conn.execute(
            """INSERT INTO segments (call_id, seq, speaker, channel, start, end, text)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (call_id, i, seg.get("speaker"), seg.get("channel"),
             seg.get("start"), seg.get("end"), seg.get("text")))
    conn.commit()
    log.info("saved transcript for call %d (%d segments, pyai_call_id=%s)",
             call_id, len(segments), pyai_call_id)
    return call_id


# ---------- PyAI service wrapper ----------
def submit_job_url(audio_url, call_id=None):
    _require_api_key()
    body = {"audio_url": audio_url, "model": MODEL, "numerals": True, "output_formats": ["json"]}
    body.update({"channel": True} if SEPARATION_MODE == "channel" else {"diarize": True})
    if call_id:
        body["call_id"] = call_id
        if RECAP_PACK_ID:
            body["pack_id"] = RECAP_PACK_ID
    idem = hashlib.sha256(audio_url.encode()).hexdigest()[:32]
    resp = httpx.post(f"{BASE_URL}/v1/transcription/jobs", json=body,
                      headers={**HEADERS, "Idempotency-Key": idem}, timeout=60)
    return _job_id_from(resp)


# In-memory store for sync fallback results — keyed by synthetic job_id.
# Only populated when the async path is unavailable (sandbox keys).
_SYNC_RESULTS: dict = {}

_SYNC_SCOPE_HELP = (
    "This API key cannot use async Hear jobs (transcribe:jobs). "
    "CallProof needs speaker-labelled segments from POST /v1/transcription/jobs "
    "(diarize/channel). Sandbox keys only include hear:transcribe (text-only sync). "
    "Add a live PYAI_API_KEY with transcribe:jobs to .env and restart."
)


def submit_job_file(path, call_id=None):
    """
    Submit audio for transcription.

    Tries the async jobs endpoint first (transcribe:jobs scope).
    If the key lacks that scope (403) — typical for sandbox keys —
    attempts the sync endpoint and only accepts a diarized segment payload
    compatible with the rest of CallProof. Text-only sync responses fail
    with a clear error instead of saving an empty transcript.
    """
    _require_api_key()
    with open(path, "rb") as f:
        audio_bytes = f.read()

    files = {"audio": (os.path.basename(path), audio_bytes, "application/octet-stream")}
    data = {"model": MODEL, "numerals": "true", "output_formats": "json"}
    data.update({"channel": "true"} if SEPARATION_MODE == "channel" else {"diarize": "true"})
    if call_id:
        data["call_id"] = call_id
        if RECAP_PACK_ID:
            data["pack_id"] = RECAP_PACK_ID

    log.info("submitting %.2f MB to PyAI Hear (%s mode, call_id=%s)",
             len(audio_bytes) / 1_000_000, SEPARATION_MODE, call_id)

    resp = httpx.post(
        f"{BASE_URL}/v1/transcription/jobs",
        files=files, data=data, headers=HEADERS, timeout=120,
    )

    if resp.status_code == 403:
        log.warning(
            "async jobs returned 403 (missing transcribe:jobs) — "
            "trying sync endpoint for a diarized payload"
        )
        return _submit_sync_fallback(audio_bytes, path, data)

    return _job_id_from(resp)


def _normalize_sync_result(result: dict) -> dict:
    """Map sync/Whisper-shaped payloads toward the async jobs result shape."""
    out = dict(result)
    if not out.get("segments") and out.get("words"):
        out["segments"] = out.get("words") or []
    return out


def _has_usable_segments(result: dict) -> bool:
    segments = result.get("segments") or []
    if not segments:
        return False
    # Need at least one timed utterance with text; speaker preferred for QA.
    usable = 0
    speakers = set()
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        usable += 1
        if seg.get("speaker") is not None:
            speakers.add(seg.get("speaker"))
    return usable > 0 and len(speakers) >= 1


def _submit_sync_fallback(audio_bytes, path, data):
    """
    Sync fallback: POST /v1/audio/transcriptions (hear:transcribe scope).
    Returns a synthetic job_id only when the response includes speaker segments.
    """
    files = {"file": (os.path.basename(path), audio_bytes, "application/octet-stream")}
    sync_data = {
        "model": data.get("model", MODEL),
        "response_format": "verbose_json",
    }
    # Best-effort: some deployments accept these; ignored if unsupported.
    if "diarize" in data:
        sync_data["diarize"] = data["diarize"]
    if "channel" in data:
        sync_data["channel"] = data["channel"]
    if "numerals" in data:
        sync_data["numerals"] = data["numerals"]

    log.info("sync fallback: POST /v1/audio/transcriptions")
    resp = httpx.post(
        f"{BASE_URL}/v1/audio/transcriptions",
        files=files, data=sync_data, headers=HEADERS, timeout=180,
    )

    if resp.status_code != 200:
        log.error("sync fallback rejected: %s %s", resp.status_code, resp.text[:300])
        raise RuntimeError(
            f"PyAI sync transcription failed: {resp.status_code} {resp.text}. "
            f"{_SYNC_SCOPE_HELP}"
        )

    result = _normalize_sync_result(resp.json())
    if not _has_usable_segments(result):
        log.error(
            "sync fallback returned no speaker-labelled segments "
            "(keys=%s). CallProof cannot audit text-only transcripts.",
            sorted(result.keys()),
        )
        raise RuntimeError(_SYNC_SCOPE_HELP)

    call_id = data.get("call_id", "unknown")
    job_id = f"sync:{call_id}"
    _SYNC_RESULTS[job_id] = result
    log.info(
        "sync transcription usable (%d segments); synthetic job_id=%s",
        len(result.get("segments") or []), job_id,
    )
    return job_id


def _job_id_from(resp):
    if resp.status_code not in (200, 202):
        log.error("job submission rejected: %s %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"PyAI rejected the job: {resp.status_code} {resp.text}")
    job_id = resp.json().get("job_id")
    if not job_id:
        raise RuntimeError(f"No job_id in PyAI response: {resp.text}")
    log.info("job submitted: %s", job_id)
    return job_id


def poll_job(job_id):
    _require_api_key()
    # Sync fallback path — result already in memory, return immediately
    if job_id.startswith("sync:"):
        result = _SYNC_RESULTS.pop(job_id, None)
        if result is None:
            raise RuntimeError(f"Sync result for {job_id} not found (already consumed?)")
        log.info("sync job %s: returning inline result (no polling needed)", job_id)
        return result

    last_status = None
    for attempt in range(1, POLL_MAX_ATTEMPTS + 1):
        resp = httpx.get(
            f"{BASE_URL}/v1/transcription/jobs/{job_id}", headers=HEADERS, timeout=30
        )
        if resp.status_code != 200:
            log.error("poll error: %s %s", resp.status_code, resp.text[:300])
            raise RuntimeError(f"PyAI poll error: {resp.status_code} {resp.text}")
        data = resp.json()
        status = data.get("status")
        if status != last_status:
            log.info("job %s status: %s (attempt %d)", job_id, status, attempt)
            last_status = status
        if status == "completed":
            return get_result(data)
        if status in ("failed", "cancelled"):
            reason = data.get("error") or data
            log.error("job %s %s: %s", job_id, status, reason)
            raise RuntimeError(f"PyAI job {status}: {reason}")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise RuntimeError(
        f"PyAI job {job_id} did not finish within "
        f"{POLL_MAX_ATTEMPTS * POLL_INTERVAL_SECONDS}s"
    )


def get_result(job_data):
    if job_data.get("result"):
        return job_data["result"]
    if job_data.get("result_url"):
        r = httpx.get(job_data["result_url"], timeout=30)
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"Completed job has no result or result_url: {job_data}")


# ---------- Orchestrator (CLI) ----------
def identity_for(src):
    if is_url(src):
        return src
    with open(src, "rb") as f:
        return "file-sha256:" + hashlib.sha256(f.read()).hexdigest()[:24]


def main():
    if not PYAI_API_KEY:
        sys.exit("ERROR: PYAI_API_KEY not found. Is .env in this folder?")
    src = AUDIO_SOURCE
    conn = init_db()
    if not is_url(src) and not os.path.isfile(src):
        sys.exit(f"ERROR: file not found: {src}")
    identity = identity_for(src)
    existing = find_existing_call(conn, identity)
    if existing:
        log.info("already transcribed (call id %d) - loading from DB, no API call", existing[0])
        return
    pyai_id = new_pyai_call_id()
    job_id = submit_job_url(src, call_id=pyai_id) if is_url(src) else submit_job_file(src, call_id=pyai_id)
    result = poll_job(job_id)
    call_id = save_transcript(conn, identity, job_id, result, pyai_call_id=pyai_id)
    log.info("done: call id %d", call_id)


if __name__ == "__main__":
    main()