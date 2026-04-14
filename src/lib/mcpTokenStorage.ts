import crypto from 'crypto';
import { supabase } from './supabase';

// --- Auth Codes (short-lived, for PKCE exchange) ---

export async function createAuthCode(
  userId: string,
  redirectUri: string,
  clientId: string,
  codeChallenge: string,
  scope: string,
): Promise<string> {
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

  const { error } = await supabase.from('mcp_auth_codes').insert({
    user_id: userId,
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_challenge: codeChallenge,
    scope,
    expires_at: expiresAt,
  });

  if (error) throw new Error(`Failed to create auth code: ${error.message}`);
  return code;
}

export async function verifyAndConsumeAuthCode(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('mcp_auth_codes')
    .select('*')
    .eq('code', code)
    .eq('client_id', clientId)
    .eq('redirect_uri', redirectUri)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  // Verify PKCE: SHA-256(code_verifier) must equal stored code_challenge
  const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  if (hash !== data.code_challenge) return null;

  // Delete immediately — one-time use
  await supabase.from('mcp_auth_codes').delete().eq('code', code);

  return data.user_id as string;
}

// --- Access Tokens (durable) ---

export async function createAccessToken(userId: string, clientId: string, scope: string): Promise<string> {
  const accessToken = crypto.randomBytes(48).toString('base64url');

  const { error } = await supabase.from('mcp_tokens').insert({
    user_id: userId,
    access_token: accessToken,
    client_id: clientId,
    scope,
  });

  if (error) throw new Error(`Failed to create access token: ${error.message}`);
  return accessToken;
}

export async function validateAccessToken(token: string): Promise<{ userId: string; clientId: string; scope: string } | null> {
  const { data, error } = await supabase
    .from('mcp_tokens')
    .select('user_id, client_id, scope')
    .eq('access_token', token)
    .single();

  if (error || !data) return null;

  // Fire-and-forget last_used_at update
  supabase
    .from('mcp_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('access_token', token)
    .then(() => {});

  return {
    userId: data.user_id as string,
    clientId: data.client_id as string,
    scope: data.scope as string,
  };
}

export async function revokeAccessToken(token: string): Promise<void> {
  await supabase.from('mcp_tokens').delete().eq('access_token', token);
}
