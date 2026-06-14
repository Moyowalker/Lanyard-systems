'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Item = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean };

const items: Item[] = [
  {
    href: '/',
    label: 'Home',
    match: (p) => p === '/',
    icon: (
      <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    href: '/search',
    label: 'Search',
    match: (p) => p.startsWith('/search') || p.startsWith('/category') || p.startsWith('/products'),
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: '/cart',
    label: 'Cart',
    match: (p) => p.startsWith('/cart') || p.startsWith('/checkout'),
    icon: (
      <>
        <path d="M4 5h2l1.6 10.2a1.5 1.5 0 0 0 1.5 1.3h7.7a1.5 1.5 0 0 0 1.5-1.2L20 8H7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9.5" cy="20" r="1.2" />
        <circle cx="18" cy="20" r="1.2" />
      </>
    ),
  },
  {
    href: '/orders',
    label: 'Orders',
    match: (p) => p.startsWith('/orders'),
    icon: (
      <>
        <path d="M6 2h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
        <path d="M9 12h6M9 16h4" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: '/account/profile',
    label: 'Account',
    match: (p) => p.startsWith('/account'),
    icon: (
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0" strokeLinecap="round" />
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-paper-200 bg-white/95 backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.66rem] font-medium transition-colors ${
                active ? 'text-brand-700' : 'text-ink-900/55'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[22px] w-[22px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                {item.icon}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
