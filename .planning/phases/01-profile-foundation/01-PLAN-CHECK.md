---
phase: 1
slug: profile-foundation
type: plan-check
status: PASS-WITH-FIXES
verifier: gsd-plan-checker
checked_at: 2026-05-11
plans_checked: 4
blockers: 2
warnings: 4
info: 3
---

# Phase 1 — Plan-Check Verdict

## Verdict: PASS-WITH-FIXES

Plans 01–04 + SKELETON.md, taken together, deliver the Phase 1 goal as written in ROADMAP.md and bind every PROFILE-0x / QUAL-05/06 requirement to at least one task. Cross-plan signatures align (`profileMerge(t, profile, null, ema)` is consistent between Plan 02 emit and Plan 04 wiring; `listProfiles(teamId)` shape consistent between Plan 03 and Plan 04). UI-SPEC fidelity is high in Plan 03 — typography (4 sizes), color budget (5 reserved accent surfaces), and the `aria-label="Remove {chip text}"` contract are all faithfully encoded in plan prose, though not all enforced in acceptance grep.

**Two BLOCKERS prevent green-lighting execute as-is**, both arising from inaccurate codebase assumptions in PATTERNS.md that propagated into Plans 03 and 04. Warnings cover scope discipline, validation completeness, and rebind correctness in the dispatcher wiring. None of the blockers require re-planning from scratch — they are localized fixes to Plan 03 (nav-link target + acceptance greps) and Plan 04 (dispatcher rebind specificity + smoke test depth).

---

## Goal Achievement Check

| Requirement | Plan | Coverage | Notes |
|---|---|---|---|
| PROFILE-01 (form at `/teams/[id]/me`) | 03 (Task 3.3) | COVERED | Page + ProfileForm with all four fields per UI-SPEC. |
| PROFILE-02 (canonical vocab shared with skillTagger) | 01 (Task 1.1) | COVERED | `skillVocabulary.ts` extracted; `prompts.ts` interpolates; `skillTagger.ts` imports `CANONICAL_SET`. |
| PROFILE-03 (additive `teammate_profiles` table) | 01 (Task 1.2) + 03 (Task 3.1) | COVERED | Migration + storage layer + upsert path all explicit. |
| PROFILE-04 (dispatcher reads through `profileMerge`) | 02 (Task 2.1) + 04 (Task 4.1) | PARTIAL — see Blocker B-02 | Function exists; wiring task underspecifies the rebind point inside the loop. |
| PROFILE-05 (next cron respects new values) | 04 (Task 4.1 + 4.2) | COVERED | Smoke test Scenario B asserts assignment flips when profile is set. |
| PROFILE-06 (capacity feeds `match.ts` without math change) | 02 (Task 2.1) | COVERED | `profileMerge` returns `capacityHours`; match.ts unchanged for that path. |
| QUAL-05 (chatViaChain) | 03 (Task 3.1) | COVERED | `normalizeProfile.ts` uses `chatViaChain`; acceptance grep enforces. |
| QUAL-06 (`temperature: 0`) | 03 (Task 3.1) | COVERED | Acceptance grep enforces. |

All 8 requirements have at least one covering task. PROFILE-04 is the only PARTIAL — see Blocker B-02.

---

## Contract Alignment

### UI-SPEC fidelity (Plan 03)

| UI-SPEC contract | Plan 03 status | Notes |
|---|---|---|
| 4 typography sizes (28/20/16/12), 2 weights (400/600) | COVERED (in prose) | Plan 03 references UI-SPEC explicitly; no contradictory inline sizes. |
| 5 reserved-for accent surfaces | COVERED | Action mentions signature-pink CTA + 64px heading underline; doesn't add new accent uses. |
| Pill `aria-label="Remove {chip text}"` + `aria-hidden="true"` on icon | NOT ENFORCED IN ACCEPTANCE — see W-04 | Action mentions remove button but no acceptance grep enforces `aria-label` shape. |
| Disabled GitHub placeholder with `pointer-events: none`, `tabindex="-1"`, no fake data | PARTIAL — see W-04 | Plan mentions disabled placeholder but acceptance only greps the heading string, not the disabled-state contract. |
| Cross-teammate read view (`?user=otherId`) for `team_visible` | COVERED | Plan 03 Task 3.2 GET handler implements visibility check correctly per Pitfall 6. |
| 12px `matched as canonical` annotation, JetBrains Mono 400, `--txt-faint` | NOT ENFORCED — see W-04 | Plan asserts `matched as` string presence but does not enforce the typography contract. |

