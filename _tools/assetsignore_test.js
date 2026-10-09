/* يختبر أن .assetsignore يستثني فعلاً ما يجب استثناؤه */
const fs = require('fs');

const lines = fs.readFileSync('.assetsignore', 'utf8')
  .split(/\r?\n/).map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

console.log('عدد الأنماط:', lines.length);
console.log(JSON.stringify(lines, null, 0));
console.log();

/* محاكاة مبسّطة لقواعد .gitignore:
   نمط بلا شرطة مائلة = يطابق أي مقطع في المسار */
function ignored(file) {
  for (const p of lines) {
    if (p.startsWith('*.')) {
      if (file.endsWith(p.slice(1))) return p;
      continue;
    }
    if (p.endsWith('/**')) {
      const base = p.slice(0, -3);
      if (file === base || file.startsWith(base + '/')) return p;
      continue;
    }
    if (p.startsWith('*')) {
      if (file.endsWith(p.slice(1))) return p;
      continue;
    }
    if (p.endsWith('.*')) {
      if (file.startsWith(p.slice(0, -1))) return p;
      continue;
    }
    if (p.startsWith('/')) {
      if (file === p.slice(1) || file.startsWith(p.slice(1) + '/')) return p;
      continue;
    }
    const segs = file.split('/');
    if (segs.includes(p)) return p;
    if (file.startsWith(p + '/')) return p;
  }
  return null;
}

const MUST_IGNORE = [
  'node_modules/workerd/bin/workerd',
  'node_modules/.bin/wrangler',
  'node_modules/wrangler/package.json',
  '.git/config',
  '.git/objects/ab/cdef',
  '_tools/run_all.js',
  'نماذج/مركز صحي الخناسة.docx',
  'README.md',
  'wrangler.jsonc',
  '.wrangler/tmp/x',
  'package.json.bak',
  'package.json',
  'wrangler.jsonc',
  'dist/index.html',
  '.vscode/settings.json',
  'notes.md',
];

const MUST_SHIP = [
  'index.html', 'app.js', 'sw.js', 'sync.js', 'options.js',
  'registry.js', 'history.js', 'report-model.js', 'report-preview.js',
  'report-clipboard.js', 'report-word.js', 'report-print.js',
  'check.html', 'manifest.webmanifest', '_headers',
  'vendor/docx.umd.js', 'icons/icon-192.png', 'icons/icon-512.png',
];

let bad = 0;
console.log('=== يجب استثناؤها (لا تُرفع) ===');
for (const f of MUST_IGNORE) {
  const by = ignored(f);
  const ok = !!by;
  if (!ok) bad++;
  console.log('  ' + (ok ? '✓' : '✗') + '  ' + f.padEnd(38) + (by ? '← ' + by : '← غير مُستثنى!'));
}

console.log('\n=== يجب رفعها (مهمة للتطبيق) ===');
for (const f of MUST_SHIP) {
  const by = ignored(f);
  const ok = !by;
  if (!ok) bad++;
  console.log('  ' + (ok ? '✓' : '✗') + '  ' + f.padEnd(38) + (by ? '← مُستثنى خطأً بوساطة: ' + by : ''));
}

console.log('\n' + (bad ? '✗ ' + bad + ' حالة خاطئة' : '✓ كل الحالات صحيحة'));
process.exit(bad ? 1 : 0);
