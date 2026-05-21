---
phase: 04
plan: followup
date: 2026-05-21
type: honest-gap-fixes
commits:
  - ab946cf  # worker owns assignment email + telemetry + thin-profile guard (Fixes 1+2+3)
  - ac0e989  # extend FORBIDDEN_FLATTERY_WORDS + NFKC normalize tone-validator input (Fix 4)
test_count_before: 454
test_count_after: 467
test_delta: +13
related:
  - 04-VERIFICATION.md
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
---

# Phase 4 Follow-up: Honest-Gap Fixes

Four follow-up fixes that surfaced in the post-Phase-4 honest review of the
personalized-task-framing implementation. All four landed cleanly on `main`
across **two commits** (Fixes 1+2+3 are tightly coupled in
`runTaskReframe` and shipped together; Fix 4 lives in `reframe.ts` and
shipped separately).

## Behavior change for users

**Before:** Assignment emails arrived within milliseconds of dispatch but
almost always carried the *original* task description — the reframe job ran
30s-2min later in the cron drain.

**After:** Assignment emails arrive 30s-2min after dispatch, but they
actually carry the personalized text (or the original, if reframe skipped
fail-soft).

This is the FRAME-05 contract the plans promised but did not honor.

## The four fixes

### Fix 1 (commit `ab946cf`): Worker owns the assignment email (FRAME-05)

Moved `notifyTeammateAssigned` from `dispatcher.ts` to
`runTaskReframe` in `src/lib/llm/workers.ts`. Dispatcher's job is now:
`assignTask → enqueueReframeJob → DONE`. The worker reloads fresh task
state (incl. the personalized text it just wrote) and sends the email
itself.

Decision matrix for the worker's email behavior:

| Terminal state                  | Email sent? | Description used                |
| ------------------------------- | ----------- | ------------------------------- |
| Success                         | YES         | personalized (just written)     |
| Skipped: `columns_missing`      | YES         | original (fail-soft)            |
| Skipped: `thin_profile`         | YES         | original (Fix 3)                |
| Skipped: `reassigned`           | NO          | (new reframe job will send)     |
| `reframe_failed_all_retries`    | YES         | original (final-attempt catch)  |
| Mid-retry failure               | NO          | (next attempt may succeed)      |

Email-send failures are caught + logged inside `sendAssignmentEmail` — they
must not bubble up and re-enter the retry loop (we don't want the LLM call
repeated because Resend was temporarily down).

Removed `notifyTeammateAssigned` call sites in dispatcher (both owner-fallback
and best-fit paths). Removed now-unused `getTeammate` import, `getTeamName`
helper, `withPlan` helper. No other routes called `notifyTeammateAssigned`
directly (verified by `grep -rln`); `reassignTask` already invalidates +
re-enqueues the reframe job, so its email now flows through the worker too.

### Fix 2 (commit `ab946cf`): Reframe production telemetry

Structured logger calls at every terminal outcome in `runTaskReframe`:

- `reframe_success` (INFO) — `{ taskId, teamId, assigneeUserId, sentenceLength, citedMoves }`
- `reframe_skipped` (WARN) — `{ taskId, teamId, reason }` where `reason` ∈
  `{ columns_missing, reassigned, thin_profile }`
- `reframe_rejected` (WARN) — `{ taskId, teamId, kind, attempt }` (mid-retry only)
- `reframe_failed_all_retries` (ERROR) — `{ taskId, teamId, attempts, kind }`
- `reframe_email_sent` (INFO) — `{ taskId, teamId, reason, teammateId }`
- `reframe_email_send_failed` (WARN) — `{ taskId, teamId, reason, err }`

`taskId` and `teamId` are always present so production filters stay simple.
Telemetry lives only in the worker — dispatcher and reframe module remain
quiet.

### Fix 3 (commit `ab946cf`): Skip reframe for thin profiles

Pre-LLM signal-density check in `runTaskReframe`. If
`declaredSkills.length + declaredInterests.length +
recentProjectState.recentTaskTitles.length + recentCommitFiles.length +
(recentAnalyticsChange ? 1 : 0) === 0`, skip the LLM call, send the
assignment email with the original description, and return `{ skipped:
true, reason: 'thin_profile' }`.

Without this, the worker spent money calling the LLM, hit grounding-reject
on every attempt (no signals to ground on), and ate the full 12-retry
exponential backoff (~7.5h) before going dead. The user still ended up
with the original description — but only after the worker had burned cost
and clogged the queue.

### Fix 4 (commit `ac0e989`): Tone validator robustness

Two changes in `src/lib/recgon/reframe.ts`:

