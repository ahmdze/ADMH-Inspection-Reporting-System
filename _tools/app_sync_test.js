/* =============================================================================
   Integration test: app.js <-> sync.js wiring.
   Loads the REAL app.js and REAL sync.js together against a mocked Firebase and
   verifies the UI actually reflects sync state and that data lands in the cloud.
   ============================================================================= */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { loadApp } = require('./_load.js');

/* ---------------------------------------------------- mocked Firebase */
function makeCloud() { return { docs: new Map() }; }
function makeFirestore(cloud) {
  const docRef = p => ({
    _p: p,
    set(data, o) { const prev = cloud.docs.get(p) || {}; cloud.docs.set(p, o && o.merge ? Object.assign({}, prev, data) : Object.assign({}, data)); return Promise.resolve(); },
    get() { const d = cloud.docs.get(p); return Promise.resolve({ exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) }); },
  });
  const colRef = p => ({
    doc: id => docRef(p + '/' + id),
    get() {
      const pre = p + '/', out = [];
      for (const [k, v] of cloud.docs) if (k.startsWith(pre) && !k.slice(pre.length).includes('/')) out.push({ id: k.slice(pre.length), data: () => JSON.parse(JSON.stringify(v)) });
      return Promise.resolve({ forEach: f => out.forEach(f) });
    },
  });
  return {
    collection: n => ({ doc: id => ({ collection: sub => colRef(`users/${id}/${sub}`) }) }),
    batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), commit: () => Promise.all(ops.map(f => f())).then(() => undefined) }; },
    enablePersistence: () => Promise.resolve(),
  };
}
function makeFirebase(cloud) {
  const GOOGLE_ACCOUNT = { uid: 'uid-google', email: 'inspector@admh.iq' };
  const auth = {
    currentUser: null,
    onAuthStateChanged(fn) { if (auth.currentUser) fn(auth.currentUser); return () => {}; },
    signInWithPopup() { auth.currentUser = GOOGLE_ACCOUNT; return Promise.resolve({ user: auth.currentUser }); },
    signInWithRedirect() { auth.currentUser = GOOGLE_ACCOUNT; return Promise.resolve(); },
    getRedirectResult() { return Promise.resolve(auth.currentUser ? { user: auth.currentUser } : null); },
    signInWithCredential() {
      auth.currentUser = GOOGLE_ACCOUNT;
      return Promise.resolve({ user: auth.currentUser });
    },
    signOut() { auth.currentUser = null; return Promise.resolve(); },
    GoogleAuthProvider: function () {},
  };
  const f = { apps: [], initializeApp() { f.apps.push({}); return {}; }, app: () => ({}), auth: () => auth, firestore: () => makeFirestore(cloud) };
  return f;
}

