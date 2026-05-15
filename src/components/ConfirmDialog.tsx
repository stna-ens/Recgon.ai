'use client';

import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

// Drop-in replacement for browser confirm() in the glass-card design system.
// Used wherever a destructive action needs a single confirmation step that
// can also explain the consequences ("disconnecting GitHub will pause skill
// mining…"). Adopts the v2 tokens (signature pink, glass substrate, JBM)
// and matches the disconnect dialog pattern already used inside the profile
// page's GithubStatusStrip.
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'cancel',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="confirm-dialog__overlay" />
        <AlertDialog.Content className="confirm-dialog__content">
          <AlertDialog.Title className="confirm-dialog__title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="confirm-dialog__body">
            {description}
          </AlertDialog.Description>
          <div className="confirm-dialog__actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="confirm-dialog__cancel" disabled={submitting}>
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className={`confirm-dialog__confirm${destructive ? ' confirm-dialog__confirm--destructive' : ''}`}
                disabled={submitting}
                onClick={async (e) => {
                  e.preventDefault();
                  setSubmitting(true);
                  try {
                    await onConfirm();
                    onOpenChange(false);
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? 'working…' : confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>

      <style>{`
        .confirm-dialog__overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.36);
          backdrop-filter: blur(4px);
          z-index: 100;
        }
        .confirm-dialog__content {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(440px, calc(100vw - 32px));
          padding: 24px;
          background: var(--glass-substrate);
          border: 1px solid var(--btn-secondary-border);
          border-radius: var(--r-md);
          box-shadow: var(--shadow-float);
          z-index: 101;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .confirm-dialog__title {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 20px;
          font-weight: 600;
          line-height: 1.3;
          color: var(--txt-pure);
          margin: 0;
        }
        .confirm-dialog__body {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          color: var(--txt-muted);
          margin: 0;
        }
        .confirm-dialog__actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 8px;
        }
        .confirm-dialog__cancel,
        .confirm-dialog__confirm {
          padding: 10px 18px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 14px;
          font-weight: 600;
          border-radius: var(--r-sm);
          cursor: pointer;
          transition: opacity 120ms ease;
        }
        .confirm-dialog__cancel {
          color: var(--txt-pure);
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
        }
        .confirm-dialog__cancel:hover:not(:disabled) { opacity: 0.85; }
        .confirm-dialog__confirm {
          color: white;
          background: var(--signature);
          border: none;
        }
        .confirm-dialog__confirm--destructive {
          background: var(--danger, #f87171);
        }
        .confirm-dialog__confirm:hover:not(:disabled) { opacity: 0.92; }
        .confirm-dialog__confirm:disabled,
        .confirm-dialog__cancel:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </AlertDialog.Root>
  );
}
