import { cookies } from 'next/headers';
import { API_URL, COOKIE } from './config';

/**
 * Forwards a request from a BFF route handler to the Lanyard API, attaching the
 * httpOnly access token as a Bearer header. Keeps tokens off the client entirely.
 */
export async function proxy(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await cookies()).get(COOKIE.access)?.value;
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' });
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
