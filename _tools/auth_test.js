/* =============================================================================
   Auth tests — Google-only sign-in.
   Email/password was removed by explicit request, so these tests lock in:
     · connect() needs no arguments and always uses Google
     · popup is tried FIRST, even on phones (redirect broke when the installed
       PWA was reopened from the home-screen icon)
     · redirect is the fallback, with a real safety net
     · returning from redirect is detected even when getRedirectResult is empty
     · every failure produces an actionable Arabic message
   ============================================================================= */
const fs = require('fs'), path = require('path');
const vm = require('vm');
const { installGis } = require('./_gis_mock.js');

const EMBEDDED_PROJECT = 'admh-inspection-reporting-sys';

function makeEnv(opts) {
  opts = opts || {};
  const calls = { popup: 0, redirect: 0 };
  const auth = {
    currentUser: opts.currentUser || null,
    onAuthStateChanged(fn) { if (opts.currentUser) setTimeout(() => fn(opts.currentUser), 5); return () => {}; },
    signInWithPopup() {
      calls.popup++;
      if (opts.popupFails) { const e = new Error('popup failed'); e.code = opts.popupFails; return Promise.reject(e); }
      this.currentUser = { uid: 'uid-google', email: 'me@gmail.com' };
      return Promise.resolve({ user: this.currentUser });
    },
    signInWithRedirect() {
      calls.redirect++;
      /* Real browser: the page navigates away and this never settles.
         Resolving exercises the code's safety net instead. */
      return Promise.resolve();
    },
    getRedirectResult() {
      if (opts.redirectUser) return Promise.resolve({ user: { uid: 'uid-google', email: 'me@gmail.com' } });
      if (opts.redirectError) { const e = new Error('redirect failed'); e.code = opts.redirectError; return Promise.reject(e); }
      return Promise.resolve(null);
    },
    signInWithCredential(cred) {
      this.currentUser = { uid: 'uid-gis', email: 'me@gmail.com' };
      return Promise.resolve({ user: this.currentUser });
    },
    signOut() { this.currentUser = null; return Promise.resolve(); },
    GoogleAuthProvider: class {
      setCustomParameters() {}
      /* مطلوب لمسار Google Identity Services: تحويل رمز الهوية */
      credential(token) { return { __token: token }; }
    },
  };
  const firestore = {
    enablePersistence: () => Promise.resolve(),
    collection: () => ({
      doc: () => ({
        collection: () => ({
          get: () => Promise.resolve({ forEach: () => {}, docs: [] }),
          doc: () => ({ set: () => Promise.resolve(), get: () => Promise.resolve({ exists: false }) }),
        }),
        set: () => Promise.resolve(),
        get: () => Promise.resolve({ exists: false }),
      }),
    }),
    batch: () => ({ set: () => {}, commit: () => Promise.resolve() }),
  };
  const firebase = {
    apps: [], initializeApp() { firebase.apps.push({}); return {}; }, app: () => ({}),
    auth: () => auth, firestore: () => firestore,
  };
  firebase.auth.GoogleAuthProvider = auth.GoogleAuthProvider;

  const store = new Map();
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, Promise, Uint8Array, ArrayBuffer,
    Math, Date, JSON, Object, Array, String, Number, Boolean, Error, RegExp, parseInt, parseFloat, isNaN,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    navigator: {
      userAgent: opts.mobile ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' : 'Windows',
      maxTouchPoints: opts.mobile ? 5 : 0,
      serviceWorker: null,
    },
    innerWidth: opts.mobile ? 412 : 1280,
    location: { protocol: 'https:', hostname: 'admh.example.workers.dev', href: 'https://admh.example.workers.dev/' },
    firebase,
    document: { createElement: () => ({ set src(v) {}, onload: null, onerror: null }), head: { appendChild() {} } },
    _store: store,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  installGis(sb, { mode: 'ok' });   /* المعرّف مضمَّن: نوفر المحاكي */
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'sync.js'), 'utf8'), sb, { filename: 'sync.js' });
  /* هذا الملف يفحص مسار Firebase الاحتياطي، فتُعطَّل GIS فيه.
     اختبارات مسار Google Identity في popup_test.js */
  if (sb.window.ADMHSync.setGisEnabled) sb.window.ADMHSync.setGisEnabled(false);
  return { S: sb.window.ADMHSync, calls, sb, store };
}

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); } };

