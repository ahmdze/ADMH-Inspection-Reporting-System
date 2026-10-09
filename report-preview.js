/* =============================================================================
   معاينة التقرير كـ HTML — report-preview.js
   =============================================================================
   يحوّل «نموذج التقرير» (من report-model.js) إلى HTML يُعرض في نافذة المعاينة.
   هذا هو المكان المناسب لتعديل الشكل: العناوين، الترتيب، الفواصل، الألوان.

   لتغيير التنسيق: عدّل وسوم HTML أدناه (h2 للعناوين، ul/ol للقوائم، p للفقرات).
   لتصميم المعاينة نفسها: عدّل الأصناف في index.html (class="doc").
   ============================================================================= */
'use strict';

window.ADMHReport = window.ADMHReport || {};
(function (NS) {
  /* =========================================================================
     أدوات مختصرة — كلها من النطاق المشترك الذي تُثبّته app.js
     ========================================================================= */
  const esc = s => window.ADMHReport.util.esc(s);                    /* تأمين النص قبل إدراجه في HTML */
  const buildModel = () => window.ADMHReport.buildModel();           /* نموذج التقرير من report-model.js */
  const $ = sel => document.querySelector(sel);                      /* اختصار للوصول إلى عنصر */
  const state = () => window.ADMHReport.getState();                  /* حالة التطبيق (لنوع الزيارة) */

  /* =========================================================================
     الدالة الرئيسية: ترسم المعاينة داخل الصفحة
     ========================================================================= */
function renderPreview() {
  const M = buildModel();
  const H = [];
  H.push('<div class="hdr">');
  if (M.header.logo) H.push(`<img class="logo" src="${esc(M.header.logo)}" alt="">`);
  [M.header.l1, M.header.l2, M.header.l3].filter(Boolean).forEach(l => H.push(`<div class="l">${esc(l)}</div>`));
  H.push(`<h1>${esc(M.title)}</h1>`);
  if (M.meta.length) H.push(`<div class="l">${M.meta.map(m => `<b>${esc(m[0])}:</b> ${esc(m[1])}`).join(' &nbsp;|&nbsp; ')}</div>`);
  H.push('</div>');
  H.push(`<p>${esc(M.intro)}</p>`);
  if (M.sections.some(s => s.heading === 'بيانات المؤسسة')) { /* already ordered */ }

  M.sections.forEach(s => {
    /* فاصل المحور: «المحور الإداري //» — فاصل مميّز، بلا خط تحته */
    if (s.type === 'axis') {
      H.push(`<h2 class="axis">${esc(s.heading)}</h2>`);
      return;
    }
    H.push(`<h2>${esc(s.heading)}</h2>`);
    if (s.type === 'kv') {
      (s.rows || []).forEach(r => H.push(`<p><b>${esc(r[0])}:</b> ${esc(r[1])}</p>`));
      (s.notes || []).forEach(n => H.push(`<p>${esc(n)}</p>`));
    } else if (s.type === 'list') {
      if (s.numbered === false) {
        s.items.forEach(i => H.push(`<p>${esc(i)}</p>`));
      } else {
        H.push('<ol>' + s.items.map(i => `<li>${esc(i)}</li>`).join('') + '</ol>');
      }
    } else if (s.type === 'positions') {
      s.blocks.forEach(b => {
        H.push(`<p>${esc(b.intro)}</p>`);
        b.cats.forEach(c => {
          H.push(`<p style="margin:6px 0 2px"><b>${esc(c.title)}:</b></p>`);
          H.push('<ul>' + c.items.map(i => `<li>${esc(i)}</li>`).join('') + '</ul>');
        });
      });
    } else if (s.type === 'recs') {
      s.groups.forEach(g => {
        const lbl = [g.letter ? g.letter + '/' : '', g.intro || g.label].filter(Boolean).join(' ');
        if (lbl) H.push(`<p><b>${esc(lbl.replace(/\/\s*$/, '/'))}</b></p>`);
        if (g.items.length) H.push('<ol>' + g.items.map(i => `<li>${esc(i)}</li>`).join('') + '</ol>');
      });
    }
  });

  if (M.signers.length) {
    H.push('<h2>فريق التفتيش</h2><div class="sign">');
    M.signers.forEach(s => H.push(`<div><b>${esc(s.name || '—')}</b><br>${esc(s.job || '')}${s.date ? '<br>' + esc(s.date) : ''}<br><br>التوقيع: ..................</div>`));
    H.push('</div>');
  }
  if (M.footerNote) H.push(`<p class="foot">${esc(M.footerNote)}</p>`);
  $('#docPreview').innerHTML = H.join('');
  /* سطر المعلومات أسفل العنوان: المؤسسة · التاريخ · نوع الزيارة */
  const r = (state() || {}).report || {};
  $('#previewMeta').textContent = [M.facility, M.visitDate, M.visitType || r.visitType].filter(Boolean).join(' · ');
}


  NS.renderPreview = renderPreview;

})(window.ADMHReport);
