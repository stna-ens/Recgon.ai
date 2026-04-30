'use client';

/**
 * TimelineRibbon — horizontal ribbon of project events / signals.
 * Replaces vertical text feeds with a scannable spatial timeline.
 */
export type RibbonEvent = {
  date: string; // ISO
  label: string;
  tone?: 'sage' | 'ochre' | 'rust' | 'pink' | 'ink' | 'quiet';
  type?: string;
};

export default function TimelineRibbon({
  events,
  height = 96,
}: {
  events: RibbonEvent[];
  height?: number;
}) {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const start = +new Date(sorted[0].date);
  const end = +new Date(sorted[sorted.length - 1].date);
  const range = end - start || 1;

  const colorMap: Record<string, string> = {
    sage: 'var(--rg-sage)',
    ochre: 'var(--rg-ochre)',
    rust: 'var(--rg-rust)',
    pink: 'var(--rg-signature-deep)',
    ink: 'var(--rg-ink)',
    quiet: 'var(--rg-ink-quiet)',
  };

  return (
    <div style={{ position: 'relative', height, paddingTop: 18 }}>
      {/* Baseline */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 1,
          background: 'var(--rg-rule)',
        }}
      />
      {sorted.map((e, i) => {
        const x = ((+new Date(e.date) - start) / range) * 100;
        const c = colorMap[e.tone ?? 'ink'];
        const above = i % 2 === 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                bottom: above ? 8 : 'auto',
                top: above ? 'auto' : 8,
                width: 1,
                height: 14,
                background: c,
                opacity: 0.5,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: above ? 22 : 'auto',
                top: above ? 'auto' : 22,
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-jetbrains, monospace)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--rg-ink-soft)',
                background: 'var(--rg-paper-card)',
                padding: '2px 6px',
                border: '1px solid var(--rg-rule)',
                borderRadius: 3,
              }}
            >
              {e.label}
            </div>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: c,
                boxShadow: '0 0 0 3px var(--rg-paper)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
