'use client';

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { ChannelData } from './types';
import { ChartTooltip, GlowBar } from './chart-shapes';
import { PINK_SPECTRUM, fmtNumber } from './utils';

interface Props {
  channels: ChannelData[];
}

export default function ChannelsBar({ channels }: Props) {
  if (channels.length === 0) return null;
  const slice = channels.slice(0, 8);
  return (
    <div className="glass-card is-static v2-an-chart-card">
      <div className="v2-an-chart-head">
        <span className="recgon-label v2-block-eye">› traffic channels</span>
        <span className="v2-an-chart-meta">{channels.length} sources</span>
      </div>
      <div className="v2-an-chart-wrap">
        <ResponsiveContainer width="100%" height={Math.max(180, slice.length * 32)}>
          <BarChart data={slice} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
            <XAxis type="number" hide tickFormatter={fmtNumber} />
            <YAxis
              type="category"
              dataKey="channel"
              stroke="var(--txt-muted)"
              tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: 'var(--txt-muted)' }}
              tickLine={false}
              axisLine={false}
              width={110}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(var(--signature-rgb), 0.04)' }} />
            <Bar
              dataKey="sessions"
              name="sessions"
              radius={[0, 4, 4, 0]}
              activeBar={<GlowBar />}
              background={{ fill: 'rgba(128,128,128,0.06)', radius: 4 }}
            >
              {slice.map((_, i) => (
                <Cell key={i} fill={PINK_SPECTRUM[i % PINK_SPECTRUM.length]} stroke="none" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
