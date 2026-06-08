'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@lanyard/contracts';
import { formatKobo, label, statusTone, NEXT_ACTIONS } from '@/lib/format';
import { Badge, Button, Panel, Spinner } from '@/components/ui';
import { IconChevronRight } from '@/components/icons';

export default function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const {
    data: o,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: async () => {
      const r = await fetch(`/api/admin/orders/${id}`);
      return r.ok ? ((await r.json()) as OrderDto) : null;
    },
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Spinner /> Loading order…
      </div>
    );
  if (!o) return <p className="text-slate-600">Order not found.</p>;

  async function transition(to: string) {
    setBusy(true);
    setError(undefined);
    const r = await fetch(`/api/admin/orders/${id}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    const body = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) return setError(body?.error?.message ?? 'Transition failed');
    await refetch();
  }

  async function refund() {
    if (!confirm('Refund this order in full? Stock will be released.')) return;
    setBusy(true);
    setError(undefined);
    const r = await fetch('/api/admin/payments/refund', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: id, reason: 'Staff-initiated refund' }),
    });
    const body = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok) return setError(body?.error?.message ?? 'Refund failed');
    await refetch();
  }

  const actions = NEXT_ACTIONS[o.status] ?? [];
  const canRefund = o.payment.status === 'paid';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/orders"
        className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <IconChevronRight width={14} height={14} className="rotate-180" /> Back to orders
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{o.orderNo}</h1>
          <p className="mt-1 text-sm text-slate-500 capitalize">
            {o.fulfillment.type} · payment {o.payment.status}
          </p>
        </div>
        <Badge tone={statusTone(o.status)}>{label(o.status)}</Badge>
      </div>

      <Panel title={`Items (${o.items.length})`}>
        <ul className="divide-y divide-slate-100 text-sm">
          {o.items.map((i) => (
            <li key={i.productId} className="flex items-center justify-between py-2.5">
              <span className="text-slate-700">
                {i.name} <span className="text-slate-400">× {i.quantity}</span>
                {i.requiresPrescription && (
                  <span className="ml-1.5 font-medium text-brand-700">℞</span>
                )}
              </span>
              <span className="font-medium text-slate-900">{formatKobo(i.lineTotalKobo)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-slate-100 pt-3">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="text-lg font-bold text-slate-900">{formatKobo(o.totals.totalKobo)}</span>
        </div>
      </Panel>

      <Panel title="Actions">
        <div className="flex flex-wrap gap-2">
          {actions.map((to) => (
            <Button key={to} onClick={() => transition(to)} disabled={busy}>
              {label(to)}
            </Button>
          ))}
          {canRefund && (
            <Button variant="danger" onClick={refund} disabled={busy}>
              Refund order
            </Button>
          )}
          {actions.length === 0 && !canRefund && (
            <span className="text-sm text-slate-400">No actions available in this state.</span>
          )}
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
      </Panel>
    </div>
  );
}
