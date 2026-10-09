/* =============================================================================
   Report modules test — runs against the REAL index.html in a REAL browser.

   منطق التقرير موزّع على ملفات مستقلة. هذا الاختبار يزرع سيناريو داخل الصفحة
   الحقيقية ويتأكد أن كل شيء يعمل بعد التقسيم:
     · لا أخطاء عند الإقلاع، والتشغيل يحدث مرة واحدة عبر boot()
     · بناء النموذج، المعاينة، النص العادي
     · النسخ والطباعة بلا أخطاء
     · تصدير Word يُنتج ملفاً حقيقياً
     · أزرار النسخ/الطباعة/Word مربوطة فعلاً
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const CHROME = require('./_chrome.js').requireChrome();
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_report_modules.html');

const TEST_JS = fs.readFileSync(path.join(__dirname, '_report_probe.js'), 'utf8');

/* نزرع الاختبار داخل صفحة index.html الحقيقية */
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const injected = index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__t" style="display:none">PENDING</pre>\n<script>\n' + TEST_JS + '\n</script>\n<div class="scrim" id="scrim"></div>', 1);
fs.writeFileSync(PAGE, injected);

const dom = execFileSync(CHROME, ['--headless=new','--disable-gpu','--no-sandbox','--allow-file-access-from-files',
  '--window-size=1200,900','--virtual-time-budget=25000','--dump-dom','file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });

const m = /<pre id="__t"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output from probe'); process.exit(1); }
const text = m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
console.log(text);

try { fs.unlinkSync(PAGE); } catch (e) {}

const pass = +(/PASS (\d+)/.exec(text) || [0,0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0,0])[1];
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
