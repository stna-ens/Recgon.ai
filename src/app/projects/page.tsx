// Phase 3.5 / Plan 03.5-01 — /projects role router.
//
// Owner → OwnerWorkloadBoard (workload grid + dnd-kit DndContext).
// Member or viewer → NonOwnerProjectsView (the original tile-list page).
// loading || no team → null (no flash of either view).
//
// The page is intentionally a 1-hook shell. All prior hooks + JSX moved
// verbatim into NonOwnerProjectsView so members/viewers see the
// pre-refactor experience byte-equivalent. RESEARCH § Pitfall 1: every
// hook in this shell MUST run before the role branch — currently only
// useTeam() does, so we are trivially safe.
//
// Server-side defense-in-depth: every owner-board mutation API (assign,
// reschedule, dock/dismiss) re-checks the owner role via verifyTeamAccess
// (Plan 03.5-02 + 03). This client guard exists for UX only.

'use client';

import { useTeam } from '@/components/TeamProvider';
import { OwnerWorkloadBoard } from './OwnerWorkloadBoard';
import NonOwnerProjectsView from '@/components/v2/projects/owner/NonOwnerProjectsView';

export default function V2ProjectsListPage() {
  const { currentTeam, loading } = useTeam();

  // Wait for team context to settle so no flash of either view on first paint.
  if (loading || !currentTeam) return null;

  if (currentTeam.role === 'owner') {
    return <OwnerWorkloadBoard teamId={currentTeam.id} />;
  }

  return <NonOwnerProjectsView />;
}
