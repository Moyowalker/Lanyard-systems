import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SITE_URL } from '@/lib/config';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Lanyard Pharmacy', template: '%s · Lanyard Pharmacy' },
  description:
    'A polished public-facing pharmacy brand site for branch discovery, services, FAQs, and a strong handoff into the customer store.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="relative min-h-screen overflow-x-hidden">
          <SiteHeader />
          <main className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