### CONTEXT.md drift

- **D-01..D-08 (form fields + merge policy):** All honored. Plan 02's profileMerge implements D-06 field-level fallback + D-08 null-profile passthrough; Plan 01 migration matches D-04 unique key `(team_id, user_id)`.
- **D-09 (disabled GitHub placeholder):** Honored in Plan 03 (Task 3.3 step A), though acceptance underspecified — see W-04.
- **D-10 (nav link in team menu only):** **Honored in intent, broken in implementation — see Blocker B-01.**
- **D-12..D-16 (cmdk picker + transparent canonical translation):** Honored in Plan 03; cmdk install in Plan 01 Task 1.3.
- **D-17..D-20 (visibility):** Honored. Plan 01 adds `profile_visibility` column to `teams`; Plan 03 Task 3.2 GET enforces server-side.
- **D-21 (Recgon-as-AI-PM voice):** Honored. Copy strings in UI-SPEC §Copywriting Contract referenced; banned-string list intact.
- **D-22 / D-23 (design tokens):** Honored. No new aesthetics; existing `.glass-card` + `var(--signature)` referenced throughout.

### PATTERNS.md drift

- **16 / 16 files have analogs declared** and the analog files exist and are load-bearing (`storage.ts` for profileStorage, `20260428_project_integrations.sql` for the migration, `recgonMatch.test.ts` for tests).
- **One PATTERNS.md inaccuracy** (also propagated to Plans 03 and 04): `src/app/teams/[id]/page.tsx` is listed as both the "existing team page" pattern source and the nav-link insertion target. **That file does not exist in the codebase** — see Blocker B-01.

---

## Cross-Plan Consistency

| Contract | Producer | Consumer | Match? |
|---|---|---|---|
| `profileMerge(t, profile, null, ema): Teammate & { interests?: string[] }` | Plan 02 Task 2.1 | Plan 04 Task 4.1 helper `applyProfileMerge` | identical signature |
| `listProfiles(teamId): Promise<TeammateProfile[]>` | Plan 03 Task 3.1 | Plan 04 Task 4.1 `applyProfileMerge` | identical signature |
| `CANONICAL_SET` membership semantics | Plan 01 Task 1.1 | Plan 03 Task 3.1 `normalizeProfile.ts` post-hoc filter | matches |
| `TeammateProfile` shape (`skillsRaw`/`skillsCanonical` etc.) | Plan 01 Task 1.1 (type) + Task 1.2 (columns) | Plan 03 Task 3.1 (mapTeammateProfile) + Plan 02 (profileMerge field reads) | matches; Plan 03 `upsertProfile` payload includes `normalization_pending` matching the column added in Plan 01. |
| `INTEREST_NUDGE_WEIGHT` cap <= 0.05 | Plan 02 Task 2.2 | match.ts internal | tested both via cap-enforcement and no-flip-on-strict-better-skills tests. |
| Plan 03's hand-off note ("Plan 04 must call profileMerge(t, profileByUserId.get(t.userId), null, t.fitProfile)") | Plan 03 output | Plan 04 Task 4.1 `applyProfileMerge` body | matches; Plan 04 builds the same Map and call shape. |

No internal contract drift detected.

---

## Critical Issues (must-fix before execute)

### BLOCKER B-01 — Nav-link insertion target file does not exist

**Plan:** 03 (Task 3.3 Step C) — also PATTERNS.md and Plan 04 manual-verify (Task 4.3 step 3).

**Issue:** Both PATTERNS.md ("src/app/teams/[id]/page.tsx — existing team page") and Plan 03 Task 3.3 Step C ("In src/app/teams/[id]/page.tsx … add `<Link href={`/teams/${id}/me`}>My profile</Link>`") and Plan 04 Task 4.3 step 3 ("Navigate via the team menu to /teams/[id]/me") assume `src/app/teams/[id]/page.tsx` exists.

