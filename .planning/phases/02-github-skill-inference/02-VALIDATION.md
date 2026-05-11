---
phase: 02
slug: github-skill-inference
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (already configured per CLAUDE.md) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run full suite + `npm run build` + `npm run lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Populated by planner from PLAN.md `<automated>` blocks after planning completes. Initial stubs below for each Wave-0 test file identified in RESEARCH.md §11.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SKILL-01 | T-02-01 | Consent required before mining; no row in `teammate_inferred_skills` without `github_mining_consent_at` | unit | `npm run test -- src/__tests__/githubSkills.consent.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | SKILL-02 | T-02-02 | 6-month rolling window enforced; personal repos rejected | unit | `npm run test -- src/__tests__/githubSkills.mining.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | SKILL-02, QUAL-02 | T-02-03 | LLM commit-title batch wrapped in `<user_content>`; delimiters stripped from input | unit | `npm run test -- src/__tests__/wrapUntrusted.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | SKILL-03 | T-02-04 | Per-skill confirm/reject toggle; rejection persists across re-mines | integration | `npm run test -- src/__tests__/inferredSkills.ui.test.tsx` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | SKILL-04 | — | `profileMerge` 3-source blend (0.5/0.3/0.2); rejected tags excluded | unit | `npm run test -- src/__tests__/profileMerge.inferred.test.ts` | ✅ extend | ⬜ pending |
| 02-04-02 | 04 | 2 | SKILL-05 | — | `applyTimeDecay(score, lastSeenAt, now, τ=90d)` returns `score * exp(-Δt/τ)`; read-time only | unit | `npm run test -- src/__tests__/fitLearning.timeDecay.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-03 | 04 | 2 | SKILL-06 | — | Empty-commit scan emits no skills but records `last_scan_at`; banner suppressed | unit | `npm run test -- src/__tests__/githubSkills.empty.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/githubSkills.consent.test.ts` — consent gate enforcement (SKILL-01)
- [ ] `src/__tests__/githubSkills.mining.test.ts` — 6-month window + team-repo-only (SKILL-02)
- [ ] `src/__tests__/wrapUntrusted.test.ts` — delimiter-strip + cap (QUAL-02)
- [ ] `src/__tests__/inferredSkills.ui.test.tsx` — per-pill confirm/reject (SKILL-03)
- [ ] `src/__tests__/fitLearning.timeDecay.test.ts` — τ=90d decay math (SKILL-05)
- [ ] `src/__tests__/githubSkills.empty.test.ts` — empty-scan handling (SKILL-06)
- [ ] Octokit mock seam in `src/__tests__/mocks/octokit.ts` — shared fixture for commit-listing
- [ ] `chatViaChain` stub helper in `src/__tests__/mocks/llm.ts` — reuse existing pattern from Phase 1

*Vitest 4.x already configured (CLAUDE.md). No new framework installs required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real GitHub OAuth scope-upgrade flow (`public_repo` → `repo`) | SKILL-01 | Requires live GitHub OAuth; cannot reliably automate scope-upgrade dance in CI | 1. Log in with existing `public_repo` token 2. Visit `/teams/[id]/me` 3. Click "Enable GitHub Skill Mining" 4. Confirm GitHub shows new `repo` scope on consent screen 5. Verify `teammate_profiles.github_mining_consent_at` populated |
| Weekly cron drain on Vercel | SKILL-02 | Cron schedule only runs on Vercel platform; local dev skips | 1. Deploy to Vercel preview 2. Manually POST `/api/cron/github-skill-inference` with `CRON_SECRET` 3. Confirm jobs enqueued in `llm_jobs` 4. Wait one drain cycle; verify `teammate_inferred_skills` populated |
| LLM cost ceiling under Standard depth | QUAL-02 | Real LLM call cost — only observable in prod | 1. Run full mine for 1 teammate with Standard depth 2. Check Gemini usage dashboard 3. Verify ≤1 LLM call per teammate per scan |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
