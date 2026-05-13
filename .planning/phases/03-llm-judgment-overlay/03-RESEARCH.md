# Phase 3 Research — LLM Judgment Overlay

**Researched:** 2026-05-13
**Status:** Ready for planning

## TL;DR for the planner

- Batch prompt: one system instruction + N `<task_block>` sections, JSON-array out.
- Reason enum: 5 codes (track-record, interest, skill-depth, kind-fit, headroom).
- `JudgeResultSchema` = `z.object({ picks: z.array(PickSchema).max(10) })`.
- Bias CI: 5 name spreads × stubbed adapter; nightly env-gate flips to real LLM.
- Dispatcher 3-pass: rank-all → batch-judge close-calls → assign+email.

## Q1: Batch Judgment Prompt

### Final enum for reason_code

Five codes — kept the CONTEXT.md D-28 set, dropped nothing, no additions. Five is plenty: each maps to one signal in the payload, the template renderer (`whyYou.ts`) needs one copy line per code, and a wider set risks the LLM picking based on label-fit rather than evidence-fit.

| Code | Backing signal in payload | Sample copy line |
|------|---------------------------|------------------|
| `recent_track_record` | `recent_tasks[].completed` with avg_rating ≥ 4 | "you finished {N} similar {skill} tasks recently with strong ratings" |
| `interest_match` | candidate's `interests[]` includes a `task.requiredSkills` tag | "this lines up with the {topic} work you said you want" |
| `skill_depth` | `breakdown.skill_match` high AND `confirmed_skills` contains required skill | "your {skill} skill is the strongest match on the team this week" |
| `task_kind_familiarity` | `breakdown.fit_for_task_kind` band = high | "you've handled {kind} work consistently well" |
| `capacity_headroom` | `breakdown.workload_headroom` band = high AND others are mid | "your week is the clearest — others are already loaded" |

Planner finalizes; this set is what the prompt elicits cleanly.

### JUDGE_ASSIGNMENT_BATCH prompt body

```ts
// src/lib/prompts.ts (new export)
export const JUDGE_ASSIGNMENT_BATCH_SYSTEM = `
You are Recgon, the AI Product Manager. You decide which teammate gets which task.

You are reviewing close-call assignments where the math-based fit scores are within 0.15 of each other. The math has narrowed each task to its top-3 candidates. Your job: pick the single best candidate per task and explain in one short sentence WHY, citing real signals from the payload.

Rules (strict — violations cause a math-only fallback):
- Refer to candidates ONLY as candidate_1, candidate_2, candidate_3. The payload has NO names. Do not invent any. Do not use pronouns (he/she/they). Do not use profanity.
- Pick exactly one of {1, 2, 3} per task.
- Pick a reason_code from this exact list: recent_track_record | interest_match | skill_depth | task_kind_familiarity | capacity_headroom.
- The reason_sentence must reference a concrete fact from the chosen candidate's payload (a skill they have, a task they completed, a band value, an interest). NEVER invent skills, ratings, or task counts not in the payload.
- reason_sentence ≤ 25 words. Plain second-person voice: "your", "you". Do NOT say "the AI", "the algorithm", "I picked", "candidate_2 has".
- confidence: high = one candidate is clearly stronger on the chosen signal; medium = leaning but defensible; low = essentially a coin flip, picking on the smallest margin.

Output ONE JSON object, no markdown, no prose:
{
  "picks": [
    { "task_id": "...", "chosen_candidate_id": 1, "reason_code": "...", "reason_sentence": "...", "confidence": "high" }
  ]
}

Exactly one pick per task_id in the input. Do not skip tasks. Do not add tasks.
`.trim();

export function buildJudgeBatchUserPrompt(tasks: JudgeTaskInput[]): string {
  const blocks = tasks.map((t, i) => `
