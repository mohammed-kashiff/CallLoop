"""
Deterministic + orchestration layer for the Call QA minimal rubric (v8).

Implements rubric_minimal_v8.json:
  - Resolution Effectiveness   (40) -- pure LLM, no deterministic piece here
  - Ownership & Next Steps     (20) -- deterministic step 1, conditional LLM step 2
  - Active Listening           (20) -- pure deterministic
  - Tone, Empathy & Prof.      (20) -- deterministic hostile check, then LLM

Each check function returns:
  { "verdict": "pass" | "partial" | "fail",
    "reasoning": str,
    "evidence_seq": int | None,
    "evidence_text": str | None,
    "coaching_note": str | None,
    "needs_llm": bool,                 # True if caller must run an LLM step
    "llm_context": dict | None }       # what the LLM step needs, if needs_llm

The actual LLM calls are NOT made here -- this module prepares what the LLM
step needs and combines the result once the caller has it. Keeps this file
testable without network access, same separation as the original rules.py.
"""

import re

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

NEGATION_MARKERS = re.compile(r"\b(cant|cannot|wont|couldnt|didnt|dont|isnt|arent|wasnt)\b")
NEGATION_LOOKAHEAD_CHARS = 20


def find_term(text, terms):
    """Negation-aware match. Use for commitment/ownership-style phrases where
    negation genuinely changes the meaning ("I won't be able to personally
    handle this" should not match "i will personally")."""
    t = (text or "").lower()
    for term in terms:
        idx = t.find(term)
        if idx == -1:
            continue
        window = t[idx: idx + len(term) + NEGATION_LOOKAHEAD_CHARS]
        if NEGATION_MARKERS.search(window):
            continue
        return term
    return None


def find_term_plain(text, terms):
    """Plain substring match, NO negation exemption. Use for hostile/profane
    language, where negation doesn't neutralize the behavior the way it
    neutralizes a commitment phrase."""
    t = (text or "").lower()
    for term in terms:
        if term in t:
            return term
    return None


