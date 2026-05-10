# Phase 1: Profile Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 01-profile-foundation
**Areas discussed:** Form fields, Owner vs self, Page surface + discovery, Skill picker + visibility, Voice & design

---

## Form fields — what's on the profile form

| Option | Description | Selected |
|--------|-------------|----------|
| Decorative — just store strengths/interests | Phase 1 collects them but the AI manager only uses skills + hours when assigning. Strengths/interests stored for Phase 3/4 use. | |
| Functional — use them in assignment too | Strengths and interests get weighted into who gets each task in Phase 1 itself. | ✓ |
| Skip them entirely for now | Phase 1 form only has skills + hours. | |

**User's choice:** Functional — use them in assignment.

**Follow-up question:** How exactly should strengths and interests feed into the dispatcher math?

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as extra skill tags | Strengths and interests fold into the same skill list; existing 45% skill-overlap math handles them automatically. | |
| Separate slots with their own weights | Skills 45%, strengths add ~10% bonus, interests ~5%. Rewrites match.ts weights. | |
| Strengths like skills, interests as nudges | Strengths join the main skill array; interests get a small separate boost as a tiebreaker. | ✓ |

**User's choice:** Strengths like skills, interests as nudges.

**Notes:** The user chose the middle ground — strengths share the dominant skill math, interests only break ties.

---

## Owner-filled vs self-filled — who wins when they disagree

| Option | Description | Selected |
|--------|-------------|----------|
| Self wins when filled; owner fills the blanks | Teammate's answers override owner's wherever they typed; blank fields fall back to owner's record. Safest against accidental erasure. | ✓ |
| Self always wins, even when blank | Blanks override owner's record (teammate's silence = zero). Simpler but destructive. | |
| Owner wins for capacity, self wins for skills/strengths/interests | Mixed ownership: capacity is owner's call, personality is teammate's. | |

**User's choice:** Self wins when filled; owner fills the blanks.

**Notes:** Locks the `profileMerge` behavior at the field level — blanks fall back, never zero out.

---

## Profile UI surface + discovery

**Q1 — What's on the page besides the form?**

| Option | Description | Selected |
|--------|-------------|----------|
| Form + greyed-out Phase 2 placeholder | "What GitHub will say about you — coming soon" disabled section. Prevents Phase 2 UI churn. | ✓ |
| Form only | Just fields + Save. Cleanest, smallest scope. | |
| Form + "how the AI sees you" summary | Recent tasks, average rating, most-used skill. More code, more value. | |

**User's choice:** Form + Phase 2 placeholder.

**Q2 — How do teammates discover the page?**

| Option | Description | Selected |
|--------|-------------|----------|
| Banner + nav link | Nag-bar on dashboard until profile is filled; permanent nav link. Pushes adoption. | |
| Nav link only, no banner | Quiet. Link in team nav; no nag. | ✓ |
| First-login redirect | Must fill before seeing dashboard. Maximum adoption, heaviest UX. | |
| Banner only, no nav link | Banner nags until filled; no permanent link. Bad for ongoing edits. | |

**User's choice:** Nav link only, no banner.

**Notes:** User accepts manually nudging teammates (Slack/email) when the feature ships rather than building nag UI.

---

## Skill picker — strictness and AI normalization

**Q1 — initial pitch:** Strict canonical list vs free-text overflow vs free-text with suggestions.

**User pushback:** "Why can't AI understand the free-text skills?"

**Explanation given:** AI CAN understand free-text, but doing so on every dispatch run is too expensive (LLM call per task × per teammate × per minute), unpredictable (same input can map differently across runs, breaking the explainability promise in PROJECT.md), and harder to audit for fairness. The canonical vocabulary exists as a deliberate trade-off — humans speak naturally, AI translates once at save time, math runs fast forever after.

**Q2 — final option set:**

| Option | Description | Selected |
|--------|-------------|----------|
| Free text — AI translates once on save | Type naturally; AI maps to canonical on save; profile shows both raw + canonical. Tiny LLM cost. | ✓ |
| Canonical dropdown only | Fixed list; zero AI cost; feels constrained. | |
| Pure free-text end-to-end | Drop canonical entirely; AI matches on every dispatch run. Real money cost, breaks predictability. | |

**User's choice:** Option 1, with **LinkedIn-style suggestion pills** for the input UX.

**Notes:** User added explicit UX direction: as the teammate types, suggestion chips appear below the input; clicking adds a removable pill; multi-select via repeated picks. Profile must visibly show "PostgreSQL (matched as: backend)" — the AI's translation is transparent, not hidden.

---

## Profile visibility — who can see whose profile

| Option | Description | Selected |
|--------|-------------|----------|
| Team-visible — everyone in the team sees everyone | LinkedIn-within-the-team. Owner + teammates browse each other's skills/capacity/interests. Fit-SCORES stay private. | |
| Self-only | Only you see your profile. Owner sees basic teammates row but not the rich profile. | |
| Owner sees all, peers see only their own | Owner has manager view; teammates can't see each other. | |

**User's choice (free-text):** "owner can manage if it's 1 or 3" — i.e. make visibility a team-level setting controlled by the owner. The owner picks between "team-visible" and "owner-only" for their team.

**Notes:** Captured as a new `profile_visibility` team setting with two values. Default for new teams = `team_visible`. The owner always sees every profile regardless of setting; a teammate always sees their own. Fit-scores remain private regardless (PROJECT.md Out-of-Scope unchanged).

---

## Voice & design (volunteered constraint, not a presented option)

**User's directive:** "Recgon doesn't have AI, it IS the AI on this app — keep that in mind when designing the front-end. The front-end should match the current app's design-language. You can use every front-end skill you need."

**Captured as:**
- UI copy speaks AS Recgon, never about Recgon (no "Powered by AI" labels, no third-person AI references).
- Page inherits the existing design system: glass-card, signature pink (`#c2357a` light / `#f0b8d0` dark), JetBrains Mono labels, Inter body, `.glass-card` + cursor-lensing patterns. No alien aesthetics.
- Plan/execute phases may invoke any installed frontend skill (impeccable, design-taste-frontend, high-end-visual-design, frontend-design, shadcn, vercel-react-best-practices) as needed.

---

## Claude's Discretion

- **profileMerge weight ratios for Phase 1 (self vs EMA, no inferred yet).** Roadmap flags this for in-plan simulation against historical `agent_tasks` data — not a CONTEXT-level decision. Planner picks starting weights and validates by simulation.
- **Interest-nudge weight.** A small bonus is mandated by D-03; planner picks the exact numeric weight.
- **`teammate_profiles` schema specifics** (column types, indexes, constraints): planner's call, following existing migration patterns.
- **Suggestion chip ranking algorithm** (prefix match, fuzzy match, team-history match): planner's call.
- **Where the "matched as: backend" annotation renders** (inline, tooltip, separate line): planner's UX call.

## Deferred Ideas

- "Tasks you've been doing lately" / "your average rating" panel on the profile page — minimal Phase 1, revisit later.
- First-login auto-redirect to profile — too heavy-handed for Phase 1.
- Nag-banner on dashboard for incomplete profiles — explicitly rejected for Phase 1.
- Pure free-text end-to-end (no canonical vocab) — v4-or-later redesign, not v3.
- Stretch / learning tasks (interests > skills surfacing grow-into work) — STRETCH-01 already deferred in REQUIREMENTS.md.
- Owner-edits-teammate-profile UI on behalf of a teammate — future enhancement.
