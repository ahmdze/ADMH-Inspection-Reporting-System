#!/usr/bin/env node
/* =============================================================================
   تنظيف ملفات Chrome المؤقتة — _tools/clean_chrome_temp.js
   =============================================================================
   لماذا هذا الملف؟
   -----------------------------------------------------------------------------
   كل تشغيل لـChrome ينشئ مجلد ملف تعريف مؤقّتاً. وبعد إصلاح `_chrome.js`
   صارت المجلدات تُحذف تلقائياً وتكون فارغة (٠.٠٥ م.ب بدل ٩٤ م.ب)، لكن
   المجلدات **الفارغة** قد تبقى إن أُنهيت العملية بعنف (قتل مباشر).

   وقبل الإصلاح تراكمت هذه المجلدات حتى **امتلأ القرص** (٥١٣ مجلداً ·
   ٧٨٧ ميجابايت)، فتعلّق Chrome وصارت اختبارات المتصفح تفشل بلا سبب ظاهر.

   هذه الأداة تُكنس البقايا القديمة، وتُستدعى تلقائياً في بداية تشغيل
   الاختبارات. لا تحذف إلا ما هو **أقدم من ساعة** — فلا تلمس تشغيلاً جارياً.

     node _tools/clean_chrome_temp.js          تنظيف صامت
     node _tools/clean_chrome_temp.js --verbose  عرض التفاصيل
   ============================================================================= */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose');
const MAX_AGE_MS = 60 * 60 * 1000;      /* ساعة */

/* أنماط مجلدات Chrome المؤقتة */
const PATTERNS = [
  /^HeadlessChrome/i,
  /^admh-chrome-/i,
  /^scoped_dir/i,
  /^\.org\.chromium\./i,
  /^chrome_/i,
  /^puppeteer_dev_/i,
  /^chrome-profile-/i,
];

/** حجم مجلد بالبايت */
function sizeOf(p) {
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory()) return st.size;
    let total = 0;
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, e.name);
      total += e.isDirectory() ? sizeOf(full) : (() => {
        try { return fs.lstatSync(full).size; } catch (err) { return 0; }
      })();
    }
    return total;
  } catch (e) { return 0; }
}

/**
 * يمسح مجلداً ويحذف البقايا القديمة.
 * @param {object} [opts] { dir, maxAgeMs, dry }
 * @returns {{removed:number, freed:number, skipped:number}}
 */
function sweep(opts) {
  opts = opts || {};
  const dir = opts.dir || os.tmpdir();
  const maxAge = opts.maxAgeMs == null ? MAX_AGE_MS : opts.maxAgeMs;
  const now = Date.now();

  let removed = 0, freed = 0, skipped = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return { removed, freed, skipped }; }

  for (const e of entries) {
    if (!PATTERNS.some(rx => rx.test(e.name))) continue;
    const full = path.join(dir, e.name);

    let st;
    try { st = fs.statSync(full); } catch (err) { continue; }

    /* لا نلمس ما هو حديث: قد يكون تشغيلاً جارياً */
    if (now - st.mtimeMs < maxAge) { skipped++; continue; }

    const size = sizeOf(full);
    if (opts.dry) {
      if (VERBOSE) console.log('  [تجريبي] ' + e.name + ' · ' + (size / 1024).toFixed(0) + ' ك.ب');
      removed++; freed += size;
      continue;
    }
    try {
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 3 });
      removed++; freed += size;
      if (VERBOSE) console.log('  حُذف ' + e.name + ' · ' + (size / 1024).toFixed(0) + ' ك.ب');
    } catch (err) {
      /* ملف مقفول: نتجاهله */
    }
  }
  return { removed, freed, skipped };
}

const stats = sweep({ dry: process.argv.includes('--dry') });

if (VERBOSE || stats.removed) {
  console.log('  ملفات Chrome المؤقتة: حُذف ' + stats.removed +
    ' · استُعيد ' + (stats.freed / 1024 / 1024).toFixed(2) + ' م.ب' +
    (stats.skipped ? ' · تُرك ' + stats.skipped + ' حديثاً' : ''));
}

module.exports = { sweep };

/* عند التشغيل مباشرةً فقط */
if (require.main === module) process.exit(0);
