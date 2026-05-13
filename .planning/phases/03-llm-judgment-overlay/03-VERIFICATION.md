---
phase: 03-llm-judgment-overlay
verified: 2026-05-14T02:07:00Z
status: human_needed
score: 11/12 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "Real-LLM bias baseline recorded in 03-04-SUMMARY"
    reason: "Real-LLM run timed out at 9/150 calls (Gemini Flash latency ~100s/call vs ~4s estimated). Formally deferred to a follow-up phase per the user-provided context note. The stubbed regression IS in CI and is GREEN; nightly workflow is scaffolded but cron disabled. Phase ships code-complete; baseline is a follow-up phase, not a Phase 3 blocker."
    accepted_by: "user (via verifier context note)"
    accepted_at: "2026-05-14T02:07:00Z"
human_verification:
  - test: "Plan 03-03 Task 5 manual UAT — assignee / owner / other-teammate privacy spot-check on the Why-you block in TaskDetailPanel and assignment email"
    expected: "Assignee sees Why-you in email + popup. Owner sees Why-you in popup for every assignee. Other teammates see the task but NO Why-you block."
    why_human: "Visual confirmation across three browser sessions (assignee / owner / non-assignee teammate) cannot be verified programmatically. Privacy filter passes its 5 server-side test scenarios; visual rendering across viewer roles needs eyes-on."
---

# Phase 3: LLM Judgment Overlay Verification Report

**Phase Goal:** LLM judgment overlay that breaks close-call ties in dispatcher with privacy-filtered "Why you?" reasoning persisted on each task assignment. Per-team daily LLM budget cap with fail-open semantics. Bias regression test scaffolded (real-LLM mode deferred). All assignments produce a Why-you sentence (math-only and llm-tiebreaker both).
**Verified:** 2026-05-14T02:07:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                  | Status     | Evidence                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Close-call gap < CLOSE_CALL_THRESHOLD (0.20) triggers judge; ≥ threshold uses math-only                | VERIFIED   | `judge.ts:55` exports `CLOSE_CALL_THRESHOLD = 0.20`; `dispatcher.ts:204,913` compute `isCloseCall`. Integration test `dispatcher.judge-integration.test.ts` (4/4 GREEN) proves it    |
| 2   | A single dispatch run makes AT MOST one batched judge call                                             | VERIFIED   | `applyJudgmentIfClose` in dispatcher.ts:282 — single `runJudgment(judgeInputs,...)` call at line 359 covers all close-call tasks. Integration test asserts exactly 1 chat invocation |
| 3   | LLM failure / malformed / out-of-range → silent math top-1 fallback                                    | VERIFIED   | `runJudgment` throws `JudgeError`; dispatcher try/catch at line 359; cap-exhausted variant in integration test passes (all 4 tasks fall back to math)                               |
| 4   | In-process cache prevents re-judging `(taskId, sorted candidateIds, mathScoresHash)` within one run    | VERIFIED   | `computeJudgeCacheKey` in judge.ts; `Map<string, JudgePick>` created per `runDispatch`; integration test asserts 2 cache entries after 4-task run                                  |
| 5   | Per-team daily call counter increments and silently blocks over cap                                    | VERIFIED   | `judgmentBudget.ts` exports `checkAndIncrement` (cap=50); 9/9 judgmentBudget tests GREEN; cap-exhausted integration scenario passes                                                  |
| 6   | Cap-hit dev-ops Resend email fires AT MOST ONCE per (team, date)                                       | VERIFIED   | `alertCapExceededOnce` uses `cap_alert_sent` flag (read-then-set, idempotent); test asserts 2nd call is no-op                                                                       |
| 7   | Judge prompt anonymizes candidates as `candidate_1/2/3`; no real names ever reach the LLM              | VERIFIED   | `prompts.ts:1040` instructs no names/pronouns; `judge.test.ts` anonymization snapshot (line 220-249) asserts ZERO real names from any of 5 fixtures appear in prompt body            |
| 8   | Every assignment writes `assignment_reasoning` JSONB (math_only OR llm_tiebreaker)                     | VERIFIED   | `storage.ts:560` writes Zod-validated reasoning into `assignment_reasoning` column; `dispatcher.ts` builds envelope in both paths                                                   |
| 9   | `renderWhyYou` is the SINGLE source of "Why you" copy; used by email + UI                              | VERIFIED   | `notifications.ts:10,72` imports `renderWhyYou` for email body; API route at `/api/recgon/tasks/[id]/route.ts:69` renders for client; `whyYou.ts` is pure data→string                |
| 10  | WhyYouBlock is rendered (not just declared) in TaskDetailPanel — CR-01 review blocker fix verified     | VERIFIED   | `TaskDetailPanel.tsx:40` declares; `TaskDetailPanel.tsx:278` renders `<WhyYouBlock sentence={task.whyYouSentence} />`. Confirmed in JSX body                                          |
| 11  | Privacy filter: assignee + owner see whyYouSentence; others get task without it; raw JSONB never exits | VERIFIED   | `route.ts:65-70` only includes `whyYouSentence` when authorized; raw `assignment_reasoning` detached before response. 5/5 privacy tests GREEN                                        |
| 12  | Bias regression CI test exists (5 fixtures × 30 trials) — stubbed mode green; real-LLM env-gated       | PARTIAL    | Stubbed mode 1/1 GREEN in `judge.bias-regression.test.ts` (150 trials, anonymization end-to-end + 15pp band + 50% noise floor). Real-LLM baseline DEFERRED (override applied)        |

