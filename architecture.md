# Recgon Architecture

Quick-reference for Claude Code. Read this instead of scanning the whole codebase at session start.

---

## 1. Directory Structure

```
src/
├── app/
│   ├── api/                    # API routes (see §3)
│   ├── auth/                   # Login, register pages
│   ├── projects/               # Project pages
│   ├── teams/                  # Team pages
│   └── mcp/                    # MCP OAuth pages
├── components/                 # React components
├── lib/                        # Business logic & utilities
├── types/                      # TypeScript types
├── middleware.ts               # Auth + CSRF + routing
└── auth.ts                     # NextAuth config

mcp-server/src/
├── index.ts                    # Stdio MCP server entrypoint
├── tools.ts                    # 4 MCP tools
├── auth.ts                     # Bearer token validation
├── data.ts                     # Supabase queries
└── types.ts                    # MCP-specific types

supabase/migrations/            # SQL migrations
```

---

## 2. Key Types

### User (`lib/userStorage.ts`)
```typescript
{ id, email, passwordHash?, nickname, createdAt, githubAccessToken?, githubUsername?, avatarUrl?, socialProfiles? }
```

### Team (`lib/teamStorage.ts`)
```typescript
Team:       { id, name, slug, description?, avatarColor?, avatarUrl?, createdBy, createdAt }
TeamMember: { teamId, userId, role: 'owner'|'member'|'viewer', joinedAt, nickname?, email?, avatarUrl? }
TeamInvitation: { id, teamId, email: string|null, role, invitedBy, token, expiresAt, acceptedAt, createdAt }
// email is null for new link-only invites. Accepting an invite only
// requires a valid single-use token + authenticated session; the token
// is marked accepted_at on first use.
// On createTeam + acceptInvitation, the human user is mirrored into the
// `teammates` table so they show up in the Recgon-managed roster (§10).
```

### Recgon Admin (`lib/recgon/`)
Recgon is the dispatcher above the team — it reads a unified brain of open
work, mints tasks, and assigns each one to the best-fit teammate (human or
AI peer). Roster, tasks, ratings, and dispatcher state live in dedicated
tables; see §4 and §10.
```typescript
Teammate: {
  id, teamId, userId|null, displayName,
  avatarColor?, avatarUrl?, title?,
  skills: string[],
  capacityHours, workingHours: WorkingHours|null,
  fitProfile: {
    taskKindScores?: Record<TaskKind,number>,           // EMA per kind, [-1,1]
    skillStats?: Record<string, SkillStat>,             // per-skill running stats
    lastUpdated?
  },
  status: 'active'|'paused'|'retired', createdAt
}
SkillStat: { tasksDone, avgRating, rolling30dAvg, lastRatedAt }  // pruned >90d idle
AgentTask: {
  id, teamId, projectId|null, title, description,
  kind: 'next_step'|'dev_prompt'|'marketing'|'analytics'|'research'|'custom',
  source: 'brain'|'user'|'teammate'|'schedule', sourceRef (incl. dedupKey),
  requiredSkills[], priority (0..3), estimatedHours, deadline?,
  assignedTo|null, assignedBy ('recgon' | userId), assignedAt?,
  status: 'unassigned'|'assigned'|'accepted'|'in_progress'|
          'awaiting_review'|'completed'|'declined'|'failed'|'cancelled',
  jobId|null, result?, createdBy?, createdAt, completedAt?,
  // Recgon's verification verdict — separate from user-facing status.
  proof: ProofPayload|null,
  verificationStatus: 'none'|'auto_running'|'auto_passed'|'auto_inconclusive'|
                      'proof_requested'|'proof_evaluating'|'passed'|'failed'|
                      'owner_override',
  verificationEvidence: { commitShas?, diffSummary?, metric?, baselineValue?,
                          observedValue?, delta?, artifactIds?, verdict?,
                          confidence?, iterations? } | null,
  verifiedAt?, verifiedBy?: 'recgon'|'owner_override'
}
ProofPayload: { text?, links?, attachments?, extras?, submittedAt, submittedBy }
TaskRating: { taskId (pk), teammateId, rating: 1|-1, note?, ratedBy, ratedAt }
// rater='recgon' rows are inserted by the verification worker on a passed
// verdict; owner_override skips auto-rating.
RecgonState: { teamId, brainSnapshot, lastDispatchAt, assignmentLog[] }
```

### Project (`lib/storage.ts`)
```typescript
Project: {
  id, teamId, createdBy, name, path?, sourceType?: 'codebase'|'github'|'description',
  // NOTE: 'codebase' is legacy (existing rows only). New projects are created
  // as 'github' or 'description'. Local-path analysis is no longer supported
  // in the hosted environment. POST /api/projects rejects any non-GitHub path.
  description?, isGithub?, githubUrl?, lastAnalyzedCommitSha?,
  isShared?: boolean,   // DB col `is_shared`. Default true. When false, only creator sees it
                        // (filtered in getAllProjects + getProject via team + ownership check).
  createdAt,
  // assembled from related tables:
  analysis?: ProductAnalysis, marketingContent?, campaigns?,
  socialProfiles?, analyticsPropertyId?,
  logoUrl?   // DB col `logo_url`. Direct image URL shown in project cards and focus panel.
}

ProductAnalysis also includes:
  websiteUrl?  // LLM-extracted product website URL (from codebase env vars, package.json homepage, README, or description).
               // Used by autoDetectLogo() in workers.ts → Clearbit logo API → stored as logoUrl.
```

### ProductAnalysis (stored in `project_analyses.data` JSONB)
```typescript
{
  name, description, techStack[], features[], targetAudience, uniqueSellingPoints[],
  problemStatement, marketOpportunity,
  competitors[]: { name, url?, differentiator },
  competitorInsights?: CompetitorInsight[],
  businessModel, revenueStreams[], pricingSuggestion,
  currentStage: 'idea'|'mvp'|'beta'|'growth'|'mature',
  swot: { strengths[], weaknesses[], opportunities[], threats[] },
  topRisks[], prioritizedNextSteps[], gtmStrategy,
  earlyAdopterChannels[], growthMetrics[],
  // re-analysis only:
  improvements?, nextStepsTaken?: { step, taken, evidence }[],
  analyzedAt
}
```

---

## 3. API Routes

### Auth
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/auth/[...nextauth]` | GET/POST | — | NextAuth handler |
| `/api/auth/register` | POST | — | OTP required, METU domain only, 5/hr/IP |
| `/api/auth/send-otp` | POST | — | 6-digit OTP via Resend |

### Projects
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/projects` | GET | Session | `?teamId=` required |
| `/api/projects` | POST | Session | Body: `{name, path?, description?, teamId}` |
| `/api/projects/[id]` | GET/PATCH/DELETE | Session | `?teamId=`. PATCH body: `{name?, description?, path?, isShared?, logoUrl?}`. `name` ≤120 chars, non-empty. `isShared` is creator-only. |
| `/api/projects/[id]/analyze` | POST | Session | **SSE stream** — progress events then `{type:'done', project}` |
| `/api/projects/[id]/auto-detect-logo` | POST | Session (write) | Re-runs `autoDetectLogo()` even if `logoUrl` already set; returns `{logoUrl}`. |
| `/api/projects/[id]/check-updates` | POST | Session | GitHub diff check |
| `/api/projects/[id]/pdf` | GET | Session | Binary PDF export |
| `/api/projects/extract-text` | POST | Session | URL or file → `{text}` |

