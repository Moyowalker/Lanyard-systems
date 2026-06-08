import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  title: { default: 'Lanyard Pharmacy', template: '%s · Lanyard Pharmacy' },
  description: 'Order medicines and upload prescriptions for pickup or delivery in Nigeria.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-gray-400">
            Lanyard Pharmacy — prescription-only medicines are dispensed only after pharmacist
            verification.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
