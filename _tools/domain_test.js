/* =============================================================================
   Verify the unauthorized-domain message names the REAL hostname.
   -----------------------------------------------------------------------------
   عطلان كانا يمنعان التشغيل على CI:
     ١) مسار بايثون ثابت على Windows لِتشغيل خادم — لا وجود له على Linux.
     ٢) توقيت ثابت (1800ms) قبل أول طلب — يهتزّ تحت الحِمل.
   الآن: خادم Node مدمج، وانتظار فعلي لاستجابته.
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const chrome = require('./_chrome.js');
const CHROME = chrome.requireChrome();
const server = require('./_server.js');
const ROOT = path.resolve(__dirname, '..');
const PROBE = path.join(ROOT, '_dom_probe.html');

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>dom probe</title></head>
<body><pre id="out">RUNNING</pre>
<script src="sync.js"></script>
<script>
(function () {
  const S = window.ADMHSync;
  const out = [];
  out.push('HOSTNAME=' + location.hostname);
  /* Force the unauthorized-domain path by stubbing firebase before connect. */
  window.firebase = {
    apps: [], initializeApp(){ this.apps.push({}); return {}; }, app: () => ({}),
    auth: Object.assign(function(){ return {
      currentUser: null,
      onAuthStateChanged(){ return () => {}; },
      signInWithPopup(){ const e = new Error('x'); e.code = 'auth/unauthorized-domain'; return Promise.reject(e); },
      signInWithRedirect(){ return Promise.resolve(); },
      signOut(){ return Promise.resolve(); },
    }; }, {}),
    firestore: () => ({ enablePersistence: () => Promise.resolve(), collection: () => ({ doc: () => ({ collection: () => ({}) }) }) }),
  };
  window.firebase.auth.GoogleAuthProvider = function(){};
  /* المعرّف مضمَّن في sync.js، وهذا الاختبار يفحص مسار Firebase الاحتياطي */
  if (S.setGisEnabled) S.setGisEnabled(false);
  S.connect().then(() => {
    out.push('UNEXPECTED_SUCCESS');
  }).catch(err => {
    out.push('CODE=' + err.code);
    out.push('---MESSAGE-START---');
    out.push(err.message);
    out.push('---MESSAGE-END---');
    out.push('CONTAINS_HOST=' + err.message.includes(location.hostname));
  }).then(() => {
    out.push('DONE');
    document.getElementById('out').textContent = out.join('\\n');
  });
})();
</script></body></html>`;

(async () => {
  let srv = null;
  try {
    fs.writeFileSync(PROBE, html);
    srv = await server.start({ root: ROOT });
    await server.waitFor(srv.url + '/index.html', 20000);

    let dom = '';
    try {
      dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
        '--virtual-time-budget=12000', '--dump-dom', srv.url + '/_dom_probe.html'],
        { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000 });
    } catch (e) { console.error('chrome failed: ' + e.message); }

    const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
    if (!m) { console.error('no output from probe'); process.exit(1); }
    const text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    console.log(text);

    const host = (/HOSTNAME=(\S+)/.exec(text) || [])[1] || '';
    const contains = /CONTAINS_HOST=true/.test(text);
    const finished = /DONE/.test(text);
    const pass = contains && finished;
    console.log(`\n=== ${pass ? 'PASS' : 'FAIL'}: message ${contains ? 'names' : 'does NOT name'} the real host (${host}) ===`);
    chrome.cleanProfile();
    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.error('TEST ERROR: ' + e.message);
    chrome.cleanProfile();
    process.exit(1);
  } finally {
    if (srv) srv.close();
    try { fs.unlinkSync(PROBE); } catch (e) { /* تجاهل */ }
  }
})();