**Score:** 11/12 truths VERIFIED + 1 PARTIAL (override-accepted for deferred real-LLM baseline)

### Required Artifacts

| Artifact                                                          | Expected                                                       | Status        | Details                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------- | ------------- | -------------------------------------------------------------------- |
| `src/lib/recgon/judge.ts`                                         | runJudgment, validateJudgePick, computeJudgeCacheKey, CLOSE_CALL_THRESHOLD | VERIFIED   | 446 lines, all exports present, anonymization snapshot test PASSES   |
| `src/lib/recgon/judgmentBudget.ts`                                | checkAndIncrement, alertCapExceededOnce, cap=50                | VERIFIED   | 273 lines; Resend wired; fail-open on DB errors                       |
| `src/lib/recgon/whyYou.ts`                                        | renderWhyYou (single source)                                   | VERIFIED   | 117 lines (≥ 60); 5 LLM templates + math-only fallback + HTML strip   |
| `src/lib/recgon/dispatcher.ts`                                    | 3-pass restructure, dispatchSingleTaskWithReasoning            | VERIFIED   | 33,608 bytes; rank-all → judge → assign; cache lifecycle per run     |
| `src/lib/recgon/storage.ts`                                       | assignTask writes validated reasoning JSONB                    | VERIFIED   | Lines 529-573 validate+write or null on parse fail                    |
| `src/app/api/recgon/tasks/[id]/route.ts`                          | Server-side privacy filter                                     | VERIFIED   | 3,052 bytes; strips raw JSONB; authorized-only whyYouSentence         |
| `src/components/v2/calendar/TaskDetailPanel.tsx`                  | WhyYouBlock RENDERED (not just declared)                       | VERIFIED   | Line 40 declares, line 278 renders — CR-01 blocker fix confirmed     |
| `supabase/migrations/20260514_team_llm_usage.sql`                 | team_llm_usage table                                           | VERIFIED   | File present; per 04-SUMMARY applied to live DB on 2026-05-14         |
| `supabase/migrations/20260514_assignment_reasoning.sql`           | ADD COLUMN assignment_reasoning JSONB                          | VERIFIED   | File present; per 04-SUMMARY applied to live DB on 2026-05-14         |
| `src/__tests__/fixtures/judge-bias/`                              | 5 byte-identical-except-name fixtures                          | VERIFIED   | All 5 fixtures committed (English-M / Turkish-F / Arabic-M / EA-F / Spanish-mixed) |
| `src/__tests__/judge.bias-regression.test.ts`                     | 150-trial regression, stubbed + real-LLM modes                 | VERIFIED   | 372 lines (≥ 120); stubbed mode 1/1 GREEN                            |
| `.github/workflows/judge-bias-nightly.yml`                        | Nightly workflow                                               | VERIFIED   | Exists; cron + workflow_dispatch + secrets refs                       |

### Key Link Verification

