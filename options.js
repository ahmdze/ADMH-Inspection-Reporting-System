/* =============================================================================
   الطبقة القابلة للتعديل: كل قائمة اختيار في الموقع مصدرها هنا.
   تُحرَّر من «مكتبة العبارات» داخل التطبيق، وتُحفظ في localStorage،
   وتنعكس فوراً على كل القوائم المنسدلة وحقول الاقتراح.

   القاعدة: لا يوجد خيار مكتوب في الكود لا يمكن للمستخدم تغييره.
   ============================================================================= */
'use strict';

(function (global) {
  const LS = 'admh.lists.v1';

  /* ------------------------------------------------------------------------
     تعريف القوائم. default: القيم الابتدائية. label: ما يظهر في المكتبة.
     ------------------------------------------------------------------------ */
  const DEFAULTS = {
    positionCategories: {
      label: 'فئات المخالفة في مواقف البصمة',
      hint: 'تُنشئ فئة باسمها وأربعة حقول ثابتة لكل فئة (فئة جديدة تُنشئ فئة بثلاثة حقول: العنوان الوظيفي، الاسم، ملاحظة).',
      values: [
        'تغيب عن الدوام الرسمي',
        'عدم وجود بصمة مغادرة',
        'عدم وجود بصمة دخول',
        'عدم تأدية البصمة المفاجئة',
        'عدم تأدية بصمتي الحضور والمغادرة',
      ],
    },

    recommendationEntities: {
      label: 'جهات التوصيات',
      hint: 'الجهات التي تُوجَّه إليها التوصيات. تُضاف من زر «إضافة الجهات المعتادة».',
      values: [
        'شعبة التحقيقات / قسمنا',
        'قسم الأمور الإدارية والمالية والقانونية / دائرتنا',
        'إدارة القطاع',
        'إدارة المؤسسة',
        'مذخر أدوية القطاع',
        'جهة أخرى',
      ],
    },
    recommendationLetters: {
      label: 'حروف التوصيات',
      hint: 'الحروف التي تسبق كل جهة (أ/ ب/ ج/ ...). تُسند بالترتيب لجهات التوصيات.',
      values: ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'],
    },

    /* --- قوائم ثابتة في الصفحة (select / datalist) --- */
    visitTypes: {
      label: 'أنواع الزيارة',
      hint: 'تظهر في حقل «نوع الزيارة» وفي عنوان التقرير.',
      values: ['زيارة تفتيشية', 'زيارة متابعة', 'زيارة مفاجئة', 'زيارة متابعة دوام', 'زيارة تقييمية'],
    },
    facilityKinds: {
      label: 'أنواع المؤسسات',
      hint: 'تظهر في حقل «نوع المؤسسة» وفي مقدمة التقرير.',
      values: ['مركز صحي', 'مستشفى', 'قطاع', 'مصحة', 'مذخر أدوية', 'أخرى'],
    },
    deviceStates: {
      label: 'حالات أجهزة البصمة',
      hint: 'اقتراحات حقل «حالة الأجهزة» — الكتابة الحرة متاحة دائماً.',
      values: ['صالح للعمل', 'عاطل', 'بعضها عاطل'],
    },
    reportFreqs: {
      label: 'دوريات رفع الموقف',
      hint: 'تُدرج في جملة «يُرسل موقف الحضور والبصمة ... بانتظام».',
      values: ['يومياً', 'أسبوعياً', 'شهرياً'],
    },
    reportTargets: {
      label: 'جهات رفع الموقف',
      hint: 'الجهة التي يُرفع إليها موقف البصمة.',
      values: ['المدير', 'القطاع'],
    },

    /* --- قوائم مولّدة في الجداول --- */
    jobTitles: {
      label: 'العناوين الوظيفية',
      hint: 'اقتراحات حقول العنوان الوظيفي في كل الجداول. الكتابة الحرة متاحة.',
      values: [
        'مدير المركز', 'م. مدير', 'مدير المستشفى',
        'رئيس أطباء أسنان', 'رئيس أطباء أسنان أقدم', 'طبيب اختصاص', 'طبيب',
        'طبيب أسنان', 'طبيب أسنان ممارس', 'طبيب أسنان تدرج', 'طبيب تدرج',
        'صيدلاني', 'صيدلي', 'م. صيدلاني',
        'ممرض', 'ممرض ماهر', 'م. طبي', 'تقني طبي', 'تقني أجهزة طبية', 'تقني تحليلات',
        'م. مختبر', 'مساعد مختبر أقدم', 'م. فني', 'م. فنيين', 'م. جامعي',
        'م. ر. بايولوجي', 'ر. م. فنيين', 'ر. م. وقائي أقدم',
        'ملاحظ', 'رئيس ملاحظين', 'ر. ملاحظين', 'حرفي', 'محاسب', 'ت. بصريات', 'كاتب', 'إداري',
      ],
    },
    officialRoles: {
      label: 'الصفات / المناصب',
      hint: 'اقتراحات عمود «الصفة / المنصب» في جدول المسؤولين.',
      values: [
        'مدير المركز', 'مسؤول الإدارة والخدمات', 'الرديف',
        'الرديف / مسؤول الإدارة والخدمات', 'معاون الإداري', 'مدير المستشفى',
        'المعاون الإداري', 'المعاون الطبي',
      ],
    },
    staffCategories: {
      label: 'فئات الملاك',
      hint: 'تُستخدم في زر «إضافة كل الفئات المعتادة» لجدول الملاك.',
      values: ['الملاك', 'الأطباء', 'أطباء الأسنان', 'الصيادلة', 'تقني طبي', 'ممرضين', 'إداريين'],
    },
    procedureKinds: {
      label: 'أنواع التدقيق / الإجراءات',
      hint: 'العمود الثاني في جدول «الإجراءات المتخذة خلال الزيارة».',
      values: ['سحب موقف', 'بصمة مفاجئة', 'تدقيق مفاجئ', 'سجل تواقيع', 'توقيع مفاجئ'],
    },
    procedureSources: {
      label: 'جهات السحب / المصادر',
      hint: 'اقتراحات عمود «جهة السحب/المصدر» في الإجراءات.',
      values: ['موظفي المركز', 'موظفي المستشفى', 'الأطباء الاختصاص', 'الكادر الطبي', 'الكادر الإداري'],
    },
    positionVerbs: {
      label: 'بدايات عبارة الموقف',
      hint: 'أول كلمة في جملة الموقف داخل «مواقف البصمة».',
      values: ['بعد تدقيق', 'بعد الاطلاع على', 'بعد سحب'],
    },
    positionKinds: {
      label: 'أنواع المواقف',
      hint: 'نوع الموقف الذي شوهد في «مواقف البصمة».',
      values: [
        'موقف البصمة', 'موقف البصمة المفاجئة (التدقيق المفاجئ)',
        'موقف الحضور', 'موقف الحضور المفاجئ (التدقيق المفاجئ)',
        'سجل التواقيع', 'تقرير البصمة',
      ],
    },
    prevRecStatuses: {
      label: 'حالات التوصيات السابقة',
      hint: 'خيارات عمود «الحالة» في جدول متابعة التوصيات.',
      values: ['منفذة', 'منفذة جزئياً', 'غير منفذة', 'قيد التنفيذ'],
    },
    recordNames: {
      label: 'أسماء السجلات الإدارية',
      hint: 'السجلات التي يضيفها زر «إضافة كل السجلات المعتادة».',
      values: [
        'سجل الحركة', 'سجل الغياب', 'سجل الإجازات الاعتيادية القصيرة',
        'سجل الإجازات الاعتيادية الطويلة', 'سجل الإجازات الزمنية', 'سجل الإجازات المرضية',
        'سجل إجازات الأمومة', 'سجل إجازات قبل وبعد الوضع', 'سجل الإجازات الدراسية',
        'سجل إجازات الـ 5 سنوات', 'سجل الإجازات الإجبارية', 'سجل الصادر', 'سجل الوارد',
        'سجل استلام البريد الداخلي', 'سجل تبليغ الموظفين بالعقوبات',
        'سجل التشكرات والعقوبات', 'سجل العقوبات', 'سجل التشكرات',
        'سجل الأمور الانضباطية', 'سجل العلاوات والترقيات', 'سجل الملاك', 'سجل الدورات',
        'سجل التقاعد', 'سجل الترقيات',
      ],
    },
  };

  /* ترتيب العرض في المكتبة */
  const ORDER = [
    'jobTitles', 'officialRoles', 'staffCategories',
    'positionCategories', 'positionVerbs', 'positionKinds',
    'procedureKinds', 'procedureSources', 'prevRecStatuses', 'recordNames',
    'recommendationEntities', 'recommendationLetters',
    'visitTypes', 'facilityKinds',
    'deviceStates', 'reportFreqs', 'reportTargets',
  ];

  const listeners = [];
  let lists = null;

  function read() {
    let saved = null;
    try { const r = localStorage.getItem(LS); saved = r ? JSON.parse(r) : null; } catch (e) {}
    const out = {};
    Object.keys(DEFAULTS).forEach(k => {
      const def = DEFAULTS[k];
      const v = saved && Array.isArray(saved[k]) ? saved[k] : def.values;
      out[k] = { label: def.label, hint: def.hint, values: v.slice() };
    });
    return out;
  }
  function write() {
    const flat = {};
    Object.keys(lists).forEach(k => { flat[k] = lists[k].values; });
    try { localStorage.setItem(LS, JSON.stringify(flat)); } catch (e) {}
    listeners.forEach(fn => { try { fn(); } catch (e) {} });
    notify();
  }

  /** يُطلق حدثاً للمن يستمع، بلا افتراض وجود CustomEvent */
  function notify() {
    try {
      if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('admh:lists-changed'));
      }
    } catch (e) { /* بيئات بلا DOM (الاختبارات) */ }
  }

  const API = {
    ORDER,
    /** كل القوائم الحالية */
    all() { if (!lists) lists = read(); return lists; },
    /** قيم قائمة واحدة */
    get(key) {
      const l = API.all()[key];
      return l ? l.values.slice() : [];
    },
    label(key) { const l = API.all()[key]; return l ? l.label : key; },
    hint(key) { const l = API.all()[key]; return l ? l.hint : ''; },
    has(key) { return !!API.all()[key]; },

    /** استبدال قيم قائمة كاملة */
    setValues(key, arr) {
      const l = API.all()[key];
      if (!l) return false;
      l.values = (arr || []).map(s => String(s).trim()).filter(Boolean);
      write();
      return true;
    },
    /** إضافة قيمة (تُرفض المكرّرة) */
    add(key, value) {
      const l = API.all()[key];
      const v = String(value == null ? '' : value).trim();
      if (!l || !v) return false;
      if (l.values.includes(v)) return false;
      l.values.push(v); write(); return true;
    },
    /** حذف قيمة */
    remove(key, value) {
      const l = API.all()[key];
      if (!l) return false;
      const i = l.values.indexOf(value);
      if (i < 0) return false;
      l.values.splice(i, 1); write(); return true;
    },
    /** نقل قيمة أعلى/أسفل */
    move(key, index, delta) {
      const l = API.all()[key];
      if (!l) return false;
      const j = index + delta;
      if (index < 0 || index >= l.values.length || j < 0 || j >= l.values.length) return false;
      const [x] = l.values.splice(index, 1);
      l.values.splice(j, 0, x);
      write(); return true;
    },
    /** إعادة قائمة واحدة إلى الأصل */
    reset(key) {
      const def = DEFAULTS[key];
      if (!def) return false;
      API.all()[key].values = def.values.slice();
      write(); return true;
    },
    /** إعادة كل القوائم إلى الأصل */
    resetAll() {
      try { localStorage.removeItem(LS); } catch (e) {}
      lists = read();
      listeners.forEach(fn => { try { fn(); } catch (e) {} });
      notify();
    },
    /** نص كل القوائم — للتصدير والاستيراد */
    exportAll() {
      const flat = {};
      Object.keys(API.all()).forEach(k => { flat[k] = API.all()[k].values; });
      return flat;
    },
    importAll(obj) {
      if (!obj || typeof obj !== 'object') return 0;
      let n = 0;
      Object.keys(DEFAULTS).forEach(k => {
        if (Array.isArray(obj[k]) && obj[k].length) { API.all()[k].values = obj[k].map(String); n++; }
      });
      if (n) write();
      return n;
    },
    onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
  };

  global.ADMHLists = API;
})(typeof window !== 'undefined' ? window : globalThis);
