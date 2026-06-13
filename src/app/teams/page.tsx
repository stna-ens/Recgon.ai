'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#0ea5e9', '#14b8a6', '#84cc16',
];

function defaultColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export default function V2TeamsIndexPage() {
  const t = useTranslations('teams');
  const { teams, currentTeam, setCurrentTeam, refreshTeams } = useTeam();
  const router = useRouter();
  const { addToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshTeams();
      setShowCreate(false);
      setTeamName('');
      addToast(t('index.created', { name: data.name }), 'success');
      router.push('/team');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('index.createFailed');
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  function openTeam(team: typeof teams[number]) {
    if (currentTeam?.id !== team.id) setCurrentTeam(team);
    router.push('/team');
  }

  const ownedCount = teams.filter((t) => t.role === 'owner').length;

  return (
    <div className="v2-teams-page">
      <style>{`
        .v2-teams-page {
          max-width: 920px;
          margin: 0 auto;
          animation: v2tFadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes v2tFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes v2tRowIn {
          from { opacity: 0; transform: translateY(6px); filter: blur(3px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes v2tFormDrop {
          from { opacity: 0; transform: translateY(-8px) scaleY(0.96); }
          to { opacity: 1; transform: translateY(0) scaleY(1); }
        }

        .v2t-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 26px;
        }
        .v2t-eyebrow {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--signature);
          opacity: 0.85;
          margin: 0 0 8px;
        }
        .v2t-eyebrow::before { content: '// '; opacity: 0.5; }
        .v2t-title {
          margin: 0;
          font-size: 32px;
          font-weight: 600;
          letter-spacing: -0.6px;
          color: var(--txt-pure);
          line-height: 1.1;
        }
        .v2t-title-prompt {
          color: var(--signature);
          opacity: 0.55;
          margin-right: 4px;
        }
        .v2t-subtitle {
          margin: 8px 0 0;
          font-size: 14px;
          color: var(--txt-muted);
          line-height: 1.5;
        }

        .v2t-new-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: var(--btn-primary-bg);
          color: var(--btn-primary-txt);
          border: none;
          /* Match the shared ui/Button primary shape (2px) — pill primaries
             clashed with the square primaries on sibling pages. */
          border-radius: 2px;
          font-weight: 600;
          font-size: 13px;
          letter-spacing: -0.1px;
          cursor: pointer;
          font-family: inherit;
          box-shadow: 0 1px 0 rgba(255,255,255,0.05) inset, 0 6px 18px -6px rgba(0,0,0,0.25);
          transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s ease, background 0.15s ease;
        }
        .v2t-new-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 1px 0 rgba(255,255,255,0.05) inset, 0 10px 26px -8px rgba(0,0,0,0.32), 0 0 0 4px rgba(var(--signature-rgb), 0.18);
        }
        .v2t-new-btn[data-cancel="1"] {
          background: transparent;
          color: var(--txt-pure);
          border: 1px solid var(--btn-secondary-border);
          box-shadow: none;
        }
        .v2t-new-btn[data-cancel="1"]:hover {
          background: var(--btn-secondary-hover);
          transform: none;
          box-shadow: none;
        }
        .v2t-new-btn svg { transition: transform 0.2s; }
        .v2t-new-btn:hover svg { transform: rotate(90deg); }
        .v2t-new-btn[data-cancel="1"]:hover svg { transform: rotate(0deg); }

        .v2t-create-card {
          padding: 22px;
          margin-bottom: 26px;
          animation: v2tFormDrop 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
          transform-origin: top;
        }
        .v2t-create-grid {
          display: flex;
          gap: 12px;
          align-items: flex-end;
        }
        .v2t-input-wrap { flex: 1; }
        .v2t-label {
          display: block;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--signature);
          margin-bottom: 8px;
          opacity: 0.85;
        }
        .v2t-label::before { content: '// '; opacity: 0.5; }
        .v2t-input {
          width: 100%;
          padding: 12px 14px;
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
          border-radius: 8px;
          color: var(--txt-pure);
          font-size: 15px;
          font-weight: 500;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .v2t-input:focus {
          border-color: rgba(var(--signature-rgb), 0.5);
          box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.14) !important;
          background: var(--glass-hover);
        }
        .v2t-create-submit {
          padding: 12px 22px;
          background: var(--btn-primary-bg);
          color: var(--btn-primary-txt);
          border: none;
          border-radius: 2px;
          font-weight: 600;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .v2t-create-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 14px -4px rgba(0,0,0,0.25); }
        .v2t-create-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .v2t-error {
          margin: 0 0 18px;
          padding: 10px 14px;
          font-size: 13px;
          color: var(--danger);
          background: rgba(var(--danger-rgb), 0.06);
          border: 1px solid rgba(var(--danger-rgb), 0.22);
          border-radius: 10px;
        }

        .v2t-section-label {
          display: block;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--signature);
          opacity: 0.85;
          margin: 0 0 14px;
        }
        .v2t-section-label::before { content: '// '; opacity: 0.5; }

        .v2t-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .v2t-row {
          --row-color: var(--signature);
          position: relative;
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 18px 22px;
          width: 100%;
          background: none;
          color: inherit;
          text-align: left;
          font-family: inherit;
          cursor: pointer;
          border: none;
          border-radius: 18px;
          isolation: isolate;
          overflow: hidden;
          animation: v2tRowIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .v2t-row::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 0% 50%, rgba(var(--signature-rgb), 0.16) 0%, transparent 55%);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
          z-index: -1;
        }
        .v2t-row:hover::before { opacity: 1; }

        .v2t-row[data-active="1"] {
          box-shadow:
            0 0 0 1px rgba(var(--signature-rgb), 0.55),
            0 14px 36px -14px rgba(var(--signature-rgb), 0.30),
            inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
        }

        .v2t-row:nth-child(1) { animation-delay: 0.04s; }
        .v2t-row:nth-child(2) { animation-delay: 0.08s; }
        .v2t-row:nth-child(3) { animation-delay: 0.12s; }
        .v2t-row:nth-child(4) { animation-delay: 0.16s; }
        .v2t-row:nth-child(5) { animation-delay: 0.20s; }

        .v2t-row-index {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--txt-faint);
          letter-spacing: 0.5px;
          flex-shrink: 0;
          width: 24px;
          text-align: right;
          opacity: 0.7;
        }

        .v2t-avatar {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          font-size: 18px;
          color: #fff;
          letter-spacing: -0.5px;
          overflow: hidden;
          box-shadow:
            0 6px 18px -6px rgba(var(--signature-rgb), 0.45),
            inset 0 1px 0 rgba(255,255,255,0.18),
            inset 0 -2px 6px rgba(0,0,0,0.12);
          transition: box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .v2t-row:hover .v2t-avatar {
          box-shadow:
            0 0 0 4px rgba(var(--signature-rgb), 0.18),
            0 0 24px 2px rgba(var(--signature-rgb), 0.45),
            0 8px 22px -4px rgba(var(--signature-rgb), 0.35),
            inset 0 1px 0 rgba(255,255,255,0.22),
            inset 0 -2px 6px rgba(0,0,0,0.12);
        }
        .v2t-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .v2t-row-body { flex: 1; min-width: 0; }
        .v2t-row-name {
          margin: 0 0 4px;
          font-size: 17px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.4px;
          line-height: 1.2;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .v2t-active-pip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 999px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          background: rgba(var(--signature-rgb), 0.14);
          color: var(--signature);
          border: 1px solid rgba(var(--signature-rgb), 0.32);
        }
        .v2t-active-pip .dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
        }

        .v2t-row-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .v2t-row-slug {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--txt-muted);
          letter-spacing: 0.2px;
        }
        .v2t-row-slug::before { content: '/'; opacity: 0.5; margin-right: 1px; }

        .v2t-role-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          font-family: var(--font-mono);
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--signature);
          border: 1px solid rgba(var(--signature-rgb), 0.22);
        }
        .v2t-role-pill[data-role="member"] {
          background: rgba(0,0,0,0.04);
          color: var(--txt-muted);
          border-color: var(--btn-secondary-border);
        }
        .v2t-role-pill[data-role="viewer"] {
          background: rgba(0,0,0,0.04);
          color: var(--txt-faint);
          border-color: var(--btn-secondary-border);
        }
        .v2t-role-pill .dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
          opacity: 0.85;
        }

        .v2t-row-arrow {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--btn-secondary-bg);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--txt-muted);
          transition: transform 0.22s cubic-bezier(0.16,1,0.3,1), background 0.18s, color 0.18s;
        }
        .v2t-row:hover .v2t-row-arrow {
          background: var(--signature);
          color: #fff;
          transform: translateX(3px);
        }

        .v2t-empty {
          padding: 56px 28px;
          text-align: center;
        }
        .v2t-empty-glyph {
          width: 64px;
          height: 64px;
          margin: 0 auto 18px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(var(--signature-rgb), 0.08);
          border: 1px solid rgba(var(--signature-rgb), 0.22);
          color: var(--signature);
        }
        .v2t-empty-title {
          margin: 0 0 8px;
          font-size: 19px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.3px;
        }
        .v2t-empty-copy {
          margin: 0 auto 22px;
          max-width: 360px;
          font-size: 14px;
          color: var(--txt-muted);
          line-height: 1.55;
        }

        @media (max-width: 720px) {
          .v2t-header { flex-direction: column; align-items: stretch; gap: 14px; }
          .v2t-row { padding: 14px 16px; gap: 12px; }
          .v2t-row-index { display: none; }
          .v2t-avatar { width: 44px; height: 44px; font-size: 15px; border-radius: 12px; }
        }
      `}</style>

      <header className="v2t-header">
        <div style={{ minWidth: 0 }}>
          <p className="v2t-eyebrow">{t('index.eyebrow')}</p>
          <h2 className="v2t-title">
            <span className="v2t-title-prompt">$</span>{t('index.title')}
          </h2>
          <p className="v2t-subtitle">
            {t('index.subtitle', { active: pad(teams.length), owned: pad(ownedCount) })}
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="v2t-new-btn"
          data-cancel={showCreate ? '1' : undefined}
        >
          {showCreate ? (
            <>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              {t('index.cancel')}
            </>
          ) : (
            <>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t('index.newTeam')}
            </>
          )}
        </button>
      </header>

      {showCreate && (
        <form onSubmit={handleCreate} className="glass-card v2t-create-card">
          <div className="v2t-create-grid">
            <div className="v2t-input-wrap">
              <label className="v2t-label">{t('index.teamNameLabel')}</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder={t('index.teamNamePlaceholder')}
                required
                minLength={2}
                autoFocus
                className="v2t-input"
              />
            </div>
            <button type="submit" disabled={loading} className="v2t-create-submit">
              {loading ? t('index.creating') : t('index.createArrow')}
            </button>
          </div>
        </form>
      )}

      {error && <p className="v2t-error">{error}</p>}

      {teams.length > 0 && <span className="v2t-section-label">{t('index.allTeams', { count: pad(teams.length) })}</span>}

      <div className="v2t-grid">
        {teams.map((team, i) => {
          const color = (team as { avatarColor?: string }).avatarColor || defaultColor(team.name);
          const avatarUrl = (team as { avatarUrl?: string }).avatarUrl;
          const slug = (team as { slug?: string }).slug;
          const isActive = currentTeam?.id === team.id;
          return (
            <button
              key={team.id}
              type="button"
              onClick={() => openTeam(team)}
              className="glass-card v2t-row"
              data-active={isActive ? '1' : undefined}
              style={{ ['--row-color' as string]: color }}
            >
              <span className="v2t-row-index">{pad(i + 1)}</span>
              <div className="v2t-avatar" style={{ background: avatarUrl ? 'transparent' : color }}>
                {avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element -- user-supplied avatar URL; hosts can't be enumerated for next/image
                  ? <img src={avatarUrl} alt={team.name} />
                  : initials(team.name)}
              </div>
              <div className="v2t-row-body">
                <p className="v2t-row-name">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {team.name}
                  </span>
                  {isActive && (
                    <span className="v2t-active-pip">
                      <span className="dot" />
                      {t('index.active')}
                    </span>
                  )}
                </p>
                <div className="v2t-row-meta">
                  {slug && <span className="v2t-row-slug">{slug}</span>}
                  <span className="v2t-role-pill" data-role={team.role}>
                    <span className="dot" />
                    {t(`roles.${team.role}`)}
                  </span>
                </div>
              </div>
              <div className="v2t-row-arrow">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </button>
          );
        })}

        {teams.length === 0 && (
          <div className="glass-card v2t-empty">
            <div className="v2t-empty-glyph">
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h2 className="v2t-empty-title">{t('index.emptyTitle')}</h2>
            <p className="v2t-empty-copy">
              {t('index.emptyCopy')}
            </p>
            <button onClick={() => setShowCreate(true)} className="v2t-new-btn">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t('index.createFirst')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
