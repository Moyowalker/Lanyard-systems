import { cookies } from 'next/headers';
import { API_URL, COOKIE } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API request failed (${status})`);
  }
}

/**
 * Server-side fetch to the Lanyard API. Used by Server Components. With `auth: true`
 * it attaches the httpOnly access-token cookie as a Bearer token. Uses `no-store` by
 * default so per-branch price/availability is always fresh.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.auth) {
    const token = (await cookies()).get(COOKIE.access)?.value;
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: init.cache ?? 'no-store',
  });
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/** Like apiFetch but returns null on any error (for optional/auth-gated reads). */
export async function apiTry<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T | null> {
  try {
    return await apiFetch<T>(path, init);
  } catch {
    return null;
  }
}
