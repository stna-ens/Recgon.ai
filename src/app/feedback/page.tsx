'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import FeedbackPanel from '@/components/FeedbackPanel';
import Select from '@/components/Select';
import { useTeam } from '@/components/TeamProvider';
import { buildFeedbackRunLabel } from '@/lib/feedbackContent';
import {
  SOURCE_PLATFORM_OPTIONS,
  dedupeSourceProfiles,
  getFeedbackPlatformAvailability,
  getSourceMeta,
  isFeedbackSupportedSource,
  type SourceProfile,
} from '@/lib/sourceProfiles';

interface FeedbackResult {
  overallSentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  summary: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
}

interface SavedAnalysis {
  id: string;
  rawFeedback: string[];
  sentiment: string;
  summary?: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
  analyzedAt: string;
}

interface Project {
  id: string;
  name: string;
  analysis?: {
    name: string;
    description: string;
  };
  socialProfiles?: SourceProfile[];
  feedbackAnalyses?: SavedAnalysis[];
}

interface DiscoveredSource extends SourceProfile {
  origin: 'readme' | 'description' | 'analysis';
}

interface SourceSummary {
  platform: string;
  url: string;
  status: 'collected' | 'empty' | 'failed' | 'blocked' | 'coming_soon';
  feedbackCount: number;
  message: string;
}

interface DisplayedAnalysis {
  sentiment: string;
  summary?: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
  rawFeedbackCount: number;
  analyzedAt?: string;
  saved: boolean;
  label?: string;
}

interface CollectResponse {
  status: 'completed' | 'queued' | 'not_modified' | 'empty';
  result: FeedbackResult | null;
  message: string;
  rawFeedbackCount: number;
  sourceSummaries: SourceSummary[];
  warnings: string[];
  saved?: boolean;
  jobId?: string;
}

interface AnalyzeResponse extends FeedbackResult {
  status?: 'queued';
  jobId?: string;
  message?: string;
}

const STALE_MS = 12 * 60 * 60 * 1000;
const DRAWER_EXIT_MS = 340;
type FeedbackDrawerKind = 'manual' | 'sources' | 'history';

