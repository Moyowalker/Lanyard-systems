import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

/** BFF: replace the signed-in customer's saved address list. */
export async function PUT(req: NextRequest) {
  const body = await req.text();
  return relay(await proxy('/me/addresses', { method: 'PUT', body: body || undefined }));
}
