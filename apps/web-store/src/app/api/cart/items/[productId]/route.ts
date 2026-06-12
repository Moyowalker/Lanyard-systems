import { cookies } from 'next/headers';
import { COOKIE } from '@/lib/config';
import { getAnonId } from '@/lib/anon-cart';
import { proxy, relay } from '@/lib/proxy';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) {
    const anonId = await getAnonId();
    if (!anonId) return Response.json({ message: 'Cart not found' }, { status: 404 });
    return relay(
      await proxy(`/cart/anonymous/items/${productId}?anonId=${encodeURIComponent(anonId)}`, {
        method: 'DELETE',
      }),
    );
  }
  return relay(await proxy(`/cart/items/${productId}`, { method: 'DELETE' }));
}
