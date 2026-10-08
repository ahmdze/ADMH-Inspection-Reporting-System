/* Verify the exported Word file contains NO tables and keeps all content,
   plus check the new scope/title behaviour. Runs the real app.js. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { loadApp } = require('./_load.js');

class CL { constructor(e){this.el=e;this.set=new Set();} add(...c){c.forEach(x=>x&&this.set.add(x));this.sync();} remove(...c){c.forEach(x=>this.set.delete(x));this.sync();} contains(c){return this.set.has(c);} toggle(c,o){if(o===undefined)o=!this.set.has(c);o?this.set.add(c):this.set.delete(c);this.sync();return o;} sync(){this.el._cls=[...this.set].join(' ');} }
class El {
  constructor(t,i){this.tagName=(t||'div').toUpperCase();this.id=i||'';this.children=[];this._l={};this.style={};this.dataset={};this._cls='';this._v='';this._t='';this._h='';this.classList=new CL(this);this.files=null;this.onclick=null;this.onchange=null;}
  get className(){return this._cls;} set className(v){this._cls=v||'';this.classList.set=new Set(String(v||'').split(/\s+/).filter(Boolean));}
  get value(){return this._v;} set value(v){this._v=v==null?'':String(v);}
  get textContent(){return this._t;} set textContent(v){this._t=String(v==null?'':v);}
  get innerHTML(){return this._h;} set innerHTML(v){this._h=String(v==null?'':v);}
  get firstChild(){return this.children[0]||null;}
  addEventListener(t,f){(this._l[t]=this._l[t]||[]).push(f);} removeEventListener(){}
  dispatch(t,e){(this._l[t]||[]).forEach(f=>f(Object.assign({target:this,preventDefault(){},stopPropagation(){}},e)));}
  click(){if(this.onclick)this.onclick({target:this,preventDefault(){}});this.dispatch('click',{});}
  focus(){} blur(){} remove(){} appendChild(c){this.children.push(c);return c;}
  insertAdjacentHTML(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k];}
  closest(){return null;}
  querySelector(sel){const k='_c'+String(sel).replace(/\W+/g,'_');if(!this[k])this[k]=new El('div');return this[k];}
  querySelectorAll(){return [];}
}
class Doc extends El {
  constructor(){super('#document');this.body=new El('body');this.body.classList.add('light');this.readyState='complete';this._m=new Map();this._comp=new Map();}
  getElementById(id){if(!this._m.has(id))this._m.set(id,new El('input',id));return this._m.get(id);}
  querySelector(s){return this._q(s)[0]||null;} querySelectorAll(s){return this._q(s);}
  _q(s){const o=[];String(s).split(',').map(x=>x.trim()).forEach(x=>{
    const m=/^#([\w-]+)/.exec(x);
    if(m){ if(/^#[\w-]+\s*$/.test(x)) o.push(this.getElementById(m[1]));
           else { const k='_comp_'+x.replace(/\W+/g,'_'); if(!this._comp.has(k))this._comp.set(k,new El('div')); o.push(this._comp.get(k)); } }
  });return o;}
  createElement(t){return new El(t);} addEventListener(){}
}
class FakeBlob {
  constructor(p,o){this._p=(p||[]).map(x=>x instanceof Uint8Array?x:(x instanceof ArrayBuffer?new Uint8Array(x):new Uint8Array(0)));this.type=(o&&o.type)||'';}
  get size(){return this._p.reduce((a,b)=>a+b.length,0);}
  arrayBuffer(){const o=new Uint8Array(this.size);let f=0;for(const b of this._p){o.set(b,f);f+=b.length;}return Promise.resolve(o.buffer);}
}
const store=new Map(); const cap={blob:null};
const sb={console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,setInterval,clearInterval,Promise,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Math,Date,JSON,Object,Array,String,Number,Boolean,Error,RegExp,parseInt,parseFloat,isNaN,atob,btoa,Blob:FakeBlob,
 localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
 Image:class{constructor(){this.naturalWidth=0;this.naturalHeight=0;}set src(v){}},
 FileReader:class{readAsText(){}readAsDataURL(){}},
 URL:{createObjectURL:b=>{cap.blob=b;return 'blob:x';},revokeObjectURL(){}},
 navigator:{userAgent:'Windows',serviceWorker:null},location:{protocol:'http:',href:'http://x/',reload(){}},
 confirm:()=>true,alert(){},prompt(){},scrollTo(){},addEventListener(){},print(){},matchMedia:()=>({matches:false,addEventListener(){}})};
sb.window=sb;sb.globalThis=sb;sb.self=sb;sb.document=new Doc();
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..','vendor','docx.umd.js'),'utf8'),sb,{filename:'docx.umd.js'});
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'options.js'), 'utf8'), sb, { filename: 'options.js' });
loadApp(sb);
const APP = sb.window.ADMH;

let pass=0,fail=0;
const check=(n,c,d)=>{if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(d!==undefined?'  → '+JSON.stringify(d):''));}};

(async()=>{
  console.log('=== scope selection ===');
  const r=APP.state.report;
  check('blank report has scope=both', r.scope==='both', r.scope);
  r.scope='fp'; APP.applyScope();
  check('fp scope hides records card', sb.document.getElementById('cardRecords').style.display==='none');
  check('fp scope shows fingerprint card', sb.document.getElementById('cardFingerprint').style.display!=='none');
  r.scope='rec'; APP.applyScope();
  check('rec scope hides fingerprint card', sb.document.getElementById('cardFingerprint').style.display==='none');
  check('rec scope shows records card', sb.document.getElementById('cardRecords').style.display!=='none');
  r.scope='both'; APP.applyScope();
  check('both scope shows both', sb.document.getElementById('cardFingerprint').style.display!=='none' && sb.document.getElementById('cardRecords').style.display!=='none');

  console.log('\n=== auto title includes kind + sector ===');
  r.facilityKind='مستشفى'; r.facilityName='الشهيد الصدر'; r.sector=''; r.title=''; r.titleEdited=false;
  APP.updateTitle();
  let t1=APP.autoTitle(r);
  check('hospital title mentions مستشفى', /مستشفى/.test(t1), t1);
  r.sector='قطاع المدائن';
  let t2=APP.autoTitle(r);
  check('title includes sector', /قطاع المدائن/.test(t2), t2);
  r.titleEdited=true; r.title='عنوان مخصص';
  APP.updateTitle();
  check('manual title respected', sb.document.getElementById('reportTitleBox').value==='عنوان مخصص', sb.document.getElementById('reportTitleBox').value);

  console.log('\n=== staff categories ===');
  check('7 staff categories', Object.keys(r.staff).length===7, Object.keys(r.staff));
  const want=['الملاك','الأطباء','أطباء الأسنان','الصيادلة','تقني طبي','ممرضين','إداريين'];
  check('exact category names', want.every(w=>w in r.staff), Object.keys(r.staff));

  console.log('\n=== position categories have job+name+note ===');
  const C = APP.positionCats();
  check('all categories expose job field', C.length >= 5 && C.every(c=>c.hasJob===true), C.map(c=>c.k+':'+c.hasJob));

  console.log('\n=== report-frequency sentence ===');
  r.fp.reportFreq='أسبوعياً'; r.fp.reportTo='القطاع';
  const M=APP.buildModel();
  const fpSec=M.sections.find(s=>s.heading.includes('وحدة البصمة'));
  const line=(fpSec.rows||[]).find(x=>x[0]==='آلية رفع الموقف');
  check('frequency+target sentence built', !!(line && /يُرسل موقف الحضور والبصمة أسبوعياً إلى القطاع بانتظام/.test(line[1])), line && line[1]);

  console.log('\n=== build a full report and export ===');
  r.facilityName='الخناسة'; r.sector='قطاع المدائن'; r.facilityKind='مركز صحي';
  r.visitDate='2026-09-22'; r.dayName='الثلاثاء'; r.population='20416'; r.title=''; r.titleEdited=false;
  r.officials=[{role:'مسؤول الإدارة والخدمات',job:'ر. م. وقائي أقدم',name:'داود سلومي عبد'}];
  r.staff={'الملاك':{total:'55',actual:'32'},'الأطباء':{total:'3',actual:'2'},'أطباء الأسنان':{total:'7',actual:'5'},'الصيادلة':{total:'5',actual:'2'}};
  r.fp.managerJob='م. فني'; r.fp.managerName='حسين تركي علي'; r.fp.devices='1'; r.fp.deviceState='عاطل'; r.fp.staff='شخصان فقط';
  r.procedures=[{date:'2026-09-22',kind:'توقيع مفاجئ',source:'موظفي المركز',note:''}];
  r.general=['تعطل جهاز البصمة الخاص بالمركز منذ 1/8/2026.'];
  r.positions=[{date:'2026-09-22',day:'الثلاثاء',verb:'بعد تدقيق',kind:'موقف الحضور المفاجئ (التدقيق المفاجئ)',intro:'',
    items:{absent:[{job:'طبيب اسنان تدرج',name:'زينب مازن غازي',note:''}],noExit:[{job:'م. طبي',name:'علي حسن',note:'بدون بصمة'}],noEntry:[],noSurprise:[],noBoth:[]}}];
  r.records=[
    {name:'سجل الحركة',evalList:['مُدام وموثق ومحدّث.'],evalManual:'ولا يوجد حقل لتوقيع الموظفين.',eval:'مُدام وموثق ومحدّث. ولا يوجد حقل لتوقيع الموظفين.'},
    {name:'سجل الإجازات المرضية',evalList:['مُدام وموثق، وغير محدّث، ولا يتم ذكر التشخيص.'],evalManual:'',eval:'مُدام وموثق، وغير محدّث، ولا يتم ذكر التشخيص.'},
  ];
  r.recGroups=[{letter:'أ',label:'شعبة التحقيقات / قسمنا',intro:'الإيعاد إلى شعبة التحقيقات في قسمنا بما يلي:',items:['تشكيل لجنة تحقيقية.']}];
  r.prevRecs=[{text:'توفير جهاز بصمة',status:'منفذة جزئياً',note:'قيد الإنجاز'}];
  r.signers=[{name:'عضو فريق التفتيش',job:'ضابط تفتيش',date:'2026-09-22'}];

  APP.renderAll(); APP.applyScope();
  const MM=APP.buildModel();
  check('no table sections produced', !MM.sections.some(s=>s.type==='table'), MM.sections.filter(s=>s.type==='table'));
  const staffSec=MM.sections.find(s=>s.heading==='الملاك الكلي والفعلي');
  check('staff became paragraph list', staffSec && staffSec.type==='list' && staffSec.numbered===false, staffSec && staffSec.type);
  check('staff line has total + actual, NO shortfall/percentage',
    !!(staffSec && /^الملاك: الملاك الكلي 55 — الملاك الفعلي 32$/.test(staffSec.items[0])), staffSec && staffSec.items[0]);
  check('no "النقص" anywhere in staff lines',
    !staffSec.items.some(i => /النقص|بنسبة/.test(i)), staffSec.items);
  check('no percentage sign in staff lines', !staffSec.items.some(i => /%/.test(i)), staffSec.items);
  const recSec=MM.sections.find(s=>s.heading.includes('السجلات الإدارية'));
  check('records became paragraphs', recSec && recSec.type==='list', recSec && recSec.type);
  check('record line format "name: eval"', !!(recSec && /^سجل الحركة: /.test(recSec.items[0])), recSec && recSec.items[0]);

  await APP.exportWord();
  check('blob produced', !!cap.blob);
  const ab=await cap.blob.arrayBuffer();
  const out=path.resolve(__dirname,'notables.docx');
  fs.writeFileSync(out,Buffer.from(ab));
  console.log('  wrote', out, ab.byteLength,'bytes');
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('ERROR',e);process.exit(1);});
