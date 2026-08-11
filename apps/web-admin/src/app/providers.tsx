'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );

  useEffect(() => {
    const originalFetch = window.fetch;
    let redirecting = false;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status !== 401 || redirecting) return response;

      const body = (await response.clone().json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      if (body?.error?.code === 'SESSION_EXPIRED') {
        redirecting = true;
        client.clear();
        window.location.assign('/login?reason=session-expired');
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
