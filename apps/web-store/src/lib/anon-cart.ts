import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { COOKIE } from './config';

const maxAge = 60 * 60 * 24 * 14;

export async function getOrCreateAnonId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE.anon)?.value;
  if (existing) return existing;

  const anonId = randomBytes(24).toString('hex');
  jar.set(COOKIE.anon, anonId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return anonId;
}

export async function getAnonId(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE.anon)?.value;
}

export async function clearAnonId(): Promise<void> {
  (await cookies()).delete(COOKIE.anon);
}
