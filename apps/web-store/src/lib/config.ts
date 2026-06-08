/** Server-side API base URL — never shipped to the browser. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000/api/v1';

/** Cookie names. Access/refresh tokens are httpOnly (XSS-safe, doc 07). */
export const COOKIE = {
  access: 'lny_at',
  refresh: 'lny_rt',
  branch: 'lny_branch',
} as const;
