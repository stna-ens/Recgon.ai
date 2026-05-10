'use client';

interface DeleteProjectModalProps {
  open: boolean;
  projectName: string;
  onClose: () => void;
  onDelete: () => void;
  deleting: boolean;
}

export default function DeleteProjectModal({
  open,
  projectName,
  onClose,
  onDelete,
  deleting,
}: DeleteProjectModalProps) {
  if (!open) return null;
  return (
    <div
      className="v2-modal-overlay"
      onClick={() => !deleting && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-card is-static v2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v2-modal-head">
          <span className="recgon-label v2-block-eye" style={{ color: 'var(--danger)' }}>delete project</span>
          <button
            type="button"
            className="v2-modal-x"
            onClick={onClose}
            aria-label="Close"
            disabled={deleting}
          >
            ×
          </button>
        </div>
        <p className="v2-modal-hint">
          Delete <strong>{projectName}</strong>? This removes the project, its analysis history, generated marketing,
          and feedback runs. This cannot be undone.
        </p>
        <div className="v2-modal-actions">
          <div className="v2-modal-spacer" />
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            onClick={onClose}
            disabled={deleting}
          >
            cancel
          </button>
          <button
            type="button"
            className="v2-btn"
            onClick={onDelete}
            disabled={deleting}
            style={{
              borderColor: 'var(--danger)',
              color: 'var(--danger)',
              background: 'rgba(255,69,58,0.06)',
            }}
          >
            {deleting ? <><span className="v2-mod-spinner" /> deleting…</> : 'delete project'}
          </button>
        </div>
      </div>
    </div>
  );
}
