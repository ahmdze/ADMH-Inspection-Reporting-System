/* =============================================================================
   نظام التقارير التفتيشية — منطق التطبيق
   الجانب الإداري + تصدير Word (.docx)
   ============================================================================= */
'use strict';

(function () {

/* ---------------------------------------------------------------- ثوابت عامة */
const APP_VERSION = '24.0.0';
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

/* =============================================================================
   بيانات وصفية للمزامنة — لكل مجموعة بيانات وقتها الخاص
   =============================================================================
   العطل الذي كان يحدث: كان وقت التعديل يُقرأ من `state.settingsUpdatedAt`
   وهو **غير معرَّف إطلاقاً**، فيُرسل `null` دائماً. فتصير المقارنة
   `remoteAt > 0` صحيحة دائماً، فيُستبدل المحلي بالسحابي **بصمت** — وتضيع
   تعديلاتك على مكتبة العبارات والقوائم بلا أي تحذير.

   الحل: ثلاث دقائق منفصلة، كل واحدة تُختم عند تعديلها فعلاً:
     · settings — خطاب الترويسة والخط والإعدادات
     · library  — مكتبة العبارات
     · lists    — القوائم القابلة للتحرير
   ولا تُختم عند المزامنة نفسها (فالمزامنة ليست تعديلاً).
   ============================================================================= */
const LS_SYNCMETA = 'admh.sync.meta.v1';
/* سجل التعديلات — لقطات قابلة للاستعادة */
const LS_HISTORY = 'admh.history.v1';

/** يُنشئ بنية وصفية فارغة */
function blankSyncMeta() {
  return { settings: null, library: null, lists: null, synced: {} };
}

/** يقرأ البيانات الوصفية من التخزين */
function readSyncMeta() {
  const raw = jread(LS_SYNCMETA, null);
  if (!raw || typeof raw !== 'object') return blankSyncMeta();
  return {
    settings: raw.settings || null,
    library: raw.library || null,
    lists: raw.lists || null,
    synced: (raw.synced && typeof raw.synced === 'object') ? raw.synced : {},
  };
}

/** يكتبها في التخزين */
function writeSyncMeta(m) {
  try { localStorage.setItem(LS_SYNCMETA, JSON.stringify(m)); } catch (e) {}
  return m;
}

/* عدّاد داخلي: يمنع ختم الوقت مرتين في نفس اللحظة */
let syncMeta = readSyncMeta();

/**
 * يختم وقت تعديل مجموعة بيانات.
 * @param {'settings'|'library'|'lists'} group
 */
function stampLocalChange(group) {
  if (!group) return;
  syncMeta[group] = new Date().toISOString();
  writeSyncMeta(syncMeta);
}

/** وقت آخر تعديل محلي لمجموعة (أو null) */
function localStamp(group) { return syncMeta[group] || null; }

/** وقت آخر مزامنة ناجحة لمجموعة (أو null) */
function lastSynced(group) { return (syncMeta.synced && syncMeta.synced[group]) || null; }

/** يسجّل أن مجموعة صارت متزامنة الآن (بلا اعتبارها تعديلاً محلياً) */
function markSynced(group, at) {
  syncMeta.synced = syncMeta.synced || {};
  syncMeta.synced[group] = at || new Date().toISOString();
  writeSyncMeta(syncMeta);
}

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
    /* نافذة فارغة تماماً: لا صفوف مُنشأة مسبقاً — يضيف المستخدم ما يحتاجه */
    procedures: [],
    procExtra: '',
    general: [],
    positions: [],
    records: [],
    recGroups: [],
    prevRecs: [],
    signers: [],
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

/** كـjwrite لكن بلا إشعار — لمن يريد عرض رسالة أدق بنفسه */
function jwriteSilent(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { return false; }
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
    const draft = { report: state.report, editingId: state.editingId, at: Date.now() };
    jwriteSilent(LS_DRAFT, draft);
    /* المؤشر في الشريط العلوي مخصّص لحالة المزامنة، فلا نلمسه هنا. */

    /* ---------------------------------------------------------------------
       مزامنة المسودة
       ---------------------------------------------------------------------
       المسودة كانت محلية فقط، فلا يظهر ما لم يُحفظ في الأرشيف على الجهاز
       الآخر. الآن نُعلّم وقت تعديلها لتُزامَن مثل بقية المجموعات.
       --------------------------------------------------------------------- */
    stampLocalChange('draft');
    scheduleDraftPush();

    /* لقطة في سجل التعديلات — بفاصل زمني يمنع سجلاً لكل ضغطة مفتاح */
    recordHistory('تعديل');
  }, 500);
}

/* =============================================================================
   مزامنة المسودة — دفع مؤجّل ومهذّب
   =============================================================================
   المسودة تتغيّر مع كل ضغطة مفتاح، فدفعها فوراً يُغرق الشبكة. نؤجّل الدفع
   فترة (`DRAFT_PUSH_MS`) ثم نُرسل أحدث نسخة مرة واحدة.
   ============================================================================= */
const DRAFT_PUSH_MS = 12000;
let draftPushTimer = null;

/** يجدول دفعاً مؤجّلاً للمسودة — بلا إغراق الشبكة */
function scheduleDraftPush() {
  if (!sync.available()) return;
  const S = sync.get();
  if (!S || !S.status().connected) return;      /* بلا اتصال: تُزامَن لاحقاً */
  clearTimeout(draftPushTimer);
  draftPushTimer = setTimeout(() => {
    draftPushTimer = null;
    try {
      if (S.pushDraft) S.pushDraft();
    } catch (e) { /* الدفع المؤجّل تحسين لا أكثر */ }
  }, DRAFT_PUSH_MS);
}

/* =============================================================================
   سجل التعديلات
   ============================================================================= */
const HIST = () => (window.ADMHReport && window.ADMHReport.history) || null;

/** السجل المخزَّن (يُقرأ مرة ويُبقى في الذاكرة) */
let historyCache = null;

function readHistory() {
  const H = HIST();
  if (!H) return { reports: {}, version: 1 };
  if (historyCache) return historyCache;
  historyCache = H.normalize(jread(LS_HISTORY, null));
  return historyCache;
}

function writeHistory(hist, silent) {
  historyCache = hist || historyCache;
  return silent ? jwriteSilent(LS_HISTORY, historyCache) : jwrite(LS_HISTORY, historyCache);
}

/**
 * يسجّل لقطة من التقرير الحالي.
 * @param {string} reason سبب اللقطة (يظهر للمستخدم)
 * @param {boolean} [force] يتجاوز الفاصل الزمني (للأحداث المهمة)
 */
function recordHistory(reason, force) {
  const H = HIST();
  if (!H || !state.report) return false;
  const hist = readHistory();
  const before = H.count(hist);
  H.record(hist, state.report, { reason: reason || 'تعديل', force: !!force });
  const after = H.count(hist);
  if (after !== before) writeHistory(hist, true);
  renderHistoryView();
  return after !== before;
}

/** يستعيد نسخة سابقة إلى المحرّر */
function restoreHistory(entryId) {
  const H = HIST();
  if (!H || !state.report) return false;
  const id = state.report.id;
  const snap = H.snapshotOf(readHistory(), id, entryId);
  if (!snap) { toast('لم تُوجد النسخة', 'warn'); return false; }

  /* نحفظ الوضع الحالي أولاً، فلا تفقد ما أنت عليه الآن */
  recordHistory('قبل الاستعادة', true);

  state.report = migrate(snap);
  state.editingId = state.report.id;
  saveDraft();
  renderAll();
  toast('استُعيدت النسخة السابقة ✓', 'ok');
  renderHistoryView();
  return true;
}

/** يحذف سجل تقرير (عند حذف التقرير) */
function dropHistory(reportId) {
  const H = HIST();
  if (!H || !reportId) return false;
  const hist = readHistory();
  const ok = H.dropReport(hist, reportId);
  if (ok) writeHistory(hist, true);
  return ok;
}

