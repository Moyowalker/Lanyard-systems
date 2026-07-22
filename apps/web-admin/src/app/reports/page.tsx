'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, Paginated, SalesSummaryDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import {
  Card,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  StatCard,
  TableCard,
  Td,
  Th,
  cn,
} from '@/components/ui';
import { Bars, Donut } from '@/components/charts';
import { IconCash, IconOrders, IconCheck, IconReports } from '@/components/icons';
import { Button } from '@/components/ui';
import { useFileDownload } from '@/lib/use-download';
import { InventoryValuationReport } from '@/components/reports/InventoryValuationReport';
import { ConsumptionReport } from '@/components/reports/ConsumptionReport';
import { LowStockReport } from '@/components/reports/LowStockReport';
import { ExpiringDrugsReport } from '@/components/reports/ExpiringDrugsReport';

type ReportTab = 'sales' | 'inventory' | 'consumption' | 'low-stock' | 'expiring';

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'consumption', label: 'Consumption' },
  { key: 'low-stock', label: 'Low stock' },
  { key: 'expiring', label: 'Expiring drugs' },
];

const RANGES = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
];

const selectClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 outline-none focus:border-brand-500';

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('sales');
  const [rangeKey, setRangeKey] = useState('30');
  // Custom range overrides the preset when both ends are set.
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('');
  const { download: runDownload, error: exportError } = useFileDownload();

  function downloadSales(format: 'xlsx' | 'csv') {
    const to = customFrom && customTo ? new Date(`${customTo}T23:59:59`) : new Date();
    const from =
      customFrom && customTo
        ? new Date(`${customFrom}T00:00:00`)
        : new Date(to.getTime() - (RANGES.find((r) => r.key === rangeKey)?.days ?? 30) * 86400000);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), format });
    if (branchFilter) params.set('branchId', branchFilter);
    if (fulfillmentFilter) params.set('fulfillmentType', fulfillmentFilter);
    void runDownload(
      `/api/admin/reports/sales-summary/export?${params.toString()}`,
      `sales-summary.${format}`,
    );
  }

  const branchesQ = useQuery({
    queryKey: ['admin-branches', 'reports'],
    queryFn: async () => {
      const res = await fetch('/api/admin/branches?limit=100');
      if (!res.ok) return null;
      return (await res.json()) as Paginated<BranchSummaryDto>;
    },
  });
  const branches = branchesQ.data?.data ?? [];

  const usingCustom = Boolean(customFrom && customTo);
  const days = RANGES.find((r) => r.key === rangeKey)?.days ?? 30;

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'sales', rangeKey, customFrom, customTo, branchFilter, fulfillmentFilter],
    queryFn: async () => {
      const to = usingCustom ? new Date(`${customTo}T23:59:59`) : new Date();
      const from = usingCustom
        ? new Date(`${customFrom}T00:00:00`)
        : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      if (branchFilter) params.set('branchId', branchFilter);
      if (fulfillmentFilter) params.set('fulfillmentType', fulfillmentFilter);
      const r = await fetch(`/api/admin/reports/sales-summary?${params.toString()}`);
      return r.ok ? ((await r.json()) as SalesSummaryDto) : null;
    },
  });

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Sales, inventory valuation, and consumption across your branch scope"
        actions={
          tab === 'sales' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setRangeKey(r.key);
                    setCustomFrom('');
                    setCustomTo('');
                  }}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150',
                    !usingCustom && rangeKey === r.key
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/15'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          ) : null
        }
      />

      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm'
                : 'rounded-md px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'inventory' ? (
        <InventoryValuationReport branches={branches} />
      ) : tab === 'consumption' ? (
        <ConsumptionReport branches={branches} />
      ) : tab === 'low-stock' ? (
        <LowStockReport branches={branches} />
      ) : tab === 'expiring' ? (
        <ExpiringDrugsReport branches={branches} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500" htmlFor="report-from">
                From
              </label>
              <input
                id="report-from"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className={selectClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500" htmlFor="report-to">
                To
              </label>
              <input
                id="report-to"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className={selectClass}
              />
            </div>
            {branches.length > 1 ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500" htmlFor="report-branch">
                  Branch
                </label>
                <select
                  id="report-branch"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500" htmlFor="report-fulfillment">
                Fulfilment
              </label>
              <select
                id="report-fulfillment"
                value={fulfillmentFilter}
                onChange={(e) => setFulfillmentFilter(e.target.value)}
                className={selectClass}
              >
                <option value="">All types</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
                <option value="counter">Counter (POS)</option>
              </select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {(usingCustom || branchFilter || fulfillmentFilter) && (
                <button
                  onClick={() => {
                    setCustomFrom('');
                    setCustomTo('');
                    setBranchFilter('');
                    setFulfillmentFilter('');
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
                >
                  Reset filters
                </button>
              )}
              <Button variant="secondary" disabled={!data} onClick={() => downloadSales('xlsx')}>
                Export Excel
              </Button>
              <Button variant="secondary" disabled={!data} onClick={() => downloadSales('csv')}>
                Export CSV
              </Button>
              {exportError ? (
                <p className="w-full text-xs font-medium text-rose-600">{exportError}</p>
              ) : null}
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
                title="Reports unavailable"
                description="We couldn't load sales data for this range. Try again shortly."
                icon={IconReports}
              />
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Revenue (paid)"
                  value={formatKobo(data.revenueKobo)}
                  icon={IconCash}
                  tone="brand"
                  hint={`${data.paidOrders} paid orders`}
                />
                <StatCard
                  label="Avg. order value"
                  value={formatKobo(data.aovKobo)}
                  icon={IconCheck}
                  tone="sky"
                />
                <StatCard
                  label="Prescription orders"
                  value={data.rxOrders}
                  icon={IconOrders}
                  tone="amber"
                  hint={`${data.otcOrders} OTC`}
                />
                <StatCard
                  label="Refunds"
                  value={data.refunds}
                  icon={IconCash}
                  tone="rose"
                  hint={formatKobo(data.refundedKobo)}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <Panel
                  title="Revenue by day"
                  subtitle={`${new Date(data.from).toLocaleDateString()} – ${new Date(
                    data.to,
                  ).toLocaleDateString()}`}
                  className="lg:col-span-2"
                >
                  {data.byDay.every((d) => d.revenueKobo === 0) ? (
                    <p className="py-10 text-center text-sm text-slate-400">
                      No paid orders in this range yet.
                    </p>
                  ) : (
                    <Bars
                      items={data.byDay
                        .filter((d) => d.revenueKobo > 0)
                        .map((d) => ({
                          label: new Date(d.date).toLocaleDateString('en-NG', {
                            day: 'numeric',
                            month: 'short',
                          }),
                          value: Math.round(d.revenueKobo / 100),
                        }))}
                      unit="₦"
                    />
                  )}
                </Panel>

                <Panel title="Order mix" subtitle="Prescription vs OTC">
                  <Donut
                    centerLabel={`${data.paidOrders}`}
                    centerSub="paid orders"
                    segments={[
                      { label: 'Prescription (℞)', value: data.rxOrders, color: '#0d9488' },
                      { label: 'Over-the-counter', value: data.otcOrders, color: '#5eead4' },
                    ]}
                  />
                </Panel>
              </div>

              <Panel
                title="Top products"
                subtitle="By revenue in the selected range"
                bodyClassName="p-0"
              >
                {data.topProducts.length === 0 ? (
                  <EmptyState title="No product sales yet" icon={IconReports} />
                ) : (
                  <TableCard className="border-0 shadow-none">
                    <thead className="border-b border-slate-100 bg-slate-50/60">
                      <tr>
                        <Th>Product</Th>
                        <Th right>Units sold</Th>
                        <Th right>Revenue</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.topProducts.map((p) => (
                        <tr key={p.productId} className="transition-colors hover:bg-slate-50/60">
                          <Td className="font-medium text-slate-800">{p.name}</Td>
                          <Td right>{p.quantity}</Td>
                          <Td right className="font-semibold text-slate-900">
                            {formatKobo(p.revenueKobo)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableCard>
                )}
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  );
}
