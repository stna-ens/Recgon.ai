export const runtime = 'nodejs';

import { verifyAndConsumeAuthCode, createAccessToken } from '@/lib/mcpTokenStorage';

export async function POST(request: Request) {
  let params: URLSearchParams;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    params = new URLSearchParams(text);
  } else {
    const json = await request.json().catch(() => ({}));
    params = new URLSearchParams(json);
  }

  const grantType = params.get('grant_type');
  const code = params.get('code');
  const codeVerifier = params.get('code_verifier');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');

  if (grantType !== 'authorization_code') {
    return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
  }
  if (!code || !codeVerifier || !clientId || !redirectUri) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const userId = await verifyAndConsumeAuthCode(code, codeVerifier, clientId, redirectUri);
  if (!userId) {
    return Response.json({ error: 'invalid_grant' }, { status: 400 });
  }

  const accessToken = await createAccessToken(userId, clientId, 'mcp');
  return Response.json({
    access_token: accessToken,
    token_type: 'bearer',
    scope: 'mcp',
  });
}
