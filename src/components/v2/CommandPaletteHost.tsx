'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';

type CommandKind = 'nav' | 'project' | 'action' | 'task';

interface Command {
  id: string;
  kind: CommandKind;
  label: string;
  hint?: string;
  group: string;
  keywords?: string[];
  run: () => void;
}

interface ProjectLite {
  id: string;
  name: string;
}

type StaticNavItem = {
  id: string;
  labelKey: string;
  hint: string;
  keywords?: string[];
};

const STATIC_NAV: StaticNavItem[] = [
  { id: 'nav-home', labelKey: 'navHome', hint: '/', keywords: ['overview', 'pulse', 'dashboard'] },
  { id: 'nav-projects', labelKey: 'navProjects', hint: '/projects', keywords: ['list'] },
  { id: 'nav-tasks', labelKey: 'navTasks', hint: '/tasks', keywords: ['inbox', 'queue', 'kanban', 'board'] },
  { id: 'nav-command', labelKey: 'navCommand', hint: '/command', keywords: ['mission', 'control', 'board', 'team', 'decisions', 'triage'] },
  { id: 'nav-calendar', labelKey: 'navCalendar', hint: '/calendar', keywords: ['week', 'schedule', 'planning'] },
  { id: 'nav-terminal', labelKey: 'navTerminal', hint: '/terminal', keywords: ['chat', 'mentor', 'cli', 'ask', 'console'] },
  { id: 'nav-team', labelKey: 'navTeam', hint: '/team', keywords: ['members', 'invites', 'admin'] },
  { id: 'nav-settings', labelKey: 'navSettings', hint: '/settings', keywords: ['account', 'theme'] },
];

interface TaskHit {
  id: string;
  title: string;
  status: string;
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 2;
  // light fuzzy: match characters in order
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 1 : 0;
}

