# Measure ink extents in the rendered page vs. expected text margins.
import sys
from PIL import Image

def profile(path, label):
    im = Image.open(path).convert('L')
    W, H = im.size
    px = im.load()
    # expected A4 margins at this dpi: page 210mm wide, 15mm margins (850 twips)
    mm = W / 210.0
    exp_left = 15 * mm
    exp_right = W - 15 * mm
    print(f'--- {label} ---')
    print(f'image {W}x{H}px  | 1mm={mm:.3f}px  | expected text band x=[{exp_left:.0f},{exp_right:.0f}]')
    rows = []
    for y in range(H):
        xs = [x for x in range(W) if px[x, y] < 160]
        if xs:
            rows.append((y, min(xs), max(xs)))
    if not rows:
        print('no ink'); return
    # group into lines
    lines = []
    cur = [rows[0]]
    for r in rows[1:]:
        if r[0] - cur[-1][0] <= 3:
            cur.append(r)
        else:
            lines.append(cur); cur = [r]
    lines.append(cur)
    print(f'ink lines: {len(lines)}')
    worst_l = W; worst_r = 0
    for i, ln in enumerate(lines):
        y0, y1 = ln[0][0], ln[-1][0]
        l = min(r[1] for r in ln)
        r = max(r[2] for r in ln)
        worst_l = min(worst_l, l); worst_r = max(worst_r, r)
        flag = ''
        if l < exp_left - 2: flag += ' <== PAST LEFT MARGIN'
        if r > exp_right + 2: flag += ' <== PAST RIGHT MARGIN'
        print(f'  line{i+1:2d} y={y0:4d}-{y1:4d} x=[{l:4d},{r:4d}] width={r-l:4d}{flag}')
    print(f'WORST: left={worst_l} (exp {exp_left:.0f})  right={worst_r} (exp {exp_right:.0f})')
    print(f'OVERFLOW: left by {max(0, exp_left-worst_l):.0f}px  right by {max(0, worst_r-exp_right):.0f}px')

if __name__ == '__main__':
    profile(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else sys.argv[1])
