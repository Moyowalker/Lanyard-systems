import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { API_URL, COOKIE } from '@/lib/config';

/**
 * Public BFF for storefront search typeahead. Proxies the query to the API's
 * suggest endpoint and folds in the customer's selected branch (cookie) so
 * suggestions respect local price/availability. No auth required.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ data: [] });

  const branchId = (await cookies()).get(COOKIE.branch)?.value;
  const params = new URLSearchParams({ q });
  if (branchId) params.set('branchId', branchId);

  const res = await fetch(`${API_URL}/catalog/search/suggest?${params.toString()}`, {
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}
