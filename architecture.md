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
  id, teamId, kind: 'human'|'ai', userId|null, displayName,
  avatarColor?, avatarUrl?, title?,
  skills: string[], systemPrompt?, modelPref?: 'gemini'|'claude'|null,
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
RecgonState: { teamId, brainSnapshot, lastDispatchAt, assignmentLog[], rosterProposal? }
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
  analysis?: ProductAnalysis, marketingContent?, feedbackAnalyses?, campaigns?,
  socialProfiles?, analyticsPropertyId?
}
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
| `/api/projects/[id]` | GET/PATCH/DELETE | Session | `?teamId=`. PATCH body: `{description?, path?, isShared?}`. `isShared` is creator-only. |
| `/api/projects/[id]/analyze` | POST | Session | **SSE stream** — progress events then `{type:'done', project}` |
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

### Recgon Admin (teammates / tasks / dispatcher)
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/teams/[id]/recgon` | GET | Session | Dispatcher state: brain snapshot + last dispatch + assignment log + active roster proposal |
| `/api/teams/[id]/recgon/dispatch` | POST | Session (write) | Manual run: read brain → mint tasks → assign best fit. Returns `{ minted, skipped, assigned, noFit }` |
| `/api/teams/[id]/recgon/propose-roster` | POST | Session (write) | (Legacy — AI-doer side removed.) One-shot LLM call that proposes a tailored AI roster from the team's projects. Saves to `recgon_state.roster_proposal`. |
| `/api/teams/[id]/recgon/accept-proposal` | POST/DELETE | Session (write) | (Legacy — AI-doer side removed.) POST `{ indices? }` materialises proposed teammates as `teammates` rows (defaults to all). DELETE clears the proposal. |
| `/api/teams/[id]/teammates` | GET | Session | List roster (with rating + load). POST removed: AI-doer side parked, no UI flow to add AI teammates. |
| `/api/teams/[id]/teammates/[teammateId]` | GET/PATCH/DELETE | Session | Get / edit (skills, prompt, capacity, working hours, status) / soft-retire |
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

### Inbox (per-user, not team-scoped)
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/inbox` | GET | Session | All non-terminal tasks assigned to teammate rows owned by the current user, decorated with team name. Each task includes `verification_status` + `verification_evidence` so the inbox can render Recgon's check state and inline proof requests. Returns `{ tasks, counts: { open, awaitingReview } }`. **Self-heals** stuck tasks: any task in `auto_running` with no `stage` and no `verdict` triggers a fire-and-forget `runTaskVerification` call (idempotent — the worker bails if the task already finalized). Recovers tasks left over from before the inline kick-off existed and tasks whose worker was killed mid-flight. |
| `/api/inbox/count` | GET | Session | Lightweight count (assigned + accepted + in_progress) for the sidebar badge. Polled every 60s. |

### AI Features
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/feedback/analyze` | POST | Session | `{projectId, feedback: string[]}` |
| `/api/feedback/history` | GET | Session | `?projectId=` |
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
| `/api/overview` | GET | Session | `?teamId=` → `{ actions, signals, unreadFeedback }` — fast-path: priority actions with `surfacedAt` staleness, recent domain signals, last-7d feedback count |
| `/api/overview/brief` | GET | Session | `?teamId=` → `{ brief: { brief, focusArea } \| null }` — Gemini recgon pulse, in-memory cache per team (2h TTL) |
| `/api/overview/analytics` | GET | Session | `?teamId=` → `{ analytics, analyticsConfigured }` — per-property 7v7 session delta with project fallback to user default, in-memory cache per team (30min TTL) |
| `/api/llm/jobs/[id]` | GET | Session | Poll queued LLM job status. Returns `{ status, attempts, maxAttempts, nextRetryAt, result?, error? }`. Team-access-checked. |
| `/api/cron/llm-jobs` | GET/POST | `CRON_SECRET` | Vercel cron (every minute). Drains up to 3 jobs from `llm_jobs`, handles stuck-job release. Skipped auth in local dev. |
| `/api/cron/recgon-schedule` | GET/POST | `CRON_SECRET` | Vercel cron (`0 6 * * *`). Per active team: mints scheduled brain entries (weekly health check + daily anomaly scan) and runs a dispatch pass. Idempotent via dedupKey. |

### GitHub Account Connect
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/github/connect` | GET | Session | Starts OAuth with `repo` scope; sets `github_connect_state` cookie |
| `/api/github/connect` | DELETE | Session | Revokes token via GitHub API, clears `githubAccessToken` |
| `/api/auth/callback/github` | GET | — | **Unified callback**: if `github_connect_state` cookie present → account-linking flow; otherwise → NextAuth sign-in handler |

