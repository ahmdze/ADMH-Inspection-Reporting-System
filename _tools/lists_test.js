/* Verify the option-list editor end-to-end in a REAL browser:
   editing a list must immediately change the corresponding dropdown,
   and changes must persist to localStorage. */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const chrome = require('./_chrome.js');
const CHROME = chrome.requireChrome();
const PROBE = path.resolve(__dirname, 'lists_probe.html');

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>lists probe</title></head>
<body>
<pre id="out">RUNNING</pre>
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
  /* headless Chrome blocks on native dialogs, so answer them automatically */
  w.confirm = () => true;
  w.alert = () => {};
  w.prompt = () => null;
  const ok = [], bad = [];
  const check = (name, cond, det) => { (cond ? ok : bad).push(name + (cond ? '' : '  → ' + JSON.stringify(det))); };

  check('ADMHLists loaded', !!LS);
  if (!LS) { finish(); return; }

  /* every list defined */
  const expect = ['jobTitles','officialRoles','staffCategories','positionCategories','positionVerbs',
    'positionKinds','procedureKinds','procedureSources','prevRecStatuses','recordNames',
    'recommendationEntities','recommendationLetters',
    'visitTypes','facilityKinds','deviceStates','reportFreqs','reportTargets'];
  const missing = expect.filter(k => !LS.has(k));
  check('all ' + expect.length + ' lists present', missing.length === 0, missing);
  const empty = expect.filter(k => LS.get(k).length === 0);
  check('no list is empty', empty.length === 0, empty);

  /* dropdowns are populated FROM the lists */
  const vt = d.getElementById('f_visitType');
  check('visit-type dropdown populated', vt && vt.options.length === LS.get('visitTypes').length,
    vt ? vt.options.length : 'no element');
  const fk = d.getElementById('f_facilityKind');
  check('facility-kind dropdown populated', fk && fk.options.length === LS.get('facilityKinds').length,
    fk ? fk.options.length : 'no element');
  const fr2 = d.getElementById('f_fpReportFreq');
  check('report-freq dropdown has a blank + list',
    fr2 && fr2.options.length === LS.get('reportFreqs').length + 1, fr2 ? fr2.options.length : 'none');
  const dl = d.getElementById('dlJobs');
  check('job-title datalist populated', dl && dl.querySelectorAll('option').length === LS.get('jobTitles').length,
    dl ? dl.querySelectorAll('option').length : 'none');

  /* --- edit a list via the UI and confirm the dropdown follows --- */
  d.querySelector('#nav button[data-go="library"]').click();
  const picker = d.getElementById('listPicker');
  check('list picker has an option per list', picker.options.length === expect.length, picker.options.length);
  picker.value = 'visitTypes';
  picker.dispatchEvent(new w.Event('change', { bubbles: true }));

  const rowInputs = d.querySelectorAll('#listEditor [data-listval]');
  check('editor rendered rows for visitTypes', rowInputs.length === LS.get('visitTypes').length, rowInputs.length);

  /* add a brand-new value via the editor input, then blur */
  const before = LS.get('visitTypes').length;
  const first = rowInputs[0];
  const oldVal = first.value;
  first.value = 'زيارة اختبارية فريدة';
  first.dispatchEvent(new w.Event('input', { bubbles: true }));
  first.dispatchEvent(new w.Event('change', { bubbles: true }));
  const after = LS.get('visitTypes').length;
  check('edited value stored in the list', after === before, after);
  check('new value present in list', LS.get('visitTypes').includes('زيارة اختبارية فريدة'), LS.get('visitTypes').slice(0, 3));
  check('visit-type dropdown refreshed', [...vt.options].some(o => o.value === 'زيارة اختبارية فريدة'),
    [...vt.options].map(o => o.value));

  /* persisted? */
  let persisted = false;
  try { const raw = w.localStorage.getItem('admh.lists.v1'); persisted = !!raw && raw.includes('زيارة اختبارية فريدة'); } catch (e) {}
  check('change persisted to localStorage', persisted);

  /* reorder */
  picker.value = 'jobTitles';
  picker.dispatchEvent(new w.Event('change', { bubbles: true }));
  const jt0 = LS.get('jobTitles')[0], jt1 = LS.get('jobTitles')[1];
  const mv = d.querySelector('#listEditor [data-listmove="1|-1"]');
  check('move-up button exists', !!mv);
  if (mv) { mv.click(); check('move reorders list', LS.get('jobTitles')[0] === jt1 && LS.get('jobTitles')[1] === jt0, LS.get('jobTitles').slice(0, 2)); }

  /* delete */
  const n2 = LS.get('jobTitles').length;
  const del = d.querySelector('#listEditor [data-listdel]');
  if (del) { del.click(); check('delete removes a value', LS.get('jobTitles').length === n2 - 1, LS.get('jobTitles').length); }

  /* reset restores defaults */
  LS.reset('visitTypes');
  check('reset restores defaults', !LS.get('visitTypes').includes('زيارة اختبارية فريدة'), LS.get('visitTypes'));

  /* every list must be able to drive a dropdown without throwing */
  let applied = 0;
  expect.forEach(k => {
    try { LS.add(k, '__probe__'); LS.remove(k, '__probe__'); applied++; } catch (e) {}
  });
  check('all lists accept add/remove', applied === expect.length, applied);

  /* report generation still works with edited lists */
  A.state.report.facilityName = 'اختبار القوائم';
  A.state.report.visitDate = '2026-09-22';
  A.renderAll();
  let modelOk = false;
  try { const M = A.buildModel(); modelOk = !!M && !!M.title; } catch (e) { modelOk = 'throw: ' + e.message; }
  check('model builds after list edits', modelOk === true, modelOk);

  finish();
  function finish() {
    say('PASS ' + ok.length);
    say('FAIL ' + bad.length);
    ok.forEach(x => say('  ok   ' + x));
    bad.forEach(x => say('  FAIL ' + x));
    say('DONE');
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 50));
else setTimeout(boot, 50);
</script>
</body></html>`;

fs.writeFileSync(PROBE, html);

const dom = execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--virtual-time-budget=25000', '--dump-dom',
  'file:///' + PROBE.replace(/\\/g, '/'),
], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
console.log(text);
const pass = +( /PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +( /FAIL (\d+)/.exec(text) || [0, 0])[1];
if (!/DONE/.test(text)) { console.error('probe did not finish'); process.exit(1); }
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
chrome.cleanProfile();
process.exit(fail ? 1 : 0);
