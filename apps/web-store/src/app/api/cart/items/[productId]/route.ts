import { proxy, relay } from '@/lib/proxy';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  return relay(await proxy(`/cart/items/${productId}`, { method: 'DELETE' }));
}
