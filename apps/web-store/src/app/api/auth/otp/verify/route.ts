import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { AuthTokens } from '@lanyard/contracts';
import { API_URL, COOKIE } from '@/lib/config';
import { clearAnonId, getAnonId } from '@/lib/anon-cart';

/** BFF: verify a login or registration OTP, then store the tokens in httpOnly cookies. */
export async function POST(req: NextRequest) {
  const { phone, code, purpose } = (await req.json()) as {
    phone?: string;
    code?: string;
    purpose?: string;
  };
  // Default to login; registration confirms its phone with purpose=verify.
  const otpPurpose = purpose === 'verify' ? 'verify' : 'login';
  const res = await fetch(`${API_URL}/auth/customer/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code, purpose: otpPurpose }),
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

  const anonId = await getAnonId();
  if (anonId) {
    await fetch(`${API_URL}/cart/merge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify({ anonId }),
      cache: 'no-store',
    }).catch(() => undefined);
    await clearAnonId();
  }

  return NextResponse.json({ ok: true });
}
