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

/** Cookie names. Access/refresh tokens are httpOnly (XSS-safe, doc 07). */
export const COOKIE = {
  access: 'lny_at',
  refresh: 'lny_rt',
  branch: 'lny_branch',
} as const;
