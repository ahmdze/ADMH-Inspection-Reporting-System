/* =============================================================================
   history.js unit tests — منطق خالص، بلا متصفح
   ============================================================================= */
const fs = require('fs'), path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { pass++; }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
};
const section = t => console.log('\n' + t);

const sb = { console, Date, JSON, Object, Array, String, Number, Math, isNaN, parseInt, parseFloat, RegExp, Boolean, Error };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'history.js'), 'utf8'), sb, { filename: 'history.js' });
const H = sb.window.ADMHReport.history;

const mkReport = (over) => Object.assign({
  id: 'rep-1', title: 'تقرير زيارة', facilityName: 'مركز صحي أ', sector: 'قطاع ١',
  visitType: 'زيارة تفتيشية', visitDate: '2026-01-10',
  officials: [{ role: 'مدير', name: 'فلان' }],
  procedures: [], general: [], positions: [], records: [],
  recGroups: [{ letter: 'أ', label: 'جهة', items: ['توصية'] }],
  prevRecs: [], signers: [], population: '', families: '',
}, over || {});

section('=== ١) البصمة والنسخ العميق ===');
{
  check('same object → same fingerprint',
    H.fingerprint({ a: 1, b: 2 }) === H.fingerprint({ a: 1, b: 2 }));
  check('key ORDER does not change the fingerprint',
    H.fingerprint({ a: 1, b: 2 }) === H.fingerprint({ b: 2, a: 1 }));
  check('different values → different fingerprint',
    H.fingerprint({ a: 1 }) !== H.fingerprint({ a: 2 }));
  check('nested key order does not matter',
    H.fingerprint({ x: { a: 1, b: 2 } }) === H.fingerprint({ x: { b: 2, a: 1 } }));
  check('arrays are order-sensitive',
    H.fingerprint([1, 2]) !== H.fingerprint([2, 1]));
  check('null and undefined do not throw',
    typeof H.fingerprint(null) === 'string' && typeof H.fingerprint(undefined) === 'string');

  const src = { a: { b: [1, 2] } };
  const cp = H.deepCopy(src);
  cp.a.b.push(3);
  check('deep copy is independent', src.a.b.length === 2, src.a.b.length);
}

section('=== ٢) متى تُسجَّل اللقطة؟ ===');
{
  let hist = H.blankHistory();
  const r = mkReport();
  check('first snapshot is recorded', H.shouldRecord(hist, r) === true);

  hist = H.record(hist, r);
  check('and it is stored', H.listFor(hist, 'rep-1').length === 1);

  check('identical content is NOT recorded again', H.shouldRecord(hist, r) === false);

  /* تغيير قبل انقضاء الفاصل الزمني ← لا لقطة تلقائية */
  const changed = mkReport({ title: 'عنوان جديد' });
  check('a change inside the time gap is skipped',
    H.shouldRecord(hist, changed, { now: new Date(Date.now() + 1000) }) === false);

  /* بعد انقضاء الفاصل ← تُسجَّل */
  check('a change after the gap is recorded',
    H.shouldRecord(hist, changed, { now: new Date(Date.now() + H.MIN_GAP_MS + 1000) }) === true);

  /* force يتجاوز الفاصل */
  check('force ignores the time gap',
    H.shouldRecord(hist, changed, { force: true, now: new Date() }) === true);
  check('but force still refuses identical content',
    H.shouldRecord(hist, r, { force: true }) === false);

  check('no report → no snapshot', H.shouldRecord(hist, null) === false);
  check('report without id → no snapshot', H.shouldRecord(hist, { title: 'x' }) === false);
}