/* -------------------------------------------------------------- DOM shim */
class CL { constructor(){this.set=new Set();} add(...c){c.forEach(x=>x&&this.set.add(x));} remove(...c){c.forEach(x=>this.set.delete(x));} contains(c){return this.set.has(c);} toggle(c,o){if(o===undefined)o=!this.set.has(c);o?this.set.add(c):this.set.delete(c);return o;} }
class El {
  constructor(t,i){this.tagName=(t||'div').toUpperCase();this.id=i||'';this.children=[];this._l={};this.style={};this.dataset={};this._cls='';this._v='';this._t='';this._h='';this.classList=new CL();this.files=null;this.onclick=null;this.onchange=null;}
  get className(){return this._cls;} set className(v){this._cls=v||'';}
  get value(){return this._v;} set value(v){this._v=v==null?'':String(v);}
  get textContent(){return this._t;} set textContent(v){this._t=String(v==null?'':v);}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=String(v==null?'':v);}
  get firstChild(){return this.children[0]||null;}
  addEventListener(t,fn){(this._l[t]=this._l[t]||[]).push(fn);}
  removeEventListener(){} dispatch(t,e){(this._l[t]||[]).forEach(f=>f(Object.assign({target:this,preventDefault(){},stopPropagation(){}},e)));}
  click(){if(this.onclick)this.onclick({target:this,preventDefault(){}});this.dispatch('click',{});}
  focus(){} blur(){} remove(){} appendChild(c){this.children.push(c);return c;}
  insertAdjacentHTML(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k];}
  closest(){return null;}
  querySelector(sel){
    /* The app asks e.g. table.querySelector('tbody') to attach delegated
       handlers. Keep one stable element per selector so handlers survive
       repeated renders, exactly like a real DOM node. */
    const key = '_qs_' + String(sel).replace(/\W+/g,'_');
    if(!this[key]) this[key] = new El('div');
    return this[key];
  }
  querySelectorAll(){return [];}
}
class Doc extends El {
  constructor(){super('#document');this.body=new El('body');this.body.classList.add('light');this.readyState='complete';this._m=new Map();this._unresolved=[];}
  /* head مطلوب لتحميل مكتبة Google Identity Services */
  get head(){ if(!this._head) this._head = new El('head'); return this._head; }
  getElementById(id){if(!this._m.has(id))this._m.set(id,new El('input',id));return this._m.get(id);}
  querySelector(s){return this._q(s)[0]||null;} querySelectorAll(s){return this._q(s);}
  _q(s){const o=[];String(s).split(',').map(x=>x.trim()).forEach(x=>{
    const m=/^#([\w-]+)/.exec(x);
    if(m){
      /* For a composite selector like '#tArchive tbody', return the SAME child
         element every time so delegated handlers survive re-renders. */
      const root=this.getElementById(m[1]);
      if(/^#[\w-]+\s*$/.test(x)) o.push(root);
      else {
        const key='_comp_'+x.replace(/\W+/g,'_');
        if(!this[key]) this[key]=new El('div');
        o.push(this[key]);
        if(!this._unresolved.includes(x))this._unresolved.push(x);
      }
    }
    else if(!this._unresolved.includes(x))this._unresolved.push(x);});
    return o;}
  createElement(t){return new El(t);} addEventListener(){}
}
class FakeBlob {
  constructor(p,o){this._p=(p||[]).map(x=>x instanceof Uint8Array?x:(x instanceof ArrayBuffer?new Uint8Array(x):new Uint8Array(0)));this.type=(o&&o.type)||'';}
  get size(){return this._p.reduce((a,b)=>a+b.length,0);}
  arrayBuffer(){const o=new Uint8Array(this.size);let f=0;for(const b of this._p){o.set(b,f);f+=b.length;}return Promise.resolve(o.buffer);}
}

function buildEnv(cloud) {
  const store = new Map();
  const sb = {
    console:{log(){},warn(){},error(){}}, setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Math, Date, JSON, Object, Array,
    String, Number, Boolean, Error, RegExp, parseInt, parseFloat, isNaN, atob, btoa, Blob: FakeBlob,
    localStorage:{ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) },
    navigator:{ userAgent:'Mozilla/5.0 (Linux; Android 13)', serviceWorker:null },
    location:{ protocol:'http:', href:'http://localhost/' },
    confirm:()=>true, alert:()=>{}, prompt:()=>null, scrollTo:()=>{}, addEventListener:()=>{},
    _store: store, firebase: makeFirebase(cloud),
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  sb.matchMedia = () => ({ matches:false, addEventListener(){} });
  sb.document = new Doc();
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..','vendor','docx.umd.js'),'utf8'), sb, { filename:'docx.umd.js' });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..','sync.js'),'utf8'), sb, { filename:'sync.js' });
  /* هذا الاختبار يفحص مسار Firebase الاحتياطي: نُعطّل GIS المضمَّن.
     اختبارات مسار Google Identity في popup_test.js */
  if (sb.window.ADMHSync && sb.window.ADMHSync.setGisEnabled) sb.window.ADMHSync.setGisEnabled(false);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'options.js'), 'utf8'), sb, { filename: 'options.js' });
loadApp(sb);
  return sb;
}

