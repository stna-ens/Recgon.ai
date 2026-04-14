import { supabase } from './supabase';

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  nickname: string;
  createdAt: string;
  githubAccessToken?: string;
  githubUsername?: string;
  avatarUrl?: string;
  socialProfiles?: { platform: string; url: string }[];
}

function generateId(): string {
  return crypto.randomUUID();
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    passwordHash: row.password_hash as string | undefined,
    nickname: row.nickname as string,
    createdAt: row.created_at as string,
    githubAccessToken: row.github_access_token as string | undefined,
    githubUsername: row.github_username as string | undefined,
    avatarUrl: row.avatar_url as string | undefined,
    socialProfiles: (row.social_profiles as { platform: string; url: string }[]) ?? [],
  };
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .ilike('email', email)
    .single();
  return data ? rowToUser(data) : undefined;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  return data ? rowToUser(data) : undefined;
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, 'email' | 'passwordHash' | 'nickname' | 'githubAccessToken' | 'githubUsername' | 'avatarUrl' | 'socialProfiles'>>
): Promise<User | undefined> {
  const mapped: Record<string, unknown> = {};
  if (updates.email !== undefined) mapped.email = updates.email;
  if (updates.passwordHash !== undefined) mapped.password_hash = updates.passwordHash;
  if (updates.nickname !== undefined) mapped.nickname = updates.nickname;
  if (updates.githubAccessToken !== undefined) mapped.github_access_token = updates.githubAccessToken;
  if (updates.githubUsername !== undefined) mapped.github_username = updates.githubUsername;
  if (updates.avatarUrl !== undefined) mapped.avatar_url = updates.avatarUrl;
  if (updates.socialProfiles !== undefined) mapped.social_profiles = updates.socialProfiles;

  const { data } = await supabase
    .from('users')
    .update(mapped)
    .eq('id', id)
    .select('*')
    .single();
  return data ? rowToUser(data) : undefined;
}

export async function createUser(email: string, passwordHash: string | undefined, nickname: string): Promise<User> {
  const id = generateId();
  const { data, error } = await supabase
    .from('users')
    .insert({
      id,
      email,
      password_hash: passwordHash,
      nickname,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(`Failed to create user: ${error?.message}`);
  return rowToUser(data);
}

export async function findOrCreateOAuthUser(email: string, nickname: string): Promise<User> {
  const existing = await getUserByEmail(email);
  if (existing) return existing;
  return createUser(email, undefined, nickname);
}
