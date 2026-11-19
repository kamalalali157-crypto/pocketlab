/* sw.js — makes the site work offline (PWA)
   bump the version whenever you change a file so updates are downloaded */
const CACHE = 'pocketlab-v3';
const FILES = ['./', './index.html', './style.css', './experiments.js', './analysis.js', './chart.js',
  './sensors.js', './report.js', './app.js', './manifest.json', './icon.svg'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// network first; fall back to the cached copy when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
