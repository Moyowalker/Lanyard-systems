/** Server-side API base URL — never shipped to the browser. */
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

export const API_URL = resolveApiUrl();

function resolveStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    (process.env.RENDER ? 'https://lanyard-web-store.onrender.com' : 'http://localhost:3000')
  ).replace(/\/+$/, '');
}

export const STORE_URL = resolveStoreUrl();

/** Cookie names. Access/refresh tokens are httpOnly (XSS-safe, doc 07). */
export const COOKIE = {
  access: 'lny_at',
  refresh: 'lny_rt',
  branch: 'lny_branch',
  anon: 'lny_anon',
} as const;
