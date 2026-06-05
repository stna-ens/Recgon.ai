// Global test setup: make next-intl work in component tests without each test
// having to wrap renders in NextIntlClientProvider. We resolve translation keys
// against the real English dictionaries (messages/en/*.json) so existing tests
// that assert on English UI text keep passing, and any future translated
// component is testable out of the box.
import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

type Dict = Record<string, unknown>;

const enDir = path.resolve(process.cwd(), 'messages/en');
const messages: Record<string, Dict> = {};
try {
  for (const file of fs.readdirSync(enDir)) {
    if (file.endsWith('.json')) {
      messages[file.replace(/\.json$/, '')] = JSON.parse(
        fs.readFileSync(path.join(enDir, file), 'utf8'),
      );
    }
  }
} catch {
  // messages dir missing — resolver falls back to returning keys.
}

function lookup(namespace: string | undefined, key: string): unknown {
  const full = namespace ? `${namespace}.${key}` : key;
  return full.split('.').reduce<unknown>(
    (acc, part) =>
      acc && typeof acc === 'object' ? (acc as Dict)[part] : undefined,
    messages,
  );
}

function interpolate(str: string, values?: Record<string, unknown>): string {
  if (!values) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    k in values ? String(values[k]) : `{${k}}`,
  );
}

function makeT(namespace?: string) {
  const t = (key: string, values?: Record<string, unknown>) => {
    const v = lookup(namespace, key);
    const full = namespace ? `${namespace}.${key}` : key;
    return typeof v === 'string' ? interpolate(v, values) : full;
  };
  // Minimal surface used across the app's translated components.
  (t as unknown as Record<string, unknown>).rich = (key: string) => {
    const v = lookup(namespace, key);
    return typeof v === 'string' ? v.replace(/<\/?\w+>/g, '') : `${namespace}.${key}`;
  };
  (t as unknown as Record<string, unknown>).markup = (key: string) => t(key);
  (t as unknown as Record<string, unknown>).raw = (key: string) => lookup(namespace, key);
  (t as unknown as Record<string, unknown>).has = (key: string) => lookup(namespace, key) !== undefined;
  return t;
}

vi.mock('next-intl', async (importOriginal) => {
  const actual = (await importOriginal().catch(() => ({}))) as Record<string, unknown>;
  return {
    ...actual,
    useTranslations: (namespace?: string) => makeT(namespace),
    useLocale: () => 'en',
    useMessages: () => messages,
    useNow: () => new Date(0),
    useTimeZone: () => 'UTC',
    useFormatter: () => ({
      dateTime: (v: Date) => String(v),
      number: (v: number) => String(v),
      relativeTime: (v: unknown) => String(v),
      list: (v: Iterable<string>) => Array.from(v).join(', '),
    }),
    NextIntlClientProvider: ({ children }: { children: unknown }) => children,
  };
});

vi.mock('next-intl/server', async (importOriginal) => {
  const actual = (await importOriginal().catch(() => ({}))) as Record<string, unknown>;
  return {
    ...actual,
    getTranslations: async (arg?: string | { namespace?: string }) =>
      makeT(typeof arg === 'string' ? arg : arg?.namespace),
    getLocale: async () => 'en',
    getMessages: async () => messages,
    getNow: async () => new Date(0),
    getTimeZone: async () => 'UTC',
  };
});
