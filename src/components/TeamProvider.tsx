'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

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
  analysis?: {
    description: string;
    techStack: string[];
  };
}

interface TeamContextType {
  teams: Team[];
  currentTeam: Team | null;
  setCurrentTeam: (team: Team) => void;
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
        // Check for updates on analyzed GitHub projects
        const githubProjects = ps.filter((p) => p.isGithub && p.analysis && p.lastAnalyzedCommitSha);
        if (githubProjects.length === 0) return;
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
        if (saved) {
          setCurrentTeamState(saved);
        } else if (data.length > 0) {
          setCurrentTeamState(data[0]);
          localStorage.setItem('recgon_current_team', data[0].id);
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
    localStorage.setItem('recgon_current_team', team.id);
  }, []);

  return (
    <TeamContext.Provider value={{
      teams, currentTeam, setCurrentTeam, refreshTeams, loading,
      projects, projectUpdateStatuses, refreshProjects, setProjectUpdateStatuses,
    }}>
      {children}
    </TeamContext.Provider>
  );
}
