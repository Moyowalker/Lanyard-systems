import { proxy, relay } from '@/lib/proxy';

export async function GET() {
  return relay(await proxy('/catalog/categories'));
}