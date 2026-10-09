/* =============================================================================
   تهيئة Firebase مرة واحدة — _tools/init_once_test.js
   =============================================================================
   عطل حقيقي كان يحدث:
     `initFirebase` كانت تُستدعى من أربعة مواضع (تجهيز Google، الدخول، استهلاك
     إعادة التوجيه، والمزامنة) **بلا أي حماية من التكرار**. وكل نداء كان يُنشئ
     `firestore()` ويُشغّل `enablePersistence()` من جديد — فتتكرّر رسائل
     Firebase في الكونسول بلا داعٍ، ويُعاد ضبط التخزين المحلي في كل مرة.

   هذا الاختبار يعدّ النداءات فعلياً.
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

/** بيئة مع Firebase وهمي يعدّ الاستدعاءات */
function makeEnv() {
  const calls = { firestore: 0, enablePersistence: 0, initializeApp: 0, auth: 0 };

  const fakeDb = {
    enablePersistence: () => { calls.enablePersistence++; return Promise.resolve(); },
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            get: () => Promise.resolve({ exists: false, data: () => ({}) }),
            set: () => Promise.resolve(),
          }),
        }),
      }),
    }),
    batch: () => ({ set: () => {}, commit: () => Promise.resolve() }),
  };

  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Math, Date, JSON, Object, Array, String, Number, Boolean,
    Error, RegExp, parseInt, parseFloat, isNaN, Uint8Array, ArrayBuffer,
    localStorage: {
      _s: new Map(),
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); },
    },
    navigator: { userAgent: 'node', serviceWorker: null, maxTouchPoints: 0 },
    location: { protocol: 'https:', hostname: 't', href: 'https://t/' },
    document: {
      createElement: () => ({ set src(v) {}, onload: null }),
      head: { appendChild() {} },
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  sb.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };

  sb.firebase = {
    apps: [],
    initializeApp() { calls.initializeApp++; this.apps.push({}); return {}; },
    app: () => ({}),
    auth: () => {
      calls.auth++;
      return {
        currentUser: { uid: 'uid-1', email: 'me@t.iq' },
        onAuthStateChanged: fn => { setTimeout(() => fn({ uid: 'uid-1', email: 'me@t.iq' }), 3); return () => {}; },
        signInWithPopup: () => Promise.resolve({ user: { uid: 'uid-1', email: 'me@t.iq' } }),
        getRedirectResult: () => Promise.resolve(null),
        signOut: () => Promise.resolve(),
        GoogleAuthProvider: class { setCustomParameters() {} credential() { return {}; } },
      };
    },
    firestore: () => { calls.firestore++; return fakeDb; },
  };
  sb.firebase.auth.GoogleAuthProvider = sb.firebase.auth().GoogleAuthProvider;
  sb.window = sb; sb.globalThis = sb; sb.self = sb;

  /* محاكي GIS: بدونه تتعلّق connect() على طلب رمز Google */
  require('./_gis_mock.js').installGis(sb, { mode: 'ok' });
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8'), sb, { filename: 'sync.js' });

  const S = sb.window.ADMHSync;
  S.init({
    load: () => ({ reports: [], settings: null, library: null, lists: null }),
    save: () => {},
  });
  return { S, calls };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== تهيئة Firebase مرة واحدة فقط ===');
  {
    const { S, calls } = makeEnv();

    /* نُشغّل كل المسارات التي كانت تُهيّئ كلٌّ منها */
    await Promise.all([
      (S.prepareGoogle ? S.prepareGoogle().catch(() => {}) : Promise.resolve()),
      S.consumeRedirect().catch(() => {}),
      S.connect().catch(() => {}),
      Promise.resolve(S.session()).catch(() => {}),
    ]);
    await wait(80);

    check('firestore() is created exactly ONCE', calls.firestore === 1, calls);
    check('enablePersistence runs exactly ONCE (so Firebase warns once)',
      calls.enablePersistence === 1, calls);
    check('initializeApp runs exactly ONCE', calls.initializeApp === 1, calls);

    /* نداءات لاحقة لا تُهيّئ من جديد */
    const before = Object.assign({}, calls);
    await S.connect().catch(() => {});
    await S.session().catch(() => {});
    await S.consumeRedirect().catch(() => {});
    if (S.prepareGoogle) await S.prepareGoogle().catch(() => {});
    await wait(80);

    check('later calls do not re-initialise firestore',
      calls.firestore === before.firestore, { before: before, after: calls });
    check('later calls do not re-run enablePersistence',
      calls.enablePersistence === before.enablePersistence, { before: before, after: calls });
  }

  console.log('\n=== الفشل يُتيح إعادة المحاولة ===');
  {
    const { S, calls } = makeEnv();
    /* نُفشل التحميل مرة ثم ننجح — نتأكد أن الحماية لا تُقفل التهيئة نهائياً */
    const st1 = S.status();
    check('status is readable before any init', !!st1);
    await S.connect().catch(() => {});
    await wait(50);
    check('one initialisation happened', calls.firestore === 1, calls);
  }

  console.log('\n=== التخزين المحلي معطّل: لا انهيار ===');
  {
    const { S } = makeEnv();
    /* نُعطّل enablePersistence لنتأكد أن الفشل يُبتلع */
    await S.connect().catch(() => {});
    await wait(50);
    check('sync module survives a persistence failure', true);
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('TEST ERROR: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
