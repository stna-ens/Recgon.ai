# Phase 1: Profile Foundation - Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 16 (9 new, 7 modified)
**Analogs found:** 16 / 16 (all files have a strong codebase analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/{datestamp}_teammate_profiles.sql` | migration | DDL / additive table | `supabase/migrations/20260428_project_integrations.sql` | exact (additive team-scoped table with triggers) |
| `src/lib/recgon/skillVocabulary.ts` | utility (const module) | static export | `src/lib/recgon/match.ts` lines 31-71 (`TITLE_STOPWORDS` / `TITLE_ALIASES` const-module pattern) | exact (pure const-only module) |
| `src/lib/recgon/profileMerge.ts` | utility (pure fn) | transform | `src/lib/recgon/match.ts` `scoreTeammateForTask` (pure fn taking domain types) + `src/lib/recgon/scheduler.ts` `planTaskSchedule` | exact (pure, dependency-injected, no IO) |
| `src/lib/recgon/profileStorage.ts` | storage | CRUD | `src/lib/recgon/storage.ts` lines 31-198 (`TeammateRow` → `mapTeammate` → `createTeammate` / `listTeammates` / `getTeammate` / `updateTeammate`) | exact (same Supabase service-role + camelCase mapping pattern) |
| `src/app/teams/[id]/me/page.tsx` | page (RSC) | request-response | `src/app/api/teams/[id]/route.ts` (auth + verifyTeamAccess) + `src/app/teams/setup/page.tsx` (team page pattern) | role-match (no existing RSC under `/teams/[id]/me`; closest is the team API route's auth flow) |
| `src/app/teams/[id]/me/ProfileForm.tsx` | component (client) | event-driven (form submit + popover) | `src/app/teams/setup/page.tsx` (`'use client'` + form + fetch POST pattern); cmdk usage is greenfield (verified: zero existing imports of `cmdk` package, only a className string in `TopNavV2.tsx`) | partial (existing client-form pattern, but cmdk integration is net new) |
| `src/app/api/teams/[id]/profile/route.ts` | API route handler | request-response | `src/app/api/teams/[id]/route.ts` (GET / PATCH with auth + verifyTeamAccess) | exact |
| `src/__tests__/profileMerge.test.ts` | test | unit | `src/__tests__/recgonMatch.test.ts` (vitest + fixture factory + pure-fn assertions) | exact |
| `src/__tests__/skillVocabulary.test.ts` | test | unit | `src/__tests__/schemas.test.ts` (vitest schema-level constant assertions) | role-match |
| `src/lib/recgon/types.ts` | model (type defs) | static export | `src/lib/recgon/types.ts` lines 35-49 (`Teammate`) + lines 7-33 (`FitProfile` / `SkillStat`) | exact (same file — additive `TeammateProfile`, `ProfileVisibility`) |
| `src/lib/recgon/skillTagger.ts` | service (LLM caller) | request-response | itself — refactor to import vocab from new `skillVocabulary.ts` instead of relying on inline prompt | exact (in-place refactor) |
| `src/lib/prompts.ts` | config (prompt registry) | static export | `src/lib/prompts.ts` lines 889-919 (`TAG_TASK_SKILLS_SYSTEM` + `tagTaskSkillsUserPrompt`) | exact (same file, same pattern) |
| `src/lib/schemas.ts` | config (zod registry) | static export | `src/lib/schemas.ts` lines 258-267 (`TaskSkillTagsResponseSchema`) | exact (same file, same pattern) |
| `src/lib/recgon/match.ts` | utility (pure math) | transform | itself — additive interest-nudge term inside `scoreTeammateForTask` after the weighted sum | exact (single-file additive math change) |
| `src/lib/recgon/dispatcher.ts` | service (orchestration) | event-driven | itself line 116 (`const teammates = await listTeammatesWithStats(teamId);`) — thread `listProfiles` + `profileMerge` immediately after | exact (single-call insertion) |
| `src/components/TeamSwitcher.tsx` | component (client, dropdown) | event-driven (dropdown menu) | itself — existing `<Link href={manageHref}>Manage teams</Link>` inside the open dropdown panel at lines ~157–179. Insert `<Link href={`/teams/${currentTeam.id}/me`}>My profile</Link>` immediately ABOVE the Manage teams link, matching its inline styles. | exact (in-file additive, same dropdown body) |

## Pattern Assignments

### `supabase/migrations/{datestamp}_teammate_profiles.sql` (migration, DDL)

**Analog:** `supabase/migrations/20260428_project_integrations.sql`

**Header + table pattern** (lines 1-27 of analog):
```sql
-- Project integrations: per-project credentials for external platforms.
--
-- Tokens are sensitive. Service-role-only access; never expose this table
-- through client-side queries.

create table if not exists project_integrations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  team_id text not null references teams(id) on delete cascade,
  provider text not null,
  account_id text,
  account_handle text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  connected_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Unique-key + index pattern** (lines 29-34):
```sql
create unique index if not exists uq_project_integrations
  on project_integrations (project_id, provider);

create index if not exists idx_project_integrations_team
  on project_integrations (team_id, provider);
```

**`updated_at` trigger pattern** (lines 36-47):
```sql
create or replace function project_integrations_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_project_integrations_touch_updated_at on project_integrations;
create trigger trg_project_integrations_touch_updated_at
  before update on project_integrations
  for each row execute function project_integrations_touch_updated_at();
```

**Apply to new file:**
- `teammate_profiles` table: `id uuid pk`, `team_id text references teams(id) on delete cascade`, `user_id text references users(id) on delete cascade`, raw text[] cols (`skills_raw`, `strengths_raw`, `interests_raw`), canonical text[] cols (`skills_canonical`, `strengths_canonical`, `interests_canonical`), `weekly_capacity_hours numeric`, `created_at`, `updated_at`.
- Unique index on `(team_id, user_id)` — D-04 mandates one row per teammate per team.
- ADD `profile_visibility text not null default 'team_visible' check (profile_visibility in ('team_visible','owner_only'))` to `teams` (extension, not new table — D-17/18).
- Reuse `_touch_updated_at` trigger pattern verbatim.
- **Type alignment:** `team_id`, `user_id` are `text` per migration `20260426_recgon_admin.sql` line 16-17 note — NOT `uuid`. Pitfall 5 in RESEARCH.

---

### `src/lib/recgon/skillVocabulary.ts` (utility, const module)

**Analog source:** Canonical vocab inlined in `src/lib/prompts.ts` lines 893-895 (the `Roles:` / `Modifiers:` strings inside `TAG_TASK_SKILLS_SYSTEM`).

**Existing inline vocab to extract verbatim** (`src/lib/prompts.ts:893-895`):
```
Roles: engineering, frontend, backend, mobile, devops, design, ux_design, marketing, social_media, content_writing, copywriting, seo, ads, growth, analytics, data, sales, customer_support, product, strategy, research, qa, finance, operations, legal

Modifiers (optional, only if obviously relevant): ai, ml, video, photo, branding, community, partnerships, fundraising, hiring
```

**Const-module structural analog** (`src/lib/recgon/match.ts` lines 31-71): same shape — `as const` exports + a `Set` lookup helper.

**Apply to new file:**
- Export `CANONICAL_ROLES`, `CANONICAL_MODIFIERS`, `CANONICAL_VOCAB`, `CANONICAL_SET`, `CanonicalTag` type, `isCanonical(tag)` helper — pattern from RESEARCH §Pattern 2.
- Server-only safe (pure consts, zero imports of supabase / next).

---

### `src/lib/recgon/profileMerge.ts` (utility, pure fn)

**Analog:** `src/lib/recgon/match.ts` `scoreTeammateForTask` (lines 156-197). Pure function, no IO, takes domain types, returns domain type.

**Pure-function signature pattern** (lines 156-160):
```typescript
export function scoreTeammateForTask(
  teammate: Scoreable,
  task: MatchInput,
  now: Date = new Date(),
): MatchResult {
```

**Field-level fallback / additive-union pattern** (synthesized — `match.ts` line 91-93 unions explicit + title-derived skills the same way profileMerge needs to union self + owner skills):
```typescript
function teammateSkillSet(teammate: Pick<Teammate, 'skills' | 'title'>): string[] {
  const explicit = (teammate.skills ?? []).map((s) => s.toLowerCase());
  const fromTitle = tokenizeTitle(teammate.title);
  return [...new Set([...explicit, ...fromTitle])];
}
```

**Apply to new file:**
- Signature: `profileMerge(teammate: Teammate, profile: TeammateProfile | null, inferred: null, ema: Teammate['fitProfile']): Teammate & { interests?: string[] }`
- Body per RESEARCH §Pattern 1 (lines 240-274): D-08 early-return when profile null, D-02 strengths→skills union, D-06 field-level self-wins-when-filled, D-03 carry `interests` as additive field on return.
- Zero IO — unit-testable end-to-end without Supabase, like `match.ts`.

---

### `src/lib/recgon/profileStorage.ts` (storage, CRUD)

**Analog:** `src/lib/recgon/storage.ts` lines 1-198 (`TeammateRow` row type, `mapTeammate` mapper, `createTeammate` / `listTeammates` / `getTeammate` / `updateTeammate`).

**Imports pattern** (lines 1-26):
```typescript
import { supabase } from '../supabase';
import type {
  Teammate,
  // ...
} from './types';
```

**Row type + camelCase mapper pattern** (lines 31-63):
```typescript
type TeammateRow = {
  id: string;
  team_id: string;
  user_id: string | null;
  // ... snake_case columns mirroring DB
};

function mapTeammate(row: TeammateRow): Teammate {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    // ... camelCase domain types
  };
}
```

**Insert pattern with snake_case payload** (lines 167-186):
```typescript
export async function createTeammate(input: TeammateInsert): Promise<Teammate> {
  const { data, error } = await supabase
    .from('teammates')
    .insert({
      team_id: input.teamId,
      // ... snake_case field-by-field copy from camelCase input
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`createTeammate failed: ${error?.message}`);
  return mapTeammate(data as TeammateRow);
}
```

**List by team_id pattern** (lines 188-197):
```typescript
export async function listTeammates(teamId: string): Promise<Teammate[]> {
  const { data, error } = await supabase
    .from('teammates')
    .select('*')
    .eq('team_id', teamId)
    .neq('status', 'retired')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listTeammates failed: ${error.message}`);
  return (data ?? []).map((r) => mapTeammate(r as TeammateRow));
}
```

**`maybeSingle` for nullable read pattern** (lines 272-279):
```typescript
export async function getTeammate(teammateId: string): Promise<Teammate | null> {
  const { data } = await supabase
    .from('teammates')
    .select('*')
    .eq('id', teammateId)
    .maybeSingle();
  return data ? mapTeammate(data as TeammateRow) : null;
}
```

**Selective update pattern** (lines 281-298):
```typescript
export async function updateTeammate(teammateId: string, fields: Partial<...>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.displayName !== undefined) update.display_name = fields.displayName;
  // ... only set keys present in input
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('teammates').update(update).eq('id', teammateId);
  if (error) throw new Error(`updateTeammate failed: ${error.message}`);
}
```

**Apply to new file:**
- `ProfileRow` snake_case type matching the new migration columns.
- `mapProfile(row): TeammateProfile` camelCase mapper (`raw_skills` → `skillsRaw`, `canonical_skills` → `canonicalSkills`, `weekly_capacity_hours` → `weeklyCapacityHours`).
- `getProfile(teamId, userId): Promise<TeammateProfile | null>` — use `.maybeSingle()` (lookup may miss → D-08 fallback path).
- `listProfiles(teamId): Promise<TeammateProfile[]>` — dispatcher batches all teammate profiles in one read.
- `upsertProfile({ teamId, userId, ... })` — Supabase `.upsert(payload, { onConflict: 'team_id,user_id' })` returning the resolved row.
- All callers pre-check `verifyTeamAccess(teamId, userId)` at the route layer; storage layer never imports `teamStorage` (matches `storage.ts` which also delegates auth to callers).

---

### `src/app/teams/[id]/me/page.tsx` (page, RSC)

**Analog:** `src/app/api/teams/[id]/route.ts` (auth + verifyTeamAccess gating pattern) + RESEARCH §Code Examples (Phase 1 invention based on existing conventions).

**Auth gate pattern** (`src/app/api/teams/[id]/route.ts` lines 5-17):
```typescript
const session = await auth();
if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

