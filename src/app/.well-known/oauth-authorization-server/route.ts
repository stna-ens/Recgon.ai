export const runtime = 'nodejs';

export async function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://recgon-ai.vercel.app';
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/authorize`,
    token_endpoint: `${base}/api/mcp/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  });
}
