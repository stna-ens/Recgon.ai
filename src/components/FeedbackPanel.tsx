'use client';

import { useState } from 'react';

interface DevPromptProps {
  prompt: string;
  index: number;
}

function DevPrompt({ prompt, index }: DevPromptProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dev-prompt" onClick={handleCopy}>
      <button className="copy-btn">{copied ? '✓' : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>}</button>
      <div className="dev-prompt-label">Prompt #{index + 1}</div>
      <div className="dev-prompt-text">{prompt}</div>
    </div>
  );
}

interface FeedbackPanelProps {
  sentiment: string;
  sentimentBreakdown?: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
}

export default function FeedbackPanel({
  sentiment,
  sentimentBreakdown,
  themes,
  featureRequests,
  bugs,
  praises,
  developerPrompts,
}: FeedbackPanelProps) {
  const sentimentColor = {
    positive: 'var(--success)',
    negative: 'var(--danger)',
    neutral: 'var(--warning)',
    mixed: 'var(--info)',
  }[sentiment] || 'var(--text-muted)';

  return (
    <div>
      {/* Sentiment Overview */}
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sentiment Analysis</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div
            className="sentiment-dot"
            style={{ background: sentimentColor, width: 12, height: 12 }}
          />
          <span style={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize', color: sentimentColor }}>
            {sentiment}
          </span>
        </div>
        {sentimentBreakdown && (
          <div style={{ display: 'flex', gap: 12, height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
            <div style={{ width: `${sentimentBreakdown.positive}%`, background: 'var(--success)', borderRadius: 3, transition: 'width 0.5s ease', transform: 'translate3d(0,0,0)' }} />
            <div style={{ width: `${sentimentBreakdown.neutral}%`, background: 'var(--warning)', borderRadius: 3, transition: 'width 0.5s ease', transform: 'translate3d(0,0,0)' }} />
            <div style={{ width: `${sentimentBreakdown.negative}%`, background: 'var(--danger)', borderRadius: 3, transition: 'width 0.5s ease', transform: 'translate3d(0,0,0)' }} />
          </div>
        )}
        {sentimentBreakdown && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--success)' }}>Positive {sentimentBreakdown.positive}%</span>
            <span>Neutral {sentimentBreakdown.neutral}%</span>
            <span style={{ color: 'var(--danger)' }}>Negative {sentimentBreakdown.negative}%</span>
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Themes */}
        <div className="glass-card">
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Key Themes</h4>
          <div className="tags-row">
            {themes.map((theme) => (
              <span key={theme} className="tag">{theme}</span>
            ))}
          </div>
        </div>

        {/* Praises */}
        <div className="glass-card">
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>What Users Love</h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {praises.map((praise, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, paddingLeft: 16, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0 }}>•</span>
                {praise}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Feature Requests */}
        <div className="glass-card">
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Feature Requests</h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {featureRequests.map((req, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, paddingLeft: 16, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--info)' }}>→</span>
                {req}
              </li>
            ))}
          </ul>
        </div>

        {/* Bugs */}
        <div className="glass-card">
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Bug Reports</h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {bugs.map((bug, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, paddingLeft: 16, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--danger)' }}>!</span>
                {bug}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Developer Prompts */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Developer Prompts</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Click any prompt to copy it. Give these directly to your AI coding agent.
        </p>
        {developerPrompts.map((prompt, i) => (
          <DevPrompt key={i} prompt={prompt} index={i} />
        ))}
      </div>
    </div>
  );
}
