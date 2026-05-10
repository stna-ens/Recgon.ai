# Feature Landscape — AI Product Manager v3

**Domain:** AI Product Manager / LLM-augmented task dispatcher for small dev teams
**Milestone:** Recgon v3 — Smarter dispatcher (live code signal + teammate profile + LLM judgment + personalized framing)
**Researched:** 2026-05-11
**Confidence:** MEDIUM-HIGH (verified against Linear, Height, ChatPRD, Asana, GitHub Copilot Workspace docs + academic literature)

---

## Competitive Reference Set

| Product | Relevant Pattern | Status 2026 |
|---------|------------------|-------------|
| **Linear Triage Intelligence** | LLM-based routing using backlog as training data; suggests assignee + label + duplicates with brief explanation; 1–4 min latency; opt-in auto-apply | Tech preview, Business/Enterprise |
| **Height Copilot** | AI-autonomous PM (bug triage, backlog cleanup, spec updates, standups, subtasks from messages) | Discontinued Sept 2025 — leaves a gap |
| **ChatPRD** | Conversational AI PM; PRD/story/spec generation with CPO-level critique; pulls context from Notion/Linear/GitHub/Slack via MCP | Active, doc-centric (not dispatch-centric) |
| **GitHub Copilot Workspace** | Issue → branch → PR with autonomous coding agent; assign GitHub issue to Copilot directly | Active; complementary to (not competitor of) Recgon |
| **Asana AI Studio / Workload** | Capacity-weighted views, AI suggests redistribution; rules-based field-driven assignment | Active; manual rule authoring required |
| **Jira + ActivityTimeline** | Third-party workload-balancing layer over Jira; no native AI routing | Active; clearly behind Linear |
| **Academic (arXiv 2503.18238, 2506.05265, 2405844024159579)** | Multi-armed bandit team formation; ML role-prediction for distributed agile; personality+skill agent-based simulation | Research-grade |

**Strategic gap:** Height's shutdown leaves "AI-autonomous PM for small teams" as an open category. Linear Triage Intelligence is the closest live competitor but is workspace-scale and triage-only (not full dispatch + personalization). ChatPRD is doc-centric, not dispatch-centric. Recgon's hybrid math + LLM judgment + per-assignee framing is genuinely differentiated.

---

## Table Stakes

These are non-negotiable for v3 to feel like a "real PM" rather than a routing function. Missing any of these = users leave.

| # | Feature | Complexity | Dependencies | Recgon Foundation Status |
|---|---------|------------|--------------|--------------------------|
| TS-1 | **Capacity respect** — never assign above teammate's weekly hours | S | Self-profile (`capacityHours`) | **Already exists** (`teammates.capacityHours`, load-headroom in match weight 10%). Cheaper. |
| TS-2 | **Working-hours / timezone awareness** — schedule into actual available slots | S | Self-profile (`workingHours`) | **Already exists** (`scheduler.ts`). Free. |
| TS-3 | **Assignee reasoning visibility** — every assignment shows *why* (skill match, recent quality, load, soft factors) | M | LLM judgment overlay + audit log | **Partial**: math breakdown stored. Needs UI surface + LLM rationale field. |
| TS-4 | **Manual override of AI picks** — owner can reassign with one click; AI doesn't fight back | S | Existing task storage | **Already exists** (owner-fallback). Confirm reassignment is sticky and not re-routed on next cron. |
| TS-5 | **Deadline / scheduled-window awareness** | S | Scheduler | **Already exists** (`scheduler.ts` + `setTaskSchedule`). |
| TS-6 | **Task description quality** — actionable, scoped, not "do the thing" | M | Brain + LLM minting | **Partial**: brain mints from next-steps; quality varies. Personalization (DIF-1) raises this. |
| TS-7 | **Self-profile UI** — teammates can declare skills, strengths, interests, capacity (and edit anytime) | M | New route under `teams/[id]/` | **Missing** — explicit v3 active requirement. |
| TS-8 | **Graceful fallback when LLM unavailable** — math winner ships if Gemini+Claude both down | S | Circuit breaker, provider chain | **Already exists** (circuit breaker fail-open). v3 requirement explicit. |
| TS-9 | **Idempotent task minting** — no duplicates when cron re-runs | S | dedupKey unique index | **Already exists** (`uq_agent_tasks_source_ref`). Free. |
| TS-10 | **Backwards compatibility** — old tasks/teammates keep working through v3 rollout | S | Additive schema only | Discipline, not feature work. Migration plan required. |
| TS-11 | **Notification on assignment** — assignee learns about new task without polling the dashboard | S | `notifications.ts` + Resend email | **Already exists** (`notifyTeammateAssigned`). Verify it includes personalized framing in v3. |
| TS-12 | **Dependency awareness (minimal)** — don't assign task B until A is done if explicitly linked | M | New `task_dependencies` table or `dependsOn` field | **Missing**. Common PM expectation; deferring entirely will feel amateurish. Minimal version = manual link + scheduler skips blocked tasks. |

