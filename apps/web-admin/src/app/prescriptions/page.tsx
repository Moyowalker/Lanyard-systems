'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Paginated,
  PrescriptionAdminListItemDto,
  PrescriptionDto,
  RxStatus,
} from '@lanyard/contracts';
import { rxTone, timeAgo } from '@/lib/format';
import { BranchFilter, useOperationalBranchFilter } from '@/components/branch-filter';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { IconCheck, IconChevronRight, IconRx, IconShield } from '@/components/icons';

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500';

export default function PrescriptionQueue() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const branchFilter = useOperationalBranchFilter();
  const searching = search.trim().length > 0 || status.length > 0;

  const queueQ = useQuery({
    queryKey: ['rx-queue', branchFilter.branchId],
    enabled: !searching && (branchFilter.canViewAllBranches || Boolean(branchFilter.branchId)),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (branchFilter.branchId) params.set('branchId', branchFilter.branchId);
      const r = await fetch(`/api/admin/prescriptions?${params.toString()}`);
      if (!r.ok) throw new Error('Could not load the prescription queue');
      return (await r.json()) as Paginated<PrescriptionDto>;
    },
    refetchInterval: 10000,
  });

  const searchQ = useQuery({
    queryKey: ['rx-search', search.trim(), status, branchFilter.branchId],
    enabled: searching && (branchFilter.canViewAllBranches || Boolean(branchFilter.branchId)),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (status) params.set('status', status);
      if (branchFilter.branchId) params.set('branchId', branchFilter.branchId);
      const r = await fetch(`/api/admin/prescriptions/search?${params.toString()}`);
      if (!r.ok) throw new Error('Search failed');
      return (await r.json()) as Paginated<PrescriptionAdminListItemDto>;
    },
  });

  const rows = queueQ.data?.data ?? [];
  const results = searchQ.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Prescriptions"
        subtitle="Verify prescriptions before dispensing, or search past prescriptions to recall an order — every access is audited (PCN / NDPA)"
        actions={
          <>
            <BranchFilter {...branchFilter} onChange={branchFilter.setBranchId} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700">
              <IconShield width={14} height={14} /> Compliance-controlled
            </span>
          </>
        }
      />

      {/* Recall search — find a prescription by customer phone or order number, any status. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Recall by customer phone or order number…"
          aria-label="Search prescriptions"
          className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {Object.values(RxStatus).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {searching ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatus('');
            }}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Back to queue
          </button>
        ) : null}
      </div>

      {searching ? (
        searchQ.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : searchQ.isError ? (
          <Card>
            <EmptyState
              title="Search failed"
              description="There was a problem searching prescriptions. Try again shortly."
              icon={IconShield}
            />
          </Card>
        ) : results.length === 0 ? (
          <Card>
            <EmptyState
              title="No prescriptions found"
              description="No prescriptions match that phone number, order number, or status."
              icon={IconRx}
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {results.map((rx) => (
              <li key={rx.id}>
                <Link
                  href={`/prescriptions/${rx.id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card-raised transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-card-hover"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 ring-1 ring-inset ring-brand-600/10">
                    <IconRx width={22} height={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">
                      {rx.customerName || 'Customer'}
                      {rx.customerPhone ? (
                        <span className="ml-2 text-sm font-normal text-slate-500">
                          {rx.customerPhone}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {rx.orderNos.length ? `Orders ${rx.orderNos.join(', ')} · ` : ''}
                      {rx.fileCount} file{rx.fileCount === 1 ? '' : 's'} · {timeAgo(rx.createdAt)}
                    </div>
                  </div>
                  <Badge tone={rxTone(rx.status)}>{rx.status}</Badge>
                  <IconChevronRight
                    width={18}
                    height={18}
                    className="text-slate-300 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : queueQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : queueQ.isError ? (
        <Card>
          <EmptyState
            title="Couldn’t load the queue"
            description="There was a problem reaching the prescription service. Retrying automatically — if this persists, check the API and storage configuration."
            icon={IconShield}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Queue is clear"
            description="No prescriptions are awaiting verification right now. Use the search above to recall a past prescription."
            icon={IconCheck}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((rx) => {
            const clean = rx.files.every((f) => f.avScan === 'clean');
            return (
              <li key={rx.id}>
                <Link
                  href={`/prescriptions/${rx.id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card-raised transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200/70 hover:shadow-card-hover"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 ring-1 ring-inset ring-brand-600/10">
                    <IconRx width={22} height={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">Rx {rx.id.slice(-6)}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {rx.files.length} file{rx.files.length === 1 ? '' : 's'} ·{' '}
                      {timeAgo(rx.createdAt)}
                    </div>
                  </div>
                  <Badge tone={clean ? 'success' : 'warn'}>
                    {clean ? 'Scan clean' : 'Scan pending'}
                  </Badge>
                  <Badge tone={rxTone(rx.status)}>{rx.status}</Badge>
                  <IconChevronRight
                    width={18}
                    height={18}
                    className="text-slate-300 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
