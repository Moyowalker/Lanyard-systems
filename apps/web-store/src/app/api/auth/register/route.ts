import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/config';

/**
 * BFF: create a customer account. The API issues a phone OTP (purpose=verify); the client
 * then confirms it via /api/auth/otp/verify with purpose=verify to receive session tokens.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${API_URL}/auth/customer/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    cache: 'no-store',
  }).catch(() => null);

  if (!res) {
    return NextResponse.json(
      { error: { message: 'Upstream service unavailable' } },
      { status: 503 },
    );
  }

  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}
