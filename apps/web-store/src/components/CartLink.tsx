'use client';

import Link from 'next/link';
import { useCart } from '@/lib/client';

export function CartLink() {
  const { data: cart } = useCart();
  const count = cart?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0;
  const displayCount = count > 99 ? '99+' : String(count);

  return (
    <Link
      href="/cart"
      aria-label={`Cart, ${count} items`}
      className={`inline-flex min-h-[3.15rem] items-center gap-3 rounded-[1.2rem] border px-4 py-2.5 text-sm font-semibold transition duration-300 ${
        count > 0
          ? 'border-ink-950 bg-ink-950 text-white shadow-[0_18px_34px_-22px_rgba(11,33,28,0.9)] hover:-translate-y-0.5 hover:bg-brand-800'
          : 'border-paper-200/90 bg-white/[0.92] text-ink-800 shadow-card backdrop-blur-sm hover:-translate-y-0.5 hover:border-brand-200 hover:text-brand-800'
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[1rem] ${
          count > 0 ? 'bg-white/10 text-white' : 'bg-brand-50 text-brand-800'
        }`}
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
      </span>
      <span className="flex flex-col leading-none">
        <span>Cart</span>
        <span
          className={`mt-1 hidden text-[0.62rem] font-medium xl:block ${
            count > 0 ? 'text-white/72' : 'text-ink-700/52'
          }`}
        >
          {count > 0 ? 'Checkout ready' : 'Items appear here'}
        </span>
      </span>
      <span
        className={`tnum inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-[0.7rem] font-bold ${
          count > 0 ? 'bg-white text-ink-950' : 'bg-paper-100 text-ink-700'
        }`}
      >
        {displayCount}
      </span>
    </Link>
  );
}