(async () => {
  console.log('=== embedded config / no setup needed ===');
  {
    const { S } = makeEnv();
    const c = S.embeddedConfig();
    check('embedded config resolves', !!c && c.projectId === EMBEDDED_PROJECT, c && c.projectId);
  }

  console.log('\n=== email/password fully removed ===');
  {
    const { S } = makeEnv();
    check('requestReset is gone', S.requestReset === undefined, typeof S.requestReset);
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'sync.js'), 'utf8');
    check('no signInWithEmailAndPassword', !/signInWithEmailAndPassword/.test(src));
    check('no createUserWithEmailAndPassword', !/createUserWithEmailAndPassword/.test(src));
    check('no sendPasswordResetEmail', !/sendPasswordResetEmail/.test(src));
    check('no anonymous fallback', !/signInAnonymously/.test(src));
  }

  console.log('\n=== connect() takes no credentials ===');
  {
    const { S, calls } = makeEnv();
    const cred = await S.connect();
    check('connected', S.isConnected() === true, S.status());
    check('email captured', cred.email === 'me@gmail.com', cred.email);
    check('popup was used', calls.popup === 1, calls);
  }

  console.log('\n=== popup is tried FIRST even on a phone ===');
  {
    const { S, calls } = makeEnv({ mobile: true });
    await S.connect();
    check('mobile still tries popup first', calls.popup === 1, calls);
    check('mobile did not redirect when popup worked', calls.redirect === 0, calls);
  }

  console.log('\n=== redirect only as fallback, with a safety net ===');
  {
    const { S, calls } = makeEnv({ mobile: true, popupFails: 'auth/popup-blocked' });
    let err = null;
    try { await S.connect(); } catch (e) { err = e; }
    check('falls back to redirect when popup is blocked', calls.redirect === 1, calls);
    check('does not hang silently', !!err, err && err.message);
  }
  {
    /* المستخدم أغلق النافذة بلا إتمام الدخول. نتحقق أولاً من الجلسة (فقد يكون
       الدخول نجح ثم أُغلقت النافذة)، وإن لم توجد ننتقل إلى إعادة التوجيه
       لأنه لا يبقى سبيل آخر. السلوك التفصيلي في popup_test.js */
    const { S, calls } = makeEnv({ popupFails: 'auth/popup-closed-by-user' });
    let err = null;
    try { await S.connect(); } catch (e) { err = e; }
    check('user-closed popup falls back to redirect', calls.redirect === 1, calls);
    check('and never hangs silently', !!err, err && err.message);
  }
  {
    const { S, calls } = makeEnv({ popupFails: 'auth/operation-not-supported-in-this-environment' });
    let err = null;
    try { await S.connect(); } catch (e) { err = e; }
    check('unsupported environment redirects', calls.redirect === 1, calls);
  }

  console.log('\n=== returning from Google redirect ===');
  {
    const { S } = makeEnv({ redirectUser: true });
    const user = await S.consumeRedirect();
    check('consumeRedirect returns the user', !!(user && user.email === 'me@gmail.com'), user && user.email);
    check('state marked connected', S.isConnected() === true, S.status());
  }
  {
    const { S } = makeEnv();
    const user = await S.consumeRedirect();
    check('no pending redirect resolves to null', user === null, user);
    check('no error recorded', !S.status().error, S.status().error);
  }
  {
    /* THE PHONE BUG: getRedirectResult yielded nothing, yet Firebase had the
       session persisted. We must still detect the sign-in. */
    const { S } = makeEnv({ currentUser: { uid: 'u1', email: 'persisted@gmail.com' } });
    const user = await S.consumeRedirect();
    check('detects a persisted session when getRedirectResult is empty',
      !!(user && user.email === 'persisted@gmail.com'), user && user.email);
  }
  {
    const { S } = makeEnv({ redirectError: 'auth/unauthorized-domain' });
    await S.consumeRedirect();
    const re = S.redirectError();
    const st = S.status();
    check('redirect error code is kept', !!(re && re.code === 'auth/unauthorized-domain'), re);
    check('error code exposed in status', st.errorCode === 'auth/unauthorized-domain', st.errorCode);
    check('friendly message names the fix', /Authorized domains/.test(st.error), st.error);
  }
  {
    const { S } = makeEnv({ redirectUser: true });
    await S.consumeRedirect();
    check('successful redirect clears the previous error', S.redirectError() === null, S.redirectError());
  }

  console.log('\n=== standalone page (no init) must still work ===');
  {
    const { S } = makeEnv();
    await S.connect();
    check('connect works without init()', S.isConnected() === true, S.status());
    let err = null;
    try { await S.syncNow(); } catch (e) { err = e; }
    check('syncNow works without init()', !err, err && err.message);
  }
  {
    const { S } = makeEnv({ redirectUser: true });
    const user = await S.consumeRedirect();
    check('consumeRedirect works without prior init()', !!(user && user.email), user && user.email);
  }

  console.log('\n=== every failure message tells the user what to do ===');
  {
    const cases = [
      { code: 'auth/unauthorized-domain', want: /Authorized domains/ },
      { code: 'auth/unauthorized-domain', want: /Add domain/ },
      { code: 'auth/operation-not-allowed', want: /Sign-in method|مُفعَّل/ },
      { code: 'auth/admin-restricted-operation', want: /Sign-in method/ },
      { code: 'auth/configuration-not-found', want: /Authentication/ },
      { code: 'auth/too-many-requests', want: /انتظر/ },
      { code: 'auth/network-request-failed', want: /اتصال|إنترنت/ },
      { code: 'auth/popup-blocked', want: /النوافذ|إعادة التوجيه|متصفح/ },
      { code: 'auth/internal-error', want: /متصفح|مضمّن|Chrome/ },
      { code: 'auth/web-storage-unsupported', want: /متصفح|Chrome|تخزين/ },
      { code: 'auth/account-exists-with-different-credential', want: /مزوّد/ },
    ];
    for (const c of cases) {
      const env = makeEnv({ popupFails: c.code });
      let err = null;
      try { await env.S.connect(); } catch (e) { err = e; }
      check(`${c.code} → actionable`, !!(err && c.want.test(err.message)), err && err.message);
    }
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('AUTH TEST ERROR', e); process.exit(1); });
