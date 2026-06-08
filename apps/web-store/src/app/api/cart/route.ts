import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

export async function GET() {
  return relay(await proxy('/cart'));
}

/** Add/set a cart line item. */
export async function POST(req: NextRequest) {
  const body = await req.text();
  return relay(await proxy('/cart/items', { method: 'POST', body }));
}
