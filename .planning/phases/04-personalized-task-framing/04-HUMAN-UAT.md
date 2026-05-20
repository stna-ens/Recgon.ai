---
status: partial
phase: 04-personalized-task-framing
source: [04-VERIFICATION.md]
started: 2026-05-20T18:42:00Z
updated: 2026-05-20T18:42:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Assignee opens task detail in dev within one cron cycle of assignment
expected: Personalized description renders in TaskDetailPanel for the assignee; original brain description renders for the owner viewing the same task.
result: [pending]

### 2. Reassignment immediately nulls personalized columns AND new assignee gets fresh personalized text after next cron drain
expected: Reassign task from teammate-1 to teammate-2 — DB row shows `personalized_description=NULL` + `personalized_description_for_user_id=NULL` within the same update; teammate-2 sees the ORIGINAL description until the next cron; after cron, sees a NEW personalized description scoped to their userId; owner + teammate-1 never see teammate-2's personalized text.
result: [pending]

### 3. Assignment email delivered via Resend contains the personalized description for the assignee
expected: When teammate-1 is assigned a task and `personalized_description` has been populated for their userId BEFORE the email send, the Resend email HTML body contains the personalized sentence (escaped), NOT the original brain description.
note: The dispatcher hook enqueues the reframe BEFORE `notifyTeammateAssigned`, so in practice the FIRST assignment email typically goes out before the cron drains the job — meaning the first email uses the original description. The personalized email shape is observable on a subsequent reassignment or if the cron drains within the email-send latency. Confirm both paths.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
