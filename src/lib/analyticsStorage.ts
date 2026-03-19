import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'analytics.json');

interface AnalyticsConfig {
  propertyId: string;
  updatedAt: string;
}

type Store = Record<string, AnalyticsConfig>;

function load(): Store {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
}

function save(store: Store): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}

export function getAnalyticsConfig(userId: string): AnalyticsConfig | undefined {
  return load()[userId];
}

export function setAnalyticsConfig(userId: string, propertyId: string): void {
  const store = load();
  store[userId] = { propertyId, updatedAt: new Date().toISOString() };
  save(store);
}
