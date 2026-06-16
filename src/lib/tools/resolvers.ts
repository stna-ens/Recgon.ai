// Fuzzy entity resolvers for tools. Every tool accepts human-friendly names
// (not just UUIDs) because team membership is already enforced by ctx.teamId —
// names add no security risk and make the terminal usable in plain language
// ("assign the login bug to Alice").
//
// Each resolver mirrors resolveProject's contract:
//   1. exact UUID match (cheap path when the model already has an id)
//   2. case-insensitive exact name match
//   3. case-insensitive substring match (unique → ok; multiple → disambiguate)
//   4. no match → throw with the list of available names
//
// Thrown messages are surfaced verbatim to the model, which relays them to the
// user ("matched multiple: A, B — be more specific"). That IS the
// disambiguation UX — the user refines and retries.

import { listTasks, listTeammates } from '../recgon/storage';
import { getTeamMembers, getUserTeams } from '../teamStorage';
import type { AgentTask, Teammate } from '../recgon/types';
import type { TeamMember } from '../teamStorage';

export { resolveProject } from './resolveProject';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function disambiguate(ref: string, label: string, names: string[]): never {
  throw new Error(`"${ref}" matched multiple ${label}: ${names.join(', ')}. Please be more specific.`);
}

function notFound(ref: string, label: string, available: string[]): never {
  throw new Error(
    available.length === 0
      ? `No ${label} in this team yet.`
      : `No ${label} matching "${ref}". Available: ${available.join(', ')}`,
  );
}

// Words too generic to identify a task — dropped before token matching so
// "make the security thing" keys on "security", not "make"/"thing".
const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'for', 'of', 'and', 'or', 'on', 'in', 'with', 'this',
  'that', 'task', 'make', 'making', 'do', 'doing', 'get', 'add', 'please', 'thing',
  'stuff', 'shit', 'work', 'about', 'into', 'some',
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Levenshtein edit distance — used for typo-tolerant nickname matching. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Find a typo-close match (e.g. "grr8" → "gr8"). Returns the single closest
 * candidate within a small edit budget, or signals a tie so the caller can ask.
 */
function closestByEdit<T>(needle: string, items: T[], getText: (t: T) => string): { best?: T; tie?: boolean } {
  const n = needle.toLowerCase();
  const budget = n.length <= 4 ? 1 : 2;
  const scored = items
    .map((item) => ({ item, d: editDistance(n, getText(item).toLowerCase()) }))
    .filter((s) => s.d <= budget)
    .sort((a, b) => a.d - b.d);
  if (scored.length === 0) return {};
  if (scored.length === 1 || scored[0].d < scored[1].d) return { best: scored[0].item };
  return { tie: true };
}

/**
 * Rank candidates by how many significant words they share with the user's
 * (approximate) description — so "security review thing" still finds the
 * "Security review" task even though it's not a clean substring.
 */
