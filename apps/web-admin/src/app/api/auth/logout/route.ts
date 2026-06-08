import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { proxy } from '@/lib/proxy';
import { COOKIE } from '@/lib/config';

export async function POST() {
  await proxy('/auth/logout', { method: 'POST' }).catch(() => undefined);
  const jar = await cookies();
  jar.delete(COOKIE.access);
  jar.delete(COOKIE.refresh);
  return NextResponse.json({ ok: true });
}
