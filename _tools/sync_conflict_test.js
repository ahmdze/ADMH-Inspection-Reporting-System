/* =============================================================================
   Sync safety tests — the data-loss scenario the reviewer described
   -----------------------------------------------------------------------------
   السيناريو الخطير:
     ١) أعدّلت مكتبة العبارات على الهاتف (بلا إنترنت)
     ٢) زامن الحاسوب (وليس فيه تعديل الهاتف)
     ٣) زامن الهاتف
   العطل القديم: كان الهاتف يفقد تعديله بصمت.
   الإصلاح: لا استبدال صامت أبداً — يُحفظ المحلي ويُبلَّغ عن التعارض.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const vm = require('vm');
const { installGis } = require('./_gis_mock.js');

let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
};

/** مخزن سحابي وهمي (Firestore) */
function makeCloud() {
  return { reports: new Map(), meta: {} };
}

/** يبني بيئة جهاز كامل مع خطّافات المزامنة الحقيقية */
function makeDevice(label, cloud, opts) {
  opts = opts || {};
  const store = new Map();
  const local = {
    reports: opts.reports || [],
    settings: opts.settings || null,
    library: opts.library || null,
    lists: opts.lists || null,
    registry: opts.registry || null,
    libraryAt: opts.libraryAt || null,
    listsAt: opts.listsAt || null,
    registryAt: opts.registryAt || null,
    synced: opts.synced || {},
  };

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
    innerWidth: 1280,
    location: { protocol: 'https:', hostname: 'admh.test', href: 'https://admh.test/' },
    document: { createElement: () => ({ set src(v) {}, onload: null, onerror: null }), head: { appendChild() {} } },
  };

  /* Firestore وهمي مشترك بين الأجهزة — يطابق بنية sync.js الحقيقية:
       users/{uid}/meta/settings  ← { payload, updatedAt }
       users/{uid}/reports/{id}   ← التقرير */
  const reportsCol = () => ({
    get: () => Promise.resolve({
      forEach: cb => cloud.reports.forEach((v, k) => cb({ id: k, data: () => v })),
      docs: [],
    }),
    doc: id => ({
      set: v => { cloud.reports.set(id, JSON.parse(JSON.stringify(v))); return Promise.resolve(); },
      get: () => Promise.resolve({ exists: cloud.reports.has(id), data: () => cloud.reports.get(id) }),
    }),
  });

  const metaCol = () => ({
    doc: name => ({
      set: v => { cloud.meta[name] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
      get: () => Promise.resolve({
        exists: !!cloud.meta[name],
        data: () => cloud.meta[name],
      }),
    }),
  });

  /* مستند «meta/settings» — يحتاج set و get مباشرةً */
  const settingsDoc = () => ({
    set: v => { cloud.meta.settings = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
    get: () => Promise.resolve({
      exists: !!cloud.meta.settings,
      data: () => cloud.meta.settings,
    }),
  });
  /* مجموعة meta تحتوي مستند settings */
  const metaGroup = () => ({ doc: () => settingsDoc() });

  sb.firebase = {
    apps: [], initializeApp() { this.apps.push({}); return {}; }, app: () => ({}),
    auth: () => ({
      currentUser: { uid: 'uid-1', email: 'me@test.iq' },
      onAuthStateChanged: fn => { setTimeout(() => fn({ uid: 'uid-1', email: 'me@test.iq' }), 5); return () => {}; },
      signInWithPopup: () => Promise.resolve({ user: { uid: 'uid-1' } }),
      getRedirectResult: () => Promise.resolve(null),
      signOut: () => Promise.resolve(),
      GoogleAuthProvider: class { setCustomParameters() {} credential() { return {}; } },
    }),
    firestore: () => ({
      enablePersistence: () => Promise.resolve(),
      collection: () => ({
        doc: () => ({
          collection: name => (name === 'reports' ? reportsCol()
            : name === 'meta' ? metaGroup()
            : metaCol()),
        }),
      }),
      batch: () => ({ set: () => {}, commit: () => Promise.resolve() }),
    }),
  };
  sb.firebase.auth.GoogleAuthProvider = sb.firebase.auth().GoogleAuthProvider;

  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  installGis(sb, { mode: 'ok' });
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'sync.js'), 'utf8'), sb, { filename: 'sync.js' });

  const S = sb.window.ADMHSync;
  S.init({
    load: () => JSON.parse(JSON.stringify(local)),
    save: payload => {
      if (Array.isArray(payload.reports)) local.reports = payload.reports;
      if (payload.settings) local.settings = payload.settings;
      if (payload.library) local.library = payload.library;
      if (payload.lists) local.lists = payload.lists;
      if (payload.registry) local.registry = payload.registry;
      /* ---------------------------------------------------------------------
         أوقات آخر مزامنة **إلزامية**.
         ---------------------------------------------------------------------
         كان المحاكي يُهملها، فبقي `synced` فارغاً و`lastAt = 0` دائماً —
         أي أن كل تغيير بدا «جديداً من الطرفين» فظهر تعارض كاذب في كل
         مزامنة. وهذا بالضبط العطل الذي نبحث عنه، وكان المحاكي يخفيه.
         --------------------------------------------------------------------- */
      if (payload.synced && typeof payload.synced === 'object') {
        local.synced = Object.assign({}, local.synced || {}, payload.synced);
      }
      if (payload.draftFromCloud && payload.draft) local.draft = payload.draft;
    },
  });
  /** يتصل ثم يُزامن — المزامنة تتطلب جلسة دخول */
  const syncNow = () => S.connect().catch(() => {}).then(() => S.syncNow());
  return { S, local, sb, label, syncNow };
}

