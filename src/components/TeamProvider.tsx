'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ProjectScope } from '@/lib/scope';

interface Team {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdBy: string;
  createdAt: string;
}

export interface CachedProject {
  id: string;
  name: string;
  path?: string;
  sourceType?: 'codebase' | 'github' | 'description';
  isGithub?: boolean;
  lastAnalyzedCommitSha?: string;
  createdBy?: string;
  isShared?: boolean;
  logoUrl?: string;
  analysis?: {
    description: string;
    techStack: string[];
  };
}

interface TeamContextType {
  teams: Team[];
  currentTeam: Team | null;
  setCurrentTeam: (team: Team) => void;
  selectedTeamIds: string[];
  setSelectedTeamIds: (teamIds: string[]) => void;
  // Per-team marked project ids. Empty/absent for a team = all its projects in
  // scope (the backwards-compatible default). See src/lib/scope.ts.
  projectScope: ProjectScope;
  setProjectScope: (scope: ProjectScope) => void;
  refreshTeams: () => Promise<void>;
  loading: boolean;
  projects: CachedProject[] | null;
  projectUpdateStatuses: Record<string, boolean>;
  refreshProjects: () => void;
  setProjectUpdateStatuses: (statuses: Record<string, boolean>) => void;
}

const TeamContext = createContext<TeamContextType>({
  teams: [],
  currentTeam: null,
  setCurrentTeam: () => {},
  selectedTeamIds: [],
  setSelectedTeamIds: () => {},
  projectScope: {},
  setProjectScope: () => {},
  refreshTeams: async () => {},
  loading: true,
  projects: null,
  projectUpdateStatuses: {},
  refreshProjects: () => {},
  setProjectUpdateStatuses: () => {},
});

export function useTeam() {
  return useContext(TeamContext);
}

