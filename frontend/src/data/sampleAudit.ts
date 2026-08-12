import type { AuditReport } from '../types'

export const PERFORMANCE_BANDS = [
  { name: 'Star Performer' as const, range: '95–100', min: 95 },
  { name: 'Excelling' as const, range: '90–94', min: 90 },
  { name: 'Solid Performer' as const, range: '80–89', min: 80 },
  { name: 'Developing' as const, range: '70–79', min: 70 },
  { name: 'Needs Improvement' as const, range: '60–69', min: 60 },
  { name: 'Needs Immediate Attention' as const, range: 'Below 60', min: 0 },
]

/** Fallback bands for older cached audits. */
export const LEGACY_PERFORMANCE_BANDS = [
  { name: 'Excellent' as const, range: '90–100', min: 90 },
  { name: 'Good' as const, range: '75–89', min: 75 },
  { name: 'Needs Improvement' as const, range: '60–74', min: 60 },
  { name: 'Poor' as const, range: 'Below 60', min: 0 },
]

export function bandForScore(score: number): string {
  for (const b of PERFORMANCE_BANDS) {
    if (score >= b.min) return b.name
  }
  return 'Needs Immediate Attention'
}

export function gradeForScore(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export const sampleAudit: AuditReport = {
  callId: 'cp-2026-0812-4471',
  fileName: 'billing_dispute_aug12.mp3',
  durationSec: 312,
  analyzedAt: '2026-08-12T09:42:18Z',
  agentName: 'Maya Chen',
  customerLabel: 'Customer',
  overallScore: 78,
  band: 'Good',
  grade: 'B',
  gateFailed: false,
  criteria: [
    {
      id: 'greeting',
      name: 'Professional greeting',
      weight: 8,
      checkType: 'RULE',
      isGate: false,
      verdict: 'PASS',
      pointsEarned: 8,
      pointsPossible: 8,
      rationale: 'Agent opened with company name, own name, and offer to help.',
      evidenceQuote:
        "Thank you for calling Northline Support, this is Maya. How can I help you today?",
      evidenceTimestamp: 4,
      coachingTip: null,
    },
    {
      id: 'authentication',
      name: 'Caller authentication',
      weight: 10,
      checkType: 'BOTH',
      isGate: true,
      verdict: 'PASS',
      pointsEarned: 10,
      pointsPossible: 10,
      rationale: 'Verified full name and last four of account before discussing billing.',
      evidenceQuote:
        "For your security, can I confirm your full name and the last four digits on the account?",
      evidenceTimestamp: 28,
      coachingTip: null,
    },
    {
      id: 'empathy',
      name: 'Empathy & acknowledgment',
      weight: 12,
      checkType: 'AI',
      isGate: false,
      verdict: 'PARTIAL',
      pointsEarned: 6,
      pointsPossible: 12,
      rationale:
        'Acknowledged frustration once, but moved to troubleshooting before fully validating the customer’s concern.',
      evidenceQuote: "I understand that's frustrating — let's look at what happened with that charge.",
      evidenceTimestamp: 62,
      coachingTip:
        'Pause after the customer vents. Mirror their specific worry (“two unexpected charges”) before jumping into the account screen.',
    },
    {
      id: 'clarity',
      name: 'Clear explanations',
      weight: 10,
      checkType: 'AI',
      isGate: false,
      verdict: 'PASS',
      pointsEarned: 10,
      pointsPossible: 10,
      rationale: 'Explained the prorated fee in plain language without jargon.',
      evidenceQuote:
        "That twenty-four dollars is the remaining days on your old plan, billed once when you switched mid-cycle.",
      evidenceTimestamp: 118,
      coachingTip: null,
    },
    {
      id: 'hold_warning',
      name: 'Hold / transfer warning',
      weight: 6,
      checkType: 'RULE',
      isGate: false,
      verdict: 'FAIL',
      pointsEarned: 0,
      pointsPossible: 6,
      rationale: 'Placed the customer on hold without stating why or an expected wait time.',
      evidenceQuote: null,
      evidenceTimestamp: 145,
      coachingTip:
        'Before mute, say: “I’m putting you on a brief hold for about two minutes while I pull the invoice detail.”',
    },
    {
      id: 'interruptions',
      name: 'No interruptions',
      weight: 8,
      checkType: 'RULE',
      isGate: false,
      verdict: 'PASS',
      pointsEarned: 8,
      pointsPossible: 8,
      rationale: 'Agent waited for the customer to finish each turn; no overlapping speech.',
      evidenceQuote: null,
      evidenceTimestamp: null,
      coachingTip: null,
    },
    {
      id: 'tone',
      name: 'Professional tone',
      weight: 10,
      checkType: 'AI',
      isGate: false,
      verdict: 'PASS',
      pointsEarned: 10,
      pointsPossible: 10,
      rationale: 'Tone stayed calm and respectful throughout the dispute.',
      evidenceQuote: "You're right to question it — I'll walk through each line with you.",
      evidenceTimestamp: 96,
      coachingTip: null,
    },
    {
      id: 'sarcasm',
      name: 'No sarcasm or dismissiveness',
      weight: 8,
      checkType: 'AI',
      isGate: true,
      verdict: 'PASS',
      pointsEarned: 8,
      pointsPossible: 8,
      rationale: 'No sarcastic or dismissive language detected.',
      evidenceQuote: null,
      evidenceTimestamp: null,
      coachingTip: null,
    },
    {
      id: 'resolution',
      name: 'Issue resolution quality',
      weight: 14,
      checkType: 'AI',
      isGate: false,
      verdict: 'PARTIAL',
      pointsEarned: 7,
      pointsPossible: 14,
      rationale:
        'Corrected one charge but deferred the second to a billing ticket without a clear timeline.',
      evidenceQuote:
        "I've reversed the duplicate fee today. For the other charge I'll open a ticket — someone will follow up.",
      evidenceTimestamp: 248,
      coachingTip:
        'Commit to a concrete follow-up window (“within 24 hours by email”) and confirm the customer’s preferred contact method.',
    },
    {
      id: 'ownership',
      name: 'Ownership & next steps',
      weight: 8,
      checkType: 'BOTH',
      isGate: false,
      verdict: 'UNVERIFIED',
      pointsEarned: 0,
      pointsPossible: 8,
      rationale:
        'AI claimed the agent restated next steps, but the cited quote was not found word-for-word in the transcript.',
      evidenceQuote: null,
      evidenceTimestamp: null,
      coachingTip:
        'Close with a crisp recap: what you fixed now, what is pending, and when the customer should expect contact.',
    },
    {
      id: 'closing',
      name: 'Proper closing',
      weight: 6,
      checkType: 'RULE',
      isGate: false,
      verdict: 'PASS',
      pointsEarned: 6,
      pointsPossible: 6,
      rationale: 'Asked if anything else was needed and thanked the customer.',
      evidenceQuote:
        "Is there anything else I can help with today? Thanks for your patience, and have a good afternoon.",
      evidenceTimestamp: 292,
      coachingTip: null,
    },
  ],
  churn: {
    level: 'medium',
    quote:
      "If this keeps happening I'm honestly going to switch providers — I've been a customer for six years.",
    timestamp: 188,
  },
  feedback: {
    aboutAgent: [
      'Appreciated that Maya stayed calm and “didn’t talk down” during the dispute.',
      'Felt the hold came out of nowhere and wished for a heads-up.',
    ],
    aboutProduct: [
      'Confused by mid-cycle proration appearing as a separate charge.',
      'Worried duplicate fees will recur on the next bill.',
    ],
  },
  summary: {
    headline: 'Billing dispute partly resolved; follow-up ticket opened for remaining charge',
    narrative:
      'Customer called about two unexpected charges after a plan change. Agent authenticated the caller, explained proration clearly, reversed a duplicate fee, and opened a billing ticket for the second line item. Empathy and hold etiquette were uneven; churn signals were present.',
    actionItems: [
      'Complete billing ticket review within 24 hours and email the customer.',
      'Coach agent on hold announcements and ownership closings.',
      'Flag account for courtesy monitoring on next invoice cycle.',
    ],
  },
  audioUrl: null,
  transcript: [
    {
      id: 't1',
      speaker: 'agent',
      start: 0,
      end: 8,
      text: 'Thank you for calling Northline Support, this is Maya. How can I help you today?',
    },
    {
      id: 't2',
      speaker: 'customer',
      start: 9,
      end: 26,
      text: "Hi — I just got a bill with two charges I don't recognize. This is the third time something like this has happened.",
    },
    {
      id: 't3',
      speaker: 'agent',
      start: 27,
      end: 38,
      text: 'For your security, can I confirm your full name and the last four digits on the account?',
    },
    {
      id: 't4',
      speaker: 'customer',
      start: 39,
      end: 48,
      text: "Sure, Jordan Hale, and the last four are 6-1-4-2.",
    },
    {
      id: 't5',
      speaker: 'agent',
      start: 49,
      end: 61,
      text: "Thanks Jordan. I've pulled up your account. Tell me which charges look wrong.",
    },
    {
      id: 't6',
      speaker: 'customer',
      start: 62,
      end: 78,
      text: "There's a twenty-four dollar fee and another nineteen that looks duplicated. If this keeps happening I'm honestly going to switch providers — I've been a customer for six years.",
    },
    {
      id: 't7',
      speaker: 'agent',
      start: 79,
      end: 95,
      text: "I understand that's frustrating — let's look at what happened with that charge.",
    },
    {
      id: 't8',
      speaker: 'agent',
      start: 96,
      end: 112,
      text: "You're right to question it — I'll walk through each line with you.",
    },
    {
      id: 't9',
      speaker: 'agent',
      start: 113,
      end: 132,
      text: "That twenty-four dollars is the remaining days on your old plan, billed once when you switched mid-cycle.",
    },
    {
      id: 't10',
      speaker: 'customer',
      start: 133,
      end: 144,
      text: "Okay, that part makes sense. What about the nineteen?",
    },
    {
      id: 't11',
      speaker: 'agent',
      start: 145,
      end: 152,
      text: 'One moment.',
    },
    {
      id: 't12',
      speaker: 'agent',
      start: 168,
      end: 187,
      text: "I'm back. The nineteen looks like a duplicate adjustment from the plan change.",
    },
    {
      id: 't13',
      speaker: 'customer',
      start: 188,
      end: 205,
      text: "Yeah — please don't let that hit again. I don't want another surprise next month.",
    },
    {
      id: 't14',
      speaker: 'agent',
      start: 206,
      end: 230,
      text: "I've reversed the duplicate fee today. For the other charge I'll open a ticket — someone will follow up.",
    },
    {
      id: 't15',
      speaker: 'customer',
      start: 231,
      end: 247,
      text: "Alright. You stayed calm and didn't talk down to me, which I appreciate — just wish the hold had a warning.",
    },
    {
      id: 't16',
      speaker: 'agent',
      start: 248,
      end: 270,
      text: "Fair point. I'll note that on the ticket and watch the next invoice cycle for you.",
    },
    {
      id: 't17',
      speaker: 'agent',
      start: 271,
      end: 291,
      text: 'Is there anything else I can help with today? Thanks for your patience, and have a good afternoon.',
    },
    {
      id: 't18',
      speaker: 'customer',
      start: 292,
      end: 312,
      text: "That's all for now. Bye.",
    },
  ],
}
