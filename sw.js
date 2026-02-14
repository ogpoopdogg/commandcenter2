// Minimal Service Worker to enable PWA Installability
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('ec-command-store').then((cache) => cache.addAll([
      './',
      './index.html',
      './manifest.json',
      './icon-512.png'
    ]))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
