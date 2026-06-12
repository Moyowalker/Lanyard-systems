import { proxy, relay } from '@/lib/proxy';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return relay(await proxy(`/orders/${id}/reorder`, { method: 'POST' }));
}
