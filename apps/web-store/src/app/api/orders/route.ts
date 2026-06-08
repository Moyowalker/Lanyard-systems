import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

export async function GET() {
  return relay(await proxy('/orders'));
}

/** Create an order from the current cart (optionally with linked prescriptions). */
export async function POST(req: NextRequest) {
  const body = await req.text();
  return relay(await proxy('/orders', { method: 'POST', body }));
}