const role = await verifyTeamAccess(id, session.user.id);
if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
```

**Apply to new file** (translate API gating into RSC redirects/notFound per RESEARCH lines 480-501):
```typescript
import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getProfile } from '@/lib/recgon/profileStorage';
import { CANONICAL_VOCAB } from '@/lib/recgon/skillVocabulary';
import ProfileForm from './ProfileForm';

export const dynamic = 'force-dynamic';

export default async function MyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { id: teamId } = await params;
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) notFound();
  const profile = await getProfile(teamId, session.user.id);
  return (
    <div className="glass-card">
      <ProfileForm teamId={teamId} initialProfile={profile} canonicalVocab={CANONICAL_VOCAB} />
      {/* disabled GitHub placeholder card per D-09 — see UI-SPEC */}
    </div>
  );
}
```

- D-22 design: wrap content in existing `.glass-card` (already in `globals.css`); never restyle.
- D-09: disabled GitHub placeholder rendered inline as a non-interactive `.glass-card` with `opacity: 0.55`, `pointer-events: none`, `tabindex={-1}` (UI-SPEC §Disabled placeholder treatment).

---

### `src/app/teams/[id]/me/ProfileForm.tsx` (component, client)

**Analog:** `src/app/teams/setup/page.tsx` (existing `'use client'` form + fetch POST pattern).

**Client component header + form-submit pattern** (lines 1-39):
```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
// ...

