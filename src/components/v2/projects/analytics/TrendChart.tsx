'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TrendPoint } from './types';
import { ChartTooltip } from './chart-shapes';
import { PAGEVIEWS_STROKE, SESSIONS_STROKE, USERS_STROKE, fmtDate, fmtNumber } from './utils';

interface Props {
  trend: TrendPoint[];
  days: number;
}

// Sessions / users / page views area chart. Three pink-on-pink gradients
// preserved from the original v2 design — keeps the chart identity unified
// instead of rainbow.
export default function TrendChart({ trend, days }: Props) {
  const t = useTranslations('analytics');
  const data = useMemo(() => trend.map((p) => ({ ...p, label: fmtDate(p.date) })), [trend]);
  if (data.length === 0) return null;

  return (
    <section className="glass-card is-static v2-an-chart-card">
      <div className="v2-an-chart-head">
        <span className="recgon-label v2-block-eye">{t('trend.heading', { days })}</span>
        <div className="v2-an-chart-legend">
          <span><span className="v2-an-tt-dot" style={{ background: SESSIONS_STROKE }} /> {t('trend.sessions')}</span>
          <span><span className="v2-an-tt-dot" style={{ background: USERS_STROKE }} /> {t('trend.users')}</span>
          <span><span className="v2-an-tt-dot" style={{ background: PAGEVIEWS_STROKE }} /> {t('trend.pageViews')}</span>
        </div>
      </div>
      <div className="v2-an-chart-wrap">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="v2gradSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(var(--signature-rgb), 0.85)" stopOpacity={0.55} />
                <stop offset="70%" stopColor="rgba(var(--signature-rgb), 0.85)" stopOpacity={0.10} />
                <stop offset="100%" stopColor="rgba(var(--signature-rgb), 0.85)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="v2gradUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(var(--signature-rgb), 0.45)" stopOpacity={0.30} />
                <stop offset="100%" stopColor="rgba(var(--signature-rgb), 0.45)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="v2gradPageViews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(var(--signature-rgb), 0.22)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="rgba(var(--signature-rgb), 0.22)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(128, 128, 128, 0.08)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--txt-faint)"
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fill: 'var(--txt-faint)' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="var(--txt-faint)"
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fill: 'var(--txt-faint)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtNumber}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(var(--signature-rgb), 0.4)', strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, fontFamily: 'JetBrains Mono, monospace' }} iconType="circle" />
            <Area type="monotone" dataKey="pageViews" name={t('trend.pageViews')} stroke={PAGEVIEWS_STROKE} strokeWidth={1.5} fill="url(#v2gradPageViews)" dot={false} />
            <Area type="monotone" dataKey="users" name={t('trend.users')} stroke={USERS_STROKE} strokeWidth={1.5} fill="url(#v2gradUsers)" dot={false} />
            <Area type="monotone" dataKey="sessions" name={t('trend.sessions')} stroke={SESSIONS_STROKE} strokeWidth={2} fill="url(#v2gradSessions)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
