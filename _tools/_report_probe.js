/* يُزرع داخل index.html الحقيقي — يختبر منطق التقرير بعد تقسيمه إلى ملفات */
window.__errs = [];
window.addEventListener('error', function (e) {
  window.__errs.push('ERROR: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno);
}, true);

function __reportTest() {
  var d = document.getElementById('__t');
  var ok = [], bad = [];
  function check(name, cond, det) { (cond ? ok : bad).push(name + (cond ? '' : '  -> ' + JSON.stringify(det))); }
  function finish() {
    d.textContent = 'PASS ' + ok.length + '\nFAIL ' + bad.length + '\n'
      + ok.map(function (x) { return '  ok   ' + x; }).join('\n') + '\n'
      + bad.map(function (x) { return '  FAIL ' + x; }).join('\n');
  }

  try {
    var NS = window.ADMHReport || {}, A = window.ADMH;

    /* ---------- الإقلاع ---------- */
    check('no startup errors', window.__errs.length === 0, window.__errs.slice(0, 3));
    check('app booted once', NS.__booted === true, NS.__booted);
    var mods = ['buildModel','renderPreview','copyReport','printReport','exportWord'];
    check('all report functions available',
      mods.every(function (m) { return typeof NS[m] === 'function'; }),
      mods.filter(function (m) { return typeof NS[m] !== 'function'; }));
    check('A4 page geometry exported',
      !!(NS.PAGE && NS.PAGE.W === 11906 && NS.PAGE.CONTENT_W === 9026), NS.PAGE);
    check('buildPlainText available', typeof NS.buildPlainText === 'function');

    /* ---------- الأزرار ---------- */
    var cb = document.getElementById('btnCopy');
    check('copy button exists', !!cb);
    check('copy button bound', !!(cb && typeof cb.onclick === 'function'));
    check('copy button labelled', !!(cb && /نسخ/.test(cb.textContent)), cb && cb.textContent.trim());
    check('copy button is in the preview bar',
      !!(cb && cb.closest('#view-preview')), !!cb);
    check('print button bound', !!(document.getElementById('btnPrint') || {}).onclick);
    check('word button bound', !!(document.getElementById('btnWord2') || {}).onclick);

    /* ---------- سيناريو تقرير كامل ---------- */
    var R = A.state.report;
    R.facilityName = 'مركز صحي الخناسة'; R.sector = 'قطاع المدائن';
    R.visitDate = '2026-09-22'; R.dayName = 'الثلاثاء'; R.population = '20416';
    R.families = '3120';
    R.visitType = 'زيارة تفتيشية';
    R.officials = [{ role: 'مدير المركز', job: 'طبيب', name: 'فلان الفلاني' }];
    R.staff = { 'الملاك': { total: '55', actual: '32' } };
    R.records = [{ name: 'سجل الحركة', evalList: ['مُدام وموثق ومحدّث.'], evalManual: '', eval: '' }];
    R.recGroups = [{ letter: 'أ', label: 'شعبة التحقيقات / قسمنا', intro: '', items: ['تشكيل لجنة تحقيقية.'] }];
    R.signers = [{ name: 'عضو فريق التفتيش', job: 'ضابط تفتيش', date: '2026-09-22' }];
    A.renderAll();

    var M = NS.buildModel();
    check('model built', !!(M && M.title), M && M.title);
    check('model has sections', !!(M && M.sections && M.sections.length >= 3), M && M.sections && M.sections.length);
    check('staff section present',
      !!(M && M.sections.some(function (x) { return x.heading === 'الملاك الكلي والفعلي'; })));
    check('staff line has total and actual',
      !!(M && M.sections.some(function (s) {
        return s.type === 'list' && s.items.some(function (i) { return /الملاك الكلي 55/.test(i) && /الفعلي 32/.test(i); });
      })));
    check('model keeps the visit type', M.visitType === 'زيارة تفتيشية', M.visitType);
    check('model has no tables', !(M.sections || []).some(function (s) { return s.type === 'table'; }));

    /* ---------- (٢) النفوس والعوائل داخل قسم الملاك، لا في البيانات العلوية ---------- */
    var staffSec = (M.sections || []).filter(function (s) { return s.heading === 'الملاك الكلي والفعلي'; })[0];
    check('population moved into the staff section',
      !!(staffSec && staffSec.items.some(function (i) { return /عدد النفوس المسجلة: 20416/.test(i); })),
      staffSec && staffSec.items);
    check('families moved into the staff section',
      !!(staffSec && staffSec.items.some(function (i) { return /عدد العوائل المسجلة: 3120/.test(i); })));
    check('population is NOT in the top meta block',
      !(M.meta || []).some(function (m) { return /النفوس/.test(m[0]); }), M.meta);
    check('families is NOT in the top meta block',
      !(M.meta || []).some(function (m) { return /العوائل/.test(m[0]); }));
    /* النفوس والعوائل آخر سطرين في القسم */
    check('population and families come after the staff rows',
      staffSec && /النفوس/.test(staffSec.items[staffSec.items.length - 2] || '') &&
      /العوائل/.test(staffSec.items[staffSec.items.length - 1] || ''),
      staffSec && staffSec.items.slice(-2));

    /* ---------- (٤) الاسم يظهر مع العنوان الوظيفي ---------- */
    var offSec = (M.sections || []).filter(function (s) { return s.heading === 'بيانات المؤسسة'; })[0];
    check('official row keeps BOTH job and name',
      !!(offSec && /فلان الفلاني/.test(offSec.rows[0][1]) && /طبيب/.test(offSec.rows[0][1])),
      offSec && offSec.rows);
    check('name appears in the plain text too',
      plainHas('فلان الفلاني'));
    check('signer name appears', plainHas('عضو فريق التفتيش'));

    function plainHas(needle) {
      try { return NS.buildPlainText(M).indexOf(needle) >= 0; } catch (e) { return false; }
    }

    /* ---------- (١) نافذة تقرير جديد ---------- */
    var nm = document.getElementById('newModal');
    check('new-report dialog exists', !!nm);
    check('dialog has a save choice', !!document.getElementById('newSave'));
    check('dialog has a skip choice', !!document.getElementById('newDiscard'));

    /* التقرير غير فارغ الآن، فالضغط على «تقرير جديد» يجب أن يفتح الحوار لا أن يبدأ مباشرة */
    document.getElementById('btnNew').click();
    check('clicking «new report» opens the dialog', nm.classList.contains('open'), nm.className);

    /* نختار «بلا حفظ»: يجب أن تُصفَّر كل الحقول */
    document.getElementById('newDiscard').click();
    var R2 = A.state.report;
    check('dialog closes after choosing', !nm.classList.contains('open'), nm.className);
    check('facility name cleared', R2.facilityName === '', R2.facilityName);
    check('sector cleared', R2.sector === '', R2.sector);
    check('population cleared', R2.population === '', R2.population);
    check('families cleared', R2.families === '', R2.families);
    check('officials reset to one empty row',
      R2.officials.length === 1 && !R2.officials[0].name && !R2.officials[0].job, R2.officials);
    check('staff totals cleared',
      Object.keys(R2.staff || {}).every(function (k) {
        return !R2.staff[k].total && !R2.staff[k].actual;
      }), R2.staff);
    check('procedures cleared', (R2.procedures || []).length === 0, R2.procedures);
    check('signers cleared', (R2.signers || []).length === 0, R2.signers);
    check('a brand-new id was issued', R2.id !== R.id, { old: R.id, now: R2.id });

    /* والاختيار الآخر: الحفظ في الأرشيف */
    var before2 = A.state.reports.length;
    A.state.report.facilityName = 'مركز للاختبار';
    document.getElementById('btnNew').click();
    document.getElementById('newSave').click();
    check('save choice archives the previous report',
      A.state.reports.length === before2 + 1, { before: before2, after: A.state.reports.length });
    check('archived report keeps its name',
      A.state.reports.some(function (r) { return r.facilityName === 'مركز للاختبار'; }));
    check('and the form is blank again', A.state.report.facilityName === '', A.state.report.facilityName);

    /* ---------- (٣) خيارات جهة السحب ---------- */
    check('source datalist exists', !!document.getElementById('dlSources'));
    var dl = document.getElementById('dlSources');
    check('source datalist has options', dl && dl.options.length > 0, dl && dl.options.length);

    /* ---------- معرّف عميل Google: يجب أن يظهر دائماً ----------
       عطل حقيقي سابق: كان داخل #syncOff، فيختفي بعد حفظ الإعدادات —
       فيتعذّر على المستخدم المُهيَّأ إدخاله أصلاً. */
    var gbox = document.getElementById('gcidBox');
    check('Google client ID box exists', !!gbox);
    check('client ID box is NOT inside #syncOff',
      !!(gbox && !gbox.closest('#syncOff')), !!(gbox && gbox.closest('#syncOff')));
    check('client ID box is NOT inside #syncOn',
      !!(gbox && !gbox.closest('#syncOn')));
    check('client ID input exists', !!document.getElementById('syncGClient'));
    check('save button exists', !!document.getElementById('btnSaveGClient'));
    check('save button is bound',
      !!(document.getElementById('btnSaveGClient') || {}).onclick);
    check('state pill exists', !!document.getElementById('gcidState'));
    /* المعرّف مضمَّن في النظام، فلا حاجة لفتح الصندوق تلقائياً */
    check('embedded client ID is already configured',
      !!(window.ADMHSync && window.ADMHSync.hasGoogleClientId()), 
      window.ADMHSync && window.ADMHSync.googleClientId());
    /* وحفظه يعمل فعلاً */
    var gi2 = document.getElementById('syncGClient');
    gi2.value = '123456-abc.apps.googleusercontent.com';
    document.getElementById('btnSaveGClient').click();
    check('saving stores the client ID',
      !!(A.state && window.ADMHSync && window.ADMHSync.hasGoogleClientId &&
         window.ADMHSync.hasGoogleClientId()));
    check('state pill updates after saving',
      /مضبوط/.test(document.getElementById('gcidState').textContent),
      document.getElementById('gcidState').textContent);
    /* معرّف غير صالح يُرفض */
    gi2.value = 'not-a-valid-id';
    document.getElementById('btnSaveGClient').click();
    check('invalid client ID is rejected',
      window.ADMHSync.hasGoogleClientId() === true,   /* بقي السابق */
      gi2.value);

    /* ---------- اتجاه الحقل: العطل الذي أربك المستخدم ----------
       الحقل نص لاتيني داخل صفحة RTL. بدون dir="ltr" تُقلب الكتلتان حول
       الشارحة - فيبدو أن الأرقام انتقلت إلى نهاية السطر. */
    check('client ID input is LTR', gi2.getAttribute('dir') === 'ltr', gi2.getAttribute('dir'));
    check('saved-ID line is LTR too',
      (document.getElementById('gcidSaved') || {}).getAttribute
        ? document.getElementById('gcidSaved').getAttribute('dir') === 'ltr' : false);
    check('paste button exists and is bound',
      !!(document.getElementById('btnPasteGClient') || {}).onclick);
    check('preview line exists', !!document.getElementById('gcidPreview'));

    /* ---------- التنظيف: مسافات ومحارف اتجاه مخفية ---------- */
    var GOOD = '744885015267-gp8dnfvsdk08vl712hpot371fndn1886.apps.googleusercontent.com';
    /* القيمة كما قد تصل من نسخ مشوّه: مسافة، محرف اتجاه، سطر جديد، مسافة في الوسط */
    gi2.value = ' ' + GOOD.slice(0, 12) + '\u200f' + GOOD.slice(12, 30) + '\n' + GOOD.slice(30) + ' ';
    document.getElementById('btnSaveGClient').click();
    var stored = window.ADMHSync.googleClientId();
    check('pasted value is cleaned before saving', stored === GOOD, stored);
    check('input field shows the cleaned value', gi2.value === GOOD, gi2.value);
    check('preview confirms a valid format',
      /صحيحة/.test(document.getElementById('gcidPreview').textContent),
      document.getElementById('gcidPreview').textContent);

    /* HTML entity قد يصل عند النسخ من صفحة ويب */
    gi2.value = GOOD.replace('.apps', '&amp;.apps');
    document.getElementById('btnSaveGClient').click();
    check('HTML entity is repaired', window.ADMHSync.googleClientId() === GOOD,
      window.ADMHSync.googleClientId());

    /* اقتباسات عالقة */
    gi2.value = '"' + GOOD + '"';
    document.getElementById('btnSaveGClient').click();
    check('surrounding quotes are stripped', window.ADMHSync.googleClientId() === GOOD,
      window.ADMHSync.googleClientId());

    /* الشارحة في أول المعرّف لا تُشوّه شيئاً */
    check('the hyphen stays in place',
      window.ADMHSync.googleClientId().indexOf('744885015267-') === 0,
      window.ADMHSync.googleClientId().slice(0, 16));

    /* ننظّفه حتى لا يؤثر على بقية الفحوص */
    gi2.value = '';
    document.getElementById('btnSaveGClient').click();

    /* نُعيد تقريراً non-empty للمعاينة والتصدير */
    var R3 = A.state.report;
    R3.facilityName = 'مركز صحي الخناسة'; R3.sector = 'قطاع المدائن';
    R3.visitDate = '2026-09-22';
    R3.officials = [{ role: 'مدير المركز', job: 'طبيب', name: 'فلان الفلاني' }];
    R3.staff = { 'الملاك': { total: '55', actual: '32' } };
    R3.records = [{ name: 'سجل الحركة', evalList: ['مُدام وموثق ومحدّث.'], evalManual: '', eval: '' }];
    R3.signers = [{ name: 'عضو فريق التفتيش', job: 'ضابط تفتيش', date: '2026-09-22' }];
    /* صف إجراءات + مجموعة توصيات: يلزم لنص عادي فيه بنود مرقّمة وصف مصدر */
    R3.procedures = [{ date: '2026-09-22', kind: 'سحب موقف', source: 'موظفي المركز', note: '' }];
    R3.recGroups = [{ letter: 'أ', label: 'شعبة التحقيقات / قسمنا', intro: '', items: ['تشكيل لجنة تحقيقية.'] }];
    A.renderAll();
    M = NS.buildModel();

    /* بعد رسم صف الإجراءات: هل الحقل يشير إلى قائمة الخيارات؟ */
    check('a source input points at the datalist',
      !!document.querySelector('#tProcs tbody tr[data-i] input[data-k="source"][list="dlSources"]'));
    check('the source field offers choices in the DOM',
      (function () {
        var inp = document.querySelector('#tProcs tbody tr[data-i] input[data-k="source"]');
        return !!(inp && inp.getAttribute('list') === 'dlSources');
      })());

    /* ---------- المعاينة ---------- */
    NS.renderPreview();
    var doc = document.getElementById('docPreview');
    check('preview has content', doc.innerHTML.length > 400, doc.innerHTML.length);
    check('preview has the title', doc.innerHTML.indexOf('الخناسة') >= 0);
    check('preview has a section heading', /وحدة البصمة|السجلات|الملاحظات/.test(doc.innerHTML));
    check('preview meta filled',
      (document.getElementById('previewMeta').textContent || '').indexOf('الخناسة') >= 0,
      document.getElementById('previewMeta').textContent);

    /* ---------- النص العادي للنسخ ---------- */
    var plain = NS.buildPlainText(M);
    check('plain text built', plain.length > 200, plain.length);
    check('plain text has the title', plain.indexOf('الخناسة') >= 0);
    check('plain text has numbered items', /1-/.test(plain));
    check('plain text has signature line', /التوقيع/.test(plain));
    check('plain text has no HTML tags', !/<[a-z][^>]*>/i.test(plain));

    /* ---------- النسخ والطباعة ---------- */
    var e1 = null, e2 = null;
    try { NS.copyReport(); } catch (e) { e1 = e.message; }
    try { NS.printReport(); } catch (e) { e2 = e.message; }
    check('copyReport does not throw', !e1, e1);
    check('printReport does not throw', !e2, e2);
    check('print created a hidden iframe', document.querySelectorAll('iframe').length >= 1,
      document.querySelectorAll('iframe').length);

    /* ---------- تصدير Word ---------- */
    var downloads = [];
    var origCreate = URL.createObjectURL;
    URL.createObjectURL = function (b) { downloads.push(b); return 'blob:x'; };
    NS.exportWord().then(function () {
      URL.createObjectURL = origCreate;
      check('word export produced a blob', downloads.length >= 1, downloads.length);
      var b = downloads[downloads.length - 1];
      check('blob is non-trivial', !!(b && b.size > 4000), b && b.size);
      return b ? b.arrayBuffer() : null;
    }).then(function (ab) {
      if (ab) {
        var bytes = new Uint8Array(ab);
        /* ملف docx ملف ZIP: يبدأ بـ PK */
        check('docx has a ZIP signature', bytes[0] === 0x50 && bytes[1] === 0x4B,
          [bytes[0], bytes[1]]);
      }
      finish();
    }).catch(function (e) { check('exportWord did not throw', false, e.message); finish(); });
  } catch (err) {
    bad.push('THREW: ' + err.message + ' | ' + (err.stack || '').split('\n')[1]);
    finish();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { setTimeout(__reportTest, 1800); });
} else {
  setTimeout(__reportTest, 1800);
}
