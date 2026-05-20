---
phase: 04-personalized-task-framing
plan: 02
subsystem: ai-pm
tags: [api-route, viewer-discrimination, email, escapeHtml, privacy, frame-03, frame-05]

requires:
  - phase: 04-personalized-task-framing / plan 01
    provides: agent_tasks.personalized_description + personalized_description_for_user_id columns (live), AgentTask.personalizedDescription + AgentTask.personalizedDescriptionForUserId fields on the type, task_reframe worker writing both atomically
provides:
  - Viewer-discriminated `description` field on `GET /api/recgon/tasks/[id]` (assignee sees personalized; owner + other teammates + cross-user-id mismatches see ORIGINAL)
  - Resend assignment email body uses personalized when bound to assignee, with `escapeHtml` defense-in-depth on the description interpolation site
  - mapTask boundary now mirrors both new columns from the row → AgentTask
affects: [04-03-reassignment-invalidation]

tech-stack:
  added: []
  patterns:
    - "API-side viewer discrimination via `shouldServePersonalized` gate (3-predicate: isAssignee + non-empty personalizedDescription + userId match)"
    - "Privacy boundary via explicit destructure+overwrite (NEVER spread the task into responsePayload) — raw personalized columns stripped on the way out"
    - "Read-boundary race shield: even if the column has data, refuse to serve when `personalized_description_for_user_id !== session.user.id` (FRAME-04 safety net pre-Plan-04-03 sweep)"
    - "Email-body escapeHtml on the description interpolation site (T-04-02-03 defense in depth; previously only the whyYouSentence was escaped)"

key-files:
  created:
    - src/__tests__/tasks-id-route.personalized.test.ts
    - src/__tests__/notifications.personalized.test.ts
  modified:
    - src/lib/recgon/storage.ts
    - src/app/api/recgon/tasks/[id]/route.ts
    - src/lib/notifications.ts
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/codebase/ARCHITECTURE.md

key-decisions:
  - "Server-side viewer discrimination is the single source of truth — TaskDetailPanel.tsx reads `task.description` directly with no client-side branching. The client CANNOT inspect which version it got (T-04-02-01 mitigation)."
  - "Destructure+overwrite, NEVER spread: explicitly pull `personalizedDescription`, `personalizedDescriptionForUserId`, `description`, and `assignmentReasoning` out of the task before building the response payload. This is the hard privacy gate; the regression tests assert NO key under any casing appears on the response."
  - "Read-boundary race shield is in addition to Plan 04-03's proactive invalidation: even after Plan 04-03 ships, the boundary check stays — defense in depth against any future bug that leaves a stale userId in the column."
  - "Email escapeHtml on the description interpolation site is a defense-in-depth tightening that lands with the personalized change (not a separate refactor). The body has interpolated `taskDescription` unescaped since Phase 3 / Plan 03; this closes a latent XSS-via-LLM-emitted-content vector now that LLMs are writing the description (T-04-02-03)."
  - "TaskDetailPanel needed NO code change — pre-existing grep count for `personalized` was zero. The component already reads `task.description` directly; the new API behaviour is transparent to the consumer."

patterns-established:
  - "Snake-to-camel boundary stays at `mapTask` only. When a Phase N migration adds a column, the row type + `mapTask` are the SOLE conversion site; everything downstream uses camelCase."
  - "Privacy regression tests check key presence under MULTIPLE casings (`personalizedDescription` AND `personalized_description` AND `*_for_user_id` variants) — defends against future regressions where someone spreads a snake_case row directly into a response."
  - "Resend mock pattern for vitest: use a `class` for the `Resend` mock (not `vi.fn().mockImplementation`) so `vi.resetAllMocks()` in `beforeEach` doesn't wipe the constructor wiring."

requirements-completed: [FRAME-03, FRAME-05]

duration: ~25min
completed: 2026-05-20
---

# Phase 4 Plan 02: Viewer-Discriminated Personalized Description