def _normalize(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


# ---------------------------------------------------------------------------
# LLM output validation -- "bad JSON gets caught, never shipped"
# ---------------------------------------------------------------------------

import json

REQUIRED_LLM_FIELDS = {
    "resolution_effectiveness": {"verdict", "reasoning", "evidence_seq", "evidence_text", "coaching_note"},
    "tone_step2": {"verdict", "reasoning", "evidence_seq", "evidence_text", "coaching_note"},
    "ownership_step2": {"classification", "reasoning", "coaching_note"},
}
ALLOWED_VERDICTS = {"pass", "partial", "fail"}
ALLOWED_CLASSIFICATIONS = {"transparent_honest", "dismissive"}


class LLMOutputError(Exception):
    """Raised when an LLM response fails schema validation. Caller must
    fail closed (retry, then flag for review) -- never catch this and
    silently ship the unvalidated output."""


def validate_llm_output(raw_output, dimension_key):
    """Parses + validates a single LLM response against its expected schema.
    raw_output: str (raw model text, expected JSON) or an already-parsed dict.
    Returns the validated dict, or raises LLMOutputError.
    This function does not call the model or retry -- see
    run_llm_step_with_validation for the bounded-retry wrapper."""
    if isinstance(raw_output, str):
        try:
            parsed = json.loads(raw_output)
        except json.JSONDecodeError as e:
            raise LLMOutputError(f"Malformed JSON from LLM: {e}")
    else:
        parsed = raw_output

    required = REQUIRED_LLM_FIELDS.get(dimension_key)
    if required is None:
        raise LLMOutputError(f"Unknown dimension_key '{dimension_key}' -- no schema registered.")
    missing = required - parsed.keys()
    if missing:
        raise LLMOutputError(f"Missing required fields: {sorted(missing)}")

    if "verdict" in parsed and parsed["verdict"] not in ALLOWED_VERDICTS:
        raise LLMOutputError(f"Invalid verdict '{parsed['verdict']}' -- must be one of {sorted(ALLOWED_VERDICTS)}")
    if "classification" in parsed and parsed["classification"] not in ALLOWED_CLASSIFICATIONS:
        raise LLMOutputError(f"Invalid classification '{parsed['classification']}' -- must be one of {sorted(ALLOWED_CLASSIFICATIONS)}")
    if "evidence_seq" in parsed and parsed["evidence_seq"] is not None and not isinstance(parsed["evidence_seq"], int):
        raise LLMOutputError("evidence_seq must be an int or null")

    return parsed


def run_llm_step_with_validation(call_llm_fn, dimension_key, max_retries=1):
    """Bounded, aimed retry -- the harness principle applied to every LLM
    call in this pipeline, not just the ones with obvious stakes.

    call_llm_fn: zero-arg callable that invokes the LLM and returns raw
    text or a dict. Must accept a `retry_reason` kwarg so a retry attempt
    can include the previous failure in its prompt (that's the "aimed"
    part -- not a blind identical retry).

    Raises LLMOutputError if still invalid after max_retries -- caller
    must fail closed (flag the call for reprocessing / human review), never
    silently fall through with unvalidated data."""
    last_error = None
    for _ in range(max_retries + 1):
        raw = call_llm_fn(retry_reason=last_error)
        try:
            return validate_llm_output(raw, dimension_key)
        except LLMOutputError as e:
            last_error = str(e)
    raise LLMOutputError(f"Failed validation after {max_retries + 1} attempts: {last_error}")


# ---------------------------------------------------------------------------
# Coaching note evidence verification -- "no proof, no claim" applied to
# the coaching notes themselves, not just the verdicts
# ---------------------------------------------------------------------------

QUOTE_PATTERN = re.compile(r"['\u2018\u2019\"]([^'\u2018\u2019\"]{4,})['\u2018\u2019\"]")


def verify_coaching_note_evidence(coaching_note, evidence_text, full_transcript_text=None):
    """Extracts quoted phrases from a coaching_note and checks each one
    actually appears in the cited evidence (or the full transcript, as a
    fallback in case the note legitimately references a different line).
    Returns (is_valid, unverified_quotes)."""
    if not coaching_note:
        return True, []
    quotes = QUOTE_PATTERN.findall(coaching_note)
    if not quotes:
        return True, []  # nothing quoted to verify -- e.g. a purely behavioral note
    evidence_norm = _normalize(evidence_text)
    transcript_norm = _normalize(full_transcript_text) if full_transcript_text else ""
    unverified = [q for q in quotes
                  if _normalize(q) not in evidence_norm and not (transcript_norm and _normalize(q) in transcript_norm)]
    return (len(unverified) == 0), unverified


def safe_coaching_note(coaching_note, evidence_text, full_transcript_text=None, dimension_id=None):
    """Wraps a coaching_note with the evidence check. If verification fails,
    the note is WITHHELD -- never shipped with a hallucinated quote -- and a
    flag is returned for a separate LLM-QA queue (distinct from the agent
    manager-review queue -- this is a data-quality issue, not a performance
    issue, and the two should not be conflated in the same inbox).
    Returns (safe_note, flag_or_none)."""
    is_valid, unverified = verify_coaching_note_evidence(coaching_note, evidence_text, full_transcript_text)
    if is_valid:
        return coaching_note, None
    fallback = "Coaching note withheld pending review -- a quoted claim could not be verified against the transcript."
    flag = {
        "dimension_id": dimension_id,
        "reason": "unverified_quote_in_coaching_note",
        "original_note": coaching_note,
        "unverified_quotes": unverified,
    }
    return fallback, flag


# ---------------------------------------------------------------------------
# #1 -- Delivery routing: reinforcement goes to the agent directly,
# correction goes to the manager first
# ---------------------------------------------------------------------------

def coaching_delivery_channel(verdict):
    """pass -> straight to the agent's own dashboard (reinforcement).
    partial/fail -> manager queue first -- the manager decides how and when
    to raise it, rather than the agent finding a correction with no context.
    Mirrors the project's existing principle that analysis should open a
    constructive conversation, not put someone on the defensive."""
    if verdict == "pass":
        return "agent_dashboard"
    if verdict in ("partial", "fail"):
        return "manager_queue"
    return "manager_queue"  # unknown verdict -- fail closed toward the safer routing


# ---------------------------------------------------------------------------
# #5 -- Confidence field: route low-confidence LLM verdicts to a human
# spot-check queue instead of trusting every verdict equally
# ---------------------------------------------------------------------------

ALLOWED_CONFIDENCE = {"high", "medium", "low"}
SPOT_CHECK_CONFIDENCE_LEVELS = {"low"}  # NEEDS CALIBRATION -- could expand to include "medium"


def needs_spot_check(llm_result):
    """llm_result must include a 'confidence' field (add this to the LLM
    prompt schema alongside verdict/reasoning/coaching_note). Returns True
    if this verdict should be queued for human review rather than trusted
    outright. Cheap to add, meaningfully improves trust -- doesn't require
    changing anything about how verdicts are scored, only how much weight
    a downstream human process gives to reviewing them."""
    confidence = llm_result.get("confidence")
    if confidence not in ALLOWED_CONFIDENCE:
        return True  # missing/invalid confidence -- fail toward reviewing it
    return confidence in SPOT_CHECK_CONFIDENCE_LEVELS


# ---------------------------------------------------------------------------
# #2 -- Weekly rollup: digest instead of a per-call firehose
# ---------------------------------------------------------------------------

def weekly_coaching_digest(week_results, max_notes_per_dimension=1):
    """week_results: list of per-call dimension result dicts for ONE agent
    over one week, each shaped like {"dimension_id": str, "verdict": str,
    "coaching_note": str, "call_id": str, "call_date": str}.

    Groups by dimension, and for each dimension with 2+ non-pass instances,
    folds them into a single pattern statement instead of repeating near-
    identical notes. Dimensions with only 0-1 flagged instances keep their
    original note as-is (nothing to summarize).

    Needs real call history across a week to be meaningful -- this is
    exactly why it wasn't demoed live with sample data, but the function
    itself is real and ready for the team to wire up once call history is
    flowing."""
    from collections import defaultdict
    by_dimension = defaultdict(list)
    for r in week_results:
        if r["verdict"] in ("partial", "fail"):
            by_dimension[r["dimension_id"]].append(r)

    digest = []
    for dim_id, instances in by_dimension.items():
        if len(instances) <= 1:
            for r in instances:
                digest.append({"dimension_id": dim_id, "type": "single_instance",
                               "note": r["coaching_note"], "call_id": r["call_id"]})
            continue
        dates = [r["call_date"] for r in instances]
        pattern_note = (f"Flagged on {dim_id.replace('_', ' ')} {len(instances)} times this week "
                        f"({', '.join(dates)}) -- worth a specific conversation rather than "
                        f"treating these as isolated incidents.")
        digest.append({
            "dimension_id": dim_id, "type": "pattern",
            "note": pattern_note, "instance_count": len(instances),
            "call_ids": [r["call_id"] for r in instances],
            "representative_notes": [r["coaching_note"] for r in instances[:max_notes_per_dimension]],
        })
    return digest


# ---------------------------------------------------------------------------
# #4 -- Repeat-pattern awareness fed INTO note generation, not just detected
# after the fact on the dashboard
# ---------------------------------------------------------------------------

REPEAT_PATTERN_THRESHOLD = 3  # NEEDS CALIBRATION


def detect_repeat_pattern(recent_history, dimension_id, current_verdict):
    """recent_history: list of {"dimension_id": str, "verdict": str,
    "call_date": str} for this agent's recent calls (e.g. trailing 7 days),
    NOT including the current call.

    Returns a short context string to inject into the LLM prompt for the
    CURRENT call's coaching_note generation, so the note itself can say
    "this is the 3rd call this week..." instead of the dashboard being the
    only place that knows about the pattern. Returns None if no pattern
    (nothing to inject -- keeps the prompt clean on the common case)."""
    if current_verdict not in ("partial", "fail"):
        return None
    same_dim_recent_flags = [h for h in recent_history
                             if h["dimension_id"] == dimension_id and h["verdict"] in ("partial", "fail")]
    count = len(same_dim_recent_flags) + 1  # +1 for the current call
    if count < REPEAT_PATTERN_THRESHOLD:
        return None
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(count if count < 20 else count % 10, "th")
    return (f"NOTE FOR PROMPT CONTEXT: this is the {count}{suffix} call in the recent window flagged "
           f"on {dimension_id.replace('_', ' ')} for this agent. Reference the pattern directly "
           f"in the coaching_note rather than writing it as an isolated incident.")


def _agent_segments(segments, agent_speaker):
    return [s for s in segments if s.get("speaker") == agent_speaker]


def _result(verdict, reasoning, seg, coaching_note=None, needs_llm=False, llm_context=None):
    return {
        "verdict": verdict,
        "reasoning": reasoning,
        "evidence_seq": seg["seq"] if seg else None,
        "evidence_text": seg["text"] if seg else None,
        "coaching_note": coaching_note,
        "needs_llm": needs_llm,
        "llm_context": llm_context,
    }


# ---------------------------------------------------------------------------
# Ownership & Next Steps -- weight 20
# ---------------------------------------------------------------------------

OWNERSHIP_SPECIFIC_TERMS = ["i will personally", "i'll personally", "ticket #",
                            "ticket number", "case #", "case number",
                            "reference number", "confirmation number",
                            "escalated to", "assigned to"]

OWNERSHIP_TEAM_NAMES = ["billing", "engineering", "technical support", "tech support",
                        "retention", "escalations", "escalation", "account management"]
OWNERSHIP_TEAM_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in OWNERSHIP_TEAM_NAMES) + r")\s+team\b"
)

