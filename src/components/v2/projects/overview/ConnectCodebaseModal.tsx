'use client';

interface ConnectCodebaseModalProps {
  open: boolean;
  path: string;
  onPathChange: (s: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function ConnectCodebaseModal({
  open,
  path,
  onPathChange,
  onClose,
  onSubmit,
  loading,
}: ConnectCodebaseModalProps) {
  if (!open) return null;
  return (
    <div className="v2-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="glass-card is-static v2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v2-modal-head">
          <span className="recgon-label v2-block-eye">connect github repo</span>
          <button type="button" className="v2-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="v2-modal-hint">
          Upgrade this idea project to a full code analysis by linking a GitHub repository. The existing idea analysis will be replaced.
        </p>
        <label className="v2-field">
          <span className="v2-field-label">github url</span>
          <input
            type="text"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="v2-input"
            autoFocus
          />
        </label>
        <div className="v2-modal-actions">
          <div className="v2-modal-spacer" />
          <button type="button" className="v2-btn v2-btn-ghost" onClick={onClose}>cancel</button>
          <button
            type="button"
            className="v2-btn v2-btn-primary"
            onClick={onSubmit}
            disabled={loading || !path.trim()}
          >
            {loading ? <><span className="v2-mod-spinner" /> connecting…</> : 'connect & analyze'}
          </button>
        </div>
      </div>
    </div>
  );
}
