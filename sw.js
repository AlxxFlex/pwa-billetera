/* Bump this version whenever an App Shell file changes for a new release. */
const CACHE_PREFIX = 'mi-billetera-lite-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './storage.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg',
];
const APP_SHELL_URLS = new Set(
  APP_SHELL.map((path) => new URL(path, self.registration.scope).href),
);

self.addEventListener('install', (event) => {
  // Installation only succeeds once the complete interface is available offline.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Expenses stay in IndexedDB; only the public, same-origin App Shell is cached.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const cleanURL = new URL(url);
  cleanURL.search = '';
  cleanURL.hash = '';
  const isNavigation = request.mode === 'navigate'
    && (cleanURL.href === self.registration.scope
      || cleanURL.href === new URL('./index.html', self.registration.scope).href);

  if (!isNavigation && !APP_SHELL_URLS.has(cleanURL.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = isNavigation
      ? new URL('./index.html', self.registration.scope).href
      : cleanURL.href;
    const cached = await cache.match(key);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        // A full cache must not hide a successful response from the network.
        await cache.put(key, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      // This branch is only needed if browser storage was partially evicted.
      if (isNavigation) {
        const fallback = await cache.match(new URL('./', self.registration.scope).href);
        if (fallback) return fallback;
      }
      return new Response('Sin conexión. Abre la aplicación una vez con internet para prepararla.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
