"""
CallProof - QA Engine (Milestones 3 + 4).

Loads a transcript from SQLite, runs each rubric criterion, produces a
per-criterion verdict with VERIFIED evidence, then scores the call.

Criterion types:
  - deterministic: plain Python rules (rules.py) - fast, free, reproducible
  - llm: Claude Sonnet 5 judges the line AND must cite an exact transcript quote

Evidence-validation gate: every quote the LLM cites is checked against the
actual transcript. A finding whose quote is not really in the call is REJECTED
(verdict -> "unverified"), so the model cannot invent evidence.

Scoring is deterministic: each verdict earns a fraction of its criterion weight
(pass=1.0, partial=0.5, fail/unverified=0.0). A criterion that could not be
evaluated (error) is EXCLUDED from the total, so a technical glitch never
distorts the agent's score. The LLM never computes the score.

Usage:
  python qa_engine.py                 # analyze the most recent call
  python qa_engine.py 2               # analyze call id 2
  python qa_engine.py 2 speaker_0     # ...and treat speaker_0 as the agent
"""

import os
import re
import sys
import json
import sqlite3

import httpx
from dotenv import load_dotenv

import rules

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
DB_PATH = "callproof.db"
RUBRIC_PATH = "rubric.json"
MODEL = "claude-sonnet-5"
MAX_HTTP_RETRIES = 2    # capped network retries
MAX_PARSE_RETRIES = 2   # capped re-asks if the model output isn't valid JSON
MAX_TOKENS = 600


# ---------- Load transcript ----------
def load_call(call_id=None):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    if call_id is None:
        row = conn.execute(
            "SELECT id FROM calls WHERE status='completed' ORDER BY id DESC LIMIT 1").fetchone()
        if not row:
            sys.exit("No completed calls in the database. Run transcribe.py first.")
        call_id = row["id"]
    meta = conn.execute(
        "SELECT id, full_text, speakers, audio_seconds FROM calls WHERE id=?", (call_id,)).fetchone()
    if not meta:
        sys.exit(f"No call with id {call_id} in the database.")
    segs = conn.execute(
        "SELECT seq, speaker, channel, start, end, text FROM segments WHERE call_id=? ORDER BY seq",
        (call_id,)).fetchall()
    conn.close()
    return call_id, dict(meta), [dict(s) for s in segs]


def identify_agent(segments):
    """Heuristic: the agent is whoever speaks first (agents usually open a call)."""
    return segments[0]["speaker"] if segments else None


def format_transcript(segments, agent_speaker):
    lines = []
    for s in segments:
        who = "AGENT" if s["speaker"] == agent_speaker else "CUSTOMER"
        start = s["start"] if s["start"] is not None else 0.0
        lines.append(f'[seq {s["seq"]}] ({who}, {start:.1f}s) {s["text"]}')
    return "\n".join(lines)


# ---------- Evidence-validation gate ----------
def _norm(text):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (text or "").lower())).strip()


def validate_evidence(quote, segments):
    """A quote is VERIFIED only if it actually appears in the transcript
    (normalized substring match). Returns (verified: bool, seq: int | None)."""
    q = _norm(quote)
    if not q:
        return False, None
    for s in segments:
        if q in _norm(s["text"]):
            return True, s["seq"]
    return False, None


# ---------- JSON parsing (robust) ----------
def _iter_json_objects(text):
    """Yield each complete, balanced {...} object in text (quote/escape aware)."""
    t = text or ""
    depth = 0
    start = None
    in_str = False
    esc = False
    for i, ch in enumerate(t):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    yield t[start:i + 1]
                    start = None


def parse_json(text):
    """Return the first parseable JSON object found anywhere in the text."""
    for obj in _iter_json_objects((text or "").strip()):
        try:
            return json.loads(obj)
        except Exception:  # noqa: BLE001
            continue
    raise ValueError("no parseable JSON object found")


# ---------- LLM criterion ----------
SYSTEM_INSTRUCTIONS = (
    "You are a strict call-quality auditor. Evaluate ONLY the AGENT on the one "
    "criterion given, using only the transcript provided. You MUST cite a real, "
    "exact quote copied verbatim from a transcript line. Never invent or "
    "paraphrase a quote. Respond with JSON only, no other text."
)


