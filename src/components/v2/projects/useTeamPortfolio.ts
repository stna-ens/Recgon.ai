'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useTeam } from '@/components/TeamProvider';
import type { PortfolioRow } from '@/components/v2/HomePortfolio';
import type { RowMeta, Ownership } from '@/components/v2/projects/PortfolioRows';
import { priority } from '@/components/v2/utils';

interface OverviewResponse {
  totalProjects: number;
  projectCards: PortfolioRow[];
}

export interface TeamPortfolio {
  /** All projects across every team the user belongs to (deduped). */
  portfolio: PortfolioRow[];
  /** Per-project meta (source, ownership, owning team, live update flag). */
  portfolioMeta: Record<string, RowMeta>;
  loading: boolean;
  error: unknown;
  mutate: () => void;
}

/**
 * Cross-team portfolio loader, shared by the Projects page and the team
 * dropdown. Pulls `/api/overview` (triage rows) + `/api/projects` (records with
 * createdBy/isShared) for every team, then aggregates + dedupes. SWR caches the
 * whole aggregate keyed by the team set + user, so both consumers share one
 * fetch and returning to either surface paints instantly.
 *
 * Pass `enabled = false` to defer the fetch (the dropdown does this until it is
 * first opened, so the topnav doesn't fetch the portfolio on every page load).
 */
export function useTeamPortfolio(enabled: boolean = true): TeamPortfolio {
  const ctx = useTeam();
  const teams = ctx.teams ?? [];
  const ctxProjectUpdateStatuses = ctx.projectUpdateStatuses;
  const projectUpdateStatuses = useMemo(() => ctxProjectUpdateStatuses ?? {}, [ctxProjectUpdateStatuses]);
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const teamsKey = teams.map((t) => t.id).join(',');
  const portfolioKey = enabled && teams.length ? (['portfolio', teamsKey, currentUserId] as const) : null;

  const { data: portfolioData, error, mutate } = useSWR(portfolioKey, async () => {
    const results = await Promise.all(
      teams.map((t) =>
        Promise.all([
          fetch(`/api/overview?teamId=${t.id}`).then((r) => {
            if (!r.ok) throw new Error(`overview ${r.status}`);
            return r.json();
          }),
          fetch(`/api/projects?teamId=${t.id}`).then((r) => {
            if (!r.ok) throw new Error(`projects ${r.status}`);
            return r.json();
          }),
        ]),
      ),
    );
    const cards: Record<string, PortfolioRow> = {};
    const meta: Record<string, Omit<RowMeta, 'hasUpdate'>> = {};
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      const [overview, projects] = results[i] as [
        OverviewResponse | null,
        Array<{ id: string; createdBy?: string; isShared?: boolean; sourceType?: 'codebase' | 'github' | 'description' }>,
      ];
      for (const card of overview?.projectCards ?? []) {
        // First write wins — a project lives in exactly one team.
        if (!cards[card.id]) cards[card.id] = card;
      }
      for (const p of projects ?? []) {
        const isPrivate = p.isShared === false;
        const visibility: 'personal' | 'team-shared' = isPrivate ? 'personal' : 'team-shared';
        let ownership: Ownership = 'mine';
        if (currentUserId && p.createdBy && p.createdBy !== currentUserId) {
          ownership = 'from-team';
        } else if (!isPrivate) {
          ownership = 'shared-by-me';
        }
        meta[p.id] = {
          sourceType: p.sourceType,
          ownership,
          visibility,
          teamId: team.id,
          teamName: team.name,
        };
      }
    }
    return { cards: Object.values(cards), meta };
  });

  const portfolio = useMemo(() => portfolioData?.cards ?? [], [portfolioData]);
  // Merge the live GitHub update-status map (fetched separately by TeamProvider)
  // onto the cached meta during render, so update badges stay reactive without
  // refetching the whole portfolio.
  const portfolioMeta = useMemo<Record<string, RowMeta>>(() => {
    const base = portfolioData?.meta ?? {};
    const out: Record<string, RowMeta> = {};
    for (const [id, m] of Object.entries(base)) {
      out[id] = { ...m, hasUpdate: projectUpdateStatuses?.[id] ?? false };
    }
    return out;
  }, [portfolioData, projectUpdateStatuses]);
  const loading = portfolioKey != null && portfolioData === undefined && !error;

  return { portfolio, portfolioMeta, loading, error, mutate };
}

/**
 * Bucket a flat portfolio into `{ teamId: PortfolioRow[] }`, each team's list
 * sorted most-urgent-first (drifting/stuck), then most-recently analyzed —
 * the same triage order the Projects page uses.
 */
export function groupByTeam(
  portfolio: PortfolioRow[],
  meta: Record<string, RowMeta>,
): Record<string, PortfolioRow[]> {
  const out: Record<string, PortfolioRow[]> = {};
  for (const card of portfolio) {
    const teamId = meta[card.id]?.teamId;
    if (!teamId) continue;
    (out[teamId] ??= []).push(card);
  }
  for (const teamId of Object.keys(out)) {
    out[teamId].sort((a, b) => {
      const p = priority(a) - priority(b);
      if (p !== 0) return p;
      const aTime = a.analyzedAt ? new Date(a.analyzedAt).getTime() : 0;
      const bTime = b.analyzedAt ? new Date(b.analyzedAt).getTime() : 0;
      return bTime - aTime;
    });
  }
  return out;
}
