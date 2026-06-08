import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { API_URL, COOKIE } from '@/lib/config';

/**
 * BFF for prescription upload. Relays the multipart form-data to the API with the
 * customer's bearer token. We forward the parsed FormData (not a JSON body) so fetch
 * sets a fresh multipart boundary.
 */
export async function POST(req: NextRequest) {
  const token = (await cookies()).get(COOKIE.access)?.value;
  const form = await req.formData();
  const res = await fetch(`${API_URL}/prescriptions`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: form,
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}
