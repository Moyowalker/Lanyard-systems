'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { OrderDto, Paginated } from '@lanyard/contracts';
import { formatKobo } from '@/lib/format';
import { statusLabel, statusTone } from '@/lib/orders';

export default function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await fetch('/api/orders');
      if (res.status === 401 || res.status === 403) return null;
      return res.json() as Promise<Paginated<OrderDto>>;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-full bg-white/70" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="surface-panel h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data)
    return (
      <div className="state-card mx-auto max-w-md text-center">
        <p className="text-ink-700/80">
          Please{' '}
          <Link href="/account/login" className="font-semibold text-brand-700 hover:underline">
            sign in
          </Link>{' '}
          to see your orders.
        </p>
      </div>
    );

  if (data.data.length === 0)
    return (
      <div className="state-card mx-auto max-w-md text-center">
        <div className="flex flex-col items-center gap-4 py-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-brand-100 text-brand-800">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M8 7h10M8 12h10M8 17h6" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <div className="font-display text-xl text-ink-950">No orders yet</div>
            <p className="mt-1.5 text-sm text-ink-700/75">
              When you place an order, it&apos;ll appear here with live tracking.
            </p>
          </div>
          <Link href="/" className="primary-button">
            Browse medicines
          </Link>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <div className="page-eyebrow">Order history</div>
        <h1 className="page-title mt-2">Your orders</h1>
      </div>

      <ul className="space-y-3">
        {data.data.map((o) => (
          <li key={o.id}>
            <Link
              href={`/orders/${o.id}`}
              className="surface-panel group flex items-center justify-between gap-3 px-5 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[1rem] bg-brand-50 text-brand-700">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M6 2h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
                    <path d="M9 12h6M9 16h4" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <div className="font-display text-lg text-ink-950">{o.orderNo}</div>
                  <div className="tnum mt-0.5 text-sm text-ink-700/65">
                    {o.items.length} item{o.items.length === 1 ? '' : 's'} ·{' '}
                    {formatKobo(o.totals.totalKobo)}
                  </div>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(o.status)}`}>
                {statusLabel(o.status)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
