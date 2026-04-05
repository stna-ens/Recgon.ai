/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack is default in Next.js 16
  turbopack: {
    root: __dirname,
  },

  // Prevent bundling of packages that use native Node.js APIs or binary modules.
  // These are only used in Node.js runtime API routes (runtime = 'nodejs').
  serverExternalPackages: [
    '@react-pdf/renderer',
    'mammoth',
    'pdf-parse',
    'canvas',
  ],
};

module.exports = nextConfig;
