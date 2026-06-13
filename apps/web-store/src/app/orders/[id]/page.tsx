'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto, PaymentInitDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { statusLabel, statusTone } from '@/lib/orders';

interface Tracking {
  status: string;
  history: Array<{ from: string; to: string; at: string; reason?: string }>;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [paying, setPaying] = useState(false);
  const [payStep, setPayStep] = useState('');
  const [payError, setPayError] = useState<string | undefined>();

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

  // Settle payment for an order that is awaiting it (e.g. an Rx order just verified by a
  // pharmacist). Mirrors the checkout payment step exactly — no new business logic.
  async function payNow() {
    setPayError(undefined);
    setPaying(true);
    try {
      setPayStep('Starting payment…');
      const payRes = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      });
      const intent = (await payRes.json()) as PaymentInitDto & { error?: { message: string } };
      if (!payRes.ok) throw new Error(intent.error?.message ?? 'Could not start payment');

      if (intent.authorizationUrl.includes('mock-checkout.local')) {
        setPayStep('Confirming payment…');
        await fetch(`/api/payments/dev-confirm/${intent.intentId}`, { method: 'POST' });
        await order.refetch();
        await tracking.refetch();
        setPaying(false);
      } else {
        window.location.href = intent.authorizationUrl;
      }
    } catch (e) {
      setPayError((e as Error).message);
      setPaying(false);
    }
  }

  if (order.isLoading)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-9 w-44 animate-pulse rounded-full bg-white/70" />
        <div className="surface-panel h-48 animate-pulse" />
      </div>
    );
  if (!order.data)
    return (
      <div className="state-card mx-auto max-w-md text-center">
        <p className="text-ink-700/80">
          Order not found.{' '}
          <Link href="/orders" className="font-semibold text-brand-700 hover:underline">
            Your orders
          </Link>
        </p>
      </div>
    );

  const o = order.data;
  const history = tracking.data?.history ?? [];
  const awaitingPayment = o.status === 'AWAITING_PAYMENT';

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700/60 transition hover:text-brand-800"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M19 12H5m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Your orders
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="page-eyebrow">Order</div>
          <h1 className="page-title mt-1">{o.orderNo}</h1>
        </div>
        <span className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${statusTone(o.status)}`}>
          {statusLabel(o.status)}
        </span>
      </div>

      {o.requiresRxVerification && o.status === 'AWAITING_RX_VERIFICATION' && (
        <div className="rx-note">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[0.9rem] bg-seal-200/70 font-display text-sm font-bold text-ink-900">
            Rx
          </span>
          <div>
            <div className="font-semibold text-ink-950">Pharmacist review in progress</div>
            <p className="mt-1 text-ink-700/80">
              A pharmacist is reviewing your prescription. We&apos;ll notify you and update this page
              the moment it&apos;s verified.
            </p>
          </div>
        </div>
      )}

      {/* Payment due — e.g. an Rx order a pharmacist just verified. */}
      {awaitingPayment && (
        <div className="surface-panel border-2 border-brand-200 px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="section-kicker before:hidden">Payment due</div>
              <p className="mt-2 text-sm leading-6 text-ink-700/80">
                {o.requiresRxVerification
                  ? 'Your prescription is verified. Complete payment to start fulfilment.'
                  : 'Complete payment to start fulfilment of your order.'}
              </p>
              <div className="tnum mt-3 font-display text-2xl text-ink-950">
                {formatKobo(o.totals.totalKobo)}
              </div>
            </div>
            <button onClick={payNow} disabled={paying} className="primary-button">
              {paying ? payStep || 'Working…' : 'Pay now'}
              {!paying && (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
          {payError && (
            <p className="mt-4 flex items-start gap-2 rounded-[1rem] border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.9">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5m0 3h.01" strokeLinecap="round" />
              </svg>
              {payError}
            </p>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-700/55">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Encrypted payment via Paystack
          </p>
        </div>
      )}

      <section className="surface-panel px-5 py-6 sm:px-6">
        <div className="section-kicker">Items</div>
        <ul className="mt-4 divide-y divide-paper-200/70">
          {o.items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="text-ink-800">
                {i.name} <span className="text-ink-700/55">× {i.quantity}</span>
              </span>
              <span className="tnum flex-none font-medium text-ink-950">
                {formatKobo(i.lineTotalKobo)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2 border-t border-paper-200 pt-3 text-sm">
          <div className="flex justify-between text-ink-700/70">
            <span className="capitalize">Delivery ({o.fulfillment.type})</span>
            <span className="tnum">{formatKobo(o.totals.deliveryKobo)}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-paper-200 pt-2.5">
            <span className="font-semibold text-ink-950">Total</span>
            <span className="tnum font-display text-xl text-ink-950">
              {formatKobo(o.totals.totalKobo)}
            </span>
          </div>
        </div>
      </section>

      <section className="surface-panel px-5 py-6 sm:px-6">
        <div className="section-kicker">Tracking</div>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-ink-700/65">Tracking updates will appear here.</p>
        ) : (
          <ol className="mt-5 space-y-0">
            {history.map((h, idx) => {
              const isLatest = idx === history.length - 1;
              return (
                <li key={idx} className="relative flex gap-4 pb-5 last:pb-0">
                  {idx < history.length - 1 ? (
                    <span className="absolute left-[5px] top-3 h-full w-px bg-paper-200" aria-hidden="true" />
                  ) : null}
                  <span className={`timeline-dot ${isLatest ? '' : 'timeline-dot--muted'}`} />
                  <div className="-mt-0.5">
                    <div className="font-semibold text-ink-950">{statusLabel(h.to)}</div>
                    <div className="mt-0.5 text-xs text-ink-700/55">
                      {new Date(h.at).toLocaleString()}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
