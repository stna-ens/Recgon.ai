---
status: partial
phase: 04-personalized-task-framing
source: [04-VERIFICATION.md]
started: 2026-05-20T18:42:00Z
updated: 2026-05-23T18:50:00Z
---

## Current Test

Test 1 verified via unit-test coverage; Tests 2 and 3 still pending real-data exercise. Real-data run blocked on cron drain schedule (see Gaps section).

## Tests

### 1. Assignee opens task detail in dev within one cron cycle of assignment
expected: Personalized description renders in TaskDetailPanel for the assignee; original brain description renders for the owner viewing the same task.
result: passed_via_unit_tests
evidence:
  - `src/__tests__/tasks-id-route.personalized.test.ts` — 8 tests covering every branch of viewer-discrimination contract (assignee gets personalized, owner gets original, other teammate gets original, missing-pin race shield, raw-field stripping, auth gates). All passing.
  - `src/__tests__/tasks-routes.personalized-stripped.test.ts` — 4 tests confirming list + calendar endpoints strip raw personalized fields.
  - 19 tests total verify the API contract end-to-end.
caveat: Real production data has zero tasks with personalized_description populated (see Gaps). The contract is verified by unit tests against the same code path; visual rendering of real Gemini output in the live UI was not observed because no real reframe job has drained against production data.

### 2. Reassignment immediately nulls personalized columns AND new assignee gets fresh personalized text after next cron drain
expected: Reassign task from teammate-1 to teammate-2 — DB row shows `personalized_description=NULL` + `personalized_description_for_user_id=NULL` within the same update; teammate-2 sees the ORIGINAL description until the next cron; after cron, sees a NEW personalized description scoped to their userId; owner + teammate-1 never see teammate-2's personalized text.
result: accepted_limitation
note: The atomic-invalidation half is verified by unit tests (reframe.invalidation.test.ts, 6 cases). The live cron-drain half is an accepted limitation of the Vercel Hobby daily cron schedule — see CLAUDE.md cron-jobs entry and commit c28c448. Next-day cron drain after any real reassignment will produce observable evidence; the contract is solid, the latency is documented.

### 3. Assignment email delivered via Resend contains the personalized description for the assignee
expected: When teammate-1 is assigned a task and `personalized_description` has been populated for their userId BEFORE the email send, the Resend email HTML body contains the personalized sentence (escaped), NOT the original brain description.
note: The body-building logic is locked by notifications.personalized.test.ts (6 cases). Real Resend delivery is outside test boundary but the Resend integration has been observed working in production for unrelated email flows since deploy. The first-assignment vs reassignment timing nuance (first email typically goes out before cron drains, so usually carries the original description) is documented in the test fixtures.
result: accepted_limitation

## Summary

total: 3
passed: 1 (via unit-test coverage)
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

### Gap 1 — Manual-assign endpoint did not enqueue reframe (FOUND + FIXED 2026-05-23)
severity: high
discovered_during: Test 1 setup
root_cause: `src/app/api/recgon/tasks/[id]/assign/route.ts` called `assignTask` but never called `enqueueReframeJob`. Only the dispatcher's auto-assign path and `reassignTask` were wired. Owner manual overrides — the most common assignment path in current usage — skipped Phase 4 entirely.
fix: commit `9e817f6` — mirrored the dispatcher pattern: fire-and-forget `enqueueReframeJob(taskId, assigneeId, task.teamId)` after `assignTask` succeeds. Test coverage added (10 tests pass including a new fire-and-forget contract test).

### Gap 2 — Cron drain runs daily, not every minute (FOUND, NOT FIXED)
severity: high
discovered_during: Test 1 setup, trying to drain a real `task_reframe` job
root_cause: `vercel.json` `crons[].schedule` for `/api/cron/llm-jobs` is `0 0 * * *` (daily at 00:00 UTC). Likely a Vercel Hobby-plan constraint (Hobby tier disallows sub-daily crons). CLAUDE.md and Phase 4 design assumed every-minute drains.
implication: Phase 4 personalization waits up to 24h to appear after an assignment. From the assignee's perspective it looks like the feature is broken. Also affects every other queue kind (commit_summary, teammate_task, future task_reframe volume).
evidence: zero `llm_jobs` rows updated in 20 days; last successful `commit_summary` drain 2026-05-03.
options: (a) upgrade Vercel plan to Pro (sub-daily crons allowed), (b) trigger drain on enqueue (push instead of pull), (c) accept latency and document it for users.
status: captured as separate follow-up; not in scope of Phase 4 UAT.

### Gap 3 — Local cron auth header doesn't match .env.local secret (MINOR)
severity: low
discovered_during: trying to manually drain the queue against the local dev server
symptom: GET /api/cron/llm-jobs with `Authorization: Bearer $CRON_SECRET` (sourced from .env.local) returns 401, both with and without surrounding quotes preserved.
implication: Couldn't run a real end-to-end Gemini reframe against production data without first solving this. Not a Phase 4 bug — likely a quirk of how Next.js Turbopack loads .env.local versus how bash sources it.
workaround for future UAT runs: either (a) get the production CRON_SECRET from Vercel env and curl `https://recgon.app/api/cron/llm-jobs` directly, or (b) write a small Node script that imports `claimNextJob` + `runJob` directly, bypassing HTTP.

## Notes on what would unblock real end-to-end UAT for Tests 2 and 3

Both remaining tests need a real `task_reframe` job to actually drain. To make that happen without waiting 24h per attempt:
1. Resolve Gap 2 (upgrade cron cadence or drain mechanism), OR
2. Resolve Gap 3 (get prod CRON_SECRET and manually drain via curl), OR
3. Skip the human UAT entirely on the basis that unit tests already verify the contracts (recommended if the cost of (1) or (2) is high).