**Anti-pattern observed in competitors that we must avoid:** Linear's Triage Intelligence requires the assignee to know to look at the *reason* tooltip; the rationale isn't surfaced prominently. We should surface "why you" inline in the task card.

---

## Differentiators

These are the competitive moat. Each one moves Recgon from "Linear with extra steps" to "AI Product Manager that thinks."

| # | Feature | Complexity | Dependencies | Recgon Foundation Status |
|---|---------|------------|--------------|--------------------------|
| DIF-1 | **Personalized task framing per assignee** — task description rewritten as "here's why you, here's where to start (file/folder), here's how it ties to recent activity" | M | DIF-3 (LLM judgment provides reasoning) + DIF-4 (live code signal provides "where to start") + brain entry context | **Cheaper than greenfield**: brain entry, GitHub diffs, GA4 metrics already aggregated. New work = prompt + storage column for `personalizedDescription` alongside `description`. v3 active requirement. |
| DIF-2 | **GitHub-inferred skills** — analyze each member's commit history (languages, file paths, PR review activity) to seed `skills[]` + `fitProfile.skillStats` EMAs | M | GitHub OAuth token (per user, already stored), `skillTagger.ts` style LLM tagging | **Cheaper**: GitHub token storage + `githubFetcher.ts` already exist. New work = per-member commit walk + LLM extraction job. Solves cold-start better than self-declared alone. v3 active requirement. |
| DIF-3 | **LLM judgment overlay on top-2/3 math candidates** — final pick made by LLM considering soft factors (variety, recent load, dependency context, "is this a stretch task"). Math pre-filter keeps cost bounded. | M | Existing match math (`match.ts`), provider chain | **Cheaper**: match.ts top-K is one-line change. LLM call adds 1 per task, bounded. Audit log capture is just extra column. v3 active requirement. |
| DIF-4 | **Live codebase signal — incremental analyzer** — re-analyze only files changed since last brain run, feed deltas into brain | L | GitHub diff fetch + new incremental analyzer + brain integration | **Cheaper than greenfield**: `codeAnalyzer.ts`, `githubFetcher.ts`, `llm_jobs` queue all exist. New work = "since last run" tracking + diff-focused prompt. v3 active requirement. |
| DIF-5 | **"Why you" explanation with code/file pointers** — assignment includes "you touched `src/lib/X.ts` last week, this task lives there" | S–M | DIF-4 (live signal knows which files) + GitHub author per file | **Cheaper**: GitHub commit data already fetched. Mostly a prompt change in DIF-1 + a join on author/file path. |
| DIF-6 | **Stretch / cross-skill task flagging** — surface "you've never done this; could be a learning task" so owners can intentionally route growth assignments | M | DIF-3 (LLM sees skill gap), fitProfile.skillStats | **Cheaper**: EMA already tracks per-skill quality. Asking the LLM judgment overlay to flag stretch is a prompt extension, not a new pipeline. Not in v3 active list — viable v3.5 / v3. |
| DIF-7 | **Soft-factor variety enforcement** — if assignee did 3 backend tasks this week, prefer a frontend candidate for next backend task (unless skill gap is too wide) | M | DIF-3 LLM judgment, recent task history | **Cheaper**: recent assignments already in `agent_tasks`. v3 LLM overlay implicitly does this if prompted to consider "recent load mix." Not separate feature — fold into DIF-3 prompt. |
| DIF-8 | **Assignment audit log with both math + LLM reasoning** — every decision is reproducible and inspectable | S | DIF-3 | **Cheaper**: add columns to `agent_tasks` (`mathBreakdown` jsonb, `llmReasoning` text). v3 active requirement. |
| DIF-9 | **Three-source skill model convergence** — self-declared + GitHub-inferred + EMA-from-history, with the model showing which signal contributed what | M | TS-7 + DIF-2 + existing fitLearning | **Cheaper**: all three sources are already designed; needs unification layer + UI to display "your top skill `react` came from your commits + 3 completed tasks." v3 active requirement. |
| DIF-10 | **Cost-bounded LLM use** — summarize before judging, cache profile inferences, batch where possible (target: <$0.01 added cost per dispatch cycle) | M | DIF-3, DIF-4 | Discipline + caching column. Foundation has circuit breaker + job queue; cost discipline is mostly prompt design. Required by project constraints. |

