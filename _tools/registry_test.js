/* =============================================================================
   registry.js unit tests — منطق خالص، بلا متصفح
   -----------------------------------------------------------------------------
   يغطي: مفتاح المؤسسة · ملف المؤسسة · دورة حياة التوصيات · التأخير · المؤشرات
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

/* نُحمّل الوحدة في سياق نظيف */
const sb = {
  console, Date, JSON, Object, Array, String, Number, Math, isNaN,
  parseInt, parseFloat, RegExp, Boolean, Error,
};
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'registry.js'), 'utf8'), sb, { filename: 'registry.js' });
const R = sb.window.ADMHReport.registry;

/* ---------- تقارير اختبار ---------- */
const mkReport = (id, name, sector, date, type, recs, records) => ({
  id, facilityName: name, sector, visitDate: date, visitType: type,
  facilityKind: 'مركز صحي',
  title: 'تقرير ' + type + ' إلى ' + name,
  recGroups: (recs || []).map((items, i) => ({
    letter: 'أ ب ج د ه'.split(' ')[i] || 'أ',
    label: 'جهة ' + (i + 1),
    items: items,
  })),
  records: records || [],
});

section('=== ١) مفتاح المؤسسة: توحيد التهجئة ===');
{
  check('same name + sector → same key',
    R.facilityKey('مركز صحي الخناسة', 'قطاع المدائن') === R.facilityKey('مركز صحي الخناسة', 'قطاع المدائن'));
  check('ة/ه variation matches',
    R.facilityKey('مركز صحي الخناسة') === R.facilityKey('مركز صحي الخناسه'));
  check('أ/ا variation matches',
    R.facilityKey('مركز صحي الأمين') === R.facilityKey('مركز صحي الامين'));
  check('ى/ي variation matches',
    R.facilityKey('مستشفى ابن القف') === R.facilityKey('مستشفي ابن القف'));
  check('diacritics ignored',
    R.facilityKey('مَرْكَز صِحّي') === R.facilityKey('مركز صحي'));
  check('extra spaces and punctuation collapse',
    R.facilityKey('مركز   صحي،  الخناسة') === R.facilityKey('مركز صحي الخناسة'));
  check('different sector → different key',
    R.facilityKey('مركز صحي الخناسة', 'قطاع أ') !== R.facilityKey('مركز صحي الخناسة', 'قطاع ب'));
  check('different facility → different key',
    R.facilityKey('مركز صحي أ') !== R.facilityKey('مركز صحي ب'));
  check('empty name → empty key', R.facilityKey('', '') === '');
}

section('=== ٢) معرّف التوصية الثابت ===');
{
  check('same inputs → same id', R.recId('k', 1, 'نص') === R.recId('k', 1, 'نص'));
  check('different text → different id', R.recId('k', 1, 'نص') !== R.recId('k', 1, 'نص آخر'));
  check('different index → different id', R.recId('k', 1, 'نص') !== R.recId('k', 2, 'نص'));
  check('different facility → different id', R.recId('a', 1, 'نص') !== R.recId('b', 1, 'نص'));
  check('whitespace differences ignored (tidy applied)',
    R.recId('k', 1, ' نص ') === R.recId('k', 1, 'نص'));
  check('id is a non-empty string', typeof R.recId('k', 1, 'نص') === 'string' && R.recId('k', 1, 'نص').length > 1);
}

section('=== ٣) ملف المؤسسة: تجميع الزيارات ===');
{
  const reports = [
    mkReport('r1', 'مركز صحي الخناسة', 'قطاع المدائن', '2026-01-10', 'زيارة تفتيشية', [['أولى']]),
    mkReport('r2', 'مركز صحي الخناسة', 'قطاع المدائن', '2026-06-20', 'زيارة متابعة', [['ثانية']]),
    mkReport('r3', 'مركز صحي الخناسة', 'قطاع المدائن', '2026-03-15', 'زيارة تفتيشية', []),
    mkReport('r4', 'مركز صحي آخر', 'قطاع المدائن', '2026-02-01', 'زيارة تفتيشية', []),
  ];
  const facs = R.buildFacilities(reports);
  const keys = Object.keys(facs);
  check('two facilities indexed', keys.length === 2, keys.length);

  const k = R.facilityKey('مركز صحي الخناسة', 'قطاع المدائن');
  const f = facs[k];
  check('facility found by key', !!f);
  check('three visits grouped', f.visits.length === 3, f.visits.length);
  check('visits sorted newest first',
    f.visits.map(v => v.date).join(',') === '2026-06-20,2026-03-15,2026-01-10',
    f.visits.map(v => v.date));
  check('firstVisit is the oldest', f.firstVisit === '2026-01-10', f.firstVisit);
  check('lastVisit is the newest', f.lastVisit === '2026-06-20', f.lastVisit);
  check('sector carried', f.sector === 'قطاع المدائن', f.sector);
  check('kind carried', f.kind === 'مركز صحي', f.kind);

  /* تهجئة مختلفة تنضم للملف نفسه */
  const reports2 = reports.concat([mkReport('r5', 'مركز صحي الخناسه', 'قطاع المدائن', '2026-07-01', 'زيارة متابعة', [])]);
  const facs2 = R.buildFacilities(reports2);
  check('spelling variant merges into the same file',
    Object.keys(facs2).length === 2, Object.keys(facs2).length);
  check('and the newest spelling wins the display name',
    facs2[k].name === 'مركز صحي الخناسه', facs2[k].name);

  check('empty reports → empty index', Object.keys(R.buildFacilities([])).length === 0);
  check('null reports → empty index', Object.keys(R.buildFacilities(null)).length === 0);
  check('reports without a facility name are skipped',
    Object.keys(R.buildFacilities([mkReport('x', '', '', '2026-01-01', 'زيارة', [])])).length === 0);
}

