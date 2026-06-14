import Link from 'next/link';
import { marketingNav } from '@/lib/content';
import { StoreLink } from './StoreLink';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-paper-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
            Lanyard Pharmacy
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-3 text-sm font-medium text-ink-900/70 sm:gap-5">
          {marketingNav.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-brand-700">
              {item.label}
            </Link>
          ))}
          <StoreLink source="header-shop" className="cta-primary px-4 py-2 text-sm">
            Shop now
          </StoreLink>
        </nav>
      </div>
    </header>
  );
}