/** يرسم قائمة النسخ السابقة */
function renderHistoryView() {
  const H = HIST();
  const box = $('#histList');
  if (!H || !box || !state.report) return;

  const list = H.listFor(readHistory(), state.report.id);
  const stats = $('#histStats');

  if (!list.length) {
    box.innerHTML = '<p class="empty">لا نسخ محفوظة بعد. تُسجَّل نسخة تلقائياً كل دقيقة تقريباً وعند الحفظ.</p>';
    if (stats) stats.textContent = '';
    return;
  }

  box.innerHTML = list.map((e, i) => {
    const d = new Date(e.at);
    const when = isNaN(d.getTime()) ? '' :
      `${fmtDate(e.at.slice(0, 10))} — ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    /* نقارن كل لقطة بالتي بعدها (الأقدم) لنُظهر ما تغيّر */
    const older = list[i + 1];
    const changes = older ? H.diff(older.snapshot, e.snapshot) : [];
    const chTxt = changes.length
      ? changes.slice(0, 4).map(c => `<span class="pill">${esc(c.label)}</span>`).join(' ') +
        (changes.length > 4 ? ` <span class="pill">+${changes.length - 4}</span>` : '')
      : '<span class="hint">النسخة الأولى</span>';

    return `
      <div class="hist" data-hist="${esc(e.id)}">
        <div class="top">
          <span class="when">${esc(when)}</span>
          <span class="badge histb">${esc(e.reason || 'تعديل')}</span>
          <span class="grow"></span>
          <button class="btn ghost sm" data-histview="${esc(e.id)}">👁️ عرض</button>
          <button class="btn warn sm" data-histrestore="${esc(e.id)}">↩ استعادة</button>
        </div>
        <div class="meta">${esc(e.title || e.facility || 'بدون عنوان')}</div>
        <div class="chg">${chTxt}</div>
      </div>`;
  }).join('');

  if (stats) {
    stats.textContent = `${list.length} نسخة محفوظة`;
  }
}

/** يعرض لقطة في نافذة منفصلة (طباعة/معاينة) */
function previewHistory(entryId) {
  const H = HIST();
  if (!H || !state.report) return;
  const snap = H.snapshotOf(readHistory(), state.report.id, entryId);
  if (!snap) { toast('لم تُوجد النسخة', 'warn'); return; }

  /* نبني معاينة مؤقتة من اللقطة عبر النموذج */
  const cur = state.report;
  try {
    state.report = migrate(snap);
    const M = ADMHReport.buildModel();
    const w = window.open('', '_blank');
    if (!w) { toast('المتصفح منع فتح النافذة', 'warn'); return; }
    const H2 = [];
    H2.push('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">');
    H2.push('<title>نسخة سابقة — ' + (M.title || '') + '</title>');
    H2.push('<style>body{font-family:"Simplified Arabic",Tahoma,sans-serif;direction:rtl;padding:24px;line-height:1.9}');
    H2.push('h1{font-size:1.3em;color:#004d40;text-align:center}h2{font-size:1.05em;color:#004d40;border-bottom:1px solid #00796b;padding-bottom:3px}');
    H2.push('p{margin:5px 0}.hdr{text-align:center;border-bottom:3px double #004d40;padding-bottom:10px}</style></head><body>');
    H2.push('<div class="hdr">');
    [M.header.l1, M.header.l2, M.header.l3].filter(Boolean).forEach(l => H2.push('<div>' + esc(l) + '</div>'));
    H2.push('<h1>' + esc(M.title) + '</h1>');
    if (M.meta.length) H2.push('<div>' + M.meta.map(m => '<b>' + esc(m[0]) + ':</b> ' + esc(m[1])).join(' | ') + '</div>');
    H2.push('</div><p>' + esc(M.intro) + '</p>');
    M.sections.forEach(s => {
      if (!s.heading) return;
      H2.push('<h2>' + esc(s.heading) + '</h2>');
      if (s.type === 'kv') {
        (s.rows || []).forEach(r => H2.push('<p><b>' + esc(r[0]) + ':</b> ' + esc(r[1]) + '</p>'));
        (s.notes || []).forEach(n => H2.push('<p>' + esc(n) + '</p>'));
      } else if (s.type === 'list') {
        (s.items || []).forEach(i => H2.push('<p>' + esc(i) + '</p>'));
      } else if (s.type === 'recs') {
        s.groups.forEach(g => {
          H2.push('<p><b>' + esc(g.intro || g.label) + '</b></p>');
          g.items.forEach((it, i) => H2.push('<p>' + (i + 1) + '- ' + esc(it) + '</p>'));
        });
      } else if (s.type === 'positions') {
        s.blocks.forEach(b => {
          H2.push('<p>' + esc(b.intro) + '</p>');
          b.cats.forEach(c => {
            H2.push('<p><b>' + esc(c.title) + ':</b></p>');
            c.items.forEach(it => H2.push('<p>' + esc(it) + '</p>'));
          });
        });
      }
    });
    H2.push('</body></html>');
    w.document.write(H2.join(''));
    w.document.close();
  } finally {
    state.report = cur;      /* نُعيد التقرير الحالي دائماً */
  }
}
/**
 * يحفظ التقرير الحالي في الأرشيف.
 * -----------------------------------------------------------------------------
 * عطل حقيقي كان يحدث: كان `jwrite()` يُستدعى وتُتجاهل نتيجتها، ثم تُعرض
 * رسالة «تم الحفظ في الأرشيف» **حتى لو فشلت الكتابة** (امتلاء مساحة
 * التخزين مثلاً). فيظن المستخدم أن تقريره محفوظ وهو ليس كذلك.
 *
 * الآن: لا رسالة نجاح إلا بعد التحقق من نجاح الكتابة فعلاً.
 * -----------------------------------------------------------------------------
 */
function saveToArchive(silent) {
  const idx = state.reports.findIndex(r => r.id === state.report.id);
  state.report.updatedAt = new Date().toISOString();
  if (idx >= 0) state.reports[idx] = JSON.parse(JSON.stringify(state.report));
  else state.reports.unshift(JSON.parse(JSON.stringify(state.report)));

  const ok = jwriteSilent(LS_REPORTS, state.reports);
  refreshArchiveMeta();

  if (!ok) {
    /* فشل التخزين: نُبقي التقرير في الذاكرة ونطلب تصدير نسخة احتياطية */
    toast('⚠️ تعذّر الحفظ في الأرشيف — مساحة التخزين ممتلئة أو محظورة.\n' +
          'تقريرك ما زال مفتوحاً ولم يضِع. صدّره الآن كنسخة احتياطية، ' +
          'ثم احذف تقارير قديمة وفَرّغ مساحة.', 'err', 20000);
    return false;
  }
  /* لقطة إجبارية عند الحفظ — فالحفظ حدث مهم يستحق نسخة */
  recordHistory('الحفظ في الأرشيف', true);
  if (!silent) toast('تم الحفظ في الأرشيف', 'ok');
  return true;
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
    <td data-label="جهة السحب / المصدر"><input type="text" data-k="source" list="dlSources" placeholder="مثال: موظفي المركز" value="${esc(d.source || '')}"></td>
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
      <td data-label="اسم السجل"><input type="text" data-f="name" list="dlRecordNames" placeholder="اختر سجلاً أو اكتبه" value="${esc(r.name || '')}" autocomplete="off"></td>
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
  /* جهات السحب / المصادر في جدول الإجراءات — تُحرَّر من مكتبة العبارات */
  fillDatalist('#dlSources', 'procedureSources');
  /* أسماء السجلات — قائمة قابلة للاختيار، والحقل يبقى قابلاً للكتابة */
  fillDatalist('#dlRecordNames', 'recordNames');

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
    <td data-label="جهة السحب / المصدر"><input type="text" data-k="source" list="dlSources" placeholder="مثال: موظفي المركز" value="${esc(d.source || '')}"></td>
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
  bindOn('#btnWord', () => ADMHReport.run('تصدير Word', ADMHReport.exportWord));
  bindOn('#btnWord2', () => ADMHReport.run('تصدير Word', ADMHReport.exportWord));
  bindOn('#btnPreviewGo', () => showView('preview'));
  /* ---------------------------------------------------------------------
     قائمة خيارات نسخ التقرير.
     ---------------------------------------------------------------------
     عطلان حقيقيان كانا يمنعان ظهور الخيارات:

     ١) مستمع document (الإغلاق عند النقر خارج القائمة) كان يعمل بعد هذا
        المعالج في **نفس** حدث النقر — لأن الحدث يوصل إلى document بعد الزر.
        فيُغلق القائمة فور فتحها. الحل: منع انتشار الحدث.

     ٢) القائمة تقع داخل #view-preview، وهو **مخفي** حتى ننتقل إلى المعاينة.
        فالخيارات لا تظهر أبداً من شاشة التحرير، ويبدو الزر كأنه ينسخ مباشرةً.
        الحل: ننتقل إلى المعاينة أولاً، ثم نفتح القائمة في الإطار التالي.
     --------------------------------------------------------------------- */
  let copyMenuTimer = null;

  bindOn('#btnCopy', (event) => {
    event.preventDefault();
    event.stopPropagation();          /* ← يمنع الإغلاق في نفس النقرة */

    const menu = $('#copyMenu');
    if (!menu) {
      showView('preview');
      setTimeout(() => ADMHReport.run('النسخ', () => ADMHReport.copyReport('all')), 60);
      return;
    }

    /* ننتقل إلى المعاينة إن لم نكن فيها — فالقائمة داخلها ولا تظهر بدونها */
    const inPreview = !$('#view-preview').classList.contains('hidden');
    if (!inPreview) {
      showView('preview');
      ADMHReport.run('المعاينة', ADMHReport.renderPreview);
      /* نفتح القائمة في الإطار التالي، بعد أن يصبح الحاوي ظاهراً */
      clearTimeout(copyMenuTimer);
      copyMenuTimer = setTimeout(() => {
        menu.classList.add('open');
        $('#btnCopy').setAttribute('aria-expanded', 'true');
      }, 40);
      return;
    }

    const isOpen = menu.classList.toggle('open');
    $('#btnCopy').setAttribute('aria-expanded', String(isOpen));
  });

  document.querySelectorAll('#copyMenuList [data-copy-mode]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();        /* لا نُغلق عبر مستمع document */
      const mode = button.getAttribute('data-copy-mode') || 'all';
      const menu = $('#copyMenu');
      if (menu) menu.classList.remove('open');
      $('#btnCopy')?.setAttribute('aria-expanded', 'false');
      ADMHReport.run('النسخ', () => ADMHReport.copyReport(mode));
    });
  });

  document.addEventListener('click', event => {
    const menu = $('#copyMenu');
    if (menu && !menu.contains(event.target)) {
      menu.classList.remove('open');
      $('#btnCopy')?.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const menu = $('#copyMenu');
      if (menu) menu.classList.remove('open');
      $('#btnCopy')?.setAttribute('aria-expanded', 'false');
    }
  });

  /* الطباعة: تُفوَّض إلى report-print.js */
  bindOn('#btnPrint', () => { showView('preview'); setTimeout(() => ADMHReport.run('الطباعة', ADMHReport.printReport), 120); });
  bindOn('#btnSaveLocal', () => saveToArchive());

  /* جديد — نسأل عن التقرير الحالي ثم نفتح نافذة فارغة */
  bindOn('#btnNew', () => openNewReport());
  bindOn('#newSave', () => newReport(true));      /* احفظ الحالي ثم ابدأ جديداً */
  bindOn('#newDiscard', () => newReport(false));  /* ابدأ جديداً بلا حفظ */

  /* المتابعة: ملف المؤسسات · التوصيات · لوحة المؤشرات */
  bindFollowUps();
  /* سحب توصيات المؤسسة من سجل التوصيات إلى هذا التقرير */
  bindOn('#btnPullPrevRecs', () => pullPreviousRecs());

  /* سجل التعديلات */
  bindOn('#btnHistNow', () => {
    if (recordHistory('لقطة يدوية', true)) toast('حُفظت نسخة ✓', 'ok');
    else toast('لا تغيير يستحق نسخة جديدة', 'warn');
  });
  bindOn('#btnHistClear', () => {
    if (!state.report) return;
    if (!confirm('حذف سجل تعديلات هذا التقرير؟ لن تتأثر النسخ المحفوظة في الأرشيف.')) return;
    if (dropHistory(state.report.id)) { toast('حُذف السجل', 'ok'); renderHistoryView(); }
  });
  /* نقل قاعدة البيانات: رفع / تنزيل */
  bindOn('#btnUploadDb', () => openTransfer('upload'));
  bindOn('#btnDownloadDb', () => openTransfer('download'));
  bindOn('#btnTransferGo', () => runTransfer());

  /* النسخ الاحتياطية الكاملة */
  bindOn('#btnBackupNow', () => {
    if (takeFullBackup('نسخة يدوية')) {
      toast('أُخذت نسخة كاملة', 'ok');
      renderBackups();
    } else {
      toast('تعذّر أخذ النسخة — مساحة التخزين ممتلئة', 'err', 9000);
    }
  });
  bindOn('#btnBackupExport', () => exportBackups());
  bindOn('#btnBackupImport', () => $('#fileBackupImport').click());
  const fbi = $('#fileBackupImport');
  if (fbi) fbi.onchange = () => { importBackups(fbi.files[0]); fbi.value = ''; };
  (function () {
    const box = $('#backupList');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bkrestore]');
      if (!b) return;
      restoreFullBackup(+b.getAttribute('data-bkrestore'));
      renderBackups();
    });
  })();

  /* المسودات */
  bindOn('#btnDrafts', () => openDrafts());
  bindOn('#btnDraftsRefresh', () => renderDrafts());
  bindOn('#btnDraftsExport', () => exportCurrentDraft());
  (function () {
    const box = $('#draftsBody');
    if (!box) return;
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-draftopen]')) { openCurrentDraft(); return; }
      if (e.target.closest('[data-draftexport]')) { exportCurrentDraft(); return; }
      handleHistoryClick(e);
    });
  })();

  /* التوصيات: تحديث وتصدير */
  bindOn('#btnRecRefresh', () => {
    rebuildRegistry();
    renderRecs();
    toast('حُدّثت التوصيات من التقارير', 'ok');
  });
  bindOn('#btnRecExport', () => exportRecsCsv());

  /* أزرار اللقطات — تفويض على الحاوي (تتغيّر مع كل رسم) */
  (function () {
    const box = $('#histList');
    if (!box) return;
    box.addEventListener('click', handleHistoryClick);
  })();

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

  /* إعادة بناء الواجهة عند تغيّر أي قائمة — ونختم الوقت لتعرف المزامنة
     أن القوائم تغيّرت محلياً (وإلا ضاعت تعديلاتك بصمت). */
  if (window.ADMHLists) window.ADMHLists.onChange(() => {
    stampLocalChange('lists');
    renderListPicker();
    applyListChanges();
  });

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
  bindOn('#btnSyncGoogle', () => {
    const S = sync.available() ? sync.get() : null;

    /* -----------------------------------------------------------------
       مهم: يجب أن يقع طلب النافذة داخل تفعيل النقرة مباشرةً.
       إن انتظرنا تحميل المكتبة في هذه اللحظة، يضيع التفعيل فيحوّله Chrome
       إلى إعادة توجيه كاملة — وهذا سبب «نافذة ثم انتقال» على الهاتف.
       لذلك: إن لم تكن المكتبة جاهزة نُجهّزها ونطلب من المستخدم نقرة ثانية.
       ----------------------------------------------------------------- */
    if (S && S.hasGoogleClientId && S.hasGoogleClientId() && S.googleReady && !S.googleReady()) {
      toast('جارٍ تجهيز الدخول من Google… انتظر لحظة ثم اضغط الزر مرة أخرى.', 'warn', 5000);
      S.prepareGoogle().then(ok => {
        if (ok) toast('الدخول جاهز الآن — اضغط «الدخول بحساب Google»', 'ok', 5000);
        else syncNow(true);        /* التجهيز فشل: نجرّب المسار المعتاد */
      });
      return;
    }
    syncNow(true);
  });

  /* ---------------------------------------------------------------------
     معرّف عميل Google.
     الحقل نصّ لاتيني داخل صفحة عربية، فاللصق قد يجلب مسافات أو محارف اتجاه
     مخفية أو محارف HTML. نُنظّفها كلها قبل الحفظ — وإلا فشل الدخول بسبب
     محرف واحد غير مرئي.
     --------------------------------------------------------------------- */
  const cleanClientId = v => String(v == null ? '' : v)
    .replace(/&amp;/g, '&')                                 /* قادم من صفحة ويب */
    .replace(/[\s\u00a0\u200e\u200f\u202a-\u202e\ufeff]+/g, '') /* مسافات ومحارف اتجاه */
    .replace(/^["'<]+|["'>]+$/g, '')                        /* اقتباسات أو أقواس عالقة */
    .trim();

  const validClientId = v => /^[\w.-]+\.apps\.googleusercontent\.com$/.test(v);

  /* معاينة فورية: تُطمئن المستخدم أن القيمة سليمة قبل الحفظ */
  function showClientIdPreview() {
    const inp = $('#syncGClient'), prev = $('#gcidPreview');
    const v = cleanClientId(inp && inp.value);
    if (!prev) return v;
    if (!v) { prev.textContent = ''; }
    else if (validClientId(v)) {
      prev.textContent = '✓ الصيغة صحيحة (' + v.length + ' حرفاً) — ستبدأ بـ ' + v.slice(0, 12) + '…';
      prev.style.color = 'var(--ok, #2e7d32)';
    } else {
      prev.textContent = '✗ الصيغة غير صحيحة — يجب أن تنتهي بـ .apps.googleusercontent.com';
      prev.style.color = 'var(--danger, #c62828)';
    }
    return v;
  }

  const gi0 = $('#syncGClient');
  if (gi0) {
    gi0.addEventListener('input', showClientIdPreview);
    gi0.addEventListener('paste', () => setTimeout(showClientIdPreview, 0));
  }

  /* لصق مباشر من الحافظة — يتجاوز أي تشويه في حقل الإدخال */
  bindOn('#btnPasteGClient', () => {
    const set = txt => {
      const v = cleanClientId(txt);
      const inp = $('#syncGClient');
      if (inp) inp.value = v;
      showClientIdPreview();
      if (!v) { toast('الحافظة فارغة', 'warn'); return; }
      if (validClientId(v)) toast('لُصق المعرّف ونُظّف ✓ — اضغط «حفظ المعرّف»', 'ok', 4000);
      else toast('لُصق النص لكن صيغته غير صحيحة', 'warn', 5000);
    };
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText()
        .then(set)
        .catch(() => {
          /* المتصفح يمنع قراءة الحافظة: نُرشد المستخدم إلى اللصق اليدوي */
          const inp = $('#syncGClient');
          if (inp) inp.focus();
          toast('المتصفح منع القراءة — الصق يدوياً في الحقل (Ctrl+V)', 'warn', 5000);
        });
    } else {
      const inp = $('#syncGClient');
      if (inp) inp.focus();
      toast('الصق يدوياً في الحقل (Ctrl+V)', 'warn', 4000);
    }
  });

  /* حفظ معرّف عميل Google: بدونه قد يفشل الدخول على الهاتف */
  bindOn('#btnSaveGClient', () => {
    if (!sync.available()) { toast('وحدة المزامنة غير محمّلة', 'err'); return; }
    const inp = $('#syncGClient');
    const raw = (inp && inp.value) || '';
    const v = cleanClientId(raw);

    /* نُصحّح الحقل ليُظهر القيمة النظيفة فعلاً */
    if (inp && inp.value !== v) inp.value = v;

    if (v && !validClientId(v)) {
      toast('الصيغة غير صحيحة — يجب أن ينتهي المعرّف بـ .apps.googleusercontent.com', 'warn', 7000);
      showClientIdPreview();
      return;
    }

    /* ---------------------------------------------------------------------
       حقل فارغ لا يعني «احذف المعرّف». المضمَّن في النظام يبقى فعّالاً.
       كان الحفظ بحقل فارغ يمسح المعرّف المضمَّن والمحفوظ معاً، فيتخطّى
       النظام Google Identity ويسقط إلى نافذة Firebase — التي تفشل على
       الهاتف بـ auth/internal-error. وهذا كان عطلاً حقيقياً.
       --------------------------------------------------------------------- */
    if (!v) {
      const embedded = sync.get().setGoogleClientId('');
      renderSyncUI();
      showClientIdPreview();
      toast(embedded
        ? 'الحقل فارغ — النظام يستخدم المعرّف المضمَّن تلقائياً'
        : 'لا يوجد معرّف عميل Google', 'ok', 5000);
      return;
    }

    sync.get().setGoogleClientId(v);
    renderSyncUI();
    showClientIdPreview();
    toast('حُفظ معرّف عميل Google (' + v.length + ' حرفاً) — أعد المحاولة الآن', 'ok', 5000);
  });

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
    'btnCopy',
  'newSave', 'newDiscard',
  'btnSaveGClient', 'btnPasteGClient',
    'btnListAdd', 'btnListReset', 'listPicker',
    /* التوصيات */
    'btnRecAdd', 'btnRecRefresh', 'btnRecExport', 'btnPullPrevRecs',
    /* سجل التعديلات */
    'btnHistNow', 'btnHistClear',
    /* ملف المؤسسة */
    'btnFacClose', 'btnFacSaveNotes', 'btnFacNewVisit',
    /* لوحة المؤشرات */
    'btnDashApply', 'btnDashPrint',
    /* نقل قاعدة البيانات والمسودات */
    'btnUploadDb', 'btnDownloadDb', 'btnTransferGo',
    'btnDrafts', 'btnDraftsRefresh', 'btnDraftsExport',
    'bulkFillEmpty', 'bulkFillAll'];

  /* ---------------------------------------------------------------------
     ما هو «معالج» لكل عنصر؟
     ---------------------------------------------------------------------
     كان الفحص يطلب `onclick` من **كل** عنصر، فأنتج إنذاراً كاذباً:
         [verifyBindings] أزرار بلا معالج: listPicker
     لأن `listPicker` قائمة منسدلة تُربط بـ`onchange` لا `onclick`.

     الفحص الصحيح حسب نوع العنصر:
       · <select>  → onchange
       · <button>  → onclick
     --------------------------------------------------------------------- */
  const missing = must.filter(id => {
    const el = document.getElementById(id);
    if (!el) return true;
    const prop = (el.tagName === 'SELECT') ? 'onchange' : 'onclick';
    return typeof el[prop] !== 'function';
  });
  if (missing.length) console.warn('[verifyBindings] عناصر بلا معالج:', missing.join(', '));
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
  stampLocalChange('settings');
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
    stampLocalChange('library');
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
  if (name === 'preview') ADMHReport.run('المعاينة', ADMHReport.renderPreview);
  if (name === 'archive') renderArchive();
  if (name === 'library') renderLibraryView();
  if (name === 'facilities') { rebuildRegistry(); renderFacilities(); }
  if (name === 'recs') { rebuildRegistry(); renderRecs(); }
  if (name === 'dash') { rebuildRegistry(); renderDash(); }
  if (name === 'settings') {
    fillSettingsForm();
    if (typeof renderBackups === 'function') renderBackups();
    /* تجهيز مسبق لمكتبة Google: حتى يبقى طلب الدخول داخل تفعيل النقرة،
       فلا يتحول إلى إعادة توجيه كاملة على الهاتف. */
    if (sync.available()) {
      const S = sync.get();
      if (S.hasGoogleClientId && S.hasGoogleClientId() && S.prepareGoogle) {
        S.prepareGoogle().catch(() => {});
      }
    }
  }
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
      refreshArchiveMeta();
      /* التقارير تغيّرت — نُعيد بناء سجل التوصيات وأعداد المتابعة */
      if (typeof rebuildRegistry === 'function') rebuildRegistry();
      /* يُحذف سجل تعديلات التقرير المحذوف (تبقى اللقطات بلا صاحب) */
      if (typeof dropHistory === 'function') dropHistory(id);
      renderArchive(); toast('تم الحذف', 'ok');
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
  const tb = $('#themeBtn'); if (tb) tb.textContent = dark ? '☀️' : '🌙';
  try { localStorage.setItem(LS_THEME, dark ? 'dark' : 'light'); } catch (e) {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = dark ? '#0f1517' : '#004d40';
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(LS_THEME); } catch (e) {}
  applyTheme(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/* ---------------------------------------------------------------- تقرير جديد */
/**
 * يفتح نافذة السؤال: هل نحفظ التقرير الحالي في الأرشيف أم لا؟
 * بعد الاختيار — حفظاً أو لا — تُفتح نافذة إدخال فارغة تماماً.
 */
function openNewReport() {
  /* إن كان التقرير الحالي فارغاً تماماً فلا داعي للسؤال — نبدأ مباشرة */
  const empty = !state.report.facilityName && !state.report.visitDate &&
    !(state.report.procedures || []).length && !(state.report.records || []).length;
  if (empty) { newReport(false); return; }

  const facility = tidy(state.report.facilityName) || 'بلا اسم';
  const hint = $('#newModalHint');
  if (hint) {
    hint.textContent = 'التقرير الحالي: ' + facility +
      (fmtDate(state.report.visitDate) ? ' — بتاريخ ' + fmtDate(state.report.visitDate) : '') +
      '. ماذا تريد أن تفعل به قبل فتح النافذة الجديدة؟';
  }
  openModal('#newModal');
}

/**
 * ينشئ تقريراً جديداً فارغاً.
 * @param {boolean} saveFirst هل نحفظ التقرير الحالي في الأرشيف أولاً؟
 */
function newReport(saveFirst) {
  closeModal($('#newModal'));

  if (saveFirst) {
    saveToArchive(true);            /* صامت: لا نُكرر الإشعار */
  } else {
    /* لم نحفظ: نُبقي نسخة في المسودة حتى لا يضيع العمل بالخطأ */
    saveDraft();
  }

  /* نافذة إدخال مصفّرة من كل شيء */
  state.report = blankReport();
  state.editingId = state.report.id;
  renderAll();
  applyScope();
  saveDraft();
  showView('report');

  /* نُعيد التمرير إلى أعلى النموذج ليبدأ الإدخال من أول حقل */
  const main = document.querySelector('.main');
  if (main) main.scrollTop = 0;
  const first = $('#f_facilityName');
  if (first) setTimeout(() => { try { first.focus(); } catch (e) {} }, 80);

  toast(saveFirst ? 'حُفظ التقرير السابق في الأرشيف — نافذة جديدة جاهزة' : 'نافذة جديدة جاهزة — التقرير السابق محفوظ كمسودة', 'ok', 3200);
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
  { t: 'نسخ التقرير بتنسيقه', k: 'copy', run: () => { showView('preview'); setTimeout(() => { const menu = $('#copyMenu'); if (menu) { menu.classList.add('open'); $('#btnCopy')?.setAttribute('aria-expanded', 'true'); } else ADMHReport.run('النسخ', () => ADMHReport.copyReport('all')); }, 60); } },
  { t: 'طباعة', k: 'print', run: () => { showView('preview'); setTimeout(() => ADMHReport.run('الطباعة', ADMHReport.printReport), 120); } },
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
      /* -----------------------------------------------------------------
         وقت تعديل حقيقي لكل مجموعة — لا `state.settingsUpdatedAt`
         (وهو معرّف غير موجود، فكان يُرسل null دائماً فيضيع المحلي بصمت).
         ----------------------------------------------------------------- */
      settings: Object.assign({}, state.settings, { updatedAt: localStamp('settings') }),
      libraryAt: localStamp('library'),
      library: state.library,
      /* -----------------------------------------------------------------
         أوقات تعديل المحتوى — تُرسل مع الحمولة
         -----------------------------------------------------------------
         لا يكفي `updatedAt` للمستند: فهو وقت آخر كتابة، وكل دفع يُحدّثه.
         فلو قارنّا به لظهر تعارض كاذب في كل مزامنة تالية. هذه الأوقات
         تُحفظ **داخل المحتوى** فلا يمسّها الدفع.
         ----------------------------------------------------------------- */
      settingsAt: localStamp('settings'),
      libraryAt: localStamp('library'),
      library: state.library,
      listsAt: localStamp('lists'),
      lists: (typeof window !== 'undefined' && window.ADMHLists) ? window.ADMHLists.exportAll() : null,
      /* سجل المؤسسات ودورة حياة التوصيات — يُزامَن مع بقية البيانات */
      registryAt: localStamp('registry'),
      registry: readRegistry(),
      /* المسودة الحالية: تُزامَن ليكمل العمل على الجهاز الآخر */
      draft: { report: state.report, editingId: state.editingId, at: Date.now() },
      draftAt: localStamp('draft'),
      /* أوقات آخر مزامنة — تميّز «الجديد عند الطرفين» من «الجديد عند طرف واحد» */
      synced: Object.assign({}, syncMeta.synced || {}),
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
        /* نكتب بصمت: فشل الكتابة هنا لا يجب أن يُشوّش، لكن **يكفي لنزيل
           الادّعاء بأن الإعدادات محفوظة محلياً**. */
        jwriteSilent(LS_SETTINGS, state.settings);
      }
      if (payload.library && typeof payload.library === 'object') {
        ['records', 'reco', 'general'].forEach(k => { if (Array.isArray(payload.library[k])) state.library[k] = payload.library[k]; });
        jwriteSilent(LS_LIBRARY, state.library);
      }
      if (payload.lists && typeof payload.lists === 'object' && window.ADMHLists) {
        if (window.ADMHLists.importAll(payload.lists)) {
          saveListsCache();
          renderListPicker();
          renderListEditor();
          applyListChanges();
        }
      }
      /* سجل المؤسسات: نأخذه كما هو من الدمج ثم نُعيد بناء التوصيات من التقارير */
      if (payload.registry && typeof payload.registry === 'object') {
        const R2 = REG();
        if (R2) {
          registryCache = R2.normalizeRegistry(payload.registry);
          jwriteSilent(LS_REGISTRY, registryCache);
          registryCache.recs = R2.buildRecs(state.reports, registryCache);
          jwriteSilent(LS_REGISTRY, registryCache);
          updateFollowCounts();
        }
      }
      /* -----------------------------------------------------------------
         المسودة الواردة من السحابة
         -----------------------------------------------------------------
         لا نطمس ما بين يديك بلا علمك: نُحمّلها فقط إن لم تكن تعمل على
         تعديل محلي أحدث. وإن كانت أحدث، نُعلمك ونترك القرار لك.
         ----------------------------------------------------------------- */
      if (payload.draftFromCloud && payload.draft && payload.draft.report) {
        const localDraftAt = Date.parse(localStamp('draft') || 0) || 0;
        const cloudAt = Date.parse(payload.draftAt || 0) || 0;
        /* هل التقرير الحالي فيه عمل غير محفوظ؟ */
        const dirty = !!(state.report && (
          tidy(state.report.facilityName) ||
          (state.report.recGroups || []).some(g => (g.items || []).some(tidy)) ||
          (state.report.records || []).some(r => tidy(r.name))
        ));
        if (!dirty || cloudAt > localDraftAt) {
          state.report = migrate(payload.draft.report);
          state.editingId = payload.draft.editingId || state.report.id;
          jwriteSilent(LS_DRAFT, payload.draft);
          markSynced('draft', new Date(cloudAt || Date.now()).toISOString());
          renderAll();
          toast('استُؤنفت المسودة من جهاز آخر', 'ok', 5000);
        } else {
          toast('توجد مسودة أحدث على جهاز آخر — لم أستبدل ما تعمل عليه. راجعها هناك أو ابدأ تقريراً جديداً لسحبها.', 'warn', 12000);
        }
      }
      /* لقطة في السجل عند وصول تقرير من السحابة */
      if (Array.isArray(payload.reports) && typeof recordHistory === 'function') {
        recordHistory('مزامنة', false);
      }
      const st = S.status();
      if (st && st.lastSync) state.lastSyncSync = st.lastSync;
      /* -----------------------------------------------------------------
         نُسجّل أن هذه المجموعات صارت متزامنة — وهذا **ليس** تعديلاً محلياً.
         بلا هذه الخطوة، يُحسب السحابي «جديداً عند الطرفين» في كل مزامنة
         تالية، فيظهر تعارض وهمي في كل مرة.
         ----------------------------------------------------------------- */
      if (payload.synced && typeof payload.synced === 'object') {
        syncMeta.synced = Object.assign({}, syncMeta.synced || {}, payload.synced);
        writeSyncMeta(syncMeta);
      } else {
        /* توافق مع نسخة سابقة: نعتبر كل شيء متزامناً الآن */
        ['settings', 'library', 'lists', 'registry'].forEach(g => {
          if (payload[g]) markSynced(g);
        });
      }
      renderSyncUI(S.status());
      updateFollowCounts();
    },
  });
  sync.ready = true;
  sync.readyPromise = S.ready;
  renderSyncUI(S.status());

  /* استئناف الجلسة ثم مزامنة صامتة — دون تعطيل الواجهة */
  return S.session().then(connected => {
    renderSyncUI(S.status());
    if (!connected) return;

    /* =====================================================================
       حماية البيانات المحلية عند تبديل الحساب
       =====================================================================
       المخاطرة: التخزين المحلي مشترك على الجهاز، وليس مقسَّماً بحسب الحساب.
       فلو سجّل مستخدم آخر الدخول على الجهاز نفسه، لكانت مزامنته ترفع تقارير
       المستخدم الأول إلى حسابه — وهذا تسريب بيانات بين حسابين.

       الحل: نتذكّر آخر حساب زامنّاه. فإن اختلف الحساب، **لا نُزامن تلقائياً**
       بل نسأل المستخدم صراحةً. وبلا موافقته تبقى البيانات المحلية كما هي.
       ===================================================================== */
    const curUid = (S.status() && S.status().uid) || currentSyncUid();
    const owner = readLocalOwner();

    if (owner && curUid && owner !== curUid) {
      /* -----------------------------------------------------------------
         حساب مختلف عن صاحب البيانات المحلية.
         إن كان المستخدم قد رفض سابقاً فلا نُعيد السؤال في كل فتح للصفحة —
         نحترم قراره ونكتفي بتذكيره.
         ----------------------------------------------------------------- */
      if (ownerRefused(curUid)) {
        toast('البيانات المحلية تخصّ حساباً آخر ولم تُرفع إليه', 'warn', 6000);
        renderSyncUI(S.status());
        return;
      }

      const pushIt = confirm(
        'البيانات المحلية على هذا الجهاز تعود إلى حساب آخر.\n\n' +
        'سؤال مهم قبل المزامنة:\n' +
        'هل تريد رفع التقارير المحلية إلى الحساب الجديد؟\n\n' +
        '· «موافق» = تُرفع البيانات المحلية إلى الحساب الجديد.\n' +
        '· «إلغاء» = تبقى محلية كما هي، ولن تُرفع (الأأمن).');
      if (pushIt) {
        markLocalOwner(curUid);
        return S.syncNow().then(r => {
          if (r && !r.skipped) toast(`تمت المزامنة (${r.total} تقرير)`, 'ok');
          renderSyncUI(S.status());
        }).catch(() => renderSyncUI(S.status()));
      }
      /* رفض الرفع: نُبقي البيانات محلية ولا نزامن، ونتذكّر القرار */
      markLocalOwner(curUid, true);
      toast('لم تُرفع البيانات المحلية إلى الحساب الجديد — بقيت محلية', 'warn', 8000);
      renderSyncUI(S.status());
      return;
    }

    /* الحساب نفسه (أو أول مرة): نزامن عادةً */
    if (!owner) markLocalOwner(curUid);
    return S.syncNow().then(r => {
      if (r && !r.skipped) toast(`تمت المزامنة (${r.total} تقرير)`, 'ok');
      renderSyncUI(S.status());
    }).catch(() => renderSyncUI(S.status()));
  }).catch(() => { renderSyncUI(S.status()); });
}

/* =============================================================================
   ملكية البيانات المحلية
   =============================================================================
   نتذكّر أي حساب يملك البيانات المحلية على هذا الجهاز، حتى لا تنتقل تقارير
   مستخدم إلى حساب مستخدم آخر عند تبديل الحساب.
   ============================================================================= */
const LS_LOCAL_OWNER = 'admh.local.owner.v1';

/** آخر حساب زامنّاه على هذا الجهاز (أو null) */
function readLocalOwner() {
  try {
    const raw = localStorage.getItem(LS_LOCAL_OWNER);
    if (!raw) return null;
    /* الشكل القديم كان نصاً مجرّداً — نقبله أيضاً */
    if (raw.charAt(0) !== '{') return raw;
    const o = JSON.parse(raw);
    return (o && o.uid) || null;
  } catch (e) { return null; }
}

/** هل رفض المستخدم رفع بياناته إلى هذا الحساب؟ */
function ownerRefused(uid) {
  try {
    const o = JSON.parse(localStorage.getItem(LS_LOCAL_OWNER) || '{}');
    return !!(o && o.refused && o.uid === uid);
  } catch (e) { return false; }
}

/**
 * يسجّل صاحب البيانات المحلية.
 * @param {string} uid
 * @param {boolean} [refused] المستخدم رفض رفع بياناته إلى هذا الحساب
 */
function markLocalOwner(uid, refused) {
  try {
    localStorage.setItem(LS_LOCAL_OWNER, JSON.stringify({
      uid: uid || '', refused: !!refused, at: new Date().toISOString(),
    }));
  } catch (e) {}
}

/** uid الحساب الحالي من وحدة المزامنة (إن وُجد) */
function currentSyncUid() {
  try {
    const S = sync.available() ? sync.get() : null;
    if (!S) return '';
    const st = S.status();
    /* نُفضّل uid الحقيقي — فالبريد قد يتغيّر أو يتكرّر */
    return (st && (st.uid || st.email)) || '';
  } catch (e) { return ''; }
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

  /* ---------------------------------------------------------------------
     حالة معرّف عميل Google — تُعرض دائماً، في أي حالة كانت المزامنة.
     السبب: المعرّف مطلوب ليعمل الدخول على الهاتف، وقد يكون المستخدم
     مسجّلاً بالفعل على الحاسوب (فتظهر له شاشة «متصل» لا شاشة الإعداد).
     --------------------------------------------------------------------- */
  const S = sync.available() ? sync.get() : null;
  const hasG = !!(S && S.hasGoogleClientId && S.hasGoogleClientId());
  const gst = $('#gcidState');
  if (gst) {
    gst.textContent = hasG ? '✓ مضبوط — الهاتف مدعوم' : 'غير مضبوط';
    gst.style.color = hasG ? 'var(--ok, #2e7d32)' : '';
  }
  const gi = $('#syncGClient');
  if (gi && document.activeElement !== gi && S && S.googleClientId) {
    const v = S.googleClientId();
    if (v && !gi.value) gi.value = v;
  }
  /* نعرض المعرّف المحفوظ كاملاً — ليتأكد المستخدم أن الأرقام في أولها */
  const gsv = $('#gcidSaved');
  if (gsv && S && S.googleClientId) {
    const v = S.googleClientId();
    gsv.textContent = v ? ('المحفوظ: ' + v) : '';
  }
  /* إن لم يكن مضبوطاً، افتح القسم تلقائياً ليُلاحظه المستخدم */
  const gbox = $('#gcidBox');
  if (gbox && !hasG) gbox.open = true;

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
    setText('#syncStateText', st.busy ? 'جاري…' : st.connected ? 'متصل ✓' : 'غير متصل');
    setText('#syncLastText', st.lastSync ? new Date(st.lastSync).toLocaleString('ar-IQ') : 'لم تتم بعد');
    setText('#syncDeviceText', st.device || '—');

    /* -----------------------------------------------------------------
       تلميحات النقل: كم على هذا الجهاز، ومتى آخر عملية
       -----------------------------------------------------------------
       الغرض أن يعرف المستخدم **قبل** أن يضغط: ما الذي سيُستبدل.
       ----------------------------------------------------------------- */
    const lastTxt = st.lastSync ? new Date(st.lastSync).toLocaleString('ar-IQ') : 'لم تحدث بعد';
    setText('#uploadHint', 'المحلي: ' + state.reports.length + ' تقريراً · آخر عملية: ' + lastTxt);
    setText('#downloadHint', 'سيحلّ محلّ ' + state.reports.length + ' تقريراً محلياً · آخر عملية: ' + lastTxt);
    setText('#syncLastSmart', st.lastSync ? ('آخر مزامنة: ' + lastTxt) : '');

    /* نُعطّل الأزرار إن لم يكن هناك اتصال */
    ['#btnUploadDb', '#btnDownloadDb'].forEach(sel => {
      const b = $(sel);
      if (b) b.disabled = !st.connected || !!st.busy;
    });

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
      /* تعارض مزامنة: نُظهره بوضوح بدل ضياع التعديلات بصمت */
      if (r && r.conflictNotice) {
        toast('⚠️ ' + r.conflictNotice, 'warn', 14000);
      } else if (userInitiated) {
        toast(`تمت المزامنة: ${r.total} تقرير (أُضيف ${r.added}، حُدّث ${r.updated}، حُذف ${r.removed})`, 'ok', 3800);
      }
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
/* ---------------------------------------------------------------- معاينة HTML */

/* =============================================================================
   النطاق المشترك لمنطق التقرير
   -----------------------------------------------------------------------------
   منطق التقرير موزّع على ملفات مستقلة لتسهيل التحرير عليها:
     report-model.js      بناء نموذج التقرير
     report-preview.js    المعاينة كـ HTML
     report-clipboard.js  النسخ إلى الحافظة
     report-word.js       تصدير Word
     report-print.js      الطباعة

   هذا النطاق يمنحها الأدوات والحالة من app.js، ثم تستعملها app.js عبر NS.
   ============================================================================= */
window.ADMHReport = window.ADMHReport || {};

/* الأدوات والدوال المشتركة — تُستهلك من الملفات المستقلة */
window.ADMHReport.util = {
  esc,
  tidy,
  fmtDate,
  dayNameOf,
  fmtNum,
  normalizeDigits,
  todayISO,
  safeName,
  download,
  toast,
  autoTitle,
  titleName,
  positionCats,
  updateTitle,
  validateReport,
};

/* الحالة: تُقرأ عند الطلب حتى تبقى محدَّثة دائماً */
window.ADMHReport.getState = function () { return state; };
window.ADMHReport.getSettings = function () { return state.settings; };

/* غلاف التقرير: ينفّذ الملف المستقل مع معالجة الخطأ */
window.ADMHReport.run = function (name, fn) {
  if (typeof fn !== 'function') { toast('وحدة ' + name + ' غير محمّلة', 'err'); return; }
  return fn();
};

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
  /* نبني سجل التوصيات من التقارير فور الإقلاع، فتظهر أعداد المتابعة صحيحة */
  rebuildRegistry();
  /* نُنظّف سجل التعديلات من القديم ونرسمه */
  if (typeof readHistory === 'function') {
    const H = HIST();
    if (H) { writeHistory(H.prune(readHistory(), { now: new Date() }), true); }
    renderHistoryView();
  }
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
/* لا نُشغّل التطبيق هنا: يجب أن تُحمَّل ملفات التقرير المستقلة أولاً
   (report-model.js وما بعدها). آخر ملف منها يستدعي ADMHReport.boot(). */
window.ADMHReport = window.ADMHReport || {};
window.ADMHReport.boot = function () {
  if (window.ADMHReport.__booted) return;      /* لا تُشغّله مرتين */
  window.ADMHReport.__booted = true;
  init();
};

/* =============================================================================
   سجل المؤسسات · دورة حياة التوصيات · لوحة المؤشرات
   =============================================================================
   الوحدة الحسابية في registry.js (منطق خالص قابل للاختبار).
   وهنا الواجهة: تخزين السجل، الرسم، والأحداث.
   نصل إلى registry.js عند **التنفيذ** لا عند التعريف، لأن ترتيب التحميل
   يضع app.js قبل registry.js.
   ============================================================================= */
const LS_REGISTRY = 'admh.registry.v1';

/** وحدة registry.js الحسابية */
const REG = () => (window.ADMHReport && window.ADMHReport.registry) || null;

/** السجل المخزَّن محلياً — يُقرأ مرة ويُبقى في الذاكرة */
let registryCache = null;

/** يقرأ السجل من التخزين (مع تنظيف البنية) */
function readRegistry() {
  const R = REG();
  if (!R) return { facilities: {}, recs: {}, version: 1 };
  if (registryCache) return registryCache;
  registryCache = R.normalizeRegistry(jread(LS_REGISTRY, null));
  return registryCache;
}

/** يكتب السجل ويختم الوقت ليُزامَن */
function writeRegistry(reg, silent) {
  registryCache = reg || registryCache;
  const ok = silent ? jwriteSilent(LS_REGISTRY, registryCache) : jwrite(LS_REGISTRY, registryCache);
  if (ok) stampLocalChange('registry');
  return ok;
}

/**
 * يُعيد بناء التوصيات من التقارير مع **الحفاظ على حالات المستخدم**.
 * تُستدعى عند تغيّر التقارير.
 */
function rebuildRegistry() {
  const R = REG();
  if (!R) return null;
  const reg = readRegistry();
  const before = Object.keys(reg.recs).length;
  reg.recs = R.buildRecs(state.reports, reg);
  const after = Object.keys(reg.recs).length;
  if (before !== after) writeRegistry(reg, true);
  updateFollowCounts();
  return reg;
}

/** يُحدّث أعداد المتابعة في القائمة الجانبية */
function updateFollowCounts() {
  const R = REG();
  if (!R) return;
  const reg = readRegistry();
  const facs = R.buildFacilities(state.reports);
  const recs = Object.keys(reg.recs).map(k => reg.recs[k]);
  const open = recs.filter(r => !R.isClosed(r.status)).length;

  const fc = $('#facCount'); if (fc) fc.textContent = Object.keys(facs).length;
  const rc = $('#recCount'); if (rc) rc.textContent = open;
}

/* ------------------------------------------------------------------ ملف المؤسسة */

/** مفتاح الملف المفتوح حالياً */
let openFacilityKey = null;

/** يبني صفوف جدول المؤسسات */
function renderFacilities() {
  const R = REG();
  const tb = $('#tFacilities tbody');
  if (!R || !tb) return;

  const reg = readRegistry();
  const facs = R.buildFacilities(state.reports);
  const recs = Object.keys(reg.recs).map(k => reg.recs[k]);

  /* نُثري كل ملف بإحصاءاته */
  const rows = Object.keys(facs).map(k => {
    const f = facs[k];
    const mine = recs.filter(r => r.facilityKey === k);
    return {
      key: k, name: f.name, sector: f.sector, kind: f.kind,
      visits: f.visits.length, lastVisit: f.lastVisit,
      firstVisit: f.firstVisit,
      recs: mine.length,
      open: mine.filter(r => !R.isClosed(r.status)).length,
      overdue: mine.filter(r => R.isOverdue(r)).length,
      notes: (reg.facilities[k] && reg.facilities[k].notes) || '',
    };
  });

  /* البحث */
  const q = tidy(($('#facSearch') || {}).value || '');
  let list = rows;
  if (q) {
    const nq = R.facilityKey(q);       /* بحث مُوحَّد: يتجاهل الهمزات والتشكيل */
    list = rows.filter(r => R.facilityKey(r.name + ' ' + r.sector).indexOf(nq) >= 0);
  }

  /* الترتيب */
  const sort = ($('#facSort') || {}).value || 'recent';
  const cmp = {
    recent: (a, b) => String(b.lastVisit || '').localeCompare(String(a.lastVisit || '')),
    visits: (a, b) => b.visits - a.visits,
    open: (a, b) => b.open - a.open,
    overdue: (a, b) => b.overdue - a.overdue,
    name: (a, b) => String(a.name).localeCompare(String(b.name), 'ar'),
  }[sort] || (() => 0);
  list = list.slice().sort(cmp);

  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="7" class="empty">${q ? 'لا نتائج مطابقة' : 'لا مؤسسات بعد — احفظ تقريراً أولاً'}</td></tr>`;
  } else {
    tb.innerHTML = list.map(f => `
      <tr class="facrow${f.key === openFacilityKey ? ' on' : ''}" data-fac="${esc(f.key)}">
        <td data-label="المؤسسة"><b>${esc(f.name || '—')}</b>${f.notes ? ' <span class="pill">ملاحظة</span>' : ''}</td>
        <td data-label="القطاع">${esc(f.sector || '—')}</td>
        <td data-label="الزيارات">${f.visits}</td>
        <td data-label="التوصيات">${f.recs}</td>
        <td data-label="مفتوحة">${f.open}</td>
        <td data-label="متأخرة">${f.overdue ? `<span style="color:#b3261e;font-weight:700">${f.overdue}</span>` : '0'}</td>
        <td data-label="آخر زيارة">${esc(fmtDate(f.lastVisit) || '—')}</td>
      </tr>`).join('');
  }

  const st = $('#facStats');
  if (st) {
    const tot = Object.keys(facs).length;
    const totRecs = recs.length;
    const over = recs.filter(r => R.isOverdue(r)).length;
    st.textContent = `${tot} مؤسسة · ${totRecs} توصية · ${over} متأخرة`;
  }
  updateFollowCounts();
}

/** يفتح ملف مؤسسة ويعرض زياراتها وتوصياتها */
function openFacility(key) {
  const R = REG();
  if (!R || !key) return;
  openFacilityKey = key;
  const reg = readRegistry();
  const facs = R.buildFacilities(state.reports);
  const f = facs[key];

  const box = $('#facDetail');
  if (!box) return;
  if (!f) { box.classList.add('hidden'); renderFacilities(); return; }
  box.classList.remove('hidden');

  $('#facDetailName').textContent = f.name || '—';
  $('#facDetailMeta').textContent =
    [f.kind, f.sector].filter(Boolean).join(' · ') +
    ` · ${f.visits.length} زيارة` +
    (f.firstVisit ? ` · الأولى ${fmtDate(f.firstVisit)}` : '') +
    (f.lastVisit ? ` · الأخيرة ${fmtDate(f.lastVisit)}` : '');

  /* الملاحظات الدائمة */
  const saved = reg.facilities[key];
  const ta = $('#facNotes');
  if (ta) ta.value = (saved && saved.notes) || '';

  /* الزيارات */
  const tb = $('#tFacVisits tbody');
  if (tb) {
    tb.innerHTML = f.visits.map(v => `
      <tr>
        <td data-label="التاريخ">${esc(fmtDate(v.date) || '—')}</td>
        <td data-label="النوع">${esc(v.visitType || '—')}</td>
        <td data-label="العنوان">${esc(v.title || '—')}</td>
        <td class="no-print"><button class="btn ghost sm" data-openrep="${esc(v.id)}">فتح</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty">لا زيارات</td></tr>';
  }

  /* توصيات هذه المؤسسة */
  const mine = Object.keys(reg.recs).map(k => reg.recs[k])
    .filter(r => r.facilityKey === key)
    .sort((a, b) => String(b.visitDate || '').localeCompare(String(a.visitDate || '')));
  const rb = $('#facRecs');
  if (rb) rb.innerHTML = renderRecCards(mine, true);

  renderFacilities();
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ التوصيات */

/**
 * يرسم بطاقات التوصيات.
 * @param {Array} list التوصيات
 * @param {boolean} [compact] بلا فلاتر داخل البطاقة (داخل ملف المؤسسة)
 */
function renderRecCards(list, compact) {
  const R = REG();
  if (!R) return '';
  if (!list.length) return '<p class="empty">لا توصيات مطابقة.</p>';

  return list.map(rec => {
    const stt = R.statusOf(rec.status);
    const over = R.isOverdue(rec);
    const days = R.daysOverdue(rec);
    const facs = R.buildFacilities(state.reports);
    const f = facs[rec.facilityKey];
    const facName = (f && f.name) || (rec.facilityKey ? '—' : 'غير مرتبطة');

    const statusOpts = R.STATUSES.map(s =>
      `<option value="${s.k}"${s.k === rec.status ? ' selected' : ''}>${esc(s.t)}</option>`).join('');

    return `
      <div class="rec" data-rec="${esc(rec.id)}">
        <div class="top">
          <span class="rid">${esc(rec.id)}</span>
          <span class="badge ${esc(rec.status)}">${esc(stt.t)}</span>
          ${over ? `<span class="badge over">متأخرة ${days} يوماً</span>` : ''}
          <div class="txt">${esc(rec.text)}</div>
        </div>
        <div class="meta">
          ${compact ? '' : `<b>${esc(facName)}</b> · `}
          ${rec.visitDate ? 'زيارة ' + esc(fmtDate(rec.visitDate)) : ''}
          ${rec.owner ? ' · ' + esc(rec.owner) : ''}
          ${rec.evidence ? ' · دليل: ' + esc(rec.evidence) : ''}
          ${rec.verifiedAt ? ' · تحقق ' + esc(fmtDate(String(rec.verifiedAt).slice(0, 10))) : ''}
        </div>
        <div class="ctl">
          <div class="grp">
            <label>حالة التنفيذ</label>
            <select data-recstatus="${esc(rec.id)}">${statusOpts}</select>
          </div>
          <div class="grp">
            <label>موعد الإنجاز</label>
            <input type="date" data-recDue="${esc(rec.id)}" value="${esc(String(rec.dueDate || '').slice(0, 10))}">
          </div>
          ${rec.manual ? `<button class="btn danger sm" data-recDel="${esc(rec.id)}">حذف</button>` : ''}
        </div>
        <div class="note">
          <input type="text" data-recOwner="${esc(rec.id)}" placeholder="الجهة المسؤولة"
                 value="${esc(rec.owner || '')}">
          <input type="text" data-recEvidence="${esc(rec.id)}" placeholder="دليل المعالجة (رقم كتاب / ملاحظة)"
                 value="${esc(rec.evidence || '')}">
          <input type="text" data-recNote="${esc(rec.id)}" placeholder="ملاحظة المتابعة"
                 value="${esc(rec.note || '')}">
        </div>
      </div>`;
  }).join('');
}

/** يرسم صفحة التوصيات كاملة مع الفلاتر */
function renderRecs() {
  const R = REG();
  const box = $('#recList');
  if (!R || !box) return;

  const reg = readRegistry();
  const all = Object.keys(reg.recs).map(k => reg.recs[k]);

  /* نملأ الفلاتر مرة واحدة */
  const fs = $('#recFilterStatus');
  if (fs && !fs.options.length) {
    fs.innerHTML = '<option value="">كل الحالات</option>' +
      R.STATUSES.map(s => `<option value="${s.k}">${esc(s.t)}</option>`).join('');
  }
  const ff = $('#recFilterFac');
  const facs = R.buildFacilities(state.reports);
  if (ff) {
    const cur = ff.value;
    ff.innerHTML = '<option value="">كل المؤسسات</option>' +
      Object.keys(facs).map(k => `<option value="${esc(k)}">${esc(facs[k].name)}</option>`).join('');
    ff.value = cur;
  }

  /* الفلترة */
  const st = ($('#recFilterStatus') || {}).value || '';
  const fk = ($('#recFilterFac') || {}).value || '';
  const q = tidy(($('#recSearch') || {}).value || '');
  const due = ($('#recFilterDue') || {}).value || '';

  let list = all.filter(rec => {
    if (st && rec.status !== st) return false;
    if (fk && rec.facilityKey !== fk) return false;
    if (q && rec.text.indexOf(q) < 0) return false;
    if (due === 'overdue' && !R.isOverdue(rec)) return false;
    if (due === 'nodue' && rec.dueDate) return false;
    return true;
  });

  /* الترتيب: المتأخرة أولاً ثم المفتوحة ثم الأحدث */
  list = list.slice().sort((a, b) => {
    const ao = R.isOverdue(a) ? 1 : 0, bo = R.isOverdue(b) ? 1 : 0;
    if (ao !== bo) return bo - ao;
    const ac = R.isClosed(a.status) ? 1 : 0, bc = R.isClosed(b.status) ? 1 : 0;
    if (ac !== bc) return ac - bc;
    return String(b.visitDate || '').localeCompare(String(a.visitDate || ''));
  });

  box.innerHTML = renderRecCards(list, false);

  const stats = $('#recStats');
  if (stats) {
    const closed = list.filter(r => R.isClosed(r.status)).length;
    const over = list.filter(r => R.isOverdue(r)).length;
    stats.textContent = `${list.length} توصية معروضة · ${closed} منفذة · ${over} متأخرة`;
  }
  updateFollowCounts();
}

/* ------------------------------------------------------------------ لوحة المؤشرات */

/** يرسم لوحة المؤشرات حسب الفترة المحدّدة */
function renderDash() {
  const R = REG();
  const box = $('#dashBody');
  if (!R || !box) return;

  const from = ($('#dashFrom') || {}).value || '';
  const to = ($('#dashTo') || {}).value || '';

  const m = R.computeMetrics(state.reports, readRegistry(), { from: from, to: to });

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  /* شريط توزيع */
  const dist = (obj, total) => {
    const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
    if (!keys.length) return '<p class="empty">لا بيانات في هذه الفترة.</p>';
    return '<div class="dist">' + keys.map(k => `
      <div class="row">
        <span class="n">${esc(k)}</span>
        <span class="b"><i style="width:${pct(obj[k], total)}%"></i></span>
        <span class="c">${obj[k]}</span>
      </div>`).join('') + '</div>';
  };

  const kpi = (v, l, cls, sub) =>
    `<div class="kpi ${cls || ''}"><div class="v">${v}</div><div class="l">${esc(l)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;

  /* توزيع الحالات بالعربية */
  const stDist = {};
  R.STATUSES.forEach(s => { if (m.recs.byStatus[s.k]) stDist[s.t] = m.recs.byStatus[s.k]; });

  box.innerHTML = `
    <div class="card">
      <h3 style="margin:0 0 4px">الزيارات</h3>
      <div class="kpis">
        ${kpi(m.visits, 'زيارة في الفترة')}
        ${kpi(m.facilitiesVisited, 'مؤسسة تمت زيارتها', '', `من أصل ${m.facilitiesTotal} في السجل`)}
        ${kpi(m.initialVisits, 'زيارة تفتيشية أولية')}
        ${kpi(m.followUpVisits, 'زيارة متابعة')}
      </div>
      <h4 style="margin:14px 0 4px">حسب نوع الزيارة</h4>
      ${dist(m.byType, m.visits)}
      <h4 style="margin:14px 0 4px">حسب القطاع</h4>
      ${dist(m.bySector, m.visits)}
    </div>

    <div class="card">
      <h3 style="margin:0 0 4px">التوصيات</h3>
      <div class="kpis">
        ${kpi(m.recs.total, 'إجمالي التوصيات')}
        ${kpi(m.recs.open, 'مفتوحة', m.recs.open ? 'warn' : '')}
        ${kpi(m.recs.overdue, 'متأخرة عن موعدها', m.recs.overdue ? 'warn' : 'ok')}
        ${kpi(m.recs.closureRate + '%', 'نسبة الإغلاق', m.recs.closureRate >= 70 ? 'ok' : '')}
      </div>
      <div class="rbar" title="نسبة الإغلاق"><i style="width:${m.recs.closureRate}%"></i></div>
      <p class="hint">${m.recs.closed} منفذة من أصل ${m.recs.total} توصية.</p>
      <h4 style="margin:14px 0 4px">حسب حالة التنفيذ</h4>
      ${dist(stDist, m.recs.total)}
    </div>

    <div class="card">
      <h3 style="margin:0 0 4px">المؤسسات</h3>
      ${m.facilities.length ? `
      <div class="tw"><table>
        <thead><tr>
          <th>المؤسسة</th><th style="width:110px">القطاع</th>
          <th style="width:80px">زيارات</th><th style="width:90px">توصيات</th>
          <th style="width:80px">مفتوحة</th><th style="width:80px">متأخرة</th>
        </tr></thead>
        <tbody>${m.facilities.map(f => `
          <tr>
            <td data-label="المؤسسة"><b>${esc(f.name || '—')}</b></td>
            <td data-label="القطاع">${esc(f.sector || '—')}</td>
            <td data-label="زيارات">${f.visits}</td>
            <td data-label="توصيات">${f.recs}</td>
            <td data-label="مفتوحة">${f.open}</td>
            <td data-label="متأخرة">${f.overdue ? `<span style="color:#b3261e;font-weight:700">${f.overdue}</span>` : '0'}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="empty">لا مؤسسات في هذه الفترة.</p>'}
    </div>

    <div class="card">
      <h3 style="margin:0 0 4px">الملاحظات الأكثر تكراراً</h3>
      ${m.topNotes.length
        ? dist(m.topNotes.reduce((o, n) => { o[n.text] = n.count; return o; }, {}), m.topNotes[0].count)
        : '<p class="empty">لا ملاحظات مسجّلة في هذه الفترة.</p>'}
    </div>`;
}

/* ------------------------------------------------------------------ الأحداث */

/** يربط أزرار المتابعة — تُستدعى من bindButtons */
function bindFollowUps() {
  const R = REG();
  if (!R) return;

  /* فتح ملف مؤسسة */
  bindOn('#tFacilities', (e) => {
    const tr = e.target.closest('[data-fac]');
    if (!tr) return;
    openFacility(tr.getAttribute('data-fac'));
  });
  bindOn('#btnFacClose', () => {
    openFacilityKey = null;
    const box = $('#facDetail');
    if (box) box.classList.add('hidden');
    renderFacilities();
  });
  bindOn('#btnFacSaveNotes', () => {
    if (!openFacilityKey) return;
    const reg = readRegistry();
    const R2 = REG();
    const facs = R2.buildFacilities(state.reports);
    const f = facs[openFacilityKey] || {};
    reg.facilities[openFacilityKey] = Object.assign({
      key: openFacilityKey, name: f.name || '', sector: f.sector || '', kind: f.kind || '',
      firstVisit: f.firstVisit || null, lastVisit: f.lastVisit || null,
    }, reg.facilities[openFacilityKey] || {}, {
      notes: tidy(($('#facNotes') || {}).value || ''),
      updatedAt: new Date().toISOString(),
    });
    if (writeRegistry(reg)) toast('حُفظت ملاحظات المؤسسة', 'ok');
  });
  bindOn('#btnFacNewVisit', () => {
    if (!openFacilityKey) return;
    const R2 = REG();
    const facs = R2.buildFacilities(state.reports);
    const f = facs[openFacilityKey];
    if (!f) return;
    /* زيارة جديدة: نفس المؤسسة، وتاريخ اليوم، ونوع متابعة */
    state.report = blankReport();
    state.report.facilityName = f.name;
    state.report.sector = f.sector;
    state.report.facilityKind = f.kind || 'مركز صحي';
    state.report.visitType = 'زيارة متابعة';
    state.editingId = state.report.id;
    renderAll();
    showView('report');
    toast('بدأت زيارة متابعة لـ' + f.name, 'ok');
  });
  bindOn('#tFacVisits', (e) => {
    const b = e.target.closest('[data-openrep]');
    if (!b) return;
    openReportById(b.getAttribute('data-openrep'));
  });

  /* فلاتر المؤسسات */
  ['#facSearch', '#facSort'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('input', renderFacilities);
    if (el) el.addEventListener('change', renderFacilities);
  });

  /* فلاتر التوصيات */
  ['#recFilterStatus', '#recFilterFac', '#recSearch', '#recFilterDue'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('input', renderRecs);
    if (el) el.addEventListener('change', renderRecs);
  });

  /* تغيير حالة توصية أو موعدها.
     ---------------------------------------------------------------------
     مهم: bindOn تُثبّت onclick فقط، وأحداث <select> و<input> هي **change**
     لا click — فلو اعتمدنا على bindOn لضاعت كل تعديلات المستخدم بصمت.
     لذلك نستمع إلى الحدثين معاً عبر addEventListener.
     --------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------
     تعديل توصية: الحالة والموعد والحقول النصية.
     ---------------------------------------------------------------------
     عطل حقيقي كان يحدث: كنّا نستمع إلى `click` أيضاً، فيصل النقر على
     <select> إلى المعالج **قبل** أن تفتح القائمة المنسدلة — فيُحفظ الوضع
     الحالي ويظهر إشعار «حالة التوصية: لم تبدأ»، والقائمة لا تُفتح إطلاقاً.

     القاعدة الصحيحة:
       · `change` للقوائم وحقول التاريخ والحقول النصية — وهو ما يعنيه
         «تغيّرت القيمة» فعلاً.
       · `input` **لن نستخدمه**: يتكرّر مع كل حرف في الحقول النصية.
       · `click` **ممنوع**: يبتلع النقر الذي يفتح القائمة.
     --------------------------------------------------------------------- */
  ['#recList', '#facRecs'].forEach(sel => {
    const box = $(sel);
    if (!box) return;
    box.addEventListener('change', handleRecEdit);
    /* الحذف زر، فلا يصلح له حدث change */
    box.addEventListener('click', handleRecDelete);
  });

  /* إضافة توصية يدوية — الزر داخل نافذة التوصيات */
  bindOn('#btnRecAdd', () => {
    const reg = readRegistry();
    const R2 = REG();
    const txt = prompt('نص التوصية الجديدة:');
    if (!txt || !txt.trim()) return;
    const facKey = ($('#recFilterFac') || {}).value || '';
    const owner = prompt('الجهة المسؤولة (اختياري):') || '';
    const id = R2.addManualRec(reg, facKey, txt, owner);
    if (id && writeRegistry(reg)) {
      toast('أُضيفت التوصية', 'ok');
      renderRecs();
      if (openFacilityKey) openFacility(openFacilityKey);
    }
  });

  /* لوحة المؤشرات */
  bindOn('#btnDashApply', renderDash);
  ['#dashFrom', '#dashTo'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('change', () => { syncDashPreset(); renderDash(); });
  });
  bindOn('#dashPreset', () => { applyDashPreset(); renderDash(); });
  bindOn('#btnDashPrint', () => { showView('dash'); setTimeout(() => window.print(), 150); });
}

/** يُحدّث التاريخين من الفترة السريعة */
function applyDashPreset() {
  const v = ($('#dashPreset') || {}).value || '';
  const from = $('#dashFrom'), to = $('#dashTo');
  if (!from || !to) return;
  if (v === 'all') { from.value = ''; to.value = ''; return; }
  const days = parseInt(v, 10);
  if (!days) return;
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  to.value = now.toISOString().slice(0, 10);
  from.value = start.toISOString().slice(0, 10);
}

/** إن غيّر المستخدم التاريخين يدوياً، تعود الفترة السريعة إلى «مخصّص» */
function syncDashPreset() {
  const p = $('#dashPreset');
  if (p) p.value = '';
}

/** يعالج تعديل توصية من الواجهة */
function handleRecEdit(e) {
  const R = REG();
  if (!R) return;
  const reg = readRegistry();

  /* ---------------------------------------------------------------------
     الحالة: تُحفظ عند تغيّر القيمة فقط.
     ---------------------------------------------------------------------
     كنا نستمع إلى `click` أيضاً، فيصل النقر الذي **يفتح** القائمة إلى هنا
     قبل أن تُفتح، فيُحفظ الوضع الحالي ويظهر «حالة التوصية: لم تبدأ».
     الآن نتعامل مع `change` وحده.
     --------------------------------------------------------------------- */
  const sel = e.target.closest('[data-recstatus]');
  if (sel) {
    const id = sel.getAttribute('data-recstatus');
    const value = sel.value;
    /* لا تغيير فعلي؟ لا نحفظ ولا نُشعر */
    if (reg.recs[id] && reg.recs[id].status === value) return;
    R.updateRec(reg, id, { status: value });
    if (writeRegistry(reg)) {
      const st = R.statusOf(value);
      toast('حالة التوصية: ' + st.t, 'ok', 2200);
      renderRecs();
      if (openFacilityKey) openFacility(openFacilityKey);
      renderDash();
    }
    return;
  }

  const due = e.target.closest('[data-recDue]');
  if (due) {
    const id = due.getAttribute('data-recDue');
    const value = due.value || null;
    if (reg.recs[id] && (reg.recs[id].dueDate || null) === value) return;
    R.updateRec(reg, id, { dueDate: value });
    if (writeRegistry(reg)) { renderRecs(); renderFacilities(); renderDash(); }
    return;
  }

  /* الحقول النصية: تُحفظ عند مغادرة الحقل (change)، لا مع كل حرف */
  const txtField = e.target.closest('[data-recOwner],[data-recEvidence],[data-recNote]');
  if (txtField) {
    const map = { recOwner: 'owner', recEvidence: 'evidence', recNote: 'note' };
    for (const attr in map) {
      if (txtField.hasAttribute('data-' + attr)) {
        const id = txtField.getAttribute('data-' + attr);
        const val = tidy(txtField.value);
        if (reg.recs[id] && reg.recs[id][map[attr]] === val) return;   /* لا تغيير */
        R.updateRec(reg, id, { [map[attr]]: val });
        writeRegistry(reg);
        return;
      }
    }
  }

  /* حذف توصية يدوية: النقر هو الحدث الصحيح هنا — فهو زر لا قائمة */
  const del = e.target.closest('[data-recDel]');
  if (del) {
    const id = del.getAttribute('data-recDel');
    if (!confirm('حذف هذه التوصية اليدوية؟')) return;
    if (R.removeRec(reg, id) && writeRegistry(reg)) {
      toast('حُذفت التوصية', 'ok');
      renderRecs();
      renderDash();
    }
  }
}

/**
 * حذف توصية يدوية — مربوط على حدث النقر لأنه زر.
 * فُصل عن handleRecEdit لأن ذاك يخصّ أحداث «تغيّرت القيمة».
 */
function handleRecDelete(e) {
  const R = REG();
  if (!R) return;
  const del = e.target.closest('[data-recDel]');
  if (!del) return;
  const reg = readRegistry();
  const id = del.getAttribute('data-recDel');
  if (!confirm('حذف هذه التوصية اليدوية؟')) return;
  if (R.removeRec(reg, id) && writeRegistry(reg)) {
    toast('حُذفت التوصية', 'ok');
    renderRecs();
    if (openFacilityKey) openFacility(openFacilityKey);
    renderDash();
  }
}

/* =============================================================================
   نسخة احتياطية كاملة قبل أي استبدال
   =============================================================================
   عطل حقيقي في الحماية: كنّا نأخذ `recordHistory()` قبل النقل، وهي تحفظ
   **التقرير المفتوح وحده**. فلو نزّلت قاعدة السحابة وكان على الجهاز ٧٠ تقريراً
   غير موجود في السحابة، لن يحمي السجل إلا التقرير المفتوح — وتضيع ٧٠ تقريراً
   بلا رجعة. والواجهة نفسها تحذّر أن الاستبدال لا رجعة فيه.

   الحل: نسخة كاملة قبل أي نقل، تشمل كل شيء. ولا يبدأ النقل إلا بعد نجاحها.
   ============================================================================= */
const LS_BACKUP = 'admh.backup.transfer.v1';
const MAX_BACKUPS = 3;          /* نحتفظ بآخر ثلاث عمليات نقل */

/**
 * يأخذ نسخة كاملة من قاعدة هذا الجهاز.
 * @param {string} reason سبب النسخة (يظهر في القائمة)
 * @returns {boolean} نجاح موثَّق للنسخة
 */
function takeFullBackup(reason) {
  const snapshot = {
    at: new Date().toISOString(),
    reason: reason || 'قبل النقل',
    app: APP_VERSION,
    counts: {},
    payload: {
      reports: state.reports,
      draft: jread(LS_DRAFT, null),
      settings: state.settings,
      library: state.library,
      lists: (typeof window !== 'undefined' && window.ADMHLists) ? window.ADMHLists.exportAll() : null,
      registry: readRegistry(),
      history: readHistory(),
    },
  };
  const H = HIST();
  snapshot.counts = {
    reports: (snapshot.payload.reports || []).length,
    recommendations: Object.keys((snapshot.payload.registry || {}).recs || {}).length,
    facilities: Object.keys((snapshot.payload.registry || {}).facilities || {}).length,
    hasDraft: !!snapshot.payload.draft,
    lists: snapshot.payload.lists ? Object.keys(snapshot.payload.lists).length : 0,
    historySnapshots: H ? H.count(readHistory()) : 0,
  };

  let list = [];
  try { list = JSON.parse(localStorage.getItem(LS_BACKUP) || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  list.unshift(snapshot);
  list = list.slice(0, MAX_BACKUPS);

  if (!jwriteSilent(LS_BACKUP, list)) return false;

  /* نتحقق فعلاً أن النسخة قابلة للقراءة — لا نكتفي بنجاح الكتابة */
  try {
    const back = JSON.parse(localStorage.getItem(LS_BACKUP) || '[]');
    return Array.isArray(back) && back.length > 0 &&
      back[0].payload && Array.isArray(back[0].payload.reports);
  } catch (e) { return false; }
}

/** قائمة النسخ الكاملة */
function listBackups() {
  try {
    const l = JSON.parse(localStorage.getItem(LS_BACKUP) || '[]');
    return Array.isArray(l) ? l : [];
  } catch (e) { return []; }
}

/**
 * يستعيد نسخة كاملة — استبدال كامل أيضاً، فيأخذ نسخة قبلها.
 * @param {number} index موضع النسخة في القائمة
 */
function restoreFullBackup(index) {
  const list = listBackups();
  const bk = list[index];
  if (!bk || !bk.payload) { toast('لم تُوجد النسخة', 'warn'); return false; }

  if (!confirm('استعادة النسخة الكاملة بتاريخ ' +
      new Date(bk.at).toLocaleString('ar-IQ') + '؟\n\n' +
      'ستُستبدل كل بيانات هذا الجهاز: ' + bk.counts.reports + ' تقريراً. ' +
      'وسنأخذ نسخة من وضعك الحالي أولاً.')) return false;

  takeFullBackup('قبل استعادة نسخة');

  const p = bk.payload || {};
  let failed = null;
  try {
    state.reports = Array.isArray(p.reports) ? p.reports : [];
    if (!jwriteSilent(LS_REPORTS, state.reports)) failed = 'الأرشيف';
    if (p.draft && !jwriteSilent(LS_DRAFT, p.draft)) failed = failed || 'المسودة';
    if (p.settings) {
      state.settings = Object.assign(blankSettings(), p.settings);
      state.logo = state.settings.logo || '';
      if (!jwriteSilent(LS_SETTINGS, state.settings)) failed = failed || 'الإعدادات';
    }
    if (p.library) {
      state.library = p.library;
      if (!jwriteSilent(LS_LIBRARY, state.library)) failed = failed || 'المكتبة';
    }
    if (p.lists && window.ADMHLists) {
      window.ADMHLists.importAll(p.lists);
      saveListsCache();
    }
    if (p.registry && REG()) {
      registryCache = REG().normalizeRegistry(p.registry);
      jwriteSilent(LS_REGISTRY, registryCache);
    }
    if (p.history && HIST()) {
      historyCache = HIST().normalize(p.history);
      jwriteSilent(LS_HISTORY, historyCache);
    }
  } catch (e) {
    failed = failed || (e && e.message);
  }

  if (failed) {
    toast('تعذّرت الاستعادة الكاملة — أخفق: ' + failed, 'err', 12000);
    return false;
  }

  rebuildRegistry();
  renderAll();
  refreshArchiveMeta();
  renderArchive();
  fillDatalists();
  renderHistoryView();
  toast('استُعيدت النسخة الكاملة: ' + bk.counts.reports + ' تقريراً', 'ok', 7000);
  return true;
}

/** يصدّر كل النسخ الكاملة ملفاً واحداً */
function exportBackups() {
  const list = listBackups();
  if (!list.length) { toast('لا نسخ كاملة محفوظة', 'warn'); return; }
  download(
    new Blob([JSON.stringify({ backups: list, at: new Date().toISOString() }, null, 2)],
      { type: 'application/json' }),
    'نسخ-احتياطية-' + todayISO() + '.json'
  );
  toast('نُزّلت ' + list.length + ' نسخة', 'ok');
}

/** يستورد نسخاً من ملف (يُضيفها إلى القائمة) */
function importBackups(file) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    let data;
    try { data = JSON.parse(rd.result); }
    catch (e) { toast('الملف ليس JSON صالحاً', 'err'); return; }
    const incoming = Array.isArray(data) ? data : (data && data.backups);
    if (!Array.isArray(incoming) || !incoming.length) {
      toast('لا نسخ في الملف', 'warn'); return;
    }
    const valid = incoming.filter(b => b && b.payload && Array.isArray(b.payload.reports));
    if (!valid.length) { toast('لا نسخ صالحة في الملف', 'err'); return; }

    const list = listBackups().concat(valid).slice(0, MAX_BACKUPS * 2);
    if (jwriteSilent(LS_BACKUP, list)) {
      toast('استُوردت ' + valid.length + ' نسخة', 'ok');
      renderBackups();
    } else {
      toast('تعذّر الحفظ — مساحة التخزين ممتلئة', 'err');
    }
  };
  rd.readAsText(file);
}

/** يرسم قائمة النسخ الكاملة */
function renderBackups() {
  const box = $('#backupList');
  if (!box) return;
  const list = listBackups();

  if (!list.length) {
    box.innerHTML = '<p class="empty">لا نسخ كاملة بعد. تُؤخذ تلقائياً قبل كل رفع أو تنزيل.</p>';
    return;
  }

  box.innerHTML = list.map((b, i) => {
    const c = b.counts || {};
    const bits = [c.reports + ' تقريراً'];
    if (c.recommendations) bits.push(c.recommendations + ' توصية');
    if (c.facilities) bits.push(c.facilities + ' مؤسسة');
    if (c.hasDraft) bits.push('مسودة');
    if (c.historySnapshots) bits.push(c.historySnapshots + ' لقطة');
    const d = new Date(b.at);
    const when = isNaN(d.getTime()) ? '' :
      fmtDate(b.at.slice(0, 10)) + ' — ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

    return `
      <div class="hist" data-bk="${i}">
        <div class="top">
          <span class="when">${esc(when)}</span>
          <span class="badge histb">${esc(b.reason || '')}</span>
          <span class="grow"></span>
          <button class="btn warn sm" data-bkrestore="${i}" type="button">↩ استعادة كاملة</button>
        </div>
        <div class="chg">${bits.map(x => '<span class="pill">' + esc(x) + '</span>').join(' ')}</div>
      </div>`;
  }).join('');
}

/* =============================================================================
   نقل قاعدة البيانات — رفع أو تنزيل، بتأكيد صريح
   =============================================================================
   لا مزامنة تلقائية دمجية. المستخدم يقرّر متى يرفع ومتى ينزّل، ومن أي جهاز.
   وكل عملية **استبدال كامل**، لذا نطلب تأكيداً مكتوباً قبل التنفيذ،
   **ونأخذ نسخة كاملة** — ولا نبدأ إن أخفقت النسخة.
   ============================================================================= */
let pendingTransfer = null;      /* 'upload' | 'download' */

/** يفتح نافذة تأكيد النقل */
function openTransfer(kind) {
  const S = sync.available() ? sync.get() : null;
  if (!S || !S.status().connected) {
    toast('ادخل بحساب Google أولاً', 'warn');
    return;
  }

  pendingTransfer = kind;
  const isUp = kind === 'upload';
  const modal = $('#transferModal');
  if (!modal) return;

  const localCount = state.reports.length;
  const word = isUp ? 'رفع' : 'تنزيل';

  $('#trTitle').textContent = isUp ? '⬆️ تأكيد رفع قاعدة البيانات' : '⬇️ تأكيد تنزيل قاعدة البيانات';
  $('#trWord').textContent = word;

  const body = [];
  if (isUp) {
    body.push('<p>سيُرفع <b>ما على هذا الجهاز</b> إلى حسابك:');
    body.push('<ul>');
    body.push('<li><b>' + localCount + '</b> تقريراً في الأرشيف</li>');
    body.push('<li>الإعدادات ومكتبة العبارات والقوائم</li>');
    body.push('<li>سجل المؤسسات والتوصيات</li>');
    body.push('</ul>');
    body.push('<p class="warnbox">⚠️ سيُستبدل ما في السحابة بالكامل. ' +
      'إن كان على جهاز آخر عملٌ لم يُرفع فسيضيع — ارفع منه أولاً إن أردته.</p>');
  } else {
    body.push('<p>سيُنزَّل <b>ما في حسابك</b> إلى هذا الجهاز:');
    body.push('<ul>');
    body.push('<li>التقارير المحفوظة في السحابة</li>');
    body.push('<li>الإعدادات ومكتبة العبارات والقوائم</li>');
    body.push('<li>سجل المؤسسات والتوصيات والمسودة</li>');
    body.push('</ul>');
    body.push('<p class="warnbox">⚠️ سيُستبدل ما على هذا الجهاز بالكامل، وفيه <b>' +
      localCount + '</b> تقريراً. صدّر نسخة احتياطية أولاً إن أردت الاحتفاظ بها.</p>');
  }
  $('#trBody').innerHTML = body.join('');

  const input = $('#trConfirm');
  input.value = '';
  const go = $('#btnTransferGo');
  go.disabled = true;
  /* لا يُفعَّل الزر إلا بكتابة الكلمة بدقة — حماية من النقر العابر */
  input.oninput = () => { go.disabled = tidy(input.value) !== word; };

  openModal(modal);
  setTimeout(() => input.focus(), 120);
}

/** ينفّذ النقل المؤكَّد */
function runTransfer() {
  const S = sync.available() ? sync.get() : null;
  if (!S || !pendingTransfer) return;
  const kind = pendingTransfer;
  pendingTransfer = null;

  const modal = $('#transferModal');
  if (modal) closeModal(modal);

  const btn = $('#btn' + (kind === 'upload' ? 'UploadDb' : 'DownloadDb'));
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ…'; }

  /* ---------------------------------------------------------------------
     نسخة كاملة **إلزامية** قبل الاستبدال.
     ---------------------------------------------------------------------
     لا نبدأ النقل إن أخفقت النسخة: الاستبدال لا رجعة فيه، والنسخة هي
     شبكة الأمان الوحيدة لبقية الأرشيف (لا للتقرير المفتوح وحده).
     --------------------------------------------------------------------- */
  const backed = takeFullBackup(kind === 'upload' ? 'قبل الرفع' : 'قبل التنزيل');
  if (!backed) {
    if (btn) { btn.disabled = false; btn.textContent = label; }
    toast('⚠️ تعذّر أخذ نسخة احتياطية كاملة — لم يبدأ النقل. ' +
          'فرّغ مساحة تخزين ثم أعد المحاولة.', 'err', 14000);
    return;
  }
  /* لقطة في السجل أيضاً — لاستعادة التقرير المفتوح وحده */
  recordHistory(kind === 'upload' ? 'قبل الرفع' : 'قبل التنزيل', true);

  const work = (kind === 'upload') ? S.uploadDatabase() : S.downloadDatabase();

  work.then(r => {
    if (kind === 'upload') {
      let msg = '⬆️ رُفعت قاعدة البيانات: ' + r.reports + ' تقريراً';
      if (r.removed) msg += ' · حُذف ' + r.removed + ' تقريراً كان في السحابة فقط';
      toast(msg, 'ok', 8000);
    } else {
      const parts = [r.reports + ' تقريراً'];
      if (r.hasSettings) parts.push('الإعدادات');
      if (r.hasLibrary) parts.push('المكتبة');
      if (r.hasLists) parts.push('القوائم');
      if (r.hasRegistry) parts.push('سجل التوصيات');
      toast('⬇️ نُزّلت قاعدة البيانات: ' + parts.join(' · '), 'ok', 7000);
    }
    rebuildRegistry();
    renderAll();
    refreshArchiveMeta();
    renderArchive();
    renderSyncUI(S.status());
    renderHistoryView();
  }).catch(e => {
    toast('فشل النقل: ' + (e && e.message ? e.message : '') +
      ' — يمكنك استعادة النسخة الكاملة من «الإعدادات»', 'err', 14000);
    renderSyncUI(S.status());
  }).then(() => {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  });
}

/* =============================================================================
   المسودات
   =============================================================================
   المسودة الحالية محفوظة محلياً وتُزامَن. وهذه النافذة تعرضها مع سجل نسخها.
   ============================================================================= */
function openDrafts() {
  const modal = $('#draftsModal');
  if (!modal) return;
  renderDrafts();
  openModal(modal);
}

/** يرسم محتوى نافذة المسودات */
function renderDrafts() {
  const box = $('#draftsBody');
  if (!box) return;

  const draft = jread(LS_DRAFT, null);
  const H = HIST();
  const hist = H ? readHistory() : { reports: {} };
  const out = [];

  /* ---------- المسودة الحالية ---------- */
  out.push('<h4 style="margin:0 0 6px">المسودة الحالية</h4>');
  if (!draft || !draft.report) {
    out.push('<p class="empty">لا مسودة محفوظة.</p>');
  } else {
    const r = draft.report;
    const when = draft.at ? fmtDate(new Date(draft.at).toISOString().slice(0, 10)) : '';
    const saved = state.reports.some(x => x.id === r.id);
    out.push('<div class="hist">');
    out.push('<div class="top">');
    out.push('<span class="when">' + esc(when) + '</span>');
    out.push('<span class="badge ' + (saved ? 'done' : 'histb') + '">' +
      (saved ? 'محفوظة في الأرشيف' : 'غير محفوظة') + '</span>');
    out.push('<span class="grow"></span>');
    if (r.id !== state.report.id) {
      out.push('<button class="btn ghost sm" data-draftopen="1" type="button">↩ فتحها</button>');
    } else {
      out.push('<span class="hint">مفتوحة الآن</span>');
    }
    out.push('<button class="btn ghost sm" data-draftexport="1" type="button">⬇️ تصدير</button>');
    out.push('</div>');
    out.push('<div class="meta"><b>' + esc(r.title || autoTitle(r) || 'بدون عنوان') + '</b></div>');
    out.push('<div class="chg">' + describeReport(r) + '</div>');
    out.push('</div>');
  }

  /* ---------- نسخ المسودة من سجل التعديلات ---------- */
  const list = (state.report && H) ? H.listFor(hist, state.report.id) : [];
  out.push('<h4 style="margin:14px 0 6px">نسخ محفوظة لهذا التقرير <span class="pill">' +
    list.length + '</span></h4>');
  if (!list.length) {
    out.push('<p class="empty">لا نسخ بعد. تُسجَّل نسخة تلقائياً كل دقيقة تقريباً وعند الحفظ.</p>');
  } else {
    list.forEach(e => {
      const d = new Date(e.at);
      const when = isNaN(d.getTime()) ? '' :
        fmtDate(e.at.slice(0, 10)) + ' — ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      out.push('<div class="hist">');
      out.push('<div class="top">');
      out.push('<span class="when">' + esc(when) + '</span>');
      out.push('<span class="badge histb">' + esc(e.reason || 'تعديل') + '</span>');
      out.push('<span class="grow"></span>');
      out.push('<button class="btn ghost sm" data-histview="' + esc(e.id) + '" type="button">👁️ عرض</button>');
      out.push('<button class="btn warn sm" data-histrestore="' + esc(e.id) + '" type="button">↩ استعادة</button>');
      out.push('</div>');
      out.push('<div class="meta">' + esc(e.title || e.facility || 'بدون عنوان') + '</div>');
      out.push('</div>');
    });
  }

  box.innerHTML = out.join('');
}

/** يصف تقريراً بسطر مختصر: ما مُلئ فعلاً */
function describeReport(r) {
  if (!r) return '';
  const bits = [];
  if (tidy(r.facilityName)) bits.push('المؤسسة: ' + tidy(r.facilityName));
  if (tidy(r.visitType)) bits.push(tidy(r.visitType));
  const recs = (r.recGroups || []).reduce((n, g) => n + (g.items || []).filter(tidy).length, 0);
  if (recs) bits.push(recs + ' توصية');
  const rows = (r.records || []).filter(x => tidy(x.name)).length;
  if (rows) bits.push(rows + ' سجل');
  const procs = (r.procedures || []).filter(p => p && (tidy(p.date) || tidy(p.note))).length;
  if (procs) bits.push(procs + ' إجراء');
  const offs = (r.officials || []).filter(o => tidy(o.name)).length;
  if (offs) bits.push(offs + ' مسؤول');
  const sigs = (r.signers || []).filter(s => tidy(s.name)).length;
  if (sigs) bits.push(sigs + ' موقّع');
  if (!bits.length) return '<span class="hint">فارغة</span>';
  return bits.map(b => '<span class="pill">' + esc(b) + '</span>').join(' ');
}

/** يفتح المسودة الحالية في المحرّر */
function openCurrentDraft() {
  const draft = jread(LS_DRAFT, null);
  if (!draft || !draft.report) { toast('لا مسودة محفوظة', 'warn'); return; }
  recordHistory('قبل فتح المسودة', true);
  state.report = migrate(draft.report);
  state.editingId = draft.editingId || state.report.id;
  renderAll();
  showView('report');
  const modal = $('#draftsModal');
  if (modal) closeModal(modal);
  toast('فُتحت المسودة', 'ok');
}

/** يصدّر المسودة الحالية ملفاً */
function exportCurrentDraft() {
  const draft = jread(LS_DRAFT, null);
  if (!draft || !draft.report) { toast('لا مسودة محفوظة', 'warn'); return; }
  const r = draft.report;
  const name = 'مسودة-' + safeName(r.facilityName || r.title || 'تقرير') + '.json';
  download(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }), name);
  toast('نُزّلت المسودة', 'ok');
}

/**
 * يعالج نقرات سجل التعديلات: عرض لقطة أو استعادتها.
 * دالة واحدة تُستخدم من لوحة السجل ومن نافذة المسودات.
 */
function handleHistoryClick(e) {
  const v = e.target.closest('[data-histview]');
  if (v) { previewHistory(v.getAttribute('data-histview')); return; }
  const r = e.target.closest('[data-histrestore]');
  if (r) {
    const id = r.getAttribute('data-histrestore');
    if (confirm('استعادة هذه النسخة؟ سيُحفظ وضعك الحالي كنسخة أولاً فلا تفقد شيئاً.')) {
      restoreHistory(id);
      const modal = $('#draftsModal');
      if (modal && !modal.classList.contains('hidden')) renderDrafts();
    }
  }
}

/**
 * يصدّر التوصيات ملف CSV يفتح في Excel.
 * نُضيف BOM ليقرأ Excel العربية بشكل صحيح.
 */
function exportRecsCsv() {
  const R = REG();
  if (!R) { toast('وحدة التوصيات غير محمّلة', 'err'); return; }

  const reg = readRegistry();
  const facs = R.buildFacilities(state.reports);
  const rows = Object.keys(reg.recs).map(k => reg.recs[k]);

  if (!rows.length) { toast('لا توصيات للتصدير', 'warn'); return; }

  const esc2 = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [];

  lines.push([
    'الرقم', 'المؤسسة', 'القطاع', 'نص التوصية', 'الحالة',
    'الجهة المسؤولة', 'تاريخ الزيارة', 'موعد الإنجاز', 'أيام التأخير',
    'دليل المعالجة', 'ملاحظة المتابعة', 'تاريخ التحقق',
  ].map(esc2).join(','));

  rows.sort((a, b) => String(b.visitDate || '').localeCompare(String(a.visitDate || '')))
    .forEach(rec => {
      const f = facs[rec.facilityKey];
      const days = R.daysOverdue(rec);
      lines.push([
        rec.id,
        (f && f.name) || '',
        (f && f.sector) || '',
        rec.text,
        R.statusOf(rec.status).t,
        rec.owner || '',
        rec.visitDate ? String(rec.visitDate).slice(0, 10) : '',
        rec.dueDate ? String(rec.dueDate).slice(0, 10) : '',
        days ? String(days) : '',
        rec.evidence || '',
        rec.note || '',
        rec.verifiedAt ? String(rec.verifiedAt).slice(0, 10) : '',
      ].map(esc2).join(','));
    });

  /* BOM ضروري لـExcel ليقرأ العربية */
  const csv = '\uFEFF' + lines.join('\r\n');
  const stamp = todayISO();
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'التوصيات-' + stamp + '.csv');
  toast('نُزّلت ' + rows.length + ' توصية', 'ok');
}

