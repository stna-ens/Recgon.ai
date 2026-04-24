import { describe, expect, it } from 'vitest';
import {
  isMetuEmail,
  normalizeEmailAddress,
  parseWaitlistAdminEmails,
} from '@/lib/waitlist';

describe('waitlist helpers', () => {
  it('normalizes email addresses', () => {
    expect(normalizeEmailAddress('  Test@Example.com ')).toBe('test@example.com');
  });

  it('detects METU addresses case-insensitively', () => {
    expect(isMetuEmail('Founder@METU.EDU.TR')).toBe(true);
    expect(isMetuEmail('founder@gmail.com')).toBe(false);
  });

  it('parses founder admin emails from env-style strings', () => {
    expect(parseWaitlistAdminEmails(' founder@example.com,FOUNDER@metu.edu.tr ,, ')).toEqual([
      'founder@example.com',
      'founder@metu.edu.tr',
    ]);
  });
});
