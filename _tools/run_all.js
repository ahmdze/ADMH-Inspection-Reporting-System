#!/usr/bin/env node
/* =============================================================================
   مُشغّل كل الاختبارات — _tools/run_all.js
   =============================================================================
   استخدام:
     node _tools/run_all.js              كل الاختبارات
     node _tools/run_all.js --fast       بلا اختبارات المتصفح (أسرع بكثير)
     node _tools/run_all.js --group unit      الوحدات فقط (بلا متصفح)
     node _tools/run_all.js --group browser   المتصفح فقط
     node _tools/run_all.js --list       يسرد المجموعات بلا تشغيل
     node _tools/run_all.js --json       مخرجات JSON (للـCI)

   يعيد رمز خروج 1 عند أي فشل — فيُوقف CI.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, '_tools');

/* -----------------------------------------------------------------------------
   كنس بقايا Chrome قبل البدء.
   -----------------------------------------------------------------------------
   عطل حقيقي: كل تشغيل كان يترك مجلد ملف تعريف في %TEMP%، فتراكمت حتى امتلأ
   القرص (٧٨٧ ميجابايت) وتعلّق Chrome وصارت الاختبارات تفشل بلا سبب ظاهر.
   نكنس القديم (أكثر من ساعة) فقط، فلا نلمس تشغيلاً جارياً.
   ----------------------------------------------------------------------------- */
try {
  const swept = require('./clean_chrome_temp.js').sweep({});
  if (swept.removed && !process.argv.includes('--json')) {
    console.log('نُظّفت بقايا Chrome: ' + swept.removed + ' مجلداً · ' +
      (swept.freed / 1024 / 1024).toFixed(1) + ' م.ب\n');
  }
} catch (e) { /* الكنس تحسين لا أكثر */ }

/* -----------------------------------------------------------------------------
   المجموعات.
   `browser: true` تعني أنها تُشغّل Chrome فعلياً — أبطأ لكنها تفحص ما يراه
   المستخدم. `unit: true` منطق خالص بلا متصفح.
   ----------------------------------------------------------------------------- */
const GROUPS = [
  /* --- منطق خالص: سريع جداً --- */
  { file: 'edge.js',               browser: false, what: 'أدوات مساعدة، سلامة المكتبة، حالات حدية' },
  { file: 'registry_test.js',      browser: false, what: 'سجل المؤسسات، دورة التوصيات، المؤشرات' },
  { file: 'history_test.js',       browser: false, what: 'سجل التعديلات واستعادة النسخ' },
  { file: 'sync_test.js',          browser: false, what: 'محرّك المزامنة بـFirebase وهمي' },
  { file: 'app_sync_test.js',      browser: false, what: 'ترابط الواجهة مع المزامنة' },
  { file: 'sync_conflict_test.js', browser: false, what: 'تعارض المزامنة ومنع فقدان التعديلات' },
  { file: 'firestore_shape_test.js', browser: false, what: 'بنية بيانات Firestore: الرفع والتنزيل حقلاً بحقل' },
  { file: 'account_guard_test.js', browser: false, what: 'حماية البيانات المحلية عند تبديل الحساب' },
  { file: 'sw_test.js',            browser: false, what: 'استراتيجية تخزين عامل الخدمة' },
  { file: 'init_once_test.js',     browser: false, what: 'تهيئة Firebase مرة واحدة (لا تحذيرات مكرّرة)' },
  { file: 'domain_test.js',        browser: false, what: 'ذكر النطاق الحقيقي في الرسائل' },
  { file: 'assetsignore_test.js',  browser: false, what: 'أنماط .assetsignore تستثني الصحيح وتُبقي المهم' },
  { file: 'tooling_test.js',       browser: false, what: 'قارئ ZIP وخادم الاختبار وكنس Chrome' },

  /* --- متصفح حقيقي --- */
  { file: 'notables_test.js',      browser: true,  what: 'النطاق، العنوان التلقائي، خلوّ Word من الجداول' },
  { file: 'auth_test.js',          browser: true,  what: 'الدخول بحساب Google' },
  { file: 'popup_test.js',         browser: true,  what: 'الجلسة + Google Identity Services' },
  { file: 'form_test.js',          browser: true,  what: 'النموذج' },
  { file: 'lists_test.js',         browser: true,  what: 'القوائم القابلة للتحرير' },
  { file: 'library_view_test.js',  browser: true,  what: 'مكتبة العبارات' },
  { file: 'page_audit_test.js',    browser: true,  what: 'سلامة المعرفات وربط الأزرار' },
  { file: 'mobile_test.js',        browser: true,  what: 'عرض الهاتف' },
  { file: 'report_modules_test.js',browser: true,  what: 'منطق التقرير' },
  { file: 'followup_test.js',      browser: true,  what: 'ملف المؤسسات والتوصيات والمؤشرات' },
  { file: 'history_ui_test.js',    browser: true,  what: 'سجل التعديلات في الواجهة' },
  { file: 'transfer_test.js',      browser: true,  what: 'نقل قاعدة البيانات والمسودات والتوصيات' },
  { file: 'manual_sync_test.js',   browser: true,  what: 'لا مزامنة تلقائية + تفريغ التخزين الشامل' },
  { file: 'copy_menu_test.js',     browser: true,  what: 'قائمة النسخ' },
  { file: 'copy_modes_test.js',    browser: true,  what: 'أوضاع النسخ الأربعة' },
  { file: 'format_test.js',        browser: true,  what: 'تنسيق النسخ وفاصل المحور' },
  { file: 'word_copy_test.js',     browser: true,  what: 'صيغة Word في النسخ' },
  { file: 'docx_axis_test.js',     browser: true,  what: 'فحص نصّي لملف Word المُصدَّر' },
  { file: 'storage_test.js',       browser: true,  what: 'فشل التخزين وملكية البيانات' },
  { file: 'visible_error_test.js', browser: true,  what: 'ظهور أخطاء المزامنة' },
];

