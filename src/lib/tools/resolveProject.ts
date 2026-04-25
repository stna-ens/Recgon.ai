import { getProject, getAllProjects, type Project } from '../storage';

/**
 * Resolve a project reference (name or UUID) to the full project.
 * Tools should accept human-friendly names — UUIDs add no security since
 * team membership is already enforced by ctx.teamId.
 *
 * Resolution order:
 *   1. Exact UUID match scoped to team
 *   2. Case-insensitive exact name match
 *   3. Case-insensitive partial name match (substring)
 *   4. If multiple matches in step 3, throw with a disambiguation hint
 */
export async function resolveProject(ref: string, teamId: string, userId?: string): Promise<Project> {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error('Project reference is empty');

  // 1. UUID lookup
  const byId = await getProject(trimmed, teamId, userId).catch(() => undefined);
  if (byId) return byId;

  const all = await getAllProjects(teamId, userId);
  const needle = trimmed.toLowerCase();

  // 2. Exact name match
  const exact = all.find((p) => p.name.toLowerCase() === needle);
  if (exact) return exact;

  // 3. Partial name match
  const partial = all.filter((p) => p.name.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    const names = partial.map((p) => p.name).join(', ');
    throw new Error(`"${ref}" matched multiple projects: ${names}. Please be more specific.`);
  }

  const allNames = all.map((p) => p.name).join(', ');
  throw new Error(
    all.length === 0
      ? 'No projects in this team yet.'
      : `No project matching "${ref}". Available projects: ${allNames}`,
  );
}
