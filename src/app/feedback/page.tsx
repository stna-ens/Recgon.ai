'use client';

import { useState } from 'react';
import FeedbackPanel from '@/components/FeedbackPanel';

interface FeedbackResult {
  overallSentiment: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
}

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState<'paste' | 'fetch'>('paste');
  const [feedbackText, setFeedbackText] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!feedbackText.trim()) return;

    // Split by newlines and filter empty
    const items = feedbackText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (items.length === 0) return;

    setAnalyzing(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/feedback/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: items }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Analysis failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // Parse CSV: split by newlines, strip quotes, skip header if it looks like one
      const lines = text.split(/\r?\n/).map((l) => l.replace(/^["']|["']$/g, '').trim()).filter(Boolean);
      const isHeader = lines[0] && /^(feedback|comment|review|text|message)$/i.test(lines[0]);
      const items = isHeader ? lines.slice(1) : lines;
      setFeedbackText(items.join('\n'));
      setActiveTab('paste');
    };
    reader.readAsText(file);
    // Reset so the same file can be re-uploaded if needed
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

  const handleFetchComments = async () => {
    if (!instagramUrl.trim()) return;
    setFetching(true);
    setError('');
    
    try {
      const res = await fetch('/api/feedback/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: instagramUrl, platform: 'instagram' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch comments');
      }
      const data = await res.json();
      const commentsText = data.comments.join('\n');
      setFeedbackText(commentsText);
      setActiveTab('paste'); // switch to paste tab to show them and allow manual edit if needed
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch comments');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Feedback Center</h2>
        <p>Paste user feedback or fetch comments directly from Instagram</p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <button
          className={`btn ${activeTab === 'paste' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('paste')}
          style={{ padding: '8px 16px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 500 }}
        >
          Paste Manually
        </button>
        <button
          className={`btn ${activeTab === 'fetch' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('fetch')}
          style={{ padding: '8px 16px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 500 }}
        >
          Auto-Fetch URL
        </button>
      </div>

      {activeTab === 'fetch' && (
        <div className="glass-card animate-fade-up" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Fetch Instagram Comments</h3>
          <div className="form-group">
            <label className="form-label">Instagram Post or Reel URL</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="text"
                className="form-input"
                placeholder="https://www.instagram.com/p/ABC123xyz/"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleFetchComments}
                disabled={fetching || !instagramUrl.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {fetching ? <><svg className="loader-spinner" style={{width:16, height:16, borderRightColor:'transparent', borderWidth:2}}></svg> Fetching</> : 'Fetch'}
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              Provide a public Instagram post or reel URL to automatically extract user comments for feedback analysis.
            </p>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ marginBottom: 24, display: activeTab === 'paste' ? 'block' : 'none' }}>
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
          Each line is treated as a separate feedback item. Paste comments from social media, app reviews, forums, etc.
        </p>
      </div>

      <button
        className="btn btn-primary btn-lg"
        onClick={handleAnalyze}
        disabled={analyzing || !feedbackText.trim()}
        style={{ width: '100%', justifyContent: 'center', marginBottom: 24, padding: '16px' }}
      >
        {analyzing ? (
          <><svg className="loader-spinner" style={{width:16, height:16, borderRightColor:'transparent', borderWidth:2}}></svg> Analyzing...</>
        ) : (
          'Analyze & Generate Prompts'
        )}
      </button>

      {error && (
        <div className="glass-card" style={{ borderColor: 'var(--danger)', marginBottom: 20 }}>
          <p style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {error}
          </p>
        </div>
      )}

      {analyzing && (
        <div className="loader">
          <div className="loader-spinner" />
          <div className="loader-text">AI is analyzing your user feedback...</div>
        </div>
      )}

      {result && !analyzing && (
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
    </div>
  );
}