section('=== ٣) التسجيل والحفظ ===');
{
  let hist = H.blankHistory();
  const r1 = mkReport();
  hist = H.record(hist, r1, { reason: 'الحفظ في الأرشيف' });
  const list = H.listFor(hist, 'rep-1');
  check('entry has an id', typeof list[0].id === 'string' && list[0].id.length > 1);
  check('entry has a timestamp', !isNaN(Date.parse(list[0].at)));
  check('reason is kept', list[0].reason === 'الحفظ في الأرشيف', list[0].reason);
  check('facility copied for display', list[0].facility === 'مركز صحي أ', list[0].facility);

  /* اللقطة مستقلة عن التقرير الأصلي */
  const r2 = mkReport({ title: 'ثانٍ' });
  hist = H.record(hist, r2, { force: true, reason: 'تعديل' });
  r2.title = 'غُيّر بعد اللقطة';
  const list2 = H.listFor(hist, 'rep-1');
  check('snapshot is independent of later mutation',
    list2[0].snapshot.title === 'ثانٍ', list2[0].snapshot.title);

  /* الأحدث أولاً */
  check('newest snapshot first', list2.length === 2 && list2[0].snapshot.title === 'ثانٍ',
    list2.map(e => e.snapshot.title));

  /* الحدّ الأقصى */
  let h3 = H.blankHistory();
  for (let i = 0; i < H.MAX_PER_REPORT + 12; i++) {
    h3 = H.record(h3, mkReport({ title: 'نسخة ' + i }), { force: true });
  }
  check('snapshots are capped per report',
    H.listFor(h3, 'rep-1').length === H.MAX_PER_REPORT, H.listFor(h3, 'rep-1').length);
  check('and the newest survives the cap',
    H.listFor(h3, 'rep-1')[0].snapshot.title === 'نسخة ' + (H.MAX_PER_REPORT + 11),
    H.listFor(h3, 'rep-1')[0].snapshot.title);
}

section('=== ٤) الاستعادة ===');
{
  let hist = H.blankHistory();
  hist = H.record(hist, mkReport({ title: 'الأصلي' }), { force: true });
  hist = H.record(hist, mkReport({ title: 'المعدَّل' }), { force: true });

  const list = H.listFor(hist, 'rep-1');
  const old = list[1];
  const snap = H.snapshotOf(hist, 'rep-1', old.id);
  check('snapshot can be retrieved', !!snap);
  check('it holds the old title', snap.title === 'الأصلي', snap.title);

  /* النسخة المستعادة مستقلة */
  snap.title = 'تغيير في النسخة المستعادة';
  const again = H.snapshotOf(hist, 'rep-1', old.id);
  check('retrieved snapshot is a copy (mutating it does not corrupt storage)',
    again.title === 'الأصلي', again.title);

  check('unknown entry → null', H.snapshotOf(hist, 'rep-1', 'nope') === null);
  check('unknown report → null', H.snapshotOf(hist, 'other', old.id) === null);
  check('findEntry on unknown report → null', H.findEntry(hist, 'other', 'x') === null);
}

section('=== ٥) الحذف والتنظيف ===');
{
  let hist = H.blankHistory();
  hist = H.record(hist, mkReport(), { force: true });
  hist = H.record(hist, mkReport({ id: 'rep-2' }), { force: true });
  check('two reports tracked', Object.keys(hist.reports).length === 2, Object.keys(hist.reports).length);

  check('dropping a report works', H.dropReport(hist, 'rep-1') === true);
  check('and it is gone', !hist.reports['rep-1']);
  check('others survive', !!hist.reports['rep-2']);
  check('dropping a missing report returns false', H.dropReport(hist, 'nope') === false);

  check('count sums all snapshots', H.count(hist) === 1, H.count(hist));
  check('count of an empty history is 0', H.count(H.blankHistory()) === 0);
}

