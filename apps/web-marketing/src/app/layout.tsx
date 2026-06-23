import './globals.css';
import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { MarketingAnalytics } from '@/components/MarketingAnalytics';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { GA_MEASUREMENT_ID, SITE_URL } from '@/lib/config';
import { marketingWebsiteJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Lanyard Pharmacy', template: '%s · Lanyard Pharmacy' },
  description:
    'A polished public-facing pharmacy brand site for branch discovery, services, FAQs, and a strong handoff into the customer store.',
  keywords: [
    'Lanyard Pharmacy',
    'online pharmacy Nigeria',
    'branch pharmacy Lagos',
    'prescription pharmacy',
  ],
  alternates: {
    canonical: '/',
  },
  icons: { icon: '/logo.png', apple: '/logo.png' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    title: 'Lanyard Pharmacy',
    description:
      'Branch discovery, services, FAQs, contact, and a polished handoff into the Lanyard customer store.',
    siteName: 'Lanyard Pharmacy',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lanyard Pharmacy',
    description:
      'A polished public-facing pharmacy site with branch discovery, contact flow, and handoff into the customer store.',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <MarketingAnalytics measurementId={GA_MEASUREMENT_ID || undefined} />
        </Suspense>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingWebsiteJsonLd()) }}
        />
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
