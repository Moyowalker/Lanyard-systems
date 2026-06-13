import type { AuthTokens } from '@lanyard/contracts';
import { cookies } from 'next/headers';
import { API_URL, COOKIE } from './config';

/**
 * Forwards a request from a BFF route handler to the Lanyard API, attaching the
 * httpOnly access token as a Bearer header. Keeps tokens off the client entirely.
 *
 * Access tokens are short-lived (15m). When one is missing or rejected, we silently
 * rotate it using the refresh cookie and retry once — so a customer mid-checkout is
 * never bounced to login just because their access token expired.
 */

async function persistTokens(tokens: AuthTokens): Promise<void> {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(COOKIE.access, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: tokens.expiresIn,
  });
  jar.set(COOKIE.refresh, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE.access);
  jar.delete(COOKIE.refresh);
}

/** Rotate the access token using the refresh cookie. Returns the new access token, or undefined. */
async function refreshAccessToken(): Promise<string | undefined> {
  const jar = await cookies();
  const refreshToken = jar.get(COOKIE.refresh)?.value;
  if (!refreshToken) return undefined;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    // A rejected refresh token is dead — clear cookies so the UI shows signed-out state.
    if (response?.status === 401) await clearSessionCookies();
    return undefined;
  }

  const tokens = (await response.json()) as AuthTokens;
  await persistTokens(tokens);
  return tokens.accessToken;
}

function withAuth(init: RequestInit, token?: string): Headers {
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return headers;
}

export async function proxy(path: string, init: RequestInit = {}): Promise<Response> {
  const jar = await cookies();
  let token = jar.get(COOKIE.access)?.value;

  // No access token but a refresh cookie may exist → try to mint one before the call.
  if (!token) {
    token = await refreshAccessToken();
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: withAuth(init, token),
      cache: 'no-store',
    });
  } catch {
    return new Response(JSON.stringify({ message: 'Upstream service unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (response.status !== 401) return response;

  // Access token rejected → rotate and retry once.
  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken || refreshedToken === token) return response;

  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: withAuth(init, refreshedToken),
      cache: 'no-store',
    });
  } catch {
    return new Response(JSON.stringify({ message: 'Upstream service unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
}

/** Relay an upstream API Response back through the route handler unchanged. */
export async function relay(res: Response): Promise<Response> {
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}
