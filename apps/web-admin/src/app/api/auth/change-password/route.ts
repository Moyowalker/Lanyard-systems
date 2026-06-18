import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '@/lib/proxy';

/** BFF for the authenticated staff password change. Forwards to the API with the bearer token. */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const upstream = await proxy('/auth/staff/change-password', {
    method: 'POST',
    body: body || undefined,
  });
  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const text = await upstream.text();
  return new NextResponse(text || null, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
