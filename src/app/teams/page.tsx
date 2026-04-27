'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

export default function TeamsPage() {
  const { teams, refreshTeams } = useTeam();
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
      addToast(`Team "${data.name}" created!`, 'success');
      router.push(`/teams/${data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create team';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  const ownedCount = teams.filter((t) => t.role === 'owner').length;

  return (
    <div className="teams-list-page">
      <style>{`
        .teams-list-page {
          max-width: 880px;
          animation: tlpFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes tlpFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tlpRowIn {
          from { opacity: 0; transform: translateY(6px); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes tlpFormDrop {
          from { opacity: 0; transform: translateY(-8px) scaleY(0.96); }
          to { opacity: 1; transform: translateY(0) scaleY(1); }
        }

        .tlp-hero {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 28px;
          padding-bottom: 22px;
          border-bottom: 1px solid rgba(var(--signature-rgb), 0.14);
        }
        .tlp-hero-left { min-width: 0; flex: 1; }
        .tlp-hero-meta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--signature);
          opacity: 0.9;
        }
        .tlp-hero-meta::before { content: '// '; opacity: 0.5; }
        .tlp-hero-count {
          margin-left: auto;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 1px;
          color: var(--txt-muted);
        }
        .tlp-hero-title {
          margin: 0;
          font-size: 38px;
          font-weight: 600;
          letter-spacing: -1.4px;
          line-height: 1.05;
          color: var(--txt-pure);
        }
        .tlp-hero-sub {
          margin: 8px 0 0;
          font-size: 14px;
          color: var(--txt-muted);
          max-width: 520px;
          line-height: 1.55;
        }
        .tlp-new-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: var(--btn-primary-bg);
          color: var(--btn-primary-txt);
          border: none;
          border-radius: 999px;
          font-weight: 600;
          font-size: 13px;
          letter-spacing: -0.1px;
          cursor: pointer;
          font-family: inherit;
          box-shadow: 0 1px 0 rgba(255,255,255,0.05) inset, 0 6px 18px -6px rgba(0,0,0,0.25);
          transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s ease, background 0.15s ease;
        }
        .tlp-new-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 1px 0 rgba(255,255,255,0.05) inset, 0 10px 26px -8px rgba(0,0,0,0.32), 0 0 0 4px rgba(var(--signature-rgb), 0.18);
        }
        .tlp-new-btn[data-cancel="1"] {
          background: transparent;
          color: var(--txt);
          border: 1px solid var(--btn-secondary-border);
          box-shadow: none;
        }
        .tlp-new-btn[data-cancel="1"]:hover {
          background: var(--btn-secondary-hover);
          transform: none;
          box-shadow: none;
        }
        .tlp-new-btn svg { transition: transform 0.2s; }
        .tlp-new-btn:hover svg { transform: rotate(90deg); }
        .tlp-new-btn[data-cancel="1"]:hover svg { transform: rotate(0deg); }

        .tlp-create-card {
          padding: 22px;
          margin-bottom: 26px;
          animation: tlpFormDrop 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
          transform-origin: top;
        }
        .tlp-create-grid {
          display: flex;
          gap: 12px;
          align-items: flex-end;
        }
        .tlp-input-wrap { flex: 1; }
        .tlp-label {
          display: block;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--signature);
          margin-bottom: 8px;
          opacity: 0.85;
        }
        .tlp-label::before { content: '// '; opacity: 0.5; }
        .tlp-input {
          width: 100%;
          padding: 12px 14px;
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
          border-radius: 12px;
          color: var(--txt-pure);
          font-size: 15px;
          font-weight: 500;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .tlp-input:focus {
          border-color: rgba(var(--signature-rgb), 0.5);
          box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.14);
          background: var(--glass-hover);
        }
        .tlp-create-submit {
          padding: 12px 22px;
          background: var(--btn-primary-bg);
          color: var(--btn-primary-txt);
          border: none;
          border-radius: 12px;
          font-weight: 600;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .tlp-create-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 14px -4px rgba(0,0,0,0.25); }
        .tlp-create-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .tlp-error {
          margin: 0 0 18px;
          padding: 10px 14px;
          font-size: 13px;
          color: var(--danger);
          background: rgba(255, 59, 48, 0.06);
          border: 1px solid rgba(255, 59, 48, 0.22);
          border-radius: 10px;
        }

        .tlp-section-label {
          display: block;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--signature);
          opacity: 0.85;
          margin: 0 0 14px;
        }
        .tlp-section-label::before { content: '// '; opacity: 0.5; }

        .tlp-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .tlp-row {
          --row-color: var(--signature);
          position: relative;
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 18px 22px;
          text-decoration: none;
          color: inherit;
          background: var(--bg-content) padding-box,
            linear-gradient(135deg,
              rgba(var(--signature-rgb), 0.22) 0%,
              rgba(255, 255, 255, 0.04) 50%,
              rgba(var(--signature-rgb), 0.10) 100%) border-box;
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid transparent;
          border-radius: 18px;
          box-shadow: var(--shadow-float), var(--edge-highlight);
          isolation: isolate;
          overflow: hidden;
          transition: transform 0.22s cubic-bezier(0.16,1,0.3,1), box-shadow 0.22s, background 0.22s;
          animation: tlpRowIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .tlp-row::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 0% 50%, rgba(var(--signature-rgb), 0.16) 0%, transparent 55%);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
          z-index: -1;
        }
        .tlp-row:hover { transform: translateY(-2px); }
        .tlp-row:hover::before { opacity: 1; }
        .tlp-row:hover {
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.42),
                      0 14px 38px -10px rgba(var(--signature-rgb), 0.24),
                      var(--edge-highlight);
        }

        .tlp-row:nth-child(1) { animation-delay: 0.04s; }
        .tlp-row:nth-child(2) { animation-delay: 0.08s; }
        .tlp-row:nth-child(3) { animation-delay: 0.12s; }
        .tlp-row:nth-child(4) { animation-delay: 0.16s; }
        .tlp-row:nth-child(5) { animation-delay: 0.20s; }

        .tlp-avatar {
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
          box-shadow: 0 6px 18px -6px rgba(var(--signature-rgb), 0.55),
                      inset 0 1px 0 rgba(255,255,255,0.18),
                      inset 0 -2px 6px rgba(0,0,0,0.12);
          transition: box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .tlp-row:hover .tlp-avatar {
          box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.18),
                      0 0 24px 2px rgba(var(--signature-rgb), 0.55),
                      0 8px 22px -4px rgba(var(--signature-rgb), 0.45),
                      inset 0 1px 0 rgba(255,255,255,0.22),
                      inset 0 -2px 6px rgba(0,0,0,0.12);
        }
        .tlp-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .tlp-row-body { flex: 1; min-width: 0; }
        .tlp-row-name {
          margin: 0 0 4px;
          font-size: 17px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.4px;
          line-height: 1.2;
        }
        .tlp-row-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .tlp-row-slug {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-muted);
          letter-spacing: 0.2px;
        }
        .tlp-row-slug::before { content: '/'; opacity: 0.5; margin-right: 1px; }

        .tlp-role-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--signature);
          border: 1px solid rgba(var(--signature-rgb), 0.22);
        }
        .tlp-role-pill[data-role="member"] {
          background: rgba(0,0,0,0.04);
          color: var(--txt-muted);
          border-color: var(--btn-secondary-border);
        }
        .tlp-role-pill[data-role="viewer"] {
          background: rgba(0,0,0,0.04);
          color: var(--txt-faint);
          border-color: var(--btn-secondary-border);
        }
        .tlp-role-pill .dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
          opacity: 0.85;
        }

        .tlp-row-arrow {
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
        .tlp-row:hover .tlp-row-arrow {
          background: var(--signature);
          color: #fff;
          transform: translateX(3px);
        }

        .tlp-row-index {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
          letter-spacing: 0.5px;
          flex-shrink: 0;
          width: 24px;
          text-align: right;
          opacity: 0.7;
        }

        .tlp-empty {
          padding: 56px 28px;
          text-align: center;
          background: var(--bg-content) padding-box,
            linear-gradient(135deg,
              rgba(var(--signature-rgb), 0.18) 0%,
              rgba(255, 255, 255, 0.04) 50%,
              rgba(var(--signature-rgb), 0.10) 100%) border-box;
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid transparent;
          border-radius: 24px;
          box-shadow: var(--shadow-float);
          position: relative;
          overflow: hidden;
        }
        .tlp-empty::before {
          content: '';
          position: absolute;
          inset: -2px;
          background:
            radial-gradient(circle at 30% 0%, rgba(var(--signature-rgb), 0.18), transparent 50%),
            radial-gradient(circle at 70% 100%, rgba(var(--signature-rgb), 0.12), transparent 50%);
          z-index: -1;
          pointer-events: none;
        }
        .tlp-empty-glyph {
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
        .tlp-empty-title {
          margin: 0 0 8px;
          font-size: 19px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.3px;
        }
        .tlp-empty-copy {
          margin: 0 auto 22px;
          max-width: 360px;
          font-size: 14px;
          color: var(--txt-muted);
          line-height: 1.55;
        }
      `}</style>

      <header className="tlp-hero">
        <div className="tlp-hero-left">
          <div className="tlp-hero-meta">
            teams · console
            <span className="tlp-hero-count">[ {pad(teams.length)} active · {pad(ownedCount)} owned ]</span>
          </div>
          <h1 className="tlp-hero-title">Your teams.</h1>
          <p className="tlp-hero-sub">
            Each team is its own working surface — projects, members, agents, and the Recgon roster live inside.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="tlp-new-btn"
          data-cancel={showCreate ? '1' : undefined}
        >
          {showCreate ? (
            <>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              Cancel
            </>
          ) : (
            <>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New team
            </>
          )}
        </button>
      </header>

      {showCreate && (
        <form onSubmit={handleCreate} className="glass-card tlp-create-card">
          <div className="tlp-create-grid">
            <div className="tlp-input-wrap">
              <label className="tlp-label">team name</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Aurora Labs, Founders, Ops…"
                required
                minLength={2}
                autoFocus
                className="tlp-input"
              />
            </div>
            <button type="submit" disabled={loading} className="tlp-create-submit">
              {loading ? 'Creating…' : 'Create →'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="tlp-error">{error}</p>}

      {teams.length > 0 && <span className="tlp-section-label">all teams · {pad(teams.length)}</span>}

      <div className="tlp-grid">
        {teams.map((team, i) => {
          const color = (team as { avatarColor?: string }).avatarColor || defaultColor(team.name);
          const avatarUrl = (team as { avatarUrl?: string }).avatarUrl;
          const slug = (team as { slug?: string }).slug;
          return (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="tlp-row"
              style={{ ['--row-color' as string]: color }}
            >
              <span className="tlp-row-index">{pad(i + 1)}</span>
              <div className="tlp-avatar" style={{ background: avatarUrl ? 'transparent' : color }}>
                {avatarUrl ? <img src={avatarUrl} alt={team.name} /> : initials(team.name)}
              </div>
              <div className="tlp-row-body">
                <p className="tlp-row-name">{team.name}</p>
                <div className="tlp-row-meta">
                  {slug && <span className="tlp-row-slug">{slug}</span>}
                  <span className="tlp-role-pill" data-role={team.role}>
                    <span className="dot" />
                    {team.role}
                  </span>
                </div>
              </div>
              <div className="tlp-row-arrow">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </Link>
          );
        })}

        {teams.length === 0 && (
          <div className="tlp-empty">
            <div className="tlp-empty-glyph">
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h2 className="tlp-empty-title">No teams yet.</h2>
            <p className="tlp-empty-copy">
              Spin one up to start collaborating — invite people, run analyses, and wire up Recgon agents.
            </p>
            <button onClick={() => setShowCreate(true)} className="tlp-new-btn">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create your first team
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
