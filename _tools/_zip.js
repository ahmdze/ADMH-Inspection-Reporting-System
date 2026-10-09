/* =============================================================================
   قارئ ZIP مبسّط — _tools/_zip.js
   =============================================================================
   لماذا نكتبه بأنفسنا؟
   -----------------------------------------------------------------------------
   كان `docx_axis_test.js` يقرأ محتوى ملف Word عبر **بايثون**:
       python -c "import zipfile; ..."
   ومسار بايثون كان ثابتاً على Windows، ففشل الاختبار على خادم CI.

   ملف `.docx` هو أرشيف ZIP، وNode يملك فكّ ضغط Deflate مدمجاً
   (`zlib.inflateRawSync`). فهذا القارئ يكفي لاستخراج `word/document.xml`
   بلا أي تبعية خارجية — يقرأ الفهرس المركزي (Central Directory) كما تنصّ
   مواصفة ZIP، ويتعامل مع حالتي التخزين والضغط.
   ============================================================================= */
'use strict';

const fs = require('fs');
const zlib = require('zlib');

/* بصمات مواصفة ZIP */
const SIG_EOCD = 0x06054b50;   /* نهاية الفهرس المركزي */
const SIG_CENTRAL = 0x02014b50; /* رأس الفهرس المركزي */
const SIG_LOCAL = 0x04034b50;   /* رأس الملف المحلي */

/**
 * يقرأ قائمة الملفات داخل أرشيف ZIP.
 * @param {Buffer} buf
 * @returns {Array<{name:string, method:number, size:number, offset:number}>}
 */
function listEntries(buf) {
  /* ١) ابحث عن EOCD من نهاية الملف (قد تليه تعليقات) */
  let eocd = -1;
  const minEocd = 22;
  for (let i = buf.length - minEocd; i >= 0 && i >= buf.length - 65557; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ليس أرشيف ZIP صالحاً (لا يوجد EOCD)');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);   /* موضع الفهرس المركزي */

  const out = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    /* ترتيب المواصفة: ٢٠ = الحجم المضغوط · ٢٤ = الحجم الأصلي */
    const compSize = buf.readUInt32LE(p + 20);
    const rawSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    out.push({ name, method, size: compSize, rawSize, offset: localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * يستخرج محتوى ملف داخل الأرشيف.
 * @param {Buffer} buf الأرشيف
 * @param {object} entry مدخل من listEntries
 * @returns {Buffer}
 */
function readEntry(buf, entry) {
  const lo = entry.offset;
  if (lo < 0 || lo + 30 > buf.length) throw new Error('موضع غير صالح للمدخل: ' + entry.name);
  if (buf.readUInt32LE(lo) !== SIG_LOCAL) throw new Error('رأس محلي غير صالح: ' + entry.name);

  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  if (start > buf.length) throw new Error('بيانات المدخل خارج الأرشيف: ' + entry.name);

  /* نقطع بحجم البيانات **المضغوطة** المتاح فعلاً — الأرشيف قد يكون مبتوراً */
  const avail = Math.min(entry.size, buf.length - start);
  if (avail <= 0) return Buffer.alloc(0);
  const raw = buf.slice(start, start + avail);

  if (entry.method === 0) return raw;                  /* بلا ضغط */
  if (entry.method === 8) {
    try {
      return zlib.inflateRawSync(raw);
    } catch (e) {
      throw new Error('تعذّر فكّ ضغط المدخل «' + entry.name + '»: ' + e.message);
    }
  }
  throw new Error('طريقة ضغط غير مدعومة: ' + entry.method);
}

/** يقرأ ملفاً من القرص */
function readZipFile(file) {
  return fs.readFileSync(file);
}

/**
 * يستخرج نصاً من ملف داخل الأرشيف.
 * لا ينهار على أرشيف تالف — يُعيد null ليتعامل المستدعي مع الغياب.
 * @param {Buffer} buf
 * @param {string} name
 * @returns {string|null}
 */
function textOf(buf, name) {
  try {
    const e = listEntries(buf).find(x => x.name === name);
    if (!e) return null;
    return readEntry(buf, e).toString('utf8');
  } catch (err) {
    return null;
  }
}

/**
 * يستخرج كل نصوص Word من `word/document.xml`.
 * @param {Buffer} buf أرشيف docx
 * @returns {{text:string, tables:number, raw:string}}
 */
function docxText(buf) {
  const xml = textOf(buf, 'word/document.xml');
  if (xml == null) throw new Error('الملف لا يحتوي word/document.xml صالحاً');
  const parts = [];
  const rx = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = rx.exec(xml)) !== null) parts.push(m[1]);
  return {
    text: parts.join(' '),
    /* عدد الجداول — يجب أن يكون صفراً في تقارير هذا المشروع */
    tables: (xml.match(/<w:tbl>/g) || []).length,
    raw: xml,
  };
}

module.exports = { listEntries, readEntry, readZipFile, textOf, docxText };
