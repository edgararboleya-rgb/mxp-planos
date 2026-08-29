/* MXP Planos — service worker
   Estrategia: RED PRIMERO (siempre busca la versión nueva); la copia en
   caché se usa solo sin internet. Así cada actualización llega sola. */
var CACHE = 'mxp-v6';
var CORE = [
  './', 'index.html', 'css/app.css', 'js/config.js', 'js/logo.js',
  'js/symbols.js', 'js/app.js',
  'js/vendor/pdf.min.js', 'js/vendor/pdf.worker.min.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || e.request.url.indexOf(self.location.origin) !== 0) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      try {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
      } catch (err) {}
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (r) {
        if (r) return r;
        // solo la navegación (abrir la app) puede caer al index;
        // un .js/.css jamás — servir HTML como JS rompe la app a medias
        if (e.request.mode === 'navigate') return caches.match('index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
