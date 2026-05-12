'use client';

// Phase 2 / Plan 02-03 / SKILL-06.
//
// "{N} new inferred skills — review" banner. Renders above the form when
// count > 0. Click "Review" -> parent smooth-scrolls the rail section into
// view (no mark-reviewed). Click X dismiss -> parent calls PATCH /mark-reviewed;
// banner fades.
//
// Pure presentational: no fetch, callback-driven (parent owns the API call).

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface Props {
  count: number;
  onReview: () => void;
  onDismiss: () => Promise<void> | void;
}

export default function ReviewBanner({ count, onReview, onDismiss }: Props) {
  const [hidden, setHidden] = useState(false);
  if (count <= 0 || hidden) return null;

  const heading =
    count === 1
      ? '1 new inferred skill — review'
      : `${count} new inferred skills — review`;

  return (
    <div
      role="region"
      aria-label="New inferences"
      className="review-banner"
    >
      <AlertCircle
        size={14}
        aria-hidden="true"
        className="review-banner__icon"
      />
      <div className="review-banner__text">
        <span className="review-banner__eyebrow">NEW INFERENCES</span>
        <span className="review-banner__heading">{heading}</span>
      </div>
      <div className="review-banner__actions">
        <button
          type="button"
          className="review-banner__review"
          onClick={onReview}
        >
          Review
        </button>
        <button
          type="button"
          className="review-banner__dismiss"
          aria-label="Dismiss new inferences banner"
          onClick={async () => {
            setHidden(true);
            try {
              await onDismiss();
            } catch {
              // Restoring the banner on error is the parent's call — the
              // banner has already faded; parent shows a destructive toast.
            }
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <style>{`
        .review-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
          border-left: 3px solid var(--signature);
          border-radius: var(--r-sm);
          animation: review-banner-in var(--dur-fast) var(--ease-out);
        }
        @keyframes review-banner-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .review-banner__icon {
          color: var(--signature);
          flex-shrink: 0;
        }
        .review-banner__text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          min-width: 0;
        }
        .review-banner__eyebrow {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.04em;
          color: var(--signature);
          text-transform: uppercase;
        }
        .review-banner__heading {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 16px;
          font-weight: 600;
          line-height: 1.4;
          color: var(--txt-pure);
        }
        .review-banner__actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .review-banner__review {
          padding: 6px 12px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 16px;
          font-weight: 600;
          color: var(--signature);
          background: transparent;
          border: none;
          border-radius: var(--r-sm);
          cursor: pointer;
          transition: background var(--dur-fast) var(--ease-out);
        }
        .review-banner__review:hover {
          background: rgba(var(--signature-rgb), 0.08);
        }
        .review-banner__dismiss {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: transparent;
          border: none;
          border-radius: 50%;
          color: var(--txt-muted);
          cursor: pointer;
          transition: color var(--dur-fast) var(--ease-out),
                      background var(--dur-fast) var(--ease-out);
        }
        .review-banner__dismiss:hover {
          color: var(--txt-pure);
          background: rgba(var(--signature-rgb), 0.06);
        }
      `}</style>
    </div>
  );
}