**Verified reality:** Only three team pages exist:
- `src/app/teams/page.tsx`
- `src/app/teams/setup/page.tsx`
- `src/app/teams/invite/[token]/page.tsx`

There is **no `src/app/teams/[id]/page.tsx`** in the working tree. Team-scoped navigation lives in `src/components/v2/TopNavV2.tsx` and `src/components/TeamSwitcher.tsx`.

**Consequence:** Plan 03's nav-link grep acceptance criterion targets a file that does not exist. PROFILE-01 discoverability (D-10) is silently broken; teammates have no way to navigate to `/teams/[id]/me` after Plan 03 lands.

**Fix:**
1. Update CONTEXT.md `<canonical_refs>` and PATTERNS.md to remove the non-existent file.
2. Plan 03 Task 3.3 Step C: change the insertion target to **`src/components/v2/TopNavV2.tsx`** (the team-aware top nav) OR **`src/components/TeamSwitcher.tsx`** (the team dropdown). Pick one and lock it in the plan action. The link must only render when a team context is active.
3. Update Plan 03 acceptance criteria grep to target the chosen file.
4. Update Plan 04 Task 4.3 step 3 manual-verify language to match the new nav location.

**Severity rationale:** Without the nav link, PROFILE-01 success criterion ("teammate navigates to /teams/[id]/me") is unverifiable without typing the URL manually. D-10 explicitly mandates discovery via nav link only — this is the only discovery surface and must work.

---

### BLOCKER B-02 — Plan 04 underspecifies the rebind point that actually matters

**Plan:** 04 (Task 4.1 Step C + Step D).

**Issue:** Plan 04's action says: "Then replace every downstream use of `teammates` (in the same function scope) that flows into `rankMatches` or matching helpers with `mergedTeammates`." Verified `dispatcher.ts` reality:

- **runDispatch (line 116):** `teammates` is passed positionally into `backfillLegacySchedules(teamId, teammates)` AND into `dispatchSingleTask(teamId, task, teammates)` inside a loop (line 128). The matching helpers that invoke `rankMatches` sit two stack frames deeper.
- **runDispatch also passes `teammates` to `backfillLegacySchedules`** (line 122). `backfillLegacySchedules` deals with scheduling on the assignee's calendar and has no business with merged interests/capacities. Blind rebind regresses scheduling.
- **dispatchTask (line 395):** same `teammates` passed into `dispatchSingleTask` at line 396.
- **Helper type signatures at lines 154, 178, 296:** `teammates: Awaited<ReturnType<typeof listTeammatesWithStats>>` — switching input shape to `Teammate & { interests?: string[] }` may break these signatures unless the helper accepts a superset.

The plan's verification (`grep -c "mergedTeammates" >= 4`) does not constrain WHICH downstream uses are rebound. An executor following the plan literally could (a) miss the critical `dispatchSingleTask(teamId, task, teammates)` rebind — leaving match math reading owner rows even though the merged list was built — or (b) over-rebind into `backfillLegacySchedules`, breaking scheduling.

**Consequence:** PROFILE-04 / PROFILE-05 may silently regress. The E2E smoke test in Task 4.2 mocks `rankMatches` directly, masking the bug — the smoke proves the helper is called but not that `dispatchSingleTask`'s production call path actually receives `mergedTeammates`.

**Fix:**
1. Plan 04 Task 4.1 action must enumerate exact rebind sites by line range:
   - `runDispatch` line 128: `dispatchSingleTask(teamId, task, teammates)` → `dispatchSingleTask(teamId, task, mergedTeammates)`.
   - `dispatchTask` line 396: `dispatchSingleTask(teamId, task, teammates, ...)` → `dispatchSingleTask(teamId, task, mergedTeammates, ...)`.
   - **Explicit DO-NOT-REBIND:** `backfillLegacySchedules(teamId, teammates)` at line 122 — keep `teammates` (scheduling, not assignment).
2. Add acceptance criterion: `grep -c "dispatchSingleTask(teamId, task, mergedTeammates" src/lib/recgon/dispatcher.ts >= 2`.
3. Plan 04 Task 4.2 must extend Scenario B to run `dispatchSingleTask` end-to-end without mocking `rankMatches` (use an in-memory match stub OR the real `match.ts`) — assert the teammate object reaching the match function is the merged shape.

