# 무사수행 지도 그림을 만들 때 넣을 「배치 안내도」를 그린다.
#   지역 전도(바깥 지도):
#     npm run -s map:ascii -- --json > /tmp/maps.json
#     python3 scripts/journey_map_guides.py /tmp/maps.json docs/journey_map_guides
#   구역 지도:
#     npm run -s map:ascii -- --areas-json > /tmp/areas.json
#     python3 scripts/journey_map_guides.py --areas /tmp/areas.json docs/journey_area_guides [구간 id ...]
# Pillow가 필요하다 (pip install pillow). guide_<id>.png는 그림 생성기에 넣는 깨끗한 판,
# guide_<id>_labeled.png는 이름·출구·목적지를 적은 설명용 판이다.
import json, sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

args = sys.argv[1:]
areas = '--areas' in args
args = [a for a in args if a != '--areas']
src, outdir = args[0], args[1]
only = set(a.lower() for a in args[2:])
os.makedirs(outdir, exist_ok=True)
maps = json.load(open(src))

COL = {
    'PLAIN': (150, 196, 104), 'FIELD': (214, 200, 104), 'FOREST': (46, 104, 58), 'GROVE': (22, 64, 34), 'HILL': (122, 140, 78),
    'PEAK': (128, 118, 108), 'ROCK': (98, 96, 94), 'WATER': (64, 128, 196), 'SEA': (34, 84, 143),
    'SAND': (230, 212, 154), 'REED': (184, 182, 104), 'ROAD': (150, 196, 104), 'BRIDGE': (64, 128, 196),
    'HOUSE': (150, 196, 104), 'HALL': (150, 196, 104),
}
ROAD = (205, 168, 112)
ROAD_EDGE = (120, 92, 56)
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
# 구역 지도 안내도의 크기 (칸 하나 24px) — 세로 9:16, 가로 16:9, 정사각 1:1
AREA_PX = 24


def render(m, OW, OH):
    W, H = m['w'], m['h']
    cw, ch = OW / W, OH / H
    tiles = m['tiles']
    at = lambda x, y: tiles[y * W + x]
    # 1) 칸을 색으로 칠하고 최빈값 필터로 모서리를 둥글린다
    base = Image.new('RGB', (OW, OH))
    d = ImageDraw.Draw(base)
    def base_col(x, y):
        k = at(x, y)
        if k == 'BRIDGE':
            # 다리 밑이 물이면 물빛, 벼랑이면 바위빛 (잔도)
            nb = [at(nx, ny) for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)) if 0 <= nx < W and 0 <= ny < H]
            return COL['WATER'] if any(n in ('WATER', 'SEA') for n in nb) else COL['ROCK']
        return COL[k]
    for y in range(H):
        for x in range(W):
            d.rectangle([x * cw, y * ch, (x + 1) * cw, (y + 1) * ch], fill=base_col(x, y))
    k1 = max(3, int(cw * 0.4) | 1)
    base = base.filter(ImageFilter.ModeFilter(k1)).filter(ImageFilter.ModeFilter(max(3, int(cw * 0.27) | 1)))
    d = ImageDraw.Draw(base)
    cx = lambda x: (x + 0.5) * cw
    cy = lambda y: (y + 0.5) * ch
    # 2) 봉우리(삼각형) · 바위 벼랑(빗금) · 숲(동그라미)
    for y in range(H):
        for x in range(W):
            k = at(x, y)
            px, py = cx(x), cy(y)
            if k == 'PEAK':
                d.polygon([(px - cw * 0.42, py + ch * 0.38), (px, py - ch * 0.45), (px + cw * 0.42, py + ch * 0.38)], fill=(96, 86, 80), outline=(60, 54, 50))
                d.polygon([(px - cw * 0.14, py - ch * 0.12), (px, py - ch * 0.45), (px + cw * 0.14, py - ch * 0.12)], fill=(236, 232, 226))
            elif k == 'ROCK':
                d.line([(px - cw * 0.4, py + ch * 0.3), (px + cw * 0.4, py - ch * 0.3)], fill=(70, 68, 66), width=max(1, int(cw * 0.12)))
            elif k == 'FOREST':
                r = cw * 0.3
                d.ellipse([px - r, py - r, px + r, py + r], fill=(30, 80, 42))
            elif k == 'GROVE':
                r = cw * 0.4
                d.ellipse([px - r, py - r, px + r, py + r], fill=(14, 44, 24))
    # 오솔길 — 숲·바위 사이로 난 한 칸짜리 들길은 가는 흙길로
    def blocked(x, y):
        return not (0 <= x < W and 0 <= y < H) or at(x, y) in ('GROVE', 'PEAK', 'ROCK', 'WATER', 'SEA', 'HOUSE', 'HALL')
    def trail(x, y):
        return 0 <= x < W and 0 <= y < H and at(x, y) in ('PLAIN', 'HILL') and (
            (blocked(x - 1, y) and blocked(x + 1, y)) or (blocked(x, y - 1) and blocked(x, y + 1)))
    def openish(x, y):
        return 0 <= x < W and 0 <= y < H and at(x, y) in ('PLAIN', 'HILL', 'ROAD', 'BRIDGE', 'FOREST')
    for y in range(H):
        for x in range(W):
            if not trail(x, y):
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if openish(nx, ny):
                    d.line([(cx(x), cy(y)), ((cx(x) + cx(nx)) / 2, (cy(y) + cy(ny)) / 2)], fill=(196, 170, 120), width=max(2, int(cw * 0.16)))
    # 3) 길 — 이어진 길 칸의 가운데끼리 굵은 선
    def is_road(x, y):
        return 0 <= x < W and 0 <= y < H and at(x, y) in ('ROAD', 'BRIDGE')
    for width, color in ((int(cw * 0.42), ROAD_EDGE), (int(cw * 0.3), ROAD)):
        for y in range(H):
            for x in range(W):
                if not is_road(x, y):
                    continue
                for nx, ny in ((x + 1, y), (x, y + 1)):
                    if is_road(nx, ny):
                        d.line([(cx(x), cy(y)), (cx(nx), cy(ny))], fill=color, width=width)
                r = width / 2
                d.ellipse([cx(x) - r, cy(y) - r, cx(x) + r, cy(y) + r], fill=color)
    # 다리·잔도
    for y in range(H):
        for x in range(W):
            if at(x, y) == 'BRIDGE':
                d.rectangle([cx(x) - cw * 0.3, cy(y) - ch * 0.22, cx(x) + cw * 0.3, cy(y) + ch * 0.22], fill=(120, 72, 36), outline=(60, 36, 18))
    # 4) 집·전각
    for y in range(H):
        for x in range(W):
            k = at(x, y)
            if k == 'HOUSE':
                d.rectangle([x * cw + cw * 0.14, y * ch + ch * 0.2, (x + 1) * cw - cw * 0.14, (y + 1) * ch - ch * 0.1], fill=(176, 64, 44), outline=(70, 30, 20), width=2)
            elif k == 'HALL':
                d.rectangle([x * cw + cw * 0.05, y * ch + ch * 0.1, (x + 1) * cw - cw * 0.05, (y + 1) * ch - ch * 0.05], fill=(120, 60, 150), outline=(50, 24, 70), width=2)
    return base, cx, cy


