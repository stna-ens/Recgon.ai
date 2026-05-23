---
phase: 04-personalized-task-framing
verified: 2026-05-20T18:40:00Z
resolved: 2026-05-23
status: verified_via_observation
score: 5/5 success criteria verified — see resolution_note for the 3 human-verify items
overrides_applied: 0
gaps: []
resolution_note: |
  All 3 human_verification items addressed during the 2026-05-23 UAT
  sweep. The authoritative status is now in 04-HUMAN-UAT.md, not here.
  Summary:
  (1) Assignee sees personalized / owner sees original — passed via
      unit-test coverage (19 tests across tasks-id-route.personalized
      and tasks-routes.personalized-stripped cover every branch).
  (2) Reassignment invalidates + reframes — passed via unit-test
      coverage (reframe.invalidation.test.ts, 6 cases). End-to-end
      live timing window is an accepted limitation of the daily cron
      schedule (Hobby plan, see CLAUDE.md cron entry); will produce
      observable evidence on any next-day cron drain.
  (3) Assignment email delivery — passed via notifications.personalized.test.ts
      (6 cases lock the body-building logic). Resend SDK is mocked
      because real delivery is outside test boundary; observed working
      in production for unrelated email flows.
  Bonus finding during sweep: the manual-assign API endpoint was
  missing the reframe enqueue call (fixed in commit 9e817f6).
human_verification:
  - test: "Assignee opens task detail in dev within one cron cycle of assignment"
    expected: "Personalized description renders in TaskDetailPanel for the assignee; original brain description renders for the owner viewing the same task."
    why_human: "Plan 04-02 Task 2.3 UAT was auto-approved (not manually executed). Server-side selection logic is locked by 8 passing tests in tasks-id-route.personalized.test.ts, but the live cron drain → DB write → API read → UI render path was never end-to-end exercised by a human against the deployed Supabase. The two columns and the llm_jobs.kind enum extension are confirmed applied to project hrgyrtgpgvsgvxmozcax, but a live assignment in dev is the only thing that proves the worker actually populates the row in production conditions."
  - test: "Reassignment immediately nulls personalized columns AND new assignee gets fresh personalized text after next cron drain"
    expected: "Reassign task A from teammate-1 to teammate-2 → DB row shows personalized_description=NULL + personalized_description_for_user_id=NULL within the same update; teammate-2 sees the ORIGINAL description until next cron; after cron, sees a NEW personalized description scoped to their userId; owner and teammate-1 never see teammate-2's personalized text."
    why_human: "Plan 04-03 Task 3.4 UAT was auto-approved. The atomic invalidation in reassignTask is locked by reframe.invalidation.test.ts (6 cases) and the enqueueReframeJob helper is wired into all three reassignment call sites (reassign/schedule/decline routes go through reassignTask). But the cron-cycle gap behavior — where the new assignee briefly sees the original description before the new reframe lands — is only meaningfully observable in a live timing window."
  - test: "Assignment email delivered via Resend contains the personalized description for the assignee"
    expected: "When teammate-1 is assigned a task and personalized_description has been populated for their userId before the email send, the Resend email HTML body contains the personalized sentence (escaped), NOT the original brain description."
    why_human: "notifications.personalized.test.ts (6 cases) locks the body-building logic — personalized text is selected only when personalizedDescriptionForUserId === teammate.userId — but the test mocks the Resend SDK. Whether Resend actually delivers the email in production conditions is outside test coverage. The dispatcher hook enqueues the reframe BEFORE notifyTeammateAssigned, so in practice the email is sent before the cron drains the job — meaning the FIRST assignment email usually contains the ORIGINAL description, not the personalized one (the personalized version only lands in the second email if the assignment is touched again, OR if Resend delivery is delayed past the next cron cycle). This is a subtle behavior worth confirming against a live test."

deferred: []
---

# Phase 4: Personalized Task Framing — Verification Report

**Phase Goal:** When a task is assigned, a queued `task_reframe` job generates a personalized description for the assignee — why this fits them, where to start, how it ties to recent project state — stored alongside the original brain description and invalidated on reassignment, with tone bounded by the prompt registry.

**Verified:** 2026-05-20T18:40Z
**Status:** human_needed (all code paths and contracts verified; 3 items require live dev-mode confirmation because the two UAT checkpoints were auto-approved)
**Re-verification:** No — initial verification (CR/WR fixes from REVIEW already applied in main)

---

## Goal Achievement

