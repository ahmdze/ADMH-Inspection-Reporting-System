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
  };

  const state = {
    configured: false,
    connected: false,
    busy: false,
    user: null,
    lastSync: null,
    error: '',
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
      lastSync: state.lastSync, error: state.error, device: state.device,
    };
  }

  /** تحميل سكربت خارجي مرة واحدة */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('تعذّر تحميل مكتبة Firebase — تحقق من الاتصال بالإنترنت'));
      document.head.appendChild(s);
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

  /** الدخول: Google إن توفّر، وإلا بالبريد وكلمة المرور، وإلا مجهول */
  /**
   * الدخول بالبريد وكلمة المرور.
   *
   * قرار مهم: لا نُجرب إنشاء حساب إلا عند auth/user-not-found تحديداً.
   * كان الكود سابقاً يُنشئ حساباً عند أي فشل — بما فيه كلمة المرور الخاطئة —
   * فيظهر للمستخدم «البريد مسجّل» بدل «كلمة المرور خاطئة»، وهو تضليل كامل.
   * (كان هذا خطأً حقيقياً في الكود، اكتُشف من رسالة خطأ المستخدم.)
   */
  function signInEmail(email, password) {
    if (!cfg) return Promise.reject(new Error('لم تُضبط إعدادات المزامنة'));
    return initFirebase().then(() =>
      fb.auth.signInWithEmailAndPassword(email, password).catch(err => {
        const code = (err && err.code) || '';
        if (code === 'auth/user-not-found') {
          /* لا يوجد حساب بهذا البريد — ننشئه */
          return fb.auth.createUserWithEmailAndPassword(email, password);
        }
        /* كلمة مرور خاطئة، أو بريد مسجّل بمزوّد آخر (Google)، أو غير ذلك:
           نُعيد الخطأ الأصلي كما هو ولا نخمّن. */
        throw err;
      })
    );
  }

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

  /** الدخول بحساب Google — للبريد المسجّل بمزوّد Google */
  function signInGoogle() {
    if (!cfg) return Promise.reject(new Error('لم تُضبط إعدادات المزامنة'));
    return initFirebase().then(() => fb.auth.signInWithPopup(googleProvider()));
  }

  /** إرسال رابط إعادة تعيين كلمة المرور */
  function resetPassword(email) {
    if (!cfg) return Promise.reject(new Error('لم تُضبط إعدادات المزامنة'));
    return initFirebase().then(() => fb.auth.sendPasswordResetEmail(email));
  }

  function signOut() {
    if (!fb.auth) return Promise.resolve();
    return fb.auth.signOut().then(() => setState({ connected: false, user: null }));
  }

  /* ------------------------------------------------- مسارات البيانات */
  function reportsCol() { return fb.db.collection('users').doc(state.user.uid).collection('reports'); }
  function settingsDoc() { return fb.db.collection('users').doc(state.user.uid).collection('meta').doc('settings'); }
  function pullsCol() { return fb.db.collection('users').doc(state.user.uid).collection('meta'); }

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
    if (!hooks) return Promise.reject(new Error('وحدة المزامنة لم تكتمل تهيئتها بعد — أعد المحاولة'));
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
      return 'هذا النطاق غير مصرّح به في Firebase. افتح: Authentication ← Settings ← Authorized domains ← Add domain، وأضف نطاق موقعك (مثال: your-project.pages.dev).';
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
   * mode: 'google' للدخول بحساب Google، وأي شيء آخر = بريد وكلمة مرور.
   */
  function connect(email, password, mode) {
    /* الإعدادات مضمّنة، لذا نضمن وجودها حتى لو لم تُستدعَ init بعد
       (مثل صفحة الفحص المستقلة). */
    if (!cfg) cfg = resolveConfig();
    if (!cfg) return Promise.reject(new Error('لم تُضبط إعدادات المزامنة'));
    setState({ busy: true, error: '' });

    const attempt = mode === 'google' ? signInGoogle() : signInEmail(email, password);

    return attempt.then(cred => {
      const user = (cred && cred.user) || cred;
      if (!user) throw new Error('تعذّر تسجيل الدخول');
      state.user = user;
      setState({ connected: true, busy: false, user, error: '' });
      return { uid: user.uid, email: user.email || (user.isAnonymous ? 'مستخدم مجهول' : '') };
    }).catch(err => {
      const msg = friendlyError(err);
      setState({ busy: false, error: msg });
      throw taggedError(err, msg);
    });
  }

  function requestReset(email) {
    if (!cfg) cfg = resolveConfig();
    if (!email) return Promise.reject(new Error('أدخل البريد الإلكتروني أولاً'));
    return resetPassword(email).then(() => true).catch(err => {
      throw taggedError(err, friendlyError(err));
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
    /** الإعدادات المضمّنة — متاحة قبل init (تستخدمها صفحة الفحص) */
    embeddedConfig() { return resolveConfig(); },
    disconnect() { return signOut().then(() => clearConfig()); },
    reset() { clearConfig(); },
    connect,
    requestReset,
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
          let settled = false;
          const unsub = fb.auth.onAuthStateChanged(user => {
            if (settled) return;
            settled = true;
            if (typeof unsub === 'function') unsub();
            if (user) {
              state.user = user;
              setState({ connected: true, error: '' });
              resolve(true);
            } else resolve(false);
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
