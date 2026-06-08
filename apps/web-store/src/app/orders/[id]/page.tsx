'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { statusLabel, statusTone } from '@/lib/orders';

interface Tracking {
  status: string;
  history: Array<{ from: string; to: string; at: string; reason?: string }>;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const order = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}`);
      if (!res.ok) return null;
      return res.json() as Promise<OrderDto>;
    },
    refetchInterval: 5000, // reflect pharmacist verification / fulfilment progress
  });

  const tracking = useQuery({
    queryKey: ['order-tracking', id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}/tracking`);
      if (!res.ok) return null;
      return res.json() as Promise<Tracking>;
    },
    refetchInterval: 5000,
  });

  if (order.isLoading) return <p className="text-gray-500">Loading…</p>;
  if (!order.data)
    return (
      <p className="text-gray-600">
        Order not found.{' '}
        <Link href="/orders" className="font-medium text-brand-700 hover:underline">
          Your orders
        </Link>
      </p>
    );

  const o = order.data;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{o.orderNo}</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusTone(o.status)}`}>
          {statusLabel(o.status)}
        </span>
      </div>

      {o.requiresRxVerification && o.status === 'AWAITING_RX_VERIFICATION' && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          A pharmacist is reviewing your prescription. We’ll email you and update this page once
          it’s verified.
        </p>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Items</h2>
        <ul className="divide-y divide-gray-100 text-sm">
          {o.items.map((i) => (
            <li key={i.productId} className="flex justify-between py-2">
              <span>
                {i.name} × {i.quantity}
              </span>
              <span>{formatKobo(i.lineTotalKobo)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Delivery ({o.fulfillment.type})</span>
            <span>{formatKobo(o.totals.deliveryKobo)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatKobo(o.totals.totalKobo)}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Tracking</h2>
        <ol className="space-y-2">
          {(tracking.data?.history ?? []).map((h, idx) => (
            <li key={idx} className="flex items-start gap-3 text-sm">
              <span className="mt-1 h-2 w-2 flex-none rounded-full bg-brand-500" />
              <div>
                <div className="font-medium text-gray-800">{statusLabel(h.to)}</div>
                <div className="text-xs text-gray-400">
                  {new Date(h.at).toLocaleString()}
                  {h.reason ? ` · ${h.reason}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
