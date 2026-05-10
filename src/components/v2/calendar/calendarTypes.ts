import type { AgentTask } from '@/lib/recgon/types';

export type WeekRange = { start: Date; end: Date };

// A scheduled task occupying one or more contiguous day cells in the week view.
// `dayIndex` is the leftmost day inside the visible week; `span` is how many
// week-cells the chip should cover (clamped to the week edge).
export type CalendarCard = {
  id: string;
  title: string;
  teammateId: string;
  scheduledDate: string;             // YYYY-MM-DD (start of the task)
  scheduledUntilDate: string | null; // YYYY-MM-DD (inclusive end), null = single-day
  dayIndex: number;                  // 0..6 within the visible week (Mon=0)
  span: number;                      // 1..(7 - dayIndex)
  isMultiDay: boolean;               // true when the underlying task spans >1 day
  estimatedHours: number;
  task: AgentTask;
};
