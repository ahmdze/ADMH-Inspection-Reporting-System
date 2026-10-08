/* =============================================================================
   Verify that a redirect failure is VISIBLE on the check page.

   The phone showed "تعذّر الدخول" with no code, so we could not tell whether the
   cause was the domain, a blocked cookie, or something else. This proves the
   page now reports the exact Firebase error code.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const { execFileSync, spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PY = 'C:\\Users\\ahmdz\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';
const ROOT = path.resolve(__dirname, '..');
const PROBE = path.join(ROOT, '_vis_probe.html');

const CODES = [
  'auth/unauthorized-domain',
  'auth/operation-not-allowed',
  'auth/network-request-failed',
  'auth/web-storage-unsupported',
];

function buildProbe(code) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>vis</title></head>
<body>
<pre id="result">RUNNING</pre>
<script>
/* Mock firebase BEFORE sync.js runs, so getRedirectResult rejects. */
window.firebase = {
  apps: [], initializeApp(){ this.apps.push({}); return {}; }, app: () => ({}),
  auth: Object.assign(function(){ return {
    onAuthStateChanged(fn){ setTimeout(function(){ fn(null); }, 5); return function(){}; },
    getRedirectResult(){ var e = new Error('simulated'); e.code = ${JSON.stringify(code)}; return Promise.reject(e); },
    signInWithPopup(){ var e = new Error('simulated'); e.code = ${JSON.stringify(code)}; return Promise.reject(e); },
    signInWithRedirect(){ return Promise.resolve(); },
    sendPasswordResetEmail(){ return Promise.resolve(); },
    signOut(){ return Promise.resolve(); },
  }; }, {}),
  firestore: () => ({ enablePersistence: () => Promise.resolve(),
    collection: () => ({ doc: () => ({ collection: () => ({ get: () => Promise.resolve({ forEach(){} }) }), set: () => Promise.resolve(), get: () => Promise.resolve({ exists:false }) }) }),
    batch: () => ({ set(){}, commit: () => Promise.resolve() }) }),
};
window.firebase.auth.GoogleAuthProvider = function(){};
</script>
<script>
window.addEventListener('DOMContentLoaded', function(){
  setTimeout(function(){
    var out = [];
    var re = window.ADMHSync.redirectError ? window.ADMHSync.redirectError() : null;
    out.push('REDIRECT_ERROR_CODE=' + (re && re.code ? re.code : 'none'));
    var st = window.ADMHSync.status();
    out.push('STATUS_ERRORCODE=' + (st.errorCode || 'none'));
    document.getElementById('result').textContent = out.join('\\n');
  }, 1800);
});
</script>
</body></html>`;
}

/* The probe must load sync.js the same way the real page does. */
function buildPage(code) {
  const check = fs.readFileSync(path.join(ROOT, 'check.html'), 'utf8');
  const mock = buildProbe(code).split('</head>')[1] || '';
  /* two scripts: the mock (before sync.js) and the assertion (after) */
  const head = buildProbe(code);
  const before = /<script>\n\/\* Mock firebase[\s\S]*?<\/script>/.exec(head);
  const after = /<script>\nwindow\.addEventListener\('DOMContentLoaded'[\s\S]*?<\/script>/.exec(head);
  let out = check
    .replace('<script src="sync.js"></script>', (before ? before[0] : '') + '\n<script src="sync.js"></script>')
    .replace('</body>', (after ? after[0] : '') + '\n<pre id="result">RUNNING</pre>\n</body>');
  return out;
}

const server = spawn(PY, ['-m', 'http.server', '8231', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });

setTimeout(() => {
  let pass = 0, fail = 0;
  CODES.forEach(code => {
    fs.writeFileSync(PROBE, buildPage(code));
    let dom = '';
    try {
      dom = execFileSync(CHROME, ['--headless=new','--disable-gpu','--no-sandbox',
        '--virtual-time-budget=14000','--dump-dom','http://127.0.0.1:8231/_vis_probe.html'],
        { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, stdio: ['ignore','pipe','ignore'] });
    } catch (e) { console.log('  chrome failed for ' + code); fail++; return; }

    const rep = /<pre id="result">([\s\S]*?)<\/pre>/.exec(dom);
    const txt = rep ? rep[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&') : '';
    const got = (/REDIRECT_ERROR_CODE=(.+)/.exec(txt) || [])[1];
    const stCode = (/STATUS_ERRORCODE=(.+)/.exec(txt) || [])[1];
    const okCode = got === code;
    const okStatus = stCode === code;
    /* the friendly Arabic message must also be on the page */
    const friendlyShown = /Authorized domains|Sign-in method|اتصال|متصفح|محظور|تخزين/i.test(dom);
    if (okCode && okStatus && friendlyShown) { pass++; console.log(`  ✓ ${code} → reported with a friendly explanation`); }
    else { fail++; console.log(`  ✗ ${code} → redirect=${got} status=${stCode} friendly=${friendlyShown}`); }
  });

  try { server.kill(); } catch (e) {}
  try { fs.unlinkSync(PROBE); } catch (e) {}
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}, 1800);