function fuzzyRank<T>(needle: string, items: T[], getText: (t: T) => string): Array<{ item: T; score: number }> {
  const nTok = new Set(tokens(needle));
  if (nTok.size === 0) return [];
  return items
    .map((item) => {
      const tTok = tokens(getText(item));
      const shared = tTok.filter((w) => nTok.has(w)).length;
      return { item, score: shared };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** Resolve a task by id, exact/substring title, or fuzzy word-overlap. */
export async function resolveTask(ref: string, teamId: string): Promise<AgentTask> {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error('Task reference is empty');
  const tasks = await listTasks(teamId);

  if (UUID_RE.test(trimmed)) {
    const byId = tasks.find((t) => t.id === trimmed);
    if (byId) return byId;
  }
  const needle = trimmed.toLowerCase();
  const exact = tasks.find((t) => t.title.toLowerCase() === needle);
  if (exact) return exact;

  // Substring either direction (handles both "login" → "Fix login bug" and
  // "fix the login bug now" → "login bug").
  const partial = tasks.filter(
    (t) => t.title.toLowerCase().includes(needle) || needle.includes(t.title.toLowerCase()),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) disambiguate(ref, 'tasks', partial.slice(0, 8).map((t) => `"${t.title}"`));

  // Fuzzy fallback: word overlap. Clear winner wins; ties disambiguate.
  const ranked = fuzzyRank(trimmed, tasks, (t) => t.title);
  if (ranked.length === 1) return ranked[0].item;
  if (ranked.length > 1) {
    if (ranked[0].score > ranked[1].score) return ranked[0].item;
    const top = ranked[0].score;
    disambiguate(ref, 'tasks', ranked.filter((r) => r.score === top).slice(0, 8).map((r) => `"${r.item.title}"`));
  }

  notFound(ref, 'task', tasks.slice(0, 12).map((t) => `"${t.title}"`));
}

/** Resolve a teammate by id, display name, or substring, scoped to the team. */
export async function resolveTeammate(ref: string, teamId: string): Promise<Teammate> {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error('Teammate reference is empty');
  const mates = await listTeammates(teamId);

  if (UUID_RE.test(trimmed)) {
    const byId = mates.find((m) => m.id === trimmed);
    if (byId) return byId;
  }
  const needle = trimmed.toLowerCase();
  const exact = mates.find((m) => m.displayName.toLowerCase() === needle);
  if (exact) return exact;

  const partial = mates.filter((m) => m.displayName.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) disambiguate(ref, 'teammates', partial.map((m) => m.displayName));

  // Typo tolerance: "grr8" → "gr8".
  const fuzzy = closestByEdit(trimmed, mates, (m) => m.displayName);
  if (fuzzy.best) return fuzzy.best;
  if (fuzzy.tie) disambiguate(ref, 'teammates', mates.map((m) => m.displayName));

  notFound(ref, 'teammate', mates.map((m) => m.displayName));
}

/** A team member with a display label resolved from its nickname/email. */
export interface ResolvedMember {
  member: TeamMember;
  label: string;
}

const memberLabel = (m: TeamMember) => m.nickname || m.email || m.userId;

/** Resolve a team member by userId, nickname, or email substring. */
export async function resolveMember(ref: string, teamId: string): Promise<ResolvedMember> {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error('Member reference is empty');
  const members = await getTeamMembers(teamId);

  if (UUID_RE.test(trimmed)) {
    const byId = members.find((m) => m.userId === trimmed);
    if (byId) return { member: byId, label: memberLabel(byId) };
  }
  const needle = trimmed.toLowerCase();
  const exact = members.find(
    (m) => (m.email ?? '').toLowerCase() === needle || (m.nickname ?? '').toLowerCase() === needle,
  );
  if (exact) return { member: exact, label: memberLabel(exact) };

  const partial = members.filter(
    (m) =>
      (m.nickname ?? '').toLowerCase().includes(needle) ||
      (m.email ?? '').toLowerCase().includes(needle),
  );
  if (partial.length === 1) return { member: partial[0], label: memberLabel(partial[0]) };
  if (partial.length > 1) disambiguate(ref, 'members', partial.map(memberLabel));

  // Typo tolerance on nickname/email.
  const fuzzy = closestByEdit(trimmed, members, memberLabel);
  if (fuzzy.best) return { member: fuzzy.best, label: memberLabel(fuzzy.best) };
  if (fuzzy.tie) disambiguate(ref, 'members', members.map(memberLabel));

  notFound(ref, 'member', members.map(memberLabel).filter(Boolean));
}

/** Resolve one of the current user's teams by id or name. */
export async function resolveTeam(ref: string, userId: string) {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error('Team reference is empty');
  const teams = await getUserTeams(userId);

  if (UUID_RE.test(trimmed)) {
    const byId = teams.find((t) => t.id === trimmed);
    if (byId) return byId;
  }
  const needle = trimmed.toLowerCase();
  const exact = teams.find((t) => t.name.toLowerCase() === needle);
  if (exact) return exact;

  const partial = teams.filter((t) => t.name.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) disambiguate(ref, 'teams', partial.map((t) => t.name));

  notFound(ref, 'team', teams.map((t) => t.name));
}
