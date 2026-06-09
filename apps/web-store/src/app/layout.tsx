import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { Header } from '@/components/Header';

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
            <main className="mx-auto w-full max-w-[1240px] px-4 pb-14 pt-7 sm:px-6 lg:px-8">
              {children}
            </main>
            <footer className="mx-auto w-full max-w-[1240px] px-4 pb-12 sm:px-6 lg:px-8">
              <div className="surface-panel px-6 py-7 sm:px-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-xl">
                    <div className="section-kicker">Care, verified</div>
                    <p className="mt-3 text-sm leading-7 text-ink-700">
                      Lanyard Pharmacy dispenses prescription-only medicines strictly after licensed
                      pharmacist review, with branch-level stock visibility and transparent order
                      updates from cart to handoff.
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3 md:text-right">
                    {[
                      ['PCN-licensed', 'Pharmacist oversight'],
                      ['NAFDAC', 'Registered medicines'],
                      ['Secure', 'Pickup or delivery'],
                    ].map(([label, sub]) => (
                      <div key={label} className="md:flex md:flex-col md:items-end">
                        <dt className="text-sm font-semibold text-ink-900">{label}</dt>
                        <dd className="mt-0.5 text-xs text-ink-700/70">{sub}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="mt-7 flex flex-col gap-2 border-t border-paper-200 pt-5 text-xs text-ink-700/70 sm:flex-row sm:items-center sm:justify-between">
                  <span>© {new Date().getFullYear()} Lanyard Pharmacy. All rights reserved.</span>
                  <span className="font-medium uppercase tracking-[0.18em] text-brand-700">
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
