import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

/** BFF: read / update the signed-in customer's profile. */
export async function GET() {
  return relay(await proxy('/me/profile'));
}

export async function PATCH(req: NextRequest) {
  const body = await req.text();
  return relay(await proxy('/me/profile', { method: 'PATCH', body: body || undefined }));
}