/* -----------------------------------------------------------------------------
   تحليل الوسائط
   ----------------------------------------------------------------------------- */
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const FAST = has('--fast');
const JSON_OUT = has('--json');
const LIST = has('--list');
const GROUP = argOf('--group');

let list = GROUPS.slice();
if (FAST) list = list.filter(g => !g.browser);
if (GROUP === 'unit') list = list.filter(g => !g.browser);
if (GROUP === 'browser') list = list.filter(g => g.browser);

if (LIST) {
  console.log('المجموعات المتاحة (' + list.length + '):');
  list.forEach(g => console.log('  ' + (g.browser ? '[متصفح] ' : '[وحدة]  ') + g.file.padEnd(24) + g.what));
  process.exit(0);
}

/* -----------------------------------------------------------------------------
   التشغيل
   ----------------------------------------------------------------------------- */
const started = Date.now();
const results = [];
let totalPass = 0;
let totalFail = 0;

if (!JSON_OUT) {
  console.log('نظام التقارير التفتيشية — تشغيل ' + list.length + ' مجموعة' +
    (FAST ? ' (سريع: بلا متصفح)' : ''));
  console.log('='.repeat(66) + '\n');
}

for (const g of list) {
  const full = path.join(TOOLS, g.file);
  if (!fs.existsSync(full)) {
    results.push({ file: g.file, pass: 0, fail: 1, note: 'ملف مفقود' });
    totalFail += 1;
    if (!JSON_OUT) console.log('  ⚠ ' + g.file.padEnd(26) + 'ملف مفقود');
    continue;
  }

  const r = spawnSync(process.execPath, [full], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
  });

  const out = (r.stdout || '') + (r.stderr || '');
  /* نستخرج الأعداد من مخرجات الاختبار */
  let pass = 0, fail = 0;
  const m = /(\d+)\s+passed,\s+(\d+)\s+failed/.exec(out);
  if (m) { pass = +m[1]; fail = +m[2]; }
  else if (/RESULT:\s*PASS/.test(out)) { pass = 1; fail = 0; }
  else if (/RESULT:\s*FAIL/.test(out)) { pass = 0; fail = 1; }
  else if (r.status === 0) { pass = 1; fail = 0; }
  else { fail = 1; }

  /* أحياناً يُخفق الاختبار بلا سطر نتيجة — نُبلّغ */
  if (fail === 0 && r.status !== 0) fail = 1;

  totalPass += pass;
  totalFail += fail;
  results.push({ file: g.file, pass, fail, code: r.status });

  if (!JSON_OUT) {
    const mark = fail ? '✗' : '✓';
    const line = '  ' + mark + ' ' + g.file.padEnd(26) +
      String(pass).padStart(4) + ' ناجح' + (fail ? '  ' + fail + ' فاشل' : '');
    console.log(line);
    /* عند الفشل نُظهر الأسطر الفاشلة لتسهيل التشخيص */
    if (fail) {
      out.split(/\r?\n/).filter(l => /✗|\bFAIL\b/.test(l)).slice(0, 8)
        .forEach(l => console.log('        ' + l.trim()));
    }
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (JSON_OUT) {
  console.log(JSON.stringify({
    totalPass, totalFail, seconds: +seconds,
    suites: results.length, results,
  }, null, 2));
} else {
  console.log('\n' + '='.repeat(66));
  console.log('  الإجمالي: ' + totalPass + ' ناجح، ' + totalFail + ' فاشل' +
    '   (' + results.length + ' مجموعة، ' + seconds + ' ثانية)');
  if (totalFail === 0) console.log('  ✓ كل الاختبارات ناجحة');
  else console.log('  ✗ توجد إخفاقات');
  console.log('='.repeat(66));
}

process.exit(totalFail ? 1 : 0);
