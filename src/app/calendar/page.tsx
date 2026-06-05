import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PersonalCalendar } from '@/components/v2/calendar/PersonalCalendar';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calendar');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
  };
}

export default function PersonalCalendarPage() {
  return <PersonalCalendar />;
}
