/* FinDash service worker — offline app shell. Fully self-hosted: no
   cross-origin requests. Bump CACHE when shipping changes so clients update. */
const CACHE = 'findash-v5';

const SHELL = [
  './finance_dashboard.html',
  './finance_dashboard.js',
  './storage.js',
  './fonts.css',
  './manifest.webmanifest',
  './sources/finhub-etf-basics.js',
  './sources/finhub-income-tax.js',
  './sources/finhub-investment-tax.js',
  './sources/finhub-deductions.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-180.png',
  // self-hosted fonts (latin + latin-ext)
  './fonts/fraunces-400-normal-latin.woff2',
  './fonts/fraunces-400-normal-latin-ext.woff2',
  './fonts/fraunces-500-normal-latin.woff2',
  './fonts/fraunces-500-normal-latin-ext.woff2',
  './fonts/fraunces-600-normal-latin.woff2',
  './fonts/fraunces-600-normal-latin-ext.woff2',
  './fonts/fraunces-700-normal-latin.woff2',
  './fonts/fraunces-700-normal-latin-ext.woff2',
  './fonts/spline-sans-400-normal-latin.woff2',
  './fonts/spline-sans-400-normal-latin-ext.woff2',
  './fonts/spline-sans-500-normal-latin.woff2',
  './fonts/spline-sans-500-normal-latin-ext.woff2',
  './fonts/spline-sans-600-normal-latin.woff2',
  './fonts/spline-sans-600-normal-latin-ext.woff2',
  './fonts/spline-sans-mono-400-normal-latin.woff2',
  './fonts/spline-sans-mono-400-normal-latin-ext.woff2',
  './fonts/spline-sans-mono-500-normal-latin.woff2',
  './fonts/spline-sans-mono-500-normal-latin-ext.woff2'
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
  // Everything is same-origin now: cache-first, fall back to network, then cache it.
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