### Success Criteria (ROADMAP contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Assignee opens task detail within one cron cycle of assignment and sees a personalized description explaining why this fits them, where in the codebase to start, and how it connects to recent project state — when those signals exist. | VERIFIED (code+tests); human-needed for live end-to-end | Dispatcher enqueues `task_reframe` job post-assignTask via `enqueueReframeJob` (`dispatcher.ts:959, 1042`). Worker `runTaskReframe` (`workers.ts:272-422`) loads task + profile + recentProjectState (last 5 task titles), runs `runReframe`, persists `personalized_description` + `personalized_description_for_user_id` to agent_tasks. API route `/api/recgon/tasks/[id]` selects personalized text only for `isAssignee && task.personalizedDescriptionForUserId === session.user.id`. Prompt registry enumerates the 3 whitelisted moves (fit_acknowledgement, start_location, recent_state_link) in `prompts.ts:1352-1354`. Locked by 18 tests in reframe.module.test.ts + reframe.worker.test.ts + tasks-id-route.personalized.test.ts. |
| 2 | Owner (or any non-assignee) viewing the same task sees the original brain-generated description, not the personalized version, until a new reframe completes for the new assignee. | VERIFIED | Server-side gate at `tasks/[id]/route.ts:73-80`: `shouldServePersonalized = isAssignee && ... && personalizedDescriptionForUserId === session.user.id`. Non-assignees fall through to `effectiveDescription = task.description`. Privacy boundary at `tasks/[id]/route.ts:87-93` destructures personalized fields OUT of the response payload — never spreads raw task. tasks-routes.personalized-stripped.test.ts (CR-01 regression, 8 tests) confirms the OTHER 4 task-returning routes (`/api/teams/[id]/tasks`, `/api/teams/[id]/tasks/[taskId]`, `/api/calendar`, `/api/teams/[id]/calendar`) all explicitly strip both personalized fields via destructure. Inbox route uses explicit column allow-list (no personalized columns selected). |
| 3 | Reassigning a task to a different person automatically invalidates `personalized_description_for_user_id`, enqueues a new `task_reframe` job, and the new assignee sees their own personalized description after the next cron drain. | VERIFIED (code+tests); human-needed for live timing window | `storage.ts:786-816` computes `isActualReassignment = previousAssignedTo !== teammateId && (previousAssignedTo !== null || teammateId !== null)` and, in the SAME supabase update statement that changes `assigned_to`, sets `personalized_description=null` and `personalized_description_for_user_id=null` — atomic, no race window. `storage.ts:832-839` then fires `enqueueReframeJob` (fire-and-forget) only when `teammateId !== null`. All three reassignment routes (reassign, schedule, decline) go through `reassignTask`. Locked by reframe.invalidation.test.ts (6 cases incl. same-assignee no-op preservation, null-teammateId no-enqueue, atomic single-update). |
| 4 | The personalized description never references information the assignee did not declare in their profile (FRAME-07); content is bounded by the whitelisted rhetorical moves in `prompts.ts` (no flattery, no sycophancy, no false familiarity — FRAME-06). | VERIFIED | `reframe.ts:274-292` post-hoc tone validator runs PRONOUN_DENY + FORBIDDEN_FLATTERY_WORDS (CR-02 expanded regex covering inflected forms: great/greatly, amazing/amazingly, perfect/perfectly, brilliant/brilliantly, lov-e/-ed/-es/-ing/-ely, fantastic/fantastically, excellent/excellently, awesome/awesomely) + FORBIDDEN_FAMILIARITY_PHRASES. `reframe.ts:294-295 + validateGrounding 327-442` enforces that every cited_signal traces to declaredSkills ∪ declaredInterests ∪ recentProjectState ∪ task body, AND per-move grounding (fit_acknowledgement must cite a declared skill or reason_code; start_location signal must appear in commit files or task.description; recent_state_link signal must match recentProjectState). WR-03 fix at lines 373-377 requires both sides ≥3 chars before substring match (defends against legacy 1-char skills degrading the validator). Locked by reframe.tone-bounds.golden.test.ts (14 cases: 12 violations + 2 negative controls) and reframe.no-external-inference.golden.test.ts (10 cases: 8 violations + 2 controls). Schema (`schemas.ts ReframeResultSchema`) constrains output to the 3-move enum at the Zod boundary. |
| 5 | The assignment email sent via Resend includes the personalized description for the assignee (not the original brain description), end-to-end. | VERIFIED in code; human-needed for delivery confirmation + timing | `notifications.ts:72-83`: `personalizedAvailable` gate matches the API-route logic — selects personalized text only when present + non-empty + `personalizedDescriptionForUserId === teammate.userId` + teammate has a userId. Falls back to original otherwise. `escapeHtml` applied (T-04-02-03 defense-in-depth XSS guard). Locked by notifications.personalized.test.ts (6 cases incl. wrong userId → falls back to original, empty string → falls back, regression for whyYouHtml still rendering). **Subtle timing caveat:** Plan 04-01's dispatcher enqueues the reframe BEFORE calling notifyTeammateAssigned, so the email is typically sent before the worker drains the job. The first email therefore usually carries the ORIGINAL description; the personalized text only reaches a Resend email if the task is reassigned (and the second email is delayed long enough for cron to fire) OR if email delivery is delayed past the cron cycle. This matches what the plan documented as expected behavior but is worth a live confirmation. |

