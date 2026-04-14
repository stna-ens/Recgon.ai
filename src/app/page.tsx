'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import RecgonLogo from '@/components/RecgonLogo';
import { useTeam } from '@/components/TeamProvider';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  projectId: string | null;
}

interface Project {
  id: string;
  name: string;
  analysis?: unknown;
  marketingContent?: unknown[];
  feedbackAnalyses?: unknown[];
}

const DEFAULT_SUGGESTIONS = [
  'What am I not thinking about that I should be?',
  'How should I find my first 100 users?',
  'What pricing model would you recommend for a solo developer?',
  'What are the biggest risks I should be aware of?',
  'Give me a go-to-market strategy for my best project.',
  'How do I validate product-market fit quickly?',
];

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.7, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13.5 }}>
      {lines.map((line, i) => {
        const isBullet = /^[-*•]\s/.test(line);
        const content = line.replace(/^[-*•]\s/, '');
        const parts = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={j}>{part.slice(1, -1)}</em>;
          }
          return part;
        });
        if (isBullet) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: 'var(--accent-secondary)', flexShrink: 0, marginTop: 1 }}>›</span>
              <span>{parts}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
        return <div key={i} style={{ marginBottom: 4 }}>{parts}</div>;
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { currentTeam, loading: teamLoading } = useTeam();
  const [mounted, setMounted] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [keyDown, setKeyDown] = useState(false);
  const [recentlyTyped, setRecentlyTyped] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [classifyOpenId, setClassifyOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('recgon.chatSidebarCollapsed');
    if (stored === '0') setSidebarCollapsed(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('recgon.chatSidebarCollapsed', next ? '1' : '0');
      }
      return next;
    });
  }, []);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Typewriter effect
  const charQueueRef = useRef<string[]>([]);
  const typeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamDoneRef = useRef(false);
  // Greeting typewriter
  const [greetingChars, setGreetingChars] = useState(0);
  const [greetingTextChars, setGreetingTextChars] = useState(0);
  const greetingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const greetingTextIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const GREETING_TEXT = 'How can I help?';

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!currentTeam) return;
    fetch(`/api/projects?teamId=${currentTeam.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setProjects)
      .catch(() => {});
  }, [currentTeam]);

  const refreshConversations = useCallback(async () => {
    const res = await fetch('/api/chat/conversations?_t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return [] as ChatConversation[];
    const data = await res.json() as { conversations: ChatConversation[] };
    setConversations(data.conversations ?? []);
    return data.conversations ?? [];
  }, []);

  const loadConversation = useCallback(async (convId: string | null) => {
    if (!currentTeam) return;
    setActiveConvId(convId);
    if (!convId) {
      setMessages([]);
      return;
    }
    const res = await fetch(`/api/chat?teamId=${currentTeam.id}&conversationId=${convId}&_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setMessages((data.history ?? []).map((m: { role: 'user' | 'assistant'; content: string }) => ({
      role: m.role,
      content: m.content,
    })));
    if (data.suggestions?.length > 0) setSuggestions(data.suggestions);
  }, [currentTeam]);

  // Load conversations + personalized suggestions on mount; auto-open most recent
  useEffect(() => {
    if (!currentTeam) return;
    let cancelled = false;
    (async () => {
      const [convs, chatRes] = await Promise.all([
        refreshConversations(),
        fetch(`/api/chat?teamId=${currentTeam.id}&_t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (cancelled) return;
      if (chatRes?.suggestions?.length > 0) setSuggestions(chatRes.suggestions);
      if (convs.length > 0) {
        await loadConversation(convs[0].id);
      } else {
        setActiveConvId(null);
        setMessages([]);
      }
    })();
    return () => { cancelled = true; };
  }, [currentTeam, refreshConversations, loadConversation]);

  const stopTypewriter = useCallback(() => {
    if (typeIntervalRef.current) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    charQueueRef.current = [];
    streamDoneRef.current = false;
  }, []);

  const startTypewriter = useCallback((onDone: () => void) => {
    if (typeIntervalRef.current) return;
    typeIntervalRef.current = setInterval(() => {
      const queue = charQueueRef.current;
      if (queue.length === 0) {
        if (streamDoneRef.current) {
          clearInterval(typeIntervalRef.current!);
          typeIntervalRef.current = null;
          onDone();
        }
        return;
      }
      // Drain 1 char while stream is live (typewriter feel),
      // drain up to 6 chars once stream is done (flush without drag)
      const batch = streamDoneRef.current ? Math.min(queue.length, 6) : 1;
      const chars = queue.splice(0, batch).join('');
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, content: last.content + chars };
        return updated;
      });
    }, 12);
  }, []);

  const deleteCurrentChat = useCallback(async () => {
    if (streaming || !activeConvId) return;
    setClearing(true);
    try {
      await fetch(`/api/chat?conversationId=${activeConvId}`, { method: 'DELETE' });
      setMessages([]);
      setActiveConvId(null);
      const convs = await refreshConversations();
      if (convs.length > 0) await loadConversation(convs[0].id);
    } finally {
      setClearing(false);
    }
  }, [streaming, activeConvId, refreshConversations, loadConversation]);

  const newChat = useCallback(() => {
    if (streaming) return;
    stopTypewriter();
    setActiveConvId(null);
    setMessages([]);
    setInput('');
  }, [streaming]);

  const deleteConversationRow = useCallback(async (convId: string) => {
    if (streaming) return;
    await fetch(`/api/chat/conversations/${convId}`, { method: 'DELETE' });
    if (convId === activeConvId) {
      setActiveConvId(null);
      setMessages([]);
    }
    const convs = await refreshConversations();
    if (convId === activeConvId && convs.length > 0) {
      await loadConversation(convs[0].id);
    }
  }, [streaming, activeConvId, refreshConversations, loadConversation]);

  const assignProject = useCallback(async (convId: string, projectId: string | null) => {
    await fetch(`/api/chat/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    await refreshConversations();
  }, [refreshConversations]);

  const commitRename = useCallback(async (convId: string) => {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    await fetch(`/api/chat/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    await refreshConversations();
  }, [renameDraft, refreshConversations]);

  // Clean up typewriter on unmount
  useEffect(() => () => stopTypewriter(), [stopTypewriter]);

  // Greeting typewriter — runs when empty state is shown
  useEffect(() => {
    if (messages.length > 0) {
      setGreetingChars(0);
      setGreetingTextChars(0);
      if (greetingIntervalRef.current) clearInterval(greetingIntervalRef.current);
      if (greetingTextIntervalRef.current) clearInterval(greetingTextIntervalRef.current);
      return;
    }
    setGreetingChars(0);
    setGreetingTextChars(0);
    const items = [
      { label: 'projects', value: projects.length },
      { label: 'analyzed', value: projects.filter((p) => p.analysis).length },
      { label: 'campaigns', value: projects.reduce((a, p) => a + (p.marketingContent?.length ?? 0), 0) },
      { label: 'feedback', value: projects.reduce((a, p) => a + (p.feedbackAnalyses?.length ?? 0), 0) },
    ];
    const total = items.reduce((a, s, i) => a + String(s.value).length + 1 + s.label.length + (i < items.length - 1 ? 2 : 0), 0);
    const startTextAnimation = () => {
      greetingTextIntervalRef.current = setInterval(() => {
        setGreetingTextChars((prev) => {
          if (prev >= GREETING_TEXT.length) { clearInterval(greetingTextIntervalRef.current!); return prev; }
          return prev + 1;
        });
      }, 55);
    };
    greetingIntervalRef.current = setInterval(() => {
      setGreetingChars((prev) => {
        if (prev >= total) {
          clearInterval(greetingIntervalRef.current!);
          startTextAnimation();
          return prev;
        }
        return prev + 1;
      });
    }, 55);
    return () => {
      if (greetingIntervalRef.current) clearInterval(greetingIntervalRef.current);
      if (greetingTextIntervalRef.current) clearInterval(greetingTextIntervalRef.current);
    };
  }, [messages.length, projects]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  const stats = {
    totalProjects: projects.length,
    analyzedProjects: projects.filter((p) => p.analysis).length,
    marketingCampaigns: projects.reduce((acc, p) => acc + (p.marketingContent?.length ?? 0), 0),
    feedbackAnalyses: projects.reduce((acc, p) => acc + (p.feedbackAnalyses?.length ?? 0), 0),
  };

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming || !currentTeam) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMsg]);

    abortRef.current = new AbortController();
    streamDoneRef.current = false;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
          teamId: currentTeam?.id,
          conversationId: activeConvId,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Chat failed');
      }

      const resolvedConvId = res.headers.get('x-conversation-id');
      const wasNewChat = !activeConvId;
      if (resolvedConvId) {
        setActiveConvId(resolvedConvId);
        // Refresh sidebar immediately so the newly created chat appears at the top
        refreshConversations().catch(() => {});
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // Start the typewriter — it runs until queue is empty + stream is done
      startTypewriter(() => setStreaming(false));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Push every character into the queue; the interval drains them one by one
        charQueueRef.current.push(...chunk.split(''));
      }

      // All HTTP data received — tell the typewriter to flush and finish
      streamDoneRef.current = true;
      // (Sidebar is already refreshed immediately before starting the stream)
    } catch (err) {
      stopTypewriter();
      if ((err as Error).name === 'AbortError') {
        setStreaming(false);
        return;
      }
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Sorry, something went wrong: ${(err as Error).message}`,
        };
        return updated;
      });
      setStreaming(false);
    }
  }, [messages, streaming, currentTeam, activeConvId, startTypewriter, stopTypewriter, refreshConversations]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    setKeyDown(true);
    setRecentlyTyped(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setRecentlyTyped(false);
      setKeyDown(false);
    }, 5000);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleKeyUp = () => setKeyDown(false);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const hasProjects = projects.length > 0;

  return (
    <div>
      {/* Chat + history sidebar */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'row', minHeight: 600, padding: 0, overflow: 'hidden', marginBottom: 24, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>

        {/* History sidebar */}
        <div style={{
          width: sidebarCollapsed ? 0 : 240,
          opacity: sidebarCollapsed ? 0 : 1,
          pointerEvents: sidebarCollapsed ? 'none' : 'auto',
          flexShrink: 0,
          borderRight: '1px solid var(--btn-secondary-border)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(0,0,0,0.04)',
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <div style={{
            padding: '14px 14px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <button
              onClick={newChat}
              disabled={streaming}
              style={{
                flex: 1, textAlign: 'left', padding: '6px 10px',
                background: 'transparent', border: '1px dashed var(--btn-secondary-border)',
                borderRadius: 6, cursor: streaming ? 'not-allowed' : 'pointer',
                color: 'var(--txt-pure)', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 12, letterSpacing: '0.3px', opacity: streaming ? 0.4 : 1,
              }}
              title="Start a new chat"
            >
              + new chat
            </button>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 8px 12px',
          }}>
            {conversations.length === 0 && (
              <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--txt-faint)', opacity: 0.7 }}>
                no history yet
              </div>
            )}
            {(() => {
              const groups = new Map<string, ChatConversation[]>();
              const projectById = new Map(projects.map((p) => [p.id, p.name]));
              for (const c of conversations) {
                const key = c.projectId && projectById.has(c.projectId) ? c.projectId : '__none__';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(c);
              }
              const orderedKeys = [
                ...projects.filter((p) => groups.has(p.id)).map((p) => p.id),
                ...(groups.has('__none__') ? ['__none__'] : []),
              ];
              return orderedKeys.map((key) => {
                const label = key === '__none__' ? 'general' : projectById.get(key) ?? 'unknown';
                const items = groups.get(key)!;
                return (
                  <div key={key} style={{ marginBottom: 8 }}>
                    <div style={{
                      padding: '6px 10px 2px', fontSize: 10, color: 'var(--txt-faint)',
                      textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.7,
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    }}>{label}</div>
                    {items.map((c) => {
                      const isActive = c.id === activeConvId;
                      const isRenaming = renamingId === c.id;
                      return (
                        <div
                          key={c.id}
                          className="chat-history-row"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '6px 8px', borderRadius: 5, marginBottom: 2,
                            background: isActive ? 'var(--btn-secondary-border)' : 'transparent',
                            cursor: streaming ? 'default' : 'pointer',
                          }}
                          onClick={() => !streaming && !isRenaming && loadConversation(c.id)}
                        >
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => commitRename(c.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commitRename(c.id); }
                                if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                flex: 1, background: 'var(--bg-pure)', border: '1px solid var(--btn-secondary-border)',
                                borderRadius: 4, color: 'var(--txt-pure)', padding: '2px 6px',
                                fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, minWidth: 0,
                              }}
                            />
                          ) : (
                            <>
                              <span style={{
                                flex: 1, fontSize: 12, color: 'var(--txt-pure)',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                              }}>{c.title}</span>
                              <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setClassifyOpenId((id) => id === c.id ? null : c.id);
                                  }}
                                  className={`chat-history-action${classifyOpenId === c.id ? ' is-active' : ''}`}
                                  title="Assign to project"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-faint)', padding: 2, fontSize: 11 }}
                                >◈</button>
                                {classifyOpenId === c.id && (
                                  <>
                                    <div
                                      onClick={(e) => { e.stopPropagation(); setClassifyOpenId(null); }}
                                      style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                    />
                                    <div className="classify-popover" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        className={`classify-option${c.projectId == null ? ' is-selected' : ''}`}
                                        onClick={() => { assignProject(c.id, null); setClassifyOpenId(null); }}
                                      >
                                        <span className="classify-option-check">{c.projectId == null ? '✓' : ''}</span>
                                        general
                                      </button>
                                      {projects.map((p) => (
                                        <button
                                          key={p.id}
                                          className={`classify-option${c.projectId === p.id ? ' is-selected' : ''}`}
                                          onClick={() => { assignProject(c.id, p.id); setClassifyOpenId(null); }}
                                        >
                                          <span className="classify-option-check">{c.projectId === p.id ? '✓' : ''}</span>
                                          {p.name}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingId(c.id);
                                  setRenameDraft(c.title);
                                }}
                                className="chat-history-action"
                                title="Rename"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-faint)', padding: 2, fontSize: 11 }}
                              >✎</button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteConversationRow(c.id);
                                }}
                                className="chat-history-action"
                                title="Delete"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-faint)', padding: 2, fontSize: 11 }}
                              >×</button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Chat column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--btn-secondary-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>

          <div
            className={streaming ? 'dot-streaming' : (recentlyTyped && keyDown) ? 'dot-typing' : ''}
            style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: (streaming || (recentlyTyped && keyDown)) ? undefined : recentlyTyped ? 'var(--btn-secondary-border)' : 'var(--signature)',
              boxShadow: (streaming || recentlyTyped) ? undefined : '0 0 6px var(--signature)',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.3px' }}>Terminal</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
               onClick={toggleSidebar}
               style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  padding: '2px 0', opacity: 0.7, letterSpacing: '0.3px',
               }}
               title={sidebarCollapsed ? 'Expand history' : 'Collapse history'}
            >
              {sidebarCollapsed ? 'show history' : 'hide history'}
            </button>
            {hasProjects && (
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--txt-faint)' }}>
                {projects.length} project{projects.length > 1 ? 's' : ''} loaded
              </span>
            )}
            {activeConvId && messages.length > 0 && (
              <button
                onClick={deleteCurrentChat}
                disabled={streaming || clearing}
                style={{
                  background: 'none', border: 'none', cursor: streaming || clearing ? 'not-allowed' : 'pointer',
                  fontSize: 11, color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  padding: '2px 0', opacity: streaming || clearing ? 0.4 : 0.7, letterSpacing: '0.3px',
                }}
                title="Delete this conversation"
              >
                delete chat
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} style={{ flex: 1, minHeight: 400, maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {messages.length === 0 && mounted && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="chat-line-assistant">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--signature)' }}>
                  <RecgonLogo size={13} uid="greeting-avatar" />
                  <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>RECGON</span>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13 }}>
                  {(() => {
                    const items = [
                      { label: 'projects', value: stats.totalProjects },
                      { label: 'analyzed', value: stats.analyzedProjects },
                      { label: 'campaigns', value: stats.marketingCampaigns },
                      { label: 'feedback', value: stats.feedbackAnalyses },
                    ];
                    const flatChars = items.flatMap((s, i, arr) => [
                      ...String(s.value).split('').map((c) => ({ char: c, isValue: true })),
                      ...` ${s.label}`.split('').map((c) => ({ char: c, isValue: false })),
                      ...(i < arr.length - 1 ? '  '.split('').map((c) => ({ char: c, isValue: false })) : []),
                    ]);
                    const revealed = flatChars.slice(0, greetingChars);
                    const done = greetingChars >= flatChars.length;
                    return (
                      <>
                        {revealed.map((c, i) => (
                          <span key={i} style={{ color: c.isValue ? 'var(--signature)' : 'var(--txt-faint)' }}>{c.char}</span>
                        ))}
                        {!done && <span style={{ opacity: 0.35 }}>▌</span>}
                      </>
                    );
                  })()}
                </div>
                <div style={{ fontSize: 13, color: 'var(--txt-pure)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", marginTop: 8 }}>
                  {GREETING_TEXT.slice(0, greetingTextChars)}
                  {greetingTextChars < GREETING_TEXT.length && greetingTextChars > 0 && <span style={{ opacity: 0.35 }}>▌</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', padding: '7px 24px 0' }}>
                {suggestions.map((s) => (
                  <button key={s} className="chat-suggestion" onClick={() => send(s)}>
                    <span className="chat-suggestion-prefix">›</span>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'chat-line-user' : 'chat-line-assistant'}>
              {msg.role === 'user' ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: 'var(--signature)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", userSelect: 'none' }}>›</span>
                  <span>{msg.content}</span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--signature)' }}>
                    <RecgonLogo size={13} uid={`avatar-${i}`} />
                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>RECGON</span>
                  </div>
                  {msg.content ? <MarkdownText text={msg.content} /> : <span style={{ opacity: 0.35 }}>▌</span>}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid var(--btn-secondary-border)', padding: '12px 20px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span className="chat-input-prefix">
            {streaming ? <svg className="loader-spinner" style={{ width: 14, height: 14, borderWidth: 1.5, borderRightColor: 'transparent' }} /> : '›'}
          </span>
          <textarea
            ref={textareaRef}
            placeholder="type a message and press enter…"
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={streaming || teamLoading}
            onKeyUp={handleKeyUp}
            rows={1}
            style={{
              flex: 1, resize: 'none', overflow: 'hidden', background: 'transparent',
              border: 'none', outline: 'none', color: 'var(--txt-pure)',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 13.5, lineHeight: 1.6, minHeight: 24, paddingTop: 2,
            }}
          />
        </div>
        </div>
      </div>

    </div>
  );
}
