# Phase 3: LLM Judgment Overlay - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 03-llm-judgment-overlay
**Areas discussed:** Judge evidence payload, Reason structure, "Why you" UI placement, Daily safety cap

---

## Initial framing pivot

Claude's first cut at the gray areas used technical/jargon labels ("Judge evidence payload", "Tiebreaker factor vocabulary", "Where the JSONB column shows up"). User flagged: "I don't understand what are you sayin. you are too technical for me. We talked about this before. I'm a BA not a CENG." Memory `feedback_no_cli_options.md` was strengthened: the no-jargon rule applies in planning workflows too, not just debugging. Discussion re-presented in plain English with manager / hiring analogies.

---

## Judge evidence payload (Topic 1)

| Option | Description | Selected |
|--------|-------------|----------|
| C. Score + breakdown + skill tags | Mid-context: total fit + per-component breakdown + anonymized canonical skill tags. Cheaper, balanced. | |
| B. Score + breakdown only | Numbers + which math component drove them, no skill names. Cheapest meaningful. | |
| **D. Everything: scores + skills + recent task history** | Richest signal — totals, breakdown, skill tags, last 14 days of completed work with ratings. Most cost. | **✓** |
| A. Just the total scores | AI sees only the totals; would essentially always pick the highest number. Defeats the purpose. | |

**User's choice:** D.
**Notes:** v3 priority is quality > cost. The cost of richer payload is accepted.

---

## Reason structure (Topic 2)

| Option | Description | Selected |
|--------|-------------|----------|
| **B. Enum reason + short validated sentence** | Fixed list of reasons (`recent_track_record` etc.) + one short AI-written sentence, post-validated. Warm + auditable. | **✓** |
| A. Enum reason only, template-rendered copy | Safe and predictable but robotic — "Picked because of recent track record." No AI prose. | |
| C. Free-text only | Warmest tone but highest hallucination risk and hardest to audit. Not recommended. | |

**User's choice:** B.
**Notes:** Final enum values deferred to researcher prototype + planner; initial set in CONTEXT.md D-28. Post-hoc validator design also deferred to researcher.

---

## "Why you" UI placement (Topic 3)

| Option | Description | Selected |
|--------|-------------|----------|
| **B. Assignment email + task pop-up** | Visible at the moment of assignment AND on click. Calendar tile stays clean. | **✓** |
| A. Task pop-up only | Quietest. Easy to miss if teammate doesn't click. | |
| C. Everywhere — email + pop-up + calendar tile tooltip | Most visible. Risks feeling noisy. | |

**User's choice:** B.
**Notes:** Privacy rule mirrors fit-score privacy (Phase 1 D-20 analog) — assignee sees own, owner sees all, no cross-teammate visibility.

---

## Daily safety cap (Topic 4)

**Reframing moment:** before answering, user said "We'll think about monetization later. Just focus on making the best quality product rn." Saved as project memory `project_quality_over_cost_v3.md`. The cap topic was re-presented as a SAFETY rail (against bugs), not a quality knob.

| Option | Description | Selected |
|--------|-------------|----------|
| A. You set it, silent fallback at limit | Dev-set generous cap, no notification on hit. Simplest. | |
| **B. You set it, dev gets a heads-up on hit** | Same dev-set cap, silent fallback for users, but Eneskis (developer) gets an alert. Bug-detection signal. | **✓** |
| C. Each team owner picks their own cap | Owner-controlled setting in team settings. More complex and owners may not understand the trade-off. | |

**User's choice:** B.
**Notes:** No user-facing setting. No owner notification. Cap is invisible to teams; alert is internal-only (dev-ops email or log).

---

## Claude's Discretion

(Deferred to researcher / planner — see CONTEXT.md `<decisions>` Claude's Discretion section for full list.)

- Final reason enum values (researcher prototypes prompt, observes what the LLM actually picks)
- Starting cap value (planner picks based on AI pricing math)
- Whether to widen the 0.15 close-call gap given v3 quality > cost (researcher simulates)
- Post-hoc free-sentence validator design
- Edge case: < 3 candidates clear `MIN_FIT_SCORE`
- Manual override semantics for `assignment_reasoning`
- `assignment_reasoning` JSONB schema shape
- Dev-ops alert mechanism (log only vs. log + Resend email)
- Bias-regression fixture name vocabulary

---

## Deferred Ideas

- Team-owner-controlled cap with UI slider (rejected for v3, could revisit if usage telemetry warrants)
- "Why you" tooltip on calendar tile (rejected as too noisy, could revisit if email + pop-up is missed)
- Live AI usage dashboard for owners (deferred until a future monetization phase exists)
- Reroute judge to a dedicated reasoning model (stick with `chatViaChain` for v3)
- LLM judge for AI's OWN minted tasks ("did the brain mint a good task?") — out of scope, separate concern
- Per-skill-type τ variation on EMA (still deferred from Phase 2)
