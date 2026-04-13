const CACHE = "matlist-split-v1";
const ASSETS = [
  "js/firebase-config.js",
  "js/auth.js",
  "./",
  "./index.html",
  "./kopa-lista.html",
  "./lagg-till.html",
  "./recept.html",
  "./hantera.html",
  "./css/styles.css",
  "./js/shared.js",
  "./js/index.js",
  "./js/kopa-lista.js",
  "./js/lagg-till.js",
  "./js/recept.js",
  "./js/hantera.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
});