export default function TeamProvider({ children }: { children: React.ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeam, setCurrentTeamState] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<CachedProject[] | null>(null);
  const [selectedTeamIds, setSelectedTeamIdsState] = useState<string[]>([]);
  const [projectScope, setProjectScopeState] = useState<ProjectScope>({});
  const [projectUpdateStatuses, setProjectUpdateStatuses] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const router = useRouter();
  const didInitialCheck = useRef(false);
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  const currentTeamRef = useRef<Team | null>(null);

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => { routerRef.current = router; }, [router]);
  useEffect(() => { currentTeamRef.current = currentTeam; }, [currentTeam]);

  const refreshProjects = useCallback(() => {
    const team = currentTeamRef.current;
    if (!team) return;
    fetch(`/api/projects?teamId=${team.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((ps: CachedProject[]) => {
        setProjects(ps);
        // Check for updates on analyzed GitHub projects. Each call hits the
        // GitHub API, so cache results in sessionStorage with a 5-min TTL —
        // navigating around the app shouldn't re-fan-out N requests.
        const githubProjects = ps.filter((p) => p.isGithub && p.analysis && p.lastAnalyzedCommitSha);
        if (githubProjects.length === 0) return;
        const cacheKey = `recgon_update_status_${team.id}`;
        const TTL_MS = 5 * 60 * 1000;
        try {
          const raw = sessionStorage.getItem(cacheKey);
          if (raw) {
            const cached = JSON.parse(raw) as { ts: number; statuses: Record<string, boolean> };
            if (cached && typeof cached.ts === 'number' && Date.now() - cached.ts < TTL_MS) {
              setProjectUpdateStatuses(cached.statuses ?? {});
              return;
            }
          }
        } catch { /* ignore parse errors */ }
        Promise.all(
          githubProjects.map((p) =>
            fetch(`/api/projects/${p.id}/check-updates?teamId=${team.id}`)
              .then((r) => r.ok ? r.json() : { hasUpdates: false })
              .then((data) => ({ id: p.id, hasUpdates: data.hasUpdates as boolean }))
              .catch(() => ({ id: p.id, hasUpdates: false }))
          )
        ).then((results) => {
          const statuses: Record<string, boolean> = {};
          for (const r of results) statuses[r.id] = r.hasUpdates;
          setProjectUpdateStatuses(statuses);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), statuses }));
          } catch { /* quota; non-fatal */ }
        });
      })
      .catch(() => setProjects([]));
  }, []);

  const refreshTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data);

        const savedTeamId = localStorage.getItem('recgon_current_team');
        const saved = data.find((t: Team) => t.id === savedTeamId);
        let savedSelection: string[] = [];
        try {
          const raw = localStorage.getItem('recgon_selected_teams');
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) {
            const available = new Set(data.map((team: Team) => team.id));
            savedSelection = parsed.filter((id): id is string => typeof id === 'string' && available.has(id));
          }
        } catch { /* fall back to the current team */ }

        // Hydrate the per-team project scope, pruning teams that no longer exist.
        try {
          const rawScope = localStorage.getItem('recgon_project_scope');
          const parsedScope = rawScope ? JSON.parse(rawScope) : {};
          if (parsedScope && typeof parsedScope === 'object') {
            const available = new Set(data.map((team: Team) => team.id));
            const cleaned: ProjectScope = {};
            for (const [tid, ids] of Object.entries(parsedScope)) {
              if (available.has(tid) && Array.isArray(ids)) {
                const valid = ids.filter((id): id is string => typeof id === 'string');
                if (valid.length > 0) cleaned[tid] = valid;
              }
            }
            setProjectScopeState(cleaned);
          }
        } catch { /* scope is optional */ }

        const initialTeam = saved ?? data[0] ?? null;
        const initialSelection = savedSelection.length > 0
          ? savedSelection
          : initialTeam ? [initialTeam.id] : [];
        setSelectedTeamIdsState(initialSelection);
        if (initialTeam) {
          const primaryTeam = initialSelection.includes(initialTeam.id)
            ? initialTeam
            : data.find((team: Team) => team.id === initialSelection[0]) ?? initialTeam;
          setCurrentTeamState(primaryTeam);
          localStorage.setItem('recgon_current_team', primaryTeam.id);
          localStorage.setItem('recgon_selected_teams', JSON.stringify(initialSelection));
        }

        if (!didInitialCheck.current) {
          didInitialCheck.current = true;
          const currentPath = pathnameRef.current;
          const isSetupPage = currentPath === '/teams/setup' || currentPath.startsWith('/teams/invite/');
          if (data.length === 0 && !isSetupPage) {
            routerRef.current.push('/teams/setup');
          }
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTeams();
  }, [refreshTeams]);

  // Reset project cache when team changes, then fetch fresh
  useEffect(() => {
    if (!currentTeam) return;
    setProjects(null);
    setProjectUpdateStatuses({});
    refreshProjects();
  }, [currentTeam?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCurrentTeam = useCallback((team: Team) => {
    setCurrentTeamState(team);
    setSelectedTeamIdsState([team.id]);
    localStorage.setItem('recgon_current_team', team.id);
    localStorage.setItem('recgon_selected_teams', JSON.stringify([team.id]));
  }, []);

  const setProjectScope = useCallback((scope: ProjectScope) => {
    // Persist only non-empty narrowings — an empty array for a team means "all
    // projects", which is the absence-of-key default, so we drop it.
    const cleaned: ProjectScope = {};
    for (const [tid, ids] of Object.entries(scope)) {
      if (Array.isArray(ids) && ids.length > 0) cleaned[tid] = Array.from(new Set(ids));
    }
    setProjectScopeState(cleaned);
    try {
      localStorage.setItem('recgon_project_scope', JSON.stringify(cleaned));
    } catch { /* storage is optional */ }
  }, []);

  const setSelectedTeamIds = useCallback((teamIds: string[]) => {
    const available = new Set(teams.map((team) => team.id));
    const next = Array.from(new Set(teamIds.filter((id) => available.has(id))));
    if (next.length === 0 && teams.length > 0) return;
    setSelectedTeamIdsState(next);
    const active = currentTeamRef.current;
    if (next.length > 0 && (!active || !next.includes(active.id))) {
      const nextPrimary = teams.find((team) => team.id === next[0]);
      if (nextPrimary) {
        setCurrentTeamState(nextPrimary);
        localStorage.setItem('recgon_current_team', nextPrimary.id);
      }
    }
    try {
      localStorage.setItem('recgon_selected_teams', JSON.stringify(next));
    } catch { /* storage is optional */ }
  }, [teams]);

  return (
    <TeamContext.Provider value={{
      teams, currentTeam, setCurrentTeam, selectedTeamIds, setSelectedTeamIds, projectScope, setProjectScope, refreshTeams, loading,
      projects,
      projectUpdateStatuses, refreshProjects, setProjectUpdateStatuses,
    }}>
      {children}
    </TeamContext.Provider>
  );
}