async function handleCreate(e: React.FormEvent) {
  e.preventDefault();
  setError('');
  setLoading(true);
  try {
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: teamName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // ...
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to create team');
  } finally {
    setLoading(false);
  }
}
```

**cmdk integration:** No existing analog in repo (verified: `grep "cmdk"` returns only a CSS class name `v2-cmdk-trigger` in `src/components/v2/TopNavV2.tsx:132` — NOT a package import). Use RESEARCH §Code Examples lines 505-594 cmdk pattern as the template.

**Apply to new file:**
- `'use client'` + `useState` for pill arrays + `query` + `open`.
- `useTransition` for save state (RESEARCH line 519).
- Suggestion ranking algorithm is Claude's Discretion — start with prefix-then-includes against `canonicalVocab` per RESEARCH line 523-525.
- Radix Popover wrapping `<Command from 'cmdk'>` per RESEARCH 557-588.
- POST to `/api/teams/${teamId}/profile` per RESEARCH 540-543.
- Pill chip: 28px height + 32px hit-area + `aria-label="Remove {chip text}"` + `aria-hidden="true"` on the `<X>` icon — per UI-SPEC Pill chip anatomy.
- Two-line pill (raw + `matched as …`) per UI-SPEC.
- NEVER import `@/lib/supabase` (CONVENTIONS rule from RESEARCH Anti-Patterns).
- All copy strings from UI-SPEC §Copywriting Contract (Recgon-as-PM voice, banned strings enforced).

---

### `src/app/api/teams/[id]/profile/route.ts` (API route handler)

**Analog:** `src/app/api/teams/[id]/route.ts` (full file, lines 1-60).

**Imports + auth-gate pattern** (lines 1-14):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTeam, deleteTeam, updateTeamInfo, verifyTeamAccess } from '@/lib/teamStorage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await verifyTeamAccess(id, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
```

