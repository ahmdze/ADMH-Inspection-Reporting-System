/* Verify the unauthorized-domain message names the REAL hostname,
   served over HTTP so location.hostname is populated. */
const fs = require('fs'), path = require('path');
const { execFileSync, spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PROBE = path.join(ROOT, '_dom_probe.html');

/* serve the project so hostname is a real value */
const server = spawn('C:\\Users\\ahmdz\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe',
  ['-m', 'http.server', '8199', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });

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

fs.writeFileSync(PROBE, html);

setTimeout(() => {
  let dom = '';
  try {
    dom = execFileSync(CHROME, ['--headless=new','--disable-gpu','--no-sandbox',
      '--virtual-time-budget=12000','--dump-dom','http://127.0.0.1:8199/_dom_probe.html'],
      { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });
  } catch (e) { console.error('chrome failed', e.message); }

  try { server.kill(); } catch (e) {}
  try { fs.unlinkSync(PROBE); } catch (e) {}

  const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) { console.error('no output'); process.exit(1); }
  const text = m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
  console.log(text);

  const host = (/HOSTNAME=(\S+)/.exec(text) || [])[1] || '';
  const contains = /CONTAINS_HOST=true/.test(text);
  const finished = /DONE/.test(text);
  const pass = contains && finished;
  console.log(`\n=== ${pass ? 'PASS' : 'FAIL'}: message ${contains ? 'names' : 'does NOT name'} the real host (${host}) ===`);
  process.exit(pass ? 0 : 1);
}, 1800);
