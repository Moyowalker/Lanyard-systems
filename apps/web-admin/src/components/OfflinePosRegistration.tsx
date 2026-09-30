'use client';

import { useEffect } from 'react';

export function OfflinePosRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const assets = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => {
            const parsed = new URL(url);
            return (
              parsed.origin === window.location.origin &&
              parsed.pathname.startsWith('/_next/static/')
            );
          });
        registration.active?.postMessage({ type: 'CACHE_POS', assets });
      })
      .catch(() => undefined);
  }, []);

  return null;
}
