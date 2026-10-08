/* =============================================================================
   نظام التقارير التفتيشية — منطق التطبيق
   الجانب الإداري + تصدير Word (.docx)
   ============================================================================= */
'use strict';

(function () {

/* ---------------------------------------------------------------- ثوابت عامة */
const APP_VERSION = '6.0.0';
const LS_REPORTS = 'admh.reports.v2';
const LS_DRAFT   = 'admh.draft.v2';
const LS_SETTINGS= 'admh.settings.v2';
const LS_LIBRARY = 'admh.library.v2';
const LS_THEME   = 'admh.theme';

/* ------------------------------------------------------- مكتبة العبارات الجاهزة
   مستخرجة من تقارير الزيارة التفتيشية وزيارات المتابعة.
   صُحّحت الأخطاء الإملائية المتكررة في النماذج الأصلية:
     «مدام» ← «مُدام» ، «الايعاز» ← «الإيعاز» ، «محدث» ← «محدّث»
     «فهرست» ← «فهرسة» ، «ادامه» ← «إدامة» ، «اعادة» ← «إعادة»
   ------------------------------------------------------------------------- */

/* تقييمات كاملة جاهزة للسجلات — تُدرج كما هي */
const RECORD_PRESETS = [
  'مُدام وموثق ومحدّث.',
  'مُدام وموثق ومحدّث، ولا يتم قفله بشكل يومي.',
  'مُدام وموثق ومحدّث، ولا يوجد حقل لتوقيع الموظفين.',
  'مُدام وموثق ومحدّث، ولا يتم قفله بشكل يومي، ولا يوجد حقل لتوقيع الموظفين.',
  'مُدام وموثق ومحدّث، ويحتاج إلى إدامة.',
  'مُدام وموثق ومحدّث، لا يحتوي على فهرسة بالموظفين، ويحتاج إلى إعادة تنظيم.',
  'مُدام وموثق ومحدّث، لا يحتوي على فهرسة بالموظفين، يحتاج إلى إعادة تنظيم.',
  'مُدام وموثق ومحدّث، فهرسة الموظفين غير محدّثة.',
  'مُدام وموثق ومحدّث، بدون هوية تعريفية، لا يحتوي على فهرسة بالموظفين، يحتاج إلى إعادة تنظيم.',
  'مُدام وموثق ومحدّث، بدون هوية تعريفية.',
  'موثق ومحدّث، ويحتاج إلى إدامة.',
  'مُدام وموثق ومحدّث، وبحاجة إلى إعادة تنظيم الحقول.',
  'مُدام وموثق، وغير محدّث، ولا يتم ذكر التشخيص.',
  'مدمجان في سجل واحد، غير محدّث، ويحتاج إلى إعادة تنظيم.',
  'غير مفتوح.',
  'لوحظ وجود حك وشطب وتحبير في بعض صفحاته.',
  'غير مُدام ويحتاج إلى استكمال القيود.',
];

/* عبارات إضافية تُلحق بالتقييم عند الحاجة */
const RECORD_ADDONS = [
  { t: 'يحتاج إلى إعادة تنظيم', v: 'يحتاج إلى إعادة تنظيم.' },
  { t: 'لا يحتوي على فهرسة بالموظفين', v: 'لا يحتوي على فهرسة بالموظفين.' },
  { t: 'فهرسة الموظفين غير محدّثة', v: 'فهرست الموظفين غير محدّثة.' },
  { t: 'بدون هوية تعريفية', v: 'بدون هوية تعريفية.' },
  { t: 'لا يتم قفله بشكل يومي', v: 'ولا يتم قفله بشكل يومي.' },
  { t: 'لا يوجد حقل لتوقيع الموظفين', v: 'ولا يوجد حقل لتوقيع الموظفين.' },
  { t: 'لا يتم ذكر التشخيص', v: 'ولا يتم ذكر التشخيص.' },
  { t: 'يحتاج إلى إدامة', v: 'ويحتاج إلى إدامة.' },
  { t: 'يوجد حك وشطب وتحبير', v: 'لوحظ وجود حك وشطب وتحبير في بعض صفحاته.' },
  { t: 'غير محدّث بأمر إداري', v: 'وغير محدّث بأمر إداري.' },
];

/* السجلات الإدارية المعتادة — بالترتيب الشائع في التقارير */
const RECORD_ROWS = [
  'سجل الحركة',
  'سجل الصادر',
  'سجل الوارد',
  'سجل الغياب',
  'سجل الإجازات الاعتيادية القصيرة',
  'سجل الإجازات الاعتيادية الطويلة',
  'سجل الإجازات الزمنية',
  'سجل الإجازات المرضية',
  'سجل إجازات الأمومة',
  'سجل إجازات قبل وبعد الوضع',
  'سجل الإجازات الدراسية',
  'سجل إجازات الـ 5 سنوات',
  'سجل الإجازات الإجبارية',
  'سجل استلام البريد الداخلي',
  'سجل تبليغ الموظفين بالعقوبات',
  'سجل الأمور الانضباطية',
  'سجل العلاوات والترقيات',
  'سجل الملاك',
  'سجل الدورات',
  'سجل التقاعد',
];

/* التوصيات المتكررة في التقارير */
const RECO_PRESETS = [
  { g: 'records', t: 'تفادي الحك والشطب والتحبير في السجلات الرسمية', v: 'تفادي الحك والشطب والتحبير في السجلات الرسمية، وفي حال حدوث خطأ يتم الخط عليه بخط خفيف يتيح قراءة الكلمة المشطوبة، وكتابة سبب الشطب بين قوسين، ويكتب التصحيح بجانبها مع توقيع الموظف المسؤول بجانب التصحيح.' },
  { g: 'records', t: 'تنظيم سجل الغياب', v: 'تنظيم (سجل الغياب) على النحو التالي: فهرسة الموظفين بداية السجل، لكل موظف صفحة، التبويبات كالتالي (مدة الغياب، أمر الغياب -العدد والتاريخ-، تاريخ الغياب، المباشرة -العدد والتاريخ-).' },
  { g: 'records', t: 'دمج سجلي التشكرات والعقوبات', v: 'دمج سجلي التشكرات والعقوبات في سجل واحد بعنوان (سجل الأمور الانضباطية) وتنظيمه على النحو التالي: فهرسة الموظفين بداية السجل، لكل موظف صفحة للتشكرات وصفحة للعقوبات، تحتوي على التبويبات التالية (التسلسل، النوع (شكر أو عقوبة مع نوع العقوبة)، الأمر -العدد والتاريخ-، الجهة).' },
  { g: 'records', t: 'تنظيم سجل التشكرات والعقوبات', v: 'تنظيم (سجل التشكرات والعقوبات) على النحو التالي: فهرسة الموظفين بداية السجل، لكل موظف صفحة للتشكرات وصفحة للعقوبات، تحتوي على التبويبات التالية (التسلسل، النوع (شكر أو عقوبة مع نوع العقوبة)، الأمر -العدد والتاريخ-، الجهة).' },
  { g: 'records', t: 'تنظيم سجل العلاوات والترقيات', v: 'تنظيم (سجل العلاوات والترقيات) على النحو التالي: فهرسة الموظفين بداية السجل، لكل موظف صفحة، تدون فيها العلاوات والترقيات بالتبويبات التالية (التسلسل، النوع -علاوة أو ترقية-، الأمر -العدد والتاريخ-).' },
  { g: 'records', t: 'تنظيم سجل الدورات', v: 'تنظيم (سجل الدورات) على النحو التالي: فهرسة الموظفين بداية السجل، لكل موظف صفحة، التبويبات كالتالي (التسلسل، نوع الدورة، عنوان الدورة، تاريخ الاشتراك، المدة، تاريخ الانفكاك من المؤسسة، تاريخ المباشرة بعد الدورة).' },
  { g: 'records', t: 'فصل سجل إجازات الأمومة عن الوضع', v: 'فصل سجل إجازات الأمومة عن سجل إجازات الوضع (قبل الوضع وبعد الوضع)، وتحديث معلوماتهما وتنظيمهما حسب الضوابط.' },
  { g: 'records', t: 'إضافة حقل (التشخيص) في سجل الإجازات المرضية', v: 'إضافة حقل (التشخيص) في سجل الإجازات المرضية.' },
  { g: 'records', t: 'إضافة حقل توقيع الموظف في سجل الحركة', v: 'إضافة حقل لتوقيع الموظف المكلف بواجب رسمي في سجل الحركة.' },
  { g: 'records', t: 'قفل سجل الحركة بشكل يومي', v: 'إدامة وتنظيم سجل الحركة وقفل السجل بشكل يومي ومنع الحك والشطب والتحبير فيه.' },
  { g: 'records', t: 'إصدار أمر إداري حديث لسجل الحركة', v: 'إصدار أمر إداري حديث خاص بسجل الحركة، والتأكيد على قفل صفحات السجل بشكل يومي، وإضافة حقل لتوقيع الموظف المكلف بواجب رسمي.' },
  { g: 'records', t: 'تحديث فهرسة الموظفين في كافة السجلات', v: 'تحديث فهرسة الموظفين في كافة السجلات.' },
  { g: 'records', t: 'تثبيت هوية تعريفية على أغلفة السجلات', v: 'تثبيت هوية تعريفية واضحة على الغلاف الخارجي لجميع السجلات.' },
  { g: 'records', t: 'إدامة سجلي الصادر والوارد', v: 'إدامة سجلي الصادر والوارد، والحفاظ عليهما من التلف مستقبلاً.' },
  { g: 'records', t: 'تنظيم سجلي الإجازات الاعتيادية القصيرة والزمنية', v: 'تنظيم السجلات (سجل الإجازات الاعتيادية القصيرة، سجل الإجازات الزمنية) حسب الضوابط.' },
  { g: 'records', t: 'إصدار أمر إداري بفتح السجلات المغلقة', v: 'إصدار أمر إداري بفتح السجلات غير المفتوحة وتنظيمها حسب الضوابط.' },

  { g: 'fp', t: 'التزام الموظفين بتدوين الواجبات في سجل الحركة', v: 'التأكيد على جميع الموظفين بالالتزام بتدوين معلومات الواجبات خارج المؤسسة في سجل الحركة، قبل المغادرة لأداء الواجب.' },
  { g: 'fp', t: 'قفل جهاز البصمة في الوقت المحدد', v: 'قفل جهاز البصمة في تمام الساعة التاسعة صباحاً وعدم فتحه لأي سبب كان، والتأكيد على عدم تقديم أو تأخير الوقت في جهاز البصمة.' },
  { g: 'fp', t: 'عدم إعفاء الموظفين من البصمة', v: 'عدم إعفاء الموظفين من أداء بصمة الدخول أو المغادرة لأي سبب كان دون إجراء قانوني، وخلاف ذلك تتحمل إدارة البصمة كافة التبعات القانونية.' },
  { g: 'fp', t: 'تنظيم أسماء الموظفين في نظام البصمة', v: 'التأكيد على تنظيم أسماء الموظفين في نظام البصمة وتنظيم التقارير في البرنامج وذلك حسب الأقسام.' },
  { g: 'fp', t: 'فلترة الأسماء وحذف الأرقام الفارغة', v: 'فلترة وتحديث أسماء الموظفين في نظام البصمة وحذف الأرقام الفارغة، وذلك لأغراض تنظيمية.' },
  { g: 'fp', t: 'توصيل كيبل LAN لجهاز البصمة', v: 'الإيعاز إلى مسؤول تقنية المعلومات بتوصيل كيبل LAN من جهاز البصمة إلى جهاز الحاسوب بداخل وحدة البصمة.' },
  { g: 'fp', t: 'عدم منح الإجازات الاعتيادية بما يتجاوز 10%', v: 'عدم منح إجازات اعتيادية باليوم الواحد بما يتجاوز نسبة 10% من عدد الموظفين الفعلي.' },
  { g: 'fp', t: 'اتخاذ الإجراء بحق المتأخرين عن البصمة الصباحية', v: 'اتخاذ الإجراء حسب الضوابط بحق الموظفين المتأخرين عن أداء البصمة الصباحية (الحضور بعد الثامنة والنصف) الذين لا يعالجون التأخير بالإجازة الزمنية.' },
  { g: 'fp', t: 'التأكيد على تعليمات وضوابط البصمة الجديدة', v: 'التأكيد على العمل حسب تعليمات وضوابط البصمة الجديدة، الصادرة عن وزارة الصحة / دائرة التفتيش / قسم تفتيش المؤسسات الصحية الحكومية، فيما يخص التأخيرات.' },
  { g: 'fp', t: 'عدم تكليف الموظفين إلا بعد تثبيت البصمة الصباحية', v: 'عدم تكليف موظفين بواجبات رسمية أو حضور اجتماع أو ندوة أو دورة مدتها يوم واحد ضمن الرقعة الجغرافية إلا بعد تثبيت بصمة صباحية.' },
  { g: 'fp', t: 'عدم فتح بصمة المغادرة قبل الوقت الرسمي', v: 'عدم فتح بصمة المغادرة عند الساعة الواحدة والنصف مساءً كون ذلك مخالفاً للتعليمات والضوابط الخاصة بالبصمة، والالتزام بالتعميم الوزاري الصادر من وزارة الصحة / دائرة التفتيش الخاص بتعليمات وضوابط البصمة.' },
  { g: 'fp', t: 'التأكيد على الالتزام بساعات العمل', v: 'التأكيد على الالتزام بساعات العمل في الدوام الرسمي، وعلى إدارة المؤسسة متابعة الموضوع أعلاه.' },
  { g: 'fp', t: 'الإسراع بتوفير جهاز بصمة صالح', v: 'الإسراع في توفير جهاز بصمة محدد وصالح للعمل، مع التأكيد على تحديث بيانات جميع الموظفين على الجهاز والبرنامج الخاص بإدارة البصمة، وإعلامنا بالإجراءات.' },
  { g: 'fp', t: 'متابعة تصليح جهاز البصمة المتعطل', v: 'متابعة تصليح جهاز البصمة المتعطل والمرفوع بحقه مطالعة من قبل مسؤول البصمة.' },
  { g: 'fp', t: 'رفد المؤسسة بالكوادر لسد النقص', v: 'رفد المؤسسة بالكوادر الطبية والصحية والإدارية لسد النقص الحاصل في معظم الشعب والوحدات.' },
  { g: 'fp', t: 'التأكيد على متابعة الطلبات المرفوعة مسبقاً', v: 'التأكيد على متابعة الطلبات والمطالعات المرفوعة إليكم مسبقاً بهذا الخصوص، وإعلامنا بالإجراءات المتخذة.' },

  { g: 'common', t: 'إصدار أمر إداري بتغيب الموظفين', v: 'إصدار أمر إداري بتغيب الذوات المدرجة أسماؤهم في أدناه، لتغيبهم عن الدوام الرسمي، والمنسوبين إلى {المؤسسة}، والمرفوع إليكم تغيبهم من قبل المؤسسة.' },
  { g: 'common', t: 'تشكيل لجنة تحقيقية', v: 'تشكيل لجنة تحقيقية بخصوص ما ورد في التقرير أعلاه، وإعلامنا بالنتائج.' },
  { g: 'common', t: 'تشكيل لجنة تحقيقية بخصوص التلاعب في برنامج البصمة', v: 'تشكيل لجنة تحقيقية بخصوص التلاعب الحاصل في برنامج البصمة في وحدة البصمة (إضافة بصمات حضور وانصراف).' },
  { g: 'common', t: 'تشكيل لجنة تحقيقية بخصوص تكرار الغياب', v: 'تشكيل لجنة تحقيقية بخصوص تكرار تغيب الموظفين المدرجة أسماؤهم وعناوينهم الوظيفية في أدناه، والمنسوبين إلى {المؤسسة}.' },
  { g: 'common', t: 'تشكيل لجنة تحقيقية بخصوص عدم التزام الأطباء الاختصاص', v: 'تشكيل لجنة تحقيقية بخصوص عدم التزام الأطباء الاختصاص بأداء بصمة الحضور والانصراف.' },
];

/* الملاحظات العامة المتكررة */
const GENERAL_PRESETS = [
  'لا يتم إصدار أوامر غياب بحق الأطباء الاختصاص المتغيبين عن الدوام الرسمي.',
  'عدم التزام الموظفين المكلفين بواجبات رسمية، بالتوثيق في سجل الحركة.',
  'لوحظ يتم تكليف موظفين بواجبات رسمية أو حضور اجتماع أو ندوة أو دورة مدتها يوم واحد ضمن الرقعة الجغرافية مع عدم تثبيت بصمة صباحية.',
  'لوحظ يتم فتح بصمة المغادرة عند الساعة الواحدة والنصف مساءً وذلك مخالف للتعليمات والضوابط الخاصة بالبصمة.',
  'لوحظ نقص حاد في جميع الكوادر الطبية والصحية والإدارية في المؤسسة.',
  'تكرار تغيب الذوات المدرجة أسماؤهم وعناوينهم الوظيفية في أدناه، عن الدوام الرسمي، وقد تم رفع مواقف غياباتهم إلى القطاع من قبل المؤسسة.',
  'وجود تلاعب (إضافة بصمات حضور وانصراف لعدة موظفين) مؤشر في برنامج البصمة على الحاسوب.',
  'جهاز البصمة مفتوح بعد الساعة التاسعة صباحاً وعدم تطابق الوقت مع جهاز البصمة.',
  'يتم إعفاء بعض الموظفين من أداء البصمة المسائية وذلك عن طريق ورقة تحتوي موافقة من قبل إدارة المؤسسة.',
  'لوحظ عدم تنظيم تقرير البصمة وأسماء الموظفين في برنامج البصمة وعدم تخصيص حقل لكل قسم في المؤسسة.',
  'عدم تحديث قوائم الموظفين في برنامج البصمة وجهاز البصمة، حيث لوحظ وجود عدد من الموظفين المنقولين من المؤسسة ولا زالت بصماتهم موجودة ووجود أرقام شاغرة.',
  'لم يتم توصيل جهاز الحاسوب في غرفة وحدة البصمة بجهاز البصمة عن طريق كيبل، ويتم أخذ الحاسوب إلى مكان الجهاز لكي يتم تحميل الحركات على البرنامج.',
  'لا يتم اتخاذ الإجراء حسب الضوابط بحق الموظفين المتأخرين عن أداء البصمة الصباحية (الحضور بعد الثامنة والنصف) الذين لا يعالجون التأخير بالإجازة الزمنية.',
  'لوحظ كثرة الإجازات الاعتيادية اليومية، حيث تتجاوز الإجازات الممنوحة نسبة 10% من عدد الموظفين.',
  'تعطل جهاز البصمة الخاص بالمؤسسة، مما تعذر استخدامه، وتمت مخاطبة القطاع أكثر من مرة بخصوص العطل الحاصل في الجهاز، وتم فتح سجل تواقيع خاص بتوثيق حضور ومغادرة الموظفين في المؤسسة بأمر إداري.',
  'لوحظ وجود هوامش السيد مدير المؤسسة على موقف البصمة، مع عدم وجود بصمة صباحية ومسائية، ولم يتم تثبيت الأسماء في سجل الحركة، ولم يتم منحهم استمارة حركة.',
  'يتم منح استراحات تعويضية للموظفين مقابل قيامهم بواجبات رسمية، وبأوامر إدارية.',
];

/* ------------------------------------------------------------ مجموعات التوصيات
   الجهات والحروف مصدرها options.js (قابلة للتعديل من المكتبة).
   العبارة التمهيدية تُبنى تلقائياً من اسم الجهة، وتدعم {القطاع} و{المؤسسة}. */
function recoGroups() {
  const entities = L.get('recommendationEntities');
  const letters = L.get('recommendationLetters');
  return entities.map((label, i) => ({
    key: 'g' + i,
    label,
    letter: letters[i] || '',
    preset: /^جهة أخرى/.test(label) ? '' : `الإيعاز إلى ${label} بما يلي:`,
  }));
}

/* ---------------------------------------------------------------------------
   ملاحظة: كل القوائم (أنواع الزيارة، المؤسسات، العناوين الوظيفية، الصفات，
   فئات الملاك، أنواع الإجراءات، أنواع المواقف، حالات التوصيات، أسماء السجلات，
   دوريات وجهات رفع الموقف) مصدرها options.js وقابلة للتعديل من
   «مكتبة العبارات» ← «قوائم الاختيار». لا قائمة مكتوبة هنا.
   --------------------------------------------------------------------------- */

/* فئات المخالفة في مواقف البصمة: المفاتيح ثابتة (يعتمد عليها منطق التقرير
   والمزامنة) والعناوين قابلة للتعديل من المكتبة. فئة جديدة تُنشأ بمفتاح مشتق. */
const POSITION_CAT_KEYS = ['absent', 'noExit', 'noEntry', 'noSurprise', 'noBoth'];

function slugKey(label, taken) {
  const map = { 'تغيب': 'absent', 'مغادرة': 'noExit', 'دخول': 'noEntry', 'مفاجئة': 'noSurprise', 'بصمتي': 'noBoth' };
  for (const k in map) if (label.includes(k)) return map[k];
  let base = 'c' + Math.abs(label.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7)).toString(36).slice(0, 6);
  let key = base, i = 2;
  while (taken.has(key)) { key = base + i++; }
  return key;
}

/** يبني فئات المواقف من القائمة القابلة للتعديل، مع الحفاظ على المفاتيح المعروفة */
function positionCats() {
  const labels = L.get('positionCategories');
  const taken = new Set();
  const out = [];
  labels.forEach((label, idx) => {
    let key = POSITION_CAT_KEYS[idx] && POSITION_CAT_KEYS[idx];
    /* استخدم المفتاح المعروف فقط إن كان عنوانه هو نفسه (لم يُعدَّل ترتيبه) */
    if (!key || taken.has(key)) key = slugKey(label, taken);
    taken.add(key);
    out.push({ k: key, t: label, hasJob: true, hasNote: true, hasList: true });
  });
  /* ضمان وجود الفئات المعروفة ولو حُذفت، حتى لا تفقد تقارير قديمة بياناتها */
  POSITION_CAT_KEYS.forEach((k, i) => {
    if (!out.some(c => c.k === k)) {
      out.push({ k, t: (L.get('positionCategories')[i] || k), hasJob: true, hasNote: true, hasList: true });
    }
  });
  return out;
}
/** المفتاح المستخدم لتخزين عناصر فئة معيّنة في تقرير محفوظ */
function catKeysFor() { return positionCats().map(c => c.k); }

/* ---------------------------------------------------------------- أدوات مساعدة */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

/**
 * ربط آمن لمعالج حدث. يتجاهل العنصر غير الموجود بدل أن يُسقط بقية الربط.
 * سبب وجوده: أي `.onclick =` على عنصر غير موجود يُطلق استثناءً يوقف
 * تنفيذ الدالة كلها، فتتعطّل كل الأزرار التي تليه.
 */
function bind(sel, type, handler) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) { console.warn('[bind] عنصر مفقود:', sel); return null; }
  el.addEventListener(type, handler);
  return el;
}
/* يربط عبر onclick مباشرةً (يسمح بالاستبدال) مع حماية من العنصر المفقود */
function bindOn(sel, handler) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) { console.warn('[bind] عنصر مفقود:', sel); return null; }
  el.onclick = handler;
  return el;
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** تحويل الأرقام العربية-الهندية إلى لاتينية حتى تُدخل وتُعالج بشكل موحّد */
function normalizeDigits(s) {
  return String(s == null ? '' : s).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
                                 .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

/** صياغة التاريخ dd/mm/yyyy */
function fmtDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${+m[3]}/${+m[2]}/${m[1]}`;
}
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function dayNameOf(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? '' : AR_DAYS[d.getDay()];
}
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** تنقية نص: مسافات مكرّرة، فراغات قبل الترقيم */
function tidy(s) {
  return normalizeDigits(String(s == null ? '' : s))
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\s+([،؛.])/g, '$1')
    .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
    .replace(/\s+-\s+/g, ' – ')
    .trim();
}
/** «العنوان – الاسم» مع تجاهل الفارغ */
function titleName(job, name) {
  const j = tidy(job), n = tidy(name);
  if (j && n) return `${j} – ${n}`;
  return j || n;
}
function toast(msg, kind, ms) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms || 2400);
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1200);
}
const safeName = s => tidy(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 70) || 'تقرير';

/** أرقام نظيفة لملف Word — الفراغ يظهر «—» بدل صفر مضلِّل */
function fmtNum(n) {
  const s = String(n == null ? '' : n).trim();
  if (!s) return '—';
  const v = parseInt(normalizeDigits(s), 10);
  return isNaN(v) ? s : String(v);
}

/** تحويل data URL إلى بايتات + نوع الصورة (لإدراج الشعار في ملف Word) */
function dataUrlToBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase();
  const type = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'bmp' ? 'png' : ext;
  let bin;
  try { bin = atob(m[2].replace(/\s+/g, '')); } catch (e) { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type };
}
/** قياس أبعاد صورة من data URL بشكل غير متزامن */
function measureDataUrl(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 120, h: img.naturalHeight || 90 });
    img.onerror = () => resolve({ w: 120, h: 90 });
    img.src = dataUrl;
  });
}

/* ---------------------------------------------------------------- الحالة */
const state = {
  report: null,
  reports: [],
  editingId: null,
  settings: null,
  library: null,
  logo: '',
  listKey: 'jobTitles',
};

/* ------------------------------------------------------------------ القوائم
   كل قائمة اختيار مصدرها options.js وقابلة للتعديل من «مكتبة العبارات».
   هذه الأغلفة تمنع تثبيت أي قائمة داخل الكود. */
const L = {
  get(key) {
    if (typeof window !== 'undefined' && window.ADMHLists) return window.ADMHLists.get(key);
    return [];
  },
  has(key) { return typeof window !== 'undefined' && !!window.ADMHLists && window.ADMHLists.has(key); },
  /** خيارات <select> مع تحديد القيمة الحالية */
  opt(key, selected) {
    return L.get(key).map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
  },
  /** خيارات <datalist> (اقتراحات) */
  data(key) {
    return L.get(key).map(v => `<option value="${esc(v)}"></option>`).join('');
  },
};

function blankReport() {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: '',
    visitType: (typeof window !== 'undefined' && window.ADMHLists)
      ? (window.ADMHLists.get('visitTypes')[0] || 'زيارة تفتيشية')
      : 'زيارة تفتيشية',
    facilityKind: 'مركز صحي',
    facilityName: '',
    sector: '',
    visitDate: todayISO(),
    dayName: '',
    bookNumber: '',
    population: '',
    families: '',
    /* نطاق التقرير: 'both' = بصمة + سجلات، 'fp' = بصمة فقط، 'rec' = سجلات فقط */
    scope: 'both',
    officials: [{ role: 'مدير المركز', job: '', name: '' }],
    /* الفئات المعتادة — تُنشأ مباشرةً حتى لا يحتاج المستخدم لإضافتها */
    staff: {
      'الملاك': { total: '', actual: '' },
      'الأطباء': { total: '', actual: '' },
      'أطباء الأسنان': { total: '', actual: '' },
      'الصيادلة': { total: '', actual: '' },
      'تقني طبي': { total: '', actual: '' },
      'ممرضين': { total: '', actual: '' },
      'إداريين': { total: '', actual: '' },
    },
    fp: { managerJob: '', managerName: '', deputyJob: '', deputyName: '', devices: '', deviceState: '', staff: '', adminCount: '', adminWhere: '', reportFreq: '', reportTo: '', notes: '' },
    procedures: [{ date: todayISO(), kind: 'سحب موقف', source: '', note: '' }],
    procExtra: '',
    general: [],
    positions: [],
    records: [],
    recGroups: [],
    prevRecs: [],
    signers: [{ name: '', job: '', date: todayISO() }],
    footerNote: '',
  };
}
function blankSettings() {
  return {
    l1: 'دائرة صحة بغداد/ الرصافة',
    l2: 'قسم التفتيش',
    l3: 'شعبة تفتيش المؤسسات الصحية الحكومية',
    font: 'Simplified Arabic',
    fontSize: '12',
    logo: '',
  };
}
const defaultLibrary = () => ({
  records: RECORD_PRESETS.slice(),
  reco: RECO_PRESETS.map(r => r.v),
  general: GENERAL_PRESETS.slice(),
});

/* ------------------------------------------------------------ قراءة وكتابة */
function jread(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { console.warn('read fail', key, e); return fallback; }
}
function jwrite(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { toast('تعذّر الحفظ — قد تكون مساحة التخزين ممتلئة', 'err', 4000); return false; }
}
function loadAll() {
  state.settings = Object.assign(blankSettings(), jread(LS_SETTINGS, {}));
  const lib = jread(LS_LIBRARY, null);
  state.library = lib && lib.records ? lib : defaultLibrary();
  ['records', 'reco', 'general'].forEach(k => { if (!Array.isArray(state.library[k])) state.library[k] = []; });
  state.logo = state.settings.logo || '';
  state.reports = jread(LS_REPORTS, []);
  if (!Array.isArray(state.reports)) state.reports = [];
  const draft = jread(LS_DRAFT, null);
  state.report = (draft && draft.report) ? migrate(draft.report) : blankReport();
  state.editingId = (draft && draft.editingId) || state.report.id || null;
}
/** ضمان وجود كل المفاتيح (للتقارير المحفوظة بنسخة أقدم) */
function migrate(r) {
  const b = blankReport();
  const out = Object.assign({}, b, r);
  out.fp = Object.assign({}, b.fp, r.fp || {});
  ['officials', 'procedures', 'general', 'positions', 'records', 'recGroups', 'prevRecs', 'signers'].forEach(k => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  if (!out.staff || typeof out.staff !== 'object') out.staff = {};
  Object.keys(out.staff).forEach(k => {
    const v = out.staff[k] || {};
    out.staff[k] = { total: v.total || '', actual: v.actual || '' };
  });
  return out;
}

/* -------------------------------------------------------- حفظ المسودة والأرشيف */
let draftTimer = null;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    jwrite(LS_DRAFT, { report: state.report, editingId: state.editingId, at: Date.now() });
    /* المؤشر في الشريط العلوي مخصّص لحالة المزامنة، فلا نلمسه هنا. */
  }, 500);
}
function saveToArchive(silent) {
  const idx = state.reports.findIndex(r => r.id === state.report.id);
  state.report.updatedAt = new Date().toISOString();
  if (idx >= 0) state.reports[idx] = JSON.parse(JSON.stringify(state.report));
  else state.reports.unshift(JSON.parse(JSON.stringify(state.report)));
  jwrite(LS_REPORTS, state.reports);
  refreshArchiveMeta();
  if (!silent) toast('تم الحفظ في الأرشيف', 'ok');
}

/* ---------------------------------------------------------------- بناء النموذج */
function renderAll() {
  fillSelectFrom($('#f_visitType'), L.get('visitTypes'), state.report.visitType);

  /* المسؤولون — القائمة #dlRoles معرّفة خارج الجدول وتملؤها fillDatalists */
  renderRows('#tOfficials tbody', 'officials', state.report.officials, (d) => `
      <td data-label="الصفة / المنصب"><input type="text" data-k="role" list="dlRoles" value="${esc(d.role || '')}" placeholder="اكتب أو اختر"></td>
      <td data-label="العنوان الوظيفي"><input type="text" data-k="job" list="dlJobs" value="${esc(d.job || '')}"></td>
      <td data-label="الاسم الثلاثي"><input type="text" data-k="name" value="${esc(d.name || '')}"></td>`);

  /* الملاك */
  renderStaff();

  /* السجلات */
  renderRecords();

  /* الملاحظات العامة */
  renderGeneral();

  /* المواقف */
  renderPositions();

  /* التوصيات */
  renderRecGroups();

  /* الإجراءات */
  renderRows('#tProcs tbody', 'procedures', state.report.procedures, (d, i) => `
    <td data-label="التاريخ"><input type="date" data-k="date" value="${esc(d.date || '')}"></td>
    <td data-label="نوع التدقيق"><select data-k="kind">
      ${L.get('procedureKinds').map(k => `<option${d.kind === k ? ' selected' : ''}>${esc(k)}</option>`).join('')}
    </select></td>
    <td data-label="جهة السحب / المصدر"><input type="text" data-k="source" placeholder="مثال: موظفي المركز" value="${esc(d.source || '')}"></td>
    <td data-label="ملاحظة إضافية"><input type="text" data-k="note" placeholder="اختياري" value="${esc(d.note || '')}"></td>`);

  /* التوصيات السابقة */
  renderRows('#tPrevRecs tbody', 'prevRecs', state.report.prevRecs, d => `
    <td class="num"></td>
    <td data-label="التوصية السابقة"><textarea data-k="text" rows="2">${esc(d.text || '')}</textarea></td>
    <td data-label="الحالة"><select data-k="status">
      ${L.get('prevRecStatuses').map(s => `<option${d.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
    </select></td>
    <td data-label="ملاحظة"><input type="text" data-k="note" value="${esc(d.note || '')}"></td>`, true);

  /* التوقيعات */
  renderRows('#tSigners tbody', 'signers', state.report.signers, d => `
    <td class="num"></td>
    <td data-label="الاسم الثلاثي"><input type="text" data-k="name" value="${esc(d.name || '')}"></td>
    <td data-label="العنوان الوظيفي"><input type="text" data-k="job" list="dlJobs" value="${esc(d.job || '')}"></td>
    <td data-label="التاريخ"><input type="date" data-k="date" value="${esc(d.date || '')}"></td>`);

  /* الحقول المفردة */
  setVal('#f_facilityName', state.report.facilityName);
  setVal('#f_sector', state.report.sector);
  setVal('#f_visitDate', state.report.visitDate);
  setVal('#f_dayName', state.report.dayName || dayNameOf(state.report.visitDate));
  setVal('#f_bookNumber', state.report.bookNumber);
  setVal('#f_population', state.report.population);
  setVal('#f_families', state.report.families);
  setVal('#f_fpManagerJob', state.report.fp.managerJob);
  setVal('#f_fpManagerName', state.report.fp.managerName);
  setVal('#f_fpDeputyJob', state.report.fp.deputyJob);
  setVal('#f_fpDeputyName', state.report.fp.deputyName);
  setVal('#f_fpDevices', state.report.fp.devices);
  setVal('#f_fpDeviceState', state.report.fp.deviceState);
  setVal('#f_fpStaff', state.report.fp.staff);
  setVal('#f_fpAdminCount', state.report.fp.adminCount);
  setVal('#f_fpAdminWhere', state.report.fp.adminWhere);
  setVal('#f_fpReportFreq', state.report.fp.reportFreq);
  setVal('#f_fpReportTo', state.report.fp.reportTo);
  setVal('#f_fpNotes', state.report.fp.notes);
  setVal('#f_procExtra', state.report.procExtra);
  setVal('#f_footerNote', state.report.footerNote);
  setVal('#f_visitDateTop', state.report.visitDate);

  /* الترويسة والعنوان */
  updateTitle();
  fillDatalists();
}
/** يملأ قائمة منسدلة من قائمة قابلة للتعديل، ويُبقي قيمة التقرير حتى لو حُذفت من القائمة */
function fillSelectFrom(sel, list, value) {
  if (!sel) return;
  sel.innerHTML = list.map(v => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(v)}</option>`).join('');
  if (value && !list.includes(value)) {
    sel.insertAdjacentHTML('afterbegin', `<option value="${esc(value)}" selected>${esc(value)}</option>`);
  }
}
/** يملأ حقل اقتراحات (datalist) من قائمة قابلة للتعديل */
function fillDatalist(sel, key) { const e = typeof sel === 'string' ? $(sel) : sel; if (e) e.innerHTML = L.data(key); }
function setVal(sel, v) { const e = $(sel); if (e) e.value = (v == null ? '' : v); }

/** صفوف جداول عامة: حقل data-k + زر حذف */
function renderRows(tbodySel, listKey, arr, cellFn, indexFirst) {
  const tb = $(tbodySel);
  if (!tb) return;
  if (!arr.length) {
    tb.innerHTML = `<tr><td colspan="9" class="empty">لا توجد صفوف — استخدم زر الإضافة أدناه</td></tr>`;
    return;
  }
  tb.innerHTML = arr.map((d, i) => {
    const num = indexFirst ? `<td class="num">${i + 1}</td>` : '';
    return `<tr data-i="${i}">${num}${cellFn(d, i)}<td class="no-print"><button class="btn danger icon" data-del="${listKey}" data-i="${i}" title="حذف">✕</button></td></tr>`;
  }).join('');
}
function renderStaff() {
  const tb = $('#tStaff tbody');
  const keys = Object.keys(state.report.staff);
  if (!keys.length) { tb.innerHTML = `<tr><td colspan="3" class="empty">لا توجد فئات</td></tr>`; return; }
  tb.innerHTML = keys.map(k => {
    const v = state.report.staff[k];
    return `<tr data-k="${esc(k)}">
      <td data-label="الفئة"><input type="text" data-f="cat" value="${esc(k)}"></td>
      <td data-label="الملاك الكلي"><input type="number" min="0" inputmode="numeric" data-f="total" value="${esc(v.total)}"></td>
      <td data-label="الملاك الفعلي"><input type="number" min="0" inputmode="numeric" data-f="actual" value="${esc(v.actual)}"></td>
    </tr>`;
  }).join('');
}
function renderRecords() {
  const tb = $('#tRecords tbody');
  if (!state.report.records.length) {
    tb.innerHTML = `<tr><td colspan="4" class="empty">لا توجد سجلات — استخدم «إضافة كل السجلات المعتادة»</td></tr>`;
    return;
  }
  const presets = state.library.records || RECORD_PRESETS;
  tb.innerHTML = state.report.records.map((r, i) => {
    const picked = Array.isArray(r.evalList) ? r.evalList : [];
    /* قائمة التقييمات الجاهزة: اختيار متعدد بالنقر */
    const chips = presets.map((p, pi) => {
      const on = picked.includes(p);
      return `<span class="chip${on ? ' ok' : ''}" data-pick="${i}|${pi}" title="${esc(p)}">${on ? '✓ ' : ''}${esc(p.length > 52 ? p.slice(0, 52) + '…' : p)}</span>`;
    }).join('');
    return `
    <tr data-i="${i}">
      <td class="num">${i + 1}</td>
      <td data-label="اسم السجل"><input type="text" data-f="name" value="${esc(r.name || '')}"></td>
      <td data-label="التقييم">
        <div class="pbody" data-rec-picks="${i}">${chips}</div>
        <textarea data-f="eval" data-manual="${i}" rows="2" placeholder="تقييم مكتوب بيدك (اختياري) — يُضاف إلى ما اخترته أعلاه">${esc(r.evalManual || '')}</textarea>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn ghost sm no-print" data-recclear="${i}">تفريغ التقييم</button>
          <button class="btn ghost sm no-print" data-recmore="${i}">تقييمات إضافية…</button>
        </div>
      </td>
      <td class="no-print"><button class="btn danger icon" data-del="records" data-i="${i}" title="حذف">✕</button></td>
    </tr>`;
  }).join('');
}
function renderGeneral() {
  const box = $('#genNotes');
  if (!state.report.general.length) { box.innerHTML = `<p class="hint">لا ملاحظات عامة.</p>`; return; }
  box.innerHTML = state.report.general.map((g, i) => `
    <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
      <textarea data-g="${i}" rows="2" placeholder="نص الملاحظة">${esc(g)}</textarea>
      <button class="btn danger icon no-print" data-del="general" data-i="${i}" title="حذف">✕</button>
    </div>`).join('');
}
function renderPositions() {
  const box = $('#positions');
  if (!state.report.positions.length) {
    box.innerHTML = `<p class="hint">لا مواقف. اضغط «+ موقف بصمة / حضور» لإضافة يوم تدقيق.</p>`;
    return;
  }
  box.innerHTML = state.report.positions.map((p, pi) => `
    <div class="card" style="box-shadow:none;background:var(--hover);margin-bottom:12px" data-pi="${pi}">
      <div class="grid">
        <div class="f"><label>تاريخ الموقف</label><input type="date" data-p="date" value="${esc(p.date || '')}"></div>
        <div class="f"><label>اليوم</label><input type="text" data-p="day" value="${esc(p.day || dayNameOf(p.date))}"></div>
        <div class="f"><label>بداية العبارة</label>
          <select data-p="verb">
            ${L.get('positionVerbs').map(v => `<option${p.verb === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div class="f"><label>نوع الموقف</label>
          <select data-p="kind">
            ${L.get('positionKinds').map(v => `<option${p.kind === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div class="f wide"><label>عبارة تمهيدية (اختياري)</label><input type="text" data-p="intro" placeholder="اتركه فارغاً لتوليد العبارة تلقائياً" value="${esc(p.intro || '')}"></div>
      </div>

      ${positionCats().map(c => {
        const rows = (p.items && p.items[c.k]) || [];
        return `<div style="margin-top:12px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span class="chip">${esc(c.t)}</span>
            <span class="pill">${rows.length}</span>
            <span style="flex:1"></span>
            <button class="btn ghost sm no-print" data-padd="${pi}|${c.k}">+ اسم</button>
          </div>
          ${rows.length ? `<div class="tw" style="margin-top:0">
            <table style="min-width:440px"><tbody>
            ${rows.map((it, ii) => `<tr data-pi="${pi}" data-cat="${c.k}" data-ii="${ii}">
              ${c.hasJob ? `<td data-label="العنوان الوظيفي"><input type="text" data-it="job" list="dlJobs" placeholder="مثال: م. طبي" value="${esc(it.job || '')}"></td>` : ''}
              <td data-label="الاسم الثلاثي"><input type="text" data-it="name" placeholder="الاسم" value="${esc(it.name || '')}"></td>
              <td data-label="ملاحظة"><input type="text" data-it="note" placeholder="اختياري" value="${esc(it.note || '')}"></td>
              <td class="no-print" style="width:48px"><button class="btn danger icon" data-pdel="${pi}|${c.k}|${ii}">✕</button></td>
            </tr>`).join('')}
            </tbody></table></div>` : ''}
        </div>`;
      }).join('')}

      <div class="btnrow no-print">
        <button class="btn danger sm" data-pdelall="${pi}">حذف هذا الموقف</button>
      </div>
    </div>`).join('');
}
function renderRecGroups() {
  const box = $('#recGroups');
  if (!state.report.recGroups.length) {
    box.innerHTML = `<p class="hint">لا توصيات. استخدم «إضافة الجهات المعتادة».</p>`;
    return;
  }
  box.innerHTML = state.report.recGroups.map((g, gi) => `
    <div class="card" style="box-shadow:none;background:var(--hover);margin-bottom:12px">
      <div class="grid">
        <div class="f"><label>الحرف</label><input type="text" data-g="letter" value="${esc(g.letter || '')}" placeholder="أ"></div>
        <div class="f wide"><label>الجهة / العنوان</label><input type="text" data-g="label" value="${esc(g.label || '')}" placeholder="إدارة القطاع"></div>
        <div class="f wide"><label>العبارة التمهيدية</label><input type="text" data-g="intro" value="${esc(g.intro || '')}" placeholder="الإيعاز إلى إدارة القطاع بما يلي:"></div>
      </div>
      <div style="margin-top:10px" data-gitems="${gi}">
        ${(g.items || []).map((it, ii) => `
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
            <span class="pill" style="margin-top:9px">${ii + 1}</span>
            <textarea data-gi="${gi}|${ii}" rows="2" placeholder="نص التوصية">${esc(it)}</textarea>
            <button class="btn danger icon no-print" data-gdel="${gi}|${ii}" title="حذف">✕</button>
          </div>`).join('') || '<p class="hint">لا بنود.</p>'}
      </div>
      <div class="btnrow no-print">
        <button class="btn ghost sm" data-gadd="${gi}">+ بند</button>
        <button class="btn ghost sm" data-glib="${gi}">📚 من المكتبة</button>
        <button class="btn danger sm" data-gdelall="${gi}">حذف الجهة</button>
      </div>
    </div>`).join('');
}
function fillDatalists() {
  /* قوائم الاقتراحات — كلها من المكتبة القابلة للتعديل */
  fillDatalist('#dlJobs', 'jobTitles');
  fillDatalist('#dlRoles', 'officialRoles');
  fillDatalist('#dlDeviceState', 'deviceStates');

  /* القوائم المنسدلة الثابتة — تُبنى من المكتبة أيضاً */
  const fk = $('#f_facilityKind');
  if (fk) fk.innerHTML = L.opt('facilityKinds', state.report ? state.report.facilityKind : fk.value);

  const fr = $('#f_fpReportFreq');
  if (fr) fr.innerHTML = `<option value="">— بدون —</option>` + L.opt('reportFreqs', state.report ? state.report.fp.reportFreq : fr.value);
  const ft = $('#f_fpReportTo');
  if (ft) ft.innerHTML = `<option value="">— بدون —</option>` + L.opt('reportTargets', state.report ? state.report.fp.reportTo : ft.value);

  /* المؤسسات والقطاعات المستخلصة من التقارير السابقة */
  const facs = [...new Set(state.reports.map(r => r.facilityName).filter(Boolean))];
  const dlF = $('#dlFacilities'); if (dlF) dlF.innerHTML = facs.map(f => `<option value="${esc(f)}">`).join('');
  const secs = [...new Set(state.reports.map(r => r.sector).filter(Boolean))];
  const dlS = $('#dlSectors'); if (dlS) dlS.innerHTML = secs.map(s => `<option value="${esc(s)}">`).join('');
}
function updateTitle() {
  const r = state.report;
  /* العنوان المُولَّد تلقائياً يتبع نوع المؤسسة والجهة التابعة.
     إن عدّله المستخدم بيده نحترم تعديله ولا نستبدله. */
  const t = r.titleEdited ? tidy(r.title) : autoTitle(r);
  const e = $('#reportTitleBox');
  if (e && document.activeElement !== e && e.value !== t) e.value = t;
  $('#brand').textContent = t.slice(0, 60) || 'نظام التقارير التفتيشية';
  const scopeLabel = { both: 'البصمة والسجلات', fp: 'البصمة فقط', rec: 'السجلات فقط' }[r.scope || 'both'];
  $('#previewMeta').textContent = [tidy(r.facilityName), fmtDate(r.visitDate), tidy(r.visitType), scopeLabel].filter(Boolean).join(' · ');
}
function autoTitle(r) {
  const kind = tidy(r.facilityKind) || 'مركز صحي';
  const name = tidy(r.facilityName);
  const sec = tidy(r.sector);
  /* نستخدم حرف الجر المناسب لنوع المؤسسة: إلى مستشفى / إلى مركز صحي / إلى قطاع */
  const prep = /^(مستشفى|مركز|قطاع)/.test(kind) ? 'إلى' : 'إلى';
  const head = `تقرير ${tidy(r.visitType) || 'زيارة تفتيشية'} ${prep} ${kind}`;
  if (!name) return head;
  return sec ? `${head} ${name} التابع إلى ${sec}` : `${head} ${name}`;
}

/* ---------------------------------------------------------------- إعادة الرسم */
function rerender(part) {
  if (part === 'officials') renderRows('#tOfficials tbody', 'officials', state.report.officials, (d) => `
    <td><input type="text" data-k="role" list="dlRoles" value="${esc(d.role || '')}" placeholder="اكتب أو اختر"></td>
    <td><input type="text" data-k="job" list="dlJobs" value="${esc(d.job || '')}"></td>
    <td><input type="text" data-k="name" value="${esc(d.name || '')}"></td>`);
  else if (part === 'procedures') renderRows('#tProcs tbody', 'procedures', state.report.procedures, (d) => `
    <td data-label="التاريخ"><input type="date" data-k="date" value="${esc(d.date || '')}"></td>
    <td data-label="نوع التدقيق"><select data-k="kind">
      ${L.get('procedureKinds').map(k => `<option${d.kind === k ? ' selected' : ''}>${esc(k)}</option>`).join('')}
    </select></td>
    <td data-label="جهة السحب / المصدر"><input type="text" data-k="source" placeholder="مثال: موظفي المركز" value="${esc(d.source || '')}"></td>
    <td data-label="ملاحظة إضافية"><input type="text" data-k="note" placeholder="اختياري" value="${esc(d.note || '')}"></td>`);
  else if (part === 'prevRecs') renderRows('#tPrevRecs tbody', 'prevRecs', state.report.prevRecs, d => `
    <td class="num"></td>
    <td data-label="التوصية السابقة"><textarea data-k="text" rows="2">${esc(d.text || '')}</textarea></td>
    <td data-label="الحالة"><select data-k="status">
      ${L.get('prevRecStatuses').map(s => `<option${d.status === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
    </select></td>
    <td data-label="ملاحظة"><input type="text" data-k="note" value="${esc(d.note || '')}"></td>`, true);
  else if (part === 'signers') renderRows('#tSigners tbody', 'signers', state.report.signers, d => `
    <td class="num"></td>
    <td data-label="الاسم الثلاثي"><input type="text" data-k="name" value="${esc(d.name || '')}"></td>
    <td data-label="العنوان الوظيفي"><input type="text" data-k="job" list="dlJobs" value="${esc(d.job || '')}"></td>
    <td data-label="التاريخ"><input type="date" data-k="date" value="${esc(d.date || '')}"></td>`);
  else if (part === 'records') renderRecords();
  else if (part === 'general') renderGeneral();
  else if (part === 'positions') renderPositions();
  else if (part === 'recGroups') renderRecGroups();
  else if (part === 'staff') renderStaff();
}

/* ---------------------------------------------------------------- أحداث النموذج */
function bindForm() {
  const R = () => state.report;

  /* مُغلِف ربط حقل مفرد: يقرأ القيمة من العنصر داخل المعالج */
  function onInput(sel, fn) {
    const e = $(sel);
    if (!e) { console.warn('[bindForm] حقل مفقود:', sel); return; }
    const h = () => { fn(e.value); saveDraft(); };
    e.addEventListener('input', h);
    e.addEventListener('change', h);
  }

  onInput('#reportTitleBox', v => { R().title = tidy(v); R().titleEdited = true; updateTitle(); });
  onInput('#f_facilityName', v => { R().facilityName = tidy(v); });
  onInput('#f_sector', v => { R().sector = tidy(v); });
  onInput('#f_visitDateTop', v => { R().visitDate = v; $('#f_visitDate').value = v; R().dayName = dayNameOf(v); $('#f_dayName').value = R().dayName; updateTitle(); });
  onInput('#f_visitDate', v => { R().visitDate = v; $('#f_visitDateTop').value = v; R().dayName = dayNameOf(v); $('#f_dayName').value = R().dayName; updateTitle(); });
  onInput('#f_dayName', v => { R().dayName = tidy(v); });
  onInput('#f_bookNumber', v => { R().bookNumber = tidy(v); });
  onInput('#f_population', v => { R().population = normalizeDigits(v); });
  onInput('#f_families', v => { R().families = normalizeDigits(v); });
  onInput('#f_visitType', v => { R().visitType = v; updateTitle(); });
  onInput('#f_facilityKind', v => { R().facilityKind = v; updateTitle(); });
  /* نطاق التقرير: بصمة / سجلات / كلاهما */
  $$('input[name="f_scope"]').forEach(r => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      R().scope = r.value;
      saveDraft(); applyScope(); updateTitle();
    });
  });
  Object.keys(blankReport().fp).forEach(k => {
    const sel = '#f_fp' + k.charAt(0).toUpperCase() + k.slice(1);
    onInput(sel, v => { R().fp[k] = tidy(v); });
  });
  onInput('#f_procExtra', v => { R().procExtra = v; });
  onInput('#f_footerNote', v => { R().footerNote = tidy(v); });

  /* مفوَّض واحد لكل أحداث الإدخال: أبقى وأبسط من ربط كل جدول على حدة */
  document.addEventListener('input', e => {
    const t = e.target;
    if (!t || !t.dataset) return;
    const rec = state.report;

    /* الصفّ الحاوي. ملاحظة مهمة: لا نستخدم closest('tr[data-i]') لأن صفوف
       الملاك تحمل data-k لا data-i، فيكون الناتج null ويُتجاهل الحقل.
       (كان هذا خطأً حقيقياً: الكتابة في جدول الملاك لم تكن تُحفظ إطلاقاً.) */
    const row = t.closest ? t.closest('tr') : null;

    /* جداول مرتبطة بالفهرس (المسؤولون، الإجراءات، التوصيات السابقة، التوقيعات) */
    if (row && row.dataset.i !== undefined && t.dataset.k) {
      const table = row.closest('table');
      const host = table ? table.id : '';
      const key = { tOfficials: 'officials', tProcs: 'procedures', tPrevRecs: 'prevRecs', tSigners: 'signers' }[host];
      const i = +row.dataset.i;
      if (key && Array.isArray(rec[key]) && rec[key][i]) {
        rec[key][i][t.dataset.k] = tidy(t.value);
        saveDraft();
      }
      return;
    }

    /* السجلات: الاسم + التقييم اليدوي */
    if (row && t.dataset.f && row.closest('table') && row.closest('table').id === 'tRecords') {
      const i = +row.dataset.i;
      if (rec.records[i]) {
        if (t.dataset.f === 'name') rec.records[i].name = tidy(t.value);
        else { rec.records[i].evalManual = t.value; recomputeRecordEval(i, true); }
        saveDraft();
      }
      return;
    }

    /* جداول الملاك (المفتاح اسم الفئة، لا فهرس) */
    if (row && t.dataset.f && row.dataset.k !== undefined) {
      const oldKey = row.dataset.k, f = t.dataset.f;
      if (f !== 'cat') {
        if (!rec.staff[oldKey]) rec.staff[oldKey] = { total: '', actual: '' };
        rec.staff[oldKey][f] = normalizeDigits(t.value);
        saveDraft();
      }
      return;
    }

    /* الملاحظات العامة */
    if (t.dataset.g !== undefined) {
      const i = +t.dataset.g;
      if (!isNaN(i) && rec.general[i] !== undefined) { rec.general[i] = t.value; saveDraft(); }
      return;
    }
  });

  /* اختيار التقييمات الجاهزة للسجلات (نقر على الشرائح) */
  bind('#tRecords', 'click', e => {
    const t = e.target;

    const pick = t.closest('[data-pick]');
    if (pick) {
      const [i, pi] = pick.dataset.pick.split('|').map(Number);
      const rec = state.report.records[i];
      const presets = state.library.records || RECORD_PRESETS;
      const val = presets[pi];
      if (!rec || val === undefined) return;
      if (!Array.isArray(rec.evalList)) rec.evalList = [];
      const at = rec.evalList.indexOf(val);
      if (at >= 0) rec.evalList.splice(at, 1); else rec.evalList.push(val);
      /* تحديث الشريحة فوراً دون إعادة رسم الجدول */
      const on = rec.evalList.includes(val);
      pick.classList.toggle('ok', on);
      pick.textContent = (on ? '✓ ' : '') + (val.length > 52 ? val.slice(0, 52) + '…' : val);
      recomputeRecordEval(i, true);
      saveDraft();
      return;
    }

    const clr = t.closest('[data-recclear]');
    if (clr) {
      const i = +clr.dataset.recclear;
      const rec = state.report.records[i];
      if (!rec) return;
      rec.evalList = []; rec.evalManual = ''; rec.eval = '';
      rerender('records'); saveDraft();
      return;
    }

    const more = t.closest('[data-recmore]');
    if (more) { openRecordFiller(+more.dataset.recmore); return; }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (!t || !t.dataset) return;
    const rec = state.report;
    const row = t.closest ? t.closest('tr') : null;
    if (row && row.dataset.i !== undefined && t.tagName === 'SELECT' && t.dataset.k) {
      const table = row.closest('table');
      const host = table ? table.id : '';
      const key = { tOfficials: 'officials', tProcs: 'procedures', tPrevRecs: 'prevRecs', tSigners: 'signers' }[host];
      const i = +row.dataset.i;
      if (key && Array.isArray(rec[key]) && rec[key][i]) { rec[key][i][t.dataset.k] = t.value; saveDraft(); }
    }
  });

  /* الملاك: تغيير اسم الفئة */
  bind('#tStaff tbody', 'change', e => {
    const t = e.target;
    if (!t || t.dataset.f !== 'cat') return;
    const tr = t.closest('tr'); if (!tr) return;
    const oldKey = tr.dataset.k, nk = tidy(t.value);
    if (!nk || nk === oldKey) return;
    const out = {};
    Object.keys(state.report.staff).forEach(k => { out[k === oldKey ? nk : k] = state.report.staff[k]; });
    state.report.staff = out;
    tr.dataset.k = nk;
    saveDraft();
  });

  /* المواقف */
  bind('#positions', 'input', e => {
    const t = e.target;
    const p = t.closest('[data-pi]');
    if (!p) return;
    const pi = +p.dataset.pi;
    const pos = state.report.positions[pi];
    if (!pos) return;
    if (t.dataset.p) {
      const k = t.dataset.p;
      pos[k] = k === 'date' ? t.value : tidy(t.value);
      if (k === 'date') {
        pos.day = dayNameOf(t.value);
        const dayInp = p.querySelector('[data-p="day"]');
        if (dayInp) dayInp.value = pos.day;
      }
      saveDraft(); return;
    }
    const row = t.closest('tr[data-ii]');
    if (!row) return;
    const cat = row.dataset.cat, ii = +row.dataset.ii, it = t.dataset.it;
    if (it && pos.items[cat] && pos.items[cat][ii]) {
      pos.items[cat][ii][it] = tidy(t.value);
      saveDraft();
    }
  });
  bind('#positions', 'change', e => {
    const t = e.target;
    const p = t.closest('[data-pi]');
    if (p && t.dataset.p && t.tagName === 'SELECT') {
      const pos = state.report.positions[+p.dataset.pi];
      if (pos) { pos[t.dataset.p] = t.value; saveDraft(); }
    }
  });

  /* التوصيات */
  bind('#recGroups', 'input', e => {
    const t = e.target;
    const gi = Array.from($('#recGroups').children).indexOf(t.closest('.card'));
    if (gi < 0) return;
    const g = state.report.recGroups[gi];
    if (!g) return;
    if (t.dataset.g) { g[t.dataset.g] = tidy(t.value); saveDraft(); return; }
    if (t.dataset.gi) {
      const [a, b] = t.dataset.gi.split('|').map(Number);
      const grp = state.report.recGroups[a];
      if (grp && grp.items[b] !== undefined) { grp.items[b] = t.value; saveDraft(); }
    }
  });

  /* السجلات: الاختيار المتعدد يُعالَج في مستمع النقر أعلاه */

  /* الأزرار: مستمع واحد لكل النقرات */
  document.addEventListener('click', onClick);
}

/** دمج التقييمات المختارة + النص اليدوي في نص واحد */
function recomputeRecordEval(i) {
  const rec = state.report.records[i];
  if (!rec) return;
  const picked = (rec.evalList || []).slice();
  const manual = tidy(rec.evalManual || '');
  const parts = picked.map(tidy).filter(Boolean);
  if (manual) parts.push(manual);
  rec.eval = parts.join(' ').replace(/\s+/g, ' ').trim();
  const ta = $(`#tRecords tr[data-i="${i}"] [data-f="eval"]`);
  if (ta && document.activeElement !== ta) ta.value = rec.eval;
}


/* ---------------------------------------------------------------- معالجة النقر */
const ADDERS = {
  officials: () => { state.report.officials.push({ role: '', job: '', name: '' }); rerender('officials'); },
  /* المفتاح يطابق data-add في HTML */
  procs: () => { state.report.procedures.push({ date: state.report.visitDate || todayISO(), kind: 'سحب موقف', source: '', note: '' }); rerender('procedures'); },
  prevRecs: () => { state.report.prevRecs.push({ text: '', status: 'منفذة', note: '' }); rerender('prevRecs'); },
  signers: () => { state.report.signers.push({ name: '', job: '', date: state.report.visitDate || todayISO() }); rerender('signers'); },
  records: () => { state.report.records.push({ name: '', eval: '' }); rerender('records'); },
  genNotes: () => { state.report.general.push(''); rerender('general'); },
  position: () => {
    const d = state.report.visitDate || todayISO();
    state.report.positions.push({
      date: d, day: dayNameOf(d), verb: 'بعد تدقيق', kind: 'موقف البصمة',
      intro: '', items: { absent: [], noExit: [], noEntry: [], noSurprise: [], noBoth: [] },
    });
    rerender('positions');
  },
  recGroup: () => { state.report.recGroups.push({ letter: '', label: '', intro: '', items: [''] }); rerender('recGroups'); },
};

function onClick(e) {
  const t = e.target;

  /* إضافة صفوف */
  const add = t.closest('[data-add]');
  if (add) { const k = add.dataset.add; if (ADDERS[k]) { ADDERS[k](); saveDraft(); } return; }

  /* حذف صف (data-del) */
  const del = t.closest('[data-del]');
  if (del) {
    const key = del.dataset.del, i = +del.dataset.i;
    if (key === 'general') state.report.general.splice(i, 1);
    else if (Array.isArray(state.report[key])) state.report[key].splice(i, 1);
    rerender(key === 'general' ? 'general' : key);
    saveDraft(); return;
  }

  /* إضافة اسم لموقف */
  const pa = t.closest('[data-padd]');
  if (pa) {
    const [pi, cat] = pa.dataset.padd.split('|');
    state.report.positions[+pi].items[cat].push({ job: '', name: '', note: '' });
    rerender('positions'); saveDraft(); return;
  }
  /* حذف اسم من موقف */
  const pd = t.closest('[data-pdel]');
  if (pd) {
    const [pi, cat, ii] = pd.dataset.pdel.split('|');
    state.report.positions[+pi].items[cat].splice(+ii, 1);
    rerender('positions'); saveDraft(); return;
  }
  /* حذف موقف كامل */
  const pda = t.closest('[data-pdelall]');
  if (pda) {
    if (!confirm('حذف هذا الموقف وكل الأسماء فيه؟')) return;
    state.report.positions.splice(+pda.dataset.pdelall, 1);
    rerender('positions'); saveDraft(); return;
  }
  /* بند توصية */
  const ga = t.closest('[data-gadd]');
  if (ga) { state.report.recGroups[+ga.dataset.gadd].items.push(''); rerender('recGroups'); saveDraft(); return; }
  const gd = t.closest('[data-gdel]');
  if (gd) {
    const [gi, ii] = gd.dataset.gdel.split('|').map(Number);
    state.report.recGroups[gi].items.splice(ii, 1);
    rerender('recGroups'); saveDraft(); return;
  }
  const gda = t.closest('[data-gdelall]');
  if (gda) {
    if (!confirm('حذف هذه الجهة وكل بنودها؟')) return;
    state.report.recGroups.splice(+gda.dataset.gdelall, 1);
    rerender('recGroups'); saveDraft(); return;
  }
  /* مكتبة لجهة معيّنة — إلحاق البنود المحددة، بلا استبدال */
  const gl = t.closest('[data-glib]');
  if (gl) {
    const gi = +gl.dataset.glib;
    openLibrary('reco', values => {
      const add = (Array.isArray(values) ? values : [values]).map(tidy).filter(Boolean);
      const g = state.report.recGroups[gi];
      if (!g || !add.length) return;
      /* أزل بنداً فارغاً وحيداً قبل الإلحاق */
      if (g.items.length === 1 && !tidy(g.items[0])) g.items = [];
      add.forEach(v => g.items.push(v));
      rerender('recGroups'); saveDraft();
      toast(`أُضيف ${add.length} بنداً`, 'ok');
    }, { multi: true });
    return;
  }

  /* التنقل */
  const go = t.closest('[data-go]');
  if (go) { showView(go.dataset.go); return; }

  /* إغلاق النوافذ */
  const x = t.closest('[data-close]');
  if (x) { closeModal(x.closest('.modal')); return; }
}

/** يطبّق نطاق التقرير: بصمة فقط / سجلات فقط / كلاهما */
function applyScope() {
  const scope = state.report.scope || 'both';
  const showFp = scope === 'both' || scope === 'fp';
  const showRec = scope === 'both' || scope === 'rec';
  const setDisp = (sel, on) => { const e = $(sel); if (e) e.style.display = on ? '' : 'none'; };

  setDisp('#cardFingerprint', showFp);
  setDisp('#cardRecords', showRec);
  setDisp('#cardProcedures', showFp || showRec);
  $$('[data-scope="fp"]').forEach(e => { e.style.display = showFp ? '' : 'none'; });
  $$('[data-scope="rec"]').forEach(e => { e.style.display = showRec ? '' : 'none'; });
  updateTitle();
}

/* ---------------------------------------------------------------- أزرار عامة */
function bindButtons() {
  /* كل الربط عبر bindOn: عنصر مفقود يُسجَّل تحذيراً ولا يُسقط بقية الربط. */

  /* المسؤولون المعتادون */
  bindOn('#btnStdOfficials', () => {
    const std = [
      { role: 'مدير المركز', job: '', name: '' },
      { role: 'الرديف', job: '', name: '' },
      { role: 'مسؤول الإدارة والخدمات', job: '', name: '' },
      { role: 'الرديف / مسؤول الإدارة والخدمات', job: '', name: '' },
    ];
    /* أزل الصفوف الفارغة تماماً، ثم أضف ما ليس له صفة مطابقة */
    const rec = state.report;
    rec.officials = rec.officials.filter(o => tidy(o.role) || tidy(o.job) || tidy(o.name));
    const usedRoles = new Set(rec.officials.map(o => tidy(o.role)));
    let n = 0;
    std.forEach(a => {
      if (!usedRoles.has(a.role)) { rec.officials.push(Object.assign({}, a)); usedRoles.add(a.role); n++; }
    });
    rerender('officials'); saveDraft();
    toast(n ? `أُضيف ${n} صفاً` : 'الصفوف المعتادة موجودة مسبقاً', n ? 'ok' : 'warn');
  });

  /* كل السجلات المعتادة */
  bindOn('#btnAllRecords', () => {
    const have = new Set(state.report.records.map(r => tidy(r.name)));
    let n = 0;
    L.get('recordNames').forEach(name => { if (!have.has(name)) { state.report.records.push({ name, eval: '', evalList: [], evalManual: '' }); n++; } });
    rerender('records'); saveDraft(); toast(n ? `أُضيف ${n} سجلاً` : 'كل السجلات موجودة', 'ok');
  });

  /* تعبئة تقييمات جاهزة — تُفتح من داخل صف السجل (data-recmore) */

  /* تقييم جماعي */
  bindOn('#btnBulkRecords', () => {
    $('#bulkText').value = '';
    $('#bulkPresets').innerHTML = (state.library.records || []).map(v =>
      `<span class="chip" data-bp="${esc(v)}">${esc(v.slice(0, 44))}${v.length > 44 ? '…' : ''}</span>`).join('');
    $('#bulkPresets').onclick = e => { const c = e.target.closest('[data-bp]'); if (c) $('#bulkText').value = c.dataset.bp; };
    openModal('#bulkModal');
  });
  bindOn('#bulkFillEmpty', () => bulkApply(false));
  bindOn('#bulkFillAll', () => bulkApply(true));

  /* الجهات المعتادة — من قائمة «جهات التوصيات» القابلة للتعديل */
  bindOn('#btnStdRecs', () => {
    const have = new Set(state.report.recGroups.map(g => g.label));
    recoGroups().forEach(g => {
      if (!have.has(g.label)) state.report.recGroups.push({ letter: g.letter, label: g.label, intro: g.preset, items: [''] });
    });
    rerender('recGroups'); saveDraft(); toast('أُضيفت الجهات', 'ok');
  });

  /* أزرار المكتبة داخل الأقسام — يُربط كل واحد بما يناسبه أدناه */

  /* تصدير / معاينة / حفظ */
  bindOn('#btnWord', () => exportWord());
  bindOn('#btnWord2', () => exportWord());
  bindOn('#btnPreviewGo', () => showView('preview'));
  bindOn('#btnPrint', () => { showView('preview'); setTimeout(() => window.print(), 250); });
  bindOn('#btnSaveLocal', () => saveToArchive());

  /* جديد */
  bindOn('#btnNew', () => {
    if (!confirm('إنشاء تقرير جديد؟ سيُحفظ الحالي في الأرشيف أولاً.')) return;
    saveToArchive(true);
    state.report = blankReport();
    state.editingId = state.report.id;
    renderAll(); applyScope(); saveDraft(); showView('report');
    toast('تقرير جديد جاهز', 'ok');
  });

  /* الأرشيف */
  bindOn('#btnExportAll', exportArchiveJSON);
  bindOn('#btnExportAll2', exportArchiveJSON);
  bindOn('#btnImport', () => $('#fileImport').click());
  bindOn('#btnImport2', () => $('#fileImport').click());
  const fi = $('#fileImport'); if (fi) fi.onchange = importArchiveJSON;

  /* الإعدادات */
  bindOn('#btnSettingsSave', saveSettings);
  const sl = $('#s_logo'); if (sl) sl.onchange = loadLogoFile;
  bindOn('#btnLogoDel', () => { state.settings.logo = ''; state.logo = ''; saveSettings(true); toast('أُزيل الشعار', 'ok'); });
  bindOn('#btnWipe', wipeAll);

  /* ---------------- قوائم الاختيار (محرّر المكتبة) ---------------- */
  const lp = $('#listPicker');
  if (lp) lp.onchange = () => { state.listKey = lp.value; renderListEditor(); };

  bindOn('#btnListAdd', () => {
    if (!window.ADMHLists) return;
    const name = window.ADMHLists.label(state.listKey);
    const v = prompt(`قيمة جديدة في «${name}»:`);
    if (!v || !v.trim()) return;
    if (!window.ADMHLists.add(state.listKey, tidy(v))) { toast('القيمة موجودة مسبقاً', 'warn'); return; }
    saveListsCache(); renderListEditor(); renderListPicker(); applyListChanges();
    toast('أُضيفت القيمة', 'ok');
  });

  bindOn('#btnListReset', () => {
    if (!window.ADMHLists) return;
    if (!confirm(`إرجاع «${window.ADMHLists.label(state.listKey)}» إلى قيمها الأصلية؟`)) return;
    window.ADMHLists.reset(state.listKey);
    saveListsCache(); renderListEditor(); renderListPicker(); applyListChanges();
    toast('أُرجعت القائمة للأصل', 'ok');
  });

  bindOn('#btnListsSaveDefault', () => {
    if (!window.ADMHLists) return;
    if (!confirm('سيُنزَّل ملف options.js بقيمك الحالية.\n\nضعه مكان الملف القديم في المشروع ثم ارفعه إلى GitHub،\nفتصبح هذه القيم هي الأصل على كل الأجهزة.\n\nمتابعة؟')) return;
    downloadOptionsFile();
  });

  bindOn('#btnListsExport', () => {
    if (!window.ADMHLists) return;
    const payload = {
      app: 'ADMH-InspectionReports', kind: 'option-lists', version: APP_VERSION,
      exportedAt: new Date().toISOString(), lists: window.ADMHLists.exportAll(),
    };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `قوائم_الاختيار_${todayISO()}.json`);
    toast('تم تصدير القوائم', 'ok');
  });

  bindOn('#btnListsImport', () => { const f = $('#fileLists'); if (f) f.click(); });
  const fls = $('#fileLists');
  if (fls) fls.onchange = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !window.ADMHLists) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result);
        const lists = data && data.lists ? data.lists : data;
        const n = window.ADMHLists.importAll(lists);
        if (!n) throw new Error('لا قوائم صالحة في الملف');
        saveListsCache(); renderListPicker(); renderListEditor(); applyListChanges();
        toast(`استُوردت ${n} قائمة`, 'ok');
      } catch (err) { toast('فشل الاستيراد: ' + err.message, 'err', 4500); }
    };
    rd.readAsText(f);
  };

  bindOn('#btnListsResetAll', () => {
    if (!window.ADMHLists) return;
    if (!confirm('إرجاع كل القوائم إلى قيمها الأصلية؟ سيُفقد كل تعديل أجريته.')) return;
    window.ADMHLists.resetAll();
    saveListsCache(); renderListPicker(); renderListEditor(); applyListChanges();
    toast('أُرجعت كل القوائم للأصل', 'ok');
  });

  /* إعادة بناء الواجهة عند تغيّر أي قائمة */
  if (window.ADMHLists) window.ADMHLists.onChange(() => { renderListPicker(); applyListChanges(); });

  /* المكتبة: العبارات */
  const lk = $('#libKind');
  if (lk) lk.onchange = () => { renderLibraryView(); };
  bindOn('#btnLibAdd', () => {
    const kind = $('#libKind').value || 'records';
    if (!Array.isArray(state.library[kind])) state.library[kind] = [];
    const v = prompt('نص العبارة الجديدة:');
    if (!v || !v.trim()) return;
    state.library[kind].unshift(tidy(v));
    jwrite(LS_LIBRARY, state.library);
    renderLibraryView(); toast('أُضيفت العبارة', 'ok');
  });

  /* المزامنة السحابية — الدخول بحساب Google فقط */
  bindOn('#btnSyncGoogle', () => syncNow(true));
  bindOn('#btnSyncNow', () => syncNow(true));
  bindOn('#btnSyncSignOut', () => {
    const S = sync.get();
    if (!S) return;
    if (!confirm('إيقاف المزامنة على هذا الجهاز؟\nستبقى التقارير محفوظة هنا، ولن تُحذف من السحابة.')) return;
    S.signOut().then(() => { renderSyncUI(S.status()); toast('تم إيقاف المزامنة', 'ok'); });
  });
  bindOn('#dot', () => showView('settings'));

  /* الواجهة */
  bindOn('#themeBtn', () => applyTheme(!document.body.classList.contains('dark')));
  bindOn('#hamb', () => { $('#nav').classList.toggle('open'); $('#scrim').classList.toggle('open'); });
  bindOn('#scrim', () => { $('#nav').classList.remove('open'); $('#scrim').classList.remove('open'); });
  bindOn('#helpBtn', () => showView('help'));
  bindOn('#palBtn', () => openPalette());

  /* نوافذ */
  $$('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m); });
    $$('[data-close]', m).forEach(b => b.addEventListener('click', () => closeModal(m)));
  });

  /* لوحة الأوامر */
  bind('#palInput', 'input', renderPalette);
  bind('#palInput', 'keydown', e => {
    if (e.key === 'Enter') { const first = $('#palList .palitem'); if (first) first.click(); }
  });

  /* مكتبة تصفية */
  bind('#libFilter', 'input', renderLibraryModal);

  /* مكتبة العبارات: تحديد متعدد وإضافة (يُلحق ولا يستبدل) */
  bind('#libModalList', 'click', e => {
    const item = e.target.closest('[data-libkey]');
    if (!item) return;
    const key = item.dataset.libkey, value = item.dataset.libpick;
    const at = libMulti.findIndex(x => x.key === key);
    if (!libAllowMulti) {
      /* نمط الاختيار الواحد: أضف مباشرة */
      if (libCallback) libCallback([value]);
      closeModal($('#libModal'));
      toast('أُضيفت العبارة', 'ok');
      return;
    }
    if (at >= 0) libMulti.splice(at, 1);
    else libMulti.push({ key, value });
    syncLibSelection();
  });
  bindOn('#libAddSelected', () => commitLibSelection());
  bindOn('#libClearSel', () => { libMulti = []; syncLibSelection(); });

  /* الملاحظات العامة: زر «📚 من المكتبة» كان لا يمرّر دالة استقبال */
  $$('[data-lib]').forEach(b => {
    b.onclick = () => {
      const kind = b.dataset.lib;
      openLibrary(kind, values => {
        const add = (Array.isArray(values) ? values : [values]).map(tidy).filter(Boolean);
        if (!add.length) return;
        /* نُلحق في نهاية القائمة ولا نستبدل ما هو موجود */
        add.forEach(v => state.report.general.push(v));
        rerender('general');
        saveDraft();
        toast(`أُضيفت ${add.length} ملاحظة`, 'ok');
      }, { multi: true });
    };
  });

  /* البحث في الأرشيف */
  ['#archSearch', '#archType', '#archSort'].forEach(s => {
    const e = $(s);
    if (e) { e.addEventListener('input', renderArchive); e.addEventListener('change', renderArchive); }
  });

  /* نطاق الموقع — يظهر في دليل الإعداد لنسخه إلى Firebase */
  const hd = $('#helpDomain');
  if (hd && typeof location !== 'undefined' && location.hostname) hd.textContent = location.hostname;

  /* لوحة المفاتيح */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const m = $('.modal.open'); if (m) closeModal(m); }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); saveToArchive(); }
    else if (k === 'e') { e.preventDefault(); exportWord(); }
    else if (k === 'p') { e.preventDefault(); showView('preview'); }
    else if (k === 'k') { e.preventDefault(); openPalette(); }
    else if (k === 'd') { e.preventDefault(); applyTheme(!document.body.classList.contains('dark')); }
  });

  verifyBindings();
}

