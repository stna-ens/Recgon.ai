'use client';

import type { TileMetric } from './types';
import DeltaChip from './DeltaChip';
import Sparkline from './Sparkline';

interface Props {
  tiles: TileMetric[];
}

// Each tile: label / value+delta row / interactive sparkline. Hover the
// sparkline to scrub the daily values; releases back to the period total.
export default function AnalyticsTiles({ tiles }: Props) {
  return (
    <div className="v2-an-grid">
      {tiles.map((t) => (
        <div key={t.key} className="glass-card is-static is-tight v2-an-tile">
          <span className="recgon-label v2-an-tile-label">{t.label}</span>
          <div className="v2-an-tile-row">
            <span className="v2-an-tile-value">{t.formatted}</span>
            <DeltaChip delta={t.delta} inverse={t.inverse} />
          </div>
          <Sparkline series={t.series} labels={t.seriesLabels} negative={t.warn} />
        </div>
      ))}
    </div>
  );
}
