---
phase: 04
phase_name: personalized-task-framing
status: clean
critical_count: 0
warning_count: 2
info_count: 5
reviewed: 2026-05-20T00:00:00Z
fixed: 2026-05-20T00:00:00Z
---

# Phase 04 Code Review

## Summary

The Phase 04 implementation is largely sound — the reframe module is well-isolated, the worker fails-soft correctly on missing columns, the atomic invalidation in `reassignTask` ships in a single update, and the privacy filter on `/api/recgon/tasks/[id]` correctly uses destructure-and-overwrite. However, **the privacy filter only covers the recgon-namespaced route**: the canonical task-listing routes under `/api/teams/[id]/tasks*` and `/api/calendar` still serialize the raw `personalizedDescription` and `personalizedDescriptionForUserId` fields to any team-member viewer because they spread the mapped `AgentTask` straight into the JSON response. The privacy regression Phase 04 was supposed to prevent is therefore live on three other endpoints. Recommend treating this phase as **needs-fix** until those four routes either strip the personalized fields or apply the same viewer-discriminated branch as the recgon route.

## Findings

### Critical

#### CR-01: Personalized description leaks via /api/teams/[id]/tasks, /api/teams/[id]/tasks/[taskId], /api/teams/[id]/calendar, /api/calendar — privacy regression

**Files:**
- `src/app/api/teams/[id]/tasks/route.ts:37` — `return NextResponse.json({ tasks });`
- `src/app/api/teams/[id]/tasks/[taskId]/route.ts:20` — `return NextResponse.json({ task });`
- `src/app/api/calendar/route.ts:80` — `return NextResponse.json({ tasks, teams, projects });`
- `src/app/api/teams/[id]/calendar/route.ts:21` — `listTasks(teamId, { projectId })` result returned

**Issue:** `mapTask` in `src/lib/recgon/storage.ts:188-189` populates `personalizedDescription` and `personalizedDescriptionForUserId` on every returned `AgentTask`. The above routes return that mapped task straight to the client. Result: any team member calling `GET /api/teams/{teamId}/tasks` or `GET /api/calendar?from=...&to=...` sees personalized text written for OTHER teammates, and the canonical pop-up route's careful destructure-and-overwrite (Plan 04-02, lines 87-93) is bypassed. This is exactly the T-04-02-01 / FRAME-04 threat Phase 04 documents — but only enforced on one of five task-returning endpoints. The route-level test `tasks-id-route.personalized.test.ts` does not cover these other surfaces.

**Fix:** Strip the personalized columns at the storage-layer API boundary, OR repeat the viewer-discriminated destructure in each route. The cleanest fix is to remove `personalizedDescription` / `personalizedDescriptionForUserId` from the default `mapTask` projection and expose them via a dedicated `getTaskInternal()` used only by the worker + the discriminating route. Concrete:

```ts
// In each leaking route, before returning:
const sanitized = tasks.map((t) => {
  const { personalizedDescription, personalizedDescriptionForUserId, ...rest } = t;
  void personalizedDescription;
  void personalizedDescriptionForUserId;
  return rest;
});
return NextResponse.json({ tasks: sanitized });
```

Or — better — keep the fields off the canonical `AgentTask` type by default and only resolve them via a dedicated helper. Add a regression test that asserts the snake_case and camelCase keys never appear in `JSON.stringify(body)` for each of the four routes.

---

#### CR-02: FORBIDDEN_FLATTERY_WORDS misses inflected forms ("loved", "loves", "loving", "amazingly", "perfectly", "brilliantly", "lovely")

**File:** `src/lib/recgon/reframe.ts:81-82`

**Issue:** The regex uses whole-word `\b` boundaries on the base form. Confirmed via Node REPL:

```
'loved'        → false (passes)
'loves'        → false (passes)
'loving'       → false (passes)
'amazingly'    → false (passes)  // "amazing" is the listed base
'perfectly'    → false (passes)  // "perfect" is the listed base
'brilliantly'  → false (passes)
```

An LLM hallucinating "you've loved working on auth", "you'll be perfectly suited", or "your brilliantly thorough commits" produces text that bypasses FRAME-06 — these are exactly the flattery shapes the validator is meant to catch. The phase docs the validator as "the contract" for tone; an LLM under prompt drift WILL emit these forms. The post-hoc gate fails open.

**Fix:** Extend the regex to cover common inflections, OR use a stem-based check. Simplest patch:

```ts
export const FORBIDDEN_FLATTERY_WORDS =
  /\b(great|amazing(?:ly)?|perfect(?:ly)?|brilliant(?:ly)?|lov(?:e|ed|es|ing|ely)|fantastic(?:ally)?|excellent(?:ly)?|awesome(?:ly)?)\b/i;
```

Add a golden test fixture asserting each inflected form rejects with `kind: 'tone_reject'` (extend `reframe.tone-bounds.golden.test.ts`). At minimum cover: loved, loves, loving, lovely, amazingly, perfectly, brilliantly, excellently.

---

### Warning

#### WR-01: reframeEnqueue.ts → storage.ts is technically an import cycle

