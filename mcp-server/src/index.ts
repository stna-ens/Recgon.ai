import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isAuthConfigured } from './auth.js';
import { registerTools } from './tools.js';

const server = new McpServer(
  {
    name: 'recgon',
    version: '1.0.0',
  },
  {
    capabilities: { logging: {} },
  },
);

registerTools(server);

async function main() {
  if (!isAuthConfigured()) {
    console.error('Warning: RECGON_MCP_TOKEN is not set. All tool calls will fail.');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Recgon MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