section('=== ٤) استخراج التوصيات من تقرير ===');
{
  const r = mkReport('r1', 'مركز صحي أ', 'قطاع', '2026-01-10', 'زيارة تفتيشية',
    [['توصية أولى', 'توصية ثانية'], ['توصية ثالثة']]);
  const recs = R.recsFromReport(r);
  check('three recommendations extracted', recs.length === 3, recs.length);
  check('text preserved', recs[0].text === 'توصية أولى', recs[0].text);
  check('facility key attached', recs[0].facilityKey === R.facilityKey('مركز صحي أ', 'قطاع'));
  check('source report recorded', recs[0].sourceReportId === 'r1');
  check('visit date recorded', recs[0].visitDate === '2026-01-10');
  check('default status is pending', recs[0].status === 'pending', recs[0].status);
  check('group label recorded', recs[0].label === 'جهة 1', recs[0].label);
  check('ids are unique', new Set(recs.map(x => x.id)).size === 3);
  check('empty items skipped',
    R.recsFromReport(mkReport('r', 'ن', 'ق', '2026-01-01', 'ز', [['', '  ', 'حقيقية']])).length === 1);
  check('no recGroups → no recs', R.recsFromReport(mkReport('r', 'ن', 'ق', '2026-01-01', 'ز', [])).length === 0);
  check('null report → empty', R.recsFromReport(null).length === 0);
}

section('=== ٥) دمج التوصيات: حالة المستخدم لا تُمحى ===');
{
  const reports = [mkReport('r1', 'مركز صحي أ', 'قطاع', '2026-01-10', 'زيارة تفتيشية',
    [['توصية أولى', 'توصية ثانية']])];
  let reg = R.blankRegistry();

  /* أول بناء */
  reg.recs = R.buildRecs(reports, reg);
  const ids = Object.keys(reg.recs);
  check('two recs after first build', ids.length === 2, ids.length);

  /* المستخدم يعدّل الحالة */
  R.updateRec(reg, ids[0], { status: 'done', note: 'نُفّذت في آذار', evidence: 'كتاب ١٢٣' });
  check('status saved', reg.recs[ids[0]].status === 'done');
  check('note saved', reg.recs[ids[0]].note === 'نُفّذت في آذار');
  check('evidence saved', reg.recs[ids[0]].evidence === 'كتاب ١٢٣');
  check('updatedAt stamped', !!reg.recs[ids[0]].updatedAt);
  check('verifiedAt set automatically when done', !!reg.recs[ids[0]].verifiedAt);

  /* إعادة بناء من التقارير — الحالة يجب أن تبقى */
  reg.recs = R.buildRecs(reports, reg);
  check('status SURVIVES a rebuild', reg.recs[ids[0]].status === 'done', reg.recs[ids[0]].status);
  check('note SURVIVES a rebuild', reg.recs[ids[0]].note === 'نُفّذت في آذار');
  check('evidence SURVIVES a rebuild', reg.recs[ids[0]].evidence === 'كتاب ١٢٣');
  check('updatedAt SURVIVES a rebuild', !!reg.recs[ids[0]].updatedAt);

  /* تعديل نص التوصية في التقرير يولّد معرّفاً جديداً (سلوك مقصود) */
  const reports2 = [mkReport('r1', 'مركز صحي أ', 'قطاع', '2026-01-10', 'زيارة تفتيشية',
    [['توصية أولى المُعدَّلة', 'توصية ثانية']])];
  const reg2 = R.buildRecs(reports2, reg);
  check('changed text produces a new rec id',
    Object.keys(reg2).length === 2 && !reg2[ids[0]],
    { count: Object.keys(reg2).length, oldStillThere: !!reg2[ids[0]] });
  check('the new rec starts fresh as pending',
    reg2[Object.keys(reg2).find(k => k !== ids[1])].status === 'pending',
    reg2[Object.keys(reg2).find(k => k !== ids[1])]);
  check('the unchanged rec is untouched',
    !!reg2[ids[1]], Object.keys(reg2));

  /* التوصيات اليدوية تبقى */
  const reg3 = R.blankRegistry();
  const mid = R.addManualRec(reg3, 'k', 'توصية يدوية', 'جهة');
  check('manual rec added', !!mid && !!reg3.recs[mid]);
  check('manual flag set', reg3.recs[mid].manual === true);
  const reg4 = R.buildRecs([], reg3);
  check('manual rec survives a rebuild with no reports', !!reg4[mid], Object.keys(reg4));
  const reg5 = R.buildRecs(reports, reg3);
  check('manual rec survives alongside report recs', !!reg5[mid]);
}

