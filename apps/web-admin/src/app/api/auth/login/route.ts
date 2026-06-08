import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { API_URL, COOKIE } from '@/lib/config';

async function setTokens(body: { accessToken: string; refreshToken: string; expiresIn: number }) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(COOKIE.access, body.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: body.expiresIn,
  });
  jar.set(COOKIE.refresh, body.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Staff login. Returns { mfaRequired, mfaToken } when MFA is enabled, else sets cookies. */
export async function POST(req: NextRequest) {
  const creds = await req.json();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/staff/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(creds),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'Authentication service unavailable. Start the API on http://localhost:4000/api/v1.',
        },
      },
      { status: 503 },
    );
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json(body, { status: res.status });
  if (body?.mfaRequired) return NextResponse.json(body); // step-up needed; no cookies yet
  await setTokens(body);
  return NextResponse.json({ ok: true });
}
