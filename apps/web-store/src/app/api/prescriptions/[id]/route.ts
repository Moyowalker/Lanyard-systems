import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_URL, COOKIE } from '@/lib/config';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(COOKIE.access)?.value;
  const res = await fetch(`${API_URL}/prescriptions/${id}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}
