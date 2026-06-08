import { proxy, relay } from '@/lib/proxy';

/** Dev-only: drive the mock provider's settlement (no real checkout page in dev). */
export async function POST(_req: Request, { params }: { params: Promise<{ intentId: string }> }) {
  const { intentId } = await params;
  return relay(await proxy(`/payments/dev/confirm/${intentId}`, { method: 'POST' }));
}