/** يتحقق بعد الربط أن كل زر أساسي له معالج فعلي، ويحذّر إن لم يكن. */
function verifyBindings() {
  const must = ['palBtn', 'themeBtn', 'helpBtn', 'btnWord', 'btnPreviewGo', 'btnNew', 'btnSaveLocal',
    'btnWord2', 'btnPrint', 'hamb', 'btnStdOfficials', 'btnAllRecords', 'btnBulkRecords',
    'btnStdRecs', 'btnExportAll', 'btnImport', 'btnWipe', 'btnSettingsSave', 'btnLibAdd',
    'btnSyncNow', 'btnSyncSignOut', 'btnSyncGoogle', 'dot',
    'btnListsSaveDefault', 'btnListsExport', 'btnListsImport', 'btnListsResetAll',
    'btnListAdd', 'btnListReset', 'listPicker',
    'bulkFillEmpty', 'bulkFillAll'];
  const missing = must.filter(id => {
    const el = document.getElementById(id);
    return !el || typeof el.onclick !== 'function';
  });
  if (missing.length) console.warn('[verifyBindings] أزرار بلا معالج:', missing.join(', '));
  return missing;
}
function bulkApply(overwrite) {
  const v = tidy($('#bulkText').value);
  if (!v) { toast('اكتب نص التقييم أولاً', 'warn'); return; }
  let n = 0;
  state.report.records.forEach((r, i) => {
    if (overwrite || recordIsEmpty(r)) {
      r.evalList = [v];
      r.evalManual = '';
      recomputeRecordEval(i);
      n++;
    }
  });
  rerender('records'); saveDraft(); closeModal($('#bulkModal'));
  toast(`طُبّق على ${n} سجلاً`, 'ok');
}
function exportArchiveJSON() {
  if (!state.reports.length) { toast('الأرشيف فارغ', 'warn'); return; }
  const payload = { app: 'ADMH-InspectionReports', version: APP_VERSION, exportedAt: new Date().toISOString(), reports: state.reports };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `ارشيف_التقارير_${todayISO()}.json`);
  toast('تم تصدير الأرشيف', 'ok');
}
function importArchiveJSON(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = JSON.parse(rd.result);
      const list = Array.isArray(data) ? data : (data.reports || []);
      if (!Array.isArray(list) || !list.length) throw new Error('لا توجد تقارير في الملف');
      let added = 0;
      list.forEach(r => {
        const rep = migrate(r);
        if (!rep.id || state.reports.some(x => x.id === rep.id)) rep.id = uid();
        state.reports.unshift(rep); added++;
      });
      jwrite(LS_REPORTS, state.reports);
      refreshArchiveMeta(); renderArchive();
      toast(`تم استيراد ${added} تقريراً`, 'ok');
    } catch (err) { toast('فشل الاستيراد: ' + err.message, 'err', 4000); }
  };
  rd.readAsText(f);
}
function wipeAll() {
  if (!confirm('سيتم حذف كل التقارير والإعدادات نهائياً. هل أنت متأكد؟')) return;
  if (!confirm('تأكيد أخير — لا يمكن التراجع. متابعة؟')) return;
  [LS_REPORTS, LS_DRAFT, LS_SETTINGS, LS_LIBRARY].forEach(k => { try { localStorage.removeItem(k); } catch (x) {} });
  location.reload();
}
function loadLogoFile(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 400 * 1024) { toast('الصورة كبيرة — الحد 400 كيلوبايت', 'warn', 3500); return; }
  const rd = new FileReader();
  rd.onload = () => {
    const dataUrl = String(rd.result);
    measureDataUrl(dataUrl).then(dim => {
      state.settings.logo = dataUrl;
      state.settings.logoW = dim.w;
      state.settings.logoH = dim.h;
      state.logo = dataUrl;
      saveSettings(true);
      toast(`تم رفع الشعار (${dim.w}×${dim.h})`, 'ok');
    });
  };
  rd.readAsDataURL(f);
}
function saveSettings(silent) {
  state.settings.l1 = tidy($('#s_l1').value);
  state.settings.l2 = tidy($('#s_l2').value);
  state.settings.l3 = tidy($('#s_l3').value);
  state.settings.font = $('#s_font').value;
  state.settings.fontSize = $('#s_fontSize').value;
  state.settings.updatedAt = new Date().toISOString();
  jwrite(LS_SETTINGS, state.settings);
  if (!silent) toast('تم حفظ الإعدادات', 'ok');
  updateTitle();
}

