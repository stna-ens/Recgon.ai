# Technology Stack — v2 Additions

**Project:** Recgon — Smarter AI Product Manager v2
**Researched:** 2026-05-11
**Mode:** Brownfield additions (do NOT re-research existing stack)
**Overall confidence:** HIGH for library choices, MEDIUM for "do not add" calls

## Scope

This document is **prescriptive**. It covers what to **add** to Recgon's existing stack (Next.js 16, Supabase, Gemini/Claude chain, `llm_jobs` queue) for the five v2 capabilities:

1. Live incremental codebase analyzer
2. GitHub commit-history skill inference
3. LLM judgment overlay on dispatcher
4. Personalized task framing
5. Self-declared teammate profile UI

Each recommendation cites which capability it serves, the version verified on npm as of 2026-05-11, and rationale. The final section enumerates **what NOT to add**.

---

## Already Covered by Existing Stack — Do Not Re-Add

Calling these out so phase plans don't accidentally pull in duplicates:

| Need | Already Provided By | Where |
|------|--------------------|-------|
| LLM provider abstraction with retry + fallback | `chatViaChain()` / `chatViaProviders()` | `src/lib/llm/providers.ts` |
| Circuit breaker (cross-instance) | Supabase-backed `llm_health` table breaker | `src/lib/llm/circuitBreaker.ts` |
| Persistent background jobs with backoff | `llm_jobs` table + `claimNextJob` + Vercel cron drain | `src/lib/llm/jobQueue.ts`, `/api/cron/llm-jobs` |
| Structured LLM output validation | Zod schemas + `parseAIResponse(schema, raw)` | `src/lib/schemas.ts` |
| Prompt registry / versioning hook | `src/lib/prompts.ts` + `PROMPT_VERSIONS` in `src/lib/llm/quality.ts` | — |
| GitHub OAuth + access token storage | NextAuth + `users.github_access_token` | `src/auth.ts`, `src/lib/storage.ts` |
| GitHub REST commits / compare / zipball | Hand-rolled `fetch`-based fetcher | `src/lib/githubFetcher.ts` |
| Accessible interactive UI primitives | 28 Radix UI primitives + `@radix-ui/themes` | `package.json` |
| Form / button / icon UX | Radix + Tailwind + `lucide-react` | — |

**Implication:** Layers 1–4 below build on these. We do NOT introduce LangChain / Mastra / a second job queue / a second LLM abstraction.

---

## Capability 1: Live Incremental Codebase Analyzer

**Goal:** Re-analyze only files changed since the last brain run; replace the stale `project_analyses.analysis` full-blob path.

### Recommended Additions

| Package | Version (npm, 2026-05-11) | Purpose | Confidence |
|---------|---------------------------|---------|------------|
| `@octokit/rest` | **22.0.1** | Replace hand-rolled GitHub `fetch` calls; gives typed `repos.compareCommitsWithBasehead` (perfect for "what changed since SHA X") | HIGH |
| `@octokit/graphql` | **9.0.3** | One-shot batched queries (file path + author + language stats per commit range) — cheaper than 5 REST calls per project | HIGH |
| `web-tree-sitter` | **0.26.8** | WebAssembly tree-sitter runtime — runs in Vercel Node functions without native compilation; parses TS/JS/Python/etc. | HIGH |
| `tree-sitter-typescript` | **0.23.2** | TS/TSX grammar (loaded as `.wasm`) | HIGH |
| `tree-sitter-python` | **0.25.0** | Python grammar (loaded as `.wasm`) | HIGH |

### Why this over alternatives

- **`web-tree-sitter` (WASM) over native `tree-sitter`:** The native `tree-sitter@0.25.0` package builds a C addon at install time. That builds fine locally but is fragile on Vercel and bloats `serverExternalPackages`. WASM is portable, ~2-3MB per grammar, parses ~10MB/s — plenty fast for "files changed since SHA X" deltas.
- **Tree-sitter over Babel parser:** Babel only does JS/TS. Recgon's user base imports Python repos too (existing zipball flow handles any language). Tree-sitter is polyglot with one API.
- **Tree-sitter over `ast-grep`:** `ast-grep` is excellent for pattern-based search/rewrite. We want **structural extraction** (functions, classes, imports, file responsibility) for an LLM summary prompt, not pattern matching. Tree-sitter is the right primitive; `ast-grep` would be over-tooled here. Defer `ast-grep` until/unless we need codemods.
- **`@octokit/rest` over the hand-rolled fetcher:** `src/lib/githubFetcher.ts` already works for zipballs and `compare`, but it lacks rate-limit handling, conditional ETags, and pagination. Octokit handles all of those and ships first-class TypeScript types. Keep the existing zipball helper for the seed path; use Octokit for the new incremental path.
- **GraphQL for skill inference, REST for diffs:** REST `compareCommitsWithBasehead` is the simplest "list changed files since SHA". GraphQL wins for "user X's last 200 commits across this team's repos with file paths and languages" because one query replaces ~30 REST calls. Use the right tool for each query, both via Octokit.

