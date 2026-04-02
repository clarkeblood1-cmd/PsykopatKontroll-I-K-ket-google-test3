const CACHE_NAME = 'matlista-app-v75-paket-mangd-core';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './cloud-sync.js',
  './cloud-hooks.js',
  './appstore-ui.js',
  './household.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
      return response;
    }).catch(() => cached))
  );
});


self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'SHOW_NOTIFICATION') return;
  event.waitUntil(self.registration.showNotification(data.title || 'Matlista', {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './index.html' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
    for (const client of windowClients) {
      if ('focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  }));
});
