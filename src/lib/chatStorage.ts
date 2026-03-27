import fs from 'fs';
import path from 'path';
import { withFileLock } from './fileLock';

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

type ChatStore = Record<string, StoredMessage[]>;

const FILE = path.join(process.cwd(), 'data', 'chat_history.json');
const MAX_MESSAGES = 120; // ~60 exchanges kept per user

function read(): ChatStore {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function write(d: ChatStore) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d));
}

export function getHistory(userId: string): StoredMessage[] {
  return read()[userId] ?? [];
}

export async function saveMessages(userId: string, msgs: StoredMessage[]) {
  return withFileLock(FILE, () => {
    const d = read();
    d[userId] = [...(d[userId] ?? []), ...msgs].slice(-MAX_MESSAGES);
    write(d);
  });
}

export async function clearHistory(userId: string) {
  return withFileLock(FILE, () => {
    const d = read();
    delete d[userId];
    write(d);
  });
}
