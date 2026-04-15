import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://recgon.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/landing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
