# 무사수행 지역 지도 그림을 만들 때 넣을 「배치 안내도」를 그린다.
#   npm run -s map:ascii -- --json > /tmp/maps.json
#   python3 scripts/journey_map_guides.py /tmp/maps.json docs/journey_map_guides
# Pillow가 필요하다 (pip install pillow). guide_<지역>.png는 그림 생성기에 넣는 깨끗한 판,
# guide_<지역>_labeled.png는 구역 이름과 경계를 적은 설명용 판이다.
import json, sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

src, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
maps = json.load(open(src))

COL = {
    'PLAIN': (150, 196, 104), 'FIELD': (214, 200, 104), 'FOREST': (46, 104, 58), 'HILL': (122, 140, 78),
    'PEAK': (128, 118, 108), 'ROCK': (98, 96, 94), 'WATER': (64, 128, 196), 'SEA': (34, 84, 143),
    'SAND': (230, 212, 154), 'REED': (184, 182, 104), 'ROAD': (150, 196, 104), 'BRIDGE': (64, 128, 196),
    'HOUSE': (150, 196, 104), 'HALL': (150, 196, 104),
}
ROAD = (205, 168, 112)
ROAD_EDGE = (120, 92, 56)
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'

for m in maps:
    W, H = m['w'], m['h']
    # 30칸 지도는 4:3, 39칸 지도는 16:9
    OW, OH = (1280, 720) if W / H > 1.6 else (1024, 768)
    cw, ch = OW / W, OH / H
    tiles = m['tiles']
    at = lambda x, y: tiles[y * W + x]
    # 1) 칸을 색으로 칠하고 최빈값 필터로 모서리를 둥글린다
    base = Image.new('RGB', (OW, OH))
    d = ImageDraw.Draw(base)
    for y in range(H):
        for x in range(W):
            d.rectangle([x * cw, y * ch, (x + 1) * cw, (y + 1) * ch], fill=COL[at(x, y)])
    base = base.filter(ImageFilter.ModeFilter(13)).filter(ImageFilter.ModeFilter(9))
    d = ImageDraw.Draw(base)
    cx = lambda x: (x + 0.5) * cw
    cy = lambda y: (y + 0.5) * ch
    # 2) 봉우리 표시 (삼각형)
    for y in range(H):
        for x in range(W):
            if at(x, y) == 'PEAK':
                px, py = cx(x), cy(y)
                d.polygon([(px - cw * 0.42, py + ch * 0.38), (px, py - ch * 0.45), (px + cw * 0.42, py + ch * 0.38)], fill=(96, 86, 80), outline=(60, 54, 50))
                d.polygon([(px - cw * 0.14, py - ch * 0.12), (px, py - ch * 0.45), (px + cw * 0.14, py - ch * 0.12)], fill=(236, 232, 226))
            elif at(x, y) == 'FOREST':
                px, py = cx(x), cy(y)
                r = cw * 0.3
                d.ellipse([px - r, py - r, px + r, py + r], fill=(30, 80, 42))
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
    # 다리
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
    clean = base.copy()
    clean.save(os.path.join(outdir, f"guide_{m['id'].lower()}.png"))

    # 5) 설명용: 구역 경계, 이름, 입구 화살표
    lab = base.copy()
    ld = ImageDraw.Draw(lab, 'RGBA')
    zone = m['zone']
    for y in range(H):
        for x in range(W):
            z = zone[y * W + x]
            if x + 1 < W and zone[y * W + x + 1] != z:
                ld.line([((x + 1) * cw, y * ch), ((x + 1) * cw, (y + 1) * ch)], fill=(255, 255, 255, 150), width=2)
            if y + 1 < H and zone[(y + 1) * W + x] != z:
                ld.line([(x * cw, (y + 1) * ch), ((x + 1) * cw, (y + 1) * ch)], fill=(255, 255, 255, 150), width=2)
    font = ImageFont.truetype(FONT, 22)
    small = ImageFont.truetype(FONT, 18)
    for i, z in enumerate(m['zones']):
        px, py = cx(z['cx']), cy(z['cy'])
        text = f"{i + 1}. {z['name']}"
        ld.text((px, py), text, font=font, fill=(255, 255, 255), anchor='mm', stroke_width=4, stroke_fill=(20, 16, 12))
        ld.text((px, py + 22), z['terrain'], font=small, fill=(255, 236, 170), anchor='mm', stroke_width=3, stroke_fill=(20, 16, 12))
    ex, ey = m['entrance']['x'], m['entrance']['y']
    ld.text((cx(ex) + 6, cy(ey) - 26), '◀ 도장에서 오는 길', font=small, fill=(255, 255, 255), anchor='lm', stroke_width=3, stroke_fill=(20, 16, 12))
    lab.save(os.path.join(outdir, f"guide_{m['id'].lower()}_labeled.png"))
    print(m['id'], OW, OH)
