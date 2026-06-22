import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Lanyard Pharmacy Console',
  icons: { icon: '/favicon.svg' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
