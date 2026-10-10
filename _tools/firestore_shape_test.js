/* =============================================================================
   اختبار تكاملي لبنية بيانات Firestore — _tools/firestore_shape_test.js
   =============================================================================
   لماذا هذا الاختبار؟
   -----------------------------------------------------------------------------
   قال المراجع: «لا يكفي اختبار أن زر التنزيل يعمل؛ يجب اختبار أن البيانات
   التي ينقلها **صحيحة**».

   وهو محق تماماً: `transfer_test.js` يستبدل دوال النقل بدوال وهمية، فلا يلمس
   بنية Firestore إطلاقاً. ولهذا مرّ عطل خطير: `pullDatabase` كانت تقرأ
   `_deleted` (حقل لا وجود له) وتُضيف **المستند كله** كأنه التقرير — فيضيع
   `recGroups` و`records` عند التنزيل.

   هذا الاختبار يبني مستندات **بنفس الشكل الذي تكتبه `pushReports` بالحرف**،
   ثم يُنزّلها ويقارن **كل حقل** في التقرير الأصلي.
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
   مخزن Firestore وهمي — يحاكي البنية الحقيقية بدقة
   ============================================================================= */
function makeEnv(seed) {
  const store = new Map();                 /* id → مستند */

  const mkRes = (url, body) => ({
    ok: true, status: 200, url,
    headers: { get: () => 'application/javascript' },
    clone() { return mkRes(url, body); },
    text: () => Promise.resolve(body || ''),
  });

  /* نزرع مستندات بالشكل السحابي الحقيقي */
  Object.keys(seed || {}).forEach(k => store.set(k, seed[k]));

  const docRef = id => ({
    set: (v, opts) => {
      if (opts && opts.merge) {
        store.set(id, Object.assign({}, store.get(id) || {}, v));
      } else {
        store.set(id, JSON.parse(JSON.stringify(v)));
      }
      return Promise.resolve();
    },
    get: () => Promise.resolve({ exists: store.has(id), data: () => store.get(id) }),
    delete: () => { store.delete(id); return Promise.resolve(); },
  });

  const colRef = () => ({
    doc: id => docRef(id),
    get: () => Promise.resolve({
      forEach: cb => store.forEach((v, k) => cb({ id: k, data: () => v })),
      docs: [],
      size: store.size,
    }),
  });

  const metaDoc = { payload: null, updatedAt: null };
  const draftStore = { draft: null, updatedAt: null };

  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Math, Date, JSON, Object, Array, String, Number, Boolean,
    Error, RegExp, parseInt, parseFloat, isNaN, Uint8Array, ArrayBuffer,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: 'node', serviceWorker: null, maxTouchPoints: 0 },
    location: { protocol: 'https:', hostname: 't', href: 'https://t/' },
    document: { createElement: () => ({ set src(v) {}, onload: null }), head: { appendChild() {} } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  sb.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };

  const reportsCol = () => ({
    doc: id => docRef(id),
    get: () => Promise.resolve({
      forEach: cb => store.forEach((v, k) => cb({ id: k, data: () => v })),
      docs: [],
      size: store.size,
    }),
  });

  sb.firebase = {
    apps: [], initializeApp() { this.apps.push({}); return {}; }, app: () => ({}),
    auth: () => ({
      currentUser: { uid: 'uid-1', email: 'me@t.iq' },
      /* مهم: يجب أن يُنادى المُستمع فعلاً، وإلا انتظرت connect() بلا نهاية */
      onAuthStateChanged: fn => {
        setTimeout(() => fn({ uid: 'uid-1', email: 'me@t.iq' }), 5);
        return () => {};
      },
      signInWithPopup: () => Promise.resolve({ user: { uid: 'uid-1', email: 'me@t.iq' } }),
      getRedirectResult: () => Promise.resolve(null),
      signOut: () => Promise.resolve(),
      GoogleAuthProvider: class { setCustomParameters() {} credential() { return {}; } },
    }),
    firestore: () => ({
      enablePersistence: () => Promise.resolve(),
      collection: () => ({
        doc: () => ({
          collection: name => {
            if (name === 'reports') return reportsCol();
            /* meta: مستند settings ومستند draft */
            return {
              doc: which => (which === 'draft'
                ? {
                  set: (v, o) => { Object.assign(draftStore, v); return Promise.resolve(); },
                  get: () => Promise.resolve({ exists: !!draftStore.draft, data: () => draftStore }),
                }
                : {
                  set: (v, o) => { Object.assign(metaDoc, v); return Promise.resolve(); },
                  get: () => Promise.resolve({ exists: true, data: () => metaDoc }),
                }),
            };
          },
        }),
      }),
      batch: () => ({
        set: (ref, v, opts) => { /* نحتاج تتبّع المرجع */ batchOps.push({ ref, v, opts }); },
        commit: () => {
          batchOps.forEach(op => op.ref.set(op.v, op.opts));
          batchOps.length = 0;
          return Promise.resolve();
        },
      }),
    }),
  };
  sb.firebase.auth.GoogleAuthProvider = sb.firebase.auth().GoogleAuthProvider;
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  const batchOps = [];

  /* محاكي GIS المشترك: بدونه تتعلّق connect() على طلب رمز Google */
  require('./_gis_mock.js').installGis(sb, { mode: 'ok' });
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8'), sb, { filename: 'sync.js' });

  const S = sb.window.ADMHSync;
  let local = { reports: [], settings: null, library: null, lists: null, registry: null, draft: null };
  S.init({
    load: () => JSON.parse(JSON.stringify(local)),
    save: p => {
      if (Array.isArray(p.reports)) local.reports = p.reports;
      if (p.settings) local.settings = p.settings;
      if (p.library) local.library = p.library;
      if (p.lists) local.lists = p.lists;
      if (p.registry) local.registry = p.registry;
      if (p.draftFromCloud && p.draft) local.draft = p.draft;
    },
  });
  return {
    S, store, metaDoc, draftStore,
    getLocal: () => local,
    setLocal: l => { local = l; },
    connect: () => S.connect().catch(() => {}),
  };
}

