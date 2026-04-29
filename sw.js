const CACHE = 'faith-os-xp-v1';
const ASSETS = ['./', './index.html', './styles.css', './data.js', './app.js', './icon.svg', './manifest.webmanifest', './assets/couple-wide.jpg', './assets/couple-close.jpg'];
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', (event) => { event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))); });