### Pattern

```ts
// New file: src/lib/recgon/incrementalCode.ts
// 1. Load last analyzed SHA from project_analyses (new column: last_analyzed_sha)
// 2. Octokit: compareCommitsWithBasehead(owner, repo, base=lastSHA, head=defaultBranch)
// 3. For each changed file: fetch raw content, parse with web-tree-sitter,
//    extract { exportedSymbols, importedSymbols, lineCount, language }
// 4. Cap at top-N most-changed files (e.g. 20); summarize each as a short bullet via Gemini Flash-Lite
// 5. Merge bullets into project_analyses.code_signal (new JSONB column),
//    set last_analyzed_sha = head
// 6. Enqueue as kind='incremental_code_analysis' through existing llm_jobs queue
```

### Migration impact

- New columns: `project_analyses.last_analyzed_sha TEXT`, `project_analyses.code_signal JSONB`
- New worker kind: `incremental_code_analysis` in `src/lib/llm/workers.ts`
- New prompt in `src/lib/prompts.ts`: `INCREMENTAL_CODE_SIGNAL_SYSTEM` / `incrementalCodeSignalUserPrompt`
- New schema in `src/lib/schemas.ts`: `CodeSignalSchema` (z.object with `summary`, `hotFiles[]`, `riskFlags[]`)

---

## Capability 2: GitHub Commit-History Skill Inference

**Goal:** Seed `teammates.skills[]` and `fitProfile.skillStats` from each member's GitHub commit history.

### Recommended Additions

Reuses the same Octokit packages from Capability 1. No additional packages needed.

| Package | Version | Reused From |
|---------|---------|-------------|
| `@octokit/rest` | 22.0.1 | Cap 1 |
| `@octokit/graphql` | 9.0.3 | Cap 1 |

### Language detection — Do not add `linguist-js`

`linguist-js@2.9.2` is a JS port of GitHub's Linguist. **Skip it.** Reasons:

1. GitHub's GraphQL API already exposes `repository.languages` weighted by bytes-per-language — same data, no local heuristics needed.
2. For per-commit language, file extension + path heuristics (already trivial: `.ts → TypeScript`, `path startsWith "src/api/" → backend`) cover ~95% of cases.
3. Linguist's value (vendored-code detection, generated-code filters) doesn't outweigh shipping another parser dependency.

### Pattern

```ts
// New file: src/lib/recgon/githubSkillInference.ts
// For each teammate with a github_access_token:
// 1. GraphQL: user.contributionsCollection.commitContributionsByRepository(last: 100)
//    → list of (repo, commitCount) pairs
// 2. For each repo, REST: listCommits with author=user, paginate to ~200 most recent
// 3. For each commit, REST: getCommit → files[] → reduce to language bytes-by-extension
// 4. Aggregate: { TypeScript: 12400, Python: 3200, CSS: 800, ... }
// 5. Map to skill tags via existing skillTagger vocabulary (keep tags consistent
//    with how dispatcher already labels tasks)
// 6. Seed teammates.skills[] (idempotent; merge with self-declared profile)
// 7. Seed fitProfile.skillStats with priors: EMA initialized at 0.6 for top-3 languages
```

### Performance + cost discipline

- Run inference **once on connect** and **monthly** thereafter (not per-dispatch). Enqueue as `github_skill_inference` job.
- Hard cap: 200 commits per user per run. GitHub REST allows 5000 req/hr per token; this stays well under.
- Cache aggregated results in a new table `teammate_github_signal (user_id, team_id, computed_at, languages JSONB, top_paths JSONB)`.

---

## Capability 3: LLM Judgment Overlay on Dispatcher

