'use client';

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';

interface ProjectFull {
  id: string;
  name: string;
  description?: string;
  isShared?: boolean;
  isGithub?: boolean;
  githubUrl?: string;
  path?: string;
  sourceType?: 'codebase' | 'github' | 'description';
  createdAt: string;
  analyticsPropertyId?: string;
  createdBy?: string;
  logoUrl?: string;
  lastAnalyzedCommitSha?: string;
  analysis?: {
    name?: string;
    analyzedAt?: string;
    websiteUrl?: string;
  };
}

interface TeamMemberLite {
  userId: string;
  nickname?: string | null;
  email?: string | null;
}

type EditKey =
  | 'logo'
  | 'name'
  | 'description'
  | 'github'
  | 'analytics'
  | null;

function relativeTime(iso?: string, justNow = 'just now'): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return justNow;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d`;
  if (diffSec < 86400 * 365) return `${Math.floor(diffSec / (86400 * 30))}mo`;
  return `${Math.floor(diffSec / (86400 * 365))}y`;
}

function shortSha(sha?: string): string {
  return sha ? sha.slice(0, 7) : '';
}

function githubLabel(url?: string): string {
  if (!url) return '';
  const m = url.match(/github\.com\/([^/]+\/[^/?#]+)/);
  return m ? m[1].replace(/\.git$/, '') : url;
}

function hostOnly(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const SECTIONS = [
  { id: 'sect-identity', index: '00', key: 'identity' },
  { id: 'sect-sources', index: '01', key: 'sources' },
  { id: 'sect-access', index: '02', key: 'access' },
  { id: 'sect-destroy', index: 'X', key: 'destroy' },
] as const;

export default function V2ProjectSettingsPage() {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const router = useRouter();
  const { currentTeam, refreshProjects } = useTeam();
  const teamId = currentTeam?.id ?? null;
  const { addToast } = useToast();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  // project + members come from SWR — cached across navigations, so returning
  // to Settings paints instantly and revalidates in the background (no
  // skeleton). Focus revalidation is handled by SWRConfig.
  const projectKey = (teamId && projectId) ? `/api/projects/${projectId}?teamId=${teamId}` : null;
  const { data: projectData, error: projectError, mutate: mutateProject } = useSWR<ProjectFull>(projectKey);
  const project = projectData ?? null;
  const membersKey = teamId ? `/api/teams/${teamId}/members` : null;
  const { data: membersData } = useSWR<TeamMemberLite[]>(membersKey);
  const members = useMemo<TeamMemberLite[]>(
    () => (Array.isArray(membersData) ? membersData : []),
    [membersData],
  );
  const loading = projectKey != null && projectData === undefined && !projectError;

  // Single edit-state machine — only one row open at a time, like a printed form.
  const [editing, setEditing] = useState<EditKey>(null);

  // Identity drafts
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [logoDraft, setLogoDraft] = useState('');

  // Sources drafts
  const [pathDraft, setPathDraft] = useState('');
  const [ga4Draft, setGa4Draft] = useState('');

  // Loading flags
  const [savingName, setSavingName] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [savingPath, setSavingPath] = useState(false);
  const [savingGa4, setSavingGa4] = useState(false);
  const [togglingShared, setTogglingShared] = useState(false);

  // Danger
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Active TOC entry — driven by IntersectionObserver
  const [activeSection, setActiveSection] = useState<string>('sect-identity');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // TOC scroll-spy
  useEffect(() => {
    if (loading || !project) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, {
      rootMargin: '-30% 0px -50% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    SECTIONS.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [loading, project]);

  // ── Network ─────────────────────────────────────────
  const patch = useCallback(async (body: Record<string, unknown>) => {
    if (!teamId || !projectId) throw new Error(t('settings.toast.missingContext'));
    const res = await fetch(`/api/projects/${projectId}?teamId=${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || t('settings.toast.updateFailed'));
    }
    return res.json();
  }, [teamId, projectId, t]);

  const closeEditor = useCallback(() => setEditing(null), []);

  // ── Identity ────────────────────────────────────────
  const openName = useCallback(() => {
    setNameDraft(project?.name ?? '');
    setEditing('name');
  }, [project?.name]);

  const handleSaveName = useCallback(async () => {
    const name = nameDraft.trim();
    if (!name || savingName) return;
    if (name.length > 120) {
      addToast(t('settings.toast.nameTooLong'), 'error');
      return;
    }
    setSavingName(true);
    try {
      await patch({ name });
      mutateProject((p) => p ? { ...p, name } : p, { revalidate: false });
      closeEditor();
      addToast(t('settings.toast.nameUpdated'), 'success');
      refreshProjects?.();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('settings.toast.failed'), 'error');
    } finally {
      setSavingName(false);
    }
  }, [nameDraft, savingName, patch, addToast, refreshProjects, closeEditor, mutateProject, t]);

  const openDesc = useCallback(() => {
    setDescDraft(project?.description ?? '');
    setEditing('description');
  }, [project?.description]);

  const handleSaveDesc = useCallback(async () => {
    const desc = descDraft.trim();
    if (!desc || savingDesc) return;
    setSavingDesc(true);
    try {
      await patch({ description: desc });
      mutateProject((p) => p ? { ...p, description: desc } : p, { revalidate: false });
      closeEditor();
      addToast(t('settings.toast.descriptionUpdated'), 'success');
      refreshProjects?.();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('settings.toast.failed'), 'error');
    } finally {
      setSavingDesc(false);
    }
  }, [descDraft, savingDesc, patch, addToast, refreshProjects, closeEditor, mutateProject, t]);

  const openLogo = useCallback(() => {
    setLogoDraft(project?.logoUrl ?? '');
    setEditing('logo');
  }, [project?.logoUrl]);

  const handleSaveLogo = useCallback(async () => {
    if (savingLogo) return;
    setSavingLogo(true);
    try {
      await patch({ logoUrl: logoDraft.trim() || null });
      mutateProject((p) => p ? { ...p, logoUrl: logoDraft.trim() || undefined } : p, { revalidate: false });
      closeEditor();
      addToast(logoDraft.trim() ? t('settings.toast.logoUpdated') : t('settings.toast.logoCleared'), 'success');
      refreshProjects?.();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('settings.toast.failed'), 'error');
    } finally {
      setSavingLogo(false);
    }
  }, [logoDraft, savingLogo, patch, addToast, refreshProjects, closeEditor, mutateProject, t]);

  const handleAutoDetectLogo = useCallback(async () => {
    if (!projectId || autoDetecting) return;
    setAutoDetecting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/auto-detect-logo`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || t('settings.toast.detectionFailed'));
      }
      const data = await res.json();
      if (data.logoUrl) {
        mutateProject((p) => p ? { ...p, logoUrl: data.logoUrl } : p, { revalidate: false });
        setLogoDraft(data.logoUrl);
        addToast(t('settings.toast.logoDetected'), 'success');
        refreshProjects?.();
      } else {
        addToast(t('settings.toast.noLogoFound'), 'error');
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('settings.toast.detectionFailed'), 'error');
    } finally {
      setAutoDetecting(false);
    }
  }, [projectId, autoDetecting, addToast, refreshProjects, mutateProject, t]);

  // ── Sources ─────────────────────────────────────────
  const openGithub = useCallback(() => {
    setPathDraft(project?.githubUrl ?? '');
    setEditing('github');
  }, [project?.githubUrl]);

  const handleSavePath = useCallback(async () => {
    const path = pathDraft.trim();
    if (!path || savingPath) return;
    if (!path.startsWith('https://github.com/')) {
      addToast(t('settings.toast.githubOnly'), 'error');
      return;
    }
    setSavingPath(true);
    try {
      await patch({ path });
      mutateProject((p) => p ? { ...p, path, githubUrl: path, isGithub: true, sourceType: 'github' } : p, { revalidate: false });
      closeEditor();
      addToast(project?.githubUrl ? t('settings.toast.repoSwapped') : t('settings.toast.repoConnected'), 'success');
      refreshProjects?.();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('settings.toast.failed'), 'error');
    } finally {
      setSavingPath(false);
    }
  }, [pathDraft, savingPath, patch, addToast, refreshProjects, project?.githubUrl, closeEditor, mutateProject, t]);

  const openGa4 = useCallback(() => {
    setGa4Draft(project?.analyticsPropertyId ?? '');
    setEditing('analytics');
  }, [project?.analyticsPropertyId]);

  const handleSaveGa4 = useCallback(async () => {
    if (!projectId || savingGa4) return;
    const trimmed = ga4Draft.trim();
    if (trimmed && !/^\d+$/.test(trimmed)) {
      addToast(t('settings.toast.propertyNumeric'), 'error');
      return;
    }
    setSavingGa4(true);
    try {
      const res = await fetch('/api/analytics/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set_project_property', projectId, propertyId: trimmed || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || t('settings.toast.propertySaveFailed'));
      }
      mutateProject((p) => p ? { ...p, analyticsPropertyId: trimmed || undefined } : p, { revalidate: false });
      closeEditor();
      addToast(trimmed ? t('settings.toast.ga4Linked') : t('settings.toast.ga4Cleared'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('settings.toast.failed'), 'error');
    } finally {
      setSavingGa4(false);
    }
  }, [projectId, ga4Draft, savingGa4, addToast, closeEditor, mutateProject, t]);

  // ── Access ──────────────────────────────────────────
  const handleToggleShared = useCallback(async () => {
    if (!project || togglingShared) return;
    if (currentUserId && project.createdBy && project.createdBy !== currentUserId) return;
    const next = !(project.isShared ?? true);
    setTogglingShared(true);
    try {
      await patch({ isShared: next });
      mutateProject({ ...project, isShared: next }, { revalidate: false });
      addToast(next ? t('settings.toast.sharedWithTeam') : t('settings.toast.setToPrivate'), 'success');
      refreshProjects?.();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('settings.toast.failed'), 'error');
    } finally {
      setTogglingShared(false);
    }
  }, [project, togglingShared, patch, addToast, refreshProjects, currentUserId, mutateProject, t]);

  // ── Destroy ─────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!projectId || !teamId || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}?teamId=${teamId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || t('settings.toast.deleteFailed'));
      }
      addToast(t('settings.toast.deleted'), 'success');
      refreshProjects?.();
      router.push('/projects');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('settings.toast.deleteFailed'), 'error');
      setDeleting(false);
    }
  }, [projectId, teamId, deleting, addToast, refreshProjects, router, t]);

  // ── Derived ─────────────────────────────────────────
  const isCreator = !!currentUserId && !!project?.createdBy && project.createdBy === currentUserId;
  const sharingLocked = !!project?.createdBy && !isCreator;
  const isShared = project?.isShared !== false;
  const displayName = project?.name || project?.analysis?.name || t('settings.fallbackName');
  const lastAnalyzedAt = project?.analysis?.analyzedAt;
  const lastAnalyzedSha = project?.lastAnalyzedCommitSha;
  const websiteUrl = project?.analysis?.websiteUrl;
  const canAutoDetect = !!(project?.githubUrl || project?.analysis?.websiteUrl);
  const justNow = t('settings.justNow');
  const provisionedRel = project ? relativeTime(project.createdAt, justNow) : '';
  const initial = (displayName?.[0] ?? '?').toLocaleUpperCase('tr-TR');
  const sourceLabel = project?.sourceType && ['codebase', 'github', 'description'].includes(project.sourceType)
    ? t(`settings.sourceLabel.${project.sourceType}`)
    : (project?.sourceType ?? '');

  const creatorLabel = useMemo(() => {
    if (!project?.createdBy) return t('settings.creator.none');
    if (project.createdBy === currentUserId) return t('settings.creator.you');
    const m = members.find((mb) => mb.userId === project.createdBy);
    return m?.nickname || m?.email || t('settings.creator.teammate');
  }, [project?.createdBy, members, currentUserId, t]);

  // ── Render ──────────────────────────────────────────
  return (
    <div className="v2-pset">
      {/* Atmospheric backplate — quiet typographic grid */}
      <div className="v2-pset-grid" aria-hidden />

      {loading ? (
        <SpecSkeleton />
      ) : !project ? (
        <div className="glass-card is-static is-tight">
          <p style={{ color: 'var(--txt-muted)', margin: 0 }}>{t('settings.notFound')}</p>
        </div>
      ) : (
        <>
          {/* ─── Top eyebrow band (full-width) ─── */}
          <div className="v2-pset-band">
            <span className="recgon-label v2-pset-band-eye">{t('settings.band.prefix')} · {sourceLabel}</span>
            <span className="v2-pset-band-rule" aria-hidden />
            <span className="v2-pset-band-meta">
              <span>{t('settings.band.created', { time: provisionedRel })}</span>
              {lastAnalyzedAt && <><span className="v2-pset-band-dot" aria-hidden>·</span><span>{t('settings.band.analyzed', { time: relativeTime(lastAnalyzedAt, justNow) })}</span></>}
            </span>
          </div>

          <div className="v2-pset-shell">
            {/* ─── Left rail: identity + table-of-contents ─── */}
            <aside className="v2-pset-rail" aria-label={t('settings.navAria')}>
              <div className="v2-pset-rail-stick">
                <div className="v2-pset-id">
                  <h1 className="v2-pset-name">{displayName}</h1>
                  {project.description && (
                    <p className="v2-pset-tag-desc">{project.description}</p>
                  )}
                </div>

                <nav className="v2-pset-toc" aria-label={t('settings.sectionsAria')}>
                  {SECTIONS.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(s.id);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          setActiveSection(s.id);
                        }
                      }}
                      className={`v2-pset-toc-item ${activeSection === s.id ? 'is-active' : ''} ${s.id === 'sect-destroy' ? 'is-danger' : ''}`}
                    >
                      <span className="v2-pset-toc-num">{s.index}</span>
                      <span className="v2-pset-toc-label">{t(`settings.sections.${s.key}`)}</span>
                    </a>
                  ))}
                </nav>

                <div className="v2-pset-rail-foot">
                  <span className="v2-pset-rail-id">{t('settings.idLabel')}&nbsp;&nbsp;{projectId?.slice(0, 8) ?? '—'}</span>
                </div>
              </div>
            </aside>

            {/* ─── Right column: spec sheet ─── */}
            <main className="v2-pset-spec">
              {/* SECTION 00 — IDENTITY */}
              <Section
                ref={(el) => { sectionRefs.current['sect-identity'] = el; }}
                id="sect-identity"
                index="00"
                label={t('settings.identity.title')}
                hint={t('settings.identity.hint')}
                stagger={0}
              >
                {/* Logo field */}
                <Field
                  label={t('settings.identity.logoLabel')}
                  hint={t('settings.identity.logoHint')}
                  open={editing === 'logo'}
                  onOpen={openLogo}
                  onCancel={closeEditor}
                  actionLabel={tCommon('edit')}
                >
                  {editing === 'logo' ? (
                    <div className="v2-pset-edit">
                      <div className="v2-pset-logo-edit-row">
                        <div className="v2-pset-logo-prev">
                          {logoDraft.trim() ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoDraft.trim()} alt="" />
                          ) : project.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={project.logoUrl} alt="" />
                          ) : (
                            <span>{initial}</span>
                          )}
                        </div>
                        <input
                          type="url"
                          value={logoDraft}
                          onChange={(e) => setLogoDraft(e.target.value)}
                          placeholder={t('settings.identity.logoPlaceholder')}
                          className="v2-pset-input"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveLogo();
                            if (e.key === 'Escape') closeEditor();
                          }}
                        />
                      </div>
                      <FieldActions>
                        <button
                          type="button"
                          className="v2-pset-tiny"
                          onClick={handleAutoDetectLogo}
                          disabled={autoDetecting || !canAutoDetect}
                          title={canAutoDetect ? t('settings.identity.autoDetectTitleEnabled') : t('settings.identity.autoDetectTitleDisabled')}
                        >
                          {autoDetecting ? <><Spinner /> {t('settings.identity.autoDetect')}</> : t('settings.identity.autoDetect')}
                        </button>
                        <span style={{ flex: 1 }} />
                        {project.logoUrl && (
                          <button type="button" className="v2-pset-btn v2-pset-btn-danger-ghost" onClick={() => setLogoDraft('')} disabled={savingLogo}>{t('settings.identity.clear')}</button>
                        )}
                        <button type="button" className="v2-pset-btn v2-pset-btn-ghost" onClick={closeEditor} disabled={savingLogo}>{tCommon('cancel')}</button>
                        <button type="button" className="v2-pset-btn v2-pset-btn-primary" onClick={handleSaveLogo} disabled={savingLogo}>
                          {savingLogo ? <><Spinner /> {t('settings.identity.saving')}</> : tCommon('save')}
                        </button>
                      </FieldActions>
                    </div>
                  ) : (
                    <div className="v2-pset-val v2-pset-val-row">
                      <div className="v2-pset-logo-thumb">
                        {project.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={project.logoUrl} alt="" />
                        ) : (
                          <span>{initial}</span>
                        )}
                      </div>
                      <span className="v2-pset-val-meta">{project.logoUrl ? hostOnly(project.logoUrl) : t('settings.identity.noLogoSet')}</span>
                    </div>
                  )}
                </Field>

                {/* Name field */}
                <Field
                  label={t('settings.identity.nameLabel')}
                  hint={t('settings.identity.nameHint')}
                  open={editing === 'name'}
                  onOpen={openName}
                  onCancel={closeEditor}
                  actionLabel={tCommon('edit')}
                >
                  {editing === 'name' ? (
                    <div className="v2-pset-edit">
                      <input
                        type="text"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="v2-pset-input v2-pset-input-display"
                        placeholder={t('settings.identity.namePlaceholder')}
                        maxLength={120}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') closeEditor();
                        }}
                      />
                      <FieldActions>
                        <span className="v2-pset-count">{nameDraft.length} / 120</span>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="v2-pset-btn v2-pset-btn-ghost" onClick={closeEditor} disabled={savingName}>{tCommon('cancel')}</button>
                        <button type="button" className="v2-pset-btn v2-pset-btn-primary" onClick={handleSaveName} disabled={savingName || !nameDraft.trim()}>
                          {savingName ? <><Spinner /> {t('settings.identity.saving')}</> : tCommon('save')}
                        </button>
                      </FieldActions>
                    </div>
                  ) : (
                    <p className="v2-pset-val v2-pset-val-display">{project.name || <Empty>{t('settings.identity.untitled')}</Empty>}</p>
                  )}
                </Field>

                {/* Description field */}
                <Field
                  label={t('settings.identity.descriptionLabel')}
                  hint={t('settings.identity.descriptionHint')}
                  open={editing === 'description'}
                  onOpen={openDesc}
                  onCancel={closeEditor}
                  actionLabel={tCommon('edit')}
                >
                  {editing === 'description' ? (
                    <div className="v2-pset-edit">
                      <textarea
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        rows={6}
                        className="v2-pset-input v2-pset-textarea"
                        placeholder={t('settings.identity.descriptionPlaceholder')}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') closeEditor();
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveDesc();
                        }}
                      />
                      <FieldActions>
                        <span className="v2-pset-count">{t('settings.identity.cmdEnterSaves')}</span>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="v2-pset-btn v2-pset-btn-ghost" onClick={closeEditor} disabled={savingDesc}>{tCommon('cancel')}</button>
                        <button type="button" className="v2-pset-btn v2-pset-btn-primary" onClick={handleSaveDesc} disabled={savingDesc || !descDraft.trim()}>
                          {savingDesc ? <><Spinner /> {t('settings.identity.saving')}</> : tCommon('save')}
                        </button>
                      </FieldActions>
                    </div>
                  ) : (
                    <p className="v2-pset-val v2-pset-val-prose">{project.description || <Empty>{t('settings.identity.noDescription')}</Empty>}</p>
                  )}
                </Field>
              </Section>

              {/* SECTION 01 — SOURCES */}
              <Section
                ref={(el) => { sectionRefs.current['sect-sources'] = el; }}
                id="sect-sources"
                index="01"
                label={t('settings.sources.title')}
                hint={t('settings.sources.hint')}
                stagger={1}
              >
                {/* GitHub */}
                <Field
                  label={t('settings.sources.githubLabel')}
                  hint={t('settings.sources.githubHint')}
                  open={editing === 'github'}
                  onOpen={openGithub}
                  onCancel={closeEditor}
                  actionLabel={project.githubUrl ? t('settings.sources.change') : t('settings.sources.connect')}
                >
                  {editing === 'github' ? (
                    <div className="v2-pset-edit">
                      <input
                        type="url"
                        value={pathDraft}
                        onChange={(e) => setPathDraft(e.target.value)}
                        placeholder={t('settings.sources.githubPlaceholder')}
                        className="v2-pset-input"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSavePath();
                          if (e.key === 'Escape') closeEditor();
                        }}
                      />
                      <FieldActions>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="v2-pset-btn v2-pset-btn-ghost" onClick={closeEditor} disabled={savingPath}>{tCommon('cancel')}</button>
                        <button type="button" className="v2-pset-btn v2-pset-btn-primary" onClick={handleSavePath} disabled={savingPath || !pathDraft.trim()}>
                          {savingPath ? <><Spinner /> {t('settings.sources.cloning')}</> : tCommon('save')}
                        </button>
                      </FieldActions>
                    </div>
                  ) : project.githubUrl ? (
                    <div className="v2-pset-val v2-pset-val-stack">
                      <a href={project.githubUrl} target="_blank" rel="noreferrer" className="v2-pset-anchor">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.43-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
                        <code>{githubLabel(project.githubUrl)}</code>
                        <span className="v2-pset-arrow" aria-hidden>↗</span>
                      </a>
                      {lastAnalyzedSha && (
                        <div className="v2-pset-meta-row">
                          <span className="v2-pset-meta-key">{t('settings.sources.lastAnalyzed')}</span>
                          <code className="v2-pset-mono">{shortSha(lastAnalyzedSha)}</code>
                          {lastAnalyzedAt && <span className="v2-pset-meta-key">{t('settings.sources.agoSuffix', { time: relativeTime(lastAnalyzedAt, justNow) })}</span>}
                          <span style={{ flex: 1 }} />
                          <Link href={`/projects/${projectId}`} className="v2-pset-tiny v2-pset-tiny-link">
                            {t('settings.sources.reAnalyze')} <span aria-hidden>→</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="v2-pset-val v2-pset-val-empty">{t('settings.sources.noRepo')}</p>
                  )}
                </Field>

                {/* Website (read-only) */}
                <Field
                  label={t('settings.sources.websiteLabel')}
                  hint={t('settings.sources.websiteHint')}
                  open={false}
                  readOnly
                >
                  {websiteUrl ? (
                    <a href={websiteUrl} target="_blank" rel="noreferrer" className="v2-pset-anchor v2-pset-val">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
                      <code>{hostOnly(websiteUrl)}</code>
                      <span className="v2-pset-arrow" aria-hidden>↗</span>
                    </a>
                  ) : (
                    <p className="v2-pset-val v2-pset-val-empty">{t('settings.sources.noWebsite')}</p>
                  )}
                </Field>

                {/* Analytics */}
                <Field
                  label={t('settings.sources.analyticsLabel')}
                  hint={t('settings.sources.analyticsHint')}
                  open={editing === 'analytics'}
                  onOpen={openGa4}
                  onCancel={closeEditor}
                  actionLabel={project.analyticsPropertyId ? t('settings.sources.edit') : t('settings.sources.link')}
                >
                  {editing === 'analytics' ? (
                    <div className="v2-pset-edit">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={ga4Draft}
                        onChange={(e) => setGa4Draft(e.target.value)}
                        placeholder={t('settings.sources.ga4Placeholder')}
                        className="v2-pset-input"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveGa4();
                          if (e.key === 'Escape') closeEditor();
                        }}
                      />
                      <FieldActions>
                        {project.analyticsPropertyId && (
                          <button type="button" className="v2-pset-btn v2-pset-btn-danger-ghost" onClick={() => setGa4Draft('')} disabled={savingGa4}>{t('settings.sources.unlink')}</button>
                        )}
                        <span style={{ flex: 1 }} />
                        <button type="button" className="v2-pset-btn v2-pset-btn-ghost" onClick={closeEditor} disabled={savingGa4}>{tCommon('cancel')}</button>
                        <button type="button" className="v2-pset-btn v2-pset-btn-primary" onClick={handleSaveGa4} disabled={savingGa4}>
                          {savingGa4 ? <><Spinner /> {t('settings.identity.saving')}</> : tCommon('save')}
                        </button>
                      </FieldActions>
                    </div>
                  ) : project.analyticsPropertyId ? (
                    <div className="v2-pset-val v2-pset-val-stack">
                      <code className="v2-pset-mono v2-pset-mono-lg">{project.analyticsPropertyId}</code>
                      <span className="v2-pset-meta-key">{t('settings.sources.findUnderGa4')}</span>
                    </div>
                  ) : (
                    <p className="v2-pset-val v2-pset-val-empty">{t('settings.sources.noGa4')}</p>
                  )}
                </Field>
              </Section>

              {/* SECTION 02 — ACCESS */}
              <Section
                ref={(el) => { sectionRefs.current['sect-access'] = el; }}
                id="sect-access"
                index="02"
                label={t('settings.access.title')}
                hint={t('settings.access.hint')}
                stagger={2}
              >
                <Field
                  label={t('settings.access.visibilityLabel')}
                  hint={sharingLocked ? t('settings.access.lockedHint') : (isShared ? t('settings.access.sharedHint') : t('settings.access.privateHint'))}
                  open={false}
                  readOnly
                >
                  <div
                    role="radiogroup"
                    aria-label={t('settings.access.visibilityAria')}
                    className={`v2-pset-toggle ${sharingLocked ? 'is-locked' : ''}`}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isShared}
                      className={`v2-pset-toggle-cell ${isShared ? 'is-on' : ''}`}
                      onClick={() => { if (!isShared && !togglingShared && !sharingLocked) handleToggleShared(); }}
                      disabled={togglingShared || sharingLocked}
                    >
                      <span className="v2-pset-toggle-dot" aria-hidden />
                      <span>{t('settings.access.team')}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!isShared}
                      className={`v2-pset-toggle-cell ${!isShared ? 'is-on' : ''}`}
                      onClick={() => { if (isShared && !togglingShared && !sharingLocked) handleToggleShared(); }}
                      disabled={togglingShared || sharingLocked}
                    >
                      <span className="v2-pset-toggle-dot" aria-hidden />
                      <span>{t('settings.access.private')}</span>
                    </button>
                  </div>
                </Field>

                <Field
                  label={t('settings.access.createdByLabel')}
                  hint={t('settings.access.createdByHint')}
                  open={false}
                  readOnly
                >
                  <p className="v2-pset-val">{creatorLabel}</p>
                </Field>
              </Section>

              {/* SECTION X — DESTROY */}
              <section
                ref={(el) => { sectionRefs.current['sect-destroy'] = el; }}
                id="sect-destroy"
                className={`v2-pset-section v2-pset-destroy ${confirmDelete ? 'is-armed' : ''}`}
                style={{ ['--v2-pset-stagger' as string]: '3' }}
              >
                <header className="v2-pset-section-head">
                  <span className="v2-pset-section-num">X</span>
                  <span className="v2-pset-section-label">{t('settings.destroy.title')}</span>
                  <span className="v2-pset-section-rule" aria-hidden />
                  <span className="v2-pset-section-hint">{t('settings.destroy.hint')}</span>
                </header>
                <div className="v2-pset-section-body">
                  <p className="v2-pset-destroy-text">
                    {t('settings.destroy.text')}
                  </p>
                  <div className="v2-pset-destroy-actions">
                    {!confirmDelete ? (
                      <button type="button" className="v2-pset-btn v2-pset-btn-danger-ghost" onClick={() => setConfirmDelete(true)}>
                        {t('settings.destroy.deleteProject')}
                      </button>
                    ) : (
                      <>
                        <span className="v2-pset-destroy-confirm">{t('settings.destroy.areYouSure')}</span>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="v2-pset-btn v2-pset-btn-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                          {tCommon('cancel')}
                        </button>
                        <button type="button" className="v2-pset-btn v2-pset-btn-danger" onClick={handleDelete} disabled={deleting}>
                          {deleting ? <><Spinner /> {t('settings.destroy.deleting')}</> : t('settings.destroy.confirmDestroy')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </main>
          </div>
        </>
      )}

      <style>{styles}</style>
    </div>
  );
}

/* ──────────────── Section ──────────────── */
type SectionProps = {
  id: string;
  index: string;
  label: string;
  hint?: string;
  stagger?: number;
  children: React.ReactNode;
};
const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { id, index, label, hint, stagger = 0, children },
  ref,
) {
  return (
    <section
      ref={ref}
      id={id}
      className="glass-card is-static v2-pset-section"
      style={{ ['--v2-pset-stagger' as string]: String(stagger) }}
    >
      <header className="v2-pset-section-head">
        <span className="v2-pset-section-num">{index}</span>
        <span className="v2-pset-section-label">{label}</span>
        <span className="v2-pset-section-rule" aria-hidden />
        {hint && <span className="v2-pset-section-hint">{hint}</span>}
      </header>
      <div className="v2-pset-section-body">{children}</div>
    </section>
  );
});

/* ──────────────── Field ──────────────── */
function Field({
  label,
  hint,
  open,
  onOpen,
  onCancel: _onCancel,
  actionLabel = 'edit',
  readOnly = false,
  children,
}: {
  label: string;
  hint?: string;
  open?: boolean;
  onOpen?: () => void;
  onCancel?: () => void;
  actionLabel?: string;
  readOnly?: boolean;
  children: React.ReactNode;
}) {
  const interactive = !readOnly && !open && !!onOpen;
  return (
    <div
      className={`v2-pset-field ${open ? 'is-editing' : ''} ${interactive ? 'is-interactive' : ''} ${readOnly ? 'is-readonly' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onOpen : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(); } } : undefined}
    >
      <div className="v2-pset-field-head">
        <span className="v2-pset-field-label">{label}</span>
        {hint && <span className="v2-pset-field-hint">{hint}</span>}
        {interactive && (
          <span className="v2-pset-field-action">
            <span aria-hidden>→</span> {actionLabel}
          </span>
        )}
      </div>
      <div className="v2-pset-field-body">{children}</div>
    </div>
  );
}

