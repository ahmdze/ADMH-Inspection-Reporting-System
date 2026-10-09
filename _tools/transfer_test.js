/* =============================================================================
   Explicit transfer + drafts + recommendation fixes — متصفح حقيقي
   ============================================================================= */
const fs = require('fs'), path = require('path');
const chrome = require('./_chrome.js');
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_transfer.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);
var __warns = [];
var __origWarn = console.warn;
console.warn = function () { __warns.push(Array.prototype.join.call(arguments, ' ')); return __origWarn.apply(console, arguments); };

function __test() {
  var d = document.getElementById('__tt');
  var ok = [], bad = [];
  function check(n, c, det) { (c ? ok : bad).push(n + (c ? '' : '  -> ' + JSON.stringify(det))); }
  function finish() {
    d.textContent = 'PASS ' + ok.length + '\nFAIL ' + bad.length + '\n'
      + ok.map(function (x) { return '  ok   ' + x; }).join('\n') + '\n'
      + bad.map(function (x) { return '  FAIL ' + x; }).join('\n');
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function vis(sel) { var e = document.querySelector(sel); return !!(e && !e.classList.contains('hidden')); }
  /* النوافذ المنبثقة تُفتح بصنف open لا بإزالة hidden */
  function modalOpen(sel) {
    var e = document.querySelector(sel);
    return !!(e && e.classList.contains('open'));
  }

  (async function () {
  try {
    var A = window.ADMH, NS = window.ADMHReport;
    check('no startup errors', window.__errs.length === 0, window.__errs.slice(0, 3));

    /* ---------- (٥) القائمة المنسدلة للحالة تفتح بلا إشعار ---------- */
    A.state.report.facilityName = 'مركز صحي الخناسة';
    A.state.report.recGroups = [
      { letter: 'أ', label: 'جهة أ', intro: '', items: ['توصية أولى', 'توصية ثانية'] },
      { letter: 'ب', label: 'جهة ب', intro: '', items: ['توصية ثالثة'] },
    ];
    /* التوصيات تُبنى من الأرشيف، فلا بد أن يكون التقرير محفوظاً فيه */
    A.state.report.visitDate = '2026-01-10';
    A.state.reports = [JSON.parse(JSON.stringify(A.state.report))];
    localStorage.setItem('admh.reports.v2', JSON.stringify(A.state.reports));
    A.rebuildRegistry();
    A.renderAll();
    A.showView('recs');
    await wait(400);

    var sel = document.querySelector('#recList select[data-recstatus]');
    check('status select exists', !!sel,
      (document.getElementById('recList') || {}).innerHTML ?
        document.getElementById('recList').innerHTML.slice(0, 200) : 'recList empty');
    var before = sel.value;

    /* النقر على القائمة **يجب ألا** يُغيّر الحالة ولا يُظهر إشعاراً */
    sel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(150);
    check('clicking the select does NOT change the value', sel.value === before, { before: before, after: sel.value });
    check('clicking the select does NOT re-render the list (which would close it)',
      document.querySelector('#recList select[data-recstatus]') === sel,
      'the select node was replaced');
    var box = document.getElementById('toasts');
    check('clicking the select shows NO toast', !box || box.children.length === 0,
      box ? Array.prototype.map.call(box.children, function (c) { return c.textContent; }) : []);

    /* تغيير القيمة فعلاً يُحفظ ويُشعر */
    var id = sel.getAttribute('data-recstatus');
    sel.value = 'progress';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(250);
    var reg = NS.registry.normalizeRegistry(JSON.parse(localStorage.getItem('admh.registry.v1') || 'null'));
    check('changing the select saves the new status', reg.recs[id] && reg.recs[id].status === 'progress',
      reg.recs[id] && reg.recs[id].status);
    check('and shows a toast then',
      box && Array.prototype.some.call(box.children, function (c) { return /قيد التنفيذ/.test(c.textContent); }),
      box ? Array.prototype.map.call(box.children, function (c) { return c.textContent; }) : []);

    /* اختيار نفس القيمة لا يُنتج إشعاراً */
    if (box) box.innerHTML = '';
    var sel2 = document.querySelector('#recList select[data-recstatus]');
    sel2.value = sel2.value;
    sel2.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(120);
    check('re-selecting the same value shows no toast',
      !box || box.children.length === 0,
      box ? Array.prototype.map.call(box.children, function (c) { return c.textContent; }) : []);

    /* ---------- أزرار التوصيات موجودة ومربوطة ---------- */
    ['btnRecAdd', 'btnRecRefresh', 'btnRecExport'].forEach(function (bid) {
      var b = document.getElementById(bid);
      check('button exists: ' + bid, !!b);
      check('button bound: ' + bid, !!(b && typeof b.onclick === 'function'));
    });

    /* ---------- (٢) نقل قاعدة البيانات ---------- */
    check('upload button exists', !!document.getElementById('btnUploadDb'));
    check('download button exists', !!document.getElementById('btnDownloadDb'));
    check('upload button bound', typeof document.getElementById('btnUploadDb').onclick === 'function');
    check('download button bound', typeof document.getElementById('btnDownloadDb').onclick === 'function');
    check('transfer modal exists', !!document.getElementById('transferModal'));
    check('smart sync kept as an advanced option', !!document.getElementById('btnSyncNow'));

    /* بلا جلسة حقيقية: النقل لا يفتح النافذة ولا يلمس البيانات */
    A.showView('settings');
    await wait(250);
    var toastBox = document.getElementById('toasts');
    if (toastBox) toastBox.innerHTML = '';

    var upBtn = document.getElementById('btnUploadDb');
    check('the transfer buttons are disabled while not connected', upBtn.disabled === true,
      { disabled: upBtn.disabled });

    /* نعترض دوال النقل لنعرف هل نُفّذت فعلاً */
    var t = window.__transferCalls = { upload: 0, download: 0 };
    var S = A.sync.get();
    var origUp = S.uploadDatabase, origDown = S.downloadDatabase;
    S.uploadDatabase = function () { t.upload++; return Promise.resolve({ reports: 0 }); };
    S.downloadDatabase = function () { t.download++; return Promise.resolve({ reports: 0 }); };

    upBtn.disabled = false;
    upBtn.click();
    await wait(250);
    check('no upload runs while disconnected', t.upload === 0, t);
    check('and the modal stays shut', !modalOpen('#transferModal'), modalOpen('#transferModal'));

    /* عند الاتصال: النافذة تفتح وتطلب تأكيداً مكتوباً */
    var realStatus = S.status;
    S.status = function () {
      var s2 = realStatus.call(S);
      s2.connected = true;
      return s2;
    };
    check('the stub reports connected', S.status().connected === true, S.status().connected);
    /* هل يوجد معالج على الزر أصلاً؟ */
    check('the upload button has a handler', typeof upBtn.onclick === 'function',
      typeof upBtn.onclick);

    /* ---------------------------------------------------------------------
       نستدعي المعالج مباشرةً لا بزر click.
       السبب: renderSyncUI يُعطّل أزرار النقل عندما لا يكون الاتصال حقيقياً،
       فيبقى الزر معطّلاً ويُهمل النقر — وهذا سلوك صحيح في التطبيق، لكنه
       يجعل الاختبار غير حتمي.
       --------------------------------------------------------------------- */
    upBtn.onclick(new MouseEvent('click'));
    await wait(300);
    check('with a session the transfer modal opens', modalOpen('#transferModal'),
      { open: modalOpen('#transferModal'),
        cls: document.getElementById('transferModal').className });

    var trText = (document.getElementById('trBody') || {}).textContent || '';
    check('the modal explains what will be sent', /سيُرفع/.test(trText), trText.slice(0, 140));
    check('it warns that the cloud copy is replaced', /السحابة/.test(trText), trText.slice(0, 200));

    var goBtn = document.getElementById('btnTransferGo');
    check('the confirm button starts disabled', goBtn.disabled === true);

    /* الكلمة المطلوبة للرفع هي «رفع» */
    var inp = document.getElementById('trConfirm');
    inp.value = 'خطأ';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    check('a wrong word keeps it disabled', goBtn.disabled === true, inp.value);

    inp.value = 'رفع';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    check('the correct word enables it', goBtn.disabled === false, inp.value);

    goBtn.click();
    await wait(400);
    check('confirming runs the upload', t.upload === 1, t);
    check('and the modal closes', !modalOpen('#transferModal'), modalOpen('#transferModal'));

    /* نُعيد الدوال الأصلية */
    S.status = realStatus;
    S.uploadDatabase = origUp;
    S.downloadDatabase = origDown;

    /* ---------- (١) المسودات ---------- */
    check('drafts button exists', !!document.getElementById('btnDrafts'));
    check('drafts button bound', typeof document.getElementById('btnDrafts').onclick === 'function');
    check('drafts modal exists', !!document.getElementById('draftsModal'));
    check('drafts body exists', !!document.getElementById('draftsBody'));

    /* نكتب مسودة ثم نفتح النافذة */
    A.state.report.facilityName = 'مركز صحي المدائن';
    A.state.report.recordCount = 3;
    A.saveDraft();
    await wait(800);
    document.getElementById('btnDrafts').click();
    await wait(250);
    check('drafts modal opens', modalOpen('#draftsModal'));
    var dtext = (document.getElementById('draftsBody').textContent || '');
    check('it shows the current draft section', /المسودة الحالية/.test(dtext), dtext.slice(0, 80));
    check('it names the draft facility', /المدائن/.test(dtext), dtext.slice(0, 120));
    check('it shows a saved/unsaved badge', /محفوظة في الأرشيف|غير محفوظة/.test(dtext), dtext.slice(0, 160));
    check('it lists report snapshots', /نسخ محفوظة/.test(dtext), dtext.slice(0, 160));
    check('export button present', !!document.querySelector('#draftsBody [data-draftexport]'));

    /* التحذيرات: نتجاهل تحذير Firebase المعروف، ونفحص ربط الأزرار فقط */
    var bindWarns = __warns.filter(function (w) { return /verifyBindings|\[bind\]/.test(w); });
    check('no binding warnings were logged', bindWarns.length === 0, bindWarns.slice(0, 4));
    var realErrs = window.__errs.filter(function (x) { return x != null; });
    check('no runtime errors at the end', realErrs.length === 0, realErrs);

    finish();
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__test, 1900); });
else setTimeout(__test, 1900);
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__tt" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = chrome.dump('file:///' + PAGE.replace(/\\/g, '/'), {
  budget: 30000, maxBuffer: 48 * 1024 * 1024,
  extra: ['--allow-file-access-from-files', '--window-size=1280,1000'],
});

const m = /<pre id="__tt"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);
try { fs.unlinkSync(PAGE); } catch (e) { /* تجاهل */ }
chrome.cleanProfile();
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
