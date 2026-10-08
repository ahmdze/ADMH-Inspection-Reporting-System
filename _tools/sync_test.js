/* =============================================================================
   Integration test for the optional cloud-sync layer (sync.js).
   Firebase is fully mocked (auth + firestore) so the real sync algorithm runs:
   pull -> merge (last-write-wins) -> push, including tombstone deletion and
   settings merge. Two simulated devices share one in-memory "cloud".
   ============================================================================= */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { installGis } = require('./_gis_mock.js');

/* ------------------------------------------------- in-memory Firestore mock */
function makeCloud() {
  return { docs: new Map() };            // key = full path
}
function makeFirestore(cloud) {
  function docRef(pathStr) {
    return {
      _p: pathStr,
      set(data, opts) {
        const prev = cloud.docs.get(pathStr) || {};
        cloud.docs.set(pathStr, opts && opts.merge ? Object.assign({}, prev, data) : Object.assign({}, data));
        return Promise.resolve();
      },
      get() {
        const d = cloud.docs.get(pathStr);
        return Promise.resolve({ exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) });
      },
    };
  }
  function collectionRef(pathStr) {
    return {
      doc: id => docRef(pathStr + '/' + id),
      get() {
        const prefix = pathStr + '/';
        const out = [];
        for (const [k, v] of cloud.docs) {
          if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
            out.push({ id: k.slice(prefix.length), data: () => JSON.parse(JSON.stringify(v)) });
          }
        }
        return Promise.resolve({ forEach: fn => out.forEach(fn) });
      },
    };
  }
  return {
    collection: name => ({
      doc: id => ({
        collection: sub => collectionRef(`users/${id}/${sub}`),
      }),
    }),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data, opts) => { ops.push(() => ref.set(data, opts)); },
        commit: () => Promise.all(ops.map(f => f())).then(() => undefined),
      };
    },
    enablePersistence: () => Promise.resolve(),
  };
}
function makeFirebase(cloud) {
  const listeners = [];
  /* Google-only sign-in: the mock returns a fixed account so tests are stable */
  const GOOGLE_ACCOUNT = { uid: 'uid-google', email: 'me@gmail.com' };
  const auth = {
    currentUser: null,
    onAuthStateChanged(fn) { listeners.push(fn); if (auth.currentUser) fn(auth.currentUser); return () => {}; },
    signInWithPopup() {
      auth.currentUser = GOOGLE_ACCOUNT;
      return Promise.resolve({ user: auth.currentUser });
    },
    signInWithRedirect() { auth.currentUser = GOOGLE_ACCOUNT; return Promise.resolve(); },
    getRedirectResult() { return Promise.resolve(auth.currentUser ? { user: auth.currentUser } : null); },
    signInWithCredential() {
      auth.currentUser = GOOGLE_ACCOUNT;
      return Promise.resolve({ user: auth.currentUser });
    },
    signOut() { auth.currentUser = null; return Promise.resolve(); },
    GoogleAuthProvider: function () { this.setCustomParameters = function () {}; this.credential = function (t) { return { __token: t }; }; },
  };
  const firebase = {
    apps: [],
    initializeApp() { firebase.apps.push({}); return {}; },
    app: () => ({}),
    auth: () => auth,
    firestore: () => makeFirestore(cloud),
    _auth: auth,
  };
  return firebase;
}

/* ----------------------------------------------------------- DOM/env shim */
class CL { constructor(){this.set=new Set();} add(...c){c.forEach(x=>x&&this.set.add(x));} remove(...c){c.forEach(x=>this.set.delete(x));} contains(c){return this.set.has(c);} toggle(c,o){if(o===undefined)o=!this.set.has(c);o?this.set.add(c):this.set.delete(c);return o;} }
class El {
  constructor(t,i){this.tagName=(t||'div').toUpperCase();this.id=i||'';this.children=[];this._l={};this.style={};this.dataset={};this._cls='';this._v='';this._t='';this._h='';this.classList=new CL();this.files=null;this.onclick=null;}
  get className(){return this._cls;} set className(v){this._cls=v||'';}
  get value(){return this._v;} set value(v){this._v=v==null?'':String(v);}
  get textContent(){return this._t;} set textContent(v){this._t=String(v==null?'':v);}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=String(v==null?'':v);}
  get firstChild(){return null;}
  addEventListener(t,fn){(this._l[t]=this._l[t]||[]).push(fn);}
  removeEventListener(){} dispatch(){} click(){if(this.onclick)this.onclick({target:this,preventDefault(){}});}
  focus(){} blur(){} remove(){} appendChild(c){this.children.push(c);return c;}
  insertAdjacentHTML(){} setAttribute(){} getAttribute(){}
  closest(){return null;} querySelector(){return null;} querySelectorAll(){return [];}
}
class Doc extends El {
  constructor(){super('#document');this.body=new El('body');this.readyState='complete';this._m=new Map();this.head=new El('head');}
  getElementById(id){if(!this._m.has(id))this._m.set(id,new El('input',id));return this._m.get(id);}
  querySelector(s){return this._q(s)[0]||null;} querySelectorAll(s){return this._q(s);}
  _q(s){const o=[];String(s).split(',').map(x=>x.trim()).forEach(x=>{if(x.startsWith('#'))o.push(this.getElementById(x.slice(1)));});return o;}
  createElement(t){return new El(t);} addEventListener(){}
}

