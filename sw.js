/* FinDash service worker — offline app shell + runtime font cache.
   Bump CACHE when shipping changes so clients pick them up. */
const CACHE = 'findash-v3';

const SHELL = [
  './finance_dashboard.html',
  './finance_dashboard.js',
  './storage.js',
  './manifest.webmanifest',
  './sources/finhub-etf-basics.js',
  './sources/finhub-income-tax.js',
  './sources/finhub-investment-tax.js',
  './sources/finhub-deductions.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cross-origin (Google Fonts): stale-while-revalidate.
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((res) => {
            if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // Same-origin app shell: cache-first, fall back to network, then cache it.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./finance_dashboard.html'))
    )
  );
});
