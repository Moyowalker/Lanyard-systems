import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { Header } from '@/components/Header';
import { supportContact } from '@/lib/support';

const policyLinks = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/returns', label: 'Returns and refunds' },
];

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: { default: 'Lanyard Pharmacy', template: '%s · Lanyard Pharmacy' },
  description: 'Order medicines and upload prescriptions for pickup or delivery in Nigeria.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable}`}>
        <Providers>
          <div className="relative min-h-screen">
            <Header />
            <main className="mx-auto w-full max-w-[1280px] px-4 pb-14 pt-7 sm:px-6 lg:px-8">
              {children}
            </main>
            <footer className="mx-auto w-full max-w-[1280px] px-4 pb-12 sm:px-6 lg:px-8">
              <div className="surface-panel overflow-hidden bg-ink-950 px-6 py-7 text-white shadow-lift sm:px-8 sm:py-8">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,#081512_0%,#123128_58%,#173830_100%)]" />
                <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(40%_100%_at_15%_0%,rgba(216,184,108,0.2),transparent_72%)]" />
                <div className="relative flex flex-col gap-7 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-2xl">
                    <div className="section-kicker text-brand-200 before:bg-brand-300/60">
                      Care, verified
                    </div>
                    <h2 className="mt-4 font-display text-3xl text-white sm:text-[2.3rem]">
                      The storefront speaks softly, but the pharmacy standards stay explicit.
                    </h2>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-white/75">
                      Lanyard Pharmacy dispenses prescription-only medicines only after licensed
                      pharmacist review, with branch-level stock visibility and transparent order
                      updates from cart to pickup or delivery.
                    </p>
                  </div>
                  <div className="grid gap-6 md:min-w-[22rem] md:justify-items-end">
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3 md:text-right">
                      {[
                        ['PCN-licensed', 'Pharmacist oversight'],
                        ['NAFDAC', 'Registered medicines'],
                        ['Secure', 'Pickup or delivery'],
                      ].map(([label, sub]) => (
                        <div key={label} className="md:flex md:flex-col md:items-end">
                          <dt className="text-sm font-semibold text-white">{label}</dt>
                          <dd className="mt-0.5 text-xs text-white/62">{sub}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {supportContact.whatsappUrl ? (
                        <a
                          href={supportContact.whatsappUrl}
                          className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/82 transition hover:bg-white/14"
                        >
                          WhatsApp support
                        </a>
                      ) : null}
                      {supportContact.phoneHref ? (
                        <a
                          href={supportContact.phoneHref}
                          className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/82 transition hover:bg-white/14"
                        >
                          {supportContact.phoneDisplay}
                        </a>
                      ) : null}
                      <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/82">
                        {supportContact.hours}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="relative mt-7 flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-white/62 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span>© {new Date().getFullYear()} Lanyard Pharmacy. All rights reserved.</span>
                    {policyLinks.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        className="font-semibold text-white/74 hover:text-brand-200"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                  <span className="font-medium uppercase tracking-[0.18em] text-brand-200">
                    Dispensed with care in Nigeria
                  </span>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
