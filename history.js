/* =============================================================================
   سجل التعديلات واستعادة النسخ — history.js
   =============================================================================
   يحفظ «لقطات» من التقرير كلما تغيّر تغيّراً معتبراً، ويتيح استعادة أي لقطة.

   القرارات المهمة:
     · **لا نخزّن كل ضغطة مفتاح.** هذا يُتلف مساحة التخزين بلا فائدة. نحفظ
       لقطة واحدة كل فترة (`MIN_GAP_MS`) وعند الأحداث المهمة (حفظ/جلب توصيات).
     · **حدّ أعلى للّقطات لكل تقرير** (`MAX_PER_REPORT`)، فالأقدم يُسقط.
     · **اللقطة نسخة عميقة** — فلا تتغيّر بتغيّر التقرير الأصلي.
     · **لا تُحفظ اللقطة إن كانت مطابقة للسابقة** (بصمة نصية) — فلا سجل مكرّر.

   لا يعتمد على DOM ولا على التخزين — منطق خالص قابل للاختبار.
   ============================================================================= */
'use strict';

window.ADMHReport = window.ADMHReport || {};
(function (NS) {

  /** أقصى عدد لقطات محفوظة لكل تقرير */
  const MAX_PER_REPORT = 30;
  /** أقصى عدد تقارير لها سجل (حماية لمساحة التخزين) */
  const MAX_REPORTS = 120;
  /** أقل فاصل زمني بين لقطتين تلقائيتين (ملّي ثانية) */
  const MIN_GAP_MS = 45000;
  /** أقصى عمر للسجل بالأيام — ما بعده يُهمَل */
  const MAX_AGE_DAYS = 180;

  /** نسخة عميقة آمنة — لا تعتمد على structuredClone (غير متوفّر في كل مكان) */
  function deepCopy(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  /**
   * بصمة نصية مستقرة لكائن.
   * نُرتّب المفاتيح لأن ترتيبها قد يختلف بين نسختين متطابقتين معنوياً.
   */
  function fingerprint(obj) {
    return hash32(stableStringify(obj));
  }

  /** تحويل نصي بمفاتيح مرتّبة */
  function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) || '';
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }

  /** بصمة عددية (FNV-1a) — نفس الخوارزمية في registry.js */
  function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36).toUpperCase();
  }

  /** بنية سجل فارغة */
  function blankHistory() {
    return { reports: {}, version: 1 };
  }

  /** يضمن سلامة البنية مهما كانت البيانات قادمة من التخزين */
  function normalize(raw) {
    const out = blankHistory();
    if (!raw || typeof raw !== 'object' || !raw.reports || typeof raw.reports !== 'object') return out;
    Object.keys(raw.reports).forEach(id => {
      const list = raw.reports[id];
      if (!Array.isArray(list)) return;
      out.reports[id] = list
        .filter(e => e && typeof e === 'object' && e.snapshot)
        .map(e => ({
          id: typeof e.id === 'string' ? e.id : hash32(id + (e.at || '')),
          at: typeof e.at === 'string' ? e.at : new Date().toISOString(),
          reason: typeof e.reason === 'string' ? e.reason : '',
          title: typeof e.title === 'string' ? e.title : '',
          facility: typeof e.facility === 'string' ? e.facility : '',
          fp: typeof e.fp === 'string' ? e.fp : '',
          snapshot: e.snapshot,
        }))
        .slice(0, MAX_PER_REPORT);
    });
    return out;
  }

  /**
   * هل تستحق اللقطة أن تُحفظ؟
   * @param {object} hist السجل
   * @param {object} report التقرير الحالي
   * @param {object} [opts] { reason, force, now }
   */
  function shouldRecord(hist, report, opts) {
    opts = opts || {};
    if (!report || !report.id) return false;

    const list = (hist.reports && hist.reports[report.id]) || [];
    const fp = fingerprint(report);

    /* لا تكرار: نفس المحتوى لا يُسجَّل مرتين */
    if (list.length && list[0].fp === fp) return false;

    /* الأحداث المهمة تتجاوز الفاصل الزمني */
    if (opts.force) return true;

    /* الحدّ الزمني للّقطات التلقائية */
    if (list.length) {
      const last = Date.parse(list[0].at || 0) || 0;
      const now = (opts.now instanceof Date ? opts.now : new Date()).getTime();
      if (now - last < MIN_GAP_MS) return false;
    }
    return true;
  }

  /**
   * يسجّل لقطة جديدة. يُعيد السجل محدَّثاً.
   * @param {object} hist
   * @param {object} report
   * @param {object} [opts] { reason, force, now, limit }
   */
  function record(hist, report, opts) {
    opts = opts || {};
    /* سجل غير صالح: نُعيد بنية صالحة بدل null، حتى لا ينكسر المستدعي */
    if (!hist || typeof hist !== 'object') hist = blankHistory();
    if (!hist.reports || typeof hist.reports !== 'object') hist.reports = {};
    if (!shouldRecord(hist, report, opts)) return hist;

    const id = report.id;
    const at = (opts.now instanceof Date ? opts.now : new Date()).toISOString();
    const list = hist.reports[id] || [];

    list.unshift({
      id: hash32(id + at + fingerprint(report)),
      at: at,
      reason: opts.reason || 'تعديل',
      title: String(report.title || '').slice(0, 160),
      facility: String(report.facilityName || '').slice(0, 120),
      fp: fingerprint(report),
      snapshot: deepCopy(report),
    });

    hist.reports[id] = list.slice(0, opts.limit || MAX_PER_REPORT);
    return hist;
  }

  /** لقطات تقرير — الأحدث أولاً */
  function listFor(hist, reportId) {
    if (!hist || !hist.reports || !reportId) return [];
    return hist.reports[reportId] || [];
  }

  /** يجد لقطة بالمعرّف */
  function findEntry(hist, reportId, entryId) {
    return listFor(hist, reportId).find(e => e.id === entryId) || null;
  }

  /**
   * نسخة مستقلة من لقطة (لا تُعدَّل الأصل).
   * @returns {object|null} تقرير جاهز للاستعادة
   */
  function snapshotOf(hist, reportId, entryId) {
    const e = findEntry(hist, reportId, entryId);
    return e ? deepCopy(e.snapshot) : null;
  }

  /** يحذف سجل تقرير (عند حذف التقرير نفسه) */
  function dropReport(hist, reportId) {
    if (hist && hist.reports && hist.reports[reportId]) {
      delete hist.reports[reportId];
      return true;
    }
    return false;
  }

  /** عدد اللقطات في كل السجل */
  function count(hist) {
    if (!hist || !hist.reports) return 0;
    return Object.keys(hist.reports).reduce((n, k) => n + (hist.reports[k] || []).length, 0);
  }

  /**
   * يُقلّص السجل: حدّ أعمار + حدّ عدد تقارير.
   * يُستدعى عند الإقلاع وعند الحفظ.
   * @param {object} hist
   * @param {object} [opts] { now, maxAgeDays, maxReports }
   */
  function prune(hist, opts) {
    opts = opts || {};
    /* نُعيد دائماً بنية صالحة — فالمستدعي يخزّن الناتج مباشرةً */
    if (!hist || typeof hist !== 'object') return blankHistory();
    if (!hist.reports || typeof hist.reports !== 'object') { hist.reports = {}; return hist; }
    const now = (opts.now instanceof Date ? opts.now : new Date()).getTime();
    const maxAge = (opts.maxAgeDays == null ? MAX_AGE_DAYS : opts.maxAgeDays) * 86400000;

    /* ١) احذف اللقطات الأقدم من الحدّ */
    Object.keys(hist.reports).forEach(id => {
      hist.reports[id] = (hist.reports[id] || []).filter(e => {
        const t = Date.parse(e.at || 0);
        return isNaN(t) ? false : (now - t) <= maxAge;
      });
      if (!hist.reports[id].length) delete hist.reports[id];
    });

    /* ٢) احتفظ بأحدث N تقرير فقط */
    const ids = Object.keys(hist.reports);
    if (ids.length > (opts.maxReports || MAX_REPORTS)) {
      ids.sort((a, b) => {
        const ta = Date.parse((hist.reports[a][0] || {}).at || 0) || 0;
        const tb = Date.parse((hist.reports[b][0] || {}).at || 0) || 0;
        return tb - ta;
      });
      ids.slice(opts.maxReports || MAX_REPORTS).forEach(id => delete hist.reports[id]);
    }
    return hist;
  }

  /**
   * يقارن لقطة بالتقرير الحالي ويصف الفرق بالعربية.
   * @returns {Array<{label:string, before:string, after:string}>}
   */
  function diff(a, b) {
    if (!a || !b) return [];
    const out = [];
    const t = v => String(v == null ? '' : v).trim();

    /** حقول بسيطة تُقارن كنصوص */
    const simple = [
      ['title', 'العنوان'],
      ['facilityName', 'اسم المؤسسة'],
      ['sector', 'القطاع'],
      ['visitType', 'نوع الزيارة'],
      ['visitDate', 'تاريخ الزيارة'],
      ['bookNumber', 'رقم الكتاب'],
      ['population', 'عدد النفوس'],
      ['families', 'عدد العوائل'],
      ['footerNote', 'ملاحظة أسفل التقرير'],
    ];
    simple.forEach(([k, label]) => {
      if (t(a[k]) !== t(b[k])) out.push({ label: label, before: t(a[k]), after: t(b[k]) });
    });

    /** مصفوفات: نقارن العدد ونذكر ما أُضيف أو حُذف إجمالاً */
    const arrays = [
      ['officials', 'المسؤولون'],
      ['procedures', 'الإجراءات'],
      ['general', 'الملاحظات العامة'],
      ['positions', 'مواقف البصمة'],
      ['records', 'السجلات'],
      ['recGroups', 'التوصيات'],
      ['prevRecs', 'التوصيات السابقة'],
      ['signers', 'فريق التفتيش'],
    ];
    arrays.forEach(([k, label]) => {
      const na = (a[k] || []).length, nb = (b[k] || []).length;
      if (na !== nb) out.push({ label: label, before: na + ' صف', after: nb + ' صف' });
    });

    return out;
  }

  NS.history = {
    MAX_PER_REPORT: MAX_PER_REPORT,
    MIN_GAP_MS: MIN_GAP_MS,
    blankHistory: blankHistory,
    normalize: normalize,
    fingerprint: fingerprint,
    stableStringify: stableStringify,
    shouldRecord: shouldRecord,
    record: record,
    listFor: listFor,
    findEntry: findEntry,
    snapshotOf: snapshotOf,
    dropReport: dropReport,
    count: count,
    prune: prune,
    diff: diff,
    deepCopy: deepCopy,
  };

})(window.ADMHReport);
