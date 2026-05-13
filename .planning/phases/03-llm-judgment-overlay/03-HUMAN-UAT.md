---
status: partial
phase: 03-llm-judgment-overlay
source: ["03-VERIFICATION.md"]
started: 2026-05-14T02:08:00Z
updated: 2026-05-14T02:08:00Z
---

## Current Test

[awaiting human testing]

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
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