**Linear comparison:** Linear Triage Intelligence does TS-3 (reasoning) and a weak version of DIF-3 (LLM picks assignee) but lacks DIF-1 (personalized framing), DIF-2 (GitHub skill inference), DIF-4 (live code signal), DIF-5 (code-pointer reasoning). Those four are the moat.

---

## Anti-Features (Deliberately NOT Building)

| # | Anti-Feature | Why Avoid | What We Do Instead |
|---|--------------|-----------|---------------------|
| AF-1 | **Full autonomy — AI executes code** | Already deferred ("agents real work deferred" 2026-04-27). Recgon dispatches; humans execute. Conflates AI PM with AI coder, dilutes positioning. | Route work to humans + recommend file pointers. Copilot Workspace covers the autonomous-coding niche. |
| AF-2 | **Black-box assignment (no reasoning)** | Explainability is core to product positioning ("reasoning the teammate can trust"). Linear users complain that triage rationale is hidden in tooltips. | Surface math breakdown + LLM rationale inline on the task card, not in a hover. |
| AF-3 | **Forced reassignment without owner override** | Erodes trust; one bad LLM call ruins the product. Owner-fallback already exists for low-confidence assignments. | Owner can reassign any task; AI does not re-route a manually-assigned task on the next cron. |
| AF-4 | **Public scoring / gamification of teammates** | Punishes people for AI's misreads; turns coworkers into competitors. Hostile to small-team trust. | EMA scoring is **private** to the dispatcher and visible only to the assignee + owner. No leaderboards. |
| AF-5 | **User feedback ingestion** (re-introducing the removed feature) | Out of scope per PROJECT.md (`project_feedback_removed.md`). Doubles milestone scope. | Brain inputs limited to codebase + GA4 + GitHub. Feedback is its own future milestone. |
| AF-6 | **AI synthetic teammates** | Removed in migration `20260505_remove_ai_teammates.sql`. Confuses delivery model (who's actually doing the work?). | Real humans only. |
| AF-7 | **Full-LLM dispatcher (no math pre-filter)** | Rejected in PROJECT.md Key Decisions: less predictable, more expensive, harder to debug. | Hybrid: math pre-filter to top 2–3, LLM picks final + writes rationale. |
| AF-8 | **Slack / calendar push notifications for delivery in v3** | Deferred until v3 ships. Adds integration surface that doesn't move the core loop. | In-app + Resend email only. Slack is a v3 candidate. |
| AF-9 | **Mobile-native dispatcher UI** | Mobile redirects to landing already; dispatcher is desktop-only. Mobile adds layout cost without core value. | Desktop only for v3. |
| AF-10 | **Replacing self-declared skills with pure GitHub inference** | Inference is noisy; people aspire to skills they're learning that don't show in commits yet. | Three-source model — self-declared has equal weight, with the UI showing where each came from. |
| AF-11 | **Vector store / new database for embeddings** | Constraint per PROJECT.md: Supabase Postgres is system of record; no new infra in v3 unless justified. | Postgres `pgvector` extension (if needed) or plain text+LLM retrieval over brain entries. Likely not needed for v3. |
| AF-12 | **Synchronous LLM in dispatch request handler** | Hits Vercel 60s timeout, kills UX. Architecture anti-pattern documented. | All LLM judgment + framing goes through `llm_jobs` queue + cron drain. |

---

## Feature Dependency Graph

```text
                                ┌──────────────────────────────────┐
                                │  TS-7  Self-profile UI           │ ← cold-start human signal
                                └──────────────┬───────────────────┘
                                               │
                                               ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│ DIF-2 GitHub-inferred    │    │  DIF-9 Three-source skill model  │
│        skills            │───►│  (unification of TS-7+DIF-2+EMA) │
└──────────────────────────┘    └──────────────┬───────────────────┘
                                               │
                                               ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│ DIF-4 Live code signal   │───►│  Brain (existing, now enriched)  │
└──────────────┬───────────┘    └──────────────┬───────────────────┘
               │                               │
               │                               ▼
               │              ┌────────────────────────────────────┐
               │              │ Math match (existing) → top 2-3    │
               │              └──────────────┬─────────────────────┘
               │                             │
               │                             ▼
               │              ┌────────────────────────────────────┐
               └─────────────►│ DIF-3 LLM judgment overlay         │
                              │       (picks final + writes why)   │
                              └──────────────┬─────────────────────┘
                                             │
                                             ▼
                              ┌────────────────────────────────────┐
                              │ DIF-1 Personalized task framing    │
                              │       + DIF-5 file/code pointers   │
                              └──────────────┬─────────────────────┘
                                             │
                                             ▼
                              ┌────────────────────────────────────┐
                              │ DIF-8 Audit log (math + LLM)       │
                              │ TS-3 Reasoning visibility in UI    │
                              │ TS-11 Notification w/ framing      │
                              └────────────────────────────────────┘
```

**Critical-path insight:** TS-7 (self-profile UI) and DIF-2 (GitHub skill inference) are independent and can run in parallel. DIF-4 (live code signal) is independent of both. DIF-3 (LLM judgment) needs at least one skill source live. DIF-1 (personalized framing) is the last step and depends on everything upstream — start its prompt design early but ship it last.

---

## MVP Recommendation (v3 Phase Ordering)

Given single-dev constraint and the dependency graph, suggested ordering:

1. **Phase 1 — Self-profile UI (TS-7)** + **assignment audit columns (DIF-8 schema)** — small, unblocks everything, gives users immediate visible value.
2. **Phase 2 — GitHub-inferred skills (DIF-2)** + **three-source skill model unification (DIF-9)** — fixes cold-start, no LLM call surface change yet.
3. **Phase 3 — LLM judgment overlay (DIF-3)** + **reasoning visibility (TS-3 UI)** + **graceful fallback verification (TS-8)** — first LLM-on-the-critical-path change; requires careful rollout.
4. **Phase 4 — Live codebase signal (DIF-4)** — largest unknown; isolated from dispatcher to start, then wired into brain.
5. **Phase 5 — Personalized task framing (DIF-1)** + **code/file pointers (DIF-5)** + **notification framing (TS-11 update)** — the wow moment. Depends on all prior.
6. **Phase 6 — Polish & minimal dependency awareness (TS-12)** — only if all prior phases are stable.

**Defer to v3:** DIF-6 (stretch-task flagging), Slack/calendar delivery, mobile dispatcher UI, feedback ingestion.

---

## Recgon Foundation Advantage Summary

Features **cheaper to build** because foundation exists:

- **DIF-1 Personalized framing** — brain entries + GitHub diffs + GA4 metrics already aggregated; only new prompt + storage column.
- **DIF-2 GitHub skill inference** — GitHub OAuth + `githubFetcher.ts` already shipped; only new LLM extraction job.
- **DIF-3 LLM judgment overlay** — provider chain + circuit breaker + `match.ts` top-K already exist.
- **DIF-4 Live code signal** — `codeAnalyzer.ts` + `llm_jobs` queue + cron infrastructure already exist; only diff-focused incremental wrapper.
- **DIF-5 Code pointers** — commit author × file data already fetched.
- **DIF-8 Audit log** — table exists; just add columns.
- **TS-2, TS-4, TS-5, TS-8, TS-9, TS-11** — all already shipped.

Features **harder than they look**:

- **TS-12 Dependency awareness** — even minimal version touches scheduler, brain, mint, and storage. Don't underestimate.
- **DIF-4 Live code signal** — "since last run" tracking is subtle; per-file state must survive cron failures and partial repos.
- **DIF-1 Personalized framing** — quality is the hard part. Prompt iteration + eval set must be planned.

---

## Sources

- [Linear Triage Intelligence — Linear Docs](https://linear.app/docs/triage-intelligence)
- [How we built Triage Intelligence — Linear](https://linear.app/now/how-we-built-triage-intelligence)
- [Linear AI features (2026) — eesel AI](https://www.eesel.ai/blog/linear-ai)
- [Height Copilot announcement — Height blog](https://height.app/blog/heights-ai-powered-solution-copilot-is-here-to-streamline-the-way-you-work)
- [Height shutting down Sept 2025 — toolify.ai](https://www.toolify.ai/tool/height-copilot)
- [ChatPRD features](https://www.chatprd.ai/product/features)
- [ChatPRD AI agents capabilities](https://www.chatprd.ai/learn/capabilities-of-ai-agents-product-management)
- [GitHub Copilot Workspace](https://githubnext.com/projects/copilot-workspace/)
- [GitHub Copilot features — GitHub Docs](https://docs.github.com/en/copilot/get-started/features)
- [Asana Workload management features](https://asana.com/features/resource-management/workload)
- [Asana AI Studio task assignment forum guide](https://forum.asana.com/t/ai-studio-automate-task-assignment-based-on-team-fields-step-by-step/1102859)
- [Collaborating with AI Agents — arXiv 2503.18238](https://arxiv.org/html/2503.18238v3)
- [Teaming in the AI Era — arXiv 2506.05265](https://arxiv.org/html/2506.05265)
- [ML for task allocation in distributed agile — ScienceDirect 2405844024159579](https://www.sciencedirect.com/science/article/pii/S2405844024159579)
- [Agent-Based Modeling of Resource Allocation by Personality and Skill — Springer](https://link.springer.com/chapter/10.1007/978-3-319-24804-2_9)
