import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

/** BFF: confirm the email verification code. */
export async function POST(req: NextRequest) {
  const body = await req.text();
  return relay(await proxy('/me/email/verify/confirm', { method: 'POST', body: body || undefined }));
}
