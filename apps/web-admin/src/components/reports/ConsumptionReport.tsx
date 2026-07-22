'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, ConsumptionReportDto } from '@lanyard/contracts';
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
import { IconAlert, IconCash, IconOrders, IconReports } from '@/components/icons';
import { useFileDownload } from '@/lib/use-download';

const selectClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 outline-none focus:border-brand-500';

const CHANNEL_LABEL: Record<string, string> = {
  cash: 'Cash',
  pos_terminal: 'Card (terminal)',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  ussd: 'USSD',
  hmo: 'HMO',
  online: 'Online',
};

function defaultFrom(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function ConsumptionReport({ branches }: { branches: BranchSummaryDto[] }) {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState('');
  const { download: runDownload, error: exportError } = useFileDownload();

  function buildParams(extra?: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams({
      from: new Date(`${from}T00:00:00`).toISOString(),
      to: new Date(`${to}T23:59:59`).toISOString(),
      ...extra,
    });
    if (branchId) params.set('branchId', branchId);
    return params;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'consumption', from, to, branchId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/reports/consumption?${buildParams().toString()}`);
      return r.ok ? ((await r.json()) as ConsumptionReportDto) : null;
    },
  });

  function download(format: 'xlsx' | 'csv') {
    void runDownload(
      `/api/admin/reports/consumption/export?${buildParams({ format }).toString()}`,
      `consumption-report.${format}`,
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500" htmlFor="consumption-from">
            From
          </label>
          <input
            id="consumption-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className={selectClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500" htmlFor="consumption-to">
            To
          </label>
          <input
            id="consumption-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className={selectClass}
          />
        </div>
        {branches.length > 1 ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500" htmlFor="consumption-branch">
              Branch
            </label>
            <select
              id="consumption-branch"
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
        {exportError ? (
          <p className="w-full text-xs font-medium text-rose-600">{exportError}</p>
        ) : null}
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
            title="Consumption unavailable"
            description="We couldn't load consumption for this range."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Units dispensed"
              value={data.totalUnits}
              icon={IconOrders}
              tone="brand"
            />
            <StatCard
              label="Consumption value"
              value={formatKobo(data.totalValueKobo)}
              icon={IconCash}
              tone="amber"
            />
            <StatCard
              label="Value at cost"
              value={data.totalValueAtCostKobo > 0 ? formatKobo(data.totalValueAtCostKobo) : '—'}
              hint={data.totalValueAtCostKobo > 0 ? undefined : 'Set cost prices to see this'}
              icon={IconCash}
              tone="slate"
            />
            <StatCard
              label="Margin"
              value={data.totalMarginKobo > 0 ? formatKobo(data.totalMarginKobo) : '—'}
              icon={IconCash}
              tone="sky"
            />
          </div>

          <Panel
            title="Sales by payment method"
            subtitle="How customers paid in this range — cash, card, transfers, HMO, and online"
          >
            {data.paymentBreakdown.length === 0 ? (
              <p className="text-sm text-slate-500">No settled sales in this range.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {data.paymentBreakdown.map((row) => (
                  <div
                    key={row.channel}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {CHANNEL_LABEL[row.channel] ?? row.channel}
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {formatKobo(row.totalKobo)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.orders} sale{row.orders === 1 ? '' : 's'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Consumption by drug"
            subtitle="Units dispensed in the selected range, with cost and margin where cost prices exist"
            bodyClassName="p-0"
          >
            {data.rows.length === 0 ? (
              <EmptyState title="Nothing dispensed in this range" icon={IconReports} />
            ) : (
              <TableCard className="border-0 shadow-none">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <Th>Product</Th>
                    <Th>SKU</Th>
                    <Th right>Units dispensed</Th>
                    <Th right>Cost price</Th>
                    <Th right>Selling price</Th>
                    <Th right>Value</Th>
                    <Th right>Margin</Th>
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
                      <Td right className="font-semibold text-slate-900">
                        {r.unitsDispensed}
                      </Td>
                      <Td right className="text-slate-500">
                        {r.costKobo != null ? formatKobo(r.costKobo) : '—'}
                      </Td>
                      <Td right className="text-slate-500">
                        {r.sellingKobo != null ? formatKobo(r.sellingKobo) : '—'}
                      </Td>
                      <Td right>{formatKobo(r.valueKobo)}</Td>
                      <Td right className={r.marginKobo != null ? 'text-emerald-700' : ''}>
                        {r.marginKobo != null ? formatKobo(r.marginKobo) : '—'}
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