/* ---------------------------------------------------------------- المكتبة */
/* ---------------------------------------------------------------------------
   توليد ملف options.js جديد بالقيم الحالية.

   لماذا تنزيل ملف بدل الكتابة المباشرة؟ لأن المتصفح لا يستطيع الكتابة على
   القرص (عبر file://) ولا على خادم الاستضافة (عبر https). فلا سبيل برمجياً
   إلى تعديل الملف في مكانه. لذا نولّد نسخة كاملة بالقيم الجديدة، يرفعها
   المستخدم مرة واحدة، فتصبح هي الأصل لكل الأجهزة.
   --------------------------------------------------------------------------- */
function jsString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ') + "'";
}
function jsArray(arr) {
  if (!arr.length) return '[]';
  const oneLine = '[' + arr.map(jsString).join(', ') + ']';
  if (oneLine.length <= 96) return oneLine;
  return '[\n' + arr.map(v => '        ' + jsString(v) + ',').join('\n') + '\n      ]';
}

/** يبني محتوى options.js كاملاً بالقيم الحالية كأصل جديد */
function buildOptionsFile() {
  const api = window.ADMHLists;
  if (!api) return '';
  const all = api.all();

  let out = '';
  out += '/* =============================================================================\n';
  out += '   الطبقة القابلة للتعديل: كل قائمة اختيار في الموقع مصدرها هنا.\n';
  out += '   تُحرَّر من «مكتبة العبارات» داخل التطبيق.\n';
  out += '\n';
  out += '   هذا الملف مُولَّد من داخل التطبيق بزر «حفظ القيم كأصل». القيم أدناه\n';
  out += '   صارت الأصل لكل الأجهزة، ويمكن للمستخدم تعديلها من الواجهة كالعادة.\n';
  out += '   تاريخ التوليد: ' + new Date().toISOString() + '\n';
  out += '   ============================================================================= */\n';
  out += "'use strict';\n\n";
  out += '(function (global) {\n';
  out += "  const LS = 'admh.lists.v1';\n\n";
  out += '  /* تعريف القوائم: label للعرض، hint شرح، values القيم الابتدائية */\n';
  out += '  const DEFAULTS = {\n';

  api.ORDER.forEach((key, ki) => {
    const item = all[key];
    if (!item) return;
    out += '    ' + key + ': {\n';
    out += '      label: ' + jsString(item.label) + ',\n';
    out += '      hint: ' + jsString(item.hint) + ',\n';
    out += '      values: ' + jsArray(item.values) + ',\n';
    out += '    },\n';
  });

  out += '  };\n\n';
  out += '  /* ترتيب العرض في المكتبة */\n';
  out += '  const ORDER = [\n';
  api.ORDER.filter(k => all[k]).forEach(k => { out += '    ' + jsString(k) + ',\n'; });
  out += '  ];\n\n';

  out += `  const listeners = [];
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

  function notify() {
    try {
      if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('admh:lists-changed'));
      }
    } catch (e) { /* بيئات بلا DOM */ }
  }

  function write() {
    const flat = {};
    Object.keys(lists).forEach(k => { flat[k] = lists[k].values; });
    try { localStorage.setItem(LS, JSON.stringify(flat)); } catch (e) {}
    listeners.forEach(fn => { try { fn(); } catch (e) {} });
    notify();
  }

  const API = {
    ORDER,
    all() { if (!lists) lists = read(); return lists; },
    get(key) { const l = API.all()[key]; return l ? l.values.slice() : []; },
    label(key) { const l = API.all()[key]; return l ? l.label : key; },
    hint(key) { const l = API.all()[key]; return l ? l.hint : ''; },
    has(key) { return !!API.all()[key]; },

    setValues(key, arr) {
      const l = API.all()[key];
      if (!l) return false;
      l.values = (arr || []).map(s => String(s).trim()).filter(Boolean);
      write(); return true;
    },
    add(key, value) {
      const l = API.all()[key];
      const v = String(value == null ? '' : value).trim();
      if (!l || !v) return false;
      if (l.values.includes(v)) return false;
      l.values.push(v); write(); return true;
    },
    remove(key, value) {
      const l = API.all()[key];
      if (!l) return false;
      const i = l.values.indexOf(value);
      if (i < 0) return false;
      l.values.splice(i, 1); write(); return true;
    },
    move(key, index, delta) {
      const l = API.all()[key];
      if (!l) return false;
      const j = index + delta;
      if (index < 0 || index >= l.values.length || j < 0 || j >= l.values.length) return false;
      const [x] = l.values.splice(index, 1);
      l.values.splice(j, 0, x);
      write(); return true;
    },
    reset(key) {
      const def = DEFAULTS[key];
      if (!def) return false;
      API.all()[key].values = def.values.slice();
      write(); return true;
    },
    resetAll() {
      try { localStorage.removeItem(LS); } catch (e) {}
      lists = read();
      listeners.forEach(fn => { try { fn(); } catch (e) {} });
      notify();
    },
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
`;
  return out;
}

