# 구역 지도 그림(public/assets/px_jr_area_<구간 id>.jpg)에 칸 배치를 맞춘다.
#   npm run -s map:ascii -- --areas-json > /tmp/areas.json      ← 만들어 낸 배치(그림을 만들 때 쓴 안내도와 같다)
#   python3 scripts/journey_area_fit.py /tmp/areas.json [--overlay 디렉터리] [구간 id ...]
# numpy·scikit-learn·Pillow가 필요하다 (pip install numpy scikit-learn pillow).
#
# 그림은 안내도를 보고 그렸으므로 안내도의 칸 대부분은 그림과 맞는다. 그래서 안내도를 「대체로 맞는 정답」으로 삼아
# 칸마다 그림의 빛깔·결을 읽는 분류기를 모든 그림에 걸쳐 가르치고, 그림이 안내도와 확실히 다르다고 말하는 칸만 고친다
# (하늘·구름·먼 산이 된 산허리, 비켜 그린 집, 안내도에 없던 못과 오솔길 등).
# 그다음 가장자리를 막고, 출구에서 걸어서 닿지 않는 큰 빈터에는 가장 짧은 오솔길을 낸다.
# 결과는 src/data/journeyAreaLayouts.ts에 쓴다 (이미 적힌 다른 구역의 배치는 그대로 둔다).
import json, os, re, sys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw
from sklearn.ensemble import RandomForestClassifier

args = sys.argv[1:]
overlay_dir = None
if '--overlay' in args:
    i = args.index('--overlay')
    overlay_dir = args[i + 1]
    del args[i:i + 2]
src = args[0]
only = set(args[1:])
maps = [m for m in json.load(open(src)) if os.path.exists(f"public/assets/px_jr_area_{m['id']}.jpg")]

CLS = ['OPEN', 'ROAD', 'WATER', 'BLOCK', 'GROVE', 'BUILD']
OF = {
    'PLAIN': 0, 'HILL': 0, 'FIELD': 0, 'SAND': 0, 'REED': 0, 'FOREST': 0,
    'ROAD': 1, 'BRIDGE': 1, 'WATER': 2, 'SEA': 2, 'PEAK': 3, 'ROCK': 3, 'GROVE': 4, 'HOUSE': 5, 'HALL': 5,
}
PASS = {'PLAIN', 'HILL', 'FIELD', 'SAND', 'REED', 'FOREST', 'ROAD', 'BRIDGE'}
CHAR = {'PLAIN': '.', 'ROAD': '=', 'BRIDGE': '#', 'FIELD': 'f', 'FOREST': 'T', 'GROVE': 'F', 'HILL': 'h', 'SAND': 's',
        'REED': 'r', 'PEAK': '^', 'ROCK': 'R', 'WATER': '~', 'SEA': 'w', 'HOUSE': 'H', 'HALL': 'A'}
S = 8  # 칸 하나를 8×8 화소로 줄여 읽는다
BUILD_TH = float(os.environ.get('BUILD_TH', '0.25'))


def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1); mn = a.min(-1); d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx


