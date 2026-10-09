/* =============================================================================
   Storage-safety tests
   -----------------------------------------------------------------------------
   يغطي الإصلاحين:
     ١) لا رسالة «تم الحفظ» إذا فشلت الكتابة فعلاً (امتلاء مساحة التخزين)
     ٢) حماية البيانات المحلية عند تبديل حساب Google
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_storage.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);

function __storageTest() {
  var d = document.getElementById('__st');
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

    /* =====================================================================
       ١) فشل التخزين لا يُعلن نجاحاً
       ===================================================================== */
    /* نقرأ الإشعارات من الـDOM — toast دالة داخلية لا تُعترَض */
    var toasts = [];
    function drainToasts() {
      var box = document.getElementById('toasts');
      toasts = box ? Array.prototype.map.call(box.children, function (el) {
        return { msg: el.textContent || '', kind: el.className || '' };
      }) : [];
      if (box) box.innerHTML = '';
      return toasts;
    }

    /* نُفرّغ الأرشيف ثم نُحاكي امتلاء مساحة التخزين */
    A.state.reports = [];
    var origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k) {
      if (String(k).indexOf('admh.reports') >= 0) {
        var e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      return origSet.apply(this, arguments);
    };

    A.state.report.facilityName = 'مركز للاختبار';
    var jwriteOk = A.jwrite(A.LS_REPORTS || 'admh.reports.v2', []);
    check('jwrite returns false when storage throws', jwriteOk === false, jwriteOk);

    drainToasts();
    var saveResult = A.saveToArchive(false);
    toasts = drainToasts();
    check('saveToArchive reports failure', saveResult === false, saveResult);
    check('NO success toast on failure',
      !toasts.some(function (t) { return /تم الحفظ/.test(t.msg); }),
      toasts.map(function (t) { return t.msg; }));
    check('an error toast IS shown',
      toasts.some(function (t) { return /err/.test(t.kind) || /تعذّر|احتياطية/.test(t.msg); }),
      toasts);
    check('the error explains what to do',
      toasts.some(function (t) { return /احتياطية|مساحة|ممتلئة/.test(t.msg); }),
      toasts);

    /* التقرير يبقى في الذاكرة — لم يضِع */
    check('the report is still in memory after failure',
      A.state.report && A.state.report.facilityName === 'مركز للاختبار',
      A.state.report && A.state.report.facilityName);

    /* نُعيد التخزين وننجح */
    Storage.prototype.setItem = origSet;
    drainToasts();
    var okSave = A.saveToArchive(false);
    toasts = drainToasts();
    check('saveToArchive succeeds when storage works', okSave === true, okSave);
    check('success toast appears on real success',
      toasts.some(function (t) { return /تم الحفظ/.test(t.msg); }),
      toasts.map(function (t) { return t.msg; }));


    /* =====================================================================
       ٢) ملكية البيانات المحلية
       ===================================================================== */
    check('readLocalOwner is exported', typeof A.readLocalOwner === 'function');
    check('markLocalOwner is exported', typeof A.markLocalOwner === 'function');

    localStorage.removeItem('admh.local.owner.v1');
    check('no owner initially', A.readLocalOwner() === null, A.readLocalOwner());

    A.markLocalOwner('uid-AAA');
    check('owner is recorded', A.readLocalOwner() === 'uid-AAA', A.readLocalOwner());

    A.markLocalOwner('uid-BBB', true);
    check('owner can be replaced', A.readLocalOwner() === 'uid-BBB', A.readLocalOwner());
    check('refusal is remembered for that account',
      A.ownerRefused('uid-BBB') === true, A.ownerRefused('uid-BBB'));
    check('refusal does not leak to other accounts',
      A.ownerRefused('uid-AAA') === false, A.ownerRefused('uid-AAA'));

    /* الشكل القديم (نص مجرّد) يبقى مقروءاً */
    localStorage.setItem('admh.local.owner.v1', 'uid-OLD');
    check('legacy plain-string owner still readable',
      A.readLocalOwner() === 'uid-OLD', A.readLocalOwner());

    /* قيمة تالفة لا تُعطّل التطبيق */
    localStorage.setItem('admh.local.owner.v1', '{corrupt');
    check('corrupt owner value does not throw',
      A.readLocalOwner() === null, A.readLocalOwner());

    finish();
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__storageTest, 1700); });
else setTimeout(__storageTest, 1700);
`;

/* نحتاج تصدير الدوال الداخلية للاختبار */
let index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__st" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1200,900', '--virtual-time-budget=22000', '--dump-dom', 'file:///' + PAGE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="__st"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);
try { fs.unlinkSync(PAGE); } catch (e) {}
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