**Severity rationale:** PROFILE-04 is the load-bearing claim of Phase 1 and the entire downstream multi-phase architecture (Phase 2 widens `inferred`, Phase 3 reads merged candidates for LLM judgment). A vague "every downstream use" instruction with permissive grep is the canonical setup for a silent-but-shipping bug.

---

## Suggested Improvements (non-blocking)

### WARNING W-01 — Plan 04 Task 4.2 mocks too much to be an E2E smoke

**Plan:** 04 Task 4.2. The "E2E smoke" test mocks `listTeammatesWithStats`, `listProfiles`, AND `rankMatches`. That's a unit test, not an E2E. Scenario B ("Bob wins the frontend task") only proves the helper composes correctly — not that the production code path inside `dispatchSingleTask` actually invokes `applyProfileMerge` before match runs.

**Fix:** Extend smoke to run `dispatchSingleTask` directly against in-memory match (no `rankMatches` mock). Folded into B-02 fix.

### WARNING W-02 — `users(id)` foreign-key type not verified in plan

**Plan:** 01 Task 1.2. Plan adds `user_id text not null references users(id) on delete cascade`. Pitfall 5 in RESEARCH confirms text is correct for `teammates.user_id`, but doesn't verify `users.id` itself is text in this project's Supabase schema. Acceptance only greps the migration file string, not that it applies.

**Fix:** Plan 01 Task 1.4 (human checkpoint) should add: "Before `supabase db push`, query `select column_name, data_type from information_schema.columns where table_name='users' and column_name='id'` (via Supabase MCP `execute_sql`) and confirm `text`." Prevents runtime FK-mismatch on push.

### WARNING W-03 — Plan 01 Task 1.1 grep acceptance is overly strict

**Plan:** 01 Task 1.1. The acceptance `grep -n 'Roles:.*engineering.*legal' src/lib/prompts.ts | wc -l == 0` requires the literal hardcoded list to be fully removed. After Task 1.1 the line becomes `Roles: ${CANONICAL_ROLES.join(', ')}` which the grep correctly tolerates — but if executor retains a comment with the literal list for documentation, the grep fails for a benign reason.

**Fix:** Tighten grep to exclude template-literal interpolation and comment lines, OR loosen to "the Roles: line must contain `${CANONICAL_ROLES`". Minor.

### WARNING W-04 — UI-SPEC contracts not enforced by Plan 03 acceptance greps

**Plan:** 03 Task 3.3. UI-SPEC mandates specific contracts referenced in plan prose but not enforced via acceptance grep:
- `aria-label="Remove {chip text}"` on the pill remove button (WCAG 2.1 SC 1.1.1).
- `aria-hidden="true"` on the lucide `<X>` icon.
- 12px JetBrains Mono / 400 / `var(--txt-faint)` for `matched as canonical` annotation.
- `min-height: 96px` and `tabindex={-1}` on the disabled GitHub placeholder.
- 64px-wide / 1px / `rgba(var(--signature-rgb), 0.4)` signature underline below "Your profile".

**Fix:** Add greps for `aria-label="Remove`, `aria-hidden="true"`, `tabIndex={-1}` (JSX form) or `tabindex="-1"`, `var(--txt-faint)`, `min-height: 96px` (or token equivalent) to Plan 03 Task 3.3 acceptance. ~5 minutes of plan editing; substantially reduces post-execute revision risk.

---

## Info-level Notes

### INFO I-01 — QUAL-01 bias regression correctly deferred to Phase 3

The orchestrator brief asks "QUAL-05/06 cover bias regression CI test... Is this scaffolded in Plan 01 or 04?" Answer: **bias regression is QUAL-01, bound to Phase 3** per REQUIREMENTS.md line 160. QUAL-05/06 (chatViaChain + temperature: 0) ARE bound to Phase 1 and ARE covered (Plan 03 Task 3.1). Phase 1 plans correctly do NOT scope-creep into the Phase 3 bias-test work.

### INFO I-02 — Plan 03 lacks save short-circuit for unchanged fields

