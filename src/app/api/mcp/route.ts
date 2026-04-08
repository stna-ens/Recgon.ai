export const runtime = 'nodejs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { validateAccessToken } from '@/lib/mcpTokenStorage';
import { getUserTeams } from '@/lib/teamStorage';
import { registerTools } from '@/lib/mcpTools';

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

async function resolveTeamIds(request: Request): Promise<string[] | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const tokenData = await validateAccessToken(token);
  if (!tokenData) return null;

  const teams = await getUserTeams(tokenData.userId);
  return teams.map((t) => t.id);
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const teamIds = await resolveTeamIds(request);
  if (!teamIds) return unauthorized();

  const server = new McpServer({ name: 'recgon', version: '1.0.0' });
  registerTools(server, teamIds);

  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  return transport.handleRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE() {
  return new Response(null, { status: 200 });
}
