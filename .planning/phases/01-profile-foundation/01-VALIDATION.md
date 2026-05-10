---
phase: 1
slug: profile-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Scaffold seeded from research's Validation Architecture; planner fills in
> Per-Task Verification Map rows from PLAN.md tasks.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already wired — `npm run test`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run src/__tests__/<file>.test.ts` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~30 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run quick-run for the file(s) the task touched
- **After every plan wave:** Run full suite (`npm run test -- --run`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Filled in by the planner once PLAN.md tasks are emitted. One row per task that touches code; manual-only behaviors below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _TBD_ by planner | — | — | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Seeded from research §Validation Architecture. Planner confirms / adds as needed.

- [ ] `src/__tests__/profileMerge.test.ts` — covers PROFILE-04, PROFILE-06 (field-level merge: self wins when filled, owner fills blanks; backwards-compatible when no profile row exists)
- [ ] `src/__tests__/skillVocabulary.test.ts` — covers PROFILE-03 (extracted vocab === inlined vocab in `prompts.ts` lines 887–921; same source feeds picker + `skillTagger`)
- [ ] `src/__tests__/profileNormalization.test.ts` — covers PROFILE-03, QUAL-05, QUAL-06 (chatViaChain at temperature 0; raw-text fallback on dual-provider failure; post-hoc canonical filter rejects hallucinated tags; Zod schema validates output)
- [ ] `src/__tests__/matchInterestNudge.test.ts` — covers PROFILE-02 (interest-nudge ≤ 0.05 applied AFTER weighted sum; ties broken; never overrides genuine skill differences)
- [ ] `npm install cmdk@^1.1.1` — install missing dep (research finding #1; verified absent from `package.json`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Teammate fills profile at `/teams/[id]/me`, saves, reloads, sees values | Success Criterion 1 | Cross-process UI + DB round-trip | 1. Log in as teammate. 2. Visit `/teams/[id]/me`. 3. Fill skills/strengths/interests/capacity. 4. Save. 5. Reload. 6. Confirm all four fields persist with canonical-tag annotation visible. |
| Next dispatcher cron after save assigns at least one task whose `requiredSkills` match new self-declared skills | Success Criterion 2 | E2E through cron — manually triggered | 1. Confirm baseline assignment (no profile). 2. Save profile with a skill matching an open task's `requiredSkills`. 3. Manually trigger `/api/cron/llm-jobs` (or whichever runs the dispatcher). 4. Confirm assignment audit shows the teammate received that task and `profileMerge` was on the read path. |
| Skill picker labels === `skillTagger` output labels for the same concepts | Success Criterion 3 | Visual + audit | 1. Open picker, list visible canonical suggestions. 2. Cross-check against `skillTagger` output on a representative task batch. 3. Confirm zero label drift. |
| Disabled "What GitHub will say about you — coming soon" placeholder renders correctly in both themes | D-09 | Visual | 1. Inspect `/teams/[id]/me` in light + dark mode. 2. Confirm placeholder section is visibly disabled, no fake data, no layout shift on hover/focus. |

---

## Validation Sign-Off

- [ ] All PLAN.md tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references in the per-task map
- [ ] No watch-mode flags (always `--run`)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter once planner fills the map and Wave 0 is green

**Approval:** pending
