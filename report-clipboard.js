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
  const COPY_MODES = {
    all: { label: 'المعلومات بالكامل', success: 'تم نسخ المعلومات بالكامل بتنسيقها ✓' },
    'without-header': { label: 'المعلومات دون الترويسة', success: 'تم النسخ دون الترويسة ✓' },
    'without-header-recs': { label: 'المعلومات دون الترويسة والتوصيات', success: 'تم النسخ دون الترويسة والتوصيات ✓' },
    recommendations: { label: 'التوصيات فقط', success: 'تم نسخ التوصيات بتنسيقها ✓' },
  };

  /* يعزل الجزء المطلوب من المعاينة دون تعديل التقرير الأصلي. */
  function buildCopyFragment(area, mode) {
    const clone = area.cloneNode(true);
    clone.removeAttribute('id');

    const headings = Array.from(clone.querySelectorAll('h2'));
    const recHeading = headings.find(h => h.textContent.trim() === 'التوصيات');

    if (mode === 'without-header' || mode === 'without-header-recs') {
      clone.querySelectorAll('.hdr').forEach(el => el.remove());
    }

    if (mode === 'without-header-recs') {
      if (recHeading) {
        let node = recHeading;
        while (node) {
          const next = node.nextElementSibling;
          node.remove();
          if (!next || next.tagName === 'H2') break;
          node = next;
        }
      }
    } else if (mode === 'recommendations') {
      if (!recHeading) return null;
      const onlyRecs = document.createElement('div');
      onlyRecs.className = clone.className;
      onlyRecs.setAttribute('dir', 'rtl');
      let node = recHeading;
      while (node && node.tagName !== 'H2' || node === recHeading) {
        const next = node.nextElementSibling;
        onlyRecs.appendChild(node.cloneNode(true));
        if (!next || next.tagName === 'H2') break;
        node = next;
      }
      return onlyRecs;
    }

    return clone;
  }

  function copyReport(mode = 'all') {
    const area = $('#docPreview');
    if (!area) { NS.toast('افتح المعاينة أولاً', 'warn'); return; }

    const selectedMode = COPY_MODES[mode] ? mode : 'all';
    const fragment = buildCopyFragment(area, selectedMode);
    if (!fragment || !fragment.innerHTML.trim()) {
      NS.toast(selectedMode === 'recommendations' ? 'لا توجد توصيات لنسخها' : 'لا توجد معلومات لنسخها', 'warn');
      return;
    }

    const html = fragment.outerHTML;
    const text = (fragment.innerText || fragment.textContent || '').trim();
    const successMessage = COPY_MODES[selectedMode].success;

    /* نسخ HTML ونص عادي معاً للحفاظ على التنسيق عند اللصق في Word. */
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        });
        navigator.clipboard.write([item])
          .then(() => NS.toast(successMessage, 'ok'))
          .catch(() => fallbackCopy(html, text, successMessage));
        return;
      } catch (e) { /* ننتقل إلى الطريقة البديلة */ }
    }
    fallbackCopy(html, text, successMessage);
  }

  /* =========================================================================
     خطة بديلة: نحدّد محتوى المعاينة ثم ننفّذ أمر النسخ
     تعمل في المتصفحات التي لا تدعم ClipboardItem
     ========================================================================= */
  function fallbackCopy(html, text, successMessage = 'نُسخ التقرير بتنسيقه ✓') {
    let holder;
    try {
      holder = document.createElement('div');
      holder.contentEditable = 'true';
      holder.style.cssText = 'position:fixed;inset-inline-start:-99999px;top:0;opacity:0;pointer-events:none;';
      holder.innerHTML = html;
      document.body.appendChild(holder);

      const range = document.createRange();
      range.selectNodeContents(holder);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('copy');
      sel.removeAllRanges();
      holder.remove();
      holder = null;
      if (ok) { NS.toast(successMessage, 'ok'); return; }
    } catch (e) {
      if (holder) holder.remove();
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => NS.toast('نُسخ النص ✓', 'ok'))
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
