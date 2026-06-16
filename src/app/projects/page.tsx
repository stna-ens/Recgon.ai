'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Modal, Button, EmptyState } from '@/components/ui';
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

function timeAgo(dateStr: string, t: ReturnType<typeof useTranslations<'projects'>>): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return t('list.timeAgo.today');
  if (days < 7) return t('list.timeAgo.days', { n: days });
  if (days < 30) return t('list.timeAgo.weeks', { n: Math.floor(days / 7) });
  return t('list.timeAgo.months', { n: Math.floor(days / 30) });
}

interface OverviewResponse {
  totalProjects: number;
  projectCards: PortfolioRow[];
}

export default function V2ProjectsListPage() {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const ctx = useTeam();
  const currentTeam = ctx.currentTeam;
  const teams = ctx.teams ?? [];
  const ctxProjectUpdateStatuses = ctx.projectUpdateStatuses;
  const projectUpdateStatuses = useMemo(() => ctxProjectUpdateStatuses ?? {}, [ctxProjectUpdateStatuses]);
  const refreshProjects = ctx.refreshProjects;
  const { addToast } = useToast();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  // Top scope filter:
  //   'all'      → personal + every team's shared projects
  //   'personal' → only my private projects (isShared === false, createdBy = me)
  //   <teamId>   → only projects shared in that team (isShared !== false)
  const [scope, setScope] = useState<'all' | 'personal' | string>('all');

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
  // (full project records w/ createdBy + isShared) for every team the user is
  // a member of, then aggregate + dedupe. SWR caches the whole aggregate keyed
  // by the team set + user identity, so returning to this tab paints instantly
  // and revalidates silently in the background.
  const teamsKey = teams.map((t) => t.id).join(',');
  const portfolioKey = teams.length ? (['portfolio', teamsKey, currentUserId] as const) : null;

  const { data: portfolioData, error: portfolioError, mutate: mutatePortfolio } = useSWR(portfolioKey, async () => {
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
  const portfolioLoading = portfolioKey != null && portfolioData === undefined && !portfolioError;

  // A failed load should say so, not masquerade as an empty portfolio.
  useEffect(() => {
    if (portfolioError) addToast(t('list.toast.loadFailed'), 'error');
  }, [portfolioError, addToast, t]);

  // Populate GitHub update statuses (TeamProvider caches these in sessionStorage).
  useEffect(() => { refreshProjects?.(); }, [refreshProjects]);

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
          : t('list.githubModal.loadFailed'));
      } else {
        const list: GitHubRepo[] = await res.json();
        setRepos(list);
      }
    } catch {
      setReposError(t('list.githubModal.networkError'));
    } finally {
      setReposLoading(false);
    }
  }, [t]);

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
      if (!res.ok) throw new Error(data?.error || t('list.toast.createProjectFailed'));
      addToast(t('list.toast.created'), 'success');
      setShowManual(false);
      refreshProjects?.();
      mutatePortfolio();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('list.toast.createFailed'), 'error');
    } finally {
      setCreating(false);
    }
  }, [name, description, creating, currentTeam, addToast, refreshProjects, mutatePortfolio, t]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/projects/extract-text', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('list.toast.extractFailed'));
      setDescription(data.text);
      setUploadedFilename(file.name);
      addToast(t('list.toast.textExtracted'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('list.toast.extractFailed'), 'error');
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  }, [addToast, t]);

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
      if (!res.ok) throw new Error(data?.error || t('list.toast.importFailed'));
      addToast(t('list.toast.imported', { name: repo.name }), 'success');
      setShowGithub(false);
      refreshProjects?.();
      mutatePortfolio();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('list.toast.importFailed'), 'error');
    } finally {
      setImporting(null);
    }
  }, [currentTeam, addToast, refreshProjects, mutatePortfolio, t]);

  const filteredRepos = useMemo(() => {
    const q = repoSearch.toLowerCase();
    if (!q) return repos;
    return repos.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q)
    );
  }, [repos, repoSearch]);

  const totalProjects = portfolio.length;
  const showEmpty = !portfolioLoading && !portfolioError && totalProjects === 0;

  return (
    <div className="v2-projects-page">
      <header className="v2-page-head">
        <h1 className="v2-page-title">
          <span className="v2-prompt">$</span>
          <span>{t('list.title')}</span>
        </h1>
        <div className="v2-page-cta-group">
          <button type="button" className="v2-btn v2-btn-ghost" onClick={openGithub} title={t('list.importGithubTitle')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            {t('list.importGithub')}
          </button>
          <button type="button" className="v2-btn v2-btn-primary" onClick={openManual} title={t('list.newProjectTitle')}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            {t('list.newProject')}
          </button>
        </div>
      </header>

      {showEmpty ? (
        <div className="glass-card is-static is-roomy">
          <EmptyState
            icon="◇"
            title={t('list.empty.heading')}
            description={t('list.empty.text')}
            action={
              <div className="v2-empty-actions">
                <Button variant="primary" onClick={openManual}>
                  {t('list.empty.addFirst')}
                </Button>
                <Button variant="ghost" onClick={openGithub}>
                  {t('list.empty.importGithub')}
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="v2-projects-stack">
          {/* These are filters, not tabs — tab roles without arrow-key
              navigation break the ARIA contract; group + pressed is honest. */}
          <div className="v2-scope-strip" role="group" aria-label={t('list.scopeAria')}>
            <button
              type="button"
              className={`v2-scope-chip ${scope === 'all' ? 'is-active' : ''}`}
              onClick={() => setScope('all')}
              aria-pressed={scope === 'all'}
            >
              {t('list.scopeAll')}
            </button>
            <button
              type="button"
              className={`v2-scope-chip ${scope === 'personal' ? 'is-active' : ''}`}
              onClick={() => setScope('personal')}
              aria-pressed={scope === 'personal'}
            >
              {t('list.scopePersonal')}
            </button>
            {teams.map((tm) => {
              const isActive = scope === tm.id;
              return (
                <button
                  key={tm.id}
                  type="button"
                  className={`v2-scope-chip ${isActive ? 'is-active' : ''}`}
                  onClick={() => setScope(tm.id)}
                  aria-pressed={isActive}
                  title={t('list.scopeTeamTitle', { team: tm.name })}
                >
                  {tm.name}
                </button>
              );
            })}
          </div>

          <SectionIndex
            idx="01"
            label={t('list.needsYouNow')}
            sub={featuredCount > 0 ? t('list.needsYouNowSub', { count: featuredCount }) : t('list.allClear')}
          />
          <FeaturedNeedsAttention projects={scopedPortfolio} meta={portfolioMeta} loading={portfolioLoading} />

          {(restProjects.length > 0 || featuredCount === 0) && (
            <>
              <SectionIndex
                idx="02"
                label={t('list.portfolio')}
                sub={featuredCount > 0 ? t('list.portfolioMore', { count: restProjects.length }) : t('list.portfolioTotal', { count: totalProjects })}
              />
              <PortfolioRows projects={restProjects} meta={portfolioMeta} loading={portfolioLoading} />
            </>
          )}
        </div>
      )}

      {/* Manual create modal */}
      <Modal
        open={showManual}
        onOpenChange={setShowManual}
        title={t('list.manualModal.heading')}
        size="md"
        footer={
          <div className="v2-modal-actions">
            <label className="v2-btn v2-btn-ghost v2-btn-file" title={t('list.manualModal.uploadTitle')}>
              {extracting ? <><span className="v2-spinner" /> {t('list.manualModal.extracting')}</> : t('list.manualModal.uploadFile')}
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={handleFileUpload}
                disabled={extracting}
                hidden
              />
            </label>
            <div className="v2-modal-spacer" />
            <Button variant="ghost" onClick={() => setShowManual(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={creating}
              disabled={!name.trim() || !description.trim()}
            >
              {tCommon('create')}
            </Button>
          </div>
        }
      >
        <span className="recgon-label v2-block-eye">{t('list.manualModal.eyebrow')}</span>
        <p className="v2-modal-hint">
          {t('list.manualModal.hintBefore')}<strong>{t('list.manualModal.hintImport')}</strong>{t('list.manualModal.hintAfter')}
        </p>

        <label className="v2-field">
          <span className="v2-field-label">{t('list.manualModal.nameLabel')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('list.manualModal.namePlaceholder')}
            className="v2-input"
            autoFocus
          />
        </label>

        <label className="v2-field">
          <span className="v2-field-label">{t('list.manualModal.descriptionLabel')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            placeholder={t('list.manualModal.descriptionPlaceholder')}
            className="v2-input v2-textarea"
          />
          {uploadedFilename && (
            <span className="v2-field-hint">{t('list.manualModal.extractedFrom', { filename: uploadedFilename })}</span>
          )}
        </label>
      </Modal>

      {/* GitHub picker modal */}
      <Modal
        open={showGithub}
        onOpenChange={setShowGithub}
        title={t('list.githubModal.eyebrow')}
        size="lg"
      >
        <>
            {reposError === 'NOT_CONNECTED' ? (
              <div className="v2-gh-empty">
                <div className="v2-gh-empty-mark">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                </div>
                <h3 className="v2-gh-empty-title">{t('list.githubModal.notConnectedTitle')}</h3>
                <p className="v2-gh-empty-text">{t('list.githubModal.notConnectedText')}</p>
                <a href="/api/github/connect" className="v2-btn v2-btn-primary">{t('list.githubModal.connect')}</a>
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
                  placeholder={t('list.githubModal.searchPlaceholder')}
                  className="v2-input v2-modal-search"
                  autoFocus
                />

                {reposLoading ? (
                  <div className="v2-modal-loading">
                    <span className="v2-spinner v2-spinner-pink" />
                    <span>{t('list.githubModal.loading')}</span>
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <p className="v2-modal-hint">{t('list.githubModal.noMatch')}</p>
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
                              {r.private && <span className="v2-repo-badge">{t('list.githubModal.private')}</span>}
                            </div>
                            {r.description && <div className="v2-repo-desc">{r.description}</div>}
                            <div className="v2-repo-meta">
                              {r.language && <span>{r.language}</span>}
                              <span>{t('list.githubModal.updated', { time: timeAgo(r.updated_at, t) })}</span>
                            </div>
                          </div>
                          <span className="v2-repo-action">
                            {importing === r.full_name ? <><span className="v2-spinner v2-spinner-pink" /> {t('list.githubModal.importing')}</> : t('list.githubModal.import')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
        </>
      </Modal>

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
          transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease, background var(--dur-fast) ease;
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
          font-size: 10px;
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
          /* currentColor so the spinner stays visible inside ghost buttons
             in light mode (white-on-white otherwise). */
          border: 1.5px solid color-mix(in srgb, currentColor 30%, transparent);
          border-top-color: currentColor;
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

        /* Empty (no projects) — CTA row inside the shared <EmptyState>. */
        .v2-empty-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

        /* Modal body */
        .v2-block-eye { display: block; margin: 0; }
        .v2-modal-hint {
          font-size: 13px;
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
          font-size: 13px;
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
          font-size: 10px;
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
          font-size: 13px;
          outline: none;
          transition: border-color var(--dur-base) ease;
        }
        .v2-input:focus { border-color: rgba(var(--signature-rgb), 0.40); }
        .v2-input::placeholder { color: var(--txt-faint); }
        .v2-textarea {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
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
          margin: 0 calc(-1 * var(--card-pad-lg)) calc(-1 * var(--card-pad-lg));
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
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 2px 7px;
          border: 1px solid var(--rule);
          color: var(--txt-faint);
          border-radius: 999px;
        }
        .v2-repo-desc {
          font-size: 12px;
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
          font-size: 10px;
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
