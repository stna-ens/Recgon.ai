'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import MarkdownLine, { cleanText } from '@/components/v2/MarkdownLine';
import TerminalConversationDrawer from '@/components/v2/terminal/TerminalConversationDrawer';
import {
  SLASH_COMMANDS,
  filterCommands,
  parseCommand,
  type SlashCommand,
} from '@/lib/terminal/commands';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  ts?: number;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  projectId: string | null;
}

interface ProjectLite {
  id: string;
  name: string;
  analysis?: unknown;
  marketingContent?: unknown[];
}

type SlashMode =
  | { kind: 'closed' }
  | { kind: 'commands' }
  | { kind: 'projects'; command: SlashCommand };

// Fallback only — used while the team's personalized suggestions are still
// loading from `GET /api/chat`. Once `generateSuggestions()` returns its
// project-aware list (top risk, multi-project bet, GTM, PMF, competitor,
// pricing), we swap these out.
const DEFAULT_SUGGESTIONS = [
  'what should I focus on this week?',
  'how do I find my first 100 users?',
  'what risks am I underestimating?',
  'plan a launch for my best project',
];

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function teamSlug(name: string | undefined): string {
  if (!name) return 'team';
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 18) || 'team'
  );
}

export default function TerminalShell() {
  const { currentTeam, refreshProjects } = useTeam();
  const teamId = currentTeam?.id ?? null;
  const teamLabel = teamSlug(currentTeam?.name);
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  // ── Projects (for slash command project picker + greeting stats) ───
  // SWR-cached so switching to the Terminal tab doesn't re-fetch from scratch.
  const { data: projectsData, mutate: mutateProjects } = useSWR<ProjectLite[]>(
    teamId ? `/api/projects?teamId=${teamId}` : null,
  );
  const projects = useMemo<ProjectLite[]>(
    () => (Array.isArray(projectsData) ? projectsData : []),
    [projectsData],
  );
  // Imperative revalidate used by the send / conversation handlers below.
  const refreshTerminalProjects = mutateProjects;

  // ── Personalized suggestions ──────────────────────────────────────
  // Fetched from GET /api/chat — the server runs generateSuggestions()
  // which inspects each project's analysis (top risk, stage, competitors,
  // pricing, GTM) and yields up to 6 specific prompts. v1 mentor used the
  // exact same flow. Re-fetch when the project list size changes so adding
  // a project mid-session refreshes the suggestions.
  // SWR keyed by team + project count, so adding a project mid-session refreshes
  // the suggestions while revisiting the terminal serves them from cache instead
  // of re-hitting the LLM-backed endpoint. (Cache-buster removed — SWR owns
  // freshness now.)
  const { data: chatMeta } = useSWR<{ suggestions?: string[] }>(
    teamId ? (['/api/chat', teamId, projects.length] as const) : null,
    ([, tid]) => fetch(`/api/chat?teamId=${tid}`).then((r) => (r.ok ? r.json() : null)),
  );
  const suggestions = useMemo<string[]>(() => {
    const list = chatMeta?.suggestions;
    return Array.isArray(list) && list.length > 0 ? list : DEFAULT_SUGGESTIONS;
  }, [chatMeta]);

  // ── Conversations ─────────────────────────────────────────────────
  // SWR-cached so the conversation list is instant on return; handlers call
  // loadConversations() (→ revalidate) after creating/renaming/deleting.
  const { data: convData, mutate: mutateConversations } = useSWR<{ conversations?: Conversation[] }>(
    '/api/chat/conversations',
  );
  const conversations = useMemo<Conversation[]>(
    () => (Array.isArray(convData?.conversations) ? (convData!.conversations as Conversation[]) : []),
    [convData],
  );
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const loadConversations = useCallback(() => mutateConversations(), [mutateConversations]);

  // Deep-link from / home: ?c=<convId>&projectId=<id>
  const deepLinkConvId = searchParams?.get('c') ?? null;
  const deepLinkProjectId = searchParams?.get('projectId') ?? null;
  const activeProjectId = activeConvId
    ? conversations.find((c) => c.id === activeConvId)?.projectId ??
      deepLinkProjectId
    : deepLinkProjectId;
  const deepLinkAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkConvId) return;
    if (deepLinkAppliedRef.current === deepLinkConvId) return;
    if (conversations.some((c) => c.id === deepLinkConvId)) {
      deepLinkAppliedRef.current = deepLinkConvId;
      setActiveConvId(deepLinkConvId);
    }
  }, [deepLinkConvId, conversations]);

  // ── Messages ──────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    if (!activeConvId || !teamId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    fetch(
      `/api/chat?teamId=${teamId}&conversationId=${activeConvId}`,
      { cache: 'no-store' },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const history: Message[] = Array.isArray(data?.history)
          ? data.history
          : [];
        setMessages(history);
        setHistoryLoading(false);
      })
      .catch(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeConvId, teamId]);

  // ── Input + streaming ─────────────────────────────────────────────
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showScrollPill, setShowScrollPill] = useState(false);
  // Banner status dot — three states:
  // - idle → solid pink with glow (stable on)
  // - key currently pressed on the input → off
  // - streaming → pulsing pink (blink + lit)
  const [keyDown, setKeyDown] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Per-character typewriter (preserves the alive feel of the original mentor).
  const charQueueRef = useRef<string[]>([]);
  const typeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamDoneRef = useRef(false);

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
          if (typeIntervalRef.current) {
            clearInterval(typeIntervalRef.current);
            typeIntervalRef.current = null;
          }
          onDone();
        }
        return;
      }
      const batch = streamDoneRef.current ? Math.min(queue.length, 6) : 1;
      const chars = queue.splice(0, batch).join('');
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (!last) return [{ role: 'assistant', content: chars, ts: Date.now() }];
        updated[updated.length - 1] = {
          ...last,
          content: last.content + chars,
        };
        return updated;
      });
    }, 12);
  }, []);

  useEffect(() => () => stopTypewriter(), [stopTypewriter]);

  const scrollToBottom = useCallback((opts: { force?: boolean } = {}) => {
    const c = messagesContainerRef.current;
    if (!c) return;
    const distanceFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
    if (opts.force || distanceFromBottom < 80) {
      messagesEndRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const c = messagesContainerRef.current;
    if (!c) return;
    const onScroll = () => {
      const distanceFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
      setShowScrollPill(distanceFromBottom > 200);
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => c.removeEventListener('scroll', onScroll);
  }, [messages.length]);

  // ── Slash palette ─────────────────────────────────────────────────
  const [slashMode, setSlashMode] = useState<SlashMode>({ kind: 'closed' });
  const [slashIndex, setSlashIndex] = useState(0);

  const slashCmdMatches = useMemo<SlashCommand[]>(() => {
    if (slashMode.kind !== 'commands') return [];
    const token = input.trim().split(' ')[0] || '/';
    return filterCommands(token);
  }, [input, slashMode.kind]);

  const slashProjectMatches = useMemo<ProjectLite[]>(() => {
    if (slashMode.kind !== 'projects') return [];
    const head = input.trim().split(' ')[0];
    const query = input
      .trim()
      .slice(head.length)
      .trim()
      .toLowerCase();
    if (!query) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(query));
  }, [input, projects, slashMode.kind]);

  const closeSlash = useCallback(() => {
    setSlashMode({ kind: 'closed' });
    setSlashIndex(0);
  }, []);

  // ── Conversation drawer (Cmd+P) ───────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Send / stream ─────────────────────────────────────────────────
  const deleteCurrentChat = useCallback(async () => {
    if (streaming || !activeConvId) return;
    try {
      await fetch(`/api/chat?conversationId=${activeConvId}`, {
        method: 'DELETE',
      });
      setMessages([]);
      setActiveConvId(null);
      await loadConversations();
      addToast('conversation cleared', 'success');
    } catch {
      addToast('clear failed', 'error');
    }
  }, [streaming, activeConvId, loadConversations, addToast]);

  const newConversation = useCallback(() => {
    if (streaming) return;
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    setTimeout(() => textareaRef.current?.focus(), 30);
  }, [streaming]);

  const send = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || !teamId || streaming) return;

      const parsed = parseCommand(trimmed);

      if (parsed.kind === 'local') {
        if (parsed.command.name === '/clear') {
          setInput('');
          await deleteCurrentChat();
          return;
        }
        if (parsed.command.name === '/history') {
          setInput('');
          setDrawerOpen(true);
          return;
        }
        if (parsed.command.name === '/help') {
          setInput('');
          const helpLines = SLASH_COMMANDS.map(
            (c) => `- **${c.name}** — ${c.description}`,
          ).join('\n');
          const helpMsg: Message = {
            role: 'assistant',
            content: `**Terminal commands**\n${helpLines}\n\nFree-text input is sent to Recgon as a natural-language question.`,
            ts: Date.now(),
          };
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: trimmed, ts: Date.now() },
            helpMsg,
          ]);
          return;
        }
      }

      const apiText = parsed.kind === 'free' ? parsed.apiText : parsed.kind === 'slash' ? parsed.apiText : trimmed;

      const userMsg: Message = { role: 'user', content: trimmed, ts: Date.now() };
      const newHistory = [...messages, userMsg];
      setMessages([
        ...newHistory,
        { role: 'assistant', content: '', ts: Date.now() },
      ]);
      setInput('');
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: apiText,
            history: messages,
            teamId,
            conversationId: activeConvId,
            projectId: activeProjectId,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: 'connection failed. try again?',
              ts: Date.now(),
            };
            return updated;
          });
          setStreaming(false);
          return;
        }

        const newConvId =
          res.headers.get('x-conversation-id') ??
          res.headers.get('X-Conversation-Id');
        if (newConvId && newConvId !== activeConvId) {
          setActiveConvId(newConvId);
          loadConversations();
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        streamDoneRef.current = false;
        startTypewriter(() => setStreaming(false));

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          charQueueRef.current.push(...chunk.split(''));
        }

        streamDoneRef.current = true;
        loadConversations();
        refreshTerminalProjects();
        refreshProjects();
      } catch (err) {
        stopTypewriter();
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: 'connection lost mid-response. try again?',
              ts: Date.now(),
            };
            return updated;
          });
        }
        setStreaming(false);
      } finally {
        abortRef.current = null;
      }
    },
    [
      teamId,
      messages,
      streaming,
      activeConvId,
      activeProjectId,
      loadConversations,
      deleteCurrentChat,
      refreshTerminalProjects,
      refreshProjects,
      startTypewriter,
      stopTypewriter,
    ],
  );

  // Handoff prefill from home page (sessionStorage). Reads the new key,
  // falls back to legacy `mentor:prefill` for one release cycle so any
  // tab that hopped between versions still gets the handoff.
  useEffect(() => {
    if (!teamId) return;
    let prefill: string | null = null;
    try {
      prefill =
        sessionStorage.getItem('terminal:prefill') ??
        sessionStorage.getItem('mentor:prefill');
    } catch {
      return;
    }
    if (!prefill) return;
    try {
      sessionStorage.removeItem('terminal:prefill');
      sessionStorage.removeItem('mentor:prefill');
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      void send(prefill!);
    }, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // Stop streaming.
  const stop = () => {
    abortRef.current?.abort();
    stopTypewriter();
    setStreaming(false);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Slash command palette: project picker stage — submitting selects.
    if (slashMode.kind === 'projects' && slashProjectMatches[slashIndex]) {
      const p = slashProjectMatches[slashIndex];
      send(`${slashMode.command.name} ${p.name}`);
      closeSlash();
      return;
    }
    // Slash command palette: command stage — if a command needs a project
    // and the user pressed Enter, swap to project picker instead of sending.
    if (slashMode.kind === 'commands' && slashCmdMatches[slashIndex]) {
      const cmd = slashCmdMatches[slashIndex];
      const trailing = input.split(' ').slice(1).join(' ').trim();
      if (cmd.argHint === 'project' && !trailing) {
        setInput(cmd.name + ' ');
        setSlashMode({ kind: 'projects', command: cmd });
        setSlashIndex(0);
        return;
      }
      send(trailing ? `${cmd.name} ${trailing}` : cmd.name);
      closeSlash();
      return;
    }
    send(input);
  };

  const onChangeInput = (val: string) => {
    setInput(val);
    setSlashIndex(0);

    if (slashMode.kind === 'projects') {
      // Stay in project picker as long as the prefix command is still there.
      if (!val.startsWith(slashMode.command.name + ' ')) {
        closeSlash();
      }
      return;
    }

    if (val.startsWith('/') && !val.includes(' ')) {
      setSlashMode({ kind: 'commands' });
    } else {
      setSlashMode({ kind: 'closed' });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Track held-key state for the banner status dot — dot turns OFF
    // while a key is held down, ON when released, pulses while streaming.
    setKeyDown(true);

    // Slash commands palette
    if (slashMode.kind === 'commands' && slashCmdMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashCmdMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(
          (i) => (i - 1 + slashCmdMatches.length) % slashCmdMatches.length,
        );
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = slashCmdMatches[slashIndex];
        if (cmd) setInput(cmd.name + (cmd.argHint === 'none' ? '' : ' '));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSlash();
        return;
      }
    }

    // Project picker palette
    if (slashMode.kind === 'projects' && slashProjectMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashProjectMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(
          (i) =>
            (i - 1 + slashProjectMatches.length) % slashProjectMatches.length,
        );
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const p = slashProjectMatches[slashIndex];
        if (p) setInput(`${slashMode.command.name} ${p.name}`);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSlash();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  // ── Cmd+P (history drawer). preventDefault to override browser print. ──
  // Plus Escape during streaming to stop. The textarea is disabled while
  // streaming so it can't catch the key — needs a window-level listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setDrawerOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape' && streaming) {
        e.preventDefault();
        abortRef.current?.abort();
        stopTypewriter();
        setStreaming(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [streaming, stopTypewriter]);

  // ── Render ────────────────────────────────────────────────────────
  const isFresh = messages.length === 0 && !historyLoading;
  const stats = useMemo(
    () => ({
      total: projects.length,
      analyzed: projects.filter((p) => p.analysis).length,
      campaigns: projects.reduce(
        (acc, p) => acc + (p.marketingContent?.length ?? 0),
        0,
      ),
    }),
    [projects],
  );

  // Group messages into "turns" so we can drop an ASCII rule between them.
  const turns = useMemo(() => {
    const out: { user: Message; assistant?: Message }[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'user') {
        const next = messages[i + 1];
        if (next && next.role === 'assistant') {
          out.push({ user: m, assistant: next });
          i++;
        } else {
          out.push({ user: m });
        }
      } else {
        out.push({ user: { role: 'user', content: '', ts: m.ts }, assistant: m });
      }
    }
    return out;
  }, [messages]);

  const promptPrefix = `recgon@${teamLabel}:~$`;
  const activeConv = activeConvId
    ? conversations.find((c) => c.id === activeConvId)
    : null;

  return (
    <>
      <div className="terminal-shell" data-streaming={streaming || undefined}>
        {/* Stream — fills the shell. Banner, content, and active prompt
            all live here as flowing text. No bordered header, no separate
            input bar — like a real terminal. */}
        <div className="terminal-stream" ref={messagesContainerRef}>
          {/* One-line banner — title + clickable session controls.
              Non-technical users can use the icons; keyboard users get ⌘P. */}
          <div className="terminal-banner">
            <span
              className={`terminal-banner-mark ${
                streaming ? 'is-streaming' : keyDown ? 'is-off' : ''
              }`}
              aria-hidden="true"
            >
              ●
            </span>
            <span className="terminal-banner-title">recgon</span>
            <span className="terminal-banner-spacer" />
            <button
              type="button"
              className="terminal-banner-btn"
              onClick={() => setDrawerOpen(true)}
              title="Open sessions (⌘P)"
              aria-label="Open sessions"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3v5h5" />
                <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                <path d="M12 7v5l4 2" />
              </svg>
              <span className="terminal-banner-btn-label">
                {activeConv ? activeConv.title : 'sessions'}
              </span>
              <span className="terminal-banner-kbd">⌘P</span>
            </button>
            <button
              type="button"
              className="terminal-banner-icon-btn"
              onClick={newConversation}
              title="New session"
              aria-label="New session"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {historyLoading ? (
            <div className="terminal-loading">
              <span className="terminal-loading-mark">›</span>
              <span>loading conversation…</span>
            </div>
          ) : isFresh ? (
            <div className="terminal-empty">
              <div className="terminal-line is-input">
                <span className="terminal-prompt">{promptPrefix}</span>
                <span className="terminal-empty-stats">
                  <strong>{stats.total}</strong>
                  <span>projects</span>
                  <strong>{stats.analyzed}</strong>
                  <span>analyzed</span>
                  <strong>{stats.campaigns}</strong>
                  <span>campaigns</span>
                </span>
              </div>
              <div className="terminal-line is-output">
                <span className="terminal-prompt">→</span>
                <span className="terminal-empty-greet">
                  welcome. type{' '}
                  <span style={{ color: 'var(--signature)', fontWeight: 700 }}>
                    /help
                  </span>{' '}
                  for commands, or just ask anything.
                </span>
              </div>

              <div className="terminal-empty-hint">
                {projects.length === 0
                  ? '# try:'
                  : '# tailored to your projects:'}
              </div>
              <div className="terminal-suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="terminal-suggestion"
                    onClick={() => send(s)}
                    disabled={!teamId || streaming}
                  >
                    <span className="terminal-suggestion-prompt">$</span>
                    <span>{s.replace(/\*\*/g, '')}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) => (
              <div key={i} className="terminal-turn">
                {i > 0 && <div className="terminal-rule" aria-hidden="true" />}
                {t.user.content && (
                  <div className="terminal-line is-input">
                    <span className="terminal-prompt">{promptPrefix}</span>
                    <span className="terminal-line-body">{t.user.content}</span>
                  </div>
                )}
                {t.assistant && (
                  <div className="terminal-line is-output">
                    <span className="terminal-prompt">→</span>
                    <span className="terminal-line-body">
                      {t.assistant.content ? (
                        <>
                          {t.assistant.content.split('\n').map((line, j) => (
                            <MarkdownLine
                              key={j}
                              text={cleanText(line)}
                              bulletClassName="terminal-bullet"
                              bulletMarkClassName="terminal-bullet-mark"
                              lineClassName="terminal-text-line"
                            />
                          ))}
                          {streaming && i === turns.length - 1 && (
                            <span
                              className="terminal-cursor"
                              aria-hidden="true"
                            />
                          )}
                        </>
                      ) : (
                        <span className="terminal-cursor" aria-hidden="true" />
                      )}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Active prompt — pinned above the status bar so the cursor sits
            at the bottom of the viewport like a real CLI. Outside the
            stream so it doesn't scroll with output. Inline styles force
            the flex layout regardless of cascade. */}
        {!historyLoading && (
          <form
            onSubmit={onSubmit}
            className="terminal-active-row"
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              margin: '10px 16px 14px',
              padding: '12px 18px',
              border: '1px solid rgba(255, 255, 255, 0.28)',
              borderRadius: 8,
              background: 'transparent',
              boxSizing: 'border-box',
            }}
          >
            <span
              className="terminal-active-prompt"
              aria-hidden="true"
              style={{ flexShrink: 0, lineHeight: 1.5 }}
            >
              {streaming ? <span className="terminal-active-spinner" /> : '>'}
            </span>
            <div
              className="terminal-active-input-wrap"
              style={{ flex: '1 1 0%', minWidth: 0, width: '100%' }}
            >
              {streaming ? (
                <span className="terminal-active-streaming">
                  running… press{' '}
                  <span style={{ color: 'var(--signature)', fontWeight: 700 }}>
                    esc
                  </span>{' '}
                  to stop
                </span>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => onChangeInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  onKeyUp={() => setKeyDown(false)}
                  onBlur={() => setKeyDown(false)}
                  placeholder={
                    teamId
                      ? "type a command or a question  ·  '/' for commands"
                      : 'loading team…'
                  }
                  disabled={!teamId}
                  rows={1}
                  className="terminal-textarea"
                  aria-label="Terminal input"
                  autoFocus
                  style={{
                    display: 'block',
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
          </form>
        )}

        {/* Status bar at the very bottom — shortcuts only, no panel chrome */}
        <div className="terminal-statusbar">
          <span className="terminal-statusbar-mark">●</span>
          <span>recgon@{teamLabel}</span>
          <div className="terminal-statusbar-spacer" />
          {streaming ? (
            <button
              type="button"
              className="terminal-statusbar-stop"
              onClick={stop}
            >
              esc to stop
            </button>
          ) : (
            <>
              <span className="terminal-statusbar-shortcut">
                <span className="terminal-statusbar-key">↵</span> run
              </span>
              <button
                type="button"
                className="terminal-statusbar-shortcut terminal-statusbar-btn"
                onClick={() => {
                  setInput('/');
                  setSlashMode({ kind: 'commands' });
                  textareaRef.current?.focus();
                }}
                title="Show slash commands"
              >
                <span className="terminal-statusbar-key">/</span> commands
              </button>
              <button
                type="button"
                className="terminal-statusbar-shortcut terminal-statusbar-btn"
                onClick={() => setDrawerOpen(true)}
                title="Open sessions (⌘P)"
              >
                <span className="terminal-statusbar-key">⌘P</span> history
              </button>
            </>
          )}
        </div>

        {/* Slash palette — fixed-position floating panel */}
        {slashMode.kind === 'commands' && slashCmdMatches.length > 0 && (
          <div className="terminal-slash" role="listbox">
            <div className="terminal-slash-head">
              <span className="terminal-slash-head-label">commands</span>
              <span className="terminal-slash-head-hint">
                ↑↓ navigate · ⇥ complete · ↵ run · esc close
              </span>
            </div>
            <ul className="terminal-slash-list">
              {slashCmdMatches.map((cmd, i) => (
                <li key={cmd.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === slashIndex}
                    className={`terminal-slash-item ${i === slashIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setSlashIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (cmd.argHint === 'project') {
                        setInput(cmd.name + ' ');
                        setSlashMode({ kind: 'projects', command: cmd });
                        setSlashIndex(0);
                      } else {
                        send(cmd.name);
                        closeSlash();
                      }
                    }}
                  >
                    <span className="terminal-slash-name">{cmd.name}</span>
                    <span className="terminal-slash-desc">
                      {cmd.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {slashMode.kind === 'projects' && (
          <div className="terminal-slash" role="listbox">
            <div className="terminal-slash-head">
              <span className="terminal-slash-head-label">
                pick a project for {slashMode.command.name}
              </span>
              <span className="terminal-slash-head-hint">
                ↑↓ navigate · ⇥ complete · ↵ run · esc close
              </span>
            </div>
            {slashProjectMatches.length === 0 ? (
              <div className="terminal-slash-empty">
                no projects match.{' '}
                {projects.length === 0 && 'create one from /projects.'}
              </div>
            ) : (
              <ul className="terminal-slash-list">
                {slashProjectMatches.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === slashIndex}
                      className={`terminal-slash-item ${i === slashIndex ? 'is-active' : ''}`}
                      onMouseEnter={() => setSlashIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        send(`${slashMode.command.name} ${p.name}`);
                        closeSlash();
                      }}
                    >
                      <span className="terminal-slash-project-name">
                        {p.name}
                      </span>
                      <span className="terminal-slash-project-meta">
                        {p.analysis ? 'analyzed' : 'unanalyzed'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showScrollPill && (
          <button
            type="button"
            className="terminal-scroll-pill"
            onClick={() => scrollToBottom({ force: true })}
          >
            ↓ latest
          </button>
        )}
      </div>

      <TerminalConversationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversations={conversations}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        activeId={activeConvId}
        onPick={(id) => setActiveConvId(id)}
        onNew={newConversation}
        onRename={async (id, title) => {
          try {
            const res = await fetch(`/api/chat/conversations/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title }),
            });
            if (!res.ok) throw new Error('failed');
            await loadConversations();
          } catch {
            addToast('rename failed', 'error');
          }
        }}
        onDelete={async (id) => {
          try {
            const res = await fetch(`/api/chat/conversations/${id}`, {
              method: 'DELETE',
            });
            if (!res.ok) throw new Error('failed');
            if (activeConvId === id) {
              setActiveConvId(null);
              setMessages([]);
            }
            addToast('session deleted', 'success');
            await loadConversations();
          } catch {
            addToast('delete failed', 'error');
          }
        }}
        onAssignProject={async (id, projectId) => {
          try {
            const res = await fetch(`/api/chat/conversations/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId }),
            });
            if (!res.ok) throw new Error('failed');
            await loadConversations();
            addToast(
              projectId ? 'assigned to project' : 'moved to general',
              'success',
            );
          } catch {
            addToast('assign failed', 'error');
          }
        }}
      />

      <style>{`
        .terminal-shell {
          /* Windowed terminal — floats below the top nav with breathing room
             on every side so the v2 page bg peeks through. Centered with a
             max-width so it doesn't stretch on wide monitors. */
          position: fixed;
          top: 104px;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          width: min(1280px, calc(100vw - 80px));
          display: grid;
          /* 3 rows: scrolling stream (1fr), active prompt (auto), status bar (auto).
             The active prompt is anchored to the bottom of the viewport — output
             scrolls in the stream above it, prompt stays put. Real-CLI feel. */
          grid-template-rows: minmax(0, 1fr) auto auto;
          grid-template-columns: minmax(0, 1fr);
          /* Neutral dark — true gray, no blue or purple cast. */
          background: #141414;
          color: var(--txt-pure);
          font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
          font-size: 13px;
          line-height: 1.6;
          z-index: 1;
          /* Squircle — larger continuous-curvature corners (macOS window feel).
             Hairline border defines the window shape. No shadow — clean. */
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          overflow: hidden;
          box-shadow: none;
        }
        html.light .terminal-shell,
        .light .terminal-shell {
          background: #ffffff;
          color: var(--txt-pure);
          border-color: rgba(0, 0, 0, 0.10);
          box-shadow: none;
        }
        @media (max-width: 720px) {
          .terminal-shell {
            top: 92px;
            bottom: 16px;
            width: calc(100vw - 16px);
            border-radius: 14px;
          }
        }

        .terminal-stream {
          overflow-y: auto;
          overflow-x: hidden;
          padding: 18px 24px 8px;
          scroll-behavior: smooth;
        }
        @media (max-width: 720px) {
          .terminal-stream { padding: 14px 14px 6px; }
        }
        .terminal-stream::-webkit-scrollbar { width: 8px; }
        .terminal-stream::-webkit-scrollbar-track { background: transparent; }
        .terminal-stream::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.06); border-radius: 4px; }
        .terminal-stream::-webkit-scrollbar-thumb:hover { background: rgba(var(--signature-rgb), 0.3); }
        html.light .terminal-stream::-webkit-scrollbar-thumb,
        .light .terminal-stream::-webkit-scrollbar-thumb { background: rgba(20, 14, 30, 0.08); }

        .terminal-banner {
          color: var(--txt-faint);
          font-size: 12px;
          letter-spacing: 0.2px;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .terminal-banner-mark {
          color: var(--signature);
          font-weight: 700;
          flex-shrink: 0;
          text-shadow: 0 0 6px var(--signature);
          transition: opacity 80ms ease;
        }
        /* Key currently pressed on the input → dot looks turned off (dim, no glow).
           Like an unlit LED — visible silhouette, not vanished. */
        .terminal-banner-mark.is-off {
          color: rgba(255, 255, 255, 0.20);
          text-shadow: none;
          opacity: 1;
        }
        html.light .terminal-banner-mark.is-off,
        .light .terminal-banner-mark.is-off {
          color: rgba(20, 14, 30, 0.25);
        }
        /* Recgon answering → pulse with glow. */
        .terminal-banner-mark.is-streaming {
          animation: terminal-dot-pulse 1.4s ease-in-out infinite;
        }
        @keyframes terminal-dot-pulse {
          0%, 100% { opacity: 0.55; text-shadow: 0 0 4px var(--signature); }
          50%      { opacity: 1;    text-shadow: 0 0 12px var(--signature), 0 0 18px var(--signature); }
        }
        .terminal-banner-title {
          flex-shrink: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .terminal-banner-spacer { flex: 1; }
        .terminal-banner-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          max-width: 280px;
          padding: 4px 8px 4px 9px;
          background: transparent;
          border: 1px solid var(--rule, rgba(255, 255, 255, 0.10));
          border-radius: 6px;
          color: var(--txt-muted);
          font-family: inherit;
          font-size: 11.5px;
          font-weight: 500;
          letter-spacing: 0.2px;
          cursor: pointer;
          transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
        }
        .terminal-banner-btn:hover {
          color: var(--txt-pure);
          border-color: rgba(var(--signature-rgb), 0.45);
          background: rgba(var(--signature-rgb), 0.06);
        }
        .terminal-banner-btn svg {
          color: var(--signature);
          opacity: 0.85;
          flex-shrink: 0;
        }
        .terminal-banner-btn-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .terminal-banner-kbd {
          font-family: inherit;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.4px;
          color: var(--txt-faint);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--rule, rgba(255, 255, 255, 0.08));
          border-radius: 3px;
          padding: 1px 4px;
          margin-left: 2px;
        }
        html.light .terminal-banner-kbd,
        .light .terminal-banner-kbd {
          background: rgba(20, 14, 30, 0.05);
        }
        .terminal-banner-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          padding: 0;
          background: transparent;
          border: 1px solid var(--rule, rgba(255, 255, 255, 0.10));
          border-radius: 6px;
          color: var(--txt-muted);
          cursor: pointer;
          transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
        }
        .terminal-banner-icon-btn:hover {
          color: var(--signature);
          border-color: rgba(var(--signature-rgb), 0.45);
          background: rgba(var(--signature-rgb), 0.08);
        }
        @media (max-width: 720px) {
          .terminal-banner-btn-label { display: none; }
          .terminal-banner-kbd { display: none; }
          .terminal-banner-btn { padding: 4px 7px; }
        }

        .terminal-turn + .terminal-turn { margin-top: 12px; }
        .terminal-line {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          column-gap: 10px;
          align-items: baseline;
        }
        .terminal-line + .terminal-line { margin-top: 4px; }

        .terminal-prompt {
          color: var(--signature);
          font-weight: 700;
          font-size: 13px;
          letter-spacing: -0.005em;
          white-space: nowrap;
          user-select: none;
        }
        .terminal-line.is-output .terminal-prompt {
          color: var(--signature);
          font-weight: 600;
          opacity: 0.9;
        }
        .terminal-line-body {
          min-width: 0;
          word-wrap: break-word;
          overflow-wrap: anywhere;
          color: var(--txt-pure);
        }
        .terminal-line.is-output .terminal-line-body { color: var(--txt-muted); }
        html.light .terminal-line.is-output .terminal-line-body,
        .light .terminal-line.is-output .terminal-line-body { color: var(--txt-muted); }
        .terminal-line.is-output .terminal-line-body strong,
        .terminal-line.is-output .terminal-line-body b { color: var(--txt-pure); }

        .terminal-bullet { display: grid; grid-template-columns: auto 1fr; gap: 9px; margin: 2px 0; }
        .terminal-bullet-mark { color: var(--signature); opacity: 0.85; }
        .terminal-text-line { display: block; }

        .terminal-rule { height: 0; border-top: 1px dashed rgba(255, 255, 255, 0.05); margin: 12px 0 10px; }
        html.light .terminal-rule, .light .terminal-rule { border-top-color: rgba(20, 14, 30, 0.06); }

        .terminal-cursor {
          display: inline-block;
          width: 7px;
          height: 1em;
          vertical-align: text-bottom;
          background: var(--signature);
          margin-left: 2px;
          animation: terminal-blink 1.05s steps(2, jump-none) infinite;
        }
        @keyframes terminal-blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }

        .terminal-empty { display: flex; flex-direction: column; gap: 4px; padding: 4px 0 12px; }
        .terminal-empty-stats { color: var(--txt-faint); font-size: 12.5px; }
        .terminal-empty-stats strong { color: var(--signature); font-weight: 700; margin-right: 4px; font-variant-numeric: tabular-nums; }
        .terminal-empty-stats strong + span { margin-right: 14px; }
        .terminal-empty-greet { color: var(--txt-pure); }
        .terminal-empty-hint { color: var(--txt-faint); font-size: 12px; margin: 14px 0 4px; letter-spacing: 0.3px; }
        .terminal-suggestions { display: flex; flex-direction: column; gap: 0; }
        .terminal-suggestion {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 10px;
          align-items: baseline;
          padding: 3px 0;
          border: none;
          background: transparent;
          color: var(--txt-muted);
          font-family: inherit;
          font-size: inherit;
          text-align: left;
          cursor: pointer;
          transition: color 120ms ease;
        }
        .terminal-suggestion:hover:not(:disabled) { color: var(--signature); }
        .terminal-suggestion:disabled { opacity: 0.4; cursor: not-allowed; }
        .terminal-suggestion-prompt { color: var(--signature); opacity: 0.55; user-select: none; }
        .terminal-loading { display: flex; align-items: baseline; gap: 10px; padding: 4px 0; color: var(--txt-faint); }
        .terminal-loading-mark { color: var(--signature); }

        .terminal-active-row {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 12px;
          /* Bordered input box matching Claude Code reference: clean hairline
             rectangle, generous internal padding, rounded corners. No focus
             color change — cursor is the focus indicator. */
          margin: 10px 16px 14px;
          padding: 12px 18px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 8px;
          background: transparent;
          box-sizing: border-box;
        }
        html.light .terminal-active-row,
        .light .terminal-active-row {
          border-color: rgba(0, 0, 0, 0.22);
        }
        @media (max-width: 720px) {
          .terminal-active-row { margin: 8px 10px 12px; padding: 10px 14px; }
        }
        /* Old class kept for any legacy usage; same layout. */
        .terminal-active {
          display: flex !important;
          flex-direction: row !important;
          align-items: flex-start !important;
          gap: 10px;
          margin: 16px 0 0;
          padding: 0;
          border: none;
          background: transparent;
          width: 100%;
        }
        .terminal-active-prompt {
          color: var(--signature);
          font-weight: 700;
          white-space: nowrap;
          user-select: none;
          flex-shrink: 0;
          flex-grow: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          line-height: 1.5;
          padding-top: 0;
        }
        .terminal-active-spinner {
          width: 9px;
          height: 9px;
          border: 1.5px solid rgba(var(--signature-rgb), 0.3);
          border-top-color: var(--signature);
          border-radius: 50%;
          animation: terminal-spin 0.7s linear infinite;
          display: inline-block;
        }
        @keyframes terminal-spin { to { transform: rotate(360deg); } }
        .terminal-active-input-wrap { flex: 1 1 0%; min-width: 0; display: block; width: 100%; }
        .terminal-textarea {
          display: block;
          background: transparent;
          border: none;
          outline: none;
          color: var(--txt-pure);
          font-family: inherit;
          font-size: inherit;
          font-weight: 500;
          letter-spacing: -0.005em;
          line-height: 1.5;
          resize: none;
          width: 100%;
          min-width: 0;
          min-height: 1.5em;
          max-height: 200px;
          padding: 0;
          margin: 0;
          caret-color: var(--signature);
          vertical-align: top;
          box-sizing: border-box;
        }
        .terminal-textarea::placeholder { color: var(--txt-faint); font-family: inherit; opacity: 0.7; }
        .terminal-textarea:disabled { opacity: 0.55; cursor: not-allowed; }
        .terminal-active-streaming {
          color: var(--txt-faint);
          font-style: normal;
          font-size: 12.5px;
          letter-spacing: 0.2px;
          display: block;
          padding-top: 1px;
        }

        .terminal-statusbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 8px 24px;
          font-size: 11px;
          color: var(--txt-faint);
          letter-spacing: 0.3px;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          background: rgba(0, 0, 0, 0.18);
          user-select: none;
          font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
        }
        html.light .terminal-statusbar, .light .terminal-statusbar {
          border-top-color: rgba(20, 14, 30, 0.06);
          background: rgba(20, 14, 30, 0.025);
        }
        @media (max-width: 720px) {
          .terminal-statusbar { padding: 6px 14px; gap: 10px; font-size: 10px; }
        }
        .terminal-statusbar-mark { color: var(--signature); font-weight: 700; opacity: 0.85; }
        .terminal-statusbar-spacer { flex: 1; }
        .terminal-statusbar-shortcut { display: inline-flex; align-items: center; gap: 5px; }
        .terminal-statusbar-key { color: var(--txt-muted); font-weight: 600; }
        .terminal-statusbar-stop {
          color: var(--signature);
          background: transparent;
          border: none;
          padding: 0;
          font-family: inherit;
          font-size: inherit;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: inherit;
        }
        .terminal-statusbar-stop:hover { text-decoration: underline; }
        .terminal-statusbar-btn {
          background: transparent;
          border: none;
          padding: 0;
          font-family: inherit;
          font-size: inherit;
          color: inherit;
          letter-spacing: inherit;
          cursor: pointer;
          transition: color 140ms ease;
        }
        .terminal-statusbar-btn:hover { color: var(--signature); }
        .terminal-statusbar-btn:hover .terminal-statusbar-key { color: var(--signature); }

        .terminal-slash {
          position: fixed;
          left: 32px;
          right: 32px;
          bottom: 72px;
          background: #1c1c1c;
          border: 1px solid rgba(var(--signature-rgb), 0.18);
          border-radius: 4px;
          padding: 8px;
          max-height: 280px;
          overflow-y: auto;
          border-radius: 12px;
          box-shadow: 0 -10px 28px -8px rgba(0, 0, 0, 0.55);
          z-index: 5;
          font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
        }
        html.light .terminal-slash, .light .terminal-slash {
          background: #ffffff;
          border-color: rgba(var(--signature-rgb), 0.22);
          box-shadow: 0 -8px 20px -6px rgba(60, 30, 50, 0.08);
        }
        @media (max-width: 720px) {
          .terminal-slash { left: 14px; right: 14px; bottom: 50px; }
        }
        .terminal-slash-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 4px 8px 8px;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.04);
          margin-bottom: 4px;
        }
        html.light .terminal-slash-head, .light .terminal-slash-head { border-bottom-color: rgba(20, 14, 30, 0.06); }
        .terminal-slash-head-label { font-size: 10px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: var(--signature); }
        .terminal-slash-head-hint { font-size: 10.5px; color: var(--txt-faint); }
        .terminal-slash-list { list-style: none; margin: 0; padding: 0; }
        .terminal-slash-item {
          width: 100%;
          display: grid;
          grid-template-columns: 130px 1fr;
          gap: 14px;
          align-items: baseline;
          padding: 5px 8px;
          background: transparent;
          border: none;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          color: var(--txt-muted);
          font-size: 12px;
        }
        .terminal-slash-item:hover, .terminal-slash-item.is-active {
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--txt-pure);
        }
        .terminal-slash-name { color: var(--signature); font-weight: 700; }
        .terminal-slash-desc { color: inherit; }
        .terminal-slash-project-name { color: var(--signature); font-weight: 700; }
        .terminal-slash-project-meta { color: var(--txt-faint); font-size: 10.5px; }
        .terminal-slash-empty { padding: 16px 12px; color: var(--txt-faint); font-size: 12px; text-align: center; }

        .terminal-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.50);
          z-index: 250;
          animation: terminal-fade 160ms ease both;
        }
        @keyframes terminal-fade { from { opacity: 0; } to { opacity: 1; } }
        .terminal-drawer {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(640px, calc(100vw - 32px));
          max-height: min(560px, calc(100vh - 64px));
          background: #1c1c1c;
          border: 1px solid rgba(var(--signature-rgb), 0.22);
          border-radius: 14px;
          box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          z-index: 251;
          font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
          animation: terminal-pop 160ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        html.light .terminal-drawer, .light .terminal-drawer {
          background: #ffffff;
          border-color: rgba(var(--signature-rgb), 0.30);
          box-shadow: 0 24px 48px -16px rgba(60, 30, 50, 0.18);
        }
        @keyframes terminal-pop {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .terminal-drawer-head {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
        }
        html.light .terminal-drawer-head, .light .terminal-drawer-head { border-bottom-color: rgba(20, 14, 30, 0.08); }
        .terminal-drawer-search {
          flex: 1; background: transparent; border: none; outline: none;
          color: var(--txt-pure); font-family: inherit; font-size: 13px;
        }
        .terminal-drawer-search::placeholder { color: var(--txt-faint); }
        .terminal-drawer-list { flex: 1; overflow-y: auto; padding: 4px; }
        .terminal-drawer-section-label {
          display: block; padding: 8px 8px 4px; font-size: 9.5px;
          font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase;
          color: var(--signature);
        }
        .terminal-drawer-row {
          display: grid; grid-template-columns: 1fr auto; gap: 10px;
          align-items: center; width: 100%; padding: 0 8px;
          color: var(--txt-muted); font-family: inherit; font-size: 12.5px;
          border-radius: 6px;
        }
        .terminal-drawer-row:hover, .terminal-drawer-row.is-active {
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--txt-pure);
        }
        .terminal-drawer-row-main {
          display: block; width: 100%; padding: 6px 0;
          background: transparent; border: none; text-align: left; cursor: pointer;
          color: inherit; font-family: inherit; font-size: inherit;
          overflow: hidden;
        }
        .terminal-drawer-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
        .terminal-drawer-row-actions {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 0;
        }
        .terminal-drawer-row-time { color: var(--txt-faint); font-size: 10.5px; font-variant-numeric: tabular-nums; }
        .terminal-drawer-row-current {
          color: var(--signature); font-size: 10px; font-weight: 700;
          letter-spacing: 0.6px; text-transform: uppercase; margin-right: 4px;
        }
        .terminal-drawer-row-action {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px;
          background: transparent; border: 1px solid rgba(var(--signature-rgb), 0.25);
          color: var(--txt-muted); font-family: inherit; font-size: 12px;
          border-radius: 4px; cursor: pointer; line-height: 1;
          transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
        }
        .terminal-drawer-row-action:hover {
          color: var(--signature);
          background: rgba(var(--signature-rgb), 0.10);
          border-color: rgba(var(--signature-rgb), 0.45);
        }
        .terminal-drawer-row-action.is-danger:hover {
          color: var(--v2-danger, #dc2626);
          border-color: var(--v2-danger, #dc2626);
          background: rgba(220, 38, 38, 0.10);
        }
        .terminal-drawer-rename-input {
          width: 100%; padding: 5px 0;
          background: transparent; border: none; outline: none;
          color: var(--txt-pure); font-family: inherit; font-size: inherit;
          border-bottom: 1px dashed rgba(var(--signature-rgb), 0.45);
          caret-color: var(--signature);
        }
        .terminal-drawer-assign {
          position: absolute;
          top: 100%;
          right: 8px;
          z-index: 5;
          margin-top: 4px;
          min-width: 200px;
          background: #1c1c1c;
          border: 1px solid rgba(var(--signature-rgb), 0.25);
          border-radius: 8px;
          padding: 6px;
          box-shadow: 0 12px 28px -8px rgba(0, 0, 0, 0.55);
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        html.light .terminal-drawer-assign,
        .light .terminal-drawer-assign {
          background: #ffffff;
          border-color: rgba(var(--signature-rgb), 0.30);
          box-shadow: 0 10px 22px -6px rgba(60, 30, 50, 0.16);
        }
        .terminal-drawer-assign-label {
          padding: 6px 8px 4px;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--signature);
        }
        .terminal-drawer-assign-row {
          display: grid; grid-template-columns: 16px 1fr; gap: 8px;
          align-items: center; width: 100%; padding: 5px 8px;
          background: transparent; border: none; text-align: left; cursor: pointer;
          color: var(--txt-muted); font-family: inherit; font-size: 12px;
          border-radius: 4px;
        }
        .terminal-drawer-assign-row:hover {
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--txt-pure);
        }
        .terminal-drawer-assign-row.is-current {
          color: var(--signature);
        }
        .terminal-drawer-assign-mark {
          color: var(--signature); font-weight: 700;
          font-family: inherit;
        }
        .terminal-drawer-assign-empty {
          padding: 10px 8px;
          color: var(--txt-faint);
          font-size: 11px;
          text-align: center;
        }
        .terminal-drawer-empty { padding: 22px 12px; text-align: center; color: var(--txt-faint); font-size: 12.5px; }
        .terminal-drawer-foot {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 14px; border-top: 1px dashed rgba(255, 255, 255, 0.06);
          font-size: 10.5px; color: var(--txt-faint);
        }
        html.light .terminal-drawer-foot, .light .terminal-drawer-foot { border-top-color: rgba(20, 14, 30, 0.08); }
        .terminal-drawer-new {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 8px; background: transparent; color: var(--signature);
          border: 1px dashed rgba(var(--signature-rgb), 0.40);
          font-family: inherit; font-size: 11px; font-weight: 700;
          letter-spacing: 0.5px; text-transform: lowercase; cursor: pointer;
        }
        .terminal-drawer-new:hover { background: rgba(var(--signature-rgb), 0.10); }

        .terminal-scroll-pill {
          position: fixed; right: 24px; bottom: 60px;
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; background: transparent;
          border: 1px dashed rgba(var(--signature-rgb), 0.4);
          color: var(--signature);
          font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
          font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
          text-transform: lowercase; border-radius: 4px; cursor: pointer; z-index: 4;
        }
        .terminal-scroll-pill:hover { background: rgba(var(--signature-rgb), 0.10); }
      `}</style>
    </>
  );
}
