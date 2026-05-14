---
status: resolved
phase: 03-llm-judgment-overlay
source: ["03-VERIFICATION.md"]
started: 2026-05-14T02:08:00Z
updated: 2026-05-15T00:30:00Z
resolved_by: 03.1-llm-judgment-overlay-gap-closure
---

## Current Test

[routed to Phase 3.1 — see Gaps section]

## Tests

### 1. Why-you UI + email privacy spot-check across three viewer roles

expected: When Recgon dispatches a task, the assignee sees a "WHY YOU" block in the task pop-up AND a "**Why you:**" line in the assignment email. The team owner sees the same Why-you block in the pop-up for every assignee. Other teammates (not the assignee, not an owner) see the task in the calendar but NO Why-you block. The reasoning sentence is in plain English, references something specific (a skill, a recent task count, an availability signal), and does NOT mention peer names or numeric scores.

result: [pending]

steps:
1. Start `npm run dev`. Sign in as a team owner with at least 2 teammates and at least one unassigned task in the backlog.
2. Trigger a dispatch (wait for the cron drain, or call the dispatch endpoint manually).
3. As the team owner, open the assigned task in the calendar pop-up. Confirm a WHY YOU block exists and reads naturally.
4. Open Resend (or the dev mail-catcher). Confirm the assignment email body has a `**Why you:**` line between the task metadata and the CTA.
5. Sign out and sign in as the assignee (different browser or incognito). Open the same task. Confirm the same Why-you block + email line are visible to them.
6. Sign out and sign in as a different teammate (not assignee, not owner). Open the same task. Confirm the task is visible but NO Why-you block renders.
7. Confirm no peer name and no numeric score appears in any of the Why-you sentences.

## Summary

total: 1
passed: 0
issues: 2
pending: 0
skipped: 0
blocked: 0
routed_to_followup: 1

## Gaps

### Gap 1: Dispatcher assigns tasks with zero-signal fit scores
status: routed-to-phase-3.1
discovered: 2026-05-15T00:10:00Z via live UAT on /tasks
evidence: agent_tasks row `beb5b3e9-6ea2-4a85-974c-bbf247f2c5c8` has assignment_reasoning.mathBreakdown with every field = 0 (fitForKind, loadHeadroom, skillOverlap, interestNudge, availabilityNow). The dispatcher picked an assignee anyway. The rule should be: if no candidate has ANY fit signal above the floor, the task stays unassigned and the owner triages.

### Gap 2: Why-you copy is generic templates, not grounded reasoning
status: routed-to-phase-3.1
discovered: 2026-05-15T00:10:00Z via live UAT on /tasks
evidence: The math-only path uses static templates ("Your background matches what this task needs") that don't cite specific signals from the assignee's profile. The LLM judge path produces specific copy but only fires on close calls. Fix: always call the LLM for the Why-you sentence, given (task spec + chosen teammate's profile + math breakdown), so every assignment gets grounded reasoning.

Both gaps tracked in Phase 3.1 — see `.planning/phases/03.1-*/`.