section('=== ٦) حذف التوصيات ===');
{
  const reg = R.blankRegistry();
  const mid = R.addManualRec(reg, 'k', 'يدوية');
  check('manual rec can be removed', R.removeRec(reg, mid) === true);
  check('and is gone', !reg.recs[mid]);

  const reports = [mkReport('r1', 'ن', 'ق', '2026-01-01', 'ز', [['من تقرير']])];
  reg.recs = R.buildRecs(reports, reg);
  const rid = Object.keys(reg.recs)[0];
  check('report rec CANNOT be removed from the registry',
    R.removeRec(reg, rid) === false);
  check('and is still there', !!reg.recs[rid]);
  check('removing a missing rec returns false', R.removeRec(reg, 'nope') === false);
}

section('=== ٧) التأخير ===');
{
  const now = new Date('2026-06-15T12:00:00Z');
  check('no due date → not overdue', R.isOverdue({ status: 'pending' }, now) === false);
  check('past due + open → overdue',
    R.isOverdue({ status: 'pending', dueDate: '2026-06-01' }, now) === true);
  check('past due + done → NOT overdue',
    R.isOverdue({ status: 'done', dueDate: '2026-06-01' }, now) === false);
  check('future due → not overdue',
    R.isOverdue({ status: 'pending', dueDate: '2026-12-01' }, now) === false);
  check('invalid date → not overdue',
    R.isOverdue({ status: 'pending', dueDate: 'ليس تاريخاً' }, now) === false);
  check('daysOverdue counts correctly',
    R.daysOverdue({ status: 'pending', dueDate: '2026-06-05' }, now) === 10,
    R.daysOverdue({ status: 'pending', dueDate: '2026-06-05' }, now));
  check('daysOverdue is 0 when not overdue',
    R.daysOverdue({ status: 'done', dueDate: '2026-06-05' }, now) === 0);
}

section('=== ٨) حالات التنفيذ ===');
{
  check('five statuses defined', R.STATUSES.length === 5, R.STATUSES.length);
  check('pending is open', R.isClosed('pending') === false);
  check('progress is open', R.isClosed('progress') === false);
  check('done is closed', R.isClosed('done') === true);
  check('failed is open', R.isClosed('failed') === false);
  check('verify is open', R.isClosed('verify') === false);
  check('unknown status falls back to pending',
    R.statusOf('bogus').k === 'pending', R.statusOf('bogus').k);
  check('every status has a label',
    R.STATUSES.every(s => typeof s.t === 'string' && s.t.length > 0));
}