**PATCH body validation + try/catch pattern** (lines 22-43):
```typescript
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { name, description, avatarColor } = body as { ... };
  if (name === undefined && description === undefined && avatarColor === undefined) {
    return NextResponse.json({ error: '...' }, { status: 400 });
  }
  try {
    await updateTeamInfo(id, { name, description, avatarColor }, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update team';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
```

**Apply to new file:**
- `POST` handler: parse body with `ProfileSaveBodySchema` (new schema in `schemas.ts`).
- Self-write check: D-19 — `if (targetUserId !== session.user.id && role !== 'owner') return 403`. Pitfall 6 in RESEARCH.
- Call `normalizeProfileTerms(...)` (RESEARCH §Pattern 3) — `chatViaChain` with `temperature: 0`, `taskKind: 'recgon_skill_normalize'`, `promptVersion: 'v1'`, `timeoutMs: 8000` (Pitfall 8).
- Wrap LLM call in try/catch — Pitfall 7: on failure, persist raw with `canonical: []` and surface info-toast (not destructive).
- After normalization: `upsertProfile({ teamId, userId, ... })`.
- `GET` handler (for read-only sibling profile views when `profile_visibility = team_visible`): same auth + visibility check, returns `TeammateProfile | null`.

---

### `src/__tests__/profileMerge.test.ts` (test, unit)

