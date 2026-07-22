'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchSummaryDto, ExpiringReportDto, ExpiryBand } from '@lanyard/contracts';
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
  cn,
} from '@/components/ui';
import { IconAlert, IconCheck, IconClock } from '@/components/icons';
import { useFileDownload } from '@/lib/use-download';

const selectClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 outline-none focus:border-brand-500';

// Client-confirmed banding: 6–9 months out = yellow warning; ≤6 months = red;
// already expired = dark red. The band itself comes from the server.
const BAND_META: Record<ExpiryBand, { label: string; badge: 'warn' | 'danger'; text: string }> = {
  yellow: { label: 'Expiring (6–9 months)', badge: 'warn', text: 'text-amber-700' },
  red: { label: 'Expiring (≤6 months)', badge: 'danger', text: 'text-rose-600' },
  expired: { label: 'EXPIRED', badge: 'danger', text: 'text-rose-800 font-bold' },
};

const HORIZONS = [
  { key: '270', label: 'Next 9 months' },
  { key: '180', label: 'Next 6 months' },
  { key: '90', label: 'Next 3 months' },
];

/** Drugs whose soonest batch expires within the horizon, soonest first. */
export function ExpiringDrugsReport({ branches }: { branches: BranchSummaryDto[] }) {
  const [branchId, setBranchId] = useState('');
  const [days, setDays] = useState('270');
  const { download: runDownload, error: exportError } = useFileDownload();

  function buildParams(extra?: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams({ days, ...extra });
    if (branchId) params.set('branchId', branchId);
    return params;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'expiring', branchId, days],
    queryFn: async () => {
      const r = await fetch(`/api/admin/reports/expiring?${buildParams().toString()}`);
      return r.ok ? ((await r.json()) as ExpiringReportDto) : null;
    },
  });

  function download(format: 'xlsx' | 'csv') {
    void runDownload(
      `/api/admin/reports/expiring/export?${buildParams({ format }).toString()}`,
      `expiring-report.${format}`,
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500" htmlFor="expiring-horizon">
            Horizon
          </label>
          <select
            id="expiring-horizon"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={selectClass}
          >
            {HORIZONS.map((h) => (
              <option key={h.key} value={h.key}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
        {branches.length > 1 ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500" htmlFor="expiring-branch">
              Branch
            </label>
            <select
              id="expiring-branch"
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
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-28" />
            </Card>
          ))}
        </div>
      ) : !data ? (
        <Card>
          <EmptyState
            title="Expiring-drugs report unavailable"
            description="We couldn't load the expiring stock report."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Expired" value={data.expired} icon={IconAlert} tone="rose" />
            <StatCard label="Expiring ≤6 months" value={data.red} icon={IconClock} tone="rose" />
            <StatCard
              label="Expiring 6–9 months"
              value={data.yellow}
              icon={IconClock}
              tone="amber"
            />
          </div>

          <Panel
            title="Expiring drugs"
            subtitle={`Soonest batch expiry within the next ${Math.round(data.horizonDays / 30)} months — soonest first`}
            bodyClassName="p-0"
          >
            {data.rows.length === 0 ? (
              <EmptyState
                title="Nothing expiring in this window"
                description="No tracked batches expire within the selected horizon."
                icon={IconCheck}
              />
            ) : (
              <TableCard className="border-0 shadow-none">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <Th>Product</Th>
                    <Th>Branch</Th>
                    <Th>Status</Th>
                    <Th>Next expiry</Th>
                    <Th right>Days left</Th>
                    <Th right>On hand</Th>
                    <Th right>Batches</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r) => {
                    const meta = BAND_META[r.band];
                    return (
                      <tr
                        key={`${r.branchId}-${r.productId}`}
                        className={cn(
                          'hover:bg-slate-50/60',
                          r.band === 'expired' && 'bg-rose-50/60',
                          r.band === 'red' && 'bg-rose-50/30',
                          r.band === 'yellow' && 'bg-amber-50/40',
                        )}
                      >
                        <Td>
                          <div className="font-medium text-slate-800">{r.productName}</div>
                          <div className="text-xs text-slate-500">
                            {[r.genericName, r.brand, r.form].filter(Boolean).join(' · ')}
                          </div>
                        </Td>
                        <Td className="text-slate-500">{r.branchName}</Td>
                        <Td>
                          <Badge tone={meta.badge}>{meta.label}</Badge>
                        </Td>
                        <Td className={meta.text}>{r.nextExpiry.slice(0, 10)}</Td>
                        <Td right className={meta.text}>
                          {r.daysLeft <= 0 ? `${-r.daysLeft}d ago` : `${r.daysLeft}d`}
                        </Td>
                        <Td right>{r.onHand}</Td>
                        <Td right>{r.batchCount}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableCard>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
