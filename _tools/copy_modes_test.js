/* Verify each copy mode produces the RIGHT content, not just the right call. */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_copymodes.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);

function __modesTest() {
  var d = document.getElementById('__mt');
  var ok = [], bad = [];
  function check(n, c, det) { (c ? ok : bad).push(n + (c ? '' : '  -> ' + JSON.stringify(det))); }
  function finish() {
    d.textContent = 'PASS ' + ok.length + '\nFAIL ' + bad.length + '\n'
      + ok.map(function (x) { return '  ok   ' + x; }).join('\n') + '\n'
      + bad.map(function (x) { return '  FAIL ' + x; }).join('\n');
  }

  try {
    var A = window.ADMH;
    var R = A.state.report;
    R.facilityName = 'مركز صحي الخناسة'; R.sector = 'قطاع المدائن';
    R.visitDate = '2026-09-22'; R.visitType = 'زيارة تفتيشية';
    R.officials = [{ role: 'مدير المركز', job: 'طبيب', name: 'فلان الفلاني' }];
    R.staff = { 'الملاك': { total: '55', actual: '32' } };
    R.recGroups = [{ letter: 'أ', label: 'شعبة التحقيقات / قسمنا', intro: '', items: ['تشكيل لجنة تحقيقية.'] }];
    R.records = [{ name: 'سجل الحركة', evalList: ['مُدام وموثق ومحدّث.'], evalManual: '', eval: '' }];
    A.renderAll();
    window.ADMHReport.renderPreview();

    var area = document.getElementById('docPreview');
    check('preview rendered', area.innerHTML.length > 300, area.innerHTML.length);

    /* نعترض الحافظة لالتقاط ما يُنسخ فعلاً */
    var captured = null;
    var NS = window.ADMHReport;
    var MP = window.ClipboardItem;
    window.ClipboardItem = function (obj) { captured = obj; return { __obj: obj }; };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: function () {
          var obj = captured;
          var p = obj['text/plain'];
          return p.text().then(function (t) { window.__lastCopied = t; });
        },
      },
    });

    function copyAndWait(mode) {
      window.__lastCopied = null;
      NS.copyReport(mode);
      /* ننتظر ظهور النتيجة فعلاً بدل توقيت ثابت (كان يُنتج فشلاً متقطّعاً) */
      return new Promise(function (resolve) {
        var tries = 0;
        (function poll() {
          if (window.__lastCopied !== null && window.__lastCopied !== undefined) { resolve(); return; }
          if (++tries > 100) { resolve(); return; }
          setTimeout(poll, 10);
        })();
      });
    }

    (async function () {
      /* العلامات تُشتق من عناصر المعاينة نفسها — فاسم المؤسسة يظهر في
         الترويسة وفي المقدمة معاً، فلا يصلح علامةً للترويسة. */
      /* الترويسة تُبنى الآن من النموذج (صيغة Word)، فالعلامة اسم المؤسسة */
      var hdrEl = area.querySelector('.hdr');
      check('header element exists in preview', !!hdrEl, hdrEl && hdrEl.className);
      var MARK_HEADER = 'الخناسة';
      var MARK_RECS = 'تشكيل لجنة تحقيقية';
      var MARK_STAFF = 'الملاك الكلي';

      var t1 = await copyAndWait('all');
      t1 = window.__lastCopied || '';
      check('all: includes header', t1.indexOf(MARK_HEADER) >= 0, t1.slice(0, 60));
      check('all: includes staff', t1.indexOf(MARK_STAFF) >= 0);
      check('all: includes recommendations', t1.indexOf(MARK_RECS) >= 0);

      await copyAndWait('without-header');
      var t2 = window.__lastCopied || '';
      check('without-header: header REMOVED', t2.indexOf(MARK_HEADER) < 0, t2.slice(0, 60));
      check('without-header: staff KEPT', t2.indexOf(MARK_STAFF) >= 0);
      check('without-header: recommendations KEPT', t2.indexOf(MARK_RECS) >= 0);

      await copyAndWait('without-header-recs');
      var t3 = window.__lastCopied || '';
      check('without-header-recs: header REMOVED', t3.indexOf(MARK_HEADER) < 0);
      check('without-header-recs: recommendations REMOVED', t3.indexOf(MARK_RECS) < 0, t3.slice(0, 80));
      check('without-header-recs: staff KEPT', t3.indexOf(MARK_STAFF) >= 0);

      await copyAndWait('recommendations');
      var t4 = window.__lastCopied || '';
      check('recommendations: has recommendations', t4.indexOf(MARK_RECS) >= 0, t4.slice(0, 80));
      check('recommendations: header REMOVED', t4.indexOf(MARK_HEADER) < 0);
      check('recommendations: staff REMOVED', t4.indexOf(MARK_STAFF) < 0);
      check('recommendations: shorter than all', t4.length < t1.length, { recs: t4.length, all: t1.length });

      finish();
    })();
  } catch (err) {
    bad.push('THREW: ' + err.message);
    finish();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__modesTest, 1600); });
else setTimeout(__modesTest, 1600);
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__mt" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1200,900', '--virtual-time-budget=22000', '--dump-dom', 'file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="__mt"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);
try { fs.unlinkSync(PAGE); } catch (e) {}
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
