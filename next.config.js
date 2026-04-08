/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent bundling of packages that use native Node.js APIs or binary modules.
  // These are only used in Node.js runtime API routes (runtime = 'nodejs').
  serverExternalPackages: [
    '@react-pdf/renderer',
    'mammoth',
    'pdf-parse',
    'canvas',
    '@modelcontextprotocol/sdk',
  ],
};

module.exports = nextConfig;
