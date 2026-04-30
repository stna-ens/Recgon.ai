/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  // Strict Mode forces every client component to mount/render twice in dev.
  // Disabled to halve dev-mode CPU cost; flip to `true` when hunting effect
  // bugs. (Strict Mode is a no-op in production builds either way.)
  reactStrictMode: false,
  // Pin the workspace root to this directory — there's a stray lockfile in the
  // parent that Turbopack would otherwise pick up and warn about.
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
    '@modelcontextprotocol/sdk',
  ],
  // Tree-shake heavy barrel-export packages so dev rebuilds don't drag in
  // every export of three/recharts/motion on every change.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'motion',
      '@react-three/drei',
      '@react-three/fiber',
      'three',
      'ogl',
      '@number-flow/react',
    ],
  },
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
