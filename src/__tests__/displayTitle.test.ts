// quick-260620-mav — unit tests for the pure display-fallback helper.

import { describe, it, expect } from 'vitest';
import { taskDisplayTitle } from '@/lib/recgon/displayTitle';

describe('taskDisplayTitle', () => {
  it('returns the shortSummary when present', () => {
    expect(
      taskDisplayTitle({ shortSummary: 'Refresh OAuth tokens', title: 'Implement OAuth token refresh logic' }),
    ).toBe('Refresh OAuth tokens');
  });

  it('trims the shortSummary before returning it', () => {
    expect(
      taskDisplayTitle({ shortSummary: '  Fix CSV export  ', title: 'Fix the broken CSV export on reports' }),
    ).toBe('Fix CSV export');
  });

  it('falls back to title when shortSummary is null', () => {
    expect(taskDisplayTitle({ shortSummary: null, title: 'Full task title' })).toBe('Full task title');
  });

  it('falls back to title when shortSummary is undefined', () => {
    expect(taskDisplayTitle({ title: 'Full task title' })).toBe('Full task title');
  });

  it('falls back to title when shortSummary is an empty string', () => {
    expect(taskDisplayTitle({ shortSummary: '', title: 'Full task title' })).toBe('Full task title');
  });

  it('falls back to title when shortSummary is whitespace-only', () => {
    expect(taskDisplayTitle({ shortSummary: '   ', title: 'Full task title' })).toBe('Full task title');
  });

  it('returns the title verbatim when no summary exists', () => {
    const title = 'Add rate limiting to the public marketing API endpoints';
    expect(taskDisplayTitle({ title })).toBe(title);
  });
});
