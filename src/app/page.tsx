'use client';

import { useEffect, useState } from 'react';
import StatsCard from '@/components/StatsCard';
import Link from 'next/link';

interface DashboardData {
  totalProjects: number;
  analyzedProjects: number;
  marketingCampaigns: number;
  feedbackAnalyses: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((projects) => {
        const analyzed = projects.filter((p: { analysis?: unknown }) => p.analysis).length;
        const marketing = projects.reduce(
          (acc: number, p: { marketingContent?: unknown[] }) => acc + (p.marketingContent?.length || 0),
          0
        );
        const feedback = projects.reduce(
          (acc: number, p: { feedbackAnalyses?: unknown[] }) => acc + (p.feedbackAnalyses?.length || 0),
          0
        );
        setData({
          totalProjects: projects.length,
          analyzedProjects: analyzed,
          marketingCampaigns: marketing,
          feedbackAnalyses: feedback,
        });
      })
      .catch(() => {
        setData({
          totalProjects: 0,
          analyzedProjects: 0,
          marketingCampaigns: 0,
          feedbackAnalyses: 0,
        });
      });
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Your AI-powered product management overview</p>
      </div>

      <div className="stats-grid">
        <StatsCard icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>} value={data?.totalProjects ?? '—'} label="Total Projects" />
        <StatsCard icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>} value={data?.analyzedProjects ?? '—'} label="Analyzed" />
        <StatsCard icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><circle cx="12" cy="12" r="3"/></svg>} value={data?.marketingCampaigns ?? '—'} label="Campaigns" />
        <StatsCard icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>} value={data?.feedbackAnalyses ?? '—'} label="Feedback Reports" />
      </div>

      <div className="grid-3" style={{ marginTop: 24 }}>
        <Link href="/projects" style={{ textDecoration: 'none', color: 'var(--txt-pure)' }}>
          <div className="glass-card" style={{ textAlign: 'center', cursor: 'pointer', padding: '40px 32px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)', marginBottom: 24, boxShadow: 'var(--edge-highlight), var(--edge-shadow)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </span>
            <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 12 }}>Add a Project</h3>
            <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.6 }}>
              Point Recgon at your codebase and let it understand your product.
            </p>
          </div>
        </Link>

        <Link href="/marketing" style={{ textDecoration: 'none', color: 'var(--txt-pure)' }}>
          <div className="glass-card" style={{ textAlign: 'center', cursor: 'pointer', padding: '40px 32px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)', marginBottom: 24, boxShadow: 'var(--edge-highlight), var(--edge-shadow)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><circle cx="12" cy="12" r="3"/></svg>
            </span>
            <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 12 }}>Generate Marketing</h3>
            <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.6 }}>
              Create premium content for Instagram, TikTok, and Ads.
            </p>
          </div>
        </Link>

        <Link href="/feedback" style={{ textDecoration: 'none', color: 'var(--txt-pure)' }}>
          <div className="glass-card" style={{ textAlign: 'center', cursor: 'pointer', padding: '40px 32px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)', marginBottom: 24, boxShadow: 'var(--edge-highlight), var(--edge-shadow)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </span>
            <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', marginBottom: 12 }}>Analyze Feedback</h3>
            <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.6 }}>
              Turn user comments into precise developer prompts.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
