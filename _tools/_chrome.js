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
const ROOT = path.resolve(__dirname, '..');

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

/* =============================================================================
   ملف تعريف مؤقّت لكل تشغيل + تنظيفه
   =============================================================================
   عطل حقيقي حدث أثناء التطوير:
     كل تشغيل لـChrome بلا `--user-data-dir` يكتب ملفاً مؤقتاً في
     `%TEMP%\HeadlessChrome*` ولا يحذفه. بعد عشرات التشغيلات امتلأ القرص
     (٥١٣ مجلداً · ٧٨٧ ميجابايت)، **فتعلّق Chrome** وصارت اختبارات المتصفح
     تفشل بلا سبب ظاهر في الكود.

   الحل: مجلد مؤقّت خاص بكل تشغيل، نحذفه دائماً — حتى عند الفشل أو الإنهاء.
   ============================================================================= */
const os = require('os');
const { spawnSync } = require('child_process');

let profileDir = null;

/** يُنشئ مجلد ملف تعريف مؤقّتاً (مرة واحدة لكل عملية) */
function profilePath() {
  if (profileDir) return profileDir;

  /* ---------------------------------------------------------------------
     ⚠️ درس مهم:
     كان هذا يُعيد المجلد الأب مباشرةً — وصار `os.tmpdir()` نفسه!
     وبما أن `cleanProfile` يحذف المجلد كاملاً، كان يحذف **كل محتوى
     مجلد النظام المؤقت**. عطل خطير كُشف باختبار يتحقق من أن المسار
     ليس مجلد النظام.

     القاعدة الآن صارمة: نُعيد **مجلداً فرعياً فريداً** دائماً، ولا نُعيد
     أي مسار قائم مسبقاً.
     --------------------------------------------------------------------- */
  const parents = [];
  try { parents.push(os.tmpdir()); } catch (e) { /* تجاهل */ }
  parents.push(path.join(ROOT, '.chrome-tmp'));

  const parent = chooseWritable(parents) || (() => {
    try { return os.tmpdir(); } catch (e) { return ROOT; }
  })();

  const unique = 'admh-chrome-' + process.pid + '-' + Date.now().toString(36);
  const dir = path.join(parent, unique);

  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* سنعمل بلا ملف تعريف */ }

  /* تأكيد أخير: لا يجوز أن يكون المسار مجلد النظام أو جذره */
  if (dir === parent || dir === ROOT) {
    return null;      /* نعمل بلا ملف تعريف — أسلم من حذف مجلد النظام */
  }

  profileDir = dir;
  return profileDir;
}

/**
 * يختار أول مسار أب قابل للكتابة وفيه مساحة كافية.
 * **لا يُعيد مسار ملف تعريف** — بل المجلد الأب فقط.
 * @param {string[]} list
 * @param {number} [needMB] المساحة المطلوبة بالميجابايت
 */
function chooseWritable(list, needMB) {
  const need = (needMB || 300) * 1024 * 1024;
  for (const p of list) {
    try {
      fs.mkdirSync(p, { recursive: true });
      /* نكتب ملفاً فعلياً — الوجود وحده لا يكفي */
      const probe = path.join(p, '.admh-write-probe-' + process.pid + '-' + Date.now());
      fs.writeFileSync(probe, 'x');
      fs.unlinkSync(probe);
      /* هل فيه مساحة كافية؟ */
      try {
        if (typeof fs.statfsSync === 'function') {
          const st = fs.statfsSync(p);
          if (st.bavail * st.bsize < need) continue;
        }
      } catch (e) { /* بلا قياس: نقبله إن كان قابلاً للكتابة */ }
      return p;
    } catch (e) { /* جرّب التالي */ }
  }
  return null;
}

/**
 * يحذف مجلد ملف التعريف. آمن للاستدعاء مرات متعددة.
 * -----------------------------------------------------------------------------
 * ⚠️ حماية صارمة: لا نحذف إلا مجلداً **أنشأناه نحن**، ولا نحذف أبداً
 *    مجلد النظام المؤقت أو جذر المشروع. عطل سابق جعل هذا يحذف كل محتوى
 *    مجلد النظام المؤقت — وهذا ما تمنعه هذه الفحوص.
 * -----------------------------------------------------------------------------
 */
function cleanProfile() {
  if (!profileDir) return;
  const dir = profileDir;
  /* نُصفّر الحالة أولاً حتى يُنشئ أي طلب تالٍ مجلداً جديداً */
  profileDir = null;

  /* لا نحذف إلا ما يبدأ باسمنا، وليس مجلد النظام */
  const base = path.basename(dir);
  const isOurs = /^admh-chrome-/.test(base);
  const isSystem = (() => { try { return dir === os.tmpdir(); } catch (e) { return true; } })();
  const isRoot = dir === ROOT || dir === path.dirname(ROOT);
  if (!isOurs || isSystem || isRoot) return;

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* تجاهل */ }
}

/* نُنظّف عند أي طريقة خروج — وإلا تراكمت الملفات مرة أخرى */
process.on('exit', cleanProfile);
process.on('SIGINT', () => { cleanProfile(); process.exit(130); });
process.on('SIGTERM', () => { cleanProfile(); process.exit(143); });
process.on('uncaughtException', e => { cleanProfile(); console.error(e); process.exit(1); });

/** وسائط Chrome المشتركة — ملف تعريف مؤقّت وصفحة بلا واجهة */
function args(extra) {
  return [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',       /* مساحة /dev/shm صغيرة في CI */
    '--user-data-dir=' + profilePath(),
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--mute-audio',
  ].concat(extra || []);
}

/**
 * يشغّل Chrome مرة واحدة ويعيد مخرج DOM.
 * يضيف مهلته الخاصة حتى لا يتعلّق التشغيل بلا نهاية.
 * @param {string} url
 * @param {object} [opts] { budget, timeout, extra }
 * @returns {string} DOM
 */
function dump(url, opts) {
  opts = opts || {};
  const a = args([
    '--virtual-time-budget=' + (opts.budget || 14000),
    '--dump-dom',
    url,
  ].concat(opts.extra || []));

  const r = spawnSync(findChrome() || requireChrome(), a, {
    encoding: 'utf8',
    maxBuffer: opts.maxBuffer || (48 * 1024 * 1024),
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: opts.timeout || 120000,
  });
  if (r.error) throw r.error;
  return r.stdout || '';
}

module.exports = {
  findChrome, requireChrome,
  args, dump,
  profilePath, cleanProfile,
  CANDIDATES,
};
