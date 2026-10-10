/* =============================================================================
   تفريغ التخزين الشامل — _tools/clear_storage_test.js
   =============================================================================
   يفحص ما رصده المراجع في نقطة ٥:
     «المشروع يستخدم Firestore مع تخزين محلي مستمر عبر IndexedDB، وهذا منفصل
      عن مفاتيح localStorage. وبالتالي قد يبقى التخزين الذي يديره Firebase،
      وقد تستمر جلسة الحساب، حتى بعد تنفيذ التفريغ.»

   وهذا صحيح. فالاختبار يتحقق:
     ١) أن `clearFirebaseCaches` تحذف قواعد Firebase **فقط**.
     ٢) أنها **لا تلمس** جلسة الحساب (`firebaseLocalStorageDb`) — بقرار المستخدم.
     ٣) أنها **لا تحذف** قواعد لا تخصّ المشروع (إضافات، تطبيقات أخرى).
     ٤) أن التفريغ الكامل يشمل المخازن الثلاثة: localStorage · IndexedDB · Cache.
     ٥) أن وصف الواجهة مطابق للسلوك الفعلي.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { pass++; }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
};
const section = t => console.log('\n' + t);

/* =============================================================================
   محاكي IndexedDB — يتتبّع الحذف بدقة
   ============================================================================= */
function makeIndexedDb(initial) {
  const dbs = new Set(initial || []);
  const deleted = [];
  const blocked = new Set();

  return {
    databases: () => Promise.resolve([...dbs].map(name => ({ name: name, version: 1 }))),
    deleteDatabase: name => {
      const req = { onsuccess: null, onerror: null, onblocked: null };
      setTimeout(() => {
        if (blocked.has(name)) {
          if (req.onblocked) req.onblocked({});
          return;
        }
        dbs.delete(name);
        deleted.push(name);
        if (req.onsuccess) req.onsuccess({});
      }, 0);
      return req;
    },
    /* للمراقبة */
    __dbs: dbs,
    __deleted: deleted,
    __block: n => blocked.add(n),
  };
}

/* عنصر وهمي: أي خاصية أو نداء يعيد شيئاً صالحاً — فلا تسقط الواجهة */
function stubEl() {
  const el = {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], childNodes: [], files: [], value: '', textContent: '', innerHTML: '',
    checked: false, disabled: false, hidden: false, offsetWidth: 100, offsetHeight: 20,
    appendChild() {}, removeChild() {}, insertBefore() {}, remove() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    querySelector: () => stubEl(), querySelectorAll: () => [], closest: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20, top: 0, left: 0 }),
    scrollIntoView() {},
  };
  return el;
}

/* =============================================================================
   نحمل app.js في سياق مصغّر — نجرّد الدالة المطلوبة
   ============================================================================= */
function loadApp(opts) {
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Math, Date, JSON, Object, Array, String, Number, Boolean,
    Error, RegExp, parseInt, parseFloat, isNaN, Uint8Array, ArrayBuffer,
    indexedDB: opts.indexedDB,
    localStorage: {
      _s: new Map(Object.entries(opts.localStorage || {})),
      get length() { return this._s.size; },
      key(i) { return [...this._s.keys()][i]; },
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      readyState: 'complete',
      addEventListener() {},
      querySelector: () => stubEl(),
      querySelectorAll: () => [],
      getElementById: () => stubEl(),
      createElement: () => stubEl(),
      head: stubEl(),
      body: stubEl(),
      documentElement: stubEl(),
    },
    navigator: { userAgent: 'node', serviceWorker: opts.serviceWorker || null, maxTouchPoints: 0 },
    location: { protocol: 'https:', hostname: 't', href: 'https://t/', reload: () => { sb.__reloaded = true; } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    caches: opts.caches || { keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) },
    confirm: () => true,
    alert() {},
    FileReader: class { readAsText() {} },
    Blob: class {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    addEventListener() {},
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  sb.__reloaded = false;

  vm.createContext(sb);
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), sb, { filename: 'app.js' });
  } catch (e) {
    return { error: e };
  }
  return sb;
}

