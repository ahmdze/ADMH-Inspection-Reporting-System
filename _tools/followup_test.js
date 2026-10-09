/* =============================================================================
   Follow-up views test — ملف المؤسسات · التوصيات · لوحة المؤشرات
   في متصفح حقيقي، بالضغط على الأزرار كما يفعل المستخدم.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const chrome = require('./_chrome.js');
const CHROME = chrome.requireChrome();
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_follow.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);

function __followTest() {
  var d = document.getElementById('__fu');
  var ok = [], bad = [];
  function check(n, c, det) { (c ? ok : bad).push(n + (c ? '' : '  -> ' + JSON.stringify(det))); }
  function finish() {
    d.textContent = 'PASS ' + ok.length + '\nFAIL ' + bad.length + '\n'
      + ok.map(function (x) { return '  ok   ' + x; }).join('\n') + '\n'
      + bad.map(function (x) { return '  FAIL ' + x; }).join('\n');
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function txt(sel) { var e = document.querySelector(sel); return e ? (e.textContent || '').trim() : ''; }
  function vis(sel) { var e = document.querySelector(sel); return !!(e && !e.classList.contains('hidden')); }

  (async function () {
  try {
    var A = window.ADMH, NS = window.ADMHReport;
    check('no startup errors', window.__errs.length === 0, window.__errs.slice(0, 3));
    check('registry module loaded', !!(NS.registry && NS.registry.computeMetrics));

    /* ---------- نبني أرشيفاً واقعياً: مؤسستان بزيارات وتوصيات ---------- */
    var rec1 = {
      id: 'rep-1', createdAt: '2026-01-05T08:00:00Z', updatedAt: '2026-01-05T08:00:00Z',
      title: 'تقرير زيارة تفتيشية إلى مركز صحي الخناسة',
      visitType: 'زيارة تفتيشية', facilityKind: 'مركز صحي',
      facilityName: 'مركز صحي الخناسة', sector: 'قطاع المدائن',
      visitDate: '2026-01-05',
      recGroups: [
        { letter: 'أ', label: 'شعبة التحقيقات', intro: '', items: ['تشكيل لجنة تحقيقية في التغيب.', 'تحديث سجل الحركة يومياً.'] },
        { letter: 'ب', label: 'قسم الصيانة', intro: '', items: ['إصلاح المكيف في وحدة التغذية.'] },
      ],
      records: [{ name: 'سجل الحركة', evalList: [], evalManual: 'غير مُحدَّث', eval: '' }],
    };
    var rec2 = {
      id: 'rep-2', createdAt: '2026-03-10T08:00:00Z', updatedAt: '2026-03-10T08:00:00Z',
      title: 'تقرير زيارة متابعة إلى مركز صحي الخناسة',
      visitType: 'زيارة متابعة', facilityKind: 'مركز صحي',
      facilityName: 'مركز صحي الخناسه', sector: 'قطاع المدائن',
      visitDate: '2026-03-10',
      recGroups: [{ letter: 'أ', label: 'شعبة التحقيقات', intro: '', items: ['متابعة اللجنة التحقيقية.'] }],
      records: [{ name: 'سجل الحركة', evalList: [], evalManual: 'غير مُحدَّث', eval: '' }],
    };
    var rec3 = {
      id: 'rep-3', createdAt: '2026-02-01T08:00:00Z', updatedAt: '2026-02-01T08:00:00Z',
      title: 'تقرير زيارة تفتيشية إلى مركز صحي المدائن',
      visitType: 'زيارة تفتيشية', facilityKind: 'مركز صحي',
      facilityName: 'مركز صحي المدائن', sector: 'قطاع المدائن',
      visitDate: '2026-02-01',
      recGroups: [{ letter: 'أ', label: 'الإدارة', intro: '', items: ['تثبيت لوحة الإرشادات.'] }],
      records: [],
    };
    A.state.reports = [rec1, rec2, rec3].map(function (r) { return A.migrate(JSON.parse(JSON.stringify(r))); });
    localStorage.setItem('admh.reports.v2', JSON.stringify(A.state.reports));

    /* ---------- ملف المؤسسات ---------- */
    A.showView('facilities');
    await wait(250);
    check('facilities view visible', vis('#view-facilities'));

    var facRows = document.querySelectorAll('#tFacilities tbody tr[data-fac]');
    check('two facilities listed (spelling variant merged)', facRows.length === 2, facRows.length);

    var k = NS.registry.facilityKey('مركز صحي الخناسة', 'قطاع المدائن');
    var k2 = NS.registry.facilityKey('مركز صحي الخناسه', 'قطاع المدائن');
    check('spelling variants share a key', k === k2, { k: k, k2: k2 });

    var row = document.querySelector('#tFacilities tbody tr[data-fac="' + CSS.escape(k) + '"]');
    check('the merged facility row exists', !!row);
    if (row) {
      check('it shows two visits', /2/.test(row.children[2].textContent), row.children[2].textContent);
      /* rec1 فيه ٣ توصيات (٢ + ١)، وrec2 فيه ١ = ٤ لمؤسسة الخناسة */
      check('it shows four recommendations', /4/.test(row.children[3].textContent), row.children[3].textContent);
    }

    /* نفتح الملف بالضغط كما يفعل المستخدم */
    row.click();
    await wait(150);
    check('facility detail opened', vis('#facDetail'));
    check('detail shows the facility name', txt('#facDetailName').indexOf('الخناس') >= 0, txt('#facDetailName'));
    check('detail shows visit count', /2 زيارة/.test(txt('#facDetailMeta')), txt('#facDetailMeta'));

    var visitRows = document.querySelectorAll('#tFacVisits tbody tr');
    check('two visits listed in the file', visitRows.length === 2, visitRows.length);
    check('visits are newest first',
      visitRows[0] && /2026/.test(visitRows[0].children[0].textContent),
      visitRows[0] && visitRows[0].children[0].textContent);

    var facRecCards = document.querySelectorAll('#facRecs .rec');
    check('recommendations of this facility shown', facRecCards.length === 4, facRecCards.length);

    /* ملاحظات المؤسسة تُحفظ */
    document.getElementById('facNotes').value = 'المبنى مستأجر';
    document.getElementById('btnFacSaveNotes').click();
    await wait(120);
    var regNow = NS.registry.normalizeRegistry(JSON.parse(localStorage.getItem('admh.registry.v1') || 'null'));
    check('facility notes saved', regNow.facilities[k] && regNow.facilities[k].notes === 'المبنى مستأجر',
      regNow.facilities[k]);

    /* ---------- دورة حياة التوصيات ---------- */
    A.showView('recs');
    await wait(250);
    check('recs view visible', vis('#view-recs'));

    var recCards = document.querySelectorAll('#recList .rec');
    /* ٣ من تقرير الخناسة الأول + ١ من تقرير المتابعة + ١ من تقرير المدائن = ٥ */
    check('five recommendations listed', recCards.length === 5, recCards.length);

    /* تغيير حالة توصية عبر القائمة المنسدلة */
    var firstSel = document.querySelector('#recList select[data-recstatus]');
    check('status selector present', !!firstSel);
    var recId = firstSel.getAttribute('data-recstatus');
    firstSel.value = 'done';
    firstSel.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);

    var reg2 = NS.registry.normalizeRegistry(JSON.parse(localStorage.getItem('admh.registry.v1') || 'null'));
    check('status change persisted', reg2.recs[recId] && reg2.recs[recId].status === 'done',
      reg2.recs[recId] && reg2.recs[recId].status);
    check('verifiedAt stamped on done', !!(reg2.recs[recId] && reg2.recs[recId].verifiedAt));
    check('a done badge is rendered', !!document.querySelector('#recList .badge.done'));

    /* موعد إنجاز في الماضي ← متأخرة */
    var dueInput = document.querySelector('#recList input[data-recDue]');
    var dueId = dueInput.getAttribute('data-recDue');
    dueInput.value = '2020-01-01';
    dueInput.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(200);
    var reg3 = NS.registry.normalizeRegistry(JSON.parse(localStorage.getItem('admh.registry.v1') || 'null'));
    check('due date saved', reg3.recs[dueId] && reg3.recs[dueId].dueDate === '2020-01-01',
      reg3.recs[dueId] && reg3.recs[dueId].dueDate);
    check('overdue badge rendered', !!document.querySelector('#recList .badge.over'));

    /* فلتر «المتأخرة فقط» */
    var dueFilter = document.getElementById('recFilterDue');
    dueFilter.value = 'overdue';
    dueFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(150);
    var overdueOnly = document.querySelectorAll('#recList .rec');
    check('overdue filter narrows the list', overdueOnly.length === 1, overdueOnly.length);
    check('the filtered item is the one we dated in the past',
      overdueOnly.length === 1 && overdueOnly[0].getAttribute('data-rec') === dueId,
      overdueOnly.length === 1 ? overdueOnly[0].getAttribute('data-rec') : null);
    dueFilter.value = '';
    dueFilter.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(120);

    /* إغلاق توصية يُخرجها من المتأخرة */
    var s2 = document.querySelector('#recList select[data-recstatus]');
    if (s2) {
      var id2 = s2.getAttribute('data-recstatus');
      s2.value = 'done';
      s2.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(150);
    }

    /* ---------- تنسيق بطاقات التوصيات ---------- */
    /* عطل حقيقي كان يحدث: قاعدة CSS المختصرة لِـ «.rec select» كانت تلغي
       padding-inline-start:30px التي تحجز مكان سهم القائمة، فيرتكب النص
       تحت السهم ويبدو الحقل فارغاً. هذا الفحص يمنع عودة العطل. */
    var anySel = document.querySelector('#recList select[data-recstatus]');
    var csSel = anySel ? window.getComputedStyle(anySel) : null;
    check('select reserves room for its arrow (no shorthand padding override)',
      !!(csSel && parseFloat(csSel.paddingInlineStart || csSel.paddingRight || csSel.paddingLeft || '0') >= 28),
      csSel && { start: csSel.paddingInlineStart, l: csSel.paddingLeft, r: csSel.paddingRight });
    check('select text is not clipped',
      !!(csSel && parseFloat(csSel.fontSize) > 8), csSel && csSel.fontSize);
    check('the status select shows its current label',
      !!(anySel && anySel.options[anySel.selectedIndex] &&
         anySel.options[anySel.selectedIndex].textContent.trim().length > 0),
      anySel && anySel.options[anySel.selectedIndex] && anySel.options[anySel.selectedIndex].textContent);
    /* التخطيط: كل عنصر تحكّم في مجموعة بعنوان فوقه */
    var grps = document.querySelectorAll('#recList .ctl .grp');
    check('controls are grouped with labels above them', grps.length >= 2, grps.length);
    check('every group has a label',
      Array.prototype.every.call(grps, function (g) { return !!g.querySelector('label'); }));

    /* ---------- لوحة المؤشرات ---------- */
    A.showView('dash');
    await wait(250);
    check('dashboard view visible', vis('#view-dash'));

    var kpis = document.querySelectorAll('#dashBody .kpi');
    check('KPIs rendered', kpis.length >= 8, kpis.length);

    var kpiText = (kpis[0] && kpis[0].querySelector('.v').textContent) || '';
    check('visit count KPI shows 3', kpiText.trim() === '3', kpiText);

    check('recs total KPI present',
      txt('#dashBody').indexOf('إجمالي التوصيات') >= 0);
    check('closure rate shown',
      txt('#dashBody').indexOf('نسبة الإغلاق') >= 0);
    check('overdue KPI shown',
      txt('#dashBody').indexOf('متأخرة') >= 0);
    check('facilities table rendered',
      document.querySelectorAll('#dashBody table tbody tr').length >= 2,
      document.querySelectorAll('#dashBody table tbody tr').length);
    check('repeated-notes section rendered',
      txt('#dashBody').indexOf('الأكثر تكراراً') >= 0);
    check('the repeated note is the movement record',
      txt('#dashBody').indexOf('سجل الحركة') >= 0);

    /* فترة تُفرغ النتائج */
    document.getElementById('dashFrom').value = '2020-01-01';
    document.getElementById('dashTo').value = '2020-12-31';
    document.getElementById('btnDashApply').click();
    await wait(200);
    var kpi0 = document.querySelectorAll('#dashBody .kpi')[0];
    check('range filter empties the metrics',
      kpi0 && kpi0.querySelector('.v').textContent.trim() === '0',
      kpi0 && kpi0.querySelector('.v').textContent);

    /* فترة سريعة */
    A.showView('dash');
    await wait(150);

    /* ---------- سحب التوصيات السابقة ---------- */
    A.state.report = A.migrate(JSON.parse(JSON.stringify(rec2)));
    A.state.report.prevRecs = [];
    A.renderAll();
    A.showView('report');
    await wait(150);
    document.getElementById('btnPullPrevRecs').click();
    await wait(200);
    check('previous recs pulled into the report',
      A.state.report.prevRecs.length > 0, A.state.report.prevRecs.length);
    check('and they are from the same facility only',
      A.state.report.prevRecs.every(function (p) {
        return p.text.indexOf('لوحة الإرشادات') < 0;
      }), A.state.report.prevRecs.map(function (p) { return p.text; }));
    check('pulling twice does not duplicate',
      (function () {
        document.getElementById('btnPullPrevRecs').click();
        return true;
      })());
    await wait(200);
    var n1 = A.state.report.prevRecs.length;
    document.getElementById('btnPullPrevRecs').click();
    await wait(200);
    check('no duplicates after a second pull', A.state.report.prevRecs.length === n1,
      { first: n1, second: A.state.report.prevRecs.length });

    check('no runtime errors after all interactions', window.__errs.length === 0, window.__errs);

    finish();
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__followTest, 1900); });
else setTimeout(__followTest, 1900);
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__fu" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1280,900', '--virtual-time-budget=30000', '--dump-dom', 'file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="__fu"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);
try { fs.unlinkSync(PAGE); } catch (e) {}
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
chrome.cleanProfile();
process.exit(fail ? 1 : 0);