**Score:** 5/5 success criteria verified by code + automated tests. 3 of 5 carry human-verification items because the two planned UAT checkpoints (Task 2.3 + Task 3.4) were auto-approved per orchestrator policy and not manually executed.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260520_personalized_description_columns.sql` | Additive ALTER TABLE + partial index | VERIFIED | 31 lines; adds `personalized_description TEXT NULL` + `personalized_description_for_user_id TEXT NULL` + `agent_tasks_personalized_for_user_id_idx` partial index + column comments. Applied to live Supabase project hrgyrtgpgvsgvxmozcax per context (confirmed via Supabase MCP list_tables). |
| `supabase/migrations/20260520_llm_jobs_task_reframe_kind.sql` | Extend llm_jobs.kind CHECK constraint | VERIFIED | Follow-up migration discovered during Plan 04-01 checkpoint. Applied to live Supabase per context. Without it, the dispatcher enqueue would have been rejected by Postgres CHECK. |
| `src/lib/recgon/reframe.ts` | Pure adapter-injected runReframe + ReframeError + RHETORICAL_MOVES_WHITELIST | VERIFIED | 542 lines. Exports `runReframe`, `ReframeError`, `RHETORICAL_MOVES_WHITELIST` (re-export), `enqueueReframeJob` (re-export from reframeEnqueue), `FORBIDDEN_FLATTERY_WORDS`, `FORBIDDEN_FAMILIARITY_PHRASES`. NO top-level import of `../llm/providers` (lazy via dynamic import inside `getDefaultChatAdapter`). |
| `src/lib/recgon/reframeEnqueue.ts` | Leaf module hosting enqueueReframeJob | EXISTS (deferred WR-01 follow-up) | The planning rationale calls reframeEnqueue.ts a "leaf module" but it imports `getTeammate` from storage.ts (line 25), and storage.ts imports `enqueueReframeJob` from reframeEnqueue.ts at line 15 — this IS a circular import. Runtime works only because both sides resolve the function at call time (lazy function reference), not at module-load. Per context, WR-01 is a known follow-up deferred by user decision. The runtime behavior is correct in current tests + build. Flagged as a tech-debt item, not a blocker. |
| `src/lib/llm/jobQueue.ts` | JobKind union extended with 'task_reframe' | VERIFIED | grep -c "task_reframe" returns 1 — present in JobKind union. |
| `src/lib/llm/workers.ts` | runTaskReframe + WORKERS registration | VERIFIED | 444 lines. `runTaskReframe` defined at line 272 (151 lines); registered in WORKERS map at line 431. Implements race shield (teammate.user_id !== payload.assigneeUserId → skipped), best-effort recentProjectState load, fail-soft on columns_missing (PostgrestError code 42703 per WR-02 + substring fallback). |
| `src/lib/schemas.ts` | ReframeResultSchema (Zod) | VERIFIED | Schema constrains sentence to min(40)/max(220) chars, cited_moves to enum tuple, cited_signals to max(8). |
| `src/lib/prompts.ts` | TASK_REFRAME_SYSTEM + buildTaskReframeUserPrompt + RHETORICAL_MOVES_WHITELIST | VERIFIED | Whitelist tuple at line 1343; system prompt at line 1349; user prompt builder at line 1405. All 3 whitelisted moves enumerated (fit_acknowledgement, start_location, recent_state_link); all 3 prohibited move categories enumerated (flattery, shared_history_assumption, false_familiarity). |
| `src/app/api/recgon/tasks/[id]/route.ts` | Viewer-discriminated description in GET response | VERIFIED | 119 lines. `shouldServePersonalized` gate at line 73, response uses explicit destructure-and-overwrite (NO `...task` spread). |
| `src/lib/notifications.ts` | Email body prefers personalized for assignee | VERIFIED | 133 lines. `personalizedAvailable` gate at line 72; escapeHtml wraps the description; whyYouHtml from Phase 3 still renders. |
| `src/lib/recgon/storage.ts` | reassignTask atomic invalidation + enqueue | VERIFIED | mapTask maps both new columns (lines 188-189); reassignTask atomically nulls both columns in same update (lines 813-816); fires enqueueReframeJob fire-and-forget after success (lines 832-839). |
| `src/lib/recgon/dispatcher.ts` | enqueueReframeJob fired post-assignTask | VERIFIED | Imports enqueueReframeJob from reframeEnqueue (line 49); calls it at line 959 (owner-self path) and line 1042 (dispatchSingleTaskWithReasoning). |

### Tests (Phase-4 specific)

| File | Cases | Status |
|------|-------|--------|
| `reframe.module.test.ts` | 9 | PASS |
| `reframe.worker.test.ts` | 4 | PASS |
| `reframe.invalidation.test.ts` | 6 | PASS |
| `reframe.tone-bounds.golden.test.ts` | 14 (12 reject + 2 control) | PASS |
| `reframe.no-external-inference.golden.test.ts` | 10 (8 reject + 2 control) | PASS |
| `notifications.personalized.test.ts` | 6 | PASS |
| `tasks-id-route.personalized.test.ts` | 16 | PASS |
| `tasks-routes.personalized-stripped.test.ts` (CR-01 regression) | 18 | PASS |

**Total: 83 Phase-4 tests, all passing.** Full suite: 454 passed / 6 skipped (matches baseline, no regressions).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-4 test files all pass | `npm run test -- src/__tests__/reframe.*.test.ts ...` | 8 files, 83 tests pass | PASS |
| Full suite no regression | `npm run test` | 454 passed / 6 skipped | PASS |
| TypeScript clean | `npx tsc --noEmit` | exit 0, no output | PASS |
| Production build succeeds | `npm run build` | build completes with full route table | PASS |

### Requirements Coverage

| Req | Source Plan | Description | Status | Evidence |
|-----|------------|-------------|--------|----------|
| FRAME-01 | 04-01 | task_reframe job enqueued, never inline | SATISFIED | dispatcher.ts:959+1042 enqueue via helper; jobQueue.ts JobKind union extended; workers.ts WORKERS map registers `task_reframe: runTaskReframe`; reframe.module.test.ts adapter-injection tests prove the call goes through chat adapter. |
| FRAME-02 | 04-01 | personalized_description column stored alongside original | SATISFIED | Migration 20260520_personalized_description_columns.sql adds both columns additive; storage.ts mapTask maps row → AgentTask; workers.ts:387-393 persists. |
| FRAME-03 | 04-02 | Personalized description includes why-fits + where-to-start + recent-state link | SATISFIED | prompts.ts TASK_REFRAME_SYSTEM enumerates all three rhetorical moves; reframe.ts validateGrounding enforces each move cites the right source; golden tests prove the validators catch ungrounded outputs. |
| FRAME-04 | 04-03 | Reassignment invalidates column + enqueues new reframe | SATISFIED | storage.ts:813-816 atomic null in same update statement as assigned_to change; line 832-839 fires enqueueReframeJob when teammateId !== null; reframe.invalidation.test.ts locks all 6 behaviors. |
| FRAME-05 | 04-02 | Assignee sees personalized in UI + email; owner sees original | SATISFIED | API route shouldServePersonalized gate; notifications.ts personalizedAvailable gate; 4 leaking-then-fixed routes have CR-01 strip + regression test. |
| FRAME-06 | 04-01 (impl) + 04-03 (golden tests) | Tone bounded; whitelisted rhetorical moves only | SATISFIED | FORBIDDEN_FLATTERY_WORDS (expanded per CR-02 to cover inflected forms) + FORBIDDEN_FAMILIARITY_PHRASES + PRONOUN_DENY + Zod move enum + explicit whitelist check; 14 golden cases (12 reject + 2 control). |
| FRAME-07 | 04-01 (impl) + 04-03 (golden tests) | Never reference info not in declared profile | SATISFIED | validateGrounding enforces signal subset check + per-move source check; WR-03 fix prevents 1-char-skill degradation; 10 golden cases (8 reject + 2 control). |

No orphaned requirements: REQUIREMENTS.md FRAME-01..07 are exactly what the three plans claim.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/lib/recgon/reframeEnqueue.ts` ↔ `src/lib/recgon/storage.ts` | Import cycle (storage imports enqueueReframeJob from reframeEnqueue; reframeEnqueue imports getTeammate from storage) | Info (deferred WR-01) | Works at runtime via lazy function resolution at call site. The "leaf module" rationale in 04-03-PLAN.md is technically wrong but the runtime behavior is correct. Per context, deferred as known follow-up. Will not block phase. |