for m in maps:
    if only and m['id'].lower() not in only:
        continue
    W, H = m['w'], m['h']
    if areas:
        OW, OH = W * AREA_PX, H * AREA_PX
    else:
        # 30칸 지도는 4:3, 39칸 지도는 16:9
        OW, OH = (1280, 720) if W / H > 1.6 else (1024, 768)
    base, cx, cy = render(m, OW, OH)
    base.save(os.path.join(outdir, f"guide_{m['id'].lower()}.png"), optimize=True)

    # 5) 설명용
    lab = base.copy()
    ld = ImageDraw.Draw(lab, 'RGBA')
    font = ImageFont.truetype(FONT, 22)
    small = ImageFont.truetype(FONT, 18)
    ex, ey = m['entrance']['x'], m['entrance']['y']
    if areas:
        g = m['goal']
        ld.text((cx(ex), cy(ey) - 30), '▼ 출구 (바깥 지도로)', font=small, fill=(255, 255, 255), anchor='mm', stroke_width=3, stroke_fill=(20, 16, 12))
        ld.text((cx(g['x']), cy(g['y'])), '★ 가장 깊은 곳', font=small, fill=(255, 236, 170), anchor='mm', stroke_width=3, stroke_fill=(20, 16, 12))
        ld.text((OW / 2, 18), f"{m['region']} · {m['name']} ({m['terrain']})", font=font, fill=(255, 255, 255), anchor='mt', stroke_width=4, stroke_fill=(20, 16, 12))
    else:
        zone = m['zone']
        for y in range(H):
            for x in range(W):
                z = zone[y * W + x]
                if x + 1 < W and zone[y * W + x + 1] != z:
                    ld.line([((x + 1) * OW / W, y * OH / H), ((x + 1) * OW / W, (y + 1) * OH / H)], fill=(255, 255, 255, 150), width=2)
                if y + 1 < H and zone[(y + 1) * W + x] != z:
                    ld.line([(x * OW / W, (y + 1) * OH / H), ((x + 1) * OW / W, (y + 1) * OH / H)], fill=(255, 255, 255, 150), width=2)
        for i, z in enumerate(m['zones']):
            px, py = cx(z['cx']), cy(z['cy'])
            ld.text((px, py), f"{i + 1}. {z['name']}", font=font, fill=(255, 255, 255), anchor='mm', stroke_width=4, stroke_fill=(20, 16, 12))
            ld.text((px, py + 22), z['terrain'], font=small, fill=(255, 236, 170), anchor='mm', stroke_width=3, stroke_fill=(20, 16, 12))
        for gt in m.get('gates') or []:
            ld.text((cx(gt['x']), cy(gt['y']) - 18), '⛩', font=small, fill=(255, 220, 120), anchor='mm', stroke_width=3, stroke_fill=(20, 16, 12))
        ld.text((cx(ex) + 6, cy(ey) - 26), '◀ 도장에서 오는 길', font=small, fill=(255, 255, 255), anchor='lm', stroke_width=3, stroke_fill=(20, 16, 12))
    lab.save(os.path.join(outdir, f"guide_{m['id'].lower()}_labeled.png"), optimize=True)
    print(m['id'], OW, OH)
