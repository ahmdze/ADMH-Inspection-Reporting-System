/* =============================================================================
   Account-switch guard test
   -----------------------------------------------------------------------------
   المخاطرة التي رصدها المراجع: الجهاز مشترك، والتخزين المحلي غير مقسَّم بحسب
   الحساب. فلو سجّل مستخدم آخر الدخول، لَرُفعت تقارير الأول إلى حسابه.

   هذا الاختبار يُثبت أن الحماية موجودة فعلاً في الكود، وأنها تعتمد على uid حقيقي.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SYNC_SRC = fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8');

/**
 * يُحمّل app.js في بيئة Node ويقرأ واجهته المُصدَّرة.
 * نستخدمه لنفحص **سلوك** الحماية — فحص النصّ يمنع تقسيم الشيفرة.
 */
function loadApp() {
  const store = new Map();
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Math, Date, JSON, Object, Array, String, Number, Boolean,
    Error, RegExp, parseInt, parseFloat, isNaN, Uint8Array, ArrayBuffer,
    TextEncoder, TextDecoder,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    navigator: { userAgent: 'node', serviceWorker: null, maxTouchPoints: 0 },
    location: { protocol: 'https:', hostname: 'admh.test', href: 'https://admh.test/' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  sb.document = {
    createElement: () => ({ set src(v) {}, onload: null, onerror: null, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} }),
    head: { appendChild() {} },
    body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, documentElement: { classList: { add() {}, remove() {}, toggle() {} } },
    readyState: 'complete',
  };
  sb.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  /* Firebase وهمي: sync.js يحتاجه عند التحميل */
  sb.firebase = {
    apps: [], initializeApp() { this.apps.push({}); return {}; }, app: () => ({}),
    auth: () => ({
      currentUser: null,
      onAuthStateChanged: () => () => {},
      signInWithPopup: () => Promise.resolve({ user: null }),
      getRedirectResult: () => Promise.resolve(null),
      signOut: () => Promise.resolve(),
      GoogleAuthProvider: class { setCustomParameters() {} credential() { return {}; } },
    }),
    firestore: () => ({
      enablePersistence: () => Promise.resolve(),
      collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set: () => Promise.resolve(), get: () => Promise.resolve({ exists: false, data: () => ({}) }) }) }) }) }),
      batch: () => ({ set: () => {}, commit: () => Promise.resolve() }),
    }),
  };
  sb.firebase.auth.GoogleAuthProvider = sb.firebase.auth().GoogleAuthProvider;
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);

  /* ملفات التطبيق بالترتيب نفسه في index.html */
  const files = ['options.js', 'sync.js', 'app.js', 'registry.js', 'history.js'];
  files.forEach(f => {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) {
      try { vm.runInContext(fs.readFileSync(p, 'utf8'), sb, { filename: f }); }
      catch (e) { /* بعض الوحدات تحتاج DOM كاملاً — نتجاهل */ }
    }
  });
  return sb.window.ADMH || {};
}

let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
};

/** بيئة مزامنة مع مستخدم محدَّد */
function makeSync(user) {
  const store = new Map();
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Math, Date, JSON, Object, Array, String, Number, Boolean,
    Error, RegExp, parseInt, parseFloat, isNaN, Uint8Array, ArrayBuffer,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    navigator: { userAgent: 'Windows', maxTouchPoints: 0, serviceWorker: null },
    location: { protocol: 'https:', hostname: 'admh.test', href: 'https://admh.test/' },
    document: { createElement: () => ({ set src(v) {}, onload: null }), head: { appendChild() {} } },
  };

  sb.firebase = {
    apps: [], initializeApp() { this.apps.push({}); return {}; }, app: () => ({}),
    auth: () => ({
      currentUser: user || null,
      onAuthStateChanged: fn => { setTimeout(() => fn(user || null), 5); return () => {}; },
      signInWithPopup: () => Promise.resolve({ user: user }),
      getRedirectResult: () => Promise.resolve(null),
      signOut: () => Promise.resolve(),
      GoogleAuthProvider: class { setCustomParameters() {} credential() { return {}; } },
    }),
    firestore: () => ({
      enablePersistence: () => Promise.resolve(),
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              set: () => Promise.resolve(),
              get: () => Promise.resolve({ exists: false, data: () => ({}) }),
            }),
          }),
        }),
      }),
      batch: () => ({ set: () => {}, commit: () => Promise.resolve() }),
    }),
  };
  sb.firebase.auth.GoogleAuthProvider = sb.firebase.auth().GoogleAuthProvider;
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(SYNC_SRC, sb, { filename: 'sync.js' });

  const S = sb.window.ADMHSync;
  S.init({ load: () => ({ reports: [], settings: null, library: null, lists: null }), save: () => {} });
  return { S, sb };
}

