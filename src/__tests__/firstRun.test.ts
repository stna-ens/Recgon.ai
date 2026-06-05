import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  shouldShowFirstRun,
  isFirstRunDismissed,
  dismissFirstRun,
} from '@/lib/firstRun';

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const mock = {
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, String(v));
    }),
    removeItem: vi.fn((k: string) => {
      store.delete(k);
    }),
    clear: vi.fn(() => store.clear()),
  };
  vi.stubGlobal('window', { localStorage: mock });
  return mock;
}

describe('shouldShowFirstRun', () => {
  it('shows when no projects and not dismissed', () => {
    expect(shouldShowFirstRun({ projectCount: 0, dismissed: false })).toBe(true);
  });

  it('hides when the team has projects', () => {
    expect(shouldShowFirstRun({ projectCount: 3, dismissed: false })).toBe(false);
    // Even a single project hides it.
    expect(shouldShowFirstRun({ projectCount: 1, dismissed: false })).toBe(false);
  });

  it('hides when dismissed, even with zero projects', () => {
    expect(shouldShowFirstRun({ projectCount: 0, dismissed: true })).toBe(false);
  });
});

describe('first-run dismiss persistence', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('is not dismissed by default', () => {
    installLocalStorageMock();
    expect(isFirstRunDismissed('team-a')).toBe(false);
  });

  it('persists dismissal and reads it back (roundtrip)', () => {
    installLocalStorageMock();
    expect(isFirstRunDismissed('team-a')).toBe(false);
    dismissFirstRun('team-a');
    expect(isFirstRunDismissed('team-a')).toBe(true);
  });

  it('scopes dismissal per teamId', () => {
    installLocalStorageMock();
    dismissFirstRun('team-a');
    expect(isFirstRunDismissed('team-a')).toBe(true);
    // A different team is unaffected.
    expect(isFirstRunDismissed('team-b')).toBe(false);
    dismissFirstRun('team-b');
    expect(isFirstRunDismissed('team-b')).toBe(true);
  });

  it('uses the team-scoped localStorage key', () => {
    const mock = installLocalStorageMock();
    dismissFirstRun('team-xyz');
    expect(mock.setItem).toHaveBeenCalledWith('recgon.firstrun.dismissed.team-xyz', '1');
  });

  it('treats a missing window as not dismissed (SSR guard)', () => {
    vi.stubGlobal('window', undefined);
    expect(isFirstRunDismissed('team-a')).toBe(false);
    // Should not throw when window is absent.
    expect(() => dismissFirstRun('team-a')).not.toThrow();
  });
});
