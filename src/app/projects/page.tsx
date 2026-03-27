'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ProjectCard from '@/components/ProjectCard';

interface Project {
  id: string;
  name: string;
  path: string;
  isGithub?: boolean;
  lastAnalyzedCommitSha?: string;
  analysis?: {
    description: string;
    techStack: string[];
  };
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  language: string | null;
  updated_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [updateStatuses, setUpdateStatuses] = useState<Record<string, boolean>>({});
  const [showModal, setShowModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // GitHub repo picker state
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [githubReposLoading, setGithubReposLoading] = useState(false);
  const [githubReposError, setGithubReposError] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  const [importingRepo, setImportingRepo] = useState<string | null>(null);

  const fetchProjects = () => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((ps: Project[]) => {
        setProjects(ps);
        // Check for new commits on analyzed GitHub projects
        const githubProjects = ps.filter((p) => p.isGithub && p.analysis && p.lastAnalyzedCommitSha);
        if (githubProjects.length === 0) return;
        Promise.all(
          githubProjects.map((p) =>
            fetch(`/api/projects/${p.id}/check-updates`)
              .then((r) => r.ok ? r.json() : { hasUpdates: false })
              .then((data) => ({ id: p.id, hasUpdates: data.hasUpdates as boolean }))
              .catch(() => ({ id: p.id, hasUpdates: false }))
          )
        ).then((results) => {
          const statuses: Record<string, boolean> = {};
          for (const r of results) statuses[r.id] = r.hasUpdates;
          setUpdateStatuses(statuses);
        });
      })
      .catch(() => setProjects([]));
  };