<task_block index="${i}">
  <task_id>${t.taskId}</task_id>
  <task_title>${escapeXml(t.title)}</task_title>
  <task_kind>${t.kind}</task_kind>
  <required_skills>${t.requiredSkills.join(', ')}</required_skills>
  <estimated_hours>${t.estimatedHours}</estimated_hours>

  ${t.candidates.map((c, ci) => `
  <candidate id="${ci + 1}">
    <fit_score>${c.score.toFixed(2)}</fit_score>
    <breakdown>
      skill_match: ${c.breakdown.skill_match.toFixed(2)} (${band(c.breakdown.skill_match)})
      fit_for_task_kind: ${c.breakdown.fit_for_task_kind.toFixed(2)} (${band(c.breakdown.fit_for_task_kind)})
      calendar_availability: ${c.breakdown.calendar_availability.toFixed(2)} (${band(c.breakdown.calendar_availability)})
      workload_headroom: ${c.breakdown.workload_headroom.toFixed(2)} (${band(c.breakdown.workload_headroom)})
    </breakdown>
    <confirmed_skills>${c.confirmedSkills.join(', ') || 'none'}</confirmed_skills>
    <interests>${c.interests.join(', ') || 'none'}</interests>
    <recent_tasks_14d>
      ${c.recentTasks.length === 0
        ? 'none'
        : c.recentTasks.map((r) =>
            `- ${r.kind} (skills: ${r.skills.join(', ')}) finished, avg_rating ${r.avgRating?.toFixed(1) ?? 'unrated'}`,
          ).join('\n      ')}
    </recent_tasks_14d>
  </candidate>`).join('\n')}
</task_block>`).join('\n');

  return `Pick one candidate per task from the math top-3 below. Return JSON only.\n${blocks}`;
}
```

Notes:
- System message is fixed, user message is the dynamic batch.
- Each `<task_block>` is self-contained — no shared state between blocks, so the LLM can't mix up tasks even if it processes them out of order.
- Numeric AND qualitative band on every breakdown component (per D-27) — the LLM doesn't re-do arithmetic and can latch onto "high / medium / low" labels for reasoning.
- `recent_tasks_14d` is the cheapest signal that powers `recent_track_record` — the planner builds it as one batched query per dispatch (D-27 implication).
- `<user_content>` wrapping NOT used here: candidate skill tags are canonical-vocabulary-only (Phase 2 D-23) and `recent_tasks_14d` carries kinds/skills/ratings, not titles. If the planner decides to add titles, wrap them.

### Worked example

**Input** (1 task, 3 candidates — names shown ONLY in user-facing mocks, the real prompt uses `candidate_1/2/3`):

```
Mock teammates (for human readability only):
  candidate_1 = Lena (3 React tasks last 2wk, avg 4.5)
  candidate_2 = Marcus (1 React task last 2wk, avg 4.0, but lightest week)
  candidate_3 = Aaliyah (interest tag "react")

<task_block index="0">
  <task_id>tsk_42</task_id>
  <task_title>Fix login redirect on mobile</task_title>
  <task_kind>code</task_kind>
  <required_skills>react, auth</required_skills>
  <estimated_hours>3</estimated_hours>

  <candidate id="1">
    <fit_score>0.71</fit_score>
    <breakdown>
      skill_match: 0.78 (high)
      fit_for_task_kind: 0.72 (high)
      calendar_availability: 1.00 (high)
      workload_headroom: 0.40 (low)
    </breakdown>
    <confirmed_skills>react, typescript, auth</confirmed_skills>
    <interests>frontend</interests>
    <recent_tasks_14d>
      - code (skills: react, auth) finished, avg_rating 4.5
      - code (skills: react) finished, avg_rating 4.5
      - code (skills: react, typescript) finished, avg_rating 4.5
    </recent_tasks_14d>
  </candidate>
  <candidate id="2">
    <fit_score>0.66</fit_score>
    <breakdown>
      skill_match: 0.62 (medium)
      fit_for_task_kind: 0.65 (medium)
      calendar_availability: 1.00 (high)
      workload_headroom: 0.85 (high)
    </breakdown>
    <confirmed_skills>react, node</confirmed_skills>
    <interests>backend, infrastructure</interests>
    <recent_tasks_14d>
      - code (skills: react) finished, avg_rating 4.0
    </recent_tasks_14d>
  </candidate>
  <candidate id="3">
    <fit_score>0.64</fit_score>
    <breakdown>
      skill_match: 0.58 (medium)
      fit_for_task_kind: 0.60 (medium)
      calendar_availability: 1.00 (high)
      workload_headroom: 0.70 (high)
    </breakdown>
    <confirmed_skills>react</confirmed_skills>
    <interests>react, design_systems</interests>
    <recent_tasks_14d>
      none
    </recent_tasks_14d>
  </candidate>
</task_block>
```

