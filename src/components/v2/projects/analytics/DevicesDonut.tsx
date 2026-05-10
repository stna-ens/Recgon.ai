'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DeviceData } from './types';
import { ChartTooltip, GlowSector } from './chart-shapes';
import { PINK_SPECTRUM, fmtNumber } from './utils';

interface Props {
  devices: DeviceData[];
}

export default function DevicesDonut({ devices }: Props) {
  if (devices.length === 0) return null;
  return (
    <div className="glass-card is-static v2-an-chart-card">
      <div className="v2-an-chart-head">
        <span className="recgon-label v2-block-eye">› devices</span>
        <span className="v2-an-chart-meta">{devices.length} categories</span>
      </div>
      <div className="v2-an-donut-wrap">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={devices}
              dataKey="sessions"
              nameKey="device"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={92}
              paddingAngle={3}
              stroke="none"
              activeShape={<GlowSector />}
            >
              {devices.map((_, i) => (
                <Cell key={i} fill={PINK_SPECTRUM[i % PINK_SPECTRUM.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="v2-an-donut-legend">
        {devices.map((d, i) => (
          <li key={d.device}>
            <span className="v2-an-tt-dot" style={{ background: PINK_SPECTRUM[i % PINK_SPECTRUM.length] }} />
            <span className="v2-an-donut-name">{d.device}</span>
            <span className="v2-an-donut-pct">{d.percentage.toFixed(0)}%</span>
            <span className="v2-an-donut-val">{fmtNumber(d.sessions)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
