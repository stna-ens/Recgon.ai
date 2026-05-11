---
phase: 02-github-skill-inference
purpose: human-reference (audit / retrospective). Not consumed by downstream agents.
gathered: 2026-05-12
---

# Phase 2 Discussion Log

Areas selected: **all four** (Consent UX, Inference signal mix, Confirm/reject UX, Re-mining + UI placement).

---

## Area 1: Consent UX

**Q1: Where should the user grant GitHub mining consent?**

Options presented:
1. Inline section on `/teams/[id]/me` with clear scope explanation ← **picked**
2. Separate consent step in `/account` or `/settings`
3. Implicit (use existing `public_repo` token silently — risk: violates SKILL-01 explicit consent)
4. Modal that triggers on first `/teams/[id]/me` visit

**Decision (D-21):** Inline section on `/teams/[id]/me`. Replaces the visual slot where the removed Phase-1 "GitHub coming soon" card used to be.

**Q2: When the user revokes consent, what happens to existing inferred skills?**

Options presented:
1. Wipe everything
2. Stop mining, keep last-confirmed skills + rejected ← **picked**
3. Stop mining, keep everything but disable dispatcher source

**Decision (D-22):** Stop mining, keep confirmed + rejected. Treats revoke as "pause + preserve", not "forget".

---

## Area 2: Inference signal mix

**Q3: Which signals should the worker mine?**

Options presented:
1. Linguist + file extensions only (free)
2. Linguist + extensions + LLM on commit messages (cheap)
3. Multi-signal weighted with LLM on imports (deep, expensive)
4. All of the above, configurable per team ← **picked**

**Decision (D-23):** Multi-signal worker with team-configurable depth (`cheap` / `standard` / `deep`). Default for new teams = `standard`. Stored as `teams.inference_depth`. All LLM-bound user content wrapped in `<user_content>...</user_content>` (QUAL-02).

---

## Area 3: Confirm/reject UX granularity

**Q4: How does the teammate confirm or reject inferred skills?**

Options presented:
1. Per-skill toggle, default = pending (no dispatcher effect until confirmed)
2. Per-skill toggle, default = accepted (active immediately) ← **picked**
3. Bulk approve/reject on first scan, per-skill after
4. Just a checkbox per skill (no permanent rejection)

**Decision (D-24):** Per-skill toggle, default = accepted. Rejection is permanent (matches ROADMAP criterion 3). No "pending review" intermediate state. Trade-off: faster value vs risk of an unreviewed wrong inference influencing one cron cycle.

---

## Area 4: Re-mining cadence + inferred-UI placement

**Q5: How often does the worker re-mine?**

Options presented:
1. On-demand only ("Re-scan" button)
2. Weekly cron — quiet background ← **picked**
3. Daily cron — always fresh
4. Webhook on push — most efficient, most engineering

**Decision (D-25):** Weekly cron + on-demand "Re-scan" button (rate-limited to ~1/hr per teammate). Webhook deferred — captured in scope creep log.

**Q6: Where does the inferred-skills UI live in the redesign?**

Options presented:
1. New section below Weekly Capacity in the form
2. Side-by-side with self-declared Skills field
3. Tab switcher (Self / Inferred)
4. Right preview rail + banner notification ← **picked**

**Decision (D-26):** Right preview rail gets a new "INFERRED FROM GITHUB" section below "Likely matched to" — last-scan timestamp, Re-scan button, per-skill pills with confirm/reject toggles. When new unreviewed skills land, a banner appears on the form column with a "Review" CTA that jumps to the rail.

---

## Scope creep redirected to deferred

- Webhook on push (incremental mining via GitHub webhooks) → its own future phase
- Per-skill-type τ variation → revisit when there's data
- Modal first-visit consent prompt → revisit if adoption is low
- LLM-driven commit-kind auto-classification → out of scope (Phase 2 = skills-only)

---

## Decisions summary

| ID | Area | Decision |
|----|------|----------|
| D-21 | Consent UX | Inline section on `/teams/[id]/me` |
| D-22 | Consent revoke | Stop mining; keep confirmed + rejected |
| D-23 | Signal mix | Multi-signal, team-configurable depth (default: standard) + `<user_content>` wrap |
| D-24 | Confirm/reject | Per-skill toggle, default = accepted, rejection permanent |
| D-25 | Cadence | Weekly cron + rate-limited on-demand Re-scan |
| D-26 | UI placement | Right rail "INFERRED FROM GITHUB" section + form banner on new skills |