def tile_features(m):
    W, H = m['w'], m['h']
    img = Image.open(f"public/assets/px_jr_area_{m['id']}.jpg").convert('RGB').resize((W * S, H * S), Image.LANCZOS)
    a = np.asarray(img, dtype=np.float32) / 255.0
    h, s, v = rgb_to_hsv(a)
    gx = np.abs(np.diff(v, axis=1, append=v[:, -1:])); gy = np.abs(np.diff(v, axis=0, append=v[-1:, :]))
    edge = gx + gy
    masks = {
        'tan': (h >= 18) & (h <= 48) & (s >= 0.22) & (s <= 0.7) & (v >= 0.5),
        'blue': (h >= 180) & (h <= 235) & (s >= 0.25) & (v >= 0.3),
        'white': (s < 0.14) & (v > 0.78),
        'grey': (s < 0.2) & (v >= 0.3) & (v <= 0.78),
        'dkgreen': (h >= 70) & (h <= 170) & (v < 0.38),
        'ltgreen': (h >= 60) & (h <= 120) & (v >= 0.45) & (s >= 0.3),
        'red': ((h < 18) | (h > 340)) & (s >= 0.35) & (v >= 0.3),
        'yellow': (h >= 45) & (h <= 65) & (s >= 0.4) & (v >= 0.55),
        'dark': v < 0.2,
    }
    feats = []
    for ch in [a[..., 0], a[..., 1], a[..., 2], s, v, edge] + list(masks.values()):
        t = ch.reshape(H, S, W, S).astype(np.float32)
        feats.append(t.mean(axis=(1, 3)))
        if ch is v or ch is edge:
            feats.append(t.std(axis=(1, 3)))
    f = np.stack(feats, -1)  # H, W, F
    # 이웃(3×3, 7×7) 평균으로 둘레의 결도 함께 본다
    def box(x, r):
        p = np.pad(x, ((r, r), (r, r), (0, 0)), mode='edge')
        out = np.zeros_like(x)
        for dy in range(2 * r + 1):
            for dx in range(2 * r + 1):
                out += p[dy:dy + H, dx:dx + W]
        return out / (2 * r + 1) ** 2
    yy = np.repeat((np.arange(H) / H)[:, None], W, 1)[..., None]
    edgeness = np.minimum.reduce([np.arange(H)[:, None] + 0 * np.arange(W)[None, :], (H - 1 - np.arange(H))[:, None] + 0 * np.arange(W)[None, :],
                                  0 * np.arange(H)[:, None] + np.arange(W)[None, :], 0 * np.arange(H)[:, None] + (W - 1 - np.arange(W))[None, :]])[..., None] / 10.0
    return np.concatenate([f, box(f, 1), box(f, 3), yy, np.minimum(edgeness, 1.0)], -1)


feats = {}
tan_frac = {}
for m in maps:
    feats[m['id']] = tile_features(m)
    # 흙길 빛깔(황토)의 비율 — 칸 하나를 16×16 화소로 읽는다
    W, H = m['w'], m['h']
    a = np.asarray(Image.open(f"public/assets/px_jr_area_{m['id']}.jpg").convert('RGB').resize((W * 16, H * 16), Image.LANCZOS), dtype=np.float32) / 255.0
    hh, ss, vv = rgb_to_hsv(a)
    # 그림마다 길 빛깔이 다르다(햇빛 든 황토, 그늘진 숲길) — 안내도의 길 칸에 든 흙빛 화소로 그 그림의 길 색을 배운다
    loose = (hh >= 15) & (hh <= 58) & (ss >= 0.15) & (ss <= 0.72) & (vv >= 0.32)
    road_tiles = np.array([k in ('ROAD',) for k in m['tiles']]).reshape(H, W)
    in_road = np.repeat(np.repeat(road_tiles, 16, 0), 16, 1) & loose
    if in_road.sum() > 200:
        # 길 칸에도 풀·바위가 섞여 있으니 가운뎃값과 중앙 편차로, 범위에는 위아래 한계를 둔다
        vals = [hh[in_road], ss[in_road], vv[in_road]]
        mu = np.array([np.median(c) for c in vals])
        sd = np.array([1.4826 * np.median(np.abs(c - mu[i])) for i, c in enumerate(vals)])
        sd = np.clip(sd, [3.0, 0.04, 0.05], [7.0, 0.1, 0.1])
        z = np.maximum.reduce([np.abs(hh - mu[0]) / sd[0], np.abs(ss - mu[1]) / sd[1], np.abs(vv - mu[2]) / sd[2]])
        tm = loose & (z <= 2.0)
    else:
        tm = (hh >= 22) & (hh <= 46) & (ss >= 0.28) & (ss <= 0.62) & (vv >= 0.6)
    if m['shape'] == 'TALL':
        # 산·고개의 나무 계단·사다리·잔도 — 짙은 나무 빛깔도 길로 센다
        tm = tm | ((hh >= 14) & (hh <= 36) & (ss >= 0.38) & (ss <= 0.78) & (vv >= 0.28) & (vv <= 0.62))
    tan_frac[m['id']] = tm.reshape(H, 16, W, 16).mean(axis=(1, 3))