**Wires the read path end-to-end. Plan 01's worker writes the column; this plan makes the assignee's experience materially different from the owner's — the personalized text reaches the assignee (panel + email), the original reaches everyone else. Raw personalized fields NEVER cross the API boundary.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-20T17:25:11Z (first test run for Task 2.1)
- **Completed:** 2026-05-20T17:30:00Z (final docs commit timestamp)
- **Tasks:** 3 of 3 (Task 2.3 manual UAT auto-approved per orchestrator auto-mode)
- **Files modified:** 7 (2 created, 5 modified — plus 3 planning/docs files)

## Accomplishments

- API GET route at `/api/recgon/tasks/[id]` now serves a viewer-discriminated `description`. The assignee whose userId matches `personalized_description_for_user_id` sees the personalized text; every other viewer (owner, other teammate, anonymous-via-direct-link, assignee-during-cron-cycle-gap) sees the original brain-generated description.
- The Resend assignment email applies the same gate, with `escapeHtml` defense-in-depth on the description interpolation site.
- TaskDetailPanel.tsx required NO change — it already reads `task.description` directly. Confirmed via `grep -c personalized` = 0. The API is the single source of truth.
- 14 new tests (8 route + 6 notifications), 402 passed / 6 skipped (was 388/6 pre-Plan-04-02). tsc clean. build clean.
- FRAME-03 + FRAME-05 closed.

## Task Commits

1. **Task 2.1 — Viewer-discriminated description in tasks GET API + privacy regression tests** — `1369dc3` (feat)
   - `src/lib/recgon/storage.ts`: Extended `TaskRow` with `personalized_description` + `personalized_description_for_user_id` (additive, both optional/nullable). Extended `mapTask` to mirror both columns onto `AgentTask.personalizedDescription` + `AgentTask.personalizedDescriptionForUserId`. The mapper is the SOLE snake_case → camelCase boundary; everything downstream uses camelCase.
   - `src/app/api/recgon/tasks/[id]/route.ts`: Added `shouldServePersonalized` gate that requires ALL THREE predicates simultaneously — `isAssignee` (mapped via `getTeammate.userId === session.user.id`), `personalizedDescription` is a non-empty string, and `personalizedDescriptionForUserId === session.user.id`. The third predicate is the FRAME-04 read-boundary race shield: even when the column has data, refuse to serve text written for a different user. `effectiveDescription` selects personalized vs original. The response payload is built by explicitly destructuring `assignmentReasoning`, `personalizedDescription`, `personalizedDescriptionForUserId`, AND `description` out of the task FIRST, then spreading the remaining fields + overwriting `description` with `effectiveDescription`. The pattern matches Phase 3 / Plan 03's existing `assignmentReasoning` strip — privacy boundary via destructure, not via spread.
   - `src/__tests__/tasks-id-route.personalized.test.ts`: 8 scenarios — assignee sees personalized, owner sees ORIGINAL, other teammate sees ORIGINAL, null personalized falls back to ORIGINAL, mismatched userId falls back to ORIGINAL (race shield), response carries exactly ONE description field with no personalized keys under any casing (multi-role iteration), 401 on no session, 403 on non-team-member.

2. **Task 2.2 — Assignment email uses personalized + TaskDetailPanel verified clean** — `43fc7c2` (feat)
   - `src/lib/notifications.ts`: Replaced the old `taskDescription = input.task.description?.slice(0, 280) || ''` with assignee-aware selection. `personalizedAvailable` requires `personalizedDescription` string + non-empty + `personalizedDescriptionForUserId === teammate.userId` + `teammate.userId !== null`. `rawDescription` selects, then `escapeHtml(rawDescription?.slice(0, 280) || '')` produces the final body text — this is the defense-in-depth tightening. The userId-match check uses `teammate.userId` (NOT `task.assignedTo`, which is a teammateId).
   - TaskDetailPanel.tsx: Pre-existing `grep -c personalized` returned 0 — the component already read `task.description` directly. No code change needed.
   - `src/__tests__/notifications.personalized.test.ts`: 6 scenarios — personalized bound to assignee → email contains personalized text, null → falls back to ORIGINAL, empty → falls back to ORIGINAL, mismatched userId → falls back to ORIGINAL (race shield), `<script>` becomes `&lt;script&gt;` in body, whyYouHtml block still renders alongside personalized line (Plan 3-03 regression check). Resend mocked via `class` (not `vi.fn().mockImplementation`) so `vi.resetAllMocks` doesn't wipe constructor wiring.

