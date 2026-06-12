'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui';
import { relTimeParts, formatDay } from '@/lib/datetime';

// Task thread — comments merged with the task's activity timeline.
// Rendered inside TaskDetailPanel and the /tasks expanded card; polls
// every 30s only while mounted (Hobby-plan freshness model).

type ThreadItem =
  | {
      type: 'comment';
      id: string;
      body: string;
      authorUserId: string;
      authorName: string;
      mine: boolean;
      ts: string;
      editedAt: string | null;
    }
  | {
      type: 'event';
      id: string;
      event: string;
      actorName: string | null;
      detail: { days?: number; scheduledDate?: string; requestedDate?: string };
      ts: string;
    };

interface ThreadResponse {
  items: ThreadItem[];
  canComment: boolean;
}

export interface TaskThreadProps {
  teamId: string | null | undefined;
  taskId: string | null | undefined;
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export default function TaskThread({ teamId, taskId }: TaskThreadProps) {
  const t = useTranslations('tasks');
  const locale = useLocale();
  const { addToast } = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const key = teamId && taskId ? `/api/teams/${teamId}/tasks/${taskId}/comments` : null;
  const { data, error, mutate } = useSWR<ThreadResponse>(key, fetcher, {
    refreshInterval: 30_000,
  });

  if (!key) return null;

  const rel = (iso: string): string => {
    const p = relTimeParts(iso);
    if (!p) return '';
    if (p.unit === 'justNow') return t('relTime.justNow');
    return t(`relTime.${p.unit}`, { count: p.count });
  };

  const eventLabel = (item: Extract<ThreadItem, { type: 'event' }>): string => {
    const actor = item.actorName ?? t('thread.someone');
    const date = item.detail.scheduledDate
      ? formatDay(item.detail.scheduledDate, locale)
      : item.detail.requestedDate
        ? formatDay(item.detail.requestedDate, locale)
        : '';
    try {
      return t(`thread.events.${item.event}`, {
        actor,
        days: item.detail.days ?? 0,
        date,
      });
    } catch {
      return item.event.replace(/_/g, ' ');
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDraft('');
      await mutate();
    } catch {
      addToast(t('thread.sendFailed'), 'error');
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId: string) => {
    try {
      const res = await fetch(key, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast(t('thread.deleted'), 'success');
      await mutate();
    } catch {
      addToast(t('thread.deleteFailed'), 'error');
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="v2-thread">
      <div className="v2-thread-head">
        <span className="v2-thread-lab">{t('thread.heading')}</span>
        <span className="v2-thread-ai" title={t('thread.aiNote')}>
          {t('thread.aiNote')}
        </span>
      </div>

      {error ? (
        <p className="v2-thread-empty">{t('thread.loadFailed')}</p>
      ) : items.length === 0 ? (
        <p className="v2-thread-empty">{t('thread.empty')}</p>
      ) : (
        <ol className="v2-thread-list">
          {items.map((item) =>
            item.type === 'event' ? (
              <li key={item.id} className="v2-thread-event">
                <span className="v2-thread-event-dot" aria-hidden="true" />
                <span className="v2-thread-event-text">{eventLabel(item)}</span>
                <span className="v2-thread-time">{rel(item.ts)}</span>
              </li>
            ) : (
              <li key={item.id} className="v2-thread-comment">
                <div className="v2-thread-comment-head">
                  <span className="v2-thread-author">{item.authorName}</span>
                  <span className="v2-thread-time">{rel(item.ts)}</span>
                  {item.mine && (
                    <button
                      type="button"
                      className="v2-thread-del"
                      onClick={() => void remove(item.id)}
                    >
                      {t('thread.delete')}
                    </button>
                  )}
                </div>
                <p className="v2-thread-body">{item.body}</p>
              </li>
            ),
          )}
        </ol>
      )}

      {data?.canComment !== false && (
        <div className="v2-thread-composer">
          <textarea
            className="ui-input v2-thread-input"
            rows={2}
            placeholder={t('thread.placeholder')}
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button size="sm" variant="primary" loading={sending} disabled={!draft.trim()} onClick={() => void send()}>
            {t('thread.send')}
          </Button>
        </div>
      )}

      <style>{`
        .v2-thread { margin-top: 18px; }
        .v2-thread-head {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .v2-thread-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }
        .v2-thread-ai {
          font-size: 11px;
          color: var(--txt-faint);
          font-style: italic;
        }
        .v2-thread-empty {
          font-size: 12.5px;
          color: var(--txt-faint);
          margin: 0 0 10px;
        }
        .v2-thread-list {
          list-style: none;
          margin: 0 0 12px;
          padding: 0;
          display: grid;
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
        }
        .v2-thread-event {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--txt-faint);
        }
        .v2-thread-event-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--rule, rgba(255,255,255,0.2));
          flex: 0 0 auto;
        }
        .v2-thread-event-text { min-width: 0; }
        .v2-thread-time { font-size: 10px; color: var(--txt-faint); margin-left: auto; white-space: nowrap; }
        .v2-thread-comment {
          border: 1px solid var(--rule, rgba(255,255,255,0.08));
          border-radius: 10px;
          padding: 9px 12px;
        }
        .v2-thread-comment-head {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .v2-thread-author {
          font-size: 12px;
          font-weight: 650;
          color: var(--txt-pure);
        }
        .v2-thread-del {
          all: unset;
          cursor: pointer;
          font-size: 10.5px;
          color: var(--txt-faint);
        }
        .v2-thread-del:hover { color: var(--danger); }
        .v2-thread-body {
          margin: 4px 0 0;
          font-size: 13px;
          color: var(--txt-muted);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .v2-thread-composer {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }
        .v2-thread-input { flex: 1; resize: vertical; min-height: 40px; }
      `}</style>
    </div>
  );
}
