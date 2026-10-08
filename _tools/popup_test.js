/* =============================================================================
   Popup-session recovery tests.
   -----------------------------------------------------------------------------
   حقيقة مؤكَّدة على الهاتف: عند إغلاق نافذة Google بعد نجاح الدخول، يأتي الوعد
   مرفوضاً بـ popup-closed-by-user مع أن الجلسة محفوظة فعلاً. الكود القديم كان
   يعتبر ذلك فشلاً فيُعيد التوجيه أو يُظهر خطأً. هذه الاختبارات تثبّت السلوك
   الصحيح في الحالات الأربع.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const vm = require('vm');
const { installGis } = require('./_gis_mock.js');

/**
 * @param {object} o
 *   popup: 'ok' | 'ok-no-user' | 'close-after-success' | 'blocked' | 'closed' | 'internal'
 *   redirectOk: هل إعادة التوجيه تُنتج جلسة؟
 *   gClient: معرّف عميل Google — يفعّل مسار Google Identity Services
 *   gis: 'ok' | 'cancel' | 'no-token' | 'init-fail' | 'script-fail'
 */
function makeEnv(o) {
  o = o || {};
  const calls = { popup: 0, redirect: 0, getRedirect: 0, gis: 0, credential: 0 };
  let currentUser = null;

  const auth = {
    get currentUser() { return currentUser; },
    set currentUser(v) { currentUser = v; },
    onAuthStateChanged() { return () => {}; },
    signInWithPopup() {
      calls.popup++;
      switch (o.popup) {
        case 'ok':
          currentUser = { uid: 'u1', email: 'me@gmail.com' };
          return Promise.resolve({ user: currentUser });
        case 'ok-no-user':
          setTimeout(() => { currentUser = { uid: 'u2', email: 'late@gmail.com' }; }, 400);
          return Promise.resolve({ user: null });
        case 'close-after-success':
          /* الدخول نجح في Firebase، لكن الوعد يُرفض لأن المستخدم أغلق النافذة */
          setTimeout(() => { currentUser = { uid: 'u3', email: 'closed@gmail.com' }; }, 300);
          { const e = new Error('popup closed'); e.code = 'auth/popup-closed-by-user'; return Promise.reject(e); }
        case 'blocked':
          { const e = new Error('blocked'); e.code = 'auth/popup-blocked'; return Promise.reject(e); }
        case 'closed':
          { const e = new Error('closed'); e.code = 'auth/popup-closed-by-user'; return Promise.reject(e); }
        case 'internal':
          { const e = new Error('internal'); e.code = 'auth/internal-error'; return Promise.reject(e); }
      }
      return Promise.reject(new Error('unhandled'));
    },
    signInWithRedirect() {
      calls.redirect++;
      if (o.redirectOk) { currentUser = { uid: 'ur', email: 'redir@gmail.com' }; return Promise.resolve(); }
      return Promise.resolve();
    },
    getRedirectResult() { calls.getRedirect++; return Promise.resolve(currentUser ? { user: currentUser } : null); },
    signInWithCredential(cred) {
      calls.credential++;
      if (o.gisCredFails) { const e = new Error('bad token'); e.code = 'auth/invalid-credential'; return Promise.reject(e); }
      currentUser = { uid: 'gis1', email: 'gis@gmail.com' };
      return Promise.resolve({ user: currentUser });
    },
    signOut() { currentUser = null; return Promise.resolve(); },
    GoogleAuthProvider: class {
      setCustomParameters() {}
      credential(token) { return { __token: token }; }
    },
  };

  const firebase = {
    apps: [], initializeApp() { firebase.apps.push({}); return {}; }, app: () => ({}),
    auth: () => auth,
    firestore: () => ({
      enablePersistence: () => Promise.resolve(),
      collection: () => ({ doc: () => ({ collection: () => ({
        get: () => Promise.resolve({ forEach() {}, docs: [] }),
        doc: () => ({ set: () => Promise.resolve(), get: () => Promise.resolve({ exists: false }) }),
      }), set: () => Promise.resolve(), get: () => Promise.resolve({ exists: false }) }) }),
      batch: () => ({ set() {}, commit: () => Promise.resolve() }),
    }),
  };
  firebase.auth.GoogleAuthProvider = auth.GoogleAuthProvider;

  const store = new Map();
  if (o.gClient) store.set('admh.sync.gclient', o.gClient);
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, Promise, Uint8Array, ArrayBuffer,
    Math, Date, JSON, Object, Array, String, Number, Boolean, Error, RegExp, parseInt, parseFloat, isNaN,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    navigator: { userAgent: o.mobile ? 'Mozilla/5.0 (Linux; Android 13) Mobile' : 'Windows',
                 maxTouchPoints: o.mobile ? 5 : 0, serviceWorker: null },
    innerWidth: o.mobile ? 412 : 1280,
    location: { protocol: 'https:', hostname: 'admh.workers.dev', href: 'https://admh.workers.dev/' },
    firebase,
    fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve('{"configured":true}') }),
    document: { createElement: () => ({ set src(v) {}, onload: null, onerror: null }), head: { appendChild() {} } },
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;

  /* ---- محاكي Google Identity Services ----
     المعرّف مضمَّن في sync.js، فكل الحالات تسلك مسار GIS.
     نُمرّر كائن العدّادات نفسه ليتتبّع استدعاءات GIS مع بقية الاستدعاءات. */
  installGis(sb, {
    mode: o.gis || 'ok',
    delay: o.gisDelay,
    idError: o.gisIdError,
    throwOnRequest: o.gisThrowRequest,
    calls: calls,
  });

  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'sync.js'), 'utf8'), sb, { filename: 'sync.js' });

  const S = sb.window.ADMHSync;
  /* اختبارات مسار Firebase: نُعطّل المسار المضمَّن ليعمل الاحتياطي */
  if (o.noGis && S.setGisEnabled) S.setGisEnabled(false);

  return { S: S, calls, sb, get user() { return currentUser; } };
}

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); } };

