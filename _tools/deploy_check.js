/* =============================================================================
   محاكاة فحص الأصول قبل النشر — _tools/deploy_check.js
   =============================================================================
   العطل الذي كشفته هذه الأداة:
     إضافة package.json جعلت Cloudflare يُشغّل `bun install`، فنشأ node_modules
     وفيه workerd بحجم ١٢٩ ميجابايت. وwrangler يرفض أي أصل يتجاوز ٢٥ ميجابايت:
       ✘ [ERROR] Asset too large.
     فتوقّف النشر تماماً.

   هذه الأداة تفحص **محلياً** ما سيراه wrangler بعد تطبيق .assetsignore:
     ١) أي ملف يتجاوز الحدّ ← فشل
     ٢) مجلدات ثقيلة لا يجوز رفعها ← تحذير
     ٣) الملفات الأساسية للتطبيق موجودة ← تأكيد

   تُشغَّل قبل الرفع، فيُكتشف العطل في ثانية بدل انتظار دقيقتين في CI.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAX_ASSET = 25 * 1024 * 1024;      /* حدّ Cloudflare: ٢٥ ميجابايت */

/* -----------------------------------------------------------------------------
   قراءة .assetsignore وتطبيق قواعده (محاكاة مبسّطة لقواعد .gitignore)
   ----------------------------------------------------------------------------- */
const raw = fs.existsSync(path.join(ROOT, '.assetsignore'))
  ? fs.readFileSync(path.join(ROOT, '.assetsignore'), 'utf8') : '';

const PATTERNS = raw.split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

function isIgnored(rel) {
  const p = rel.split(path.sep).join('/');
  for (const pat of PATTERNS) {
    if (pat.endsWith('/**')) {
      const base = pat.slice(0, -3);
      if (p === base || p.startsWith(base + '/')) return pat;
      continue;
    }
    if (pat.endsWith('.*')) {
      if (p.startsWith(pat.slice(0, -1))) return pat;
      continue;
    }
    if (pat.startsWith('*.')) {
      if (p.endsWith(pat.slice(1))) return pat;
      continue;
    }
    if (pat.startsWith('/')) {
      const q = pat.slice(1);
      if (p === q || p.startsWith(q + '/')) return pat;
      continue;
    }
    /* نمط بلا شرطة: يطابق أي مقطع في المسار */
    if (p.split('/').includes(pat)) return pat;
    if (p.startsWith(pat + '/')) return pat;
  }
  return null;
}

/* -----------------------------------------------------------------------------
   المشي في الشجرة
   ----------------------------------------------------------------------------- */
const oversized = [];
const heavyDirs = {};
const shipped = [];
let scanned = 0;
let ignoredCount = 0;

/* مجلدات لا ننزل فيها إن كانت مُستثناة (توفيراً للوقت) */
const SKIP_IF_IGNORED = new Set(['node_modules', '.git', '_tools', 'نماذج', 'dist', 'build', '.wrangler', '.github']);

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return; }

  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);

    if (isIgnored(rel)) {
      ignoredCount++;
      /* لا ننزل في مجلد ثقيل مُستثنى */
      if (e.isDirectory() && SKIP_IF_IGNORED.has(e.name)) continue;
      if (e.isDirectory()) continue;
      continue;
    }

    if (e.isDirectory()) { walk(full); continue; }
    if (!e.isFile()) continue;

    let st;
    try { st = fs.statSync(full); } catch (err) { continue; }
    scanned++;
    shipped.push({ rel: rel.split(path.sep).join('/'), size: st.size });

    if (st.size > MAX_ASSET) oversized.push({ rel: rel.split(path.sep).join('/'), size: st.size });

    /* تتبّع حجم المجلدات العلوية للتحذير */
    const top = rel.split(path.sep)[0];
    heavyDirs[top] = (heavyDirs[top] || 0) + st.size;
  }
}

walk(ROOT);

/* -----------------------------------------------------------------------------
   الملفات التي يجب أن تصل للزائر
   ----------------------------------------------------------------------------- */
const REQUIRED = [
  'index.html', 'app.js', 'sw.js', 'sync.js', 'options.js',
  'registry.js', 'history.js',
  'report-model.js', 'report-preview.js', 'report-clipboard.js',
  'report-word.js', 'report-print.js',
  'check.html', 'manifest.webmanifest', '_headers',
];
const missing = REQUIRED.filter(f => !shipped.some(s => s.rel === f));

/* -----------------------------------------------------------------------------
   التقرير
   ----------------------------------------------------------------------------- */
const mb = n => (n / 1024 / 1024).toFixed(2) + ' م.ب';
const total = shipped.reduce((a, s) => a + s.size, 0);

console.log('فحص الأصول قبل النشر');
console.log('='.repeat(62));
console.log('  ملفات ستُرفع:      ' + scanned);
console.log('  مسارات مُستثناة:   ' + ignoredCount);
console.log('  الحجم الكلي:       ' + mb(total));
console.log('  حدّ الملف الواحد:  ' + mb(MAX_ASSET));
console.log('');

let bad = 0;

if (oversized.length) {
  bad += oversized.length;
  console.log('✗ ملفات تتجاوز حدّ Cloudflare — النشر سيفشل:');
  oversized.sort((a, b) => b.size - a.size).slice(0, 15)
    .forEach(o => console.log('    ' + mb(o.size).padStart(10) + '   ' + o.rel));
  console.log('');
  console.log('  الحل: أضف مسار الملف (أو مجلده) إلى .assetsignore.');
  console.log('');
} else {
  console.log('✓ لا ملف يتجاوز الحدّ');
}

if (missing.length) {
  bad += missing.length;
  console.log('✗ ملفات أساسية لن تُرفع (التطبيق سيتعطّل):');
  missing.forEach(f => console.log('    ' + f));
  console.log('');
} else {
  console.log('✓ كل الملفات الأساسية ستُرفع');
}

/* تحذير من مجلدات ثقيلة رغم أنها ستُرفع */
const heavy = Object.keys(heavyDirs)
  .filter(k => heavyDirs[k] > 5 * 1024 * 1024)
  .sort((a, b) => heavyDirs[b] - heavyDirs[a]);
if (heavy.length) {
  console.log('');
  console.log('⚠ مجلدات ثقيلة ستُرفع (راجعها):');
  heavy.slice(0, 8).forEach(k => console.log('    ' + mb(heavyDirs[k]).padStart(10) + '   ' + k));
}

console.log('');
console.log('='.repeat(62));
console.log(bad ? '✗ ' + bad + ' مشكلة تمنع النشر' : '✓ الأصول جاهزة للنشر');
process.exit(bad ? 1 : 0);
