import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { COOKIE } from '@/lib/config';

/** BFF: persist the customer's selected branch in a cookie. */
export async function POST(req: NextRequest) {
  const { branchId } = (await req.json()) as { branchId?: string };
  if (!branchId) return NextResponse.json({ error: 'branchId required' }, { status: 400 });
  const jar = await cookies();
  jar.set(COOKIE.branch, branchId, {
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
  return NextResponse.json({ ok: true });
}
