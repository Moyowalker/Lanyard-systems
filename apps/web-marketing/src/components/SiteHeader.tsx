import Link from 'next/link';
import { marketingNav } from '@/lib/content';
import { BrandLogo } from './BrandLogo';
import { StoreLink } from './StoreLink';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-paper-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <BrandLogo className="h-auto w-32" />
        </Link>

        <nav className="flex flex-wrap items-center gap-3 text-sm font-medium text-ink-900/70 sm:gap-5">
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
