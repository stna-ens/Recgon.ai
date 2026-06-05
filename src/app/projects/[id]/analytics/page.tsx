'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import { useTeam } from '@/components/TeamProvider';

import {
  AnalyticsConnect,
  AnalyticsError,
  AnalyticsHeader,
  AnalyticsSkeleton,
  AnalyticsTiles,
  ChannelsBar,
  CountriesBar,
  DevicesDonut,
  MentorRead,
  SavedRunsStrip,
  TopPagesList,
  TrendChart,
  buildHeroHeadline,
  buildTileMetrics,
} from '@/components/v2/projects/analytics';
import type {
  AnalyticsData,
  AnalyticsInsights,
  GAProperty,
  PropertyConfig,
  SavedAnalyticsInsight,
} from '@/components/v2/projects/analytics';

import '@/components/v2/projects/analytics/analytics.css';

export default function V2ProjectAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const { addToast } = useToast();
  const { currentTeam } = useTeam();
  const t = useTranslations('analytics');
  const teamId = currentTeam?.id;
  const isOwner = currentTeam?.role === 'owner';

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const [regenerating, setRegenerating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Property config — tells us whether the team has credentials and the auth
  // method. Cheap + read-only, so it lives in SWR (cached across navigations).
  // The heavy GA data fetch below stays a hand-rolled abortable effect.
  const configKey = teamId ? `/api/analytics/property?scope=team&teamId=${teamId}` : null;
  const { data: propertyConfigData, mutate: mutateConfig } = useSWR<PropertyConfig>(configKey);
  const propertyConfig = propertyConfigData ?? null;
  const [linkedPropertyId, setLinkedPropertyId] = useState<string | null>(null);

  const [availableProperties, setAvailableProperties] = useState<GAProperty[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string>('');

  const [savedRuns, setSavedRuns] = useState<SavedAnalyticsInsight[]>([]);
  const [activeSavedRunId, setActiveSavedRunId] = useState<string | null>(null);

  // Persist last successful insights to localStorage so users don't see a
  // blank panel after refresh.
  const insightsKey = useMemo(() => {
    if (!projectId || !linkedPropertyId) return null;
    return `v2_analytics_insights_${projectId}_${linkedPropertyId}_${days}`;
  }, [projectId, linkedPropertyId, days]);

  useEffect(() => {
    if (!insightsKey) return;
    try {
      const cached = localStorage.getItem(insightsKey);
      if (cached) setInsights(JSON.parse(cached));
    } catch { /* ignore */ }
  }, [insightsKey]);

  // Connect / disconnect / transfer / link handlers bump `reloadKey` to force a
  // refetch. SWR owns propertyConfig now, so mirror those bumps into a revalidate.
  // Skip the first run — the initial fetch is already triggered by the SWR key.
  const didMountConfig = useRef(false);
  useEffect(() => {
    if (!didMountConfig.current) { didMountConfig.current = true; return; }
    mutateConfig();
  }, [reloadKey, mutateConfig]);

  const fetchProperties = useCallback(async () => {
    if (!teamId) return;
    setPropertiesLoading(true);
    setPropertiesError('');
    try {
      const r = await fetch(`/api/analytics/properties?scope=team&teamId=${teamId}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPropertiesError(j?.error ?? t('toasts.failedLoadProperties'));
        setAvailableProperties([]);
      } else {
        const list: GAProperty[] = Array.isArray(j) ? j : Array.isArray(j?.properties) ? j.properties : [];
        setAvailableProperties(list);
      }
    } catch (e) {
      setPropertiesError(e instanceof Error ? e.message : t('toasts.failedLoadProperties'));
    } finally {
      setPropertiesLoading(false);
    }
  }, [teamId, t]);

  useEffect(() => {
    if (teamId && propertyConfig?.hasCredentials) fetchProperties();
  }, [teamId, propertyConfig?.hasCredentials, fetchProperties]);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return;
    setError(null);
    try {
      const r = await fetch(`/api/analytics/data?projectId=${projectId}&days=${days}`, { cache: 'no-store', signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j?.error || t('toasts.notAvailable'));
        setData(null);
        return;
      }
      setData(j);
      setLinkedPropertyId(j?.propertyId ?? null);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setError(t('toasts.networkError'));
      setData(null);
    }
  }, [projectId, days, t]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    Promise.allSettled([
      fetchData(ac.signal),
      teamId
        ? fetch(`/api/analytics/insights?teamId=${teamId}&projectId=${projectId}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => {
              if (cancelled || !json) return;
              const list: SavedAnalyticsInsight[] = Array.isArray(json?.insights) ? json.insights : [];
              setSavedRuns(list);
              const matching = list.find((it) => it.days === days) ?? list[0];
              if (matching) {
                setInsights(matching.insights);
                setActiveSavedRunId(matching.id);
              }
            })
            .catch(() => { /* best-effort */ })
        : Promise.resolve(),
    ]).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; ac.abort(); };
  }, [projectId, days, reloadKey, teamId, fetchData]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData, refreshing]);

  const handleRegenerateInsights = useCallback(async () => {
    if (!data || regenerating) return;
    setRegenerating(true);
    setInsights(null);
    setActiveSavedRunId(null);
    if (insightsKey) localStorage.removeItem(insightsKey);
    try {
      const res = await fetch('/api/analytics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, days, projectId, teamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || t('toasts.analysisFailed'));
      setInsights(json);
      if (insightsKey) {
        try { localStorage.setItem(insightsKey, JSON.stringify(json)); } catch { /* ignore */ }
      }
      if (teamId) {
        const r = await fetch(`/api/analytics/insights?teamId=${teamId}&projectId=${projectId}`, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j?.insights)) setSavedRuns(j.insights);
        }
      }
      addToast(t('toasts.regenerated'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toasts.analysisFailed'), 'error');
    } finally {
      setRegenerating(false);
    }
  }, [data, days, projectId, teamId, regenerating, addToast, insightsKey, t]);

  const handleSubmitServiceAccount = useCallback(async (propertyIdInput: string, serviceAccountJson: string) => {
    if (!projectId || setupSaving) return;
    if (!teamId) {
      setSetupError(t('toasts.noTeam'));
      return;
    }
    if (!isOwner) {
      setSetupError(t('toasts.ownerOnlyConnect'));
      return;
    }
    setSetupSaving(true);
    setSetupError(null);
    try {
      const credRes = await fetch(`/api/analytics/property?scope=team&teamId=${teamId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: propertyIdInput, serviceAccountJson }),
      });
      const credJson = await credRes.json().catch(() => ({}));
      if (!credRes.ok) throw new Error(credJson?.error || t('toasts.saveCredsFailed'));

      const linkRes = await fetch('/api/analytics/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set_project_property', projectId, propertyId: propertyIdInput }),
      });
      const linkJson = await linkRes.json().catch(() => ({}));
      if (!linkRes.ok) throw new Error(linkJson?.error || t('toasts.linkPropertyFailed'));

      addToast(t('toasts.connected'), 'success');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : t('toasts.connectionFailed'));
    } finally {
      setSetupSaving(false);
    }
  }, [projectId, teamId, isOwner, setupSaving, addToast, t]);

  const handlePickProperty = useCallback(async (pid: string) => {
    if (!projectId || !pid) return;
    try {
      const r = await fetch('/api/analytics/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set_project_property', projectId, propertyId: pid }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || t('toasts.linkFailed'));
      }
      addToast(t('toasts.linkedToProperty', { id: pid }), 'success');
      setReloadKey((k) => k + 1);
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toasts.linkFailed'), 'error');
    }
  }, [projectId, addToast, t]);

  const handleTransferConnection = useCallback(async () => {
    if (!teamId) return;
    const direction: 'to_team' | 'to_personal' =
      propertyConfig?.hasCredentials && propertyConfig?.ownerUserId ? 'to_personal' : 'to_team';
    try {
      const r = await fetch('/api/analytics/property/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, teamId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || t('toasts.transferFailed'));
      addToast(direction === 'to_team' ? t('toasts.movedToTeam') : t('toasts.movedToPersonal'), 'success');
      setReloadKey((k) => k + 1);
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toasts.transferFailed'), 'error');
    }
  }, [teamId, propertyConfig, addToast, t]);

  const handleDisconnect = useCallback(async () => {
    if (!teamId) return;
    if (!isOwner) {
      addToast(t('toasts.ownerOnlyDisconnect'), 'error');
      return;
    }
    try {
      const r = await fetch(`/api/analytics/property?scope=team&teamId=${teamId}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || t('toasts.disconnectFailed'));
      }
      addToast(t('toasts.disconnected'), 'success');
      setData(null);
      setInsights(null);
      setLinkedPropertyId(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('toasts.disconnectFailed'), 'error');
    }
  }, [teamId, isOwner, addToast, t]);

  const handleReload = useCallback(() => setReloadKey((k) => k + 1), []);

  const isMissingProperty = !!error && (
    error.includes('Missing scope')
    || error.includes('not configured')
    || error.includes('property')
    || error.includes('analyticsPropertyId')
  );

  const oauthHref = teamId ? `/api/analytics/oauth?scope=team&teamId=${teamId}` : '';
  const oauthConfigured = !!propertyConfig?.oauthConfigured;

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) return <AnalyticsSkeleton />;

  if (error || !data) {
    if (isMissingProperty) {
      return (
        <AnalyticsConnect
          isOwner={isOwner}
          teamId={teamId}
          currentTeamName={currentTeam?.name}
          propertyConfig={propertyConfig}
          availableProperties={availableProperties}
          propertiesLoading={propertiesLoading}
          propertiesError={propertiesError}
          oauthHref={oauthHref}
          oauthConfigured={oauthConfigured}
          setupSaving={setupSaving}
          setupError={setupError}
          onPickProperty={handlePickProperty}
          onRetryProperties={fetchProperties}
          onSubmitServiceAccount={handleSubmitServiceAccount}
          onReload={handleReload}
        />
      );
    }
    return (
      <AnalyticsError
        error={error ?? t('toasts.couldNotReach')}
        isOwner={isOwner}
        propertyConfig={propertyConfig}
        onRetry={handleReload}
        onDisconnect={handleDisconnect}
      />
    );
  }

  const tiles = buildTileMetrics(data);
  const hero = buildHeroHeadline(data, tiles, insights?.overallPerformance);

  return (
    <div className="v2-an">
      <AnalyticsHeader
        data={data}
        insights={insights}
        days={days}
        refreshing={refreshing}
        isOwner={isOwner}
        currentTeamName={currentTeam?.name}
        propertyConfig={propertyConfig}
        availableProperties={availableProperties}
        hero={hero}
        onChangeDays={setDays}
        onRefresh={handleRefresh}
        onPickProperty={handlePickProperty}
        onTransferConnection={handleTransferConnection}
        onDisconnect={handleDisconnect}
      />

      <AnalyticsTiles tiles={tiles} />

      {data.trend.length > 0 && <TrendChart trend={data.trend} days={days} />}

      {!insights && (
        <section className="glass-card is-static v2-an-no-insight">
          <div className="v2-an-no-insight-body">
            <span className="recgon-label v2-block-eye">{t('noInsight.label')}</span>
            <p className="v2-an-no-insight-text">
              {t('noInsight.text')}
            </p>
          </div>
          <button
            type="button"
            className="v2-btn v2-btn-primary"
            onClick={handleRegenerateInsights}
            disabled={regenerating}
          >
            {regenerating ? <><span className="v2-an-spinner" /> {t('noInsight.generating')}</> : t('noInsight.cta')}
          </button>
        </section>
      )}

      {insights && (
        <MentorRead
          insights={insights}
          regenerating={regenerating}
          onRegenerate={handleRegenerateInsights}
        />
      )}

      {(data.channels.length > 0 || data.topPages.length > 0) && (
        <div className="v2-an-grid-2">
          <ChannelsBar channels={data.channels} />
          <TopPagesList pages={data.topPages} />
        </div>
      )}

      {(data.devices.length > 0 || data.countries.length > 0) && (
        <div className="v2-an-grid-2">
          <DevicesDonut devices={data.devices} />
          <CountriesBar countries={data.countries} />
        </div>
      )}

      <SavedRunsStrip
        runs={savedRuns}
        activeId={activeSavedRunId}
        onPick={(run, ins) => { setInsights(ins); setActiveSavedRunId(run.id); }}
      />
    </div>
  );
}