function FieldActions({ children }: { children: React.ReactNode }) {
  return <div className="v2-pset-actions">{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="v2-pset-empty">— {children} —</span>;
}

function Spinner() {
  return <span className="v2-pset-spinner" aria-hidden />;
}

/* ──────────────── Skeleton ──────────────── */
function SpecSkeleton() {
  return (
    <div className="v2-pset-skel">
      <div className="v2-pset-skel-bar" style={{ width: '20%', height: 11 }} />
      <div className="glass-card is-static v2-pset-skel-card">
        <div className="v2-pset-skel-bar" style={{ width: '32%' }} />
        <div className="v2-pset-skel-bar" style={{ width: '70%' }} />
        <div className="v2-pset-skel-bar" style={{ width: '54%' }} />
        <div className="v2-pset-skel-bar" style={{ width: '60%' }} />
      </div>
    </div>
  );
}

/* ──────────────── Styles ──────────────── */
const styles = `
  /* ═════ Page shell ═════ */
  .v2-pset {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-bottom: 80px;
    min-height: 70vh;
    animation: v2psetFade 540ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes v2psetFade {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: none; }
  }
  /* Atmospheric backplate — quiet 24px grid of pin-prick dots,
     evokes a printed spec-sheet. Dots use --rule (theme-aware). */
  .v2-pset-grid {
    position: absolute;
    inset: -40px -40px 0 -40px;
    background-image: radial-gradient(circle at 1px 1px, var(--rule, rgba(255,255,255,0.06)) 1px, transparent 0);
    background-size: 24px 24px;
    background-position: -1px -1px;
    pointer-events: none;
    opacity: 0.55;
    mask-image: linear-gradient(to bottom, transparent 0, black 80px, black calc(100% - 200px), transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 80px, black calc(100% - 200px), transparent 100%);
    z-index: 0;
  }
  .v2-pset > * { position: relative; z-index: 1; }

  /* ═════ Skeleton ═════ */
  .v2-pset-skel { display: flex; flex-direction: column; gap: 14px; }
  .v2-pset-skel-card { display: flex; flex-direction: column; gap: 14px; padding: 24px; }
  .v2-pset-skel-bar {
    height: 14px;
    background: rgba(var(--signature-rgb), 0.06);
    border-radius: 6px;
    animation: v2psetSkel 1.6s ease-in-out infinite;
  }
  @keyframes v2psetSkel {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 0.9; }
  }

  /* ═════ Top eyebrow band ═════ */
  .v2-pset-band {
    display: flex; align-items: center; gap: 14px;
    padding: 0 4px;
    animation: v2psetBand 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 40ms;
  }
  @keyframes v2psetBand {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: none; }
  }
  .v2-pset-band-eye {
    margin: 0;
    color: var(--signature);
    font-size: 11px;
    letter-spacing: 1.2px;
    flex-shrink: 0;
  }
  .v2-pset-band-rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, var(--rule), transparent 80%);
  }
  .v2-pset-band-meta {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    color: var(--txt-faint);
    letter-spacing: 0.4px;
    text-transform: lowercase;
  }
  .v2-pset-band-dot { color: var(--rule-strong, var(--rule)); }

  /* ═════ Two-column shell ═════
     No align-items override — grid items stretch to row height by default,
     which is what sticky needs (the rail's containing block must be taller
     than the sticky child for it to actually stick). */
  .v2-pset-shell {
    display: grid;
    grid-template-columns: 268px 1fr;
    gap: 36px;
  }
  @media (max-width: 1100px) {
    .v2-pset-shell { grid-template-columns: 232px 1fr; gap: 28px; }
  }
  @media (max-width: 880px) {
    .v2-pset-shell { grid-template-columns: 1fr; gap: 22px; }
  }

  /* ═════ Left rail ═════ */
  .v2-pset-rail {
    animation: v2psetRail 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 80ms;
  }
  @keyframes v2psetRail {
    from { opacity: 0; transform: translateX(-12px); }
    to   { opacity: 1; transform: none; }
  }
  .v2-pset-rail-stick {
    position: sticky;
    top: 96px;
    display: flex; flex-direction: column;
    gap: 22px;
    padding: 4px;
  }
  @media (max-width: 880px) {
    .v2-pset-rail-stick { position: static; padding: 0; }
  }

  /* Identity block */
  .v2-pset-id { display: flex; flex-direction: column; gap: 6px; }
  .v2-pset-name {
    font-size: 28px; font-weight: 600;
    letter-spacing: -0.022em;
    line-height: 1.05;
    color: var(--txt-pure);
    margin: 0;
    word-break: break-word;
  }
  .v2-pset-tag-desc {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--txt-muted);
    margin: 4px 0 0;
    letter-spacing: -0.005em;
    /* clamp to 3 lines */
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* TOC */
  .v2-pset-toc {
    display: flex; flex-direction: column; gap: 0;
    border-top: 1px solid var(--rule);
    padding-top: 18px;
    margin-top: 4px;
  }
  .v2-pset-toc-item {
    position: relative;
    display: grid;
    grid-template-columns: 32px 1fr;
    align-items: baseline;
    gap: 14px;
    padding: 9px 4px 9px 12px;
    color: var(--txt-faint);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11.5px;
    text-decoration: none;
    text-transform: lowercase;
    letter-spacing: 0.4px;
    transition: color 220ms ease, padding-left 280ms cubic-bezier(0.16, 1, 0.3, 1);
    border-left: 2px solid transparent;
  }
  .v2-pset-toc-num {
    font-weight: 700;
    font-size: 11px;
    color: var(--txt-faint);
    transition: color 220ms ease;
  }
  .v2-pset-toc-label { color: inherit; transition: color 220ms ease; }
  .v2-pset-toc-item:hover {
    color: var(--txt-pure);
  }
  .v2-pset-toc-item:hover .v2-pset-toc-num { color: var(--signature); }
  .v2-pset-toc-item.is-active {
    color: var(--txt-pure);
    border-left-color: var(--signature);
  }
  .v2-pset-toc-item.is-active .v2-pset-toc-num { color: var(--signature); }
  .v2-pset-toc-item.is-danger { color: var(--txt-faint); }
  .v2-pset-toc-item.is-danger:hover { color: var(--danger); }
  .v2-pset-toc-item.is-danger:hover .v2-pset-toc-num { color: var(--danger); }
  .v2-pset-toc-item.is-danger.is-active {
    color: var(--danger);
    border-left-color: var(--danger);
  }
  .v2-pset-toc-item.is-danger.is-active .v2-pset-toc-num { color: var(--danger); }

  /* Rail foot */
  .v2-pset-rail-foot {
    margin-top: 4px;
    border-top: 1px solid var(--rule);
    padding-top: 12px;
  }
  .v2-pset-rail-id {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    color: var(--txt-faint);
    letter-spacing: 1px;
    text-transform: uppercase;
    opacity: 0.7;
  }

  /* ═════ Right column — spec sheet ═════ */
  .v2-pset-spec {
    display: flex; flex-direction: column;
    gap: 18px;
  }

  /* Section card */
  .v2-pset-section {
    padding: 0;
    overflow: hidden;
    --v2-pset-stagger: 0;
    animation: v2psetSection 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(140ms + (var(--v2-pset-stagger) * 70ms));
  }
  @keyframes v2psetSection {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: none; }
  }

  /* Section header — typographic anchor */
  .v2-pset-section-head {
    display: flex; align-items: baseline; gap: 14px;
    padding: 22px 28px 14px;
    border-bottom: 1px solid var(--rule);
  }
  .v2-pset-section-num {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--signature);
    padding: 3px 8px;
    border: 1px solid rgba(var(--signature-rgb), 0.30);
    background: rgba(var(--signature-rgb), 0.06);
    border-radius: 4px;
    flex-shrink: 0;
  }
  .v2-pset-section-label {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.6px;
    color: var(--txt-pure);
    flex-shrink: 0;
  }
  .v2-pset-section-rule {
    flex: 1;
    height: 1px;
    background:
      linear-gradient(to right, var(--rule) 0, var(--rule) 60%, transparent 100%),
      repeating-linear-gradient(to right, var(--rule) 0 4px, transparent 4px 8px);
    background-blend-mode: normal;
    align-self: center;
    opacity: 0.6;
  }
  .v2-pset-section-hint {
    font-size: 11.5px;
    color: var(--txt-faint);
    letter-spacing: 0.05px;
    flex-shrink: 0;
  }
  .v2-pset-section-body { display: flex; flex-direction: column; }

  /* ═════ Field row ═════ */
  .v2-pset-field {
    position: relative;
    display: grid;
    grid-template-columns: 168px 1fr;
    gap: 28px;
    padding: 18px 28px;
    border-bottom: 1px solid var(--rule);
    transition: background 220ms ease, padding-left 240ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .v2-pset-field:last-child { border-bottom: none; }
  .v2-pset-field::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 2px;
    background: var(--signature);
    transform: scaleY(0);
    transform-origin: top center;
    transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .v2-pset-field.is-editing::before { transform: scaleY(1); }
  .v2-pset-field.is-editing {
    background: rgba(var(--signature-rgb), 0.025);
    padding-left: 32px;
  }
  .v2-pset-field.is-interactive {
    cursor: pointer;
  }
  .v2-pset-field.is-interactive:hover {
    background: rgba(var(--signature-rgb), 0.018);
  }
  .v2-pset-field.is-interactive:hover .v2-pset-field-action {
    opacity: 1;
    transform: translateX(0);
  }
  .v2-pset-field.is-interactive:focus-visible {
    outline: none;
    background: rgba(var(--signature-rgb), 0.04);
    box-shadow: inset 2px 0 0 var(--signature);
  }
  @media (max-width: 720px) {
    .v2-pset-field {
      grid-template-columns: 1fr;
      gap: 6px;
      padding: 16px 20px;
    }
    .v2-pset-field.is-editing { padding-left: 24px; }
  }

  .v2-pset-field-head {
    display: flex; flex-direction: column; gap: 4px;
    min-width: 0;
  }
  .v2-pset-field-label {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.4px;
    color: var(--txt-pure);
    margin: 4px 0 0;
  }
  .v2-pset-field-hint {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--txt-faint);
    letter-spacing: 0.05px;
    max-width: 24ch;
  }
  .v2-pset-field-action {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--signature);
    letter-spacing: 0.5px;
    text-transform: lowercase;
    margin-top: 2px;
    opacity: 0;
    transform: translateX(-3px);
    transition: opacity 200ms ease, transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .v2-pset-field.is-editing .v2-pset-field-action { display: none; }

  .v2-pset-field-body { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .v2-pset-field-body.is-editing { gap: 12px; }

  /* ═════ Value styles ═════ */
  .v2-pset-val {
    margin: 0;
    font-size: 14.5px;
    line-height: 1.55;
    color: var(--txt-pure);
    letter-spacing: -0.005em;
    word-break: break-word;
  }
  .v2-pset-val-display {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .v2-pset-val-prose {
    padding-left: 12px;
    border-left: 2px solid rgba(var(--signature-rgb), 0.25);
    font-size: 14px;
    line-height: 1.7;
    color: var(--txt-pure);
    max-width: 56ch;
    white-space: pre-wrap;
  }
  .v2-pset-val-row { display: flex; align-items: center; gap: 14px; }
  .v2-pset-val-stack { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .v2-pset-val-empty {
    color: var(--txt-faint);
    font-size: 13px;
    line-height: 1.55;
    max-width: 60ch;
  }
  .v2-pset-val-meta { color: var(--txt-faint); font-size: 12px; }
  .v2-pset-empty { color: var(--txt-faint); font-style: italic; font-size: 14.5px; }

  /* Logo thumb (display) — matches the big rail mark: flat tint, hairline border. */
  .v2-pset-logo-thumb {
    width: 44px; height: 44px;
    border-radius: 10px;
    background: rgba(var(--signature-rgb), 0.05);
    border: 1px solid var(--rule);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .v2-pset-logo-thumb img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
  .v2-pset-logo-thumb span {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 18px; font-weight: 700;
    color: var(--signature);
  }

  /* Logo edit row */
  .v2-pset-logo-edit-row { display: flex; gap: 12px; align-items: center; }
  .v2-pset-logo-prev {
    width: 56px; height: 56px;
    border-radius: 12px;
    border: 1px solid rgba(var(--signature-rgb), 0.22);
    background: rgba(var(--signature-rgb), 0.04);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .v2-pset-logo-prev img { width: 100%; height: 100%; object-fit: contain; padding: 8px; }
  .v2-pset-logo-prev span {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 22px; font-weight: 700;
    color: var(--signature);
  }

  /* External link chip */
  .v2-pset-anchor {
    display: inline-flex; align-items: center; gap: 8px;
    color: var(--txt-pure);
    text-decoration: none;
    padding: 6px 11px 6px 9px;
    border: 1px solid var(--rule);
    border-radius: 7px;
    background: rgba(var(--signature-rgb), 0.020);
    font-size: 13px;
    transition: border-color 200ms ease, color 200ms ease, transform 200ms cubic-bezier(0.16, 1, 0.3, 1), background 200ms ease;
    align-self: flex-start;
    width: fit-content;
  }
  .v2-pset-anchor code {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12.5px;
  }
  .v2-pset-anchor:hover {
    border-color: rgba(var(--signature-rgb), 0.50);
    color: var(--signature);
    background: rgba(var(--signature-rgb), 0.06);
    transform: translateY(-1px);
  }
  .v2-pset-anchor svg { opacity: 0.7; }
  .v2-pset-arrow { color: var(--signature); font-weight: 600; }

  /* Meta row + mono code */
  .v2-pset-meta-row {
    display: inline-flex; align-items: center; gap: 8px;
    width: 100%;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    color: var(--txt-faint);
    letter-spacing: 0.3px;
  }
  .v2-pset-meta-key { color: var(--txt-faint); }
  .v2-pset-mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11.5px;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--rule);
    background: rgba(var(--signature-rgb), 0.030);
    color: var(--txt-pure);
  }
  .v2-pset-mono-lg { font-size: 13px; padding: 4px 10px; align-self: flex-start; }

  /* ═════ Toggle (visibility) ═════ */
  .v2-pset-toggle {
    display: inline-flex;
    border: 1px solid var(--rule);
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
    align-self: flex-start;
    background: rgba(var(--signature-rgb), 0.020);
    transition: border-color 200ms ease;
  }
  .v2-pset-toggle:hover:not(.is-locked) { border-color: rgba(var(--signature-rgb), 0.40); }
  .v2-pset-toggle-cell {
    background: transparent;
    border: none;
    padding: 7px 14px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    color: var(--txt-faint);
    cursor: pointer;
    border-radius: 5px;
    display: inline-flex; align-items: center; gap: 8px;
    transition: background 220ms ease, color 220ms ease;
  }
  .v2-pset-toggle-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.35;
    transition: opacity 220ms ease, box-shadow 220ms ease, background 220ms ease;
  }
  .v2-pset-toggle-cell.is-on {
    background: rgba(var(--signature-rgb), 0.14);
    color: var(--signature);
  }
  .v2-pset-toggle-cell.is-on .v2-pset-toggle-dot {
    opacity: 1;
    box-shadow: 0 0 6px var(--signature);
  }
  .v2-pset-toggle-cell:hover:not(:disabled):not(.is-on) { color: var(--txt-pure); }
  .v2-pset-toggle.is-locked { opacity: 0.55; }
  .v2-pset-toggle.is-locked .v2-pset-toggle-cell { cursor: not-allowed; }

  /* ═════ Edit container ═════ */
  .v2-pset-edit { display: flex; flex-direction: column; gap: 12px; }

  /* ═════ Inputs ═════ */
  .v2-pset-input {
    padding: 10px 14px;
    background: rgba(var(--signature-rgb), 0.020);
    border: 1px solid var(--rule);
    border-radius: 8px;
    color: var(--txt-pure);
    font-family: inherit;
    font-size: 13.5px;
    outline: none;
    width: 100%;
    transition: border-color 200ms ease, background 200ms ease;
  }
  .v2-pset-input:focus {
    border-color: rgba(var(--signature-rgb), 0.50);
    background: rgba(var(--signature-rgb), 0.045);
  }
  .v2-pset-input::placeholder { color: var(--txt-faint); }
  .v2-pset-input-display {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.015em;
    padding: 12px 14px;
  }
  .v2-pset-textarea {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12.5px;
    line-height: 1.65;
    resize: vertical;
  }
  .v2-pset-count {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: var(--txt-faint);
    letter-spacing: 0.5px;
    text-transform: lowercase;
  }

  /* ═════ Actions row ═════ */
  .v2-pset-actions {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    padding-top: 4px;
  }

  /* ═════ Buttons ═════ */
  .v2-pset-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 16px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    cursor: pointer; text-decoration: none;
    border: 1px solid;
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms ease, background 200ms ease, border-color 200ms ease, color 200ms ease;
  }
  .v2-pset-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
  .v2-pset-btn-primary { background: var(--signature); border-color: var(--signature); color: #fff; }
  .v2-pset-btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px -8px rgba(var(--signature-rgb), 0.55);
  }
  .v2-pset-btn-ghost { background: transparent; border-color: var(--rule); color: var(--txt-muted); }
  .v2-pset-btn-ghost:hover:not(:disabled) { color: var(--txt-pure); border-color: var(--rule-strong, var(--rule)); }
  .v2-pset-btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }
  .v2-pset-btn-danger:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 12px 26px -10px rgba(255, 59, 48, 0.55);
  }
  .v2-pset-btn-danger-ghost { background: transparent; border-color: rgba(255, 59, 48, 0.40); color: var(--danger); }
  .v2-pset-btn-danger-ghost:hover:not(:disabled) { background: rgba(255, 59, 48, 0.08); }

  .v2-pset-tiny {
    background: transparent;
    border: 1px solid var(--rule);
    color: var(--txt-muted);
    padding: 5px 11px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: lowercase;
    cursor: pointer; text-decoration: none;
    display: inline-flex; align-items: center; gap: 5px;
    transition: color 180ms ease, border-color 180ms ease, background 180ms ease;
  }
  .v2-pset-tiny:hover:not(:disabled) {
    color: var(--signature);
    border-color: rgba(var(--signature-rgb), 0.42);
    background: rgba(var(--signature-rgb), 0.05);
  }
  .v2-pset-tiny:disabled { opacity: 0.4; cursor: not-allowed; }
  .v2-pset-tiny-link { /* Link variant — no native button styles */ }

  .v2-pset-spinner {
    width: 10px; height: 10px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    opacity: 0.6;
    animation: v2psetSpin 700ms linear infinite;
    display: inline-block;
  }
  @keyframes v2psetSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  /* ═════ Destroy section ═════ */
  .v2-pset-destroy {
    background:
      var(--bg-content) padding-box,
      linear-gradient(135deg,
        rgba(255, 59, 48, 0.30) 0%,
        rgba(255, 59, 48, 0.06) 50%,
        rgba(255, 59, 48, 0.18) 100%) border-box !important;
    transition: box-shadow 280ms ease, transform 280ms ease;
  }
  .v2-pset-destroy.is-armed {
    box-shadow:
      0 0 0 1px rgba(255, 59, 48, 0.50),
      0 18px 40px -16px rgba(255, 59, 48, 0.30) !important;
  }
  .v2-pset-destroy .v2-pset-section-num {
    background: rgba(255, 59, 48, 0.08);
    border-color: rgba(255, 59, 48, 0.40);
    color: var(--danger);
  }
  .v2-pset-destroy .v2-pset-section-rule {
    background:
      repeating-linear-gradient(to right, rgba(255, 59, 48, 0.30) 0 4px, transparent 4px 8px);
  }
  .v2-pset-destroy-text {
    margin: 0 0 14px;
    padding: 18px 28px 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--txt-muted);
    max-width: 60ch;
  }
  .v2-pset-destroy-actions {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    padding: 0 28px 22px;
  }
  .v2-pset-destroy-confirm {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    font-weight: 600;
    text-transform: lowercase;
    letter-spacing: 0.5px;
    color: var(--danger);
  }

  /* ═════ Light-mode pass ═════ */
  html.light .v2-pset-grid,
  .light .v2-pset-grid {
    background-image: radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.10) 1px, transparent 0);
    opacity: 0.42;
  }
  html.light .v2-pset-input,
  .light .v2-pset-input {
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(0, 0, 0, 0.10);
  }
  html.light .v2-pset-input:focus,
  .light .v2-pset-input:focus {
    background: rgba(255, 255, 255, 0.96);
    border-color: rgba(var(--signature-rgb), 0.5);
  }
  html.light .v2-pset-mono,
  .light .v2-pset-mono {
    background: rgba(20, 14, 30, 0.04);
    border-color: rgba(0, 0, 0, 0.08);
  }
  html.light .v2-pset-anchor,
  .light .v2-pset-anchor {
    background: rgba(20, 14, 30, 0.025);
    border-color: rgba(0, 0, 0, 0.08);
  }
  html.light .v2-pset-toggle,
  .light .v2-pset-toggle {
    background: rgba(20, 14, 30, 0.025);
    border-color: rgba(0, 0, 0, 0.10);
  }
  html.light .v2-pset-tiny,
  .light .v2-pset-tiny {
    background: rgba(20, 14, 30, 0.025);
  }
  html.light .v2-pset-toc-item,
  .light .v2-pset-toc-item {
    color: #6e6b76;
  }
  html.light .v2-pset-toc-item:hover,
  .light .v2-pset-toc-item:hover {
    color: #1d1d1f;
  }
  html.light .v2-pset-section-rule,
  .light .v2-pset-section-rule {
    background:
      repeating-linear-gradient(to right, rgba(0, 0, 0, 0.10) 0 4px, transparent 4px 8px);
  }
  html.light .v2-pset-field.is-editing,
  .light .v2-pset-field.is-editing {
    background: rgba(var(--signature-rgb), 0.045);
  }
  html.light .v2-pset-field.is-interactive:hover,
  .light .v2-pset-field.is-interactive:hover {
    background: rgba(var(--signature-rgb), 0.030);
  }
`;