**Analog:** `src/__tests__/recgonMatch.test.ts` (full file, especially lines 1-60).

**Vitest + fixture factory pattern** (lines 1-33):
```typescript
import { describe, it, expect } from 'vitest';
import {
  scoreTeammateForTask,
  pickBestMatch,
  isWorkingDay,
  MIN_FIT_SCORE,
} from '../lib/recgon/match';
import type { TeammateWithStats } from '../lib/recgon/types';

function ai(overrides: Partial<TeammateWithStats> = {}): TeammateWithStats {
  return {
    id: overrides.id ?? 'tm-1',
    teamId: 't',
    // ... reasonable defaults
    ...overrides,
  };
}
```

**Comparative-assertion pattern** (lines 35-44):
```typescript
describe('scoreTeammateForTask', () => {
  it('rewards skill overlap', () => {
    const a = ai({ id: 'matcher', skills: ['marketing', 'b2b'] });
    const b = ai({ id: 'mismatch', skills: ['code', 'engineering'] });
    const task = { kind: 'marketing' as const, requiredSkills: ['marketing', 'b2b'], estimatedHours: 1 };
    const sa = scoreTeammateForTask(a, task);
    const sb = scoreTeammateForTask(b, task);
    expect(sa.score).toBeGreaterThan(sb.score);
  });
});
```

**Apply to new file:**
- Fixture factories: `mkTeammate(overrides)`, `mkProfile(overrides)`.
- D-08: `profileMerge(t, null, null, ema)` returns `t` unchanged (deep-equal assertion).
- D-06 field-level: profile with only `skillsCanonical` set → merged has self skills + owner capacity; profile with only `weeklyCapacityHours` → owner skills + self capacity.
- D-02 strengths→skills: profile with `canonicalStrengths = ['frontend']` + `canonicalSkills = ['backend']` → merged `skills` includes both.
- D-03 interests carried: merged result has `interests` field equal to profile's `canonicalInterests`.
- Simulation harness against `agent_tasks` fixtures per RESEARCH Pitfall 2 (top-1 assignment diff under three weight pairs).

---

### `src/__tests__/skillVocabulary.test.ts` (test, unit)

**Analog:** `src/__tests__/schemas.test.ts` (constant + helper assertions).

**Apply to new file:**
- Assert `CANONICAL_VOCAB.length === CANONICAL_ROLES.length + CANONICAL_MODIFIERS.length`.
- Assert no duplicates (`new Set(CANONICAL_VOCAB).size === CANONICAL_VOCAB.length`).
- Assert `isCanonical('frontend') === true`, `isCanonical('react_native') === false`.
- Pitfall 1: assert that simulated LLM output with hallucinated tag is filtered by `CANONICAL_SET.has(...)`.

---

### `src/lib/recgon/types.ts` (model)

**Analog (in-file):** `Teammate` type (lines 35-49), `FitProfile` (lines 17-26), `SkillStat` (lines 28-33).

**Existing type pattern**:
```typescript
export type Teammate = {
  id: string;
  teamId: string;
  userId: string | null;
  displayName: string;
  // ...
  skills: string[];
  capacityHours: number;
  workingHours: WorkingHours | null;
  fitProfile: FitProfile;
  status: TeammateStatus;
  createdAt: string;
};
```

**Apply (additive):**
```typescript
export type ProfileVisibility = 'team_visible' | 'owner_only';

export type TeammateProfile = {
  id: string;
  teamId: string;
  userId: string;
  skillsRaw: string[];
  skillsCanonical: string[];
  strengthsRaw: string[];
  strengthsCanonical: string[];
  interestsRaw: string[];
  interestsCanonical: string[];
  weeklyCapacityHours: number | null;
  createdAt: string;
  updatedAt: string;
};
```

