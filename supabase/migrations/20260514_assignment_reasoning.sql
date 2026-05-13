-- Phase 3 / Plan 03 — additive JSONB column on agent_tasks for the
-- "Why you" reasoning envelope. Populated by `assignTask` on every
-- assignment going forward (math-only AND llm-tiebreaker paths). Old rows
-- stay `null` — backwards-compatible, no backfill required.
--
-- The shape is owned by `src/lib/recgon/types.ts` (AssignmentReasoning) +
-- validated at write time by Zod in `src/lib/schemas.ts`. The DB only
-- promises JSONB; the application layer promises the shape.
--
-- The partial index lets us cheaply filter "tasks with a judge reason" vs.
-- "tasks assigned by math-only" without a full table scan, for future
-- analytics (D-29 surface), without indexing every NULL row.

-- WR-09 — this column stays NULL for any row written before Phase 3 ships.
-- A future `NOT NULL` constraint REQUIRES a backfill migration that writes
-- `{ "kind": "math_only", ... }` reasoning for legacy assignments first.
-- Without that backfill, adding NOT NULL would fail on production with
-- existing legacy rows. Document this guard rail here so the next
-- migration author doesn't trip it.

alter table public.agent_tasks
  add column if not exists assignment_reasoning jsonb default null;

create index if not exists agent_tasks_assignment_reasoning_kind_idx
  on public.agent_tasks ((assignment_reasoning->>'kind'))
  where assignment_reasoning is not null;
