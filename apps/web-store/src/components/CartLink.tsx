'use client';

import Link from 'next/link';
import { useCart } from '@/lib/client';

export function CartLink() {
  const { data: cart } = useCart();
  const count = cart?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0;
  return (
    <Link
      href="/cart"
      className="inline-flex items-center gap-2 rounded-xl border border-paper-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:text-brand-800"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path d="M4 5h2l1.6 10.2a1.5 1.5 0 0 0 1.5 1.3h7.7a1.5 1.5 0 0 0 1.5-1.2L20 8H7" />
        <circle cx="9.5" cy="20" r="1.2" />
        <circle cx="18" cy="20" r="1.2" />
      </svg>
      Cart
      {count > 0 && (
        <span className="tnum inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-700 px-1.5 text-[0.7rem] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
