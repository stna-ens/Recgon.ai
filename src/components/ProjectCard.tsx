'use client';

import Link from 'next/link';

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  techStack?: string[];
  analyzed: boolean;
  hasUpdates?: boolean;
  sourceType?: 'codebase' | 'github' | 'description';
}

export default function ProjectCard({
  id,
  name,
  description,
  techStack,
  analyzed,
  hasUpdates,
}: ProjectCardProps) {
  return (
    <Link href={`/projects/${id}`} style={{ textDecoration: 'none' }}>
      <div className="glass-card" style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--txt-pure)', minWidth: 0, flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {hasUpdates && (
              <span className="tag" style={{ color: 'var(--warning)', borderColor: 'rgba(255,159,10,0.3)', background: 'rgba(255,159,10,0.06)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>
                ! new commits
              </span>
            )}
            {analyzed ? (
              <span className="tag" style={{ color: 'var(--signature)', borderColor: 'rgba(var(--signature-rgb), 0.3)', background: 'rgba(var(--signature-rgb), 0.05)', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>
                › analyzed
              </span>
            ) : (
              <span className="tag" style={{ color: 'var(--txt-faint)', fontSize: 12, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                pending
              </span>
            )}
          </div>
        </div>

        {description && (
          <p style={{ fontSize: 13, color: 'var(--txt-pure)', lineHeight: 1.5, marginBottom: 12 }}>
            {description.substring(0, 120)}
            {description.length > 120 ? '...' : ''}
          </p>
        )}

        {techStack && techStack.length > 0 && (
          <div className="tags-row">
            {techStack.slice(0, 5).map((tech) => (
              <span key={tech} className="tag">{tech}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
