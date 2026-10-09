#!/usr/bin/env node
/* =============================================================================
   فحص صياغة كل ملفات JavaScript — _tools/syntax_check.js
   =============================================================================
   سريع جداً (بلا تنفيذ)، ويُستدعى في CI قبل الاختبارات ليكشف أخطاء الصياغة
   فوراً برسالة واضحة بدل فشل غامض داخل اختبار.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* الملفات التي تُشحن للتطبيق */
const APP_FILES = [
  'app.js', 'sync.js', 'options.js', 'registry.js', 'history.js',
  'report-model.js', 'report-preview.js', 'report-clipboard.js',
  'report-word.js', 'report-print.js', 'sw.js',
];

/* ملفات الأدوات والاختبارات */
function toolFiles() {
  try {
    return fs.readdirSync(path.join(ROOT, '_tools'))
      .filter(f => f.endsWith('.js'))
      .map(f => '_tools/' + f);
  } catch (e) { return []; }
}

const files = APP_FILES.concat(toolFiles()).filter(f => fs.existsSync(path.join(ROOT, f)));

let bad = 0;
console.log('فحص الصياغة — ' + files.length + ' ملفاً\n');

for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    /* new vm.Script يفحص الصياغة بلا تنفيذ */
    new vm.Script(src, { filename: f });
    /* فحوص إضافية: ملفات التطبيق لا يجوز أن تحتوي require أو module.exports */
    if (!f.startsWith('_tools/')) {
      if (/^\s*(?:const|let|var)\s+\w+\s*=\s*require\(/m.test(src)) {
        throw new Error('يستخدم require() — التطبيق يعمل في المتصفح بلا حزم');
      }
      if (/^\s*module\.exports\s*=/m.test(src)) {
        /* مسموح في app.js وحده (للاختبار الآلي) */
        if (f !== 'app.js' && f !== 'sync.js') {
          throw new Error('يستخدم module.exports — غير متوقّع خارج app.js/sync.js');
        }
      }
    }
  } catch (e) {
    bad += 1;
    console.log('  ✗ ' + f);
    console.log('      ' + String(e.message).split('\n')[0]);
  }
}

if (!bad) console.log('  ✓ كل الملفات سليمة الصياغة');
console.log('\n' + (bad ? '✗ ' + bad + ' ملفاً فيه خطأ' : '✓ لا أخطاء'));
process.exit(bad ? 1 : 0);
