# -*- coding: utf-8 -*-
"""توليد أيقونات التطبيق (PWA) بنمط النظام: خلفية خضراء داكنة + مستند + علامة صح."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(OUT, exist_ok=True)

PRIMARY = (0, 77, 64, 255)
WHITE = (255, 255, 255, 255)
LIGHT = (178, 223, 219, 255)


def draw_icon(size, maskable=False):
    img = Image.new('RGBA', (size, size), PRIMARY)
    d = ImageDraw.Draw(img)

    # المنطقة الآمنة: في الأيقونة القابلة للقص نُصغّر المحتوى إلى 60%
    scale = 0.60 if maskable else 0.78
    w = int(size * scale)
    h = int(w * 1.28)
    x0 = (size - w) // 2
    y0 = (size - h) // 2
    x1, y1 = x0 + w, y0 + h
    r = max(2, int(size * 0.028))

    # جسم المستند
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=WHITE)

    # ثنية الزاوية العلوية (مثلث بلون فاتح)
    fold = int(w * 0.30)
    d.polygon([(x1 - fold, y0), (x1, y0), (x1, y0 + fold)], fill=LIGHT)

    # أسطر نصية
    pad = int(w * 0.16)
    lw = int(w * 0.62)
    lh = max(2, int(h * 0.035))
    gap = int(h * 0.088)
    ly = y0 + int(h * 0.32)
    for i in range(4):
        width = lw if i < 3 else int(lw * 0.55)
        d.rounded_rectangle(
            [x0 + pad, ly, x0 + pad + width, ly + lh],
            radius=lh // 2, fill=(0, 121, 107, 210),
        )
        ly += gap

    # علامة صح دائرية أسفل يمين المستند
    cr = int(w * 0.30)
    cx = x1 - int(cr * 0.42)
    cy = y1 - int(cr * 0.42)
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=(46, 125, 50, 255), outline=WHITE, width=max(2, int(size * 0.012)))
    t = max(3, int(cr * 0.26))
    d.line([(cx - cr * 0.42, cy + cr * 0.02), (cx - cr * 0.10, cy + cr * 0.36), (cx + cr * 0.48, cy - cr * 0.38)],
           fill=WHITE, width=t, joint='curve')

    return img


for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png')]:
    draw_icon(size, maskable=False).save(os.path.join(OUT, name), 'PNG')
    print('wrote', name)

draw_icon(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'), 'PNG')
print('wrote icon-maskable-512.png')
