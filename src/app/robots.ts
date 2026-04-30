import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://recgon.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/landing', '/login', '/register'],
        disallow: [
          '/api/',
          '/projects/',
          '/marketing/',
          '/feedback/',
          '/analytics/',
          '/teams/',
          '/account/',
          '/mcp',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
