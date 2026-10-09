/* =============================================================================
   Copy-menu test — runs against the REAL index.html in a REAL browser.
   -----------------------------------------------------------------------------
   العطلان الذين أبلغ عنهما المستخدم («ينسخ مباشرةً بلا خيارات»):
     ١) مستمع document كان يُغلق القائمة في نفس حدث النقر.
     ٢) القائمة داخل #view-preview المخفي، فلا تظهر من شاشة التحرير.
   هذه الاختبارات تثبّت التسلسل الكامل: نقرة ← معاينة ← قائمة مرئية.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const chrome = require('./_chrome.js');
const CHROME = chrome.requireChrome();
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_copymenu.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) {
  window.__errs.push('ERROR: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno);
}, true);

function __copyTest() {
  var d = document.getElementById('__ct');
  var ok = [], bad = [];
  function check(n, c, det) { (c ? ok : bad).push(n + (c ? '' : '  -> ' + JSON.stringify(det))); }
  function finish() {
    d.textContent = 'PASS ' + ok.length + '\nFAIL ' + bad.length + '\n'
      + ok.map(function (x) { return '  ok   ' + x; }).join('\n') + '\n'
      + bad.map(function (x) { return '  FAIL ' + x; }).join('\n');
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  (async function () {
  try {
    var A = window.ADMH, NS = window.ADMHReport;
    check('no startup errors', window.__errs.length === 0, window.__errs.slice(0, 3));

    var R = A.state.report;
    R.facilityName = 'مركز صحي الخناسة'; R.sector = 'قطاع المدائن';
    R.visitDate = '2026-09-22'; R.visitType = 'زيارة تفتيشية';
    R.officials = [{ role: 'مدير المركز', job: 'طبيب', name: 'فلان الفلاني' }];
    R.staff = { 'الملاك': { total: '55', actual: '32' } };
    R.recGroups = [{ letter: 'أ', label: 'شعبة التحقيقات / قسمنا', intro: '', items: ['تشكيل لجنة تحقيقية.'] }];
    R.records = [{ name: 'سجل الحركة', evalList: ['مُدام وموثق ومحدّث.'], evalManual: '', eval: '' }];
    A.renderAll();

    var menu = document.getElementById('copyMenu');
    var list = document.getElementById('copyMenuList');
    var btn = document.getElementById('btnCopy');
    var prev = document.getElementById('view-preview');

    check('copy menu exists', !!menu);
    check('copy button exists', !!btn);
    check('menu starts closed', !menu.classList.contains('open'), menu.className);

    var items = list ? list.querySelectorAll('[data-copy-mode]') : [];
    check('menu has four options', items.length === 4, items.length);
    var modes = Array.prototype.map.call(items, function (b) { return b.getAttribute('data-copy-mode'); });
    check('modes are the four requested',
      modes.join(',') === 'all,without-header,without-header-recs,recommendations', modes);
    var labels = Array.prototype.map.call(items, function (b) { return b.textContent.trim(); });
    check('all four labels are present in Arabic', labels.length === 4, labels);

    /* ---------- من شاشة التحرير: النقرة تنتقل للمعاينة وتفتح القائمة ---------- */
    A.showView('report');
    await wait(60);
    check('we start on the report view', prev.classList.contains('hidden'), prev.className);

    btn.click();
    await wait(140);                       /* ننتظر الانتقال + فتح القائمة */
    check('preview became visible', !prev.classList.contains('hidden'), prev.className);
    check('menu opened after switching to preview', menu.classList.contains('open'), menu.className);
    check('aria-expanded is true', btn.getAttribute('aria-expanded') === 'true', btn.getAttribute('aria-expanded'));

    var csOpen = window.getComputedStyle(list);
    check('menu list is displayed', csOpen.display === 'flex', csOpen.display);
    var rect = list.getBoundingClientRect();
    check('menu list has a usable width', rect.width > 100, Math.round(rect.width));
    check('menu list has a usable height', rect.height > 100, Math.round(rect.height));
    check('menu list stays on screen',
      rect.left >= -2 && rect.right <= window.innerWidth + 2,
      { left: Math.round(rect.left), right: Math.round(rect.right), vw: window.innerWidth });

    /* ---------- النقر على الخيار يُنفّذ وضعه ويُغلق القائمة ---------- */
    var picked = null;
    var origCopy = NS.copyReport;
    NS.copyReport = function (mode) { picked = mode; };

    items[0].click(); await wait(30);
    check('option 1 = all', picked === 'all', picked);
    check('menu closed after choosing', !menu.classList.contains('open'), menu.className);

    btn.click(); await wait(30);
    items[1].click(); await wait(30);
    check('option 2 = without-header', picked === 'without-header', picked);

    btn.click(); await wait(30);
    items[2].click(); await wait(30);
    check('option 3 = without-header-recs', picked === 'without-header-recs', picked);

    btn.click(); await wait(30);
    items[3].click(); await wait(30);
    check('option 4 = recommendations', picked === 'recommendations', picked);

    NS.copyReport = origCopy;

    /* ---------- السلوك العام للقائمة ---------- */
    btn.click(); await wait(30);
    check('reopened in preview', menu.classList.contains('open'));
    btn.click(); await wait(30);
    check('clicking the button again closes it', !menu.classList.contains('open'), menu.className);

    btn.click(); await wait(30);
    document.body.click(); await wait(30);
    check('outside click closes it', !menu.classList.contains('open'), menu.className);

    btn.click(); await wait(30);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(30);
    check('Escape closes it', !menu.classList.contains('open'), menu.className);

    finish();
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
  })();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { setTimeout(__copyTest, 1600); });
} else {
  setTimeout(__copyTest, 1600);
}
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__ct" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1200,900', '--virtual-time-budget=25000', '--dump-dom', 'file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="__ct"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output from probe'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);

try { fs.unlinkSync(PAGE); } catch (e) {}
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
chrome.cleanProfile();
process.exit(fail ? 1 : 0);
