'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, InventoryValuationDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import {
  Button,
  Card,
  EmptyState,
  Panel,
  Skeleton,
  StatCard,
  TableCard,
  Td,
  Th,
} from '@/components/ui';
import { IconAlert, IconCash, IconCheck, IconInventory } from '@/components/icons';

const selectClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 outline-none focus:border-brand-500';

export function InventoryValuationReport({ branches }: { branches: BranchSummaryDto[] }) {
  const [branchId, setBranchId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'inventory-valuation', branchId],
    queryFn: async () => {
      const qs = branchId ? `?branchId=${branchId}` : '';
      const r = await fetch(`/api/admin/reports/inventory-valuation${qs}`);
      return r.ok ? ((await r.json()) as InventoryValuationDto) : null;
    },
  });

  function download(format: 'xlsx' | 'csv') {
    const params = new URLSearchParams({ format });
    if (branchId) params.set('branchId', branchId);
    window.open(`/api/admin/reports/inventory-valuation/export?${params.toString()}`, '_blank');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3">
        {branches.length > 1 ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500" htmlFor="valuation-branch">
              Branch
            </label>
            <select
              id="valuation-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={selectClass}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            disabled={!data?.rows.length}
            onClick={() => download('xlsx')}
          >
            Export Excel
          </Button>
          <Button variant="secondary" disabled={!data?.rows.length} onClick={() => download('csv')}>
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-28" />
            </Card>
          ))}
        </div>
      ) : !data ? (
        <Card>
          <EmptyState
            title="Valuation unavailable"
            description="We couldn't load inventory valuation for this scope."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Distinct drugs"
              value={data.totalDrugs}
              icon={IconInventory}
              tone="brand"
            />
            <StatCard label="Total units" value={data.totalQuantity} icon={IconCheck} tone="sky" />
            <StatCard
              label="Stock value (cost)"
              value={formatKobo(data.totalCostKobo)}
              icon={IconCash}
              tone="amber"
            />
            <StatCard
              label="Stock value (selling)"
              value={formatKobo(data.totalSellingKobo)}
              icon={IconCash}
              tone="brand"
            />
          </div>

          <Panel
            title="Stock valuation"
            subtitle="On-hand stock at cost and selling price"
            bodyClassName="p-0"
          >
            {data.rows.length === 0 ? (
              <EmptyState title="No stock to value" icon={IconInventory} />
            ) : (
              <TableCard className="border-0 shadow-none">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <Th>Product</Th>
                    <Th>SKU</Th>
                    <Th right>On hand</Th>
                    <Th right>Cost</Th>
                    <Th right>Selling</Th>
                    <Th right>Stock cost</Th>
                    <Th right>Stock selling</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => (
                    <tr key={`${r.productId}-${r.name}`} className="hover:bg-slate-50/60">
                      <Td>
                        <div className="font-medium text-slate-800">{r.name}</div>
                        <div className="text-xs text-slate-500">
                          {[r.genericName, r.brand, r.form].filter(Boolean).join(' · ')}
                        </div>
                      </Td>
                      <Td className="font-mono text-xs text-slate-500">{r.sku || '—'}</Td>
                      <Td right>{r.onHand}</Td>
                      <Td right>{r.costKobo != null ? formatKobo(r.costKobo) : '—'}</Td>
                      <Td right>{r.sellingKobo != null ? formatKobo(r.sellingKobo) : '—'}</Td>
                      <Td right>{formatKobo(r.stockCostKobo)}</Td>
                      <Td right className="font-semibold text-slate-900">
                        {formatKobo(r.stockSellingKobo)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