section('=== ٩) المؤشرات ===');
{
  const reports = [
    mkReport('r1', 'مركز أ', 'قطاع ١', '2026-01-10', 'زيارة تفتيشية', [['ت١', 'ت٢']]),
    mkReport('r2', 'مركز أ', 'قطاع ١', '2026-02-10', 'زيارة متابعة', [['ت٣']]),
    mkReport('r3', 'مركز ب', 'قطاع ٢', '2026-03-10', 'زيارة تفتيشية', [['ت٤']]),
    mkReport('r4', 'مركز ج', 'قطاع ٢', '2025-12-01', 'زيارة تفتيشية', [['قديمة']]),
  ];
  let reg = R.blankRegistry();
  reg.recs = R.buildRecs(reports, reg);
  const ids = Object.keys(reg.recs);

  /* نُغلق واحدة ونؤخّر أخرى */
  R.updateRec(reg, ids[0], { status: 'done' });
  R.updateRec(reg, ids[1], { status: 'pending', dueDate: '2026-01-01' });

  const now = new Date('2026-06-15T12:00:00Z');

  /* بلا تحديد فترة */
  const all = R.computeMetrics(reports, reg, { now });
  check('visits counted', all.visits === 4, all.visits);
  check('facilities visited counted', all.facilitiesVisited === 3, all.facilitiesVisited);
  check('facilities total in index', all.facilitiesTotal === 3, all.facilitiesTotal);
  check('initial visits counted', all.initialVisits === 3, all.initialVisits);
  check('follow-up visits counted', all.followUpVisits === 1, all.followUpVisits);
  check('recs total', all.recs.total === 5, all.recs.total);
  check('recs closed', all.recs.closed === 1, all.recs.closed);
  check('recs open', all.recs.open === 4, all.recs.open);
  check('overdue counted', all.recs.overdue === 1, all.recs.overdue);
  check('closure rate is a percentage', all.recs.closureRate === 20, all.recs.closureRate);
  check('byType has entries', Object.keys(all.byType).length === 2, all.byType);
  check('bySector has entries', Object.keys(all.bySector).length === 2, all.bySector);
  check('status breakdown sums to total',
    Object.keys(all.recs.byStatus).reduce((s, k) => s + all.recs.byStatus[k], 0) === 5,
    all.recs.byStatus);

  /* بفترة محدّدة: ٢٠٢٦ فقط */
  const ranged = R.computeMetrics(reports, reg, { now, from: '2026-01-01', to: '2026-12-31' });
  check('range filters visits', ranged.visits === 3, ranged.visits);
  check('the 2025 visit is excluded', ranged.visits < all.visits);
  check('range keeps the facilities seen in it', ranged.facilitiesVisited === 2, ranged.facilitiesVisited);
  check('range filters recommendations', ranged.recs.total < all.recs.total,
    { ranged: ranged.recs.total, all: all.recs.total });

  /* فترة فارغة */
  const empty = R.computeMetrics(reports, reg, { now, from: '2020-01-01', to: '2020-12-31' });
  check('empty range → zero visits', empty.visits === 0, empty.visits);
  check('empty range → zero recs', empty.recs.total === 0, empty.recs.total);
  check('empty range → closure rate 0 (no division by zero)',
    empty.recs.closureRate === 0, empty.recs.closureRate);

  /* بلا بيانات */
  const none = R.computeMetrics([], R.blankRegistry(), { now });
  check('no data → no crash', none.visits === 0 && none.recs.total === 0);
  check('no data → closure rate 0', none.recs.closureRate === 0);

  /* الملاحظات الأكثر تكراراً */
  const withNotes = [
    mkReport('n1', 'مركز أ', 'ق', '2026-01-10', 'زيارة', [], [{ name: 'سجل الحركة', eval: 'غير مُحدَّث' }]),
    mkReport('n2', 'مركز ب', 'ق', '2026-02-10', 'زيارة', [], [{ name: 'سجل الحركة', eval: 'غير مُحدَّث' }]),
    mkReport('n3', 'مركز ج', 'ق', '2026-03-10', 'زيارة', [], [{ name: 'سجل الصادر', eval: 'منظّم' }]),
  ];
  const m2 = R.computeMetrics(withNotes, R.blankRegistry(), { now });
  check('top notes computed', m2.topNotes.length >= 2, m2.topNotes.length);
  check('the most frequent note is first',
    m2.topNotes[0].count === 2, m2.topNotes[0]);
  check('note text includes the record name',
    /سجل الحركة/.test(m2.topNotes[0].text), m2.topNotes[0].text);

  /* ترتيب المؤسسات: الأكثر تأخراً أولاً */
  const m3 = R.computeMetrics(reports, reg, { now });
  check('facilities list has entries', m3.facilities.length > 0);
  check('facility with an overdue rec comes first',
    m3.facilities[0].overdue >= m3.facilities[m3.facilities.length - 1].overdue,
    m3.facilities.map(f => f.overdue));
}

section('=== ١٠) سلامة البنية ===');
{
  check('blank registry has the three parts',
    !!R.blankRegistry().facilities && !!R.blankRegistry().recs);
  check('normalizeRegistry handles null', !!R.normalizeRegistry(null).facilities);
  check('normalizeRegistry handles a string', !!R.normalizeRegistry('garbage').facilities);
  check('normalizeRegistry handles an array', !!R.normalizeRegistry([1, 2]).facilities);

  const dirty = R.normalizeRegistry({
    facilities: { k: { name: 123 } },
    recs: { R1: { status: 'bogus', text: null } },
  });
  check('bad status normalized to pending', dirty.recs.R1.status === 'pending', dirty.recs.R1.status);
  check('null text normalized to empty string', dirty.recs.R1.text === '');
  check('non-string name normalized to empty string', dirty.facilities.k.name === '');

  check('updateRec on a missing rec returns false',
    R.updateRec(R.blankRegistry(), 'nope', { status: 'done' }) === false);
  check('updateRec on null registry returns false',
    R.updateRec(null, 'x', {}) === false);
  check('updateRec cannot change the id',
    (() => { const rr = R.blankRegistry(); rr.recs.X = { id: 'X' };
             R.updateRec(rr, 'X', { id: 'HACKED' }); return rr.recs.X.id === 'X'; })());
}

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
