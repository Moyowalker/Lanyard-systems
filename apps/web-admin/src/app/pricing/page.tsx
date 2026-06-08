'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, Paginated } from '@lanyard/contracts';

import { IconAlert, IconBranch, IconCatalog, IconCheck, IconPricing } from '@/components/icons';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  TableCard,
  Td,
  Th,
} from '@/components/ui';
import { formatKobo } from '@/lib/format';

type AdminProductLookup = {
  id: string;
  name: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
};

type PriceRow = {
  productId: string;
  priceKobo: number;
  compareAtKobo?: number;
  currency: string;
  isAvailable: boolean;
};

export default function PricingPage() {
  const [branchId, setBranchId] = useState('');

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'pricing'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchSummaryDto>;
    },
  });

  const productsQ = useQuery({
    queryKey: ['admin-products', 'pricing'],
    queryFn: async () => {
      const res = await fetch('/api/admin/catalog/products?limit=100');
      if (!res.ok) throw new Error('Failed to load products');
      return (await res.json()) as Paginated<AdminProductLookup>;
    },
  });

  const branches = branchesQ.data?.data ?? [];
  const products = productsQ.data?.data ?? [];

  useEffect(() => {
    if (!branchId && branches[0]?.id) {
      setBranchId(branches[0].id);
    }
  }, [branchId, branches]);

  const pricesQ = useQuery({
    queryKey: ['admin-prices', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/branches/${branchId}/prices`);
      if (!res.ok) throw new Error('Failed to load prices');
      return (await res.json()) as { data: PriceRow[] };
    },
  });

  const productById = new Map(products.map((product) => [product.id, product]));
  const rows = (pricesQ.data?.data ?? [])
    .map((row) => ({ row, product: productById.get(row.productId) }))
    .sort((left, right) =>
      (left.product?.name ?? left.row.productId).localeCompare(right.product?.name ?? right.row.productId),
    );

  const configuredCount = rows.length;
  const availableCount = rows.filter(({ row }) => row.isAvailable).length;
  const missingCount = Math.max(0, products.length - configuredCount);
  const initialLoading =
    branchesQ.isLoading || productsQ.isLoading || (Boolean(branchId) && pricesQ.isLoading && !pricesQ.data);

  return (
    <div>
      <PageHeader
        title="Pricing"
        subtitle="Per-branch prices and sellable availability"
        actions={
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
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

      {initialLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : branchesQ.isError || productsQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load pricing context"
            description="Pricing depends on both branches and products being available to the admin app."
            icon={IconAlert}
          />
        </Card>
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState
            title="No branches found"
            description="Create a branch before configuring branch-level pricing."
            icon={IconBranch}
          />
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            title="No products found"
            description="Pricing is configured against catalog products, so the catalog must exist first."
            icon={IconCatalog}
          />
        </Card>
      ) : pricesQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load pricing"
            description="The pricing admin endpoint did not return data for the selected branch."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Configured prices" value={configuredCount} icon={IconPricing} tone="brand" />
            <StatCard label="Available to sell" value={availableCount} icon={IconCheck} tone="sky" />
            <StatCard label="Missing price rows" value={missingCount} icon={IconAlert} tone="rose" />
            <StatCard label="Catalog products" value={products.length} icon={IconCatalog} tone="amber" />
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                title="No price rows for this branch"
                description="The branch exists, but no per-product prices have been configured yet."
                icon={IconPricing}
              />
            </Card>
          ) : (
            <TableCard>
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>Product</Th>
                  <Th>Availability</Th>
                  <Th right>Price</Th>
                  <Th right>Compare at</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ row, product }) => (
                  <tr key={row.productId} className="transition-colors hover:bg-slate-50/60">
                    <Td>
                      <div className="font-semibold text-slate-900">{product?.name ?? row.productId}</div>
                      <div className="text-xs text-slate-500">
                        {[product?.genericName, product?.brand, product?.form, product?.strength]
                          .filter(Boolean)
                          .join(' · ') || 'Catalog details unavailable'}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={row.isAvailable ? 'success' : 'neutral'}>
                        {row.isAvailable ? 'Sellable' : 'Hidden'}
                      </Badge>
                    </Td>
                    <Td right className="font-semibold text-slate-900">
                      {formatKobo(row.priceKobo, row.currency)}
                    </Td>
                    <Td right className="text-slate-500">
                      {formatKobo(row.compareAtKobo, row.currency)}
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