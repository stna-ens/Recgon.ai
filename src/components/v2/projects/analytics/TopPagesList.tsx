'use client';

import { useState } from 'react';
import type { PageData } from './types';
import { PINK_SPECTRUM, fmtNumber } from './utils';

interface Props {
  pages: PageData[];
}

export default function TopPagesList({ pages }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (pages.length === 0) return null;
  const slice = pages.slice(0, 8);
  const maxViews = pages[0]?.views || 1;

  return (
    <div className="glass-card is-static v2-an-list-card">
      <div className="v2-an-chart-head">
        <span className="recgon-label v2-block-eye">› top pages</span>
        <span className="v2-an-chart-meta">top {slice.length}</span>
      </div>
      <ol className="v2-an-toppages">
        {slice.map((page, i) => {
          const pct = (page.views / maxViews) * 100;
          const isHover = hovered === i;
          return (
            <li
              key={i}
              className="v2-an-toppage"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="v2-an-toppage-row">
                <span className="v2-an-toppage-key" title={page.page}>{page.page}</span>
                <span className="v2-an-toppage-num">{fmtNumber(page.views)}</span>
              </div>
              <div className="v2-an-toppage-track">
                <div
                  className="v2-an-toppage-fill"
                  style={{
                    width: `${pct}%`,
                    background: PINK_SPECTRUM[i % PINK_SPECTRUM.length],
                    opacity: isHover ? 1 : 0.85,
                    boxShadow: isHover
                      ? '0 0 5px rgba(var(--signature-rgb), 0.55), 0 0 14px rgba(var(--signature-rgb), 0.30)'
                      : 'none',
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