/* =============================================================================
   الكتابة بالشكل السحابي نفسه — نسخة حرفية من منطق pushReports
   ============================================================================= */
function cloudDocFromReport(r, device) {
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
    device: device || 'جهاز-آخر',
  };
  doc.data = r._deleted ? null : JSON.parse(JSON.stringify(r, (k, v) => (k === '_deleted' ? undefined : v)));
  return doc;
}

/** تقرير واقعي بكل الحقول */
function fullReport(id, name) {
  return {
    id: id,
    createdAt: '2026-01-05T08:00:00.000Z',
    updatedAt: '2026-01-06T09:30:00.000Z',
    title: 'تقرير زيارة تفتيشية إلى ' + name,
    visitType: 'زيارة تفتيشية',
    facilityKind: 'مركز صحي',
    facilityName: name,
    sector: 'قطاع المدائن',
    visitDate: '2026-01-05',
    dayName: 'الاثنين',
    bookNumber: '١٢٣٤',
    population: '٥٥٠٠',
    families: '٩٠٠',
    officials: [{ role: 'مدير المركز', job: 'طبيب', name: 'فلان الفلاني' }],
    staff: { 'الملاك': { total: '55', actual: '32' }, 'الأطباء': { total: '8', actual: '5' } },
    fp: {
      /* أسماء افتراضية واضحة — لا اسم شخص حقيقي في أي ملف بالمشروع */
      managerJob: 'تقني', managerName: 'اسم تجريبي أول', deputyJob: 'طبيب', deputyName: 'اسم تجريبي ثاني',
      devices: '6', deviceState: 'تعمل', staff: '2', adminCount: '1', adminWhere: 'في الجهاز',
      reportFreq: 'يومياً', reportTo: 'القطاع', notes: 'ملاحظة بصمة',
    },
    procedures: [{ date: '2026-01-04', kind: 'سحب موقف', source: 'الأطباء', note: 'ملاحظة' }],
    procExtra: 'سطر إضافي\nوسطر ثانٍ',
    general: ['ملاحظة عامة أولى', 'ملاحظة عامة ثانية'],
    positions: [{
      date: '2026-01-04', day: 'الأحد', verb: 'بعد تدقيق', kind: 'موقف البصمة',
      intro: '', items: { absent: [{ job: 'طبيب', name: 'فلان', note: 'بدون إجازة' }] },
    }],
    records: [{ name: 'سجل الحركة', evalList: ['مُدام وموثق'], evalManual: 'ملاحظة يدوية', eval: '' }],
    recGroups: [
      { letter: 'أ', label: 'شعبة التحقيقات / قسمنا', intro: '', items: ['توصية أولى', 'توصية ثانية'] },
      { letter: 'ب', label: 'قسم الصيانة', intro: '', items: ['توصية ثالثة'] },
    ],
    prevRecs: [{ text: 'توصية سابقة', status: 'منفذة', note: 'تم' }],
    signers: [{ name: 'عضو أول', job: 'ضابط تفتيش', date: '2026-01-05' }],
    footerNote: 'ملاحظة أسفل التقرير',
  };
}

