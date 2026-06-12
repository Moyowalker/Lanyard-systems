import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

export async function POST(req: NextRequest) {
  const body = await req.text();
  return relay(await proxy('/checkout/quote', { method: 'POST', body }));
}
