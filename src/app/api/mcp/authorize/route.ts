export const runtime = 'nodejs';

import { auth } from '@/auth';
import { createAuthCode } from '@/lib/mcpTokenStorage';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const responseType = url.searchParams.get('response_type');
  const state = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');
  const scope = url.searchParams.get('scope') ?? 'mcp';

  if (responseType !== 'code') {
    return Response.json({ error: 'unsupported_response_type' }, { status: 400 });
  }
  if (!clientId || !redirectUri || !codeChallenge) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (codeChallengeMethod !== 'S256') {
    return Response.json({ error: 'invalid_request', error_description: 'Only S256 code_challenge_method is supported' }, { status: 400 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    // Not logged in — redirect to Recgon login, which will come back here after auth
    const callbackUrl = encodeURIComponent(request.url);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://recgon-ai.vercel.app';
    return Response.redirect(`${base}/login?callbackUrl=${callbackUrl}`);
  }

  // Logged in — create auth code and redirect back to MCP client
  const code = await createAuthCode(session.user.id, redirectUri, clientId, codeChallenge, scope);

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  return Response.redirect(redirectUrl.toString());
}
