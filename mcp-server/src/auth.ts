const TOKEN = process.env.RECGON_MCP_TOKEN;

export function validateAuth(): void {
  if (!TOKEN) {
    throw new Error('RECGON_MCP_TOKEN environment variable is not set');
  }
}

export function isAuthConfigured(): boolean {
  return !!TOKEN;
}
