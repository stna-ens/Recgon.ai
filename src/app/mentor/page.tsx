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

const COMMANDS = [
  { name: '/projects', description: 'list all your projects' },
  { name: '/analyze', description: '/analyze [project] — run codebase analysis' },
  { name: '/analytics', description: '/analytics [project] — fetch GA4 insights' },
  { name: '/feedback', description: '/feedback [project] — query feedback & sentiment' },
  { name: '/collect-feedback', description: '/collect-feedback [project] — collect saved feedback sources' },
  { name: '/content', description: '/content [project] — generate marketing content' },
  { name: '/campaign', description: '/campaign [project] — generate a campaign plan' },
  { name: '/clear', description: 'clear the current conversation' },
];

const DEFAULT_SUGGESTIONS = [
  'What am I not thinking about that I should be?',
  'How should I find my first 100 users?',
  'What pricing model would you recommend for a solo developer?',
  'What are the biggest risks I should be aware of?',
  'Give me a go-to-market strategy for my best project.',
  'How do I validate product-market fit quickly?',
];

function normalizeMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Message[] => {
    if (!item || typeof item !== 'object') return [];
    const message = item as { role?: unknown; content?: unknown };
    const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null;
    if (!role) return [];
    return [{ role, content: typeof message.content === 'string' ? message.content : '' }];
  });
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.7, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13.5 }}>
      {lines.map((line, i) => {
        const isBullet = /^[-*•]\s/.test(line);
        const content = line.replace(/^[-*•]\s/, '');
        const parts = content.split(/(\*\*.+?\*\*|\*[^*\s][^*]*\*)/g).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
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
  const { currentTeam, loading: teamLoading, refreshProjects } = useTeam();
  const [mounted, setMounted] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [keyDown, setKeyDown] = useState(false);
  const [recentlyTyped, setRecentlyTyped] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cmdIndex, setCmdIndex] = useState(0);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [classifyOpenId, setClassifyOpenId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const paletteListRef = useRef<HTMLDivElement>(null);
  const paletteModalRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollPill, setShowScrollPill] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedTeamRef = useRef<string | null>(null);
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

  const refreshMentorProjects = useCallback(() => {
    if (!currentTeam) return;
    fetch(`/api/projects?teamId=${currentTeam.id}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : [])
      .then(setProjects)
      .catch(() => {});
  }, [currentTeam]);

  useEffect(() => {
    refreshMentorProjects();
  }, [refreshMentorProjects]);

  const refreshProjectSurfaces = useCallback(() => {
    refreshMentorProjects();
    refreshProjects();
  }, [refreshMentorProjects, refreshProjects]);

  const refreshConversations = useCallback(async () => {
    const res = await fetch('/api/chat/conversations', { cache: 'no-store' });
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
    setMessages(normalizeMessages(data.history));
    if (data.suggestions?.length > 0) setSuggestions(data.suggestions);
  }, [currentTeam]);

  // Load conversations + personalized suggestions on mount; auto-open most recent.
  // Guard with loadedTeamRef so a re-render that recreates the currentTeam object
  // (same ID, new reference) doesn't stomp an intentionally blank new chat.
  useEffect(() => {
    if (!currentTeam) return;
    const teamChanged = loadedTeamRef.current !== currentTeam.id;
    if (!teamChanged) {
      // Team didn't change — just keep the sidebar list fresh, don't auto-open.
      refreshConversations();
      return;
    }
    loadedTeamRef.current = currentTeam.id;
    let cancelled = false;
    (async () => {
      const [convs, chatRes] = await Promise.all([
        refreshConversations(),
        fetch(`/api/chat?teamId=${currentTeam.id}&_t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (cancelled) return;
      if (chatRes?.suggestions?.length > 0) setSuggestions(chatRes.suggestions);
      // Always start with a blank new chat — previous conversations are accessible via ⌘K
      setActiveConvId(null);
      setMessages([]);
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
        if (!last) return [{ role: 'assistant', content: chars }];
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
      await refreshConversations();
    } finally {
      setClearing(false);
    }
  }, [streaming, activeConvId, refreshConversations]);

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

  // ⌘K / Ctrl+K opens palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        setPaletteQuery('');
        setPaletteIndex(0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const openPalette = useCallback(() => {
    setPaletteOpen(true);
    setPaletteQuery('');
    setPaletteIndex(0);
  }, []);

  const closePalette = useCallback(() => setPaletteOpen(false), []);


  // Close palette on click outside the modal
  useEffect(() => {
    if (!paletteOpen) return;
    const handler = (e: MouseEvent) => {
      if (paletteModalRef.current && !paletteModalRef.current.contains(e.target as Node)) {
        closePalette();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [paletteOpen, closePalette]);

  // Forward wheel events to palette list when palette is open
  useEffect(() => {
    if (!paletteOpen) return;
    const handler = (e: WheelEvent) => {
      if (!paletteListRef.current) return;
      if (paletteListRef.current.contains(e.target as Node)) return; // already scrolling inside
      paletteListRef.current.scrollBy({ top: e.deltaY });
      e.preventDefault();
    };
    document.addEventListener('wheel', handler, { passive: false });
    return () => document.removeEventListener('wheel', handler);
  }, [paletteOpen]);

  // Flat list used for keyboard nav: [new_chat sentinel, ...conversations]
  const paletteItems = useCallback((query: string): Array<{ type: 'new' } | ChatConversation> => {
    const filtered = query.trim()
      ? conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
      : conversations;
    return [{ type: 'new' as const }, ...filtered];
  }, [conversations]);

  const handlePaletteKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const items = paletteItems(paletteQuery);
    if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[paletteIndex];
      if (!item) return;
      if ('type' in item && item.type === 'new') { newChat(); closePalette(); }
      else { loadConversation((item as ChatConversation).id); closePalette(); }
    }
  }, [paletteItems, paletteQuery, paletteIndex, newChat, loadConversation, closePalette]);

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
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollPill(distanceFromBottom > 160);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  const stats = {
    totalProjects: projects.length,
    analyzedProjects: projects.filter((p) => p.analysis).length,
    marketingCampaigns: projects.reduce((acc, p) => acc + (p.marketingContent?.length ?? 0), 0),
    feedbackAnalyses: projects.reduce((acc, p) => acc + (p.feedbackAnalyses?.length ?? 0), 0),
  };

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming || !currentTeam) return;

    if (trimmed === '/clear') {
      setInput('');
      await deleteCurrentChat();
      return;
    }

    // Slash command → natural-language prompt the AI will tool-call on
    const SLASH_MAP: Record<string, (arg: string) => string> = {
      '/projects': () => 'List all my projects.',
      '/analyze': (arg) => arg ? `Run a codebase analysis for the project "${arg}".` : 'Run a codebase analysis for my main project.',
      '/analytics': (arg) => arg ? `Fetch GA4 analytics data for the project "${arg}".` : 'Fetch analytics data for my main project.',
      '/feedback': (arg) => arg ? `Show me the feedback analysis for the project "${arg}".` : 'Show me the feedback analysis for my main project.',
      '/collect-feedback': (arg) => arg ? `Collect feedback from saved sources for the project "${arg}".` : 'Collect feedback from saved sources for my main project.',
      '/content': (arg) => arg ? `Generate marketing content for the project "${arg}".` : 'Generate marketing content for my main project.',
      '/campaign': (arg) => arg ? `Generate a marketing campaign plan for the project "${arg}".` : 'Generate a marketing campaign plan for my main project.',
    };
    const [cmd, ...rest] = trimmed.split(' ');
    if (SLASH_MAP[cmd]) {
      const mapped = SLASH_MAP[cmd](rest.join(' ').trim());
      // Continue with the mapped prompt — fall through to the normal send flow below
      return send(mapped);
    }

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
      // Tool calls can update project analysis, feedback, or marketing content.
      // Refresh both the mentor counters and the shared Projects-page cache.
      refreshProjectSurfaces();
    } catch (err) {
      stopTypewriter();
      if ((err as Error).name === 'AbortError') {
        setStreaming(false);
        return;
      }
      setMessages((prev) => {
        const updated = [...prev];
        if (updated.length === 0) return [{ role: 'assistant', content: `Sorry, something went wrong: ${(err as Error).message}` }];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Sorry, something went wrong: ${(err as Error).message}`,
        };
        return updated;
      });
      setStreaming(false);
    }
  }, [messages, streaming, currentTeam, activeConvId, startTypewriter, stopTypewriter, refreshConversations, deleteCurrentChat, refreshProjectSurfaces]);

  // Pick up a prefilled prompt handed off from /overview and auto-send it once.
  useEffect(() => {
    if (!mounted || !currentTeam || streaming) return;
    let prefill: string | null = null;
    try { prefill = sessionStorage.getItem('mentor:prefill'); } catch { return; }
    if (!prefill) return;
    try { sessionStorage.removeItem('mentor:prefill'); } catch {}
    send(prefill);
  }, [mounted, currentTeam, streaming, send]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    setKeyDown(true);
    setRecentlyTyped(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setRecentlyTyped(false);
      setKeyDown(false);
    }, 5000);
    const cmdMatches = input.startsWith('/')
      ? COMMANDS.filter((c) => c.name.startsWith(input.split(' ')[0].toLowerCase()))
      : [];
    if (cmdMatches.length > 0) {
      if (e.key === 'ArrowUp') { e.preventDefault(); setCmdIndex((i) => Math.max(0, i - 1)); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCmdIndex((i) => Math.min(cmdMatches.length - 1, i + 1)); return; }
      if (e.key === 'Escape') { e.preventDefault(); setInput(''); return; }
      if (e.key === 'Tab') { e.preventDefault(); setInput(cmdMatches[cmdIndex].name); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(cmdMatches[cmdIndex].name); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleKeyUp = () => setKeyDown(false);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setCmdIndex(0);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const hasProjects = projects.length > 0;

  return (
    <div>
      <style>{`.main-content { overflow: hidden !important; }`}</style>
      {/* Chat */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 600, padding: 0, overflow: 'hidden', marginBottom: 24, fontFamily: "'JetBrains Mono', ui-monospace, monospace", position: 'relative' }}>

        {/* Command Palette */}
        {paletteOpen && (() => {
          const projectById = new Map(projects.map((p) => [p.id, p.name]));
          const filtered = paletteQuery.trim()
            ? conversations.filter((c) => c.title.toLowerCase().includes(paletteQuery.toLowerCase()))
            : conversations;
          const groups = new Map<string, ChatConversation[]>();
          for (const c of filtered) {
            const key = c.projectId && projectById.has(c.projectId) ? c.projectId : '__none__';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(c);
          }
          const orderedKeys = [
            ...projects.filter((p) => groups.has(p.id)).map((p) => p.id),
            ...(groups.has('__none__') ? ['__none__'] : []),
          ];
          // flat list for keyboard nav: index 0 = new chat, 1+ = conversations
          const flatConvs = orderedKeys.flatMap((k) => groups.get(k)!);
          const getItemIndex = (convId: string) => flatConvs.findIndex((c) => c.id === convId) + 1;

          return (
            <>
              {/* Scrim — absolute, visual only, dims only the terminal card */}
              <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
              {/* Palette */}
              <div ref={paletteModalRef} style={{
                position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)',
                width: 420, maxHeight: 500, zIndex: 51,
                background: 'var(--bg-deep)', border: '1px solid var(--btn-secondary-border)',
                borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}>
                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--btn-secondary-border)' }}>
                  <span style={{ color: 'var(--signature)', fontSize: 14, flexShrink: 0 }}>›</span>
                  <input
                    ref={paletteInputRef}
                    autoFocus
                    value={paletteQuery}
                    onChange={(e) => { setPaletteQuery(e.target.value); setPaletteIndex(0); }}
                    onKeyDown={handlePaletteKeyDown}
                    placeholder="search conversations…"
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      color: 'var(--txt-pure)', fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      fontSize: 13, letterSpacing: '0.2px',
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--txt-faint)', opacity: 0.6 }}>esc</span>
                </div>

                {/* List */}
                <div ref={paletteListRef} style={{ overflowY: 'auto', flex: 1 }}>
                  {/* New chat */}
                  <div
                    onClick={() => { newChat(); closePalette(); }}
                    style={{
                      padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 8,
                      cursor: 'pointer', fontSize: 12,
                      color: paletteIndex === 0 ? 'var(--signature)' : 'var(--txt-muted)',
                      background: paletteIndex === 0 ? 'rgba(124,106,255,0.08)' : 'transparent',
                      borderBottom: '1px solid var(--btn-secondary-border)',
                    }}
                    onMouseEnter={() => setPaletteIndex(0)}
                  >
                    + new conversation
                  </div>

                  {/* Grouped conversations */}
                  {filtered.length === 0 && paletteQuery && (
                    <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--txt-faint)', opacity: 0.6 }}>no results</div>
                  )}
                  {orderedKeys.map((key) => {
                    const label = key === '__none__' ? 'general' : projectById.get(key) ?? 'unknown';
                    const items = groups.get(key)!;
                    return (
                      <div key={key}>
                        <div style={{ padding: '8px 16px 3px', fontSize: 9, color: 'var(--txt-faint)', textTransform: 'uppercase', letterSpacing: '0.7px', opacity: 0.6 }}>
                          {label}
                        </div>
                        {items.map((c) => {
                          const flatIdx = getItemIndex(c.id);
                          const isHighlighted = paletteIndex === flatIdx;
                          const isRenaming = renamingId === c.id;
                          return (
                            <div
                              key={c.id}
                              className="chat-history-row"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '7px 16px', cursor: 'pointer',
                                background: isHighlighted ? 'rgba(255,255,255,0.05)' : 'transparent',
                              }}
                              onMouseEnter={() => setPaletteIndex(flatIdx)}
                              onClick={() => { if (!isRenaming) { loadConversation(c.id); closePalette(); } }}
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
                                    borderRadius: 4, color: 'var(--txt-pure)', padding: '2px 8px',
                                    fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12, minWidth: 0,
                                  }}
                                />
                              ) : (
                                <>
                                  <span style={{
                                    flex: 1, fontSize: 12, color: c.id === activeConvId ? 'var(--txt-pure)' : 'var(--txt-muted)',
                                    fontWeight: c.id === activeConvId ? 600 : 400,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  }}>{c.title}</span>
                                  {/* Row actions — visible on highlight */}
                                  {isHighlighted && (
                                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                      {/* Assign ◈ */}
                                      <div style={{ position: 'relative' }}>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setClassifyOpenId((id) => id === c.id ? null : c.id); }}
                                          className={`chat-history-action${classifyOpenId === c.id ? ' is-active' : ''}`}
                                          title="Assign to project"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-faint)', padding: '2px 4px', fontSize: 11 }}
                                        >◈</button>
                                        {classifyOpenId === c.id && (
                                          <>
                                            <div onClick={(e) => { e.stopPropagation(); setClassifyOpenId(null); }} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                                            <div className="classify-popover" onClick={(e) => e.stopPropagation()} style={{ zIndex: 61 }}>
                                              <button className={`classify-option${c.projectId == null ? ' is-selected' : ''}`} onClick={() => { assignProject(c.id, null); setClassifyOpenId(null); }}>
                                                <span className="classify-option-check">{c.projectId == null ? '✓' : ''}</span>general
                                              </button>
                                              {projects.map((p) => (
                                                <button key={p.id} className={`classify-option${c.projectId === p.id ? ' is-selected' : ''}`} onClick={() => { assignProject(c.id, p.id); setClassifyOpenId(null); }}>
                                                  <span className="classify-option-check">{c.projectId === p.id ? '✓' : ''}</span>{p.name}
                                                </button>
                                              ))}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                      {/* Rename ✎ */}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameDraft(c.title); }}
                                        className="chat-history-action" title="Rename"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-faint)', padding: '2px 4px', fontSize: 11 }}
                                      >✎</button>
                                      {/* Delete × */}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); deleteConversationRow(c.id); }}
                                        className="chat-history-action" title="Delete"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-faint)', padding: '2px 4px', fontSize: 11 }}
                                      >×</button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div style={{ padding: '7px 16px', borderTop: '1px solid var(--btn-secondary-border)', display: 'flex', gap: 14, fontSize: 10, color: 'var(--txt-faint)', opacity: 0.7 }}>
                  <span>↑↓ navigate</span>
                  <span>↵ open</span>
                  <span>esc close</span>
                </div>
              </div>
            </>
          );
        })()}

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
          <span style={{ fontSize: 12, color: 'var(--txt-faint)' }}>—</span>
          <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>mentor</span>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Conversation title pill — opens palette */}
            <button
              onClick={openPalette}
              style={{
                background: 'none', border: '1px solid var(--btn-secondary-border)', borderRadius: 5,
                cursor: 'pointer', padding: '3px 9px',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 11, color: 'var(--txt-muted)', letterSpacing: '0.3px',
                maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
              title="Switch conversation (⌘K)"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {activeConvId ? (conversations.find((c) => c.id === activeConvId)?.title ?? 'conversation') : 'new conversation'}
              </span>
              <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
            </button>
            <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, color: 'var(--txt-faint)', opacity: 0.6, letterSpacing: '0.2px' }}>⌘K</span>
            {hasProjects && (
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--txt-faint)' }}>
                {projects.length} project{projects.length > 1 ? 's' : ''} loaded
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{ position: 'relative', flex: 1, minHeight: 400, maxHeight: 520, display: 'flex', flexDirection: 'column' }}>
        <div ref={messagesContainerRef} style={{ flex: 1, overflowY: paletteOpen ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
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
          {showScrollPill && (
            <button
              onClick={() => {
                const c = messagesContainerRef.current;
                if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
              }}
              className="scroll-to-latest-pill"
              aria-label="Scroll to latest message"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              Latest
            </button>
          )}
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid var(--btn-secondary-border)', padding: '12px 20px', display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative' }}>
          {(() => {
            const cmdMatches = input.startsWith('/')
              ? COMMANDS.filter((c) => c.name.startsWith(input.split(' ')[0].toLowerCase()))
              : [];
            if (cmdMatches.length === 0) return null;
            return (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, right: 0,
                background: 'var(--bg-deep)', borderTop: '1px solid var(--btn-secondary-border)',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}>
                {cmdMatches.map((cmd, i) => (
                  <div
                    key={cmd.name}
                    onMouseDown={(e) => { e.preventDefault(); send(cmd.name); }}
                    style={{
                      padding: '8px 20px', cursor: 'pointer',
                      display: 'flex', gap: 14, alignItems: 'center',
                      background: i === cmdIndex ? 'rgba(128,128,128,0.12)' : 'transparent',
                    }}
                  >
                    <span style={{ color: 'var(--signature)', fontSize: 12, fontWeight: 600 }}>{cmd.name}</span>
                    <span style={{ color: 'var(--txt-muted)', fontSize: 11 }}>{cmd.description}</span>
                  </div>
                ))}
              </div>
            );
          })()}
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
  );
}
