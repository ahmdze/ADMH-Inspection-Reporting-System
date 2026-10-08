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

  /* ---------------------------------------------------------------------------
     إعدادات Firebase مضمّنة في الكود — لا حاجة لإدخالها من الواجهة.
     ملاحظة أمنية: هذه المفاتيح عامة بطبيعتها في تطبيقات الويب (تُرسل إلى المتصفح
     في كل الأحوال)، والحماية الفعلية تأتي من:
       1) قواعد أمان Firestore التي تربط كل قراءة/كتابة بـ uid المستخدم.
       2) قيود Authorized domains في لوحة Firebase.
     لا يجوز الاعتماد على سرّية هذه القيم وحدها.
     --------------------------------------------------------------------------- */
  const EMBEDDED_CONFIG = {
    apiKey: "AIzaSyCNpfAxYshsxLsEFVxlbKgNyIvOJpvo3io",
    authDomain: "admh-inspection-reporting-sys.firebaseapp.com",
    projectId: "admh-inspection-reporting-sys",
    storageBucket: "admh-inspection-reporting-sys.firebasestorage.app",
    messagingSenderId: "744885015267",
    appId: "1:744885015267:web:8680b5671f503f992b2bd6",

    /* -------------------------------------------------------------------------
       معرّف عميل Google — مضمَّن حتى لا يحتاج المستخدم لإدخاله يدوياً.
       يُستخدم لـ Google Identity Services: هو المسار الذي يعمل على الهاتف،
       لأن إعادة توجيه Firebase تعتمد على تخزين الطرف الثالث الذي يحجبه
       كروم على أندرويد.

       ملاحظة أمنية: هذا المعرّف **عام بطبيعته** — يُرسل إلى المتصفح في كل
       الأحوال، تماماً مثل مفاتيح Firebase أعلاه. الحماية الفعلية تأتي من:
         1) Authorized JavaScript origins في Google Cloud Console (نطاقك فقط).
         2) قواعد أمان Firestore في Firebase.
       لذلك لا بأس بتضمينه، ولا حاجة لسرّية العميل (Client Secret) إطلاقاً.
       ------------------------------------------------------------------------- */
    googleClientId: "744885015267-gp8dnfvsdk08vl712hpot371fndn1886.apps.googleusercontent.com",
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

  /* ===========================================================================
     Google Identity Services (GIS)
     ---------------------------------------------------------------------------
     لماذا؟ إعادة توجيه Firebase تعتمد على «تخزين الطرف الثالث» بين نطاقك و
     firebaseapp.com، وكروم على أندرويد يحجب ذلك افتراضياً. النتيجة: تُكمل
     Google الدخول لكن النتيجة لا تصل إلى موقعك أبداً — وهذا ما كان يحدث.

     GIS يعمل من نطاقك نفسه ويعيد «رمز هوية» (ID token) مباشرةً، فنحوّله إلى
     جلسة Firebase بـ signInWithCredential. لا تخزين طرف ثالث إطلاقاً.

     يحتاج: Google OAuth Client ID (نوع Web) من Google Cloud Console،
     مع إضافة نطاقك في Authorized JavaScript origins.
     =========================================================================== */
  const GIS_SRC = 'https://accounts.google.com/gsi/client';

  /** معرّف عميل Google — مضمَّن أو محفوظ من الواجهة */
  /** معرّف عميل Google — مضمَّن أو محفوظ من الواجهة.
   *  setGoogleClientId('') لا يمسح المضمَّن، لذا نستخدم علماً صريحاً
   *  يتيح للاختبارات تعطيل المسار المضمَّن وفحص مسار Firebase الاحتياطي. */
  let gisDisabled = false;
  function googleClientId() {
    if (gisDisabled) return '';
    /* نضمن وجود الإعدادات حتى لو لم تُستدعَ init بعد (صفحة الفحص، أو
       نداء مبكر من الواجهة). الإعدادات مضمَّنة فالتهيئة رخيصة. */
    if (!cfg) cfg = resolveConfig();
    const c = (cfg && cfg.googleClientId) || '';
    if (c) return String(c).trim();
    try { return String(localStorage.getItem(LS_GCLIENT) || '').trim(); } catch (e) { return ''; }
  }
  function setGisEnabled(on) { gisDisabled = !on; }
  function setGoogleClientId(id) {
    const v = String(id || '').trim();
    if (!cfg) cfg = resolveConfig();
    if (cfg) cfg.googleClientId = v;      /* في الذاكرة */
    try { localStorage.setItem(LS_GCLIENT, v); } catch (e) {}
    /* لا نستدعي saveConfig هنا: الإعدادات مضمّنة، وتمرير undefined يمسحها.
       معرّف فارغ يعني «عُد إلى المضمَّن» فنُعيد تفعيل المسار المضمَّن. */
    gisDisabled = !v && !!(EMBEDDED_CONFIG && EMBEDDED_CONFIG.googleClientId);
    return v;
  }
  function hasGoogleClientId() { return !!googleClientId(); }

  let gisPromise = null;
  /** تحميل مكتبة Google Identity Services مرة واحدة */
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

  /* ---------------------------------------------------------------------------
     تجهيز مسبق لـ Google Identity Services.
     ---------------------------------------------------------------------------
     مهم: يجب أن يُنفَّذ requestAccessToken داخل تفعيل نقرة المستخدم مباشرةً.
     إن انتظرنا تحميل المكتبات أولاً، يضيع التفعيل فيحوّله Chrome إلى إعادة
     توجيه كاملة — وهذا ما كان يحدث على الهاتف (نافذة ثم انتقال).
     لذلك نُجهّز المكتبة والعميل مسبقاً، ويصبح الطلب عند النقر فورياً.
     --------------------------------------------------------------------------- */
  let gisClient = null;      /* عميل الرمز المُهيَّأ */
  let gisClientCid = '';     /* المعرّف الذي بُني به */
  let prepPromise = null;    /* وعد التجهيز المسبق */

  /** يُنشئ عميل الرمز ويُخزّنه (يُستدعى من التجهيز المسبق أو عند الحاجة) */
  function ensureGisClient(cid) {
    if (gisClient && gisClientCid === cid) return gisClient;
    const oauth2 = global.google && global.google.accounts && global.google.accounts.oauth2;
    if (!oauth2) {
      const e = new Error('مكتبة Google Identity غير محمّلة');
      e.code = 'gis/not-ready';
      throw e;
    }
    gisClientCid = cid;
    gisClient = oauth2.initTokenClient({
      client_id: cid,
      scope: 'openid email profile',
      /* نضع نداءً افتراضياً يُستبدل عند كل محاولة */
      callback: () => {},
    });
    return gisClient;
  }

  /** تجهيز مسبق: Firebase + مكتبة Google + عميل الرمز */
  function prepareGoogle() {
    const cid = googleClientId();
    if (!cid) return Promise.resolve(false);
    if (prepPromise) return prepPromise;
    prepPromise = initFirebase()
      .then(() => loadGis())
      .then(() => {
        /* نبني العميل فعلاً — لا نكتفي بتحميل المكتبة */
        ensureGisClient(cid);
        return true;
      })
      .catch(() => { prepPromise = null; return false; });
    return prepPromise;
  }
  function googleReady() { return !!gisClient && gisClientCid === googleClientId(); }

  /** يتحقق فعلياً أن النطاق مقبول لدى Google.
   *
   *  ملاحظة مهمة: نقطة /gsi/status لا تصلح لهذا الفحص (تُعيد 400 بلا معاملات)،
   *  فكانت تُعطي إنذاراً كاذباً. الطريقة الحقيقية: نهيّئ Google Identity
   *  Services فعلاً بـ client_id وننتظر error_callback — فإن لم يأتِ خطأ
   *  خلال مدة قصيرة فالنطاق مسجَّل والمكتبة تعمل.
   */
  function verifyGisOrigin() {
    const cid = googleClientId();
    if (!cid) return Promise.resolve({ ok: false, reason: 'no-client', message: 'لم يُضبط معرّف عميل Google' });

    return loadGis().then(() => {
      return new Promise(resolve => {
        let settled = false;
        const finish = r => { if (!settled) { settled = true; resolve(r); } };

        /* إن وصل خطأ صريح، فهو السبب الحقيقي */
        const timer = setTimeout(() => {
          /* لا خطأ = النطاق مسجَّل والمكتبة مهيّأة */
          finish({ ok: true, message: 'مكتبة Google مهيّأة والنطاق مقبول' });
        }, 2500);

        try {
          global.google.accounts.id.initialize({
            client_id: cid,
            callback: () => {},          /* لا نستخدم زر Google — يكفينا التهيئة */
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

  /**
   * يبدأ طلب رمز Google **فوراً** من العميل المُهيَّأ مسبقاً.
   * ---------------------------------------------------------------------------
   * مهم جداً: هذه الدالة يجب أن تُستدعى داخل تفعيل نقرة المستخدم مباشرةً.
   * فهي لا تنتظر أي وعد — تُسند النداء ثم تطلب الرمز في نفس المهمة، فيبقى
   * الطلب نافذة منبثقة لا إعادة توجيه كاملة. الانتظار هنا هو ما كان يجعل
   * Chrome يحوّل النافذة إلى انتقال كامل على الهاتف.
   * ---------------------------------------------------------------------------
   */
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

      /* مهلة واسعة: المستخدم قد يتأخر في اختيار الحساب */
      const timer = setTimeout(() => {
        finish(reject, (() => {
          const e = new Error('لم يكتمل الدخول. أعد المحاولة واختر حسابك.');
          e.code = 'auth/timeout';
          return e;
        })());
      }, 120000);

      /* نُسند النداء ثم نطلب الرمز — بلا أي انتظار */
      gisClient.callback = resp => {
        clearTimeout(timer);
        if (!resp || resp.error) {
          const e = new Error(resp && resp.error_description
            ? resp.error_description
            : 'لم يتم اختيار حساب Google.');
          e.code = 'auth/' + ((resp && resp.error) || 'cancelled');
          finish(reject, e);
          return;
        }
        if (!resp.id_token) {
          const e = new Error('لم يُعِد Google رمز الهوية. أضف نطاقك في Authorized JavaScript origins.');
          e.code = 'gis/no-id-token';
          finish(reject, e);
          return;
        }
        /* نحوّل رمز Google إلى جلسة Firebase.
           نلفّ التحويل بـ try لأن بعض نسخ المكتبة قد لا تُوفّر
           provider.credential — فنُظهر سبباً واضحاً بدل خطأ غامض. */
        try {
          const provider = googleProvider();
          if (typeof provider.credential !== 'function') {
            const e = new Error('نسخة مكتبة Firebase لا تدعم تحويل رمز Google. حدّث الصفحة وأعد المحاولة.');
            e.code = 'auth/operation-not-supported-in-this-environment';
            throw e;
          }
          const cred = provider.credential(resp.id_token);
          fb.auth.signInWithCredential(cred).then(c => {
            finish(resolve, { user: (c && c.user) || c });
          }).catch(err => {
            clearTimeout(timer);
            finish(reject, err);
          });
        } catch (convErr) {
          clearTimeout(timer);
          finish(reject, convErr);
        }
      };

      try {
        gisClient.requestAccessToken();
      } catch (err) {
        clearTimeout(timer);
        const e = new Error('تعذّر بدء الدخول من Google: ' + (err && err.message ? err.message : err));
        e.code = 'gis/init-failed';
        finish(reject, e);
      }
    });
  }

  /**
   * الدخول عبر Google Identity Services (المسار الكامل: تجهيز ثم طلب).
   * للطلبات التي لا تحتاج تفعيل نقرة فوري.
   */
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
        const e = new Error('تعذّر تجهيز الدخول من Google: ' + (initErr && initErr.message));
        e.code = 'gis/init-failed';
        throw e;
      }
      setState({ busy: true, error: '', errorCode: '' });
      return startGisRequest();
    });
  }

  /** تحميل Firebase SDK (مُخزَّن مؤقتاً) */
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

  /* --------------------------------------------------- إعدادات المزامنة */
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
      /* معرّف عميل Google (Google Identity Services) — يُحفظ مع الإعدادات */
      googleClientId: String(raw.googleClientId || '').trim(),
    };
  }

  /**
   * يقبل لصق كائن firebaseConfig كما ينسخه المستخدم من لوحة Firebase،
   * أو سلسلة JSON، أو قيم الحقول المنفصلة.
   */
  function parseConfigInput(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    // JSON مباشر
    try { return normalizeConfig(JSON.parse(s)); } catch (e) {}
    // كائن JS مكتوب يدوياً: { apiKey: "...", projectId: "...", ... }
    const obj = {};
    const re = /([A-Za-z_][\w]*)\s*:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(s))) obj[m[1]] = m[2];
    const norm = normalizeConfig(obj);
    if (norm) return norm;
    // key=value لكل سطر
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
  /** يستخدم الإعدادات المضمّنة دائماً؛ أي إعدادات محفوظة سابقاً تُتجاهل. */
  function resolveConfig() {
    const embedded = normalizeConfig(EMBEDDED_CONFIG);
    if (embedded) return embedded;
    return normalizeConfig(jread(LS_CONF, null)); /* احتياطي للاختبارات */
  }

  /* -------------------------------------------------- تهيئة Firebase */
  function initFirebase() {
    return loadFirebase().then(firebase => {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      fb.app = firebase.app();
      fb.auth = firebase.auth();
      fb.db = firebase.firestore();
      // يعمل بلا إنترنت ويزامن عند العودة
      try { fb.db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
      return fb;
    });
  }

  /* ---------------------------------------------------------------------------
     ملاحظة: أُزيل الدخول بالبريد وكلمة المرور نهائياً بطلب صريح.
     الطريقة الوحيدة للدخول هي حساب Google.
     --------------------------------------------------------------------------- */

  /** إيجاد مزوّد Google بأمان: firebase.auth.GoogleAuthProvider في نسخة compat */
  function googleProvider() {
    const g = global.firebase;
    const P = (g && g.auth && g.auth.GoogleAuthProvider)
           || (fb.auth && fb.auth.GoogleAuthProvider)
           || (g && g.auth && g.auth.GoogleAuthProvider);
    if (typeof P !== 'function') {
      const e = new Error('مزوّد الدخول بحساب Google غير متاح في هذه النسخة من المكتبة');
      e.code = 'auth/operation-not-supported-in-this-environment';
      throw e;
    }
    const provider = new P();
    if (provider.setCustomParameters) provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  /** هل نستخدم إعادة التوجيه بدل النافذة المنبثقة؟
   *  نعم على أجهزة اللمس كلها، لأن Safari على iOS يحجب نتيجة إعادة التوجيه
   *  إذا بدأت العملية من نافذة منبثقة. وحتى iPad يظهر كسطح مكتب في بعض
   *  الإصدارات، لذا نكشف اللمس أيضاً. */
  function preferRedirect() {
    try {
      const ua = (global.navigator && global.navigator.userAgent) || '';
      if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua)) return true;
      if (global.navigator && global.navigator.maxTouchPoints > 1) return true;
      if (global.innerWidth && global.innerWidth < 768) return true;
      /* تذكّر أن النافذة المنبثقة فشلت سابقاً على هذا الجهاز */
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

  /* ---------------------------------------------------------------------------
     الدخول بحساب Google — الطريقة الوحيدة.
     أُزيل الدخول بالبريد وكلمة المرور بطلب صريح.

     الأولوية: النافذة المنبثقة (popup) دائماً، حتى على الهاتف.
     السبب: إعادة التوجيه تنكسر عند إعادة فتح التطبيق المثبَّت من أيقونة
     الشاشة الرئيسية — يعود المستخدم ولا شيء يحدث. المنبثقة تعمل في Chrome.
     إعادة التوجيه خطة بديلة، مع استرجاع قوي للجلسة بعد العودة.
     --------------------------------------------------------------------------- */
  function signInGoogle() {
    if (!cfg) cfg = resolveConfig();
    if (!cfg) return Promise.reject(new Error('لم تُضبط إعدادات المزامنة'));

    /* -----------------------------------------------------------------
       المسار المفضَّل: Google Identity Services إن كان معرّف العميل مضبوطاً.
       يعمل من نطاقنا بلا تخزين طرف ثالث، ولذلك ينجح على الهاتف.
       ----------------------------------------------------------------- */
    const cid = googleClientId();
    if (cid) {
      return signInWithGis(cid).catch(err => {
        const code = (err && err.code) || '';
        /* إن فشل GIS لسبب قابل للتجاوز، ننتقل إلى مسار Firebase المعتاد.
           الإلغاء وعدم اختيار حساب من هذه الأسباب أيضاً. */
        const retryable =
          code === 'gis/init-failed' || code === 'gis/not-ready' ||
          code === 'auth/timeout' || code === 'auth/cancelled' ||
          code === 'auth/access_denied' || code === 'auth/popup_closed' ||
          /id-token/i.test(code);
        if (!retryable) throw err;
        return signInWithFirebaseGoogle();
      });
    }

    /* بلا معرّف عميل: مسار Firebase المعتاد */
    return signInWithFirebaseGoogle();
  }

  /** مسار Firebase المعتاد: نافذة منبثقة ثم إعادة توجيه */
  function signInWithFirebaseGoogle() {
    return initFirebase().then(() => {
      const provider = googleProvider();
      setState({ busy: true, error: '', errorCode: '' });

      /* خطة بديلة: إعادة توجيه كاملة للصفحة */
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

      /* -----------------------------------------------------------------
         المنبثقة أولاً.
         نقطة مهمة: أحياناً يُغلق المستخدم النافذة *بعد* نجاح الدخول، فيصل
         الوعد مرفوضاً بـ popup-closed-by-user بينما الجلسة محفوظة فعلاً.
         لذلك لا نُصدّق الفشل قبل أن نتحقق من الجلسة.
         ----------------------------------------------------------------- */
      return fb.auth.signInWithPopup(provider).then(cred => {
        if (cred && cred.user) return cred;
        /* الوعد نجح بلا مستخدم: ننتظر الجلسة */
        return waitForSession(3000).then(u => {
          if (u) return { user: u };
          const e = new Error('لم تظهر جلسة الدخول بعد إغلاق النافذة. أعد المحاولة.');
          e.code = 'auth/no-session-after-popup';
          throw e;
        });
      }).catch(err => {
        const code = (err && err.code) || '';

        /* هل نجح الدخول فعلاً رغم رسالة الفشل؟ (نافذة أُغلقت بعد النجاح) */
        const recover = () => waitForSession(2500).then(u => (u ? { user: u } : null));

        return recover().then(found => {
          if (found) return found;                       /* الدخول ناجح فعلاً */

          /* فشل حقيقي: نجرّب إعادة التوجيه إن كانت مجدية */
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

  /** ينتظر ظهور جلسة محفوظة بعد العودة من إعادة التوجيه.
   *  Firebase يحفظ الجلسة تلقائياً، فانتظارها أكثر موثوقية من الاعتماد
   *  على getRedirectResult وحدها — وهذا ما كان يفشل على الهاتف. */
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

  /* آخر خطأ من إعادة التوجيه — تعرضه صفحة الفحص للتشخيص */
  let lastRedirectError = null;
  function redirectError() { return lastRedirectError; }

  /** يعالج العودة من Google.
   *  لا نعتمد على getRedirectResult وحدها (كانت تفشل على الهاتف)، بل:
   *    ١) نقرأ getRedirectResult ونلتقط أي خطأ حقيقي منها
   *    ٢) ثم ننتظر الجلسة المحفوظة — Firebase يحفظها، وهذا يكفي للدخول */
  function consumeRedirect() {
    if (!cfg) cfg = resolveConfig();
    if (!cfg) return Promise.resolve(null);
    /* نهيّئ Firebase إن لم يكن مهيّأً بعد (صفحة الفحص تستدعي هذا مباشرة) */
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
        /* مهلة قصيرة: الجلسة المحفوظة تظهر عادةً خلال أجزاء من الثانية */
        return waitForSession(2500);
      });
    });
  }

  /* إعادة تعيين كلمة المرور أُزيلت: لا كلمات مرور في النظام إطلاقاً */

  function signOut() {
    if (!fb.auth) return Promise.resolve();
    return fb.auth.signOut().then(() => setState({ connected: false, user: null }));
  }

  /* ------------------------------------------------- مسارات البيانات */
  function reportsCol() { return fb.db.collection('users').doc(state.user.uid).collection('reports'); }
  function settingsDoc() { return fb.db.collection('users').doc(state.user.uid).collection('meta').doc('settings'); }
  function pullsCol() { return fb.db.collection('users').doc(state.user.uid).collection('meta'); }

  /* ---------------------------------------------------------------------------
     الخطّافات الافتراضية.
     وجودها يسمح باستخدام وحدة المزامنة وحدها (مثل صفحة الفحص) بلا الحاجة
     إلى تهيئة من التطبيق. كان غيابها يمنع المزامنة في صفحة الفحص.
     --------------------------------------------------------------------------- */
  function defaultHooks() {
    return {
      load: () => ({ reports: [], settings: null, library: null, lists: null }),
      save: () => {},
    };
  }

  /** يضمن تثبيت الخطّافات قبل أي عملية (يُستدعى من connect/syncNow).
   *  يقبل خطّافات صريحة، وإلا استخدم الافتراضية. */
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
    // دفعات من 400 (حد Firestore 500 عملية)
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
        // الحمولة الكاملة تُحفظ داخل الحقل data لتُسترجع كما هي
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
  /**
   * مزامنة ثنائية الاتجاه:
   *   سحب ← دمج (الأحدث يفوز) ← دفع
   * hooks.load()  : () => { reports, settings, library }
   * hooks.save()  : ({ reports, settings, library }) => void
   */
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
      const merged = [];

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

      /* دمج الإعدادات والمكتبة: الأحدث يفوز.
         ملاحظة مهمة: ما يُدفع هو الناتج المدموج لا القيم المحلية،
         وإلا فإن جهازاً جديداً بلا إعدادات يطمس إعدادات السحابة. */
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

        /* دفع التقارير التي هي أحدث محلياً أو غير موجودة في السحابة */
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
  /** النطاق الحالي كما يجب إضافته في Firebase (بلا مسار) */
  function currentDomain() {
    try {
      if (typeof location !== 'undefined' && location.hostname) return location.hostname;
    } catch (e) {}
    return '';
  }

  /** خطأ برسالة عربية واضحة، مع الحفاظ على رمز الخطأ الأصلي للتشخيص */
  function taggedError(orig, friendly) {
    const e = new Error(friendly);
    if (orig && orig.code) e.code = orig.code;
    if (orig && orig.message && orig.message !== friendly) e.rawMessage = orig.message;
    if (orig && orig.name) e.name = orig.name;
    return e;
  }

  /** رسائل خطأ عملية: كل واحدة تقول ما يجب فعله بالضبط في لوحة Firebase */
  function friendlyError(err) {
    const code = (err && err.code) || '';
    const msg = String((err && err.message) || '');

    if (code === 'auth/unauthorized-domain' || /unauthorized domain/i.test(msg)) {
      const d = currentDomain();
      const list = d ? `«${d}»` : 'نطاق موقعك';
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
      return 'هذا البريد مسجّل مسبقاً بمزوّد دخول آخر (Google غالباً). Firebase لا يسمح ببريد واحد على مزوّدين. الحل: استخدم «الدخول بحساب Google»، أو احذف الحساب من Firebase ← Authentication ← Users وأنشئه من جديد بكلمة مرور، أو استخدم بريداً آخر.';
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
      return 'البريد أو كلمة المرور غير صحيحة. إن كنت أنشأت الحساب بحساب Google فاستخدم زر «الدخول بحساب Google»، أو أرسل رابط إعادة تعيين كلمة المرور.';
    }
    if (code === 'auth/internal-error' || /internal-error/i.test(msg)) {
      return 'خطأ داخلي من Firebase. الأسباب الشائعة: النافذة فُتحت داخل تطبيق مضمّن (فيسبوك أو إنستغرام أو واتساب) أو نافذة تصفّح خاص. افتح الموقع في Chrome مباشرةً وأعد المحاولة — وإن كنت داخل التطبيق المثبَّت فافتح الموقع في Chrome مرة واحدة وسجّل الدخول، ثم افتح التطبيق وستجد الجلسة محفوظة.';
    }
    if (code === 'auth/operation-not-supported-in-this-environment') {
      return 'هذه البيئة لا تدعم نوافذ الدخول المنبثقة. افتح الموقع في متصفح كامل (Chrome أو Safari) خارج أي تطبيق مضمّن.';
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return 'أُغلقت نافذة الدخول قبل إتمام العملية. أعد المحاولة.';
    }
    if (code === 'auth/popup-blocked') {
      return 'المتصفح منع نافذة الدخول — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.';
    }
    if (code === 'auth/too-many-requests') {
      return 'محاولات كثيرة فاشلة. انتظر بضع دقائق ثم أعد المحاولة.';
    }
    if (code === 'auth/requires-recent-login') {
      return 'تحتاج إلى إعادة الدخول لتنفيذ هذه العملية.';
    }
    if (code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
      return 'رفض الخادم العملية — قواعد أمان Firestore غير منشورة. افتح: Firestore Database ← Rules ← الصق القواعد من README ← Publish.';
    }
    if (code === 'failed-precondition' || /requires an index/i.test(msg) || /database.*not.*exist|does not exist/i.test(msg)) {
      return 'قاعدة بيانات Firestore غير موجودة. افتح: Firebase ← Firestore Database ← Create database.';
    }
    if (code === 'unavailable' || code === 'auth/network-request-failed'
        || /offline/i.test(msg) || /network/i.test(msg)) {
      return 'تعذّر الوصول إلى Firebase — تحقق من اتصال الإنترنت. التطبيق يعمل محلياً وتُزامَن التغييرات لاحقاً.';
    }
    if (/firebase/i.test(msg) && /load|fetch|import/i.test(msg)) {
      return 'تعذّر تحميل مكتبة Firebase — تحقق من الاتصال بالإنترنت.';
    }
    return msg || 'خطأ غير معروف';
  }

  /* --------------------------------------------------------- الاتصال */
  /**
   * الدخول — بحساب Google فقط.
   * أُزيلت معاملات البريد وكلمة المرور بطلب صريح. تُقبل ولا تُستخدم،
   * للتوافق مع أي نداء قديم.
   */
  function connect() {
    /* الإعدادات مضمّنة، لذا نضمن وجودها حتى لو لم تُستدعَ init بعد
       (مثل صفحة الفحص المستقلة). ونضمن كذلك وجود الخطّافات. */
    if (!cfg) cfg = resolveConfig();
    if (!cfg) return Promise.reject(new Error('لم تُضبط إعدادات المزامنة'));
    ensureInit();
    setState({ busy: true, error: '', errorCode: '' });

    /* -----------------------------------------------------------------
       إن كان مسار Google Identity جاهزاً، نبدأ الطلب **فوراً في نفس
       المهمة** قبل أي وعد. هذا ضروري ليبقى داخل تفعيل نقرة المستخدم،
       وإلا حوّله Chrome إلى إعادة توجيه كاملة (ما كان يحدث على الهاتف).
       ----------------------------------------------------------------- */
    if (googleReady() && !gisDisabled) {
      const started = startGisRequest();
      /* نُكمل التجهيز (يعود فوراً لأنه جاهز) ثم ننتظر نتيجة الطلب */
      return prepareGoogle().then(() => started).catch(err => {
        const msg = friendlyError(err);
        setState({ busy: false, error: msg, errorCode: (err && err.code) || '' });
        throw taggedError(err, msg);
      }).then(cred => {
        const user = (cred && cred.user) || cred;
        if (!user) throw new Error('تعذّر تسجيل الدخول بحساب Google');
        state.user = user;
        lastRedirectError = null;
        setState({ connected: true, busy: false, user: user, error: '', errorCode: '' });
        return { uid: user.uid, email: user.email || '' };
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

  /* لا كلمات مرور: لا حاجة لإعادة تعيينها */

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
    /** الإعدادات المضمّنة — متاحة قبل init (تستخدمها صفحة الفحص) */
    embeddedConfig() { return resolveConfig(); },
    disconnect() { return signOut().then(() => clearConfig()); },
    reset() { clearConfig(); },
    connect,
    /** Google Identity Services: معرّف عميل Google (الحل للهاتف) */
    googleClientId,
    setGoogleClientId,
    hasGoogleClientId,
    /** يتحقق فعلياً أن النطاق مقبول لدى Google (بلا إنذارات كاذبة) */
    verifyGisOrigin,
    /** للاختبارات: تعطيل مسار Google Identity لفحص مسار Firebase الاحتياطي */
    setGisEnabled,
    /** تجهيز مسبق لمكتبة Google (حتى يبقى طلب الدخول داخل تفعيل النقرة) */
    prepareGoogle,
    /** هل المكتبة جاهزة للطلب الفوري؟ */
    googleReady,
    /** يُعالج نتيجة إعادة التوجيه عند العودة من Google */
    consumeRedirect,
    /** آخر خطأ من إعادة التوجيه (للتشخيص) */
    redirectError,
    /** يضمن تثبيت الخطّافات (للصفحات المستقلة) */
    ensureInit,
    signOut,
    syncNow,
    pushPullRequest,
    parseConfigInput,
    normalizeConfig,
    isConfigured: () => !!cfg,
    isConnected: () => !!state.connected,

    /** التهيئة: تُستدعى من app.js بعد جهوزية الواجهة.
     *  تُثبّت الخطّافات فوراً وتُحلّ ready في الحال، ثم تستأنف الجلسة في الخلفية
     *  عبر session — حتى لا تتعطّل الواجهة أو تحدث حالة سباق. */
    init(h) {
      hooks = h;
      if (readyResolve) { readyResolve(true); readyResolve = null; }
      state.device = deviceLabel();
      cfg = resolveConfig();
      state.configured = !!cfg;
      state.lastSync = jread(LS_LAST, null);
      emit();

      if (!cfg) { sessionPromise = Promise.resolve(false); return ready; }

      /* استئناف الجلسة إن كانت قائمة، دون إزعاج المستخدم.
         ملاحظة: onAuthStateChanged قد يستدعي الدالة فوراً وبشكل متزامن،
         لذا لا يجوز استدعاء unsub قبل إسنادها.
         ومهلة أمان حتى لا تتعلّق الواجهة إن تعذّر الوصول إلى Firebase. */
      sessionPromise = Promise.race([
        initFirebase().then(() => new Promise(resolve => {
          /* أولاً: هل عدنا من إعادة توجيه Google؟ */
          consumeRedirect().then(user => {
            if (user) { resolve(true); return; }
            let settled = false;
            const unsub = fb.auth.onAuthStateChanged(u => {
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

    /** يُحلّ فور تثبيت الخطّافات (لا ينتظر الشبكة) */
    ready,

    /** يُحلّ بعد انتهاء محاولة استئناف الجلسة، ويعيد true إن كان المستخدم متصلاً */
    session: () => sessionPromise,
  };

  global.ADMHSync = API;
})(typeof window !== 'undefined' ? window : globalThis);