(async () => {
  console.log('=== الحالة الطبيعية ===');
  {
    const e = makeEnv({ popup: 'ok', noGis: true });
    /* مسار Firebase يتطلب أن تكون GIS معطّلة */
    e.S.setGisEnabled(true);   /* نتأكد أن العلم يعمل */
    e.S.setGisEnabled(false);
    const cred = await e.S.connect();
    check('الدخول ينجح', e.S.isConnected() === true, e.S.status());
    check('البريد صحيح', cred.email === 'me@gmail.com', cred.email);
    check('لم تُستخدم إعادة التوجيه', e.calls.redirect === 0, e.calls);
  }

  console.log('\n=== المنبثقة تنجح لكن بلا مستخدم، ثم تظهر الجلسة ===');
  {
    const e = makeEnv({ popup: 'ok-no-user', noGis: true });
    const cred = await e.S.connect();
    check('ينتظر الجلسة ويجدها', cred.email === 'late@gmail.com', cred.email);
    check('الحالة متصلة', e.S.isConnected() === true);
    check('لا إعادة توجيه بلا داعٍ', e.calls.redirect === 0, e.calls);
  }

  console.log('\n=== الأهم: نافذة أُغلقت بعد نجاح الدخول ===');
  {
    const e = makeEnv({ popup: 'close-after-success', noGis: true });
    const cred = await e.S.connect();
    check('يعتبر الدخول ناجحاً ولا يرمي خطأً', cred.email === 'closed@gmail.com', cred.email);
    check('لا إعادة توجيه قسرية', e.calls.redirect === 0, e.calls);
    check('لا رسالة خطأ', !e.S.status().error, e.S.status().error);
  }
  {
    /* نفس الحالة على الهاتف — وهي التي كانت تفشل */
    const e = makeEnv({ popup: 'close-after-success', mobile: true, noGis: true });
    const cred = await e.S.connect();
    check('تعمل على الهاتف أيضاً', cred.email === 'closed@gmail.com', cred.email);
    check('الهاتف لا يُعاد توجيهه بلا داعٍ', e.calls.redirect === 0, e.calls);
  }

  console.log('\n=== فشل حقيقي: تُجرَّب إعادة التوجيه ===');
  {
    const e = makeEnv({ popup: 'blocked', mobile: true, noGis: true });
    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    check('النافذة المحجوبة تُنتقل إلى إعادة التوجيه', e.calls.redirect === 1, e.calls);
    check('لا تعليق صامت', !!err, err && err.message);
  }
  {
    const e = makeEnv({ popup: 'internal', mobile: true, noGis: true });
    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    check('الخطأ الداخلي يُنتقل إلى إعادة التوجيه', e.calls.redirect === 1, e.calls);
  }
  {
    /* المستخدم أغلق النافذة بلا دخول: تُجرَّب إعادة التوجيه كنهاية مطاف */
    const e = makeEnv({ popup: 'closed', noGis: true });
    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    check('الإغلاق بلا دخول ينتقل إلى إعادة التوجيه', e.calls.redirect === 1, e.calls);
    check('ورسالة واضحة إن فشل الكل', !!err, err && err.message);
  }

  console.log('\n=== العودة من إعادة التوجيه ===');
  {
    /* نُكمل محاولة الدخول أولاً (ستفشل وتُشغّل إعادة التوجيه)، ثم نُحاكي العودة */
    const e = makeEnv({ popup: 'blocked', redirectOk: true, noGis: true });
    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    check('إعادة التوجيه شُغّلت', e.calls.redirect === 1, e.calls);
    const user = await e.S.consumeRedirect();
    check('تُكتشف الجلسة بعد العودة', !!(user && user.email === 'redir@gmail.com'), user && user.email);
    check('الحالة متصلة', e.S.isConnected() === true, e.S.status());
  }
  {
    /* الجلسة محفوظة لكن getRedirectResult فارغة — الحالة التي فشلت على الهاتف:
       الصفحة تُحمَّل من جديد، Firebase يستعيد الجلسة، والنتيجة لا تصل. */
    const e = makeEnv({ popup: 'ok-no-user', noGis: true });
    /* نُشغّل الدخول في الخلفية فتظهر الجلسة متأخرة */
    e.S.connect().catch(() => {});
    await new Promise(r => setTimeout(r, 700));
    const user = await e.S.consumeRedirect();
    check('تُكتشف الجلسة المحفوظة رغم فراغ نتيجة إعادة التوجيه',
      !!(user && /late@gmail.com/.test(user.email)), user && user.email);
  }

  console.log('\n=== Google Identity Services: الحل الذي يعمل على الهاتف ===');
  {
    /* تعطيل المعرّف المضمَّن: مسار Firebase المعتاد (نافذة منبثقة) */
    const e = makeEnv({ popup: 'ok', noGis: true });
    await e.S.connect();
    check('بلا معرّف: يستخدم مسار Firebase', e.calls.popup === 1 && e.calls.gis === 0, e.calls);
  }
  {
    /* المعرّف مضمَّن في النظام: GIS يُستخدم ولا تُفتح أي نافذة Firebase */
    const e = makeEnv({ mobile: true });
    const cred = await e.S.connect();
    check('مع المعرّف: يستخدم GIS', e.calls.gis === 1, e.calls);
    check('ولا يفتح نافذة Firebase', e.calls.popup === 0, e.calls);
    check('ولا يعيد التوجيه إطلاقاً', e.calls.redirect === 0, e.calls);
    check('يحوّل رمز Google إلى جلسة Firebase', e.calls.credential === 1, e.calls);
    check('الدخول ينجح', e.S.isConnected() === true, e.S.status());
    check('البريد صحيح', cred.email === 'gis@gmail.com', cred.email);
  }
  {
    /* إلغاء المستخدم **ليس عطلاً**: لا نافذة ثانية ولا انتقال إلى Firebase.
       نُظهر له رسالة واضحة تطلب إعادة المحاولة. */
    const e = makeEnv({ gis: 'cancel', popup: 'ok', noGis: false });
    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    check('الإلغاء لا يفتح نافذة Firebase ثانية', e.calls.popup === 0, e.calls);
    check('ولا يعيد التوجيه', e.calls.redirect === 0, e.calls);
    check('ويُظهر رسالة إلغاء واضحة',
      !!(err && /أُلغيت|إلغاء/.test(err.message)), err && err.message);
  }
  {
    /* Google أعاد access_token بلا id_token — وهو الشائع على الهاتف.
       Firebase يقبل access_token، فيجب أن ينجح الدخول مباشرةً بلا
       أي انتقال إلى مسار Firebase (لا نافذة ثانية ولا إعادة توجيه). */
    const e = makeEnv({ gis: 'no-token', popup: 'ok', noGis: false });
    const cred = await e.S.connect();
    check('رمز الوصول وحده يكفي للدخول', !!cred.email, cred.email);
    check('بلا فتح نافذة Firebase ثانية', e.calls.popup === 0, e.calls);
    check('وبلا إعادة توجيه', e.calls.redirect === 0, e.calls);
    check('وحُوّل الرمز إلى جلسة Firebase', e.calls.credential === 1, e.calls);
  }
  {
    /* فشل تهيئة GIS: لا نعلق */
    const e = makeEnv({ gis: 'init-fail', popup: 'ok', noGis: false });
    const cred = await e.S.connect();
    check('فشل تهيئة GIS ينتقل إلى مسار Firebase', e.calls.popup === 1, e.calls);
    check('وينجح في النهاية', !!cred.email, cred.email);
  }
  {
    /* فشل تحويل الرمز إلى جلسة: خطأ حقيقي يُعرض ولا يُبتلع */
    const e = makeEnv({ gisCredFails: true });
    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    check('فشل التحويل يُعرض كخطأ', !!err, err && err.message);
  }
  {
    /* إدارة معرّف العميل */
    const e = makeEnv();
    check('المعرّف مضمَّن في النظام', e.S.hasGoogleClientId() === true, e.S.googleClientId());
    check('المعرّف المضمَّن صيغته صحيحة',
      /\.apps\.googleusercontent\.com$/.test(e.S.googleClientId()), e.S.googleClientId());
    e.S.setGoogleClientId('999-xyz.apps.googleusercontent.com');
    check('حفظ المعرّف يعمل', e.S.hasGoogleClientId() === true);
    check('ويُقرأ صحيحاً', e.S.googleClientId() === '999-xyz.apps.googleusercontent.com', e.S.googleClientId());
    check('وحفظه لا يمسح إعدادات المزامنة', e.S.isConfigured() === true, e.S.status());
    e.S.setGoogleClientId('');
    check('إزالة المعرّف تعمل', e.S.hasGoogleClientId() === false);
  }

  console.log('\n=== فحص النطاق الحقيقي (بدل /gsi/status الكاذب) ===');
  {
    /* نطاق سليم: لا يأتي error_callback، فالنتيجة نجاح */
    const e = makeEnv({});
    const r = await e.S.verifyGisOrigin();
    check('نطاق سليم يُقبل', r.ok === true, r);
    check('ورسالته مطمئنة', /مقبول|مهيّأة/.test(r.message || ''), r.message);
  }
  {
    /* Google ترفض النطاق صراحةً */
    const e = makeEnv({ gisIdError: 'origin_mismatch' });
    const r = await e.S.verifyGisOrigin();
    check('رفض النطاق يُكتشف', r.ok === false, r);
    check('ورسالته تذكر Authorized JavaScript origins',
      /Authorized JavaScript origins/.test(r.message || ''), r.message);
    check('ويُعرض رمز السبب', r.reason === 'origin_mismatch', r.reason);
  }
  {
    const e = makeEnv({ gisIdError: 'invalid_client' });
    const r = await e.S.verifyGisOrigin();
    check('معرّف خاطئ يُكتشف', r.ok === false && /معرّف العميل/.test(r.message), r.message);
  }
  {
    const e = makeEnv({ gisIdError: 'idpiframe_initialization_failed' });
    const r = await e.S.verifyGisOrigin();
    check('حجب تخزين الطرف الثالث يُشرح بوضوح',
      r.ok === false && /تخزين الطرف الثالث|كوكيز/.test(r.message), r.message);
  }

  console.log('\n=== التجهيز المسبق: الطلب فوري داخل تفقّد النقرة ===');
  {
    /* العطل الذي كان يحدث على الهاتف: انتظار تحميل المكتبة يُفقد تفعيل
       نقرة المستخدم، فيحوّل Chrome النافذة إلى إعادة توجيه كاملة.
       الحل: تجهيز المكتبة والعميل مسبقاً، فيقع الطلب فورياً. */
    const e = makeEnv({});
    check('لا عميل قبل التجهيز', e.S.googleReady() === false, e.S.googleReady());

    const ok = await e.S.prepareGoogle();
    check('التجهيز المسبق ينجح', ok === true, ok);
    check('والعميل صار جاهزاً', e.S.googleReady() === true);
    check('وبُني مرة واحدة فقط', e.calls.init === 1, e.calls.init);
    check('ولا طلب رمز بعد', e.calls.gis === 0, e.calls.gis);

    /* الآن الطلب: يجب أن يكون فورياً — أي أن الطلب يبدأ في نفس الدورة */
    let immediate = false;
    const p = e.S.connect().then(() => { immediate = true; });
    /* لم ننتظر بعد، لكن gis يجب أن يكون قد استُدعي فوراً */
    check('الطلب يُنفَّذ فوراً بلا انتظار', e.calls.gis >= 1, e.calls);
    await p;
    check('والدخول ينجح بعد ذلك', immediate === true);
  }
  {
    /* التجهيز المسبق لا يُعاد إن كان جاهزاً */
    const e = makeEnv({});
    await e.S.prepareGoogle();
    await e.S.prepareGoogle();
    check('التجهيز المسبق لا يتكرر', e.calls.init === 1, e.calls.init);
  }
  {
    /* بدون معرّف: التجهيز المسبق لا يفعل شيئاً */
    const e = makeEnv({ noGis: true });
    const ok = await e.S.prepareGoogle();
    check('بلا معرّف: لا تجهيز', ok === false, ok);
  }

  console.log('\n=== تشخيص غياب رمز الهوية (FedCM) ===');
  {
    /* الحالة الواقعية على الهاتف: كروم يحجب كوكيز الطرف الثالث، فيصل
       access_token بلا id_token. يجب أن:
         · نطلب FedCM لتجاوز الحجب
         · نذكر السببين الممكنين لا سبباً واحداً مضلِّلاً
         · نحتفظ بالاستجابة الخام للتشخيص */
    const e = makeEnv({ gis: 'no-token', popup: 'ok' });
    await e.S.prepareGoogle();          /* نبني العميل أولاً */
    check('FedCM مفعّل في تهيئة العميل',
      !!(e.sb.__gisCfgSeen && e.sb.__gisCfgSeen.use_fedcm_for_prompt === true),
      e.sb.__gisCfgSeen);

    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    /* GIS فشل ← ينتقل إلى مسار Firebase، فإن نجح فلا خطأ — وهذا مقبول */
    const dg = e.S.gisDiagnostics();
    const rsp = dg && dg.response;
    check('تم تسجيل تشخيص الاستجابة', !!rsp, dg);
    check('التشخيص يذكر أن رمز الهوية غائب',
      rsp && rsp.hasIdToken === false, rsp);
    check('ويذكر أن رمز الوصول وصل',
      rsp && rsp.hasAccessToken === true, rsp);
    check('التشخيص يذكر رموز الاستجابة', !!(rsp && typeof rsp.keys === 'string'), rsp);
    check('ويسجّل خطأ GIS أيضاً', !!(dg && 'error' in dg), dg);
  }
  {
    /* لا رمز وصول ولا رمز هوية: ننتقل إلى مسار Firebase.
       وإن فشل هو أيضاً، تُعرض رسالة Google Identity — لأنها الأدق. */
    const e = makeEnv({ gis: 'none', popup: 'internal' });
    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    check('غياب الرمزين يُنتج خطأً واضحاً', !!err, 'no error');
    if (err) {
      check('الرسالة تذكر Authorized JavaScript origins',
        /Authorized JavaScript origins/.test(err.message), err.message.slice(0, 90));
      check('الرسالة تعرض ما وصل من Google',
        /وصل من Google/.test(err.message), err.message.slice(-70));
    }
  }

  console.log('\n=== الحالة التي واجهها المستخدم: فشل GIS ثم فشل Firebase ===');
  {
    /* المسار الاحتياطي يعطي «البيئة لا تدعم نوافذ الدخول» — رسالة عامة لا
       تصف عطل Google Identity إطلاقاً. يجب أن تظهر رسالة GIS الأدق. */
    const e = makeEnv({ gis: 'none', popupFails: 'auth/operation-not-supported-in-this-environment' });
    let err = null;
    try { await e.S.connect(); } catch (x) { err = x; }
    check('يُنتج خطأً', !!err, 'no error');
    if (err) {
      check('الرسالة من Google Identity لا من Firebase',
        /Authorized JavaScript origins|لم يُعِد Google/.test(err.message), err.message.slice(0, 100));
      check('ولا تذكر «نوافذ الدخول المنبثقة»',
        !/نوافذ الدخول المنبثقة/.test(err.message), err.message.slice(0, 100));
    }
    const dg = e.S.gisDiagnostics();
    check('سبب GIS محفوظ للتشخيص', !!(dg && dg.error && dg.error.code), dg && dg.error);
  }
  {
    /* نجاح المسار الاحتياطي: لا خطأ إطلاقاً */
    const e = makeEnv({ gis: 'none', popup: 'ok' });
    const cred = await e.S.connect();
    check('المسار الاحتياطي ينجح عند الحاجة', !!cred.email, cred.email);
    check('وقد استُخدمت النافذة', e.calls.popup === 1, e.calls);
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
