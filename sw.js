/* MXP Planos — service worker: la app funciona sin internet una vez instalada */
var CACHE = 'mxp-v1';
var CORE = [
  './', 'index.html', 'css/app.css', 'js/symbols.js', 'js/app.js',
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
  if (e.request.method !== 'GET' || e.request.url.indexOf('http') !== 0) return;
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).then(function (res) {
        try {
          if (res && res.ok && e.request.url.indexOf(self.location.origin) === 0) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          }
        } catch (err) {}
        return res;
      });
    })
  );
});
