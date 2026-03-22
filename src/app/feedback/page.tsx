'use client';

import { useState, useEffect } from 'react';
import FeedbackPanel from '@/components/FeedbackPanel';
import Select from '@/components/Select';

interface FeedbackResult {
  overallSentiment: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
}

interface Project {
  id: string;
  name: string;
}

interface HistoryEntry {
  id: string;
  projectId: string;
  projectName: string;
  sentiment: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
  rawFeedback: string[];
  analyzedAt: string;
}

type Mode = 'auto' | 'manual';

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#10b981',
  negative: '#ef4444',
  mixed: '#f59e0b',
  neutral: '#6b7280',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function FeedbackPage() {
  const [mode, setMode] = useState<Mode>('auto');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Auto mode
  const [profileUrl, setProfileUrl] = useState('');
  const [autoLoading, setAutoLoading] = useState(false);
  const [fetchedComments, setFetchedComments] = useState<string[] | null>(null);

  // Manual mode
  const [feedbackText, setFeedbackText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState('');
  const [savedToProject, setSavedToProject] = useState(false);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/projects').then((r) => r.ok ? r.json() : []).then(setProjects).catch(() => {});
    loadHistory();
  }, []);

  function loadHistory() {
    fetch('/api/feedback/history').then((r) => r.ok ? r.json() : []).then(setHistory).catch(() => {});
  }

  // ── Auto mode ────────────────────────────────────────────────────────────────
  const handleAutoAnalyze = async () => {
    if (!profileUrl.trim()) return;
    setAutoLoading(true);
    setError('');
    setResult(null);
    setFetchedComments(null);
    setSavedToProject(false);

    try {
      const res = await fetch('/api/feedback/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl, projectId: selectedProjectId || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Auto analysis failed');
      }
      const data = await res.json();
      setFetchedComments(data.comments);
      setResult(data.analysis);
      if (selectedProjectId) {
        setSavedToProject(true);
        loadHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto analysis failed');
    } finally {
      setAutoLoading(false);
    }
  };

  // ── Manual mode ───────────────────────────────────────────────────────────────
  const handleManualAnalyze = async () => {
    const items = feedbackText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (items.length === 0) return;

    setAnalyzing(true);
    setError('');
    setResult(null);
    setSavedToProject(false);

    try {
      const res = await fetch('/api/feedback/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: items, projectId: selectedProjectId || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Analysis failed');
      }
      setResult(await res.json());
      if (selectedProjectId) {
        setSavedToProject(true);
        loadHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum size is 5 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).map((l) => l.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
      const isHeader = lines[0] && /^(feedback|comment|review|text|message)$/i.test(lines[0]);
      setFeedbackText((isHeader ? lines.slice(1) : lines).join('\n'));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const loadSampleFeedback = () => {
    setFeedbackText(`Love the app but it crashes when I try to upload large files
The dark mode is amazing, best implementation I've seen
Can you add a feature to export data as CSV?
The login page takes too long to load, sometimes 10+ seconds
Really intuitive UI, my team adopted it instantly
The search function doesn't work with special characters
Would be great to have keyboard shortcuts for power users
Backend keeps timing out when processing more than 100 items
The onboarding tutorial was super helpful
Please add multi-language support, we have a global team`);
  };

  const isLoading = autoLoading || analyzing;

  return (
    <div>
      <div className="page-header">
        <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>feedback center</h2>
        <p>Recgon reads what your users are really saying and turns it into something you can act on</p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--btn-secondary-border)', marginBottom: 24 }}>
        {([
          { id: 'auto', label: 'Instagram Auto-Fetch' },
          { id: 'manual', label: 'Paste Manually' },
        ] as const).map((m) => (
          <button
            key={m.id}
            className="campaign-tab-btn"
            onClick={() => { setMode(m.id); setResult(null); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${mode === m.id ? 'var(--signature)' : 'transparent'}`,
              color: mode === m.id ? 'var(--signature)' : 'var(--txt-muted)',
              fontWeight: mode === m.id ? 600 : 400,
              fontSize: 13,
              padding: '10px 14px',
              marginBottom: -1,
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Project selector */}
      <div className="glass-card" style={{ marginBottom: 24, padding: '16px 20px' }}>
        <label className="form-label" style={{ marginBottom: 8 }}>
          Save to Project <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
        </label>
        <Select
          value={selectedProjectId}
          onChange={setSelectedProjectId}
          placeholder="— Don't save —"
          options={[
            { value: '', label: "— Don't save —" },
            ...projects.map((p) => ({ value: p.id, label: p.name })),
          ]}
          style={{ maxWidth: 400 }}
        />
      </div>

      {/* ── Auto mode ── */}
      {mode === 'auto' && (
        <div className="glass-card animate-fade-up" style={{ marginBottom: 24 }}>
          <span className="recgon-label">Your Instagram Profile</span>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Paste your profile link below. The system will automatically scrape comments from your recent posts and generate developer feedback.
          </p>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Instagram Profile URL</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="text"
                className="form-input"
                placeholder="https://www.instagram.com/yourusername/"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAutoAnalyze()}
              />
              <button
                className="btn btn-primary"
                onClick={handleAutoAnalyze}
                disabled={autoLoading || !profileUrl.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {autoLoading ? (
                  <><svg className="loader-spinner" style={{ width: 16, height: 16, borderRightColor: 'transparent', borderWidth: 2 }} /> Analyzing...</>
                ) : (
                  'Fetch & Analyze'
                )}
              </button>
            </div>
          </div>

          {autoLoading && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                <span style={{ color: 'var(--signature)', opacity: 0.7 }}>›</span> scraping profile... this may take up to a minute
              </p>
            </div>
          )}

          {fetchedComments && !autoLoading && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--txt-muted)', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                <span style={{ color: 'var(--success)' }}>›</span> {fetchedComments.length} comments fetched
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Manual mode ── */}
      {mode === 'manual' && (
        <>
          <div className="glass-card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label className="form-label" style={{ margin: 0 }}>User Feedback</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Import CSV
                  <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCSVUpload} />
                </label>
                <button className="btn btn-secondary btn-sm" onClick={loadSampleFeedback}>
                  Load Sample
                </button>
              </div>
            </div>
            <textarea
              className="form-textarea"
              placeholder="Paste user feedback here, one per line...&#10;&#10;Example:&#10;Love the app but it crashes on large files&#10;Can you add CSV export?&#10;The search doesn't handle special characters"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              style={{ minHeight: 200 }}
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Each line is treated as a separate feedback item.
            </p>
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={handleManualAnalyze}
            disabled={analyzing || !feedbackText.trim()}
            style={{ width: '100%', justifyContent: 'center', marginBottom: 24, padding: '16px' }}
          >
            {analyzing ? (
              <><svg className="loader-spinner" style={{ width: 16, height: 16, borderRightColor: 'transparent', borderWidth: 2 }} /> Analyzing...</>
            ) : (
              'Analyze & Generate Prompts'
            )}
          </button>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="glass-card" style={{ borderColor: 'var(--danger)', marginBottom: 20 }}>
          <p style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {error}
          </p>
        </div>
      )}

      {/* Saved confirmation */}
      {savedToProject && !isLoading && (
        <div className="glass-card" style={{ borderColor: 'var(--success)', marginBottom: 20 }}>
          <p style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Analysis saved to <strong>{projects.find((p) => p.id === selectedProjectId)?.name}</strong>
          </p>
        </div>
      )}

      {/* Loading spinner (manual mode) */}
      {analyzing && (
        <div className="loader">
          <div className="loader-spinner" />
          <div className="loader-text">Recgon is reading your feedback...</div>
        </div>
      )}

      {/* Result */}
      {result && !isLoading && (
        <FeedbackPanel
          sentiment={result.overallSentiment}
          sentimentBreakdown={result.sentimentBreakdown}
          themes={result.themes}
          featureRequests={result.featureRequests}
          bugs={result.bugs}
          praises={result.praises}
          developerPrompts={result.developerPrompts}
        />
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <span className="recgon-label">Saved Analyses</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const sentimentColor = SENTIMENT_COLOR[entry.sentiment] ?? 'var(--text-muted)';
              return (
                <div key={entry.id} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 16,
                      padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sentimentColor + '22', color: sentimentColor, border: `1px solid ${sentimentColor}55`, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                      {entry.sentiment}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{entry.projectName}</span>
                    <span style={{ fontSize: 12, color: 'var(--txt-muted)', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{formatDate(entry.analyzedAt)}</span>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
                      <FeedbackPanel
                        sentiment={entry.sentiment}
                        sentimentBreakdown={entry.sentimentBreakdown}
                        themes={entry.themes}
                        featureRequests={entry.featureRequests}
                        bugs={entry.bugs}
                        praises={entry.praises}
                        developerPrompts={entry.developerPrompts}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
