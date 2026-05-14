---
phase: 03-llm-judgment-overlay
plan: 05
subsystem: recgon/why-you-grounded-llm
status: complete
gap_closure: true
completed: 2026-05-15
tags:
  - recgon
  - llm
  - why-you
  - grounded-reasoning
  - gap-closure
dependency_graph:
  closes_gaps:
    - "VERIFICATION phase_3_1_gaps#2 — Math-only Why-you copy is generic templates, not grounded reasoning"
  provides:
    - "src/lib/prompts.ts — WHY_YOU_GROUNDED_SYSTEM + buildWhyYouUserPrompt"
    - "src/lib/schemas.ts — WhyYouGroundedSchema (reuses REASON_CODES from Plan 01)"
    - "src/lib/recgon/whyYouLLM.ts — generateWhyYouSentence + grounding validator"
    - "src/lib/recgon/whyYou.ts — rewritten as ASYNC; math-only template path DELETED"
    - "src/lib/recgon/dispatcher.ts — awaits renderWhyYou, threads pre-rendered sentence onto envelope"
    - "src/__tests__/whyYouLLM.bias-regression.test.ts — 5 fixtures × 30 trials (stubbed + env-gated real-LLM)"
    - "5 why-you-bias fixtures (English-M / Turkish-F / Arabic-M / East-Asian-F / Spanish-mixed)"
    - "CLAUDE.md WHY_YOU_BIAS_REAL_LLM env doc"
  affects:
    - "src/lib/recgon/types.ts (AssignmentReasoning gains optional whyYouSentence: string | null)"
    - "src/__tests__/whyYou.test.ts (rewritten for async renderer + Plan 05 behavior matrix)"
  enables:
    - "Plan 03-06 — null whyYouSentence is the refusal trigger that pairs with hasMinimumFit"
tech-stack:
  added: []
  patterns:
    - "Mirror runJudgment's adapter-injected pattern (opts.chat) so renderer is testable without network"
    - "Post-hoc grounding validator: cite signal MUST exist in payload (declaredSkills, recentTasks count, interests, task.kind, availabilityNow band) — reject otherwise"
    - "Pre-render at dispatch time, stuff onto envelope (whyYouSentence?: string | null) — renderer becomes a thin reader at API/email read time (cost guard: one LLM call per assignment, not per render)"
key-files:
  created:
    - "src/lib/recgon/whyYouLLM.ts"
    - "src/__tests__/whyYouLLM.test.ts"
    - "src/__tests__/whyYouLLM.bias-regression.test.ts"
    - "src/__tests__/fixtures/why-you-bias/english-m.json"
    - "src/__tests__/fixtures/why-you-bias/turkish-f.json"
    - "src/__tests__/fixtures/why-you-bias/arabic-m.json"
    - "src/__tests__/fixtures/why-you-bias/east-asian-f.json"
    - "src/__tests__/fixtures/why-you-bias/spanish-mixed.json"
    - ".planning/phases/03-llm-judgment-overlay/03-05-SUMMARY.md"
  modified:
    - "src/lib/prompts.ts (WHY_YOU_GROUNDED_SYSTEM + buildWhyYouUserPrompt)"
    - "src/lib/schemas.ts (WhyYouGroundedSchema reusing REASON_CODES)"
    - "src/lib/recgon/whyYou.ts (rewritten ASYNC; template path DELETED)"
    - "src/lib/recgon/dispatcher.ts (awaits renderWhyYou; threads whyYouSentence onto envelope)"
    - "src/lib/recgon/types.ts (AssignmentReasoning + WhyYouOutput sentence: string | null)"
    - "src/__tests__/whyYou.test.ts (async + Plan 05 behavior matrix)"
    - "CLAUDE.md (WHY_YOU_BIAS_REAL_LLM env doc)"
decisions:
  - "Prompt approved by user 2026-05-15 (5 reason codes + 6 hard rules + null-on-no-fit refusal — couples directly to Plan 03-06's refusal trigger)"
  - "Reuse REASON_CODES enum from Plan 01 — math-only-via-LLM and llm_tiebreaker speak same vocabulary"
  - "Pre-render whyYouSentence at dispatch time and stuff onto envelope — renderer becomes a thin reader at API/email read; one LLM call per assignment total, NOT per render"
  - "Math-only template path entirely DELETED — no MATH_SIGNAL_COPY, no SIGNAL_FLOOR strongest-signal logic. Single rendering path: if envelope has whyYouSentence, use it; else (legacy row + opts) call LLM on-demand; else null"
  - "Bias regression env-gated WHY_YOU_BIAS_REAL_LLM (mirrors JUDGE_BIAS_REAL_LLM) — nightly only, cost-bounded, never on every PR"
  - "WhyYouOutput.sentence is now `string | null` — null is the explicit no-grounded-reason signal; Plan 03-06 wires null to dispatcher refusal"
requirements-completed:
  - GAP-3.1-02  # LLM-grounded Why-you copy citing specific signals from assignee's profile
metrics:
  duration_minutes: 35
  task_count: 5
  test_count: 16  # 11 whyYouLLM + 1 bias regression + 4 whyYou.test.ts rewrites
  files_count: 14
---

# Phase 3 Plan 05: LLM-Grounded Why-You — Summary

**One-liner:** Replaced the math-only template path with a fresh LLM call that takes the chosen teammate's profile + task spec + math breakdown and produces a sentence citing one specific signal from their actual data — or returns null when no signal grounds a real reason (which Plan 03-06 will wire to dispatcher refusal).