# 모든 그림에서 배운다 (안내도의 칸을 정답 삼아)
X = np.concatenate([feats[m['id']].reshape(-1, feats[m['id']].shape[-1]) for m in maps])


def prior_mix(prior, H, W):
    # 안내도의 칸은 한두 칸 밀려 그려졌을 수 있다 — 그 칸(0.35)과 둘레 5×5(0.65)에 있던 것을 사전 확률로. 길은 둘레 3×3까지만.
    onehot = np.eye(len(CLS))[prior]
    pad = np.pad(onehot, ((2, 2), (2, 2), (0, 0)), mode='edge')
    near5 = sum(pad[dy:dy + H, dx:dx + W] for dy in range(5) for dx in range(5)) / 25.0
    pad3 = np.pad(onehot, ((1, 1), (1, 1), (0, 0)), mode='edge')
    near3 = sum(pad3[dy:dy + H, dx:dx + W] for dy in range(3) for dx in range(3)) / 9.0
    near = near5.copy()
    near[..., 1] = near3[..., 1]
    return 0.35 * onehot + 0.65 * near + 0.03


# 스스로 고쳐 가며 배운다 — 안내도로 배우고, 그림 쪽으로 고친 배치로 다시 배우기를 세 번
priors = {m['id']: np.array([OF[k] for k in m['tiles']]).reshape(m['h'], m['w']) for m in maps}
labels = dict(priors)
for it in range(3):
    Y = np.concatenate([labels[m['id']].reshape(-1) for m in maps])
    clf = RandomForestClassifier(n_estimators=120, min_samples_leaf=10, n_jobs=-1, random_state=7 + it, class_weight='balanced_subsample')
    clf.fit(X, Y)
    if it == 2:
        break
    for m in maps:
        H, W = m['h'], m['w']
        P = clf.predict_proba(feats[m['id']].reshape(-1, X.shape[1])).reshape(H, W, len(CLS))
        labels[m['id']] = ((P ** 2.0) * prior_mix(priors[m['id']], H, W)).argmax(-1)

