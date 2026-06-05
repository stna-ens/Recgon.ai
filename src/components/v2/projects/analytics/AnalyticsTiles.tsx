'use client';

import { useTranslations } from 'next-intl';
import type { TileMetric } from './types';
import DeltaChip from './DeltaChip';
import Sparkline from './Sparkline';

interface Props {
  tiles: TileMetric[];
}

// Each tile: label / value+delta row / interactive sparkline. Hover the
// sparkline to scrub the daily values; releases back to the period total.
export default function AnalyticsTiles({ tiles }: Props) {
  const t = useTranslations('analytics');
  return (
    <div className="v2-an-grid">
      {tiles.map((tile) => (
        <div key={tile.key} className="glass-card is-static is-tight v2-an-tile">
          <span className="recgon-label v2-an-tile-label">{t(tile.label)}</span>
          <div className="v2-an-tile-row">
            <span className="v2-an-tile-value">{tile.formatted}</span>
            <DeltaChip delta={tile.delta} inverse={tile.inverse} />
          </div>
          <Sparkline series={tile.series} labels={tile.seriesLabels} negative={tile.warn} />
        </div>
      ))}
    </div>
  );
}
