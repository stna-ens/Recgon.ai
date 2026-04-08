export const runtime = 'nodejs';

// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
// MCP clients fetch this to discover which authorization server protects /mcp.
export async function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://recgon-ai.vercel.app';
  return Response.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
  });
}
