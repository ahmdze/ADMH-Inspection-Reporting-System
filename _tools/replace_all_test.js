/* =============================================================================
   سلامة الاستبدال الكامل — _tools/replace_all_test.js
   =============================================================================
   يفحص الأعطال التي رصدها المراجع في تنزيل قاعدة البيانات واستعادة النسخ:

     ١) التنزيل يجب أن **يمسح** ما ليس في السحابة، لا أن يُبقي قيمة قديمة.
        (وإلا صار الجهاز خليطاً من حسابين.)
     ٢) فشل قراءة Firestore يجب أن **يُلغي** الاستبدال، لا أن يبدو «سحابة فارغة».
     ٣) المزامنة الذكية يجب أن **ترفع المسودة المحلية** إن كانت هي الأحدث،
        ولا ترفعها إن كانت مسودة الطرف الآخر أحدث.
     ٤) أوقات المحتوى لا تُولَّد من جديد عند الدفع — وإلا ظهر تعارض كاذب.

   مُحاكي Firestore هنا يسمح **بإفشال القراءة عمداً**، وهذا ما لم يكن ممكناً
   في الاختبارات السابقة.
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
   بيئة اختبار: Firestore وهمي يمكن إفشاله
   ============================================================================= */
function makeEnv(opts) {
  opts = opts || {};
  const store = new Map();
  Object.keys(opts.docs || {}).forEach(k => store.set(k, opts.docs[k]));

  const meta = { payload: opts.payload || {}, updatedAt: opts.metaAt || new Date().toISOString() };
  const draft = { draft: opts.draft || null, updatedAt: opts.draftAt || null };

  /* عدّادات: نعرف بالضبط ماذا حدث */
  const calls = { draftSet: 0, draftGet: 0, reportsGet: 0, settingsSet: 0, tombstoned: [] };

  const failMode = opts.fail || {};       /* { reports, settings, draft } */

  const docRef = (kind, id) => ({
    set: (v, o) => {
      if (kind === 'meta' && id === 'draft') { calls.draftSet++; draft.draft = v.draft; draft.updatedAt = v.updatedAt; return Promise.resolve(); }
      if (kind === 'meta') { calls.settingsSet++; Object.assign(meta, v); return Promise.resolve(); }
      if (o && o.merge) store.set(id, Object.assign({}, store.get(id) || {}, v));
      else store.set(id, JSON.parse(JSON.stringify(v)));
      if (v && v.deleted) calls.tombstoned.push(id);
      return Promise.resolve();
    },
    get: () => {
      if (kind === 'meta' && id === 'draft') {
        calls.draftGet++;
        if (failMode.draft) return Promise.reject(new Error('draft read failed'));
        return Promise.resolve({ exists: !!draft.draft, data: () => draft });
      }
      if (kind === 'meta') {
        if (failMode.settings) return Promise.reject(new Error('settings read failed'));
        return Promise.resolve({ exists: true, data: () => meta });
      }
      return Promise.resolve({ exists: store.has(id), data: () => store.get(id) });
    },
  });

  const reportsCol = () => ({
    doc: id => docRef('reports', id),
    get: () => {
      calls.reportsGet++;
      if (failMode.reports) return Promise.reject(new Error('reports read failed'));
      return Promise.resolve({
        forEach: cb => store.forEach((v, k) => cb({ id: k, data: () => v })),
        docs: [], size: store.size,
      });
    },
  });

  const batchOps = [];
  const sb = {
    console: { log() { if (globalThis.__showLog) try { process.stdout.write('[SYNC] ' + Array.prototype.join.call(arguments, ' ') + String.fromCharCode(10)); } catch (e) {} }, warn() {}, error() {} },
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
    document: { createElement: () => ({ set src(v) {}, onload: null }), head: { appendChild() {} } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  sb.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };

  sb.firebase = {
    apps: [], initializeApp() { this.apps.push({}); return {}; }, app: () => ({}),
    auth: () => ({
      currentUser: { uid: 'uid-1', email: 'me@t.iq' },
      onAuthStateChanged: fn => { setTimeout(() => fn({ uid: 'uid-1', email: 'me@t.iq' }), 3); return () => {}; },
      signInWithPopup: () => Promise.resolve({ user: { uid: 'uid-1', email: 'me@t.iq' } }),
      getRedirectResult: () => Promise.resolve(null),
      signOut: () => Promise.resolve(),
      GoogleAuthProvider: class { setCustomParameters() {} credential() { return {}; } },
    }),
    firestore: () => ({
      enablePersistence: () => Promise.resolve(),
      collection: () => ({
        doc: () => ({
          collection: name => (name === 'reports' ? reportsCol() : {
            doc: which => docRef('meta', which),
          }),
        }),
      }),
      batch: () => ({
        set: (ref, v, o) => { batchOps.push({ ref, v, o }); },
        commit: () => { batchOps.forEach(op => op.ref.set(op.v, op.o)); batchOps.length = 0; return Promise.resolve(); },
      }),
    }),
  };
  sb.firebase.auth.GoogleAuthProvider = sb.firebase.auth().GoogleAuthProvider;
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  require('./_gis_mock.js').installGis(sb, { mode: 'ok' });
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8'), sb, { filename: 'sync.js' });

  const S = sb.window.ADMHSync;
  let local = Object.assign({ reports: [], settings: null, library: null, lists: null, registry: null }, opts.local || {});
  S.init({
    load: () => JSON.parse(JSON.stringify(local)),
    save: p => {
      if (Array.isArray(p.reports)) local.reports = p.reports;
      if (p.settings) local.settings = p.settings;
      if (p.library) local.library = p.library;
      if (p.lists) local.lists = p.lists;
      if (p.registry) local.registry = p.registry;
      if (p.draftFromCloud && p.draft) local.draft = p.draft;
      if (p.synced) local.synced = Object.assign({}, local.synced || {}, p.synced);
      return { ok: true };
    },
  });
  return {
    S, store, meta, draft, calls,
    getLocal: () => local,
    setLocal: l => { local = l; },
    connect: () => S.connect().catch(() => {}),
  };
}

/** تقرير تجريبي */
function mkReport(id, name) {
  return { id: id, facilityName: name, sector: 'قطاع', visitDate: '2026-01-01',
    updatedAt: '2026-01-01T00:00:00.000Z', recGroups: [{ letter: 'أ', label: 'ج', items: ['ت'] }],
    records: [{ name: 'سجل' }] };
}
/** مستند سحابي بالشكل الذي تكتبه pushReports */
function cloudDoc(r) {
  return { id: r.id, title: '', facilityName: r.facilityName, deleted: false,
    updatedAt: r.updatedAt, device: 'x', data: JSON.parse(JSON.stringify(r)) };
}

(async () => {
  /* =========================================================================
     ١) التنزيل يمسح ما ليس في السحابة
     ========================================================================= */
  section('=== ١) التنزيل: استبدال كامل لا دمج ===');
  {
    const env = makeEnv({
      docs: { a: cloudDoc(mkReport('a', 'من السحابة')) },
      payload: { settings: null, library: null, lists: null, registry: null },
      /* الجهاز فيه بقايا حساب سابق */
      local: {
        reports: [mkReport('old1', 'قديم'), mkReport('old2', 'قديم أيضاً')],
        settings: { l1: 'إعداد حساب سابق' },
        library: { records: ['عبارة قديمة'], reco: [], general: [] },
        lists: { jobTitles: { values: ['قديم'] } },
      },
    });
    await env.connect();
    const res = await env.S.downloadDatabase();

    const L = env.getLocal();
    check('reports are replaced, not merged', L.reports.length === 1 && L.reports[0].id === 'a',
      L.reports.map(r => r.id));
    check('the cloud report arrived with its content',
      L.reports[0] && L.reports[0].recGroups && L.reports[0].recGroups.length === 1,
      L.reports[0]);
    check('download reports hasDraft is false when the cloud has no draft',
      res.hasDraft === false, res);
  }

  /* =========================================================================
     ٢) فشل القراءة يُلغي الاستبدال
     ========================================================================= */
  section('=== ٢) فشل القراءة: يُلغى الاستبدال ولا تُمحى البيانات ===');
  {
    const env = makeEnv({
      docs: { a: cloudDoc(mkReport('a', 'من السحابة')) },
      payload: {},
      fail: { reports: true },
      local: { reports: [mkReport('keep', 'يجب أن يبقى')], settings: { l1: 'محلي' } },
    });
    await env.connect();

    let threw = null;
    try { await env.S.downloadDatabase(); } catch (e) { threw = e; }

    check('download REJECTS when the reports read fails', !!threw,
      threw && threw.message);
    check('the rejection message says nothing was replaced',
      !!(threw && /استبدال/.test(threw.message || '')), threw && threw.message);
    check('the local reports are UNTOUCHED',
      env.getLocal().reports.length === 1 && env.getLocal().reports[0].id === 'keep',
      env.getLocal().reports.map(r => r.id));
    check('the local settings are UNTOUCHED',
      env.getLocal().settings && env.getLocal().settings.l1 === 'محلي',
      env.getLocal().settings);
  }

  section('=== ٢ب) فشل قراءة الإعدادات يُلغي الاستبدال أيضاً ===');
  {
    const env = makeEnv({
      docs: { a: cloudDoc(mkReport('a', 'س')) },
      fail: { settings: true },
      local: { reports: [mkReport('keep', 'يبقى')], library: { records: ['محلي'], reco: [], general: [] } },
    });
    await env.connect();
    let threw = null;
    try { await env.S.downloadDatabase(); } catch (e) { threw = e; }
    check('download rejects on a settings read failure', !!threw, threw && threw.message);
    check('the local library survives', !!(env.getLocal().library &&
      env.getLocal().library.records.indexOf('محلي') >= 0), env.getLocal().library);
  }

  section('=== ٢ج) فشل قراءة المسودة يُلغي الاستبدال ===');
  {
    const env = makeEnv({
      docs: { a: cloudDoc(mkReport('a', 'س')) },
      fail: { draft: true },
      local: { reports: [mkReport('keep', 'يبقى')] },
    });
    await env.connect();
    let threw = null;
    try { await env.S.downloadDatabase(); } catch (e) { threw = e; }
    check('download rejects on a draft read failure', !!threw, threw && threw.message);
    check('the local reports survive', env.getLocal().reports[0].id === 'keep',
      env.getLocal().reports.map(r => r.id));
  }

  /* =========================================================================
     ٣) المزامنة الذكية ترفع المسودة
     ========================================================================= */
  section('=== ٣) المزامنة الذكية: رفع المسودة ===');
  {
    /* المحلية أحدث ← يجب أن تُرفع */
    const localDraft = { report: mkReport('local', 'مسودتي'), editingId: 'local', at: Date.now() };
    const env = makeEnv({
      docs: {}, payload: { settings: null, library: null, lists: null, registry: null },
      draft: { report: mkReport('cloud', 'مسودة قديمة'), at: 1 },
      draftAt: '2020-01-01T00:00:00.000Z',            /* سحابية قديمة جداً */
      local: { reports: [], draft: localDraft },
    });
    await env.connect();
    const res = await env.S.syncNow();

    check('the smart sync reports it pushed the draft', res.draftPushed === true, res);
    check('the local draft actually reached the cloud',
      !!(env.draft.draft && env.draft.draft.report && env.draft.draft.report.id === 'local'),
      env.draft.draft && env.draft.draft.report && env.draft.draft.report.id);
    check('it did NOT take the older cloud draft',
      res.draftFromCloud !== true, res.draftFromCloud);
  }

  section('=== ٣ب) المسودة السحابية أحدث: تُسحب ولا تُطمس ===');
  {
    const env = makeEnv({
      docs: {}, payload: { settings: null, library: null, lists: null, registry: null },
      draft: { report: mkReport('cloud', 'مسودة أحدث'), at: 2 },
      draftAt: new Date(Date.now() + 60000).toISOString(),   /* أحدث من المحلية */
      local: {
        reports: [],
        draft: { report: mkReport('local', 'مسودتي'), editingId: 'local', at: 1 },
      },
    });
    await env.connect();
    const res = await env.S.syncNow();

    check('the newer cloud draft was pulled', res.draftFromCloud === true, res);
    check('the local draft was NOT pushed over it', res.draftPushed !== true, res);
    check('the cloud draft is unchanged',
      env.draft.draft && env.draft.draft.report.id === 'cloud',
      env.draft.draft && env.draft.draft.report.id);
  }

  section('=== ٣ج) لا مسودة محلية: لا دفع ===');
  {
    const env = makeEnv({
      docs: {}, payload: { settings: null, library: null, lists: null, registry: null },
      draft: null, local: { reports: [] },
    });
    await env.connect();
    const res = await env.S.syncNow();
    check('nothing is pushed when there is no local draft', res.draftPushed !== true, res);
    check('and the cloud draft stays absent', env.draft.draft === null, env.draft.draft);
  }

  /* =========================================================================
     ٤) أوقات المحتوى لا تُولَّد من جديد
     ========================================================================= */
  section('=== ٤) أوقات المحتوى: لا يُولَّد وقت جديد بلا تغيير ===');
  {
    const libAt = new Date(Date.now() - 3600000).toISOString();     /* ساعة مضت */
    const env = makeEnv({
      docs: {}, payload: {
        settings: null,
        library: { records: ['أصل'] }, libraryAt: libAt,
        lists: null, registry: null,
      },
      local: {
        reports: [],
        library: { records: ['أصل'] }, libraryAt: libAt,
        synced: { library: libAt },
      },
    });
    await env.connect();
    await env.S.syncNow();

    const pushedAt = env.meta.payload && env.meta.payload.libraryAt;
    check('the pushed libraryAt is the ORIGINAL content time, not now',
      pushedAt === libAt, { pushed: pushedAt, want: libAt });
  }

  section('=== ٤ب) مزامنة ← تعديل محلي ← مزامنة: بلا تعارض كاذب ===');
  {
    const libAt0 = new Date(Date.now() - 7200000).toISOString();
    const env = makeEnv({
      docs: {}, payload: { settings: null, library: { records: ['أصل'] }, libraryAt: libAt0 },
      local: { reports: [], library: { records: ['أصل'] }, libraryAt: libAt0, synced: { library: libAt0 } },
    });
    await env.connect();

    const r1 = await env.S.syncNow();
    check('first sync succeeds', !!r1, r1);
    check('first sync reports no conflict', !(r1 && r1.conflictNotice), r1 && r1.conflictNotice);

    /* تعديل محلي فقط */
    const libAt1 = new Date().toISOString();
    const L = env.getLocal();
    L.library = { records: ['أصل', 'أُضيف محلياً'] };
    L.libraryAt = libAt1;
    env.setLocal(L);

    const r2 = await env.S.syncNow();
    check('second sync reports NO false conflict', !(r2 && r2.conflictNotice),
      { notice: r2 && r2.conflictNotice, pushedAt: env.meta.payload.libraryAt });
    check('the local edit reached the cloud',
      !!(env.meta.payload.library && env.meta.payload.library.records.indexOf('أُضيف محلياً') >= 0),
      env.meta.payload.library);

    const r3 = await env.S.syncNow();
    check('third sync with no changes is quiet', !(r3 && r3.conflictNotice),
      r3 && r3.conflictNotice);
  }

  section('=== ٤ج) تغيّر الطرفان فعلاً: تعارض حقيقي يُبلَّغ ===');
  {
    const base = new Date(Date.now() - 7200000).toISOString();
    const env = makeEnv({
      docs: {}, payload: { settings: null, library: { records: ['أصل'] }, libraryAt: base },
      local: { reports: [], library: { records: ['أصل'] }, libraryAt: base, synced: { library: base } },
    });
    await env.connect();
    await env.S.syncNow();

    /* الطرف الآخر يعدّل، والمحلي يعدّل */
    env.meta.payload.library = { records: ['من الجهاز الآخر'] };
    env.meta.payload.libraryAt = new Date(Date.now() + 5000).toISOString();

    const L = env.getLocal();
    L.library = { records: ['من جهازي'] };
    L.libraryAt = new Date(Date.now() + 9000).toISOString();
    env.setLocal(L);

    const r = await env.S.syncNow();
    check('a REAL conflict is reported', !!(r && r.conflictNotice), r && r.conflictNotice);
    check('the conflict names the library',
      !!(r && /مكتبة/.test(r.conflictNotice || '')), r && r.conflictNotice);
    check('the LOCAL edit is kept, not silently overwritten',
      env.getLocal().library.records.indexOf('من جهازي') >= 0, env.getLocal().library);
  }

  /* =========================================================================
     ٥) الرفع: استبدال كامل + طمس الزائد
     ========================================================================= */
  section('=== ٥) الرفع: استبدال كامل ===');
  {
    const env = makeEnv({
      docs: {
        a: cloudDoc(mkReport('a', 'أ')),
        b: cloudDoc(mkReport('b', 'ب')),
        c: cloudDoc(mkReport('c', 'ج')),
      },
      payload: {},
      local: { reports: [mkReport('a', 'أ'), mkReport('b', 'ب')] },
    });
    await env.connect();
    const res = await env.S.uploadDatabase();

    check('two reports uploaded', res.reports === 2, res);
    check('one cloud-only report was removed', res.removed === 1, res);
    check('the extra report is tombstoned', (env.store.get('c') || {}).deleted === true,
      env.store.get('c'));
    check('the tombstone has no data', (env.store.get('c') || {}).data === null,
      env.store.get('c'));
    check('the kept report retains its content',
      !!((env.store.get('a') || {}).data || {}).recGroups, env.store.get('a'));
  }

  section('=== ٥ب) الرفع بلا مسودة محلية: يمسح المسودة السحابية ===');
  {
    const env = makeEnv({
      docs: {}, payload: {},
      draft: { report: mkReport('old', 'مسودة قديمة'), at: 1 },
      local: { reports: [], draft: null },
    });
    await env.connect();
    await env.S.uploadDatabase();
    check('the cloud draft is cleared', env.draft.draft === null, env.draft.draft);
  }

  console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('TEST ERROR: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
