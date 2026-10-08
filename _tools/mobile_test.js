/* =============================================================================
   Mobile layout test — runs in a REAL browser at phone width.

   The reported problem: every input table was wider than the screen, forcing
   horizontal scrolling, and header labels were clipped. This asserts:
     · no horizontal overflow anywhere in the app
     · each input table row is stacked (cards), not a wide table
     · inputs are full width and touch friendly
     · column labels are visible above each field
     · desktop layout is NOT affected
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROBE = path.resolve(__dirname, 'mobile_probe.html');

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>mobile</title></head>
<body style="margin:0"><pre id="out">RUNNING</pre>
<iframe id="fr" src="../index.html" style="width:390px;height:900px;border:0"></iframe>
<script>
const out = document.getElementById('out'); const L = [];
const say = s => { L.push(s); out.textContent = L.join('\\n'); };
const fr = document.getElementById('fr');
let n = 0;
function boot() {
  n++;
  let w, d; try { w = fr.contentWindow; d = fr.contentDocument; } catch (e) { say('X'); return; }
  if (!w || !w.ADMH) { if (n < 150) return setTimeout(boot, 100); say('NO ADMH'); return; }
  setTimeout(run, 800);
}
function run() {
  const w = fr.contentWindow, d = fr.contentDocument, A = w.ADMH;
  /* force the narrow layout */
  fr.style.width = '390px';
  const ok = [], bad = [];
  const check = (name, cond, det) => { (cond ? ok : bad).push(name + (cond ? '' : '  → ' + JSON.stringify(det))); };

  /* populate tables so every row type exists */
  const R = A.state.report;
  R.facilityName = 'اختبار الهاتف';
  R.visitDate = '2026-09-22';
  R.officials = [{ role: 'مدير المركز', job: 'طبيب', name: 'فلان الفلاني' }, { role: 'الرديف', job: 'م. طبي', name: 'آخر' }];
  R.procedures = [{ date: '2026-09-22', kind: 'سحب موقف', source: 'موظفي المركز', note: '' }];
  R.prevRecs = [{ text: 'توصية سابقة', status: 'منفذة', note: 'ملاحظة' }];
  R.signers = [{ name: 'عضو', job: 'ضابط', date: '2026-09-22' }];
  R.records = [{ name: 'سجل الحركة', evalList: ['مُدام وموثق ومحدّث.'], evalManual: '', eval: 'مُدام وموثق ومحدّث.' }];
  R.positions = [{ date: '2026-09-22', day: 'الثلاثاء', verb: 'بعد تدقيق', kind: 'موقف البصمة', intro: '',
    items: { absent: [{ job: 'م. طبي', name: 'اسم الشخص', note: 'ملاحظة' }], noExit: [], noEntry: [], noSurprise: [], noBoth: [] } }];
  A.renderAll();
  d.querySelector('#nav button[data-go="report"]').click();

  /* ---- 1. no horizontal overflow ---- */
  const de = d.documentElement;
  const overflow = de.scrollWidth - de.clientWidth;
  check('document has no horizontal overflow', overflow <= 2, { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflow });

  /* ---- 2. viewport is really narrow ---- */
  check('viewport is phone width', w.innerWidth <= 480, w.innerWidth);

  /* ---- 3. tables are stacked (rows are blocks) ---- */
  const tableIds = ['tOfficials', 'tProcs', 'tPrevRecs', 'tSigners', 'tStaff', 'tRecords'];
  const notStacked = [];
  tableIds.forEach(id => {
    const t = d.getElementById(id);
    if (!t) { notStacked.push(id + ':missing'); return; }
    const tr = t.querySelector('tbody tr');
    if (!tr) { notStacked.push(id + ':no-row'); return; }
    if (w.getComputedStyle(tr).display !== 'block') notStacked.push(id + ':' + w.getComputedStyle(tr).display);
  });
  check('all input tables stack into cards', notStacked.length === 0, notStacked);

  /* ---- 4. the scroll wrappers no longer scroll horizontally ---- */
  const scrollers = [...d.querySelectorAll('.tw')].filter(tw => tw.scrollWidth - tw.clientWidth > 2);
  check('no .tw wrapper scrolls horizontally', scrollers.length === 0,
    scrollers.map(tw => (tw.querySelector('table') || {}).id + ':' + (tw.scrollWidth - tw.clientWidth)));

  /* ---- 5. inputs are full width and touch friendly ---- */
  const inputs = [...d.querySelectorAll('.tw table tbody input, .tw table tbody textarea')];
  check('found inputs to measure', inputs.length > 5, inputs.length);
  const narrow = inputs.filter(i => {
    const r = i.getBoundingClientRect();
    return r.width < 250 || r.height < 40;
  });
  check('inputs are wide and tall enough', narrow.length === 0,
    narrow.slice(0, 4).map(i => (i.dataset.k || i.dataset.f || i.type) + ':' + Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height)));

  /* ---- 6. labels are shown above fields (data-label -> ::before) ---- */
  const labelled = [...d.querySelectorAll('.tw table tbody td[data-label]')];
  check('cells carry data-label', labelled.length > 5, labelled.length);
  let labelShown = 0;
  labelled.forEach(td => {
    const c = w.getComputedStyle(td, '::before').content;
    if (c && c !== 'none' && c !== 'normal' && c.length > 2) labelShown++;
  });
  check('labels actually render on mobile', labelShown >= labelled.length - 2, labelShown + '/' + labelled.length);

  /* ---- 7. row number badge is compact, not a full-width block ---- */
  const numTd = d.querySelector('#tOfficials tbody tr td.num');
  if (numTd) {
    const r = numTd.getBoundingClientRect();
    check('row number is a small badge', r.width < 60, Math.round(r.width));
  }

  /* ---- 8. an input is reachable without scrolling sideways ---- */
  const firstInput = d.querySelector('#tStaff tbody input');
  if (firstInput) {
    const r = firstInput.getBoundingClientRect();
    check('first staff input fits the screen', r.left >= -1 && r.right <= w.innerWidth + 1,
      { left: Math.round(r.left), right: Math.round(r.right), vw: w.innerWidth });
  }

  /* ---- 9. positions inner table is stacked too ---- */
  const posTr = d.querySelector('#positions table tbody tr');
  if (posTr) {
    check('position item rows stack', w.getComputedStyle(posTr).display === 'block', w.getComputedStyle(posTr).display);
  } else {
    check('position item rows stack', false, 'no row found');
  }

  /* ---- 10. desktop layout unaffected ---- */
  fr.style.width = '1200px';
  setTimeout(() => {
    const t = d.getElementById('tStaff');
    const tr = t.querySelector('tbody tr');
    check('desktop keeps table layout', w.getComputedStyle(tr).display === 'table-row', w.getComputedStyle(tr).display);
    const th = t.querySelector('thead th');
    check('desktop shows column headers', th && w.getComputedStyle(t.querySelector('thead')).position !== 'absolute', th ? w.getComputedStyle(t.querySelector('thead')).position : 'none');

    say('PASS ' + ok.length);
    say('FAIL ' + bad.length);
    ok.forEach(x => say('  ok   ' + x));
    bad.forEach(x => say('  FAIL ' + x));
    say('DONE');
  }, 350);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 50));
else setTimeout(boot, 50);
</script></body></html>`;

fs.writeFileSync(PROBE, html);
const dom = execFileSync(CHROME, ['--headless=new','--disable-gpu','--no-sandbox','--allow-file-access-from-files',
  '--window-size=1200,1000','--virtual-time-budget=25000','--dump-dom','file:///' + PROBE.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });
const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('no output'); process.exit(1); }
const text = m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
console.log(text);
const pass = +(/PASS (\d+)/.exec(text) || [0,0])[1];
const fail = +(/FAIL (\d+)/.exec(text) || [0,0])[1];
if (!/DONE/.test(text)) { console.error('did not finish'); process.exit(1); }
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