layouts = {}
report = []
for m in maps:
    if only and m['id'] not in only:
        continue
    W, H = m['w'], m['h']
    tiles = list(m['tiles'])
    prior = np.array([OF[k] for k in tiles]).reshape(H, W)
    P = clf.predict_proba(feats[m['id']].reshape(-1, X.shape[1])).reshape(H, W, len(CLS))
    post = (P ** 2.0) * prior_mix(prior, H, W)
    cls = post.argmax(-1)
    # 길은 그림의 흙빛으로 다시 긋는다 — 황토색 화소가 넉넉한 칸 중 지금의 길과 맞닿은 덩어리는 길,
    # 길이라 했는데 흙빛이 거의 없는 칸은 길에서 뺀다 (안내도의 길이 반 칸~한 칸 밀려 그려진 것을 바로잡는다)
    tan = tan_frac[m['id']]
    base_ok = (P[..., 5] < 0.35) & (P[..., 2] < 0.3) & (P[..., 3] < 0.4)
    # 바위 바닥이 흙길과 같은 빛깔인 그림도 있다 — 길로 잡히는 칸이 안내도 길의 1.8배를 넘지 않도록 기준을 올린다
    r0 = max(40, int((prior == 1).sum()))
    for th in (0.2, 0.28, 0.36, 0.45, 0.55, 0.65, 0.75):
        cand = (tan >= th) & base_ok
        if cand.sum() <= 1.8 * r0:
            break
    cand[0, :] = cand[-1, :] = False; cand[:, 0] = cand[:, -1] = False
    is_road = cls == 1
    seen = np.zeros((H, W), bool)
    for y0 in range(H):
        for x0 in range(W):
            if not cand[y0, x0] or seen[y0, x0]:
                continue
            comp = [(y0, x0)]; seen[y0, x0] = True; qi = 0
            while qi < len(comp):
                cy, cx = comp[qi]; qi += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and cand[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; comp.append((ny, nx))
            touches = any(is_road[max(0, cy - 1):cy + 2, max(0, cx - 1):cx + 2].any() for cy, cx in comp)
            if touches and len(comp) >= 3:
                for cy, cx in comp:
                    cls[cy, cx] = 1
    # 안내도에 없던 오두막·초가 — 그림이 집이라고 꽤 말하는 칸은 막는다 (길과 물은 빼고)
    cls = np.where((P[..., 5] >= (0.6 if m['terrain'] == 'TOWN' else BUILD_TH)) & (cls != 1) & (cls != 2), 5, cls)
    second = np.argsort(-post, -1)[..., 1]
    drop = (cls == 1) & (tan < 0.05) & (prior != 2)
    cls = np.where(drop & (second != 1), second, cls)
    # 외톨이 칸 고르기 — 둘레 여덟 칸 중 여섯 칸 이상이 다른 한 가지면 그것으로 (길은 건드리지 않는다)
    c2 = cls.copy()
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if cls[y, x] == 1:
                continue
            nb = [cls[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
            vals, cnt = np.unique(nb, return_counts=True)
            if cnt.max() >= 6 and vals[cnt.argmax()] != cls[y, x] and vals[cnt.argmax()] != 1:
                c2[y, x] = vals[cnt.argmax()]
    cls = c2
    out = []
    for y in range(H):
        for x in range(W):
            k = tiles[y * W + x]
            c = cls[y, x]
            if c == OF[k]:
                out.append(k)
            elif c == 0:
                out.append('HILL' if m['shape'] == 'TALL' else 'PLAIN')
            elif c == 1:
                near_water = any(0 <= x + dx < W and 0 <= y + dy < H and cls[y + dy, x + dx] == 2 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                out.append('BRIDGE' if k in ('WATER', 'SEA') or (near_water and k not in PASS) else 'ROAD')
            elif c == 2:
                out.append('SEA' if m['terrain'] == 'COAST' and y < H * 0.45 else 'WATER')
            elif c == 3:
                out.append('ROCK')
            elif c == 4:
                out.append('GROVE')
            else:
                out.append('HOUSE')
    # 가장자리는 막고, 출구(맨 아래 가운데)와 그 위 두 칸은 길
    ex, ey = m['entrance']['x'], m['entrance']['y']
    for y in range(H):
        for x in range(W):
            if (x in (0, W - 1) or y in (0, H - 1)) and out[y * W + x] in PASS:
                out[y * W + x] = 'SEA' if m['terrain'] == 'COAST' and y == 0 else 'PEAK'
    for yy in (ey, ey - 1, ey - 2):
        if out[yy * W + ex] not in ('ROAD', 'BRIDGE'):
            out[yy * W + ex] = 'ROAD'

    # 출구에서 닿지 않는 큰 빈터마다 오솔길 — 숲 벽·바위를 헤치고, 집·바다는 돌아서
    def reach_from():
        r = np.zeros(W * H, bool)
        q = deque([ey * W + ex]); r[ey * W + ex] = True
        while q:
            u = q.popleft(); ux, uy = u % W, u // W
            for nx, ny in ((ux + 1, uy), (ux - 1, uy), (ux, uy + 1), (ux, uy - 1)):
                if 0 <= nx < W and 0 <= ny < H:
                    v = ny * W + nx
                    if not r[v] and out[v] in PASS:
                        r[v] = True; q.append(v)
        return r
    carved = 0
    for _ in range(30):
        r = reach_from()
        seen = np.zeros(W * H, bool); best = []
        for i in range(W * H):
            if seen[i] or r[i] or out[i] not in PASS:
                continue
            comp = [i]; seen[i] = True; qi = 0
            while qi < len(comp):
                u = comp[qi]; qi += 1; ux, uy = u % W, u // W
                for nx, ny in ((ux + 1, uy), (ux - 1, uy), (ux, uy + 1), (ux, uy - 1)):
                    if 0 < nx < W - 1 and 0 < ny < H - 1:
                        v = ny * W + nx
                        if not seen[v] and not r[v] and out[v] in PASS:
                            seen[v] = True; comp.append(v)
            if len(comp) > len(best):
                best = comp
        if len(best) < 14:
            break
        prev = {i: -1 for i in best}; q = deque(best); hit = -1
        # 헤치기 쉬운 칸부터 (숲 벽 < 바위 < 물)
        cost_ok = {'GROVE', 'ROCK', 'WATER', 'PEAK'}
        while q and hit < 0:
            u = q.popleft(); ux, uy = u % W, u // W
            for nx, ny in ((ux + 1, uy), (ux - 1, uy), (ux, uy + 1), (ux, uy - 1)):
                if not (0 < nx < W - 1 and 0 < ny < H - 1) and not (nx == ex and ny == ey):
                    continue
                v = ny * W + nx
                if v in prev or not (out[v] in PASS or out[v] in cost_ok):
                    continue
                prev[v] = u
                if r[v]:
                    hit = v; break
                q.append(v)
        if hit < 0:
            for i in best:
                out[i] = 'GROVE'
            continue
        c = prev[hit]
        while c >= 0 and prev[c] != -1:
            if out[c] not in PASS:
                out[c] = 'BRIDGE' if out[c] == 'WATER' else 'PLAIN'
                carved += 1
            c = prev[c]
    r = reach_from()
    changed = sum(1 for a, b in zip(tiles, out) if a != b)
    report.append(f"{m['id']:14s} 바뀐 칸 {changed:4d} ({changed * 100 / (W * H):4.1f}%) · 낸 길 {carved:3d} · 닿는 칸 {int(r.sum())}")
    layouts[m['id']] = [''.join(CHAR[out[y * W + x]] for x in range(W)) for y in range(H)]

    if overlay_dir:
        os.makedirs(overlay_dir, exist_ok=True)
        img = Image.open(f"public/assets/px_jr_area_{m['id']}.jpg").convert('RGBA')
        cw, ch = img.width / W, img.height / H
        ov = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
        for y in range(H):
            for x in range(W):
                k = out[y * W + x]
                if k in PASS:
                    if not r[y * W + x]:
                        d.rectangle([x * cw, y * ch, (x + 1) * cw - 1, (y + 1) * ch - 1], fill=(255, 0, 255, 110))
                    elif k in ('ROAD', 'BRIDGE'):
                        d.rectangle([x * cw + cw * 0.3, y * ch + ch * 0.3, (x + 1) * cw - cw * 0.3, (y + 1) * ch - ch * 0.3], fill=(255, 120, 0, 230))
                else:
                    col = {'GROVE': (90, 0, 160), 'HOUSE': (255, 0, 0), 'HALL': (255, 0, 0), 'WATER': (0, 60, 255), 'SEA': (0, 60, 255)}.get(k, (230, 30, 30))
                    d.rectangle([x * cw, y * ch, (x + 1) * cw - 1, (y + 1) * ch - 1], fill=col + (95,))
        Image.alpha_composite(img, ov).convert('RGB').save(f"{overlay_dir}/{m['id']}.jpg", quality=80)

# journeyAreaLayouts.ts에 쓴다
path = 'src/data/journeyAreaLayouts.ts'
text = open(path).read()
head = text[: text.index('export const AREA_LAYOUTS')]
existing = {}
body = text[text.index('export const AREA_LAYOUTS'):]
for mm in re.finditer(r"  (\w+): \[[^\n]*\n((?:    '.*',\n)+)  \],\n", body):
    existing[mm.group(1)] = re.findall(r"    '(.*)',", mm.group(2))
existing.update(layouts)
names = {m['id']: (m['region'], m['name'], m['w'], m['h']) for m in json.load(open(src))}
order = [m['id'] for m in json.load(open(src)) if m['id'] in existing]
lines = ['export const AREA_LAYOUTS: Record<string, string[]> = {']
for lid in order:
    rg, nm, w, h = names[lid]
    lines.append(f"  {lid}: [ // {rg} · {nm} {w}×{h}")
    lines += [f"    '{row}'," for row in existing[lid]]
    lines.append('  ],')
lines.append('};')
open(path, 'w').write(head + '\n'.join(lines) + '\n')
print('\n'.join(report))
