'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto, Paginated } from '@lanyard/contracts';
import { formatKobo, label, statusTone, timeAgo } from '@/lib/format';
import {
  Badge,
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

const FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'rx', label: 'Awaiting ℞', match: (s) => s === 'AWAITING_RX_VERIFICATION' },
  { key: 'pay', label: 'Awaiting payment', match: (s) => s === 'AWAITING_PAYMENT' },
  {
    key: 'fulfil',
    label: 'To fulfil',
    match: (s) => ['PAID', 'FULFILLING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'].includes(s),
  },
  { key: 'hold', label: 'Stock holds', match: (s) => s === 'STOCK_HOLD' },
  { key: 'done', label: 'Completed', match: (s) => s === 'COMPLETED' },
];

export default function OrdersList() {
  const [filter, setFilter] = useState('all');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', 'list'],
    queryFn: async () => {
      const r = await fetch('/api/admin/orders?limit=100');
      return r.ok ? ((await r.json()) as Paginated<OrderDto>) : null;
    },
    refetchInterval: 10000,
  });

  const all = data?.data ?? [];
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const rows = all.filter((o) => active.match(o.status));

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Fulfilment pipeline across your branch scope"
        actions={
          <span className="text-sm text-slate-400">
            {all.length} order{all.length === 1 ? '' : 's'}
          </span>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = all.filter((o) => f.match(o.status)).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                filter === f.key
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs',
                  filter === f.key ? 'bg-white/20' : 'bg-slate-100 text-slate-500',
                )}
              >
                {count}
              </span>
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
    </div>
  );
}