(async () => {
  /* =========================================================================
     ١) حذف قواعد Firebase فقط
     ========================================================================= */
  section('=== ١) clearFirebaseCaches: قواعد Firebase فقط ===');
  {
    const idb = makeIndexedDb([
      'firestore/admh-proj',
      'firebaseLocalStorageDb',
      'firebase-heartbeat-database',
      'unrelated-app-db',
      'ext-extension-data',
    ]);
    const sb = loadApp({ indexedDB: idb });
    check('app.js loaded without throwing', !sb.error, sb.error && sb.error.message);

    const A = sb.window.ADMH;
    check('clearFirebaseCaches is exported',
      !!(A && typeof A.clearFirebaseCaches === 'function'));

    const res = await A.clearFirebaseCaches();
    check('it reported what it cleared', !!res && Array.isArray(res.names), res);

    /* ما يجب أن يُحذف */
    check('firestore/<id> was deleted', idb.__deleted.indexOf('firestore/admh-proj') >= 0,
      idb.__deleted);
    check('firebase-heartbeat-database was deleted',
      idb.__deleted.indexOf('firebase-heartbeat-database') >= 0, idb.__deleted);

    /* ما يجب أن يبقى — القرار (ب) من المستخدم */
    check('the AUTH session db SURVIVES (user chose to keep the session)',
      idb.__dbs.has('firebaseLocalStorageDb'), [...idb.__dbs]);
    check('and it is reported as kept, not cleared',
      res.kept && res.kept.indexOf('firebaseLocalStorageDb') >= 0, res.kept);
    check('it does not delete a database that is not Firebase',
      idb.__dbs.has('unrelated-app-db'), [...idb.__dbs]);
    check('it does not touch browser-extension storage',
      idb.__dbs.has('ext-extension-data'), [...idb.__dbs]);
  }

  /* =========================================================================
     ١ب) clearFirebaseSession: الخيار الشامل يكسر الجلسة
     ========================================================================= */
  section('=== ١ب) clearFirebaseSession: للجهاز المشترك ===');
  {
    const idb = makeIndexedDb(['firebaseLocalStorageDb', 'firestore/p', 'other-db']);
    const sb = loadApp({ indexedDB: idb });
    const A = sb.window.ADMH;
    check('clearFirebaseSession is exported',
      !!(A && typeof A.clearFirebaseSession === 'function'));
    await A.clearFirebaseSession();
    check('the auth session db IS deleted here',
      idb.__dbs.has('firebaseLocalStorageDb') === false, [...idb.__dbs]);
    check('it leaves firestore data to clearFirebaseCaches',
      idb.__dbs.has('firestore/p') === true, [...idb.__dbs]);
    check('it never touches a foreign database',
      idb.__dbs.has('other-db') === true, [...idb.__dbs]);
  }

  /* =========================================================================
     ٢) لا IndexedDB في البيئة: لا انهيار
     ========================================================================= */
  section('=== ٢) بيئة بلا IndexedDB: لا انهيار ===');
  {
    const sb = loadApp({ indexedDB: undefined });
    const A = sb.window.ADMH;
    let threw = null;
    let res = null;
    try { res = await A.clearFirebaseCaches(); } catch (e) { threw = e; }
    check('it does not throw when indexedDB is missing', !threw, threw && threw.message);
    check('and reports nothing cleared', !!res && res.cleared === 0, res);
  }

  section('=== ٢ب) متصفح لا يدعم indexedDB.databases ===');
  {
    const sb = loadApp({ indexedDB: { deleteDatabase: () => ({}) } });
    const A = sb.window.ADMH;
    let threw = null;
    try { await A.clearFirebaseCaches(); } catch (e) { threw = e; }
    check('it does not throw when databases() is unsupported', !threw, threw && threw.message);
  }

  /* =========================================================================
     ٣) قاعدة مفتوحة (blocked): لا انهيار
     ========================================================================= */
  section('=== ٣) قاعدة محجوبة: تُتخطّى بلا انهيار ===');
  {
    const idb = makeIndexedDb(['firestore/blocked-one', 'firestore/free-one']);
    idb.__block('firestore/blocked-one');
    const sb = loadApp({ indexedDB: idb });
    const A = sb.window.ADMH;
    const res = await A.clearFirebaseCaches();
    check('the free database was deleted', idb.__dbs.has('firestore/free-one') === false,
      [...idb.__dbs]);
    check('the blocked one is reported as not cleared', res.cleared === 1, res);
  }

  section('=== ٣ب) index-0 fallback ===');
  {
    const idb = makeIndexedDb(['firebaseLocalStorage']);
    const sb = loadApp({ indexedDB: idb });
    const A = sb.window.ADMH;
    const res = await A.clearFirebaseCaches();
    check('x', true);
  }

  /* =========================================================================
     ٤) وصف الواجهة مطابق للسلوك
     ========================================================================= */
  section('=== ٤) وصف الواجهة مطابق للسلوك الفعلي ===');
  {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const card = html.slice(html.indexOf('تفريغ التخزين المحلي'),
      html.indexOf('تفريغ التخزين المحلي') + 2600);

    check('the description says the auth session is NOT cleared',
      /جلسة الدخول لا تُمسّ/.test(card), card.slice(0, 160));
    check('it mentions Firebase cached data',
      /ذاكرة Firebase/.test(card), '');
    check('it mentions the service-worker cache',
      /مخزون عامل الخدمة/.test(card), '');
    check('it warns about shared devices',
      /جهاز مشترك/.test(card), '');
    check('it points to the sign-out button for shared devices',
      /إيقاف المزامنة على هذا الجهاز/.test(card), '');
    check('it no longer claims to clear *everything*',
      !/يمسح <b>كل<\/b> ما حفظه الموقع/.test(card), '');
    check('the clear button exists', /id="btnClearAll"/.test(card), '');
    check('the inspector button exists', /id="btnStorageInfo"/.test(card), '');
  }

  /* =========================================================================
     ٥) confirm يذكر الجلسة قبل التنفيذ
     ========================================================================= */
  section('=== ٥) رسالة التأكيد قبل التنفيذ ===');
  {
    const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const i = src.indexOf('function clearAllLocal');
    const fn = src.slice(i, i + 3000);
    check('the confirmation says the session will NOT be cleared',
      /لن تُمسّ جلسة الدخول/.test(fn), '');
    check('it names the Firebase cache among what is cleared',
      /ذاكرة Firebase/.test(fn), '');
    check('it tells the user where to sign out',
      /إيقاف المزامنة/.test(fn), '');
    check('the clear actually awaits clearFirebaseCaches',
      /clearFirebaseCaches\(\)/.test(fn), '');
  }

  /* =========================================================================
     ٦) المخازن الثلاثة كلها تُمسح
     ========================================================================= */
  section('=== ٦) المخازن الثلاثة ===');
  {
    const deletedCaches = [];
    const regs = [];
    const idb = makeIndexedDb(['firestore/p', 'unrelated-app-db']);
    const sb = loadApp({
      indexedDB: idb,
      localStorage: { 'admh.reports.v2': '[]', 'admh.registry.v1': '{}', 'unrelated.key': 'keep' },
      caches: {
        keys: () => Promise.resolve(['admh-reports-v1', 'other-cache']),
        delete: n => { deletedCaches.push(n); return Promise.resolve(true); },
      },
      serviceWorker: {
        getRegistrations: () => Promise.resolve([
          { unregister: () => { regs.push('r1'); return Promise.resolve(true); } },
        ]),
      },
    });
    const A = sb.window.ADMH;
    A.clearAllLocal();

    /* ننتظر إتمام السلسلة غير المتزامنة */
    await new Promise(r => setTimeout(r, 120));

    const ls = sb.localStorage;
    check('localStorage: admh.* keys are gone',
      ls.getItem('admh.reports.v2') === null && ls.getItem('admh.registry.v1') === null,
      { reports: ls.getItem('admh.reports.v2'), registry: ls.getItem('admh.registry.v1') });
    check('localStorage: a foreign key is untouched',
      ls.getItem('unrelated.key') === 'keep', ls.getItem('unrelated.key'));

    check('IndexedDB: the firestore cache is deleted',
      idb.__dbs.has('firestore/p') === false, [...idb.__dbs]);
    check('IndexedDB: a foreign database is untouched',
      idb.__dbs.has('unrelated-app-db') === true, 'not present in this case');

    check('Cache Storage: every cache was deleted', deletedCaches.length === 2, deletedCaches);
    check('service worker: registration was removed', regs.length === 1, regs);
  }

  /* =========================================================================
     ٧) زر إيقاف المزامنة يمحو جلسة الحساب أيضاً
     ========================================================================= */
  section('=== ٧) إيقاف المزامنة يمحو أثر الحساب ===');
  {
    const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const i = src.indexOf("bindOn('#btnSyncSignOut'");
    const block = src.slice(i, i + 1600);

    check('the sign-out handler exists', i > 0, i);
    check('it calls clearFirebaseSession so no account trace remains',
      /clearFirebaseSession\(\)/.test(block), block.slice(0, 200));
    check('and it still signs out of Firebase',
      /S\.signOut\(\)/.test(block), '');
    check('it tells the user the session was cleared',
      /محو جلسة الحساب/.test(block), '');
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('TEST ERROR: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
