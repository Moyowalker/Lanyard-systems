'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, LowStockReportDto } from '@lanyard/contracts';
import {
  Badge,
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
import { IconAlert, IconCheck } from '@/components/icons';

const selectClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 outline-none focus:border-brand-500';

/** Items that are out of stock (red) or at/below their reorder threshold (amber). */
export function LowStockReport({ branches }: { branches: BranchSummaryDto[] }) {
  const [branchId, setBranchId] = useState('');

  function buildParams(extra?: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams(extra);
    if (branchId) params.set('branchId', branchId);
    return params;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'low-stock', branchId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/reports/low-stock?${buildParams().toString()}`);
      return r.ok ? ((await r.json()) as LowStockReportDto) : null;
    },
  });

  function download(format: 'xlsx' | 'csv') {
    window.open(
      `/api/admin/reports/low-stock/export?${buildParams({ format }).toString()}`,
      '_blank',
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3">
        {branches.length > 1 ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500" htmlFor="low-stock-branch">
              Branch
            </label>
            <select
              id="low-stock-branch"
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
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-28" />
            </Card>
          ))}
        </div>
      ) : !data ? (
        <Card>
          <EmptyState
            title="Low-stock report unavailable"
            description="We couldn't load the low-stock report."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Low stock items"
              value={data.totalItems}
              icon={IconAlert}
              tone="amber"
            />
            <StatCard label="Out of stock" value={data.outOfStock} icon={IconAlert} tone="rose" />
          </div>

          <Panel
            title="Low stock items"
            subtitle="Products at or below their reorder threshold — restock these first"
            bodyClassName="p-0"
          >
            {data.rows.length === 0 ? (
              <EmptyState
                title="Nothing is low on stock"
                description="Every tracked product is above its reorder threshold."
                icon={IconCheck}
              />
            ) : (
              <TableCard className="border-0 shadow-none">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <Th>Product</Th>
                    <Th>Branch</Th>
                    <Th>Status</Th>
                    <Th right>Available</Th>
                    <Th right>On hand</Th>
                    <Th right>Reserved</Th>
                    <Th right>Reorder level</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => (
                    <tr key={`${r.branchId}-${r.productId}`} className="hover:bg-slate-50/60">
                      <Td>
                        <div className="font-medium text-slate-800">{r.productName}</div>
                        <div className="text-xs text-slate-500">
                          {[r.genericName, r.brand, r.form].filter(Boolean).join(' · ')}
                        </div>
                      </Td>
                      <Td className="text-slate-500">{r.branchName}</Td>
                      <Td>
                        <Badge tone={r.status === 'out' ? 'danger' : 'warn'}>
                          {r.status === 'out' ? 'Out of stock' : 'Low stock'}
                        </Badge>
                      </Td>
                      <Td
                        right
                        className={
                          r.status === 'out'
                            ? 'font-semibold text-rose-600'
                            : 'font-semibold text-amber-700'
                        }
                      >
                        {r.available}
                      </Td>
                      <Td right>{r.onHand}</Td>
                      <Td right>{r.reserved}</Td>
                      <Td right>{r.reorderLevel}</Td>
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
