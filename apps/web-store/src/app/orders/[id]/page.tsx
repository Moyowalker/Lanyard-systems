'use client';

import { ChangeEvent, use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto, PrescriptionDto } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { statusLabel, statusTone } from '@/lib/orders';
import { useReorder } from '@/lib/client';

interface Tracking {
  status: string;
  history: Array<{ from: string; to: string; at: string; reason?: string }>;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const reorder = useReorder();
  const [rxFiles, setRxFiles] = useState<FileList | null>(null);
  const [rxMessage, setRxMessage] = useState<string | undefined>();

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

  const prescription = useQuery({
    queryKey: ['prescription', order.data?.prescriptionIds?.[0]],
    enabled: Boolean(order.data?.prescriptionIds?.[0]),
    queryFn: async () => {
      const rxId = order.data?.prescriptionIds?.[0];
      const res = await fetch(`/api/prescriptions/${rxId}`);
      if (!res.ok) return null;
      return res.json() as Promise<PrescriptionDto>;
    },
    refetchInterval: 5000,
  });

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
  const needsInfo = prescription.data?.status === 'needs_info';
  const verifiedRx = prescription.data?.verification;

  async function submitClarification(event: ChangeEvent<HTMLFormElement>) {
    event.preventDefault();
    const rxId = prescription.data?.id;
    if (!rxId || !rxFiles || rxFiles.length === 0) {
      setRxMessage('Choose at least one prescription file.');
      return;
    }
    const form = new FormData();
    Array.from(rxFiles).forEach((file) => form.append('files', file));
    const res = await fetch(`/api/prescriptions/${rxId}/files`, { method: 'POST', body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setRxMessage(body?.error?.message ?? 'Could not upload prescription files.');
      return;
    }
    setRxFiles(null);
    setRxMessage('Thanks. Your prescription is back with the pharmacist for review.');
    await prescription.refetch();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700/60 transition hover:text-brand-800"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path d="M19 12H5m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Your orders
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="page-eyebrow">Order</div>
          <h1 className="page-title mt-1">{o.orderNo}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={reorder.isPending}
            onClick={() =>
              reorder.mutate(o.id, {
                onSuccess: (result) => {
                  const unavailable = result.unavailableItems.map((item) => item.name).join(', ');
                  const search = new URLSearchParams({ reordered: '1' });
                  if (unavailable) search.set('unavailable', unavailable);
                  router.push(`/cart?${search.toString()}`);
                },
              })
            }
            className="secondary-button min-h-0 rounded-[0.95rem] px-3 py-2 text-xs disabled:opacity-50"
          >
            Reorder
          </button>
          <span
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${statusTone(o.status)}`}
          >
            {statusLabel(o.status)}
          </span>
        </div>
      </div>

      {o.requiresRxVerification && o.status === 'AWAITING_RX_VERIFICATION' && (
        <div className="rx-note">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[0.9rem] bg-seal-200/70 font-display text-sm font-bold text-ink-900">
            Rx
          </span>
          <div>
            <div className="font-semibold text-ink-950">Pharmacist review in progress</div>
            <p className="mt-1 text-ink-700/80">
              A pharmacist is reviewing your prescription. We&apos;ll notify you and update this
              page the moment it&apos;s verified.
            </p>
          </div>
        </div>
      )}

      {needsInfo ? (
        <form className="rx-note" onSubmit={submitClarification}>
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[0.9rem] bg-amber-100 font-display text-sm font-bold text-amber-800">
            Rx
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink-950">Pharmacist needs more information</div>
            <p className="mt-1 text-ink-700/80">{prescription.data?.clarificationRequest?.note}</p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-[0.95rem] border border-paper-200 bg-white px-3 py-2 text-sm font-semibold text-brand-800 transition hover:border-brand-200">
              Upload files
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(event) => setRxFiles(event.target.files)}
                className="sr-only"
              />
            </label>
            {rxFiles && rxFiles.length > 0 ? (
              <div className="mt-2 text-xs text-ink-700/65">
                {Array.from(rxFiles)
                  .map((file) => file.name)
                  .join(', ')}
              </div>
            ) : null}
            <button type="submit" className="primary-button mt-3 min-h-0 px-3 py-2 text-xs">
              Submit update
            </button>
            {rxMessage ? <p className="mt-2 text-sm text-ink-700/75">{rxMessage}</p> : null}
          </div>
        </form>
      ) : null}

      {verifiedRx ? (
        <div className="rx-note">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[0.9rem] bg-seal-200/70 font-display text-sm font-bold text-ink-900">
            Rx
          </span>
          <div>
            <div className="font-semibold text-ink-950">Verified by a licensed pharmacist</div>
            <p className="mt-1 text-ink-700/80">
              PCN license {verifiedRx.pcnLicenseNo} · {new Date(verifiedRx.at).toLocaleString()}
            </p>
            {verifiedRx.note ? <p className="mt-1 text-ink-700/70">{verifiedRx.note}</p> : null}
          </div>
        </div>
      ) : null}

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
          {o.fulfillment.type === 'delivery' &&
          (o.fulfillment.deliveryZoneName || o.fulfillment.etaMins) ? (
            <div className="flex justify-between gap-3 text-ink-700/60">
              <span>{o.fulfillment.deliveryZoneName ?? 'Delivery ETA'}</span>
              <span>{o.fulfillment.etaMins ? `${o.fulfillment.etaMins} min` : 'ETA pending'}</span>
            </div>
          ) : null}
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
                    <span
                      className="absolute left-[5px] top-3 h-full w-px bg-paper-200"
                      aria-hidden="true"
                    />
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