### MCP OAuth
| Route | Notes |
|-------|-------|
| `/api/mcp/authorize` | PKCE auth code (session required) |
| `/api/mcp/token` | Code → bearer token exchange |
| `/api/mcp` | MCP protocol endpoint (bearer token auth) |

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
| `feedback_analyses` | `id`, `project_id`, `raw_feedback` (JSONB), `developer_prompts`, `completed_prompts` (JSONB) |
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
| `analytics_configs` | GA4 configs scoped via `(user_id, team_id)` keys. `team_id IS NULL` = personal config (one per user); `team_id IS NOT NULL` = team config (one per team, `user_id` records the connecting/token-owning user). Token writeback always targets the same row that was loaded. Two partial unique indexes enforce the keying. |
| `llm_jobs` | Persistent queue for batch LLM work. Columns: `id`, `team_id`, `user_id`, `kind` (`feedback_analysis`/`codebase_analysis`/`competitor_analysis`/`idea_analysis`/`task_verification`), `payload` (jsonb), `status` (`pending`/`running`/`succeeded`/`failed`/`dead`), `result` (jsonb), `error`, `attempts`, `max_attempts` (default 12), `next_retry_at`, `locked_at`, `locked_by`. Partial index on pending rows; atomic claim via `claim_next_llm_job()` SQL function (`FOR UPDATE SKIP LOCKED`). (`teammate_task` kind removed with the AI-doer side.) |
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
- `lib/llm/providers.ts` — `LLMProvider` interface, `geminiProvider`, `claudeProvider`, `chatViaChain()` (testable), `chatViaProviders()` (production entry), `chatHedged()` (opt-in adaptive hedging for interactive non-streaming calls). Claude uses `{`-prefill + JSON-only system-prompt guard to match Gemini's `responseMimeType: 'application/json'` output.
- `lib/llm/utils.ts` — shared `isOverloaded` / `isRateLimited` / `withTimeout` / `withRetry` (503/529/overloaded/high-demand ≈ overload; 429/quota ≈ rate limit).
- `lib/llm/circuitBreaker.ts` — Supabase-backed per-provider breaker. `shouldTry(provider)` consulted before each call; `recordSuccess` / `recordFailure` fire-and-forget. 10s in-process cache for 'closed' decisions so the happy path adds zero latency. Fail-open on breaker errors — a broken breaker must never block working providers. Recoverable errors only (auth/schema failures don't tar breaker state).
- `lib/gemini.ts` — thin facade re-exporting `chat`, `getGeminiClient`, `withRetry` for historical callers.
- Auto-retry per provider: 503 → exponential (3s/6s/12s, cap 20s); 429 → linear (5s/10s/15s); 3 attempts before falling to next model, then next provider.
- **Adaptive hedging** (`chatHedged`): primary fires immediately; if it hasn't resolved in 3s (configurable via `hedgeAfterMs`), secondary fires in parallel; whichever returns first wins. Losing request isn't aborted — its own `withTimeout` caps wasted compute. Respects breaker: skips hedge and uses normal chain if either provider is open. Opt-in only (not used by batch queue or streaming).
- All prompts in `lib/prompts.ts`, all schemas in `lib/schemas.ts` — never inline.

### Job Queue (`lib/llm/jobQueue.ts` + `lib/llm/workers.ts`)
- **Purpose**: batch LLM work (feedback/codebase/competitor/idea analyses) retries over a multi-hour horizon when every provider is overloaded — a transient outage can't fail a user request.
- `llm_jobs` table (see §4) holds pending/running/succeeded/failed/dead jobs. `claim_next_llm_job(worker_id)` SQL function does atomic claim via `FOR UPDATE SKIP LOCKED`.
- `lib/llm/jobQueue.ts` — `enqueueJob`, `claimNextJob`, `completeJob`, `failJob` (exponential backoff: 60s/120s/300s/600s/1200s/1800s/3600s·6 ≈ 7.5h total over 12 attempts), `releaseStuckJobs` (safety valve for crashed workers >15min), `getJob`.
- `lib/llm/workers.ts` — per-kind workers. Wired: `feedback_analysis`, `idea_analysis`, `codebase_analysis`, `competitor_analysis`. Local-path (non-GitHub) codebase projects can't be queued — the worker runs in a separate function with no access to the caller's fs; those still surface inline errors.
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
- **Feedback**: Sentiment + themes + feature requests + AI-ready developer prompts
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
| `teammates` | Unified roster. `(team_id, user_id)` unique when human. `kind` ∈ `human`/`ai`. AI rows carry `system_prompt`, `model_pref`, default `capacity_hours=168`. Humans default to 10h/wk. `working_hours` (jsonb) is per-day `[start,end]`; null = always available (AI default). `fit_profile` (jsonb) is learned `taskKindScores` EMA. Soft-retire via `status='retired'`. Migration backfills existing `team_members` rows. |
| `agent_tasks` | First-class tasks. `kind` enum: `next_step`/`dev_prompt`/`marketing`/`analytics`/`research`/`custom`. `source` enum: `brain`/`user`/`teammate`/`schedule`. `source_ref.dedupKey` provides idempotency for brain/scheduled mints (partial unique index). Status flow: `unassigned → assigned → in_progress → awaiting_review → completed`. `job_id` links to `llm_jobs` for AI runs. **Verification columns (`20260428_task_verification.sql`):** `proof` (jsonb), `verification_status` enum (`none`/`auto_running`/`auto_passed`/`auto_inconclusive`/`proof_requested`/`proof_evaluating`/`passed`/`failed`/`owner_override`), `verification_evidence` (jsonb: commit shas, metric deltas, verdict text, confidence, iterations), `verified_at`, `verified_by`. |
| `agent_task_ratings` | One per task (pk on `task_id`). `rating ∈ {-1, 1}`, optional `note`. Rolled up via `teammate_stats` view (avg → 0..5 stars, default 3.5 with no ratings so newcomers get tried). |
| `recgon_state` | Per-team dispatcher memory: `brain_snapshot`, `last_dispatch_at`, `assignment_log[]` (capped at 50), `roster_proposal`. Seeded on team creation. |
| `teammate_event_log` | Append-only audit trail: `assigned`/`accepted`/`declined`/`completed`/`rated`/`reassigned`/`overloaded`/`no_fit`. |
| `agent_task_tombstones` | Migration `20260428_task_tombstones.sql`. PK `(team_id, kind, dedup_key)`. Written by `deleteTask` for `source='brain'` rows so `mintTasksFromBrain` skips entries whose dedupKey is tombstoned — prevents deleted brain tasks from being re-minted on the next dispatch. |

### Module layout
| File | Purpose |
|------|---------|
| `lib/recgon/types.ts` | All shared types (Teammate, AgentTask, BrainEntry, RosterProposal, etc.). |
| `lib/recgon/storage.ts` | CRUD + view query: `createTeammate`, `listTeammatesWithStats` (joins `team_members.role` → `teamRole` per teammate), `updateTeammate`, `retireTeammate`, `createTask`, `listTasks`, `assignTask`, `reassignTask`, `updateTaskStatus`, `deleteTask` (hard-deletes `agent_tasks` row + writes an `agent_task_tombstones` entry for `source='brain'` rows so the dedupKey isn't re-minted), `listTombstonedDedupKeys`, `setTaskProof`, `setTaskVerification`, `upsertRating`, `getRecgonState`, `saveBrainSnapshot`, `appendAssignmentLog`, `logEvent`. |
| `lib/recgon/verify.ts` | `runTaskVerification({ taskId, mode })` worker. Three-tier model: (1) **LLM-routed auto-verify** — `evidenceRouter` picks the best evidence source (see `evidenceSources.ts`), the chosen source fetches, and the verification LLM judges; (2) `proof_requested` flow when no source is viable or evidence is too thin; (3) owner override via dedicated route. On `passed` verdict, runs a quality-rating LLM pass and inserts `agent_task_ratings` row with `rater='recgon'`, then calls `recordRatingForLearning` and `recordSkillRating`. **Idempotency:** the worker bails at the start if the task is already in `passed`/`failed`/`owner_override` or `status` is terminal — protects against the inline kick-off and the cron drain double-running. **Stage tracking:** writes `verification_evidence.stage` (`routing` → `fetching` → `judging` → `rating`) and `verification_evidence.routedSource` at each phase. Each stage write is followed by a `STAGE_HOLD_MS` (900 ms) sleep so a no-evidence task that would otherwise complete in <250 ms still surfaces routing + fetching to the user; longer real fetches (GitHub, GA4) are unaffected since their natural latency exceeds the hold. **Live narration:** during `fetching`, `gatherEvidence` passes a `narrate(detail)` callback into `source.fetch(...)`. Each source emits concrete strings as it works ("Fetching https://example.com via Firecrawl…", "Reading commit abc1234: feat: add login", "Pulling 14 days of 'sessions' from GA4 property 521058612…") which `narrate` persists as `verification_evidence.stageDetail`. The inbox tooltip prefers `stageDetail` over the generic stage verb — so users see exactly what Recgon is reading right now. The inbox client polls `/api/inbox` every 600 ms while any task is `auto_running` or `proof_evaluating` so the per-stage tooltip text actually catches transitions. `enqueueVerification(taskId)` is fired by `POST /complete`: it enqueues a `task_verification` job (cron-drained safety net) **and** fires `runTaskVerification` inline (non-awaited) so dev (no cron) and prod (currently a daily cron) both see immediate progress. |
| `lib/recgon/evidenceSources.ts` | Pluggable evidence-source registry. Each source declares `name`, `description` (read by the router LLM), `isViable(task)` and `fetch(task, opts)`. `opts` carries an optional `narrate(detail)` callback (`Narrate` type) that sources call with concrete strings as they do work — verify.ts persists the latest one as `verification_evidence.stageDetail` so the inbox tooltip shows exactly what Recgon is reading right now. Built-in sources: `github_commits` (commit diffs from the project's GitHub repo — narrates head SHA + repo name), `ga4_metric` (GA4 metric snapshot — narrates property + metric + observed-vs-baseline; brain-minted analytics tasks carry baselines snapshotted at mint time, see brain.ts `snapshotMetricBaseline`), `marketing_artifacts` (Recgon-internal marketing_content rows — proves *generation*, not external publication; narrates row count), `instagram_graph` (real Meta Graph API — pulls IG Business Account recent media, narrates @handle, matches against task by URL or recency), `web_fetch` (Firecrawl-backed URL fetch for off-platform proof — narrates the actual URL plus byte count; flags `thin: true` when scraper hits platform shell HTML), `proof_writeup` (teammate's submitted proof text + links — narrates count of notes/links/attachments). Adding new sources (TikTok, X, LinkedIn) is a one-file change here. |
| `lib/instagramGraph.ts` | Meta Graph API client: `buildInstagramAuthUrl`, `exchangeCodeForToken`, `exchangeShortLivedForLongLived`, `findInstagramBusinessAccount` (walks user's Pages → IG Business Accounts), `listRecentMedia`, `parseInstagramShortcode`. Reads `META_APP_ID`/`META_APP_SECRET`/`META_REDIRECT_URI`. Used by both the OAuth routes and the verification source. |
| `lib/integrationStorage.ts` | Per-project external-platform credentials (`project_integrations` table). Service-role-only. Helpers: `getIntegration(projectId, provider)`, `listIntegrations(projectId)`, `upsertIntegration(...)`, `deleteIntegration(...)`. |
| `components/IntegrationsPanel.tsx` | Project-page widget. Calls `/api/integrations/status`. Shows current Instagram connection (handle + status), Connect button (→ OAuth flow), Disconnect button. Surfaces `?ig=connected\|error` callback toasts. |
| `lib/recgon/evidenceRouter.ts` | `routeEvidence(task)` — LLM router. Calls `listViableSources` (filters out sources that don't apply), then prompts an LLM to pick one with reasoning. Fast paths: 0 viable → `none`; 1 viable → skip the LLM. Falls back to a priority order on routing failure. For `web_fetch` decisions, extracts the URL from the proof or task description if the LLM doesn't supply one. |
| `lib/recgon/fitLearning.ts` | Per-skill learning: `recordSkillRating(teammateId, skills, rating)` updates `fit_profile.skillStats[skill]` (EMA + rolling 30d, prunes >90d idle). `skillWeight(profile, skills)` returns a multiplicative weight in `[0.5, 1.5]` used by `match.ts` to bias the skill-overlap score by recent track record. |
| `lib/recgon/brain.ts` | Five readers feed `BrainEntry[]`: prioritized next steps, developer prompts, **feedback rollup** (top-5 unaddressed bugs → `dev_prompt`, top-3 themes → `research`), **project health** (`topRisks` → `next_step` p1, `growthMetrics` → `analytics`), **GitHub drift** (latest commit message has no keyword overlap with declared next steps for >7d → `research`). Each entry carries a stable `dedupKey` so re-running the dispatcher never duplicates. |
| `lib/recgon/brain.ts` | `readUnifiedBrain(teamId)` — aggregates open `prioritizedNextSteps` (→ `next_step` tasks) and `developerPrompts` (→ `dev_prompt` tasks) across all team projects. Honours existing `nextStepsTaken[]` + `completedPrompts[]` so completed work isn't re-minted. Each entry carries a stable `dedupKey`. |
| `lib/recgon/taskMint.ts` | `mintTasksFromBrain(teamId, snapshot)` — idempotent insert via `dedupKey`; loads `agent_task_tombstones` once per call and skips any entry whose `(kind, dedupKey)` was tombstoned by a prior `deleteTask`. `mintUserTask(...)` — direct user-created path (source=`user`). |
| `lib/recgon/match.ts` | Scoring: `score = 0.45·skillOverlap + 0.30·fitForKind + 0.15·availabilityNow + 0.10·loadHeadroom`. `MIN_FIT_SCORE = 0.25` — below that, task stays unassigned and Recgon logs `no_fit`. `isWithinWorkingHours()` honours per-day windows + IANA tz. **AI teammates (`kind === 'ai'`) are filtered out of `pickBestMatch` — the AI-doer side has been removed; the matcher only routes to humans.** |
| `lib/recgon/dispatcher.ts` | `runDispatch(teamId)` — read brain → save snapshot → mint → score full unassigned backlog → for each, pick best fit and record assignment for the human teammate (with email/in-app notification). Returns `{ minted, skipped, assigned, noFit }`. `dispatchTask(teamId, taskId, { excludeTeammateIds })` is the single-task path (used after user-created task insert and after a decline — the decliner is passed via `excludeTeammateIds` so they don't get re-picked). **Owner fallback:** if no remaining teammate scores ≥ `MIN_FIT_SCORE`, the dispatcher assigns the task to the team owner-teammate so a human can decide (logged with `reason: 'owner_fallback'`). The task is left unassigned with `no_fit` only if the team has no active human owner-teammate at all. |
| `lib/recgon/learn.ts` | `recordRatingForLearning(teammateId, kind, rating)` — EMA update of `fit_profile.taskKindScores[kind]` (α=0.30, clamped to [-1, 1]). Wired into `POST /tasks/[id]/rating` and the verification worker. Future matching biases toward each teammate's strengths. Per-skill stats live in `fitLearning.ts`. |
| `lib/notifications.ts` | `notifyTeammateAssigned({ teammate, task, teamName })` — sends a Resend email to human assignees with the task title, kind, priority, and a deep link to `/inbox`. Fire-and-forget; no `RESEND_API_KEY` → silent skip. |
| `lib/recgon/rosterProposer.ts` | `proposeRoster(teamId)` — reads team projects, calls `chatViaProviders` with a tailored-roster system prompt, parses 3-5 specialist proposals, saves to `recgon_state.roster_proposal`. Tolerates messy model output (raw JSON / fenced / prose-wrapped). |
| `lib/recgon/scheduled.ts` | `runScheduledForTeam(teamId)` — daily cron entry point. `buildScheduledEntries` produces `BrainEntry[]` (weekly health check always, daily anomaly scan only if a team project has `analytics_property_id`). Mints via `mintTasksFromBrain` then runs `runDispatch`. ISO-week / ISO-day dedup keys keep it idempotent. |

### Wiring
- `lib/llm/jobQueue.ts` — `JobKind` covers analysis kinds only (`teammate_task` removed with the AI-doer side).
- `lib/llm/workers.ts` — `withRecgonDispatch` wraps existing analysis workers so completion fires `runDispatch` automatically (so freshly-minted next-steps/dev-prompts are assigned without waiting for cron).
- `lib/teamStorage.ts` — `createTeam(name, userId)` seeds `recgon_state` and the human teammate row for the owner. `acceptInvitation` mirrors invited humans into `teammates`. (Preset-based AI seeding removed.)
- UI: `components/recgon/RecgonAdminPanel.tsx` (command card + roster + tasks summary) embedded at the top of `/teams/[id]`. Pages: `/teams/[id]/teammates/[teammateId]` (detail + skills + capacity + working-hours editor + per-task 👍/👎), `/teams/[id]/tasks` (filtered backlog + quick-create + reassign). The `/teams/[id]/teammates/new` page was removed with the AI-doer side.
- Per-user inbox: `/inbox` page lists all open assignments across teams with Accept / Decline / Mark-done buttons; sidebar nav has an "Inbox" link with a pink badge showing the open count, polled every 60s via `/api/inbox/count`. Mark done sends the task straight to `awaiting_review` (no blocking summary prompt) which fires `enqueueVerification`. The inbox renders a verification-status pill (`Recgon checking…`, `Recgon needs proof`, `Verified`, `Verification failed`) with a hover-tooltip carrying live per-stage text (e.g. "Step 2 / 3 — pulling recent GitHub commits and diff summary"). When status is `proof_requested`, an inline proof form lets the assignee submit text + links + file attachments via the shared `ProofDropZone` (uploaded via `/proof/upload` to the `proof-attachments` Supabase Storage bucket — supports images, videos, PDFs, Office docs up to 25 MB). Submit button has an explicit in-flight guard + spinner / "Submitting…" label / `pointer-events:none` so users can't accidentally fire duplicate submissions. Submitting POSTs `/api/teams/[id]/tasks/[taskId]/proof`. While any task is in `auto_running` or `proof_evaluating`, the inbox polls `/api/inbox` every 4s so the verdict appears without a manual refresh. Markdown-style `**bold**` / `__bold__` / inline code in LLM-authored task titles + descriptions is stripped client-side via `lib/strings.ts` `stripMd`. |
- Dispatcher → notifications: when Recgon assigns a task to a `kind='human'` teammate, `dispatcher.ts` fires `notifyTeammateAssigned` (email via Resend) in addition to writing the row that powers the in-app inbox.
- Decline → reassign: `/tasks/[id]/decline` flips status back to `unassigned` + logs the event, then immediately calls `dispatchTask(..., { excludeTeammateIds: [previousAssigneeTeammateId] })` so Recgon picks the next-best fit *without* handing it back to the decliner. If nobody else clears `MIN_FIT_SCORE`, the dispatcher's owner fallback kicks in and the team owner gets the task. The original assignee's `fit_profile` is unaffected (decline ≠ rating); they just get reduced load headroom on future matches.
- Agent-to-agent followups: removed with the AI-doer side. Tasks no longer spawn child tasks automatically; humans complete or decline.
- Roster proposal flow: legacy. The `propose-roster` / `accept-proposal` routes still exist on disk but the only entry point (`/teams/[id]/teammates/new`) has been removed. Treat as dead code pending cleanup.
- Scheduled brain (Slice 3): `vercel.json` now has two crons — the existing `/api/cron/llm-jobs` (`0 0 * * *`) plus the new `/api/cron/recgon-schedule` (`0 6 * * *`). The scheduled cron iterates every team in `recgon_state` and mints recurring `BrainEntry` rows: weekly health check (Strategy-fit) + daily GA4 anomaly scan (only when a project has `analytics_property_id`). Both use stable dedup keys (`schedule|health|<teamId>|<isoWeek>`, `schedule|anomaly|<teamId>|<isoDay>`) so re-running within the same window is a no-op.
