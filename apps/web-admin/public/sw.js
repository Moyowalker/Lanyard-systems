const CACHE_NAME = 'lanyard-pos-shell-v1';
const POS_PATH = '/pos';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
    ]),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_POS') return;
  const urls = [POS_PATH, ...(Array.isArray(event.data.assets) ? event.data.assets : [])];
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        urls.map(async (url) => {
          const response = await fetch(url, { credentials: 'include' });
          if (response.ok) await cache.put(url, response);
        }),
      );
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      Promise.race([
        fetch(request),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Navigation timed out')), 4000),
        ),
      ])
        .then(async (response) => {
          if (response.ok && url.pathname === POS_PATH) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(POS_PATH, response.clone());
          }
          return response;
        })
        .catch(async () => {
          if (url.pathname !== POS_PATH) return Response.error();
          return (await caches.match(POS_PATH)) ?? Response.error();
        }),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/logo.png') {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      }),
    );
  }
});