  useEffect(() => {
    fetchProjects();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateProject = async () => {
    if (!projectName.trim() || !projectPath.trim()) return;
    setLoading(true);
    setCreateError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, path: projectPath }),
      });
      const data = await res.json();
      if (res.ok) {
        setProjectName('');
        setProjectPath('');
        setShowModal(false);
        fetchProjects();
      } else {
        setCreateError(data.error || 'Failed to create project');
      }
    } catch {
      setCreateError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const openGithubPicker = async () => {
    setShowGithubModal(true);
    setGithubReposError('');
    setRepoSearch('');
    setGithubRepos([]);
    setGithubReposLoading(true);
    try {
      const res = await fetch('/api/github/repos');
      if (!res.ok) {
        const data = await res.json();
        setGithubReposError(data.error === 'No GitHub account connected'
          ? 'Sign in with GitHub to import your repos.'
          : 'Failed to load GitHub repos. Please try again.');
      } else {
        const repos: GitHubRepo[] = await res.json();
        setGithubRepos(repos);
      }
    } catch {
      setGithubReposError('Network error — please try again.');
    } finally {
      setGithubReposLoading(false);
    }
  };

  const handleImportRepo = async (repo: GitHubRepo) => {
    setImportingRepo(repo.full_name);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repo.name, path: repo.html_url }),
      });
      if (res.ok) {
        setShowGithubModal(false);
        fetchProjects();
      } else {
        const data = await res.json();
        setGithubReposError(data.error || 'Failed to import repo');
      }
    } catch {
      setGithubReposError('Network error — please try again.');
    } finally {
      setImportingRepo(null);
    }
  };

  const filteredRepos = githubRepos.filter((r) =>
    r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(repoSearch.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <h2><span style={{ color: 'var(--signature)', opacity: 0.5 }}>$ </span>project center</h2>
        <p>Add your products and let Recgon get to know them</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: 64 }}>
        <button className="btn btn-secondary" onClick={openGithubPicker} style={{ padding: '16px 24px', borderRadius: 'var(--r-pill)', fontSize: 16, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Import from GitHub
        </button>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ padding: '16px 32px', borderRadius: 'var(--r-pill)', fontSize: 16 }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Add New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state animate-fade-up" style={{ marginTop: '8vh' }}>
          <span className="empty-state-icon">
             <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          </span>
          <h3 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px', marginBottom: 12 }}>No projects yet</h3>
          <p style={{ fontSize: 16, color: 'var(--txt-muted)', maxWidth: 400, margin: '0 auto', lineHeight: 1.5, marginBottom: 40 }}>
            Add your first project by pointing Recgon at a local directory or a public GitHub link
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ padding: '14px 28px', borderRadius: 'var(--r-pill)' }}>
            + Add Your First Project
          </button>
        </div>
      ) : (
        <div className="grid-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              name={project.name}
              description={project.analysis?.description}
              techStack={project.analysis?.techStack}
              analyzed={!!project.analysis}
              hasUpdates={updateStatuses[project.id]}
            />
          ))}
        </div>
      )}

      {/* Manual add project modal */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => { setShowModal(false); setCreateError(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add New Project</h3>
            <div className="form-group">
              <label className="form-label">Project Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="My Awesome App"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Codebase Path or GitHub URL</label>
              <input
                className="form-input"
                type="text"
                placeholder="https://github.com/user/repo OR /Users/you/project"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
              />
              <p style={{ fontSize: 13, color: 'var(--txt-muted)', marginTop: 12 }}>
                Paste a link to a public GitHub repo, or an absolute path to a local directory.
              </p>
            </div>
            {createError && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12, marginBottom: 0 }}>{createError}</p>
            )}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateProject}
                disabled={loading || !projectName.trim() || !projectPath.trim()}
              >
                {loading ? 'Creating...' : 'Create Project & Clone'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* GitHub repo picker modal */}
      {showGithubModal && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => { setShowGithubModal(false); setGithubReposError(''); }}>
          <div className="modal" style={{ maxWidth: 560, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Import from GitHub
            </h3>

            {githubReposLoading && (
              <p style={{ color: 'var(--txt-muted)', fontSize: 14, textAlign: 'center', padding: '2rem 0' }}>
                Loading your repositories…
              </p>
            )}

            {githubReposError && (
              githubReposError.startsWith('Sign in with GitHub') ? (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--txt-muted)', marginBottom: '1rem' }}>
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <p style={{ color: 'var(--txt-pure)', fontWeight: 600, fontSize: 15, margin: '0 0 0.4rem' }}>GitHub not connected</p>
                  <p style={{ color: 'var(--txt-muted)', fontSize: 13, margin: '0 0 1.25rem' }}>Connect your GitHub account to import repos into Recgon.</p>
                  <a
                    href="/api/github/connect"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.6rem 1.25rem',
                      background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                      borderRadius: 'var(--r-sm)', fontWeight: 600,
                      fontSize: '0.875rem', textDecoration: 'none', border: 'none',
                    }}
                  >
                    Connect GitHub
                  </a>
                </div>
              ) : (
                <p style={{ color: 'var(--danger)', fontSize: 14, margin: '1rem 0' }}>{githubReposError}</p>
              )
            )}

            {!githubReposLoading && !githubReposError && githubRepos.length > 0 && (
              <>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Search repos…"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  style={{ marginBottom: '0.75rem' }}
                />
                <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {filteredRepos.length === 0 ? (
                    <p style={{ color: 'var(--txt-muted)', fontSize: 14, textAlign: 'center', padding: '1rem 0' }}>No repos match your search.</p>
                  ) : filteredRepos.map((repo) => (
                    <div
                      key={repo.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        background: 'var(--btn-secondary-bg)',
                        border: '1px solid var(--btn-secondary-border)',
                        borderRadius: 'var(--r-sm)',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt-pure)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.name}</span>
                          {repo.private && (
                            <span style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(var(--signature-rgb), 0.1)', color: 'var(--signature)', borderRadius: 4, fontWeight: 600, flexShrink: 0 }}>Private</span>
                          )}
                          {repo.language && (
                            <span style={{ fontSize: 11, color: 'var(--txt-muted)', flexShrink: 0 }}>{repo.language}</span>
                          )}
                        </div>
                        {repo.description && (
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.description}</p>
                        )}
                      </div>
                      <button
                        className="btn btn-primary"
                        style={{ flexShrink: 0, padding: '6px 14px', fontSize: 13 }}
                        disabled={importingRepo === repo.full_name}
                        onClick={() => handleImportRepo(repo)}
                      >
                        {importingRepo === repo.full_name ? 'Cloning…' : 'Import'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setShowGithubModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
