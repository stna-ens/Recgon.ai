# Recgon.ai

AI-powered marketing content generator for developers. Point it at a GitHub repo or local codebase and get ready-to-use marketing content — captions, ad copy, videos, and more.

## What it does

- **Codebase analysis** — Reads your repo and generates a product brief (name, description, features, target audience, USPs) using Gemini AI
- **Marketing content** — Generates platform-specific content for Instagram, TikTok, and Google Ads
- **Video generation** — Creates short marketing videos via Google Veo
- **Image generation** — Generates ad visuals via Google Imagen
- **Feedback analysis** — Analyzes user feedback/comments and surfaces actionable developer insights

## Tech stack

- Next.js 14 (App Router)
- Gemini 2.5 Flash (text), Imagen 4 (images), Veo 2 (video)
- NextAuth v5 (credentials)
- Flat-file JSON storage (no database)
- Puppeteer (Instagram scraper)

## Getting started

### Prerequisites

- Node.js 18+
- A [Google AI API key](https://ai.google.dev) with billing enabled (required for video/image generation)

### Setup

```bash
git clone https://github.com/stna-ens/Recgon.ai.git
cd Recgon.ai
npm install
```

Create a `.env.local` file:

```env
GEMINI_API_KEY=your_gemini_api_key
AUTH_SECRET=your_nextauth_secret  # openssl rand -base64 32
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Register an account and log in
2. Add a project — paste a GitHub URL or a local path
3. Run **Analyze** to let Gemini read the codebase
4. Go to **Marketing** → select a platform → generate content
5. Optionally add a custom prompt to guide the output

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| POST | `/api/projects/[id]/analyze` | Analyze codebase (SSE stream) |
| POST | `/api/marketing/generate` | Generate marketing content |
| GET | `/api/marketing/video-status` | Poll video job status |
| POST | `/api/feedback/fetch` | Fetch feedback |
| POST | `/api/feedback/analyze` | Analyze feedback |

## Notes

- Video generation is async — the UI polls for completion every 5 seconds
- Video jobs are persisted to `data/video-jobs.json` and survive server restarts
- Veo video generation requires a paid Google AI plan