### Teams
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/teams` | GET/POST | Session | List user's teams / create team |
| `/api/teams/[id]` | GET/PUT/DELETE | Session | Owner-only for PUT/DELETE |
| `/api/teams/[id]/members` | GET/POST | Session | List / add members |
| `/api/teams/[id]/members/[userId]` | PUT/DELETE | Session | Change role / remove |
| `/api/teams/[id]/invite` | POST | Session | Send email invite (7-day token) |
| `/api/teams/[id]/invitations` | GET | Session | List pending |
| `/api/teams/[id]/invitations/[invId]` | DELETE | Session | Revoke |
| `/api/teams/invite/accept` | POST | Session | Accept invite via token |
| `/api/teams/[id]/profile` | POST/GET | Session + verifyTeamAccess | POST: save logged-in user's own profile (Phase 1 / PROFILE-03). GET: read any teammate's profile in the team — gated server-side by `teams.profile_visibility` (self/owner always allowed; `team_visible` allows all members; `owner_only` returns 403 for non-owner non-self). LLM normalize call bounded by `timeoutMs: 8000` to stay under Vercel's 10s budget. |
| `/api/teams/[id]/inferred-skills` | GET | Session + verifyTeamAccess | Phase 2 / Plan 02-03. Lists the requesting teammate's `teammate_inferred_skills` rows + `lastScanAt` + `githubMiningConsentAt`. `?userId=` optional but enforced self-only in v1 (404 on cross-user). Returns 404 (never 403) on team mismatch. |
| `/api/teams/[id]/inferred-skills/[skillId]` | PATCH | Session + verifyTeamAccess + IDOR | Phase 2 / Plan 02-03 / SKILL-05. Body: `InferredSkillPatchBodySchema` (`{rejected?: boolean, reviewed?: boolean}`). Per-row reject / undo-reject / mark-reviewed. IDOR: row.teamId must equal `[id]` AND `getTeammateUserId(row.teammateId) === session.user.id`. 404 on team mismatch; 403 on user mismatch. |
| `/api/teams/[id]/inferred-skills/scan` | POST | Session + verifyTeamAccess | Phase 2 / Plan 02-03 / SKILL-01. **Inline** run of `runGithubSkillInference` (maxDuration: 60s, set on the route). Originally enqueued to `llm_jobs`, but on Vercel Hobby the queue drain runs daily — a Re-scan click would sit up to 24h before producing pills. Manual button now runs synchronously and returns `{ok, result}` directly; the weekly cron at `/api/cron/github-skill-inference` still uses the queue path. Returns 412 if `githubMiningConsentAt` is null, 429 with `retryAfterMin` if `lastScanAt` < 1h ago (T-02-18). The `result` body carries a `diagnostics` block (`ScanDiagnostics` — `reposScanned`, `commitsFound`, `signalsEmitted`, `llmDroppedTags`, `githubEmailPrivate`, `githubLogin`, `githubVerifiedEmails`, `recentCommitSample`, `sampleCommitsByVerifiedEmail`, `sampleCommitsAttributedToUser`, `tokenScopes`, `tokenStatus`, `repoProbeResults`) used by the right-rail empty state to explain WHY a scan returned zero pills. Probe runs only on the zero-commits path and pulls four independent signals via raw fetch — `/user` (login + public email + `x-oauth-scopes` header + HTTP status), `/user/emails` (verified emails + primary visibility), and a per-repo `listCommits` sample (up to 5 repos, breaking on the first 200-OK) so the UI can distinguish revoked-token (401), missing-`repo`-scope, org SAML SSO / blocked org access, private-email, wrong-git-config, and genuinely-no-activity cases. |
| `/api/teams/[id]/inferred-skills/consent` | POST/DELETE | Session + verifyTeamAccess | Phase 2 / Plan 02-03 / SKILL-01. POST builds GitHub OAuth redirect with `scope=read:user user:email repo` and sets `github_skill_mining_state` cookie (separate from `github_connect_state`, T-02-14). DELETE unsets `teammate_profiles.github_mining_consent_at` and preserves accepted/rejected rows (D-22). |
| `/api/teams/[id]/inferred-skills/mark-reviewed` | PATCH | Session + verifyTeamAccess | Phase 2 / Plan 02-03 / SKILL-06. Bulk-clears unreviewed banner state via `markBannerReviewed(teammateId)`. Drives the review banner above the profile form. |

### Recgon Admin (teammates / tasks / dispatcher)
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/teams/[id]/recgon` | GET | Session | Dispatcher state: brain snapshot + last dispatch + assignment log + active roster proposal |
| `/api/teams/[id]/recgon/dispatch` | POST | Session (write) | Manual run: read brain → mint tasks → assign best fit. Returns `{ minted, skipped, assigned, noFit }` |
| `/api/teams/[id]/teammates` | GET | Session | List roster (with rating + load). |
| `/api/teams/[id]/teammates/[teammateId]` | GET/PATCH/DELETE | Session | Get / edit (skills, capacity, working hours, status) / soft-retire |
| `/api/teams/[id]/calendar` | GET | Session | Calendar data: `?projectId=`. Returns `{ teammates, tasks }` — teammates with stats and project tasks (each with `scheduledDate` + optional `scheduledUntilDate` for multi-day spans). Day-precision; no hour-of-day. Used by `WeekCalendar` component. |
| `/api/teams/[id]/tasks` | GET/POST | Session | List with filters (`status`, `teammateId`, `kind`, `projectId`) / create user task (auto-dispatched) |
| `/api/teams/[id]/tasks/[taskId]` | GET | Session | Task detail incl. result |
| `/api/teams/[id]/tasks/[taskId]` | DELETE | Session (write) | Hard-delete the task row. |
| `/api/teams/[id]/tasks/[taskId]` | PATCH | Session (write) | `{ action: 'cancel' }` → sets `status='cancelled'`. Rejects if task is already `completed` or `cancelled`. |
| `/api/teams/[id]/tasks/[taskId]/reassign` | POST | Session (write) | Manual override `{ teammateId: id\|null }`. Re-enqueues run if assigned to AI |
| `/api/teams/[id]/tasks/[taskId]/proof` | POST | Session (assignee or owner) | Submit proof `{ text?, links?, attachments?, extras? }` for a task in `verification_status='proof_requested'`. Persists `proof`, flips status to `proof_evaluating`, enqueues a `task_verification` job in `proof_evaluation` mode. |
| `/api/teams/[id]/tasks/[taskId]/proof/upload` | POST | Session (assignee or owner) | Multipart upload of one or more proof attachments. Accepts images, **videos**, PDFs, text, Office docs, JSON, ZIP up to **25 MB** each. Uploads to the public `proof-attachments` Supabase Storage bucket at `{teamId}/{taskId}/{uuid}-{name}` and returns `{ attachments: Array<{name,url}> }` for the client to include in the next `/proof` POST. Both the inbox and the team `/tasks` page render the shared `components/ProofDropZone.tsx` drag-and-drop zone bound to this endpoint. |
| `/api/teams/[id]/tasks/[taskId]/override` | POST | Session (owner only) | Owner-final mark complete `{ note? }`. Sets `verification_status='owner_override'`, `status='completed'`, `verified_by='owner_override'`. **Skips auto-rating** — owner's call is final. |
| `/api/integrations/status` | GET | Session (team member) | `?projectId&teamId` → `{ integrations: [{ provider, accountHandle, connectedAt, expiresAt }] }`. Tokens never returned. |
| `/api/integrations/instagram/connect` | GET | Session (team member) | `?projectId&teamId` → 302 to Meta OAuth dialog with HMAC-signed `state`. Requires `META_APP_ID` / `META_APP_SECRET` / `META_REDIRECT_URI` env vars. |
| `/api/integrations/instagram/callback` | GET | Session + signed state | Meta OAuth landing. Verifies HMAC state, exchanges short-lived → long-lived token (~60d), finds the user's IG Business Account, upserts `project_integrations`, redirects to `/projects/{id}?ig=connected&handle=...`. |
| `/api/integrations/instagram/disconnect` | POST | Session (team member) | `{ projectId, teamId }` → deletes the project's IG `project_integrations` row. |
| `/api/teams/[id]/tasks/[taskId]/accept` | POST | Session | Human assignee (or owner) accepts an `assigned` task → `accepted`. |
| `/api/teams/[id]/tasks/[taskId]/decline` | POST | Session | Human declines `{ note? }` — Recgon unassigns, excludes the decliner from the next match pass, and falls back to the team owner if nobody else clears `MIN_FIT_SCORE`. Returns `{ reassignedTo, ownerFallback }`. |
| `/api/teams/[id]/tasks/[taskId]/complete` | POST | Session | Human completes `{ summary? }` → `awaiting_review` for thumbs review. |
| `/api/teams/[id]/tasks/[taskId]/rating` | POST | Session | `{ rating: 1\|-1, note? }` — idempotent upsert per task; updates rollup; feeds `learn.ts` to update `fit_profile`. |

### Owner Task Board (owner-only)
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/recgon/owner/dock` | GET | Session + owner-only | Phase 3.5 / Plan 03.5-02. Query `?teamId=X`. Returns `{ triaged: AgentTask[], deferred: AgentTask[] }` for the owner workload board (`/projects` page when role=`owner`). Triaged = `status='unassigned'` AND `triage_note IS NOT NULL` (dispatcher refused — `no_clear_fit` / `no_grounded_reason` / `no_capacity_*`). Deferred = `status='unassigned'` AND `triage_note IS NULL` AND `scheduled_date > CURRENT_DATE`. **Privacy contract (T-03-03-03 / T-3.5-03 hedge):** response NEVER carries `assignmentReasoning` or `whyYouSentence` — stripped at the `listOwnerDockTasks` row mapper AND re-stripped defensively at the route boundary. Per-chip `whyYouSentence` flows ONLY through the existing `/api/recgon/tasks/[id]` route (which applies the Phase-3 privacy filter). Members / viewers / users with no role on this team → 403. Backed by `listOwnerDockTasks` in `recgon/storage.ts`. |
| `/api/recgon/owner/board` | GET | Session + owner-only | Phase 3.5 / Plan 03.5-02 (deviation from plan: minted a new owner-only endpoint instead of "reusing" `/api/teams/[id]/calendar` since the latter is project-scoped and the owner board needs an ALL-PROJECTS view). Query `?teamId=X&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. Returns `{ teammates: TeammateWithStats[], tasks: AgentTask[] }`: active (non-retired) teammates via `listTeammatesWithStats`, and tasks with `status IN ('assigned','accepted','in_progress','awaiting_review')` whose `scheduled_date` falls in the inclusive window. **Privacy contract:** same as `/dock` — `assignmentReasoning` + `whyYouSentence` stripped at storage row mapper AND re-stripped here. Backed by `listAssignedTasksInWindow` in `recgon/storage.ts`. Members / viewers → 403. Missing or malformed `startDate`/`endDate` (must match `YYYY-MM-DD`) → 400. |
| `/api/recgon/owner/dock/dismiss` | POST | Session + owner-only | Phase 3.5 / Plan 03.5-03. Body `{ taskId: string }`. Inserts (or no-ops on conflict) a row into `owner_dock_dismissals` for `(session.user.id, taskId)` so subsequent `/api/recgon/owner/dock` calls filter out the deferred row FOR THAT VIEWER. Idempotent via PK `(user_id, task_id)`. Triaged tasks (`triage_note IS NOT NULL`) are NEVER dismissable (D-17) — returns 400 with `only deferred tasks can be dismissed`. Task not found → 404. Member/viewer/wrong-team → 403. Backed by `dismissDockItem` in `recgon/storage.ts`. |