/** ينزّل ملف options.js بالقيم الحالية ليرفعه المستخدم */
function downloadOptionsFile() {
  const api = window.ADMHLists;
  if (!api) { toast('وحدة القوائم غير محمّلة', 'err'); return; }
  const content = buildOptionsFile();
  if (!content) { toast('تعذّر توليد الملف', 'err'); return; }
  download(new Blob([content], { type: 'text/javascript;charset=utf-8' }), 'options.js');
  const total = api.ORDER.reduce((a, k) => a + api.get(k).length, 0);
  toast(`نُزِّل options.js بـ ${total} قيمة. ضعه مكان الملف القديم ثم ارفعه إلى GitHub.`, 'ok', 12000);
}

/* =============================================================================
   محرّر قوائم الاختيار (في «مكتبة العبارات»)
   ============================================================================= */
function renderListPicker() {
  const sel = $('#listPicker');
  if (!sel || !window.ADMHLists) return;
  const keep = state.listKey;
  sel.innerHTML = window.ADMHLists.ORDER
    .filter(k => window.ADMHLists.has(k))
    .map(k => `<option value="${esc(k)}"${k === keep ? ' selected' : ''}>${esc(window.ADMHLists.label(k))}</option>`)
    .join('');
  if (!window.ADMHLists.has(keep)) state.listKey = window.ADMHLists.ORDER[0];
  const cnt = $('#listsCount');
  if (cnt) {
    const total = window.ADMHLists.ORDER.reduce((a, k) => a + window.ADMHLists.get(k).length, 0);
    cnt.textContent = `${window.ADMHLists.ORDER.length} قوائم · ${total} قيمة`;
  }
}

