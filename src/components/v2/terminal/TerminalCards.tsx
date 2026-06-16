'use client';

import Link from 'next/link';

// Mirrors ToolDisplay in src/lib/tools/types.ts. The chat route serializes a
// tool's structured result into a ```recgon:cards``` fenced block; AssistantBody
// parses it and renders it here. Styled to read like deliberate CLI output —
// borderless rows, a signature-pink marker, monospace, subtle pink-tint hover —
// matching the slash menu and suggestion rows, not a generic card grid.
export interface TerminalCardItem {
  id: string;
  title: string;
  subtitle?: string;
  badges?: string[];
  href?: string;
}
export interface TerminalCardData {
  kind: string;
  items: TerminalCardItem[];
  caption?: string;
}

export default function TerminalCards({ data }: { data: TerminalCardData }) {
  if (!data?.items?.length) return null;
  return (
    <div className="terminal-cards" role="list">
      {data.caption && <div className="terminal-cards-caption">{data.caption}</div>}
      {data.items.map((item) => {
        const inner = (
          <>
            <span className="terminal-card-mark" aria-hidden="true">▸</span>
            <span className="terminal-card-main">
              <span className="terminal-card-title">{item.title}</span>
              {item.subtitle && <span className="terminal-card-subtitle">{item.subtitle}</span>}
            </span>
            {item.badges && item.badges.length > 0 && (
              <span className="terminal-card-meta">{item.badges.join('  ·  ')}</span>
            )}
            {item.href && <span className="terminal-card-arrow" aria-hidden="true">↗</span>}
          </>
        );
        return item.href ? (
          <Link key={item.id} href={item.href} className="terminal-card is-link" role="listitem">
            {inner}
          </Link>
        ) : (
          <div key={item.id} className="terminal-card" role="listitem">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
