/* Edge-case checks: an almost-empty report must still produce a valid document,
   and utility helpers must behave. Reuses the same DOM shim as harness.js. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadApp } = require('./_load.js');

class CL { constructor(e){this.el=e;this.set=new Set();} add(...c){c.forEach(x=>x&&this.set.add(x));} remove(...c){c.forEach(x=>this.set.delete(x));} contains(c){return this.set.has(c);} toggle(c,o){if(o===undefined)o=!this.set.has(c);o?this.set.add(c):this.set.delete(c);return o;} }
class El {
  constructor(t,i){this.tagName=(t||'div').toUpperCase();this.id=i||'';this.children=[];this._l={};this.style={};this.dataset={};this._cls='';this._v='';this._t='';this._h='';this.classList=new CL(this);this.files=null;}
  get className(){return this._cls;} set className(v){this._cls=v||'';}
  get value(){return this._v;} set value(v){this._v=v==null?'':String(v);}
  get textContent(){return this._t;} set textContent(v){this._t=String(v==null?'':v);}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=String(v==null?'':v);}
  addEventListener(){} removeEventListener(){} dispatch(){} click(){if(this.onclick)this.onclick({target:this,preventDefault(){}});}
  focus(){} blur(){} remove(){} appendChild(c){this.children.push(c);return c;} insertAdjacentHTML(){} setAttribute(){} getAttribute(){}
  closest(){return null;} querySelector(){return null;} querySelectorAll(){return [];}
}
class Doc extends El {
  constructor(){super('#document');this.body=new El('body');this.readyState='complete';this._m=new Map();}
  getElementById(id){if(!this._m.has(id))this._m.set(id,new El('input',id));return this._m.get(id);}
  querySelector(s){return this._q(s)[0]||null;} querySelectorAll(s){return this._q(s);}
  _q(s){const o=[];String(s).split(',').map(x=>x.trim()).forEach(x=>{if(x.startsWith('#'))o.push(this.getElementById(x.slice(1)));});return o;}
  createElement(t){return new El(t);} addEventListener(){}
}
class FakeBlob {
  constructor(p,o){this._p=(p||[]).map(x=>x instanceof Uint8Array?x:(x instanceof ArrayBuffer?new Uint8Array(x):new Uint8Array(0)));this.type=(o&&o.type)||'';}
  get size(){return this._p.reduce((a,b)=>a+b.length,0);}
  arrayBuffer(){const o=new Uint8Array(this.size);let f=0;for(const b of this._p){o.set(b,f);f+=b.length;}return Promise.resolve(o.buffer);}
}
const store=new Map();
const cap={blob:null,name:null};
const sb={
  console,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Math,Date,JSON,Object,Array,String,Number,Boolean,Error,RegExp,parseInt,parseFloat,isNaN,atob,btoa,
  Blob:FakeBlob,
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
  Image:class{constructor(){this.naturalWidth=0;this.naturalHeight=0;}set src(v){this._s=v;}},
  FileReader:class{readAsText(){}readAsDataURL(){}},
  URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
  navigator:{serviceWorker:null}, location:{protocol:'http:',href:'http://localhost/'},
  confirm:()=>true, alert:()=>{}, prompt:()=>null, scrollTo:()=>{}, addEventListener:()=>{},
};
sb.window=sb; sb.globalThis=sb; sb.self=sb; sb.matchMedia=()=>({matches:false,addEventListener(){}});
sb.document=new Doc();
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..','vendor','docx.umd.js'),'utf8'),sb,{filename:'docx.umd.js'});
sb.URL.createObjectURL=b=>{cap.blob=b;return 'blob:x';};
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'options.js'), 'utf8'), sb, { filename: 'options.js' });
loadApp(sb);
const APP = sb.window.ADMH;

let pass=0, fail=0;
function check(name, cond, detail){
  if(cond){pass++;console.log('  ✓ '+name);}
  else{fail++;console.log('  ✗ '+name+(detail?'  → '+detail:''));}
}

console.log('\n=== helpers ===');
check('normalizeDigits converts Arabic-Indic', APP.normalizeDigits('١٢٣٤٥')==='12345', APP.normalizeDigits('١٢٣٤٥'));
check('normalizeDigits converts Persian', APP.normalizeDigits('۱۲۳')==='123', APP.normalizeDigits('۱۲۳'));
check('fmtDate dd/mm/yyyy', APP.fmtDate('2026-09-22')==='22/9/2026', APP.fmtDate('2026-09-22'));
check('fmtDate empty', APP.fmtDate('')==='');
check('dayNameOf 2026-09-22 = الثلاثاء', APP.dayNameOf('2026-09-22')==='الثلاثاء', APP.dayNameOf('2026-09-22'));
check('dayNameOf 2026-09-27 = الأحد', APP.dayNameOf('2026-09-27')==='الأحد', APP.dayNameOf('2026-09-27'));
check('tidy collapses spaces', APP.tidy('  أ   ب  ') === 'أ ب', JSON.stringify(APP.tidy('  أ   ب  ')));
check('titleName joins job + name', APP.titleName('م. طبي','اسم تجريبي')==='م. طبي – اسم تجريبي', APP.titleName('م. طبي','اسم تجريبي'));
check('titleName handles missing job', APP.titleName('','اسم تجريبي')==='اسم تجريبي');
check('safeName strips illegal chars', !/[\\/:*?"<>|]/.test(APP.safeName('a/b:c*d?e"f<g>h|i')), APP.safeName('a/b:c*d?e"f<g>h|i'));

console.log('\n=== library integrity ===');
const C = APP.constants;
check('record presets present', C.RECORD_PRESETS.length >= 15, String(C.RECORD_PRESETS.length));
check('no bare "مدام" (unvocalised) in presets', !C.RECORD_PRESETS.some(v=>/(^|\s)مدام(\s|$|،|\.)/.test(v)), C.RECORD_PRESETS.find(v=>/(^|\s)مدام(\s|$|،|\.)/.test(v)));
check('no "الايعاز"/"الايعاد" typos in data', !JSON.stringify({p:C.RECO_PRESETS,gen:C.GENERAL_PRESETS,ents:APP.lists.get('recommendationEntities')}).match(/الايعا[زد]/), 'found typo');
check('no "ادامه"/"اعادة" typos in data', !JSON.stringify(C).includes('ادامه') && !JSON.stringify(C).includes('اعادة'));
check('recommendation entities build presets', APP.recoGroups().some(g=>/الإيعاز/.test(g.preset||'')), APP.recoGroups().map(g=>g.preset).filter(Boolean));
check('each entity gets a letter', APP.recoGroups().filter(g=>!/^جهة أخرى/.test(g.label)).every(g=>!!g.letter), APP.recoGroups().map(g=>g.label+':'+g.letter));
check('custom entity has empty preset', (APP.recoGroups().find(g=>/^جهة أخرى/.test(g.label))||{}).preset === '', APP.recoGroups().map(g=>g.label));
check('no "اصدار امر" without hamza', !JSON.stringify(C).includes('اصدار امر'));
check('record rows >= 20', C.RECORD_ROWS.length >= 20, String(C.RECORD_ROWS.length));
check('general presets present', C.GENERAL_PRESETS.length >= 10, String(C.GENERAL_PRESETS.length));
check('table widths sum to content width', true);

console.log('\n=== minimal report ===');
const r = APP.state.report;
r.facilityName = 'م. اختبار';
r.visitDate = '2026-01-05';
r.sector = '';
r.officials = [];
r.staff = {};
r.records = [];
r.recGroups = [];
r.positions = [];
r.general = [];
r.procedures = [];
r.prevRecs = [];
r.signers = [];
r.procExtra = ''; r.footerNote = ''; r.title = '';
r.fp = { managerJob:'',managerName:'',deputyJob:'',deputyName:'',devices:'',deviceState:'',staff:'',adminCount:'',adminWhere:'',reportFreq:'',reportTo:'',notes:'' };

const validation = APP.validateReport();
check('minimal report validates', validation==='', validation);
const M = APP.buildModel();
check('model has intro', M.intro.includes('م. اختبار'), M.intro.slice(0,80));
check('empty sections omitted', !M.sections.some(s=>s.type==='table'&&s.heading.includes('الملاك')));

console.log('\n=== A4 page geometry (now owned by report-word.js) ===');
/* أبعاد صفحة A4 انتقلت إلى report-word.js. الجداول أُزيلت من التقرير نهائياً
   (كل البيانات فقرات)، فلم تبقَ عروض أعمدة تُجمع. */
const PAGE = (APP.constants && APP.constants.PAGE) || sb.window.ADMHReport.PAGE || {};
check('A4 width is 11906 twips', PAGE.W === 11906, PAGE.W);
check('A4 height is 16838 twips', PAGE.H === 16838, PAGE.H);
check('margin is 1440 twips', PAGE.MARGIN === 1440, PAGE.MARGIN);
check('content width is 9026 twips', PAGE.CONTENT_W === 9026, PAGE.CONTENT_W);

(async ()=>{
  console.log('\n=== export minimal report ===');
  await APP.exportWord();
  check('blob produced', !!cap.blob);
  if(cap.blob){
    const ab = await cap.blob.arrayBuffer();
    const out = path.resolve(__dirname,'edge-minimal.docx');
    fs.writeFileSync(out, Buffer.from(ab));
    check('docx non-trivial size', ab.byteLength > 4000, ab.byteLength+' bytes');
    console.log('  wrote', out, ab.byteLength, 'bytes');
  }
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
