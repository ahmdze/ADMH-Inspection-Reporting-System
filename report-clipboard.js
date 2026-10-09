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
  function buildPlainText(M, mode = 'all') {
    const out = [];                                     /* مصفوفة الأسطر */
    const add = s => { if (s !== undefined && s !== null && String(s).trim()) out.push(String(s)); };
    const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };

    /* الأوضاع: all · without-header · without-header-recs · recommendations */
    const withHeader = (mode === 'all');
    const onlyRecs = (mode === 'recommendations');
    const skipRecs = (mode === 'without-header-recs');
    const REC = 'التوصيات';

    if (withHeader) {
      add(M.title);                                     /* عنوان التقرير */
      add('='.repeat(Math.min(60, (M.title || '').length + 4)));
      blank();
      (M.meta || []).forEach(m => add(m[0] + ': ' + m[1]));  /* البيانات العلوية */
      blank();
      add(M.intro);                                     /* المقدمة */
      blank();
    }

    (M.sections || []).forEach(s => {                   /* كل قسم من أقسام التقرير */
      const isRec = (s.heading === REC) || (s.type === 'recs');

      if (onlyRecs && !isRec) return;                   /* التوصيات فقط */
      if (skipRecs && isRec) return;                    /* دون التوصيات */

      /* فاصل المحور: «المحور الإداري //» — سطر مستقل بلا خط تحته */
      if (s.type === 'axis') {
        blank();
        add(s.heading);
        blank();
        return;
      }
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

    /* فريق التفتيش — يُستثنى في «التوصيات فقط» */
    if (!onlyRecs && (M.signers || []).length) {
      add('فريق التفتيش');
      M.signers.forEach(s => {
        add(s.name || '—');
        add([s.job, s.date].filter(Boolean).join(' — '));
        add('التوقيع: ..................................');
        blank();
      });
    }
    if (!onlyRecs && M.footerNote) add(M.footerNote);
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

  /* ملاحظة: أُزيل buildCopyFragment القديم.
     كان يقصّ شجرة المعاينة كـ HTML بأصناف CSS — وWord يتجاهلها فيُلصق
     النص عارياً. الآن يُبنى المنسوخ من نموذج التقرير مباشرةً بصيغة Word
     (انظر buildWordHtml و buildPlainText أدناه). */

  function copyReport(mode = 'all') {
    const area = $('#docPreview');
    if (!area) { NS.toast('افتح المعاينة أولاً', 'warn'); return; }

    const selectedMode = COPY_MODES[mode] ? mode : 'all';

    /* -----------------------------------------------------------------
       نبني HTML بصيغة Word من **نموذج التقرير** مباشرةً.
       -----------------------------------------------------------------
       لماذا لا من شجرة المعاينة؟ لأن Word يتجاهل أنماط CSS المحسوبة
       (بكسلات وأصناف)، فيُلصق النص عارياً — وهذا ما كان يحدث.
       الوسوم الدلالية والأنماط بصيغة Word (pt) هي ما يفهمه.
       ----------------------------------------------------------------- */
    let M = null;
    try {
      M = NS.buildModel();
    } catch (e) {
      NS.toast('تعذّر بناء التقرير للنسخ: ' + (e && e.message), 'err');
      return;
    }

    const html = buildWordHtml(M, selectedMode);

    /* نص عادي كخطة بديلة: سطور بسيطة بلا وسوم (لِما لا يدعم HTML) */
    const text = buildPlainText(M, selectedMode);

    /* نتحقق أن الوضع أنتج محتوى فعلاً */
    if (!html || html.length < 80 || !text) {
      NS.toast(selectedMode === 'recommendations' ? 'لا توجد توصيات لنسخها' : 'لا توجد معلومات لنسخها', 'warn');
      return;
    }
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
     بناء HTML متوافق مع Word
     =========================================================================
     سبب فشل التنسيق سابقاً: كنا ننسخ أنماط CSS المحسوبة من المعاينة
     (بكسلات، أصناف، خصائص حديثة). و**Word يتجاهل معظم CSS عند اللصق**،
     فلا يُبقي إلا النص. والدليل من ملف النتيجة: صفر عريض، صفر ألوان،
     صفر أحجام — فقرات نصّية بحتة.

     ما يفهمه Word فعلاً:
       · وسوم دلالية: <b> <strong> <h1> <h2> <p>
       · أنماط بصيغة Word: font-size:12.0pt · color:#004D40 · text-align
       · attr dir="rtl" للمحتوى العربي

     لذلك نبني HTML **من نموذج التقرير مباشرةً** بوسوم دلالية وأنماط
     بصيغة Word — لا من شجرة المعاينة. والنتيجة: التنسيق نفسه الذي ينتجه
     «تصدير وورد»، لكن عبر الحافظة.
     ========================================================================= */
  const WFONT = "Traditional Arabic, 'Segoe UI', Tahoma, sans-serif";

  /** تأمين النص لـ HTML */
  function hEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** فقرة بصيغة Word */
  function wP(text, o) {
    o = o || {};
    const st = [
      'margin:0 0 ' + (o.after == null ? 6 : o.after) + 'pt 0',
      'font-family:' + WFONT,
      'font-size:' + (o.pt || 12) + 'pt',
      'line-height:1.15',
      'color:' + (o.color || '#000000'),
      'text-align:' + (o.align || 'right'),
      'direction:rtl',
    ];
    if (o.bold) st.push('font-weight:bold');
    if (o.indent) st.push('margin-right:' + o.indent + 'pt');
    return '<p dir="rtl" style="' + st.join(';') + '">' + text + '</p>';
  }

  /** عنوان قسم بصيغة Word — حجم أكبر ولون التقرير */
  function wHeading(text, o) {
    o = o || {};
    return wP('<b>' + text + '</b>', {
      pt: o.pt || 14,
      bold: true,
      color: o.color || '#004D40',
      align: o.align || 'right',
      after: o.after == null ? 8 : o.after,
      indent: o.indent,
    });
  }

  /** بند مرقّم أو منقّط */
  function wItem(marker, text, indent) {
    const pad = indent == null ? 18 : indent;
    return '<p dir="rtl" style="margin:0 0 4pt 0;font-family:' + WFONT +
      ';font-size:12.0pt;line-height:1.15;color:#000000;text-align:right;direction:rtl;' +
      'margin-right:' + pad + 'pt;text-indent:-' + pad + 'pt">' +
      marker + '&nbsp;' + text + '</p>';
  }

  /**
   * يبني HTML التقرير بصيغة Word.
   * @param {object} M نموذج التقرير
   * @param {string} mode وضع النسخ
   */
  function buildWordHtml(M, mode) {
    const out = [];
    const REC_HEADING = 'التوصيات';
    const withHeader = (mode === 'all');
    const onlyRecs = (mode === 'recommendations');
    const skipRecs = (mode === 'without-header-recs');

    out.push('<div dir="rtl" lang="ar" style="font-family:' + WFONT +
      ';font-size:12.0pt;direction:rtl;text-align:right">');

    /* ---------- الترويسة: العنوان والبيانات العلوية ---------- */
    if (withHeader) {
      const hdr = [];
      [M.header && M.header.l1, M.header && M.header.l2, M.header && M.header.l3]
        .filter(Boolean).forEach(l => hdr.push(wP(hEsc(l), { pt: 11, color: '#555555', align: 'center', after: 2 })));
      if (M.title) hdr.push(wP('<b>' + hEsc(M.title) + '</b>', { pt: 16, bold: true, color: '#004D40', align: 'center', after: 6 }));
      if ((M.meta || []).length) {
        hdr.push(wP(M.meta.map(m => '<b>' + hEsc(m[0]) + ':</b> ' + hEsc(m[1])).join(' &nbsp;|&nbsp; '),
          { pt: 11, color: '#444444', align: 'center', after: 10 }));
      }
      out.push(hdr.join(''));
      /* المقدمة جزء من الترويسة (تأتي قبل الأقسام) */
      if (M.intro) out.push(wP(hEsc(M.intro), { pt: 12, align: 'justify', after: 10 }));
    }

    /* ---------- الأقسام ---------- */
    (M.sections || []).forEach(s => {
      const isRec = (s.heading === REC_HEADING) || (s.type === 'recs');

      /* فاصل المحور: مميّز، بلا خط، وسط الصفحة */
      if (s.type === 'axis') {
        out.push(wHeading(hEsc(s.heading), { pt: 15, align: 'center', after: 12 }));
        return;
      }
      if (onlyRecs && !isRec) return;          /* التوصيات فقط */
      if (skipRecs && isRec) return;           /* دون التوصيات */

      out.push(wHeading(hEsc(s.heading)));

      if (s.type === 'kv') {
        (s.rows || []).forEach(r => out.push(
          wP((r[0] ? '<b>' + hEsc(r[0]) + ':</b> ' : '') + hEsc(r[1]), { after: 3 })));
        (s.notes || []).forEach(n => out.push(wP(hEsc(n), { after: 3 })));
      } else if (s.type === 'list') {
        s.items.forEach((it, i) => out.push(
          s.numbered === false
            ? wP(hEsc(it), { after: 3 })
            : wItem((i + 1) + '-', hEsc(it))));
      } else if (s.type === 'positions') {
        s.blocks.forEach(b => {
          if (b.intro) out.push(wP(hEsc(b.intro), { after: 4 }));
          b.cats.forEach(c => {
            out.push(wP('<b>' + hEsc(c.title) + ':</b>', { after: 3 }));
            c.items.forEach(it => out.push(wItem('•', hEsc(it), 26)));
          });
        });
      } else if (s.type === 'recs') {
        s.groups.forEach(g => {
          const lbl = [g.letter ? g.letter + '/' : '', g.intro || g.label].filter(Boolean).join(' ');
          if (lbl) out.push(wP('<b>' + hEsc(lbl.replace(/\/\s*$/, '/')) + '</b>', { bold: true, after: 4 }));
          g.items.forEach((it, i) => out.push(wItem((i + 1) + '-', hEsc(it))));
        });
      }
    });

    /* ---------- فريق التفتيش (يُستثنى في «التوصيات فقط») ---------- */
    if (!onlyRecs && (M.signers || []).length) {
      out.push(wHeading('فريق التفتيش'));
      M.signers.forEach(s => {
        out.push(wP('<b>' + hEsc(s.name || '—') + '</b>', { after: 2 }));
        const sub = [s.job, s.date].filter(Boolean).join(' — ');
        if (sub) out.push(wP(hEsc(sub), { pt: 11, color: '#555555', after: 2 }));
        out.push(wP('التوقيع: ..................................', { pt: 11, color: '#444444', after: 10 }));
      });
    }
    if (!onlyRecs && M.footerNote) {
      out.push(wP(hEsc(M.footerNote), { pt: 11, color: '#555555', align: 'center', after: 4 }));
    }

    out.push('</div>');
    return out.join('');
  }


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
