---
phase: 3
slug: llm-judgment-overlay
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
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
| **Estimated runtime** | ~30 seconds (full suite ~2 min) |

---

## Sampling Rate

- **After every task commit:** Run quick command (judge.test.ts)
- **After every plan wave:** Run `npm run test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green + bias-regression must pass with stubbed adapter
- **Max feedback latency:** ~30 seconds (quick); ~120 seconds (full)

---

## Per-Task Verification Map

> Filled in by the planner — each PLAN task gets a row mapping it to a requirement, test type, and command.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _to be filled by planner_ | | | | | | | | | ⬜ pending |

---

## Wave 0 Requirements (test scaffolds RED before implementation)

- [ ] `src/__tests__/judge.test.ts` — RED stubs for: valid response parsing, malformed JSON → throw, schema-invalid → throw, post-hoc validator rejection (uncited skill / over-cited count / pronoun / cross-candidate reference), anonymization snapshot (no real names in prompt body)
- [ ] `src/__tests__/judge.bias-regression.test.ts` — RED stubs for: 5 culturally-spread fixtures × 30 runs each = 150 trials; pass when no fixture's pick rate deviates > 15pp from baseline 20%
- [ ] `src/__tests__/dispatcher.judge-integration.test.ts` — RED stub for: 4-task backlog (2 close-call, 2 not) → exactly 1 judge call fires, all 4 tasks get `assignment_reasoning` writes with correct `kind`
- [ ] `src/__tests__/fixtures/judge-bias/` directory — 5 fixture JSON files (one per name spread)

*Existing infrastructure (vitest, supabase-mock pattern from prior phases) covers everything else.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Why you" copy reads naturally in a real assignment email | JUDGE-08 | Subjective tone judgment — `chatViaChain` output is real-LLM, can't be asserted by snapshot only | Run one real dispatch on staging with deliberately-close-fit candidates; open the resulting Resend email + the TaskDetailPanel popup; confirm the sentence references a genuine signal in the candidate's payload and follows the Recgon-as-PM voice (no "AI says...", no robot tone) |
| Owner sees every teammate's "Why you" line; assignee sees own only; other teammates see nothing | JUDGE-08 + D-29 privacy rule | Cross-account UI rendering hard to assert in unit tests | Manually open the same assigned task as (a) the assignee, (b) the team owner, (c) a different teammate; confirm the "Why you" block visibility matches the privacy rule |
| Bias regression with REAL LLM (not stub) | QUAL-01 | Stubbed adapter only verifies wiring; real bias check needs real model | Set `JUDGE_BIAS_REAL_LLM=1` and run `npx vitest run src/__tests__/judge.bias-regression.test.ts` once before phase ships; budget ~150 LLM calls (~$0.30 with Gemini Flash) |

---

## Validation Sign-Off

- [ ] All planner tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (judge.test.ts, bias-regression.test.ts, judge-integration.test.ts, fixture directory)
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 30s (quick) / < 120s (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
