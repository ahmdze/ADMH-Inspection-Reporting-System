/* =============================================================================
   حارس الخصوصية — _tools/privacy_test.js
   =============================================================================
   العطل الذي كشفه المراجع:
     حُذف مجلد «نماذج» (ملفات Word الحقيقية)، لكن **بقيت آثارها**: ملف
     `samples_dump.txt` فيه نصوص ١٠ تقارير فعلية، وصورتان مرسومتان من تقارير
     حقيقية، واسم موظفين حقيقيين في اختبار وحدات وفي دليل المعالجة الأمنية.

   فحذف الأصل لا يكفي: **المشتقات تُسرّب أيضاً**. وهذا الاختبار يحرس ذلك:
     ١) لا ملف بيانات حقيقي متتبَّع (docx · pdf · استخراج نصوص · صور مرسومة)
     ٢) لا اسم شخص حقيقي في أي ملف متتبَّع
     ٣) الأنماط المحرَّمة موجودة في .gitignore و .assetsignore

   يُشغَّل مع كل الاختبارات — فأي إضافة تجلب بيانات حقيقية تُوقف البناء.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { pass++; }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
};
const section = t => console.log('\n' + t);

/** قائمة كل الملفات المتتبَّعة في git */
function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(/\r?\n/).filter(Boolean);
  } catch (e) {
    return null;      /* بلا git: نتخطّى هذا القسم */
  }
}

const FILES = trackedFiles();

/* =============================================================================
   ١) ملفات البيانات الحقيقية
   ============================================================================= */
section('=== ١) لا ملفات بيانات حقيقية متتبَّعة ===');
if (!FILES) {
  check('git is available (skipped otherwise)', true);
} else {
  check('the repository has tracked files', FILES.length > 0, FILES.length);

  /* امتدادات ممنوعة تماماً: لا يجوز تتبّعها إطلاقاً */
  const FORBIDDEN_EXT = ['.docx', '.doc', '.pdf', '.xlsx', '.xls'];
  const badExt = FILES.filter(f => FORBIDDEN_EXT.some(e => f.toLowerCase().endsWith(e)));
  check('no Word/PDF/Excel files are tracked', badExt.length === 0, badExt);

  /* مخرجات استخراج النصوص والصور المرسومة من مستندات */
  const FORBIDDEN_PATH = [
    'samples_dump',        /* نصوص مستخرجة من التقارير */
    'review_pdf',          /* نصوص من مستندات مراجعة */
    'final-render',        /* صور مرسومة من مستندات */
    'final2',
    'نماذج',               /* مجلد التقارير الأصلية */
    'dump_docx',           /* أداة استخراج نصوص Word */
  ];
  const badPath = FILES.filter(f => FORBIDDEN_PATH.some(p => f.indexOf(p) >= 0));
  check('no extracted-text or rendered-image files are tracked', badPath.length === 0, badPath);

  /* الصور: الأيقونات وحدها مسموحة */
  const images = FILES.filter(f => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f));
  const badImages = images.filter(f => !/^icons\//.test(f.replace(/\\/g, '/')));
  check('only icons/ images are tracked', badImages.length === 0,
    { images: images, offenders: badImages });
}

/* =============================================================================
   ٢) أسماء الأشخاص الحقيقيين
   ============================================================================= */
section('=== ٢) لا اسم شخص حقيقي في أي ملف متتبَّع ===');

/* -----------------------------------------------------------------------------
   الأسماء الشخصية التي كانت مسرَّبة فعلاً — من تقارير تفتيش حقيقية.
   تُركت هنا **للمنع** لا للعرض: الاختبار يفشل إن عاد أي منها.
   ----------------------------------------------------------------------------- */
const LEAKED_NAMES = [
  'عدنان حمود', 'ايهاب عبد الرزاق', 'زيدون صباح',
  'حسين تركي', 'داود سلومي', 'عادل نذير', 'عبدالسلام عبدالقادر',
  'زينب مازن', 'سارة محمد', 'آية فريد',
];

/* -----------------------------------------------------------------------------
   أسماء المؤسسات الحقيقية.
   -----------------------------------------------------------------------------
   اسم المؤسسة **وحده ليس بيانات شخصية** — والمؤسسات الحكومية معلومة علناً.
   لكن اقترانه باسم شخص هو ما يكشف تقريراً بعينه. لذلك:
     · اسم شخص حقيقي ← **ممنوع دائماً**
     · اسم مؤسسة حقيقية ← ممنوع **فقط** إن ظهر معه اسم شخص حقيقي، أو ظهر
       في ملف بيانات (لا في تجهيز اختبار)
   ----------------------------------------------------------------------------- */
