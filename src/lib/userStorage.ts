import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  nickname: string;
  createdAt: string;
}

function getUsersFile(): string {
  return path.join(DATA_DIR, 'users.json');
}

function getAllUsers(): User[] {
  ensureDataDir();
  const file = getUsersFile();
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveUsers(users: User[]): void {
  ensureDataDir();
  fs.writeFileSync(getUsersFile(), JSON.stringify(users, null, 2));
}

export function getUserByEmail(email: string): User | undefined {
  return getAllUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(id: string): User | undefined {
  return getAllUsers().find((u) => u.id === id);
}

export function updateUser(id: string, updates: Partial<Pick<User, 'email' | 'passwordHash' | 'nickname'>>): User | undefined {
  const users = getAllUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return undefined;
  users[idx] = { ...users[idx], ...updates };
  saveUsers(users);
  return users[idx];
}

export function createUser(email: string, passwordHash: string, nickname: string): User {
  const users = getAllUsers();
  const user: User = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
    email,
    passwordHash,
    nickname,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}
