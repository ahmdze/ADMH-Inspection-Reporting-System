/* =============================================================================
   طبقة المزامنة السحابية (اختيارية) — Firebase Cloud Firestore
   -----------------------------------------------------------------------------
   المبادئ:
     1) التطبيق يعمل كاملاً بلا مزامنة. هذه الطبقة إضافة، لا شرط.
     2) لا يُحمَّل أي سكربت خارجي إلا عند تفعيل المزامنة صراحةً.
     3) كل البيانات في مسار المستخدم نفسه: users/{uid}/... — ولا يرى أحد بيانات غيره.
     4) الحذف يُعلَّم بـ _deleted (شاهد قبر) حتى ينتشر إلى الأجهزة الأخرى بدل أن يعود.
     5) عند التعارض يفوز الأحدث بحسب updatedAt.
   ============================================================================= */
'use strict';

(function (global) {
  const SDK = '10.12.2';
  const SCRIPTS = {
    app: `https://www.gstatic.com/firebasejs/${SDK}/firebase-app-compat.js`,
    auth: `https://www.gstatic.com/firebasejs/${SDK}/firebase-auth-compat.js`,
    db: `https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore-compat.js`,
  };
  const LS_CONF = 'admh.sync.config';
  const LS_LAST = 'admh.sync.last';
  const LS_GCLIENT = 'admh.sync.gclient';   /* معرّف عميل Google لـ Identity Services */

  const EMBEDDED_CONFIG = {
    apiKey: "AIzaSyCNpfAxYshsxLsEFVxlbKgNyIvOJpvo3io",
    authDomain: "admh-inspection-reporting-sys.firebaseapp.com",
    projectId: "admh-inspection-reporting-sys",
    storageBucket: "admh-inspection-reporting-sys.firebasestorage.app",
    messagingSenderId: "744885015267",
    appId: "1:744885015267:web:8680b5671f503f992b2bd6",
    googleClientId: "744885015267-fr614gdn063p4ieamisa2jm6d0nmkm4v.apps.googleusercontent.com",
  };

  const state = {
    configured: false,
    connected: false,
    busy: false,
    user: null,
    lastSync: null,
    error: '',
    errorCode: '',
    device: '',
  };

  let cfg = null;
  let hooks = null;
  let readyResolve = null;
  const ready = new Promise(res => { readyResolve = res; });
  let sessionPromise = Promise.resolve(false);
  let fb = { app: null, auth: null, db: null };
  let loadPromise = null;
  const listeners = [];

  /* ------------------------------------------------------------------ أدوات */
  function jread(key, fb_) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb_; }
    catch (e) { return fb_; }
  }
  function jwrite(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function deviceId() {
    let d = null;
    try { d = localStorage.getItem('admh.sync.device'); } catch (e) {}
    if (!d) {
      d = 'dev-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('admh.sync.device', d); } catch (e) {}
    }
    return d;
  }
  function deviceLabel() {
    const ua = (navigator && navigator.userAgent) || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    return (mobile ? 'هاتف' : 'حاسوب') + ' · ' + deviceId().slice(4, 8);
  }
  function emit() { listeners.forEach(fn => { try { fn(status()); } catch (e) {} }); }
  function setState(patch) { Object.assign(state, patch); emit(); }
  function status() {
    return {
      configured: state.configured, connected: state.connected, busy: state.busy,
      email: state.user && state.user.email ? state.user.email : (state.user ? 'مستخدم' : ''),
      lastSync: state.lastSync, error: state.error, errorCode: state.errorCode || '',
      device: state.device,
    };
  }

  /** تحميل سكربت خارجي مرة واحدة */
  function loadScript(src, onErr) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(onErr || 'تعذّر تحميل مكتبة Firebase — تحقق من الاتصال بالإنترنت'));
      document.head.appendChild(s);
    });
  }

  const GIS_SRC = 'https://accounts.google.com/gsi/client';

  let gisDisabled = false;
  function googleClientId() {
    if (gisDisabled) return '';
    if (!cfg) cfg = resolveConfig();
    const c = (cfg && cfg.googleClientId) || '';
    if (c) return String(c).trim();
    try { return String(localStorage.getItem(LS_GCLIENT) || '').trim(); } catch (e) { return ''; }
  }
  function setGisEnabled(on) { gisDisabled = !on; }
  function setGoogleClientId(id) {
    const v = String(id || '').trim();
    if (!cfg) cfg = resolveConfig();
    if (cfg) cfg.googleClientId = v;
    try { localStorage.setItem(LS_GCLIENT, v); } catch (e) {}
    
    // تصحيح الخطأ الأول: القيمة الفارغة تعيد التفعيل إذا كانت الإعدادات المضمّنة متوفرة
    gisDisabled = false;
    return v;
  }
  function hasGoogleClientId() { return !!googleClientId(); }

  let gisPromise = null;
  function loadGis() {
    if (global.google && global.google.accounts && global.google.accounts.oauth2) {
      return Promise.resolve(global.google);
    }
    if (gisPromise) return gisPromise;
    gisPromise = loadScript(GIS_SRC,
      'تعذّر تحميل مكتبة الدخول من Google. تحقق من الاتصال، أو أن السياسة الأمنية تسمح بـ accounts.google.com')
      .then(() => {
        if (!global.google || !global.google.accounts || !global.google.accounts.oauth2) {
          const e = new Error('مكتبة Google Identity لم تُهيَّأ بشكل صحيح.');
          e.code = 'gis/not-ready';
          throw e;
        }
        return global.google;
      })
      .catch(err => { gisPromise = null; throw err; });
    return gisPromise;
  }

  let gisClient = null;
  let gisClientCid = '';
  let gisClientMode = '';
  let prepPromise = null;
  let gisLastResponse = null;
  let gisLastError = null;

  const gisTraceLog = [];
  function gisTrace(step, detail) {
    gisTraceLog.push({
      t: (typeof performance !== 'undefined' && performance.now)
        ? Math.round(performance.now()) : Date.now(),
      step: step,
      detail: detail == null ? '' : String(detail).slice(0, 220),
    });
    if (gisTraceLog.length > 40) gisTraceLog.shift();
    return gisTraceLog;
  }
  function gisTraceAll() { return gisTraceLog.slice(); }
  function gisTraceClear() { gisTraceLog.length = 0; return gisTraceLog; }

  let popupClassicPreferred = false;
  try { popupClassicPreferred = localStorage.getItem('admh.sync.gismode') === 'classic'; } catch (e) {}
  function rememberGisMode(mode) {
    if (mode === 'classic') popupClassicPreferred = true;
    try { localStorage.setItem('admh.sync.gismode', mode); } catch (e) {}
    gisClient = null; gisClientCid = '';
  }

  function isStandalone() {
    try {
      if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator.standalone === true) return true;
    } catch (e) {}
    return false;
  }

  function gisDiagnostics() {
    return {
      response: gisLastResponse,
      error: gisLastError,
      mode: gisClientMode,
      standalone: isStandalone(),
      trace: gisTraceAll(),
      ready: googleReady(),
      hasClient: hasGoogleClientId(),
    };
  }

  function ensureGisClient(cid) {
    if (gisClient && gisClientCid === cid) return gisClient;
    const oauth2 = global.google && global.google.accounts && global.google.accounts.oauth2;
    if (!oauth2) {
      const e = new Error('مكتبة Google Identity غير محمّلة');
      e.code = 'gis/not-ready';
      throw e;
    }

    const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i
      .test((global.navigator && global.navigator.userAgent) || '');
    const fedcmFirst = !isMobileUA && !isStandalone() && !popupClassicPreferred;
    const opts = fedcmFirst
      ? [{ use_fedcm_for_prompt: true }, {}]
      : [{}, { use_fedcm_for_prompt: true }];

    let lastErr = null;
    let selectedOpt = null;
    for (const extra of opts) {
      try {
        gisClient = oauth2.initTokenClient(Object.assign({
          client_id: cid,
          scope: 'openid email profile',
          callback: () => {},
        }, extra));
        gisClientCid = cid;
        gisClientMode = extra.use_fedcm_for_prompt ? 'fedcm' : 'popup-classic';
        selectedOpt = extra;
        break;
      } catch (e) {
        lastErr = e;
        gisClient = null;
      }
    }
    if (!gisClient) {
      gisTrace('client:fail', (lastErr && lastErr.message) || 'فشل initTokenClient');
      const e = new Error('تعذّر تجهيز عميل Google Identity: ' + ((lastErr && lastErr.message) || ''));
      e.code = 'gis/init-failed';
      throw e;
    }
    gisTrace('client:ok', 'الوضع=' + gisClientMode + ' · fedcm=' + (!!(selectedOpt && selectedOpt.use_fedcm_for_prompt)));
    return gisClient;
  }

  function prepareGoogle() {
    const cid = googleClientId();
    if (!cid) { gisTrace('prepare', 'لا معرّف عميل'); return Promise.resolve(false); }
    if (prepPromise) return prepPromise;
    gisTrace('prepare:start', 'بدء تجهيز Firebase ومكتبة Google');
    prepPromise = initFirebase()
      .then(() => loadGis())
      .then(() => {
        ensureGisClient(cid);
        gisTrace('prepare:ok', 'العميل جاهز — الوضع: ' + gisClientMode);
        return true;
      })
      .catch(err => {
        gisTrace('prepare:fail', (err && err.message) || String(err));
        gisLastError = {
          code: (err && err.code) || 'gis/prepare-failed',
          message: (err && err.message) ? err.message : String(err),
          response: null,
        };
        prepPromise = null;
        return false;
      });
    return prepPromise;
  }
  function googleReady() { return !!gisClient && gisClientCid === googleClientId(); }

  function verifyGisOrigin() {
    const cid = googleClientId();
    if (!cid) return Promise.resolve({ ok: false, reason: 'no-client', message: 'لم يُضبط معرّف عميل Google' });

    return loadGis().then(() => {
      return new Promise(resolve => {
        let settled = false;
        const finish = r => { if (!settled) { settled = true; resolve(r); } };

        const timer = setTimeout(() => {
          finish({ ok: true, message: 'مكتبة Google مهيّأة والنطاق مقبول' });
        }, 2500);

        try {
          global.google.accounts.id.initialize({
            client_id: cid,
            callback: () => {},
            error_callback: err => {
              clearTimeout(timer);
              const type = (err && err.type) || '';
              let message = 'رفضت Google تهيئة الدخول من هذا النطاق.';
              if (type === 'invalid_client') {
                message = 'معرّف العميل غير صحيح — تأكد من نسخه كاملاً.';
              } else if (type === 'origin_mismatch' || /origin/i.test(type)) {
                message = 'النطاق غير مسجَّل في Authorized JavaScript origins.';
              } else if (type === 'idpiframe_initialization_failed' || /idpiframe/i.test(type)) {
                message = 'فشل تهيئة إطار Google — غالباً بسبب تخزين الطرف الثالث أو كوكيز محجوبة.';
              } else if (type) {
                message = 'رفضت Google التهيئة: ' + type + ' — النطاق أو المعرّف غير صحيح.';
              }
              finish({ ok: false, reason: type || 'gis-error', message: message });
            },
          });
        } catch (e) {
          clearTimeout(timer);
          finish({ ok: false, reason: 'init-failed', message: 'تعذّر تشغيل مكتبة Google: ' + (e && e.message) });
        }
      });
    }).catch(err => ({
      ok: false,
      reason: (err && err.code) || 'load-failed',
      message: (err && err.message) || 'تعذّر تحميل مكتبة Google Identity Services',
    }));
  }

  function startGisRequest() {
    return new Promise((resolve, reject) => {
      if (!gisClient) {
        const e = new Error('عميل Google غير مُهيَّأ');
        e.code = 'gis/not-ready';
        reject(e);
        return;
      }
      let done = false;
      const finish = (fn, v) => { if (!done) { done = true; fn(v); } };

      const watchedMode = gisClientMode;
      let popupRef = null;
      let restoreOpen = null;
      try {
        if (global.window && typeof global.window.open === 'function') {
          const origOpen = global.window.open;
          restoreOpen = () => { try { global.window.open = origOpen; } catch (e) {} };
          global.window.open = function (u, n, f) {
            const w = origOpen.apply(this, arguments);
            if (w && !popupRef) popupRef = w;
            return w;
          };
        }
      } catch (e) {}

      let wakeTimer = null, timer = null;
      const cleanupWatchers = () => {
        if (wakeTimer) clearInterval(wakeTimer);
        if (timer) clearTimeout(timer);
        if (restoreOpen) { restoreOpen(); restoreOpen = null; }
      };

      wakeTimer = setInterval(() => {
        if (done) { cleanupWatchers(); return; }
        if (popupRef && popupRef.closed && document.visibilityState === 'visible') {
          cleanupWatchers();
          if (watchedMode === 'fedcm') rememberGisMode('classic');
          const e = new Error(
            'أُغلقَت صفحة الدخول بلا نتيجة على هذا الجهاز.\n' +
            'جرّب مرة أخرى — سيستخدم النظام طريقة النافذة التقليدية.');
          e.code = 'gis/popup-closed-no-response';
          finish(reject, e);
        }
      }, 700);

      timer = setTimeout(() => {
        cleanupWatchers();
        finish(reject, (() => {
          const e = new Error('لم يكتمل الدخول. أعد المحاولة واختر حسابك.');
          e.code = 'auth/timeout';
          return e;
        })());
      }, 120000);

      gisClient.callback = resp => {
        cleanupWatchers();
        gisTrace('response', resp
          ? ('keys=' + Object.keys(resp).join(',') + ' · error=' + (resp.error || 'لا'))
          : 'استجابة فارغة');
        if (!resp || resp.error) {
          const errName = (resp && resp.error) || 'cancelled';
          if (/popup|closed/i.test(errName) && watchedMode === 'fedcm') {
            rememberGisMode('classic');
          }
          const e = new Error(resp && resp.error_description
            ? resp.error_description
            : 'لم يتم اختيار حساب Google.');
          e.code = (errName === 'popup_failed_to_open' || errName === 'popup_failed_to_open.')
            ? 'auth/popup-blocked'
            : 'auth/' + String(errName).replace(/_/g, '-');
          finish(reject, e);
          return;
        }
        if (watchedMode === 'popup-classic' && popupClassicPreferred !== true) {
          try { localStorage.setItem('admh.sync.gismode', 'classic'); } catch (e) {}
        } else if (watchedMode === 'fedcm') {
          try { localStorage.setItem('admh.sync.gismode', 'fedcm'); } catch (e) {}
        }

        const idToken = (resp && resp.id_token) || '';
        const accessToken = (resp && resp.access_token) || '';

        gisLastResponse = {
          hasAccessToken: !!accessToken,
          hasIdToken: !!idToken,
          scope: (resp && resp.scope) || '',
          keys: resp ? Object.keys(resp).join(',') : '(none)',
        };

        if (!idToken && !accessToken) {
          const e = new Error(
            'لم يُعِد Google أي رمز دخول.\n' +
            'تأكد أن نطاقك مضاف في Authorized JavaScript origins بحرفه وبالبروتوكول.\n' +
            'وصل من Google: ' + (gisLastResponse.keys || 'لا شيء'));
          e.code = 'gis/no-token';
          e.raw = gisLastResponse;
          finish(reject, e);
          return;
        }

        try {
          const provider = googleProvider();
          if (typeof provider.credential !== 'function') {
            const e = new Error('نسخة مكتبة Firebase لا تدعم تحويل رمز Google. حدّث الصفحة وأعد المحاولة.');
            e.code = 'auth/operation-not-supported-in-this-environment';
            throw e;
          }
          const cred = provider.credential(idToken || null, accessToken || null);
          gisTrace('credential', 'idToken=' + (idToken ? 'نعم' : 'لا') + ' · accessToken=' + (accessToken ? 'نعم' : 'لا'));
          fb.auth.signInWithCredential(cred).then(c => {
            gisTrace('signin:ok', (c && c.user && c.user.email) || 'مستخدم');
            finish(resolve, { user: (c && c.user) || c });
          }).catch(err => {
            cleanupWatchers();
            finish(reject, err);
          });
        } catch (convErr) {
          cleanupWatchers();
          finish(reject, convErr);
        }
      };

      try {
        gisTrace('request:start', 'الوضع=' + gisClientMode + ' · داخل تفعيل النقرة');
        gisClient.requestAccessToken();
      } catch (err) {
        gisTrace('request:threw', (err && err.message) || String(err));
        cleanupWatchers();
        gisLastError = {
          code: 'gis/request-threw',
          message: (err && err.message) ? err.message : String(err),
          response: gisLastResponse,
        };
        const e = new Error('تعذّر بدء الدخول من Google: ' + (err && err.message ? err.message : err));
        e.code = 'gis/init-failed';
        finish(reject, e);
      }
    });
  }

  function signInWithGis(clientId) {
    const cid = String(clientId || '').trim();
    if (!cid) return Promise.reject(new Error('لم يُضبط معرّف عميل Google'));

    return prepareGoogle().then(() => {
      if (!fb.auth) {
        const e = new Error('لم تُهيَّأ وحدة الدخول في Firebase — تحقق من إعدادات المزامنة.');
        e.code = 'auth/configuration-not-found';
        throw e;
      }
      if (!global.google || !global.google.accounts || !global.google.accounts.oauth2) {
        const e = new Error('مكتبة Google Identity غير محمّلة');
        e.code = 'gis/not-ready';
        throw e;
      }
      try {
        ensureGisClient(cid);
      } catch (initErr) {
        gisLastError = {
          code: 'gis/ensure-threw',
          message: (initErr && initErr.message) ? initErr.message : String(initErr),
          response: null,
        };
        const e = new Error('تعذّر تجهيز الدخول من Google: ' + (initErr && initErr.message));
        e.code = 'gis/init-failed';
        throw e;
      }
      setState({ busy: true, error: '', errorCode: '' });
      return startGisRequest();
    });
  }

  function loadFirebase() {
    if (loadPromise) return loadPromise;
    if (global.firebase && global.firebase.initializeApp) {
      loadPromise = Promise.resolve(global.firebase);
      return loadPromise;
    }
    loadPromise = loadScript(SCRIPTS.app)
      .then(() => loadScript(SCRIPTS.auth))
      .then(() => loadScript(SCRIPTS.db))
      .then(() => {
        if (!global.firebase) throw new Error('لم تُهيَّأ مكتبة Firebase');
        return global.firebase;
      })
      .catch(err => { loadPromise = null; throw err; });
    return loadPromise;
  }

  function normalizeConfig(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const apiKey = String(raw.apiKey || '').trim();
    const projectId = String(raw.projectId || '').trim();
    const appId = String(raw.appId || '').trim();
    if (!apiKey || !projectId || !appId) return null;
    if (/^(YOUR|ضع|xxx)/i.test(apiKey)) return null;
    return {
      apiKey, projectId, appId,
      authDomain: String(raw.authDomain || `${projectId}.firebaseapp.com`).trim(),
      storageBucket: String(raw.storageBucket || `${projectId}.appspot.com`).trim(),
      messagingSenderId: String(raw.messagingSenderId || '').trim(),
      googleClientId: String(raw.googleClientId || '').trim(),
    };
  }

  function parseConfigInput(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    try { return normalizeConfig(JSON.parse(s)); } catch (e) {}
    const obj = {};
    const re = /([A-Za-z_][\w]*)\s*:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(s))) obj[m[1]] = m[2];
    const norm = normalizeConfig(obj);
    if (norm) return norm;
    const obj2 = {};
    s.split(/[\n,;]+/).forEach(line => {
      const p = line.split(/[=:]/);
      if (p.length >= 2) obj2[p[0].trim()] = p.slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
    });
    return normalizeConfig(obj2);
  }

  function saveConfig(c) {
    cfg = c;
    jwrite(LS_CONF, c);
    setState({ configured: !!c, error: '' });
  }
  function clearConfig() {
    cfg = null;
    try { localStorage.removeItem(LS_CONF); } catch (e) {}
    setState({ configured: false, connected: false, user: null, error: '' });
  }
  function resolveConfig() {
    const embedded = normalizeConfig(EMBEDDED_CONFIG);
    if (embedded) return embedded;
    return normalizeConfig(jread(LS_CONF, null));
  }

  function initFirebase() {
    return loadFirebase().then(firebase => {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      fb.app = firebase.app();
      fb.auth = firebase.auth();
      fb.db = firebase.firestore();
      try { fb.db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
      return fb;
    });
  }

  function googleProvider() {
    const g = global.firebase;
    const P = (g && g.auth && g.auth.GoogleAuthProvider)
           || (fb.auth && fb.auth.GoogleAuthProvider);
    if (typeof P !== 'function') {
      const e = new Error('مزوّد الدخول بحساب Google غير متاح في هذه النسخة من المكتبة');
      e.code = 'auth/operation-not-supported-in-this-environment';
      throw e;
    }
    const provider = new P();
    if (provider.setCustomParameters) provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  function preferRedirect() {
    try {
      const ua = (global.navigator && global.navigator.userAgent) || '';
      if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua)) return true;
      if (global.navigator && global.navigator.maxTouchPoints > 1) return true;
      if (global.innerWidth && global.innerWidth < 768) return true;
      if (redirectPreferred) return true;
    } catch (e) {}
    return false;
  }

  let redirectPreferred = false;
  try { redirectPreferred = localStorage.getItem('admh.sync.redirect') === '1'; } catch (e) {}
  function rememberRedirect() {
    redirectPreferred = true;
    try { localStorage.setItem('admh.sync.redirect', '1'); } catch (e) {}
  }

  function signInGoogle() {
    if (!cfg) cfg = resolveConfig();
    if (!cfg) return Promise.reject(new Error('لم تُضبط إعدادات المزامنة'));

    const cid = googleClientId();
    if (cid) {
      return signInWithGis(cid).catch(gisErr => {
        gisLastError = {
          code: (gisErr && gisErr.code) || '',
          message: (gisErr && gisErr.message) || String(gisErr),
          response: gisLastResponse,
        };

        const code = (gisErr && gisErr.code) || '';
        const fallback = () => signInWithFirebaseGoogle().catch(() => { throw gisErr; });

        const displayFailure =
          code === 'gis/popup-closed-no-response' ||
          code === 'auth/popup_blocked' || code === 'auth/popup-blocked' ||
          code === 'auth/popup_closed' || code === 'auth/popup-closed-by-user' ||
          code === 'auth/cancelled-popup-request' ||
          code === 'auth/timeout';

        const userCancelled =
          code === 'auth/cancelled' || code === 'auth/access_denied' ||
          code === 'auth/access-denied';

        if (userCancelled) {
          return waitForSession(1200).then(u => {
            if (u) return { user: u };
            const e = new Error('أُلغيت عملية الدخول. اضغط «الدخول بحساب Google» وأكمل اختيار حسابك.');
            e.code = 'auth/cancelled';
            throw e;
          });
        }

        if (displayFailure && !fb.auth.currentUser) {
          try { ensureGisClient(cid); } catch (e) {}
          if (gisClient) {
            return startGisRequest().catch(retryErr => {
              gisLastError = {
                code: (retryErr && retryErr.code) || '',
                message: (retryErr && retryErr.message) || String(retryErr),
                response: gisLastResponse,
              };
              return fallback();
            });
          }
        }

        const retryable =
          code === 'gis/no-token' || code === 'gis/no-id-token' ||
          code === 'gis/init-failed' || code === 'gis/not-ready' ||
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/internal-error' ||
          displayFailure;

        if (retryable) return fallback();
        throw gisErr;
      });
    }

    return signInWithFirebaseGoogle();
  }

  function signInWithFirebaseGoogle() {
    return initFirebase().then(() => {
      const provider = googleProvider();
      setState({ busy: true, error: '', errorCode: '' });

      const goRedirect = () => {
        if (!fb.auth.signInWithRedirect) {
          const e = new Error('هذا المتصفح لا يدعم إعادة التوجيه. افتح الموقع في Chrome.');
          e.code = 'auth/operation-not-supported-in-this-environment';
          throw e;
        }
        rememberRedirect();
        return fb.auth.signInWithRedirect(provider).then(() => {
          const e = new Error('لم تكتمل إعادة التوجيه إلى Google. افتح الموقع في Chrome أو Safari مباشرةً.');
          e.code = 'auth/redirect-did-not-navigate';
          throw e;
        });
      };

      return fb.auth.signInWithPopup(provider).then(cred => {
        if (cred && cred.user) return cred;
        return waitForSession(3000).then(u => {
          if (u) return { user: u };
          const e = new Error('لم تظهر جلسة الدخول بعد إغلاق النافذة. أعد المحاولة.');
          e.code = 'auth/no-session-after-popup';
          throw e;
        });
      }).catch(err => {
        const code = (err && err.code) || '';
        const recover = () => waitForSession(2500).then(u => (u ? { user: u } : null));

        return recover().then(found => {
          if (found) return found;

          const fallbackable =
            code === 'auth/popup-blocked' ||
            code === 'auth/popup-closed-by-user' ||
            code === 'auth/cancelled-popup-request' ||
            code === 'auth/operation-not-supported-in-this-environment' ||
            code === 'auth/web-storage-unsupported' ||
            code === 'auth/internal-error';
          if (fallbackable && fb.auth.signInWithRedirect) return goRedirect();
          throw err;
        });
      });
    });
  }

  function waitForSession(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 6000);
    return new Promise(resolve => {
      const tick = () => {
        if (fb.auth && fb.auth.currentUser) {
          const u = fb.auth.currentUser;
          state.user = u;
          lastRedirectError = null;
          setState({ connected: true, busy: false, user: u, error: '', errorCode: '' });
          resolve(u);
          return;
        }
        if (Date.now() > deadline) { resolve(null); return; }
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  let lastRedirectError = null;
  function redirectError() { return lastRedirectError; }

  function consumeRedirect() {
    if (!cfg) cfg = resolveConfig();
    if (!cfg) return Promise.resolve(null);
    return initFirebase().then(() => {
      const fromRedirect = (fb.auth && fb.auth.getRedirectResult)
        ? fb.auth.getRedirectResult().then(res => {
            if (res && res.user) return res.user;
            return null;
          }).catch(err => {
            const code = (err && err.code) || '';
            if (code && code !== 'auth/no-auth-event') {
              const e = taggedError(err, friendlyError(err));
              lastRedirectError = { code: code, message: (err && err.message) || String(err) };
              setState({ busy: false, error: e.message, errorCode: code });
            }
            return null;
          })
        : Promise.resolve(null);

      return fromRedirect.then(user => {
        if (user) {
          state.user = user;
          lastRedirectError = null;
          setState({ connected: true, busy: false, user: user, error: '', errorCode: '' });
          return user;
        }
        return waitForSession(2500);
      });
    });
  }

  function signOut() {
    if (!fb.auth) return Promise.resolve();
    return fb.auth.signOut().then(() => setState({ connected: false, user: null }));
  }

  /* ------------------------------------------------- مسارات البيانات */
  function reportsCol() { return fb.db.collection('users').doc(state.user.uid).collection('reports'); }
  function settingsDoc() { return fb.db.collection('users').doc(state.user.uid).collection('meta').doc('settings'); }
  function pullsCol() { return fb.db.collection('users').doc(state.user.uid).collection('meta'); }

  function defaultHooks() {
    return {
      load: () => ({ reports: [], settings: null, library: null, lists: null }),
      save: () => {},
    };
  }

  function ensureInit(h) {
    if (h) hooks = h;
    if (!hooks) hooks = defaultHooks();
    if (readyResolve) { readyResolve(true); readyResolve = null; }
    return hooks;
  }

  /* --------------------------------------------------------- الدفع */
  function pushReports(reports) {
    if (!reports.length) return Promise.resolve({ pushed: 0 });
    let pushed = 0;
    const chunks = [];
    for (let i = 0; i < reports.length; i += 400) chunks.push(reports.slice(i, i + 400));
    return chunks.reduce((chain, chunk) => chain.then(() => {
      const batch = fb.db.batch();
      chunk.forEach(r => {
        const doc = {
          id: r.id,
          title: r.title || '',
          facilityName: r.facilityName || '',
          sector: r.sector || '',
          visitType: r.visitType || '',
          facilityKind: r.facilityKind || '',
          visitDate: r.visitDate || '',
          updatedAt: r.updatedAt || new Date().toISOString(),
          deleted: !!r._deleted,
          device: state.device,
        };
        doc.data = r._deleted ? null : JSON.parse(JSON.stringify(r, (k, v) => (k === '_deleted' ? undefined : v)));
        batch.set(reportsCol().doc(r.id), doc, { merge: true });
      });
      return batch.commit().then(() => { pushed += chunk.length; });
    }), Promise.resolve()).then(() => ({ pushed }));
  }

  function pushSettings(payload) {
    if (!payload) return Promise.resolve();
    return settingsDoc().set(Object.assign({}, payload, {
      updatedAt: new Date().toISOString(),
      device: state.device,
    }), { merge: true });
  }

  function pushPullRequest() {
    return pullsCol().doc('pullRequest').set({
      at: new Date().toISOString(),
      by: state.device,
      seen: false,
    }, { merge: true });
  }

  /* --------------------------------------------------------- السحب */
  function pullAll() {
    return reportsCol().get().then(snap => {
      const remote = [];
      snap.forEach(d => {
        const v = d.data() || {};
        if (v.deleted || !v.data) {
          remote.push({ id: d.id, _deleted: true, updatedAt: v.updatedAt || '' });
        } else {
          const rec = Object.assign({}, v.data, { id: d.id, updatedAt: v.updatedAt || v.data.updatedAt });
          remote.push(rec);
        }
      });
      return remote;
    });
  }

  function pullSettings() {
    return settingsDoc().get().then(d => (d.exists ? d.data() : null)).catch(() => null);
  }

  /* --------------------------------------------------------- مزامنة كاملة */
  function syncNow(opts) {
    opts = opts || {};
    ensureInit();
    if (!state.connected || !state.user) return Promise.reject(new Error('غير متصل بالمزامنة'));
    if (state.busy) return Promise.resolve({ skipped: true });
    setState({ busy: true, error: '' });

    return pullAll().then(remote => {
      const local = hooks.load();
      const localReports = (local.reports || []).slice();
      const byId = new Map();
      localReports.forEach(r => byId.set(r.id, r));

      let added = 0, updated = 0, removed = 0;

      remote.forEach(rem => {
        const loc = byId.get(rem.id);
        if (rem._deleted) {
          if (loc) { removed++; byId.delete(rem.id); }
          return;
        }
        if (!loc) { added++; byId.set(rem.id, rem); return; }
        const lt = Date.parse(loc.updatedAt || 0) || 0;
        const rt = Date.parse(rem.updatedAt || 0) || 0;
        if (rt > lt) { updated++; byId.set(rem.id, rem); }
      });

      const mergedReports = [...byId.values()];

      return pullSettings().then(remoteSettings => {
        const out = { reports: mergedReports };
        let settingsChanged = false;
        const remotePayload = (remoteSettings && remoteSettings.payload) ? remoteSettings.payload : null;
        const localAt = Date.parse((local.settings && local.settings.updatedAt) || 0) || 0;
        const remoteAt = Date.parse(remoteSettings && remoteSettings.updatedAt || 0) || 0;

        let mergedSettings = local.settings || null;
        let mergedLibrary = local.library || null;
        let mergedLists = local.lists || null;
        if (remotePayload && remoteAt > localAt) {
          mergedSettings = remotePayload.settings || mergedSettings;
          mergedLibrary = remotePayload.library || mergedLibrary;
          mergedLists = remotePayload.lists || mergedLists;
          out.settings = mergedSettings;
          out.library = mergedLibrary;
          out.lists = mergedLists;
          settingsChanged = true;
        }

        const toPush = mergedReports.filter(r => {
          const rem = remote.find(x => x.id === r.id);
          if (!rem) return true;
          const lt = Date.parse(r.updatedAt || 0) || 0;
          const rt = Date.parse(rem.updatedAt || 0) || 0;
          return lt > rt;
        });

        return pushReports(toPush)
          .then(() => pushSettings({
            payload: {
              settings: mergedSettings,
              library: mergedLibrary,
              lists: mergedLists,
            },
          }))
          .then(() => {
            hooks.save(out);
            const stamp = new Date().toISOString();
            jwrite(LS_LAST, stamp);
            setState({ busy: false, lastSync: stamp, error: '' });
            return { added, updated, removed, pushed: toPush.length, total: mergedReports.length, settingsChanged };
          });
      });
    }).catch(err => {
      const msg = friendlyError(err);
      setState({ busy: false, error: msg });
      throw taggedError(err, msg);
    });
  }

  function currentDomain() {
    try {
      if (typeof location !== 'undefined' && location.hostname) return location.hostname;
    } catch (e) {}
    return '';
  }

  function taggedError(orig, friendly) {
    const e = new Error(friendly);
    if (orig && orig.code) e.code = orig.code;
    if (orig && orig.message && orig.message !== friendly) e.rawMessage = orig.message;
    if (orig && orig.name) e.name = orig.name;
    return e;
  }

  function friendlyError(err) {
    const code = (err && err.code) || '';
    const msg = String((err && err.message) || '');

    if (code === 'auth/unauthorized-domain' || /unauthorized domain/i.test(msg)) {
      const d = currentDomain();
      return `هذا النطاق غير مصرّح به في Firebase.\n\nافتح: Firebase ← Authentication ← Settings ← Authorized domains ← Add domain\nوأضف هذا النطاق بالحرف:\n${d || '(انسخ اسم النطاق من شريط العنوان)'}\n\nملاحظة: أضف النطاق وحده بلا https:// ولا مسار.`;
    }
    if (code === 'auth/admin-restricted-operation' || /admin-restricted-operation/i.test(msg)) {
      return 'العملية مطلوبة غير مُفعَّلة في Firebase. افتح: Authentication ← Sign-in method، وفعّل الطريقة التي تستخدمها (Email/Password أو Google).';
    }
    if (code === 'auth/operation-not-allowed' || /operation-not-allowed/i.test(msg)) {
      return 'تسجيل الدخول بالبريد وكلمة المرور غير مُفعَّل. افتح: Authentication ← Sign-in method ← فعّل Email/Password.';
    }
    if (code === 'auth/configuration-not-found' || /configuration-not-found/i.test(msg)) {
      return 'لم تُهيَّأ Authentication بعد. افتح: Firebase ← Authentication ← Get started.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'هذا البريد مسجّل مسبقاً بمزوّد دخول آخر (Google غالباً). Firebase لا يسمح ببريد واحد على مزوّدين.';
    }
    if (code === 'auth/account-exists-with-different-credential') {
      return 'هذا البريد مسجّل بمزوّد دخول مختلف. استخدم طريقة الدخول التي أنشأت الحساب أصلاً.';
    }
    if (code === 'auth/weak-password') {
      return 'كلمة المرور ضعيفة — استخدم 6 أحرف على الأقل.';
    }
    if (code === 'auth/invalid-email') return 'صيغة البريد الإلكتروني غير صحيحة.';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential'
        || code === 'auth/invalid-login-credentials' || code === 'auth/user-not-found') {
      return 'البريد أو كلمة المرور غير صحيحة.';
    }
    if (code === 'auth/internal-error' || /internal-error/i.test(msg)) {
      return 'خطأ داخلي من Firebase. افتح الموقع في Chrome مباشرةً وأعد المحاولة.';
    }
    if (code === 'auth/operation-not-supported-in-this-environment') {
      return 'هذه البيئة لا تدعم نوافذ الدخول المنبثقة. افتح الموقع في متصفح كامل (Chrome أو Safari).';
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return 'أُغلقت نافذة الدخول قبل إتمام العملية. أعد المحاولة.';
    }
    if (code === 'auth/popup-blocked') {
      return 'المتصفح منع نافذة الدخول — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.';
    }
    if (code === 'gis/popup-closed-no-response') {
      return 'لم تكتمل نافذة الدخول على هذا الجهاز. النظام بدّل طريقة الدخول تلقائياً — اضغط الزر مرة أخرى.';
    }
    if (code === 'auth/too-many-requests') {
      return 'محاولات كثيرة فاشلة. انتظر بضع دقائق ثم أعد المحاولة.';
    }
    if (code === 'auth/requires-recent-login') {
      return 'تحتاج إلى إعادة الدخول لتنفيذ هذه العملية.';
    }
    if (code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
      return 'رفض الخادم العملية — قواعد أمان Firestore غير منشورة.';
    }
    if (code === 'failed-precondition' || /requires an index/i.test(msg) || /database.*not.*exist|does not exist/i.test(msg)) {
      return 'قاعدة بيانات Firestore غير موجودة.';
    }
    if (code === 'unavailable' || code === 'auth/network-request-failed'
        || /offline/i.test(msg) || /network/i.test(msg)) {
      return 'تعذّر الوصول إلى Firebase — تحقق من اتصال الإنترنت.';
    }
    if (/firebase/i.test(msg) && /load|fetch|import/i.test(msg)) {
      return 'تعذّر تحميل مكتبة Firebase — تحقق من الاتصال بالإنترنت.';
    }
    return msg || 'خطأ غير معروف';
  }

  /* --------------------------------------------------------- الاتصال */
  function connect() {
    if (!cfg) cfg = resolveConfig();
    if (!cfg) return Promise.reject(new Error('لم تُضبط إعدادات المزامنة'));
    ensureInit();
    setState({ busy: true, error: '', errorCode: '' });

    // تصحيح الخطأ الرابع: إرجاع الطلب المباشر فوراً بلا ربط بدالة prepareGoogle التكرارية
    if (googleReady() && !gisDisabled) {
      return startGisRequest().then(cred => {
        const user = (cred && cred.user) || cred;
        if (!user) throw new Error('تعذّر تسجيل الدخول بحساب Google');
        state.user = user;
        lastRedirectError = null;
        setState({ connected: true, busy: false, user: user, error: '', errorCode: '' });
        return { uid: user.uid, email: user.email || '' };
      }).catch(err => {
        const msg = friendlyError(err);
        setState({ busy: false, error: msg, errorCode: (err && err.code) || '' });
        throw taggedError(err, msg);
      });
    }

    return signInGoogle().then(cred => {
      const user = (cred && cred.user) || cred;
      if (!user) throw new Error('تعذّر تسجيل الدخول بحساب Google');
      state.user = user;
      lastRedirectError = null;
      setState({ connected: true, busy: false, user: user, error: '', errorCode: '' });
      return { uid: user.uid, email: user.email || '' };
    }).catch(err => {
      const msg = friendlyError(err);
      setState({ busy: false, error: msg, errorCode: (err && err.code) || '' });
      throw taggedError(err, msg);
    });
  }

  /* --------------------------------------------------------- الواجهة العامة */
  const API = {
    SDK_VERSION: SDK,
    status,
    onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    configure(text) {
      const c = parseConfigInput(text);
      if (!c) return { ok: false, error: 'لم أتعرّف على الإعدادات. الصق كائن firebaseConfig كاملاً من لوحة Firebase.' };
      saveConfig(c);
      return { ok: true, projectId: c.projectId };
    },
    getConfig() { return cfg; },
    embeddedConfig() { return resolveConfig(); },
    disconnect() { return signOut().then(() => clearConfig()); },
    reset() { clearConfig(); },
    connect,
    googleClientId,
    setGoogleClientId,
    hasGoogleClientId,
    verifyGisOrigin,
    setGisEnabled,
    prepareGoogle,
    googleReady,
    gisDiagnostics,
    consumeRedirect,
    redirectError,
    ensureInit,
    signOut,
    syncNow,
    pushPullRequest,
    parseConfigInput,
    normalizeConfig,
    isConfigured: () => !!cfg,
    isConnected: () => !!state.connected,

    init(h) {
      hooks = h;
      if (readyResolve) { readyResolve(true); readyResolve = null; }
      state.device = deviceLabel();
      cfg = resolveConfig();
      state.configured = !!cfg;
      state.lastSync = jread(LS_LAST, null);
      emit();

      if (!cfg) { sessionPromise = Promise.resolve(false); return ready; }

      sessionPromise = Promise.race([
        initFirebase().then(() => new Promise(resolve => {
          consumeRedirect().then(user => {
            if (user) { resolve(true); return; }
            let settled = false;
            // تصحيح الخطأ الثاني: تعريف المتغير مسبقاً لمنع السباق المتزامن
            let unsub;
            unsub = fb.auth.onAuthStateChanged(u => {
              if (settled) return;
              settled = true;
              if (typeof unsub === 'function') unsub();
              if (u) {
                state.user = u;
                setState({ connected: true, error: '' });
                resolve(true);
              } else resolve(false);
            });
          });
        })),
        new Promise(resolve => setTimeout(() => resolve(false), 3500)),
      ]).catch(err => { setState({ error: friendlyError(err) }); return false; });

      return ready;
    },

    ready,
    session: () => sessionPromise,
  };

  global.ADMHSync = API;
})(typeof window !== 'undefined' ? window : globalThis);