'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  analysis?: {
    name: string;
    description: string;
    techStack: string[];
    features: string[];
    targetAudience: string;
    uniqueSellingPoints: string[];
    analyzedAt: string;
  };
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(setProject)
      .catch(() => router.push('/projects'));
  }, [params.id, router]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    setProgressMessage('Starting analysis...');
    try {
      const res = await fetch(`/api/projects/${params.id}/analyze`, { method: 'POST' });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Analysis failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const dataLine = line.startsWith('data: ') ? line.slice(6) : line;
          if (!dataLine.trim()) continue;
          try {
            const event = JSON.parse(dataLine);
            if (event.type === 'progress') setProgressMessage(event.message);
            else if (event.type === 'done') setProject(event.project);
            else if (event.type === 'error') throw new Error(event.message);
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
      setProgressMessage('');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this project?')) return;
    await fetch(`/api/projects/${params.id}`, { method: 'DELETE' });
    router.push('/projects');
  };

  if (!project) {
    return (
      <div className="loader">
        <div className="loader-spinner" />
        <div className="loader-text">Loading project...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-1px' }}>{project.name}</h2>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              {analyzing ? (
                <><svg className="loader-spinner" style={{width:16, height:16, borderRightColor:'transparent', borderWidth:2}}></svg> Analyzing...</>
              ) : project.analysis ? (
                <><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Re-analyze</>
              ) : (
                <><svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze Codebase</>
              )}
            </button>
            <button className="btn btn-secondary" onClick={handleDelete}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete
            </button>
          </div>
        </div>
      </div>

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
          <div className="loader-text">{progressMessage || 'Starting analysis...'}</div>
        </div>
      )}

      {project.analysis && !analyzing && (
        <div>
          <div className="glass-card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              {project.analysis.name}
            </h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
              {project.analysis.description}
            </p>

            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Target Audience
              </span>
              <p style={{ fontSize: 14, marginTop: 4 }}>{project.analysis.targetAudience}</p>
            </div>

            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'block' }}>
                Tech Stack
              </span>
              <div className="tags-row">
                {project.analysis.techStack.map((tech) => (
                  <span key={tech} className="tag">{tech}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="glass-card">
              <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Key Features</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {project.analysis.features.map((feature, i) => (
                  <li key={i} style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10, paddingLeft: 24, position: 'relative', lineHeight: 1.5 }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--accent-secondary)' }}>→</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-card">
              <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Unique Selling Points</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {project.analysis.uniqueSellingPoints.map((usp, i) => (
                  <li key={i} style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10, paddingLeft: 24, position: 'relative', lineHeight: 1.5 }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--success)' }}>★</span>
                    {usp}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!project.analysis && !analyzing && (
        <div className="empty-state">
          <span className="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <h3>Ready to analyze</h3>
          <p>Click &quot;Analyze Codebase&quot; to let AI read and understand your product</p>
        </div>
      )}
    </div>
  );
}