function renderListEditor() {
  const box = $('#listEditor');
  if (!box || !window.ADMHLists) return;
  const key = state.listKey;
  const values = window.ADMHLists.get(key);
  const hint = $('#listHint');
  if (hint) hint.textContent = window.ADMHLists.hint(key) || '';

  if (!values.length) {
    box.innerHTML = `<p class="empty">القائمة فارغة — أضف قيمة.</p>`;
    return;
  }
  box.innerHTML = `<div class="tw"><table style="min-width:520px"><tbody>` +
    values.map((v, i) => `
      <tr>
        <td class="num" style="width:52px">${i + 1}</td>
        <td data-label="القيمة"><input type="text" data-listval="${i}" value="${esc(v)}"></td>
        <td class="no-print" style="width:190px;white-space:nowrap">
          <button class="btn ghost sm" data-listmove="${i}|-1" title="تحريك لأعلى" ${i === 0 ? 'disabled' : ''}>أعلى</button>
          <button class="btn ghost sm" data-listmove="${i}|1" title="تحريك لأسفل" ${i === values.length - 1 ? 'disabled' : ''}>أسفل</button>
          <button class="btn danger sm" data-listdel="${i}" title="حذف">حذف</button>
        </td>
      </tr>`).join('') +
    `</tbody></table></div>`;

  /* الكتابة تُحدّث القائمة فوراً */
  box.oninput = e => {
    const i = +e.target.dataset.listval;
    if (isNaN(i) || !e.target.dataset.listval) return;
    window.ADMHLists.all()[key].values[i] = e.target.value;
    saveListsCache();
    applyListChanges();
  };
  box.onchange = e => {
    const i = +e.target.dataset.listval;
    if (isNaN(i) || !e.target.dataset.listval) return;
    const trimmed = tidy(e.target.value);
    /* القيمة الفارغة تُحذف تلقائياً */
    if (!trimmed) { window.ADMHLists.remove(key, window.ADMHLists.get(key)[i]); renderListEditor(); }
    else { window.ADMHLists.all()[key].values[i] = trimmed; e.target.value = trimmed; }
    saveListsCache();
    applyListChanges();
  };
  box.onclick = e => {
    const del = e.target.closest('[data-listdel]');
    if (del) {
      const i = +del.dataset.listdel;
      const v = window.ADMHLists.get(key)[i];
      if (v !== undefined && confirm(`حذف «${v}» من القائمة؟`)) {
        window.ADMHLists.remove(key, v);
        renderListEditor(); renderListPicker(); applyListChanges();
      }
      return;
    }
    const mv = e.target.closest('[data-listmove]');
    if (mv) {
      const [i, d] = mv.dataset.listmove.split('|').map(Number);
      if (window.ADMHLists.move(key, i, d)) { renderListEditor(); applyListChanges(); }
    }
  };
}

