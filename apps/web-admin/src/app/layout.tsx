import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { AppShell } from '@/components/AppShell';
import { OfflinePosRegistration } from '@/components/OfflinePosRegistration';

export const metadata: Metadata = {
  title: 'Lanyard Pharmacy Console',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/logo.png', apple: '/logo.png' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <OfflinePosRegistration />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