---

### `src/lib/recgon/skillTagger.ts` (service, in-place refactor)

**Analog (in-file):** lines 14-18.

**Current imports** (lines 14-17):
```typescript
import { logger } from '../logger';
import { chatViaProviders } from '../llm/providers';
import { TAG_TASK_SKILLS_SYSTEM, tagTaskSkillsUserPrompt } from '../prompts';
import { TaskSkillTagsResponseSchema, parseAIResponse } from '../schemas';
```

**Apply:** Import `CANONICAL_SET` from `./skillVocabulary` and use it inside `sanitizeTags` (line 41-52) as a defense-in-depth filter — drop tags not in canonical set. `prompts.ts` line 893-895 will be rewritten to interpolate the vocab from the const module (RESEARCH §Pattern 2 lines 309-317) so the system prompt no longer duplicates the list.

---

### `src/lib/prompts.ts` (config, additive)

**Analog (in-file):** lines 887-919 (`TAG_TASK_SKILLS_SYSTEM` + `tagTaskSkillsUserPrompt`).

**Existing prompt-export pattern** (lines 889-905):
```typescript
export const TAG_TASK_SKILLS_SYSTEM = `You are Recgon's task router. ...

Pick from this canonical vocabulary (lowercase, snake_case). Use 2–4 tags per task. ...

Roles: engineering, frontend, backend, ...
Modifiers (optional, only if obviously relevant): ai, ml, ...

Hard rules:
- ...

Output JSON: { "tasks": [{ "id": string, "skills": string[] }] } in the same order as input.`;
```

**User-prompt builder pattern** (lines 907-919):
```typescript
export function tagTaskSkillsUserPrompt(
  tasks: Array<{ id: string; title: string; description: string; kind: string }>,
): string {
  const blocks = tasks.map((t, i) => { ... });
  // returns concatenated string
}
```

**Apply (additive):**
- Rewrite `TAG_TASK_SKILLS_SYSTEM` to interpolate from `CANONICAL_ROLES` / `CANONICAL_MODIFIERS` (per RESEARCH 309-317) — output is byte-identical to current text.
- Add `RECGON_SKILL_NORMALIZE_SYSTEM` const with closed-set instruction (map raw → canonical; pick only from list; output JSON `{ skills, strengths, interests: Array<{raw, canonical: string[]}> }`).
- Add `skillNormalizeUserPrompt({ skillsRaw, strengthsRaw, interestsRaw })` builder.

---

### `src/lib/schemas.ts` (config, additive)

**Analog (in-file):** lines 258-267 (`TaskSkillTagsResponseSchema`).

**Existing zod-export pattern**:
```typescript
export const TaskSkillTagsResponseSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      skills: z.array(z.string()).max(6),
    }),
  ),
});
export type TaskSkillTagsResponse = z.infer<typeof TaskSkillTagsResponseSchema>;
```

**Apply (additive):**
```typescript
export const SkillNormalizationResultSchema = z.object({
  skills: z.array(z.object({ raw: z.string(), canonical: z.array(z.string()).max(4) })),
  strengths: z.array(z.object({ raw: z.string(), canonical: z.array(z.string()).max(4) })),
  interests: z.array(z.object({ raw: z.string(), canonical: z.array(z.string()).max(4) })),
});
export type SkillNormalizationResult = z.infer<typeof SkillNormalizationResultSchema>;

export const ProfileSaveBodySchema = z.object({
  skillsRaw: z.array(z.string().min(1).max(80)).max(40),
  strengthsRaw: z.array(z.string().min(1).max(80)).max(40),
  interestsRaw: z.array(z.string().min(1).max(80)).max(40),
  weeklyCapacityHours: z.number().min(0).max(80).nullable().optional(),
});
```

---

### `src/lib/recgon/match.ts` (utility, in-place math touch)

**Analog (in-file):** lines 156-197 (`scoreTeammateForTask`).

**Existing weighted-sum** (lines 182-186):
```typescript
const score =
  W_SKILL * skillOverlap +
  W_FIT * fit +
  W_AVAIL * avail +
  W_LOAD * load;
```

