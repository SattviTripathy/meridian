/* Meridian service worker — offline app shell (synthetic data, no backend).
 * Navigations: network-first, so a deploy is picked up on the next visit.
 * Assets: stale-while-revalidate — serve cache instantly, refresh in the background. */
const CACHE = 'meridian-v6';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchAndCache(request) {
  return fetch(request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
    return res;
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache the map tiles / leaflet CDN — let them hit the network and fail gracefully offline.
  if (url.origin !== location.origin) return;

  // Navigations: network-first so new deploys land; fall back to the cached shell offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetchAndCache(e.request).catch(() =>
        caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Assets: stale-while-revalidate.
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetchAndCache(e.request).catch(() => hit);
      return hit || net;
    })
  );
});
