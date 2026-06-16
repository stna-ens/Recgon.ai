import type { ToolDisplay, ToolDisplayItem } from '../types';

/** Minimal teammate shape the cards render from. */
export interface TeammateRow {
  id: string;
  displayName: string;
  title?: string | null;
  skills: string[];
  capacityHours: number;
  status: string;
  inFlightHours?: number;
  stars?: number;
}

export function teammateRowToCard(t: TeammateRow): ToolDisplayItem {
  const badges: string[] = [];
  if (t.title) badges.push(t.title);
  badges.push(`${t.capacityHours}h/wk`);
  if (typeof t.inFlightHours === 'number') badges.push(`${t.inFlightHours.toFixed(0)}h in flight`);
  if (typeof t.stars === 'number') badges.push(`★${t.stars.toFixed(1)}`);
  if (t.status !== 'active') badges.push(t.status);
  return {
    id: t.id,
    title: t.displayName,
    subtitle: t.skills.length ? t.skills.slice(0, 6).join(', ') : undefined,
    badges,
  };
}

export function teammatesToDisplay(teammates: TeammateRow[]): ToolDisplay {
  return { kind: 'teammates', items: teammates.map(teammateRowToCard) };
}
