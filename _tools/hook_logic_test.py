# -*- coding: utf-8 -*-
"""يختبر منطق .git/hooks/pre-commit مباشرةً بمحاكاة ما يراه git"""
import sys, re
sys.stdout.reconfigure(encoding='utf-8')

BLOCKED_FOLDER = re.compile(r'^"?نماذج/')
REPORT_FILE = re.compile(r'\.(docx|pdf)$')
TEST_OUT = re.compile(r'^"?_tools/')

def hook_blocks(staged):
    """يعيد True إذا كان الـhook سيمنع العملية"""
    if any(BLOCKED_FOLDER.search(f) for f in staged):
        return True, 'مجلد التقارير الحقيقية'
    bad = [f for f in staged if REPORT_FILE.search(f) and not TEST_OUT.search(f)]
    if bad:
        return True, 'ملف تقرير خارج _tools'
    return False, 'مسموح'

CASES = [
    (['نماذج/مركز صحي الخناسة.docx'], True, 'تقرير حقيقي في مجلد نماذج'),
    (['"نماذج/ملف عربي.docx"'], True, 'مسار مُقتبَس (كما يظهر مع الأحرف غير اللاتينية)'),
    (['_tools/axis-check.docx'], False, 'مخرجات اختبار مسموح بها'),
    (['app.js', 'registry.js', 'sw.js'], False, 'ملفات كود'),
    (['تقرير.docx'], True, 'تقرير في الجذر'),
    (['docs/report.pdf'], True, 'ملف PDF خارج _tools'),
    (['_tools/notes.pdf'], False, 'PDF اختبار مسموح'),
    (['README.md', 'دليل.md'], False, 'توثيق'),
    (['نماذج/ملف.xlsx'], True, 'حتى لو لم يكن docx — المجلد محجوب'),
]

ok = 0
print('=== اختبار منطق .git/hooks/pre-commit ===')
for staged, want, desc in CASES:
    got, why = hook_blocks(staged)
    good = (got == want)
    if good:
        ok += 1
    mark = '✓' if good else '✗'
    verdict = 'يُمنع' if got else 'يُسمح'
    print('  %s  %-8s %s' % (mark, verdict, desc))
    if not good:
        print('       توقّعنا: %s | السبب: %s | الملفات: %s'
              % ('يُمنع' if want else 'يُسمح', why, staged))

print()
print('  النتيجة: %d من %d' % (ok, len(CASES)))
sys.exit(0 if ok == len(CASES) else 1)