| From                                | To                                                | Via                                                          | Status     | Details                                                                  |
| ----------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------ |
| `judge.ts`                          | `prompts.ts`                                      | import JUDGE_ASSIGNMENT_BATCH_SYSTEM, buildJudgeBatchUserPrompt | WIRED      | Imports + invocation present                                              |
| `judge.ts`                          | `schemas.ts`                                      | JudgeResultSchema.parse                                       | WIRED      | Used in runJudgment validation path                                      |
| `dispatcher.ts`                     | `judge.ts`                                        | runJudgment, computeJudgeCacheKey, CLOSE_CALL_THRESHOLD       | WIRED      | All 3 imports + call sites verified                                       |
| `dispatcher.ts`                     | `judgmentBudget.ts`                               | checkAndIncrement, alertCapExceededOnce                       | WIRED      | Imported at line 30; called in applyJudgmentIfClose                       |
| `dispatcher.ts`                     | `storage.ts (assignTask)`                         | reasoning passed in dispatchSingleTaskWithReasoning           | WIRED      | Plan 03 wired the actual write per CR-01 spec; tests pass                 |
| `notifications.ts (email)`          | `whyYou.ts`                                       | renderWhyYou                                                  | WIRED      | `notifications.ts:10,72` — email body includes Why-you line                |
| `TaskDetailPanel.tsx`               | `task.whyYouSentence` prop                        | API route passes pre-rendered string                          | WIRED      | Line 278 renders `<WhyYouBlock sentence={task.whyYouSentence} />`         |
| `route.ts`                          | `whyYou.ts` + auth session                        | renderWhyYou + assignee/owner role check                      | WIRED      | Lines 21, 47, 65-70 — privacy filter applied; raw JSONB stripped         |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                          | Status      | Evidence                                                                                       |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| JUDGE-01    | Plan 02     | Close-call gap < threshold (0.20) → invoke judge                                                     | SATISFIED   | CLOSE_CALL_THRESHOLD=0.20 in judge.ts:55; isCloseCall logic in dispatcher.ts                  |
| JUDGE-02    | Plan 02     | Gap ≥ threshold → math wins, no LLM call                                                             | SATISFIED   | Pass 1 sets isCloseCall=false; Pass 2 skips non-close-calls; integration test proves zero LLM |
| JUDGE-03    | Plan 01     | Anonymized candidate_1/2/3 labels — no names/pronouns                                                | SATISFIED   | prompts.ts:1040 + anonymization snapshot test (0 names across 5 fixtures × 150 calls)         |
| JUDGE-04    | Plan 01     | Structured response schema (Zod)                                                                     | SATISFIED   | JudgeResultSchema in schemas.ts; literal `1\|2\|3` + reason_code enum + ≤25 words refine     |
| JUDGE-05    | Plans 01+02+04 | Math fallback on any LLM failure (malformed, schema, content-rejected, cap-exhausted)                | SATISFIED   | JudgeError single throw + dispatcher try/catch + 4 edge cases (Plan 04 Task 2)                |
| JUDGE-06    | Plan 02     | ONE batched LLM call per dispatch run                                                                | SATISFIED   | applyJudgmentIfClose single runJudgment(...) site; integration test asserts call count = 1   |
| JUDGE-07    | Plan 03     | assignment_reasoning JSONB on agent_tasks                                                            | SATISFIED   | Migration applied; assignTask Zod-validates + writes; column has partial index               |
| JUDGE-08    | Plan 03     | "Why you" line in email + UI (no black-box)                                                          | SATISFIED   | renderWhyYou in notifications.ts (email) + route.ts (API) + TaskDetailPanel.tsx (UI render)  |
| JUDGE-09    | Plans 01+02 | Cache key `(taskId, sorted candidateIds, mathScoresHash)`                                            | SATISFIED   | computeJudgeCacheKey exported + Map cache in runDispatch (lifecycle: per-run)                 |
| JUDGE-10    | Plan 02     | Per-team daily LLM budget cap                                                                        | SATISFIED   | judgmentBudget.ts cap=50 + team_llm_usage table + silent math fallback                        |
| QUAL-01     | Plans 01+04 | Bias regression CI test (5 fixtures × 30 trials)                                                     | SATISFIED   | judge.bias-regression.test.ts 150-trial stubbed mode 1/1 GREEN; real-LLM baseline deferred   |
| QUAL-03     | Plans 01+04 | Post-hoc chosen_id validation (must be in math-pre-filtered set)                                     | SATISFIED   | Zod literal + dispatcher-side `idx < ranked.length` check (defense-in-depth)                  |