(async () => {
  section('=== ١) تنزيل قاعدة البيانات: البنية تُقرأ صحيحة ===');
  {
    const r1 = fullReport('rep-A', 'مركز صحي الخناسة');
    const r2 = fullReport('rep-B', 'مستشفى ابن القف');
    const env = makeEnv({
      'rep-A': cloudDocFromReport(r1),
      'rep-B': cloudDocFromReport(r2),
    });
    env.metaDoc.payload = {
      settings: { l1: 'دائرة', l2: 'قسم', l3: 'شعبة', font: 'Simplified Arabic', fontSize: '12' },
      library: { records: ['أ', 'ب'], reco: [], general: [] },
      lists: { jobTitles: { values: ['طبيب'] } },
      registry: { facilities: {}, recs: { X: { id: 'X', text: 'ت' } } },
    };
    env.metaDoc.updatedAt = '2026-01-06T10:00:00.000Z';
    env.draftStore.draft = { report: r1, editingId: 'rep-A', at: 1767000000000 };
    env.draftStore.updatedAt = '2026-01-06T10:05:00.000Z';

    await env.connect();
    const res = await env.S.downloadDatabase();
    const got = env.getLocal().reports;

    check('two reports came down', got.length === 2, got.length);
    check('the ids are the Firestore doc ids',
      got.map(r => r.id).sort().join(',') === 'rep-A,rep-B', got.map(r => r.id));

    const A = got.find(r => r.id === 'rep-A');
    check('the report exists', !!A);

    /* ---------------------------------------------------------------------
       المقارنة الحاسمة: **كل حقل** من التقرير الأصلي.
       هذا ما كان يفشل قبل الإصلاح: كانت تُقرأ حقول الفهرس لا `data`.
       --------------------------------------------------------------------- */
    const FIELDS = ['title', 'visitType', 'facilityKind', 'facilityName', 'sector',
      'visitDate', 'dayName', 'bookNumber', 'population', 'families', 'procExtra', 'footerNote'];
    FIELDS.forEach(f => {
      check('field preserved: ' + f, A && A[f] === r1[f], { got: A && A[f], want: r1[f] });
    });

    check('officials preserved (deep)',
      JSON.stringify(A.officials) === JSON.stringify(r1.officials), A.officials);
    check('staff preserved (deep)',
      JSON.stringify(A.staff) === JSON.stringify(r1.staff), A.staff);
    check('fp (fingerprint unit) preserved (deep)',
      JSON.stringify(A.fp) === JSON.stringify(r1.fp), A.fp);
    check('procedures preserved (deep)',
      JSON.stringify(A.procedures) === JSON.stringify(r1.procedures), A.procedures);
    check('general notes preserved',
      JSON.stringify(A.general) === JSON.stringify(r1.general), A.general);
    check('positions preserved (deep)',
      JSON.stringify(A.positions) === JSON.stringify(r1.positions), A.positions);
    check('records preserved — this is what used to be lost',
      JSON.stringify(A.records) === JSON.stringify(r1.records), A.records);
    check('recGroups preserved — this is what used to be lost',
      JSON.stringify(A.recGroups) === JSON.stringify(r1.recGroups), A.recGroups);
    check('prevRecs preserved',
      JSON.stringify(A.prevRecs) === JSON.stringify(r1.prevRecs), A.prevRecs);
    check('signers preserved',
      JSON.stringify(A.signers) === JSON.stringify(r1.signers), A.signers);

    /* لا تُسرَّب حقول الفهرس إلى التقرير */
    check('the report does NOT carry the wrapper doc fields',
      A.deleted === undefined && A.device === undefined && A.data === undefined,
      { deleted: A.deleted, device: A.device, data: typeof A.data });

    check('updatedAt came from the cloud doc',
      A.updatedAt === '2026-01-06T09:30:00.000Z', A.updatedAt);

    /* بقية المجموعات */
    const L = env.getLocal();
    check('settings came down', !!(L.settings && L.settings.l1 === 'دائرة'), L.settings);
    check('library came down', !!(L.library && L.library.records.length === 2), L.library);
    check('lists came down', !!(L.lists && L.lists.jobTitles), L.lists);
    check('registry came down', !!(L.registry && L.registry.recs.X), L.registry);
    check('draft came down', !!(L.draft && L.draft.report), L.draft);
    check('download reports the count', res.reports === 2, res);
  }

  section('=== ٢) تنزيل قاعدة البيانات: الشواهد تُستبعد ===');
  {
    const alive = fullReport('keep', 'مركز صحي حي');
    const dead = fullReport('gone', 'مركز صحي محذوف');
    const env = makeEnv({
      keep: cloudDocFromReport(alive),
      gone: cloudDocFromReport(Object.assign({}, dead, { _deleted: true })),
    });
    env.metaDoc.payload = { settings: null, library: null, lists: null, registry: null };
    await env.connect();
    await env.S.downloadDatabase();
    const got = env.getLocal().reports;
    check('the deleted document is EXCLUDED', got.length === 1, got.map(r => r.id));
    check('and the live one is present', got[0] && got[0].id === 'keep', got.map(r => r.id));
    check('no tombstone reaches the archive', !got.some(r => r._deleted), got);
  }

  section('=== ٣) تنزيل: مستند بلا data (شاهد قديم) ===');
  {
    const env = makeEnv({
      weird: { id: 'weird', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
      good: cloudDocFromReport(fullReport('good', 'مركز صحي سليم')),
    });
    env.metaDoc.payload = {};
    await env.connect();
    await env.S.downloadDatabase();
    const got = env.getLocal().reports;
    check('a doc without data is skipped', got.length === 1, got.map(r => r.id));
    check('the valid doc is kept', got[0].id === 'good', got.map(r => r.id));
  }

  section('=== ٤) الرفع: استبدال كامل لا دمج ===');
  {
    /* السحابة فيها ٤ تقارير، والمحلي فيه ٢ — يجب أن يُطمس الزائد */
    const env = makeEnv({
      a: cloudDocFromReport(fullReport('a', 'أ')),
      b: cloudDocFromReport(fullReport('b', 'ب')),
      c: cloudDocFromReport(fullReport('c', 'ج')),
      d: cloudDocFromReport(fullReport('d', 'د')),
    });
    env.metaDoc.payload = { settings: null };
    env.setLocal({
      reports: [fullReport('a', 'أ'), fullReport('b', 'ب')],
      settings: { l1: 'محلي' }, library: null, lists: null, registry: null, draft: null,
    });
    await env.connect();
    const res = await env.S.uploadDatabase();

    check('upload reports two local reports', res.reports === 2, res);
    check('upload reports two removals', res.removed === 2, res);

    const docs = [];
    for (let i = 0; i < 1; i++) { /* نحتاج الوصول إلى المخزن */ }
    const live = [];
    env.store.forEach((v, k) => { if (!v.deleted && v.data) live.push(k); });
    check('only the two local reports remain live',
      live.sort().join(',') === 'a,b', live.sort());

    check('c is tombstoned', (env.store.get('c') || {}).deleted === true, env.store.get('c'));
    check('d is tombstoned', (env.store.get('d') || {}).deleted === true, env.store.get('d'));
    check('a tombstone has no data', (env.store.get('c') || {}).data === null,
      env.store.get('c'));
    check('a and b survive with their content',
      (env.store.get('a') || {}).data && env.store.get('a').data.recGroups.length === 2,
      env.store.get('a') && env.store.get('a').data);
  }

  section('=== ٥) الرفع: لا يطمس ما هو محلي أصلاً ===');
  {
    const env = makeEnv({
      x: cloudDocFromReport(fullReport('x', 'س')),
    });
    env.metaDoc.payload = {};
    env.setLocal({ reports: [fullReport('x', 'س'), fullReport('y', 'ع')], settings: null });
    await env.connect();
    const res = await env.S.uploadDatabase();
    check('nothing was removed', res.removed === 0, res);
    const live = [];
    env.store.forEach((v, k) => { if (!v.deleted && v.data) live.push(k); });
    check('both reports are live in the cloud', live.sort().join(',') === 'x,y', live.sort());
  }

  section('=== ٦) الرفع: المسودة تُستبدل حتى بالغياب ===');
  {
    const env = makeEnv({});
    env.metaDoc.payload = {};
    env.draftStore.draft = { report: fullReport('old', 'مسودة قديمة'), at: 1 };
    env.setLocal({ reports: [], settings: null, draft: null });
    await env.connect();
    await env.S.uploadDatabase();
    check('the cloud draft is CLEARED when there is no local draft',
      env.draftStore.draft === null, env.draftStore.draft);
  }
  {
    const env = makeEnv({});
    env.metaDoc.payload = {};
    env.draftStore.draft = { report: fullReport('old', 'قديمة'), at: 1 };
    const mine = { report: fullReport('mine', 'مسودتي'), at: 2 };
    env.setLocal({ reports: [], settings: null, draft: mine });
    await env.connect();
    await env.S.uploadDatabase();
    check('the cloud draft is REPLACED by the local one',
      env.draftStore.draft && env.draftStore.draft.report.id === 'mine',
      env.draftStore.draft);
  }

  section('=== ٧) الإعدادات تُستبدل حتى بالغياب ===');
  {
    const env = makeEnv({});
    env.metaDoc.payload = { settings: { l1: 'قديم' }, library: { records: ['x'] } };
    env.setLocal({ reports: [], settings: null, library: null, lists: null, registry: null });
    await env.connect();
    await env.S.uploadDatabase();
    check('settings are stored as null when absent locally',
      env.metaDoc.payload.settings === null, env.metaDoc.payload.settings);
    check('library is stored as null when absent locally',
      env.metaDoc.payload.library === null, env.metaDoc.payload.library);
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('TEST ERROR: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
