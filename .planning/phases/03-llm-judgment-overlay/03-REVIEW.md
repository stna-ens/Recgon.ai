---
phase: 03-llm-judgment-overlay
reviewed: 2026-05-14T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - src/lib/recgon/judge.ts
  - src/lib/recgon/judgmentBudget.ts
  - src/lib/recgon/whyYou.ts
  - src/lib/recgon/dispatcher.ts
  - src/lib/recgon/storage.ts
  - src/lib/recgon/types.ts
  - src/lib/prompts.ts
  - src/lib/schemas.ts
  - src/components/v2/calendar/TaskDetailPanel.tsx
  - src/app/api/recgon/tasks/[id]/route.ts
  - src/__tests__/judge.test.ts
  - src/__tests__/judge.bias-regression.test.ts
  - src/__tests__/judgmentBudget.test.ts
  - src/__tests__/whyYou.test.ts
  - src/__tests__/assignmentReasoning.privacy.test.ts
  - src/__tests__/dispatcher.judge-integration.test.ts
  - src/__tests__/fixtures/judge-bias/bias-01-english-male.json
  - supabase/migrations/20260514_assignment_reasoning.sql
  - supabase/migrations/20260514_team_llm_usage.sql
findings:
  critical: 3
  warning: 9
  info: 4
  total: 16
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 3 ships the LLM judgment overlay: pure `runJudgment` engine, batched
dispatcher integration, per-team daily cap, `assignment_reasoning` JSONB
column, viewer-role privacy filter, and "Why you" copy renderer. The
overall architecture is sound and the privacy / anonymization story is well
tested. Three BLOCKERs were found:

1. The `WhyYouBlock` sub-component is declared in `TaskDetailPanel.tsx` but
   never rendered in JSX — the assignment-reasoning UI never appears.
2. `runJudgment` permits a duplicate `task_id` in the LLM response: the
   `pickedIds.has(...)` coverage check passes when N picks all share one
   id, dropping picks for the other tasks while still passing the count
   equality check (the count check is structurally redundant given the
   uniqueness gap).
3. The cap-exhausted email path violates the documented "at-most-one" rule
   under a transient `RESEND_API_KEY` outage: the flag is flipped BEFORE
   the email send, so a missing `RESEND_API_KEY` (or a Resend SDK throw)
   permanently silences future alerts for that (team, day) even though no
   email ever went out.

Plus 9 WARNINGs (validator robustness gaps, pronoun-deny edge cases, a
race in `checkAndIncrement` rollback semantics, missing JSON-mode
guarantee, etc.) and 4 INFOs.

## Critical Issues

### CR-01: `WhyYouBlock` is declared but never rendered

**File:** `src/components/v2/calendar/TaskDetailPanel.tsx:40-50` (declaration);
`src/components/v2/calendar/TaskDetailPanel.tsx:273-430` (panel body, missing call)
**Issue:** The component `WhyYouBlock` is defined to render the assignee-only
"WHY YOU" sentence, and the API route correctly populates
`task.whyYouSentence`, but no JSX in the panel body invokes `<WhyYouBlock
sentence={task.whyYouSentence} />`. The user-visible feature is dark in
production: the assignee opens the task pop-up and sees no reasoning even
though the server is shipping the string. The privacy test
(`assignmentReasoning.privacy.test.ts`) only checks the server-side
response, not the rendered UI, so this defect ships silently.
**Fix:** Render the block inside the panel body, near the SCHEDULED
section, only when `task.whyYouSentence` is present. Example placement
right above the existing `task.scheduledDate &&` block:
```tsx
<WhyYouBlock sentence={task.whyYouSentence} />
{task.scheduledDate && (
  <section className="cal-panel-section">
    ...
  </section>
)}
```
Add a smoke test that asserts the section renders with the sentence when
`whyYouSentence` is provided.

### CR-02: `runJudgment` accepts a response where every pick shares one `task_id`