export default function CommandPaletteHost() {
  const router = useRouter();
  const t = useTranslations('shared');
  const locale = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const { addToast } = useToast();
  const { currentTeam } = useTeam();
  const teamId = currentTeam?.id ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [taskHits, setTaskHits] = useState<TaskHit[]>([]);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number }>({ top: 80, right: 16 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const computePos = () => {
    const btn = document.querySelector<HTMLElement>('.v2-cmdk-trigger');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { top: r.bottom + 8, right: window.innerWidth - r.right };
  };

  // Open via custom event from TopNav, or Cmd/Ctrl+K from anywhere.
  useEffect(() => {
    const onOpen = () => {
      const pos = computePos();
      if (pos) setPanelPos(pos);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const pos = computePos();
        if (pos) setPanelPos(pos);
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('v2:open-command', onOpen);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('v2:open-command', onOpen);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Reset state on open + load projects.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    setTimeout(() => inputRef.current?.focus(), 10);
    if (!teamId) return;
    let cancelled = false;
    fetch(`/api/projects?teamId=${teamId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        const list: ProjectLite[] = Array.isArray(data)
          ? data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
          : [];
        setProjects(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, teamId]);

  // Live task search — debounced 250ms against the team-scoped search
  // endpoint once the query is 2+ chars. Results bypass the local fuzzy
  // matcher (the server already filtered).
  useEffect(() => {
    if (!open || !teamId) return;
    const q = query.trim();
    if (q.length < 2) {
      setTaskHits([]);
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/teams/${teamId}/tasks/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { tasks: [] }))
        .then((data: { tasks?: Array<{ id: string; title: string; status: string }> }) => {
          setTaskHits(
            (data.tasks ?? []).map((row) => ({ id: row.id, title: row.title, status: row.status })),
          );
        })
        .catch(() => setTaskHits([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [open, teamId, query]);

  const allCommands = useMemo<Command[]>(() => {
    const navCommands: Command[] = STATIC_NAV.map((c) => ({
      id: c.id,
      kind: 'nav',
      label: t(`commandPalette.${c.labelKey}`),
      hint: c.hint,
      group: t('commandPalette.goTo'),
      keywords: c.keywords,
      run: () => {
        router.push(c.hint);
        setOpen(false);
      },
    }));
    const projectCommands: Command[] = projects.map((p) => ({
      id: `proj-${p.id}`,
      kind: 'project',
      label: t('commandPalette.openProject', { name: p.name }),
      hint: `/projects/${p.id}`,
      group: t('commandPalette.projects'),
      keywords: [p.name, 'project', 'open'],
      run: () => {
        router.push(`/projects/${p.id}`);
        setOpen(false);
      },
    }));

    const actionCommands: Command[] = [
      {
        id: 'act-dispatch',
        kind: 'action',
        label: t('commandPalette.runDispatch'),
        group: t('commandPalette.actionsGroup'),
        keywords: ['dispatch', 'brain', 'assign', 'run', 'recgon'],
        run: () => {
          setOpen(false);
          if (!teamId) return;
          fetch(`/api/teams/${teamId}/recgon/dispatch`, { method: 'POST' })
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              addToast(t('commandPalette.dispatchDone'), 'success');
            })
            .catch(() => addToast(t('commandPalette.dispatchFailed'), 'error'));
        },
      },
      {
        id: 'act-theme',
        kind: 'action',
        label: t('commandPalette.themeToggle'),
        group: t('commandPalette.actionsGroup'),
        keywords: ['theme', 'dark', 'light', 'mode', 'tema'],
        run: () => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          setOpen(false);
        },
      },
      {
        id: 'act-lang',
        kind: 'action',
        label: locale === 'en' ? t('commandPalette.langToTr') : t('commandPalette.langToEn'),
        group: t('commandPalette.actionsGroup'),
        keywords: ['language', 'dil', 'english', 'türkçe', 'turkish', 'locale'],
        run: () => {
          const next = locale === 'en' ? 'tr' : 'en';
          document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
          window.location.reload();
        },
      },
    ];

    return [...navCommands, ...projectCommands, ...actionCommands];
  }, [projects, router, t, teamId, addToast, setTheme, resolvedTheme, locale]);

  const filtered = useMemo<Command[]>(() => {
    // Server-side task hits always ride along (already filtered by the
    // search endpoint); local fuzzy applies to nav/project/action only.
    const taskCommands: Command[] = taskHits.map((hit) => ({
      id: `task-${hit.id}`,
      kind: 'task',
      label: hit.title,
      hint: hit.status.replace(/_/g, ' '),
      group: t('commandPalette.tasksGroup'),
      run: () => {
        router.push(`/command?task=${hit.id}`);
        setOpen(false);
      },
    }));
    if (!query.trim()) return allCommands;
    const local = allCommands
      .map((c) => {
        const haystack = [c.label, ...(c.keywords ?? [])].join(' ');
        return { c, score: fuzzyScore(query.trim(), haystack) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ c }) => c);
    return [...taskCommands, ...local];
  }, [allCommands, query, taskHits, router, t]);

  // Group filtered commands while preserving order.
  const grouped = useMemo(() => {
    const groups: { name: string; items: Command[] }[] = [];
    for (const cmd of filtered) {
      const existing = groups.find((g) => g.name === cmd.group);
      if (existing) existing.items.push(cmd);
      else groups.push({ name: cmd.group, items: [cmd] });
    }
    return groups;
  }, [filtered]);

  // Clamp active index when filtered changes.
  useEffect(() => {
    setActiveIdx((i) => {
      if (filtered.length === 0) return 0;
      return Math.min(i, filtered.length - 1);
    });
  }, [filtered.length]);

  // Scroll active item into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[activeIdx]?.run();
    }
  };

  let runningIdx = 0;

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200 }}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        className="v2-cmd-panel"
        role="dialog"
        aria-label={t('commandPalette.dialogAria')}
        aria-modal="true"
        style={{ top: panelPos.top, right: panelPos.right }}
      >
        <div className="v2-cmd-input-row">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="v2-cmd-input-icon">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('commandPalette.placeholder')}
            className="v2-cmd-input"
            autoFocus
          />
          <span className="v2-cmd-esc">{t('commandPalette.esc')}</span>
        </div>

        <div ref={listRef} className="v2-cmd-list">
          {grouped.length === 0 ? (
            <div className="v2-cmd-empty">{t('commandPalette.noMatches')}</div>
          ) : (
            grouped.map((group) => (
              <div key={group.name} className="v2-cmd-group">
                <div className="v2-cmd-group-label">{group.name}</div>
                {group.items.map((cmd) => {
                  const myIdx = runningIdx++;
                  const active = myIdx === activeIdx;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={myIdx}
                      className={`v2-cmd-item ${active ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveIdx(myIdx)}
                      onClick={() => cmd.run()}
                    >
                      <span className="v2-cmd-item-label">{cmd.label}</span>
                      {cmd.hint && <span className="v2-cmd-item-hint">{cmd.hint}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="v2-cmd-footer">
          <span><kbd>↑↓</kbd> {t('commandPalette.navigate')}</span>
          <span><kbd>↵</kbd> {t('commandPalette.select')}</span>
          <span><kbd>esc</kbd> {t('commandPalette.close')}</span>
        </div>
      </div>

      <style>{`
        .v2-cmd-panel {
          position: fixed;
          width: min(calc(100vw - 32px), 520px);
          background: color-mix(in oklab, var(--bg-deep, #0a0a0c) 97%, transparent);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.10));
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3);
          z-index: 201;
          overflow: hidden;
          animation: v2cmdSlideIn 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes v2cmdSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .v2-cmd-input-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 14px;
          border-bottom: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
        }
        .v2-cmd-input-icon { color: var(--txt-faint); flex-shrink: 0; }
        .v2-cmd-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--txt-pure);
          font-size: 14px;
          font-weight: 500;
        }
        .v2-cmd-input::placeholder { color: var(--txt-faint); }
        .v2-cmd-esc {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--txt-faint);
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
          border-radius: 4px;
          padding: 1px 5px;
        }
        .v2-cmd-list {
          max-height: 50vh;
          overflow-y: auto;
          padding: 6px;
        }
        .v2-cmd-empty {
          padding: 28px 14px;
          text-align: center;
          font-size: 13px;
          color: var(--txt-faint);
        }
        .v2-cmd-group { margin: 4px 0; }
        .v2-cmd-group-label {
          padding: 6px 10px 4px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }
        .v2-cmd-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          padding: 9px 10px;
          background: transparent;
          border: none;
          border-radius: 6px;
          color: var(--txt-muted);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          transition: background 100ms ease, color 100ms ease;
        }
        .v2-cmd-item.is-active {
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--txt-pure);
        }
        .v2-cmd-item-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-cmd-item-hint {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
          flex-shrink: 0;
        }
        .v2-cmd-footer {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 8px 14px;
          border-top: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
          font-size: 11px;
          color: var(--txt-faint);
        }
        .v2-cmd-footer kbd {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 600;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
          border-radius: 4px;
          padding: 1px 4px;
          margin-right: 4px;
        }
      `}</style>
    </>
  );
}
