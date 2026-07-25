function resolveApiUrl(): string {
  const configuredUrl = process.env.API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  const internalHostport = process.env.API_HOSTPORT?.trim();
  if (internalHostport) {
    const prefix = (process.env.API_GLOBAL_PREFIX ?? 'api/v1').replace(/^\/+|\/+$/g, '');
    return `http://${internalHostport}/${prefix}`;
  }

  if (process.env.LANYARD_REQUIRE_EXPLICIT_CONFIG === 'true') {
    throw new Error('API_URL or API_HOSTPORT is required in production');
  }
  return 'http://localhost:4000/api/v1';
}

function resolvePublicUrl(
  name: string,
  publicUrl: string | undefined,
  serverUrl: string | undefined,
  localUrl: string,
): string {
  const configuredUrl = publicUrl?.trim() || serverUrl?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  if (process.env.LANYARD_REQUIRE_EXPLICIT_CONFIG === 'true') {
    throw new Error(`${name} is required in production`);
  }
  return localUrl;
}

export const API_URL = resolveApiUrl();
export const STORE_URL = resolvePublicUrl(
  'NEXT_PUBLIC_STORE_URL or STORE_URL',
  process.env.NEXT_PUBLIC_STORE_URL,
  process.env.STORE_URL,
  'http://localhost:3000',
);
export const SITE_URL = resolvePublicUrl(
  'NEXT_PUBLIC_SITE_URL or SITE_URL',
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.SITE_URL,
  'http://localhost:3002',
);
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';
