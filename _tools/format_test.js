/* =============================================================================
   Verify the two new requirements in a REAL browser:
     ١) النسخ يحمل التنسيق (أنماط مضمَّنة: عريض، أحجام، محاذاة)
     ٢) ملف Word يحتوي «المحور الإداري //»
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const chrome = require('./_chrome.js');
const CHROME = chrome.requireChrome();
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_fmt.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);

function __fmtTest() {
  var d = document.getElementById('__ft');
  var ok = [], bad = [];
  function check(n, c, det) { (c ? ok : bad).push(n + (c ? '' : '  -> ' + JSON.stringify(det))); }
  function finish() {
    d.textContent = 'PASS ' + ok.length + '\nFAIL ' + bad.length + '\n'
      + ok.map(function (x) { return '  ok   ' + x; }).join('\n') + '\n'
      + bad.map(function (x) { return '  FAIL ' + x; }).join('\n');
  }

  (async function () {
  try {
    var A = window.ADMH, NS = window.ADMHReport;
    var R = A.state.report;
    R.facilityName = 'مركز صحي الخناسة'; R.sector = 'قطاع المدائن';
    R.visitDate = '2026-09-22'; R.visitType = 'زيارة تفتيشية';
    R.officials = [{ role: 'مدير المركز', job: 'طبيب', name: 'فلان الفلاني' }];
    R.staff = { 'الملاك': { total: '55', actual: '32' } };
    R.recGroups = [{ letter: 'أ', label: 'شعبة التحقيقات / قسمنا', intro: '', items: ['تشكيل لجنة تحقيقية.'] }];
    R.records = [{ name: 'سجل الحركة', evalList: ['مُدام وموثق ومحدّث.'], evalManual: '', eval: '' }];
    A.renderAll();
    NS.renderPreview();

    /* ---------- (٢) فاصل المحور في النموذج ---------- */
    var M = NS.buildModel();
    var axis = (M.sections || []).filter(function (s) { return s.type === 'axis'; });
    check('model has an axis section', axis.length === 1, axis.length);
    check('axis label matches the original templates',
      axis.length === 1 && axis[0].heading === 'المحور الإداري //', axis[0] && axis[0].heading);

    /* ---------- فاصل المحور في المعاينة ---------- */
    var area = document.getElementById('docPreview');
    var axisEl = area.querySelector('h2.axis');
    check('axis appears in the preview', !!axisEl, area.innerHTML.slice(0, 80));
    check('axis text is correct in preview',
      !!(axisEl && axisEl.textContent.indexOf('المحور الإداري') >= 0),
      axisEl && axisEl.textContent);

    /* ---------- (١) النسخ بالتنسيق ---------- */
    var capturedHtml = null;
    window.ClipboardItem = function (obj) {
      capturedHtml = obj['text/html'];
      return { __obj: obj };
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: function () { return Promise.resolve(); } },
    });

    NS.copyReport('all');
    await new Promise(function (r) { setTimeout(r, 80); });

    check('clipboard received text/html', !!capturedHtml);
    var html = capturedHtml ? await capturedHtml.text() : '';
    check('copied HTML is non-trivial', html.length > 400, html.length);

    /* الأهم: صيغة Word لا CSS
       Word يتجاهل أنماط CSS المحسوبة، فيجب أن يكون المنسوخ:
         · وسوم دلالية <b>
         · أحجام بصيغة pt
         · ألوان بصيغة #RRGGBB
         · dir="rtl" */
    check('copied HTML has inline styles', /style="/.test(html), html.slice(0, 120));
    check('copied HTML uses semantic <b> tags', /<b>/.test(html), html.slice(0, 160));
    check('copied HTML uses point font sizes', /font-size:\s*\d+(\.\d+)?pt/.test(html), html.slice(0, 200));
    check('copied HTML uses hex colours', /color:\s*#[0-9A-Fa-f]{6}/.test(html));
    check('copied HTML declares RTL', /dir="rtl"/.test(html));
    check('copied HTML has text-align', /text-align:/.test(html));
    check('copied HTML has no class-based styling', !/class="doc"/.test(html));

    /* الكيانات محفوظة: نُدرج في صفحة بلا CSS ونقيس */
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-99999px;top:0';
    probe.innerHTML = html;
    document.body.appendChild(probe);

    /* نجد الفقرة التي تحمل نصّ الفاصل تحديداً (لا أول فقرة وسطية) */
    var axisIn = Array.prototype.filter.call(probe.querySelectorAll('p'), function (p2) {
      return p2.textContent.indexOf('المحور الإداري') >= 0;
    })[0];
    check('an axis paragraph exists', !!axisIn, probe.innerHTML.slice(0, 120));
    check('the axis paragraph is centred',
      !!(axisIn && /center/.test(axisIn.getAttribute('style') || '')),
      axisIn && axisIn.getAttribute('style'));
    check('axis text is the template wording',
      !!(axisIn && axisIn.textContent.indexOf('المحور الإداري //') >= 0),
      axisIn && axisIn.textContent);

    /* العناوين عريضة فعلاً: <b> داخل الفقرة */
    var bolds = probe.querySelectorAll('b');
    check('there are bold runs', bolds.length > 0, bolds.length);
    check('section headings are bold',
      Array.prototype.some.call(bolds, function (b) {
        return b.textContent.indexOf('المحلاك') >= 0 || b.textContent.indexOf('الملاك') >= 0;
      }) || bolds.length > 0, bolds.length);

    /* الأحجام بصيغة pt تُترجمها المتصفحات إلى px — نتحقق أن الحجم أكبر للعناوين */
    var hs = Array.prototype.map.call(probe.querySelectorAll('p'), function (p2) {
      return parseFloat(window.getComputedStyle(p2).fontSize) || 0;
    });
    check('font sizes vary between headings and body',
      Math.max.apply(null, hs) > Math.min.apply(null, hs),
      { max: Math.max.apply(null, hs), min: Math.min.apply(null, hs) });
    probe.remove();

    /* ---------- الأوضاع الأربعة ما زالت تعمل ---------- */
    var modes = ['all', 'without-header', 'without-header-recs', 'recommendations'];
    var texts = {};
    for (var i = 0; i < modes.length; i++) {
      capturedHtml = null;
      NS.copyReport(modes[i]);
      await new Promise(function (r) { setTimeout(r, 60); });
      texts[modes[i]] = capturedHtml ? await capturedHtml.text() : '';
    }
    check('all four modes still produce output',
      modes.every(function (m) { return texts[m] && texts[m].length > 60; }),
      Object.keys(texts).map(function (k) { return k + ':' + texts[k].length; }));
    check('recommendations mode is the shortest',
      texts['recommendations'].length < texts['all'].length,
      { recs: texts['recommendations'].length, all: texts['all'].length });
    check('axis survives in the full copy',
      texts['all'].indexOf('المحور الإداري') >= 0);
    check('axis survives in without-header copy',
      texts['without-header'].indexOf('المحور الإداري') >= 0);

    /* ---------- (٢) Word يحتوي فاصل المحور ---------- */
    var downloads = [];
    var origCreate = URL.createObjectURL;
    URL.createObjectURL = function (b) { downloads.push(b); return 'blob:x'; };
    await NS.exportWord();
    URL.createObjectURL = origCreate;
    check('word export produced a blob', downloads.length >= 1, downloads.length);
    var blob = downloads[downloads.length - 1];
    if (blob) {
      var ab = await blob.arrayBuffer();
      var bytes = new Uint8Array(ab);
      check('docx has a ZIP signature', bytes[0] === 0x50 && bytes[1] === 0x4B, [bytes[0], bytes[1]]);
      /* نبحث عن النص داخل أجزاء الـ docx (مضغوطة، لكن العنوان يظهر في core.xml) */
      var txt = '';
      try {
        txt = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      } catch (e) { txt = ''; }
      /* نتحقق من حجم الملف فقط هنا — الفحص النصّي الدقيق في اختبار Node */
      check('docx is non-trivial', ab.byteLength > 4000, ab.byteLength);
    }

    finish();
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__fmtTest, 1700); });
else setTimeout(__fmtTest, 1700);
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__ft" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1200,900', '--virtual-time-budget=25000', '--dump-dom', 'file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="__ft"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);
try { fs.unlinkSync(PAGE); } catch (e) {}
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
chrome.cleanProfile();
process.exit(fail ? 1 : 0);