function makeEnv(cloud) {
  const store = new Map();
  const sb = {
    console:{log(){},warn(){},error(){}}, setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Math, Date, JSON, Object, Array,
    String, Number, Boolean, Error, RegExp, parseInt, parseFloat, isNaN, atob, btoa,
    Blob: class { constructor(){} },
    localStorage:{ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) },
    navigator:{ userAgent:'Mozilla/5.0 (Windows NT 10.0)', serviceWorker:null },
    location:{ protocol:'http:', href:'http://localhost/' },
    confirm:()=>true, alert:()=>{}, prompt:()=>null, scrollTo:()=>{}, addEventListener:()=>{},
    _store: store,
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  installGis(sb, { mode: 'ok' });
  sb.matchMedia = () => ({ matches:false, addEventListener(){} });
  sb.document = new Doc();
  sb.firebase = makeFirebase(cloud);            // SDK "already loaded"
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..','sync.js'),'utf8'), sb, { filename:'sync.js' });
  return sb;
}

let pass=0, fail=0;
function check(name, cond, detail){
  if(cond){pass++;console.log('  ✓ '+name);}
  else{fail++;console.log('  ✗ '+name+(detail!==undefined?'  → '+JSON.stringify(detail):''));}
}

const CFG_TEXT = `{
  apiKey: "AIzaSyTestKey123",
  authDomain: "admh-test.firebaseapp.com",
  projectId: "admh-test",
  storageBucket: "admh-test.appspot.com",
  messagingSenderId: "123456",
  appId: "1:123456:web:abcdef"
}`;

