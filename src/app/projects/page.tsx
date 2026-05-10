'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import SectionIndex from '@/components/v2/SectionIndex';
import FeaturedNeedsAttention, { pickFeatured } from '@/components/v2/projects/FeaturedNeedsAttention';
import PortfolioRows, { type RowMeta, type Ownership } from '@/components/v2/projects/PortfolioRows';
import type { PortfolioRow } from '@/components/v2/HomePortfolio';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  language: string | null;
  updated_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface OverviewResponse {
  totalProjects: number;
  projectCards: PortfolioRow[];
}

export default function V2ProjectsListPage() {
  const ctx = useTeam();
  const currentTeam = ctx.currentTeam;
  const teams = ctx.teams ?? [];
  const projectUpdateStatuses = ctx.projectUpdateStatuses ?? {};
  const refreshProjects = ctx.refreshProjects;
  const { addToast } = useToast();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  // Top scope filter:
  //   'all'      → personal + every team's shared projects
  //   'personal' → only my private projects (isShared === false, createdBy = me)
  //   <teamId>   → only projects shared in that team (isShared !== false)
  const [scope, setScope] = useState<'all' | 'personal' | string>('all');

  // Cross-team aggregated data. We fetch /api/overview + /api/projects per
  // team and merge so the visibility filter can show personal vs each team
  // independently.
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [portfolioMeta, setPortfolioMeta] = useState<Record<string, RowMeta>>({});
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // Modals
  const [showManual, setShowManual] = useState(false);
  const [showGithub, setShowGithub] = useState(false);

  // Manual create state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [creating, setCreating] = useState(false);

  // GitHub picker state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  // Cross-team data load: pull /api/overview (triage rows) and /api/projects
  // (full project records w/ createdBy + isShared) for every team the user
  // is a member of. Aggregate, dedupe, and attach visibility metadata.
  const teamsKey = teams.map((t) => t.id).join(',');
  const loadPortfolio = useCallback((opts: { showSkeleton?: boolean } = {}) => {
    if (!teams.length) return;
    if (opts.showSkeleton) setPortfolioLoading(true);
    Promise.all(
      teams.map((t) =>
        Promise.all([
          fetch(`/api/overview?teamId=${t.id}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/projects?teamId=${t.id}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
        ]),
      ),
    )
      .then((results) => {
        const cards: Record<string, PortfolioRow> = {};
        const meta: Record<string, RowMeta> = {};
        for (let i = 0; i < teams.length; i++) {
          const team = teams[i];
          const [overview, projects] = results[i] as [OverviewResponse | null, Array<{ id: string; createdBy?: string; isShared?: boolean; sourceType?: 'codebase' | 'github' | 'description' }>];
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
              hasUpdate: projectUpdateStatuses?.[p.id] ?? false,
              ownership,
              visibility,
              teamId: team.id,
              teamName: team.name,
            };
          }
        }
        setPortfolio(Object.values(cards));
        setPortfolioMeta(meta);
        setPortfolioLoading(false);
      })
      .catch(() => setPortfolioLoading(false));
  }, [teamsKey, currentUserId, projectUpdateStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load + when teams or user identity change.
  useEffect(() => { loadPortfolio({ showSkeleton: true }); }, [loadPortfolio]);
  useEffect(() => { refreshProjects?.(); }, [refreshProjects]);

  // Refresh on tab regain
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshProjects?.();
        loadPortfolio();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshProjects, loadPortfolio]);

  // Esc closes any open modal
  useEffect(() => {
    if (!showManual && !showGithub) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowManual(false);
        setShowGithub(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showManual, showGithub]);

  // Apply the top-level scope filter on the cross-team portfolio.
  //   'all'      → personal + every team's shared projects
  //   'personal' → only my private projects (visibility === 'personal')
  //   <teamId>   → only projects shared in that team
  const scopedPortfolio = useMemo(() => {
    if (scope === 'all') return portfolio;
    if (scope === 'personal') {
      return portfolio.filter((p) => portfolioMeta[p.id]?.visibility === 'personal');
    }
    return portfolio.filter((p) => {
      const m = portfolioMeta[p.id];
      return m?.visibility === 'team-shared' && m.teamId === scope;
    });
  }, [portfolio, scope, portfolioMeta]);

  // Featured = stuck + drifting (no scoring system, so no score-based
  // triage). Section 01 shows top 3, Section 02 shows the rest.
  const featuredIds = useMemo(() => new Set(pickFeatured(scopedPortfolio).map((p) => p.id)), [scopedPortfolio]);
  const featuredCount = featuredIds.size;
  const restProjects = useMemo(() => scopedPortfolio.filter((p) => !featuredIds.has(p.id)), [scopedPortfolio, featuredIds]);

  const openManual = () => {
    setName('');
    setDescription('');
    setUploadedFilename('');
    setShowManual(true);
  };

  const openGithub = useCallback(async () => {
    setShowGithub(true);
    setReposError('');
    setRepoSearch('');
    setRepos([]);
    setReposLoading(true);
    try {
      const res = await fetch('/api/github/repos');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReposError(data.error === 'No GitHub account connected'
          ? 'NOT_CONNECTED'
          : 'Failed to load GitHub repos. Please try again.');
      } else {
        const list: GitHubRepo[] = await res.json();
        setRepos(list);
      }
    } catch {
      setReposError('Network error — please try again.');
    } finally {
      setReposLoading(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !description.trim() || creating) return;
    if (!currentTeam?.id) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), teamId: currentTeam.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed to create project');
      addToast('project created', 'success');
      setShowManual(false);
      refreshProjects?.();
      loadPortfolio();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed to create', 'error');
    } finally {
      setCreating(false);
    }
  }, [name, description, creating, currentTeam, addToast, refreshProjects, loadPortfolio]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/projects/extract-text', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed to extract');
      setDescription(data.text);
      setUploadedFilename(file.name);
      addToast('text extracted', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'extract failed', 'error');
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  }, [addToast]);

  const handleImportRepo = useCallback(async (repo: GitHubRepo) => {
    if (!currentTeam?.id) return;
    setImporting(repo.full_name);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repo.name, path: repo.html_url, teamId: currentTeam.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'import failed');
      addToast(`${repo.name} imported`, 'success');
      setShowGithub(false);
      refreshProjects?.();
      loadPortfolio();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'import failed', 'error');
    } finally {
      setImporting(null);
    }
  }, [currentTeam, addToast, refreshProjects, loadPortfolio]);

  const filteredRepos = useMemo(() => {
    const q = repoSearch.toLowerCase();
    if (!q) return repos;
    return repos.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q)
    );
  }, [repos, repoSearch]);

  const totalProjects = portfolio.length;
  const showEmpty = !portfolioLoading && totalProjects === 0;

  return (
    <div className="v2-projects-page">
      <header className="v2-page-head">
        <h1 className="v2-page-title">
          <span className="v2-prompt">$</span>
          <span>projects</span>
        </h1>
        <div className="v2-page-cta-group">
          <button type="button" className="v2-btn v2-btn-ghost" onClick={openGithub} title="Import a repo from GitHub">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            import from github
          </button>
          <button type="button" className="v2-btn v2-btn-primary" onClick={openManual} title="Describe an idea — no code required">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            new project
          </button>
        </div>
      </header>

      {showEmpty ? (
        <div className="glass-card is-static is-roomy v2-empty">
          <div className="v2-empty-mark">+</div>
          <h2 className="v2-empty-title">
            <span className="v2-pink">No</span> projects yet.
          </h2>
          <p className="v2-empty-text">Import a GitHub repo or describe your idea — Recgon will take it from there.</p>
          <div className="v2-empty-actions">
            <button type="button" className="v2-btn v2-btn-primary" onClick={openManual}>
              + add your first project
            </button>
            <button type="button" className="v2-btn v2-btn-ghost" onClick={openGithub}>
              import from github
            </button>
          </div>
        </div>
      ) : (
        <div className="v2-projects-stack">
          <div className="v2-scope-strip" role="tablist" aria-label="Project scope">
            <button
              type="button"
              className={`v2-scope-chip ${scope === 'all' ? 'is-active' : ''}`}
              onClick={() => setScope('all')}
              role="tab"
              aria-selected={scope === 'all'}
            >
              All
            </button>
            <button
              type="button"
              className={`v2-scope-chip ${scope === 'personal' ? 'is-active' : ''}`}
              onClick={() => setScope('personal')}
              role="tab"
              aria-selected={scope === 'personal'}
            >
              Personal
            </button>
            {teams.map((t) => {
              const isActive = scope === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`v2-scope-chip ${isActive ? 'is-active' : ''}`}
                  onClick={() => setScope(t.id)}
                  role="tab"
                  aria-selected={isActive}
                  title={`Show projects shared in ${t.name}`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>

          <SectionIndex
            idx="01"
            label="needs you now"
            sub={featuredCount > 0 ? `${featuredCount} project${featuredCount === 1 ? '' : 's'} waiting on you` : 'all clear'}
          />
          <FeaturedNeedsAttention projects={scopedPortfolio} meta={portfolioMeta} loading={portfolioLoading} />

          {(restProjects.length > 0 || featuredCount === 0) && (
            <>
              <SectionIndex
                idx="02"
                label="portfolio"
                sub={featuredCount > 0 ? `${restProjects.length} more` : `${totalProjects} total`}
              />
              <PortfolioRows projects={restProjects} meta={portfolioMeta} loading={portfolioLoading} />
            </>
          )}
        </div>
      )}

      {/* Manual create modal */}
      {showManual && (
        <div className="v2-modal-overlay" onClick={() => setShowManual(false)} role="dialog" aria-modal="true">
          <div className="glass-card is-static v2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="v2-modal-head">
              <span className="recgon-label v2-block-eye">new project</span>
              <button type="button" className="v2-modal-x" onClick={() => setShowManual(false)} aria-label="Close">×</button>
            </div>
            <h3 className="v2-modal-heading">describe your idea</h3>
            <p className="v2-modal-hint">
              No code yet? No problem. Describe what you&apos;re building and Recgon will analyse it like a PM mentor.
              {' '}To analyse actual code, use <strong>Import from GitHub</strong> instead.
            </p>

            <label className="v2-field">
              <span className="v2-field-label">project name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my awesome app"
                className="v2-input"
                autoFocus
              />
            </label>

            <label className="v2-field">
              <span className="v2-field-label">idea description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                placeholder={"Describe your idea...\n\nWhat problem does it solve? Who is it for? What makes it different?"}
                className="v2-input v2-textarea"
              />
              {uploadedFilename && (
                <span className="v2-field-hint">extracted from {uploadedFilename}</span>
              )}
            </label>

            <div className="v2-modal-actions">
              <label className="v2-btn v2-btn-ghost v2-btn-file" title="Upload a PDF or DOCX to auto-fill the description">
                {extracting ? <><span className="v2-spinner" /> extracting…</> : 'upload .pdf or .docx'}
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileUpload}
                  disabled={extracting}
                  hidden
                />
              </label>
              <div className="v2-modal-spacer" />
              <button type="button" className="v2-btn v2-btn-ghost" onClick={() => setShowManual(false)}>
                cancel
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={handleCreate}
                disabled={creating || !name.trim() || !description.trim()}
              >
                {creating ? <><span className="v2-spinner" /> creating…</> : 'create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub picker modal */}
      {showGithub && (
        <div className="v2-modal-overlay" onClick={() => setShowGithub(false)} role="dialog" aria-modal="true">
          <div className="glass-card is-static v2-modal v2-modal-tall" onClick={(e) => e.stopPropagation()}>
            <div className="v2-modal-head">
              <span className="recgon-label v2-block-eye">import from github</span>
              <button type="button" className="v2-modal-x" onClick={() => setShowGithub(false)} aria-label="Close">×</button>
            </div>

            {reposError === 'NOT_CONNECTED' ? (
              <div className="v2-gh-empty">
                <div className="v2-gh-empty-mark">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                </div>
                <h3 className="v2-gh-empty-title">GitHub not connected</h3>
                <p className="v2-gh-empty-text">Connect your GitHub account to import repos into Recgon.</p>
                <a href="/api/github/connect" className="v2-btn v2-btn-primary">connect github →</a>
              </div>
            ) : reposError ? (
              <div className="v2-modal-error">
                <p>{reposError}</p>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="search your repos…"
                  className="v2-input v2-modal-search"
                  autoFocus
                />

                {reposLoading ? (
                  <div className="v2-modal-loading">
                    <span className="v2-spinner v2-spinner-pink" />
                    <span>loading repos…</span>
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <p className="v2-modal-hint">No repos match your search.</p>
                ) : (
                  <ul className="v2-repo-list">
                    {filteredRepos.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="v2-repo-row"
                          onClick={() => handleImportRepo(r)}
                          disabled={!!importing}
                        >
                          <div className="v2-repo-info">
                            <div className="v2-repo-name">
                              {r.name}
                              {r.private && <span className="v2-repo-badge">private</span>}
                            </div>
                            {r.description && <div className="v2-repo-desc">{r.description}</div>}
                            <div className="v2-repo-meta">
                              {r.language && <span>{r.language}</span>}
                              <span>updated {timeAgo(r.updated_at)}</span>
                            </div>
                          </div>
                          <span className="v2-repo-action">
                            {importing === r.full_name ? <><span className="v2-spinner v2-spinner-pink" /> importing…</> : 'import →'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .v2-projects-page {
          padding-bottom: 32px;
          animation: v2pageFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          max-width: 1440px;
          margin: 0 auto;
        }
        @keyframes v2pageFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }

        .v2-page-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }
        .v2-page-title {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: -0.4px;
          color: var(--txt-pure);
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .v2-prompt {
          color: var(--signature);
          opacity: 0.5;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-weight: 400;
        }
        .v2-pink { color: var(--signature); }
        .v2-page-cta-group {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        /* Stack of section markers + their sections */
        .v2-projects-stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .v2-projects-stack > .v2-sec-idx { margin-top: 16px; }
        .v2-projects-stack > .v2-sec-idx:first-child { margin-top: 0; }

        /* Scope strip — segmented filter (All / Personal) + team switchers.
           One row, uniform chip height, even gaps, no divider. */
        .v2-scope-strip {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 4px;
        }
        .v2-scope-chip {
          height: 30px;
          display: inline-flex;
          align-items: center;
          padding: 0 14px;
          border: 1px solid var(--rule);
          border-radius: 999px;
          background: transparent;
          color: var(--txt-faint);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2px;
          cursor: pointer;
          transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
          line-height: 1;
        }
        .v2-scope-chip:hover:not(.is-active) {
          color: var(--txt-pure);
          border-color: var(--rule-strong);
        }
        .v2-scope-chip.is-active {
          color: var(--txt-pure);
          background: rgba(var(--signature-rgb), 0.10);
          border-color: rgba(var(--signature-rgb), 0.40);
        }
        @media (max-width: 720px) {
          .v2-scope-strip {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 2px;
          }
          .v2-scope-chip { flex: 0 0 auto; }
        }

        .v2-sec-idx {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 0 3px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          min-height: 26px;
        }
        .v2-sec-idx-num {
          font-size: 11px;
          letter-spacing: 0.6px;
          color: var(--signature);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          padding: 2px 7px;
          background: rgba(var(--signature-rgb), 0.11);
          border: 1px solid rgba(var(--signature-rgb), 0.2);
          border-radius: 6px;
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.06);
        }
        .v2-sec-idx-lab {
          font-size: 11px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--txt-pure);
          font-weight: 700;
        }
        .v2-sec-idx-sub {
          margin-left: 6px;
          font-size: 10.5px;
          letter-spacing: 0.3px;
          color: var(--txt-muted);
          font-weight: 500;
          text-transform: lowercase;
        }
        .v2-sec-idx-sub::before {
          content: '·';
          margin-right: 8px;
          opacity: 0.5;
        }
        @media (max-width: 720px) {
          .v2-sec-idx-sub { display: none; }
        }

        /* Buttons */
        .v2-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          cursor: pointer;
          text-decoration: none;
          transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease, background 180ms ease, border-color 180ms ease, color 180ms ease;
          border: 1px solid;
        }
        .v2-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
        .v2-btn-primary {
          background: var(--signature);
          border-color: var(--signature);
          color: white;
        }
        .v2-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px -6px rgba(var(--signature-rgb), 0.5);
        }
        .v2-btn-ghost {
          background: transparent;
          border-color: var(--rule);
          color: var(--txt-muted);
        }
        .v2-btn-ghost:hover:not(:disabled) {
          color: var(--txt-pure);
          border-color: var(--rule-strong);
        }
        .v2-btn-file { cursor: pointer; }

        .v2-spinner {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 1.5px solid rgba(255, 255, 255, 0.30);
          border-top-color: white;
          animation: v2spin 700ms linear infinite;
        }
        .v2-spinner-pink {
          border-color: rgba(var(--signature-rgb), 0.30);
          border-top-color: var(--signature);
        }
        @keyframes v2spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* Empty (no projects) */
        .v2-empty {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 14px;
        }
        .v2-empty-mark {
          width: 48px; height: 48px;
          border-radius: 12px;
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--signature);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          font-weight: 300;
        }
        .v2-empty-title {
          font-size: clamp(22px, 2.6vw, 28px);
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.018em;
          margin: 0;
        }
        .v2-empty-text {
          font-size: 14.5px;
          color: var(--txt-muted);
          margin: 0;
        }
        .v2-empty-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }

        /* Modal */
        .v2-modal-overlay {
          position: fixed; inset: 0;
          z-index: 200;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: v2modalFade 180ms ease-out;
        }
        @keyframes v2modalFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .v2-modal {
          width: min(560px, 100%);
          max-height: calc(100vh - 80px);
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: v2modalSlide 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
          overflow: hidden;
        }
        .v2-modal-tall { width: min(680px, 100%); }
        @keyframes v2modalSlide {
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to   { opacity: 1; transform: none; }
        }
        .v2-modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .v2-block-eye { display: block; margin: 0; }
        .v2-modal-x {
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--txt-faint);
          width: 28px; height: 28px;
          border-radius: 50%;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          transition: color 180ms ease, border-color 180ms ease;
        }
        .v2-modal-x:hover {
          color: var(--txt-pure);
          border-color: var(--rule-strong);
        }
        .v2-modal-heading {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.012em;
          color: var(--txt-pure);
          margin: 0;
        }
        .v2-modal-hint {
          font-size: 13.5px;
          color: var(--txt-muted);
          margin: 0;
          line-height: 1.55;
        }
        .v2-gh-empty {
          padding: 32px 4px 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .v2-gh-empty-mark {
          width: 56px; height: 56px;
          border-radius: 14px;
          background: rgba(var(--signature-rgb), 0.08);
          color: var(--signature);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }
        .v2-gh-empty-title {
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.012em;
          color: var(--txt-pure);
          margin: 0;
        }
        .v2-gh-empty-text {
          font-size: 13.5px;
          color: var(--txt-muted);
          margin: 0 0 8px;
          line-height: 1.55;
        }
        .v2-modal-error {
          padding: 28px 4px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          color: var(--txt-muted);
        }
        .v2-modal-loading {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 32px 4px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          color: var(--txt-faint);
          justify-content: center;
        }

        /* Fields */
        .v2-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .v2-field-label {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }
        .v2-field-hint {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--success);
          letter-spacing: 0.3px;
          margin-top: 2px;
        }
        .v2-input {
          padding: 10px 14px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--rule);
          border-radius: 8px;
          color: var(--txt-pure);
          font-family: inherit;
          font-size: 13.5px;
          outline: none;
          transition: border-color 200ms ease;
        }
        .v2-input:focus { border-color: rgba(var(--signature-rgb), 0.40); }
        .v2-input::placeholder { color: var(--txt-faint); }
        .v2-textarea {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.55;
          resize: vertical;
        }
        .v2-modal-search { margin-bottom: 4px; }

        .v2-modal-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .v2-modal-spacer { flex: 1; }

        /* Repo list */
        .v2-repo-list {
          list-style: none;
          padding: 0;
          margin: 0 -28px -28px;
          overflow-y: auto;
          max-height: 50vh;
          border-top: 1px solid var(--rule);
        }
        .v2-repo-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          width: 100%;
          padding: 14px 28px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--rule);
          cursor: pointer;
          text-align: left;
          transition: background 180ms ease;
        }
        .v2-repo-row:last-child { border-bottom: none; }
        .v2-repo-row:hover:not(:disabled) {
          background: rgba(var(--signature-rgb), 0.04);
        }
        .v2-repo-row:disabled { opacity: 0.55; cursor: not-allowed; }
        .v2-repo-info { flex: 1; min-width: 0; }
        .v2-repo-name {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--txt-pure);
          margin-bottom: 4px;
          letter-spacing: -0.005em;
        }
        .v2-repo-badge {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 2px 7px;
          border: 1px solid var(--rule);
          color: var(--txt-faint);
          border-radius: 999px;
        }
        .v2-repo-desc {
          font-size: 12.5px;
          color: var(--txt-muted);
          line-height: 1.5;
          margin-bottom: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-repo-meta {
          display: flex;
          gap: 12px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--txt-faint);
          letter-spacing: 0.3px;
        }
        .v2-repo-action {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          color: var(--signature);
          letter-spacing: 0.4px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        @media (max-width: 720px) {
          .v2-page-head { flex-direction: column; align-items: flex-start; gap: 16px; }
        }
      `}</style>
    </div>
  );
}
