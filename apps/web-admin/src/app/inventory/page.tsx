'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, Paginated } from '@lanyard/contracts';

import { IconAlert, IconBranch, IconCheck, IconClock, IconInventory } from '@/components/icons';
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
import { formatDateTime } from '@/lib/format';

type InventoryRow = {
  productId: string;
  productName: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  batchCount: number;
  nextExpiry?: string;
};

function stockTone(row: InventoryRow): 'success' | 'warn' | 'danger' {
  if (row.available <= 0) return 'danger';
  if (row.available <= Math.max(1, row.reorderLevel)) return 'warn';
  return 'success';
}

export default function InventoryPage() {
  const [branchId, setBranchId] = useState('');

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'inventory'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) throw new Error('Failed to load branches');
      return (await res.json()) as Paginated<BranchSummaryDto>;
    },
  });

  const branches = branchesQ.data?.data ?? [];

  useEffect(() => {
    if (!branchId && branches[0]?.id) {
      setBranchId(branches[0].id);
    }
  }, [branchId, branches]);

  const inventoryQ = useQuery({
    queryKey: ['admin-inventory', branchId],
    enabled: Boolean(branchId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/branches/${branchId}/inventory`);
      if (!res.ok) throw new Error('Failed to load inventory');
      return (await res.json()) as { data: InventoryRow[] };
    },
  });

  const rows = inventoryQ.data?.data ?? [];
  const totalAvailable = rows.reduce((sum, row) => sum + row.available, 0);
  const totalReserved = rows.reduce((sum, row) => sum + row.reserved, 0);
  const lowStockCount = rows.filter((row) => row.available <= Math.max(1, row.reorderLevel)).length;
  const initialLoading =
    branchesQ.isLoading || (Boolean(branchId) && inventoryQ.isLoading && !inventoryQ.data);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Branch stock levels, reservations, and expiry pressure"
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
      ) : branchesQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load branches"
            description="Inventory depends on branch scope. Check the admin branch API or your staff permissions."
            icon={IconAlert}
          />
        </Card>
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState
            title="No branches found"
            description="Create or seed a branch before inventory can be managed in the admin console."
            icon={IconBranch}
          />
        </Card>
      ) : inventoryQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load inventory"
            description="The inventory admin endpoint did not return data for the selected branch."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Tracked SKUs" value={rows.length} icon={IconInventory} tone="brand" />
            <StatCard label="Available units" value={totalAvailable} icon={IconCheck} tone="sky" />
            <StatCard label="Reserved units" value={totalReserved} icon={IconClock} tone="amber" />
            <StatCard label="Low stock items" value={lowStockCount} icon={IconAlert} tone="rose" />
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                title="No inventory rows yet"
                description="This branch has no stock entries yet, so the page would otherwise look blank."
                icon={IconInventory}
              />
            </Card>
          ) : (
            <TableCard>
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>Product</Th>
                  <Th>Status</Th>
                  <Th right>Available</Th>
                  <Th right>On hand</Th>
                  <Th right>Reserved</Th>
                  <Th right>Reorder</Th>
                  <Th right>Batches</Th>
                  <Th>Next expiry</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.productId} className="transition-colors hover:bg-slate-50/60">
                    <Td>
                      <div className="font-semibold text-slate-900">{row.productName}</div>
                      <div className="text-xs text-slate-500">
                        {[row.genericName, row.brand, row.form, row.strength].filter(Boolean).join(' · ') ||
                          'Catalog details unavailable'}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={stockTone(row)}>
                        {row.available <= 0
                          ? 'Out of stock'
                          : row.available <= Math.max(1, row.reorderLevel)
                            ? 'Low stock'
                            : 'Healthy'}
                      </Badge>
                    </Td>
                    <Td right className="font-semibold text-slate-900">
                      {row.available}
                    </Td>
                    <Td right>{row.onHand}</Td>
                    <Td right>{row.reserved}</Td>
                    <Td right>{row.reorderLevel}</Td>
                    <Td right>{row.batchCount}</Td>
                    <Td className="text-slate-500">{formatDateTime(row.nextExpiry)}</Td>
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