'use client';

import Link from 'next/link';

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  techStack?: string[];
  analyzed: boolean;
}

export default function ProjectCard({
  id,
  name,
  description,
  techStack,
  analyzed,
}: ProjectCardProps) {
  return (
    <Link href={`/projects/${id}`} style={{ textDecoration: 'none' }}>
      <div className="glass-card" style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--txt-pure)' }}>{name}</h3>
          {analyzed ? (
            <span className="tag" style={{ color: 'var(--success)', borderColor: 'rgba(0, 206, 201, 0.2)' }}>
              ✓ Analyzed
            </span>
          ) : (
            <span className="tag" style={{ color: 'var(--warning)', borderColor: 'rgba(253, 203, 110, 0.2)' }}>
              Pending
            </span>
          )}
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