**Files:**
- `src/lib/recgon/storage.ts:15` — `import { enqueueReframeJob } from './reframeEnqueue';`
- `src/lib/recgon/reframeEnqueue.ts:25` — `import { getTeammate } from './storage';`

**Issue:** `reframeEnqueue.ts` imports `getTeammate` from `./storage`, and `storage.ts` imports `enqueueReframeJob` from `./reframeEnqueue`. This is a circular import. Node's module loader handles it because both sides use named function exports (not top-level execution depending on each other's values), but the planning rationale ("storage → reframeEnqueue is a leaf") is incorrect — the cycle exists, it just happens to work because of lazy function resolution. A future contributor adding any top-level `const x = getTeammate(...)` or any non-function export to either file will break dev mode silently (depending on import order).

**Fix:** Either (a) inline the teammate lookup at the call sites in `dispatcher.ts` and `storage.ts` and pass `userId` directly into `enqueueReframeJob(taskId, userId, teamId)` so the leaf only depends on `jobQueue.enqueueJob`, or (b) move `getTeammate` to a separate `teammateStorage.ts` module that neither `storage.ts` nor `reframeEnqueue.ts` re-exports.

---

#### WR-02: Worker columns-missing detection is substring-only — fragile to error-message changes

**File:** `src/lib/llm/workers.ts:395-403`

**Issue:** The fail-soft path for the FRAME-02 additive migration detects "columns missing" via:

```ts
const msg = updateRes.error.message.toLowerCase();
if (msg.includes('column') && msg.includes('does not exist')) { ... return { skipped: true, reason: 'columns_missing' }; }
```

This is correct against current Supabase/Postgres error text but breaks if Postgres ever localizes the message or changes wording (it has changed historically; e.g. error code `42703` is the stable identifier). If the substring check fails on a real columns-missing error, the worker throws and burns through all 12 retries before going `dead` — that's the ~7.5h queue retry horizon documented at `jobQueue.ts:97`.

**Fix:** Match on the Postgres error code instead. Supabase exposes it as `updateRes.error.code === '42703'`:

```ts
if (updateRes.error.code === '42703') {
  logger.warn('reframe_columns_missing', { taskId: payload.taskId, err: updateRes.error.message });
  return { skipped: true, reason: 'columns_missing' };
}
```

Keep the substring check as a belt-and-suspenders fallback if you like, but `42703` is the canonical signal.

---

#### WR-03: validateGrounding allows trivial substring overlap to satisfy citation check

**File:** `src/lib/recgon/reframe.ts:366-379`

**Issue:** The grounding validator passes when ANY `cited_signal` is a substring of an allowed value OR the allowed value is a substring of the cited_signal:

```ts
const inAllowed = allowedSignalHaystack.some(
  (h) => h.includes(signalLower) || signalLower.includes(h),
);
```

If `declaredSkills = ['c']` (a real single-letter case from older profile rows), then ANY cited signal containing "c" passes — "react", "python", "ci", "go" — because the haystack value "c" is a substring of each. Similarly, a one-character declared interest passes everything. The validator's strength degrades to almost nothing when declared profile entries are very short. The fixtures in `reframe.no-external-inference.golden.test.ts` all use multi-character signals, so the test does not catch this.

**Fix:** Require declared values to be at least 3 characters before they count as a haystack entry, or require whole-word overlap (use `wholeWordContains` instead of `includes`) for the `inAllowed` branch. Concrete:

```ts
const inAllowed = allowedSignalHaystack.some((h) => {
  if (h.length < 3 || signalLower.length < 3) return false;
  return wholeWordContains(h, signalLower) || wholeWordContains(signalLower, h);
});
```

Add a fixture asserting `declaredSkills=['c']` + `cited_signals=['react']` → `grounding_reject`.

---

#### WR-04: assignmentReasoning raw blob never explicitly stripped from /api/recgon/tasks/[id] response

**File:** `src/app/api/recgon/tasks/[id]/route.ts:87-93`

**Issue:** The destructure pulls `assignmentReasoning` out of `task` into a separate variable, but the comment at the top of the file says it should NEVER be in the response. The code IS correct — `restWithoutDescription` doesn't include `assignmentReasoning` because it was destructured — but this is brittle: a future contributor reading the code might `void assignmentReasoning` thinking it's stripped while not realizing the destructure already removed it, then helpfully "fix" the perceived dead code by removing the destructure, reintroducing the leak. Same risk applies to `_pd`, `_pdfu`, `_origDesc`.

**Fix:** Either add a regression test that asserts `assignmentReasoning` never appears in `body.task` for owner/assignee/other roles (the current `tasks-id-route.personalized.test.ts` covers `personalizedDescription` but not `assignmentReasoning`), OR construct the response payload with an allow-list rather than a deny-list:

```ts
const responsePayload = {
  id: task.id,
  teamId: task.teamId,
  title: task.title,
  description: effectiveDescription,
  // ...explicit list of allowed fields
};
```

Allow-list is much harder to leak through.

---

### Info