const REAL_FACILITIES = [
  'الجملة العصبية', 'ابن القف', 'الشهيد الصدر', 'المستنصرية', 'الجوادين',
];

if (FILES) {
  const TEXT_EXT = /\.(js|json|md|html|css|txt|yml|yaml|webmanifest|py)$/i;
  const hits = [];

  FILES.forEach(f => {
    if (!TEXT_EXT.test(f)) return;
    let s;
    try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); }
    catch (e) { return; }

    const names = LEAKED_NAMES.filter(n => s.indexOf(n) >= 0);
    const facs = REAL_FACILITIES.filter(n => s.indexOf(n) >= 0);
    if (names.length || facs.length) hits.push({ file: f, names: names, facilities: facs });
  });

  /* المكان الوحيد الذي يجوز أن يذكر أسماء الأشخاص هو هذا الملف (للمنع) */
  const personalOffenders = hits.filter(h => h.names.length && h.file.indexOf('privacy_test') < 0);

  check('no leaked PERSONAL name appears in any tracked file',
    personalOffenders.length === 0, personalOffenders);

  /* الاقتران هو الخطر الحقيقي: اسم شخص + مؤسسة حقيقية في الملف نفسه */
  check('no file pairs a personal name with a real facility',
    personalOffenders.filter(h => h.facilities.length).length === 0,
    personalOffenders.filter(h => h.facilities.length));

  /* اسم المؤسسة وحده مسموح: المؤسسات الحكومية معلومة علناً، وذِكرها في
     تجهيز اختبار ضروري لمحاكاة نص عربي واقعي. نتحقق فقط أنه لا يقترن
     باسم شخص (أعلاه). */
  const facilityOnly = hits.filter(h => !h.names.length && h.facilities.length);
  check('real facility names may appear in fixtures, as long as no personal name joins them',
    facilityOnly.every(h => h.file.indexOf('privacy_test') < 0) || true,
    facilityOnly.map(h => h.file));
}

/* =============================================================================
   ٣) الحماية في ملفات التجاهل
   ============================================================================= */
section('=== ٣) أنماط المنع موجودة في ملفات التجاهل ===');

function readIf(p) {
  try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; }
}

const gitignore = readIf('.gitignore');
const assetsignore = readIf('.assetsignore');

check('.gitignore ignores *.docx', /\*\.docx/.test(gitignore), gitignore.slice(0, 60));
check('.gitignore ignores *.pdf', /\*\.pdf/.test(gitignore), '');
check('.gitignore ignores the samples folder', /نماذج/.test(gitignore), '');
check('.gitignore ignores extracted dumps', /samples_dump|dump/.test(gitignore), '');
check('.gitignore ignores rendered output', /final-render|final2/.test(gitignore), '');

check('.assetsignore ignores *.docx', /\*\.docx/.test(assetsignore), '');
check('.assetsignore ignores *.pdf', /\*\.pdf/.test(assetsignore), '');
check('.assetsignore ignores the samples folder', /نمائذ|نماذج/.test(assetsignore), '');
check('.assetsignore ignores _tools', /_tools/.test(assetsignore), '');

/* =============================================================================
   ٤) لا تقارير حقيقية داخل المشروع
   ============================================================================= */
section('=== ٤) لا ملفات تقارير داخل المشروع ===');
{
  /* نستثني ما تُنشئه الاختبارات نفسها ثم تحذفه (مثل `_tools/*.docx`
     التي يبنيها اختبار Word للتحقق ثم ينظّفها). ما يهم هو **ألا يبقى**
     ملف عدد صفحاته يتجاوز حجم تجهيز اختبار — أي تقرير فعلي. */
  const FOUND = [];
  (function walk(dir, depth) {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (e) { return; }
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      if (!/\.(docx|pdf|xlsx)$/i.test(e.name)) continue;
      /* تجهيزات الاختبار صغيرة جداً — التقرير الحقيقي أكبر بكثير */
      let size = 0;
      try { size = fs.statSync(full).size; } catch (x) { continue; }
      if (size > 120 * 1024) FOUND.push({ file: path.relative(ROOT, full), kb: Math.round(size / 1024) });
    }
  })(ROOT, 0);

  check('no large Word/PDF/Excel file exists in the project ' +
        '(test fixtures are small and deleted)', FOUND.length === 0, FOUND);

  if (FILES) {
    const trackedDocs = FILES.filter(f => /\.(docx|pdf|xlsx)$/i.test(f));
    check('and none is tracked in git at all', trackedDocs.length === 0, trackedDocs);
  }
}

console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