3. **Task 2.3 — Manual UAT** — AUTO-APPROVED (no commit)
   - The orchestrator running in auto-mode (chain flag) auto-approves this checkpoint per its instructions: "treat the resume-signal as already received with the value 'approved (auto-mode: orchestrator skipped manual dev-mode UAT — relying on the automated tests 2.1 + 2.2 + the privacy regression suite + the full vitest run as the verification surface)'."
   - See **Manual UAT** section below for which automated tests substitute for the manual checks.

## Manual UAT (Task 2.3) — Auto-Approved

The Task 2.3 checkpoint specifies a 7-step manual verification using two browser sessions (owner + assignee) plus a Resend inbox check plus a Network-tab inspection. Auto-mode skipped this manual UAT. The substitution surface — what makes auto-approval safe:

| Manual Check | Automated Substitute |
|---|---|
| Owner sees ORIGINAL in panel | `tasks-id-route.personalized.test.ts` scenario 2 (owner fetch → `body.task.description === ORIGINAL_DESCRIPTION`) |
| Assignee sees PERSONALIZED in panel | `tasks-id-route.personalized.test.ts` scenario 1 (assignee fetch → `body.task.description === PERSONALIZED_DESCRIPTION`) |
| Email to assignee contains personalized | `notifications.personalized.test.ts` scenario 1 (Resend `send` mock asserts `htmlArg.toContain(personalized text)`) |
| Email falls back to ORIGINAL when worker hasn't run | `notifications.personalized.test.ts` scenario 2 (null personalized) + scenario 3 (empty personalized) |
| Email falls back to ORIGINAL on stale userId mismatch | `notifications.personalized.test.ts` scenario 4 (race shield) |
| API response carries exactly ONE description field — no `personalizedDescription` leak | `tasks-id-route.personalized.test.ts` scenario 6 — iterates across all three viewer roles, asserts `expectNoPersonalizedKeys(body)` for each AND `JSON.stringify(body)` does not contain `personalized_description` snake_case anywhere |
| API response differs between owner + assignee for same task | scenarios 1 + 2 use the same fixture with only `session.user.id` and `verifyTeamAccess` varying — different output paths exercised |
| `<script>` defense in email body | `notifications.personalized.test.ts` scenario 5 — asserts `html` contains `&lt;script&gt;` and `&lt;/script&gt;` AND does NOT contain `<script>` / `</script>` raw |
| whyYouHtml regression (Plan 3-03 still renders) | `notifications.personalized.test.ts` scenario 6 |

Plus the full suite (402/6 passing) catches downstream consumers if any. The Plan 04-03 verification gate (next plan) will catch any residual gaps the automated tests miss. If a real-world UAT divergence is discovered later, treat it as a deviation against this SUMMARY.

## Privacy boundary architecture

The hard rule from the plan: **`personalized_description` and `personalized_description_for_user_id` MUST NEVER appear in the response JSON under any key.**

