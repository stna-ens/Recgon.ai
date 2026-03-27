import fs from 'fs';
import path from 'path';
import { withFileLock } from './fileLock';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'analytics.json');

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms timestamp
}

export interface AnalyticsConfig {
  propertyId: string;
  // Auth method 1: Service account (legacy)
  serviceAccountJson?: string;
  // Auth method 2: OAuth
  oauth?: OAuthTokens;
  authMethod: 'service_account' | 'oauth';
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

export async function setAnalyticsConfig(userId: string, propertyId: string, serviceAccountJson: string): Promise<void> {
  return withFileLock(FILE, () => {
    const store = load();
    store[userId] = {
      propertyId,
      serviceAccountJson,
      authMethod: 'service_account',
      updatedAt: new Date().toISOString(),
    };
    save(store);
  });
}

export async function setAnalyticsOAuth(userId: string, tokens: OAuthTokens): Promise<void> {
  return withFileLock(FILE, () => {
    const store = load();
    const existing = store[userId];
    store[userId] = {
      propertyId: existing?.propertyId ?? '',
      authMethod: 'oauth',
      oauth: tokens,
      updatedAt: new Date().toISOString(),
    };
    save(store);
  });
}

export async function setAnalyticsPropertyId(userId: string, propertyId: string): Promise<void> {
  return withFileLock(FILE, () => {
    const store = load();
    if (!store[userId]) return;
    store[userId].propertyId = propertyId;
    store[userId].updatedAt = new Date().toISOString();
    save(store);
  });
}

export async function updateOAuthTokens(userId: string, tokens: Partial<OAuthTokens>): Promise<void> {
  return withFileLock(FILE, () => {
    const store = load();
    const config = store[userId];
    if (!config?.oauth) return;
    config.oauth = { ...config.oauth, ...tokens };
    config.updatedAt = new Date().toISOString();
    save(store);
  });
}

export async function disconnectAnalytics(userId: string): Promise<void> {
  return withFileLock(FILE, () => {
    const store = load();
    delete store[userId];
    save(store);
  });
}
