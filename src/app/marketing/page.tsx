'use client';

import { useEffect, useState } from 'react';
import MarketingPreview from '@/components/MarketingPreview';

interface MarketingHistoryItem {
  id: string;
  platform: string;
  content: Record<string, string>;
  generatedAt: string;
}

interface Project {
  id: string;
  name: string;
  analysis?: {
    name: string;
    description: string;
    techStack: string[];
    features: string[];
    targetAudience: string;
    uniqueSellingPoints: string[];
  };
  marketingContent?: MarketingHistoryItem[];
}

type Platform = 'instagram' | 'tiktok' | 'google-ads';

export default function MarketingPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('instagram');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [history, setHistory] = useState<MarketingHistoryItem[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const loadProjects = () =>
    fetch('/api/projects')
      .then((r) => r.json())
      .then((ps: Project[]) => {
        const analyzed = ps.filter((p) => p.analysis);
        setProjects(analyzed);
        if (analyzed.length > 0) {
          const first = analyzed[0];
          setSelectedProject(first.id);
          setHistory(first.marketingContent ?? []);
        }
      })
      .catch(() => setProjects([]));

  useEffect(() => { loadProjects(); }, []);

  // Keep history in sync when user switches project
  useEffect(() => {
    const project = projects.find((p) => p.id === selectedProject);
    setHistory(project?.marketingContent ?? []);
  }, [selectedProject, projects]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (videoJobId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/marketing/video-status?jobId=${videoJobId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'done' && data.videoPath) {
              setVideoPath(data.videoPath);
              setVideoJobId(null);
            } else if (data.status === 'error') {
              setError(data.error || 'Video generation failed');
              setVideoJobId(null);
            }
          } else if (res.status === 404) {
            setError('Video generation failed or job was lost (server restarted). Please try again.');
            setVideoJobId(null);
          }
        } catch {
          // Ignore network errors during polling
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [videoJobId]);

  const handleGenerate = async () => {
    if (!selectedProject) return;
    setGenerating(true);
    setError('');
    setResult(null);
    setImageUrl(null);
    setVideoPath(null);
    setVideoJobId(null);
    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProject, platform: selectedPlatform, customPrompt }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }
      const data = await res.json();
      setResult(data.content);
      setImageUrl(data.imageUrl || null);
      if (data.videoPath) {
        setVideoPath(data.videoPath);
      } else if (data.videoJobId) {
        setVideoJobId(data.videoJobId);
      }
      // Refresh project list so history picks up the new entry
      loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const platforms: { id: Platform; icon: React.ReactNode; label: string }[] = [
    { id: 'instagram', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>, label: 'Instagram' },
    { id: 'tiktok', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5v3a3 3 0 0 1-3 3v5a4 4 0 0 1-4-4z"/></svg>, label: 'TikTok' },
    { id: 'google-ads', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, label: 'Google Ads' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>Marketing Hub</h2>
        <p>Generate platform-specific marketing content from your product analysis</p>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state animate-fade-up" style={{ marginTop: '8vh' }}>
          <span className="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><circle cx="12" cy="12" r="3"/></svg>
          </span>
          <h3>No analyzed projects</h3>
          <p>You need to add and analyze a project before generating marketing content</p>
        </div>
      ) : (
        <div>
          {/* Project Selector */}
          <div className="form-group">
            <label className="form-label">Select Project</label>
            <select
              className="form-select"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Platform Selector */}
          <div className="form-group">
            <label className="form-label">Platform</label>
            <div className="platform-selector">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  className={`platform-option ${selectedPlatform === p.id ? 'selected' : ''}`}
                  onClick={() => setSelectedPlatform(p.id)}
                >
                  <span className="platform-option-icon">{p.icon}</span>
                  <span className="platform-option-label">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div className="form-group">
            <label className="form-label">Custom Instructions (Optional)</label>
            <textarea
              className="form-textarea"
              placeholder="e.g. 'Focus on the dark mode feature', 'Make the tone funny and energetic'"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
            />
          </div>

          {/* Generate Button */}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleGenerate}
            disabled={generating}
            style={{ width: '100%', justifyContent: 'center', marginBottom: 24 }}
          >
            {generating ? (
               <><svg className="loader-spinner" style={{width:16, height:16, borderRightColor:'transparent', borderWidth:2}}></svg> Generating...</>
            ) : (
               <>Generate {platforms.find(p => p.id === selectedPlatform)?.label} Content</>
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

          {generating && (
            <div className="loader">
              <div className="loader-spinner" />
              <div className="loader-text">
                AI is crafting your {selectedPlatform} content...
              </div>
            </div>
          )}

          {result && !generating && (
            <MarketingPreview
              platform={selectedPlatform}
              content={result}
              imageUrl={imageUrl}
              videoPath={videoPath}
              productName={projects.find(p => p.id === selectedProject)?.analysis?.name || projects.find(p => p.id === selectedProject)?.name}
              isGeneratingVideo={!!videoJobId}
            />
          )}

          {history.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <button
                onClick={() => setHistoryExpanded((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 12 }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                  style={{ transform: historyExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                Past generations ({history.length})
              </button>

              {historyExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[...history].reverse().map((item) => (
                    <div key={item.id} className="glass-card" style={{ fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{item.platform}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {new Date(item.generatedAt).toLocaleString()}
                        </span>
                      </div>
                      {Object.entries(item.content).map(([key, value]) => (
                        <div key={key} style={{ marginBottom: 6 }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 500, textTransform: 'capitalize' }}>{key}: </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
