'use client';

import { useEffect, useRef, ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  labelledBy?: string;
  /** Width override; default 520 (matches CSS) */
  maxWidth?: number | string;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  labelledBy,
  maxWidth,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && contentRef.current) {
        const focusable = contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => {
      const focusable = contentRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable && focusable.length > 0) focusable[0].focus();
      else contentRef.current?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      const t = triggerRef.current as HTMLElement | null;
      if (t && typeof t.focus === 'function') t.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const titleId = labelledBy ?? (title ? 'modal-title' : undefined);
  const descId = description ? 'modal-desc' : undefined;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={contentRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {title && <h3 id={titleId}>{title}</h3>}
        {description && (
          <p id={descId} style={{ fontSize: 13.5, color: 'var(--txt-muted)', marginBottom: 18, lineHeight: 1.55, marginTop: -16 }}>
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
