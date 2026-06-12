import type { AgentTask } from './types';

// CR-01 privacy boundary, applied at serialization time.
//
// `assignmentReasoning` (raw judge envelope, anonymous-candidate scores) and
// the Phase 4 `personalizedDescription*` columns must NEVER appear on a
// client response. The ONLY route allowed to derive viewer-facing fields
// from them is the viewer-discriminated /api/recgon/tasks/[id], which
// renders `whyYouSentence` / swaps the description server-side and still
// never serializes the raw fields.
//
// Every other route that returns task objects must pass them through here.
export type ClientSafeTask = Omit<
  AgentTask,
  'assignmentReasoning' | 'personalizedDescription' | 'personalizedDescriptionForUserId'
>;

export function sanitizeTaskForClient(task: AgentTask): ClientSafeTask {
  const {
    assignmentReasoning: _ar,
    personalizedDescription: _pd,
    personalizedDescriptionForUserId: _pdfu,
    ...rest
  } = task;
  void _ar;
  void _pd;
  void _pdfu;
  return rest;
}
