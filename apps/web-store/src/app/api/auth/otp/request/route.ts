import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/config';

/** BFF: request a login OTP for a phone number. Forwards devCode through in dev. */
export async function POST(req: NextRequest) {
  const { phone } = (await req.json()) as { phone?: string };
  const res = await fetch(`${API_URL}/auth/customer/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, purpose: 'login' }),
  });
  const body = await res.json().catch(() => null);
  return NextResponse.json(body, { status: res.status });
}