**File:** `src/lib/recgon/judge.ts:215-241`
**Issue:** The "exactly one pick per task_id" guard uses `pickedIds =
new Set(result.picks.map((p) => p.task_id))` and then checks
`pickedIds.has(t.taskId)` for each input AND `result.picks.length ===
inputs.length`. If the LLM returns N picks all carrying the SAME task_id
(e.g. all three picks set `task_id: 'task-a'`), the `for-of` over inputs
fails when it hits `task-b`, but BEFORE that, the per-pick loop at lines
216-226 succeeds because each duplicate pick resolves to a real
`taskInput`. The duplicates also get treated as "the pick" for `task-a`
in Pass 3 of the dispatcher (`judgeMap.set(pick.task_id, pick)` clobbers
on each iteration in `applyJudgmentIfClose`). The skipped-task check
catches the "task-b not picked" case here, but more importantly the
duplicate-id state means the dispatcher silently uses whichever pick the
LLM emitted LAST as the pick for `task-a`, even though that pick was
shaped against `task-b`'s candidate slate. This is a real correctness
hazard — picks against the wrong candidate breakdown can land on the
wrong task.
**Fix:** Add a uniqueness check on `result.picks` before content
validation:
```ts
const seen = new Set<string>();
for (let i = 0; i < result.picks.length; i++) {
  const p = result.picks[i];
  if (seen.has(p.task_id)) {
    throw new JudgeError(
      `duplicate pick for task_id '${p.task_id}'`,
      { taskId: p.task_id, pickIndex: i },
    );
  }
  seen.add(p.task_id);
}
```

### CR-03: Cap-alert flag flipped before email send — silent drop on Resend outage

