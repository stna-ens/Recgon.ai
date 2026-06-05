'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  projectId: string | null;
}

interface ProjectLite {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  projects: ProjectLite[];
  activeId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  /** Rename a conversation (PATCH /api/chat/conversations/:id with {title}). */
  onRename: (id: string, title: string) => Promise<void>;
  /** Delete a conversation (DELETE /api/chat/conversations/:id). */
  onDelete: (id: string) => Promise<void>;
  /** Reassign to a project (PATCH ... with {projectId}). null = general bucket. */
  onAssignProject: (id: string, projectId: string | null) => Promise<void>;
}

function relTime(ms: number, justNow: string): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return justNow;
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function TerminalConversationDrawer({
  open,
  onClose,
  conversations,
  projects,
  activeId,
  onPick,
  onNew,
  onRename,
  onDelete,
  onAssignProject,
}: Props) {
  const t = useTranslations('terminal');
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [assignOpenId, setAssignOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Build the grouped, filtered, flat list. Memo so keyboard nav indexing
  // stays stable while typing.
  const flat = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? conversations.filter((c) => (c.title ?? '').toLowerCase().includes(q))
      : conversations;
    const projectById = new Map(projects.map((p) => [p.id, p.name]));
    const groups = new Map<string, { name: string; convs: Conversation[] }>();
    for (const c of filtered) {
      const key =
        c.projectId && projectById.has(c.projectId) ? c.projectId : '__none__';
      if (!groups.has(key)) {
        groups.set(key, {
          name: key === '__none__' ? t('drawer.general') : projectById.get(key)!,
          convs: [],
        });
      }
      groups.get(key)!.convs.push(c);
    }
    const orderedKeys = [
      ...projects.filter((p) => groups.has(p.id)).map((p) => p.id),
      ...(groups.has('__none__') ? ['__none__'] : []),
    ];
    return orderedKeys.flatMap((k) => {
      const g = groups.get(k)!;
      return [
        { kind: 'header' as const, label: g.name },
        ...g.convs.map((c) => ({ kind: 'row' as const, conv: c })),
      ];
    });
  }, [conversations, projects, query, t]);

  const rowItems = useMemo(
    () => flat.filter((f) => f.kind === 'row'),
    [flat],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setRenameId(null);
      setAssignOpenId(null);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (renameId) {
      setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 10);
    }
  }, [renameId]);

  if (!open) return null;

  const beginRename = (conv: Conversation) => {
    setRenameId(conv.id);
    setRenameDraft(conv.title || '');
    setAssignOpenId(null);
  };

  const commitRename = async () => {
    if (!renameId) return;
    const title = renameDraft.trim();
    const id = renameId;
    setRenameId(null);
    setRenameDraft('');
    if (title) {
      await onRename(id, title);
    }
  };

  const cancelRename = () => {
    setRenameId(null);
    setRenameDraft('');
  };

  const handleDelete = async (conv: Conversation) => {
    if (!confirm(t('drawer.confirmDelete', { title: conv.title || t('drawer.untitled') }))) return;
    await onDelete(conv.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (renameId) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rowItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rowItems[activeIdx];
      if (r && r.kind === 'row') {
        onPick(r.conv.id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (assignOpenId) {
        setAssignOpenId(null);
      } else {
        onClose();
      }
    } else if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey) {
      // 'e' = edit/rename the highlighted row
      const r = rowItems[activeIdx];
      if (r && r.kind === 'row') {
        e.preventDefault();
        beginRename(r.conv);
      }
    } else if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey) {
      // 'd' = delete the highlighted row (with confirm)
      const r = rowItems[activeIdx];
      if (r && r.kind === 'row') {
        e.preventDefault();
        handleDelete(r.conv);
      }
    } else if ((e.key === 'a' || e.key === 'A') && !e.metaKey && !e.ctrlKey) {
      // 'a' = open assign popover for the highlighted row
      const r = rowItems[activeIdx];
      if (r && r.kind === 'row') {
        e.preventDefault();
        setAssignOpenId(r.conv.id);
      }
    }
  };

  let rowCursor = -1;

  return (
    <>
      <div
        className="terminal-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="terminal-drawer" role="dialog" aria-label={t('drawer.dialogAria')}>
        <div className="terminal-drawer-head">
          <span style={{ color: 'var(--signature)', fontWeight: 700 }}>›</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('drawer.searchPlaceholder')}
            className="terminal-drawer-search"
            aria-label={t('drawer.searchAria')}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--txt-faint)',
              padding: '1px 5px',
              border: '1px solid var(--rule, rgba(255,255,255,0.08))',
              borderRadius: 4,
            }}
          >
            {t('drawer.esc')}
          </span>
        </div>

        <div className="terminal-drawer-list" ref={listRef}>
          {rowItems.length === 0 ? (
            <div className="terminal-drawer-empty">
              {conversations.length === 0
                ? t('drawer.emptyNoSessions')
                : t('drawer.emptyNoMatches')}
            </div>
          ) : (
            flat.map((item, i) => {
              if (item.kind === 'header') {
                return (
                  <span
                    key={`h-${i}`}
                    className="terminal-drawer-section-label"
                  >
                    {item.label}
                  </span>
                );
              }
              rowCursor += 1;
              const idx = rowCursor;
              const isActive = idx === activeIdx;
              const isCurrent = item.conv.id === activeId;
              const isRenaming = renameId === item.conv.id;
              const isAssigning = assignOpenId === item.conv.id;

              if (isRenaming) {
                return (
                  <div key={item.conv.id} className="terminal-drawer-row is-active">
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void commitRename();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={() => void commitRename()}
                      className="terminal-drawer-rename-input"
                      aria-label={t('drawer.renameAria')}
                    />
                    <span className="terminal-drawer-row-time">{t('drawer.renameHint')}</span>
                  </div>
                );
              }

              return (
                <div
                  key={item.conv.id}
                  className={`terminal-drawer-row ${isActive ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  style={{ position: 'relative' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onPick(item.conv.id);
                      onClose();
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      beginRename(item.conv);
                    }}
                    className="terminal-drawer-row-main"
                    title={t('drawer.openDoubleClick')}
                  >
                    <span className="terminal-drawer-row-title">
                      {item.conv.title || t('drawer.untitled')}
                    </span>
                  </button>

                  <span className="terminal-drawer-row-actions">
                    {isCurrent && (
                      <span className="terminal-drawer-row-current">{t('drawer.current')}</span>
                    )}
                    {isActive && !isCurrent && (
                      <>
                        <button
                          type="button"
                          className="terminal-drawer-row-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssignOpenId(
                              assignOpenId === item.conv.id ? null : item.conv.id,
                            );
                          }}
                          title={t('drawer.assignToProject')}
                          aria-label={t('drawer.assignToProjectAria')}
                        >
                          ◈
                        </button>
                        <button
                          type="button"
                          className="terminal-drawer-row-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            beginRename(item.conv);
                          }}
                          title={t('drawer.rename')}
                          aria-label={t('drawer.renameAriaShort')}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="terminal-drawer-row-action is-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(item.conv);
                          }}
                          title={t('drawer.delete')}
                          aria-label={t('drawer.deleteAriaShort')}
                        >
                          ×
                        </button>
                      </>
                    )}
                    <span className="terminal-drawer-row-time">
                      {relTime(item.conv.updatedAt, t('drawer.justNow'))}
                    </span>
                  </span>

                  {isAssigning && (
                    <div
                      className="terminal-drawer-assign"
                      role="menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="terminal-drawer-assign-label">
                        {t('drawer.assignTo')}
                      </span>
                      <button
                        type="button"
                        className={`terminal-drawer-assign-row ${
                          item.conv.projectId == null ? 'is-current' : ''
                        }`}
                        onClick={async () => {
                          await onAssignProject(item.conv.id, null);
                          setAssignOpenId(null);
                        }}
                      >
                        <span className="terminal-drawer-assign-mark">
                          {item.conv.projectId == null ? '✓' : ' '}
                        </span>
                        {t('drawer.general')}
                      </button>
                      {projects.length === 0 ? (
                        <span className="terminal-drawer-assign-empty">
                          {t('drawer.noProjectsYet')}
                        </span>
                      ) : (
                        projects.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`terminal-drawer-assign-row ${
                              item.conv.projectId === p.id ? 'is-current' : ''
                            }`}
                            onClick={async () => {
                              await onAssignProject(item.conv.id, p.id);
                              setAssignOpenId(null);
                            }}
                          >
                            <span className="terminal-drawer-assign-mark">
                              {item.conv.projectId === p.id ? '✓' : ' '}
                            </span>
                            {p.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="terminal-drawer-foot">
          <span>{t('drawer.footHint')}</span>
          <button
            type="button"
            className="terminal-drawer-new"
            onClick={() => {
              onNew();
              onClose();
            }}
          >
            {t('drawer.new')}
          </button>
        </div>
      </div>
    </>
  );
}
