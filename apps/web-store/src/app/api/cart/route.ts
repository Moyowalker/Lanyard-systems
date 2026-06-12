import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE } from '@/lib/config';
import { proxy, relay } from '@/lib/proxy';
import { getOrCreateAnonId } from '@/lib/anon-cart';

export async function GET() {
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (token) return relay(await proxy('/cart'));

  const anonId = await getOrCreateAnonId();
  return relay(await proxy(`/cart/anonymous?anonId=${encodeURIComponent(anonId)}`));
}

/** Add/set a cart line item. */
export async function POST(req: NextRequest) {
  const token = (await cookies()).get(COOKIE.access)?.value;
  const body = await req.text();
  if (token) return relay(await proxy('/cart/items', { method: 'POST', body }));

  const anonId = await getOrCreateAnonId();
  return relay(
    await proxy('/cart/anonymous/items', {
      method: 'POST',
      body: JSON.stringify({ ...JSON.parse(body), anonId }),
    }),
  );
}
