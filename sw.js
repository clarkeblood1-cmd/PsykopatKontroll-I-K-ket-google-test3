const CACHE_NAME = 'matlista-app-v10';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './cloud-sync.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isSameOrigin(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin;
  } catch (error) {
    return false;
  }
}

function shouldHandleAsAppShell(request) {
  const destination = request.destination || '';
  return request.mode === 'navigate' || ['script', 'style', 'manifest', 'image'].includes(destination);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !isSameOrigin(event.request) || !shouldHandleAsAppShell(event.request)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);

    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response && response.ok) {
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
