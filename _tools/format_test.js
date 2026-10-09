/* =============================================================================
   Verify the two new requirements in a REAL browser:
     ١) النسخ يحمل التنسيق (أنماط مضمَّنة: عريض، أحجام، محاذاة)
     ٢) ملف Word يحتوي «المحور الإداري //»
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
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

    /* الأهم: أنماط مضمَّنة لا أصناف فقط */
    check('copied HTML has inline styles', /style="/.test(html), html.slice(0, 120));
    check('copied HTML keeps bold weight', /font-weight:\s*(bold|[6-9]00)/i.test(html), html.slice(0, 200));
    check('copied HTML keeps a font size', /font-size:\s*\d/.test(html));
    check('copied HTML declares RTL', /direction:\s*rtl/i.test(html));
    check('copied HTML has a text-align', /text-align:/.test(html));
    check('copied HTML keeps colours', /color:\s*(rgb|#)/i.test(html));

    /* نتحقق أن الأنماط فعّالة: نُدرج في صفحة بلا CSS ونقيس */
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-99999px;top:0';
    probe.innerHTML = html;
    document.body.appendChild(probe);
    var h2 = probe.querySelector('h2');
    var cs = h2 ? window.getComputedStyle(h2) : null;
    check('inlined h2 is actually bold in isolation',
      !!(cs && (cs.fontWeight === 'bold' || parseInt(cs.fontWeight, 10) >= 600)),
      cs && cs.fontWeight);
    check('inlined h2 has an explicit font size',
      !!(cs && parseFloat(cs.fontSize) >= 11), cs && cs.fontSize);
    check('inlined h2 colour is the report green',
      !!(cs && /0,\s*(77|121),\s*64/.test(cs.color)), cs && cs.color);

    /* فاصل المحور: أكبر قليلاً من عناوين الأقسام (تنسيق .axis) */
    var axisIn = probe.querySelector('h2.axis');
    var axCs = axisIn ? window.getComputedStyle(axisIn) : null;
    check('inlined axis element exists', !!axisIn, probe.innerHTML.slice(0, 100));
    check('inlined axis is centre-aligned',
      !!(axCs && axCs.textAlign === 'center'), axCs && axCs.textAlign);
    check('inlined axis has no bottom border',
      !!(axCs && !/1px|2px|1\.5px/.test(axCs.borderBottomWidth || '0px')),
      axCs && axCs.borderBottomWidth);
    check('inlined axis is larger than a section heading',
      !!(axCs && cs && parseFloat(axCs.fontSize) > parseFloat(cs.fontSize)),
      { axis: axCs && axCs.fontSize, h2: cs && cs.fontSize });
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
process.exit(fail ? 1 : 0);