def build_prompt(question, transcript_text, strict=False):
    base = (
        f"{SYSTEM_INSTRUCTIONS}\n\n"
        f"CRITERION:\n{question}\n\n"
        f"TRANSCRIPT (one turn per line):\n{transcript_text}\n\n"
        "Return ONLY this JSON object and nothing else:\n"
        "{\n"
        '  "verdict": "pass" | "partial" | "fail",\n'
        '  "reasoning": "one or two sentences",\n'
        '  "evidence_quote": "a SHORT exact span, 5-15 words, copied verbatim from one transcript line",\n'
        '  "evidence_seq": <the seq number of the line you quoted>\n'
        "}"
    )
    if strict:
        base += ("\n\nYour previous reply could not be parsed. Output ONLY the raw JSON object: "
                 "no markdown, no code fences, no commentary. Keep evidence_quote to at most 15 words.")
    return base


def call_claude(prompt):
    last_err = None
    for _ in range(MAX_HTTP_RETRIES):
        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": MODEL,
                    "max_tokens": MAX_TOKENS,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=60,
            )
            if resp.status_code != 200:
                last_err = f"{resp.status_code}: {resp.text}"
                continue
            data = resp.json()
            return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        except Exception as e:  # noqa: BLE001
            last_err = str(e)
    raise RuntimeError(f"Claude call failed after {MAX_HTTP_RETRIES} tries: {last_err}")


def run_llm_criterion(criterion, transcript_text, segments):
    parsed = None
    for attempt in range(MAX_PARSE_RETRIES):
        raw = call_claude(build_prompt(criterion["question"], transcript_text, strict=(attempt > 0)))
        try:
            parsed = parse_json(raw)
            break
        except Exception:  # noqa: BLE001
            parsed = None
    if parsed is None:
        return {"verdict": "error", "reasoning": "Model output was not valid JSON after a retry.",
                "evidence_text": None, "evidence_seq": None, "evidence_verified": False}
    quote = parsed.get("evidence_quote", "")
    verified, seq = validate_evidence(quote, segments)
    verdict = parsed.get("verdict", "error")
    if criterion.get("evidence_required", True) and not verified:
        return {"verdict": "unverified", "reasoning": parsed.get("reasoning", ""),
                "evidence_text": quote, "evidence_seq": parsed.get("evidence_seq"),
                "evidence_verified": False, "original_verdict": verdict}
    return {"verdict": verdict, "reasoning": parsed.get("reasoning", ""),
            "evidence_text": quote, "evidence_seq": seq, "evidence_verified": verified}


# ---------- Deterministic criterion ----------
def run_deterministic_criterion(criterion, segments, agent_speaker):
    fn = rules.REGISTRY.get(criterion["check"])
    if not fn:
        return {"verdict": "error", "reasoning": f"Unknown rule '{criterion['check']}'.",
                "evidence_text": None, "evidence_seq": None, "evidence_verified": None}
    r = fn(segments, agent_speaker)
    return {"verdict": r["verdict"], "reasoning": r["reasoning"],
            "evidence_text": r["evidence_text"], "evidence_seq": r["evidence_seq"],
            "evidence_verified": r["evidence_text"] is not None}


# ---------- Scoring (deterministic) ----------
FRACTION = {"pass": 1.0, "partial": 0.5, "fail": 0.0, "unverified": 0.0, "error": 0.0}



def generate_coaching(weak):
    """One Claude call: turn the weak criteria (with their validated findings)
    into specific, actionable tips. Advisory only - never affects the score."""
    lines = []
    for i, (c, res) in enumerate(weak, 1):
        ev = res.get("evidence_text") or "(no specific line)"
        lines.append(f'{i}. {c["name"]} ({res["verdict"].upper()}): {res["reasoning"]} Evidence: "{ev}"')
    prompt = (
        "You are a supportive but candid call-coaching assistant. Below are the criteria where "
        "the agent scored below full marks, each with the auditor's reasoning and the evidence "
        "line. For EACH area, write ONE specific, actionable coaching tip (1-2 sentences) the "
        "agent can apply on the next call. Reference what actually happened; avoid generic advice. "
        "Return ONLY this JSON:\n"
        '{"coaching": [{"criterion": "<exact criterion name>", "tip": "<1-2 sentences>"}]}\n\n'
        "WEAK AREAS:\n" + "\n".join(lines)
    )
    try:
        return parse_json(call_claude(prompt)).get("coaching", [])
    except Exception:  # noqa: BLE001
        return [{"criterion": c["name"], "tip": "(coaching temporarily unavailable)"} for c, _ in weak]


def performance_band(score):
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Good"
    if score >= 60:
        return "Needs improvement"
    return "Poor"


def score_results(results):
    rows, earned, possible, tally = [], 0.0, 0.0, {}
    for c, res in results:
        v = res["verdict"]
        tally[v] = tally.get(v, 0) + 1
        if v == "error":                      # excluded from the total (fair)
            rows.append((c, res, None))
            continue
        awarded = round(c["weight"] * FRACTION.get(v, 0.0), 1)
        earned += awarded
        possible += c["weight"]
        rows.append((c, res, awarded))
    score = round(earned / possible * 100, 1) if possible else 0.0
    return rows, score, round(earned, 1), round(possible, 1), tally


