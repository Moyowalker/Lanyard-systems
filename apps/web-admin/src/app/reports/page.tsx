'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SalesSummaryDto } from '@lanyard/contracts';
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

const RANGES = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
];

export default function ReportsPage() {
  const [rangeKey, setRangeKey] = useState('30');
  const days = RANGES.find((r) => r.key === rangeKey)?.days ?? 30;

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'sales', rangeKey],
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const qs = `from=${from.toISOString()}&to=${to.toISOString()}`;
      const r = await fetch(`/api/admin/reports/sales-summary?${qs}`);
      return r.ok ? ((await r.json()) as SalesSummaryDto) : null;
    },
  });

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Sales performance across your branch scope"
        actions={
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRangeKey(r.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150',
                  rangeKey === r.key
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/15'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

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

          <Panel title="Top products" subtitle="By revenue in the selected range" bodyClassName="p-0">
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
    </div>
  );
}
