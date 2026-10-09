/* =============================================================================
   عامل الخدمة — تشغيل النظام بلا إنترنت
   ملاحظة: لا تُخزَّن أي بيانات تقارير هنا؛ البيانات في localStorage بالمتصفح.
   ============================================================================= */
const CACHE = 'admh-reports-v24.0.0';

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './sync.js',
  './options.js',
  /* منطق التقرير — ملفات مستقلة */
  './registry.js',
  './history.js',
  './report-model.js',
  './report-preview.js',
  './report-clipboard.js',
  './report-word.js',
  './report-print.js',
  './check.html',
  './manifest.webmanifest',
  './vendor/docx.umd.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

/* هل تصلح هذه الاستجابة للتخزين؟
   مهم مع Cloudflare Access: قد تُعاد صفحة تسجيل الدخول بدل الملف المطلوب،
   وتخزينها يُفسد التطبيق بلا إنترنت. لذا نتحقق من النوع والحالة. */
function cacheable(req, res) {
  if (!res || !res.ok) return false;
  if (res.status !== 200) return false;
  if (res.type !== 'basic') return false;
  /* صفحة تسجيل الدخول HTML بينما المطلوب سكربت أو صورة => لا تُخزَّن */
  const ct = res.headers.get('Content-Type') || '';
  const url = req.url.split('?')[0];
  if (/\.(js|mjs)$/.test(url)) return /javascript|ecmascript/i.test(ct);
  if (/\.(png|jpe?g|svg|webp|ico)$/.test(url)) return /^image\//i.test(ct);
  if (/\.webmanifest$/.test(url)) return /json|manifest/i.test(ct);
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      /* نضيف كل ملف على حدة حتى لا يُسقط ملف واحد التخزين كله */
      .then(cache => Promise.all(ASSETS.map(url =>
        fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }))
          .then(res => (cacheable({ url }, res) ? cache.put(url, res.clone()).catch(() => {}) : null))
          .catch(() => null)
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
          if (cacheable(req, res)) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* بقية الملفات.
     ---------------------------------------------------------------------
     مهم جداً — عطل حقيقي كان يحدث:
     كانت كل الملفات تُخدَم بـ«المخزّن أولاً»، ومعنى ذلك أن أي تعديل على
     options.js (أو أي ملف كود) **لا يصل إلى المتصفح أبداً** ما دام هناك
     نسخة مخزّنة قديمة — حتى بعد النشر. فتظهر قوائم المكتبة القديمة دائماً.

     القاعدة الآن:
       · ملفات الكود (js/css/html): **الشبكة أولاً** — لتصل التحديثات فوراً،
         مع الرجوع إلى المخزّن عند انقطاع الإنترنت.
       · الأصول الثابتة (الأيقونات، مكتبة docx): المخزّن أولاً — لا تتغير.
     --------------------------------------------------------------------- */
  /* ملفات الكود: نتجاهل معامل الإصدار (?v=) عند التمييز */
  const isCode = /\.(?:js|css|html)$/i.test(url.pathname) ||
                 url.pathname === '/' || url.pathname.endsWith('/');

  if (isCode) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (cacheable(req, res)) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (cacheable(req, res)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
