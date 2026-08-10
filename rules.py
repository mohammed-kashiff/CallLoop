"""
Deterministic rule registry for the CallProof QA engine.

Each rule takes:
  - segments: list of dicts with keys seq, speaker, channel, start, end, text
  - agent_speaker: the speaker label we treat as the agent (e.g. "speaker_1")
and returns a dict:
  { "verdict": "pass" | "partial" | "fail",
    "reasoning": str,
    "evidence_seq": int | None,     # which transcript line triggered it
    "evidence_text": str | None }   # that line's text (verifiable against the DB)

Rules are keyword/heuristic based: fast, free, and 100% reproducible. Nuanced
judgment is handled by the LLM criteria instead.
"""

# Phrase banks (lowercase; our transcripts are lowercase, no punctuation).
GREETING_TERMS = ["hello", "hi ", "good morning", "good afternoon", "good evening",
                  "thank you for calling", "thanks for calling"]
PURPOSE_TERMS = ["calling to", "calling about", "calling regarding", "reason for",
                 "reason i", "i wanted to", "i'm calling", "i am calling",
                 "following up", "regarding your", "with regard to", "about your",
                 "how can i help", "how may i help"]
COMMITMENT_TERMS = ["i'll", "i will", "we'll", "we will", "i'm going to",
                    "i am going to", "let me", "i can", "send you", "send it",
                    "follow up", "get back to you", "make sure", "you'll receive",
                    "i'll have", "i'll send", "i'll get"]
CLOSING_TERMS = ["thank you", "thanks", "have a good", "have a great", "have a nice",
                 "take care", "bye", "goodbye", "anything else", "is there anything",
                 "you're welcome", "appreciate"]

OPENING_WINDOW = 3   # agent's first N turns count as the opening
CLOSING_WINDOW = 3   # agent's last N turns count as the close


def _agent_segments(segments, agent_speaker):
    return [s for s in segments if s.get("speaker") == agent_speaker]


def _find_term(text, terms):
    t = (text or "").lower()
    for term in terms:
        if term in t:
            return term
    return None


def _result(verdict, reasoning, seg):
    return {
        "verdict": verdict,
        "reasoning": reasoning,
        "evidence_seq": seg["seq"] if seg else None,
        "evidence_text": seg["text"] if seg else None,
    }


def has_opening_purpose(segments, agent_speaker):
    opening = _agent_segments(segments, agent_speaker)[:OPENING_WINDOW]
    greeting_seg = purpose_seg = None
    for s in opening:
        if greeting_seg is None and _find_term(s["text"], GREETING_TERMS):
            greeting_seg = s
        if purpose_seg is None and _find_term(s["text"], PURPOSE_TERMS):
            purpose_seg = s
    if greeting_seg and purpose_seg:
        return _result("pass", "Agent greeted and established the purpose of the call up front.", purpose_seg)
    if greeting_seg:
        return _result("partial", "Agent greeted but did not clearly state the call's purpose up front.", greeting_seg)
    if purpose_seg:
        return _result("partial", "Agent stated a purpose but without a clear greeting.", purpose_seg)
    return _result("fail", "No clear greeting or purpose statement in the agent's opening turns.", None)


def has_future_commitment(segments, agent_speaker):
    for s in _agent_segments(segments, agent_speaker):
        term = _find_term(s["text"], COMMITMENT_TERMS)
        if term:
            return _result("pass", f"Agent stated a concrete follow-up / next step (matched '{term.strip()}').", s)
    return _result("fail", "Agent never stated a concrete follow-up or next step.", None)


def has_professional_close(segments, agent_speaker):
    agent = _agent_segments(segments, agent_speaker)
    closing = agent[-CLOSING_WINDOW:] if agent else []
    for s in closing:
        if _find_term(s["text"], CLOSING_TERMS):
            return _result("pass", "Agent closed the call courteously.", s)
    return _result("fail", "Agent did not close the call with a courteous sign-off.", None)


REGISTRY = {
    "has_opening_purpose": has_opening_purpose,
    "has_future_commitment": has_future_commitment,
    "has_professional_close": has_professional_close,
}