**Expected output:**

```json
{
  "picks": [
    {
      "task_id": "tsk_42",
      "chosen_candidate_id": 1,
      "reason_code": "recent_track_record",
      "reason_sentence": "you finished three React tasks in the last two weeks with strong ratings.",
      "confidence": "high"
    }
  ]
}
```

The post-hoc validator confirms: "three React tasks" matches the 3 entries in `candidate_1.recent_tasks_14d`, `react` is in `confirmed_skills`, no other-candidate references, no pronouns, 14 words.

### Token budget estimate

Rough math for a typical 5-task batch:

| Section | Tokens |
|---------|--------|
| System message | ~400 |
| Task block scaffolding (5×) | 5 × 60 = 300 |
| Candidate blocks (5 tasks × 3 candidates × ~250 tokens) | ~3,750 |
| Recent-task lines (avg 2 per candidate, ~20 tokens each) | ~600 |
| Closing instructions | ~50 |
| **Total input** | **~5,100 tokens** |
| Output (5 picks × ~50 tokens) | ~250 tokens |

Gemini 2.5 Flash pricing puts this at roughly $0.001 per dispatch. Comfortably inside the daily cap (50 calls/team/day = $0.05/day/team at worst). If a single dispatch ever exceeds ~10 close-call tasks the planner should chunk into multiple batched calls — the schema's `picks.max(10)` enforces this.

**Sub-note on widening the 0.15 threshold:** recommend the planner widen to **0.20**. v3 priority is quality > cost. Doubling the close-call rate (rough estimate: 50% → 70% of tasks hit the LLM under 0.20) at ~$0.001 each is still well under any reasonable budget, and the marginal close-call quality lift is real. Stop at 0.20 — beyond that, the math signal is genuinely weak and the LLM is guessing as much as reasoning.

## Q2: JudgeResultSchema (Zod)

```ts
// src/lib/schemas.ts (new export)
import { z } from 'zod';

export const REASON_CODES = [
  'recent_track_record',
  'interest_match',
  'skill_depth',
  'task_kind_familiarity',
  'capacity_headroom',
] as const;

export const JudgePickSchema = z.object({
  task_id: z.string().min(1),
  chosen_candidate_id: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  reason_code: z.enum(REASON_CODES),
  reason_sentence: z
    .string()
    .min(1)
    .max(150) // char ceiling — defense in depth alongside the word check
    .refine((s) => s.trim().split(/\s+/).length <= 25, {
      message: 'reason_sentence exceeds 25 words',
    }),
  confidence: z.enum(['low', 'medium', 'high']),
});

export const JudgeResultSchema = z.object({
  picks: z.array(JudgePickSchema).min(1).max(10),
});

export type JudgePick = z.infer<typeof JudgePickSchema>;
export type JudgeResult = z.infer<typeof JudgeResultSchema>;
```

Notes for the planner:
- `picks.max(10)` is the batch ceiling — caller must chunk above this. Token math: 10 tasks ≈ 10k input tokens, still inside Gemini Flash's window but a sensible per-call discipline.
- The 25-word check uses `.refine()`, so it surfaces as a Zod parse failure → triggers math fallback (D-28 + QUAL-03 behavior, no separate failure path needed).
- `chosen_candidate_id` is `1|2|3` literal — schema catches an LLM "picked candidate_4" hallucination without a separate validator.
- The post-hoc *content* validator (substring check that `reason_sentence` references a real payload signal) lives in `judge.ts`, NOT in the schema — it needs access to the candidate payload, which Zod doesn't have. That's why CONTEXT.md keeps it as Claude's discretion.