OWNERSHIP_VAGUE_TERMS = ["someone will", "we will look into it", "you'll hear back",
                         "someone from our team", "we'll be in touch"]

CLOSING_WINDOW = 3


def check_ownership_step1(segments, agent_speaker):
    """Deterministic pass. Returns pass/fail directly, or flags needs_llm=True
    with the matched vague term for step 2 to judge."""
    closing = _agent_segments(segments, agent_speaker)[-CLOSING_WINDOW:]
    vague_seg = vague_term = None
    for s in closing:
        specific_term = find_term(s["text"], OWNERSHIP_SPECIFIC_TERMS)
        if specific_term:
            return _result("pass", f"Agent named a specific owner (matched '{specific_term.strip()}').", s)
        team_match = OWNERSHIP_TEAM_PATTERN.search((s["text"] or "").lower())
        if team_match:
            return _result("pass", f"Agent named a specific team ('{team_match.group(0)}').", s)
        if vague_seg is None:
            term = find_term(s["text"], OWNERSHIP_VAGUE_TERMS)
            if term:
                vague_seg, vague_term = s, term
    if vague_seg:
        return _result(
            None, "Vague ownership phrase found -- needs LLM judgment (honest vs. dismissive).",
            vague_seg, needs_llm=True,
            llm_context={"matched_term": vague_term, "segment_seq": vague_seg["seq"]},
        )
    return _result(
        "fail", "No ownership of next steps stated in the closing turns.", None,
        coaching_note="No ownership of next steps was stated before the call ended -- "
                       "always name who owns the follow-up.",
    )


