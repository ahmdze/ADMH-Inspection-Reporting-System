/* =============================================================================
   Static page audit for index.html and check.html.

   Guards the class of bug that broke check.html in production:
   a `syncFails++` referencing a variable that was never declared, which threw
   a ReferenceError only when the user reached that code path.

   Checks:
     1. every $('#id') referenced actually exists as an id in that page
     2. no assignment/update to an obviously undeclared counter
     3. every <script src> file exists on disk
     4. no duplicate ids
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); } };

const PAGES = ['index.html', 'check.html'];

/* names that must never appear unless declared in the same page */
const COUNTERS = ['syncFails', 'failCount', 'okCount', 'errorsCount', 'nFails'];

PAGES.forEach(page => {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) { console.log(`\n=== ${page} (missing) ===`); fail++; return; }
  const html = fs.readFileSync(file, 'utf8');
  console.log(`\n=== ${page} ===`);

  const ids = [...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]);
  const idSet = new Set(ids);
  const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
  check('no duplicate ids', dupes.length === 0, [...new Set(dupes)]);

  /* $('#x') references */
  const refs = [...new Set([...html.matchAll(/\$\('#([\w-]+)'\)/g)].map(m => m[1]))];
  const missingIds = refs.filter(r => !idSet.has(r));
  check(`every $('#id') exists (${refs.length} refs)`, missingIds.length === 0, missingIds);

  /* undeclared counters */
  const offenders = [];
  COUNTERS.forEach(name => {
    const used = new RegExp('\\b' + name + '\\s*(\\+\\+|--|[+\\-*/]?=)', 'g');
    const declared = new RegExp('(var|let|const)\\s+' + name + '\\b');
    if (used.test(html) && !declared.test(html)) offenders.push(name);
  });
  check('no undeclared counter variables', offenders.length === 0, offenders);

  /* script src files exist */
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m => m[1])
    .filter(s => !/^https?:/i.test(s));
  const missingFiles = scripts.filter(s => !fs.existsSync(path.join(ROOT, s)));
  check(`all ${scripts.length} local scripts exist`, missingFiles.length === 0, missingFiles);

  /* local script syntax is valid */
  const bad = [];
  scripts.forEach(s => {
    const p = path.join(ROOT, s);
    if (!fs.existsSync(p)) return;
    try { new vm.Script(fs.readFileSync(p, 'utf8'), { filename: s }); }
    catch (e) { bad.push(s + ': ' + e.message); }
  });
  check('all local scripts parse', bad.length === 0, bad);

  /* stylesheet links exist */
  const css = [...html.matchAll(/<link[^>]*\bhref="([^"]+)"[^>]*>/g)]
    .map(m => m[1]).filter(h => !/^https?:/i.test(h) && h.endsWith('.css'));
  const missCss = css.filter(h => !fs.existsSync(path.join(ROOT, h)));
  check('all local stylesheets exist', missCss.length === 0, missCss);
});

/* every inline <script> in check.html must parse */
console.log('\n=== check.html inline script ===');
{
  const html = fs.readFileSync(path.join(ROOT, 'check.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const bad = [];
  inline.forEach((code, i) => {
    try { new vm.Script(code, { filename: 'check.html#inline' + i }); }
    catch (e) { bad.push('inline' + i + ': ' + e.message); }
  });
  check(`all ${inline.length} inline scripts parse`, bad.length === 0, bad);
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
