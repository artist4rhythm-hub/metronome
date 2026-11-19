/* 리듬 하우스 메트로놈 — 오프라인 저장
   새 버전을 올릴 때마다 아래 CACHE 이름의 숫자를 바꿔 주세요. */
const CACHE = 'rhm-v1-6-3';
const FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/legacy.js',
  './js/sounds.js',
  './js/engine.js',
  './js/notation.js',
  './js/viz.js',
  './js/firebase-config.js',
  './js/sync.js',
  './js/app.js',
  './js/songs.js',
  './js/vendor/qrcode.js',
  './privacy.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;
  // Firebase 설정 파일은 늘 새로 받아 옴 (설정을 바꿔 올리면 바로 적용되게)
  if (url.pathname.endsWith('/js/firebase-config.js')) {
    e.respondWith(fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