def combine_ownership_result(step1_result, llm_classification=None, full_transcript_text=None):
    """Call after check_ownership_step1 if needs_llm was True.
    llm_classification: 'transparent_honest' | 'dismissive'"""
    if not step1_result["needs_llm"]:
        return step1_result
    term = step1_result["llm_context"]["matched_term"]
    evidence_text = step1_result["evidence_text"]
    evidence_seg = {"seq": step1_result["evidence_seq"], "text": evidence_text}
    if llm_classification == "transparent_honest":
        note = ("Being upfront that this depends on another team, while still "
                "personally committing to follow up, is exactly the right way "
                "to handle something outside your control -- keep doing this.")
        safe_note, flag = safe_coaching_note(note, evidence_text, full_transcript_text, "ownership_next_steps")
        result = _result(
            "pass",
            f"Agent was transparently honest about a constraint outside their control "
            f"(matched '{term.strip()}') while still taking personal accountability.",
            evidence_seg, coaching_note=safe_note,
        )
    else:
        note = (f"Vague ownership phrase used ('{term.strip()}') without real "
                f"accountability -- next time, even without a timeline, commit "
                f"personally: 'I don't have an exact timeline, but I'll personally "
                f"make sure you hear back.'")
        safe_note, flag = safe_coaching_note(note, evidence_text, full_transcript_text, "ownership_next_steps")
        result = _result(
            "partial",
            f"Agent used vague ownership language without real accountability (matched '{term.strip()}').",
            evidence_seg, coaching_note=safe_note,
        )
    result["llm_qa_flag"] = flag  # None unless the note failed evidence verification
    return result


