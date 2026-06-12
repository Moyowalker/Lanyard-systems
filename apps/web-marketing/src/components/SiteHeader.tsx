import Link from 'next/link';
import { marketingNav } from '@/lib/content';
import { StoreLink } from './StoreLink';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-[rgba(255,250,243,0.8)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-400 text-sm font-bold text-white shadow-glow">
            LP
          </span>
          <div>
            <div className="text-lg font-semibold tracking-tight text-ink-900">
              Lanyard Pharmacy
            </div>
            <div className="text-xs uppercase tracking-[0.24em] text-ink-700/50">
              Marketing Site
            </div>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-3 text-sm text-ink-700/80 sm:gap-5">
          {marketingNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-brand-700"
            >
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
