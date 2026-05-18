'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';

import {
  CampaignCalendar,
  CampaignChannels,
  CampaignMetrics,
  CampaignOverview,
  CampaignTabs,
  MarketingEmpty,
  MarketingHeader,
  MarketingPreviewModal,
  MarketingSetup,
  buildMarketingHero,
} from '@/components/v2/projects/marketing';
import type {
  Campaign,
  CampaignType,
  ContentCalendarItem,
  GeneratedContentEntry,
  Project,
  Tab,
} from '@/components/v2/projects/marketing';
import { getPlatformKey } from '@/components/v2/projects/marketing';

import '@/components/v2/projects/marketing/marketing.css';

export default function V2ProjectMarketingPage() {
  const params = useParams<{ id: string }>();
  const selectedProjectId = params?.id ?? '';
  const { currentTeam } = useTeam();

  const [projects, setProjects] = useState<Project[]>([]);
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
  const [campaignType, setCampaignType] = useState<CampaignType | null>(null);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [duration, setDuration] = useState('1 month');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState('');
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [generatingContent, setGeneratingContent] = useState<string | null>(null);
  const [generatedContents, setGeneratedContents] = useState<Record<string, GeneratedContentEntry>>({});
  const [contentErrors, setContentErrors] = useState<Record<string, string>>({});
  const [previewEntry, setPreviewEntry] = useState<GeneratedContentEntry | null>(null);

  const loadProjects = useCallback(() => {
    if (!currentTeam) return;
    fetch(`/api/projects?teamId=${currentTeam.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((ps: Project[]) => {
        const analyzed = ps.filter((p) => p.analysis);
        setProjects(analyzed);
        setHasLoadedProjects(true);
      })
      .catch(() => {
        setProjects([]);
        setHasLoadedProjects(true);
      });
  }, [currentTeam]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Refetch when the tab regains visibility so a teammate's campaigns appear
  // without a hard reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadProjects();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadProjects]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const campaigns = selectedProject?.campaigns ?? [];

  const hero = buildMarketingHero({
    activeCampaign,
    campaigns,
    isPlanning,
    campaignType,
    duration,
  });

  const handlePlan = async () => {
    if (!selectedProjectId) return;
    if (!campaignGoal.trim()) {
      setPlanError('A campaign goal is required. What do you want this campaign to achieve?');
      return;
    }
    setIsPlanning(true);
    setPlanError('');
    setActiveCampaign(null);
    try {
      const res = await fetch('/api/marketing/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          campaignType,
          goal: campaignGoal,
          duration,
          websiteUrl: websiteUrl.trim() || undefined,
          teamId: currentTeam?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Campaign planning failed');
      setActiveCampaign(data.campaign);
      setActiveTab('overview');
      setGeneratedContents({});
      setContentErrors({});
      loadProjects();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Campaign planning failed');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleGenerateContent = async (item: ContentCalendarItem, itemKey: string) => {
    const platform = getPlatformKey(item.platform);
    if (!platform || !selectedProjectId) return;
    setGeneratingContent(itemKey);
    setContentErrors((prev) => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
    try {
      const customPrompt = `Topic: ${item.topic}. Angle: ${item.angle}. Format: ${item.suggestedFormat}. CTA: ${item.cta}.`;
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          platform,
          customPrompt,
          websiteUrl: websiteUrl.trim() || undefined,
          teamId: currentTeam?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Content generation failed');
      setGeneratedContents((prev) => ({
        ...prev,
        [itemKey]: { content: data.content, platform },
      }));
      loadProjects();
    } catch (err) {
      setContentErrors((prev) => ({
        ...prev,
        [itemKey]: err instanceof Error ? err.message : 'Content generation failed',
      }));
    } finally {
      setGeneratingContent(null);
    }
  };

  const handlePickCampaign = (campaignId: string) => {
    const next = campaigns.find((c) => c.id === campaignId);
    if (!next) return;
    setActiveCampaign(next);
    setActiveTab('overview');
    setGeneratedContents({});
    setContentErrors({});
  };

  const handleNewCampaign = () => {
    setActiveCampaign(null);
    setPlanError('');
    setGeneratedContents({});
    setContentErrors({});
  };

  // Project loaded but not analyzed → inline empty (matches v2 visual style).
  if (currentTeam && hasLoadedProjects && !selectedProject) {
    return <MarketingEmpty />;
  }

  return (
    <div className="v2-m">
      <MarketingHeader
        hero={hero}
        activeCampaign={activeCampaign}
        campaigns={campaigns}
        isPlanning={isPlanning}
        onPickCampaign={handlePickCampaign}
        onNewCampaign={handleNewCampaign}
      />

      {!activeCampaign ? (
        <MarketingSetup
          campaignType={campaignType}
          campaignGoal={campaignGoal}
          websiteUrl={websiteUrl}
          duration={duration}
          isPlanning={isPlanning}
          planError={planError}
          onChangeType={(t) => setCampaignType(t)}
          onChangeGoal={(v) => {
            setCampaignGoal(v);
            if (planError) setPlanError('');
          }}
          onChangeWebsite={(v) => setWebsiteUrl(v)}
          onChangeDuration={(v) => setDuration(v)}
          onPlan={handlePlan}
        />
      ) : (
        <>
          <CampaignTabs active={activeTab} onChange={setActiveTab} />
          {activeTab === 'overview' && <CampaignOverview plan={activeCampaign.plan} />}
          {activeTab === 'channels' && <CampaignChannels plan={activeCampaign.plan} />}
          {activeTab === 'calendar' && (
            <CampaignCalendar
              campaign={activeCampaign}
              generatedContents={generatedContents}
              generatingContent={generatingContent}
              contentErrors={contentErrors}
              onGenerate={handleGenerateContent}
              onPreview={(entry) => setPreviewEntry(entry)}
            />
          )}
          {activeTab === 'metrics' && <CampaignMetrics plan={activeCampaign.plan} />}
        </>
      )}

      {previewEntry && (
        <MarketingPreviewModal entry={previewEntry} onClose={() => setPreviewEntry(null)} />
      )}
    </div>
  );
}
