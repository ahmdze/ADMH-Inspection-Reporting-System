/* =============================================================================
   بناء نموذج التقرير — report-model.js
   =============================================================================
   هذا الملف يُحوّل ما كتبتَه في النموذج إلى «نموذج بيانات» منظّم، ثم تستهلكه
   بقية الملفات: المعاينة، النسخ، Word، والطباعة.

   لا يعرض هذا الملف شيئاً ولا يصدّر ملفات — يبني البيانات فقط.
   كل تعليق يشرح الأمر الذي فوقه.
   ============================================================================= */
'use strict';

/* النطاق المشترك: تُثبّته app.js أولاً ويحمل الأدوات والحالة */
window.ADMHReport = window.ADMHReport || {};
(function (NS) {
  /* =========================================================================
     أدوات مختصرة — كلها من النطاق المشترك الذي تُثبّته app.js
     ========================================================================= */
  const esc = s => window.ADMHReport.util.esc(s);                    /* تأمين النص قبل إدراجه في HTML */
  const tidy = s => window.ADMHReport.util.tidy(s);                  /* تنظيف المسافات والترقيم */
  const fmtDate = iso => window.ADMHReport.util.fmtDate(iso);        /* تحويل التاريخ إلى يوم/شهر/سنة */
  const dayNameOf = iso => window.ADMHReport.util.dayNameOf(iso);    /* اسم اليوم من التاريخ */
  const fmtNum = n => window.ADMHReport.util.fmtNum(n);              /* رقم نظيف للعرض في Word */
  const normalizeDigits = v => window.ADMHReport.util.normalizeDigits(v); /* توحيد الأرقام العربية */
  const autoTitle = r => window.ADMHReport.util.autoTitle(r);        /* توليد عنوان التقرير تلقائياً */
  const titleName = r => window.ADMHReport.util.titleName(r);        /* اسم التقرير المختصر */
  const positionCats = () => window.ADMHReport.util.positionCats();  /* فئات المواقف الخمس */
  const state = () => window.ADMHReport.getState();                  /* حالة التطبيق: التقرير والإعدادات */
  /* =========================================================================
     أدوات مختصرة — كلها من النطاق المشترك الذي تُثبّته app.js
     ========================================================================= */                  /* حالة التطبيق: التقرير والإعدادات */

  /* =========================================================================
     الدالة الرئيسية: تبني نموذج التقرير بالكامل
     تُعيد كائناً فيه: العنوان، الترويسة، البيانات العلوية، المقدمة، والأقسام
     ========================================================================= */
function buildModel() {
  const st = state();         /* حالة التطبيق: التقرير والإعدادات */
  const r = st.report;
  const t = tidy;
  const fac = t(r.facilityName) || '...';
  const sec = t(r.sector);
  const kind = t(r.facilityKind) || 'مركز صحي';
  const dstr = fmtDate(r.visitDate);
  const day = t(r.dayName) || dayNameOf(r.visitDate);

  const sub = (s) => s.replace(/\{المؤسسة\}/g, fac).replace(/\{القطاع\}/g, sec || 'القطاع');

  const M = {
    title: t(r.title) || autoTitle(r),
    header: {
      l1: t(st.settings.l1), l2: t(st.settings.l2), l3: t(st.settings.l3),
      logo: st.logo || '',
    },
    meta: [],
    intro: '',
    sections: [],
  };

  /* بيانات علوية */
  if (r.bookNumber) M.meta.push(['رقم الكتاب / الأمر الإداري', t(r.bookNumber)]);
  if (sec) M.meta.push(['الجهة التابعة', sec]);
  if (dstr) M.meta.push(['تاريخ الزيارة', day ? `${day} الموافق ${dstr}` : dstr]);
  if (r.population) M.meta.push(['عدد النفوس المسجلة', normalizeDigits(r.population)]);
  if (r.families) M.meta.push(['عدد العوائل المسجلة', normalizeDigits(r.families)]);

  /* المقدمة */
  M.intro = `استناداً إلى الخطة السنوية لشعبة تفتيش المؤسسات الصحية الحكومية، أجرى فريق من قسم التفتيش / شعبة تفتيش المؤسسات الصحية الحكومية ${t(r.visitType) || 'زيارة تفتيشية'} إلى ${kind} ${fac}${sec ? ' التابع إلى ' + sec : ''}${dstr ? ' بتاريخ ' + dstr : ''}، وتم ملاحظة الآتي:`;

  /* المسؤولون */
  const offs = (r.officials || []).map(o => [t(o.role), titleName(o.job, o.name)]).filter(o => o[1]);
  if (offs.length) M.sections.push({ type: 'kv', heading: 'بيانات المؤسسة', rows: offs });

  /* الملاك — فقرات لا جدول، بلا حساب نقص أو نسبة (بطلب صريح) */
  const staffRows = Object.keys(r.staff || {}).map(k => {
    const v = r.staff[k];
    const tot = normalizeDigits(v.total).trim();
    const act = normalizeDigits(v.actual).trim();
    if (!tot && !act) return null;
    return `${t(k)}: الملاك الكلي ${fmtNum(tot)} — الملاك الفعلي ${fmtNum(act)}`;
  }).filter(Boolean);
  if (staffRows.length) M.sections.push({ type: 'list', heading: 'الملاك الكلي والفعلي', items: staffRows, numbered: false });

  /* أولاً: وحدة البصمة */
  const fp = r.fp;
  const fpRows = [];
  const pm = titleName(fp.managerJob, fp.managerName);
  if (pm) fpRows.push(['مسؤول البصمة', pm]);
  const pd = titleName(fp.deputyJob, fp.deputyName);
  if (pd) fpRows.push(['الرديف', pd]);
  if (t(fp.devices)) fpRows.push(['عدد الأجهزة', t(fp.devices) + (t(fp.deviceState) ? ` (${t(fp.deviceState)})` : '')]);
  if (t(fp.staff)) fpRows.push(['الكادر', t(fp.staff)]);
  if (t(fp.adminCount) || t(fp.adminWhere)) fpRows.push(['الآدمن', [t(fp.adminCount), t(fp.adminWhere)].filter(Boolean).join(' — ')]);
  if (t(fp.reportFreq) || t(fp.reportTo)) {
    /* الصياغة المطلوبة: يُرسل موقف الحضور والبصمة (الدورية) إلى (الجهة) بانتظام */
    const freq = t(fp.reportFreq) || 'يومياً';
    const to = t(fp.reportTo) || 'الجهة المعنية';
    fpRows.push(['آلية رفع الموقف', `يُرسل موقف الحضور والبصمة ${freq} إلى ${to} بانتظام.`]);
  }
  if (fpRows.length || t(fp.notes)) {
    M.sections.push({ type: 'kv', heading: 'أولاً: وحدة البصمة', rows: fpRows, notes: t(fp.notes) ? [t(fp.notes)] : [] });
  }

  /* ثانياً: الإجراءات */
  const procs = [];
  (r.procedures || []).forEach(p => {
    const d = fmtDate(p.date), dn = dayNameOf(p.date);
    if (!d) return;
    const src = t(p.source) || (kind === 'مستشفى' ? 'موظفي المستشفى' : 'موظفي المركز');
    const when = dn ? `ليوم ${dn} الموافق ${d}` : `بتاريخ ${d}`;
    let line;
    if (p.kind === 'بصمة مفاجئة') line = `إجراء بصمة مفاجئة (تدقيق مفاجئ) لبيان حضور ${src} ${when}، وسحب الموقف ومطابقته مع مواقف الإجازات والسجلات ذات الصلة.`;
    else if (p.kind === 'تدقيق مفاجئ') line = `إجراء تدقيق مفاجئ لبيان حضور ${src} ${when}، ومطابقته مع مواقف الإجازات والسجلات ذات الصلة.`;
    else if (p.kind === 'سجل تواقيع' || p.kind === 'توقيع مفاجئ') line = `تم الاطلاع على سجل التواقيع الخاصة بحضور ${src} ${when}، وتدقيقه ومطابقته مع مواقف الإجازات والسجلات ذات الصلة.`;
    else line = `تم سحب موقف البصمة الخاص بـ${src} ${when}، وتدقيقه ومطابقته مع مواقف الإجازات والسجلات ذات الصلة.`;
    if (t(p.note)) line = line.replace(/\.$/, '') + '، ' + t(p.note).replace(/\.$/, '') + '.';
    procs.push(line);
  });
  splitLines(r.procExtra).forEach(l => procs.push(l));
  if (procs.length) M.sections.push({ type: 'list', heading: 'ثانياً: الإجراءات المتخذة خلال الزيارة', items: procs });

  /* الملاحظات العامة */
  const gen = (r.general || []).map(t).filter(Boolean);
  if (gen.length) M.sections.push({ type: 'list', heading: 'الملاحظات العامة', items: gen });

  /* مواقف البصمة */
  const posBlocks = [];
  (r.positions || []).forEach(p => {
    const d = fmtDate(p.date), dn = t(p.day) || dayNameOf(p.date);
    const when = dn ? `ليوم ${dn} الموافق ${d}` : `بتاريخ ${d}`;
    let intro = t(p.intro);
    if (!intro) {
      const verb = t(p.verb) || 'بعد تدقيق';
      intro = `${verb} ${t(p.kind) || 'موقف البصمة'} ${when}، تبين ما يلي:`;
    }
    const cats = [];
    positionCats().forEach(c => {
      const items = (p.items && p.items[c.k]) || [];
      const list = items.map(it => titleName(it.job, it.name)).filter(Boolean)
        .map((nm, i) => `${i + 1}. ${nm}${t(items[i].note) ? ' (' + t(items[i].note) + ')' : ''}`);
      if (list.length) cats.push({ title: c.t, items: list });
    });
    if (cats.length) posBlocks.push({ intro, cats });
    else posBlocks.push({ intro: intro + ' لم تُؤشر مخالفات.', cats: [] });
  });
  if (posBlocks.length) M.sections.push({ type: 'positions', heading: 'مواقف البصمة والحضور', blocks: posBlocks });

  /* السجلات — فقرة لكل سجل: «اسم السجل: التقييم» */
  const recLines = (r.records || [])
    .filter(x => t(x.name))
    .map(x => `${t(x.name)}: ${t(x.eval) || 'لم يُقيَّم'}`);
  if (recLines.length) {
    M.sections.push({ type: 'list', heading: 'ثالثاً: السجلات الإدارية', items: recLines, numbered: false });
  }

  /* متابعة التوصيات السابقة — فقرة لكل توصية */
  const prev = (r.prevRecs || []).filter(x => t(x.text));
  if (prev.length) {
    M.sections.push({
      type: 'list', heading: 'متابعة التوصيات السابقة', numbered: true,
      items: prev.map(x => {
        let s = t(x.text);
        if (t(x.status)) s += ` — الحالة: ${t(x.status)}`;
        if (t(x.note)) s += ` — ${t(x.note)}`;
        return s;
      }),
    });
  }

  /* التوصيات */
  const groups = (r.recGroups || []).filter(g => t(g.label) || (g.items || []).some(x => t(x)));
  if (groups.length) {
    M.sections.push({
      type: 'recs', heading: 'التوصيات',
      groups: groups.map(g => ({
        letter: t(g.letter),
        label: t(g.label),
        intro: sub(t(g.intro)) || (t(g.label) ? `الإيعاز إلى ${t(g.label)} بما يلي:` : ''),
        items: (g.items || []).map(sub).map(t).filter(Boolean),
      })),
    });
  }

  /* التوقيعات */
  const sig = (r.signers || []).filter(s => t(s.name) || t(s.job));
  M.signers = sig.map(s => ({ name: t(s.name), job: t(s.job), date: fmtDate(s.date) }));
  M.footerNote = t(r.footerNote);
  M.facility = fac; M.sector = sec; M.kind = kind;
  M.visitDate = dstr; M.dayName = day;
  M.visitType = t(r.visitType);   /* نوع الزيارة — يظهر في سطر المعلومات أسفل العنوان */
  return M;
}
function splitLines(s) {
  return String(s || '').split(/\r?\n/).map(tidy).filter(Boolean);
}


  /* نُتيح الدالة لبقية الملفات */
  NS.buildModel = buildModel;

})(window.ADMHReport);
