import { NextRequest } from 'next/server';
import { proxy, relay } from '@/lib/proxy';

/** Public catalog products (branch-aware price + stock) — used by the POS item picker. */
export async function GET(req: NextRequest) {
  const search = req.nextUrl.search ?? '';
  return relay(await proxy(`/catalog/products${search}`));
}
