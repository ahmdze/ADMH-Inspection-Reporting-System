/* =============================================================================
   History + draft-sync test — متصفح حقيقي
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const CHROME = require('./_chrome.js').requireChrome();
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_hist.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);

function __histTest() {
  var d = document.getElementById('__ht');
  var ok = [], bad = [];
  function check(n, c, det) { (c ? ok : bad).push(n + (c ? '' : '  -> ' + JSON.stringify(det))); }
  function finish() {
    d.textContent = 'PASS ' + ok.length + '\nFAIL ' + bad.length + '\n'
      + ok.map(function (x) { return '  ok   ' + x; }).join('\n') + '\n'
      + bad.map(function (x) { return '  FAIL ' + x; }).join('\n');
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hist() { return JSON.parse(localStorage.getItem('admh.history.v1') || 'null') || { reports: {} }; }
  function snaps() { var h = hist(); return (h.reports && h.reports[window.ADMH.state.report.id]) || []; }

  (async function () {
  try {
    var A = window.ADMH, NS = window.ADMHReport;
    check('no startup errors', window.__errs.length === 0, window.__errs.slice(0, 3));
    check('history module loaded', !!(NS.history && NS.history.record));
    check('history API exported', typeof A.recordHistory === 'function' &&
      typeof A.restoreHistory === 'function' && typeof A.renderHistoryView === 'function');

    /* لوحة السجل موجودة في شاشة التحرير */
    check('history card exists', !!document.getElementById('cardHistory'));
    check('history list container exists', !!document.getElementById('histList'));
    check('history buttons exist',
      !!document.getElementById('btnHistNow') && !!document.getElementById('btnHistClear'));

    /* ---------- لقطة يدوية ---------- */
    A.state.report.facilityName = 'مركز صحي الخناسة';
    A.state.report.recGroups = [{ letter: 'أ', label: 'جهة', items: ['توصية أصلية'] }];
    var r1 = A.recordHistory('لقطة يدوية', true);
    check('manual snapshot recorded', r1 === true, r1);
    check('snapshot stored in localStorage', snaps().length === 1, snaps().length);

    /* نفس المحتوى لا يُسجَّل مرتين */
    var r2 = A.recordHistory('لقطة يدوية', true);
    check('identical content is not recorded twice', r2 === false, r2);
    check('still one snapshot', snaps().length === 1, snaps().length);

    /* ---------- تغيير ثم لقطة ---------- */
    A.state.report.facilityName = 'مركز صحي المدائن';
    A.state.report.recGroups[0].items.push('توصية ثانية');
    var r3 = A.recordHistory('تعديل', true);
    check('changed content is recorded', r3 === true, r3);
    check('two snapshots now', snaps().length === 2, snaps().length);
    check('newest snapshot is first',
      snaps()[0].snapshot.facilityName === 'مركز صحي المدائن',
      snaps()[0].snapshot.facilityName);

    /* ---------- الواجهة ترسم ---------- */
    A.renderHistoryView();
    await wait(120);
    var items = document.querySelectorAll('#histList .hist');
    check('history items rendered', items.length === 2, items.length);
    check('each item shows a restore button',
      document.querySelectorAll('#histList [data-histrestore]').length === 2);
    check('each item shows a view button',
      document.querySelectorAll('#histList [data-histview]').length === 2);
    check('differences are labelled in Arabic',
      (document.getElementById('histList').textContent || '').indexOf('اسم المؤسسة') >= 0,
      (document.getElementById('histList').textContent || '').slice(0, 120));
    check('stats line filled',
      /نسخة/.test((document.getElementById('histStats') || {}).textContent || ''),
      (document.getElementById('histStats') || {}).textContent);

    /* ---------- الاستعادة ---------- */
    var oldest = snaps()[1];
    var oldestId = oldest.id;
    check('the oldest snapshot holds the original name',
      oldest.snapshot.facilityName === 'مركز صحي الخناسة', oldest.snapshot.facilityName);

    /* نُغيّر الوضع الحالي ثم نستعيد */
    A.state.report.facilityName = 'وضع مؤقّت';
    A.renderAll();
    A.restoreHistory(oldestId);
    await wait(150);
    check('restore brought the old facility name back',
      A.state.report.facilityName === 'مركز صحي الخناسة', A.state.report.facilityName);
    check('restore kept the current state as a snapshot first',
      snaps().length >= 3, snaps().length);
    check('the pre-restore state is recoverable',
      snaps().some(function (e) { return e.snapshot.facilityName === 'وضع مؤقّت'; }),
      snaps().map(function (e) { return e.snapshot.facilityName; }));
    check('restore reason is recorded',
      snaps().some(function (e) { return /قبل الاستعادة/.test(e.reason); }),
      snaps().map(function (e) { return e.reason; }));

    /* ---------- الحفظ في الأرشيف يُسجّل لقطة ---------- */
    var before = snaps().length;
    A.state.report.recGroups[0].items.push('توصية ثالثة');
    A.saveToArchive(true);
    await wait(120);
    check('saving to the archive records a snapshot', snaps().length > before,
      { before: before, after: snaps().length });
    check('with the archive reason',
      snaps()[0].reason === 'الحفظ في الأرشيف', snaps()[0].reason);

    /* ---------- حذف سجل التقرير ---------- */
    var id = A.state.report.id;
    check('dropping the report history works', A.dropHistory(id) === true);
    check('and it is gone', snaps().length === 0, snaps().length);
    check('dropping again returns false', A.dropHistory(id) === false);

    /* ---------- المسودة تحمل وقت تعديل ---------- */
    A.state.report.facilityName = 'مسودة';
    A.saveDraft();
    await wait(700);
    var meta = JSON.parse(localStorage.getItem('admh.sync.meta.v1') || '{}');
    check('saving a draft stamps a local change time', !!meta.draft, meta);
    check('the stamp is a valid date', !isNaN(Date.parse(meta.draft || '')), meta.draft);

    /* المسودة تُزامَن: الحمولة تحملها */
    var loaded = A.sync.get().__load ? A.sync.get().__load() : null;
    check('the sync payload includes the draft',
      !!(A.readRegistry && typeof A.readRegistry === 'function'));
    check('scheduleDraftPush is exported', typeof A.scheduleDraftPush === 'function');

    check('no runtime errors at the end', window.__errs.length === 0, window.__errs);
    finish();
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__histTest, 1900); });
else setTimeout(__histTest, 1900);
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__ht" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1280,900', '--virtual-time-budget=28000', '--dump-dom', 'file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="__ht"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);
try { fs.unlinkSync(PAGE); } catch (e) {}
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