**Coverage: 12/12 requirements SATISFIED (no orphaned, no blocked).**

### Anti-Patterns Found

None — REVIEW.md identified 3 CRITICAL + 9 WARNING findings, all fixed in 8 atomic commits per its `fixed_at: 2026-05-14T02:04:00Z` metadata. Re-grep confirmed:
- `WhyYouBlock` IS rendered (CR-01 fixed; line 278)
- `runJudgment` pickedIds uniqueness check works (CR-02 fixed per tests passing)
- Cap-email "at-most-one" semantics (CR-03 fixed via flag-flip ordering)

### Behavioral Spot-Checks

| Behavior                                                | Command                                              | Result                                                         | Status |
| ------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ------ |
| Full test suite (regression + new)                      | `npx vitest run`                                     | 253 passed, 6 skipped, 0 failed (37 test files)                | PASS   |
| TypeScript type check                                   | `npx tsc --noEmit`                                   | exit code 0                                                    | PASS   |
| Judge unit tests                                        | `npx vitest run src/__tests__/judge.test.ts`         | 17/17 GREEN (per Plan 04 SUMMARY)                              | PASS   |
| Judge bias regression (stubbed)                         | `npx vitest run src/__tests__/judge.bias-regression.test.ts` | 1/1 GREEN, ~50ms                                       | PASS   |
| Privacy filter tests                                    | `npx vitest run src/__tests__/assignmentReasoning.privacy.test.ts` | 5/5 GREEN                                       | PASS   |
| Dispatcher integration                                  | `npx vitest run src/__tests__/dispatcher.judge-integration.test.ts` | 4/4 GREEN                                       | PASS   |
| Judgment budget (cap)                                   | `npx vitest run src/__tests__/judgmentBudget.test.ts` | 9/9 GREEN                                                     | PASS   |
| whyYou renderer                                         | `npx vitest run src/__tests__/whyYou.test.ts`        | 11/11 GREEN                                                    | PASS   |

### Human Verification Required

#### 1. Plan 03-03 Task 5 — Visual UAT for Why-you across three viewer roles

**Test:** Run `npm run dev`. Sign in as a team owner with at least 2 teammates and one unassigned task. Trigger a dispatch run. Open the just-assigned task pop-up across three sessions: (a) assignee, (b) team owner, (c) non-assignee teammate.

**Expected:**
- (a) Assignee: sees `WHY YOU` block with natural-sounding sentence. Assignment email contains `**Why you:**` callout line.
- (b) Owner: sees the same `WHY YOU` block (owner can see everyone's reasoning).
- (c) Other teammate: sees the task popup, but NO `WHY YOU` block at all (privacy filter strips `whyYouSentence`).

**Why human:** Visual rendering, copy tone ("sounds like a manager, not the AI says"), and cross-session privacy require eyes-on confirmation in real browsers. The 5 server-side privacy tests prove the API enforces the rule; this UAT proves the rendered UI honors it.

### Gaps Summary

No blocking gaps. One must-have (real-LLM bias baseline) was attempted but timed out at 9/150 calls because Gemini Flash latency under the large judge prompt is ~100s/call, not the ~4s estimated. The stubbed regression IS shipped in CI and GREEN; the real-LLM mode scaffold exists but the nightly cron is disabled until a redesign (prompt batching, parallel trials, or reduced N) lands in a follow-up phase. Override accepted per the verifier context note.

All 3 CRITICAL findings from REVIEW.md are fixed and verified in code. All 12 requirements (JUDGE-01..10, QUAL-01, QUAL-03) are SATISFIED. All 5 ROADMAP Phase 3 success criteria are met by Plans 01-04 cumulatively.

Phase ships code-complete; only outstanding item is the human UAT for visual + privacy confirmation across viewer roles (Plan 03-03 Task 5).

---

_Verified: 2026-05-14T02:07:00Z_
_Verifier: Claude (gsd-verifier)_
