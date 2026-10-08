/* =============================================================================
   Form-input regression guard.

   Bug this prevents: the delegated input handler located its row with
   closest('tr[data-i]'). Staff rows carry data-k (category name) and no
   data-i, so the row resolved to null and typing into the staff table was
   silently discarded — the values never reached the report or the Word file.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROBE = path.resolve(__dirname, 'input_probe.html');
const APP = path.resolve(__dirname, '..');

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>input probe</title></head>
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
  const w = fr.contentWindow, d = fr.contentDocument, A = w.ADMH, R = A.state.report;
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const ok = [], bad = [];
  const check = (name, cond, det) => { (cond ? ok : bad).push(name + (cond ? '' : '  → ' + det)); };
  /* تشخيص: أي عطل غير متوقّع يُسجَّل ويُنهي الاختبار بدل تركه معلّقاً */
  try {
  runChecks();
  } catch (e) {
    bad.push('THREW: ' + e.message);
    finish();
    return;
  }
  finish();

  function finish() {
    say('PASS ' + ok.length);
    say('FAIL ' + bad.length);
    ok.forEach(x => say('  ok   ' + x));
    bad.forEach(x => say('  FAIL ' + x));
    say('DONE');
  }

  function runChecks() {
  /* ---- staff ---- */
  const srow = d.querySelector('#tStaff tbody tr');
  const st = srow.querySelector('[data-f="total"]'), sa = srow.querySelector('[data-f="actual"]');
  st.value = '91'; fire(st, 'input');
  sa.value = '59'; fire(sa, 'input');
  check('staff total persists', R.staff[srow.dataset.k].total === '91', JSON.stringify(R.staff[srow.dataset.k]));
  check('staff actual persists', R.staff[srow.dataset.k].actual === '59', JSON.stringify(R.staff[srow.dataset.k]));
  const M = A.buildModel();
  const sec = M.sections.find(s => s.heading === 'الملاك الكلي والفعلي');
  check('staff appears in model', !!sec && sec.items.length > 0, JSON.stringify(sec && sec.items));
  check('staff line has both numbers',
    !!(sec && /الملاك الكلي 91/.test(sec.items[0]) && /الملاك الفعلي 59/.test(sec.items[0])), sec && sec.items[0]);
  check('no shortfall in model', !(sec && sec.items.some(i => /النقص|بنسبة|%/.test(i))), sec && sec.items);
  check('staff table has 3 columns',
    d.querySelectorAll('#tStaff thead th').length === 3, d.querySelectorAll('#tStaff thead th').length);

  /* ---- officials ---- */
  const orow = d.querySelector('#tOfficials tbody tr');
  const on = orow.querySelector('[data-k="name"]');
  on.value = 'فلان الفلاني'; fire(on, 'input');
  check('official name persists', R.officials[0].name === 'فلان الفلاني', JSON.stringify(R.officials[0]));

  /* ---- procedures ----
     النافذة الجديدة فارغة تماماً: لا صفوف إجراءات مُنشأة مسبقاً،
     فيجب إضافتها بزر «+ إجراء» أولاً. */
  if (!d.querySelector('#tProcs tbody tr[data-i]')) {
    A.state.report.procedures.push({ date: '2026-09-22', kind: 'سحب موقف', source: '', note: '' });
    A.renderAll();
  }
  const prow = d.querySelector('#tProcs tbody tr[data-i]');
  const ps = prow.querySelector('[data-k="source"]');
  ps.value = 'موظفي المركز'; fire(ps, 'input');
  check('procedure source persists', R.procedures[0].source === 'موظفي المركز', JSON.stringify(R.procedures[0]));
  check('procedure source field offers a datalist',
    ps.getAttribute('list') === 'dlSources', ps.getAttribute('list'));

  /* ---- signers ----
     وكذلك التوقيعات: تُضاف يدوياً. */
  if (!d.querySelector('#tSigners tbody tr[data-i]')) {
    A.state.report.signers.push({ name: '', job: '', date: '2026-09-22' });
    A.renderAll();
  }
  const grow = d.querySelector('#tSigners tbody tr[data-i]');
  const gn = grow.querySelector('[data-k="name"]');
  gn.value = 'موظف التفتيش'; fire(gn, 'input');
  check('signer name persists', R.signers[0].name === 'موظف التفتيش', JSON.stringify(R.signers[0]));

  /* ---- general notes ---- */
  if (!R.general.length) { R.general.push(''); A.renderAll(); }
  const ga = d.querySelector('#genNotes textarea');
  ga.value = 'ملاحظة يدوية'; fire(ga, 'input');
  check('general note persists', R.general[0] === 'ملاحظة يدوية', JSON.stringify(R.general[0]));

  /* ---- records: name + manual eval ---- */
  if (!R.records.length) { R.records.push({ name: '', evalList: [], evalManual: '', eval: '' }); A.renderAll(); }
  const rrow = d.querySelector('#tRecords tbody tr[data-i]');
  const rn = rrow.querySelector('[data-f="name"]');
  rn.value = 'سجل الحركة'; fire(rn, 'input');
  check('record name persists', R.records[0].name === 'سجل الحركة', JSON.stringify(R.records[0].name));
  const rm = rrow.querySelector('[data-f="eval"]');
  rm.value = 'نص بيدي'; fire(rm, 'input');
  check('record manual eval persists', R.records[0].evalManual === 'نص بيدي', JSON.stringify(R.records[0].evalManual));
  check('record eval computed', /نص بيدي/.test(R.records[0].eval || ''), JSON.stringify(R.records[0].eval));

  /* ---- fingerprint selects ---- */
  const frq = d.getElementById('f_fpReportFreq');
  frq.value = 'أسبوعياً'; fire(frq, 'change');
  const fto = d.getElementById('f_fpReportTo');
  fto.value = 'القطاع'; fire(fto, 'change');
  check('fp report freq persists', R.fp.reportFreq === 'أسبوعياً', R.fp.reportFreq);
  check('fp report target persists', R.fp.reportTo === 'القطاع', R.fp.reportTo);
  const M2 = A.buildModel();
  const fpSec = M2.sections.find(s => /وحدة البصمة/.test(s.heading));
  const line = fpSec && (fpSec.rows || []).find(x => x[0] === 'آلية رفع الموقف');
  check('frequency sentence complete',
    !!(line && /يُرسل موقف الحضور والبصمة أسبوعياً إلى القطاع بانتظام/.test(line[1])), line && line[1]);

  /* ---- facility + sector feed the title ---- */
  const fn = d.getElementById('f_facilityName');
  fn.value = 'الخناسة'; fire(fn, 'input');
  const sc = d.getElementById('f_sector');
  sc.value = 'قطاع المدائن'; fire(sc, 'input');
  const kd = d.getElementById('f_facilityKind');
  kd.value = 'مستشفى'; fire(kd, 'change');
  const title = d.getElementById('reportTitleBox').value;
  check('title includes kind', /مستشفى/.test(title), title);
  check('title includes facility', /الخناسة/.test(title), title);
  check('title includes sector', /قطاع المدائن/.test(title), title);
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
if (!m) { console.error('no probe output'); process.exit(1); }
const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
console.log(text);
const pass = +( /PASS (\d+)/.exec(text) || [0, 0])[1];
const fail = +( /FAIL (\d+)/.exec(text) || [0, 0])[1];
if (!/DONE/.test(text)) { console.error('probe did not finish'); process.exit(1); }
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
