export const runtime = 'nodejs';

import crypto from 'crypto';

// RFC 7591 — OAuth 2.0 Dynamic Client Registration.
// PKCE protects the authorization code flow, so we issue ephemeral public
// client IDs without persisting them. The client_id is opaquely echoed
// through /authorize and /token, which is sufficient for PKCE clients.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  const clientId = `mcp-${crypto.randomBytes(16).toString('hex')}`;
  const issuedAt = Math.floor(Date.now() / 1000);

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      // No client_secret — public client, PKCE required.
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      redirect_uris: redirectUris,
      client_name: typeof body.client_name === 'string' ? body.client_name : undefined,
      scope: 'mcp',
    },
    { status: 201 },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
