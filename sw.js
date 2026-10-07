/* =============================================================================
   عامل الخدمة — تشغيل النظام بلا إنترنت
   ملاحظة: لا تُخزَّن أي بيانات تقارير هنا؛ البيانات في localStorage بالمتصفح.
   ============================================================================= */
const CACHE = 'admh-reports-v3.0.0';

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './sync.js',
  './manifest.webmanifest',
  './vendor/docx.umd.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      /* addAll يفشل كاملاً إذا سقط أي ملف، لذا نضيف كل ملف على حدة */
      .then(cache => Promise.all(ASSETS.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* التنقل: الشبكة أولاً مع الرجوع إلى النسخة المخزّنة عند انقطاع الاتصال */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* بقية الملفات: المخزّن أولاً ثم الشبكة */
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