/** حفظ القوائم في نفس مفتاح التخزين الذي تستخدمه options.js */
function saveListsCache() {
  if (window.ADMHLists) jwrite('admh.lists.v1', window.ADMHLists.exportAll());
}

/** إعادة بناء كل ما يعتمد على القوائم بعد تعديلها */
function applyListChanges() {
  try {
    if (state.report) {
      renderAll();
      /* لا نُعيد رسم الجداول أثناء الكتابة، فقط القوائم المنسدلة والاقتراحات */
      fillDatalists();
      const vt = $('#f_visitType');
      if (vt) fillSelectFrom(vt, L.get('visitTypes'), state.report.visitType);
      applyScope();
    }
  } catch (e) { console.warn('applyListChanges', e); }
}

function renderLibraryView() {
  /* ١. محرّر القوائم */
  renderListPicker();
  renderListEditor();

  /* ٢. مكتبة العبارات */
  const kind = $('#libKind').value || 'records';
  if (!Array.isArray(state.library[kind])) state.library[kind] = [];
  const list = state.library[kind];
  $('#libList').innerHTML = list.length ? list.map((v, i) => `
    <div style="display:flex;gap:8px;align-items:flex-start;border-bottom:1px solid var(--border);padding:9px 0">
      <span class="pill" style="margin-top:6px">${i + 1}</span>
      <div style="flex:1">${esc(v)}</div>
      <button class="btn danger icon" data-libdel="${i}" title="حذف">✕</button>
    </div>`).join('') : '<p class="empty">لا عبارات.</p>';
  $('#libList').onclick = e => {
    const b = e.target.closest('[data-libdel]'); if (!b) return;
    if (!confirm('حذف هذه العبارة؟')) return;
    state.library[kind].splice(+b.dataset.libdel, 1);
    jwrite(LS_LIBRARY, state.library);
    renderLibraryView();
  };
}

/* مكتبة العبارات: تحديد متعدد ثم إضافة دفعةً واحدة.
   التحديد متعدد لأن المستخدم قد يريد أكثر من عبارة، والإضافة تُلحق
   ولا تستبدل ما سبق. */
let libCallback = null;
let libMulti = [];
let libAllowMulti = true;