**Goal:** Math pre-filters to top 2-3 candidates; an LLM picks the final assignee with written reasoning; falls back to math on LLM failure.

### Recommended Additions

**NONE.** Use the existing `chatViaChain()` + Zod schema + `parseAIResponse` pattern. No framework needed.

| Question | Answer |
|----------|--------|
| Should we use Vercel AI SDK (`ai@6.0.177`) for structured output? | **NO** — it's excellent, but Recgon already has `parseAIResponse` + Zod + circuit breaker. Adding `ai` would create two LLM abstractions side-by-side (`chatViaChain` for some calls, `generateObject` for others) and double the surface area for bugs. The `ai` package shines when you need streaming UI helpers or provider-agnostic tool calling — neither applies to this internal back-office decision. |
| Should we use LangChain JS or Mastra? | **NO** — both bring opinionated runtime abstractions (chains, agents, memory) that conflict with Recgon's existing pattern of "one prompt, one Zod schema, one cross-provider call." The whole `src/lib/recgon/` module is intentionally deterministic + auditable; agentic frameworks fight that. |
| What about hedged calls? | **Optional later** — `chatHedged()` already exists in `src/lib/llm/providers.ts`. Use it only if observed p95 latency on judgment calls exceeds 3s. Not part of MVP. |

### Pattern (no new packages)

```ts
// New file: src/lib/recgon/judgmentOverlay.ts
import { chatViaChain } from '@/lib/llm/providers'
import { parseAIResponse } from '@/lib/schemas'
import { JudgmentResultSchema } from '@/lib/schemas'  // new
import { JUDGMENT_SYSTEM, judgmentUserPrompt } from '@/lib/prompts'  // new

export async function pickAssignee(task, candidates /* top 2-3 from math */) {
  try {
    const raw = await chatViaChain(JUDGMENT_SYSTEM, judgmentUserPrompt(task, candidates), {
      timeoutMs: 8000,
      maxTokens: 400,
    })
    return parseAIResponse(JudgmentResultSchema, raw)
  } catch (err) {
    logger.warn({ msg: 'judgment overlay failed, falling back to math', err })
    return { winnerId: candidates[0].userId, reasoning: 'pure-math fallback', source: 'math' }
  }
}
```

### Audit log

Extend existing assignment audit (already in `agent_tasks.audit JSONB`): add `judgment: { source: 'llm'|'math', reasoning, candidatesConsidered[] }`. No schema migration needed if `audit` is already JSONB.

---

## Capability 4: Personalized Task Framing

**Goal:** Rewrite task description for the assignee — "why you, where to start, how it connects."

### Recommended Additions

**NONE.** Same as Capability 3 — reuse `chatViaChain` + Zod + prompts registry.

### Pattern

- New prompt: `PERSONALIZED_FRAMING_SYSTEM` / `personalizedFramingUserPrompt(task, assignee, projectContext)`
- New schema: `PersonalizedFramingSchema` (z.object with `headline`, `whyYou`, `whereToStart`, `howItConnects`, `body`)
- New column: `agent_tasks.personalized_description TEXT` (original description preserved in `description`)
- Trigger: after `pickAssignee` succeeds in `dispatcher.ts`, fire one more `chatViaChain` call. Cache by `(taskId, userId)` so re-renders don't re-bill.

### Cost guardrail

- Run only when `judgment.source === 'llm'` AND task is not owner-fallback-escalated. Skip framing on math-fallback assignments to bound per-task cost. (Owner sees original brain description; assignee gets framed version only when full smart-path ran.)
- Budget: ~600 input tokens + ~250 output tokens per framing call → ~$0.0003 on Gemini Flash. Safe.

---

## Capability 5: Self-Declared Teammate Profile UI

**Goal:** Next.js form pages under `src/app/teams/[id]/` for skills / strengths / capacity input.

### Recommended Additions

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `cmdk` | **1.1.1** | Command-palette-style **searchable multi-select** for skill tags — type "py" → "Python", arrow keys, fully accessible, already used by shadcn ecosystem | HIGH |

### Why cmdk and nothing else