# ---------------------------------------------------------------------------
# Active Listening -- weight 20, pure deterministic
# ---------------------------------------------------------------------------

OVERLAP_MIN_DURATION_SEC = 1.5     # NEEDS CALIBRATION
BACKCHANNEL_MAX_WORDS = 3          # NEEDS CALIBRATION
BACKCHANNEL_TERMS = ["mhm", "uh huh", "right", "yeah", "i see", "got it", "okay"]
INTERRUPTION_SCOPE_CUSTOMER_TURNS = 5


def _is_real_interruption(agent_seg, prior_customer_seg):
    overlap = prior_customer_seg["end"] - agent_seg["start"]
    if overlap < OVERLAP_MIN_DURATION_SEC:
        return False
    customer_duration = prior_customer_seg["end"] - prior_customer_seg["start"]
    if customer_duration > 0 and overlap > customer_duration:
        return False  # almost certainly a diarization error, not a real interruption
    word_count = len(agent_seg["text"].split())
    if word_count <= BACKCHANNEL_MAX_WORDS and find_term(agent_seg["text"], BACKCHANNEL_TERMS):
        return False
    return True


def has_active_listening(segments, agent_speaker):
    ordered = sorted(segments, key=lambda s: s["start"])
    customer_turns_seen = 0
    overlaps = []
    prior_customer_seg = None
    for s in ordered:
        if s.get("speaker") != agent_speaker:
            customer_turns_seen += 1
            prior_customer_seg = s
            if customer_turns_seen > INTERRUPTION_SCOPE_CUSTOMER_TURNS:
                break
            continue
        if prior_customer_seg and customer_turns_seen <= INTERRUPTION_SCOPE_CUSTOMER_TURNS:
            if _is_real_interruption(s, prior_customer_seg):
                overlaps.append(s)

    if not overlaps:
        return _result("pass", "No interruptions during the customer's problem-statement phase.", None)
    if len(overlaps) == 1:
        seg = overlaps[0]
        return _result(
            "partial", "One interruption during the customer's problem-statement phase.", seg,
            coaching_note=f"One interruption detected at {seg['start']}s while the customer "
                           f"was describing their issue -- let them finish before responding.",
        )
    seg = overlaps[0]
    return _result(
        "fail", f"{len(overlaps)} interruptions during the customer's problem-statement phase.", seg,
        coaching_note=f"{len(overlaps)} interruptions detected during the customer's opening "
                       f"turns (first at {seg['start']}s) -- give the customer the full problem "
                       f"statement before jumping in.",
    )


# ---------------------------------------------------------------------------
# Tone, Empathy & Professionalism -- weight 20, deterministic override + LLM
# ---------------------------------------------------------------------------

HOSTILE_PHRASES = ["that's not my problem", "calm down", "i already told you",
                   "you need to listen", "that's not my fault",
                   "i can't help you if", "there's nothing i can do",
                   "read the policy", "you are being difficult",
                   "you're being difficult"]

PROFANITY_TERMS = ["fuck", "fucking", "fuck you", "fuck off", "shit", "shitty",
                   "bullshit", "screw you", "screw this", "piss off",
                   "asshole", "damn it", "goddamn", "hell with you",
                   "to hell with you", "shut up", "bastard"]
# Starter set -- NEEDS ONGOING MAINTENANCE. Load from config in production.


def check_hostile_step1(segments, agent_speaker):
    """Plain match, deliberately not negation-aware -- see find_term_plain."""
    for s in _agent_segments(segments, agent_speaker):
        term = find_term_plain(s["text"], PROFANITY_TERMS) or find_term_plain(s["text"], HOSTILE_PHRASES)
        if term:
            return _result(
                "fail", f"Hostile/inappropriate language detected (matched '{term.strip()}').", s,
            )
    return _result(None, "No hostile language detected -- proceed to LLM tone judgment.", None, needs_llm=True)


