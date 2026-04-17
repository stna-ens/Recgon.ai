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
TeamInvitation: { id, teamId, email, role, invitedBy, token, expiresAt, acceptedAt, createdAt }
```

### Project (`lib/storage.ts`)
```typescript
Project: {
  id, teamId, createdBy, name, path?, sourceType?: 'codebase'|'github'|'description',
  description?, isGithub?, githubUrl?, lastAnalyzedCommitSha?, createdAt,
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
| `/api/projects/[id]` | GET/PUT/DELETE | Session | `?teamId=` |
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

### Gemini Client (`lib/gemini.ts`)
- Model: `gemini-2.5-flash`
- Always JSON response mode (`responseMimeType: 'application/json'`)
- Auto-retry: 503 → exponential backoff (2s–32s); 429 → linear (5s–25s); max 5 retries
- All prompts in `lib/prompts.ts`, all schemas in `lib/schemas.ts` — never inline

### Analysis Flows
| Source | Flow |
|--------|------|
| `description` | Text → `ANALYZE_IDEA_SYSTEM` prompt → `ProductAnalysis` |
| `codebase`/`github` | File tree + top 20 files → `ANALYZE_SYSTEM` prompt → `ProductAnalysis` |
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
| `GEMINI_API_KEY` | Yes | All AI calls |
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
