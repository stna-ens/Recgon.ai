'use client';

export default function SwotCard({ title, items, tone }: { title: string; items: string[]; tone: 'success' | 'warn' | 'pink' | 'danger' }) {
  if (items.length === 0) return null;
  const colors: Record<string, string> = {
    success: 'var(--success)',
    warn: 'var(--warning)',
    pink: 'var(--signature)',
    danger: 'var(--danger)',
  };
  return (
    <div className="glass-card is-static">
      <span className="recgon-label v2-block-eye" style={{ color: colors[tone] }}>{title}</span>
      <ol className="v2-num-list">
        {items.map((s, i) => (
          <li key={i}>
            <span className="v2-num" style={{ color: colors[tone] }}>{String(i + 1).padStart(2, '0')}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