def combine_tone_result(step1_result, llm_verdict=None, llm_reasoning=None,
                         llm_evidence_seq=None, llm_evidence_text=None, llm_coaching_note=None,
                         full_transcript_text=None):
    if not step1_result["needs_llm"]:
        # hostile hit -- no coaching_note, this routes to manager review instead
        return step1_result
    safe_note, flag = safe_coaching_note(llm_coaching_note, llm_evidence_text, full_transcript_text, "tone_empathy_professionalism")
    result = _result(
        llm_verdict, llm_reasoning,
        {"seq": llm_evidence_seq, "text": llm_evidence_text} if llm_evidence_seq else None,
        coaching_note=safe_note,
    )
    result["llm_qa_flag"] = flag
    return result


# ---------------------------------------------------------------------------
# Score bands
# ---------------------------------------------------------------------------

SCORE_BANDS = [
    (95, 100, "Star Performer"),
    (90, 94, "Excelling"),
    (80, 89, "Solid Performer"),
    (70, 79, "Developing"),
    (60, 69, "Needs Improvement"),
    (0, 59, "Needs Immediate Attention"),
]


def score_band(score):
    for low, high, label in SCORE_BANDS:
        if low <= score <= high:
            return label
    raise ValueError(f"score {score} out of expected 0-100 range")


# ---------------------------------------------------------------------------
# Manager review routing
# ---------------------------------------------------------------------------

LOW_SCORE_THRESHOLD = 60  # aligned to the "Needs Immediate Attention" band


def check_manager_review(dimension_results, final_score, hostile_matched, hostile_evidence=None):
    triggers = []
    if hostile_matched:
        triggers.append({"reason": "hostile_language_override", "severity": "high", "evidence": hostile_evidence})
    if final_score < LOW_SCORE_THRESHOLD:
        worst = sorted(dimension_results, key=lambda d: d["score"])[:2]
        triggers.append({
            "reason": "low_overall_score", "severity": "medium", "final_score": final_score,
            "evidence": [{"dimension_id": d["id"], "evidence_seq": d.get("evidence_seq"),
                         "evidence_text": d.get("evidence_text")} for d in worst],
        })
    return triggers


# ---------------------------------------------------------------------------
# Score aggregation
# ---------------------------------------------------------------------------

WEIGHTS = {
    "resolution_effectiveness": 40,
    "ownership_next_steps": 20,
    "active_listening": 20,
    "tone_empathy_professionalism": 20,
}
VERDICT_POINTS = {"pass": 1.0, "partial": 0.5, "fail": 0.0}


def aggregate_score(dimension_verdicts, tone_hostile_override=False):
    """dimension_verdicts: {dimension_id: 'pass'|'partial'|'fail'}
    If tone_hostile_override is True, score is capped at 60 regardless of
    the weighted average -- same override behavior the old standalone gate
    provided, now living inside the tone dimension's own detection function."""
    weighted_sum = sum(WEIGHTS[dim_id] * VERDICT_POINTS[verdict] for dim_id, verdict in dimension_verdicts.items())
    score = round(weighted_sum, 1)
    if tone_hostile_override:
        score = min(score, 60)
    return score


REGISTRY = {
    "ownership_step1": check_ownership_step1,
    "ownership_combine": combine_ownership_result,
    "active_listening": has_active_listening,
    "tone_step1": check_hostile_step1,
    "tone_combine": combine_tone_result,
    "score_band": score_band,
    "manager_review": check_manager_review,
    "aggregate_score": aggregate_score,
    "validate_llm_output": validate_llm_output,
    "run_llm_step_with_validation": run_llm_step_with_validation,
    "verify_coaching_note_evidence": verify_coaching_note_evidence,
    "safe_coaching_note": safe_coaching_note,
    "coaching_delivery_channel": coaching_delivery_channel,
    "needs_spot_check": needs_spot_check,
    "weekly_coaching_digest": weekly_coaching_digest,
    "detect_repeat_pattern": detect_repeat_pattern,
}