Optional: short-circuit the LLM call when `body.skillsRaw === initialProfile.skillsRaw && body.strengthsRaw === initialProfile.strengthsRaw && body.interestsRaw === initialProfile.interestsRaw`. Defer to Phase 6 cost guards if not addressed.

### INFO I-03 — SKELETON.md is more "frozen decisions" than walking-slice

SKELETON.md's acceptance criteria #4 ("Visiting /teams/[id]/me returns 200") and #5 ("POST /api/teams/[id]/profile persists a row") require Plan 03 to land, not just Plan 01. Plan 01 alone delivers migration + vocab + cmdk + types — substrate, not a working slice. Document is internally consistent; optional rename to ARCHITECTURE-DECISIONS.md.

---

## Walking Skeleton Check

Plan 01 ("Walking Skeleton") delivers migration + skillVocabulary extraction + cmdk install + types. SKELETON.md acceptance #4 + #5 require Plan 03 work to verify. This is the canonical "walking skeleton" tension: Plan 01 cannot in isolation deliver an end-to-end working slice because the UI + API live in Plan 03.

**Verdict:** SKELETON.md is internally consistent — it captures frozen architectural decisions that span all 4 plans. The "skeleton walks end-to-end" claim is true only after Plan 03 lands, not after Plan 01. No fix required; flagged as INFO.

---

## Additive Constraint Check

| Constraint | Plan 01 satisfies? |
|---|---|
| `teammates` (= existing `agent_teammates` per REQUIREMENTS naming) schema unchanged | YES — Plan 01 Task 1.2 only `create table if not exists teammate_profiles` + `alter table teams add column if not exists profile_visibility` — pure additions. |
| `agent_tasks` schema unchanged in Phase 1 | YES — no `alter table agent_tasks` in any Plan 01–04 task. |
| `projects.last_analyzed_sha` deferred to Phase 5 | YES — not touched in Phase 1. |
| Only one new table + one new column | YES — `teammate_profiles` + `teams.profile_visibility`. |

No additive-constraint violations.

---

## Backwards Compatibility Check

| Risk | Mitigation in plans |
|---|---|
| Teammates with no `teammate_profiles` row break dispatch | Plan 02 Task 2.1 Test 1 (profileMerge(t, null, null, ema) returns input unchanged); Plan 04 Task 4.2 Scenario C asserts dispatcher identical when listProfiles returns []. |
| Existing tests break under interest-nudge | Plan 02 Task 2.2 Test 5 explicitly back-compat asserts; existing recgonMatch.test.ts must remain green. |
| Existing dispatcher tests break under profileMerge wiring | Plan 04 Task 4.1 acceptance requires `npm run test -- --run` to exit 0. |
| Phase 2 widening `inferred: null` literal | Intentional design (Plan 02 explicitly comments "Phase 2 will widen this"). Forces compile-time visibility of every call-site at Phase 2 plan-time. |

No back-compat blockers.

---

## Scope Sanity

| Plan | Tasks | Files | Wave | Verdict |
|---|---|---|---|---|
| 01 | 4 (3 auto + 1 checkpoint) | 8 | 1 | OK — checkpoint reduces effective execute load to 3. |
| 02 | 2 (auto, both TDD) | 4 | 2 | OK — pure-function work. |
| 03 | 3 (auto, 1 TDD) | 10 | 2 | **Borderline.** Storage + LLM + prompt + schema + API + page + form + nav-link is the largest plan. Task 3.3 alone touches 3 files and integrates cmdk + Radix Popover. Mitigated by PATTERNS.md analogs being direct. |
| 04 | 3 (2 auto + 1 checkpoint) | 3 | 3 | OK — small wiring + smoke test. |

Plan 03 is heavy but alternative split (storage / route / UI) adds two more plans for a single-developer phase. Current split keeps cmdk integration in one head. Acceptable; flagged INFO.

---

## Issues Summary (YAML)

