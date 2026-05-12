// Phase 2 / Plan 02-04 / SKILL-04 — storage-layer test.
//
// Verifies the real SQL shape of `listActiveInferredSkillsForTeam` against a
// real Supabase fixture set. The dispatcher integration test
// (`dispatcher.threeSourceBlend.test.ts`) mocks this function at the seam, so
// a wrong column name in `.select()` or a missing `.is('rejected_at', null)`
// would never surface in that test. This file catches those SQL typos.
//
// Skip-gating: writing to a live remote Supabase from a unit-test run is
// destructive. This file therefore skips by default and only runs when the
// operator explicitly opts in:
//
//   LOCAL_SUPABASE_TEST=1 npm run test -- --run src/__tests__/inferredSkillsStorage.listActiveForTeam.test.ts
//
// When `LOCAL_SUPABASE_TEST` is not set, the file exists and the suite is
// skipped with a clear message — the file IS the regression contract for the
// next CI run that has a local Supabase stack.
//
// The fixtures are scoped to a unique test-team-id with a random suffix so
// concurrent runs do not collide and a failed assertion cannot leave orphan
// rows that affect production (afterAll deletes by the unique team-id).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { supabase } from '@/lib/supabase';
import { listActiveInferredSkillsForTeam } from '@/lib/recgon/inferredSkillsStorage';

const ENABLED = process.env.LOCAL_SUPABASE_TEST === '1';
const RUN_DESCRIBE = ENABLED ? describe : describe.skip;

// Anchor `now` so date arithmetic is deterministic across runs.
const NOW = new Date('2026-05-15T00:00:00Z');
const SKIP_MSG = 'Skipping: set LOCAL_SUPABASE_TEST=1 to run against a real Supabase stack.';

function isoDaysBefore(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
}

// Unique per-run id suffix; the afterAll cleanup keys off this so we never
// touch rows we did not insert.
const RUN_ID = `t04-${Math.random().toString(36).slice(2, 10)}`;
const TEAM_ID = `team-${RUN_ID}`;
const OTHER_TEAM_ID = `other-team-${RUN_ID}`;
const TM_A = `tmA-${RUN_ID}`;
const TM_B = `tmB-${RUN_ID}`;
const TM_OTHER = `tmOther-${RUN_ID}`;

if (!ENABLED) {
  // eslint-disable-next-line no-console
  console.warn(`[inferredSkillsStorage.listActiveForTeam.test] ${SKIP_MSG}`);
}

