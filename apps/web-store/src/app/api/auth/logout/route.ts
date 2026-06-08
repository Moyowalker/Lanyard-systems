import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { proxy } from '@/lib/proxy';
import { COOKIE } from '@/lib/config';

/** BFF: revoke the session server-side (best effort) and clear cookies. */
export async function POST() {
  await proxy('/auth/logout', { method: 'POST' }).catch(() => undefined);
  const jar = await cookies();
  jar.delete(COOKIE.access);
  jar.delete(COOKIE.refresh);
  return NextResponse.json({ ok: true });
}
