'use client';

import { ReactNode } from 'react';
import NumberTicker from './NumberTicker';
import Sparkline from './Sparkline';

/**
 * StatBlock — KPI tile combining stamp / animated number / sparkline / delta.
 * Replaces the old `.stat-card` pattern with editorial typography.
 */
export default function StatBlock({
  stamp,
  value,
  prefix,
  suffix,
  delta,
  trend,
  tone = 'sage',
  hint,
}: {
  stamp: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta?: string; // formatted: "+12.4%" / "-3.1pp"
  trend?: number[];
  tone?: 'sage' | 'ochre' | 'rust' | 'pink' | 'ink' | 'quiet';
  hint?: ReactNode;
}) {
  return (
    <div className="stat-block">
      <span className="stat-block__stamp">{stamp}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, justifyContent: 'space-between' }}>
        <NumberTicker value={value} prefix={prefix} suffix={suffix} />
        {trend && trend.length > 1 && (
          <Sparkline data={trend} tone={tone} width={88} height={28} />
        )}
      </div>
      {(delta || hint) && (
        <div className="stat-block__delta" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {delta && (
            <span
              style={{
                color:
                  delta.startsWith('+')
                    ? 'var(--rg-sage)'
                    : delta.startsWith('-')
                      ? 'var(--rg-rust)'
                      : 'var(--rg-ink-quiet)',
                fontFamily: 'var(--font-jetbrains, monospace)',
              }}
            >
              {delta}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