function openLibrary(kind, cb, opts) {
  opts = opts || {};
  libCallback = typeof cb === 'function' ? cb : null;
  libAllowMulti = opts.multi !== false;
  libMulti = [];

  $('#libModalTitle').textContent =
    kind === 'reco' ? 'مكتبة التوصيات' : kind === 'general' ? 'الملاحظات العامة' : 'تقييمات السجلات';
  $('#libModalHint').textContent = libAllowMulti
    ? 'اضغط عبارة أو أكثر لتحديدها، ثم «إضافة المحدد». تُضاف العبارات إلى ما هو موجود ولا تستبدله.'
    : 'اضغط العبارة لإضافتها.';

  const groups = kind === 'reco' ? ['records', 'fp', 'common'] : [null];
  let html = '';
  groups.forEach(g => {
    const items = g
      ? RECO_PRESETS.filter(r => r.g === g)
      : (state.library[kind] || []).map(v => ({ t: v, v }));
    if (!items.length) return;
    if (g) html += `<div style="padding:10px 2px 5px;color:var(--muted);font-size:.8em;font-weight:700">${g === 'records' ? 'توصيات السجلات والإدامة' : g === 'fp' ? 'توصيات البصمة والدوام' : 'توصيات عامة'}</div>`;
    html += items.map((it, i) => {
      const key = kind + '|' + g + '|' + i;
      return `<div class="chip" style="display:block;margin-bottom:6px;border-radius:8px;padding:9px 11px;cursor:pointer" data-libkey="${esc(key)}" data-libpick="${esc(it.v)}"><b>${esc(it.t || '').slice(0, 90)}</b>${it.t && it.t !== it.v ? `<div style="font-weight:400;color:var(--muted);font-size:.9em;margin-top:3px">${esc(it.v).slice(0, 150)}${it.v.length > 150 ? '…' : ''}</div>` : ''}</div>`;
    }).join('');
  });
  $('#libModalList').innerHTML = html || '<p class="empty">لا عبارات.</p>';
  $('#libFilter').value = '';
  syncLibSelection();
  openModal('#libModal');
}

function syncLibSelection() {
  $$('#libModalList [data-libkey]').forEach(el => {
    const on = libMulti.some(x => x.key === el.dataset.libkey);
    el.classList.toggle('ok', on);
    el.style.borderColor = on ? 'var(--ok)' : '';
    el.style.background = on ? 'rgba(46,125,50,.16)' : '';
  });
  const bar = $('#libModalBar');
  const btn = $('#libAddSelected');
  if (btn) btn.textContent = libMulti.length ? `إضافة المحدد (${libMulti.length})` : 'إضافة المحدد';
  if (bar) bar.style.display = libAllowMulti ? '' : 'none';
}

/** إضافة ما حُدِّد إلى الهدف (يُلحق ولا يستبدل) */
function commitLibSelection() {
  if (!libCallback) { toast('لم يتم تحديد هدف الإضافة', 'warn'); return; }
  if (!libMulti.length) { toast('حدّد عبارة واحدة على الأقل', 'warn'); return; }
  libCallback(libMulti.map(x => x.value));
  const n = libMulti.length;
  libMulti = [];
  closeModal($('#libModal'));
  toast(`أُضيفت ${n} عبارة`, 'ok');
}

function renderLibraryModal() {
  const q = tidy($('#libFilter').value).toLowerCase();
  $$('#libModalList [data-libkey]').forEach(el => {
    el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

/** هل السجل بلا تقييم فعلي؟ (المصدر هو التقييمات المختارة + النص اليدوي) */
function recordIsEmpty(r) {
  return !(Array.isArray(r.evalList) && r.evalList.some(x => tidy(x)))
      && !tidy(r.evalManual)
      && !tidy(r.eval);
}

/** تعبئة تقييمات السجلات الفارغة من المكتبة (تحديد متعدد) */
function openRecordFiller(targetIndex) {
  if (!state.report.records.length) { toast('أضف السجلات أولاً', 'warn'); return; }
  const single = typeof targetIndex === 'number';
  const unfilled = state.report.records.filter(recordIsEmpty);
  if (!single && !unfilled.length) {
    toast('كل السجلات لها تقييم — استخدم «تقييم جماعي» للاستبدال', 'warn', 3600);
    return;
  }
  openLibrary('records', values => {
    const add = (Array.isArray(values) ? values : [values]).map(tidy).filter(Boolean);
    if (!add.length) return;
    if (single) {
      const r = state.report.records[targetIndex];
      if (!r) return;
      if (!Array.isArray(r.evalList)) r.evalList = [];
      add.forEach(v => { if (!r.evalList.includes(v)) r.evalList.push(v); });
      recomputeRecordEval(targetIndex);
      toast(`أُضيف ${add.length} تقييماً للسجل`, 'ok');
    } else {
      unfilled.forEach(r => {
        if (!Array.isArray(r.evalList)) r.evalList = [];
        add.forEach(v => { if (!r.evalList.includes(v)) r.evalList.push(v); });
      });
      state.report.records.forEach((r, i) => { if (unfilled.includes(r)) recomputeRecordEval(i); });
      toast(`عُبّئ ${unfilled.length} سجلاً فارغاً`, 'ok');
    }
    rerender('records'); saveDraft();
  }, { multi: true });
}

/* ---------------------------------------------------------------- التنقل */
function showView(name) {
  $$('.main > section').forEach(s => s.classList.add('hidden'));
  const el = $('#view-' + name);
  if (el) el.classList.remove('hidden');
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.go === name));
  $('#nav').classList.remove('open'); $('#scrim').classList.remove('open');
  if (name === 'preview') renderPreview();
  if (name === 'archive') renderArchive();
  if (name === 'library') renderLibraryView();
  if (name === 'settings') fillSettingsForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function fillSettingsForm() {
  $('#s_l1').value = state.settings.l1;
  $('#s_l2').value = state.settings.l2;
  $('#s_l3').value = state.settings.l3;
  $('#s_font').value = state.settings.font;
  $('#s_fontSize').value = state.settings.fontSize;
  renderStoreInfo();
}
function renderStoreInfo() {
  let bytes = 0;
  [LS_REPORTS, LS_DRAFT, LS_SETTINGS, LS_LIBRARY].forEach(k => { try { const v = localStorage.getItem(k); if (v) bytes += v.length; } catch (e) {} });
  $('#storeInfo').textContent = `عدد التقارير: ${state.reports.length} · حجم البيانات: ${(bytes / 1024).toFixed(1)} كيلوبايت · الإصدار ${APP_VERSION}`;
}
function renderArchive() {
  const q = tidy($('#archSearch').value).toLowerCase();
  const type = $('#archType').value;
  const sort = $('#archSort').value;
  /* السجلات المعلَّمة بالحذف (شواهد القبر) لا تظهر للمستخدم */
  let list = state.reports.filter(r => r && !r._deleted);
  if (q) list = list.filter(r => [r.title, r.facilityName, r.sector].join(' ').toLowerCase().includes(q));
  if (type) list = list.filter(r => r.visitType === type);
  if (sort === 'new') list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  else if (sort === 'old') list.sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''));
  else list.sort((a, b) => String(a.facilityName || '').localeCompare(String(b.facilityName || ''), 'ar'));

  const tb = $('#tArchive tbody');
  tb.innerHTML = list.length ? list.map(r => `
    <tr data-id="${esc(r.id)}">
      <td>${esc(tidy(r.title) || autoTitle(r))}</td>
      <td>${esc(tidy(r.facilityName) || '—')}</td>
      <td>${esc(fmtDate(r.visitDate) || '—')}</td>
      <td>${esc(r.visitType || '—')}</td>
      <td class="no-print"><div class="act">
        <button class="btn ghost sm" data-act="open">فتح</button>
        <button class="btn info sm" data-act="word">Word</button>
        <button class="btn danger sm" data-act="del">حذف</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="5" class="empty">الأرشيف فارغ.</td></tr>`;

  tb.onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const tr = b.closest('tr'), id = tr.dataset.id;
    const r = state.reports.find(x => x.id === id);
    if (!r) return;
    if (b.dataset.act === 'open') {
      state.report = migrate(JSON.parse(JSON.stringify(r)));
      state.editingId = r.id;
      renderAll(); saveDraft(); showView('report');
      toast('تم فتح التقرير', 'ok');
    } else if (b.dataset.act === 'word') {
      const keep = state.report;
      state.report = migrate(JSON.parse(JSON.stringify(r)));
      exportWord().finally(() => { state.report = keep; });
    } else if (b.dataset.act === 'del') {
      if (!confirm('حذف هذا التقرير من الأرشيف؟')) return;
      /* شاهد قبر: نبقي السجل معلَّماً بالحذف حتى تنتشر العملية إلى الأجهزة
         الأخرى عند المزامنة، ونتجاهله في كل العرض. */
      const victim = state.reports.find(x => x.id === id);
      if (victim && sync.available() && sync.get().isConfigured()) {
        victim._deleted = true;
        victim.updatedAt = new Date().toISOString();
      } else {
        state.reports = state.reports.filter(x => x.id !== id);
      }
      jwrite(LS_REPORTS, state.reports);
      refreshArchiveMeta(); renderArchive(); toast('تم الحذف', 'ok');
    }
  };
  $('#archStats').textContent = `المعروض: ${list.length} من ${state.reports.length}`;
}
function refreshArchiveMeta() {
  const live = state.reports.filter(r => r && !r._deleted).length;
  const c = $('#archCount'); if (c) c.textContent = live;
}
function fillArchType() {
  const s = $('#archType');
  s.innerHTML = `<option value="">كل الأنواع</option>` + L.opt('visitTypes');
  const lt = $('#libKind'); if (lt) { /* noop */ }
}