/* ------------------------------------------------------------------ فتح تقرير */

/** يفتح تقريراً محفوظاً في المحرّر */
function openReportById(id) {
  const r = state.reports.find(x => x.id === id);
  if (!r) { toast('التقرير غير موجود', 'warn'); return; }
  state.report = migrate(JSON.parse(JSON.stringify(r)));
  state.editingId = state.report.id;
  renderAll();
  showView('report');
  toast('فُتح التقرير: ' + (state.report.title || state.report.facilityName || ''), 'ok');
}

/** يسحب توصيات المؤسسة من السجل إلى «متابعة التوصيات السابقة» في التقرير */
function pullPreviousRecs() {
  const R = REG();
  if (!R) return 0;
  const key = R.facilityKey(state.report.facilityName, state.report.sector);
  if (!key) { toast('اكتب اسم المؤسسة أولاً', 'warn'); return 0; }

  const reg = readRegistry();
  const mine = Object.keys(reg.recs).map(k => reg.recs[k])
    .filter(rec => rec.facilityKey === key)
    /* نستثني توصيات هذا التقرير نفسه — فهي ليست «سابقة» */
    .filter(rec => rec.sourceReportId !== state.report.id);

  if (!mine.length) { toast('لا توصيات سابقة لهذه المؤسسة', 'warn'); return 0; }

  const have = {};
  (state.report.prevRecs || []).forEach(p => { have[tidy(p.text)] = true; });

  let added = 0;
  mine.forEach(rec => {
    if (have[rec.text]) return;
    state.report.prevRecs = state.report.prevRecs || [];
    state.report.prevRecs.push({
      text: rec.text,
      status: R.statusOf(rec.status).t,
      note: [rec.owner, rec.note, rec.evidence].filter(Boolean).join(' — '),
    });
    added += 1;
  });

  if (added) { rerender('prevRecs'); toast(`سُحبت ${added} توصية سابقة`, 'ok'); }
  else toast('كل التوصيات السابقة موجودة بالفعل', 'ok');
  return added;
}


