import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { AuthTokens } from '@lanyard/contracts';
import { API_URL, COOKIE } from '@/lib/config';

/** Complete staff MFA step-up, then set token cookies. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/staff/mfa/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          message:
            'Authentication service unavailable. Start the API on http://localhost:4000/api/v1.',
        },
      },
      { status: 503 },
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const tokens = data as AuthTokens;
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
