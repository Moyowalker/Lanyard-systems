import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

/** Initialize a payment intent for an order. */
export async function POST(req: NextRequest) {
  const body = await req.text();
  return relay(await proxy('/payments/intents', { method: 'POST', body }));
}
