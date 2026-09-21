'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { OrderStatus, type OrderDto, type Paginated } from '@lanyard/contracts';
import { formatKobo, label, statusTone, timeAgo } from '@/lib/format';
import { BranchFilter, useOperationalBranchFilter } from '@/components/branch-filter';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  TableCard,
  Td,
  Th,
  cn,
} from '@/components/ui';
import { IconChevronRight, IconOrders } from '@/components/icons';

const inputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

const FILTERS: { key: string; label: string; statuses?: OrderStatus[] }[] = [
  { key: 'all', label: 'All' },
  { key: 'rx', label: 'Awaiting ℞', statuses: [OrderStatus.AWAITING_RX_VERIFICATION] },
  { key: 'pay', label: 'Awaiting payment', statuses: [OrderStatus.AWAITING_PAYMENT] },
  {
    key: 'fulfil',
    label: 'To fulfil',
    statuses: [
      OrderStatus.PAID,
      OrderStatus.FULFILLING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.OUT_FOR_DELIVERY,
    ],
  },
  { key: 'hold', label: 'Stock holds', statuses: [OrderStatus.STOCK_HOLD] },
  { key: 'done', label: 'Completed', statuses: [OrderStatus.COMPLETED] },
];

export default function OrdersList() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const branchFilter = useOperationalBranchFilter();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const active = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
  const statusKey = active.statuses?.join(',') ?? '';

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin-orders', 'list', branchFilter.branchId, debouncedSearch, from, to, statusKey],
    enabled: branchFilter.canViewAllBranches || Boolean(branchFilter.branchId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (branchFilter.branchId) params.set('branchId', branchFilter.branchId);
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (active.statuses?.length === 1) params.set('status', active.statuses[0]);
      if (active.statuses && active.statuses.length > 1) params.set('statuses', statusKey);
      if (pageParam) params.set('cursor', pageParam);
      const r = await fetch(`/api/admin/orders?${params.toString()}`);
      if (!r.ok) throw new Error('Failed to load orders');
      return (await r.json()) as Paginated<OrderDto>;
    },
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });

  const all = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const rows = all;

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Fulfilment pipeline for the selected branch"
        actions={
          <>
            <BranchFilter {...branchFilter} onChange={branchFilter.setBranchId} />
            <span className="text-sm text-slate-400">
              {all.length} order{all.length === 1 ? '' : 's'}
            </span>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order number"
          className={inputClass}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
          className={inputClass}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
          className={inputClass}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150',
                filter === f.key
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/15'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders in this view"
            description="Try a different filter, or wait for new orders to come in."
            icon={IconOrders}
          />
        </Card>
      ) : (
        <TableCard>
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <Th>Order</Th>
              <Th>Status</Th>
              <Th>Type</Th>
              <Th>Fulfilment</Th>
              <Th>Placed</Th>
              <Th right>Total</Th>
              <Th right>{''}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-slate-50/60">
                <Td>
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {o.orderNo}
                  </Link>
                </Td>
                <Td>
                  <Badge tone={statusTone(o.status)}>{label(o.status)}</Badge>
                </Td>
                <Td>
                  {o.requiresRxVerification ? (
                    <span className="font-medium text-brand-700">℞ Rx</span>
                  ) : (
                    <span className="text-slate-500">OTC</span>
                  )}
                </Td>
                <Td className="capitalize text-slate-500">{o.fulfillment.type}</Td>
                <Td className="text-slate-400">{timeAgo(o.createdAt)}</Td>
                <Td right className="font-semibold text-slate-900">
                  {formatKobo(o.totals.totalKobo)}
                </Td>
                <Td right>
                  <Link href={`/orders/${o.id}`}>
                    <IconChevronRight width={16} height={16} className="inline text-slate-300" />
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Load more orders'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
