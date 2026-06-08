import { cookies } from 'next/headers';
import { API_URL, COOKIE } from './config';

/** Forward a BFF request to the API with the staff bearer token attached. */
export async function proxy(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await cookies()).get(COOKIE.access)?.value;
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' });
}

export async function relay(res: Response): Promise<Response> {
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}
