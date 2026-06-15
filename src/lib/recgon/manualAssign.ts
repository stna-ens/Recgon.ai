// Shared manual-assign reasoning helper.
//
// When the owner assigns a task by hand, there is no Recgon math signal to
// justify the pick — the override deliberately bypasses the matcher. We still
// write an HONEST AssignmentReasoning envelope: a `math_only` kind with all
// zeros and a fixed sentence. Zero math is the truth for a manual override;
// pretending the math justified the pick would be a lie.
//
// This module is the single source of truth for both manual-assign call sites:
//   - POST /api/recgon/tasks/[id]/assign  (triage-override owner endpoint)
//   - POST /api/teams/[id]/tasks          (manual create with a chosen teammate)
// Keeping the constant + builder in one leaf module means the two routes can
// never drift apart.

import type { AssignmentReasoning } from '@/lib/recgon/types';

export const MANUAL_ASSIGN_SENTENCE = 'Owner manually assigned — no automatic fit found.';

export function buildManualAssignReasoning(): AssignmentReasoning {
  return {
    kind: 'math_only',
    mathScore: 0,
    mathBreakdown: {
      skillOverlap: 0,
      fitForKind: 0,
      availabilityNow: 0,
      loadHeadroom: 0,
      interestNudge: 0,
    },
    whyYouSentence: MANUAL_ASSIGN_SENTENCE,
  };
}
