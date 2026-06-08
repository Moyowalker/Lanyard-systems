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

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (!data)
    return (
      <p className="text-gray-600">
        Please{' '}
        <Link href="/account/login" className="font-medium text-brand-700 hover:underline">
          sign in
        </Link>{' '}
        to see your orders.
      </p>
    );
  if (data.data.length === 0) return <p className="text-gray-600">You have no orders yet.</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Your orders</h1>
      <ul className="space-y-3">
        {data.data.map((o) => (
          <li key={o.id}>
            <Link
              href={`/orders/${o.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-300"
            >
              <div>
                <div className="font-medium text-gray-900">{o.orderNo}</div>
                <div className="text-sm text-gray-500">
                  {o.items.length} item(s) · {formatKobo(o.totals.totalKobo)}
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(o.status)}`}
              >
                {statusLabel(o.status)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
