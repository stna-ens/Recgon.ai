'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';
import { WeekCalendar } from '@/components/v2/calendar/WeekCalendar';
import { ProjectTasksListView } from './list-view';

export default function V2ProjectTasksPage() {
  const t = useTranslations('tasks');
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? '';
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const { currentTeam, loading } = useTeam();

  // Wait for the team context to settle so owners don't see a flash of the
  // locked view on first paint.
  if (loading || !currentTeam) return null;

  if (currentTeam.role !== 'owner') {
    return (
      <div className="v2-tasks-locked">
        <div className="glass-card is-static is-roomy">
          <span className="recgon-label v2-locked-eye">{t('ownerLock.eyebrow')}</span>
          <h2 className="v2-locked-title">{t('ownerLock.title')}</h2>
          <p className="v2-locked-body">
            {t('ownerLock.body')}
          </p>
        </div>
        <style>{`
          .v2-tasks-locked {
            padding: 20px 0 40px;
            max-width: 640px;
            margin: 0 auto;
            animation: v2lockedFade 400ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          }
          @keyframes v2lockedFade {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: none; }
          }
          .v2-locked-eye { color: var(--signature); display: inline-block; margin-bottom: 12px; }
          .v2-locked-title {
            margin: 0 0 8px;
            font-size: 22px;
            font-weight: 600;
            color: var(--txt-pure);
            letter-spacing: -0.018em;
          }
          .v2-locked-body {
            margin: 0;
            font-size: 14px;
            color: var(--txt-muted);
            line-height: 1.6;
          }
        `}</style>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            style={{
              padding: '5px 12px',
              border: '1px solid var(--rule)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--txt-muted)',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {t('viewToggle.calendar')}
          </button>
        </div>
        <ProjectTasksListView />
      </div>
    );
  }

  return (
    <WeekCalendar
      projectId={projectId}
      onSwitchToList={() => setViewMode('list')}
    />
  );
}
