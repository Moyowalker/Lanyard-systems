'use client';

import Link from 'next/link';
import { useCart } from '@/lib/client';

export function CartLink() {
  const { data: cart } = useCart();
  const count = cart?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0;
  return (
    <Link
      href="/cart"
      className="relative rounded-md px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
    >
      Cart
      {count > 0 && (
        <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
