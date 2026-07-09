const CACHE = 'salud-pepe-v2';
const URLS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth-compat.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).catch(() => null))
  );
});
