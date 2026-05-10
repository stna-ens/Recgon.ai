'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import SwotMatrixSection from '@/components/v2/projects/overview/SwotMatrixSection';
import RisksSection from '@/components/v2/projects/overview/RisksSection';
import MarketSection from '@/components/v2/projects/overview/MarketSection';
import GrowSection from '@/components/v2/projects/overview/GrowSection';
import ConnectCodebaseModal from '@/components/v2/projects/overview/ConnectCodebaseModal';
import DeleteProjectModal from '@/components/v2/projects/overview/DeleteProjectModal';
import type { Project } from '@/components/v2/projects/overview/types';
import {
  STAGE_LABEL,
  timeAgo,
  splitHeadline,
  extractTags,
  PAIN_DICT,
  AUDIENCE_DICT,
  categorizeTech,
} from '@/components/v2/projects/overview/utils';
import { projectInitial } from '@/components/v2/utils';
import './overview.css';

export default function V2ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params?.id;
  const { currentTeam, refreshProjects } = useTeam();
  const teamId = currentTeam?.id ?? null;
  const { addToast } = useToast();
  const { data: session } = useSession();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [hasUpdates, setHasUpdates] = useState(false);
  const [latestCommit, setLatestCommit] = useState<{ sha: string; message: string; date: string; url: string } | null>(null);
  const [quota, setQuota] = useState<{ allowed: boolean; used: number; limit: number; reason?: string; nextAvailableAt?: string } | null>(null);
  const [togglingShared, setTogglingShared] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit description / connect codebase modals
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const [connectingCodebase, setConnectingCodebase] = useState(false);
  const [codebasePath, setCodebasePath] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [actedExpanded, setActedExpanded] = useState(false);
  const [featuresExpanded, setFeaturesExpanded] = useState(false);
  const [uspsExpanded, setUspsExpanded] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!teamId || !projectId) return;
    try {
      const r = await fetch(`/api/projects/${projectId}?teamId=${teamId}`, { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        setProject(data);
      }
    } catch { /* swallowed */ }
  }, [teamId, projectId]);

  useEffect(() => {
    if (!teamId || !projectId) return;
    setLoading(true);
    fetchProject().finally(() => setLoading(false));
  }, [teamId, projectId, fetchProject]);

  // Check for repo updates (only relevant for github-connected projects)
  useEffect(() => {
    if (!teamId || !projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/check-updates?teamId=${teamId}`)
      .then((r) => (r.ok ? r.json() : { hasUpdates: false }))
      .then((data) => {
        if (cancelled) return;
        setHasUpdates(!!data.hasUpdates);
        if (data.hasUpdates && data.commit) setLatestCommit(data.commit);
      })
      .catch(() => { /* swallowed */ });
    return () => { cancelled = true; };
  }, [teamId, projectId]);

  // Fetch analysis quota
  useEffect(() => {
    fetch('/api/analysis-quota')
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => { if (q) setQuota(q); })
      .catch(() => { /* swallowed */ });
  }, []);

  const quotaBlocked = quota !== null && !quota.allowed;

  const handleAnalyze = useCallback(async () => {
    if (!projectId || !teamId || analyzing) return;
    if (quotaBlocked) {
      addToast(quota?.reason || 'analysis quota reached', 'error');
      return;
    }
    setAnalyzing(true);
    setProgress('starting analysis…');
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze`, {
        method: 'POST',
        headers: { 'x-team-id': teamId },
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'analysis failed');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const dataLine = line.startsWith('data: ') ? line.slice(6) : line;
          if (!dataLine.trim()) continue;
          try {
            const event = JSON.parse(dataLine);
            if (event.type === 'progress') setProgress(event.message);
            else if (event.type === 'done') {
              setProject(event.project);
              setHasUpdates(false);
              setLatestCommit(null);
              refreshProjects?.();
              addToast('analysis complete', 'success');
              fetch('/api/analysis-quota').then((r) => (r.ok ? r.json() : null)).then((q) => { if (q) setQuota(q); }).catch(() => {});
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'analysis failed', 'error');
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }, [projectId, teamId, analyzing, refreshProjects, addToast, quotaBlocked, quota?.reason]);

  const handleDelete = useCallback(async () => {
    if (!projectId || !teamId || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}?teamId=${teamId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'failed to delete project');
      }
      refreshProjects?.();
      addToast('project deleted', 'success');
      router.push('/projects');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed to delete', 'error');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }, [projectId, teamId, deleting, refreshProjects, addToast, router]);

  const handleToggleShared = useCallback(async () => {
    if (!project || !teamId || togglingShared) return;
    const next = !(project.isShared ?? true);
    setTogglingShared(true);
    try {
      const res = await fetch(`/api/projects/${project.id}?teamId=${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isShared: next }),
      });
      if (res.ok) {
        setProject({ ...project, isShared: next });
        refreshProjects?.();
        addToast(next ? 'project shared with team' : 'project set to private', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'failed to update sharing');
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed to update sharing', 'error');
    } finally {
      setTogglingShared(false);
    }
  }, [project, teamId, togglingShared, refreshProjects, addToast]);

  const handleSaveDescription = useCallback(async () => {
    if (!draftDescription.trim() || !project || !teamId || savingDescription) return;
    setSavingDescription(true);
    try {
      const res = await fetch(`/api/projects/${project.id}?teamId=${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: draftDescription }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'failed to save description');
      }
      setProject({ ...project, description: draftDescription });
      setEditingDescription(false);
      addToast('description saved · re-analyzing…', 'success');
      handleAnalyze();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed to save', 'error');
    } finally {
      setSavingDescription(false);
    }
  }, [draftDescription, project, teamId, savingDescription, addToast, handleAnalyze]);

  const handleConnectCodebase = useCallback(async () => {
    if (!codebasePath.trim() || !project || !teamId || connectLoading) return;
    setConnectLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}?teamId=${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: codebasePath }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'failed to connect codebase');
      }
      const isGithub = codebasePath.startsWith('https://github.com/');
      setProject({ ...project, path: codebasePath, sourceType: isGithub ? 'github' : 'description', isGithub });
      setConnectingCodebase(false);
      setCodebasePath('');
      addToast('codebase connected · re-analyzing…', 'success');
      handleAnalyze();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'failed to connect', 'error');
    } finally {
      setConnectLoading(false);
    }
  }, [codebasePath, project, teamId, connectLoading, addToast, handleAnalyze]);

  // Esc closes modals
  useEffect(() => {
    if (!editingDescription && !connectingCodebase) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingDescription(false);
        setConnectingCodebase(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingDescription, connectingCodebase]);

  const a = project?.analysis;

  if (loading) {
    return (
      <div className="v2-overview">
        <div className="glass-card is-static is-roomy v2-skel-card">
          <div className="v2-skel-line" style={{ width: '40%' }} />
          <div className="v2-skel-line" style={{ width: '70%' }} />
          <div className="v2-skel-line" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="v2-overview">
        <div className="glass-card is-static is-roomy">
          <p style={{ color: 'var(--txt-muted)', margin: 0 }}>Project not found.</p>
        </div>
      </div>
    );
  }

  if (!a) {
    return (
      <div className="v2-overview">
        <div className="glass-card is-static is-roomy v2-no-analysis">
          <div className="v2-no-analysis-num">01</div>
          <div className="v2-no-analysis-body">
            <h2 className="v2-no-analysis-title">
              <span className="v2-pink">No</span> analysis yet.
            </h2>
            <p className="v2-no-analysis-text">
              Run the AI mentor on {project.name} to get a full product brief: features,
              market, SWOT, prioritized next steps, GTM plan.
            </p>
            {analyzing ? (
              <div className="v2-analyzing">
                <span className="v2-analyzing-spinner" />
                <span className="v2-analyzing-text">{progress ?? 'analyzing…'}</span>
              </div>
            ) : (
              <button type="button" onClick={handleAnalyze} className="v2-btn-primary v2-btn-anal">
                analyze project →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="v2-overview">
      {/* Update-available banner */}
      {hasUpdates && project.sourceType !== 'description' && (
        <div className="v2-banner v2-banner-warn">
          <div className="v2-banner-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </div>
          <div className="v2-banner-body">
            <div className="v2-banner-title">new commits since last analysis</div>
            {latestCommit && (
              <div className="v2-banner-sub">
                <a href={latestCommit.url} target="_blank" rel="noreferrer" className="v2-banner-commit">
                  {latestCommit.sha.slice(0, 7)}
                </a>
                {' · '}
                {latestCommit.message.split('\n')[0].slice(0, 80)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || quotaBlocked}
            className="v2-btn v2-btn-warn"
            title={quotaBlocked ? quota?.reason : 'Re-run mentor analysis on the latest commit'}
          >
            {analyzing ? (
              <><span className="v2-analyzing-spinner v2-analyzing-spinner-sm" /> re-analyzing…</>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: '-2px' }}>
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                see what changed
              </>
            )}
          </button>
        </div>
      )}

      {/* Quota banner */}
      {quota && (
        <div className={`v2-banner ${quotaBlocked ? 'v2-banner-danger' : 'v2-banner-info'}`}>
          <div className="v2-banner-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="v2-banner-body">
            <div className="v2-banner-title">
              {quotaBlocked ? quota.reason : `${quota.limit - quota.used} of ${quota.limit} analyses remaining`}
            </div>
            {!quotaBlocked && quota.used > 0 && quota.nextAvailableAt && (
              <div className="v2-banner-sub">
                next free analysis · {new Date(quota.nextAvailableAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>
          <div className="v2-quota-dots" aria-hidden="true">
            {Array.from({ length: quota.limit }).map((_, i) => (
              <span
                key={i}
                className={`v2-quota-dot ${i < quota.used ? 'is-used' : ''} ${quotaBlocked ? 'is-blocked' : ''}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* --- Brief header --- */}
      <section className="v2-section">
        <div className="v2-section-head">
          <span className="recgon-label v2-eyebrow">› product overview</span>
          <div className="v2-meta-strip">
            <div className="v2-meta-info">
              {hasUpdates && project.sourceType !== 'description' && (
                <span className="v2-chip is-warn" title="New commits since the last analysis">
                  ! new commits
                </span>
              )}
              <span className="v2-meta-time">analyzed {timeAgo(a.analyzedAt)}</span>
            </div>

            <div className="v2-meta-actions">
              {(project.path || project.githubUrl) && project.isGithub && (
                <a
                  href={project.path || project.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="v2-action-btn"
                  title="Open repo on GitHub"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <span>repo</span>
                </a>
              )}
              {analyzing ? (
                <span className="v2-action-btn is-loading">
                  <span className="v2-analyzing-spinner v2-analyzing-spinner-sm" />
                  <span>{progress ?? 'analyzing…'}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={quotaBlocked}
                  className="v2-action-btn"
                  title={quotaBlocked ? quota?.reason : 'Re-run mentor analysis'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  <span>re-analyze</span>
                </button>
              )}
              <Link href={`/projects/${project.id}/export`} className="v2-action-btn" target="_blank" rel="noreferrer" title="Download a PDF brief">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>export</span>
              </Link>

              <span className="v2-meta-divider" aria-hidden="true" />

              {session?.user?.id && project.createdBy === session.user.id && (
                <button
                  type="button"
                  className="v2-action-icon"
                  title={project.isShared === false
                    ? 'Private — only you can see this project. Click to share with your team.'
                    : 'Shared — all team members can see this project. Click to make it private.'}
                  onClick={handleToggleShared}
                  disabled={togglingShared}
                  aria-label={project.isShared === false ? 'Share with team' : 'Make private'}
                >
                  {project.isShared === false ? (
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  )}
                </button>
              )}
              <button
                type="button"
                className="v2-action-icon is-danger"
                title="Delete project"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting}
                aria-label="Delete project"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* HERO: name + tagline + at-a-glance stat strip */}
        <div className="v2-pov-hero">
          <div className="glass-card is-static is-roomy v2-pov-id">
            <div className="v2-pov-id-head">
              <span className="recgon-label v2-block-eye">project</span>
              {project.sourceType === 'description' && (
                <div className="v2-brief-actions">
                  <button
                    type="button"
                    className="v2-icon-btn"
                    title="Edit idea description"
                    onClick={() => { setDraftDescription(project.description ?? ''); setEditingDescription(true); }}
                    aria-label="Edit idea description"
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="v2-icon-btn"
                    title="Connect a codebase to this project"
                    onClick={() => setConnectingCodebase(true)}
                    aria-label="Connect a codebase to this project"
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <h2 className="v2-pov-name" style={{ fontSize: 22 }}>
              <span className="v2-pov-name-logo">
                {project.logoUrl
                  ? <img src={project.logoUrl} alt="" className="v2-pov-name-logo-img"
                      onError={(e) => { (e.currentTarget.parentElement as HTMLElement).textContent = projectInitial(project.name); }} />
                  : projectInitial(project.name)}
              </span>
              <span className="v2-pov-name-text">{(a.name ?? '').toLowerCase()}</span>
            </h2>
            {editingDescription ? (
              <div className="v2-pov-edit">
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={4}
                  className="v2-input v2-textarea v2-pov-edit-textarea"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingDescription(false);
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveDescription();
                  }}
                />
                <div className="v2-pov-edit-actions">
                  <button type="button" className="v2-btn v2-btn-ghost" onClick={() => setEditingDescription(false)}>cancel</button>
                  <button
                    type="button"
                    className="v2-btn v2-btn-primary"
                    onClick={handleSaveDescription}
                    disabled={savingDescription || !draftDescription.trim()}
                  >
                    {savingDescription ? <><span className="v2-mod-spinner" /> saving…</> : 'save & re-analyze'}
                  </button>
                </div>
              </div>
            ) : (
              a.description && <p className="v2-pov-tagline">{a.description}</p>
            )}
          </div>

          <div className="v2-pov-stats">
            {a.currentStage && project.sourceType !== 'description' && (() => {
              const stages: Array<'idea'|'mvp'|'beta'|'growth'|'mature'> = ['idea','mvp','beta','growth','mature'];
              const idx = stages.indexOf(a.currentStage);
              const tone = STAGE_LABEL[a.currentStage]?.tone ?? 'var(--signature)';
              return (
                <div className="glass-card is-static is-tight v2-pov-stat v2-pov-stat-stage">
                  <span className="recgon-label v2-block-eye">stage</span>
                  <div className="v2-stage-pipeline" style={{ ['--stage-tone' as string]: tone }}>
                    {stages.map((s, i) => (
                      <div
                        key={s}
                        className={`v2-stage-node ${i < idx ? 'is-passed' : ''} ${i === idx ? 'is-current' : ''}`}
                        title={s}
                      >
                        <span className="v2-stage-dot" />
                        <span className="v2-stage-name">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {a.techStack?.length > 0 && (
              <div className="glass-card is-static is-tight v2-pov-stat v2-pov-stat-num">
                <span className="recgon-label v2-block-eye">stack size</span>
                <div className="v2-pov-bignum">{a.techStack.length}</div>
                <div className="v2-pov-bignum-sub">{a.techStack.length === 1 ? 'technology' : 'technologies'}</div>
              </div>
            )}

            {a.features?.length > 0 && (
              <div className="glass-card is-static is-tight v2-pov-stat v2-pov-stat-num">
                <span className="recgon-label v2-block-eye">features</span>
                <div className="v2-pov-bignum">{a.features.length}</div>
                <div className="v2-pov-bignum-sub">shipped capabilities</div>
              </div>
            )}

            {a.uniqueSellingPoints?.length > 0 && (
              <div className="glass-card is-static is-tight v2-pov-stat v2-pov-stat-num">
                <span className="recgon-label v2-block-eye">usps</span>
                <div className="v2-pov-bignum">{a.uniqueSellingPoints.length}</div>
                <div className="v2-pov-bignum-sub">unique angles</div>
              </div>
            )}

            {a.prioritizedNextSteps && a.prioritizedNextSteps.length > 0 && (
              <div className="glass-card is-static is-tight v2-pov-stat v2-pov-stat-num">
                <span className="recgon-label v2-block-eye">priorities</span>
                <div className="v2-pov-bignum">{a.prioritizedNextSteps.length}</div>
                <div className="v2-pov-bignum-sub">next steps</div>
              </div>
            )}
          </div>
        </div>

        {/* PROBLEM / AUDIENCE diptych */}
        {(a.problemStatement || a.targetAudience) && (() => {
          const probSplit = a.problemStatement ? splitHeadline(a.problemStatement) : null;
          const audSplit  = a.targetAudience  ? splitHeadline(a.targetAudience)  : null;
          const painTags = a.problemStatement ? extractTags(a.problemStatement, PAIN_DICT) : [];
          const audTags  = a.targetAudience  ? extractTags(a.targetAudience,  AUDIENCE_DICT) : [];
          return (
            <div className="v2-diag" role="group" aria-label="Problem and audience diagnostics">
              {a.problemStatement && (
                <div className="glass-card is-static is-roomy v2-diag-panel v2-diag-prob">
                  <span className="recgon-label v2-block-eye">the problem</span>
                  {probSplit?.headline && (
                    <p className="v2-diag-headline">{probSplit.headline}</p>
                  )}
                  {probSplit?.rest && (
                    <p className="v2-diag-body">{probSplit.rest}</p>
                  )}
                  {painTags.length > 0 && (
                    <div className="v2-diag-tags-block">
                      <span className="recgon-label v2-diag-tags-eye">› symptoms</span>
                      <div className="v2-diag-tags">
                        {painTags.map((t) => (
                          <span key={t} className="v2-diag-tag v2-diag-tag-pain">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {a.targetAudience && (
                <div className="glass-card is-static is-roomy v2-diag-panel v2-diag-aud">
                  <span className="recgon-label v2-block-eye">target audience</span>
                  {audSplit?.headline && (
                    <p className="v2-diag-headline">{audSplit.headline}</p>
                  )}
                  {audSplit?.rest && (
                    <p className="v2-diag-body">{audSplit.rest}</p>
                  )}
                  {audTags.length > 0 && (
                    <div className="v2-diag-tags-block">
                      <span className="recgon-label v2-diag-tags-eye">› persona traits</span>
                      <div className="v2-diag-tags">
                        {audTags.map((t) => (
                          <span key={t} className="v2-diag-tag v2-diag-tag-aud">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* STACK INVENTORY: categorized treemap with composition bar */}
        {a.techStack?.length > 0 && (() => {
          const grouped = a.techStack.reduce<Record<string, { label: string; tone: string; items: string[] }>>((acc, name) => {
            const cat = categorizeTech(name);
            if (!acc[cat.key]) acc[cat.key] = { label: cat.label, tone: cat.tone, items: [] };
            acc[cat.key].items.push(name);
            return acc;
          }, {});
          const ordered = Object.entries(grouped).sort(([, a1], [, b1]) => b1.items.length - a1.items.length);
          const total = a.techStack.length;
          return (
            <div className="glass-card is-static is-roomy v2-inv-card">
              <div className="v2-inv-head">
                <span className="recgon-label v2-block-eye">stack inventory</span>
                <div className="v2-inv-counts">
                  <span className="v2-inv-total">{total}</span>
                  <span className="v2-inv-total-sub">tech in {ordered.length} {ordered.length === 1 ? 'category' : 'categories'}</span>
                </div>
              </div>

              <div className="v2-inv-bar" role="img" aria-label="Stack composition by category">
                {ordered.map(([key, g]) => (
                  <span
                    key={key}
                    className="v2-inv-bar-seg"
                    style={{
                      flexGrow: g.items.length,
                      backgroundColor: g.tone,
                      ['--seg-tone' as string]: g.tone,
                    }}
                    title={`${g.label}: ${g.items.length}`}
                  />
                ))}
              </div>

              <div className="v2-inv-legend">
                {ordered.map(([key, g]) => (
                  <span key={key} className="v2-inv-leg-item">
                    <span className="v2-inv-leg-dot" style={{ background: g.tone }} />
                    <span className="v2-inv-leg-name">{g.label}</span>
                    <span className="v2-inv-leg-count">{g.items.length}</span>
                  </span>
                ))}
              </div>

              <div className="v2-inv-grid">
                {ordered.map(([key, g]) => (
                  <div key={key} className="v2-inv-cat" style={{ ['--cat-tone' as string]: g.tone }}>
                    <div className="v2-inv-cat-head">
                      <span className="v2-inv-cat-rule" aria-hidden="true" />
                      <span className="v2-inv-cat-name">{g.label}</span>
                      <span className="v2-inv-cat-count">{g.items.length}</span>
                    </div>
                    <div className="v2-inv-cat-items">
                      {g.items.map((it) => (
                        <span key={it} className="v2-inv-chip">{it.toLowerCase()}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </section>

      {/* --- Features + USPs : capability matrix --- */}
      {(a.features?.length || a.uniqueSellingPoints?.length) && (
        <section className="v2-section">
          <div className="v2-section-head">
            <span className="recgon-label v2-eyebrow">› what it does</span>
          </div>
          <div className="v2-cap-grid">
            {a.features?.length > 0 && (() => {
              const items = featuresExpanded ? a.features : a.features.slice(0, 4);
              const hidden = a.features.length - 4;
              return (
                <div className="glass-card is-static is-roomy v2-cap-card v2-cap-card-feat">
                  <div className="v2-cap-head">
                    <span className="recgon-label v2-block-eye">shipped capabilities</span>
                    <span className="v2-cap-count">{a.features.length}</span>
                  </div>
                  <ul className="v2-cap-list">
                    {items.map((f, i) => {
                      const depth = Math.min(8, Math.max(2, Math.round(f.length / 30)));
                      return (
                        <li key={i} className="v2-cap-row">
                          <span className="v2-cap-idx">F{String(i + 1).padStart(2, '0')}</span>
                          <span className="v2-cap-text">{f}</span>
                          <span className="v2-cap-depth" aria-label={`depth ${depth} of 8`}>
                            {Array.from({ length: 8 }).map((_, j) => (
                              <span key={j} className={`v2-cap-tick ${j < depth ? 'is-on' : ''}`} />
                            ))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {hidden > 0 && (
                    <button type="button" className="v2-acted-expand" onClick={() => setFeaturesExpanded(!featuresExpanded)}>
                      {featuresExpanded
                        ? <>show less <span className="v2-acted-expand-glyph">↑</span></>
                        : <>show {hidden} more <span className="v2-acted-expand-glyph">↓</span></>}
                    </button>
                  )}
                </div>
              );
            })()}
            {a.uniqueSellingPoints?.length > 0 && (() => {
              const items = uspsExpanded ? a.uniqueSellingPoints : a.uniqueSellingPoints.slice(0, 4);
              const hidden = a.uniqueSellingPoints.length - 4;
              return (
                <div className="glass-card is-static is-roomy v2-cap-card v2-cap-card-usp">
                  <div className="v2-cap-head">
                    <span className="recgon-label v2-block-eye">unique angles</span>
                    <span className="v2-cap-count">{a.uniqueSellingPoints.length}</span>
                  </div>
                  <ul className="v2-cap-list">
                    {items.map((u, i) => (
                      <li key={i} className="v2-cap-row v2-cap-row-usp">
                        <span className="v2-cap-star" aria-hidden="true">
                          <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 0l2.4 5.2L16 6l-4 3.7L13 16 8 13l-5 3 1-6.3L0 6l5.6-.8z" />
                          </svg>
                        </span>
                        <span className="v2-cap-text">{u}</span>
                      </li>
                    ))}
                  </ul>
                  {hidden > 0 && (
                    <button type="button" className="v2-acted-expand" onClick={() => setUspsExpanded(!uspsExpanded)}>
                      {uspsExpanded
                        ? <>show less <span className="v2-acted-expand-glyph">↑</span></>
                        : <>show {hidden} more <span className="v2-acted-expand-glyph">↓</span></>}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* --- Prioritized next steps : priority ladder with heat-mapped rails --- */}
      {a.prioritizedNextSteps && a.prioritizedNextSteps.length > 0 && (
        <section className="v2-section">
          <div className="v2-section-head">
            <span className="recgon-label v2-eyebrow">› do next</span>
          </div>
          <div className="glass-card is-static is-roomy v2-ladder">
            {a.prioritizedNextSteps.map((s, i) => {
              const total = a.prioritizedNextSteps!.length;
              const heat = 1 - (i / Math.max(1, total - 1));
              const tier = i === 0 ? 'p0' : i < 3 ? 'p1' : i < 6 ? 'p2' : 'p3';
              return (
                <div key={i} className={`v2-ladder-row v2-ladder-${tier}`} style={{ ['--heat' as string]: heat.toFixed(2) }}>
                  <div className="v2-ladder-rail" aria-hidden="true" />
                  <div className="v2-ladder-marker">
                    <span className="v2-ladder-tier">{tier}</span>
                    <span className="v2-ladder-idx">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="v2-ladder-body">
                    <p className="v2-ladder-text">{s}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Acted-on tracker : ring gauge + structured checklist */}
      {a.nextStepsTaken && a.nextStepsTaken.length > 0 && (() => {
        const taken = a.nextStepsTaken.filter((s) => s.taken).length;
        const total = a.nextStepsTaken.length;
        const pct = Math.round((taken / total) * 100);
        const tone = pct >= 60 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444';
        const r = 44;
        const C = 2 * Math.PI * r;
        const filled = (pct / 100) * C;
        return (
          <section className="v2-section">
            <div className="v2-section-head">
              <span className="recgon-label v2-eyebrow">› acted on</span>
            </div>
            <div className="glass-card is-static is-roomy v2-acted-card">
              <div className="v2-acted-summary">
                <div className="v2-acted-ring" role="img" aria-label={`${pct}% complete`}>
                  <svg viewBox="0 0 80 80" width="64" height="64">
                    <circle cx="40" cy="40" r="28" fill="none" stroke="var(--rule)" strokeWidth="5" />
                    <circle
                      cx="40" cy="40" r="28"
                      fill="none"
                      stroke={tone}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(pct / 100) * 2 * Math.PI * 28} ${2 * Math.PI * 28}`}
                      transform="rotate(-90 40 40)"
                      style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.2,0.8,0.2,1)' }}
                    />
                  </svg>
                  <div className="v2-acted-ring-pct" style={{ color: tone }}>{pct}%</div>
                </div>
                <div className="v2-acted-summary-text">
                  <div className="v2-acted-summary-head">
                    <span className="recgon-label v2-block-eye">completion</span>
                    <span className="v2-acted-summary-count">{taken} <span>of</span> {total}</span>
                  </div>
                  <div className="v2-acted-summary-pills">
                    <span className="v2-acted-pill is-acted">{taken} acted</span>
                    <span className="v2-acted-pill">{total - taken} pending</span>
                  </div>
                </div>
              </div>

              <ul className="v2-acted-list">
                {(actedExpanded ? a.nextStepsTaken : a.nextStepsTaken.slice(0, 4)).map((entry, i) => (
                  <li key={i} className={`v2-acted-row ${entry.taken ? 'is-taken' : ''}`}>
                    <span className="v2-acted-check" aria-hidden="true">
                      {entry.taken ? (
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M3 8.5l3.5 3.5L13 5" />
                        </svg>
                      ) : (
                        <span className="v2-acted-dot" />
                      )}
                    </span>
                    <div className="v2-acted-content">
                      <div className="v2-acted-step">{entry.step}</div>
                      {entry.evidence && (
                        <div className="v2-acted-evidence">› {entry.evidence}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {total > 4 && (
                <button
                  type="button"
                  className="v2-acted-expand"
                  onClick={() => setActedExpanded(!actedExpanded)}
                >
                  {actedExpanded
                    ? <>show less <span className="v2-acted-expand-glyph">↑</span></>
                    : <>show {total - 4} more <span className="v2-acted-expand-glyph">↓</span></>}
                </button>
              )}
            </div>
          </section>
        );
      })()}

      {/* What changed : diff-style timeline */}
      {a.improvements && a.improvements.length > 0 && (
        <section className="v2-section">
          <div className="v2-section-head">
            <span className="recgon-label v2-eyebrow">› what changed</span>
          </div>
          <div className="glass-card is-static is-roomy v2-diff">
            <ul className="v2-diff-list">
              {a.improvements.map((imp, i) => (
                <li key={i} className="v2-diff-row">
                  <span className="v2-diff-marker" aria-hidden="true">+</span>
                  <span className="v2-diff-text">{imp}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* --- SWOT : true 2x2 axis matrix --- */}
      {a.swot && <SwotMatrixSection swot={a.swot} projectName={a.name} />}

      {/* --- Risks : severity register --- */}
      {a.topRisks && <RisksSection topRisks={a.topRisks} />}

      {/* --- Market + Competitors : market panel + battlecards --- */}
      <MarketSection analysis={a} />

      {/* --- Business model + GTM : revenue panel + adoption funnel + KPI tiles --- */}
      <GrowSection analysis={a} />

      {/* Connect codebase modal */}
      <ConnectCodebaseModal
        open={connectingCodebase}
        path={codebasePath}
        onPathChange={setCodebasePath}
        onClose={() => setConnectingCodebase(false)}
        onSubmit={handleConnectCodebase}
        loading={connectLoading}
      />

      {/* Delete project confirm modal */}
      <DeleteProjectModal
        open={confirmingDelete}
        projectName={project.name}
        onClose={() => setConfirmingDelete(false)}
        onDelete={handleDelete}
        deleting={deleting}
      />

    </div>
  );
}
