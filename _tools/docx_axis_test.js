/* =============================================================================
   Verify the axis title is REALLY inside the generated .docx
   -----------------------------------------------------------------------------
   نُصدّر الملف في متصفح حقيقي، نُخرجه base64 من الصفحة، ثم نحلّله كأرشيف ZIP
   ونقرأ word/document.xml — فالفحص النصّي هو الحكم.

   كان التحليل يتمّ بـ**بايثون** عبر مسار ثابت على Windows، ففشل على CI.
   الآن نستخدم `_zip.js` — قارئ ZIP بكتابة Node نفسها بلا أي تبعية.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const chrome = require('./_chrome.js');
const zip = require('./_zip.js');
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_docx.html');
const OUT = path.join(ROOT, '_tools', 'axis-check.docx');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);

function __docxTest() {
  var d = document.getElementById('__dx');
  (async function () {
    try {
      var A = window.ADMH, NS = window.ADMHReport;
      var R = A.state.report;
      R.facilityName = 'مركز صحي الخناسة'; R.sector = 'قطاع المدائن';
      R.visitDate = '2026-09-22'; R.visitType = 'زيارة تفتيشية';
      R.staff = { 'الملاك': { total: '55', actual: '32' } };
      R.recGroups = [{ letter: 'أ', label: 'شعبة تحقيق', intro: '', items: ['تشكيل لجنة تحقيقية.'] }];
      R.records = [{ name: 'سجل', evalList: [], evalManual: 'جيد', eval: '' }];
      A.renderAll();

      var captured = null;
      var orig = URL.createObjectURL;
      URL.createObjectURL = function (b) { captured = b; return 'blob:x'; };
      await NS.exportWord();
      URL.createObjectURL = orig;

      if (!captured) { d.textContent = 'NO_BLOB'; return; }
      var ab = await captured.arrayBuffer();
      var bytes = new Uint8Array(ab);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      d.textContent = 'BYTES=' + ab.byteLength + '\nB64=' + btoa(bin);
    } catch (e) {
      d.textContent = 'THREW ' + e.message;
    }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__docxTest, 1800); });
else setTimeout(__docxTest, 1800);
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__dx" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = chrome.dump('file:///' + PAGE.replace(/\\/g, '/'), {
  budget: 25000, maxBuffer: 80 * 1024 * 1024,
  extra: ['--allow-file-access-from-files', '--window-size=1200,900'],
});

const m = /<pre id="__dx"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const raw = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const b64m = /B64=([A-Za-z0-9+/=]+)/.exec(raw);
if (!b64m) { console.error('no blob:', raw.slice(0, 200)); process.exit(1); }
fs.writeFileSync(OUT, Buffer.from(b64m[1], 'base64'));
console.log('docx written: ' + fs.statSync(OUT).size + ' bytes');
try { fs.unlinkSync(PAGE); } catch (e) { /* تجاهل */ }

/* ---------- التحليل: قارئ ZIP بكتابة Node ---------- */
let doc;
try {
  doc = zip.docxText(fs.readFileSync(OUT));
} catch (e) {
  console.error('تعذّر قراءة ملف Word: ' + e.message);
  process.exit(1);
}

console.log('text chars: ' + doc.text.length);
console.log('tables: ' + doc.tables);

const NEEDLES = [
  'المحور الإداري //',
  'وحدة البصمة',
  'الإجراءات المتخذة',
  'الملاك الكلي',
  'التوصيات',
  'فريق التفتيش',
];
NEEDLES.forEach(n =>
  console.log((doc.text.indexOf(n) >= 0 ? '  HAS     ' : '  MISSING ') + n));

const titlePresent = doc.text.indexOf('تقرير') >= 0 && doc.text.indexOf('الخناسة') >= 0;
console.log('  title present: ' + titlePresent);
console.log('  axis occurrences: ' + (doc.text.split('المحور الإداري').length - 1));
console.log('--- first 200 chars of the document text ---');
console.log(doc.text.slice(0, 200));

const ok = doc.text.indexOf('المحور الإداري //') >= 0 && doc.tables === 0 && titlePresent;
console.log('');
console.log('=== RESULT: ' + (ok ? 'PASS' : 'FAIL') + ' ===');
chrome.cleanProfile();
process.exit(ok ? 0 : 1);