#### IN-01: reframe.ts exports are mixed (re-export of enqueueReframeJob via storage indirection)

**File:** `src/lib/recgon/reframe.ts:69`

The re-export `export { enqueueReframeJob } from './reframeEnqueue';` exists only "for grep-discoverability" per the inline comment. It's misleading documentation — `reframe.ts` doesn't define this helper, and a developer importing it from `./reframe` won't know they're getting the leaf module. Consider removing the re-export and updating any historical callers to import directly from `./reframeEnqueue`. The dispatcher already does this at line 49.

#### IN-02: Magic number "5" hard-coded for recent task titles limit

**File:** `src/lib/llm/workers.ts:351`

`.limit(5)` for `recentTaskTitles` should be a named constant (`RECENT_TASK_TITLES_LIMIT = 5`) so a future tuning pass doesn't have to grep for the magic number. Same applies to the 280-char description truncate in `notifications.ts:83` and the 5-row recent task pull limit.

#### IN-03: Worker's recentProjectState only loads recentTaskTitles, ignores recentCommitFiles and recentAnalyticsChange

**File:** `src/lib/llm/workers.ts:343-364`

The prompt and grounding validator both support `recentCommitFiles` and `recentAnalyticsChange`, but the worker only ever populates `recentTaskTitles`. As a result, the `start_location` and `recent_state_link` rhetorical moves can never cite commit files or analytics deltas in production — the LLM has no way to ground those signals. The prompt promises capabilities the worker does not feed it. Either drop the unused fields from the prompt to reduce the false sense of capability OR wire the commit-summary table + analytics_engine into the worker.

#### IN-04: Worker race-shield error message mentions Plan 04-03 as future work — stale comment

**File:** `src/lib/llm/workers.ts:331-333`

The inline comment reads "Plan 04-03 will hook reassignment to invalidate + re-enqueue; for now we silently skip." Plan 04-03 has landed (`storage.ts:813-840` does exactly this). Update the comment to reflect the new state ("…re-enqueue lives in storage.reassignTask; this branch handles the in-flight job that was claimed before invalidation").

#### IN-05: Test fixture in notifications.personalized.test.ts uses `'agent'` for TaskSource — not a valid enum value

**File:** `src/__tests__/notifications.personalized.test.ts:91`

```ts
source: 'agent',  // <-- TaskSource = 'brain' | 'user' | 'teammate' | 'schedule'
```

`'agent'` is not in the `TaskSource` union defined in `types.ts:148`. The fixture is cast as `AgentTask` so the TS error is silenced. The test still passes because notifications.ts doesn't read `source`, but the fixture lies about the shape. Replace with `source: 'brain'` (or any valid value) so the fixture is honest.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Fix Log

2026-05-20: 4 of 6 findings fixed (2 criticals + 2 warnings). 2 warnings (WR-01, WR-04) deferred — both are architectural-hygiene concerns, not active leaks, and can be addressed in a follow-up housekeeping pass without blocking Phase 4.

| Finding | Commit | Status | Notes |
|---|---|---|---|
| CR-01 | `73e5c37` | fixed | Strip `personalizedDescription` + `personalizedDescriptionForUserId` from 4 task-listing routes (`/api/teams/[id]/tasks`, `/api/teams/[id]/tasks/[taskId]`, `/api/calendar`, `/api/teams/[id]/calendar`). New regression test `tasks-routes.personalized-stripped.test.ts` asserts no leak under any casing across viewer roles (11 cases). |
| CR-02 | `b3f3935` | fixed | Extend `FORBIDDEN_FLATTERY_WORDS` regex to cover inflected forms (`loved`/`loves`/`loving`/`lovely`, `amazingly`, `perfectly`, `brilliantly`, `excellently`, `greatly`). 9 new tone fixtures pinned in `reframe.tone-bounds.golden.test.ts`. |
| WR-01 | _deferred_ | open | Circular import between `storage.ts` ↔ `reframeEnqueue.ts` works today via lazy function resolution. Refactor (e.g. extract `getTeammate` to a leaf module) is mechanical but touches several callers — deferred to a follow-up rather than risk regressions in a privacy-fix pass. |
| WR-02 | `fe82dcb` | fixed | Worker `runTaskReframe` detects columns-missing via Postgres error code `42703` first, with substring fallback retained. Existing worker test updated + new fixture asserts code-only detection (non-matching message). |
| WR-03 | `a5ab04b` | fixed | `validateGrounding` requires ≥3 chars on both sides of substring-overlap check, rejecting trivially-matching single-letter declared values (e.g. legacy `skills=['c']`). New fixture in `reframe.no-external-inference.golden.test.ts` pins the gate. |
| WR-04 | _deferred_ | open | `assignmentReasoning` is correctly stripped via destructure in `/api/recgon/tasks/[id]/route.ts`, but the deny-list pattern is brittle. Switching to an allow-list response payload is a defensive refactor, not a leak. Deferred to a follow-up. |

**Validation:** full vitest suite passes (454 passed, 6 skipped — was 432 + 22 new fixtures); `tsc --noEmit` clean.

_Fixed: 2026-05-20T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
