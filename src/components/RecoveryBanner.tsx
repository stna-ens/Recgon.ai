'use client';

import { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'danger';

interface RecoveryBannerProps {
  tone?: Tone;
  title: string;
  detail?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

const ICONS: Record<Tone, ReactNode> = {
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
};

export default function RecoveryBanner({
  tone = 'info',
  title,
  detail,
  actionLabel,
  onAction,
}: RecoveryBannerProps) {
  return (
    <div className={`recovery-banner tone-${tone}`} role="status">
      <span className="recovery-banner-icon">{ICONS[tone]}</span>
      <div className="recovery-banner-body">
        <div className="recovery-banner-title">{title}</div>
        {detail && <div className="recovery-banner-detail">{detail}</div>}
        {actionLabel && onAction && (
          <button type="button" className="recovery-banner-action" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
