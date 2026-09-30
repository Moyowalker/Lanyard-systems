import type { Paginated, ProductListItemDto } from '@lanyard/contracts';

import { saveCatalog, type OfflineCatalog } from './vault';

export async function refreshOfflineCatalog(
  branchId: string,
  fetcher: typeof fetch = fetch,
): Promise<OfflineCatalog> {
  const products: ProductListItemDto[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ branchId, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const response = await fetcher(`/api/admin/pos/products?${params.toString()}`);
    if (!response.ok) throw new Error('Could not refresh the offline product catalog');
    const page = (await response.json()) as Paginated<ProductListItemDto>;
    products.push(...page.data);
    cursor = page.meta.nextCursor;
  } while (cursor);

  const catalog = { branchId, updatedAt: new Date().toISOString(), products };
  await saveCatalog(catalog);
  return catalog;
}

export function searchOfflineCatalog(
  catalog: OfflineCatalog | undefined,
  query: string,
  limit = 30,
): ProductListItemDto[] {
  if (!catalog) return [];
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return catalog.products.slice(0, limit);
  return catalog.products
    .filter((product) => {
      const haystack = [
        product.name,
        product.genericName,
        product.brand,
        product.sku,
        product.barcode,
        product.form,
        product.strength,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit);
}

export function findOfflineProductByCode(
  catalog: OfflineCatalog | undefined,
  code: string,
): ProductListItemDto | undefined {
  const normalized = code.trim().toLocaleUpperCase();
  return catalog?.products.find(
    (product) =>
      product.barcode?.trim().toLocaleUpperCase() === normalized ||
      product.sku?.trim().toLocaleUpperCase() === normalized,
  );
}