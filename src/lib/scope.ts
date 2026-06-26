// Shared client-side scope resolution.
//
// The team switcher lets a user mark specific projects within a selected team,
// narrowing the app's data to those marks. The scope is a per-team map of
// project ids:
//
//   { [teamId]: [projectId, ...] }
//
// An empty / absent array for a selected team means "all of that team's
// projects" — the backwards-compatible default. So an untouched scope (`{}`)
// behaves exactly like the pre-existing team-only filtering everywhere.

export type ProjectScope = Record<string, string[]>;

/**
 * Is a project-bound record in scope for the current selection?
 *
 * @param teamId          the record's team
 * @param projectId       the record's project. `null`/`undefined` marks a
 *                        team-level item (e.g. a task not tied to a project) —
 *                        these are never hidden by a project narrowing.
 * @param selectedTeamIds teams currently in scope
 * @param projectScope    per-team marked project ids
 */
export function projectInScope(
  teamId: string,
  projectId: string | null | undefined,
  selectedTeamIds: string[],
  projectScope: ProjectScope,
): boolean {
  if (!selectedTeamIds.includes(teamId)) return false;
  if (projectId == null) return true;
  const marks = projectScope[teamId];
  if (!marks || marks.length === 0) return true;
  return marks.includes(projectId);
}

/** Does a selected team currently have an active project narrowing? */
export function teamHasProjectMarks(teamId: string, projectScope: ProjectScope): boolean {
  const marks = projectScope[teamId];
  return Array.isArray(marks) && marks.length > 0;
}
