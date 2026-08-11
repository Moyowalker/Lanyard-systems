import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { API_URL, COOKIE } from '@/lib/config';

/** Public BFF for subsequent search result pages, scoped to the selected branch. */
export async function GET(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  const branchId = (await cookies()).get(COOKIE.branch)?.value;
  if (branchId) params.set('branchId', branchId);

  const res = await fetch(`${API_URL}/catalog/search?${params.toString()}`, {
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}