---
phase: 03-llm-judgment-overlay
checked: 2026-05-15
plans_checked: [03-05, 03-06, 03-07]
verdict: approved
score:
  goal_coverage: P
  coupling_integrity: P
  cost_guards: W
  backwards_compatibility: P
  ui_completeness: P
  threat_model: P
  test_coverage: P
  scope_sizing: P
---

## Verdict

**approved** (with two warning-grade tweaks worth a 10-minute touch-up before execution; not blockers)

## Score Card

| Dimension | Score | Notes |
|-----------|-------|-------|
| Goal coverage | P | Both gaps closed in code, not copy. `hasMinimumFit` excludes availability/load from the FIT floor (Plan 06 truth #2). Null `whyYouSentence` from Plan 05 routes to triage in Plan 06 (truth #3). Existing `MIN_FIT_SCORE` + new SIGNAL_FLOOR are two distinct gates — math floor AND per-signal floor both enforced. "Right task → right teammate" rule moves from copy to code. |
| Coupling integrity | P | Plan 06 `depends_on: [05]` is explicit. Plan 06 key_link "dispatcher → Plan 03-05's whyYouSentence via `whyYouSentence === null`" makes the wire concrete. Test in Plan 06 Task 1 (#3) exercises the cross-plan null path with a stubbed `generateWhyYouSentence`. Plan 07 `depends_on: [05, 06]` correctly waits for both. |
| Cost guards | W | Plan 05 Task 5 extends `team_llm_usage` with a `kind` column (defaults to 'judge' for backwards compat) and introduces `consumeLlmBudget(teamId, kind, cap)` so judge cap (50) and why-you cap (150) are independent. Logic is right. **Warning:** cap-exhaustion semantics for why-you cause Gap-1 triage on EVERY remaining dispatch that day — possibly hundreds of triage notes from a single cap breach. Per-team cap=150 is fine for nominal load but worth a comment in the dispatcher header that "cap exhaustion ⇒ full-day triage flood" is the intended fail-mode. |
| Backwards compatibility | P | 43 existing `agent_tasks` rows with `assignment_reasoning=null` continue to render with hidden Why-you block (Plan 05 truth #3). `triage_note` column is additive nullable (Plan 06). Migration `kind text NOT NULL DEFAULT 'judge'` preserves existing `team_llm_usage` rows. Owner-fallback path (`MIN_FIT_SCORE` failure) stays SEPARATE from new `no_clear_fit` triage path (Plan 06 truth #5) — old behavior preserved. |
| UI completeness | P | Plan 07 surfaces triaged tasks via owner-only "needs triage" tile on `/tasks`, TriageBlock in TaskDetailPanel with copy per triage_note, and a manual-assign CTA. Manual-assign API writes `whyYouSentence='Owner manually assigned — no automatic fit found.'` so the renderer reads it like any other reasoning (no special-case path). Plan 07 Task 2 is a `checkpoint:human-verify` so the user approves placement + copy before JSX lands. |
| Threat model | P | All three plans have explicit STRIDE registers. Plan 05 covers prompt injection (task titles never sent), LLM hallucination (substring grounding validator), pronoun deny-list reuse, XSS via stripHtml. Plan 06 covers idempotent triage writes, log auditing of refusals. Plan 07 covers server-side owner check on /assign, race condition with cron, accepted info-disclosure on triage_note (non-PII metadata). |
| Test coverage | P | All 4 critical tests requested are wired: (1) LLM null → dispatcher refuses (Plan 06 Task 1 test #3), (2) `hasMinimumFit` excludes availability/load (Plan 06 Task 1 boundary test #5), (3) triage privacy at UI layer (Plan 07 Task 3 RTL test), (4) bias regression on new prompt with 5 fixtures × 30 trials (Plan 05 Task 4). Plus grounding validator unit tests (Plan 05 Task 3), boundary tests at SIGNAL_FLOOR=0.15 (Plan 06 Task 1), manual-assign API 5-scenario test (Plan 07 Task 1). |
| Scope sizing | P | Plan 05: 5 tasks (2 checkpoint, 3 auto — borderline at "5" but Task 2 is a user-approval checkpoint, not real implementation; effective work is 4 tasks). Plan 06: 3 tasks. Plan 07: 3 tasks. Total ~11 tasks across 3 plans, executable across 3 single-session waves. Single dev (eneskis) ~30hr/wk — Wave 1 (Plan 05) ~6-8hr, Wave 2 (Plan 06) ~3hr, Wave 3 (Plan 07) ~4hr. Fits a week. |

## Critical Findings

None. No F-scored dimensions.

## Suggested Tweaks (Warning-grade)

### W-1: Document the cap-exhaustion fail-mode in dispatcher header

**Where:** `src/lib/recgon/dispatcher.ts` header comment update in Plan 06 Task 3.

**What to add (one line):** "If `team_llm_usage.kind='why_you'` cap is exhausted, ALL remaining auto-dispatches that day fall to triage_note='no_grounded_reason' — this is the intended fail-mode under D-30 (safety, not quality) but expect a triage spike in the owner UI on cap-breach days."

**Why:** Cap=150 covers ~3× nominal load, but a runaway cron loop or a sudden backlog could exhaust the budget and flood the owner with triage tasks. The behavior is correct (refuse rather than ghost-assign), but the owner-facing impact is not documented anywhere. A header note costs nothing and prevents future debugging confusion.

### W-2: Plan 05 Task 5 phrasing — the `consumeLlmBudget` helper signature

**Where:** Plan 05 Task 5 action, Phase 2.

**What:** The plan says "Wire one shared `consumeLlmBudget(teamId, kind, capPerKind)` helper in `judgmentBudget.ts`." The current `judgmentBudget.ts` exports `checkAndIncrement` (cap=50, hardcoded). Renaming or shadowing it risks breaking the 9 existing `judgmentBudget.test.ts` tests. The cleanest path is **add** `consumeLlmBudget(teamId, kind, cap)` as a new export and have `checkAndIncrement` become a thin wrapper that calls `consumeLlmBudget(teamId, 'judge', 50)`. The plan implies this but doesn't state it. Worth a one-sentence clarification in the executor's hands so they don't refactor the existing exported API.

**Suggested rewrite:** "Add `consumeLlmBudget(teamId, kind, cap)` as a NEW export. Refactor existing `checkAndIncrement` into a thin wrapper: `checkAndIncrement(teamId) = consumeLlmBudget(teamId, 'judge', 50)`. The 9 existing budget tests stay GREEN with no source changes."

## Coverage Audit

### Gap 1 (zero-signal assignment refusal)

| Required behavior | Where enforced | Test |
|-------------------|----------------|------|
| `hasMinimumFit` excludes availability/load | Plan 06 match.ts | Plan 06 Task 1 test #5 (avail=1.0 alone → false) |
| All-zero candidates → triage_note='no_clear_fit' | Plan 06 dispatcher Pass 3 | Plan 06 Task 1 test #1 |
| Triage is idempotent across cron retries | Plan 06 storage.markTaskForTriage | Plan 06 Task 1 test #4 |
| Owner sees + acts on triaged tasks | Plan 07 TaskDetailPanel + /assign API | Plan 07 Tasks 1 & 3 |
| Single-task path (`dispatchTask`) honors same rule | Plan 06 Task 3 | Plan 06 Task 1 test #5 |

### Gap 2 (grounded Why-you reasoning)

| Required behavior | Where enforced | Test |
|-------------------|----------------|------|
| Every assignment calls LLM for Why-you | Plan 05 dispatcher.buildAssignmentReasoningAsync | Plan 05 Task 5 (renderer reads pre-rendered sentence) |
| Math-only template path DELETED | Plan 05 whyYou.ts MATH_SIGNAL_COPY removed | Plan 05 verification grep returns 0 |
| Sentence must cite real signal in payload | Plan 05 grounding validator | Plan 05 Task 1 test #2 (Rust not in skills → null) |
| Null sentence → dispatcher refuses | Plan 06 (coupling) | Plan 06 Task 1 test #3 |
| Bias regression for new prompt | Plan 05 Task 4 | 5 fixtures × 30 trials, stubbed + env-gated real |
| Anonymization end-to-end (no real names) | Plan 05 Task 1 test (bias-anonymization) | 150 prompt bodies, zero name leak |

### Requirement Coverage

| Requirement | Status |
|-------------|--------|
| GAP-3.1-01 (refusal) | Covered by Plan 06 + UI surface in Plan 07 |
| GAP-3.1-02 (grounded Why-you) | Covered by Plan 05 |
| JUDGE-05 (math fallback) | Extended correctly — fallback is now to triage, not silent ghost-assign, when both math AND LLM agree there's no signal |
| JUDGE-08 (Why-you in email + UI) | Re-validated — every assignment, not just close calls |
| QUAL-01 (bias regression) | New prompt covered with separate fixture set |
| QUAL-03 (post-hoc validator) | Grounding validator in `generateWhyYouSentence` |

No locked decision contradicted, no deferred idea included, all CONTEXT.md D-27..D-30 honored.

## Approval Recommendation

Execute as-is, optionally apply the two warning-grade tweaks (one-line dispatcher comment per W-1, one-sentence Task 5 action clarification per W-2) before kicking off Wave 1. The plans rigorously solve both gaps: the dispatcher REFUSES zero-fit assignments via a code-enforced floor that excludes availability/load (not just a copy fix), and every assignment gets an LLM-grounded Why-you sentence that — if it can't cite a real signal — triggers the same refusal pipeline. The coupling between Plans 05 and 06 is wired through `whyYouSentence === null` with an explicit test. Backwards compatibility for the 43 existing tasks, scope sizing for a single dev, threat models, and test coverage all check out. Ready for execution.

---
*Plan-check completed: 2026-05-15*
*Checker: Claude (gsd-plan-checker)*
