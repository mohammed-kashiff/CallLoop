"""
CallProof - QA Engine (v3-capable).

Runs a config-driven rubric against a transcript and scores it deterministically.

Criterion methods:
  - deterministic         : a Python rule in rules.py
  - llm                   : Claude judges, must cite an exact transcript quote
  - deterministic_plus_llm: run both; either layer flagging "fail" => fail (gate-style)
  - llm_plus_outcome_data : run the llm part now; outcome reconciliation is a
                            separate delayed batch job (not done here)

Verdicts: pass / partial / fail / unverified / not_applicable / error.
  - unverified   : the LLM cited a quote that isn't in the transcript (evidence gate)
  - not_applicable: the criterion didn't apply (excluded from the score, not zeroed)
  - error        : couldn't evaluate (excluded from the score)

Scoring is deterministic: pass=1.0, partial=0.5, fail=0.0 of the criterion weight.
not_applicable / error / gates (weight 0) are excluded from BOTH numerator and
denominator, so the weighted score renormalises. Gates never affect the weighted
score; a gate that fails is surfaced as a flag (see score_results -> gate_fails).
The LLM never computes the score.
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
MAX_HTTP_RETRIES = 2
MAX_PARSE_RETRIES = 2
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
    q = _norm(quote)
    if not q:
        return False, None
    for s in segments:
        if q in _norm(s["text"]):
            return True, s["seq"]
    return False, None


# ---------- JSON parsing (robust) ----------
def _iter_json_objects(text):
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
    for obj in _iter_json_objects((text or "").strip()):
        try:
            return json.loads(obj)
        except Exception:  # noqa: BLE001
            continue
    raise ValueError("no parseable JSON object found")


# ---------- LLM criterion ----------
SYSTEM_INSTRUCTIONS = (
    "You are a strict call-quality auditor. Evaluate ONLY the AGENT on the one "
    "criterion given, using only the transcript provided. When your verdict is "
    "pass/partial/fail you MUST cite a real, exact quote copied verbatim from a "
    "transcript line. Never invent or paraphrase a quote. Respond with JSON only."
)


def _criterion_question(cr):
    """v3 criteria carry the LLM prompt in one of several fields."""
    if cr.get("question"):
        return cr["question"]
    steps = [cr.get("question_step_1"), cr.get("question_step_2")]
    steps = [s for s in steps if s]
    if steps:
        return "\n".join(f"Step {i}: {s}" for i, s in enumerate(steps, 1))
    if cr.get("llm_question"):
        return cr["llm_question"]
    return None


def build_prompt(question, transcript_text, allowed_verdicts, strict=False):
    verdicts = " | ".join(f'"{v}"' for v in allowed_verdicts)
    na_note = ""
    if "not_applicable" in allowed_verdicts:
        na_note = ('\nIf this criterion does not apply to this call, return '
                   '"not_applicable" with a brief reason and an empty evidence_quote.')
    base = (
        f"{SYSTEM_INSTRUCTIONS}\n\n"
        f"CRITERION:\n{question}\n\n"
        f"TRANSCRIPT (one turn per line):\n{transcript_text}\n\n"
        f"Your verdict MUST be one of: {verdicts}.{na_note}\n"
        "Return ONLY this JSON object:\n"
        "{\n"
        f'  "verdict": one of {verdicts},\n'
        '  "reasoning": "one or two sentences",\n'
        '  "evidence_quote": "a SHORT exact span, 5-15 words, copied verbatim from one transcript line",\n'
        '  "evidence_seq": <the seq number of the line you quoted>\n'
        "}"
    )
    if strict:
        base += "\n\nYour previous reply could not be parsed. Output ONLY raw JSON, no markdown, no commentary."
    return base


def call_claude(prompt):
    last_err = None
    for _ in range(MAX_HTTP_RETRIES):
        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": ANTHROPIC_API_KEY,
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": MODEL, "max_tokens": MAX_TOKENS,
                      "messages": [{"role": "user", "content": prompt}]},
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
    question = _criterion_question(criterion)
    if not question:
        return {"verdict": "error", "reasoning": "No LLM question defined for this criterion.",
                "evidence_text": None, "evidence_seq": None, "evidence_verified": False}
    allowed = criterion.get("verdict_space", ["pass", "partial", "fail"])

    parsed = None
    for attempt in range(MAX_PARSE_RETRIES):
        raw = call_claude(build_prompt(question, transcript_text, allowed, strict=(attempt > 0)))
        try:
            parsed = parse_json(raw)
            break
        except Exception:  # noqa: BLE001
            parsed = None
    if parsed is None:
        return {"verdict": "error", "reasoning": "Model output was not valid JSON after a retry.",
                "evidence_text": None, "evidence_seq": None, "evidence_verified": False}

    verdict = parsed.get("verdict", "error")
    if verdict == "not_applicable":
        return {"verdict": "not_applicable", "reasoning": parsed.get("reasoning", ""),
                "evidence_text": None, "evidence_seq": None, "evidence_verified": None}

    quote = parsed.get("evidence_quote", "")
    verified, seq = validate_evidence(quote, segments)
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


# ---------- Combined (deterministic + llm): either flags fail => fail ----------
def run_combined_criterion(criterion, segments, agent_speaker, transcript_text):
    det = run_deterministic_criterion(criterion, segments, agent_speaker)
    llm_q = criterion.get("llm_question")
    if not llm_q:                      # no LLM layer specified: deterministic decides
        return det
    llm_cr = dict(criterion)
    llm_cr["question"] = llm_q
    llm_cr["verdict_space"] = ["pass", "fail"]
    llm = run_llm_criterion(llm_cr, transcript_text, segments)
    if det["verdict"] == "fail":
        return det
    if llm["verdict"] == "fail":
        return llm
    return det                          # neither layer flagged a failure


# ---------- Dispatch ----------
def evaluate_criterion(criterion, segments, agent_speaker, transcript_text):
    method = criterion.get("method")
    if method == "deterministic":
        return run_deterministic_criterion(criterion, segments, agent_speaker)
    if method == "deterministic_plus_llm":
        return run_combined_criterion(criterion, segments, agent_speaker, transcript_text)
    return run_llm_criterion(criterion, transcript_text, segments)   # llm, llm_plus_outcome_data


# ---------- Scoring (deterministic) ----------
FRACTION = {"pass": 1.0, "partial": 0.5, "fail": 0.0, "unverified": 0.0}
SCORE_EXCLUDED = {"not_applicable", "error"}   # excluded from numerator AND denominator


def performance_band(score):
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Good"
    if score >= 60:
        return "Needs improvement"
    return "Poor"


def awarded_points(criterion, verdict):
    """Points this criterion contributes, or None if it's excluded from scoring."""
    if criterion.get("is_gate") or criterion.get("weight", 0) == 0:
        return None
    if verdict in SCORE_EXCLUDED:
        return None
    return round(criterion["weight"] * FRACTION.get(verdict, 0.0), 1)