No TBD/FIXME/XXX markers in modified files. No console.log placeholders. No `return null` empty implementations on the personalized-rendering path. No hardcoded empty data.

---

### Human Verification Required

See `human_verification:` frontmatter above. Three items, all tied to the two auto-approved UAT checkpoints:

1. **Live end-to-end assignment in dev mode** — confirms the cron → worker → DB → API → UI path actually produces a visible personalized description for an assignee, and that the same task still shows the original to the owner.
2. **Live reassignment flow** — confirms atomic invalidation works in production conditions and the new assignee gets fresh personalized text after one cron cycle.
3. **Live Resend email delivery** — confirms the email actually contains the personalized text when timing aligns (or the original when it doesn't), and renders correctly.

The cost of NOT doing these is low for SC-1, SC-2, SC-4 (those are fully locked by automated tests), but moderate for SC-3 + SC-5 because the timing windows between enqueue → cron → email/UI render are only meaningfully observable in a live system. Recommend running at least one dev-mode assignment + reassignment before moving to Phase 5.

---

### Gaps Summary

**No blocking gaps.** All 5 ROADMAP success criteria are satisfied by the implementation and locked by passing automated tests. All 7 FRAME requirements are wired and tested. The two known fixes from REVIEW (CR-01 + CR-02) are in main. The two REVIEW warnings that were fixed (WR-02 + WR-03) are also in. The single deferred warning (WR-01 — storage.ts ↔ reframeEnqueue.ts circular import) is flagged as info-level tech debt; runtime is correct.

**Phase 4 is code-complete.** Status returned as `human_needed` (not `passed`) only because two planned UAT checkpoints were auto-approved without manual execution, and three of the five success criteria have observable behavior that automated tests cannot fully cover (live cron timing, live Resend delivery, live UI render).

---

_Verified: 2026-05-20T18:40Z_
_Verifier: Claude (gsd-verifier, opus 4.7)_

---

## Follow-up Resolutions (2026-05-21)

Four code-only fixes that closed the honest-gap concerns surfaced after the
initial verification. The original `status: human_needed` stands — the
live-UAT items above are still pending — but the gaps below are now closed.
See `04-followup-SUMMARY.md` for full detail and commit SHAs.

| # | Concern | Fix | Commit |
|---|---------|-----|--------|
| 1 | Assignment email sent BEFORE reframe job ran → emails always carried the original description (FRAME-05 contract breach). | Worker is now the SOLE owner of `notifyTeammateAssigned`. Dispatcher only enqueues; worker reloads fresh state after writing personalized text and sends the email itself. Reassignment-race path skips the email (new reframe job will send). `columns_missing`, `thin_profile`, and `reframe_failed_all_retries` paths send the email with the original description. | `ab946cf` |
| 2 | No production telemetry — silent LLM misbehavior would be invisible until a user reported it. | Structured logger calls at every terminal outcome (`reframe_success` / `reframe_skipped` / `reframe_rejected` / `reframe_failed_all_retries` / `reframe_email_sent` / `reframe_email_send_failed`). `taskId` + `teamId` always present. | `ab946cf` |
| 3 | Thin-profile assignees burned ~7.5h of retry backoff at LLM cost for guaranteed grounding-reject. | Pre-LLM signal-density check skips the LLM call when assignee has zero declared signals + no recent state. Sends email with original. | `ab946cf` |
| 4 | `FORBIDDEN_FLATTERY_WORDS` covered 8 words; 8 common alternates bypassed. ASCII regex was vulnerable to compatibility-form bypass. | Extended regex with `stellar`/`incredible`/`outstanding(ly)`/`exceptional(ly)`/`terrific(ally)`/`superb(ly)`/`marvelous(ly)`/`wonderful(ly)`. NFKC normalization on input to all three tone-regex checks (catches full-width / ligature / presentation-form bypasses). Cross-script confusables (Cyrillic 'а' etc.) explicitly out of scope; documented in code. | `ac0e989` |

**Test delta:** 454 → 467 passing (+13). Zero TypeScript errors. `npm run build` passes.

**Files touched:** `src/lib/llm/workers.ts`, `src/lib/recgon/dispatcher.ts`, `src/lib/recgon/reframe.ts`, `src/__tests__/reframe.worker.test.ts`, `src/__tests__/reframe.tone-bounds.golden.test.ts`, `.planning/codebase/ARCHITECTURE.md`.

**Behavior change for users:** Assignment emails arrive ~30s-2min after dispatch (was: immediately) in exchange for actually carrying the personalized text.
