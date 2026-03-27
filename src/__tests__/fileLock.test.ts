import { describe, it, expect } from 'vitest';
import { withFileLock } from '../lib/fileLock';

describe('withFileLock', () => {
  it('executes the function and returns its result', async () => {
    const result = await withFileLock('/test/file', () => 42);
    expect(result).toBe(42);
  });

  it('executes async functions', async () => {
    const result = await withFileLock('/test/file', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'async-result';
    });
    expect(result).toBe('async-result');
  });

  it('serializes concurrent operations on the same file', async () => {
    const order: number[] = [];

    const p1 = withFileLock('/test/same-file', async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
    });

    const p2 = withFileLock('/test/same-file', async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it('allows concurrent operations on different files', async () => {
    const order: string[] = [];

    const p1 = withFileLock('/test/file-a', async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push('a');
    });

    const p2 = withFileLock('/test/file-b', async () => {
      order.push('b');
    });

    await Promise.all([p1, p2]);
    // b should finish first since it has no delay
    expect(order).toEqual(['b', 'a']);
  });

  it('releases lock even on error', async () => {
    try {
      await withFileLock('/test/error-file', () => {
        throw new Error('test error');
      });
    } catch {
      // expected
    }

    // Should be able to acquire lock again
    const result = await withFileLock('/test/error-file', () => 'recovered');
    expect(result).toBe('recovered');
  });
});