1. **Extended `FORBIDDEN_FLATTERY_WORDS`** with `stellar`, `incredible`,
   `outstanding(ly)`, `exceptional(ly)`, `terrific(ally)`, `superb(ly)`,
   `marvelous(ly)`, `wonderful(ly)`. Regex alphabetized. Previous regex
   covered great/amazing/perfect/brilliant/love/fantastic/excellent/awesome
   only; these 8 alternates were bypassing the gate entirely.

2. **NFKC normalization** applied to all three tone-regex matches
   (PRONOUN_DENY, FORBIDDEN_FLATTERY_WORDS, FORBIDDEN_FAMILIARITY_PHRASES).
   `sentence.normalize('NFKC')` collapses compatibility forms (full-width
   letters, ligatures, presentation forms, superscripts) to canonical
   Latin. Catches `ｇｒｅａｔ`-with-full-width-letters style bypasses.

## The Unicode confusables non-fix (documented limit)

The original fix-3 spec proposed catching cross-script lookalike attacks —
e.g. Cyrillic 'а' (U+0430) in place of Latin 'a' (U+0061). NFKC does
**not** do this: Cyrillic and Latin letters are distinct characters in
distinct scripts, even when visually identical. NFKC only handles
*compatibility* decomposition (ligatures, full-width, presentation forms).

**Why we accepted the limit:**

- A proper fix would require integrating Unicode UTS #39 confusables
  tables (or a script-mixing detector). Both add a meaningful dependency
  surface for a v3 feature.
- The threat is theoretical, not observed in any LLM output we've reviewed.
- The fail-mode is benign: the LLM emits a confusable, the tone validator
  passes it, and the assignee reads a sentence with one slightly odd
  character. No security impact.

Documented as a code comment near the `normalize()` call in `reframe.ts`
so future readers know NFKC's bounds without digging into Unicode specs.
If we later observe real-world confusable attacks (or want to harden for
adversarial settings), we'll layer UTS #39 mapping on top.

## Test count

| | Before | After | Delta |
|---|---|---|---|
| Test files | 53 (1 skipped) | 53 (1 skipped) | 0 |
| Tests | 454 passing (6 skipped) | 467 passing (6 skipped) | **+13** |

New test cases:
- `reframe.worker.test.ts`: +3 (`thin_profile guard`, `final-attempt fallback`,
  `mid-retry rethrow`). The two existing happy-path / columns_missing tests
  were extended to assert the new email behavior.
- `reframe.tone-bounds.golden.test.ts`: +10 fixtures (8 new flattery words
  + 1 inflected `outstandingly` + 1 NFKC full-width `ｇｒｅａｔ` bypass).

TypeScript: zero errors after both commits (`npx tsc --noEmit`).

Build: `npm run build` passes.

## Files modified

- `src/lib/llm/workers.ts` — Fixes 1, 2, 3 (worker is now sole email owner;
  telemetry; thin-profile guard; final-attempt fallback)
- `src/lib/recgon/dispatcher.ts` — Fix 1 (removed `notifyTeammateAssigned`
  calls + unused imports/helpers)
- `src/__tests__/reframe.worker.test.ts` — Fix 1+3 (mocks for
  `@/lib/notifications`, `@/lib/recgon/storage`, `@/lib/teamStorage`; 3 new
  test cases; existing cases updated to assert email behavior)
- `src/lib/recgon/reframe.ts` — Fix 4 (extended flattery regex, NFKC normalize)
- `src/__tests__/reframe.tone-bounds.golden.test.ts` — Fix 4 (10 new fixtures)
- `.planning/codebase/ARCHITECTURE.md` — updated Phase 4 / Plan 01 entry to
  document the FRAME-05 follow-up (worker is now sole email owner)

## Anything unexpected

- **Worker test had to mock three additional modules** (`@/lib/notifications`,
  `@/lib/recgon/storage`, `@/lib/teamStorage`) because the new
  `sendAssignmentEmail` helper goes through real storage helpers (which would
  hit the unmocked supabase chain stub and return `null`, silently
  skipping the email send and giving us a false-pass test). Adding the
  mocks let the new tests assert the email mock was called with the
  expected shape.
- **TypeScript narrowing on `vi.fn`** — declaring `vi.fn(async () =>
  undefined)` gave the mock the tuple type `[]`, so
  `notifyMock.mock.calls[0][0]` triggered TS2493 (no element at index 0).
  Fixed by declaring `vi.fn(async (_args: unknown) => undefined)` to widen
  the parameter tuple.
- **Fixes 1+2+3 were committed together**, not separately. They're tightly
  coupled through `runTaskReframe`'s control flow (every terminal path
  needs all three: a telemetry log, the thin-profile branch, and the
  email-send call). Splitting them post-hoc via `git add -p` would have
  produced partially-broken intermediate commits. The combined commit
  message documents all three fixes; per-fix attribution stays clear.
