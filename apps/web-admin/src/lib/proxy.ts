import type { AuthTokens } from '@lanyard/contracts';
import { cookies } from 'next/headers';
import { API_URL, COOKIE } from './config';

async function persistTokens(tokens: AuthTokens) {
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

async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete(COOKIE.access);
  jar.delete(COOKIE.refresh);
}

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
    if (response?.status === 401) {
      await clearSessionCookies();
    }
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

/** Forward a BFF request to the API with the staff bearer token attached. */
export async function proxy(path: string, init: RequestInit = {}): Promise<Response> {
  const jar = await cookies();
  let token = jar.get(COOKIE.access)?.value;

  if (!token) {
    token = await refreshAccessToken();
  }

  let response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: withAuth(init, token),
    cache: 'no-store',
  });

  if (response.status !== 401) {
    return response;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken || refreshedToken === token) {
    return response;
  }

  response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: withAuth(init, refreshedToken),
    cache: 'no-store',
  });

  return response;
}

export async function relay(res: Response): Promise<Response> {
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}
