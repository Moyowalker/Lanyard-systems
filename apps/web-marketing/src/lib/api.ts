import { API_URL } from './config';

export async function apiTry<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: init.cache ?? 'no-store',
      signal: init.signal ?? AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