function formatDate(iso?: string) {
  if (!iso) return 'Not yet analyzed';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isStale(iso?: string) {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() >= STALE_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDisplayedAnalysis(result: FeedbackResult, rawFeedbackCount: number, saved: boolean, analyzedAt?: string, label?: string): DisplayedAnalysis {
  return {
    sentiment: result.overallSentiment,
    summary: result.summary,
    sentimentBreakdown: result.sentimentBreakdown,
    themes: result.themes,
    featureRequests: result.featureRequests,
    bugs: result.bugs,
    praises: result.praises,
    developerPrompts: result.developerPrompts,
    rawFeedbackCount,
    analyzedAt,
    saved,
    label,
  };
}

function fromSavedAnalysis(entry: SavedAnalysis): DisplayedAnalysis {
  return {
    sentiment: entry.sentiment,
    summary: entry.summary,
    sentimentBreakdown: entry.sentimentBreakdown,
    themes: entry.themes,
    featureRequests: entry.featureRequests,
    bugs: entry.bugs,
    praises: entry.praises,
    developerPrompts: entry.developerPrompts,
    rawFeedbackCount: entry.rawFeedback.length,
    analyzedAt: entry.analyzedAt,
    saved: true,
  };
}

function Banner({
  tone,
  message,
  onDismiss,
}: {
  tone: 'info' | 'success' | 'warning' | 'danger';
  message: string;
  onDismiss?: () => void;
}) {
  const toneStyles = {
    info: {
      color: 'var(--signature)',
      borderColor: 'rgba(var(--signature-rgb), 0.26)',
      background: 'rgba(var(--signature-rgb), 0.08)',
    },
    success: {
      color: 'var(--success)',
      borderColor: 'rgba(52, 199, 89, 0.28)',
      background: 'rgba(52, 199, 89, 0.1)',
    },
    warning: {
      color: 'var(--warning)',
      borderColor: 'rgba(255, 159, 10, 0.28)',
      background: 'rgba(255, 159, 10, 0.1)',
    },
    danger: {
      color: 'var(--danger)',
      borderColor: 'rgba(255, 69, 58, 0.28)',
      background: 'rgba(255, 69, 58, 0.1)',
    },
  }[tone];

  return (
    <div
      className="feedback-banner"
      style={{
        color: toneStyles.color,
        borderColor: toneStyles.borderColor,
        background: toneStyles.background,
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="feedback-banner__close"
          onClick={onDismiss}
          aria-label="Dismiss feedback message"
        >
          ×
        </button>
      )}
    </div>
  );
}

function FeedbackDrawer({
  active,
  renderPanel,
}: {
  active: FeedbackDrawerKind | null;
  renderPanel: (kind: FeedbackDrawerKind) => ReactNode;
}) {
  const [rendered, setRendered] = useState<FeedbackDrawerKind | null>(active);

  useEffect(() => {
    if (active) {
      setRendered(active);
      return;
    }

    const timeout = window.setTimeout(() => setRendered(null), DRAWER_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [active]);

  const visibleKind = active ?? rendered;

  if (!visibleKind) return null;

  return (
    <div
      className={`feedback-drawer-shell ${active ? 'feedback-drawer-shell--open' : 'feedback-drawer-shell--closing'}`}
      data-feedback-drawer={visibleKind}
      aria-hidden={!active}
    >
      <div className="feedback-drawer-shell__inner">
        {renderPanel(visibleKind)}
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const { currentTeam } = useTeam();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeSavedAnalysisId, setActiveSavedAnalysisId] = useState<string | null>(null);
  const [ephemeralAnalysis, setEphemeralAnalysis] = useState<DisplayedAnalysis | null>(null);
  const [collectionState, setCollectionState] = useState<'idle' | 'refreshing' | 'queued'>('idle');
  const [banner, setBanner] = useState<{ tone: 'info' | 'success' | 'warning' | 'danger'; message: string } | null>(null);
  const [sourceSummaries, setSourceSummaries] = useState<SourceSummary[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveredSources, setDiscoveredSources] = useState<DiscoveredSource[]>([]);
  const [manualFallbackOpen, setManualFallbackOpen] = useState(false);
  const [manualFeedbackText, setManualFeedbackText] = useState('');
  const [manualAnalyzing, setManualAnalyzing] = useState(false);
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [sourcePlatformInput, setSourcePlatformInput] = useState<(typeof SOURCE_PLATFORM_OPTIONS)[number]>('Twitter / X');
  const [sourceUrlInput, setSourceUrlInput] = useState('');

  const autoRefreshRef = useRef<Record<string, string>>({});
  const discoveryAttemptRef = useRef<Record<string, boolean>>({});
  const selectedProjectRef = useRef<string>('');

  const loadProjects = useCallback(async (focusProjectId?: string, focusLatest = false) => {
    if (!currentTeam) return [];

    setProjectsLoading(true);
    try {
      const res = await fetch(`/api/projects?teamId=${currentTeam.id}`);
      const data = res.ok ? await res.json() as Project[] : [];
      setProjects(data);

      const nextSelectedId = focusProjectId
        ?? selectedProjectRef.current
        ?? data[0]?.id
        ?? '';

      if (nextSelectedId && data.some((project) => project.id === nextSelectedId)) {
        setSelectedProjectId(nextSelectedId);
        selectedProjectRef.current = nextSelectedId;
      } else if (data[0]?.id) {
        setSelectedProjectId(data[0].id);
        selectedProjectRef.current = data[0].id;
      } else {
        setSelectedProjectId('');
        selectedProjectRef.current = '';
      }

      if (focusLatest) {
        const focused = data.find((project) => project.id === (focusProjectId ?? nextSelectedId));
        setEphemeralAnalysis(null);
        setActiveSavedAnalysisId(focused?.feedbackAnalyses?.[0]?.id ?? null);
      }

      return data;
    } finally {
      setProjectsLoading(false);
    }
  }, [currentTeam]);

  useEffect(() => {
    if (!currentTeam) return;
    setBanner(null);
    setEphemeralAnalysis(null);
    setSourceSummaries([]);
    setDiscoveredSources([]);
    selectedProjectRef.current = '';
    void loadProjects(undefined, true);
  }, [currentTeam?.id, loadProjects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const history = selectedProject?.feedbackAnalyses ?? [];
  const sources = selectedProject?.socialProfiles ?? [];
  const sourceMeta = sources.map((source) => getSourceMeta(source));
  const supportedSources = sourceMeta.filter((source) => source.feedbackSupported).length;
  const comingSoonSources = sourceMeta.filter((source) => source.comingSoon).length;
  const blockedSources = sourceMeta.filter((source) => source.blocked).length;
  const sourcePlatformMenuOptions = useMemo(
    () => SOURCE_PLATFORM_OPTIONS.map((option) => ({
      value: option,
      availability: getFeedbackPlatformAvailability(option),
    })),
    [],
  );
  const selectedSourcePlatformAvailability = sourcePlatformMenuOptions.find((option) => option.value === sourcePlatformInput)?.availability ?? 'supported';
  const defaultSelectableSourcePlatform = sourcePlatformMenuOptions.find((option) => option.availability === 'supported')?.value ?? SOURCE_PLATFORM_OPTIONS[0];
  const latestSavedAnalysis = history[0] ?? null;

  useEffect(() => {
    if (!selectedProjectId) return;
    selectedProjectRef.current = selectedProjectId;
    setSourcesOpen(false);
    setHistoryOpen(false);
    setEphemeralAnalysis(null);
    setBanner(null);
    setSourceSummaries([]);
    setDiscoveredSources([]);
    setManualFallbackOpen(false);
    setManualFeedbackText('');
    setSourceFormOpen(false);
    setActiveSavedAnalysisId((prev) => {
      const latestId = selectedProject?.feedbackAnalyses?.[0]?.id ?? null;
      return latestId ?? prev;
    });
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedSourcePlatformAvailability === 'supported') return;
    setSourcePlatformInput(defaultSelectableSourcePlatform);
  }, [defaultSelectableSourcePlatform, selectedSourcePlatformAvailability]);

  useEffect(() => {
    if (!selectedProject) return;
    if (history.length === 0) {
      if (!ephemeralAnalysis) setActiveSavedAnalysisId(null);
      return;
    }
    if (!activeSavedAnalysisId || !history.some((entry) => entry.id === activeSavedAnalysisId)) {
      setActiveSavedAnalysisId(history[0].id);
    }
  }, [selectedProject, history, activeSavedAnalysisId, ephemeralAnalysis]);

  const displayedAnalysis = useMemo(() => {
    if (ephemeralAnalysis) return ephemeralAnalysis;
    const saved = history.find((entry) => entry.id === activeSavedAnalysisId) ?? history[0];
    return saved ? fromSavedAnalysis(saved) : null;
  }, [ephemeralAnalysis, history, activeSavedAnalysisId]);

  const followQueuedJob = useCallback(async (jobId: string, successMessage: string) => {
    try {
      for (let attempt = 0; attempt < 40; attempt++) {
        await sleep(2500);
        const res = await fetch(`/api/llm/jobs/${jobId}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to check queued job status');
        }

        if (data.status === 'succeeded') {
          setCollectionState('idle');
          await loadProjects(selectedProjectRef.current, true);
          setBanner({ tone: 'success', message: successMessage });
          return;
        }

        if (data.status === 'failed' || data.status === 'dead') {
          throw new Error(data.error || 'The queued analysis failed.');
        }
      }

      throw new Error('The queued analysis is taking longer than expected.');
    } catch (error) {
      setCollectionState('idle');
      setBanner({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'The queued analysis failed.',
      });
    }
  }, [loadProjects]);

  const runAutoCollection = useCallback(async (reason: 'auto' | 'manual') => {
    if (!selectedProject || !currentTeam) return;

    setCollectionState('refreshing');
    setBanner(reason === 'auto'
      ? { tone: 'info', message: 'Refreshing feedback from the configured public sources…' }
      : null);

    try {
      const res = await fetch('/api/feedback/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProject.id, teamId: currentTeam.id }),
      });
      const data = await res.json() as CollectResponse | { error?: string };

      if (!res.ok && res.status !== 202) {
        throw new Error('error' in data ? data.error || 'Feedback collection failed' : 'Feedback collection failed');
      }

      const payload = data as CollectResponse;
      setSourceSummaries(payload.sourceSummaries ?? []);

      if (payload.status === 'queued' && payload.jobId) {
        setCollectionState('queued');
        setBanner({ tone: 'info', message: payload.message });
        void followQueuedJob(payload.jobId, 'Queued feedback analysis finished and the latest run is now available.');
        return;
      }

      if (payload.result && payload.saved === false) {
        setEphemeralAnalysis(toDisplayedAnalysis(
          payload.result,
          payload.rawFeedbackCount,
          false,
          new Date().toISOString(),
          'Live analysis',
        ));
      } else if (payload.status === 'completed' || payload.status === 'not_modified' || payload.status === 'empty') {
        await loadProjects(selectedProject.id, true);
      }

      setCollectionState('idle');
      setBanner({
        tone: payload.warnings?.length ? 'warning' : payload.status === 'completed' ? 'success' : 'info',
        message: payload.warnings?.length
          ? `${payload.message} ${payload.warnings.join(' ')}`
          : payload.message,
      });
    } catch (error) {
      setCollectionState('idle');
      setBanner({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Feedback collection failed',
      });
    }
  }, [currentTeam, followQueuedJob, loadProjects, selectedProject]);

  const runManualAnalyze = useCallback(async () => {
    if (!selectedProject || !currentTeam) return;

    const items = manualFeedbackText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    if (items.length === 0) return;

    setManualAnalyzing(true);
    setBanner(null);

    try {
      const res = await fetch('/api/feedback/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: items,
          projectId: selectedProject.id,
          teamId: currentTeam.id,
        }),
      });
      const data = await res.json() as AnalyzeResponse | { error?: string };

      if (!res.ok && res.status !== 202) {
        throw new Error('error' in data ? data.error || 'Analysis failed' : 'Analysis failed');
      }

      if ('status' in data && data.status === 'queued' && data.jobId) {
        setCollectionState('queued');
        setBanner({ tone: 'info', message: data.message ?? 'The feedback analysis was queued.' });
        void followQueuedJob(data.jobId, 'Queued manual feedback analysis finished and the latest run is now available.');
        return;
      }

      const previousLatestId = latestSavedAnalysis?.id ?? null;
      const result = data as FeedbackResult;
      setEphemeralAnalysis(toDisplayedAnalysis(result, items.length, false, new Date().toISOString(), 'Manual import'));
      setActiveSavedAnalysisId(null);
      const refreshedProjects = await loadProjects(selectedProject.id, false);
      const refreshedProject = refreshedProjects.find((project) => project.id === selectedProject.id);
      const refreshedLatest = refreshedProject?.feedbackAnalyses?.[0] ?? null;
      if (refreshedLatest?.id && refreshedLatest.id !== previousLatestId) {
        setEphemeralAnalysis(null);
        setActiveSavedAnalysisId(refreshedLatest.id);
      }
      setBanner({ tone: 'success', message: 'Manual import analysis finished.' });
      setManualFeedbackText('');
    } catch (error) {
      setBanner({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Manual analysis failed',
      });
    } finally {
      setManualAnalyzing(false);
    }
  }, [currentTeam, followQueuedJob, latestSavedAnalysis?.id, loadProjects, manualFeedbackText, selectedProject]);

  const discoverSources = useCallback(async () => {
    if (!selectedProject || !currentTeam) return;

    setDiscoveryLoading(true);
    try {
      const res = await fetch('/api/feedback/sources/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProject.id, teamId: currentTeam.id }),
      });
      const data = await res.json() as { candidates?: DiscoveredSource[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not discover feedback sources');
      setDiscoveredSources(data.candidates ?? []);
    } catch (error) {
      setBanner({
        tone: 'warning',
        message: error instanceof Error ? error.message : 'Could not discover feedback sources.',
      });
    } finally {
      setDiscoveryLoading(false);
    }
  }, [currentTeam, selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;

    if (sources.length > 0) {
      if (supportedSources === 0) return;
      const key = `${selectedProject.id}:${latestSavedAnalysis?.id ?? 'none'}:${sources.length}`;
      if (!isStale(latestSavedAnalysis?.analyzedAt) && latestSavedAnalysis) return;
      if (autoRefreshRef.current[selectedProject.id] === key) return;
      autoRefreshRef.current[selectedProject.id] = key;
      void runAutoCollection('auto');
      return;
    }

    if (discoveryAttemptRef.current[selectedProject.id]) return;
    discoveryAttemptRef.current[selectedProject.id] = true;
    void discoverSources();
  }, [discoverSources, latestSavedAnalysis?.analyzedAt, latestSavedAnalysis?.id, runAutoCollection, selectedProject, sources.length, supportedSources]);

  const persistSources = useCallback(async (profiles: SourceProfile[]) => {
    if (!selectedProject || !currentTeam) return;

    const normalized = dedupeSourceProfiles(profiles);
    setProjects((prev) => prev.map((project) => (
      project.id === selectedProject.id
        ? { ...project, socialProfiles: normalized }
        : project
    )));

    const res = await fetch('/api/social/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: selectedProject.id,
        profiles: normalized,
        teamId: currentTeam.id,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || 'Failed to save sources');
    }
  }, [currentTeam, selectedProject]);

  const handleAddSource = useCallback(async () => {
    if (!sourceUrlInput.trim() || !selectedProject) return;
    if (selectedSourcePlatformAvailability !== 'supported') {
      setBanner({ tone: 'warning', message: 'This source is not available for collection yet.' });
      return;
    }

    try {
      const next = dedupeSourceProfiles([
        ...(selectedProject.socialProfiles ?? []),
        { platform: sourcePlatformInput, url: sourceUrlInput.trim() },
      ]);
      await persistSources(next);
      setSourceUrlInput('');
      setSourceFormOpen(false);
      setBanner({ tone: 'success', message: 'Feedback source saved.' });
      if (!latestSavedAnalysis && next.some((profile) => isFeedbackSupportedSource(profile))) {
        void runAutoCollection('manual');
      }
    } catch (error) {
      setBanner({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Failed to save source',
      });
    }
  }, [latestSavedAnalysis, persistSources, runAutoCollection, selectedProject, selectedSourcePlatformAvailability, sourcePlatformInput, sourceUrlInput]);

  const handleRemoveSource = useCallback(async (url: string) => {
    if (!selectedProject || !currentTeam) return;

    const next = (selectedProject.socialProfiles ?? []).filter((profile) => profile.url !== url);
    setProjects((prev) => prev.map((project) => (
      project.id === selectedProject.id
        ? { ...project, socialProfiles: next }
        : project
    )));

    const res = await fetch('/api/social/profiles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: selectedProject.id, url, teamId: currentTeam.id }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBanner({
        tone: 'danger',
        message: (data as { error?: string }).error || 'Failed to remove source',
      });
      return;
    }

    setBanner({ tone: 'success', message: 'Feedback source removed.' });
  }, [currentTeam, selectedProject]);

  const handleConfirmDiscoveredSources = useCallback(async () => {
    if (!selectedProject || discoveredSources.length === 0) return;
    try {
      const next = dedupeSourceProfiles([...(selectedProject.socialProfiles ?? []), ...discoveredSources]);
      await persistSources(next);
      setDiscoveredSources([]);
      setBanner({ tone: 'success', message: 'Discovered sources saved. Refreshing feedback now…' });
      void runAutoCollection('manual');
    } catch (error) {
      setBanner({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Could not save discovered sources',
      });
    }
  }, [discoveredSources, persistSources, runAutoCollection, selectedProject]);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? '');
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.replace(/^["']|["']$/g, '').trim())
        .filter(Boolean);
      const isHeader = lines[0] && /^(feedback|comment|review|text|message)$/i.test(lines[0]);
      setManualFeedbackText((isHeader ? lines.slice(1) : lines).join('\n'));
      setManualFallbackOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Panels ──────────────────────────────────────────────────────────────────

  const sourcesPanel = selectedProject ? (
    <div className="feedback-control-stack">
      <div className="feedback-control-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {discoveryLoading && (
            <span style={{ fontSize: 12, color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg className="loader-spinner" style={{ width: 12, height: 12, borderRightColor: 'transparent', borderWidth: 2 }} />
              discovering…
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => void discoverSources()} disabled={discoveryLoading}>
            {discoveryLoading ? 'Discovering…' : sources.length > 0 ? 'Discover Again' : 'Discover Sources'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSourceFormOpen((open) => !open)}
          >
            {sourceFormOpen ? 'Close' : 'Add Source'}
          </button>
        </div>
      </div>

      {sources.length > 0 ? (
        <div className="feedback-source-grid">
          {sources.map((source) => {
            const meta = getSourceMeta(source);
            const summary = sourceSummaries.find((entry) => entry.url === source.url || entry.platform === meta.platform);
            return (
              <div key={source.url} className="feedback-list-item feedback-source-card">
                <div className="feedback-source-card__header">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-pure)' }}>{meta.platform}</span>
                      <span className={`feedback-chip ${meta.comingSoon ? 'feedback-chip--warning' : meta.blocked ? 'feedback-chip--danger' : 'feedback-chip--ok'}`}>
                        {meta.comingSoon ? 'coming soon' : meta.blocked ? 'blocked' : 'collectible'}
                      </span>
                    </div>
                    <div className="feedback-source-card__url">
                      {source.url.replace(/^https?:\/\//, '')}
                    </div>
                  </div>
                  <button
                    onClick={() => void handleRemoveSource(source.url)}
                    className="feedback-source-card__remove"
                    title="Remove source"
                  >
                    ×
                  </button>
                </div>

                {summary && (
                  <div className="feedback-source-card__summary">
                    <span className={`feedback-chip ${summary.status === 'collected' ? 'feedback-chip--ok' : summary.status === 'coming_soon' || summary.status === 'empty' ? 'feedback-chip--warning' : 'feedback-chip--danger'}`}>
                      {summary.status === 'coming_soon' ? 'coming soon' : summary.status}
                    </span>
                    <span className="feedback-control-footnote__hint">{summary.message}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : discoveredSources.length > 0 ? (
        <div className="feedback-source-grid">
          {discoveredSources.map((source) => (
            <div key={source.url} className="feedback-list-item feedback-source-card">
              <div className="feedback-source-card__header">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-pure)' }}>{source.platform}</span>
                    <span className="feedback-chip feedback-chip--ok">discovered</span>
                    <span style={{ fontSize: 10, color: 'var(--signature)', fontWeight: 700 }}>
                      from {source.origin}
                    </span>
                  </div>
                  <div className="feedback-source-card__url">{source.url}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="feedback-control-empty">
          No saved sources yet. Discover public review/community links or paste
          a one-off batch through manual import.
        </div>
      )}

      {sourceFormOpen && (
        <div className="feedback-source-form-wrap">
          <div className="feedback-source-form__intro">
            <span className="feedback-control-footnote__label">Add source</span>
            <span className="feedback-control-footnote__hint">Connect one public profile or review URL.</span>
          </div>
          <div className="feedback-source-form">
            <select
              className="form-select"
              value={sourcePlatformInput}
              onChange={(e) => setSourcePlatformInput(e.target.value as (typeof SOURCE_PLATFORM_OPTIONS)[number])}
            >
              {sourcePlatformMenuOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.availability !== 'supported'}
                >
                  {option.availability === 'coming_soon'
                    ? `${option.value} — coming soon`
                    : option.availability === 'blocked'
                      ? `${option.value} — unavailable`
                      : option.value}
                </option>
              ))}
            </select>
            <input
              className="form-input"
              type="url"
              value={sourceUrlInput}
              onChange={(e) => setSourceUrlInput(e.target.value)}
              placeholder="https://..."
            />
            <button
              className="btn btn-secondary"
              onClick={() => void handleAddSource()}
              disabled={!sourceUrlInput.trim() || selectedSourcePlatformAvailability !== 'supported'}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {discoveredSources.length > 0 && sources.length === 0 && (
        <div className="feedback-control-footnote">
          <span className="feedback-control-footnote__label">Discovered candidates</span>
          <button className="btn btn-primary btn-sm" onClick={() => void handleConfirmDiscoveredSources()}>
            Save Discovered Sources
          </button>
        </div>
      )}

      {sourceSummaries.length > 0 && (
        <div className="feedback-control-footnote">
          <span className="feedback-control-footnote__label">Latest collection</span>
          <span className="feedback-control-footnote__hint">
            {sourceSummaries.map((summary) => `${summary.platform}: ${summary.message}`).join(' · ')}
          </span>
        </div>
      )}

      <div className="feedback-manual-fallback">
        <span>Have a one-off batch?</span>
        <button
          type="button"
          className="feedback-manual-link"
          onClick={() => {
            setManualFallbackOpen(true);
            setSourcesOpen(false);
            setHistoryOpen(false);
          }}
        >
          manual import
        </button>
      </div>
    </div>
  ) : null;

  const historyPanel = selectedProject ? (
    <div className="feedback-control-stack">
      {history.length > 0 ? (
        <div className="feedback-history-grid">
          {history.map((entry) => {
            const active = !ephemeralAnalysis && entry.id === (activeSavedAnalysisId ?? history[0].id);
            const historyLabel = buildFeedbackRunLabel({
              sentiment: entry.sentiment,
              themes: entry.themes,
              bugs: entry.bugs,
              featureRequests: entry.featureRequests,
              praises: entry.praises,
            });
            return (
              <button
                key={entry.id}
                onClick={() => {
                  setEphemeralAnalysis(null);
                  setActiveSavedAnalysisId(entry.id);
                }}
                className={`feedback-history-item${active ? ' feedback-history-item--active' : ''}`}
              >
                <div className="feedback-history-item__top">
                  <span className="feedback-history-item__title">{historyLabel}</span>
                  <span className="feedback-history-item__date">{formatDate(entry.analyzedAt)}</span>
                </div>
                <div className="feedback-history-item__meta">
                  <span className="feedback-history-item__tone">{entry.sentiment}</span>
                  <span>{entry.rawFeedback.length} item{entry.rawFeedback.length === 1 ? '' : 's'} · {entry.developerPrompts.length} prompt{entry.developerPrompts.length === 1 ? '' : 's'}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="feedback-control-empty">
          No saved runs yet.
        </div>
      )}
    </div>
  ) : null;

  const manualImportItems = manualFeedbackText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  const addFeedbackPanel = selectedProject ? (
    <div className="glass-card feedback-section-card feedback-add-panel">
      <div className="feedback-add-panel__head">
        <div>
          <span className="recgon-label" style={{ margin: 0 }}>manual import</span>
          <p className="feedback-control-hint">
            Paste one user comment, review, or support note per line. CSV and TXT
            imports are converted into the same format.
          </p>
        </div>
        <div className="feedback-add-panel__tools">
          <label className="btn btn-secondary btn-sm feedback-file-button">
            Import CSV / TXT
            <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCSVUpload} />
          </label>
          <button
            type="button"
            className="feedback-manual-link"
            onClick={() => setManualFallbackOpen(false)}
          >
            hide
          </button>
        </div>
      </div>

      <textarea
        className="form-textarea feedback-import-textarea"
        value={manualFeedbackText}
        onChange={(e) => setManualFeedbackText(e.target.value)}
        placeholder="Love the onboarding, but the calendar sync fails after I reconnect Google..."
      />

      <div className="feedback-add-panel__foot">
        <span className="feedback-toolbar__meta">
          {manualImportItems.length} item{manualImportItems.length === 1 ? '' : 's'} ready
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => void runManualAnalyze()}
          disabled={manualAnalyzing || !manualFeedbackText.trim()}
        >
          {manualAnalyzing ? (
            <><svg className="loader-spinner" style={{ width: 14, height: 14, borderRightColor: 'transparent', borderWidth: 2 }} /> Analyzing…</>
          ) : 'Analyze Import'}
        </button>
      </div>
    </div>
  ) : null;

  // ── Early returns ────────────────────────────────────────────────────────────

  if (!currentTeam) {
    return (
      <div className="loader">
        <div className="loader-spinner" />
        <div className="loader-text">Loading feedback workspace…</div>
      </div>
    );
  }

  if (!projectsLoading && projects.length === 0) {
    return (
      <div className="feedback-page">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h2>Feedback</h2>
        </div>
        <div className="glass-card" style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 24, fontWeight: 600, color: 'var(--txt-pure)' }}>No projects yet</h3>
          <p style={{ color: 'var(--txt-muted)', fontSize: 15, lineHeight: 1.7, maxWidth: 620 }}>Create or import a project first.</p>
          <div>
            <Link href="/projects" className="btn btn-primary">Open Projects</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Toolbar meta ─────────────────────────────────────────────────────────────

  const sourceMetaLabel = sources.length === 0
    ? 'no sources'
    : `${supportedSources} of ${sources.length} source${sources.length === 1 ? '' : 's'} active`;

  const unavailableSources = comingSoonSources + blockedSources;
  const hasManualImportItems = manualImportItems.length > 0;
  const displayedAnalysisIsStale = !!displayedAnalysis?.analyzedAt && isStale(displayedAnalysis.analyzedAt);
  const latestRunLabel = displayedAnalysis
    ? `${displayedAnalysisIsStale ? 'stale run' : 'last run'} ${formatDate(displayedAnalysis.analyzedAt)}`
    : 'no run yet';

  const primaryActionLabel = collectionState === 'queued'
    ? 'Queued'
    : collectionState === 'refreshing'
      ? 'Refreshing…'
      : manualAnalyzing
        ? 'Analyzing…'
        : hasManualImportItems
          ? 'Analyze Import'
          : supportedSources > 0
            ? 'Refresh Feedback'
            : discoveryLoading
              ? 'Discovering…'
              : 'Discover Sources';

  const primaryActionDisabled =
    collectionState !== 'idle'
    || manualAnalyzing
    || (!hasManualImportItems && supportedSources === 0 && discoveryLoading);

  const handlePrimaryAction = () => {
    if (primaryActionDisabled) return;
    if (hasManualImportItems) {
      void runManualAnalyze();
      return;
    }
    if (supportedSources > 0) {
      void runAutoCollection('manual');
      return;
    }
    setSourcesOpen(true);
    setHistoryOpen(false);
    setManualFallbackOpen(false);
    void discoverSources();
  };

  const emptyFeedbackCopy = sources.length === 0
    ? 'Connect a public feedback source, or paste comments manually to generate the first action queue.'
    : supportedSources === 0
      ? 'Saved sources are unavailable for automated collection right now. Manual import still works.'
      : 'Refresh the active sources to turn the latest user comments into developer prompts.';
  const activeDrawer: FeedbackDrawerKind | null = selectedProject
    ? manualFallbackOpen
      ? 'manual'
      : sourcesOpen
        ? 'sources'
        : historyOpen
          ? 'history'
          : null
    : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="feedback-page">
      <div className="page-header feedback-header-row">
        <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>feedback</h2>
        {projects.length > 0 && (
          <Select
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            options={projects.map((project) => ({
              value: project.id,
              label: project.analysis?.name ?? project.name,
            }))}
            placeholder="Select project"
            style={{ minWidth: 220, maxWidth: 320 }}
          />
        )}
      </div>

      {selectedProject && (
        <div className="feedback-toolbar">
          <div className="feedback-toolbar__left">
            {collectionState !== 'idle' ? (
              <span className="feedback-chip feedback-chip--warning">
                {collectionState === 'queued' ? 'queued' : 'refreshing'}
              </span>
            ) : displayedAnalysis ? (
              <span className={`feedback-chip ${displayedAnalysis.saved ? 'feedback-chip--ok' : 'feedback-chip--warning'}`}>
                {displayedAnalysis.saved ? 'saved' : 'live'}
              </span>
            ) : null}
            {displayedAnalysisIsStale && (
              <span className="feedback-chip feedback-chip--warning">stale</span>
            )}
            <span className="feedback-toolbar__meta">
              {sourceMetaLabel}
              {unavailableSources > 0 && (
                <span style={{ opacity: 0.6 }}> · {unavailableSources} unavailable</span>
              )}
              <span style={{ opacity: 0.6 }}> · {latestRunLabel}</span>
            </span>
          </div>
          <div className="feedback-toolbar__right">
            <button
              className="btn btn-primary btn-sm"
              onClick={handlePrimaryAction}
              disabled={primaryActionDisabled}
            >
              {(collectionState === 'refreshing' || manualAnalyzing || discoveryLoading) && (
                <svg className="loader-spinner" style={{ width: 14, height: 14, borderRightColor: 'transparent', borderWidth: 2 }} />
              )}
              {primaryActionLabel}
            </button>
            <button
              className={`btn btn-secondary btn-sm${sourcesOpen ? ' feedback-toolbar__btn--active' : ''}`}
              onClick={() => { setSourcesOpen((o) => !o); setHistoryOpen(false); setManualFallbackOpen(false); }}
            >
              Sources{sources.length > 0 ? ` (${sources.length})` : ''}
            </button>
            <button
              className={`btn btn-secondary btn-sm${historyOpen ? ' feedback-toolbar__btn--active' : ''}`}
              onClick={() => { setHistoryOpen((o) => !o); setSourcesOpen(false); setManualFallbackOpen(false); }}
            >
              History{history.length > 0 ? ` (${history.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {selectedProject && (
        <FeedbackDrawer
          active={activeDrawer}
          renderPanel={(kind) => {
            if (kind === 'manual') return addFeedbackPanel;

            return (
              <div className={`glass-card feedback-section-card feedback-drawer-card feedback-drawer-card--${kind}`}>
                {kind === 'sources' ? sourcesPanel : historyPanel}
              </div>
            );
          }}
        />
      )}

      {banner && (
        <Banner
          tone={banner.tone}
          message={banner.message}
          onDismiss={() => setBanner(null)}
        />
      )}

      {displayedAnalysis ? (
        <FeedbackPanel
          sentiment={displayedAnalysis.sentiment}
          summary={displayedAnalysis.summary}
          sentimentBreakdown={displayedAnalysis.sentimentBreakdown}
          themes={displayedAnalysis.themes}
          featureRequests={displayedAnalysis.featureRequests}
          bugs={displayedAnalysis.bugs}
          praises={displayedAnalysis.praises}
          developerPrompts={displayedAnalysis.developerPrompts}
          feedbackCount={displayedAnalysis.rawFeedbackCount}
          analyzedAtLabel={formatDate(displayedAnalysis.analyzedAt)}
        />
      ) : selectedProject ? (
        <div className="glass-card feedback-empty-card feedback-empty-state">
          <span className="recgon-label" style={{ margin: 0 }}>action queue</span>
          <h3>No feedback analyzed yet</h3>
          <p>{emptyFeedbackCopy}</p>
          <div className="feedback-empty-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={handlePrimaryAction}
              disabled={primaryActionDisabled}
            >
              {primaryActionLabel}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSourcesOpen(true);
                setHistoryOpen(false);
                setManualFallbackOpen(false);
              }}
            >
              Sources
            </button>
          </div>
          <button
            type="button"
            className="feedback-manual-link feedback-manual-link--empty"
            onClick={() => {
              setManualFallbackOpen(true);
              setSourcesOpen(false);
              setHistoryOpen(false);
            }}
          >
            manual import
          </button>
        </div>
      ) : null}
    </div>
  );
}
