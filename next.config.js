const createNextIntlPlugin = require('next-intl/plugin');
// Resolves the per-user UI locale (no URL routing — see src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

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
      // Radix has many barrel exports — letting Next tree-shake them keeps
      // dev rebuilds from re-resolving every primitive on every change.
      '@radix-ui/themes',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-toolbar',
      '@radix-ui/react-tooltip',
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
  async redirects() {
    return [
      {
        source: '/mentor',
        destination: '/terminal',
        permanent: false,
      },
      {
        source: '/mentor/:path*',
        destination: '/terminal/:path*',
        permanent: false,
      },
      {
        source: '/v2',
        destination: '/',
        permanent: false,
      },
      {
        source: '/v2/:path*',
        destination: '/:path*',
        permanent: false,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