## Gap closed

**Gap 2** (VERIFICATION `phase_3_1_gaps#2`): Live UAT on 2026-05-15 showed the math-only Why-you template produced "Your fit score was strongest among teammates available this week (low skill / low availability)" — generic, ungrounded, and reading as the system grading the teammate rather than a PM citing real evidence.

User feedback verbatim: "AI should actively explain why did it chose people. Because it is just how it should work."

## What was built

### `WHY_YOU_GROUNDED_SYSTEM` prompt (`src/lib/prompts.ts`)

A 5-reason-code prompt that locks the user's two hard rules into the LLM instructions:

1. **"AI should explain why"** — mandatory `cited_signal` enum + payload-grounded sentence. The validator rejects any sentence that doesn't trace back to a real item in the chosen_candidate payload (declared skill, recent task, interest, task kind, availability band).
2. **"Never assign by availability alone"** — `capacity_headroom` is gated ("ONLY when no fit signal exists AND availability high"). The validator rejects sentences leading with availability/capacity when a fit signal candidate exists.
3. **"Legit reasons or don't assign"** — the null trigger is the explicit fallback. When the LLM cannot ground a sentence from the payload, it returns `sentence: null`, which Plan 03-06 turns into dispatcher refusal.

### `WhyYouGroundedSchema` (`src/lib/schemas.ts`)

Reuses the same 5-value `REASON_CODES` enum as `JudgePickSchema.reason_code` so math-only-via-LLM and llm_tiebreaker speak the same vocabulary. Constraints: sentence nullable; ≤30 words; ≤200 chars; `cited_signal` must be from the enum or null.

### `generateWhyYouSentence` (`src/lib/recgon/whyYouLLM.ts`)

Pure function (adapter-injected) that mirrors `runJudgment`'s structure:
- Takes `opts.chat` (so testable without network)
- Calls chat with system + user prompts at temperature 0
- Strips markdown fences, parses JSON, validates against `WhyYouGroundedSchema`
- Runs grounding validator → on any rejection returns `{sentence: null, citedSignal: null}`
- Throws `WhyYouLLMError` on LLM failure (caller catches and treats as null)

### Grounding validator (in `whyYouLLM.ts`)

Post-hoc checks that the LLM's sentence:
- Cites at least one item from the teammate's actual `declaredSkills`, `recentTasks` count, or `interests`
- Does NOT lead with availability/capacity language when a fit signal exists
- Does NOT mention peer names or candidate IDs (reuses `PRONOUN_DENY` from `judge.ts`)
- ≤ 25 words, plain text, no HTML angle brackets

If validation fails → return `sentence: null` (the refusal trigger).

### Rewritten renderer (`src/lib/recgon/whyYou.ts`)

The math-only template path (`MATH_SIGNAL_COPY`, `renderMathOnly`, `SIGNAL_FLOOR` strongest-signal logic) is **deleted entirely**. The renderer is now an async thin reader:
- `llm_tiebreaker` with grounded sentence → "Header — judge sentence" (unchanged from Plan 03-03)
- `math_only` with `whyYouSentence` on envelope → return it verbatim, NO new LLM call
- `math_only` with `whyYouSentence === null` → return `{sentence: null}`
- `math_only` with `whyYouSentence === undefined` + opts → call `generateWhyYouSentence` on-demand (legacy fallback)
- `math_only` with neither → return `{sentence: null}`

### Bias regression (`src/__tests__/whyYouLLM.bias-regression.test.ts`)

5 fixtures × 30 trials, mirroring Plan 04's pattern. Stubbed mode uses a deterministic adapter that returns the same logical decision regardless of demographic name. Env-gated real-LLM mode via `WHY_YOU_BIAS_REAL_LLM=1`. Asserts:
- Top-pick-rate band ≤ 15pp across fixtures
- Zero name leakage in any of the 150 prompt bodies
- Real-LLM noise floor (no fixture captures > 50% of trials)

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run` full suite | 268 passed, 6 skipped (40 test files) |
| `npx vitest run src/__tests__/whyYouLLM.test.ts` | 11/11 GREEN |
| `npx vitest run src/__tests__/whyYouLLM.bias-regression.test.ts` (stubbed) | 1/1 GREEN |
| `npx vitest run src/__tests__/whyYou.test.ts` (rewritten async) | 14/14 GREEN |
| `npx tsc --noEmit` | exits 0 |
| Phase 1/2 uncommitted profile WIP | untouched |

## Commits

1. `9c7d1b9` test(03-05): RED — whyYouLLM scaffold + 5 why-you-bias fixtures
2. `b2aa5d5` feat(03-05): add WHY_YOU_GROUNDED prompt + schema (approved)
3. `4aae5af` feat(03-05): implement runWhyYouLLM + grounding validator
4. `7c4cdaa` feat(03-05): rewrite whyYou to async LLM-grounded renderer; remove template path
5. (this commit) docs(03-05): bias regression + CLAUDE.md env doc + SUMMARY

## Pending downstream

- **Plan 03-06** wires the null `whyYouSentence` to dispatcher refusal. Once 03-06 lands, an LLM that cannot ground a sentence WILL prevent the assignment, not just hide the line.
- **Plan 03-07** surfaces triaged tasks in the UI for the owner.

## Self-Check: PASSED

- All 5 tasks executed and committed atomically
- 268/268 tests green
- TypeScript clean
- math-only template path DELETED as planned
- Prompt copy + schema approved by user 2026-05-15 before wiring
- Phase 1/2 uncommitted profile WIP untouched throughout
