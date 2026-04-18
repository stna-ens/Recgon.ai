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

### AI Features
| Route | Method | Auth | Notes |
|-------|--------|------|-------|
| `/api/feedback/analyze` | POST | Session | `{projectId, feedback: string[]}` |
| `/api/feedback/history` | GET | Session | `?projectId=` |
| `/api/marketing/generate` | POST | Session | `{projectId, platforms[]}` → marketing content |
| `/api/marketing/campaign` | POST | Session | `{projectId, type, goal, duration}` → campaign plan |
| `/api/analytics/data` | GET | Session | GA4 raw data |
| `/api/analytics/analyze` | POST | Session | AI insights from GA4 data |
| `/api/social/profiles` | POST | Session | Scrape + analyze social profiles |
| `/api/overview` | GET | Session | `?teamId=` → `{ actions, signals, unreadFeedback }` — fast-path: priority actions with `surfacedAt` staleness, recent domain signals, last-7d feedback count |
| `/api/overview/brief` | GET | Session | `?teamId=` → `{ brief: { brief, focusArea } \| null }` — Gemini recgon pulse, in-memory cache per team (2h TTL) |
| `/api/overview/analytics` | GET | Session | `?teamId=` → `{ analytics, analyticsConfigured }` — per-property 7v7 session delta with project fallback to user default, in-memory cache per team (30min TTL) |
| `/api/llm/jobs/[id]` | GET | Session | Poll queued LLM job status. Returns `{ status, attempts, maxAttempts, nextRetryAt, result?, error? }`. Team-access-checked. |
| `/api/cron/llm-jobs` | GET/POST | `CRON_SECRET` | Vercel cron (every minute). Drains up to 3 jobs from `llm_jobs`, handles stuck-job release. Skipped auth in local dev. |

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
| `llm_jobs` | Persistent queue for batch LLM work. Columns: `id`, `team_id`, `user_id`, `kind` (`feedback_analysis`/`codebase_analysis`/`competitor_analysis`/`idea_analysis`), `payload` (jsonb), `status` (`pending`/`running`/`succeeded`/`failed`/`dead`), `result` (jsonb), `error`, `attempts`, `max_attempts` (default 12), `next_retry_at`, `locked_at`, `locked_by`. Partial index on pending rows; atomic claim via `claim_next_llm_job()` SQL function (`FOR UPDATE SKIP LOCKED`). |
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
| `FIRECRAWL_API_KEY` | Optional | Web scraping (competitors, social) |
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
