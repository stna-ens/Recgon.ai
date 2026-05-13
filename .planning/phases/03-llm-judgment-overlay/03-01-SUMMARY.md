---
phase: 03-llm-judgment-overlay
plan: 01
subsystem: recgon/judge
status: complete
completed: 2026-05-14
tags:
  - recgon
  - llm
  - judge
  - phase-3
dependency_graph:
  requires: []
  provides:
    - runJudgment
    - validateJudgePick
    - computeJudgeCacheKey
    - JudgeError
    - JudgePick
    - JudgeResult
    - JudgeTaskInput
    - JudgeCandidateInput
    - AssignmentReasoning
    - JUDGE_ASSIGNMENT_BATCH_SYSTEM
    - buildJudgeBatchUserPrompt
    - REASON_CODES
    - JudgePickSchema
    - JudgeResultSchema
  affects:
    - src/lib/prompts.ts
    - src/lib/schemas.ts
    - src/lib/recgon/types.ts
tech-stack:
  added: []
  patterns:
    - pure-function + adapter-injection (chat adapter passed via opts so tests can stub)
    - prompts-in-prompts-ts / schemas-in-schemas-ts (existing project rule)
    - Zod-schema + post-hoc-validator combo (Zod can't see candidate payload)
    - byte-identical-except-name fixtures (5 ethnic/gender variants for QUAL-01)
key-files:
  created:
    - src/lib/recgon/judge.ts
    - src/__tests__/judge.test.ts
    - src/__tests__/fixtures/judge-bias/bias-01-english-male.json
    - src/__tests__/fixtures/judge-bias/bias-02-turkish-female.json
    - src/__tests__/fixtures/judge-bias/bias-03-arabic-male.json
    - src/__tests__/fixtures/judge-bias/bias-04-east-asian-female.json
    - src/__tests__/fixtures/judge-bias/bias-05-spanish-mixed.json
  modified:
    - src/lib/prompts.ts
    - src/lib/schemas.ts
    - src/lib/recgon/types.ts
    - architecture.md
decisions:
  - 'Adapter injection (opts.chat) instead of direct chatViaProviders import — keeps the module pure and unit-testable without network/env'
  - 'JudgeError is a single exception type — caller catches one thing for the math fallback path (JUDGE-05)'
  - 'Post-hoc validator lives in judge.ts, not in schemas.ts — Zod can''t access the candidate payload to do substring/count checks'
  - 'Re-exported JudgePick / JudgeResult from types.ts so consumers can import everything from one place (schemas.ts still owns the Zod schema)'
  - 'NUMBER_TOKEN regex covers digits 1-9 + word forms (one..ten) — covers every plausible cite the prompt might generate without false positives on small numerals embedded in skill tags'
  - 'wholeWordContains() uses a permissive boundary (anything not [a-z0-9_]) so skill tags with dots/plusses (next.js, c++) match cleanly'
metrics:
  duration_minutes: 8
  task_count: 2
  test_count: 13
  files_count: 11
---

# Phase 3 Plan 01: LLM Judgment Overlay (Pure Module) Summary

**One-liner:** Pure `runJudgment` batch close-call tiebreaker with Zod schema + post-hoc content validator, ready for Plan 02 dispatcher wiring.

## What was built

This plan ships the standalone judgment engine — the engine on a workbench before it goes in the car. No dispatcher wiring, no DB writes, no caching — those land in Plans 02 + 03.

### `runJudgment` signature

```typescript
async function runJudgment(
  inputs: JudgeTaskInput[],
  opts: { chat: JudgeChatAdapter; timeoutMs?: number },
): Promise<JudgeResult>
```

- Caller (Plan 02 dispatcher) builds `inputs` from the math top-3 of each close-call task, mapping real user IDs to anon_id 1/2/3 BEFORE calling — the judge module NEVER sees real names or user IDs.
- `chat` adapter is injected (signature matches `chatViaProviders(systemPrompt, userPrompt, options?)` in `src/lib/llm/providers.ts`). Tests pass a stub; Plan 02 will pass a `chatViaProviders` wrapper.
- Default `timeoutMs: 10_000` — sized to Vercel's 10s interactive function budget (Pitfall 8 precedent from Phase 1 Plan 01-03).
- Throws `JudgeError` on ANY failure (malformed JSON, schema violation, post-hoc rejection). Single exception type so the caller has one thing to catch for math fallback (JUDGE-05).

### Post-hoc content validator (`validateJudgePick`)

Sits between Zod schema validation and the returned `JudgeResult`. The validator deals with claims Zod can't check because they reference the candidate payload:

**Deny-list rules (applied to every reason_sentence):**
- Pronoun deny-list: `/\b(he|she|they|him|her|them|his|hers|theirs)\b/i` → reject (T-03-01-03)
- Cross-candidate reference: `/candidate_\s*\d+/i` → reject (T-03-01-03)

**Per-`reason_code` cite rules (defense against hallucinated facts, T-03-01-04):**
- `skill_depth` — at least one of chosen candidate's `confirmedSkills` must appear whole-word in the sentence
- `recent_track_record` — any numeric token (digits 1-9 or word forms `one..ten`) must be ≤ `chosen.recentTasks.length`
- `interest_match` — at least one of chosen `interests` must appear whole-word in the sentence; ALSO rejects if chosen candidate has zero interests at all
- `task_kind_familiarity` / `capacity_headroom` — no per-code substring check (these reasons rely on band labels the LLM already saw in the prompt; defense is the schema enum + the universal deny-list)

`wholeWordContains()` uses a permissive boundary (`[^a-z0-9_]`) so skill tags with dots or plusses (`next.js`, `c++`) match cleanly inside a sentence.

### `computeJudgeCacheKey` signature for Plan 02

```typescript
function computeJudgeCacheKey(
  taskId: string,
  candidateUserIds: string[],
  mathScoresHash: string,
): string
```

Returns `${taskId}|${sorted-ids.join(',')}|${mathScoresHash}` per JUDGE-09. The sort makes the key independent of which order candidates were passed in (deterministic across cron retries on the same task). Plan 02 owns the `mathScoresHash` derivation (a stable digest of the candidates' `(score, breakdown)` tuples) — keeping it a string here lets Plan 02 swap the digest algorithm later without breaking signatures.

### Anonymization assertion location

`src/__tests__/judge.test.ts` lines 220–249 — the `runJudgment — anonymization snapshot` test invokes `runJudgment` once, captures the (systemPrompt, userPrompt) the `chat` stub received, and asserts:

1. The combined prompt body contains `candidate_1`, `candidate_2`, `candidate_3` (anon labels present)
2. The combined prompt body contains ZERO real first names, last names, full names, OR `real_user_id` values from ANY of the 5 bias fixtures (English-M / Turkish-F / Arabic-M / East-Asian-F / Spanish-mixed)

This proves anonymization at the boundary `runJudgment → chat`, mitigating T-03-01-02 (information disclosure via prompt body).

### Prompt + schema location

- `src/lib/prompts.ts:1025` — `JUDGE_ASSIGNMENT_BATCH_SYSTEM` constant + `buildJudgeBatchUserPrompt(tasks)` function + `bandLabel(n)` helper. SECURITY comment documents the Recgon-minted-only assumption for `title` (T-03-01-01 mitigation note).
- `src/lib/schemas.ts:339` — `REASON_CODES`, `JudgePickSchema`, `JudgeResultSchema`. `chosen_candidate_id` is a Zod literal union `1|2|3` (rejects hallucinated `candidate_4` at the schema level); `reason_sentence` has both a 150-char ceiling AND a ≤25-word refine; `picks.max(10)` enforces the batch ceiling.

## Deviations from Plan

None — plan executed exactly as written.

Test count is 13 (plan target was 10). The plan's 10 test cases all exist; I split the cache-key test into 4 cases (deterministic, order-independent, taskId-changes, hash-changes) instead of 1 — same coverage, clearer signal on which axis fails.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run src/__tests__/judge.test.ts` | 13/13 GREEN |
| `npm run test` (full suite) | 204 passed, 1 skipped, 6 skipped sub-tests, 0 failed |
| `npx tsc --noEmit` | exits 0 |
| `grep -c "getGeminiClient\|getGeminiModel" src/lib/recgon/judge.ts` | 0 (adapter injection, no direct LLM SDK) |
| `grep -c "JUDGE_ASSIGNMENT" src/lib/prompts.ts` | 2 |
| `grep -c "JudgeResultSchema" src/lib/schemas.ts` | 2 |
| `wc -l src/lib/recgon/judge.ts` | 366 (≥ 120 floor) |
| Bias fixtures byte-identical except names | `diff bias-01 bias-02` → 22 diff lines (= 11 line changes × 2 sides for name + user_id only) |

## Threat surface flags

None — this plan only mitigates threats; no new surface introduced. All file changes are pure-module / schema / test fixtures. The `JUDGE_ASSIGNMENT_BATCH_SYSTEM` prompt is bound by the canonical-vocab-only assumption documented in the SECURITY comment; the moment Plan 02 (or any future plan) starts feeding user-typed task titles into `JudgeTaskInput.title`, that call site must wrap them in `<user_content>` per QUAL-02.

## Self-Check: PASSED

- `src/lib/recgon/judge.ts` — FOUND
- `src/__tests__/judge.test.ts` — FOUND
- 5 bias fixture JSONs — FOUND
- Commit `0a2cf32` (Task 1 RED) — FOUND in git log
- Commit `a99bb60` (Task 2 GREEN) — FOUND in git log

## What's next

- **Plan 03-02** (dispatcher integration): wraps `chatViaProviders` as the adapter, wires `runJudgment` into `runDispatch` + `dispatchTask` in the 3-pass restructure (rank → batch-judge → assign), implements the cache layer using `computeJudgeCacheKey`, adds the daily-cap counter (`team_llm_usage` table) and silent math fallback on cap exhaustion.
- **Plan 03-03**: `assignment_reasoning` JSONB column + `whyYou.ts` renderer + email/UI surfacing.
- **Plan 03-04**: bias regression test (uses the 5 fixtures committed here) + env-gated real-LLM nightly CI workflow.