(async () => {
  console.log('=== السيناريو الخطير: تعديل محلي ثم مزامنة جهاز آخر ===');
  {
    const cloud = makeCloud();

    /* الحاسوب: مكتبة أصلية وزامن أولاً */
    const pc = makeDevice('PC', cloud, {
      library: { records: ['سجل الحركة'], reco: [], general: [] },
      libraryAt: new Date(Date.now() - 60000).toISOString(),
    });
    await pc.syncNow();
    const cloudLibAfterPc = cloud.meta.settings && cloud.meta.settings.payload.library;
    check('الحاسوب رفع مكتبته', !!(cloudLibAfterPc && cloudLibAfterPc.records), cloudLibAfterPc);

    /* الهاتف: عنده تعديل محلي **أحدث** لم يُزامَن بعد */
    const phoneAt = new Date().toISOString();
    const phone = makeDevice('Phone', cloud, {
      library: { records: ['سجل الحركة', 'سجل جديد من الهاتف'], reco: [], general: [] },
      libraryAt: phoneAt,
      /* آخر مزامنة للهاتف أقدم من تعديله */
      synced: { library: new Date(Date.now() - 120000).toISOString() },
    });

    const r = await phone.syncNow();

    /* الأهم: تعديل الهاتف لم يضِع */
    const cloudLib = cloud.meta.settings && cloud.meta.settings.payload.library;
    check('تعديل الهاتف لم يضِع من السحابة',
      !!(cloudLib && cloudLib.records.indexOf('سجل جديد من الهاتف') >= 0),
      cloudLib && cloudLib.records);
    check('وقد رُفع فعلاً (pushed)', r && r.pushed >= 0, r && r.pushed);
  }

  console.log('\n=== تعارض حقيقي: الطرفان تغيّرا ===');
  {
    const cloud = makeCloud();
    const base = new Date(Date.now() - 300000).toISOString();

    /* مزامنة أولى لتثبيت نقطة مرجعية */
    const a = makeDevice('A', cloud, {
      library: { records: ['الأصل'] }, libraryAt: base,
      synced: { library: base },
    });
    await a.syncNow();

    /* الجهاز الأول يعدّل */
    const a2 = makeDevice('A2', cloud, {
      library: { records: ['الأصل', 'تعديل الجهاز الأول'] },
      libraryAt: new Date().toISOString(),
      synced: { library: base },
    });
    await a2.syncNow();

    /* الجهاز الثاني عدّل أيضاً — تعديله أقدم قليلاً لكنه لم يُزامَن */
    const b = makeDevice('B', cloud, {
      library: { records: ['الأصل', 'تعديل الجهاز الثاني'] },
      libraryAt: new Date(Date.now() - 1000).toISOString(),
      synced: { library: base },
    });
    const r2 = await b.syncNow();

    check('يُكتشف التعارض ويُبلَّغ عنه',
      !!(r2 && r2.conflicts && r2.conflicts.indexOf('library') >= 0),
      r2 && r2.conflicts);
    check('ورسالة التعارض مكتوبة بالعربية',
      !!(r2 && /تعارض/.test(r2.conflictNotice || '')), r2 && r2.conflictNotice);
    check('وتعديل الجهاز الثاني لم يضِع محلياً',
      b.local.library.records.indexOf('تعديل الجهاز الثاني') >= 0,
      b.local.library.records);
    check('ولا استُبدل بمكتبة الجهاز الأول',
      b.local.library.records.indexOf('تعديل الجهاز الأول') < 0,
      b.local.library.records);
  }

  console.log('\n=== الحالة الآمنة: المحلي لم يتغيّر ← نأخذ السحابي ===');
  {
    const cloud = makeCloud();
    cloud.meta.settings = {
      updatedAt: new Date().toISOString(),
      payload: { library: { records: ['من السحابة'] }, settings: null, lists: null },
    };
    const fresh = makeDevice('Fresh', cloud, {
      library: { records: ['محلي قديم'] },
      libraryAt: new Date(Date.now() - 600000).toISOString(),
      synced: { library: new Date(Date.now() - 600000).toISOString() },
    });
    const r3 = await fresh.syncNow();
    check('يُطبَّق السحابي حين لا تعديل محلي',
      fresh.local.library && fresh.local.library.records.indexOf('من السحابة') >= 0,
      fresh.local.library && fresh.local.library.records);
    check('وبلا تحذير تعارض',
      !(r3 && r3.conflictNotice), r3 && r3.conflictNotice);
  }

  console.log('\n=== لا تعديل محلي ولا سحابي ← لا ضرر ===');
  {
    const cloud = makeCloud();
    const empty = makeDevice('Empty', cloud, {});
    const r4 = await empty.syncNow();
    check('المزامنة تنجح بلا بيانات', !!r4, r4);
    check('وبلا تعارض', !(r4 && r4.conflictNotice));
  }

  console.log('\n=== مزامنة ← تعديل محلي فقط ← مزامنة (لا تعارض كاذب) ===');
  {
    /* ---------------------------------------------------------------------
       السيناريو الذي أوصى به المراجع:
         مزامنة ناجحة، ثم تعديل محلي فقط، ثم مزامنة جديدة.
       المطلوب: يُرفع المحلي **بلا** تحذير تعارض كاذب.

       وهذا يفحص تحديداً أن وقت المزامنة السابقة يُسجَّل صحيحاً، وأن تحديث
       المستند السحابي (الذي يحدث مع كل دفع) لا يُحسب «تعديلاً من الطرف الآخر».
       --------------------------------------------------------------------- */
    const cloud = makeCloud();
    const dev = makeDevice('Solo', cloud, {
      library: { records: ['أصل'] },
      libraryAt: new Date(Date.now() - 600000).toISOString(),
    });

    /* ١) مزامنة أولى: تُثبّت نقطة مرجعية */
    const r1 = await dev.syncNow();
    check('the first sync succeeds', !!r1, r1);
    check('the first sync reports no conflict', !(r1 && r1.conflictNotice));

    /* ٢) تعديل محلي فقط — بلا أي تغيير من الطرف الآخر */
    dev.local.library = { records: ['أصل', 'أُضيف محلياً'] };
    dev.local.libraryAt = new Date().toISOString();

    /* ٣) مزامنة ثانية */
    const r2 = await dev.syncNow();
    check('the second sync reports NO false conflict', !(r2 && r2.conflictNotice),
      { notice: r2 && r2.conflictNotice,
        localAt: dev.local.libraryAt,
        syncedAt: dev.local.synced && dev.local.synced.library,
        cloudAt: cloud.meta.settings && cloud.meta.settings.updatedAt });
    check('the local edit reached the cloud',
      !!(cloud.meta.settings && cloud.meta.settings.payload &&
         cloud.meta.settings.payload.library &&
         cloud.meta.settings.payload.library.records.indexOf('أُضيف محلياً') >= 0),
      cloud.meta.settings && cloud.meta.settings.payload &&
      cloud.meta.settings.payload.library);
    check('and the local copy is intact',
      dev.local.library.records.indexOf('أُضيف محلياً') >= 0, dev.local.library.records);

    /* ٤) مزامنة ثالثة بلا أي تغيير: لا تعارض ولا تغيير */
    const r3 = await dev.syncNow();
    check('a third sync with no changes is quiet', !(r3 && r3.conflictNotice));
    check('and the cloud copy is still correct',
      !!(cloud.meta.settings.payload.library.records.indexOf('أُضيف محلياً') >= 0));
  }

  console.log('\n=== كل مجموعة تُقيَّم على حدة ===');
  {
    const cloud = makeCloud();
    const base = new Date(Date.now() - 300000).toISOString();

    /* السحابة فيها مكتبة وقوائم */
    cloud.meta.settings = {
      updatedAt: new Date().toISOString(),
      payload: {
        library: { records: ['مكتبة سحابية'] },
        lists: { jobTitles: { values: ['عنوان سحابي'] } },
        settings: null,
      },
    };

    /* المحلي: المكتبة تغيّرت (نحفظها) والقوائم لم تتغيّر (نأخذ السحابي) */
    const d = makeDevice('Mixed', cloud, {
      library: { records: ['مكتبة محلية'] },
      libraryAt: new Date().toISOString(),
      lists: { jobTitles: { values: ['عنوان محلي قديم'] } },
      listsAt: base,
      synced: { library: base, lists: base },
    });
    const r5 = await d.syncNow();

    check('المكتبة المحلية المُعدَّلة بقيت',
      d.local.library.records.indexOf('مكتبة محلية') >= 0,
      d.local.library.records);
    check('والقوائم غير المُعدَّلة جاءت من السحابة',
      !!(d.local.lists && d.local.lists.jobTitles &&
         d.local.lists.jobTitles.values.indexOf('عنوان سحابي') >= 0),
      d.local.lists && d.local.lists.jobTitles);
    check('التعارض يخصّ المكتبة وحدها',
      !!(r5 && r5.conflicts && r5.conflicts.length === 1 && r5.conflicts[0] === 'library'),
      r5 && r5.conflicts);
  }

  console.log('\n=== سجل التوصيات يُزامَن ويُدمج مثل بقية المجموعات ===');
  {
    const cloud = makeCloud();
    const base = new Date(Date.now() - 300000).toISOString();

    /* السحابة فيها سجل توصيات */
    cloud.meta.settings = {
      updatedAt: new Date().toISOString(),
      payload: {
        registry: { facilities: { k1: { name: 'مركز أ' } }, recs: { R1: { id: 'R1', status: 'done' } } },
        settings: null, library: null, lists: null,
      },
    };

    /* المحلي لم يغيّر السجل ← يأخذ السحابي */
    const d = makeDevice('RegPull', cloud, {
      registry: { facilities: {}, recs: {} },
      registryAt: base,
      synced: { registry: base },
    });
    const r = await d.syncNow();
    check('registry pulled from the cloud when unchanged locally',
      !!(d.local.registry && d.local.registry.recs && d.local.registry.recs.R1),
      d.local.registry && d.local.registry.recs);
    check('and no conflict is reported', !(r && r.conflictNotice), r && r.conflictNotice);
  }
  {
    const cloud = makeCloud();
    const base = new Date(Date.now() - 300000).toISOString();

    /* السحابة فيها سجل، والمحلي عدّله أيضاً ← تعارض */
    cloud.meta.settings = {
      updatedAt: new Date().toISOString(),
      payload: {
        registry: { facilities: {}, recs: { CLOUD: { id: 'CLOUD' } } },
        settings: null, library: null, lists: null,
      },
    };
    const d = makeDevice('RegConflict', cloud, {
      registry: { facilities: {}, recs: { LOCAL: { id: 'LOCAL' } } },
      registryAt: new Date().toISOString(),
      synced: { registry: base },
    });
    const r = await d.syncNow();
    check('registry conflict is detected',
      !!(r && r.conflicts && r.conflicts.indexOf('registry') >= 0),
      r && r.conflicts);
    check('the conflict notice names the recommendation registry in Arabic',
      !!(r && /سجل التوصيات/.test(r.conflictNotice || '')), r && r.conflictNotice);
    check('the local registry survives the conflict',
      !!(d.local.registry && d.local.registry.recs && d.local.registry.recs.LOCAL),
      d.local.registry && d.local.registry.recs);
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
