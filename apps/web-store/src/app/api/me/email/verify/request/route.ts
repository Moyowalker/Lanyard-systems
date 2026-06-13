import { proxy, relay } from '@/lib/proxy';

/** BFF: send an email verification code to the customer's email. */
export async function POST() {
  return relay(await proxy('/me/email/verify/request', { method: 'POST' }));
}
