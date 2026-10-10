/* =============================================================================
   تصدير التقرير إلى Word — report-word-n.js
   =============================================================================
   يولّد ملف .docx حقيقياً (مقاس A4، اتجاه عربي RTL، بلا أي جدول) داخل المتصفح.

   ملاحظات تقنية مؤكَّدة بالاختبار — لا تغيّرها:
     · يجب استخدام Packer.toBlob() في المتصفح؛ فـ toBuffer() يفشل.
     · التقرير كله فقرات — لا جداول إطلاقاً.
     · تباعد الأسطر يُكتب صراحةً lineRule:'auto'؛ فإغفاله يضاعف التباعد.

   لتعديل الشكل: عدّل دوال para / LINE / الهوامش أدناه.
   ============================================================================= */
'use strict';

window.ADMHReport = window.ADMHReport || {};
(function (NS) {
  /* =========================================================================
     أدوات مختصرة — كلها من النطاق المشترك الذي تُثبّته app.js
     ========================================================================= */
  const tidy = s => window.ADMHReport.util.tidy(s);                  /* تنظيف النص */
  const esc = s => window.ADMHReport.util.esc(s);                    /* تأمين النص */
  const fmtDate = iso => window.ADMHReport.util.fmtDate(iso);        /* صياغة التاريخ */
  const fmtNum = n => window.ADMHReport.util.fmtNum(n);              /* صياغة الأرقام */
  const normalizeDigits = v => window.ADMHReport.util.normalizeDigits(v); /* توحيد الأرقام العربية */
  const todayISO = () => window.ADMHReport.util.todayISO();          /* تاريخ اليوم */
  const safeName = s => window.ADMHReport.util.safeName(s);          /* اسم ملف آمن */
  const download = (b, f) => window.ADMHReport.util.download(b, f);  /* تنزيل ملف */
  const toast = (m, k, d) => window.ADMHReport.util.toast(m, k, d);  /* إشعار للمستخدم */
  const validateReport = () => window.ADMHReport.util.validateReport(); /* التحقق من اكتمال البيانات */
  const state = () => window.ADMHReport.getState();                  /* حالة التطبيق */
  const buildModel = () => window.ADMHReport.buildModel();           /* نموذج التقرير من report-model.js */

  /* =========================================================================
     تحويل صورة data URL إلى بايتات لإدراج الشعار في الملف
     ========================================================================= */
function dataUrlToBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase();
  const type = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'bmp' ? 'png' : ext;
  let bin;
  try { bin = atob(m[2].replace(/\s+/g, '')); } catch (e) { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type };
}
/* =============================================================================
   تصدير Word (.docx) — مبني على docx UMD
   ملاحظات تقنية مؤكَّدة بالاختبار:
     • يجب استخدام Packer.toBlob() في المتصفح؛ toBuffer() يفشل.
     • التقرير كله فقرات — لا جداول إطلاقاً (بطلب صريح).
   ============================================================================= */
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1440;
const CONTENT_W = PAGE_W - MARGIN * 2; /* 9026 — يُستخدم لحساب العروض إن لزم */

/* أبعاد صفحة A4 — تُصدَّر للاختبارات ولأي حساب عروض لاحق */
NS.PAGE = { W: PAGE_W, H: PAGE_H, MARGIN: MARGIN, CONTENT_W: CONTENT_W };

function exportWord() {
  const fail = validateReport();
  if (fail) { toast(fail, 'err', 3800); showView('report'); return Promise.resolve(); }
  const D = window.docx;
  if (!D) { toast('تعذّر تحميل مولّد Word', 'err', 4000); return Promise.resolve(); }

  const M = buildModel();
  const st = state();                                   /* حالة التطبيق */
  const fontName = st.settings.font || 'Simplified Arabic';
  const baseHalf = Math.round((parseFloat(st.settings.fontSize) || 12) * 2);
  const F = { name: fontName, hint: 'cs' };

  /* لا حاجة لأي أصناف جداول: التقرير كله فقرات */
  const {
    Document, Packer, Paragraph, TextRun,
    AlignmentType, HeadingLevel, BorderStyle,
    PageNumber, Footer, LevelFormat,
  } = D;

  /* تباعد الأسطر — يتبع نمط التقارير الأصلية: w:line=276 w:lineRule=auto (~1.15)
     بدون w:lineRule صريح يفسّر بعض العارضين القيمة كـ«ضبط دقيق» فيتضاعف التباعد. */
  const LINE = 276;
  /* -----------------------------------------------------------------
     ترقيم Word الحقيقي (w:numPr) بدل كتابة «1- » نصاً داخل الفقرة.
     ---------------------------------------------------------------------
     · تعريف ترقيم واحد (NUM_REF) يُعاد استخدامه، ولكل قائمة «نسخة» (instance)
       مستقلة فيبدأ العدّ من 1 في كل قسم وكل جهة توصيات.
     · الرقم يُدار من Word: إدراج بند أو حذفه أو نقله يُعيد الترقيم تلقائياً،
       والرقم لا يدخل في النص عند نسخ الفقرة أو البحث فيها.
     · الإزاحة المعلّقة (الرقم عند الهامش والنص بعده) تُعرَّف في مستوى الترقيم
       نفسه، فلا حاجة لتمريرها في كل فقرة.
     ----------------------------------------------------------------- */
  const NUM_REF = 'admh-decimal';
  const NUM_INDENT = { start: 397, hanging: 397 };   /* 397 ≈ 0.7 سم: يكفي رقمين */
  let numInstance = 0;
  const newList = () => ++numInstance;               /* قائمة جديدة تبدأ من 1 */

  const para = (text, o) => {
    o = o || {};
    const runs = [];
    if (o.runs) runs.push(...o.runs);
    else runs.push(new TextRun({ text: String(text == null ? '' : text), rightToLeft: true, bold: !!o.bold, italics: !!o.italics, color: o.color, size: o.size || baseHalf, font: F }));
    return new Paragraph({
      bidi: true,
      alignment: o.align || AlignmentType.RIGHT,
      heading: o.heading,
      indent: o.indent,
      numbering: o.numbering,
      spacing: {
        before: o.before == null ? 0 : o.before,
        after: o.after == null ? 60 : o.after,
        line: o.line || LINE,
        lineRule: 'auto',
      },
      border: o.border,
      children: runs,
    });
  };
  /* بند مرقَّم ترقيماً حقيقياً — inst هو رقم القائمة الذي أعاده newList() */
  const numPara = (text, inst, o) =>
    para(text, Object.assign({}, o, { numbering: { reference: NUM_REF, level: 0, instance: inst } }));
  /* لا جداول في ملف Word: كل البيانات تُصاغ فقرات. */

  const children = [];

  /* الترويسة — الشعار (يُدمج فعلياً في الملف إن وُجد) */
  const logoData = dataUrlToBytes(M.header.logo);
  if (logoData && D.ImageRun) {
    try {
      const lw = st.settings.logoW || 120, lh = st.settings.logoH || 90;
      const scale = Math.min(110 / lw, 78 / lh, 2.2);
      children.push(new Paragraph({
        bidi: true,
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new D.ImageRun({
          data: logoData.bytes,
          transformation: { width: Math.max(20, Math.round(lw * scale)), height: Math.max(20, Math.round(lh * scale)) },
          type: logoData.type,
        })],
      }));
    } catch (e) { console.warn('logo embed failed', e); }
  }
  [M.header.l1, M.header.l2, M.header.l3].filter(Boolean).forEach(l =>
    children.push(para(l, { align: AlignmentType.CENTER, size: baseHalf - 2, color: '555555', after: 10 })));
  children.push(para(M.title, { align: AlignmentType.CENTER, size: baseHalf + 8, bold: true, color: '004D40', before: 80, after: 40 }));
  if (M.meta.length) children.push(para(M.meta.map(m => `${m[0]}: ${m[1]}`).join('   |   '), { align: AlignmentType.CENTER, size: baseHalf - 2, color: '444444', after: 60 }));
  children.push(new Paragraph({
    bidi: true, spacing: { after: 100, line: LINE, lineRule: 'auto' },
    border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: '004D40', space: 4 } },
    children: [new TextRun({ text: '', size: 2, font: F })],
  }));

  /* المقدمة */
  children.push(para(M.intro, { align: AlignmentType.JUSTIFIED, after: 100 }));

  /* الأقسام */
  M.sections.forEach(s => {
    /* -----------------------------------------------------------------
       فاصل المحور: «المحور الإداري //»
       -----------------------------------------------------------------
       كان نوعه 'heading' ولا يعالجه أي مصيّر — فيُسقط صامتاً ولا يظهر
       في ملف Word. الآن له نوع خاص وتنسيق مميّز: بلا خط فاصل، وبتباعد
       أوضح قبله، ليكون فاصلاً بصرياً بين ترويسة التقرير وأقسامه.
       ----------------------------------------------------------------- */
    if (s.type === 'axis') {
      children.push(para(s.heading, {
        heading: HeadingLevel.HEADING_2,
        size: baseHalf + 4, bold: true, color: '004D40',
        align: AlignmentType.RIGHT,
        before: 300, after: 160,
        /* بلا border: الفاصل لا يُرسم تحته خطّ */
      }));
      return;                       /* لا محتوى له — فاصل فقط */
    }

    children.push(para(s.heading, { heading: HeadingLevel.HEADING_2, size: baseHalf + 2, bold: true, color: '004D40', before: 180, after: 70, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '00796B', space: 3 } } }));
    if (s.type === 'kv') {
      (s.rows || []).forEach(r => children.push(para([r[0] ? r[0] + ': ' : '', r[1]].join(''), { after: 20 })));
      (s.notes || []).forEach(n => children.push(para(n, { after: 20 })));
    } else if (s.type === 'list') {
      /* numbered === false يعني بنوداً غير مرقّمة (مثل سطور الملاك) */
      if (s.numbered === false) {
        s.items.forEach(it => children.push(para(it, { after: 30 })));
      } else {
        const inst = newList();
        s.items.forEach(it => children.push(numPara(it, inst, { after: 40 })));
      }
    } else if (s.type === 'positions') {
      s.blocks.forEach(b => {
        children.push(para(b.intro, { after: 40 }));
        b.cats.forEach(c => {
          children.push(para(c.title + ':', { bold: true, after: 20, before: 60 }));
          /* النموذج يكتب «1. الاسم» نصاً (تستهلكه المعاينة والنسخ) —
             هنا ننزع هذه البادئة ونترك الترقيم لـWord */
          const inst = newList();
          c.items.forEach(it => children.push(numPara(String(it).replace(/^\s*\d+\s*[.\-)]\s*/, ''), inst, { after: 10 })));
        });
      });
    } else if (s.type === 'recs') {
      s.groups.forEach(g => {
        const lbl = [g.letter ? g.letter + '/' : '', g.intro || g.label].filter(Boolean).join(' ');
        if (lbl) children.push(para(lbl.replace(/\/\s*$/, '/'), { bold: true, before: 90, after: 30 }));
        const inst = newList();
        g.items.forEach(it => children.push(numPara(it, inst, { after: 40 })));
      });
    }
  });

  /* التوقيعات */
  if (M.signers.length) {
    children.push(para('فريق التفتيش', { heading: HeadingLevel.HEADING_2, size: baseHalf + 2, bold: true, color: '004D40', before: 240, after: 90 }));
    M.signers.forEach(s => {
      children.push(para(s.name || '—', { bold: true, after: 20 }));
      const sub = [s.job, s.date].filter(Boolean).join(' — ');
      if (sub) children.push(para(sub, { size: baseHalf - 2, color: '555555', after: 20 }));
      children.push(para('التوقيع: ..................................', { after: 160, color: '444444' }));
    });
  }
  if (M.footerNote) children.push(para(M.footerNote, { align: AlignmentType.CENTER, before: 160, size: baseHalf - 2, color: '555555' }));

  const doc = new Document({
    numbering: {
      config: [{
        reference: NUM_REF,
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1-',                                  /* الشكل نفسه السابق: 1- 2- 3- */
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: NUM_INDENT },
            run: { font: F, size: baseHalf, rightToLeft: true },
          },
        }],
      }],
    },
    creator: 'نظام التقارير التفتيشية',
    title: M.title,
    description: 'تقرير زيارة تفتيشية',
    styles: {
      default: {
        document: { run: { font: F, size: baseHalf, rightToLeft: true } },
        heading1: { run: { font: F, size: baseHalf + 8, bold: true, color: '004D40', rightToLeft: true } },
        heading2: { run: { font: F, size: baseHalf + 2, bold: true, color: '004D40', rightToLeft: true } },
      },
    },
    sections: [{
      properties: {
        page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
        bidi: true,
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            bidi: true, alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'صفحة ', rightToLeft: true, size: baseHalf - 4, font: F, color: '777777' }),
              new TextRun({ children: [PageNumber.CURRENT], size: baseHalf - 4, font: F, color: '777777' }),
              new TextRun({ text: ' من ', rightToLeft: true, size: baseHalf - 4, font: F, color: '777777' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: baseHalf - 4, font: F, color: '777777' }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBlob(doc).then(blob => {
    const fn = `تقرير_${safeName(M.facility)}_${((st.report && st.report.visitDate) || todayISO()).replace(/-/g, '')}.docx`;
    download(blob, fn);
    toast('تم تصدير ملف Word', 'ok');
  }).catch(err => {
    console.error(err);
    toast('فشل توليد الملف: ' + (err && err.message ? err.message : err), 'err', 5000);
  });
}

  NS.exportWord = exportWord;
  NS.dataUrlToBytes = dataUrlToBytes;

})(window.ADMHReport);