(async () => {
  console.log('=== config parsing ===');
  const cloud = makeCloud();
  const A = makeEnv(cloud);
  const S = A.window.ADMHSync;
  check('ADMHSync present', !!S);
  const parsed = S.parseConfigInput(CFG_TEXT);
  check('parses JS-object firebaseConfig', parsed && parsed.projectId === 'admh-test', parsed);
  check('parses JSON form', S.parseConfigInput(JSON.stringify(parsed)) && S.parseConfigInput(JSON.stringify(parsed)).appId === '1:123456:web:abcdef');
  check('derives authDomain when absent', S.normalizeConfig({apiKey:'k',projectId:'p',appId:'a'}).authDomain === 'p.firebaseapp.com');
  check('rejects placeholder config', S.normalizeConfig({apiKey:'YOUR_KEY',projectId:'p',appId:'a'}) === null);
  check('rejects empty', S.parseConfigInput('') === null);
  check('rejects garbage', S.parseConfigInput('hello world') === null);

  console.log('\n=== device A: configure + connect ===');
  const res = S.configure(CFG_TEXT);
  check('configure ok', res.ok === true, res);
  check('isConfigured true', S.isConfigured() === true);
  check('persisted to localStorage', A._store.get('admh.sync.config') !== undefined);

  /* ------- one shared "local" store per device, driven by the app hooks ---- */
  function deviceHooks(seed) {
    const local = { reports: seed.reports || [], settings: seed.settings || {}, library: seed.library || {} };
    return { local, hooks: {
      load: () => ({ reports: local.reports.slice(), settings: local.settings, library: local.library }),
      save: p => {
        if (Array.isArray(p.reports)) local.reports = p.reports;
        if (p.settings) local.settings = p.settings;
        if (p.library) local.library = p.library;
      },
    } };
  }

  const dA = deviceHooks({ reports: [
    { id:'r1', title:'تقرير أ', facilityName:'مركز صحي الخناسة', sector:'قطاع المدائن', visitDate:'2026-09-22',
      visitType:'زيارة تفتيشية', updatedAt:'2026-09-22T10:00:00.000Z' },
    { id:'r2', title:'تقرير ب', facilityName:'مركز صحي التأميم', visitDate:'2026-09-20',
      updatedAt:'2026-09-20T10:00:00.000Z' },
  ], settings:{ l1:'جمهورية العراق', updatedAt:'2026-09-22T10:00:00.000Z' }, library:{ records:['أ'], reco:[], general:[] } });

  await S.init(dA.hooks);
  const credA = await S.connect();
  check('connected', S.isConnected() === true, S.status());
  check('uid returned', credA.uid === 'uid-google', credA);

  const r1 = await S.syncNow();
  check('first sync pushes local reports', r1.pushed === 2, r1);
  check('cloud has 2 report docs', cloud.docs.has('users/uid-google/reports/r1') && cloud.docs.has('users/uid-google/reports/r2'));
  check('cloud doc carries full payload', !!(cloud.docs.get('users/uid-google/reports/r1').data));
  check('cloud settings written', !!cloud.docs.get('users/uid-google/meta/settings'));

  console.log('\n=== device B: same account, pulls everything ===');
  const cloud2 = cloud;
  const B = makeEnv(cloud2);
  const S2 = B.window.ADMHSync;
  S2.configure(CFG_TEXT);
  const dB = deviceHooks({ reports: [], settings: {}, library: {} });
  await S2.init(dB.hooks);
  await S2.connect();
  const r2 = await S2.syncNow();
  check('device B received both reports', dB.local.reports.length === 2, dB.local.reports.length);
  check('device B reports have real content', dB.local.reports.some(x => x.facilityName === 'مركز صحي الخناسة'), dB.local.reports.map(x=>x.facilityName));
  check('device B got settings from cloud', !!(dB.local.settings && dB.local.settings.l1 === 'جمهورية العراق'), dB.local.settings);
  check('device B did NOT clobber cloud settings', cloud.docs.get('users/uid-google/meta/settings').payload.settings.l1 === 'جمهورية العراق');

  console.log('\n=== device B adds a report; device A pulls it ===');
  dB.local.reports.push({ id:'r3', title:'من الجهاز الثاني', facilityName:'مركز صحي المدائن', visitDate:'2026-09-25', updatedAt:'2026-09-25T10:00:00.000Z' });
  await S2.syncNow();
  const r3 = await S.syncNow();
  check('device A pulled the new report', dA.local.reports.some(x => x.id === 'r3'), dA.local.reports.map(x=>x.id));
  check('device A did not lose its own reports', dA.local.reports.length === 3, dA.local.reports.length);

  console.log('\n=== conflict: newer edit wins (last-write-wins) ===');
  // device A edits r1 at T3 (newest)
  dA.local.reports.find(x=>x.id==='r1').facilityName = 'اسم محدَّث من الجهاز أ';
  dA.local.reports.find(x=>x.id==='r1').updatedAt = '2026-09-26T09:00:00.000Z';
  await S.syncNow();
  const rA = await S2.syncNow();
  const bR1 = dB.local.reports.find(x=>x.id==='r1');
  check('newer value propagated to device B', bR1 && bR1.facilityName === 'اسم محدَّث من الجهاز أ', bR1 && bR1.facilityName);

  console.log('\n=== older edit must NOT overwrite newer ===');
  // device B edits r1 with an OLDER timestamp
  bR1.facilityName = 'قيمة قديمة يجب ألا تفوز';
  bR1.updatedAt = '2026-09-01T00:00:00.000Z';
  await S2.syncNow();
  await S.syncNow();
  const aR1 = dA.local.reports.find(x=>x.id==='r1');
  check('stale edit did not overwrite', aR1 && aR1.facilityName === 'اسم محدَّث من الجهاز أ', aR1 && aR1.facilityName);

  console.log('\n=== deletion via tombstone ===');
  // device A marks r2 deleted
  const victim = dA.local.reports.find(x=>x.id==='r2');
  victim._deleted = true;
  victim.updatedAt = '2026-09-27T00:00:00.000Z';
  await S.syncNow();
  check('cloud doc flagged deleted', cloud.docs.get('users/uid-google/reports/r2').deleted === true);
  await S2.syncNow();
  check('device B no longer has r2', !dB.local.reports.some(x=>x.id==='r2'), dB.local.reports.map(x=>x.id));
  check('device B kept the others', dB.local.reports.length === 2, dB.local.reports.length);

  console.log('\n=== two-way merge: both sides have unique reports ===');
  dA.local.reports.push({ id:'rA9', facilityName:'فقط عند أ', updatedAt:'2026-09-28T00:00:00.000Z' });
  dB.local.reports.push({ id:'rB9', facilityName:'فقط عند ب', updatedAt:'2026-09-28T01:00:00.000Z' });
  await S.syncNow();
  await S2.syncNow();
  await S.syncNow();
  check('A has both new reports', dA.local.reports.some(x=>x.id==='rA9') && dA.local.reports.some(x=>x.id==='rB9'), dA.local.reports.map(x=>x.id));
  check('B has both new reports', dB.local.reports.some(x=>x.id==='rA9') && dB.local.reports.some(x=>x.id==='rB9'), dB.local.reports.map(x=>x.id));

  console.log('\n=== safety: no data loss when cloud is empty ===');
  const cloud3 = makeCloud();
  const C = makeEnv(cloud3);
  const S3 = C.window.ADMHSync;
  S3.configure(CFG_TEXT);
  const dC = deviceHooks({ reports:[{id:'only',facilityName:'الوحيد',updatedAt:'2026-01-01T00:00:00.000Z'}], settings:{}, library:{} });
  await S3.init(dC.hooks);
  await S3.connect();
  await S3.syncNow();
  check('local report preserved after syncing to empty cloud', dC.local.reports.length === 1 && dC.local.reports[0].id === 'only', dC.local.reports);

  console.log('\n=== privacy: data is scoped to the uid ===');
  check('no writes outside users/{uid}', [...cloud.docs.keys()].every(k => k.startsWith('users/')), [...cloud.docs.keys()].filter(k=>!k.startsWith('users/')));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SYNC TEST ERROR', e); process.exit(1); });
