'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryBoardDto, DeliveryBoardItemDto } from '@lanyard/contracts';
import { formatKobo, label, statusTone, timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, type Tone } from '@/components/ui';
import { IconBranch, IconCheck, IconOrders } from '@/components/icons';

const DELIVERY_LABEL: Record<string, string> = {
  queued: 'Queued',
  dispatched: 'Dispatched',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Failed',
};
const deliveryLabel = (s?: string): string => (s ? (DELIVERY_LABEL[s] ?? s) : '');

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
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['deliveries'],
    queryFn: async () => {
      const r = await fetch('/api/admin/deliveries');
      return r.ok ? ((await r.json()) as DeliveryBoardDto) : null;
    },
    refetchInterval: 10000,
  });

  const items = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Deliveries"
        subtitle="Assign riders and track delivery orders to the doorstep"
        actions={<span className="text-sm text-slate-400">{items.length} active</span>}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="No delivery orders right now"
            description="Paid delivery orders appear here, ready to dispatch."
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
          {delivery?.rider?.name && (
            <div className="mt-1 text-sm text-slate-600">
              Rider: <span className="font-medium text-slate-800">{delivery.rider.name}</span>
              {delivery.rider.phone ? ` · ${delivery.rider.phone}` : ''}
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