**File:** `src/lib/recgon/judgmentBudget.ts:131-194`
**Issue:** `alertCapExceededOnce` updates `cap_alert_sent=true` BEFORE
attempting the Resend send. The comment at line 131-132 calls this
intentional ("so the next call short-circuits at the read-the-flag step
even if the email errors"). But the side effect is that if
`RESEND_API_KEY` is missing OR if the Resend send throws/returns an error
(network outage, account suspension, rate limit), the dev-ops team gets
NO email at all for that team-day — and they cannot get one later because
the flag is now `true`. The documented contract (JUDGE-10 / T-03-02-02)
is "at-most-one email per (team, day)", which the current code interprets
as "at-most-one DB write per (team, day)" — but the actual user-visible
guarantee should be "at-most-one EMAIL per (team, day)". Today, on any
Resend hiccup, the count becomes zero. Cap-hit is exactly the runaway
signal the alert is supposed to flag; silently dropping it defeats the
purpose of the safety rail.
**Fix:** Reorder so the flag is only flipped on a confirmed-good email
delivery (or after a confirmed log-only fallback when no email is
configured). Two options:
```ts
// Option A — flip flag only after a successful send (or after the
// "no email configured" branch).
const to = process.env.DEV_OPS_ALERT_EMAIL;
if (!to) {
  // Log-only path — still flip the flag to record that we acknowledged
  // the cap hit (no email was ever expected).
  await flipFlag(teamId, usageDate);
  return;
}
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  logger.warn('judgmentBudget: DEV_OPS_ALERT_EMAIL set but RESEND_API_KEY missing — NOT flipping flag', { teamId, usageDate });
  return;  // leave flag false so a later run can retry
}
const resend = new Resend(apiKey);
try {
  const { error } = await resend.emails.send({ ... });
  if (error) {
    logger.warn('judgmentBudget Resend returned error — NOT flipping flag', { teamId, usageDate, err: ... });
    return;  // leave flag false
  }
} catch (err) {
  logger.warn('judgmentBudget Resend threw — NOT flipping flag', { teamId, usageDate, err: ... });
  return;
}
// Email confirmed sent.
await flipFlag(teamId, usageDate);
```
This loses the "no double-send on email retry" property, but Resend's own
idempotency-on-the-same-content is the right place to enforce that, not a
local boolean that's silently set on failure.

## Warnings

### WR-01: `validateJudgePick` does not reject pronouns adjacent to punctuation in some locales

**File:** `src/lib/recgon/judge.ts:78-79, 286-291`
**Issue:** `PRONOUN_DENY = /\b(he|she|they|...|elle|il|sie|er)\b/i`. The
`\b` regex boundary in JavaScript only matches at ASCII word boundaries,
which works for English but fails for sentences where a pronoun is
adjacent to Unicode punctuation or apostrophes (e.g., `she's`, `sie's`,
or `er;`). More importantly, the deny-list lacks `ele/ela` (Portuguese),
`hij/zij` (Dutch), `lui/lei` (Italian) — none of which are in the 5 bias
fixtures, but any of which the LLM could plausibly emit when the title or
skill names are European. This is a minor blast-radius (the post-hoc
validator's job is to catch outputs, not to be a universal pronoun gate),
but the warranty in the comment block ("the deny-list extends to the
pronouns most likely to leak into LLM output for those locales") is
overstated.
**Fix:** Either acknowledge the gap in the comment ("English + Romance
core only — Portuguese / Dutch / Italian pronouns not covered") or extend
the alternation. Also add `\bshe['']s\b` family coverage by using a
slightly looser boundary on the English entries:
```ts
const PRONOUN_DENY =
  /(^|[^a-z])(he|she|they|him|her|them|his|hers|theirs|ele|ela|elle|il|sie|er|hij|zij|lui|lei)([^a-z]|$)/i;
```

### WR-02: Cross-candidate regex doesn't catch `candidate-2` or `candidate2`

**File:** `src/lib/recgon/judge.ts:84`
**Issue:** `CROSS_CANDIDATE_REF = /candidate_\s*\d+/i` requires the
underscore. The LLM could write "candidate 2", "candidate2", "Candidate-2",
or "Cand. 2" — none of which match. The judge test at line 347-367 only
locks the underscore case-insensitive path. Since the prompt instructs
the model to use `candidate_1`/`candidate_2`/`candidate_3` verbatim, the
exact underscore form is the most likely violation, but if the model
trims or restyles, the validator silently lets the cross-reference
through.
**Fix:** Loosen the separator:
```ts
const CROSS_CANDIDATE_REF = /candidate[\s_\-.]*\d+/i;
```
Add a corresponding test case for `candidate 2` and `candidate-2`.

### WR-03: `checkAndIncrement` race — upsert clobbers concurrent increments

**File:** `src/lib/recgon/judgmentBudget.ts:61-105`
**Issue:** The comment at line 13-15 acknowledges the race but
under-describes its impact. Pattern is: `read → currentCalls → upsert with
judgment_calls = currentCalls + 1`. If two cron ticks both read
`currentCalls = 49`, they both upsert `50`, and the table ends at 50 even
though TWO calls happened. The cap rail still fires correctly (51st
call), but the counter is inaccurate and the underlying invariant
"counter reflects actual call count" is broken. More concerning: if the
two ticks both read `currentCalls = 50` (right at the boundary), they
both refuse — which is the correct behavior but means the documented
`callsToday <= DAILY_JUDGMENT_CALL_CAP` post-condition is sometimes
under-counted, not over-counted as the comment implies. Either way the
cap is loose by ±N where N is concurrency.
**Fix:** For real correctness, atomic increment via Postgres
`INSERT ... ON CONFLICT ... DO UPDATE SET judgment_calls =
team_llm_usage.judgment_calls + 1 RETURNING judgment_calls` would
eliminate the race. As an accepted compromise (per RESEARCH Q4 note 2),
document the actual semantics more honestly:
```ts
// Under N concurrent racers, the counter may be undercounted by up
// to N-1, and the cap may be exceeded by up to N-1. With cron at
// 1/min and typical N=1, this is functionally zero.
```

### WR-04: `responseMimeType: 'application/json'` is passed but providers may ignore it

**File:** `src/lib/recgon/judge.ts:178-187`
**Issue:** `runJudgment` requests `responseMimeType: 'application/json'`
when calling `opts.chat`. The Gemini path honors this (forces JSON-mode
output), but the Claude Haiku fallback path may NOT enforce strict JSON
mode — the schema-violation test exists, but there is no test that locks
"on a Claude fallback the validator catches free-form prose with embedded
JSON". The markdown-fence-stripping in lines 196-205 is defensive but
only handles ` ```json ` fences; a Claude response that wraps JSON in
narrative ("Here's the analysis: { ... }. Let me know if you need...")
will fail JSON.parse and throw `JudgeError`, which is the intended
fallback — so this is functionally correct, but the LLM-fallback path is
silently more failure-prone than the Gemini path.
**Fix:** Add a test fixture that simulates the Claude-style prose-wrapped
JSON response and asserts the validator throws `JudgeError` (which the
dispatcher catches → math fallback). Optionally pre-extract the first
JSON object as `schemas.ts:parseAIResponse` does:
```ts
const match = raw.match(/\{[\s\S]*\}/);
if (match) parsedJson = JSON.parse(match[0]);
```

### WR-05: `wholeWordContains` accepts substrings inside skill tags

**File:** `src/lib/recgon/judge.ts:387-396`
**Issue:** The custom regex builds `(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`
to allow `next.js` to match in "your next.js skill". But this also means
`ts` (if in `confirmedSkills`) matches in `"typescript"` — because the
boundary after `ts` is `c`, which IS in `[a-z0-9_]`, so it should NOT
match — confirmed. But the reverse direction: a sentence containing
`"node-typescript"` against a confirmedSkills entry `"node"` will match
because of the `-` separator, which is GOOD. The actual hazard: an
empty-string skill in `confirmedSkills` is guarded by `if (needle.length
=== 0) return false`, but a skill containing only special chars (e.g.
`"++"`) escapes safely. No bug, but the regex is subtly different from
the more conventional `\b` word boundary and there's no test that locks
the "skill `ts` does NOT match `typescript`" behavior. Add it.
**Fix:** Add a regression test:
```ts
it('skill `ts` does not match `typescript` (avoid spurious skill_depth pass)', () => {
  // build a JudgeTaskInput where confirmedSkills includes 'ts' but NOT
  // 'typescript', and the LLM sentence mentions typescript — expect
  // validator to REJECT.
});
```

### WR-06: Pass 3 fallback re-runs `pickScheduledFromRanked` without re-checking close-call status

**File:** `src/lib/recgon/dispatcher.ts:614-639`
**Issue:** When the judge pick's chosen candidate is excluded (line
604-608), the code falls through to `pickScheduledFromRanked(task, ranked,
excluded)` walking the math ranking. This is correct for math fallback,
but the resulting candidate may be the math top-2 or top-3 — and the
math gap to top-1 might be > 0.20, meaning if the dispatcher re-ran on
this same task it would NOT be a close-call any more. The
`assignmentReasoning.kind` will still be set to `'llm_tiebreaker'` via
the `pick` argument carried through to `assignScheduledTask` at line
701, which is a contract violation: we tell the assignee "Why you ←
LLM tiebreaker" but they were actually picked by math fallback because
the judge pick was excluded.
**Fix:** When the judge pick is excluded, rebuild `reasoning` as
`math_only` before passing it down:
```ts
if (excluded.has(candidate.teammate.id)) {
  // ... existing log warn ...
  // Rewrite reasoning so the "Why you" line reflects what actually
  // happened (math fallback), not the discarded judge pick.
  reasoning = buildAssignmentReasoning(
    { task: rawTask, ranked, isCloseCall: false },
    null,
  );
}
```
And accept `reasoning` as mutable (let, not const) at the function
parameter — OR reshape the function to compute reasoning AFTER the
exclusion check.

### WR-07: `bandLabel` and `whyYou.band` thresholds differ — easy to mis-edit

**File:** `src/lib/prompts.ts:1063-1067`, `src/lib/recgon/whyYou.ts:54-58`
**Issue:** Two threshold tables: `bandLabel` (prompts.ts) uses
`0.45/0.7`; `band` (whyYou.ts) uses `0.4/0.7`. The whyYou comment
explains the discrepancy is intentional ("differ slightly from
prompts.ts's bandLabel... that one feeds the LLM prompt and is
intentionally tuned for LLM clarity"). But the two functions are
copy-pasted and a future maintainer is highly likely to "fix" one and
miss the other, silently shifting which side rates `0.42` as "low" vs
"medium". Same is true for the `na` value being magic in whyYou and
absent in prompts.
**Fix:** Move both threshold tables into a single shared module:
```ts
// src/lib/recgon/bandThresholds.ts
export const PROMPT_BAND_THRESHOLDS = { medium: 0.45, high: 0.7 };
export const COPY_BAND_THRESHOLDS = { medium: 0.4, high: 0.7 };
```
Export both from one file with comments on why they differ, and have
prompts.ts and whyYou.ts import from there.

### WR-08: `recent_track_record` validator only catches over-cited counts; under-cited counts and zero-tasks fail open

**File:** `src/lib/recgon/judge.ts:317-330`
**Issue:** The check at line 322-326 throws when the LLM cites a number
GREATER than `recentTasks.length`. It does NOT throw when the LLM picks
`recent_track_record` as the reason_code and the candidate has ZERO
recent tasks. The schema allows the reason_code, the post-hoc validator
just iterates over zero tokens, and the assignment goes through with
"recent track record" copy citing nothing real. Equivalently, the LLM
can write "you finished tasks recently" (no number at all) and the
validator never catches that the candidate has no recent tasks. This is
the same shape of bug as `interest_match` with zero interests (which
IS caught at lines 333-340).
**Fix:** Mirror the `interest_match` pattern:
```ts
case 'recent_track_record': {
  if (chosen.recentTasks.length === 0) {
    throw new JudgeError(
      `recent_track_record reason given but candidate has no recent tasks: '${sentence}'`,
      { taskId: task.taskId, pickIndex },
    );
  }
  const maxAllowed = chosen.recentTasks.length;
  // ... existing token loop ...
}
```

### WR-09: Migration is missing `not null` / default semantics check for legacy rows

**File:** `supabase/migrations/20260514_assignment_reasoning.sql:14-15`
**Issue:** `add column if not exists assignment_reasoning jsonb default
null` is additive and backward-compatible — legacy rows are null,
which storage.ts handles. The partial index at line 17-19 is also
fine. But there is no migration check or downgrade path: if Phase 4 ever
adds a `not null` constraint, the column will refuse the migration on
any production team that still has legacy rows. The Plan 03 doc says
"backwards-compatible, no backfill required" — true today, but the
column is now a permanent additive artifact with no rollback policy. Not
a bug today; a deferred future risk.
**Fix:** Add a comment in the migration documenting that the null
semantic is permanent unless a backfill migration ships first:
```sql
-- NOTE: this column stays NULL for any row written before Phase 3.
-- A future `NOT NULL` constraint REQUIRES a backfill migration that
-- writes `kind: 'math_only'` reasoning for legacy assignments first.
-- Without that backfill, adding NOT NULL will fail on production.
```

## Info

### IN-01: `team_llm_usage` migration uses `team_id text` but other team-scoped tables may use uuid

**File:** `supabase/migrations/20260514_team_llm_usage.sql:18`
**Issue:** The comment at lines 14-16 says "teams.id is text — match
here." Worth double-checking against the actual `teams` schema (the
migration baseline file `20260426_recgon_admin.sql` wasn't reviewed here)
to ensure the type matches. If `teams.id` is `uuid`, the foreign key
will fail to create.
**Fix:** Confirm the column type matches the parent table. If `teams.id`
is `uuid`, change to:
```sql
team_id uuid not null references teams(id) on delete cascade,
```

### IN-02: `escapeXmlForJudge` does not escape quotes — title with `"` may break attribute

**File:** `src/lib/prompts.ts:1071-1077`, `src/lib/prompts.ts:1140`
**Issue:** `escapeXmlForJudge` only escapes `<>&`. The title appears
inside a pseudo-XML element body `<task_title>...</task_title>`, so
double-quotes are fine in CDATA-like body content. But if a future
refactor moves the title into an attribute (e.g. `<task_title
text="...">`), `"` characters in the title would break the attribute
syntax. Cheap defense:
**Fix:** Add `"` to the escape table now, before someone moves the field:
```ts
function escapeXmlForJudge(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
}
```

### IN-03: `JudgeError` extends Error but `cause` is typed as `unknown`

**File:** `src/lib/recgon/judge.ts:125-140`
**Issue:** `JudgeError`'s constructor takes `cause?: unknown` but
modern JS `Error` has a native `cause` option since ES2022. Using a
custom field bypasses the standard `error.cause` chain and tools that
walk it (Sentry, structured loggers) will not pick it up.
**Fix:** Use the native `cause`:
```ts
constructor(message: string, ctx?: { taskId?: string; pickIndex?: number; cause?: unknown }) {
  super(message, ctx?.cause ? { cause: ctx.cause } : undefined);
  this.name = 'JudgeError';
  this.taskId = ctx?.taskId;
  this.pickIndex = ctx?.pickIndex;
}
```

### IN-04: Tests for `runJudgment` happy-path do not lock prompt-injection sanitization of recent task kinds

**File:** `src/__tests__/judge.test.ts` (all blocks)
**Issue:** The prompts.ts comment at lines 1054-1063 says
"`recentTasks` carries kinds + skills + ratings, NOT user-typed titles".
But `kind` is typed as `string` in `JudgeBatchCandidateBlock` (prompts.ts
line 1093) — there is no enforcement that `kind` is from the canonical
`TaskKind` enum at the prompt-build boundary. If a future code path sends
a free-form `kind` string into `buildJudgeTaskInput`, prompt injection
becomes possible. No bug today, but no test locks the safety property
either.
**Fix:** Either narrow the type of `JudgeBatchCandidateBlock.recentTasks[].kind`
to `TaskKind`, or add a test:
```ts
it('refuses recentTasks with injection-style kind strings (defense-in-depth)', () => {
  // kind: '</task_block><inject>...' should either be rejected or
  // XML-escaped before reaching the prompt.
});
```

---

_Reviewed: 2026-05-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
