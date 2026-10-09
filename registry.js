/* =============================================================================
   سجل المؤسسات ودورة حياة التوصيات — registry.js
   =============================================================================
   هذا الملف يبني ثلاث طبقات فوق التقارير المحفوظة:

     ١) سجل المؤسسات  — ملف لكل مؤسسة صحية يضمّ زياراتها وتوصياتها.
     ٢) دورة حياة التوصيات — حالة كل توصية وموعدها ودليل معالجتها.
     ٣) حساب المؤشرات — أرقام لوحة المؤشرات، محسوبة من بيانات منظّمة.

   لا يعرض شيئاً ولا يصدّر ملفات — يبني البيانات فقط، مثل report-model.js.
   ولهذا يمكن اختباره وحده بلا متصفح.
   ============================================================================= */
'use strict';

window.ADMHReport = window.ADMHReport || {};
(function (NS) {

  /* =========================================================================
     الثوابت
     ========================================================================= */

  /** حالات تنفيذ التوصية — ثابتة لأن كل الحسابات تعتمد عليها */
  const STATUSES = [
    { k: 'pending',   t: 'لم تبدأ',        closed: false, color: '#b3261e' },
    { k: 'progress',  t: 'قيد التنفيذ',    closed: false, color: '#b26a00' },
    { k: 'done',      t: 'منفذة',          closed: true,  color: '#1b7f3b' },
    { k: 'failed',    t: 'غير منفذة',      closed: false, color: '#8e0000' },
    { k: 'verify',    t: 'تحتاج تحقق',     closed: false, color: '#00658f' },
  ];
  const STATUS_BY_KEY = {};
  STATUSES.forEach(s => { STATUS_BY_KEY[s.k] = s; });

  /** يرجع تعريف الحالة، و«لم تبدأ» هي الافتراضية */
  function statusOf(k) { return STATUS_BY_KEY[k] || STATUS_BY_KEY.pending; }
  /** هل الحالة تعني أن التوصية أُغلقت؟ */
  function isClosed(k) { return !!statusOf(k).closed; }

  /* =========================================================================
     أدوات نصية
     ========================================================================= */

  const tidy = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /**
   * تنظيف **صارم**: يقبل النصوص فقط، وأي نوع آخر يصير ''.
   * ضروري عند قراءة بيانات قادمة من التخزين أو المزامنة، حيث قد يصل رقم
   * أو كائن مكان نص — فلو مرّرناه لـString() لصار نصاً مضلِّلاً مثل «123».
   */
  function tidyStr(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/\s+/g, ' ').trim();
  }

  /**
   * مفتاح ثابت للمؤسسة — يُستخدم لربط الزيارات بمؤسسة واحدة.
   * نُوحّد الهمزات والألف المقصورة والتشكيل والمسافات، لأن المستخدم قد
   * يكتب «مركز صحي الخناسة» و«مركز صحي الخناسه» في زيارتين مختلفتين.
   */
  function facilityKey(name, sector) {
    const norm = s => tidy(s)
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')   /* التشكيل والتطويل */
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\u0621-\u064A0-9a-zA-Z]+/g, ' ')
      .trim()
      .toLowerCase();
    const n = norm(name);
    const s = norm(sector);
    return (n + (s ? '|' + s : '')) || '';
  }

  /** معرّف فريد قصير للتوصية */
  function recId(facKey, idx, text) {
    /* معرّف ثابت مشتق من المؤسسة والنص — فلا يتغيّر بين المزامنات
       إلا إذا تغيّر النص فعلاً */
    const h = hash32((facKey || '') + '#' + String(idx) + '#' + tidy(text));
    return 'R' + h;
  }

  /** بصمة عددية بسيطة وثابتة (FNV-1a) */
  function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36).toUpperCase();
  }

  /* =========================================================================
     بنية البيانات
     ========================================================================= */

  function blankRegistry() {
    return { facilities: {}, recs: {}, version: 1 };
  }

  /** يضمن سلامة البنية مهما كانت البيانات قادمة من نسخة أقدم */
  function normalizeRegistry(raw) {
    const out = blankRegistry();
    if (!raw || typeof raw !== 'object') return out;
    if (raw.facilities && typeof raw.facilities === 'object') {
      Object.keys(raw.facilities).forEach(k => {
        const f = raw.facilities[k] || {};
        out.facilities[k] = {
          key: k,
          name: tidyStr(f.name),
          sector: tidyStr(f.sector),
          kind: tidyStr(f.kind),
          notes: tidyStr(f.notes),
          firstVisit: f.firstVisit || null,
          lastVisit: f.lastVisit || null,
          updatedAt: f.updatedAt || null,
        };
      });
    }
    if (raw.recs && typeof raw.recs === 'object') {
      Object.keys(raw.recs).forEach(k => {
        const r = raw.recs[k] || {};
        out.recs[k] = {
          id: k,
          facilityKey: tidyStr(r.facilityKey),
          text: tidyStr(r.text),
          sourceReportId: tidyStr(r.sourceReportId),
          visitDate: r.visitDate || null,
          dueDate: r.dueDate || null,
          owner: tidyStr(r.owner),
          status: STATUS_BY_KEY[r.status] ? r.status : 'pending',
          note: tidyStr(r.note),
          evidence: tidyStr(r.evidence),
          verifiedAt: r.verifiedAt || null,
          updatedAt: r.updatedAt || null,
          manual: !!r.manual,
        };
      });
    }
    return out;
  }

  /* =========================================================================
     ١) سجل المؤسسات
     ========================================================================= */

  /**
   * يبني فهرس المؤسسات من التقارير المحفوظة، مع دمج أسماء بديلة إن وُجدت.
   * @param {Array} reports التقارير المحفوظة
   */
  function buildFacilities(reports) {
    const list = Array.isArray(reports) ? reports : [];
    const map = {};

    list.forEach(r => {
      if (!r) return;
      const key = facilityKey(r.facilityName, r.sector);
      if (!key) return;
      const entry = map[key] || {
        key: key,
        name: tidy(r.facilityName),
        sector: tidy(r.sector),
        kind: tidy(r.facilityKind),
        notes: '',
        visits: [],
        firstVisit: null,
        lastVisit: null,
        recCount: 0,
        openCount: 0,
      };
      const d = r.visitDate || r.createdAt || null;
      entry.visits.push({
        id: r.id,
        title: tidy(r.title),
        visitType: tidy(r.visitType),
        date: d,
        updatedAt: r.updatedAt || null,
        bookNumber: tidy(r.bookNumber),
      });
      if (d) {
        if (!entry.firstVisit || d < entry.firstVisit) entry.firstVisit = d;
        if (!entry.lastVisit || d > entry.lastVisit) entry.lastVisit = d;
      }
      /* نُحدّث الاسم بأحدث تهجئة */
      entry.name = tidy(r.facilityName) || entry.name;
      entry.sector = tidy(r.sector) || entry.sector;
      entry.kind = tidy(r.facilityKind) || entry.kind;
      map[key] = entry;
    });

    /* ترتيب الزيارات: الأحدث أولاً */
    Object.keys(map).forEach(k => {
      map[k].visits.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    });
    return map;
  }

  /* =========================================================================
     ٢) دورة حياة التوصيات
     ========================================================================= */

  /**
   * يستخرج التوصيات من تقرير واحد.
   * @param {object} r التقرير
   * @returns {Array} توصيات بمعرّفات ثابتة
   */
  function recsFromReport(r) {
    if (!r) return [];
    const facKey = facilityKey(r.facilityName, r.sector);
    const out = [];
    let idx = 0;
    (r.recGroups || []).forEach(g => {
      const label = tidy(g.label);
      (g.items || []).forEach(it => {
        const text = tidy(it);
        if (!text) return;
        idx += 1;
        out.push({
          id: recId(facKey, idx, text),
          facilityKey: facKey,
          text: text,
          label: label,
          groupLetter: tidy(g.letter),
          sourceReportId: tidy(r.id),
          visitDate: r.visitDate || r.createdAt || null,
          dueDate: null,
          owner: label,
          status: 'pending',
          note: '',
          evidence: '',
          verifiedAt: null,
          updatedAt: null,
          manual: false,
        });
      });
    });
    return out;
  }

  /**
   * يدمج توصيات كل التقارير في سجل واحد، **محفوظاً فيه حالات المستخدم**.
   * القاعدة: النص القادم من التقرير يحدّث الوصف، وحالة المستخدم لا تُمحى.
   * @param {Array} reports
   * @param {object} existing السجل السابق (لتُحفظ الحالات والتعديلات)
   */
  function buildRecs(reports, existing) {
    const prev = (existing && existing.recs) ? existing.recs : {};
    const out = {};
    const seen = {};

    (Array.isArray(reports) ? reports : []).forEach(r => {
      recsFromReport(r).forEach(fresh => {
        seen[fresh.id] = true;
        const old = prev[fresh.id];
        if (old) {
          /* نحفظ ما عدّله المستخدم، ونُحدّث ما جاء من التقرير */
          out[fresh.id] = Object.assign({}, fresh, {
            status: old.status || fresh.status,
            note: old.note || '',
            evidence: old.evidence || '',
            dueDate: old.dueDate || fresh.dueDate,
            owner: old.owner || fresh.owner,
            verifiedAt: old.verifiedAt || null,
            updatedAt: old.updatedAt || null,
            manual: !!old.manual,
          });
        } else {
          out[fresh.id] = fresh;
        }
      });
    });

    /* التوصيات اليدوية (أضافها المستخدم بلا تقرير) تبقى دائماً */
    Object.keys(prev).forEach(id => {
      if (!seen[id] && prev[id] && prev[id].manual) out[id] = prev[id];
    });

    return out;
  }

  /**
   * يحدّث توصية واحدة. أي تعديل يختم updatedAt ليُزامَن.
   * @param {object} registry
   * @param {string} id
   * @param {object} patch الحقول المتغيّرة
   */
  function updateRec(registry, id, patch) {
    if (!registry || !registry.recs || !registry.recs[id]) return false;
    const rec = registry.recs[id];
    Object.keys(patch || {}).forEach(k => {
      if (k === 'id' || k === 'facilityKey') return;   /* لا تُعدَّل */
      rec[k] = patch[k];
    });
    rec.updatedAt = new Date().toISOString();
    /* عند وضع حالة «منفذة» بلا تاريخ تحقق، نسجّل التاريخ تلقائياً */
    if (rec.status === 'done' && !rec.verifiedAt) rec.verifiedAt = rec.updatedAt;
    if (rec.status !== 'done') rec.verifiedAt = rec.verifiedAt || null;
    return true;
  }

  /** يضيف توصية يدوية (بلا تقرير) */
  function addManualRec(registry, facKey, text, owner) {
    const txt = tidy(text);
    if (!txt) return null;
    const id = recId(facKey, 'M' + Object.keys(registry.recs).length, txt);
    registry.recs[id] = {
      id: id, facilityKey: facKey || '', text: txt,
      sourceReportId: '', visitDate: new Date().toISOString().slice(0, 10),
      dueDate: null, owner: tidy(owner), status: 'pending',
      note: '', evidence: '', verifiedAt: null,
      updatedAt: new Date().toISOString(), manual: true,
    };
    return id;
  }

  /** يحذف توصية (اليدوية فقط — توصيات التقارير تُحذف بحذف التقرير) */
  function removeRec(registry, id) {
    const rec = registry && registry.recs && registry.recs[id];
    if (!rec) return false;
    if (!rec.manual) return false;      /* ليست يدوية: لا تُحذف من هنا */
    delete registry.recs[id];
    return true;
  }

  /* =========================================================================
     التوصيات المتأخرة
     ========================================================================= */

  /**
   * هل التوصية متأخرة؟ (لها موعد إنجاز مضى ولم تُغلق)
   * @param {object} rec
   * @param {Date} [now] لتسهيل الاختبار
   */
  function isOverdue(rec, now) {
    if (!rec || isClosed(rec.status)) return false;
    if (!rec.dueDate) return false;
    const due = Date.parse(rec.dueDate);
    if (isNaN(due)) return false;
    return due < (now ? now.getTime() : Date.now());
  }

  /** عدد الأيام المتأخرة (٠ إن لم تكن متأخرة) */
  function daysOverdue(rec, now) {
    if (!isOverdue(rec, now)) return 0;
    const due = Date.parse(rec.dueDate);
    const ref = now ? now.getTime() : Date.now();
    return Math.max(0, Math.floor((ref - due) / 86400000));
  }

  /* =========================================================================
     ٣) المؤشرات
     ========================================================================= */

  /**
   * يحسب مؤشرات لوحة المؤشرات من بيانات منظّمة.
   * @param {Array} reports التقارير
   * @param {object} registry السجل
   * @param {object} [opts] { from, to, sector, kind, now }
   */
  function computeMetrics(reports, registry, opts) {
    opts = opts || {};
    const list = Array.isArray(reports) ? reports : [];
    const reg = normalizeRegistry(registry);
    const now = opts.now instanceof Date ? opts.now : new Date();
    const from = opts.from ? Date.parse(opts.from) : null;
    const to = opts.to ? Date.parse(opts.to) : null;

    /* ---------- الزيارات داخل الفترة ---------- */
    const inRange = list.filter(r => {
      if (!r) return false;
      const d = Date.parse(r.visitDate || r.createdAt || '');
      if (isNaN(d)) return (!from && !to);
      if (from != null && d < from) return false;
      if (to != null && d > to + 86399999) return false;      /* نهاية اليوم */
      return true;
    });

    const byType = {};
    const bySector = {};
    const facilitySet = {};
    inRange.forEach(r => {
      const t = tidy(r.visitType) || 'غير محدّد';
      byType[t] = (byType[t] || 0) + 1;
      const s = tidy(r.sector) || 'غير محدّد';
      bySector[s] = (bySector[s] || 0) + 1;
      const k = facilityKey(r.facilityName, r.sector);
      if (k) facilitySet[k] = true;
    });

    /* ---------- التوصيات ---------- */
    const allRecs = Object.keys(reg.recs).map(k => reg.recs[k]);
    const recsInRange = opts.ignoreRange ? allRecs : allRecs.filter(rec => {
      if (!from && !to) return true;
      const d = Date.parse(rec.visitDate || '');
      if (isNaN(d)) return true;
      if (from != null && d < from) return false;
      if (to != null && d > to + 86399999) return false;
      return true;
    });

    const statusCounts = {};
    STATUSES.forEach(s => { statusCounts[s.k] = 0; });
    let overdue = 0;
    recsInRange.forEach(rec => {
      const k = STATUS_BY_KEY[rec.status] ? rec.status : 'pending';
      statusCounts[k] = (statusCounts[k] || 0) + 1;
      if (isOverdue(rec, now)) overdue += 1;
    });

    const totalRecs = recsInRange.length;
    const closedRecs = recsInRange.filter(rec => isClosed(rec.status)).length;
    const closureRate = totalRecs ? Math.round((closedRecs / totalRecs) * 100) : 0;

    /* ---------- الملاحظات الإدارية الأكثر تكراراً ---------- */
    const noteCount = {};
    inRange.forEach(r => {
      (r.records || []).forEach(x => {
        const ev = tidy(x.eval) || tidy(x.evalManual);
        if (!ev) return;
        const name = tidy(x.name) || 'سجل';
        const key = name + ' — ' + ev;
        noteCount[key] = (noteCount[key] || 0) + 1;
      });
    });
    const topNotes = Object.keys(noteCount)
      .map(k => ({ text: k, count: noteCount[k] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    /* ---------- المؤسسات التي تكرّرت فيها الملاحظات ---------- */
    const facNotes = {};
    inRange.forEach(r => {
      const k = facilityKey(r.facilityName, r.sector);
      if (!k) return;
      facNotes[k] = facNotes[k] || { key: k, name: tidy(r.facilityName), sector: tidy(r.sector), visits: 0, recs: 0, open: 0, overdue: 0 };
      facNotes[k].visits += 1;
    });
    allRecs.forEach(rec => {
      const f = facNotes[rec.facilityKey];
      if (!f) return;
      f.recs += 1;
      if (!isClosed(rec.status)) f.open += 1;
      if (isOverdue(rec, now)) f.overdue += 1;
    });
    const facilities = Object.keys(facNotes).map(k => facNotes[k])
      .sort((a, b) => (b.overdue - a.overdue) || (b.open - a.open) || (b.visits - a.visits));

    /* ---------- مقارنة أولية بمتابعة ---------- */
    const initial = inRange.filter(r => /تفتيش/.test(tidy(r.visitType))).length;
    const followUp = inRange.filter(r => /متابعة/.test(tidy(r.visitType))).length;

    /* ---------- ملفات المؤسسات ---------- */
    const facilitiesIndex = buildFacilities(list);

    return {
      range: { from: opts.from || null, to: opts.to || null },
      visits: inRange.length,
      facilitiesVisited: Object.keys(facilitySet).length,
      facilitiesTotal: Object.keys(facilitiesIndex).length,
      byType: byType,
      bySector: bySector,
      initialVisits: initial,
      followUpVisits: followUp,
      recs: {
        total: totalRecs,
        closed: closedRecs,
        open: totalRecs - closedRecs,
        overdue: overdue,
        closureRate: closureRate,
        byStatus: statusCounts,
      },
      topNotes: topNotes,
      facilities: facilities,
    };
  }

  /* =========================================================================
     التصدير
     ========================================================================= */

  NS.registry = {
    /* ثوابت */
    STATUSES: STATUSES,
    statusOf: statusOf,
    isClosed: isClosed,
    /* أدوات */
    facilityKey: facilityKey,
    recId: recId,
    hash32: hash32,
    tidy: tidy,
    tidyStr: tidyStr,
    /* بنية */
    blankRegistry: blankRegistry,
    normalizeRegistry: normalizeRegistry,
    /* مؤسسات */
    buildFacilities: buildFacilities,
    /* توصيات */
    recsFromReport: recsFromReport,
    buildRecs: buildRecs,
    updateRec: updateRec,
    addManualRec: addManualRec,
    removeRec: removeRec,
    isOverdue: isOverdue,
    daysOverdue: daysOverdue,
    /* مؤشرات */
    computeMetrics: computeMetrics,
  };

})(window.ADMHReport);