**Apply (only allowed math touch per CONTEXT D-03, line 136):**
- ADD `interests?: string[]` optional read off the merged teammate (`profileMerge` already stashes it as additive field).
- ADD a `W_INTEREST_NUDGE` constant (≤ 0.05 per D-03; suggested starting point ≤ 0.03 per RESEARCH Pitfall 3).
- ADD nudge AFTER the weighted sum, NOT as a weighted term (Pitfall 3 line 424): `const nudge = interestOverlap(interests, task.requiredSkills) * W_INTEREST_NUDGE; const score = base + nudge;`.
- Cap so nudge can only break ties — interest-only mismatch must not flip a strictly better-skilled candidate (assertion in `recgonMatch.test.ts` extension).

---

### `src/lib/recgon/dispatcher.ts` (service, in-place wiring)

**Analog (in-file):** line 116 `const teammates = await listTeammatesWithStats(teamId);`.

**Existing pattern** (lines 108-117):
```typescript
export async function runDispatch(teamId: string): Promise<DispatchResult> {
  const snapshot = await readUnifiedBrain(teamId);
  await saveBrainSnapshot(teamId, snapshot);
  const { minted, skipped } = await mintTasksFromBrain(teamId, snapshot);

  const backlog = await listUnassignedTasks(teamId);
  const teammates = await listTeammatesWithStats(teamId);
```

**Apply:**
- After `listTeammatesWithStats`, add `const profiles = await listProfiles(teamId);`.
- Map `teammates.map(t => profileMerge(t, profiles.find(p => p.userId === t.userId) ?? null, null, t.fitProfile))`.
- Hand merged list (typed `Teammate & { interests?: string[] }`) to `rankMatches` — `match.ts` consumer signature unchanged because `interests` is additive.
- Same insertion in `dispatchTask` near line 395 (second call site of `listTeammatesWithStats`).

---

### `src/components/TeamSwitcher.tsx` (dropdown component, in-place additive)

**Note:** This replaces the earlier draft that targeted `src/app/teams/[id]/page.tsx` — that file does NOT exist in the working tree. The only team-aware navigation surface is `TeamSwitcher.tsx` (the team-context dropdown rendered inside `TopNavV2.tsx`).

**Analog (in-file):** the existing `<Link href={manageHref}>Manage teams</Link>` row inside the open dropdown panel (`{open && (...)}` block at line 78), specifically lines ~157–179.

**Apply:**
- Inside the `{open && (...)}` dropdown body, insert a `<Link href={\`/teams/${currentTeam.id}/me\`}>My profile</Link>` row immediately ABOVE the existing `Manage teams` link. The component is already guarded by `if (!currentTeam) return null;` (line ~24), so `currentTeam.id` is safe to dereference inside the dropdown body.
- Match the surrounding link's inline style block exactly — same `padding`, `color: 'var(--txt)'`, `fontSize`, `textDecoration: 'none'`. No new tokens (D-22, D-23).
- Add `onClick={() => setOpen(false)}` so the dropdown closes after navigation (keyboard-nav predictability).
- NO badge, NO count indicator, NO nag-banner, NO dashboard summary card, NO first-login redirect (D-10).

---

## Shared Patterns

### Auth + Team Access Gate
**Source:** `src/app/api/teams/[id]/route.ts` lines 5-17 + `src/lib/teamStorage.ts` lines 412-425
**Apply to:** `src/app/teams/[id]/me/page.tsx`, `src/app/api/teams/[id]/profile/route.ts`
```typescript
const session = await auth();
if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const role = await verifyTeamAccess(teamId, session.user.id);
if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
```
**Profile-specific extension (Pitfall 6):** target-user check for cross-teammate reads — when `profile_visibility === 'owner_only'` AND `targetUserId !== session.user.id` AND `role !== 'owner'` → 403.

### Supabase service-role + snake↔camel mapping
**Source:** `src/lib/recgon/storage.ts` lines 1-26 (imports) + 31-63 (row type + mapper) + 167-186 (insert)
**Apply to:** `src/lib/recgon/profileStorage.ts`
**Hard rule (Anti-Pattern from RESEARCH line 374):** NEVER import `@/lib/supabase` from a `'use client'` file. The profile form sends fetch POSTs to the API route; the route imports `profileStorage`; `profileStorage` is the only file with the service-role client touch.