- **Multi-select with type-ahead** is the one UX pattern Radix doesn't cover natively (Radix `Select` is single-select; Radix `Combobox` does not exist as a standalone primitive). cmdk is by the Vercel team, ~7KB, used in shadcn `<Command>`, and pairs trivially with Radix `Popover` for dropdown positioning. This matches how Recgon already builds composites.
- **Skip `downshift@9.3.2`:** Powerful but lower-level. cmdk's filtering + accessibility is already wired; downshift would require ~200 lines of glue per use site.
- **Skip `react-tag-input@6.10.6`:** Opinionated styling fights Recgon's glass-card / signature-pink design system. Tag chips are a 20-line Radix `Badge` + lucide `X` icon component — don't pull a dependency for that.
- **Skip react-hook-form:** Two forms, both small, mostly checkboxes + a number input + a cmdk multi-select. `useState` + a server action is simpler and matches the rest of Recgon's form code (`src/app/account/`, `src/app/teams/[id]/settings/`). Adding RHF only pays off above ~5 forms with deep nesting.

### Pattern

```text
src/app/teams/[id]/profile/
  page.tsx               (RSC; loads current profile)
  ProfileForm.tsx        ('use client'; uses cmdk multi-select + Radix inputs)

POST /api/teams/[id]/members/[userId]/profile
  → validates body with TeammateProfileSchema (new in schemas.ts)
  → upserts into existing agent_teammates table
    (add columns: self_declared_skills TEXT[], self_declared_strengths TEXT,
     weekly_capacity_hours INT, profile_completed_at TIMESTAMPTZ)
```

### Skill vocabulary discipline

The cmdk dropdown must source skills from a **canonical vocabulary** (same one `skillTagger` uses to tag tasks). Otherwise self-declared skills won't match task skills and fit math breaks. Add: `src/lib/recgon/skillVocabulary.ts` exporting the master list. Both `skillTagger` and the profile form read from it.

---

## DO NOT ADD — Explicit Exclusions

These come up in any "smarter AI" milestone. Skipping them is intentional.

| Excluded | Why Not | Revisit When |
|----------|---------|--------------|
| **Vector store** (pgvector, Pinecone, Weaviate, Qdrant) | Skill matching is bounded vocabulary (~50 tags). Cosine similarity on embeddings would replace deterministic Jaccard with a fuzzy black box, breaking the "explainable dispatcher" promise. Task-similarity matching for dedup is already covered by `dedupKey` + unique partial index. | Only if we add full-text search over arbitrary task descriptions / chat history at >10k row scale |
| **Embeddings API** (`text-embedding-3-large`, Gemini embeddings) | Nothing in v2 needs semantic similarity. Skill inference is keyword aggregation, judgment is small-context reasoning, framing is generation. No embedding step. | If we ever do "find similar past tasks" UX |
| **LangChain JS / LangGraph / Mastra / CrewAI / AutoGen** | Recgon's pattern is "one prompt, one Zod schema, one provider-chain call." Agentic frameworks invert control and obscure the dispatcher's auditability. The whole point of math + LLM hybrid is *fewer* layers, not more. | If we ever build true multi-step autonomous agents (currently parked: "agents real work deferred") |
| **Vercel AI SDK (`ai`)** | Excellent product, wrong fit here. We'd have two LLM abstractions, double the test surface, and gain nothing — no streaming UI for dispatcher, no provider-agnostic tool calling needed beyond what `chatViaChain` does. | If chat/terminal UX needs streaming structured output. The dispatcher path: no. |
| **Inngest / Trigger.dev / BullMQ** | The existing `llm_jobs` queue + Vercel cron is enough for v2's workloads (incremental code analysis, skill inference, judgment, framing — all bounded, short-lived). A workflow engine is justified only when we need durable multi-step orchestration with retries that span hours and cross-step state. | If we add agentic multi-step workflows OR cross 100+ jobs/min sustained throughput |
| **Linguist (`linguist-js`)** | GitHub GraphQL API gives us repo-level language breakdown for free. Per-commit language can be done with extension heuristics. Don't ship a 2MB parser. | Never, probably |
| **Native `tree-sitter` C addon** | Build fragility on Vercel; bloats `serverExternalPackages`. `web-tree-sitter` (WASM) is the cleaner choice for serverless. | Only if WASM parse speed becomes a real bottleneck (~10× slower than native; unlikely at our file counts) |
| **`ast-grep`** | Pattern-based search/rewrite, not what we need. Tree-sitter directly gives us symbol extraction. | If we add codemod / auto-fix features |
| **`downshift` / `react-tag-input` / `react-hook-form`** | cmdk + Radix + plain state already covers the profile UX. | If form count grows past ~5 and validation logic gets deeply nested |
| **A second auth provider** | NextAuth v5 is fine; v2 adds no new identity surface. | Never in v2 |
| **A new database** | Supabase is locked per `.planning/PROJECT.md` constraints. All v2 state goes in new columns / new tables on the same Postgres. | Never in v2 |

