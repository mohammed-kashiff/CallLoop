"""
CallProof - transcript spine (now supports local files).
Submit an audio recording to PyAI Hear (async job), poll until done, and save a
speaker-labeled, timestamped transcript into SQLite. Works with a local file
(uploaded directly, no hosting needed) or a public https URL. Transcribes each
source once: re-runs load from the DB instead of calling the API again
(protects the daily unit cap).
"""

import os
import sys
import time
import json
import sqlite3
import hashlib

import httpx
from dotenv import load_dotenv

# ---------- Config ----------
load_dotenv()

PYAI_API_KEY = os.getenv("PYAI_API_KEY")
BASE_URL = "https://api.pyai.com"
DB_PATH = "callproof.db"

# What to transcribe: a local file path OR a public https URL.
AUDIO_SOURCE = "/Users/mohammed.kashif/Downloads/test1.mp3"

# Speaker separation:
#   "diarize" - model-based; works on mono OR stereo. Safe default for any file.
#   "channel" - exact per-side split; ONLY for true dual-channel stereo calls.
SEPARATION_MODE = "diarize"

MODEL = "pyai-hear-telephony"

# Polling - capped so a stuck job can't loop forever or burn units.
POLL_INTERVAL_SECONDS = 2
POLL_MAX_ATTEMPTS = 60  # 60 * 2s = 120s ceiling (room for a longer file)

if not PYAI_API_KEY:
    sys.exit("ERROR: PYAI_API_KEY not found. Is .env in this folder?")

HEADERS = {"Authorization": f"Bearer {PYAI_API_KEY}"}


def is_url(src):
    return src.startswith("http://") or src.startswith("https://")


# ---------- Database (same schema; call id 1 stays intact) ----------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audio_url TEXT UNIQUE NOT NULL,
        job_id TEXT, status TEXT, full_text TEXT,
        speakers INTEGER, audio_seconds REAL, raw_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id INTEGER NOT NULL REFERENCES calls(id),
        seq INTEGER, speaker TEXT, channel INTEGER,
        start REAL, end REAL, text TEXT)""")
    conn.commit()
    return conn


def find_existing_call(conn, identity):
    return conn.execute(
        "SELECT id FROM calls WHERE audio_url = ? AND status = 'completed'",
        (identity,)).fetchone()


def save_transcript(conn, identity, job_id, result):
    segments = result.get("segments") or []
    cur = conn.execute(
        """INSERT INTO calls (audio_url, job_id, status, full_text, speakers, audio_seconds, raw_json)
           VALUES (?, ?, 'completed', ?, ?, ?, ?)""",
        (identity, job_id, result.get("text", ""), result.get("speakers"),
         result.get("audio_seconds"), json.dumps(result)))
    call_id = cur.lastrowid
    for i, seg in enumerate(segments):
        conn.execute(
            """INSERT INTO segments (call_id, seq, speaker, channel, start, end, text)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (call_id, i, seg.get("speaker"), seg.get("channel"),
             seg.get("start"), seg.get("end"), seg.get("text")))
    conn.commit()
    return call_id


# ---------- PyAI service wrapper ----------
def submit_job_url(audio_url):
    body = {"audio_url": audio_url, "model": MODEL,
            "numerals": True, "output_formats": ["json"]}
    body.update({"channel": True} if SEPARATION_MODE == "channel" else {"diarize": True})
    idem = hashlib.sha256(audio_url.encode()).hexdigest()[:32]
    headers = {**HEADERS, "Idempotency-Key": idem}
    resp = httpx.post(f"{BASE_URL}/v1/transcription/jobs", json=body, headers=headers, timeout=60)
    return _job_id_from(resp)


def submit_job_file(path):
    with open(path, "rb") as f:
        audio_bytes = f.read()
    filename = os.path.basename(path)
    files = {"audio": (filename, audio_bytes, "application/octet-stream")}
    data = {"model": MODEL, "numerals": "true", "output_formats": "json"}
    data.update({"channel": "true"} if SEPARATION_MODE == "channel" else {"diarize": "true"})
    print(f"  uploading {len(audio_bytes) / 1_000_000:.2f} MB ...")
    resp = httpx.post(f"{BASE_URL}/v1/transcription/jobs",
                      files=files, data=data, headers=HEADERS, timeout=120)
    return _job_id_from(resp)


def _job_id_from(resp):
    if resp.status_code not in (200, 202):
        sys.exit(f"ERROR submitting job: {resp.status_code} {resp.text}")
    job_id = resp.json().get("job_id")
    if not job_id:
        sys.exit(f"ERROR: no job_id in response: {resp.text}")
    return job_id


def poll_job(job_id):
    for attempt in range(1, POLL_MAX_ATTEMPTS + 1):
        resp = httpx.get(f"{BASE_URL}/v1/transcription/jobs/{job_id}", headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            sys.exit(f"ERROR polling job: {resp.status_code} {resp.text}")
        data = resp.json()
        status = data.get("status")
        print(f"  attempt {attempt}/{POLL_MAX_ATTEMPTS}: status = {status}")
        if status == "completed":
            return get_result(data)
        if status in ("failed", "cancelled"):
            sys.exit(f"ERROR: job {status}: {data.get('error')}")
        time.sleep(POLL_INTERVAL_SECONDS)
    sys.exit(f"ERROR: job didn't finish within {POLL_MAX_ATTEMPTS * POLL_INTERVAL_SECONDS}s.")


def get_result(job_data):
    if job_data.get("result"):
        return job_data["result"]
    if job_data.get("result_url"):
        r = httpx.get(job_data["result_url"], timeout=30)
        r.raise_for_status()
        return r.json()
    sys.exit(f"ERROR: completed job has no result or result_url: {job_data}")


# ---------- Orchestrator ----------
def identity_for(src):
    if is_url(src):
        return src
    with open(src, "rb") as f:
        return "file-sha256:" + hashlib.sha256(f.read()).hexdigest()[:24]


def print_transcript(conn, call_id):
    full_text, speakers, audio_seconds = conn.execute(
        "SELECT full_text, speakers, audio_seconds FROM calls WHERE id = ?", (call_id,)).fetchone()
    segs = conn.execute(
        "SELECT speaker, channel, start, end, text FROM segments WHERE call_id = ? ORDER BY seq",
        (call_id,)).fetchall()
    print(f"Speakers: {speakers}   Audio: {audio_seconds}s   Segments: {len(segs)}")
    print("-" * 64)
    if segs:
        for speaker, channel, start, end, text in segs:
            ts = f"[{start:7.2f}-{end:7.2f}]" if start is not None else "[    --    ]"
            print(f"{ts} {(speaker or '?'):>10}: {text}")
    else:
        print("(No per-segment data - full transcript:)")
        print(full_text)


def main():
    src = AUDIO_SOURCE
    conn = init_db()
    if not is_url(src) and not os.path.isfile(src):
        sys.exit(f"ERROR: file not found: {src}\nCheck the path and filename.")

    identity = identity_for(src)
    existing = find_existing_call(conn, identity)
    if existing:
        print(f"Already transcribed (call id {existing[0]}). Loading from DB - no API call.\n")
        print_transcript(conn, existing[0])
        return

    print(f"Transcribing ({SEPARATION_MODE} mode):\n  {src}")
    job_id = submit_job_url(src) if is_url(src) else submit_job_file(src)
    print(f"Job submitted: {job_id}\nPolling...")
    result = poll_job(job_id)
    call_id = save_transcript(conn, identity, job_id, result)
    print(f"\nSaved to {DB_PATH} (call id {call_id}).\n")
    print_transcript(conn, call_id)


if __name__ == "__main__":
    main()
