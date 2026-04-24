# Recgon.ai

AI-powered product strategy and marketing coach for solo founders. Point it at a GitHub repo or local codebase and get a full product brief, marketing content, feedback analysis, and strategic guidance.

## What it does

- **Codebase analysis** — Reads your repo and generates a comprehensive product strategy brief (SWOT, competitors, business model, GTM strategy) using Gemini AI
- **Marketing content** — Generates platform-specific content for Instagram, TikTok, and Google Ads
- **Campaign planning** — Creates full marketing campaign plans with content calendars
- **Feedback analysis** — Analyzes user feedback and surfaces actionable developer insights
- **Analytics dashboard** — Connects to Google Analytics for AI-powered insights
- **AI mentor** — Chat interface that knows your projects and gives strategic advice

## Tech stack

- Next.js (App Router)
- Gemini 2.5 Flash (AI)
- NextAuth v5 (credentials)
- Supabase (PostgreSQL database)
- Recharts (data visualization)

## Getting started

### Prerequisites

- Node.js 18+
- A [Google AI API key](https://ai.google.dev)

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
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
WAITLIST_ADMIN_EMAILS=you@example.com
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
5. Use **Feedback** to analyze user comments
6. Connect **Analytics** for GA4 insights

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| POST | `/api/projects/[id]/analyze` | Analyze codebase (SSE stream) |
| POST | `/api/marketing/generate` | Generate marketing content |
| POST | `/api/marketing/campaign` | Generate campaign plan |
| POST | `/api/feedback/analyze` | Analyze feedback |
| GET | `/api/feedback/history` | Feedback history |
| GET | `/api/analytics/data` | Fetch analytics data |
| POST | `/api/analytics/analyze` | AI analytics insights |
