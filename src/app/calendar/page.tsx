import type { Metadata } from 'next';
import { PersonalCalendar } from '@/components/v2/calendar/PersonalCalendar';

export const metadata: Metadata = {
  title: 'Calendar — Recgon',
  robots: { index: false, follow: false },
};

export default function PersonalCalendarPage() {
  return <PersonalCalendar />;
}
