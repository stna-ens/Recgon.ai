'use client';

import { useState } from 'react';

// Drag-and-drop file zone for proof submissions. Used by both the per-user
// `/inbox` page and the team `/teams/[id]/tasks` page so every Submit Proof
// surface has the same upload UX.
//
// The parent owns: the in-flight `uploading` flag, the list of already-
// uploaded files, the `onPick` callback that uploads to the proof/upload
// endpoint, and the `onRemove` callback that drops a file from the pending list.

export type ProofAttachment = { name: string; url: string };

export function ProofDropZone({
  uploading,
  onPick,
  files,
  onRemove,
}: {
  uploading: boolean;
  onPick: (files: FileList | null) => void;
  files: ProofAttachment[];
  onRemove: (index: number) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    const dropped = e.dataTransfer.files;
    if (dropped && dropped.length > 0) onPick(dropped);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <label
        onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '18px 12px',
          background: dragOver ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.02)',
          border: `1.5px dashed ${dragOver ? '#f59e0b' : 'var(--btn-secondary-border, rgba(255,255,255,0.18))'}`,
          borderRadius: 10,
          cursor: uploading ? 'wait' : 'pointer',
          color: dragOver ? '#f59e0b' : 'var(--txt-muted)',
          fontSize: '0.78rem',
          textAlign: 'center',
          opacity: uploading ? 0.6 : 1,
          transition: 'all 0.12s ease',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div style={{ fontWeight: 600, color: dragOver ? '#f59e0b' : 'var(--txt-pure)' }}>
          {uploading ? 'Uploading…' : dragOver ? 'Drop to attach' : 'Drag files here, or click to browse'}
        </div>
        <div style={{ fontSize: '0.7rem' }}>
          Images, videos, PDFs, Office docs. Up to 25 MB each.
        </div>
        <input
          type="file"
          multiple
          accept="image/*,video/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.json,.md"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = '';
          }}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {files.map((f, i) => (
            <span
              key={`${f.url}-${i}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', fontSize: '0.72rem',
                background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 'var(--r-pill)',
                maxWidth: 240,
              }}
            >
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: 'inherit', textDecoration: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                title={f.name}
              >
                {f.name}
              </a>
              <button
                onClick={(e) => { e.preventDefault(); onRemove(i); }}
                style={{
                  background: 'none', border: 'none', color: 'inherit',
                  cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: 1,
                }}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
