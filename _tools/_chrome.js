/* =============================================================================
   كشف مسار Chrome — _tools/_chrome.js
   =============================================================================
   اختبارات المتصفح تحتاج Chrome. نكشفه بهذا الترتيب:
     ١) متغيّر البيئة CHROME_PATH  (يستخدمه CI)
     ٢) المواضع المعتادة على Windows و macOS و Linux
     ٣) اسم الأمر في PATH (google-chrome / chromium)

   لماذا لا مسار ثابت؟ لأن المسار الثابت Windows-only يمنع CI على Linux،
   وهو ما يجعل الاختبارات تعمل على جهاز واحد فقط.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

/* مسارات التثبيت المعتادة لكل نظام */
const CANDIDATES = [
  /* Windows */
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  /* macOS */
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  /* Linux */
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

/* أسماء الأوامر في PATH */
const COMMANDS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];

/** يبحث عن الأمر في PATH */
function fromPath() {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const d of dirs) {
    if (!d) continue;
    for (const c of COMMANDS) {
      for (const e of exts) {
        const p = path.join(d, c + e);
        try { if (fs.existsSync(p)) return p; } catch (err) { /* تجاهل */ }
      }
    }
  }
  return null;
}

let cached = null;

/**
 * يعيد مسار Chrome، أو null إن لم يوجد.
 * النتيجة تُخزَّن مؤقتاً فلا نُكرّر البحث.
 */
function findChrome() {
  if (cached) return cached;

  /* ١) متغيّر البيئة — الأولوية للـCI */
  const env = process.env.CHROME_PATH || process.env.CHROME_BIN;
  if (env) {
    try { if (fs.existsSync(env)) { cached = env; return cached; } } catch (e) { /* تجاهل */ }
  }

  /* ٢) المواضع المعتادة */
  for (const c of CANDIDATES) {
    try { if (fs.existsSync(c)) { cached = c; return cached; } } catch (e) { /* تجاهل */ }
  }

  /* ٣) PATH */
  const p = fromPath();
  if (p) { cached = p; return cached; }

  return null;
}

/**
 * يعيد مسار Chrome أو يُنهي العملية برسالة واضحة.
 * اختبار متصفح بلا متصفح يجب أن يفشل بوضوح، لا أن ينهار بغموض.
 */
function requireChrome() {
  const c = findChrome();
  if (!c) {
    console.error('✗ لم يُوجد Chrome.');
    console.error('  ثبّت Chrome، أو مرّر مساره:');
    console.error('    Windows:  $env:CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"');
    console.error('    Linux:    CHROME_PATH=/usr/bin/google-chrome node _tools/...');
    console.error('  أو شغّل الوحدات فقط بلا متصفح:  node _tools/run_all.js --group unit');
    process.exit(2);
  }
  return c;
}

module.exports = { findChrome, requireChrome, CANDIDATES };
