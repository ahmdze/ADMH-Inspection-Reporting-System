/* Verify the library view renders correctly and every list is editable. */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const CHROME = require('./_chrome.js').requireChrome();
const PROBE = path.resolve(__dirname, 'view_probe.html');

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>view probe</title></head>
<body><pre id="out">RUNNING</pre>
<iframe id="fr" src="../index.html" style="width:1200px;height:900px"></iframe>
<script>
const out = document.getElementById('out'); const L = [];
const say = s => { L.push(s); out.textContent = L.join('\\n'); };
const fr = document.getElementById('fr');
let n = 0;
function boot() {
  n++;
  let w, d; try { w = fr.contentWindow; d = fr.contentDocument; } catch (e) { say('X'); return; }
  if (!w || !w.ADMH) { if (n < 150) return setTimeout(boot, 100); say('NO ADMH'); return; }
  setTimeout(run, 700);
}
function run() {
  const w = fr.contentWindow, d = fr.contentDocument, A = w.ADMH, LS = w.ADMHLists;
  w.confirm = () => true; w.alert = () => {}; w.prompt = () => 'قيمة تجريبية';
  const ok = [], bad = [];
  const check = (name, cond, det) => { (cond ? ok : bad).push(name + (cond ? '' : '  → ' + JSON.stringify(det))); };

  d.querySelector('#nav button[data-go="library"]').click();

  check('library view visible', !d.getElementById('view-library').classList.contains('hidden'));
  const picker = d.getElementById('listPicker');
  check('list picker populated', picker.options.length === LS.ORDER.length, picker.options.length);
  check('lists count shown', /قوائم/.test(d.getElementById('listsCount').textContent), d.getElementById('listsCount').textContent);

  /* walk EVERY list and confirm the editor renders rows for it */
  let failures = [];
  LS.ORDER.forEach(k => {
    picker.value = k;
    picker.dispatchEvent(new w.Event('change', { bubbles: true }));
    const rows = d.querySelectorAll('#listEditor [data-listval]');
    const expect = LS.get(k).length;
    if (rows.length !== expect) failures.push(k + ':' + rows.length + '/' + expect);
    if (!d.getElementById('listHint').textContent) failures.push(k + ':no-hint');
  });
  check('editor renders every list correctly', failures.length === 0, failures);

  /* add a value through the real button */
  picker.value = 'officialRoles';
  picker.dispatchEvent(new w.Event('change', { bubbles: true }));
  const before = LS.get('officialRoles').length;
  d.getElementById('btnListAdd').click();
  check('add button adds a value', LS.get('officialRoles').length === before + 1, LS.get('officialRoles').length);
  check('new value is the prompted one', LS.get('officialRoles').includes('قيمة تجريبية'), LS.get('officialRoles').slice(-2));
  const roleDl = d.getElementById('dlRoles');
  check('official-roles datalist refreshed', roleDl.innerHTML.includes('قيمة تجريبية'));

  /* delete it through the UI */
  const delBtn = d.querySelector('#listEditor [data-listdel]');
  const n2 = LS.get('officialRoles').length;
  if (delBtn) delBtn.click();
  check('delete button removes a value', LS.get('officialRoles').length === n2 - 1, LS.get('officialRoles').length);

  /* the phrase library section still works */
  const kindSel = d.getElementById('libKind');
  kindSel.value = 'reco';
  kindSel.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('phrase library renders', d.querySelectorAll('#libList [data-libdel]').length > 0,
    d.querySelectorAll('#libList [data-libdel]').length);

  /* list export/import round-trip via the API */
  const snapshot = LS.exportAll();
  check('export returns all lists', Object.keys(snapshot).length === LS.ORDER.length, Object.keys(snapshot).length);
  LS.reset('officialRoles');
  check('reset restores default roles', !LS.get('officialRoles').includes('قيمة تجريبية'));
  const n3 = LS.importAll(snapshot);
  check('import restores snapshot', n3 === LS.ORDER.length, n3);

  /* report still generates after all this */
  A.state.report.facilityName = 'فحص المكتبة';
  A.state.report.visitDate = '2026-09-22';
  A.state.report.records = [{ name: 'سجل الحركة', evalList: ['مُدام وموثق ومحدّث.'], evalManual: '', eval: '' }];
  A.renderAll();
  let built = false;
  try { built = !!A.buildModel().title; } catch (e) { built = 'throw ' + e.message; }
  check('report builds after library edits', built === true, built);

  say('PASS ' + ok.length);
  say('FAIL ' + bad.length);
  ok.forEach(x => say('  ok   ' + x));
  bad.forEach(x => say('  FAIL ' + x));
  say('DONE');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 50));
else setTimeout(boot, 50);
</script></body></html>`;

fs.writeFileSync(PROBE, html);
const dom = execFileSync(CHROME, ['--headless=new','--disable-gpu','--no-sandbox','--allow-file-access-from-files',
  '--virtual-time-budget=25000','--dump-dom','file:///' + PROBE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });
const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
console.log(text);
const pass = +(/PASS (\d+)/.exec(text) || [0,0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0,0])[1];
if (!/DONE/.test(text)) { console.error('did not finish'); process.exit(1); }
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