LABEL = {"pass": "PASS", "partial": "PARTIAL", "fail": "FAIL",
         "unverified": "UNVERIFIED", "error": "ERROR"}


def main():
    if not ANTHROPIC_API_KEY:
        sys.exit("ERROR: ANTHROPIC_API_KEY not found in .env")

    arg_id = None
    if len(sys.argv) > 1:
        try:
            arg_id = int(sys.argv[1])
        except ValueError:
            sys.exit("First argument must be a numeric call id, e.g. `python qa_engine.py 2`.")
    agent_override = sys.argv[2] if len(sys.argv) > 2 else None

    call_id, meta, segments = load_call(arg_id)
    if not segments:
        sys.exit(f"Call {call_id} has no segments to analyze.")

    agent = agent_override or identify_agent(segments)
    transcript_text = format_transcript(segments, agent)

    with open(RUBRIC_PATH) as f:
        rubric = json.load(f)

    print(f"CallProof QA - call id {call_id}  "
          f"({meta.get('audio_seconds')}s, {len(segments)} turns)")
    print(f"Rubric: {rubric['name']}   |   agent = {agent} "
          f"({'override' if agent_override else 'first speaker; override with a 2nd arg'})")
    print("=" * 72)

    results = []
    for c in rubric["criteria"]:
        if c["method"] == "deterministic":
            res = run_deterministic_criterion(c, segments, agent)
        else:
            print(f"  ...asking Claude: {c['name']}")
            res = run_llm_criterion(c, transcript_text, segments)
        results.append((c, res))

    # ----- Detailed findings -----
    print("=" * 72)
    for c, res in results:
        tag = "rule" if c["method"] == "deterministic" else "llm "
        print(f"\n[{tag}] {c['name']}  ->  {LABEL.get(res['verdict'], res['verdict'].upper())}"
              f"   (weight {c['weight']})")
        print(f"       {res['reasoning']}")
        if res.get("evidence_text"):
            if c["method"] == "llm":
                mark = (f"VERIFIED - seq {res['evidence_seq']}" if res["evidence_verified"]
                        else "REJECTED - quote not found in transcript")
            else:
                mark = (f"from seq {res['evidence_seq']}"
                        if res["evidence_seq"] is not None else "-")
            print(f'       evidence: "{res["evidence_text"]}"  [{mark}]')

    # ----- Evidence-gate proof -----
    print("\n" + "-" * 72)
    fake = "i am so sorry let me refund your entire account right now"
    ok, _ = validate_evidence(fake, segments)
    print(f"Evidence-gate self-check - fabricated quote rejected: {'YES' if not ok else 'NO (!)'}")

    # ----- Scorecard -----
    rows, score, earned, possible, tally = score_results(results)
    grade = performance_band(score)
    print("\n" + "=" * 72)
    print("SCORECARD")
    print("-" * 72)
    for c, res, awarded in rows:
        name = c["name"]
        dots = "." * max(3, 46 - len(name))
        verdict = LABEL.get(res["verdict"], res["verdict"].upper())
        pts = "  -  " if awarded is None else f"{awarded:>5}"
        note = "   (not scored)" if awarded is None else ""
        print(f"  {name} {dots} {verdict:<11} {pts} / {c['weight']}{note}")
    tally_str = ", ".join(f"{n} {k}" for k, n in tally.items())
    print("-" * 72)
    print(f"  Verdicts: {tally_str}")
    n_errors = tally.get("error", 0)
    if n_errors:
        scored = len(results) - n_errors
        print(f"  Scored on {scored} of {len(results)} criteria "
              f"({earned} of {possible} possible points); {n_errors} could not be evaluated.")
    print(f"  TOTAL SCORE:  {score} / 100   ->   {grade.upper()}")
    print("=" * 72)

    # ----- Coaching -----
    weak = [(c, res) for c, res in results if res["verdict"] in ("fail", "partial", "unverified")]
    print("\n" + "=" * 72)
    print("COACHING")
    print("-" * 72)
    if not weak:
        print("  Strong call - every criterion earned full marks. Nothing to coach.")
    else:
        print(f"  ...generating tips for {len(weak)} area(s)")
        for item in generate_coaching(weak):
            print(f"\n  {item.get('criterion','')}:")
            print(f"      {item.get('tip','')}")
    print("=" * 72)


if __name__ == "__main__":
    main()
