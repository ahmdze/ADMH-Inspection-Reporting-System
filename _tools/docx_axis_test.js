/* =============================================================================
   Verify the axis title is REALLY inside the generated .docx
   -----------------------------------------------------------------------------
   نُصدّر الملف في متصفح حقيقي، نُخرجه base64 من الصفحة، ثم نحلّله كأرشيف ZIP
   ونقرأ word/document.xml — فالفحص النصّي هو الحكم.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PY = 'C:\\Users\\ahmdz\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';
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

const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1200,900', '--virtual-time-budget=25000', '--dump-dom', 'file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="__dx"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const raw = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const b64m = /B64=([A-Za-z0-9+/=]+)/.exec(raw);
if (!b64m) { console.error('no blob:', raw.slice(0, 200)); process.exit(1); }
fs.writeFileSync(OUT, Buffer.from(b64m[1], 'base64'));
console.log('docx written:', fs.statSync(OUT).size, 'bytes');
try { fs.unlinkSync(PAGE); } catch (e) {}

const py = `
import sys, zipfile, re
sys.stdout.reconfigure(encoding='utf-8')
z = zipfile.ZipFile(r'${OUT.replace(/\\/g, '/')}')
xml = z.read('word/document.xml').decode('utf-8', 'replace')
texts = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml)
full = ' '.join(texts)
print('text chars:', len(full))
print('tables:', xml.count('<w:tbl>'))
for needle in ['المحور الإداري //', 'وحدة البصمة', 'الإجراءات المتخذة', 'الملاك الكلي', 'التوصيات', 'فريق التفتيش']:
    print(('  HAS     ' if needle in full else '  MISSING ') + needle)
# العنوان الرئيسي: تقرير زيارة ... إلى مركز صحي ...
print('  title present:', ('تقرير' in full) and ('الخناسة' in full))
print('  axis occurrences:', full.count('المحور الإداري'))
print('--- first 200 chars of the document text ---')
print(full[:200])
`;
const res = execFileSync(PY, ['-X', 'utf8', '-c', py], { encoding: 'utf8' });
console.log(res);
const ok = /HAS     المحور الإداري/.test(res) && /tables: 0/.test(res) && /title present: True/.test(res);
console.log('=== RESULT: ' + (ok ? 'PASS' : 'FAIL') + ' ===');
process.exit(ok ? 0 : 1);
