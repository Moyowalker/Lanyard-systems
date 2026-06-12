import { STORE_URL } from './config';

type StoreHandoffOptions = {
  source: string;
  branchId?: string;
  intent?: 'shop' | 'prescription';
  path?: string;
};

function normalizePath(path?: string): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}

export function buildStoreHandoffUrl({
  source,
  branchId,
  intent = 'shop',
  path = '/',
}: StoreHandoffOptions): string {
  const url = new URL('/bridge', STORE_URL);
  url.searchParams.set('source', source);
  url.searchParams.set('path', normalizePath(path));
  if (intent === 'prescription') {
    url.searchParams.set('intent', intent);
  }
  if (branchId) {
    url.searchParams.set('branchId', branchId);
  }
  return url.toString();
}
