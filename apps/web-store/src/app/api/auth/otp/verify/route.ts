import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { AuthTokens } from '@lanyard/contracts';
import { API_URL, COOKIE } from '@/lib/config';

/** BFF: verify a login OTP, then store the tokens in httpOnly cookies. */
export async function POST(req: NextRequest) {
  const { phone, code } = (await req.json()) as { phone?: string; code?: string };
  const res = await fetch(`${API_URL}/auth/customer/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code, purpose: 'login' }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json(body, { status: res.status });

  const tokens = body as AuthTokens;
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
  return NextResponse.json({ ok: true });
}
