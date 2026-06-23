import './globals.css';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { BrandLogo } from '@/components/BrandLogo';
import { supportContact } from '@/lib/support';

const policyLinks = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/returns', label: 'Returns and refunds' },
];

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Lanyard Pharmacy', template: '%s · Lanyard Pharmacy' },
  description: 'Order medicines and upload prescriptions for pickup or delivery in Nigeria.',
  icons: { icon: '/logo.png', apple: '/logo.png' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={sans.variable}>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            {/* pb-24 leaves room for the mobile bottom nav */}
            <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-14">
              {children}
            </main>

            <footer className="border-t border-paper-200 bg-white">
              <div className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-md">
                    <BrandLogo className="h-12 w-auto" />
                    <p className="mt-3 text-sm leading-6 text-ink-900/65">
                      Prescription-only medicines are dispensed only after licensed pharmacist
                      review, with branch-level stock and transparent order tracking.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex flex-wrap gap-x-6 gap-y-2 font-medium text-ink-900/70">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> PCN-licensed
                        oversight
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> NAFDAC-registered
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {supportContact.whatsappUrl ? (
                        <a
                          href={supportContact.whatsappUrl}
                          className="ghost-pill hover:border-brand-300"
                        >
                          WhatsApp support
                        </a>
                      ) : null}
                      {supportContact.phoneHref ? (
                        <a
                          href={supportContact.phoneHref}
                          className="ghost-pill hover:border-brand-300"
                        >
                          {supportContact.phoneDisplay}
                        </a>
                      ) : null}
                      <span className="ghost-pill">{supportContact.hours}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-7 flex flex-col gap-2 border-t border-paper-200 pt-5 text-xs text-ink-900/55 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span>© {new Date().getFullYear()} Lanyard Pharmacy. All rights reserved.</span>
                    {policyLinks.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        className="font-medium hover:text-brand-700"
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                  <span className="font-medium">Dispensed with care in Nigeria</span>
                </div>
              </div>
            </footer>

            <BottomNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
