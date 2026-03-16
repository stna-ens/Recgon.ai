# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (http://localhost:3000)
npm run build     # Production build
npm run lint      # ESLint check
```

No test suite is configured. There is a scratch file `test-scraper.js` and `src/lib/test-gemini.ts` for manual testing.

## Environment Variables

The app requires these env vars (create a `.env.local`):

```
GEMINI_API_KEY=   # Used for all AI: text (gemini-2.5-flash), images (imagen-4.0-fast), video (veo-3.1)
AUTH_SECRET=      # NextAuth secret — generate with: openssl rand -base64 32
```

The `openai` package is installed but the file `src/lib/openai.ts` actually wraps **Gemini**, not OpenAI. The naming is a historical artifact — do not add real OpenAI calls without updating this file.

## Architecture

### Auth layer
- `src/auth.ts` — NextAuth v5 config; credentials provider (email + password); JWT sessions
- `src/lib/userStorage.ts` — User CRUD over `data/users.json` (same flat-file pattern as projects)
- `src/middleware.ts` — Protects all routes except `/login`, `/register`, and `/api/auth/**`
- Registration: `POST /api/auth/register` → hashes password with bcrypt, stores user
- Login: NextAuth credentials flow → `/login` page uses `signIn('credentials', ...)`

### Data layer
All persistence is flat-file JSON at `data/projects.json` and `data/users.json` (created at runtime). `src/lib/storage.ts` is the single source of truth for the `Project` type and all CRUD. Projects are scoped per user via `userId`. There is no database.

### AI layer (`src/lib/`)
- `openai.ts` — Gemini chat wrapper (`gemini-2.5-flash`, always returns JSON via `responseMimeType: 'application/json'`)
- `imageGenerator.ts` — Gemini Imagen (`imagen-4.0-fast-generate-001`), returns base64 data URI
- `videoGenerator.ts` — Gemini Veo (`veo-2.0-generate-001`), polls until done (up to 5 min), saves to OS temp dir
- `videoJobs.ts` — In-memory job map for async video status tracking (lost on server restart)
- `schemas.ts` — All Zod schemas for AI response validation; `parseAIResponse()` handles Gemini's occasional markdown-wrapped JSON
- `prompts.ts` — All system/user prompt strings (single source for prompt engineering)

### Feature modules (`src/lib/`)
- `codeAnalyzer.ts` — Walks local/cloned directory (max depth 4, ignores `node_modules` etc.), reads key files + first 5 code files, sends to Gemini
- `githubFetcher.ts` — `git clone --depth 1` into OS temp dir; strips `.git` before analysis
- `contentGenerator.ts` — Orchestrates marketing generation: video starts fire-and-forget (returns a `videoJobId`), text content is awaited; Google Ads also generates an image in parallel
- `feedbackEngine.ts` — Takes an array of feedback strings, returns structured sentiment + developer prompts
- `instagramScraper.ts` — Puppeteer-based scraper for Instagram comments

### API routes (`src/app/api/`)
| Route | Purpose |
|---|---|
| `GET /api/projects` | List all projects |
| `POST /api/projects` | Create project (accepts local path or `https://github.com/` URL) |
| `GET /api/projects/[id]` | Get single project |
| `DELETE /api/projects/[id]` | Delete project |
| `POST /api/projects/[id]/analyze` | Run codebase analysis, stores result in project |
| `POST /api/marketing/generate` | Generate marketing content for a platform |
| `GET /api/marketing/video-status` | Poll video job status by `jobId` |
| `POST /api/feedback/fetch` | Scrape feedback (Instagram or manual input) |
| `POST /api/feedback/analyze` | Run feedback analysis |

### Key data flow
1. User adds a project (local path or GitHub URL → cloned to temp)
2. `/analyze` walks the codebase → Gemini → `ProductAnalysis` stored on the project
3. Marketing generation uses the stored `ProductAnalysis` → Gemini text + optional image/video
4. Feedback flow is independent of projects: fetch comments → analyze → get developer prompts

### Video job lifecycle
Video generation is always async. `POST /api/marketing/generate` for Instagram/TikTok returns a `videoJobId` immediately. The client polls `GET /api/marketing/video-status?jobId=...` until `status === 'done'`. Jobs are in-memory only — they are lost if the Next.js server restarts.
