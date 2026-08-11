'use client';

import { useState } from 'react';
import type { Paginated, ProductListItemDto } from '@lanyard/contracts';
import { ProductCard } from './ProductCard';

export function PaginatedProductGrid({
  initialPage,
  branchId,
  endpoint,
  params,
}: {
  initialPage: Paginated<ProductListItemDto>;
  branchId?: string;
  endpoint: '/api/catalog/products' | '/api/catalog/search';
  params: Record<string, string>;
}) {
  const [products, setProducts] = useState(initialPage.data);
  const [nextCursor, setNextCursor] = useState(initialPage.meta.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const requestParams = new URLSearchParams({ ...params, cursor: nextCursor });
      const res = await fetch(`${endpoint}?${requestParams.toString()}`);
      if (!res.ok) throw new Error('Unable to load more medicines');
      const page = (await res.json()) as Paginated<ProductListItemDto>;
      setProducts((current) => [...current, ...page.data.filter((item) => !current.some((p) => p.id === item.id))]);
      setNextCursor(page.meta.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load more medicines');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} branchId={branchId} />
        ))}
      </div>

      {nextCursor ? (
        <div className="flex flex-col items-center gap-2">
          <button type="button" className="secondary-button" disabled={loading} onClick={loadMore}>
            {loading ? 'Loading medicines...' : 'Load more medicines'}
          </button>
          {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}