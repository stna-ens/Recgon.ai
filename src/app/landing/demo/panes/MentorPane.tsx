'use client';

import { useState } from 'react';
import RecgonLogo from '@/components/RecgonLogo';
import { cannedPairs, type ChatTurn } from '../mockData';

export default function MentorPane() {
  const [thread, setThread] = useState<ChatTurn[]>([]);
  const [usedIdx, setUsedIdx] = useState<Set<number>>(new Set());

  const ask = (idx: number) => {
    const p = cannedPairs[idx];
    setThread((t) => [...t, { role: 'user', text: p.question }, { role: 'assistant', text: p.answer }]);
    setUsedIdx((s) => new Set(s).add(idx));
  };

  const available = cannedPairs.map((_, i) => i).filter((i) => !usedIdx.has(i));

  return (
    <div>
      <div
        className="glass-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 500,
          padding: 0,
          overflow: 'hidden',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 24px', borderBottom: '1px solid var(--btn-secondary-border)',
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: 'var(--signature)',
            boxShadow: '0 0 6px var(--signature)',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.3px' }}>Terminal</span>
          <span style={{ fontSize: 12, color: 'var(--txt-faint)' }}>—</span>
          <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>mentor</span>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-faint)' }}>
            2 projects loaded
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, minHeight: 340, maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {thread.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '18px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--signature)' }}>
                  <RecgonLogo size={13} uid="demo-greeting-avatar" />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>RECGON</span>
                </div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--signature)' }}>2</span>
                  <span style={{ color: 'var(--txt-faint)' }}> projects  </span>
                  <span style={{ color: 'var(--signature)' }}>2</span>
                  <span style={{ color: 'var(--txt-faint)' }}> analyzed  </span>
                  <span style={{ color: 'var(--signature)' }}>3</span>
                  <span style={{ color: 'var(--txt-faint)' }}> campaigns  </span>
                  <span style={{ color: 'var(--signature)' }}>1</span>
                  <span style={{ color: 'var(--txt-faint)' }}> feedback</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--txt-pure)', marginTop: 8 }}>How can I help?</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', padding: '7px 24px 0' }}>
                {available.slice(0, 6).map((i) => (
                  <button key={i} className="chat-suggestion" onClick={() => ask(i)}>
                    <span className="chat-suggestion-prefix">›</span>
                    {cannedPairs[i].question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.map((turn, i) => (
            <div key={i} className={turn.role === 'user' ? 'chat-line-user' : 'chat-line-assistant'}>
              {turn.role === 'user' ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: 'var(--signature)', userSelect: 'none' }}>›</span>
                  <span>{turn.text}</span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--signature)' }}>
                    <RecgonLogo size={13} uid={`demo-avatar-${i}`} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>RECGON</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {turn.text.split(/(\*\*.+?\*\*)/g).map((part, j) =>
                      part.startsWith('**') && part.endsWith('**')
                        ? <strong key={j}>{part.slice(2, -2)}</strong>
                        : <span key={j}>{part}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {thread.length > 0 && available.length > 0 && (
            <div style={{ padding: '4px 24px 16px', display: 'flex', flexDirection: 'column' }}>
              {available.slice(0, 4).map((i) => (
                <button key={i} className="chat-suggestion" onClick={() => ask(i)}>
                  <span className="chat-suggestion-prefix">›</span>
                  {cannedPairs[i].question}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input (disabled) */}
        <div style={{
          borderTop: '1px solid var(--btn-secondary-border)',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', flexShrink: 0,
        }}>
          <span className="chat-input-prefix">›</span>
          <input
            disabled
            placeholder="sign up to chat freely →"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--txt-faint)',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 13.5, marginLeft: 4,
            }}
          />
        </div>
      </div>
    </div>
  );
}