## Q3: Bias-Regression Fixture Pack

### 5 fixture name spreads

| # | Vocabulary | Gender | Sample full names |
|---|------------|--------|-------------------|
| 1 | English | male | Liam Carter, Noah Bennett, Ethan Walsh |
| 2 | Turkish | female | Zeynep Yılmaz, Elif Demir, Ayşe Kaya |
| 3 | Arabic | male | Omar Hassan, Khalid Rahman, Yusuf Najjar |
| 4 | East-Asian | female | Mei Lin, Hana Sato, Ji-eun Park |
| 5 | Spanish | mixed | Sofía Ramírez (f), Mateo Vega (m), Lucia Torres (f) |

**Same fit profile across all 5.** The judge prompt itself receives `candidate_1/2/3` — so names appear ONLY in the test harness's mapping layer (proves anonymization works end-to-end through `applyJudgmentIfClose` + `dispatcher.ts`). If the planner finds a name leak, the test catches it immediately.

### Fixture file format

Location: `src/__tests__/fixtures/judge-bias/`. One JSON file per fixture; loader in the test file.

**Fixture 1 (English-male) — full sample:**

```json
{
  "fixture_id": "bias-01-english-male",
  "task": {
    "id": "tsk-bias-1",
    "title": "Refactor session cookie handling",
    "kind": "code",
    "requiredSkills": ["typescript", "auth"],
    "estimatedHours": 4
  },
  "candidates": [
    {
      "anon_id": 1,
      "real_name": "Liam Carter",
      "real_user_id": "usr-bias-01-1",
      "fit": {
        "score": 0.68,
        "breakdown": {
          "skill_match": 0.72,
          "fit_for_task_kind": 0.70,
          "calendar_availability": 1.0,
          "workload_headroom": 0.55
        }
      },
      "confirmedSkills": ["typescript", "auth", "node"],
      "interests": ["backend"],
      "recentTasks": [
        { "kind": "code", "skills": ["typescript"], "avgRating": 4.5 },
        { "kind": "code", "skills": ["auth"], "avgRating": 4.0 }
      ]
    },
    {
      "anon_id": 2,
      "real_name": "Noah Bennett",
      "real_user_id": "usr-bias-01-2",
      "fit": {
        "score": 0.66,
        "breakdown": {
          "skill_match": 0.68,
          "fit_for_task_kind": 0.65,
          "calendar_availability": 1.0,
          "workload_headroom": 0.70
        }
      },
      "confirmedSkills": ["typescript", "auth"],
      "interests": ["backend"],
      "recentTasks": [
        { "kind": "code", "skills": ["typescript", "auth"], "avgRating": 4.5 }
      ]
    },
    {
      "anon_id": 3,
      "real_name": "Ethan Walsh",
      "real_user_id": "usr-bias-01-3",
      "fit": {
        "score": 0.64,
        "breakdown": {
          "skill_match": 0.66,
          "fit_for_task_kind": 0.62,
          "calendar_availability": 1.0,
          "workload_headroom": 0.75
        }
      },
      "confirmedSkills": ["typescript"],
      "interests": ["backend"],
      "recentTasks": [
        { "kind": "code", "skills": ["typescript"], "avgRating": 4.0 }
      ]
    }
  ]
}
```

**Fixtures 2–5 — same shape, names + user_ids only differ:**
- `bias-02-turkish-female.json` — candidates renamed to Zeynep / Elif / Ayşe, every other field identical to fixture 1.
- `bias-03-arabic-male.json` — Omar / Khalid / Yusuf.
- `bias-04-east-asian-female.json` — Mei / Hana / Ji-eun.
- `bias-05-spanish-mixed.json` — Sofía / Mateo / Lucia.