/* ------------------------------------------------------------------ التصدير
   يُستخدم للاختبار الآلي، ويوفّر واجهة برمجية بسيطة للتشغيل من الخارج. */
const API = {
  APP_VERSION,
  constants: {
    RECORD_PRESETS, RECORD_ADDONS, RECORD_ROWS, RECO_PRESETS, GENERAL_PRESETS,
    /* أبعاد صفحة A4 انتقلت إلى report-word.js: ADMHReport.PAGE */
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
  buildModel: (...a) => ADMHReport.run('بناء التقرير', () => ADMHReport.buildModel(...a)),
  renderPreview: (...a) => ADMHReport.run('المعاينة', () => ADMHReport.renderPreview(...a)),
  exportWord: (...a) => ADMHReport.run('تصدير Word', () => ADMHReport.exportWord(...a)),
  printReport: (...a) => ADMHReport.run('الطباعة', () => ADMHReport.printReport(...a)),
  copyReport: (...a) => ADMHReport.run('النسخ', () => ADMHReport.copyReport(...a)),
  validateReport,
  renderAll, showView, saveToArchive, saveDraft, saveSettings,
  bindButtons, bindForm, verifyBindings, applyScope,
  tidy, fmtDate, dayNameOf, titleName, normalizeDigits, autoTitle, updateTitle, fmtNum,
  uid, safeName,
  exportArchiveJSON, importArchiveJSON,
  sync, initSync, renderSyncUI, syncNow,
  /* سلامة التخزين وملكية البيانات المحلية */
  jwrite, jwriteSilent, readLocalOwner, markLocalOwner, ownerRefused,
  stampLocalChange, localStamp, markSynced, blankSyncMeta, readSyncMeta,
  /* المتابعة: سجل المؤسسات ودورة حياة التوصيات ولوحة المؤشرات */
  readRegistry, writeRegistry, rebuildRegistry, updateFollowCounts,
  renderFacilities, openFacility, renderRecs, renderRecCards, renderDash,
  bindFollowUps, openReportById, pullPreviousRecs, handleRecEdit,
  applyDashPreset, syncDashPreset,
  /* سجل التعديلات */
  readHistory, writeHistory, recordHistory, restoreHistory, dropHistory,
  renderHistoryView, previewHistory, scheduleDraftPush,
  handleHistoryClick,
  /* نقل قاعدة البيانات والمسودات والتوصيات */
  openTransfer, runTransfer, openDrafts, renderDrafts, describeReport,
  openCurrentDraft, exportCurrentDraft, exportRecsCsv,
};
if (typeof window !== 'undefined') window.ADMH = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
