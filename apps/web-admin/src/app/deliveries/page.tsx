'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  ActiveDeliveryStatusValue,
  DeliveryBoardDto,
  DeliveryBoardItemDto,
} from '@lanyard/contracts';
import { formatKobo, label, statusTone, timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, cn, type Tone } from '@/components/ui';
import { IconBranch, IconCheck, IconOrders } from '@/components/icons';
import { BranchFilter, useOperationalBranchFilter } from '@/components/branch-filter';

const DELIVERY_LABEL: Record<string, string> = {
  queued: 'Queued',
  dispatched: 'Dispatched',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Failed',
};
const deliveryLabel = (s?: string): string => (s ? (DELIVERY_LABEL[s] ?? s) : '');

const FILTERS: Array<{ value: '' | ActiveDeliveryStatusValue; label: string }> = [
  { value: '', label: 'All active' },
  { value: 'queued', label: 'Queued' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'failed', label: 'Failed' },
];

const inputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function deliveryTone(status?: string): Tone {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'failed':
      return 'danger';
    case 'out_for_delivery':
      return 'warn';
    case 'dispatched':
      return 'info';
    default:
      return 'neutral';
  }
}

export default function DeliveriesPage() {
  const [status, setStatus] = useState<'' | ActiveDeliveryStatusValue>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const branchFilter = useOperationalBranchFilter();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['deliveries', branchFilter.branchId, status, debouncedSearch, from, to],
    enabled: branchFilter.canViewAllBranches || Boolean(branchFilter.branchId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (branchFilter.branchId) params.set('branchId', branchFilter.branchId);
      if (status) params.set('status', status);
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (from) params.set('from', `${from}T00:00:00.000Z`);
      if (to) params.set('to', `${to}T23:59:59.999Z`);
      const r = await fetch(`/api/admin/deliveries?${params.toString()}`);
      if (!r.ok) throw new Error('Failed to load deliveries');
      return (await r.json()) as DeliveryBoardDto;
    },
    refetchInterval: 10000,
  });

  const items = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Deliveries"
        subtitle="Assign riders and track delivery orders for the selected branch"
        actions={
          <>
            <BranchFilter {...branchFilter} onChange={branchFilter.setBranchId} />
            <span className="text-sm text-slate-400">{items.length} active</span>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order, phone, or address"
          className={cn(inputClass, 'min-w-64 flex-1')}
        />
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="From date"
          className={inputClass}
        />
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => setTo(event.target.value)}
          aria-label="To date"
          className={inputClass}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value || 'all'}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
              status === filter.value
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/15'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-5 text-sm text-rose-700">
          <p role="alert">Deliveries could not be loaded. Try again.</p>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={status || debouncedSearch || from || to ? 'No matching deliveries' : 'No delivery orders right now'}
            description={
              status || debouncedSearch || from || to
                ? 'Change or clear the filters to see other active deliveries.'
                : 'Paid delivery orders appear here, ready to dispatch.'
            }
            icon={IconOrders}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <DeliveryCard key={item.orderId} item={item} onChanged={() => refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeliveryCard({ item, onChanged }: { item: DeliveryBoardItemDto; onChanged: () => void }) {
  const [riderName, setRiderName] = useState(item.delivery?.rider?.name ?? '');
  const [riderPhone, setRiderPhone] = useState(item.delivery?.rider?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const delivery = item.delivery;
  const status = delivery?.status;
  // A failed attempt re-opens the rider form so staff can re-dispatch (the API allows it).
  const showRiderForm = !delivery || status === 'queued' || status === 'failed';
  const isDispatched = status === 'dispatched';
  const isOutForDelivery = status === 'out_for_delivery';
  const isDelivered = status === 'delivered';

  async function dispatch() {
    if (!riderName.trim()) return setError('Enter a rider name.');
    setBusy(true);
    setError(undefined);
    const r = await fetch(`/api/admin/deliveries/${item.orderId}/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        riderName: riderName.trim(),
        riderPhone: riderPhone.trim() || undefined,
      }),
    });
    const body = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) return setError(body?.error?.message ?? 'Could not dispatch.');
    onChanged();
  }

  async function act(action: 'out_for_delivery' | 'delivered' | 'failed') {
    setBusy(true);
    setError(undefined);
    const r = await fetch(`/api/admin/deliveries/${item.orderId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const body = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) return setError(body?.error?.message ?? 'Action failed.');
    onChanged();
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{item.orderNo}</span>
            <Badge tone={statusTone(item.orderStatus)}>{label(item.orderStatus)}</Badge>
            {delivery && (
              <Badge tone={deliveryTone(delivery.status)}>{deliveryLabel(delivery.status)}</Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            {item.address && (
              <span className="inline-flex items-center gap-1.5">
                <IconBranch width={14} height={14} />
                {item.address.line1}, {item.address.city}, {item.address.state}
              </span>
            )}
            {item.etaMins ? <span>ETA ~{item.etaMins} min</span> : null}
            <span>{timeAgo(item.createdAt)}</span>
          </div>
          {item.address?.contactPhone && (
            <div className="mt-1 text-sm text-slate-600">
              Customer phone:{' '}
              <a
                href={`tel:${item.address.contactPhone}`}
                className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2"
              >
                {item.address.contactPhone}
              </a>
            </div>
          )}
          {delivery?.rider?.name && (
            <div className="mt-1 text-sm text-slate-600">
              Rider: <span className="font-medium text-slate-800">{delivery.rider.name}</span>
              {delivery.rider.phone ? ` · ${delivery.rider.phone}` : ''}
            </div>
          )}
          {item.deliveryNote && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span className="font-semibold">Customer note:</span> {item.deliveryNote}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-slate-900">{formatKobo(item.totalKobo)}</div>
          <div className="text-xs text-slate-400">{formatKobo(item.deliveryFeeKobo)} delivery</div>
        </div>
      </div>

      {!isDelivered && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {showRiderForm ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Rider name
                </label>
                <input
                  value={riderName}
                  onChange={(e) => setRiderName(e.target.value)}
                  placeholder="e.g. Emeka O."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Rider phone (optional)
                </label>
                <input
                  value={riderPhone}
                  onChange={(e) => setRiderPhone(e.target.value)}
                  placeholder="+2348012345678"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <Button onClick={dispatch} disabled={busy}>
                {status === 'failed' ? 'Re-dispatch' : 'Dispatch'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {isDispatched && (
                <Button onClick={() => act('out_for_delivery')} disabled={busy}>
                  Out for delivery
                </Button>
              )}
              {isOutForDelivery && (
                <Button onClick={() => act('delivered')} disabled={busy}>
                  <IconCheck width={15} height={15} /> Mark delivered
                </Button>
              )}
              <Button variant="danger" onClick={() => act('failed')} disabled={busy}>
                Mark failed
              </Button>
            </div>
          )}
          {status === 'failed' && (
            <p className="mt-2 text-sm text-rose-600">
              Last attempt failed — assign a rider to retry.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
      )}

      {isDelivered && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <IconCheck width={15} height={15} /> Delivered
        </p>
      )}
    </Card>
  );
}
