/* =============================================================================
   نسخ التقرير إلى الحافظة — report-clipboard.js
   =============================================================================
   ينسخ التقرير كاملاً بتنسيقه (عناوين، عريض، قوائم، جداول) لتلصقه في
   البريد أو Word أو أي مكان آخر.

   الطريقة:
     ١) نحاول النسخ الغني (HTML) عبر Clipboard API — يحفظ التنسيق.
     ٢) إن لم يدعمه المتصفح، ننسخ نصاً عادياً منسّقاً كخطة بديلة.
   ============================================================================= */
'use strict';

window.ADMHReport = window.ADMHReport || {};
(function (NS) {
  /* =========================================================================
     أدوات مختصرة — كلها من النطاق المشترك الذي تُثبّته app.js
     ========================================================================= */
  const toast = (m, k, d) => window.ADMHReport.util.toast(m, k, d);  /* إشعار للمستخدم */
  const buildModel = () => window.ADMHReport.buildModel();           /* نموذج التقرير */
  const $ = sel => document.querySelector(sel);                      /* اختصار للوصول إلى عنصر */

  /* =========================================================================
     بناء نص عادي من النموذج — يُستخدم كخطة بديلة وللنسخ البسيط
     ========================================================================= */
  function buildPlainText(M) {
    const out = [];                                     /* مصفوفة الأسطر */
    const add = s => { if (s !== undefined && s !== null && String(s).trim()) out.push(String(s)); };
    const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };

    add(M.title);                                       /* عنوان التقرير */
    add('='.repeat(Math.min(60, (M.title || '').length + 4))); /* خط تحت العنوان */
    blank();

    (M.meta || []).forEach(m => add(m[0] + ': ' + m[1])); /* البيانات العلوية */
    blank();

    add(M.intro);                                       /* المقدمة */
    blank();

    (M.sections || []).forEach(s => {                   /* كل قسم من أقسام التقرير */
      add(s.heading);                                   /* عنوان القسم */
      add('-'.repeat(Math.min(50, (s.heading || '').length + 2)));

      if (s.type === 'kv') {                            /* قسم «اسم: قيمة» */
        (s.rows || []).forEach(r => add(r[0] + ': ' + r[1]));
        (s.notes || []).forEach(n => add(n));
      } else if (s.type === 'list') {                    /* قسم قائمة */
        s.items.forEach((it, i) => add(s.numbered === false ? it : (i + 1) + '- ' + it));
      } else if (s.type === 'positions') {               /* قسم مواقف البصمة */
        s.blocks.forEach(b => {
          add(b.intro);
          b.cats.forEach(c => {
            add('  ' + c.title + ':');
            c.items.forEach(it => add('    ' + it));
          });
        });
      } else if (s.type === 'recs') {                    /* قسم التوصيات */
        s.groups.forEach(g => {
          const lbl = [g.letter ? g.letter + '/' : '', g.intro || g.label].filter(Boolean).join(' ');
          if (lbl) add(lbl.replace(/\/\s*$/, '/'));
          g.items.forEach((it, i) => add((i + 1) + '- ' + it));
        });
      }
      blank();
    });

    if ((M.signers || []).length) {                      /* فريق التفتيش */
      add('فريق التفتيش');
      M.signers.forEach(s => {
        add(s.name || '—');
        add([s.job, s.date].filter(Boolean).join(' — '));
        add('التوقيع: ..................................');
        blank();
      });
    }
    if (M.footerNote) add(M.footerNote);                 /* ملاحظة أسفل التقرير */
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* =========================================================================
     النسخ إلى الحافظة
     يجرّب النسخ الغني (HTML) أولاً، ثم النص العادي
     ========================================================================= */
  function copyReport() {
    const area = $('#docPreview');                        /* منطقة المعاينة */
    if (!area) { NS.toast('افتح المعاينة أولاً', 'warn'); return; }

    const html = area.innerHTML;                          /* التنسيق كما يظهر */
    const text = buildPlainText(NS.buildModel());         /* نص منسّق كخطة بديلة */

    /* الطريقة الحديثة: تنسخ HTML ونصاً معاً */
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        });
        navigator.clipboard.write([item])
          .then(() => NS.toast('نُسخ التقرير بتنسيقه ✓', 'ok'))
          .catch(() => fallbackCopy(html, text));
        return;
      } catch (e) { /* ننتقل إلى الطريقة البديلة */ }
    }
    fallbackCopy(html, text);                             /* خطة بديلة */
  }

  /* =========================================================================
     خطة بديلة: نحدّد محتوى المعاينة ثم ننفّذ أمر النسخ
     تعمل في المتصفحات التي لا تدعم ClipboardItem
     ========================================================================= */
  function fallbackCopy(html, text) {
    const area = $('#docPreview');
    if (!area) return;
    try {
      const range = document.createRange();               /* تحديد المحتوى */
      range.selectNodeContents(area);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('copy');            /* أمر النسخ */
      sel.removeAllRanges();
      if (ok) { NS.toast('نُسخ التقرير بتنسيقه ✓', 'ok'); return; }
    } catch (e) { /* ننتقل إلى النص العادي */ }

    /* آخر حل: نسخ النص العادي */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => NS.toast('نُسخ التقرير كنص ✓', 'ok'))
        .catch(() => NS.copyByTextarea(text));
    } else {
      NS.copyByTextarea(text);
    }
  }

  /* نسخ نصي احتياطي عبر حقل مؤقت */
  function copyByTextarea(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      NS.toast(ok ? 'نُسخ التقرير كنص ✓' : 'تعذّر النسخ', ok ? 'ok' : 'err');
    } catch (e) {
      NS.toast('تعذّر النسخ إلى الحافظة', 'err');
    }
  }

  NS.copyReport = copyReport;
  NS.copyByTextarea = copyByTextarea;
  NS.buildPlainText = buildPlainText;

})(window.ADMHReport);