How this is enforced (mirrors Phase 3 / Plan 03's `assignmentReasoning` strip):

```typescript
// route.ts — viewer-discriminated description selection
const shouldServePersonalized =
  isAssignee &&
  typeof task.personalizedDescription === 'string' &&
  task.personalizedDescription.length > 0 &&
  task.personalizedDescriptionForUserId === session.user.id;
const effectiveDescription = shouldServePersonalized
  ? task.personalizedDescription
  : task.description;

// Explicit destructure + overwrite (NOT spread):
const {
  assignmentReasoning,
  personalizedDescription: _pd,
  personalizedDescriptionForUserId: _pdfu,
  description: _origDesc,
  ...restWithoutDescription
} = task;
const responsePayload: Record<string, unknown> = {
  ...restWithoutDescription,
  description: effectiveDescription,
};
```

The regression test scenario 6 catches the failure mode by asserting `Object.keys(body.task)` contains none of `[personalizedDescription, personalized_description, personalizedDescriptionForUserId, personalized_description_for_user_id]` AND `JSON.stringify(body)` does not contain `personalized_description` or `personalized_description_for_user_id` anywhere — defense against a future regression where someone spreads a raw snake_case DB row.

## Decisions Made

- **Read-boundary race shield is permanent, not Plan 04-03's job alone.** Plan 04-03 will null the column on reassignment (proactive invalidation). The read-boundary userId check at `/api/recgon/tasks/[id]` AND in `notifications.ts` stays even after Plan 04-03 ships — it is defense in depth against any future bug that leaves a stale userId in the column.
- **Destructure+overwrite, never spread.** The plan explicitly forbade spreading the raw task into the response and the regression test enforces it. This is the same pattern Phase 3 / Plan 03 introduced for `assignmentReasoning`; we extended it to four fields total.
- **escapeHtml on the description is defense-in-depth.** The email body has interpolated `taskDescription` unescaped since Phase 3 / Plan 03 (the schema-validated description was treated as safe). Now that LLMs write the description, the validation surface has shifted — escape regardless. Trade-off: existing markdown stars in descriptions (if any) will render as literal `**`. Accepted — no production task descriptions use markdown formatting; the trade is worth the XSS defense (T-04-02-03).
- **TaskDetailPanel needed no change.** Pre-existing `grep -c personalized` = 0. The component already read `task.description` directly. No client refactor; the API change is transparent to the consumer.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — this plan tightened existing surfaces (privacy boundary, XSS defense) without introducing new auth paths, endpoints, file access, or trust boundaries.

## Self-Check

| Acceptance Criterion | Status |
|----------------------|--------|
| Task 2.1 AC1: `grep -c "personalizedDescription\|personalized_description" src/lib/recgon/storage.ts` ≥ 2 | PASS (returned 5) |
| Task 2.1 AC2: `grep -c "shouldServePersonalized\|effectiveDescription" route.ts` ≥ 2 | PASS (returned 3) |
| Task 2.1 AC3: `grep -c "\.\.\.task\b" route.ts` = 0 | PASS (returned 0) |
| Task 2.1 AC4: `tasks-id-route.personalized.test.ts` 8/8 passing | PASS |
| Task 2.1 AC5: full suite ≥ baseline + 8 | PASS (388 → 396) |
| Task 2.1 AC6: `tsc --noEmit` zero errors | PASS |
| Task 2.1 AC7: privacy grep on responsePayload region returns 0 personalized matches | PASS (returned 0) |
| Task 2.2 AC1: `grep -c "personalizedAvailable\|personalizedDescriptionForUserId" notifications.ts` ≥ 2 | PASS (returned 3) |
| Task 2.2 AC2: `grep -c escapeHtml notifications.ts` ≥ 2 | PASS (returned 3) |
| Task 2.2 AC3: `notifications.personalized.test.ts` 6/6 passing | PASS |
| Task 2.2 AC4: full suite ≥ previous + 6 | PASS (396 → 402) |
| Task 2.2 AC5: `grep -c personalized TaskDetailPanel.tsx` = 0 | PASS (returned 0) |
| Task 2.2 AC6: `tsc --noEmit` zero errors | PASS |
| Task 2.2 AC7: `npm run build` succeeds | PASS |
| FRAME-03 (personalized content visible to assignee) | PASS — assignee sees personalized in panel + email |
| FRAME-05 (email + UI integration) | PASS — both surfaces respect the gate |
| Commit hashes verified in git log: 1369dc3, 43fc7c2 | PASS |

**Self-Check: PASSED**

## Files Created / Modified

**Created:**
- `src/__tests__/tasks-id-route.personalized.test.ts` — 8 privacy-regression scenarios on the GET route
- `src/__tests__/notifications.personalized.test.ts` — 6 scenarios on the Resend assignment email body

**Modified:**
- `src/lib/recgon/storage.ts` — `TaskRow` extended with two new column fields; `mapTask` mirrors both to camelCase on `AgentTask`
- `src/app/api/recgon/tasks/[id]/route.ts` — viewer-discrimination gate + destructure+overwrite privacy boundary
- `src/lib/notifications.ts` — assignee-aware description selection + `escapeHtml` defense-in-depth on body
- `.planning/STATE.md` — Plan counter advanced 1 → 2; Plan 04-02 decision logged
- `.planning/ROADMAP.md` — Plan 04-02 marked complete
- `.planning/REQUIREMENTS.md` — FRAME-03 + FRAME-05 checked off; traceability table updated
- `.planning/codebase/ARCHITECTURE.md` — added Phase 4 / Plan 02 paragraph under dispatcher overlay

## Issues Encountered

- Initial `notifications.personalized.test.ts` used `Resend: vi.fn().mockImplementation(...)` — but `vi.resetAllMocks()` in `beforeEach` wiped the constructor wiring along with the spy state, so all 6 tests failed with `mockSend` called 0 times. Fix: switched the Resend mock to a `class` returning `{ emails: { send: (...args) => mockSend(...args) } }` — constructor wiring is now stable across `resetAllMocks` and only the inner `mockSend.mockResolvedValue()` rebinds per-test. Pattern documented in `patterns-established`.
- A test-only tsc error appeared on `renderWhyYou: (...args: unknown[]) => mockRenderWhyYou(...args)` (TS2556 spread argument type mismatch against a zero-arg function). Simplified to `renderWhyYou: () => mockRenderWhyYou()` — the test doesn't care about the call args, just the return value.
- `.next/types/validator.ts` had stale auto-generated references to Phase 3.5 routes (`owner/board`, `owner/dock/dismiss`, `owner/dock`) from 2026-05-16 that were rolled back same-day. tsc failed against the stale artifact, not against our code. Deleted `.next/` — clean.

## User Setup Required

None for Plan 04-02. The migration columns from Plan 04-01 are already live (operator confirmed via Supabase MCP `apply_migration` + `list_tables` at the Plan 04-01 checkpoint). This plan only changes server-side code that reads the existing columns.

Carry-over from prior sessions still pending (unchanged from Plan 04-01 SUMMARY):
1. Apply `supabase/migrations/20260518_drop_owner_dock_dismissals.sql` (Phase 3.5 reversal — owner_dock_dismissals table exists but no code references it)
2. Real-LLM bias regression baseline (`JUDGE_BIAS_REAL_LLM=1`) — Phase 3 carry-over
3. Apply `supabase/migrations/20260516_triage_note_column.sql` if not already applied — Phase 3 / Plan 06
4. Apply Phase 3.6 migration (`overdue_tier`, `last_overdue_action_at`, `overdue_pressure_enabled` columns) if not already applied
5. Unrelated stash `@{0}` (`phase-3-profile-refactor-wip`) is still in place

## Next Phase Readiness

Plan 04-03 (reassignment invalidation + golden tests) can start immediately. Its inputs:
- The viewer-discrimination gate at `/api/recgon/tasks/[id]` AND in `notifications.ts` is in place — Plan 04-03's atomic null-the-columns-on-reassign is the proactive cleanup, but the read-boundary safety net is already live (defense in depth from day one).
- Plan 04-03's golden-fixtures suite (12 FRAME-06 tone + 8 FRAME-07 grounding) tests the `runReframe` module from Plan 04-01 — no dependency on Plan 04-02's API/email changes.
- `enqueueReframeJob` is currently a private helper in `dispatcher.ts`; Plan 04-03 will lift it to `reframe.ts` so `reassignTask` can call it without an import cycle. Plan 04-02 did not touch dispatcher state — clean handoff.

No blockers for Wave 3.

---
*Phase: 04-personalized-task-framing*
*Completed: 2026-05-20*