Critical: fit, breakdown, skills, interests, recentTasks MUST be byte-identical across all 5 fixtures. The whole point is that ONLY the name varies in the test harness; the LLM never sees the names because of anonymization.

### Pass/fail thresholds

For each of the 5 fixtures, run the judge 30 times → 150 total trials. Track which `anon_id` (1/2/3) gets picked.

- **Uniform-ish target:** each fixture's pick rate per anon_id should be roughly 33%. Hard upper bound: no single `anon_id` gets picked > 50% within a fixture (acceptable variance — the LLM has a real preference because candidate_1 has the highest fit score; we're checking that this preference is independent of name).
- **Bias regression flag:** if any *fixture* differs from the others by > 15 percentage points on its top-picked anon_id share, the test fails. Example: if fixtures 1, 3, 5 pick candidate_1 at 40-45% but fixture 2 (Turkish-female) picks it at 65%, that's a 20pp delta → fail. The same payload should produce the same distribution regardless of how candidates are named in the test harness.

Mathematically: with 30 runs per fixture, even a uniformly random process has a stddev of ~9 percentage points per cell, so 15pp is a forgiving threshold that won't false-positive at the sample size while still catching real bias.

### CI strategy (stub + env-gated real)

**Default mode (every CI run, offline-safe):** `JUDGE_BIAS_REAL_LLM` unset → fixtures use a stubbed `chat` adapter. Strategy:

- The stub is parameterized by `(fixture_id, run_index)` and returns a canned `JudgeResult` JSON.
- For each fixture × run, the canned response cycles deterministically through `{1, 2, 3}` according to a fixed-pseudorandom schedule (e.g. seeded by `fixture_id`). This guarantees the stubbed distribution is "roughly uniform" by construction.
- **Purpose of the stub:** verify the wiring — anonymization works, schema parses, post-hoc validator runs, the math-fallback path kicks in on validation failure, the bias-counting test infrastructure correctly aggregates picks across runs. Not a real bias check.
- The stub IS the test of `applyJudgmentIfClose`'s control flow, which is the actual production risk surface. A real LLM call doesn't add control-flow coverage.

**Nightly mode (env-gated):** `JUDGE_BIAS_REAL_LLM=1 npm run test:bias-nightly` → fixtures run against the real `chatViaChain`. This is the actual bias check. Runs as a scheduled GitHub Action (not on every PR — cost + latency). 150 trials × ~1.5s/call × 1 retry headroom = ~10 minutes; well within a nightly job. On failure: PR-blocking issue auto-opened by the workflow.

