'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import StatsCard from '@/components/StatsCard';
import RecgonLogo from '@/components/RecgonLogo';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Project {
  name: string;
  analysis?: unknown;
  marketingContent?: unknown[];
  feedbackAnalyses?: unknown[];
}

const SUGGESTIONS = [
  'What is the main selling point of my projects?',
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
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [keyDown, setKeyDown] = useState(false);
  const [recentlyTyped, setRecentlyTyped] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.ok ? r.json() : [])
      .then(setProjects)
      .catch(() => {});
  }, []);

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
    if (!trimmed || streaming) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMsg]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history: messages }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Chat failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `Sorry, something went wrong: ${(err as Error).message}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

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
      {/* Chat */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 600, padding: 0, overflow: 'hidden', marginBottom: 24, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>

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
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.3px' }}>Recgon</span>
          <span style={{ fontSize: 12, color: 'var(--txt-faint)' }}>—</span>
          <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>AI entrepreneur advisor</span>
          {hasProjects && (
            <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--txt-faint)' }}>
              {projects.length} project{projects.length > 1 ? 's' : ''} loaded
            </span>
          )}
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} style={{ flex: 1, minHeight: 400, maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 24px' }}>
              <p style={{ fontSize: 13, color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", marginBottom: 20 }}>
                {hasProjects
                  ? `// ${projects.length} project${projects.length > 1 ? 's' : ''} in context — ask anything`
                  : '// no projects analyzed yet — add a project for context-aware advice'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {SUGGESTIONS.map((s) => (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <RecgonLogo size={13} uid={`avatar-${i}`} />
                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: 'var(--txt-muted)', letterSpacing: '0.5px' }}>RECGON</span>
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
            disabled={streaming}
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

      {/* Stats */}
      <div className="stats-grid">
        <StatsCard
          icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}
          value={stats.totalProjects}
          label="Projects"
        />
        <StatsCard
          icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
          value={stats.analyzedProjects}
          label="Analyzed"
        />
        <StatsCard
          icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><circle cx="12" cy="12" r="3"/></svg>}
          value={stats.marketingCampaigns}
          label="Campaigns"
        />
        <StatsCard
          icon={<svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
          value={stats.feedbackAnalyses}
          label="Feedback Reports"
        />
      </div>
    </div>
  );
}