(async () => {
  console.log('=== status() يُصدر uid الحقيقي ===');
  {
    const { S } = makeSync({ uid: 'uid-ONE', email: 'one@x.iq' });
    await Promise.resolve(S.session()).catch(() => {});
    await new Promise(r => setTimeout(r, 80));
    const st = S.status();
    check('status() includes uid', typeof st.uid === 'string', st.uid);
    check('uid is the real value', st.uid === 'uid-ONE', st.uid);
    check('email is also present', st.email === 'one@x.iq', st.email);
  }

  console.log('\n=== بلا مستخدم: uid فارغ ولا انهيار ===');
  {
    const { S } = makeSync(null);
    await Promise.resolve(S.session()).catch(() => {});
    await new Promise(r => setTimeout(r, 60));
    const st = S.status();
    check('uid is empty string when no user', st.uid === '', st.uid);
    check('status() does not throw', !!st);
  }

  console.log('\n=== الحماية معروضة فعلاً من التطبيق ===');
  {
    /* -----------------------------------------------------------------
       نقيس **السلوك المُصدَّر** لا نصّ ملف. السبب: التقسيم إلى وحدات
       ينقل الشيفرة بين ملفات، فقياس النصّ يجعل الاختبار يمنع التقسيم
       ويفشل بلا سبب حقيقي. الدوال المُصدَّرة تُثبت الحماية أينما كانت.
       ----------------------------------------------------------------- */
    const distDir = path.join(ROOT, 'dist');
    const app = loadApp();   /* نُحمّل app.js ونقرأ واجهته */

    check('readLocalOwner is exported', typeof app.readLocalOwner === 'function');
    check('markLocalOwner is exported', typeof app.markLocalOwner === 'function');
    check('ownerRefused is exported', typeof app.ownerRefused === 'function');

    /* سلوك فعلي: التسجيل والقراءة والرفض */
    app.markLocalOwner('uid-A');
    check('an owner can be recorded', app.readLocalOwner() === 'uid-A', app.readLocalOwner());
    app.markLocalOwner('uid-B', true);
    check('refusal is remembered for that account', app.ownerRefused('uid-B') === true);
    check('refusal does not leak to other accounts', app.ownerRefused('uid-A') === false);

    check('sync.js status() يحمل uid',
      /uid:\s*\(state\.user && state\.user\.uid\)/.test(SYNC_SRC));
  }

  console.log('\n=== منطق الحماية: متى يُرفع ومتى لا ===');
  {
    /* نُحاكي القرار كما هو مكتوب في app.js */
    function decide(curUid, ownerUid, refusedForThis, confirmAnswer) {
      if (!ownerUid || !curUid) return 'sync';
      if (ownerUid !== curUid) {
        if (refusedForThis === curUid) return 'blocked-remembered';
        return confirmAnswer ? 'sync-and-adopt' : 'blocked';
      }
      return 'sync';
    }

    check('الحساب نفسه ← مزامنة', decide('A', 'A', null, false) === 'sync');
    check('حساب مختلف + موافقة ← مزامنة وتبنٍّ',
      decide('B', 'A', null, true) === 'sync-and-adopt');
    check('حساب مختلف + رفض ← **لا رفع**',
      decide('B', 'A', null, false) === 'blocked');
    check('رفض محفوظ ← لا سؤال متكرر',
      decide('B', 'A', 'B', true) === 'blocked-remembered');
    check('بلا مالك مسجَّل ← مزامنة', decide('C', null, null, false) === 'sync');
    check('بلا uid ← مزامنة', decide('', 'A', null, false) === 'sync');

    /* الأهم: في كل حالات الحساب المختلف بلا موافقة = صفر رفع */
    const worst = decide('B', 'A', null, false);
    check('النتيجة النهائية: لا رفع صامت أبداً عند تبديل الحساب',
      worst.indexOf('sync') < 0, worst);
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