def score_results(results):
    rows, earned, possible, tally, gate_fails = [], 0.0, 0.0, {}, []
    for cr, res in results:
        v = res["verdict"]
        tally[v] = tally.get(v, 0) + 1
        if cr.get("is_gate") and v == "fail":
            gate_fails.append(cr["name"])
        pts = awarded_points(cr, v)
        rows.append((cr, res, pts))
        if pts is not None:
            earned += pts
            possible += cr["weight"]
    score = round(earned / possible * 100, 1) if possible else 0.0
    return rows, score, round(earned, 1), round(possible, 1), tally, gate_fails


# ---------- Coaching ----------
def generate_coaching(weak):
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


LABEL = {"pass": "PASS", "partial": "PARTIAL", "fail": "FAIL",
         "unverified": "UNVERIFIED", "not_applicable": "N/A", "error": "ERROR"}


def main():
    if not ANTHROPIC_API_KEY:
        sys.exit("ERROR: ANTHROPIC_API_KEY not found in .env")
    arg_id = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else None
    agent_override = sys.argv[2] if len(sys.argv) > 2 else None

    call_id, meta, segments = load_call(arg_id)
    if not segments:
        sys.exit(f"Call {call_id} has no segments to analyze.")
    agent = agent_override or identify_agent(segments)
    transcript_text = format_transcript(segments, agent)
    with open(RUBRIC_PATH) as f:
        rubric = json.load(f)

    print(f"CallProof QA - call id {call_id} ({meta.get('audio_seconds')}s, {len(segments)} turns)")
    print(f"Rubric: {rubric['name']} | agent = {agent}")
    print("=" * 72)

    results = []
    for c in rubric["criteria"]:
        if c["method"] != "deterministic":
            print(f"  ...asking Claude: {c['name']}")
        results.append((c, evaluate_criterion(c, segments, agent, transcript_text)))

    rows, score, earned, possible, tally, gate_fails = score_results(results)
    grade = performance_band(score)

    print("=" * 72)
    for c, res, pts in rows:
        gate = " [GATE]" if c.get("is_gate") else ""
        pt = "  -  " if pts is None else f"{pts:>5}/{c['weight']}"
        print(f"\n[{c['method']}]{gate} {c['name']} -> {LABEL.get(res['verdict'], res['verdict'].upper())}  {pt}")
        print(f"     {res['reasoning']}")
        if res.get("evidence_text"):
            mk = "VERIFIED" if res.get("evidence_verified") else "REJECTED"
            print(f'     evidence: "{res["evidence_text"]}"  [{mk}]')

    print("\n" + "=" * 72)
    if gate_fails:
        print(f"!! GATE FAILURE - flag for manager review: {', '.join(gate_fails)}")
    tally_str = ", ".join(f"{n} {k}" for k, n in tally.items())
    print(f"Verdicts: {tally_str}")
    print(f"TOTAL SCORE: {score} / 100 ({earned} of {possible} weighted points)  ->  {grade.upper()}")
    print("=" * 72)


if __name__ == "__main__":
    main()
