/* Kontor service worker — offline app shell. Fully self-hosted: no
   cross-origin requests. Bump CACHE when shipping changes so clients update. */
const CACHE = 'kontor-v1.2.0';

const SHELL = [
  './finance_dashboard.html',
  './privacy.html',
  './finance_dashboard.js',
  './storage.js',
  './applock.js',
  './i18n.js',
  './i18n-dict.js',
  './fonts.css',
  './manifest.webmanifest',
  './sources/finhub-etf-basics.js',
  './sources/finhub-income-tax.js',
  './sources/finhub-investment-tax.js',
  './sources/finhub-deductions.js',
  './icons/kontor-mark.svg',
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

// Allow the page to ask a waiting SW to activate immediately (used by the update flow).
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// App code (HTML/JS/CSS) that changes between releases is served network-first so a new
// version is picked up as soon as the device is online; cache is the offline fallback.
// Immutable assets (fonts/icons) stay cache-first — no need to revalidate them every load.
function isAppCode(url) {
  return /\.(html|js|css)$/.test(url.pathname) || url.pathname.endsWith('/');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // same-origin only

  if (req.mode === 'navigate' || isAppCode(url)) {
    // network-first: fresh code when online, cached copy when offline
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req).then((hit) => hit || caches.match('./finance_dashboard.html'))
      )
    );
    return;
  }

  // cache-first for immutable assets (fonts, icons): instant, revalidate-on-miss
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
