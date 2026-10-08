/* =============================================================================
   محمّل مشترك لاختبارات Node
   -----------------------------------------------------------------------------
   منطق التقرير انتقل إلى ملفات مستقلة، ولم يعد app.js يُشغّل التطبيق بنفسه.
   هذا المحمّل يُنفّذ الملفات بالترتيب الصحيح ثم يستدعي boot() — تماماً كما
   يفعل المتصفح.
   ============================================================================= */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

/* ملفات التقرير بالترتيب الذي تُحمَّل به في index.html */
const REPORT_FILES = [
  'report-model.js', 'report-preview.js', 'report-clipboard.js',
  'report-word.js', 'report-print.js',
];

/**
 * ينفّذ ملفات التطبيق داخل سياق الاختبار.
 * @param {object} sb سياق vm
 * @param {object} [opts] { boot: false } لتخطّي التشغيل
 */
function loadApp(sb, opts) {
  opts = opts || {};
  const run = f => vm_run(sb, path.join(ROOT, f));
  run('options.js');
  run('app.js');
  REPORT_FILES.forEach(run);
  if (opts.boot !== false && sb.window.ADMHReport && sb.window.ADMHReport.boot) {
    sb.window.ADMHReport.boot();
  }
  return sb.window.ADMH;
}

/* vm مطلوب هنا فقط لتنفيذ الملفات */
const vm = require('vm');
function vm_run(sb, file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), sb, { filename: path.basename(file) });
}

module.exports = { loadApp, REPORT_FILES, ROOT };
