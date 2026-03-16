'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ProjectCard from '@/components/ProjectCard';

interface Project {
  id: string;
  name: string;
  path: string;
  analysis?: {
    description: string;
    techStack: string[];
  };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchProjects = () => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => setProjects([]));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    if (!projectName.trim() || !projectPath.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, path: projectPath }),
      });
      if (res.ok) {
        setProjectName('');
        setProjectPath('');
        setShowModal(false);
        fetchProjects();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2 style={{ fontSize: 56, marginBottom: 16 }}>Project Center</h2>
        <p style={{ fontSize: 18 }}>Manage your products and analyze their codebases</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 64 }}>
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
            />
          ))}
        </div>
      )}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
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
            <div className="modal-actions" style={{ marginTop: 40 }}>
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
    </div>
  );
}
