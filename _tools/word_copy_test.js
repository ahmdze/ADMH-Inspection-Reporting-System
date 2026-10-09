/* Comprehensive check of the Word-compatible copy output. */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const chrome = require('./_chrome.js');
const CHROME = chrome.requireChrome();
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_wcopy.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);

function __wTest() {
  var d = document.getElementById('__wt');
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
    R.facilityKind = 'مركز صحي';
    R.officials = [{ role: 'مدير المركز', job: 'طبيب', name: 'فلان الفلاني' }];
    R.staff = { 'الملاك': { total: '55', actual: '32' } };
    R.recGroups = [{ letter: 'أ', label: 'شعبة التحقيقات / قسمنا', intro: '', items: ['تشكيل لجنة تحقيقية.'] }];
    R.records = [{ name: 'سجل الحركة', evalList: ['مُدام وموثق ومحدّث.'], evalManual: '', eval: '' }];
    R.signers = [{ name: 'عضو فريق التفتيش', job: 'ضابط تفتيش', date: '2026-09-22' }];
    A.renderAll();
    NS.renderPreview();

    var cap = null;
    window.ClipboardItem = function (obj) { cap = obj; return { __o: obj }; };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { write: function () { return Promise.resolve(); } },
    });

    async function grab(mode) {
      cap = null;
      NS.copyReport(mode);
      await new Promise(function (r) { setTimeout(r, 60); });
      return {
        html: cap ? await cap['text/html'].text() : '',
        text: cap ? await cap['text/plain'].text() : '',
      };
    }

    /* ---------- «بالكامل» ---------- */
    var all = await grab('all');
    check('all: produced HTML', all.html.length > 400, all.html.length);
    check('all: produced plain text', all.text.length > 200, all.text.length);

    /* التنسيق بصيغة Word */
    check('all: has <b> tags', (all.html.match(/<b>/g) || []).length >= 3,
      (all.html.match(/<b>/g) || []).length);
    check('all: uses pt font sizes', /font-size:\s*1[0-9](\.\d)?pt/.test(all.html));
    check('all: uses hex colours', /color:\s*#[0-9A-Fa-f]{6}/.test(all.html));
    check('all: declares dir="rtl"', /dir="rtl"/.test(all.html));
    check('all: heading colour is the report green', /#004D40/.test(all.html));
    check('all: uses paragraphs not classes', !/class="doc"/.test(all.html));
    check('all: has a centred title',
      /text-align:center/.test(all.html) && /font-size:\s*16(\.0)?pt/.test(all.html));

    /* المحتوى */
    check('all: includes the facility name', all.html.indexOf('الخناسة') >= 0);
    check('all: includes the axis divider', all.html.indexOf('المحور الإداري //') >= 0);
    check('all: includes staff', all.html.indexOf('الملاك الكلي') >= 0);
    check('all: includes recommendations', all.html.indexOf('تشكيل لجنة تحقيقية') >= 0);
    check('all: includes signers', all.html.indexOf('فريق التفتيش') >= 0);

    /* ---------- دون الترويسة ---------- */
    var nh = await grab('without-header');
    check('without-header: drops the title line', !/16(\.0)?pt/.test(nh.html),
      (nh.html.match(/font-size:\s*[\d.]+pt/g) || []).slice(0, 3));
    check('without-header: keeps the axis', nh.html.indexOf('المحور الإداري //') >= 0);
    check('without-header: keeps staff', nh.html.indexOf('الملاك الكلي') >= 0);
    check('without-header: keeps recommendations', nh.html.indexOf('تشكيل لجنة تحقيقية') >= 0);
    check('without-header: shorter than all', nh.html.length < all.html.length,
      { nh: nh.html.length, all: all.html.length });

    /* ---------- دون الترويسة والتوصيات ---------- */
    var nr = await grab('without-header-recs');
    check('without-header-recs: no recommendations', nr.html.indexOf('تشكيل لجنة تحقيقية') < 0);
    check('without-header-recs: keeps staff', nr.html.indexOf('الملاك الكلي') >= 0);
    check('without-header-recs: shorter still', nr.html.length < nh.html.length,
      { nr: nr.html.length, nh: nh.html.length });

    /* ---------- التوصيات فقط ---------- */
    var ro = await grab('recommendations');
    check('recommendations: has the recommendations', ro.html.indexOf('تشكيل لجنة تحقيقية') >= 0);
    check('recommendations: no staff section', ro.html.indexOf('الملاك الكلي') < 0);
    check('recommendations: no signers', ro.html.indexOf('فريق التفتيش') < 0);
    check('recommendations: still formatted', /<b>/.test(ro.html) && /pt/.test(ro.html));
    check('recommendations: shortest of all', ro.html.length < nr.html.length,
      { ro: ro.html.length, nr: nr.html.length });

    /* ---------- النص العادي يصلح للواتساب ---------- */
    check('plain text has no HTML tags', !/<[a-z][^>]*>/i.test(all.text), all.text.slice(0, 80));
    check('plain text has the title', all.text.indexOf('الخناسة') >= 0);
    check('plain text has numbering', /1-/.test(all.text));
    check('plain text for recs-only is short',
      ro.text.length < all.text.length && ro.text.length > 20, ro.text.length);

    finish();
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__wTest, 1700); });
else setTimeout(__wTest, 1700);
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__wt" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1200,900', '--virtual-time-budget=25000', '--dump-dom', 'file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="__wt"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);
try { fs.unlinkSync(PAGE); } catch (e) {}
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
chrome.cleanProfile();
process.exit(fail ? 1 : 0);
