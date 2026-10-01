import type { MetadataRoute } from 'next';

import { SEO_INDEXING_ENABLED, SITE_URL } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  if (!SEO_INDEXING_ENABLED) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: '/api/',
      },
    ],
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
  };
}
