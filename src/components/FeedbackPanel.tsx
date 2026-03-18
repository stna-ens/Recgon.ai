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
      <button className="copy-btn">{copied ? '✓ copied' : 'copy'}</button>
      <div className="dev-prompt-label">prompt_{index + 1}</div>
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
    neutral: 'var(--txt-muted)',
    mixed: 'var(--warning)',
  }[sentiment] || 'var(--txt-muted)';

  return (
    <div>
      {/* Sentiment Overview */}
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <span className="recgon-label">Sentiment Analysis</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: sentimentColor, boxShadow: `0 0 6px ${sentimentColor}` }} />
          <span style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize', color: sentimentColor, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
            {sentiment}
          </span>
        </div>
        {sentimentBreakdown && (
          <div style={{ display: 'flex', gap: 3, height: 5, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${sentimentBreakdown.positive}%`, background: 'var(--success)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${sentimentBreakdown.neutral}%`, background: 'var(--btn-secondary-border)', transition: 'width 0.5s ease' }} />
            <div style={{ width: `${sentimentBreakdown.negative}%`, background: 'var(--danger)', transition: 'width 0.5s ease' }} />
          </div>
        )}
        {sentimentBreakdown && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
            <span style={{ color: 'var(--success)' }}>{sentimentBreakdown.positive}% positive</span>
            <span style={{ color: 'var(--txt-muted)' }}>{sentimentBreakdown.neutral}% neutral</span>
            <span style={{ color: 'var(--danger)' }}>{sentimentBreakdown.negative}% negative</span>
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="glass-card">
          <span className="recgon-label">Key Themes</span>
          <div className="tags-row">
            {themes.map((theme) => (
              <span key={theme} className="tag">{theme}</span>
            ))}
          </div>
        </div>

        <div className="glass-card">
          <span className="recgon-label">What Users Love</span>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {praises.map((praise, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--txt-pure)', marginBottom: 8, paddingLeft: 18, position: 'relative', lineHeight: 1.6 }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--signature)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>›</span>
                {praise}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="glass-card">
          <span className="recgon-label">Feature Requests</span>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {featureRequests.map((req, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--txt-pure)', marginBottom: 8, paddingLeft: 18, position: 'relative', lineHeight: 1.6 }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--signature)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>›</span>
                {req}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-card">
          <span className="recgon-label">Bug Reports</span>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {bugs.map((bug, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--txt-pure)', marginBottom: 8, paddingLeft: 18, position: 'relative', lineHeight: 1.6 }}>
                <span style={{ position: 'absolute', left: 0, color: 'var(--danger)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>!</span>
                {bug}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <span className="recgon-label">Developer Prompts</span>
        <p style={{ fontSize: 13, color: 'var(--txt-muted)', marginBottom: 16, marginTop: -8 }}>
          Click any prompt to copy — paste directly into your AI coding agent.
        </p>
        {developerPrompts.map((prompt, i) => (
          <DevPrompt key={i} prompt={prompt} index={i} />
        ))}
      </div>
    </div>
  );
}
