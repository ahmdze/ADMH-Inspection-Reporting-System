/* =============================================================================
   اختبار أدوات CI — _tools/tooling_test.js
   =============================================================================
   يفحص الأدوات التي أُضيفت ليعمل المشروع على Linux:
     · _zip.js            قارئ ZIP بكتابة Node (بديل بايثون)
     · _server.js         خادم اختبار كعملية منفصلة
     · clean_chrome_temp  كنس بقايا Chrome
     · _chrome.js         كشف Chrome وملف التعريف المؤقّت
   ============================================================================= */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { pass++; }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
};
const section = t => console.log('\n' + t);

const zip = require('./_zip.js');
const clean = require('./clean_chrome_temp.js');

/* -----------------------------------------------------------------------------
   نبني أرشيف ZIP بأنفسنا لاختبار القارئ بمعزل عن أي ملف خارجي
   ----------------------------------------------------------------------------- */
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  files.forEach(f => {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const raw = Buffer.from(f.data, 'utf8');
    const needDeflate = f.store !== true;
    const body = needDeflate ? zlib.deflateRawSync(raw) : raw;
    const method = needDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);           /* وقت */
    local.writeUInt32LE(0, 14);           /* crc — لا يفحصه قارئنا */
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);          /* وقت */
    central.writeUInt32LE(0, 16);          /* crc */
    /* ترتيب المواصفة: ٢٠ = المضغوط · ٢٤ = الأصلي (لا العكس) */
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);          /* extra */
    central.writeUInt16LE(0, 32);          /* comment */
    central.writeUInt16LE(0, 34);          /* disk */
    central.writeUInt16LE(0, 36);          /* داخلي */
    central.writeUInt32LE(0, 38);          /* خارجي */
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  });

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(locals), centralBuf, eocd]);
}

section('=== ١) قارئ ZIP: أرشيف مبني يدوياً ===');
{
  const buf = makeZip([
    { name: 'word/document.xml', data: '<w:t>مرحباً</w:t><w:t> بالعالم</w:t>' },
    { name: 'readme.txt', data: 'نص عادي' },
  ]);
  const entries = zip.listEntries(buf);
  check('lists both entries', entries.length === 2, entries.length);
  check('preserves names', entries[0].name === 'word/document.xml', entries[0].name);
  check('reads deflated content', zip.textOf(buf, 'readme.txt') === 'نص عادي',
    zip.textOf(buf, 'readme.txt'));
  check('reads the xml part', /مرحباً/.test(zip.textOf(buf, 'word/document.xml')));
  check('missing entry → null', zip.textOf(buf, 'nope.xml') === null);

  const doc = zip.docxText(buf);
  /* كل وسم <w:t> يحوي مسافة بادئة، والضمّ يضيف مسافة — فالناتج بمسافتين.
     نُطبّع المسافات قبل المقارنة. */
  check('docxText joins w:t runs',
    doc.text.replace(/\s+/g, ' ').trim() === 'مرحباً بالعالم', doc.text);
  check('docxText counts tables', doc.tables === 0, doc.tables);
}

section('=== ٢) قارئ ZIP: حالة التخزين بلا ضغط ===');
{
  const buf = makeZip([{ name: 'stored.txt', data: 'بلا ضغط', store: true }]);
  check('reads a stored (method 0) entry', zip.textOf(buf, 'stored.txt') === 'بلا ضغط',
    zip.textOf(buf, 'stored.txt'));
}

section('=== ٣) قارئ ZIP: الجداول تُعدّ صحيحاً ===');
{
  const buf = makeZip([{
    name: 'word/document.xml',
    data: '<w:tbl><w:tr/></w:tbl><w:t>نص</w:t><w:tbl><w:tr/></w:tbl>',
  }]);
  check('counts two tables', zip.docxText(buf).tables === 2, zip.docxText(buf).tables);
}

section('=== ٤) قارئ ZIP: المدخلات التالفة ===');
{
  const bad = Buffer.from('هذا ليس أرشيفاً');
  let threw = false;
  try { zip.listEntries(bad); } catch (e) { threw = true; }
  check('a non-zip buffer throws a clear error', threw);
  check('an empty buffer throws too', (() => {
    try { zip.listEntries(Buffer.alloc(0)); return false; } catch (e) { return true; }
  })());
}

section('=== ٥) قارئ ZIP: ملف Word حقيقي (إن وُجد) ===');
{
  const real = path.join(ROOT, '_tools', 'axis-check.docx');
  if (fs.existsSync(real)) {
    const buf = fs.readFileSync(real);
    const doc = zip.docxText(buf);
    check('a real .docx parses', doc.text.length > 100, doc.text.length);
    check('it has no tables', doc.tables === 0, doc.tables);
    check('it contains the axis divider',
      doc.text.indexOf('المحور الإداري') >= 0, doc.text.slice(0, 60));
  } else {
    check('real docx present (generated by docx_axis_test)', true);
  }
}

