import Link from 'next/link';
import { marketingNav } from '@/lib/content';
import { BrandLogo } from './BrandLogo';
import { StoreLink } from './StoreLink';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-paper-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <BrandLogo className="h-9 w-auto sm:h-10" />
        </Link>

        <div className="hidden items-center gap-5 text-sm font-medium text-ink-900/70 md:flex">
          <nav className="flex items-center gap-5">
            {marketingNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-brand-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <StoreLink source="header-shop" className="cta-primary px-4 py-2 text-sm">
            Shop now
          </StoreLink>
        </div>

        <details className="group relative md:hidden">
          <summary className="flex list-none items-center gap-2 rounded-full border border-paper-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-sm marker:hidden">
            Menu
            <span className="text-brand-700 transition group-open:rotate-45">+</span>
          </summary>
          <div className="absolute right-0 top-[calc(100%+0.75rem)] w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-paper-200 bg-white p-3 shadow-card">
            <nav className="space-y-1.5 text-sm font-medium text-ink-900/75">
              {marketingNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-brand-50 hover:text-brand-800"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <StoreLink
              source="header-shop-mobile"
              className="cta-primary mt-3 w-full px-4 py-3 text-sm"
            >
              Shop now
            </StoreLink>
          </div>
        </details>
      </div>
    </header>
  );
}
