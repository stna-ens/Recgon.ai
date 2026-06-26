// quick-260626-rdo — unit tests for the calendar fetch-URL builder.
// The /admin team-wide calendar omits projectId; the project tasks page passes
// one. Both behaviours flow through buildCalendarUrl, so we test it directly.

import { describe, it, expect } from 'vitest';
import { buildCalendarUrl } from '@/components/v2/calendar/calendarUtils';

describe('buildCalendarUrl', () => {
  it('omits the query string when no projectId is given (team-wide view)', () => {
    expect(buildCalendarUrl('team-1')).toBe('/api/teams/team-1/calendar');
    expect(buildCalendarUrl('team-1', undefined)).toBe('/api/teams/team-1/calendar');
  });

  it('appends an encoded projectId query when scoped to a project', () => {
    expect(buildCalendarUrl('team-1', 'proj-9')).toBe(
      '/api/teams/team-1/calendar?projectId=proj-9',
    );
  });

  it('URL-encodes a projectId containing special characters', () => {
    expect(buildCalendarUrl('team-1', 'a b/c&d')).toBe(
      '/api/teams/team-1/calendar?projectId=a%20b%2Fc%26d',
    );
  });
});