RUN_DESCRIBE('listActiveInferredSkillsForTeam — real SQL shape', () => {
  beforeAll(async () => {
    // 1. Seed two teams.
    await supabase.from('teams').insert([
      { id: TEAM_ID, name: `Test team ${RUN_ID}` },
      { id: OTHER_TEAM_ID, name: `Other team ${RUN_ID}` },
    ]);

    // 2. Seed three agent_teammates rows (2 in the team-under-test + 1 in
    //    the other-team to prove cross-team isolation).
    await supabase.from('teammates').insert([
      {
        id: TM_A,
        team_id: TEAM_ID,
        user_id: null,
        display_name: 'Teammate A',
        skills: [],
        capacity_hours: 40,
        status: 'active',
      },
      {
        id: TM_B,
        team_id: TEAM_ID,
        user_id: null,
        display_name: 'Teammate B',
        skills: [],
        capacity_hours: 40,
        status: 'active',
      },
      {
        id: TM_OTHER,
        team_id: OTHER_TEAM_ID,
        user_id: null,
        display_name: 'Other-team teammate',
        skills: [],
        capacity_hours: 40,
        status: 'active',
      },
    ]);

    // 3. Seed four teammate_inferred_skills rows.
    await supabase.from('teammate_inferred_skills').insert([
      // Row 1: tm-A — CONFIRMED + active typescript (most recent).
      {
        teammate_id: TM_A,
        team_id: TEAM_ID,
        canonical_tag: 'typescript',
        score: 0.9,
        source: 'llm_commit',
        last_seen_at: isoDaysBefore(7),
        confirmed_at: NOW.toISOString(),
        rejected_at: null,
      },
      // Row 2: tm-A — INFERRED (not yet confirmed) react.
      {
        teammate_id: TM_A,
        team_id: TEAM_ID,
        canonical_tag: 'react',
        score: 0.7,
        source: 'linguist',
        last_seen_at: isoDaysBefore(30),
        confirmed_at: null,
        rejected_at: null,
      },
      // Row 3: tm-A — REJECTED python (MUST be excluded).
      {
        teammate_id: TM_A,
        team_id: TEAM_ID,
        canonical_tag: 'python',
        score: 0.5,
        source: 'llm_commit',
        last_seen_at: isoDaysBefore(14),
        confirmed_at: null,
        rejected_at: isoDaysBefore(1),
      },
      // Row 4: tm-B — active go (different teammate, same team).
      {
        teammate_id: TM_B,
        team_id: TEAM_ID,
        canonical_tag: 'go',
        score: 0.6,
        source: 'llm_commit',
        last_seen_at: isoDaysBefore(10),
        confirmed_at: null,
        rejected_at: null,
      },
      // Row 5: tm-OTHER — different team's row, must NOT appear in the
      //   team-under-test result.
      {
        teammate_id: TM_OTHER,
        team_id: OTHER_TEAM_ID,
        canonical_tag: 'rust',
        score: 0.8,
        source: 'llm_commit',
        last_seen_at: isoDaysBefore(5),
        confirmed_at: null,
        rejected_at: null,
      },
    ]);
  });

  afterAll(async () => {
    // Cascade-safe cleanup: delete the inferred-skill rows we inserted, then
    // teammates, then teams (FKs may cascade; deleting in dependency order
    // is belt-and-suspenders).
    await supabase
      .from('teammate_inferred_skills')
      .delete()
      .in('teammate_id', [TM_A, TM_B, TM_OTHER]);
    await supabase.from('teammates').delete().in('id', [TM_A, TM_B, TM_OTHER]);
    await supabase.from('teams').delete().in('id', [TEAM_ID, OTHER_TEAM_ID]);
  });

  it('Case 1: returns a Map keyed by teammateId', async () => {
    const result = await listActiveInferredSkillsForTeam(TEAM_ID);
    expect(result).toBeInstanceOf(Map);
    // tm-A (typescript + react active; python rejected) + tm-B (go active) = 2.
    expect(result.size).toBe(2);
  });

  it('Case 2: rejected row is excluded; active rows are preserved', async () => {
    const result = await listActiveInferredSkillsForTeam(TEAM_ID);
    const aMap = result.get(TM_A);
    expect(aMap).toBeInstanceOf(Map);
    expect(aMap!.size).toBe(2);
    expect(aMap!.has('python')).toBe(false); // rejected
    expect(aMap!.has('typescript')).toBe(true);
    expect(aMap!.has('react')).toBe(true);
  });

  it('Case 3: confirmed_at preserved on the typed row', async () => {
    const result = await listActiveInferredSkillsForTeam(TEAM_ID);
    const aMap = result.get(TM_A);
    expect(aMap!.get('typescript')!.confirmedAt).not.toBeNull();
    expect(aMap!.get('react')!.confirmedAt).toBeNull();
  });

  it('Case 4: score is coerced to number (not string)', async () => {
    const result = await listActiveInferredSkillsForTeam(TEAM_ID);
    const aMap = result.get(TM_A);
    expect(typeof aMap!.get('typescript')!.score).toBe('number');
    expect(aMap!.get('typescript')!.score).toBeCloseTo(0.9, 3);
  });

  it('Case 5: cross-team isolation — other-team rows do NOT appear', async () => {
    const result = await listActiveInferredSkillsForTeam(TEAM_ID);
    expect(result.has(TM_OTHER)).toBe(false);
  });

  it('Case 6: other teammate in the same team is present', async () => {
    const result = await listActiveInferredSkillsForTeam(TEAM_ID);
    const bMap = result.get(TM_B);
    expect(bMap).toBeInstanceOf(Map);
    expect(bMap!.has('go')).toBe(true);
  });
});
