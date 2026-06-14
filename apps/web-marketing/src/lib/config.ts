function resolveApiUrl(): string {
  const configuredUrl = process.env.API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  const internalHostport = process.env.API_HOSTPORT?.trim();
  if (internalHostport) {
    const prefix = (process.env.API_GLOBAL_PREFIX ?? 'api/v1').replace(/^\/+|\/+$/g, '');
    return `http://${internalHostport}/${prefix}`;
  }

  return 'http://localhost:4000/api/v1';
}

function resolveMarketingUrl(
  publicUrl: string | undefined,
  serverUrl: string | undefined,
  renderUrl: string,
  localUrl: string,
): string {
  return publicUrl?.trim() || serverUrl?.trim() || (process.env.RENDER ? renderUrl : localUrl);
}

export const API_URL = resolveApiUrl();
export const STORE_URL = resolveMarketingUrl(
  process.env.NEXT_PUBLIC_STORE_URL,
  process.env.STORE_URL,
  'https://lanyard-web-store.onrender.com',
  'http://localhost:3000',
);
export const SITE_URL = resolveMarketingUrl(
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.SITE_URL,
  'https://lanyard-web-marketing.onrender.com',
  'http://localhost:3002',
);
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';
