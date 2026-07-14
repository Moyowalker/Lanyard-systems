'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, Paginated } from '@lanyard/contracts';

import { IconAlert, IconBranch, IconPricing } from '@/components/icons';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  TableCard,
  Td,
  Th,
  cn,
} from '@/components/ui';
import { formatKobo } from '@/lib/format';

// Read-only price list (client request): any staff with pricing:read can LOOK UP a
// selling price without being able to change anything. Cost prices are deliberately
// omitted — margins stay on the pricing editor behind pricing:write.

type ProductRow = {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
  packSize?: string;
};

type PriceRow = {
  productId: string;
  priceKobo: number;
  currency: string;
  isAvailable: boolean;
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export default function PricesPage() {
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'prices'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchSummaryDto>;
    },
  });
  const branches = branchesQ.data?.data ?? [];

  useEffect(() => {
    if (!branchId && branches[0]?.id) setBranchId(branches[0].id);
  }, [branchId, branches]);

  const productsQ = useQuery({
    queryKey: ['admin-products', 'prices'],
    queryFn: async () => {
      const res = await fetch('/api/admin/catalog/products?limit=100');
      if (!res.ok) throw new Error('Failed to load products');
      return (await res.json()) as Paginated<ProductRow>;
    },
  });
  const products = useMemo(() => productsQ.data?.data ?? [], [productsQ.data]);

  const pricesQ = useQuery({
    queryKey: ['admin-prices', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/branches/${branchId}/prices`);
      if (!res.ok) throw new Error('Failed to load prices');
      return (await res.json()) as { data: PriceRow[] };
    },
  });
  const priceByProduct = useMemo(
    () => new Map((pricesQ.data?.data ?? []).map((row) => [row.productId, row])),
    [pricesQ.data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products
      .map((product) => ({ product, price: priceByProduct.get(product.id) }))
      .filter(({ product }) => {
        if (!term) return true;
        return [product.name, product.genericName, product.brand, product.form, product.strength]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term));
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [priceByProduct, products, search]);

  const loading =
    branchesQ.isLoading || productsQ.isLoading || (Boolean(branchId) && pricesQ.isLoading);

  return (
    <div>
      <PageHeader
        title="Price list"
        subtitle="Look up selling prices at a branch — view only, no actions"
        actions={
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        }
      />

      {loading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : branchesQ.isError || branches.length === 0 ? (
        <Card>
          <EmptyState
            title="No branches available"
            description="The price list needs at least one branch you can view."
            icon={IconBranch}
          />
        </Card>
      ) : productsQ.isError || pricesQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load prices"
            description="The catalog or pricing endpoint did not respond — check your permissions."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-md">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, generic, brand, form, or strength"
                aria-label="Search prices"
                className={cn(inputClass, 'pl-9')}
              />
            </div>
            <span className="text-xs text-slate-500">
              {rows.length} of {products.length} products
            </span>
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                title="No products match your search"
                description="Try a different name, generic name, brand, form, or strength."
                icon={IconPricing}
              />
            </Card>
          ) : (
            <TableCard>
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>Product</Th>
                  <Th>Form / strength</Th>
                  <Th>Pack</Th>
                  <Th right>Selling price</Th>
                  <Th>Storefront</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ product, price }) => (
                  <tr key={product.id} className="hover:bg-slate-50/60">
                    <Td>
                      <div className="font-semibold text-slate-900">{product.name}</div>
                      <div className="text-xs text-slate-500">
                        {[product.genericName, product.brand].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </Td>
                    <Td className="text-slate-500">
                      {[product.form, product.strength].filter(Boolean).join(' · ') || '—'}
                    </Td>
                    <Td className="text-slate-500">{product.packSize || '—'}</Td>
                    <Td right className="font-semibold text-slate-900">
                      {price ? formatKobo(price.priceKobo, price.currency) : '—'}
                    </Td>
                    <Td>
                      {price ? (
                        <Badge tone={price.isAvailable ? 'success' : 'neutral'}>
                          {price.isAvailable ? 'Visible' : 'Hidden'}
                        </Badge>
                      ) : (
                        <Badge tone="warn">No price</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </>
      )}
    </div>
  );
}
