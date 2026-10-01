import type { MetadataRoute } from 'next';

import { SEO_INDEXING_ENABLED, SITE_URL } from '@/lib/config';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!SEO_INDEXING_ENABLED) return [];

  return ['/', '/about', '/services', '/branches', '/faq', '/contact'].map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.7,
  }));
}
