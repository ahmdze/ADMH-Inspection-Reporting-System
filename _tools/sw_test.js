/* =============================================================================
   Service-worker caching test
   -----------------------------------------------------------------------------
   العطل الذي كان يحدث: كل الملفات تُخدَم بـ«المخزّن أولاً»، فأي تعديل على
   options.js لا يصل إلى المتصفح أبداً — فتظهر قوائم المكتبة القديمة دائماً
   حتى بعد النشر. هذه الاختبارات تمنع عودة ذلك.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const vm = require('vm');

const SW = path.resolve(__dirname, '..', 'sw.js');
const SW_SRC = fs.readFileSync(SW, 'utf8');
const CACHE_NAME = /const CACHE\s*=\s*'([^']+)'/.exec(SW_SRC)[1];

let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
};

/* بيئة جديدة لكل حالة: تخزين وهمي + شبكة وهمية */
function makeEnv(seed, offline) {
  const log = [];
  const cached = new Map();

  const mkRes = (url, body) => ({
    ok: true, status: 200, url,
    headers: { get: () => 'application/javascript' },
    clone() { return mkRes(url, body); },
    text: () => Promise.resolve(body == null ? '' : body),
  });

  Object.keys(seed || {}).forEach(u => cached.set(u, mkRes(u, seed[u])));

  let fetchHandler = null;
  const self = {
    location: { origin: 'https://admh.test' },
    addEventListener: (t, fn) => { if (t === 'fetch') fetchHandler = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };

  const caches = {
    open: () => Promise.resolve({
      put: (req, res) => { cached.set(String(req.url || req), res); },
      addAll: () => Promise.resolve(),
    }),
    match: req => {
      const u = String(req.url || req);
      const hit = cached.get(u);
      if (hit) log.push({ kind: 'cache-hit', url: u });
      return Promise.resolve(hit || undefined);
    },
    keys: () => Promise.resolve([CACHE_NAME]),
    delete: () => Promise.resolve(true),
  };

  const fetchImpl = req => {
    const u = String(req.url || req);
    log.push({ kind: 'network', url: u });
    if (offline) return Promise.reject(new Error('offline'));
    return Promise.resolve(mkRes(u, 'FRESH'));
  };

  const sb = {
    self, caches, fetch: fetchImpl,
    URL, Promise, console, setTimeout, clearTimeout,
    Request: function (u) { this.url = u; },
    Response: function () {},
  };
  vm.createContext(sb);
  vm.runInContext(SW_SRC, sb, { filename: 'sw.js' });

  return {
    log,
    get handler() { return fetchHandler; },
    /** يُنفّذ حدث fetch ويعيد الوعد بالاستجابة */
    request(url, mode) {
      let responded = null;
      fetchHandler({
        request: { method: 'GET', url, mode: mode || 'no-cors' },
        respondWith: p => { responded = p; },
      });
      return responded;
    },
  };
}

const CODE = 'https://admh.test/options.js';
const APP = 'https://admh.test/app.js';
const ICON = 'https://admh.test/icons/icon-192.png';
const PAGE = 'https://admh.test/';

(async () => {
  console.log('=== ملفات الكود: الشبكة أولاً ===');
  {
    const e = makeEnv({ [CODE]: 'STALE OPTIONS' });
    const body = await e.request(CODE).then(r => r.text());
    check('options.js يُجلب من الشبكة لا من المخزّن', /FRESH/.test(body), body);
    check('وقد حدث طلب شبكي فعلاً',
      e.log.some(l => l.kind === 'network' && l.url === CODE), e.log);
  }
  {
    const e = makeEnv({ [APP]: 'STALE APP' });
    const body = await e.request(APP).then(r => r.text());
    check('app.js شبكة أولاً أيضاً', /FRESH/.test(body), body);
  }
  {
    const e = makeEnv();
    const body = await e.request(PAGE, 'navigate').then(r => r.text());
    check('التنقل بين الصفحات شبكة أولاً', /FRESH/.test(body), body);
  }

  console.log('\n=== الأصول الثابتة: المخزّن أولاً ===');
  {
    const e = makeEnv({ [ICON]: 'CACHED ICON' });
    const body = await e.request(ICON).then(r => r.text());
    check('الأيقونات تُخدَم من المخزّن (بلا طلب شبكي زائد)',
      /CACHED ICON/.test(body), body);
    check('ولم يحدث طلب شبكي لها',
      !e.log.some(l => l.kind === 'network' && l.url === ICON), e.log);
  }

  console.log('\n=== العمل بلا إنترنت: الرجوع إلى المخزّن ===');
  {
    const e = makeEnv({ [CODE]: 'OFFLINE OPTIONS' }, true);
    const body = await e.request(CODE).then(r => (r ? r.text() : ''));
    check('يعمل بلا إنترنت من النسخة المخزّنة', /OFFLINE OPTIONS/.test(body), body);
  }
  {
    const e = makeEnv({ [ICON]: 'OFFLINE ICON' }, true);
    const body = await e.request(ICON).then(r => (r ? r.text() : ''));
    check('والأصول الثابتة كذلك', /OFFLINE ICON/.test(body), body);
  }

  console.log('\n=== سلامة العامل ===');
  check('اسم المخزّن يحمل إصداراً', /^admh-reports-v\d/.test(CACHE_NAME), CACHE_NAME);
  check('skipWaiting موجود (ليستلم الجديد فوراً)', /skipWaiting/.test(SW_SRC));
  check('clients.claim موجود', /clients\.claim/.test(SW_SRC));
  check('الكود يُفحص بامتداده لا بمطابقة كاملة',
    /\\\.\(\?:js\|css\|html\)/.test(SW_SRC), 'isCode regex');
  check('options.js مُدرَج في قائمة التخزين المسبق',
    SW_SRC.indexOf("'./options.js'") >= 0);

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
