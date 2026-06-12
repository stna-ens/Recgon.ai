import type { AgentTask } from '@/lib/recgon/types';
import type { WeekRange, CalendarCard } from './calendarTypes';

export function getWeekRange(anchor: Date): WeekRange {
  const d = new Date(anchor);
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

export function addWeeks(range: WeekRange, delta: number): WeekRange {
  const anchor = new Date(range.start);
  anchor.setDate(anchor.getDate() + delta * 7);
  return getWeekRange(anchor);
}

export function weekDays(range: WeekRange): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(range.start);
    d.setDate(range.start.getDate() + i);
    days.push(d);
  }
  return days;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

// Signed day delta between two YYYY-MM-DD keys (a - b). Used by the calendar
// to find the nearest scheduled date to today when auto-jumping past an
// empty current week.
export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((da.getTime() - db.getTime()) / 86_400_000);
}

// Local YYYY-MM-DD for a given Date (matches getDay grouping in week view).
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDayHeader(d: Date, locale: string): { weekday: string; date: string } {
  return {
    weekday: d.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase(),
    date: d.toLocaleDateString(locale, { day: 'numeric' }),
  };
}

// Build CalendarCards for a single teammate within the given week.
// Multi-day tasks (scheduledDate < scheduledUntilDate) produce a single card
// whose `dayIndex`/`span` describe how many day cells it should cover within
// the visible week. Tasks that start before the week show up clamped to day 0;
// tasks that end after the week clamp their span to the last visible day.
export function buildCards(
  tasks: AgentTask[],
  teammateId: string,
  week: WeekRange,
): CalendarCard[] {
  const cards: CalendarCard[] = [];
  const weekKeys = weekDays(week).map(localDateKey);
  const firstKey = weekKeys[0];
  const lastKey = weekKeys[weekKeys.length - 1];

  for (const task of tasks) {
    if (task.assignedTo !== teammateId) continue;
    if (!task.scheduledDate) continue;
    const startDate = task.scheduledDate;
    const endDate = task.scheduledUntilDate && task.scheduledUntilDate >= startDate
      ? task.scheduledUntilDate
      : startDate;
    // Skip tasks that fall entirely outside the visible week.
    if (endDate < firstKey) continue;
    if (startDate > lastKey) continue;

    const visibleStart = startDate < firstKey ? firstKey : startDate;
    const visibleEnd = endDate > lastKey ? lastKey : endDate;
    const dayIndex = weekKeys.indexOf(visibleStart);
    const endIndex = weekKeys.indexOf(visibleEnd);
    if (dayIndex === -1 || endIndex === -1) continue;
    const span = Math.max(1, endIndex - dayIndex + 1);
    const isMultiDay = endDate > startDate;

    cards.push({
      id: `task-${task.id}`,
      title: task.title,
      teammateId,
      scheduledDate: startDate,
      scheduledUntilDate: task.scheduledUntilDate,
      dayIndex,
      span,
      isMultiDay,
      estimatedHours: Math.max(0.25, Number(task.estimatedHours) || 1),
      task,
    });
  }
  return cards;
}