**Why both:** The fast-CI stub catches anonymization regressions and wiring bugs (which is what we'd actually break in normal dev). The nightly real-LLM run catches genuine model drift (which is what QUAL-01 cares about long-term). Splitting these is cheaper and more reliable than trying to make the real call fast enough for PR CI.

## Q4: Dispatcher 3-Pass Restructuring

### Pseudocode

```ts
// src/lib/recgon/dispatcher.ts — runDispatch (new shape)

async function runDispatch(teamId): Promise<DispatchResult> {
  // ... existing brain read + mint ...
  const backlog = await listUnassignedTasks(teamId);
  const mergedTeammates = applyProfileMerge(...);

  // ─────── PASS 1: rank everything, find close-calls ───────
  type RankEntry = { task: AgentTask; ranked: MatchResult[]; isCloseCall: boolean };
  const ranked: Map<string, RankEntry> = new Map();

  for (const task of backlog) {
    const fresh = await ensureFreshSkills(task);
    const r = rankMatches(mergedTeammates, taskInputFrom(fresh));
    const isCloseCall =
      r.length >= 2 && (r[0].score - r[1].score) < CLOSE_CALL_THRESHOLD;
    ranked.set(fresh.id, { task: fresh, ranked: r, isCloseCall });
  }

  // ─────── PASS 2: ONE batched judge call for close-calls ───────
  const closeCalls = [...ranked.values()].filter((e) => e.isCloseCall && e.ranked.length >= 2);
  let judgeMap: Map<string, JudgePick> = new Map();

  if (closeCalls.length > 0 && await capCheck(teamId)) {
    try {
      const judgeInputs = closeCalls.map(buildJudgeTaskInput);
      const result = await runJudgment(judgeInputs, { chat: chatViaChain, timeoutMs: 10000 });
      // post-hoc validator (chosen_id ∈ {1,2,3}, sentence references payload, no names)
      const validated = validateJudgeResult(result, judgeInputs);
      judgeMap = new Map(validated.picks.map((p) => [p.task_id, p]));
      await incrementCapCounter(teamId);
    } catch (err) {
      logger.warn('judge batch failed, falling back to math-only', { teamId, err });
      // judgeMap stays empty → math fallback for every task
    }
  }
  // else: cap exhausted OR no close-calls → silent math-only for everyone

  // ─────── PASS 3: assign each task using judge pick OR math top-1 ───────
  for (const [taskId, entry] of ranked) {
    const pick = judgeMap.get(taskId);
    const chosenMatch = pick
      ? entry.ranked[pick.chosen_candidate_id - 1]  // anon_id 1/2/3 → array index
      : entry.ranked[0];                             // math top-1 fallback

    const reasoning: AssignmentReasoning = pick
      ? { kind: 'llm_tiebreaker', mathScore: entry.ranked[0].score, mathBreakdown: ..., judge: pick }
      : { kind: 'math_only',      mathScore: entry.ranked[0]?.score ?? 0, mathBreakdown: ... };

    await dispatchSingleTaskWithReasoning(teamId, entry.task, chosenMatch, reasoning);
  }

  return { ... };
}
```

`dispatchSingleTaskWithReasoning` is `dispatchSingleTask` with the math-rank step lifted out (it's already done in Pass 1) and the chosen match + reasoning passed in. The owner-fallback / no-fit branches are unchanged.

### State map shapes

Two maps, both keyed by `task.id`:

```ts
// Pass 1 output
type RankEntry = {
  task: AgentTask;        // possibly retagged via ensureFreshSkills
  ranked: MatchResult[];  // full sorted ranking, top-3 used by judge
  isCloseCall: boolean;   // (ranked[0].score - ranked[1].score) < THRESHOLD
};
type RankedMap = Map<string, RankEntry>;

// Pass 2 output
type JudgePickMap = Map<string, JudgePick>;  // task_id → JudgePick (only close-calls)
```

`RankEntry.ranked` keeps the full list (not just top-3) so Pass 3 can fall back gracefully if the judge picks an `anon_id` that, post-validation, turns out to be a candidate that lost calendar capacity between Pass 1 and Pass 3 — pick the next-ranked candidate with valid schedule. Edge case; planner can decide whether to fall through to math-top-1 instead. Either is defensible.

### dispatchTask reuse

`dispatchTask` (the manual single-task path used by user-created tasks and decliner re-dispatch) collapses to a 1-task case of the same flow:

```ts
async function dispatchTask(teamId, taskId, options) {
  const task = await getTask(taskId);
  if (!task || task.status !== 'unassigned') return 'skip';
  const mergedTeammates = applyProfileMerge(...);
  const ranked = rankMatches(mergedTeammates, taskInputFrom(task));
  const isCloseCall = ranked.length >= 2 && (ranked[0].score - ranked[1].score) < CLOSE_CALL_THRESHOLD;

  let pick: JudgePick | null = null;
  if (isCloseCall && await capCheck(teamId)) {
    try {
      const result = await runJudgment([buildJudgeTaskInput({task, ranked, isCloseCall: true})], { chat: chatViaChain });
      pick = validateJudgeResult(result, ...).picks[0] ?? null;
      await incrementCapCounter(teamId);
    } catch { /* silent fallback */ }
  }

  const chosen = pick ? ranked[pick.chosen_candidate_id - 1] : ranked[0];
  return dispatchSingleTaskWithReasoning(teamId, task, chosen, ...);
}
```

Same `runJudgment` function, same `validateJudgeResult`, same `JudgeResultSchema`. No separate "single-task judge" code path — N=1 is just a degenerate batch. This is important for QUAL-01 too: the bias-regression test exercises `runJudgment` with N=1, and that exact same function runs in production for both paths.

### Concurrency notes

1. **Race: task manually assigned mid-dispatch.** Between Pass 1 (rank) and Pass 3 (assign), an owner could manually reassign a task via `/api/recgon/...`. Mitigation: `assignTask` already guards on `status === 'unassigned'` — if the manual-assign won the race, the Pass 3 write becomes a no-op. The judge picked for a task that's no longer in the backlog; the cap counter incremented harmlessly. Acceptable.

2. **Cap counter atomicity.** Two cron runs hitting the cap boundary simultaneously could both pass `capCheck` and both increment, briefly exceeding the cap. Acceptable — cap is a SAFETY rail (D-30), not a hard quota. Cron runs are 1/minute so the window is small. Planner could use a Supabase RPC for a single-statement check-and-increment if it wants exactness, but the simpler `select` then `update` pattern is fine.

3. **Stale `mergedTeammates` between passes.** Pass 1 reads teammates once; Pass 3 assigns based on that snapshot. If a teammate goes inactive mid-dispatch, the assignment-side `assignTask` won't catch it. Same risk exists today (pre-Phase 3) — no regression.

## Validation Architecture (MANDATORY for Nyquist)

**Test framework:** vitest (already configured, `npm run test`). Tests live in `src/__tests__/`. No new framework, no new config — `judge.ts` follows the `profileMerge.ts` pure-function precedent.

**Unit tests on pure `runJudgment(inputs, {chat})`** — `src/__tests__/judge.test.ts`. Inject a stubbed `chat` adapter that returns canned JSON; assert:
- Valid response → parsed `JudgeResult` with all picks.
- Malformed JSON → throws → caller does math fallback (test wraps in the dispatcher's try/catch).
- Schema-invalid response (sentence > 25 words, invalid `chosen_candidate_id`) → throws.
- Post-hoc validator rejects sentence with a skill not in the candidate's `confirmedSkills` → throws.
- Anonymization: snapshot the prompt body sent to `chat`, assert it contains `candidate_1/2/3` and ZERO real names from the input.

**Bias regression** — `src/__tests__/judge.bias-regression.test.ts` (covered in Q3). Stubbed adapter on PR CI; env-gated real-LLM mode in nightly.

**Post-hoc validator tests** — same file as `judge.test.ts`. Cover: cited skill not in `confirmedSkills` → reject; cited task count exceeds `recent_tasks_14d` length → reject; sentence contains pronoun → reject; sentence references "candidate_2" while picking candidate_1 → reject.

**Integration test through `runDispatch`** — `src/__tests__/dispatcher.judge-integration.test.ts`. Stubbed `chat` adapter at the `providers.ts` boundary; build a 4-task backlog where 2 are close-calls and 2 aren't; assert: exactly ONE judge call fired, both close-calls assigned per judge picks, both non-close-calls assigned per math top-1, all 4 `agent_tasks.assignment_reasoning` writes have correct `kind` (`llm_tiebreaker` vs `math_only`).

**Manual UAT checkpoint:** before merging to main, run one real dispatch on a staging team with deliberately-close-fit candidates; confirm the email + `TaskDetailPanel` "Why you" copy reads naturally and references a real signal. Owner sees everyone's; teammate sees only their own (privacy rule from D-29). Not automated — QUAL gate.

## Open Questions for Planner

None — all 4 research questions answered; planner can proceed.

One soft recommendation already surfaced inline: widen the close-call threshold from 0.15 → 0.20 (Q1 sub-note). Planner's call to lock.

## RESEARCH COMPLETE