### Inbox (per-user, not team-scoped)
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/inbox` | GET | Session | All non-terminal tasks assigned to teammate rows owned by the current user, decorated with team name. Each task includes `verification_status` + `verification_evidence` so the inbox can render Recgon's check state and inline proof requests. Returns `{ tasks, counts: { open, awaitingReview } }`. **Self-heals** stuck tasks: any task in `auto_running` with no `stage` and no `verdict` triggers a fire-and-forget `runTaskVerification` call (idempotent — the worker bails if the task already finalized). Recovers tasks left over from before the inline kick-off existed and tasks whose worker was killed mid-flight. |
| `/api/inbox/count` | GET | Session | Lightweight count (assigned + accepted + in_progress) for the sidebar badge. Polled every 60s. |
| `/api/calendar` | GET | Session | Personal calendar — `?from=YYYY-MM-DD&to=YYYY-MM-DD` required. Returns `{ tasks, teams: [{ id, name, avatarColor }], projects: [{ id, name, logoUrl, teamId }] }` of every scheduled task assigned to teammate rows owned by the current user across every team. `projects` is **every project the user currently has a non-terminal scheduled task in** (across all dates, not just in-window) — this keeps the lane structure stable across week navigations on `/v2/calendar`. Multi-day tasks whose span overlaps the window are included in `tasks`. Backed by `listScheduledTasksForUser` in `recgon/storage.ts` plus an inline distinct-project-id query. Used by `/v2/calendar`. |

### Verification Triage (team-scoped)
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/verify` | GET | Session + team access | `?teamId=` → `{ tasks[], role, currentTeammateIds, counts: { total, failed, awaiting, stuck } }`. Returns ALL tasks in the team (not just per-user) where `verification_status IN ('failed', 'proof_requested', 'auto_inconclusive', 'auto_running', 'proof_evaluating')`. Each task carries the full row needed by the triage UI (description, assigned_to, verification_evidence, proof). `counts.stuck` = `auto_running`/`proof_evaluating` with `assigned_at < now()-24h` (matches the cockpit's "stuck" definition). `role` is the caller's team role so the UI can gate the owner-only override action. `currentTeammateIds` are the teammate row(s) the signed-in user owns inside this team — the UI uses them to gate proof-submit and decline (assignee-only) so the owner can't act on someone else's behalf. Consumed by `/v2/verify`; deep-linked from the ATTENTION column in `HomeBoard.tsx` (`failed`/`stuck` rows). |

### AI Features
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/marketing/generate` | POST | Session | `{projectId, platforms[]}` → marketing content |
| `/api/marketing/campaign` | POST | Session | `{projectId, type, goal, duration}` → campaign plan |
| `/api/analytics/data` | GET | Session | GA4 raw data. Either `?projectId=` (uses owning team's config) or `?scope=team&teamId=` / `?scope=personal` (+ optional `propertyId=`). |
| `/api/analytics/analyze` | POST | Session | AI insights from GA4 data |
| `/api/analytics/property` | GET/POST/DELETE | Session | `?scope=team&teamId=` or `?scope=personal`. POST/DELETE on team scope require **owner** role. POST also handles `set_project_property` for binding a project to a GA4 property. |
| `/api/analytics/property/transfer` | POST | Session (team owner) | Body `{ direction: 'to_team' \| 'to_personal', teamId }`. Atomically flips an existing config's `team_id` between scopes (no re-OAuth). `to_personal` additionally requires the caller to be the team config's `user_id` (token owner). 409 if target scope already has a config. |
| `/api/analytics/properties` | GET | Session | `?scope=team&teamId=` or `?scope=personal`. Lists GA4 properties accessible to the connecting account. |
| `/api/analytics/oauth` | GET | Session | `?scope=team&teamId=` or `?scope=personal`. Encodes scope in OAuth `state`. Team scope requires owner. |
| `/api/analytics/oauth/callback` | GET | — | Decodes scope from `state`, re-validates session + owner role, writes to `analytics_configs` for the resolved scope. |
| `/api/social/profiles` | POST | Session | Scrape + analyze social profiles |
| `/api/overview` | GET | Session | `?teamId=` → `{ actions, signals, totalProjects, analyzedCount, slippingCount, priorityCounts, shipped[], decisionDeck, needsYouCount, todayFocus, projectCards[], wins[], updates[], briefing, upNext[] }` — priority actions, domain signals, plus v2 cockpit aggregates (slipping = `overallScore < 6`; shipped = last-7d completed `agent_tasks`; decisionDeck = `{ stuck, stuckTotal, failed, failedTotal, drift, driftTotal }` of top-3 tasks per category — "things gone wrong" axis: `stuck` = `verification_status IN ('auto_running','proof_evaluating')` AND `assigned_at < now()-24h`; `failed` = `verification_status='failed'`; `drift` = `status='unassigned'`. Routine in-flight states (`proof_requested`, `awaiting_review`) are NOT here — those are normal flow surfaced by the focus card). Homepage-redesign fields: `todayFocus = { projectId, projectName, logoUrl?, currentStage, overallScore, topRisk, nextSteps[≤3], analyzedAt, risksCount, nextStepsCount, improvementsCount }` (counts aggregate across `topRisks` + `swot.weaknesses`, `prioritizedNextSteps`, `improvements` + `nextStepsTaken.taken` respectively); `projectCards[] = { id, name, currentStage, overallScore, analyzedAt, topRisk, topNextStep, betAgeDays, pulse, logoUrl? }` per project (sorted by ascending score), where `pulse ∈ {shipping, converging, stuck, drifting, idle}`, `betAgeDays` = days since `analyzedAt`; `wins[]` aggregates `improvements[]` and `nextStepsTaken.filter(taken)` with evidence strings. `updates[] = { id, projectId, projectName, message, summary, summarizing, sha (7-char), fullSha, url, committedAt, authorName, authorAvatar }` — top-6 most recent commits across all projects with `isGithub && githubUrl`, fetched in parallel via `getRecentCommits` (uses caller's `users.github_access_token` when present; per-repo fail-soft; Next.js `revalidate: 300`). `summary` is Recgon's plain-English read of the diff (1 sentence) read from `commit_summaries`; `null` until the `commit_summary` LLM worker completes. When `summary` is null and the route enqueues a job (deduped against pending/running rows in `llm_jobs`), `summarizing: true` so the UI shows a "recgon reading" pulse instead of the raw message. PM-cockpit field `briefing = { watching, winning, deciding }`, each slot `{ headline, detail, href } \| null` derived deterministically (watching = lowest-score project's top risk; winning = newest evidence-backed win; deciding = top-leverage call: verifications > drift > assigned). Cockpit field `upNext[] = { id, label, projectId, projectName, projectScore, priority }` flattens `prioritizedNextSteps[]` (top-2 per project) into a single triage list, sorted by priority (`high` if score < 5, `med` if < 7, else `low`). |
| `/api/overview/team-pulse` | GET | Session | `?teamId=` → `{ members, stuck, velocity, idleCount, totalMembers }` — Team Health for the v2 home (consumed by `HomeBoard`'s TEAM HEALTH column). `members[] = { teammateId, displayName, avatarColor, avatarUrl, inFlight, capacityHours, loadPct, completed7d, lastActivityAt, isIdle }` (load = inFlight×4h/cap, idle = 0 in-flight + 0 completed in 7d; `avatarUrl` falls back to color-tinted initials in the UI). `stuck[] = { taskId, title, projectName, assigneeName, stage, ageDays }` for tasks in `proof_requested`/`awaiting_review`/`failed` and `assigned_at` > 48h ago. `velocity = { thisWeek, lastWeek, delta, trend }` from `agent_tasks.completed_at`. |
| `/api/overview/activity` | GET | Session | `?teamId=` → `{ feed[], buckets[], lastActivityAt, totalEvents }` — observability event stream for the v2 home. `feed[] = { id, kind, category, verb, detail, projectId, projectName, occurredAt, status }` (last 25 events; merges `activities` rows with `agent_tasks.completed_at`); `buckets[]` are 14 dense daily buckets `{ date, analysis, content, completion, agent, total }` (zero-filled for empty days) for the bottom-strip cadence chart. |
| `/api/overview/brief` | GET | Session | `?teamId=` → `{ brief: { brief, focusArea } \| null }` — Gemini recgon pulse, in-memory cache per team (2h TTL) |
| `/api/overview/analytics` | GET | Session | `?teamId=` → `{ analytics, analyticsConfigured }` — per-property 7v7 session delta with project fallback to user default, in-memory cache per team (30min TTL) |
| `/api/overview/jobs` | GET | Session | `?teamId=` → `{ jobs: [{ id, kind, status, createdAt, ageSeconds }] }` — in-flight LLM jobs (`pending` or `running`). Drives the v2 home `in flight` status tile; consumers exclude `task_verification` (internal AI plumbing). |
| `/api/overview/last-chat` | GET | Session | No params (per-user, not team-scoped). Returns the most recent terminal/mentor conversation + last assistant reply (and the user message that prompted it) → `{ chat: { conversationId, title, projectId, updatedAt, lastAssistant: { content, ts } \| null, precedingUser: { content, ts } \| null } \| null }`. Used by `/v2/terminal` (renamed from `/v2/mentor`, 307 redirect in place); no longer consumed on `/v2` home. |
| `/api/llm/jobs/[id]` | GET | Session | Poll queued LLM job status. Returns `{ status, attempts, maxAttempts, nextRetryAt, result?, error? }`. Team-access-checked. |
| `/api/cron/llm-jobs` | GET/POST | `CRON_SECRET` | Vercel cron (every minute). Drains up to 3 jobs from `llm_jobs`, handles stuck-job release. Skipped auth in local dev. |
| `/api/cron/recgon-schedule` | GET/POST | `CRON_SECRET` | Vercel cron (`0 6 * * *`). Per active team: mints scheduled brain entries (weekly health check + daily anomaly scan) and runs a dispatch pass. Idempotent via dedupKey. |
| `/api/cron/github-skill-inference` | GET/POST | `CRON_SECRET` | Vercel cron (`0 6 * * 0` = Sunday 06:00 UTC, weekly per D-25). Enqueues one `github_skill_inference` job per teammate with `teammate_profiles.github_mining_consent_at IS NOT NULL`. Drained by the per-minute `llm-jobs` cron — no inline mining. Returns `{ ok, summary: { enqueued, failed } }`. |

### GitHub Account Connect
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/github/connect` | GET | Session | Starts OAuth with `repo` scope; sets `github_connect_state` cookie |
| `/api/github/connect` | DELETE | Session | Revokes token via GitHub API, clears `githubAccessToken` |
| `/api/auth/callback/github` | GET | — | **Unified callback**: if `github_skill_mining_state` cookie present → Phase 2 / Plan 02-03 consent flow (persists token + sets `teammate_profiles.github_mining_consent_at`, redirects `/teams/{teamId}/me?github_skill_mining=connected\|failed`). Else if `github_connect_state` cookie present → account-linking flow. Otherwise → NextAuth sign-in handler. |

### MCP OAuth
| Route | Notes |
|-------|-------|
| `/api/mcp/authorize` | PKCE auth code (session required) |
| `/api/mcp/token` | Code → bearer token exchange |
| `/api/mcp` | MCP protocol endpoint (bearer token auth) |

### Help & Feedback
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/help-feedback` | POST | Session | Body `{category: 'bug'\|'idea'\|'question'\|'other', message, pageUrl?}`. Inserts into `user_feedback`; if `RESEND_API_KEY` is set, also emails the support inbox with the user's email as `replyTo`. Backs `HelpFeedbackModal` opened from the v2 avatar menu. |

### Rate Limits
- Register: 5/hr/IP
- Analyze: 5/min/IP
- Marketing: 10/min/IP
- Feedback: 15/min/IP

---

## 4. Database Schema

### Core Tables
| Table | Key Columns |
|-------|-------------|
| `users` | `id`, `email` (unique), `password_hash`, `nickname`, `github_access_token`, `social_profiles` (JSONB) |
| `teams` | `id`, `name`, `slug` (unique), `created_by` |
| `team_members` | `(team_id, user_id)` PK, `role` enum |
| `team_invitations` | `id`, `token` (unique hex), `expires_at`, `accepted_at` |

### Project Tables
| Table | Key Columns |
|-------|-------------|
| `projects` | `id`, `team_id`, `created_by`, `name`, `path`, `source_type`, `github_url`, `last_analyzed_commit_sha` |
| `project_analyses` | `project_id` (PK), `data` (JSONB: ProductAnalysis) |
| `marketing_content` | `id`, `project_id`, `platform`, `content` (JSONB) |
| `campaigns` | `id`, `project_id`, `type`, `goal`, `plan` (JSONB) |
| `project_integrations` | Per-project external-platform creds (Instagram first; designed for TikTok/X/LinkedIn). Columns: `id`, `project_id`, `team_id`, `provider` (text), `account_id` (e.g. IG Business Account ID), `account_handle` (e.g. `@coolbrand`), `access_token`, `refresh_token`, `expires_at`, `metadata` (JSONB), `connected_by`. Unique `(project_id, provider)` — reconnecting overwrites. Service-role-only access. |

### Utility Tables
| Table | Purpose |
|-------|---------|
| `mcp_auth_codes` | PKCE codes (5-min expiry, one-time use) |
| `mcp_tokens` | Persistent bearer tokens per user/client |
| `rate_limits` | Sliding-window counters per route+IP |
| `analysis_quotas` | Per-user: 3 total analyses, 14-day cooldown |
| `quota_exceptions` | Email allowlist to bypass quota |
| `email_verifications` | OTP codes for registration |
| `chat_messages` | Mentor chatbot history |
| `user_feedback` | Help & Feedback submissions from the v2 avatar-menu modal. Columns: `id`, `user_id` (FK→users), `user_email`, `team_id` (FK→teams), `category` (`bug`/`idea`/`question`/`other`), `message`, `page_url`, `user_agent`, `created_at`. Migration: `20260510_user_feedback.sql`. Powered by `POST /api/help-feedback`. |
| `analytics_configs` | GA4 configs scoped via `(user_id, team_id)` keys. `team_id IS NULL` = personal config (one per user); `team_id IS NOT NULL` = team config (one per team, `user_id` records the connecting/token-owning user). Token writeback always targets the same row that was loaded. Two partial unique indexes enforce the keying. |
| `llm_jobs` | Persistent queue for batch LLM work. Columns: `id`, `team_id`, `user_id`, `kind` (`codebase_analysis`/`competitor_analysis`/`idea_analysis`/`task_verification`/`commit_summary`/`github_skill_inference`), `payload` (jsonb), `status` (`pending`/`running`/`succeeded`/`failed`/`dead`), `result` (jsonb), `error`, `attempts`, `max_attempts` (default 12), `next_retry_at`, `locked_at`, `locked_by`. Partial index on pending rows; atomic claim via `claim_next_llm_job()` SQL function (`FOR UPDATE SKIP LOCKED`). (`teammate_task` and `feedback_analysis` kinds removed with the AI-doer side and feedback feature.) |
| `commit_summaries` | Persistent cache of Recgon's plain-English summaries of GitHub commits, used by the home cockpit's "updates" column. Columns: `id`, `github_url`, `sha`, `raw_message`, `summary`, `committed_at`, `generated_at`. Unique on `(github_url, sha)` — generation is idempotent. Populated by the `commit_summary` LLM worker; lookup helpers in `lib/commitSummary.ts`. Migration: `20260503_commit_summaries.sql`. |
| `llm_health` | Shared LLM circuit-breaker state, one row per provider. Columns: `provider` (pk), `state` (`closed`/`half_open`/`open`), `failure_count`, `window_start`, `opened_until`, `updated_at`. Atomic RPCs `llm_health_try()` (gated by `FOR UPDATE` so only one instance probes during cooldown expiry), `llm_health_record_success()`, `llm_health_record_failure()` (5 failures / 30s window → open for 60s). |

**RLS**: Enabled on all tenant tables. Backend always uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). RLS is defense-in-depth only.

---

## 5. Auth Flow

### Session Auth (NextAuth JWT)
- Credentials: `@metu.edu.tr` email only, bcryptjs hashed password
- GitHub OAuth: scope `read:user user:email public_repo`
- JWT payload: `{ id, email, nickname, avatarUrl }`

### Middleware (`src/middleware.ts`)
- Unauthenticated → redirect to `/login`
- Authenticated on `/login` or `/register` → redirect to `/`
- POST/PUT/PATCH/DELETE APIs require `Sec-Fetch-Site: same-origin` (CSRF)
- MCP routes bypass CSRF check
- Mobile User-Agents redirected to `/landing`

### MCP OAuth (PKCE)
1. User visits `/api/mcp/authorize` (must be logged in) → auth code (5 min)
2. MCP client POSTs to `/api/mcp/token` with code + verifier → bearer token
3. Bearer token used in `Authorization: Bearer <token>` header on `/api/mcp`

---

## 6. AI Pipeline

### LLM Layer (`lib/llm/` + `lib/gemini.ts` facade)
- **Multi-provider chain**: `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `claude-haiku-4-5` (Anthropic). Gemini flash/lite share Google infrastructure so they fall together during regional outages; Claude provides true cross-provider resilience. Non-recoverable errors (auth, bad request) short-circuit the chain.
- `lib/llm/providers.ts` — `LLMProvider` interface, `geminiProvider`, `claudeProvider`, `chatViaChain()` (testable), `chatViaProviders()` (production entry), `chatHedged()` (opt-in adaptive hedging for interactive non-streaming calls). Claude uses `{`-prefill + JSON-only system-prompt guard to match Gemini's default `responseMimeType: 'application/json'` output. `ChatOptions.responseMimeType` (`'application/json'` default, `'text/plain'` opt-in) lets prose tasks like `commit_summary` skip JSON mode — Gemini's structured-output otherwise truncates short prose answers mid-string-literal. `ChatOptions.timeoutMs` (Phase 1 / Plan 01-03) overrides the default `REQUEST_TIMEOUT_MS` per call — used by interactive routes (e.g. profile save) that must complete inside Vercel's 10s function budget.
- `lib/llm/utils.ts` — shared `isOverloaded` / `isRateLimited` / `withTimeout` / `withRetry` (503/529/overloaded/high-demand ≈ overload; 429/quota ≈ rate limit).
- `lib/llm/circuitBreaker.ts` — Supabase-backed per-provider breaker. `shouldTry(provider)` consulted before each call; `recordSuccess` / `recordFailure` fire-and-forget. 10s in-process cache for 'closed' decisions so the happy path adds zero latency. Fail-open on breaker errors — a broken breaker must never block working providers. Recoverable errors only (auth/schema failures don't tar breaker state).
- `lib/gemini.ts` — thin facade re-exporting `chat`, `getGeminiClient`, `withRetry` for historical callers.
- Auto-retry per provider: 503 → exponential (3s/6s/12s, cap 20s); 429 → linear (5s/10s/15s); 3 attempts before falling to next model, then next provider.
- **Adaptive hedging** (`chatHedged`): primary fires immediately; if it hasn't resolved in 3s (configurable via `hedgeAfterMs`), secondary fires in parallel; whichever returns first wins. Losing request isn't aborted — its own `withTimeout` caps wasted compute. Respects breaker: skips hedge and uses normal chain if either provider is open. Opt-in only (not used by batch queue or streaming).
- All prompts in `lib/prompts.ts`, all schemas in `lib/schemas.ts` — never inline.

### Job Queue (`lib/llm/jobQueue.ts` + `lib/llm/workers.ts`)
- **Purpose**: batch LLM work (codebase/competitor/idea analyses) retries over a multi-hour horizon when every provider is overloaded — a transient outage can't fail a user request.
- `llm_jobs` table (see §4) holds pending/running/succeeded/failed/dead jobs. `claim_next_llm_job(worker_id)` SQL function does atomic claim via `FOR UPDATE SKIP LOCKED`.
- `lib/llm/jobQueue.ts` — `enqueueJob`, `claimNextJob`, `completeJob`, `failJob` (exponential backoff: 60s/120s/300s/600s/1200s/1800s/3600s·6 ≈ 7.5h total over 12 attempts), `releaseStuckJobs` (safety valve for crashed workers >15min), `getJob`.
- `lib/llm/workers.ts` — per-kind workers. Wired: `idea_analysis`, `codebase_analysis`, `competitor_analysis`, `task_verification`, `commit_summary`, `github_skill_inference` (Phase 2). Local-path (non-GitHub) codebase projects can't be queued — the worker runs in a separate function with no access to the caller's fs; those still surface inline errors. `github_skill_inference` returns `{ skipped: true, reason }` for the no-consent / no-token / no-team-repos / no-author paths (avoiding the 7.5h retry backoff); the successful (and `no_team_repos`) paths also include a `diagnostics: ScanDiagnostics` block surfacing `reposScanned`, `commitsFound`, `signalsEmitted`, `llmDroppedTags`, plus an opportunistic attribution probe (`githubEmailPrivate`, `githubLogin`, `githubVerifiedEmails`, `recentCommitSample`, `sampleCommitsByVerifiedEmail`, `sampleCommitsAttributedToUser`, `tokenScopes`, `tokenStatus`, `repoProbeResults`) that only fires when commit mining returned zero rows — the UI uses it to render an actionable empty-state with a precise cause (missing `repo` scope, revoked token, org SAML SSO block, private email, etc.). Mining happens in `lib/recgon/githubSkills.ts` (`runScan`) with Octokit + throttle plugin, 6-month window, 200/repo cap, title-only commits wrapped via `wrapUntrusted()`, and one `chatViaChain` call at temperature 0 with a post-hoc CANONICAL_SET filter. `touchLastScan` writes `teammate_profiles.last_scan_at` AND `teammate_profiles.last_scan_diagnostics` (JSONB column added 2026-05-14, mirrors `ScanDiagnostics` shape — persisted so the UI re-renders the empty-state after page reload and so backend debugging can inspect outcomes without log scraping) via the canonical `teammates` table (Plan 02-01 deviation — NOT `agent_teammates`).
- **Security**: sensitive credentials (e.g. GitHub access tokens) are *never* serialized into `payload`. Workers re-fetch them from the user row at run time via `getUserById()`. Payloads only carry `userId` + scoped identifiers.
- **Inline-first pattern**: API routes try the analysis in-request; only if every provider returns overload/rate-limit (`isRecoverable()`) do they enqueue a job and return `202 { status: 'queued', jobId }` (REST) or a `{ type: 'queued', jobId, message }` SSE event (streaming `/api/projects/[id]/analyze`). Happy path UX is unchanged; degraded path survives.
- Drain: `/api/cron/llm-jobs` (Vercel cron, `* * * * *`) claims up to 3 jobs per tick, runs in parallel. `CRON_SECRET` bearer-token authenticates requests in prod (local dev skips). Function `maxDuration: 300`.
- Status polling: `/api/llm/jobs/[id]` returns `{ status, attempts, nextRetryAt, error, result }`. Team-access-checked.

### Analysis Flows
| Source | Flow |
|--------|------|
| `description` | Text → `ANALYZE_IDEA_SYSTEM` prompt → `ProductAnalysis` |
| `github` (and legacy `codebase`) | File tree + top 20 files → `ANALYZE_SYSTEM` prompt → `ProductAnalysis` |
| GitHub re-analysis | Diff + existing analysis → `ANALYZE_UPDATE_SYSTEM` → updated analysis with `improvements[]` + `nextStepsTaken[]` |

**Streaming**: `/api/projects/[id]/analyze` uses SSE. UI receives progress events during long analysis runs.

### Content Generation
- **Marketing**: Per-platform system prompt; optionally scrapes live site via Firecrawl
- **Campaign**: Full plan (channels, phases, calendar, KPIs, budget)
- **Analytics**: Insights from GA4 data

---

## 7. MCP Server (`mcp-server/`)

Standalone stdio process. Used by Claude Code to access project data.

| Tool | Purpose |
|------|---------|
| `list_projects` | All projects accessible to the authenticated user |
| `get_project_analysis` | Full project: analysis + next steps + developer prompts |
| `get_actionable_items` | "What should I work on?" — incomplete steps + pending prompts |
| `mark_item_complete` | Record that a task was completed (feedback loop) |

Auth: `RECGON_MCP_TOKEN` env var → bearer token → resolves to userId → scoped to user's teams.

---

## 8. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Primary LLM provider (Gemini 2.5 Flash) |
| `ANTHROPIC_API_KEY` | Recommended | Fallback LLM provider (Claude Haiku 4.5) — used when Gemini is overloaded/rate-limited/unavailable. Strongly recommended in production; without it a Gemini outage will fail requests. |
| `CRON_SECRET` | Recommended (prod) | Bearer token the Vercel cron runner presents to `/api/cron/llm-jobs`. Required in production to prevent unauthorized queue draining; skipped in local dev. |
| `AUTH_SECRET` | Yes | NextAuth JWT signing |
| `SUPABASE_URL` | Yes | Database URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | DB access (bypasses RLS) |
| `RESEND_API_KEY` | Yes | OTP emails |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | GA4 OAuth |
| `FIRECRAWL_API_KEY` | Optional | Web scraping (competitors, social) and the `web_fetch` evidence source for off-platform task verification |
| `META_APP_ID` / `META_APP_SECRET` / `META_REDIRECT_URI` | Optional | Meta (Facebook/Instagram) app credentials for the Instagram Graph evidence source. `META_REDIRECT_URI` must match the OAuth redirect registered in the Meta dashboard, e.g. `https://recgon.app/api/integrations/instagram/callback`. Without these, the IG source is silently disabled — the router won't pick it. |
| `NEXT_PUBLIC_APP_URL` | Optional | Base URL for OAuth redirects |
| `QUOTA_EXEMPT_EMAILS` | Optional | Comma-separated, bypass analysis quota |

---

## 9. Key Patterns & Conventions

**Authorization**: Never trust client-provided `teamId`. Always look up the resource's team server-side via `getProjectTeamId()`. Verify membership with `verifyTeamAccess(teamId, userId)`.

**Project assembly**: `assembleProject()` in `storage.ts` fetches base row + all related tables in parallel. Use this to get a fully hydrated `Project`.

**Analysis quota**: 3 total per user, 14-day cooldown. Checked by `checkAnalysisQuota()`, recorded by `recordAnalysis()`. Soft limit — DB errors pass through (user is allowed).

**GitHub re-analysis**: Compares `lastAnalyzedCommitSha` → if unchanged, returns existing analysis. If changed, sends only the diff to Gemini.

**Rate limiting**: DB-backed sliding windows in `rate_limits` table. Fails closed (DB down = blocked).

**Team roles**: `owner` > `member` > `viewer`. Last-owner protection enforced — team must always have ≥1 owner.

**Prompt/schema split**: Every Gemini call uses a named constant from `prompts.ts` and validates output against a Zod schema from `schemas.ts`. No inline prompts or unvalidated responses.

**Response parsing** (`parseAIResponse()`): tries raw JSON → strips markdown fences → regex-extracts first JSON object. Throws with preview if all fail.

---

## 10. Recgon Admin (`lib/recgon/`)

Recgon is the dispatcher above the team — *not* a teammate. It reads a unified brain of open work across the team's projects, mints tasks, then assigns each to the best-fit teammate (human or AI peer).

### Tables (migration: `supabase/migrations/20260426_recgon_admin.sql`)
| Table | Key Columns / Notes |
|-------|---------------------|
| `teammates` | Unified roster. `(team_id, user_id)` unique per teammate. Default `capacity_hours=10h/wk`. `working_hours` (jsonb) is `{ days: Weekday[] }` (which weekdays the teammate works); null = every day. Daily capacity is derived as `capacity_hours / max(1, days.length)`. `fit_profile` (jsonb) is learned `taskKindScores` EMA. Soft-retire via `status='retired'`. Migration backfills existing `team_members` rows. |
| `agent_tasks` | First-class tasks. `kind` enum: `next_step`/`dev_prompt`/`marketing`/`analytics`/`research`/`custom`. `source` enum: `brain`/`user`/`teammate`/`schedule`. `source_ref.dedupKey` provides idempotency for brain/scheduled mints (partial unique index). Status flow: `unassigned → assigned → in_progress → awaiting_review → completed`. `job_id` links to `llm_jobs` for AI runs. **Verification columns (`20260428_task_verification.sql`):** `proof` (jsonb), `verification_status` enum (`none`/`auto_running`/`auto_passed`/`auto_inconclusive`/`proof_requested`/`proof_evaluating`/`passed`/`failed`/`owner_override`), `verification_evidence` (jsonb: commit shas, metric deltas, verdict text, confidence, iterations), `verified_at`, `verified_by`. |
| `agent_task_ratings` | One per task (pk on `task_id`). `rating ∈ {-1, 1}`, optional `note`. Rolled up via `teammate_stats` view (avg → 0..5 stars, default 3.5 with no ratings so newcomers get tried). |
| `recgon_state` | Per-team dispatcher memory: `brain_snapshot`, `last_dispatch_at`, `assignment_log[]` (capped at 50), `roster_proposal`. Seeded on team creation. |
| `teammate_event_log` | Append-only audit trail: `assigned`/`accepted`/`declined`/`completed`/`rated`/`reassigned`/`overloaded`/`no_fit`. |
| `agent_task_tombstones` | Migration `20260428_task_tombstones.sql`. PK `(team_id, kind, dedup_key)`. Written by `deleteTask` for `source='brain'` rows so `mintTasksFromBrain` skips entries whose dedupKey is tombstoned — prevents deleted brain tasks from being re-minted on the next dispatch. |
| `team_llm_usage` | Phase 3 / Plan 03-02 — migration `20260514_team_llm_usage.sql` (JUDGE-10). PK `(team_id, usage_date)`. Columns: `team_id text` (FK → teams.id, cascade), `usage_date date`, `judgment_calls int default 0`, `cap_alert_sent boolean default false`, `updated_at timestamptz default now()` + touch-trigger. Per-team daily counter for the LLM judgment overlay's safety cap. Read/written exclusively by `lib/recgon/judgmentBudget.ts` (`checkAndIncrement`, `alertCapExceededOnce`). When `judgment_calls >= DAILY_JUDGMENT_CALL_CAP` (50), the dispatcher silently falls back to math-only for the rest of the UTC day (T-03-02-01); `cap_alert_sent` flips to true the first time the cap is hit so the dev-ops alert email fires AT MOST ONCE per `(team_id, usage_date)` (T-03-02-02). Service-role only — no RLS. |
| `owner_dock_dismissals` | Phase 3.5 / Plan 03.5-03 — migration `20260517_owner_dock_dismissals.sql`. PK `(user_id, task_id)`. Columns: `user_id text` (FK → users.id, cascade), `task_id uuid` (FK → agent_tasks.id, cascade), `dismissed_at timestamptz default now()`. Index on `user_id`. Per-user dismissals of deferred tasks from the owner Triage Dock — another owner of the same team still sees the row until they dismiss it themselves. Triaged rows (`triage_note IS NOT NULL`) are NEVER dismissable (D-17) — the endpoint guards with a 400. Read by `listOwnerDockTasks(teamId, viewerUserId)` via `listDismissedTaskIds`; written by `dismissDockItem` (idempotent upsert). |

### Module layout
| File | Purpose |
|------|---------|
| `lib/recgon/types.ts` | All shared types (Teammate, AgentTask, BrainEntry, etc.). `RosterProposal`, `TeammateKind`, `kind`/`systemPrompt`/`modelPref` fields removed with AI-teammate side. Phase 1 (PROFILE-03) adds `ProfileVisibility = 'team_visible' \| 'owner_only'` and `TeammateProfile` (id, teamId, userId, raw + canonical text[] for skills/strengths/interests, nullable weeklyCapacityHours, createdAt, updatedAt, `githubMiningConsentAt`, `lastScanAt`) — additive layer above the existing `teammates` row, merged by `profileMerge` (Plan 02). The Phase 2 mining fields land on this interface so the worker's consent gate is a single source of truth; before this, the mapper dropped them, which silently broke every scan with a false `no_consent` exit. |
| `lib/recgon/storage.ts` | CRUD + view query: `createTeammate`, `listTeammatesWithStats` (joins `team_members.role` → `teamRole` per teammate), `updateTeammate`, `retireTeammate`, `createTask`, `listTasks`, `assignTask`, `reassignTask`, `updateTaskStatus`, `setTaskSchedule` (schedule-only update — touches `scheduled_date`/`schedule_note`/`deadline` without mutating status or assignment), `loadHoursByDateForTeammate` / `loadHoursByDateForUser` (sum estimated hours per scheduled_date across active tasks; cross-team variant for humans), `deleteTask` (hard-deletes `agent_tasks` row + writes an `agent_task_tombstones` entry for `source='brain'` rows so the dedupKey isn't re-minted), `listTombstonedDedupKeys`, `setTaskProof`, `setTaskVerification`, `upsertRating`, `getRecgonState`, `saveBrainSnapshot`, `appendAssignmentLog`, `logEvent`, `listOwnerDockTasks` (Phase 3.5 / Plan 03.5-02 — returns `{ triaged, deferred }` for the owner workload board; strips `assignmentReasoning` at the row boundary; Plan 03.5-03 added optional `viewerUserId` arg — when present, filters out deferred rows present in `owner_dock_dismissals` for that user. Triaged rows are NEVER filtered per-user — they always need owner attention.), `listAssignedTasksInWindow` (Phase 3.5 / Plan 03.5-02 — assigned/accepted/in_progress/awaiting_review tasks with `scheduled_date` in `[start, end]` for the 14-day owner grid; same privacy strip), `dismissDockItem(userId, taskId)` (Plan 03.5-03 — idempotent upsert into `owner_dock_dismissals` with `ON CONFLICT DO NOTHING`), `listDismissedTaskIds(userId, teamId)` (Plan 03.5-03 — returns the Set of task ids the user has dismissed, team-scoped via inner join). |
| `lib/recgon/verify.ts` | `runTaskVerification({ taskId, mode })` worker. Three-tier model: (1) **LLM-routed auto-verify** — `evidenceRouter` picks the best evidence source (see `evidenceSources.ts`), the chosen source fetches, and the verification LLM judges; (2) `proof_requested` flow when no source is viable or evidence is too thin; (3) owner override via dedicated route. On `passed` verdict, runs a quality-rating LLM pass and inserts `agent_task_ratings` row with `rater='recgon'`, then calls `recordRatingForLearning` and `recordSkillRating`. **Idempotency:** the worker bails at the start if the task is already in `passed`/`failed`/`owner_override` or `status` is terminal — protects against the inline kick-off and the cron drain double-running. **Stage tracking:** writes `verification_evidence.stage` (`routing` → `fetching` → `judging` → `rating`) and `verification_evidence.routedSource` at each phase. Each stage write is followed by a `STAGE_HOLD_MS` (900 ms) sleep so a no-evidence task that would otherwise complete in <250 ms still surfaces routing + fetching to the user; longer real fetches (GitHub, GA4) are unaffected since their natural latency exceeds the hold. **Live narration:** during `fetching`, `gatherEvidence` passes a `narrate(detail)` callback into `source.fetch(...)`. Each source emits concrete strings as it works ("Fetching https://example.com via Firecrawl…", "Reading commit abc1234: feat: add login", "Pulling 14 days of 'sessions' from GA4 property 521058612…") which `narrate` persists as `verification_evidence.stageDetail`. The inbox tooltip prefers `stageDetail` over the generic stage verb — so users see exactly what Recgon is reading right now. The inbox client polls `/api/inbox` every 600 ms while any task is `auto_running` or `proof_evaluating` so the per-stage tooltip text actually catches transitions. `enqueueVerification(taskId)` is fired by `POST /complete`: it enqueues a `task_verification` job (cron-drained safety net) **and** fires `runTaskVerification` inline (non-awaited) so dev (no cron) and prod (currently a daily cron) both see immediate progress. |
| `lib/recgon/evidenceSources.ts` | Pluggable evidence-source registry. Each source declares `name`, `description` (read by the router LLM), `isViable(task)` and `fetch(task, opts)`. `opts` carries an optional `narrate(detail)` callback (`Narrate` type) that sources call with concrete strings as they do work — verify.ts persists the latest one as `verification_evidence.stageDetail` so the inbox tooltip shows exactly what Recgon is reading right now. Built-in sources: `github_commits` (commit diffs from the project's GitHub repo — narrates head SHA + repo name), `ga4_metric` (GA4 metric snapshot — narrates property + metric + observed-vs-baseline; brain-minted analytics tasks carry baselines snapshotted at mint time, see brain.ts `snapshotMetricBaseline`), `marketing_artifacts` (Recgon-internal marketing_content rows — proves *generation*, not external publication; narrates row count), `instagram_graph` (real Meta Graph API — pulls IG Business Account recent media, narrates @handle, matches against task by URL or recency), `web_fetch` (Firecrawl-backed URL fetch for off-platform proof — narrates the actual URL plus byte count; flags `thin: true` when scraper hits platform shell HTML), `proof_writeup` (teammate's submitted proof text + links — narrates count of notes/links/attachments). Adding new sources (TikTok, X, LinkedIn) is a one-file change here. |
| `lib/instagramGraph.ts` | Meta Graph API client: `buildInstagramAuthUrl`, `exchangeCodeForToken`, `exchangeShortLivedForLongLived`, `findInstagramBusinessAccount` (walks user's Pages → IG Business Accounts), `listRecentMedia`, `parseInstagramShortcode`. Reads `META_APP_ID`/`META_APP_SECRET`/`META_REDIRECT_URI`. Used by both the OAuth routes and the verification source. |
| `lib/integrationStorage.ts` | Per-project external-platform credentials (`project_integrations` table). Service-role-only. Helpers: `getIntegration(projectId, provider)`, `listIntegrations(projectId)`, `upsertIntegration(...)`, `deleteIntegration(...)`. |
| `components/IntegrationsPanel.tsx` | Project-page widget. Calls `/api/integrations/status`. Shows current Instagram connection (handle + status), Connect button (→ OAuth flow), Disconnect button. Surfaces `?ig=connected\|error` callback toasts. |
| `lib/recgon/evidenceRouter.ts` | `routeEvidence(task)` — LLM router. Calls `listViableSources` (filters out sources that don't apply), then prompts an LLM to pick one with reasoning. Fast paths: 0 viable → `none`; 1 viable → skip the LLM. Falls back to a priority order on routing failure. For `web_fetch` decisions, extracts the URL from the proof or task description if the LLM doesn't supply one. |
| `lib/recgon/fitLearning.ts` | Per-skill learning: `recordSkillRating(teammateId, skills, rating)` updates `fit_profile.skillStats[skill]` (EMA + rolling 30d, prunes >90d idle). `skillWeight(profile, skills)` returns a multiplicative weight in `[0.5, 1.5]` used by `match.ts` to bias the skill-overlap score by recent track record. |
| `lib/recgon/brain.ts` | Three readers feed `BrainEntry[]`: prioritized next steps (→ `next_step`), **project health** (`growthMetrics` → `analytics`), **GitHub drift** (latest commit message has no keyword overlap with declared next steps for >7d → `research`). Each entry carries a stable `dedupKey` so re-running the dispatcher never duplicates. |
| `lib/recgon/brain.ts` | `readUnifiedBrain(teamId)` — aggregates open `prioritizedNextSteps` (→ `next_step` tasks) across all team projects. Honours existing `nextStepsTaken[]` so completed work isn't re-minted. Each entry carries a stable `dedupKey`. |
| `lib/recgon/taskMint.ts` | `mintTasksFromBrain(teamId, snapshot)` — idempotent insert via `dedupKey`; loads `agent_task_tombstones` once per call and skips any entry whose `(kind, dedupKey)` was tombstoned by a prior `deleteTask`. Before insert, batches all candidate entries through `tagTasksWithSkills` to replace the brain's generic per-source skill tags with role-aware skills derived from each task's title+description. `mintUserTask(...)` — direct user-created path (source=`user`); calls `tagSingleTaskWithSkills` when caller didn't pass explicit `requiredSkills`. |
| `lib/recgon/skillVocabulary.ts` | Single source of truth for Recgon canonical skill tags (PROFILE-02). Exports `CANONICAL_ROLES` (~50 role tokens — broad job functions including engineering, design, marketing, product, sales, data, ops, leadership) + `CANONICAL_MODIFIERS` (~225 modifier tokens — AI builder tools (Claude Code, Codex, Cursor, Windsurf, GitHub Copilot, Codeium, Aider, Continue.dev, Lovable, Bolt.new, v0, Replit, StackBlitz, Devin, vibe coding, AI pair programming), no-code & automation (Bubble, Glide, Softr, Adalo, Airtable, Zapier, Make, n8n, Retool, Notion AI), concrete languages, frontend/backend frameworks, databases, mobile platforms, cloud/devops tools, AI/ML stack, data stack, design tools, marketing tools and channels, product/engineering practices) + their union `CANONICAL_VOCAB` (~275 total), plus `CANONICAL_SET`, the `isCanonical(tag)` type-guard, the `humanizeTag(tag)` display-formatter (`'engineering'` → `'Engineering'`, `'react_native'` → `'React Native'`, `'claude_code'` → `'Claude Code'`, `'csharp'` → `'C#'`, `'nodejs'` → `'Node.js'`, `'seo'` → `'SEO'`, `'aws'` → `'AWS'`, `'ios'` → `'iOS'` via an explicit `DISPLAY_OVERRIDES` map), and the picker-UI-only `VOCAB_GROUPS` array (17 labeled subgroups — Roles, AI builder tools, No-code & automation, Languages, Frontend, Backend, Databases, Mobile, Cloud & DevOps, AI & ML, Data, Design tools, Marketing tools, Marketing channels, Product practices, Engineering practices, Other). Storage stays snake_case lowercase; humanization and grouping are UI-only — the profile picker (ProfileForm.tsx) renders `humanizeTag(tag)` in pill labels and popover items, walks `VOCAB_GROUPS` for grouped suggestions, but sends the canonical lowercase to the API. `VOCAB_GROUPS` is presentation only and NOT used by the skill tagger or matcher. Pure const module — no I/O, no imports. `prompts.ts:TAG_TASK_SKILLS_SYSTEM` and `prompts.ts:SKILL_NORMALIZE_SYSTEM` (Plan 01-03) both interpolate from `CANONICAL_ROLES` / `CANONICAL_MODIFIERS` (no duplicated literal list); `skillTagger.ts` and `normalizeProfile.ts` filter tags through `CANONICAL_SET` defense-in-depth; the teammate profile picker (Plan 03 `/teams/[id]/me`) shares the same vocab so users can never pick a tag the tagger wouldn't emit. |
| `lib/recgon/skillTagger.ts` | LLM skill tagger. `tagTasksWithSkills(tasks)` batches tasks (≤12 per call) into `chatViaProviders` with `TAG_TASK_SKILLS_SYSTEM`/`tagTaskSkillsUserPrompt`, validates against `TaskSkillTagsResponseSchema`, sanitizes (lowercases, strips stopword tags `next_step`/`strategy`/`product`/`review`/`risk`/`data`/`general`/`task`/`todo`, defense-in-depth filters through `CANONICAL_SET` from `skillVocabulary.ts`, caps at 5 per task). Falls back to caller-supplied skills on LLM/parse failure. `tagSingleTaskWithSkills(task)` is the single-task convenience used by `mintUserTask` and the dispatcher's legacy retag path. |
| `lib/recgon/match.ts` | Scoring: `base = 0.45·skillOverlap + 0.30·fitForKind + 0.15·availabilityNow + 0.10·loadHeadroom`, then `score = base + interestNudge` (Phase 1 / D-03: additive AFTER the weighted sum, capped at `INTEREST_NUDGE_WEIGHT = 0.03` — ≤ 0.05 hard cap from D-03; only breaks ties between similarly-skilled candidates, cannot flip a strictly better-skill candidate). `MIN_FIT_SCORE = 0.4` — below that, task falls through to the team-owner fallback in `dispatcher.ts`. Skill source unions explicit `teammate.skills` with tokens parsed from `teammate.title` (with a small alias map: `dev`/`engineer`→`engineering`, `social`/`media`→`social_media`, `tester`→`qa`, `founder`→`strategy`, etc.) so an empty-skills teammate with a meaningful job title still matches. Interest-nudge reads optional `teammate.interests` (set by `profileMerge`); missing field → 0 nudge (back-compat). `MatchResult.breakdown.interestNudge: number` exposes the term separately for debugging / tie-break inspection. `isWorkingDay()` checks the teammate's working weekdays (timezone-agnostic). Routes to human teammates only. Phase 3.5 / Plan 03.5-02 adds three exported capacity helpers used by the owner workload board: `dailyCapacityHours(t)` = `capacityHours / workingDays.length` (lifted from the inline SwimLane helper), `weeklyCapacityHours(t)` = `dailyCapacityHours(t) * workingDaysPerWeek` (fallback 5 when working hours are not configured), and `weeklyScheduledHours(tasks, teammateId, weekStartISO)` which sums estimated hours of tasks whose `scheduledDate` falls in the inclusive 7-day window (insight-only tasks excluded). |
| `lib/recgon/profileMerge.ts` | Phase 1 / PROFILE-04 / Plan 01-02, widened in Phase 2 / Plan 02-04. Pure 5-arg merge `profileMerge(teammate, profile, inferred, ema, now?=new Date())` returning `Teammate & { interests: string[] }`. Phase 1 behavior preserved: field-level fallback (D-06), strengths fold into skills (D-02), interests as additive field (D-03), EMA passthrough on `fitProfile`, null-profile → owner-unchanged + `interests: []` (D-08). Phase 2 / SKILL-04 adds a 3-source per-tag weighted blend `blended = WEIGHT_SELF·self + WEIGHT_INFERRED·inferred + WEIGHT_EMA·ema` (constants `0.5 / 0.3 / 0.2`, tunable). Inferred map: rejectedAt-set rows are EXCLUDED in-merge (defense-in-depth; storage SQL also filters — ROADMAP success #3). Inferred scores AND EMA `skillStats[tag].rolling30dAvg` (re-mapped from `[-1, 1]` to `[0, 1]`) pass through `applyTimeDecay` (τ=90d) at read time using each row's `lastSeenAt` / `lastRatedAt` — stale signal fades without a DB write-back (ROADMAP #4). Tags whose blended score is below `BLEND_THRESHOLD = 0.05` are dropped from the returned `skills` array, so old EMA-only signal naturally disappears. Optional 5th `now: Date` argument is a test-only escape hatch for deterministic clock pinning (production code never passes it). No Supabase, no LLM — trivially unit-testable. |
| `lib/recgon/judge.ts` | Phase 3 / Plan 03-01 — LLM judgment overlay (pure module). `runJudgment(inputs: JudgeTaskInput[], opts: { chat, timeoutMs? }): Promise<JudgeResult>` is a batch close-call tiebreaker: caller pre-anonymizes the math top-3 to candidate_1/2/3, this module builds the `JUDGE_ASSIGNMENT_BATCH_SYSTEM` + `buildJudgeBatchUserPrompt(...)` payload (from `prompts.ts`), calls the injected `chat` adapter at `temperature: 0` with `responseMimeType: 'application/json'` (default `timeoutMs: 10000`), then validates the response with `JudgeResultSchema` (Zod, from `schemas.ts`) AND a post-hoc content validator. Any failure throws `JudgeError` so the caller (Plan 03-02 dispatcher integration) catches and falls back to math-only silently (JUDGE-05). Post-hoc rules: chosen_candidate_id ≤ candidates.length, no pronouns (`he|she|they|him|her|them|his|hers|theirs`), no cross-candidate references (`candidate_N`), per-reason_code substring checks (`skill_depth` requires whole-word hit in chosen `confirmedSkills`; `recent_track_record` rejects any numeric/word count > `recentTasks.length`; `interest_match` requires whole-word hit in chosen `interests`). Also exports `computeJudgeCacheKey(taskId, candidateUserIds[], mathScoresHash) → string` returning `${taskId}|${sorted_ids.join(',')}|${mathScoresHash}` for Plan 03-02's cache layer (JUDGE-09 — sort makes the key order-independent). **Plan 03-02 addition:** `export const CLOSE_CALL_THRESHOLD = 0.20` (locked at 0.20 per RESEARCH Q1 sub-note — supersedes the 0.15 in ROADMAP / JUDGE-01; CONTEXT D-30 + memory `project_quality_over_cost_v3` rationale: catches ~70% of tasks at ~$0.001 each, well under the daily cap). Adapter signature matches `chatViaProviders` from `lib/llm/providers.ts` so the unit tests swap in a stub and production wires the real chain; the module imports zero LLM SDKs directly (constraint JUDGE-05). Reason enum (in `schemas.ts:REASON_CODES`): `recent_track_record | interest_match | skill_depth | task_kind_familiarity | capacity_headroom`. `prompts.ts:JUDGE_ASSIGNMENT_BATCH_SYSTEM` is the system prompt; `buildJudgeBatchUserPrompt(tasks)` renders one `<task_block>` per task with the four-breakdown + qualitative band labels (`low`/`medium`/`high`) per D-27. Types live in `lib/recgon/types.ts`: `JudgeCandidateInput`, `JudgeTaskInput`, `AssignmentReasoning` (the discriminated union for `agent_tasks.assignment_reasoning` JSONB landing in Plan 03-03). 5 byte-identical-except-name fixtures in `src/__tests__/fixtures/judge-bias/` (English-M / Turkish-F / Arabic-M / East-Asian-F / Spanish-mixed) feed both `judge.test.ts` (unit) and Plan 03-04's bias regression. |
| `lib/recgon/judgmentBudget.ts` | Phase 3 / Plan 03-02 — per-team daily safety cap for the judgment overlay (JUDGE-10). Single budget-enforcement surface (T-03-02-01). Exports: `DAILY_JUDGMENT_CALL_CAP = 50` (CONTEXT D-30 — log-budgeted at ~$0.05/team/day worst case), `currentUsageDate(): string` (UTC `YYYY-MM-DD`), `checkAndIncrement(teamId) → { allowed, callsToday, reason? }`, `alertCapExceededOnce(teamId, usageDate)`. `checkAndIncrement` reads `team_llm_usage` → if `judgment_calls >= cap` returns `allowed:false, reason:'cap_exceeded'` WITHOUT bumping; else upserts `+1`. Concurrent racers may both pass the check (T-03-02-03 accepted per RESEARCH Q4 note 2; cron is 1/minute, race window is small). `alertCapExceededOnce` reads `cap_alert_sent` flag first (idempotency gate) → if true, no-op; if false, flips the flag in the DB BEFORE the email send so even an email failure leaves the flag flipped. Email is best-effort via Resend, gated by `DEV_OPS_ALERT_EMAIL` env (log-only fallback per D-30). Email body contains only the team UUID and date (T-03-02-02 — no per-team data beyond the debug minimum). Both `readUsageRow` and the upsert wrap chained Supabase calls in try/catch — DB failure is logged + fails open (cap is a safety rail, not a hard quota; never block real dispatch over a transient hiccup). Service-role only. |
| `lib/recgon/profileStorage.ts` | Phase 1 / PROFILE-03 / Plan 01-03. CRUD against the `teammate_profiles` table: `getProfile(teamId, userId)` (maybeSingle → nullable), `listProfiles(teamId)` (batch read for dispatcher wiring in Plan 04), `upsertProfile(input)` (onConflict `team_id,user_id` — single row per teammate per team), `mapTeammateProfile(row)` snake_case → camelCase mapper. Stores raw user text alongside canonical-filtered tags (D-14) plus `normalization_pending` (Pitfall 7 LLM-degraded marker). Mapper also surfaces `github_mining_consent_at` and `last_scan_at` (Phase 2 columns) so the `runGithubSkillInference` worker's consent gate reads the real DB value; before this fix the mapper dropped both fields and every scan exited early with `no_consent`. Service-role only — never imported by client components. |
| `lib/recgon/inferredSkillsStorage.ts` | Phase 2 / SKILL-03..06. CRUD against `teammate_inferred_skills`. Reads: `listInferredSkills(teammateId)` (all rows), `listActiveInferredSkills(teammateId)` (rejected excluded, served by `idx_tis_teammate_active`), `getInferredSkill(id)` (IDOR check), `listRejectedTags(teammateId)` (worker pre-filter), `getTeammateUserId(id)` (IDOR), `getTeammateByTeamUser(teamId, userId)`, `getMiningStatus(teamId, userId)`. **`listActiveInferredSkillsForTeam(teamId)` (Plan 02-04 / SKILL-04):** team-scoped batch read returning `Map<teammateId, Map<canonicalTag, InferredSkill>>` — called ONCE per `runDispatch` / `dispatchTask` to feed `profileMerge` without N+1 queries (T-02-22). Writes: `upsertInferredSkill` (preserves `rejected_at`/`confirmed_at`/`user_reviewed_at` on conflict — once-rejected stays rejected, D-22), `rejectInferredSkill` (sets `rejected_at = now()`), `undoRejection` (clears `rejected_at` during the 6s undo window), `markBannerReviewed` / `markInferredSkillReviewed`, `setMiningConsent` / `clearMiningConsent` (touches `teammate_profiles.github_mining_consent_at`). All access via service-role client; UI goes through `/api/teams/[id]/inferred-skills/*`. |
| `lib/recgon/normalizeProfile.ts` | Phase 1 / Plan 01-03 / QUAL-05/06. `normalizeProfileTerms({ skillsRaw, strengthsRaw, interestsRaw })` — single `chatViaChain(PROVIDER_CHAIN, ...)` call at `temperature: 0`, `taskKind: 'recgon_skill_normalize'`, `promptVersion: 'v1'`, `timeoutMs: 8000` (Pitfall 8 — stays inside Vercel's 10s function budget). Returns `{ skills, strengths, interests, degraded }` where each entry is `{ raw, canonical: string[] }`. LLM output is filtered against `CANONICAL_SET` (Pitfall 1 defense-in-depth — hallucinated tags dropped silently). On LLM error / schema-parse error, returns passthrough `{ raw, canonical: [] }` entries with `degraded: true` (Pitfall 7 — user's typed text is never lost). Empty-input fast path skips the LLM call entirely. |
| `lib/recgon/dispatcher.ts` | `runDispatch(teamId)` — read brain → save snapshot → mint → score full unassigned backlog → for each, pick best fit and record assignment for the human teammate (with email/in-app notification). Returns `{ minted, skipped, assigned, noFit, backfilled }` — `backfilled` counts active tasks that already had an owner but no `scheduled_date` and were rescheduled in-place via `setTaskSchedule`. Skips retired assignees and tasks the scheduler can't fit. `dispatchTask(teamId, taskId, { excludeTeammateIds })` is the single-task path (used after user-created task insert and after a decline — the decliner is passed via `excludeTeammateIds` so they don't get re-picked). **PROFILE-04 wiring (Phase 1 / Plan 01-04) + SKILL-04 (Phase 2 / Plan 02-04):** both `runDispatch` and `dispatchTask` call `listProfiles(teamId)` AND `listActiveInferredSkillsForTeam(teamId)` once after `listTeammatesWithStats(teamId)` and thread each teammate through a local `applyProfileMerge` helper (wrapping `profileMerge` from `lib/recgon/profileMerge.ts`) before passing the merged array into `rankMatches`. Self-declared skills/strengths/interests/capacity AND GitHub-inferred skill scores now influence assignment on the next cron tick. The inferred-skill load is a single team-scoped batch SQL query (T-02-22 — no N+1); rows are grouped in memory by teammate-id. Backwards-compat (D-08): teams with no `teammate_profiles` rows return an empty array from `listProfiles`, teams with no inferred-skill rows return an empty map from `listActiveInferredSkillsForTeam`, profileMerge returns the owner row unchanged, dispatcher behavior is identical to pre-Plan-04. **Schedule-backfill exemption:** `backfillLegacySchedules(teamId, teammates)` continues to receive the raw `teammates` shape (no merged interests / no overridden capacity) — schedule math must not see profile-overridden capacity. **Legacy retag:** before scoring, `ensureFreshSkills(task)` checks if `task.requiredSkills` matches one of the brain's old hardcoded generic tag sets (e.g. `[strategy, next_step, product]`); if so it calls `tagSingleTaskWithSkills` and persists the new tags via `updateTaskRequiredSkills`. **Owner fallback:** if no remaining teammate scores ≥ `MIN_FIT_SCORE`, the dispatcher assigns the task to the team owner-teammate so a human can decide (logged with `reason: 'owner_fallback'`). The task is left unassigned with `no_fit` only if the team has no active human owner-teammate at all. **Phase 3 / Plan 03-02 — 3-pass restructure (JUDGE-01, JUDGE-02, JUDGE-06, JUDGE-09, JUDGE-10):** `runDispatch` now runs three explicit passes: **Pass 1 (rank-all)** walks the full backlog calling `rankMatches` per task, building a `Map<taskId, RankEntry>` where `isCloseCall = ranked.length >= 2 && (ranked[0].score - ranked[1].score) < CLOSE_CALL_THRESHOLD` (0.20 from `judge.ts`); **Pass 2 (batched judge)** invokes the shared `applyJudgmentIfClose(closeCalls, { teamId, cache, chat: chatViaProviders })` helper, which `checkAndIncrement(teamId)` first (silent math-fallback on cap exhaustion + AT-MOST-ONE-PER-DAY `alertCapExceededOnce`), batches `agent_tasks` recent-history reads in ONE SELECT across every close-call candidate (T-02-22 precedent — no N+1), checks the in-process `Map<cacheKey, JudgePick>` cache (keyed by `computeJudgeCacheKey` from `judge.ts`), then calls `runJudgment` ONCE for the whole batch with `chatViaProviders` as the adapter — any `JudgeError` or throw logs `judge_batch_failed` and falls back to math top-1 for everyone in the batch. **Pass 3 (assign)** walks `ranked` again, picks `ranked[pick.chosen_candidate_id - 1]` when the judge produced a pick (QUAL-03 defense-in-depth: re-validates `idx < ranked.length` and skips picks whose teammate is in `excludeTeammateIds`), or `ranked[0]` (math top-1) otherwise — both paths flow through `dispatchSingleTaskWithReasoning(teamId, task, ranked, pick, reasoning, mergedTeammates, excludeIds)` which uses the pre-ranked list directly (no re-call of `rankMatches`) and produces an `AssignmentReasoning` envelope (`kind: 'math_only' | 'llm_tiebreaker'`) — the reasoning parameter is computed and passed through but currently `void`'d in the helper; Plan 03-03 wires it to the `agent_tasks.assignment_reasoning` JSONB write. `dispatchTask` collapses to a degenerate N=1 case of the SAME 3-pass flow (single shared `applyJudgmentIfClose` call site — same cap, same cache, same `dispatchSingleTaskWithReasoning`). Cache lifecycle: a fresh `Map` per `runDispatch` / `dispatchTask` invocation; dies on return; NO module-level cache (would leak across cron runs). Logs: `judge_batch_invoked` once per LLM call with `{ teamId, closeCallCount, cacheHits, llmCalls }`; `judge_skipped_cap` when cap blocks; `judge_batch_failed` on any throw. |
| `lib/recgon/learn.ts` | `recordRatingForLearning(teammateId, kind, rating)` — EMA update of `fit_profile.taskKindScores[kind]` (α=0.30, clamped to [-1, 1]). Wired into `POST /tasks/[id]/rating` and the verification worker. Future matching biases toward each teammate's strengths. Per-skill stats live in `fitLearning.ts`. |
| `lib/notifications.ts` | `notifyTeammateAssigned({ teammate, task, teamName })` — sends a Resend email to human assignees with the task title, kind, priority, and a deep link to `/inbox`. Fire-and-forget; no `RESEND_API_KEY` → silent skip. |
| `lib/recgon/scheduled.ts` | `runScheduledForTeam(teamId)` — daily cron entry point. `buildScheduledEntries` produces `BrainEntry[]` (weekly health check always, daily anomaly scan only if a team project has `analytics_property_id`). Mints via `mintTasksFromBrain` then runs `runDispatch`. ISO-week / ISO-day dedup keys keep it idempotent. |

### Wiring
- `lib/llm/jobQueue.ts` — `JobKind` covers analysis kinds only. Includes `commit_summary` for the home-cockpit updates column (worker in `lib/commitSummary.ts:runCommitSummaryJob`).
- `lib/llm/workers.ts` — `withRecgonDispatch` wraps existing analysis workers so completion fires `runDispatch` automatically (so freshly-minted next-steps/dev-prompts are assigned without waiting for cron).
- `lib/teamStorage.ts` — `createTeam(name, userId)` seeds `recgon_state` and the teammate row for the owner. `acceptInvitation` mirrors invited users into `teammates`.
- UI: `components/recgon/RecgonAdminPanel.tsx` (command card + roster + tasks summary) embedded at the top of `/teams/[id]`. Pages: `/teams/[id]/teammates/[teammateId]` (detail + skills + capacity + working-hours editor + per-task 👍/👎), `/teams/[id]/tasks` (filtered backlog + quick-create + reassign). The `/teams/[id]/teammates/new` page was removed with the AI-doer side.
- Calendar (v2): `/v2/projects/[id]/tasks` is a **day-precision swim-lane week calendar** (`WeekCalendar.tsx`). Rows = teammates, columns = Mon–Sun. Single-day tasks render as cards in their `scheduledDate` cell; multi-day tasks (`scheduledDate` < `scheduledUntilDate`) render as one chip spanning across the cells they occupy. No hour-of-day anywhere (avoids cross-TZ ambiguity). Per-day capacity bar shows assigned hours vs the teammate's daily capacity (`capacityHours / workingHours.days.length`); a multi-day task contributes its hours evenly across each day in its range. Fetches via `/api/teams/[id]/calendar`. Toggle switches to the legacy list view (`list-view.tsx`). Components: `src/components/v2/calendar/`.
- Personal calendar (v2): `/v2/calendar` is the user-scoped twin of the project calendar — a **project-lane** week view of every scheduled task assigned to the signed-in user across every team. One row per project the user has in-window tasks for (sorted alphabetically; tasks with no `projectId` collapse into a "no project" lane at the bottom). Read-only (drag/resize lives on the per-team calendar where ownership is unambiguous); clicking a card opens the shared `TaskDetailPanel` with assignee actions (accept / decline / mark done / submit proof). Cards carry a team badge — color from `teams.avatar_color` plus the team name — for cross-team disambiguation. A team-filter dropdown appears when the user has 2+ teams; selection persists in `localStorage` (`v2:calendar:teamFilter`). Backed by `GET /api/calendar` (which now also returns the unique `projects` set in window) and `listScheduledTasksForUser` in `recgon/storage.ts`. Components: `PersonalCalendar.tsx` + `PersonalLane.tsx`, both in `src/components/v2/calendar/`. Reuses `WeekHeader`, `TaskDetailPanel`, `EventChip`, and `calendarUtils.buildCards` from the project calendar.
- Per-user inbox: `/inbox` page lists all open assignments across teams with Accept / Decline / Mark-done buttons; sidebar nav has an "Inbox" link with a pink badge showing the open count, polled every 60s via `/api/inbox/count`. Mark done sends the task straight to `awaiting_review` (no blocking summary prompt) which fires `enqueueVerification`. The inbox renders a verification-status pill (`Recgon checking…`, `Recgon needs proof`, `Verified`, `Verification failed`) with a hover-tooltip carrying live per-stage text (e.g. "Step 2 / 3 — pulling recent GitHub commits and diff summary"). When status is `proof_requested`, an inline proof form lets the assignee submit text + links + file attachments via the shared `ProofDropZone` (uploaded via `/proof/upload` to the `proof-attachments` Supabase Storage bucket — supports images, videos, PDFs, Office docs up to 25 MB). Submit button has an explicit in-flight guard + spinner / "Submitting…" label / `pointer-events:none` so users can't accidentally fire duplicate submissions. Submitting POSTs `/api/teams/[id]/tasks/[taskId]/proof`. While any task is in `auto_running` or `proof_evaluating`, the inbox polls `/api/inbox` every 4s so the verdict appears without a manual refresh. Markdown-style `**bold**` / `__bold__` / inline code in LLM-authored task titles + descriptions is stripped client-side via `lib/strings.ts` `stripMd`. |
- Dispatcher → notifications: when Recgon assigns a task, `dispatcher.ts` fires `notifyTeammateAssigned` (email via Resend) in addition to writing the row that powers the in-app inbox.
- Decline → reassign: `/tasks/[id]/decline` flips status back to `unassigned` + logs the event, then immediately calls `dispatchTask(..., { excludeTeammateIds: [previousAssigneeTeammateId] })` so Recgon picks the next-best fit *without* handing it back to the decliner. If nobody else clears `MIN_FIT_SCORE`, the dispatcher's owner fallback kicks in and the team owner gets the task. The original assignee's `fit_profile` is unaffected (decline ≠ rating); they just get reduced load headroom on future matches.
- Agent-to-agent followups: removed with the AI-doer side. Tasks no longer spawn child tasks automatically; humans complete or decline.
- Scheduled brain (Slice 3): `vercel.json` now has two crons — the existing `/api/cron/llm-jobs` (`0 0 * * *`) plus the new `/api/cron/recgon-schedule` (`0 6 * * *`). The scheduled cron iterates every team in `recgon_state` and mints recurring `BrainEntry` rows: weekly health check (Strategy-fit) + daily GA4 anomaly scan (only when a project has `analytics_property_id`). Both use stable dedup keys (`schedule|health|<teamId>|<isoWeek>`, `schedule|anomaly|<teamId>|<isoDay>`) so re-running within the same window is a no-op.
