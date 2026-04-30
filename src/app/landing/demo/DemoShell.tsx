'use client';

import { useState } from 'react';
import RecgonLogo from '@/components/RecgonLogo';
import DashboardPane from './panes/DashboardPane';
import ProjectsPane from './panes/ProjectsPane';
import FeedbackPane from './panes/FeedbackPane';
import MarketingPane from './panes/MarketingPane';
import MentorPane from './panes/MentorPane';
import AnalyticsPane from './panes/AnalyticsPane';
import { demoTeam } from './mockData';

export type DemoTab = 'overview' | 'mentor' | 'projects' | 'marketing' | 'feedback' | 'analytics';

const NAV: { id: DemoTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ) },
  { id: 'mentor', label: 'Terminal', icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  ) },
  { id: 'projects', label: 'Projects', icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ) },
  { id: 'marketing', label: 'Marketing', icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) },
  { id: 'analytics', label: 'Analytics', icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ) },
  { id: 'feedback', label: 'Feedback', icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ) },
];

export default function DemoShell() {
  const [tab, setTab] = useState<DemoTab>('overview');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const isDark = theme === 'dark';

  return (
    <div
      className={theme}
      style={{
        width: '100%',
        maxWidth: 1180,
        margin: '0 auto',
        height: 760,
        borderRadius: 14,
        overflow: 'hidden',
        background: isDark ? '#000' : '#f5f5f7',
        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.12)',
        boxShadow: isDark
          ? '0 30px 90px rgba(0,0,0,0.6), 0 0 0 1px rgba(240,184,208,0.08)'
          : '0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        color: 'var(--txt-pure)',
      }}
    >
      {/* Browser chrome */}
      <div
        style={{
          height: 34,
          background: isDark ? '#0d0d0d' : '#e8e8ed',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
        <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)', marginLeft: 12 }}>
          recgon.app/{tab === 'overview' ? '' : tab}
        </span>
      </div>

      {/* App body */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg-deep)' }}>
        {/* Brand logo (top-left) */}
        <div
          style={{
            position: 'absolute',
            top: 22,
            left: 24,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ color: 'var(--signature)' }}>
            <RecgonLogo size={28} uid="demo-brand" />
          </span>
        </div>

        {/* Team chip (top-right) */}
        <div
          style={{
            position: 'absolute',
            top: 22,
            right: 24,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 12,
            color: 'var(--txt-muted)',
            padding: '6px 12px',
            borderRadius: 999,
            background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: 'linear-gradient(135deg, var(--signature), #8a4563)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#000',
            }}
          >
            {demoTeam.name.charAt(0)}
          </div>
          {demoTeam.name}
        </div>

        {/* Floating pill nav */}
        <div
          className="demo-app-nav"
          style={{
            position: 'absolute',
            top: 22,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            background: 'var(--nav-glass-substrate)',
            backdropFilter: 'blur(48px) saturate(180%)',
            WebkitBackdropFilter: 'blur(48px) saturate(180%)',
            borderRadius: 999,
            boxShadow: 'var(--shadow-float), var(--edge-highlight), var(--edge-shadow)',
          }}
        >
          {NAV.map((n) => {
            const active = n.id === tab;
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`nav-link${active ? ' active' : ''}`}
                style={{ border: 'none', background: 'transparent', appearance: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span className="nav-icon" style={{ display: 'flex' }}>{n.icon}</span>
                <span className="nav-link-label">{n.label}</span>
              </button>
            );
          })}

          {/* Theme toggle — exactly like the real app */}
          <button
            className="theme-toggle"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title="Toggle theme"
          >
            {isDark ? (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            ) : (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            )}
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            paddingTop: 100,
            paddingBottom: 40,
          }}
        >
          <div style={{ width: '100%', maxWidth: 980, margin: '0 auto', padding: '0 32px' }}>
            {tab === 'overview'  && <DashboardPane />}
            {tab === 'mentor'    && <MentorPane />}
            {tab === 'projects'  && <ProjectsPane />}
            {tab === 'marketing' && <MarketingPane />}
            {tab === 'feedback'  && <FeedbackPane />}
            {tab === 'analytics' && <AnalyticsPane />}
          </div>
        </div>
      </div>
    </div>
  );
}
