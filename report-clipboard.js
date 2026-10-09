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
      while (node && (node.tagName !== 'H2' || node === recHeading)) {
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

    /* نبني نسخة **بأنماط مضمَّنة** لتحمل التنسيق معها أينما لُصقت.
       بلا هذا، يكون المنسوخ أصنافاً فقط ولا CSS خارج الموقع لتُطبّقها. */
    const built = buildStyledCopy(area, selectedMode);
    if (!built || !built.html.trim() || !built.text) {
      NS.toast(selectedMode === 'recommendations' ? 'لا توجد توصيات لنسخها' : 'لا توجد معلومات لنسخها', 'warn');
      return;
    }

    const html = built.html;
    const text = built.text;
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
     تنسيق مضمَّن قبل النسخ
     =========================================================================
     سبب المشكلة: ما نُسخه سابقاً كان **أصنافاً** فقط (class="doc"، <h2>)
     بلا أي أنماط. وعند اللصق خارج الموقع (Word، البريد، محرّر نصوص) لا يوجد
     ملف CSS ليُطبّقها — فيظهر النص مجرّداً بلا تنسيق.

     الحل: ننسخ **الأنماط المحسوبة** من المعاينة ونكتبها مضمَّنة في كل عنصر،
     فيحمل النص المنسوخ تنسيقه معه أينما لُصق.
     ========================================================================= */
  const STYLE_PROPS = [
    'fontWeight', 'fontStyle', 'textDecoration', 'fontSize', 'fontFamily',
    'color', 'backgroundColor', 'textAlign', 'direction',
    'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom',
    'borderBottom', 'borderTop', 'letterSpacing', 'lineHeight',
  ];

  /**
   * يكتب الأنماط المحسوبة مضمَّنة في عناصر الشجرة.
   * @param {Element} source العنصر الأصلي في المعاينة
   * @param {Element} target العنصر المقابل في الشجرة المنسوخة
   */
  function inlineStyles(source, target) {
    if (!source || !target) return;
    try {
      const cs = window.getComputedStyle(source);
      const css = [];

      STYLE_PROPS.forEach(prop => {
        const v = cs[prop];
        if (!v || v === 'normal' || v === 'auto' || v === 'none') return;
        /* نتجاهل الافتراضيات الطويلة بلا داعٍ */
        if (prop === 'fontFamily') {
          const first = String(v).split(',')[0].replace(/["']/g, '').trim();
          if (!first) return;
          css.push('font-family:' + first);
          return;
        }
        /* حدود سفلية صفرية لا داعي لها */
        if ((prop === 'borderBottom' || prop === 'borderTop') &&
            /0px|none/.test(String(v))) return;
        /* ألوان الخلفية الشفافة تُهمَل */
        if (prop === 'backgroundColor' &&
            /rgba?\(0,\s*0,\s*0,\s*0\)|transparent/.test(String(v))) return;
        const kebab = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        css.push(kebab + ':' + v);
      });

      /* النص العربي: نضمن الاتجاه والخط */
      css.push('direction:rtl');
      if (target.tagName === 'H1' || target.tagName === 'H2') css.push('font-weight:bold');

      if (css.length) target.setAttribute('style', css.join(';'));

      /* نُنزل في الشجرة بمقارنة المواضع */
      const sChildren = source.children, tChildren = target.children;
      const n = Math.min(sChildren.length, tChildren.length);
      for (let i = 0; i < n; i++) inlineStyles(sChildren[i], tChildren[i]);
    } catch (e) { /* الأنماط تحسين لا أكثر — نتجاهل أي عطل */ }
  }

  /**
   * يبني نسخة من الجزء المطلوب بأنماط مضمَّنة.
   * @returns {{html:string, text:string}|null}
   */
  function buildStyledCopy(area, mode) {
    const fragment = buildCopyFragment(area, mode);
    if (!fragment) return null;

    /* نُنسخ الأنماط من العناصر الأصلية إلى الشجرة المنسوخة.
       النوعان مختلفان (div للنسخ مقابل #docPreview الأصلي)، فنمرّر
       العنصر الأصلي كجذر للمقارنة. */
    const sourceRoot = (mode === 'recommendations')
      ? recSectionSource(area)
      : area;

    if (sourceRoot) {
      /* نُنسخ أنماط الجذر ثم أبنائه */
      inlineStyles(sourceRoot, fragment);
    }

    /* -----------------------------------------------------------------
       تثبيت تنسيق فاصل المحور صراحةً.
       -----------------------------------------------------------------
       الاعتماد على الأنماط المحسوبة وحدها لا يكفي هنا: فقاعدة
       `.doc h2.axis` قد لا تُحسب كما نتوقّع، فيُنسخ الفاصل بمحاذاة
       اليمين بدل الوسط. نُثبّتها مباشرةً على العنصر — والنتيجة مضمونة.
       ----------------------------------------------------------------- */
    try {
      const axisEls = fragment.querySelectorAll
        ? fragment.querySelectorAll('h2.axis') : [];
      Array.prototype.forEach.call(axisEls, el => {
        const cur = el.getAttribute('style') || '';
        el.setAttribute('style',
          cur + ';text-align:center;border-bottom:0;font-weight:bold;direction:rtl');
      });
    } catch (e) { /* تحسين لا أكثر */ }

    return {
      html: fragment.outerHTML,
      text: (fragment.innerText || fragment.textContent || '').trim(),
    };
  }

  /** يجد قسم التوصيات في المعاينة الأصلية (لمطابقة الشجرة المنسوخة) */
  function recSectionSource(area) {
    try {
      const h = Array.from(area.querySelectorAll('h2'))
        .find(x => x.textContent.trim() === 'التوصيات');
      return h ? h.parentElement : area;
    } catch (e) { return area; }
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