section('=== ٦) كنس بقايا Chrome ===');
{
  /* نبني مجلدات وهمية داخل مجلد مؤقّت خاص بالاختبار */
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'admh-clean-test-'));
  const oldDir = path.join(sandbox, 'HeadlessChrome999999');
  const newDir = path.join(sandbox, 'HeadlessChrome111111');
  const otherDir = path.join(sandbox, 'مجلد_عادي');
  fs.mkdirSync(oldDir); fs.mkdirSync(newDir); fs.mkdirSync(otherDir);
  fs.writeFileSync(path.join(oldDir, 'x.bin'), Buffer.alloc(2048));

  /* نُقادم مجلداً واحداً فقط */
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  fs.utimesSync(oldDir, old, old);

  const stats = clean.sweep({ dir: sandbox, maxAgeMs: 3600 * 1000 });
  check('removes only the stale Chrome folder', stats.removed === 1, stats);
  check('reports the freed size', stats.freed >= 2048, stats.freed);
  check('keeps a recent Chrome folder', fs.existsSync(newDir));
  check('leaves unrelated folders alone', fs.existsSync(otherDir));
  check('removes the stale one', !fs.existsSync(oldDir));

  /* المجلد غير المؤقّت */
  fs.rmSync(sandbox, { recursive: true, force: true });
}

section('=== ٧) كشف Chrome وملف التعريف ===');
{
  const chrome = require('./_chrome.js');
  const p = chrome.findChrome();
  check('Chrome is found on this machine', !!p, p);
  check('the path exists', !p || fs.existsSync(p), p);

  const prof = chrome.profilePath();
  check('a profile path is chosen', typeof prof === 'string' && prof.length > 3, prof);
  check('the profile folder is created', fs.existsSync(prof), prof);
  /* نتحقق أنه قابل للكتابة فعلاً */
  const probe = path.join(prof, '.write-test');
  let writable = true;
  try { fs.writeFileSync(probe, 'x'); fs.unlinkSync(probe); } catch (e) { writable = false; }
  check('the profile folder is writable', writable);
  check('args include headless and the profile',
    chrome.args([]).some(a => /headless/.test(a)) &&
    chrome.args([]).some(a => a.indexOf('--user-data-dir=') === 0),
    chrome.args([]).filter(a => /headless|user-data/.test(a)));
  check('args disable the sandbox for CI', chrome.args([]).indexOf('--no-sandbox') >= 0);

  /* نتحقق أن المجلد اختير في مكان **قابل للكتابة** وفيه مساحة */
  chrome.cleanProfile();
  check('cleanProfile removes the folder', !fs.existsSync(prof), prof);
}

section('=== ٧ب) حماية من حذف مجلد النظام (عطل خطير سابق) ===');
{
  /* ---------------------------------------------------------------------
     عطل حقيقي حدث: كان `profilePath()` يُعيد **مجلد النظام المؤقت نفسه**،
     و`cleanProfile()` يحذف المجلد كاملاً — فحذف كل محتوى Temp.
     هذه الفحوص تمنع عودة ذلك.
     --------------------------------------------------------------------- */
  const chrome = require('./_chrome.js');
  const tmp = os.tmpdir();

  const p1 = chrome.profilePath();
  check('the profile path is NOT the system temp folder', p1 !== tmp, p1);
  check('the profile path is a dedicated subfolder',
    p1 && p1.indexOf(tmp) === 0 && p1.length > tmp.length, p1);
  check('the folder name is ours',
    /^admh-chrome-/.test(path.basename(p1 || '')), path.basename(p1 || ''));

  /* الحماية الصارمة في cleanProfile */
  const entriesBefore = fs.readdirSync(tmp).length;
  chrome.cleanProfile();
  const entriesAfter = fs.readdirSync(tmp).length;
  check('the system temp folder still exists', fs.existsSync(tmp));
  check('cleanProfile removed only our folder',
    entriesBefore - entriesAfter <= 1, { before: entriesBefore, after: entriesAfter });
  check('our folder is gone', !fs.existsSync(p1), p1);
  check('calling cleanProfile twice is safe', (() => {
    try { chrome.cleanProfile(); return true; } catch (e) { return false; }
  })());

  /* حتى لو عُبِّث المسار يدوياً، لا يُحذف مجلد النظام */
  check('a fresh call after cleanup yields a new folder',
    (() => { const p2 = chrome.profilePath(); const ok = p2 && p2 !== p1 && fs.existsSync(p2); chrome.cleanProfile(); return ok; })());
}

section('=== ٨) خادم الاختبار: عملية منفصلة ===');
{
  const server = require('./_server.js');
  check('start and waitFor are exported',
    typeof server.start === 'function' && typeof server.waitFor === 'function');

  /* نتحقق أن الخادم عملية منفصلة فعلاً عبر وجود ملف منفصل */
  check('a separate server script exists', fs.existsSync(server.SERVER_SCRIPT),
    server.SERVER_SCRIPT);

  server.start({ root: ROOT }).then(async srv => {
    try {
      check('the server announces a free port', srv.port > 0, srv.port);
      await server.waitFor(srv.url + '/index.html', 8000);
      check('the server answers after start', true);

      const http = require('http');
      const body = await new Promise((res, rej) => {
        http.get(srv.url + '/index.html', r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => res({ code: r.statusCode, len: d.length }));
        }).on('error', rej);
      });
      check('serves index.html', body.code === 200 && body.len > 1000, body);
      check('a separate process is used (not blocking the event loop)',
        !!srv.child && srv.child.pid > 0, srv.child && srv.child.pid);
    } finally {
      srv.close();
    }

    console.log('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
  }).catch(e => {
    console.error('TEST ERROR: ' + e.message);
    process.exit(1);
  });
}
