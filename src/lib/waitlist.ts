import { supabase } from './supabase';

export type RegistrationWaitlistStatus = 'pending' | 'approved' | 'rejected';

export interface RegistrationWaitlistEntry {
  id: string;
  email: string;
  nickname: string | null;
  status: RegistrationWaitlistStatus;
  requestedAt: string;
  approvedAt: string | null;
  approvedByEmail: string | null;
  updatedAt: string;
}

function rowToRegistrationWaitlistEntry(row: Record<string, unknown>): RegistrationWaitlistEntry {
  return {
    id: row.id as string,
    email: row.email as string,
    nickname: (row.nickname as string | null) ?? null,
    status: row.status as RegistrationWaitlistStatus,
    requestedAt: row.requested_at as string,
    approvedAt: (row.approved_at as string | null) ?? null,
    approvedByEmail: (row.approved_by_email as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function isMetuEmail(email: string): boolean {
  return normalizeEmailAddress(email).endsWith('@metu.edu.tr');
}

export function parseWaitlistAdminEmails(value = process.env.WAITLIST_ADMIN_EMAILS): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((email) => normalizeEmailAddress(email))
    .filter(Boolean);
}

export function isWaitlistAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return parseWaitlistAdminEmails().includes(normalizeEmailAddress(email));
}

export async function getRegistrationWaitlistEntryByEmail(email: string): Promise<RegistrationWaitlistEntry | undefined> {
  const normalizedEmail = normalizeEmailAddress(email);
  const { data, error } = await supabase
    .from('registration_waitlist')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch waitlist entry: ${error.message}`);
  return data ? rowToRegistrationWaitlistEntry(data) : undefined;
}

export async function canSelfRegister(email: string): Promise<boolean> {
  if (isMetuEmail(email)) return true;
  const entry = await getRegistrationWaitlistEntryByEmail(email);
  return entry?.status === 'approved';
}

export async function requestWaitlistAccess(email: string, nickname?: string): Promise<RegistrationWaitlistEntry> {
  const normalizedEmail = normalizeEmailAddress(email);
  const normalizedNickname = nickname?.trim() ? nickname.trim() : null;
  const existing = await getRegistrationWaitlistEntryByEmail(normalizedEmail);
  const now = new Date().toISOString();

  if (existing?.status === 'approved') {
    return existing;
  }

  if (existing) {
    const { data, error } = await supabase
      .from('registration_waitlist')
      .update({
        nickname: normalizedNickname ?? existing.nickname,
        status: 'pending',
        requested_at: now,
        approved_at: null,
        approved_by_email: null,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update waitlist entry: ${error?.message}`);
    }

    return rowToRegistrationWaitlistEntry(data);
  }

  const { data, error } = await supabase
    .from('registration_waitlist')
    .insert({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      nickname: normalizedNickname,
      status: 'pending',
      requested_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create waitlist entry: ${error?.message}`);
  }

  return rowToRegistrationWaitlistEntry(data);
}

export async function listRegistrationWaitlistEntries(): Promise<RegistrationWaitlistEntry[]> {
  const { data, error } = await supabase
    .from('registration_waitlist')
    .select('*')
    .order('requested_at', { ascending: false });

  if (error) throw new Error(`Failed to list waitlist entries: ${error.message}`);
  return (data ?? []).map((row) => rowToRegistrationWaitlistEntry(row));
}

export async function updateRegistrationWaitlistStatus(
  id: string,
  status: RegistrationWaitlistStatus,
  adminEmail: string,
): Promise<RegistrationWaitlistEntry> {
  const now = new Date().toISOString();
  const approved = status === 'approved';
  const { data, error } = await supabase
    .from('registration_waitlist')
    .update({
      status,
      approved_at: approved ? now : null,
      approved_by_email: approved ? normalizeEmailAddress(adminEmail) : null,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update waitlist entry: ${error?.message}`);
  }

  return rowToRegistrationWaitlistEntry(data);
}
