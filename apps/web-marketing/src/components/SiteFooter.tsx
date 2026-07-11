import Link from 'next/link';
import { marketingNav } from '@/lib/content';
import { contactChannels } from '@/lib/content';
import { BrandLogo } from './BrandLogo';
import { StoreLink } from './StoreLink';

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-paper-200 bg-ink-900 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_.8fr] lg:px-8">
        <div>
          <Link href="/" className="inline-flex rounded-xl bg-white p-2.5 shadow-sm">
            <BrandLogo className="h-11 w-auto" />
          </Link>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/70">
            Genuine medicines from a licensed pharmacy near you — delivered fast across Lagos, or
            ready for free pickup. Prescriptions are checked by a licensed pharmacist.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <StoreLink source="footer-shop" className="cta-primary px-5 py-3 text-sm">
              Start shopping
            </StoreLink>
            <Link
              href="/branches"
              className="cta-secondary border-white/20 bg-transparent px-5 py-3 text-sm text-white hover:bg-white/10 hover:text-white"
            >
              Find a branch
            </Link>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
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
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
              Get in touch
            </div>
            <div className="mt-4 space-y-3 text-sm text-white/75">
              {contactChannels.slice(0, 2).map((c) => (
                <div key={c.title}>
                  <div className="font-medium text-white/90">{c.detail}</div>
                  <div className="text-xs text-white/55">{c.title}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-5 text-xs text-white/50 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Lanyard Pharmacy. Genuine medicines, prepared with care in
          Nigeria.
        </div>
      </div>
    </footer>
  );
}
