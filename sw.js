/* JLPT 読解トレーナー Service Worker — App Shell 离线缓存 */
const CACHE = 'jlpt-reading-v10';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/api.js',
  './js/generator.js',
  './js/heatmap.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg',
  './icons/svg/book.svg',
  './icons/svg/ranking.svg',
  './icons/svg/settings.svg',
  './icons/svg/play.svg',
  './icons/svg/tick.svg',
  './icons/svg/cross.svg',
  './icons/svg/bookmark.svg',
  './icons/svg/trash.svg',
  './icons/svg/light-mode.svg',
  './icons/svg/dark-mode.svg',
  './icons/svg/display.svg',
  './icons/svg/connection.svg',
  './icons/svg/calendar.svg',
  './icons/svg/pencil.svg',
  './icons/svg/target.svg',
  './icons/svg/fire.svg',
  './icons/svg/arrow-left.svg',
  './icons/svg/arrow-right.svg',
  './icons/svg/arrow-left-02.svg',
  './icons/svg/arrow-right-02.svg',
  './icons/svg/trophy.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // AI API 请求绝不缓存
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 页面导航请求：缓存优先，网络失败时回退到缓存的入口页，避免离线白屏
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(hit =>
        hit || fetch(e.request).catch(() => caches.match('./'))
      )
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