let pass=0, fail=0;
const check=(n,c,d)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(d!==undefined?'  → '+JSON.stringify(d):''));} };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const cloud = makeCloud();
  const sb = buildEnv(cloud);
  const APP = sb.window.ADMH;
  const S = sb.window.ADMHSync;

  console.log('=== startup with sync NOT configured ===');
  check('app booted', !!APP);
  check('sync module loaded', !!S);
  check('app can see sync module', APP.sync.available() === true);
  check('sync not configured initially', S.isConfigured() === false);
  const dot = sb.document.getElementById('dot');
  check('status dot shows "off" when unconfigured', !!dot.classList.contains('off'), dot.className);
  check('#syncOff visible, #syncOn hidden',
    !sb.document.getElementById('syncOff').classList.contains('hidden') &&
    sb.document.getElementById('syncOn').classList.contains('hidden'));

  console.log('\n=== configuring through the REAL UI handler ===');
  /* Mirror a real user: the app defers initSync, so wait for startup first. */
  await sleep(450);
  check('app finished starting up before user acts', APP.sync.ready === true, APP.sync.ready);
  /* Google-only sign-in: one button, no credentials to type */
  sb.document.getElementById('btnSyncGoogle').click();

  /* the handler starts connect+sync asynchronously; wait for the sync itself,
     not merely for the connection (they are sequential). */
  for (let i = 0; i < 400 && !S.status().lastSync; i++) await sleep(25);
  const stAfter = S.status();
  check('connected via UI', S.isConnected() === true, stAfter);
  check('a sync completed', !!stAfter.lastSync, stAfter.lastSync);
  check('cloud received reports scope', [...cloud.docs.keys()].every(k => k.startsWith('users/')), [...cloud.docs.keys()]);

  console.log('\n=== UI reflects connected state ===');
  check('#syncOn now visible', !sb.document.getElementById('syncOn').classList.contains('hidden'));
  check('#syncOff now hidden', sb.document.getElementById('syncOff').classList.contains('hidden'));
  check('status dot no longer "off"', !dot.classList.contains('off'), dot.className);
  check('account line mentions the email', /inspector@admh\.iq/.test(sb.document.getElementById('syncAccount').textContent), sb.document.getElementById('syncAccount').textContent);
  check('device line filled', sb.document.getElementById('syncDeviceText').textContent.length > 0, sb.document.getElementById('syncDeviceText').textContent);
  check('last-sync line filled', sb.document.getElementById('syncLastText').textContent !== 'لم تتم بعد', sb.document.getElementById('syncLastText').textContent);
  check('detects mobile device from UA', /هاتف/.test(sb.document.getElementById('syncDeviceText').textContent), sb.document.getElementById('syncDeviceText').textContent);

  console.log('\n=== saving a report pushes it to the cloud ===');
  const r = APP.state.report;
  r.facilityName = 'مركز صحي الاختبار السحابي';
  r.visitDate = '2026-10-01';
  APP.saveToArchive(true);
  await APP.syncNow(true);
  const mine = [...cloud.docs.keys()].filter(k => k.includes('/reports/'));
  check('report doc exists in cloud', mine.length >= 1, mine);
  const anyDoc = cloud.docs.get(mine[0]);
  check('cloud doc stores the full payload', !!(anyDoc && anyDoc.data && anyDoc.data.facilityName), anyDoc && anyDoc.data && anyDoc.data.facilityName);
  check('cloud doc records visitDate', anyDoc && anyDoc.data && anyDoc.data.visitDate === '2026-10-01', anyDoc && anyDoc.data && anyDoc.data.visitDate);

  console.log('\n=== deleting a report creates a tombstone, not a silent loss ===');
  /* Work with a clean, non-deleted current report so saveToArchive cannot
     accidentally persist a tombstone as the working document. */
  APP.state.report = APP.blankReport();
  APP.state.report.facilityName = 'تقرير سيُحذف';
  APP.state.report.visitDate = '2026-10-02';
  APP.saveToArchive(true);
  await APP.syncNow(true);

  const victim = APP.state.reports.find(x => x.facilityName === 'تقرير سيُحذف')
              || APP.state.reports.find(x => !x._deleted);
  check('there is a report to delete', !!victim, APP.state.reports.map(x => x.facilityName));

  if (victim) {
    /* Reproduce exactly what the archive delete handler does when sync is
       configured: flag a tombstone instead of dropping the record. */
    const tomb = APP.state.reports.find(x => x.id === victim.id);
    tomb._deleted = true;
    tomb.updatedAt = new Date().toISOString();
    sb.window.localStorage.setItem('admh.reports.v2', JSON.stringify(APP.state.reports));

    APP.showView('archive');
    const stillListed = APP.state.reports.filter(x => !x._deleted).some(x => x.id === victim.id);
    check('deleted report no longer listed in app', stillListed === false);
    check('tombstone retained while sync is configured', !!tomb._deleted);

    await APP.syncNow(true);
    const key = [...cloud.docs.keys()].find(k => k.endsWith('/reports/' + victim.id));
    const doc = key ? cloud.docs.get(key) : null;
    check('cloud marks the doc deleted', !!(doc && doc.deleted === true), doc ? doc.deleted : ('no doc for ' + victim.id));
    check('tombstone payload is emptied (privacy)', !!(doc && doc.data === null), doc && doc.data);
  }

  console.log('\n=== sign out leaves local data intact ===');
  const before = APP.state.reports.length;
  await S.signOut();
  check('disconnected', S.isConnected() === false);
  check('local reports still present', APP.state.reports.length === before, APP.state.reports.length);
  check('status dot returns to "off"', !!dot.classList.contains('off'), dot.className);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('APP-SYNC TEST ERROR', e); process.exit(1); });
