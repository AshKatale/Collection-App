/* Minimal service worker: lets the app shell open without a connection.
   - API calls and page navigations are never touched by the cache logic
     (money data must always come from the server).
   - Only hashed build files under /assets/ are cached (cache first).
   - Every failure falls back to the normal network, so the worker can never
     turn a slow/failed request into a stuck screen. */
const SHELL = 'collections-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Only hashed static build files; everything else (pages, /api, icons) goes straight to the network
  if (!url.pathname.startsWith('/assets/')) return;

  event.respondWith(
    caches
      .match(req)
      .then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const type = res.headers.get('content-type') || '';
            // never cache an HTML fallback served in place of a missing JS/CSS file
            if (res.ok && !type.includes('text/html')) {
              const copy = res.clone();
              caches.open(SHELL).then((cache) => cache.put(req, copy));
            }
            return res;
          })
      )
      .catch(() => fetch(req))
  );
});
