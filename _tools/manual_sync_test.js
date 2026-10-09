/* =============================================================================
   لا مزامنة تلقائية + تفريغ التخزين الشامل — متصفح حقيقي
   ============================================================================= */
const fs = require('fs'), path = require('path');
const chrome = require('./_chrome.js');
const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_t_nosync.html');

const TEST = String.raw`
window.__errs = [];
window.addEventListener('error', function (e) { window.__errs.push(e.message); }, true);

/* نعترض دوال المزامنة **قبل** الإقلاع لنعرف هل تُستدعى تلقائياً */
window.__syncCalls = { syncNow: 0, upload: 0, download: 0, pushDraft: 0, session: 0 };
(function () {
  var tries = 0;
  (function hook() {
    var S = window.ADMHSync;
    if (!S || !S.syncNow) { if (++tries < 200) setTimeout(hook, 20); return; }
    ['syncNow', 'uploadDatabase', 'downloadDatabase', 'pushDraft', 'session'].forEach(function (name) {
      var map = { syncNow: 'syncNow', uploadDatabase: 'upload', downloadDatabase: 'download',
                  pushDraft: 'pushDraft', session: 'session' };
      if (typeof S[name] !== 'function') return;
      var orig = S[name];
      S[name] = function () {
        window.__syncCalls[map[name]]++;
        return orig.apply(S, arguments);
      };
    });
    window.__hooked = true;
  })();
})();

function __test() {
  var d = document.getElementById('__ns');
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
    var A = window.ADMH;
    check('no startup errors', window.__errs.length === 0, window.__errs.slice(0, 3));
    check('sync hooks were installed', window.__hooked === true);

    /* ---------- ١) فتح الصفحة لا يُزامن ---------- */
    await wait(2500);          /* ننتظر ما كان سابقاً فرصة المزامنة التلقائية */
    check('opening the page does NOT call syncNow automatically',
      window.__syncCalls.syncNow === 0, window.__syncCalls);
    check('opening the page does NOT upload', window.__syncCalls.upload === 0, window.__syncCalls);
    check('opening the page does NOT download', window.__syncCalls.download === 0, window.__syncCalls);
    check('opening the page does NOT push the draft', window.__syncCalls.pushDraft === 0, window.__syncCalls);

    /* ---------- الكتابة لا تدفع المسودة ---------- */
    A.state.report.facilityName = 'مركز للاختبار';
    A.saveDraft();
    await wait(1200);          /* أطول من مهلة الدفع القديمة (١٢ ثانية مستبعدة) */
    check('saving a draft does NOT push it automatically',
      window.__syncCalls.pushDraft === 0, window.__syncCalls);
    check('but the draft IS stored locally',
      !!localStorage.getItem('admh.draft.v2'), 'no draft key');

    /* ---------- ٢) زر التفريغ: يوجد ومربوط ---------- */
    var clearBtn = document.getElementById('btnClearAll');
    check('the clear-storage button exists', !!clearBtn);
    check('and is bound', !!(clearBtn && typeof clearBtn.onclick === 'function'));
    check('the inspector button exists', !!document.getElementById('btnStorageInfo'));
    check('the inspector box exists', !!document.getElementById('storageInfoBox'));

    /* ---------- المفتاح الشامل ---------- */
    check('appStorageKeys is exported', typeof A.appStorageKeys === 'function');
    check('storageKeyLabel is exported', typeof A.storageKeyLabel === 'function');

    /* نزرع كل المفاتيح التي كان الحذف القديم يُهملها */
    var ALL = [
      'admh.reports.v2', 'admh.draft.v2', 'admh.settings.v2', 'admh.library.v2',
      'admh.lists.v1', 'admh.registry.v1', 'admh.history.v1',
      'admh.backup.transfer.v1', 'admh.sync.meta.v1', 'admh.sync.config',
      'admh.sync.last', 'admh.sync.gclient', 'admh.local.owner.v1', 'admh.theme',
    ];
    ALL.forEach(function (k) { try { localStorage.setItem(k, '{"x":1}'); } catch (e) {} });

    var found = A.appStorageKeys();
    check('appStorageKeys finds every app key', found.length >= ALL.length,
      { found: found.length, want: ALL.length, missing: ALL.filter(function (k) { return found.indexOf(k) < 0; }) });

    /* المفاتيح الأربعة التي كان الحذف القديم يمسحها فقط */
    var OLD_ONLY = ['admh.reports.v2', 'admh.draft.v2', 'admh.settings.v2', 'admh.library.v2'];
    var neglected = ALL.filter(function (k) { return OLD_ONLY.indexOf(k) < 0; });
    check('the old wipe left ' + neglected.length + ' keys behind (this is the bug)',
      neglected.length === 10, neglected.length);

    /* ---------- المراجع يعرض ما هو محفوظ ---------- */
    A.renderStorageInfo();
    await wait(150);
    var info = (document.getElementById('storageInfoBox').textContent || '');
    check('the inspector lists the stored items', /الأرشيف/.test(info), info.slice(0, 120));
    check('it names the recommendation registry', /سجل المؤسسات والتوصيات/.test(info), info.slice(0, 200));
    check('it names the history log', /سجل التعديلات/.test(info), info.slice(0, 200));
    check('it shows a total', /مفتاحاً|الإجمالي/.test(info), info.slice(0, 200));

    /* ---------- التفريغ الفعلي ---------- */
    window.confirm = function () { return true; };      /* نقبل كل التأكيدات */
    var before = A.appStorageKeys().length;
    check('keys exist before clearing', before >= ALL.length, before);

    /* نعترض reload لأن الصفحة ستُعاد */
    var reloaded = false;
    var origReload = location.reload;
    try { Object.defineProperty(location, 'reload', { configurable: true, value: function () { reloaded = true; } }); }
    catch (e) { /* بعض المتصفحات تمنع */ }

    A.clearAllLocal();
    await wait(600);

    var after = A.appStorageKeys();
    check('ALL app keys were removed', after.length === 0,
      { left: after, count: after.length });
    check('the four keys the old wipe handled are gone too',
      !localStorage.getItem('admh.reports.v2') && !localStorage.getItem('admh.draft.v2'));
    check('the registry key is gone (old wipe missed it)',
      !localStorage.getItem('admh.registry.v1'));
    check('the history key is gone (old wipe missed it)',
      !localStorage.getItem('admh.history.v1'));
    check('the backup key is gone (old wipe missed it)',
      !localStorage.getItem('admh.backup.transfer.v1'));
    check('the sync keys are gone (old wipe missed them)',
      !localStorage.getItem('admh.sync.config') &&
      !localStorage.getItem('admh.local.owner.v1'));

    check('no runtime errors at the end',
      window.__errs.filter(function (x) { return x != null; }).length === 0, window.__errs);

    finish();
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(__test, 900); });
else setTimeout(__test, 900);
`;

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(PAGE, index.replace('<div class="scrim" id="scrim"></div>',
  '<pre id="__ns" style="display:none">PENDING</pre>\n<script>\n' + TEST + '\n</script>\n<div class="scrim" id="scrim"></div>', 1));

const dom = chrome.dump('file:///' + PAGE.replace(/\\/g, '/'), {
  budget: 30000, maxBuffer: 48 * 1024 * 1024,
  extra: ['--allow-file-access-from-files', '--window-size=1280,1000'],
});

const m = /<pre id="__ns"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(text);
try { fs.unlinkSync(PAGE); } catch (e) { /* تجاهل */ }
chrome.cleanProfile();
const pass = +(/PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0, 0])[1];
console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
