/* =============================================================================
   طباعة التقرير — report-print.js
   =============================================================================
   يطبع التقرير في إطار خفي حتى لا تتأثر الصفحة نفسها بالتنسيق.
   هذا هو المكان لتعديل شكل الورقة: الهوامش، الخط، حجم الخط، اتجاه الصفحة.
   ============================================================================= */
'use strict';

window.ADMHReport = window.ADMHReport || {};
(function (NS) {
  /* =========================================================================
     أدوات مختصرة — كلها من النطاق المشترك الذي تُثبّته app.js
     ========================================================================= */
  const toast = (m, k, d) => window.ADMHReport.util.toast(m, k, d);  /* إشعار للمستخدم */
  const renderPreview = () => window.ADMHReport.renderPreview();     /* تحديث المعاينة قبل الطباعة */
  const $ = sel => document.querySelector(sel);                      /* اختصار للوصول إلى عنصر */
  /* =========================================================================
     تنسيقات ورقة الطباعة
     @page يضبط مقاس الورقة وهوامشها (A4 = 21×29.7 سم)
     ========================================================================= */
  const PRINT_CSS = `
    /* الورقة: مقاس A4 بهوامش 1.5 سم */
    @page { size: A4; margin: 1.5cm }

    /* الجسم: خط عربي مقروء واتجاه من اليمين إلى اليسار */
    body { font-family: 'Traditional Arabic','Segoe UI',Tahoma,sans-serif;
           direction: rtl; text-align: right; color: #000;
           line-height: 1.6; font-size: 12pt; margin: 0 }

    /* العناوين */
    h1 { font-size: 16pt; color: #004d40; margin: 4px 0 }
    h2 { font-size: 14pt; color: #004d40; border-bottom: 2px solid #00796b;
         padding-bottom: 3px; margin-top: 14px; page-break-after: avoid }

    /* الترويسة الرسمية */
    .hdr { text-align: center; border-bottom: 3px double #004d40;
           padding-bottom: 8px; margin-bottom: 12px }
    .hdr img { max-height: 80px; float: left }

    /* الجداول (إن وُجدت في المعاينة فقط) */
    table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 11pt }
    th, td { border: 1px solid #000; padding: 5px 7px; text-align: right; vertical-align: top }
    th { background: #00796b; color: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact }

    /* القوائم والفواصل */
    ul, ol { margin: 4px 0; padding-inline-start: 22px }
    li { margin: 3px 0; page-break-inside: avoid }

    /* التوقيعات */
    .sign { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px }
    .sign div { flex: 1 1 180px; border: 1px solid #98a6ae; border-radius: 6px;
                padding: 8px; text-align: center }

    /* أسفل الصفحة */
    .footer, .foot { margin-top: 20px; text-align: center; font-size: 9pt;
                     color: #555; border-top: 1px solid #ccc; padding-top: 6px }

    /* امنع قطع الأقسام بين صفحتين */
    .card, section { page-break-inside: avoid }
  `;

  /* =========================================================================
     طباعة التقرير
     ننشئ إطاراً خفياً، نكتب فيه التقرير، ثم نأمر المتصفح بالطباعة
     ========================================================================= */
  function printReport() {
    const area = document.querySelector('#docPreview');   /* منطقة المعاينة */
    if (!area) { NS.toast('افتح المعاينة أولاً', 'warn'); return; }
    NS.renderPreview();                                   /* نضمن أن المعاينة محدَّثة */

    const iframe = document.createElement('iframe');      /* إطار خفي للطباعة */
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();                                           /* نكتب صفحة الطباعة */
    doc.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
      + '<title>طباعة</title><style>' + PRINT_CSS + '</style></head><body>'
      + document.querySelector('#docPreview').innerHTML + '</body></html>');
    doc.close();

    /* ننتظر لحظة حتى يكتمل الرسم ثم نطبع */
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        NS.toast('تعذّرت الطباعة — استخدم Ctrl+P', 'warn');
      }
      setTimeout(() => iframe.remove(), 2000);            /* تنظيف الإطار */
    }, 400);
  }

  NS.printReport = printReport;
  NS.PRINT_CSS = PRINT_CSS;

})(window.ADMHReport);

/* =========================================================================
   تشغيل التطبيق — آخر خطوة بعد تحميل كل ملفات التقرير
   ========================================================================= */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.ADMHReport.boot());
} else {
  window.ADMHReport.boot();
}
