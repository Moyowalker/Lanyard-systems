'use client';

import { memo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Paginated, StockMovementDto, StockMovementType } from '@lanyard/contracts';

import { Badge, Button, EmptyState, Panel, Skeleton, Spinner, cn } from '@/components/ui';
import { IconAlert, IconClock } from '@/components/icons';
import { formatDateTime } from '@/lib/format';

const MOVEMENT_TONE: Record<StockMovementType, 'success' | 'warn' | 'danger' | 'info' | 'neutral'> =
  {
    [StockMovementType.RECEIVE]: 'success',
    [StockMovementType.ADJUST]: 'info',
    [StockMovementType.RESERVE]: 'warn',
    [StockMovementType.RELEASE]: 'neutral',
    [StockMovementType.DISPENSE]: 'danger',
    [StockMovementType.RETURN]: 'success',
  };

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500';

function short(id?: string): string {
  return id ? id.slice(-6) : '—';
}

/** Branch-wide stock-movement ledger with a type filter and cursor pagination. */
function ActivityFeedInner({ branchId }: { branchId: string }) {
  const [activityType, setActivityType] = useState<StockMovementType | 'all'>('all');

  const activityQ = useInfiniteQuery({
    queryKey: ['admin-inventory-movements', branchId, activityType],
    enabled: Boolean(branchId),
    initialPageParam: '',
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '25' });
      if (pageParam) params.set('cursor', pageParam as string);
      if (activityType !== 'all') params.set('type', activityType);
      const res = await fetch(
        `/api/admin/branches/${branchId}/inventory/movements?${params.toString()}`,
      );
      if (!res.ok) throw new Error('Failed to load stock movements');
      return (await res.json()) as Paginated<StockMovementDto>;
    },
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });

  const movements = activityQ.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <Panel
      title="Recent activity"
      subtitle="Every stock movement at this branch — receiving, adjustments, reservations, and sales"
      className="mt-6"
      action={
        <select
          value={activityType}
          onChange={(event) => setActivityType(event.target.value as StockMovementType | 'all')}
          className={selectClass}
          aria-label="Filter activity by type"
        >
          <option value="all">All types</option>
          {Object.values(StockMovementType).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      }
    >
      {activityQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : activityQ.isError ? (
        <EmptyState
          title="Activity unavailable"
          description="The stock-movement endpoint did not return data for this branch."
          icon={IconAlert}
        />
      ) : movements.length === 0 ? (
        <EmptyState
          title="No stock movements yet"
          description="Receiving, adjustments, and sales will appear here as they happen."
          icon={IconClock}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Product</th>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 text-right font-semibold">Qty</th>
                <th className="py-2 pr-3 font-semibold">Ref</th>
                <th className="py-2 pr-3 font-semibold">Actor</th>
                <th className="py-2 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id} className="text-slate-600">
                  <td className="py-2 pr-3 text-slate-400">{formatDateTime(m.at)}</td>
                  <td className="py-2 pr-3 font-medium text-slate-800">{m.productName}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={MOVEMENT_TONE[m.type]}>{m.type}</Badge>
                  </td>
                  <td
                    className={cn(
                      'py-2 pr-3 text-right font-semibold',
                      m.quantity < 0 ? 'text-rose-600' : 'text-emerald-600',
                    )}
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">
                    {m.refType ?? 'system'}
                    {m.refId ? ` · ${short(m.refId)}` : ''}
                  </td>
                  <td className="py-2 pr-3 text-slate-500">
                    {m.actorId ? short(m.actorId) : 'System'}
                  </td>
                  <td className="py-2 text-slate-500">{m.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {activityQ.hasNextPage ? (
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => activityQ.fetchNextPage()}
                disabled={activityQ.isFetchingNextPage}
              >
                {activityQ.isFetchingNextPage ? (
                  <>
                    <Spinner className="h-4 w-4" /> Loading…
                  </>
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

export const ActivityFeed = memo(ActivityFeedInner);