```yaml
issues:
  - id: B-01
    dimension: requirement_coverage
    severity: blocker
    description: "Plan 03 Task 3.3 + Plan 04 Task 4.3 + PATTERNS.md reference src/app/teams/[id]/page.tsx which does not exist; nav-link (D-10) cannot land as specified."
    plans: ["03", "04"]
    fix_hint: "Retarget nav-link insertion to src/components/v2/TopNavV2.tsx or src/components/TeamSwitcher.tsx; update PATTERNS.md, Plan 03 acceptance grep, Plan 04 manual-verify step 3."
  - id: B-02
    dimension: key_links_planned
    severity: blocker
    description: "Plan 04 Task 4.1 action ('replace every downstream use of teammates') is vague; the production call path inside dispatchSingleTask(teamId, task, teammates) at lines 128 and 396 is not explicitly enumerated, and backfillLegacySchedules at line 122 must NOT be rebound."
    plan: "04"
    task: 1
    fix_hint: "Enumerate exact rebind sites by line number; add explicit DO-NOT-REBIND for backfillLegacySchedules; add acceptance grep dispatchSingleTask(teamId, task, mergedTeammates; extend smoke test to run dispatchSingleTask without mocking rankMatches."
  - id: W-01
    dimension: verification_derivation
    severity: warning
    description: "Plan 04 Task 4.2 'E2E smoke' mocks rankMatches; cannot verify that production dispatcher invokes applyProfileMerge before match math."
    plan: "04"
    task: 2
    fix_hint: "Extend smoke to run dispatchSingleTask end-to-end (no rankMatches mock); accept the test as a wiring test if not."
  - id: W-02
    dimension: dependency_correctness
    severity: warning
    description: "Plan 01 Task 1.2 migration FKs to users(id) as text; not verified that users.id is actually text in this project's schema."
    plan: "01"
    task: 2
    fix_hint: "Plan 01 Task 1.4 (checkpoint) must explicitly query information_schema.columns to confirm users.id type before db push."
  - id: W-03
    dimension: task_completeness
    severity: warning
    description: "Plan 01 Task 1.1 grep acceptance for removed literal vocab is overly strict; false-positive risk if any comment retains the list."
    plan: "01"
    task: 1
    fix_hint: "Tighten grep to exclude template-literal interpolation lines and comment lines."
  - id: W-04
    dimension: verification_derivation
    severity: warning
    description: "Plan 03 Task 3.3 acceptance criteria do not enforce UI-SPEC contracts: aria-label='Remove {chip text}', aria-hidden='true' on X icon, tabindex=-1 on disabled card, 64px signature underline, matched as annotation typography."
    plan: "03"
    task: 3
    fix_hint: "Add greps for aria-label='Remove ', aria-hidden='true', tabIndex={-1} (or tabindex='-1'), var(--txt-faint), min-height: 96px."
  - id: I-01
    dimension: requirement_coverage
    severity: info
    description: "QUAL-01 bias regression is bound to Phase 3, not Phase 1; correctly omitted from Phase 1 plans."
    fix_hint: "No fix needed; sequencing is correct."
  - id: I-02
    dimension: scope_sanity
    severity: info
    description: "Plan 03 lacks early-exit short-circuit when raw fields are unchanged between saves; small per-edit LLM cost."
    plan: "03"
    task: 2
    fix_hint: "Optional: short-circuit LLM call when body raw arrays equal initialProfile raw arrays. Defer to Phase 6 if not addressed."
  - id: I-03
    dimension: walking_skeleton
    severity: info
    description: "SKELETON.md acceptance criteria #4 and #5 require Plan 03 to land; Plan 01 alone does not deliver an end-to-end walking slice."
    fix_hint: "Optional rename to ARCHITECTURE-DECISIONS.md; document is internally consistent regardless."
```

---

## Recommendation

**PASS-WITH-FIXES.** Apply both blockers (B-01, B-02) before kicking off execute. The two blockers are localized — B-01 is a target-file substitution in Plan 03 Task 3.3 Step C + grep + PATTERNS.md + Plan 04 manual-verify step 3; B-02 is an action-text rewrite + new acceptance grep + smoke-test extension in Plan 04 Task 4.1 + 4.2. Total revision footprint: ~40 lines across Plan 03 + Plan 04 + PATTERNS.md. No plans need to be split or merged. No requirements need to be re-scoped. Warnings W-01..W-04 are non-blocking — preferable to address W-04 (UI-SPEC grep enforcement) before execute since it is cheap and will reduce post-execute revision pressure on Plan 03.
