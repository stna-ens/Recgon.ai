---
phase: 3
slug: llm-judgment-overlay
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-13
updated: 2026-05-14
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Sourced from `03-RESEARCH.md` §Validation Architecture (lines 481–498).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (already configured) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run src/__tests__/judge.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds (quick); ~2 min (full suite); ~10 min (real-LLM bias mode) |

---

## Sampling Rate

- **After every task commit:** Run quick command (judge.test.ts)
- **After every plan wave:** Run `npm run test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green + bias-regression must pass with stubbed adapter
- **Before phase ships to main:** real-LLM bias regression must pass once (Plan 04 Task 4 — manual)
- **Max feedback latency:** ~30 seconds (quick); ~120 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 01 | 1 | JUDGE-03, JUDGE-04, JUDGE-05, JUDGE-09, QUAL-03 | T-03-01-02, T-03-01-03, T-03-01-04 | Test scaffold RED before judge.ts exists; anonymization snapshot, deny-list, schema literal, cache-key determinism | unit (RED) | `npx vitest run src/__tests__/judge.test.ts 2>&1 \| grep -E '(FAIL\|Cannot find module)'` | src/__tests__/judge.test.ts, 5 fixture JSONs | ⬜ pending |
| 03-01-T2 | 01 | 1 | JUDGE-03, JUDGE-04, JUDGE-05, JUDGE-09, QUAL-03 | T-03-01-01..05 | Pure runJudgment + Zod schema + post-hoc validator throws on hallucination | unit (GREEN) | `npx vitest run src/__tests__/judge.test.ts` | src/lib/recgon/judge.ts, prompts.ts, schemas.ts, types.ts | ⬜ pending |
| 03-02-T1 | 02 | 2 | JUDGE-01, JUDGE-02, JUDGE-06, JUDGE-09, JUDGE-10 | T-03-02-01, T-03-02-03 | Test scaffold RED; budget cap, single-batched-call, cache, math fallback | unit + integration (RED) | `npx vitest run src/__tests__/judgmentBudget.test.ts src/__tests__/dispatcher.judge-integration.test.ts 2>&1 \| grep -E '(FAIL\|Cannot find)'` | judgmentBudget.test.ts, dispatcher.judge-integration.test.ts | ⬜ pending |
| 03-02-T2 | 02 | 2 | JUDGE-10 | T-03-02-01 | Migration file lands; live DB has team_llm_usage table | manual (blocking) | `mcp__supabase__list_tables \| grep team_llm_usage` | supabase/migrations/20260514_team_llm_usage.sql | ⬜ pending |
| 03-02-T3 | 02 | 2 | JUDGE-10 | T-03-02-01, T-03-02-02 | Counter atomic; idempotent alert; service-role-only | unit (GREEN) | `npx vitest run src/__tests__/judgmentBudget.test.ts` | src/lib/recgon/judgmentBudget.ts | ⬜ pending |
| 03-02-T4 | 02 | 2 | JUDGE-01, JUDGE-02, JUDGE-06, JUDGE-09, QUAL-03 | T-03-02-04, T-03-02-05, T-03-02-06 | 3-pass restructure; exactly 1 batched call per run; cache; cap-respected; chosen_id index ≤ ranked.length | integration (GREEN) | `npx vitest run src/__tests__/dispatcher.judge-integration.test.ts src/__tests__/judge.test.ts` | src/lib/recgon/dispatcher.ts, judge.ts (CLOSE_CALL_THRESHOLD) | ⬜ pending |
| 03-03-T1 | 03 | 3 | JUDGE-07 | T-03-03-01 | Additive migration; live DB has assignment_reasoning column; existing rows null | manual (blocking) | `mcp__supabase__list_tables \| grep assignment_reasoning` | supabase/migrations/20260514_assignment_reasoning.sql | ⬜ pending |
| 03-03-T2 | 03 | 3 | JUDGE-08 | T-03-03-04 | Single renderer; HTML-stripped; defense-in-depth fallback | unit | `npx vitest run src/__tests__/whyYou.test.ts` | src/lib/recgon/whyYou.ts, whyYou.test.ts | ⬜ pending |
| 03-03-T3 | 03 | 3 | JUDGE-07, JUDGE-08 | T-03-03-01 | Reasoning written to DB; email body contains 'Why you' line; schema validates before write | integration | `npx vitest run src/__tests__/dispatcher.judge-integration.test.ts src/__tests__/whyYou.test.ts` | src/lib/recgon/storage.ts, dispatcher.ts | ⬜ pending |
| 03-03-T4 | 03 | 3 | JUDGE-08 | T-03-03-02, T-03-03-03, T-03-03-06 | API strips whyYouSentence for non-assignee non-owner; raw JSONB never returned | unit (route) | `npx vitest run src/__tests__/assignmentReasoning.privacy.test.ts` | src/app/api/recgon/tasks/[id]/route.ts, TaskDetailPanel.tsx, privacy test | ⬜ pending |
| 03-03-T5 | 03 | 3 | JUDGE-08 | T-03-03-02 | UAT: 3 viewer roles see correct visibility; copy reads naturally | manual (UAT) | n/a (human verify) | n/a | ⬜ pending |
| 03-04-T1 | 04 | 4 | QUAL-01 | T-03-04-03 | 5 fixture × 30 trial bias regression; 15pp band; stubbed default + env-gated real | unit (stubbed) | `npx vitest run src/__tests__/judge.bias-regression.test.ts` | src/__tests__/judge.bias-regression.test.ts | ⬜ pending |
| 03-04-T2 | 04 | 4 | JUDGE-05, QUAL-03 | T-03-04-04 | Validator handles empty/unicode/capitalized/numeric-word edge cases | unit | `npx vitest run src/__tests__/judge.test.ts` | src/lib/recgon/judge.ts, judge.test.ts | ⬜ pending |
| 03-04-T3 | 04 | 4 | QUAL-01 | T-03-04-01, T-03-04-02 | Nightly workflow uses secrets; concurrency-grouped; auto-issue on failure | static | `grep -c "JUDGE_BIAS_REAL_LLM" CLAUDE.md && test -f .github/workflows/judge-bias-nightly.yml` | CLAUDE.md, .github/workflows/judge-bias-nightly.yml | ⬜ pending |
| 03-04-T4 | 04 | 4 | QUAL-01 | T-03-04-03 | Real-LLM run passes 15pp band once before phase ships | manual (one-off) | `JUDGE_BIAS_REAL_LLM=1 npx vitest run src/__tests__/judge.bias-regression.test.ts` | n/a (manual run + baseline recorded in SUMMARY) | ⬜ pending |
| 03-04-T5 | 04 | 4 | (phase roll-up) | n/a | All 12 reqs traced; ROADMAP threshold-lock addendum landed | doc | `test -f .planning/phases/03-llm-judgment-overlay/03-04-SUMMARY.md && grep -c "JUDGE-0\\|QUAL-0" .planning/phases/03-llm-judgment-overlay/03-04-SUMMARY.md` | 03-04-SUMMARY.md, ROADMAP.md addendum | ⬜ pending |

---

## Wave 0 Requirements (test scaffolds RED before implementation)

- [x] `src/__tests__/judge.test.ts` — RED stubs (Plan 01 Task 1) for: valid response parsing, malformed JSON → throw, schema-invalid → throw, post-hoc validator rejection (uncited skill / over-cited count / pronoun / cross-candidate reference), anonymization snapshot (no real names in prompt body), cache-key determinism
- [x] `src/__tests__/judge.bias-regression.test.ts` — Plan 04 Task 1 (built GREEN; stubbed mode IS the wiring check)
- [x] `src/__tests__/dispatcher.judge-integration.test.ts` — RED stub (Plan 02 Task 1) for: 4-task backlog (2 close-call, 2 not) → exactly 1 judge call fires, all 4 tasks get `assignment_reasoning` writes with correct `kind`
- [x] `src/__tests__/judgmentBudget.test.ts` — RED stub (Plan 02 Task 1) for: cap counter, idempotent alert, midnight reset
- [x] `src/__tests__/whyYou.test.ts` — Plan 03 Task 2 (RED + GREEN combined; renderer is pure + small)
- [x] `src/__tests__/assignmentReasoning.privacy.test.ts` — Plan 03 Task 4 (RED + GREEN combined for the route filter)
- [x] `src/__tests__/fixtures/judge-bias/` directory — Plan 01 Task 1 (5 fixture JSON files)

*Existing infrastructure (vitest, supabase-mock pattern from prior phases) covers everything else.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Why you" copy reads naturally in a real assignment email | JUDGE-08 | Subjective tone judgment — `chatViaChain` output is real-LLM, can't be asserted by snapshot only | Run one real dispatch on staging with deliberately-close-fit candidates; open the resulting Resend email + the TaskDetailPanel popup; confirm the sentence references a genuine signal in the candidate's payload and follows the Recgon-as-PM voice (no "AI says...", no robot tone). Plan 03 Task 5. |
| Owner sees every teammate's "Why you" line; assignee sees own only; other teammates see nothing | JUDGE-08 + D-29 privacy rule | Cross-account UI rendering hard to assert in unit tests | Manually open the same assigned task as (a) the assignee, (b) the team owner, (c) a different teammate; confirm the "Why you" block visibility matches the privacy rule. Plan 03 Task 5. |
| Bias regression with REAL LLM (not stub) | QUAL-01 | Stubbed adapter only verifies wiring; real bias check needs real model | Set `JUDGE_BIAS_REAL_LLM=1` and run `npx vitest run src/__tests__/judge.bias-regression.test.ts` once before phase ships; budget ~150 LLM calls (~$0.30 with Gemini Flash). Record per-fixture pickCounts in 03-04-SUMMARY.md as a baseline. Plan 04 Task 4. |

---

## Validation Sign-Off

- [x] All planner tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (judge.test.ts, bias-regression.test.ts, dispatcher.judge-integration.test.ts, judgmentBudget.test.ts, whyYou.test.ts, assignmentReasoning.privacy.test.ts, fixture directory)
- [x] No watch-mode flags in CI commands
- [x] Feedback latency < 30s (quick) / < 120s (full)
- [ ] `nyquist_compliant: true` set in frontmatter — done at the top of this doc

**Approval:** planned (awaiting execution)