### LLM call: `chatViaChain` + `temperature: 0` + zod-validated output + post-hoc filter
**Source:** RESEARCH §Pattern 3 (lines 324-364) + `src/lib/recgon/skillTagger.ts` lines 54-75 (existing `chatViaProviders` pattern — to be upgraded to `chatViaChain` for the new call per QUAL-05)
**Apply to:** new `normalizeProfileTerms` helper invoked from `/api/teams/[id]/profile/route.ts` POST
```typescript
const raw = await chatViaChain(
  // [providers chain from getProviderChain()]
  SKILL_NORMALIZE_SYSTEM,
  skillNormalizeUserPrompt(input),
  { temperature: 0, taskKind: 'recgon_skill_normalize', promptVersion: 'v1', timeoutMs: 8000 },
);
const parsed = parseAIResponse(raw, SkillNormalizationResultSchema);
// Defense-in-depth: filter against CANONICAL_SET (Pitfall 1).
```
**Note:** `chatViaChain` signature (providers.ts line 203-209) takes the chain as the first arg — match `skillTagger.ts` usage but swap `chatViaProviders` → `chatViaChain` per QUAL-05.

### Vitest fixture-factory + comparative assertions
**Source:** `src/__tests__/recgonMatch.test.ts` lines 10-44 + `src/__tests__/schemas.test.ts` lines 1-40
**Apply to:** `src/__tests__/profileMerge.test.ts`, `src/__tests__/skillVocabulary.test.ts`

### Glass-card design inheritance
**Source:** existing `globals.css` `.glass-card` rule + project memory "Glass treatment" / "Signature pink light mode"
**Apply to:** `/teams/[id]/me/page.tsx`, ProfileForm chip surface, disabled GitHub placeholder card
**Hard rules (UI-SPEC + memory):**
- NEVER hardcode hex — use `var(--signature)`, `var(--glass-substrate)`, `var(--txt-pure)`, `var(--txt-muted)`, `var(--txt-faint)`, `var(--r-sm)`, `var(--r-md)`.
- NEVER stack glass effects (no glass-card-inside-glass-card).
- NEVER add accent pink outside the 5 reserved-for surfaces (UI-SPEC §Color).

### Prompts-in-one-file / schemas-in-one-file
**Source:** CLAUDE.md §Key rules + `src/lib/prompts.ts` (all 25+ prompts in one file) + `src/lib/schemas.ts` (all 15+ schemas in one file)
**Apply to:** ALL new prompt strings → `prompts.ts`; ALL new zod schemas → `schemas.ts`. Hard prohibition: never inline a prompt or schema in `route.ts`, `profileStorage.ts`, or `ProfileForm.tsx`.

## No Analog Found

| File | Role | Data Flow | Reason | Recommendation |
|------|------|-----------|--------|----------------|
| (cmdk integration in `ProfileForm.tsx`) | client component | event-driven popover | `cmdk` is verified NOT in `package.json` (RESEARCH Pitfall 4); only a CSS class string `v2-cmdk-trigger` exists in `TopNavV2.tsx`. No prior cmdk-as-package usage to copy. | Use RESEARCH §Code Examples (cmdk + Radix Popover snippet) as the template; plan must include `npm install cmdk@^1.1.1` as the first task. |

## Metadata

**Analog search scope:**
- `supabase/migrations/` (full)
- `src/lib/recgon/` (full — storage, match, dispatcher, scheduler, skillTagger, types)
- `src/lib/` (prompts.ts, schemas.ts, teamStorage.ts, llm/providers.ts)
- `src/app/api/teams/[id]/route.ts`, `src/app/api/projects/route.ts`
- `src/app/teams/setup/page.tsx`, `src/components/TeamSwitcher.tsx`, `src/components/v2/TopNavV2.tsx`
- `src/__tests__/` (recgonMatch.test.ts, schemas.test.ts)
- `src/components/v2/` (cmdk grep)

**Files scanned:** ~22

**Pattern extraction date:** 2026-05-11
