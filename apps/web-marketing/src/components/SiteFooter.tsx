import Link from 'next/link';
import { marketingNav } from '@/lib/content';
import { STORE_URL } from '@/lib/config';
import { StoreLink } from './StoreLink';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/60 bg-[rgba(16,40,31,0.96)] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_.8fr] lg:px-8">
        <div>
          <div className="eyebrow text-brand-200">Lanyard Pharmacy</div>
          <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
            A warmer, sharper front door for pharmacy care.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">
            The marketing surface sets the tone, the store drives conversion, and the admin app
            handles the compliance-heavy work behind the scenes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <StoreLink source="footer-shop" className="cta-primary px-5 py-3 text-sm">
              Enter the store
            </StoreLink>
            <Link
              href="/branches"
              className="cta-secondary border-white/20 text-white hover:border-white/40 hover:bg-white/10"
            >
              See branches
            </Link>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
              Explore
            </div>
            <div className="mt-4 space-y-3 text-sm text-white/80">
              {marketingNav.map((item) => (
                <div key={item.href}>
                  <Link href={item.href} className="transition-colors hover:text-brand-200">
                    {item.label}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
              Local demo
            </div>
            <div className="mt-4 space-y-3 text-sm text-white/70">
              <p>Customer store: {STORE_URL}</p>
              <p>Marketing site: local preview on port 3002</p>
              <p>Compliance-first commerce experience built for Nigeria.</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