section('=== ٦) التقليم ===');
{
  /* العمر */
  let hist = H.blankHistory();
  const old = new Date(Date.now() - 400 * 86400000).toISOString();
  const fresh = new Date().toISOString();
  hist.reports['rep-1'] = [
    { id: 'a', at: old, snapshot: {} },
    { id: 'b', at: fresh, snapshot: {} },
  ];
  H.prune(hist, { now: new Date(), maxAgeDays: 180 });
  check('old snapshots are dropped by age',
    H.listFor(hist, 'rep-1').length === 1, H.listFor(hist, 'rep-1').length);
  check('recent ones survive', H.listFor(hist, 'rep-1')[0].id === 'b');

  /* العدد */
  let h2 = H.blankHistory();
  for (let i = 0; i < 10; i++) {
    h2.reports['rep-' + i] = [{ id: 'x', at: new Date(Date.now() - i * 1000).toISOString(), snapshot: {} }];
  }
  H.prune(h2, { maxReports: 3 });
  check('report count is capped', Object.keys(h2.reports).length === 3, Object.keys(h2.reports).length);
  check('the newest reports are kept',
    h2.reports['rep-0'] && h2.reports['rep-1'] && h2.reports['rep-2'],
    Object.keys(h2.reports));

  /* تقرير صار بلا لقطات يُحذف */
  let h3 = H.blankHistory();
  h3.reports['rep-x'] = [{ id: 'a', at: old, snapshot: {} }];
  H.prune(h3, { now: new Date(), maxAgeDays: 30 });
  check('a report with no surviving snapshots is removed entirely',
    !h3.reports['rep-x'], Object.keys(h3.reports));

  /* الحالات الحدّية */
  check('prune(null) does not throw', !!H.prune(null));
  check('prune(blank) does not throw', !!H.prune(H.blankHistory()));
}

section('=== ٧) المقارنة (الفرق) ===');
{
  const a = mkReport({ title: 'قديم', population: '100', records: [] });
  const b = mkReport({ title: 'جديد', population: '150', records: [{ name: 'سجل' }] });
  const d = H.diff(a, b);
  check('diff reports changes', d.length >= 3, d.length);
  check('title change is described in Arabic',
    d.some(x => x.label === 'العنوان' && x.before === 'قديم' && x.after === 'جديد'),
    d.filter(x => x.label === 'العنوان'));
  check('population change is detected',
    d.some(x => x.label === 'عدد النفوس'), d.map(x => x.label));
  check('record count change is detected',
    d.some(x => x.label === 'السجلات' && x.after === '1 صف'),
    d.filter(x => x.label === 'السجلات'));

  check('identical reports → no differences', H.diff(a, mkReport({ title: 'قديم', population: '100', records: [] })).length === 0,
    H.diff(a, mkReport({ title: 'قديم', population: '100', records: [] })));
  check('null inputs → empty diff', H.diff(null, b).length === 0 && H.diff(a, null).length === 0);

  /* المسافات لا تُحتسب فرقاً */
  check('whitespace-only differences are ignored',
    H.diff(mkReport({ title: 'نص' }), mkReport({ title: '  نص  ' })).length === 0);
}

section('=== ٨) سلامة البنية ===');
{
  check('normalize(null) → blank', Object.keys(H.normalize(null).reports).length === 0);
  check('normalize("garbage") → blank', Object.keys(H.normalize('x').reports).length === 0);
  check('normalize([]) → blank', Object.keys(H.normalize([1, 2]).reports).length === 0);
  check('normalize drops entries without a snapshot',
    H.normalize({ reports: { r: [{ id: 'a' }, { id: 'b', at: '', snapshot: { x: 1 } }] } })
      .reports.r.length === 1);
  check('normalize caps over-long lists',
    H.normalize({ reports: { r: new Array(H.MAX_PER_REPORT + 20).fill({ id: 'a', at: '', snapshot: {} }) } })
      .reports.r.length === H.MAX_PER_REPORT);
  check('normalize fixes a missing timestamp',
    !isNaN(Date.parse(H.normalize({ reports: { r: [{ id: 'a', snapshot: {} }] } }).reports.r[0].at)));
  check('record on an invalid history does not throw', !!H.record(null, mkReport()));
  check('listFor on an invalid history → []', H.listFor(null, 'x').length === 0);
}

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