---

## Installation Summary

```bash
# Capability 1 + 2: Code analysis and GitHub
npm install @octokit/rest@^22.0.1 @octokit/graphql@^9.0.3 \
  web-tree-sitter@^0.26.8

# Tree-sitter grammars — these ship .wasm files
npm install tree-sitter-typescript@^0.23.2 tree-sitter-python@^0.25.0

# Capability 5: Skill multi-select UI
npm install cmdk@^1.1.1

# Capabilities 3 + 4: NO new packages.
```

Total new runtime dependencies: **6** (3 Octokit, 3 tree-sitter, 1 cmdk = 7; deduping shows 6 distinct because `@octokit/rest` pulls `@octokit/graphql` transitively, but we want it explicitly).

Bundle impact on the **client**: only `cmdk` (~7KB gzip). The Octokit + tree-sitter stack is server-only — must be added to `next.config.js` `serverExternalPackages` if the bundler tries to inline them.

---

## Confidence Assessment

| Recommendation | Confidence | Sources |
|----------------|------------|---------|
| `@octokit/rest@22` + `@octokit/graphql@9` | HIGH | Context7 (`/octokit/rest.js`, `/octokit/graphql-schema`), npm registry versions verified 2026-05-11 |
| `web-tree-sitter@0.26.8` over native | HIGH | Context7 (`/tree-sitter/tree-sitter`), npm verified, well-known Vercel pattern |
| Skip `ast-grep` | HIGH | Context7 confirms it's a search/rewrite tool, not a symbol extractor — wrong primitive for our need |
| Reuse `chatViaChain` for capabilities 3 + 4 (no Vercel AI SDK / LangChain) | HIGH | Direct reading of `src/lib/llm/providers.ts` shows we already have the abstraction; framework adoption would be additive surface area only |
| `cmdk@1.1.1` for skill multi-select | HIGH | Context7 (`/dip/cmdk`), npm verified, matches existing Radix + Tailwind composition pattern |
| Skip vector store / embeddings | MEDIUM | Based on current v2 scope. Fully justified for skill matching (bounded vocabulary). LOW confidence that we won't need them in v3 — flag for re-evaluation post-v2 |
| Skip Inngest / workflow engine | HIGH | Existing `llm_jobs` queue + cron pattern is documented and load-tested in production; v2 adds bounded, short jobs that fit the same mold |
| Skip `linguist-js` | MEDIUM | GraphQL gives repo-level language data; per-commit via extension heuristics is "good enough" but not bulletproof. If we later see misclassifications hurting skill inference quality, revisit |

---

## Roadmap Implications

This stack drives the following phase ordering hint (for the roadmap writer, not a prescription):

1. **Octokit migration + incremental code analyzer** (Capability 1) — foundational; many other features depend on "what changed since SHA X"
2. **Profile UI + skill vocabulary canonicalization** (Capability 5) — must precede inference and judgment, because skills need a shared dictionary
3. **GitHub skill inference** (Capability 2) — depends on Octokit (#1) and vocabulary (#2)
4. **LLM judgment overlay** (Capability 3) — depends on a populated `fitProfile` (#2 + #3)
5. **Personalized framing** (Capability 4) — last; depends on judgment having run

Each phase ships through existing `llm_jobs` queue + Vercel cron. No infra changes. All new tables/columns are additive — backward compatible per the `.planning/PROJECT.md` constraint.

---

*Sources:*
- *Context7: `/octokit/rest.js`, `/octokit/graphql-schema`, `/tree-sitter/tree-sitter`, `/ast-grep/ast-grep`, `/vercel/ai`, `/dip/cmdk`, `/downshift-js/downshift`*
- *npm registry version checks: 2026-05-11*
- *Existing codebase: `.planning/codebase/{STACK,ARCHITECTURE,INTEGRATIONS}.md`, `src/lib/llm/**`, `src/lib/recgon/**`*