/* ---------------------------------------------------------------- الوضع الليلي */
function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  $('#themeBtn').textContent = dark ? '☀️' : '🌙';
  try { localStorage.setItem(LS_THEME, dark ? 'dark' : 'light'); } catch (e) {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = dark ? '#0f1517' : '#004d40';
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(LS_THEME); } catch (e) {}
  applyTheme(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/* ---------------------------------------------------------------- النوافذ */
let lastFocus = null;
function openModal(sel) {
  const m = typeof sel === 'string' ? $(sel) : sel;
  if (!m) return;
  lastFocus = document.activeElement;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
  const f = m.querySelector('input, textarea, button');
  if (f) setTimeout(() => f.focus(), 30);
}
function closeModal(m) {
  if (!m) return;
  m.classList.remove('open');
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/* ---------------------------------------------------------------- لوحة الأوامر */
const PALETTE = [
  { t: 'تقرير جديد', k: 'new', run: () => $('#btnNew').click() },
  { t: 'تصدير Word (.docx)', k: 'word', run: () => exportWord() },
  { t: 'معاينة التقرير', k: 'preview', run: () => showView('preview') },
  { t: 'طباعة', k: 'print', run: () => { showView('preview'); setTimeout(() => window.print(), 250); } },
  { t: 'حفظ في الأرشيف', k: 'save', run: () => saveToArchive() },
  { t: 'إضافة كل السجلات المعتادة', k: 'records', run: () => $('#btnAllRecords').click() },
  { t: 'إضافة الجهات المعتادة للتوصيات', k: 'recgroups', run: () => $('#btnStdRecs').click() },
  { t: 'إضافة موقف بصمة جديد', k: 'position', run: () => { showView('report'); ADDERS.position(); } },
  { t: 'تقييم جماعي للسجلات', k: 'bulk', run: () => $('#btnBulkRecords').click() },
  { t: 'الأرشيف', k: 'archive', run: () => showView('archive') },
  { t: 'مكتبة العبارات', k: 'library', run: () => showView('library') },
  { t: 'الإعدادات', k: 'settings', run: () => showView('settings') },
  { t: 'دليل الاستخدام', k: 'help', run: () => showView('help') },
  { t: 'تصدير كل الأرشيف (JSON)', k: 'json', run: () => exportArchiveJSON() },
  { t: 'تبديل الوضع الليلي', k: 'theme', run: () => applyTheme(!document.body.classList.contains('dark')) },
];
function openPalette() { $('#palInput').value = ''; renderPalette(); openModal('#palModal'); }
function renderPalette() {
  const q = tidy($('#palInput').value).toLowerCase();
  const list = PALETTE.filter(p => !q || p.t.toLowerCase().includes(q) || p.k.includes(q));
  $('#palList').innerHTML = list.length
    ? list.map((p, i) => `<button class="btn ghost palitem" data-pal="${i}" style="width:100%;justify-content:flex-start;margin-bottom:5px">${esc(p.t)}</button>`).join('')
    : '<p class="empty">لا نتائج</p>';
  $('#palList').onclick = e => {
    const b = e.target.closest('[data-pal]'); if (!b) return;
    const p = list[+b.dataset.pal];
    closeModal($('#palModal'));
    if (p) setTimeout(() => p.run(), 60);
  };
}

/* =============================================================================
   المزامنة السحابية الاختيارية
   التطبيق يعمل بالكامل بدونها؛ هذه الطبقة تربط الواجهة بوحدة sync.js.
   ============================================================================= */
const sync = {
  available: () => !!(typeof window !== 'undefined' && window.ADMHSync),
  get: () => (typeof window !== 'undefined' ? window.ADMHSync : null),
  ready: false,
  /* يبقى null حتى تُثبَّت الخطّافات، ويُستخدم لمنع المزامنة قبل الجهوزية */
  readyPromise: null,
};

function initSync() {
  if (!sync.available()) {
    renderSyncUI({ configured: false, connected: false, error: '' });
    sync.readyPromise = Promise.resolve(false);
    return sync.readyPromise;
  }
  const S = sync.get();
  S.onChange(st => renderSyncUI(st));
  /* S.init يثبّت الخطّافات فوراً (بشكل متزامن) ويستأنف الجلسة في الخلفية.
     لذلك يصبح app مستعداً للمزامنة قبل أي عملية شبكة — لا حالة سباق. */
  S.init({
    load: () => ({
      reports: state.reports.slice(),
      settings: Object.assign({}, state.settings, { updatedAt: state.settingsUpdatedAt || null }),
      library: state.library,
      lists: (typeof window !== 'undefined' && window.ADMHLists) ? window.ADMHLists.exportAll() : null,
    }),
    save: payload => {
      if (Array.isArray(payload.reports)) {
        state.reports = payload.reports.filter(r => r && r.id && !r._deleted);
        jwrite(LS_REPORTS, state.reports);
        refreshArchiveMeta();
        renderArchive();
        fillDatalists();
      }
      if (payload.settings && typeof payload.settings === 'object') {
        const incoming = Object.assign({}, payload.settings);
        delete incoming.updatedAt;
        state.settings = Object.assign(blankSettings(), incoming);
        state.logo = state.settings.logo || '';
        jwrite(LS_SETTINGS, state.settings);
      }
      if (payload.library && typeof payload.library === 'object') {
        ['records', 'reco', 'general'].forEach(k => { if (Array.isArray(payload.library[k])) state.library[k] = payload.library[k]; });
        jwrite(LS_LIBRARY, state.library);
      }
      if (payload.lists && typeof payload.lists === 'object' && window.ADMHLists) {
        if (window.ADMHLists.importAll(payload.lists)) {
          saveListsCache();
          renderListPicker();
          renderListEditor();
          applyListChanges();
        }
      }
      const st = S.status();
      if (st && st.lastSync) state.lastSyncSync = st.lastSync;
      renderSyncUI(S.status());
    },
  });
  sync.ready = true;
  sync.readyPromise = S.ready;
  renderSyncUI(S.status());

  /* استئناف الجلسة ثم مزامنة صامتة — دون تعطيل الواجهة */
  return S.session().then(connected => {
    renderSyncUI(S.status());
    if (connected) {
      return S.syncNow().then(r => {
        if (r && !r.skipped) toast(`تمت المزامنة (${r.total} تقرير)`, 'ok');
        renderSyncUI(S.status());
      }).catch(() => renderSyncUI(S.status()));
    }
  }).catch(() => { renderSyncUI(S.status()); });
}

function renderSyncUI(st) {
  st = st || (sync.available() ? sync.get().status() : { configured: false, connected: false });
  const dot = $('#dot');
  if (dot) {
    /* نستخدم classList لا className، لتبقى الحالة متسقة مع أي متصفح
       ومع كل ما يقرأ classList.contains لاحقاً. */
    dot.classList.remove('off', 'busy', 'err');
    if (st.error) dot.classList.add('err');
    else if (st.busy) dot.classList.add('busy');
    else if (!st.connected) dot.classList.add('off');
    dot.title = st.error ? ('خطأ في المزامنة: ' + st.error)
      : st.busy ? 'جاري المزامنة…'
      : st.connected ? 'المزامنة مفعّلة'
      : 'المزامنة غير مفعّلة (البيانات محفوظة على هذا الجهاز)';
  }
  const off = $('#syncOff'), on = $('#syncOn'), warn = $('#syncWarn');
  if (!off || !on) return;
  off.classList.toggle('hidden', !!st.configured);
  on.classList.toggle('hidden', !st.configured);
  if (warn) {
    warn.classList.toggle('hidden', !st.error);
    warn.textContent = st.error ? ('⚠️ ' + st.error) : '';
  }
  if (st.configured) {
    const acc = $('#syncAccount');
    if (acc) {
      acc.textContent = st.connected
        ? `متصل — ${st.email || 'مستخدم'}`
        : 'الإعدادات محفوظة لكن الدخول غير مُنفَّذ. اضغط «تفعيل المزامنة والدخول» أو «مزامنة الآن».';
    }
    setText('#syncStateText', st.busy ? 'جاري المزامنة…' : st.connected ? 'متصل ✓' : 'غير متصل');
    setText('#syncLastText', st.lastSync ? new Date(st.lastSync).toLocaleString('ar-IQ') : 'لم تتم بعد');
    setText('#syncDeviceText', st.device || '—');
    const ed = $('#syncConfigEdit');
    if (ed && document.activeElement !== ed) {
      const c = sync.available() ? sync.get().getConfig() : null;
      ed.value = c ? JSON.stringify(c, null, 2) : '';
    }
  }
}
function setText(sel, v) { const e = $(sel); if (e) e.textContent = v; }

function syncNow(userInitiated) {
  if (!sync.available()) { toast('وحدة المزامنة غير محمّلة', 'err'); return Promise.resolve(); }
  const S = sync.get();

  /* ننتظر جهوزية الخطّافات بدل الفشل؛ فالمستخدم قد يضغط الزر قبل اكتمال
     التهيئة (حالة سباق حقيقية عند بدء التشغيل). */
  const gate = sync.readyPromise || Promise.resolve();

  return gate.then(() => {
    if (!S.isConnected()) {
      /* الدخول بحساب Google فقط — لا كلمات مرور في النظام */
      return S.connect().then(cred => {
        renderSyncUI(S.status());
        toast('تم الدخول: ' + (cred.email || cred.uid), 'ok');
        return S.syncNow();
      }).then(r => {
        if (r && !r.skipped) toast(`تمت المزامنة: ${r.total} تقرير`, 'ok');
        renderSyncUI(S.status());
      });
    }
    return S.syncNow().then(r => {
      renderSyncUI(S.status());
      if (userInitiated) toast(`تمت المزامنة: ${r.total} تقرير (أُضيف ${r.added}، حُدّث ${r.updated}، حُذف ${r.removed})`, 'ok', 3800);
    });
  }).catch(err => {
    /* مهلة أطول: رسائل الدخول تحتوي خطوات الحل وتحتاج قراءة */
    toast(err.message, 'err', 10000);
    renderSyncUI(S.status());
  });
}

/* لا كلمات مرور: أُزيلت إعادة التعيين */

/* =============================================================================
   بناء التقرير (نص + HTML للمعاينة)
   ============================================================================= */
function buildModel() {
  const r = state.report;
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
      l1: t(state.settings.l1), l2: t(state.settings.l2), l3: t(state.settings.l3),
      logo: state.logo || '',
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
  return M;
}
function splitLines(s) {
  return String(s || '').split(/\r?\n/).map(tidy).filter(Boolean);
}

/* ---------------------------------------------------------------- معاينة HTML */
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
  $('#previewMeta').textContent = [M.facility, M.visitDate, M.visitType || state.report.visitType].filter(Boolean).join(' · ');
}

/* =============================================================================
   تصدير Word (.docx) — مبني على docx UMD
   ملاحظات تقنية مؤكَّدة بالاختبار:
     • يجب استخدام Packer.toBlob() في المتصفح؛ toBuffer() يفشل.
     • التقرير كله فقرات — لا جداول إطلاقاً (بطلب صريح).
   ============================================================================= */
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1440;
const CONTENT_W = PAGE_W - MARGIN * 2; /* 9026 — يُستخدم لحساب العروض إن لزم */

function exportWord() {
  const fail = validateReport();
  if (fail) { toast(fail, 'err', 3800); showView('report'); return Promise.resolve(); }
  const D = window.docx;
  if (!D) { toast('تعذّر تحميل مولّد Word', 'err', 4000); return Promise.resolve(); }

  const M = buildModel();
  const fontName = state.settings.font || 'Simplified Arabic';
  const baseHalf = Math.round((parseFloat(state.settings.fontSize) || 12) * 2);
  const F = { name: fontName, hint: 'cs' };

  /* لا حاجة لأي أصناف جداول: التقرير كله فقرات */
  const {
    Document, Packer, Paragraph, TextRun,
    AlignmentType, HeadingLevel, BorderStyle,
    PageNumber, Footer,
  } = D;

  /* تباعد الأسطر — يتبع نمط التقارير الأصلية: w:line=276 w:lineRule=auto (~1.15)
     بدون w:lineRule صريح يفسّر بعض العارضين القيمة كـ«ضبط دقيق» فيتضاعف التباعد. */
  const LINE = 276;
  /* مسافة بادئة معلّقة للبنود المرقّمة: يُسحب الرقم إلى داخل الهامش فيبقى ظاهراً */
  const LIST_HANG = { start: 284, hanging: 284 };

  const para = (text, o) => {
    o = o || {};
    const runs = [];
    if (o.runs) runs.push(...o.runs);
    else runs.push(new TextRun({ text: String(text == null ? '' : text), rightToLeft: true, bold: !!o.bold, italics: !!o.italics, color: o.color, size: o.size || baseHalf, font: F }));
    return new Paragraph({
      bidirectional: true,
      alignment: o.align || AlignmentType.RIGHT,
      heading: o.heading,
      indent: o.indent,
      spacing: {
        before: o.before == null ? 0 : o.before,
        after: o.after == null ? 60 : o.after,
        line: o.line || LINE,
        lineRule: 'auto',
      },
      border: o.border,
      children: runs,
    });
  };
  /* لا جداول في ملف Word: كل البيانات تُصاغ فقرات. */

  const children = [];

  /* الترويسة — الشعار (يُدمج فعلياً في الملف إن وُجد) */
  const logoData = dataUrlToBytes(M.header.logo);
  if (logoData && D.ImageRun) {
    try {
      const lw = state.settings.logoW || 120, lh = state.settings.logoH || 90;
      const scale = Math.min(110 / lw, 78 / lh, 2.2);
      children.push(new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new D.ImageRun({
          data: logoData.bytes,
          transformation: { width: Math.max(20, Math.round(lw * scale)), height: Math.max(20, Math.round(lh * scale)) },
          type: logoData.type,
        })],
      }));
    } catch (e) { console.warn('logo embed failed', e); }
  }
  [M.header.l1, M.header.l2, M.header.l3].filter(Boolean).forEach(l =>
    children.push(para(l, { align: AlignmentType.CENTER, size: baseHalf - 2, color: '555555', after: 10 })));
  children.push(para(M.title, { align: AlignmentType.CENTER, size: baseHalf + 8, bold: true, color: '004D40', before: 80, after: 40 }));
  if (M.meta.length) children.push(para(M.meta.map(m => `${m[0]}: ${m[1]}`).join('   |   '), { align: AlignmentType.CENTER, size: baseHalf - 2, color: '444444', after: 60 }));
  children.push(new Paragraph({
    bidirectional: true, spacing: { after: 100, line: LINE, lineRule: 'auto' },
    border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: '004D40', space: 4 } },
    children: [new TextRun({ text: '', size: 2, font: F })],
  }));

  /* المقدمة */
  children.push(para(M.intro, { align: AlignmentType.JUSTIFIED, after: 100 }));

  /* الأقسام */
  M.sections.forEach(s => {
    children.push(para(s.heading, { heading: HeadingLevel.HEADING_2, size: baseHalf + 2, bold: true, color: '004D40', before: 180, after: 70, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '00796B', space: 3 } } }));
    if (s.type === 'kv') {
      (s.rows || []).forEach(r => children.push(para([r[0] ? r[0] + ': ' : '', r[1]].join(''), { after: 20 })));
      (s.notes || []).forEach(n => children.push(para(n, { after: 20 })));
    } else if (s.type === 'list') {
      /* numbered === false يعني بنوداً غير مرقّمة (مثل سطور الملاك) */
      s.items.forEach((it, i) => children.push(
        s.numbered === false
          ? para(it, { after: 30 })
          : para(`${i + 1}- ${it}`, { after: 40, indent: LIST_HANG })
      ));
    } else if (s.type === 'positions') {
      s.blocks.forEach(b => {
        children.push(para(b.intro, { after: 40 }));
        b.cats.forEach(c => {
          children.push(para(c.title + ':', { bold: true, after: 20, before: 60 }));
          c.items.forEach(it => children.push(para(it, { after: 10, indent: { start: 284 } })));
        });
      });
    } else if (s.type === 'recs') {
      s.groups.forEach(g => {
        const lbl = [g.letter ? g.letter + '/' : '', g.intro || g.label].filter(Boolean).join(' ');
        if (lbl) children.push(para(lbl.replace(/\/\s*$/, '/'), { bold: true, before: 90, after: 30 }));
        g.items.forEach((it, i) => children.push(para(`${i + 1}- ${it}`, { after: 40, indent: LIST_HANG })));
      });
    }
  });

  /* التوقيعات */
  if (M.signers.length) {
    children.push(para('فريق التفتيش', { heading: HeadingLevel.HEADING_2, size: baseHalf + 2, bold: true, color: '004D40', before: 240, after: 90 }));
    M.signers.forEach(s => {
      children.push(para(s.name || '—', { bold: true, after: 20 }));
      const sub = [s.job, s.date].filter(Boolean).join(' — ');
      if (sub) children.push(para(sub, { size: baseHalf - 2, color: '555555', after: 20 }));
      children.push(para('التوقيع: ..................................', { after: 160, color: '444444' }));
    });
  }
  if (M.footerNote) children.push(para(M.footerNote, { align: AlignmentType.CENTER, before: 160, size: baseHalf - 2, color: '555555' }));

  const doc = new Document({
    creator: 'نظام التقارير التفتيشية',
    title: M.title,
    description: 'تقرير زيارة تفتيشية',
    styles: {
      default: {
        document: { run: { font: F, size: baseHalf, rightToLeft: true } },
        heading1: { run: { font: F, size: baseHalf + 8, bold: true, color: '004D40', rightToLeft: true } },
        heading2: { run: { font: F, size: baseHalf + 2, bold: true, color: '004D40', rightToLeft: true } },
      },
    },
    sections: [{
      properties: {
        page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
        bidi: true,
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            bidirectional: true, alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'صفحة ', rightToLeft: true, size: baseHalf - 4, font: F, color: '777777' }),
              new TextRun({ children: [PageNumber.CURRENT], size: baseHalf - 4, font: F, color: '777777' }),
              new TextRun({ text: ' من ', rightToLeft: true, size: baseHalf - 4, font: F, color: '777777' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: baseHalf - 4, font: F, color: '777777' }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBlob(doc).then(blob => {
    const fn = `تقرير_${safeName(M.facility)}_${(state.report.visitDate || todayISO()).replace(/-/g, '')}.docx`;
    download(blob, fn);
    toast('تم تصدير ملف Word', 'ok');
  }).catch(err => {
    console.error(err);
    toast('فشل توليد الملف: ' + (err && err.message ? err.message : err), 'err', 5000);
  });
}

/* ---------------------------------------------------------------- التحقق */
function validateReport() {
  const r = state.report;
  const missing = [];
  if (!tidy(r.facilityName)) missing.push('اسم المؤسسة');
  if (!r.visitDate) missing.push('تاريخ الزيارة');
  ['#f_facilityName', '#f_visitDate', '#f_visitDateTop'].forEach(s => { const e = $(s); if (e) e.classList.remove('invalid'); });
  if (missing.length) {
    if (!tidy(r.facilityName)) $('#f_facilityName').classList.add('invalid');
    if (!r.visitDate) { $('#f_visitDate').classList.add('invalid'); $('#f_visitDateTop').classList.add('invalid'); }
    return 'يرجى إكمال: ' + missing.join(' و');
  }
  return '';
}

/* ---------------------------------------------------------------- التهيئة */
function init() {
  loadAll();
  initTheme();
  fillArchType();
  renderAll();
  bindForm();
  bindButtons();
  refreshArchiveMeta();
  showView('report');
  const car = $('#archCount'); if (car) car.textContent = state.reports.length;
  renderSyncUI({ configured: false, connected: false });
  setTimeout(initSync, 300);

  /* تسجيل عامل الخدمة للعمل بلا إنترنت */
  if ('serviceWorker' in navigator && navigator.serviceWorker && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('beforeunload', () => {
    try { localStorage.setItem(LS_DRAFT, JSON.stringify({ report: state.report, editingId: state.editingId, at: Date.now() })); } catch (e) {}
  });
  console.log(`نظام التقارير التفتيشية v${APP_VERSION} — جاهز`);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* ------------------------------------------------------------------ التصدير
   يُستخدم للاختبار الآلي، ويوفّر واجهة برمجية بسيطة للتشغيل من الخارج. */
const API = {
  APP_VERSION,
  constants: {
    RECORD_PRESETS, RECORD_ADDONS, RECORD_ROWS, RECO_PRESETS, GENERAL_PRESETS,
    PAGE_W, PAGE_H, MARGIN, CONTENT_W,
  },
  recoGroups,
  buildOptionsFile, downloadOptionsFile,
  /* القوائم القابلة للتعديل (من options.js) */
  lists: {
    get: key => L.get(key),
    all: () => (window.ADMHLists ? window.ADMHLists.exportAll() : {}),
    api: () => (typeof window !== 'undefined' ? window.ADMHLists : null),
  },
  positionCats,
  state,
  init, loadAll, blankReport, blankSettings, migrate, defaultLibrary,
  buildModel, renderPreview, exportWord, validateReport,
  renderAll, showView, saveToArchive, saveDraft, saveSettings,
  bindButtons, bindForm, verifyBindings, applyScope,
  tidy, fmtDate, dayNameOf, titleName, normalizeDigits, autoTitle, updateTitle, fmtNum,
  dataUrlToBytes, uid, safeName,
  exportArchiveJSON, importArchiveJSON,
  sync, initSync, renderSyncUI, syncNow,
};
if (typeof window !== 'undefined') window.ADMH = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
