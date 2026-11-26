import { JOURNEY_REGIONS, JourneyLeg, JourneyRegion, JourneyTerrain } from './journeyRegions';
import { finishMap, hashStr, JourneyMap, mulberry32, parseLayout, TILE_INFO, TileKind, valueNoise } from './journeyMap';
import { AREA_LAYOUTS } from './journeyAreaLayouts';

// ───────────────────────── 구역 지도 ─────────────────────────
// 바깥 지도(지역 전도)에서 한 땅(구간)의 입구를 밟으면, 그 땅의 구역 지도로 들어간다. 90년대 RPG의 마을·던전처럼
// 화면 여러 장 크기의 지도를 걸어 다니며, 사건은 길에서 벗어난 막다른 곳·벼랑 너머·숲속 빈터에 숨어 있다.
//   산·고개(세로 36×64) — 벼랑 띠 사이를 지그재그로 오르는 산길, 맨 위에 정상
//   절·숲(정사각 48×48) — 돌계단 끝의 전각 마당 / 오솔길 끝마다 빈터
//   마을·길·강·바다(가로 64×36) — 큰길과 골목 / 굽이진 길 / 강과 다리 / 모래톱과 섬
// 출구는 늘 맨 아래 줄 가운데다. 그 칸에서 아래로 걸어 나가면 바깥 지도로 돌아간다.
// 지도는 구간마다 늘 같다(구간 id로 씨앗을 정한다). 그림이 들어오면 journeyAreaLayouts.ts의 칸 배치가 이 지도를 대신한다.

export type AreaShape = 'TALL' | 'WIDE' | 'SQUARE';
export const AREA_SIZE: Record<AreaShape, { w: number; h: number }> = {
  TALL: { w: 36, h: 64 },
  WIDE: { w: 64, h: 36 },
  SQUARE: { w: 48, h: 48 },
};

export function areaShape(t: JourneyTerrain): AreaShape {
  if (t === 'MOUNTAIN' || t === 'PASS') return 'TALL';
  if (t === 'TEMPLE' || t === 'FOREST') return 'SQUARE';
  return 'WIDE';
}

export function legRegion(legId: string): { region: JourneyRegion; leg: JourneyLeg } | null {
  for (const region of JOURNEY_REGIONS) {
    const leg = region.legs.find((l) => l.id === legId);
    if (leg) return { region, leg };
  }
  return null;
}

// ───────── 칸 판 ─────────
interface Grid {
  w: number;
  h: number;
  t: TileKind[];
  rng: () => number;
  seed: number;
}

const inside = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;
const get = (g: Grid, x: number, y: number): TileKind | null => (inside(g, x, y) ? g.t[y * g.w + x] : null);
const put = (g: Grid, x: number, y: number, k: TileKind) => {
  if (inside(g, x, y)) g.t[y * g.w + x] = k;
};
const rect = (g: Grid, x0: number, y0: number, x1: number, y1: number, k: TileKind) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, k);
};
const ri = (g: Grid, a: number, b: number) => a + Math.floor(g.rng() * (b - a + 1));
const isRoad = (k: TileKind | null) => k === 'ROAD' || k === 'BRIDGE';
const BLOCK: TileKind[] = ['PEAK', 'ROCK', 'WATER', 'SEA', 'HOUSE', 'HALL'];

// 길을 낸다 — 목표 쪽으로 한 칸씩, 가끔 옆으로 비틀며. 물을 건너면 다리, 벼랑을 지나면 돌계단(길)이 된다.
function carve(g: Grid, ax: number, ay: number, bx: number, by: number, kind: TileKind = 'ROAD', wiggle = 0.18) {
  let x = ax;
  let y = ay;
  const lay = () => {
    const cur = get(g, x, y);
    if (cur === null) return;
    if (kind === 'ROAD') put(g, x, y, cur === 'WATER' || cur === 'SEA' ? 'BRIDGE' : cur === 'BRIDGE' ? 'BRIDGE' : 'ROAD');
    else if (!isRoad(cur)) put(g, x, y, cur === 'WATER' ? 'BRIDGE' : kind);
  };
  lay();
  let guard = 0;
  let lastAxis = Math.abs(bx - ax) > Math.abs(by - ay) ? 0 : 1;
  while ((x !== bx || y !== by) && guard++ < 4000) {
    const dx = bx - x;
    const dy = by - y;
    let axis: number;
    if (dx === 0) axis = 1;
    else if (dy === 0) axis = 0;
    else if (g.rng() < 0.7) axis = lastAxis; // 곧게 이어 가다가
    else axis = g.rng() < Math.abs(dx) / (Math.abs(dx) + Math.abs(dy)) ? 0 : 1; // 이따금 꺾는다
    if (axis === 0) x += Math.sign(dx);
    else y += Math.sign(dy);
    // 비틀기 — 곧은 길이 너무 반듯하지 않게
    if (wiggle > 0 && g.rng() < wiggle && dx !== 0 && dy !== 0) {
      lay();
      if (axis === 0) y += Math.sign(dy);
      else x += Math.sign(dx);
    }
    lastAxis = axis;
    lay();
  }
}

// 가장자리 벽 — 두께가 들쭉날쭉한 봉우리
function walls(g: Grid, kind: TileKind, minT: number, maxT: number, sides = { top: true, bottom: true, left: true, right: true }) {
  const span = maxT - minT + 1;
  for (let y = 0; y < g.h; y++) {
    const l = minT + Math.floor(valueNoise(0.5, y / 5, g.seed + 31) * span);
    const r = minT + Math.floor(valueNoise(9.5, y / 5, g.seed + 37) * span);
    for (let x = 0; x < g.w; x++) {
      if ((sides.left && x < l) || (sides.right && x >= g.w - r)) put(g, x, y, kind);
    }
  }
  for (let x = 0; x < g.w; x++) {
    const tp = minT + Math.floor(valueNoise(x / 5, 0.5, g.seed + 41) * span);
    const bt = minT + Math.floor(valueNoise(x / 5, 7.5, g.seed + 43) * span);
    for (let y = 0; y < g.h; y++) {
      if ((sides.top && y < tp) || (sides.bottom && y >= g.h - bt)) put(g, x, y, kind);
    }
  }
}

function clearing(g: Grid, cx: number, cy: number, r: number, k: TileKind = 'PLAIN') {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inside(g, x, y) || x <= 0 || y <= 0 || x >= g.w - 1 || y >= g.h - 1) continue;
      if (Math.hypot(x - cx, y - cy) > r + 0.4) continue;
      if (!isRoad(get(g, x, y))) put(g, x, y, k);
    }
  }
}

// 집 몇 채 — 길에 닿아 있고, 서로 한 칸씩 떨어져 있게
function hamlet(g: Grid, x0: number, y0: number, x1: number, y1: number, count: number, kind: TileKind = 'HOUSE') {
  let placed = 0;
  for (let tries = 0; tries < 200 && placed < count; tries++) {
    const bw = ri(g, 2, 3);
    const bh = 2;
    const x = ri(g, x0, Math.max(x0, x1 - bw + 1));
    const y = ri(g, y0, Math.max(y0, y1 - bh + 1));
    let ok = true;
    let touchesRoad = false;
    for (let yy = y - 1; yy <= y + bh && ok; yy++) {
      for (let xx = x - 1; xx <= x + bw && ok; xx++) {
        const k = get(g, xx, yy);
        const inner = xx >= x && xx < x + bw && yy >= y && yy < y + bh;
        if (k === null || xx <= 1 || yy <= 1 || xx >= g.w - 2 || yy >= g.h - 2) ok = false;
        else if (inner && (isRoad(k) || BLOCK.includes(k))) ok = false;
        else if (!inner && (k === 'HOUSE' || k === 'HALL')) ok = false;
        if (!inner && isRoad(k) && yy === y + bh) touchesRoad = true;
        if (!inner && isRoad(k)) touchesRoad = touchesRoad || yy === y + bh || xx === x - 1 || xx === x + bw;
      }
    }
    if (!ok || !touchesRoad) continue;
    rect(g, x, y, x + bw - 1, y + bh - 1, kind);
    placed++;
  }
  return placed;
}

// ───────── 산·고개 (세로) ─────────
function genTall(g: Grid, leg: JourneyLeg) {
  const { w, h, seed } = g;
  const pass = leg.terrain === 'PASS';
  const cx = Math.floor(w / 2);
  // 1) 바탕 — 아래는 숲과 들, 가운데는 산비탈, 위로 갈수록 바위
  for (let y = 0; y < h; y++) {
    const fy = y / h;
    for (let x = 0; x < w; x++) {
      const n = valueNoise(x / 4.5, y / 4.5, seed + 1);
      const n2 = valueNoise(x / 2.6, y / 2.6, seed + 2);
      let k: TileKind = 'HILL';
      if (fy > 0.78) k = n > 0.6 ? 'GROVE' : n > 0.46 ? 'FOREST' : n2 > 0.62 ? 'PLAIN' : 'HILL';
      else if (fy > 0.4) k = n > 0.7 ? 'GROVE' : n > 0.58 ? 'FOREST' : n2 < 0.14 + (pass ? 0.08 : 0) ? 'ROCK' : 'HILL';
      else k = n2 < 0.2 + (pass ? 0.1 : 0) ? 'ROCK' : n > 0.74 ? 'FOREST' : 'HILL';
      put(g, x, y, k);
    }
  }
  // 2) 좌우 산줄기 — 위로 갈수록 좁아진다
  const lw: number[] = [];
  const rw: number[] = [];
  for (let y = 0; y < h; y++) {
    const narrow = Math.round((1 - y / h) * 3);
    lw[y] = 1 + Math.floor(valueNoise(0.5, y / 6, seed + 3) * 4) + narrow;
    rw[y] = 1 + Math.floor(valueNoise(7.5, y / 6, seed + 4) * 4) + narrow;
    for (let x = 0; x < w; x++) if (x < lw[y] || x >= w - rw[y]) put(g, x, y, 'PEAK');
  }
  // 3) 산 아래 개울
  const sy = h - 6;
  for (let x = lw[sy]; x < w - rw[sy]; x++) {
    const wy = sy + Math.round(Math.sin(x / 3.5 + seed) * 1.1);
    put(g, x, wy, 'WATER');
    if (g.rng() < 0.35) put(g, x, wy + 1, 'REED');
  }
  // 4) 벼랑 띠 — 이 사이의 비탈이 한 층 한 층의 산허리다
  const bands: number[] = [];
  for (let y = h - 11; y > 9; y -= 6 + Math.floor(g.rng() * 2)) bands.push(y);
  bands.forEach((by) => {
    const thick = g.rng() < 0.35 ? 2 : 1;
    for (let t = 0; t < thick; t++) for (let x = lw[by - t]; x < w - rw[by - t]; x++) put(g, x, by - t, g.rng() < 0.2 ? 'PEAK' : 'ROCK');
  });
  // 5) 지그재그 산길 — 띠마다 왼쪽 끝과 오른쪽 끝을 번갈아 오른다. 층마다 길 반대쪽 끝은 막다른 산허리로 남는다
  let x = cx;
  let y = h - 1;
  let side = g.rng() < 0.5 ? -1 : 1;
  bands.forEach((by) => {
    const crossX = side < 0 ? lw[by] + 2 + ri(g, 0, 4) : w - rw[by] - 3 - ri(g, 0, 4);
    carve(g, x, y, x, by + 2, 'ROAD', 0);
    carve(g, x, by + 2, crossX, by + 2, 'ROAD', 0.1);
    carve(g, crossX, by + 2, crossX, by - 3, 'ROAD', 0);
    // 고개의 벼랑길 — 바위를 지나는 길은 판자를 덧댄 잔도
    if (pass) for (let yy = by - 2; yy <= by; yy++) if (get(g, crossX, yy) === 'ROAD') put(g, crossX, yy, 'BRIDGE');
    x = crossX;
    y = by - 3;
    side = -side;
  });
  carve(g, x, y, cx, 4, 'ROAD', 0.15);
  // 6) 정상 — 봉우리에 둘러싸인 작은 마루
  for (let yy = 1; yy <= 6; yy++) {
    for (let xx = 1; xx < w - 1; xx++) {
      const d = Math.abs(xx - cx);
      if (d > 7 - Math.max(0, 3 - yy)) put(g, xx, yy, 'PEAK');
      else if (!isRoad(get(g, xx, yy))) put(g, xx, yy, d < 3 && yy < 4 ? 'ROCK' : 'HILL');
    }
  }
  put(g, cx, 2, 'HILL');
  put(g, cx, 3, 'ROAD');
  if (leg.pois.SHRINE) rect(g, cx + 3, 2, cx + 4, 3, 'HALL');
  // 7) 몰래 오르는 틈 — 길이 아닌 곳에도 띠가 끊긴 데가 있다
  bands.forEach((by) => {
    if (g.rng() < 0.3) {
      const gx = ri(g, lw[by] + 1, w - rw[by] - 2);
      for (let yy = by - 1; yy <= by; yy++) if (!isRoad(get(g, gx, yy))) put(g, gx, yy, 'HILL');
    }
  });
  // 8) 산허리의 은신처 — 막다른 곳에 바위로 둘러친 빈터나 오두막
  for (let i = 0; i < 2; i++) {
    const by = bands[ri(g, 0, bands.length - 1)];
    const hx = g.rng() < 0.5 ? lw[by + 3] + 2 : w - rw[by + 3] - 3;
    const hy = by + 3;
    if (!isRoad(get(g, hx, hy)) && get(g, hx, hy) !== 'PEAK') {
      clearing(g, hx, hy, 1, 'PLAIN');
      if (i === 0 && (leg.pois.MASTER || leg.pois.PEOPLE)) put(g, hx, hy - 1, 'HOUSE');
    }
  }
}

// ───────── 절·숲 (정사각) ─────────
function genSquare(g: Grid, leg: JourneyLeg) {
  const { w, h, seed } = g;
  const temple = leg.terrain === 'TEMPLE';
  const cx = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = valueNoise(x / 5, y / 5, seed + 1);
      const n2 = valueNoise(x / 2.4, y / 2.4, seed + 2);
      let k: TileKind = temple
        ? n > 0.5 ? 'GROVE' : n > 0.4 ? 'FOREST' : n2 > 0.72 ? 'PLAIN' : 'HILL'
        : n > 0.4 ? 'GROVE' : n > 0.28 ? 'FOREST' : n2 > 0.5 ? 'PLAIN' : 'HILL';
      if (n2 < 0.08) k = 'ROCK';
      put(g, x, y, k);
    }
  }
  walls(g, 'PEAK', 1, 3);
  // 골짜기 개울 — 길보다 먼저 흘려 두면, 나중에 낸 길과 오솔길이 건너는 자리가 다리가 된다
  if (leg.terrain === 'FOREST' || g.rng() < 0.5) {
    // 출구로 오르는 큰길과 나란히 흐르지 않게, 가운데에서 비켜난 자리로
    const sideX = g.rng() < 0.5 ? -1 : 1;
    let wx = cx + sideX * ri(g, 9, 16);
    for (let y = 2; y < h - 2; y++) {
      wx += Math.round((valueNoise(1.5, y / 4, seed + 9) - 0.5) * 2);
      wx = Math.max(3, Math.min(w - 4, wx));
      if (Math.abs(wx - cx) < 6) wx = cx + sideX * 6;
      if (get(g, wx, y) !== 'PEAK') put(g, wx, y, 'WATER');
    }
  }
  const exitX = cx;
  const goalY = temple ? 13 : 7;
  // 큰길 — 출구에서 위쪽 목적지까지 두어 번 굽이진다
  const p1 = { x: cx + ri(g, -9, 9), y: Math.floor(h * 0.7) };
  const p2 = { x: cx + ri(g, -9, 9), y: Math.floor(h * 0.45) };
  carve(g, exitX, h - 1, exitX, h - 5, 'ROAD', 0); // 출구에서는 곧게 몇 걸음 오른 뒤에 굽는다
  carve(g, exitX, h - 5, p1.x, p1.y, 'ROAD');
  carve(g, p1.x, p1.y, p2.x, p2.y, 'ROAD');
  carve(g, p2.x, p2.y, cx, goalY, 'ROAD');
  if (temple) {
    // 전각 마당 — 대웅전, 좌우 요사채, 탑
    rect(g, cx - 9, 3, cx + 9, 12, 'PLAIN');
    rect(g, cx - 3, 4, cx + 3, 6, 'HALL');
    rect(g, cx - 8, 7, cx - 6, 8, 'HALL');
    rect(g, cx + 6, 7, cx + 8, 8, 'HALL');
    rect(g, cx - 8, 10, cx - 7, 11, 'HOUSE');
    rect(g, cx + 7, 10, cx + 8, 11, 'HOUSE');
    rect(g, cx + 3, 9, cx + 4, 10, 'HALL');
    for (let yy = 7; yy <= 12; yy++) put(g, cx, yy, 'ROAD');
    for (let xx = cx - 10; xx <= cx + 10; xx++) {
      if (get(g, xx, 13) !== 'ROAD') put(g, xx, 13, xx === cx - 10 || xx === cx + 10 ? 'ROCK' : 'HILL');
    }
  } else {
    clearing(g, cx, goalY, 3, 'PLAIN');
    if (leg.pois.SHRINE) rect(g, cx - 1, goalY - 3, cx, goalY - 2, 'HALL');
  }
  // 마을이 있는 숲 (화전민·유민) — 가운데쯤의 빈터에 집 몇 채
  if (!temple && ((leg.pois.PEOPLE || 0) >= 2 || leg.pois.INN)) {
    const hx = p2.x;
    const hy = p2.y + 3;
    clearing(g, hx, hy, 5, 'PLAIN');
    for (let i = -4; i <= 4; i++) if (!isRoad(get(g, hx + i, hy))) put(g, hx + i, hy, 'ROAD');
    hamlet(g, hx - 6, hy - 5, hx + 6, hy + 4, 5);
    for (let i = -5; i <= 5; i++) {
      for (let j = -6; j <= 6; j++) if (g.rng() < 0.25 && get(g, hx + j, hy + i) === 'PLAIN') put(g, hx + j, hy + i, 'FIELD');
    }
  }
  // 오솔길 — 큰길에서 갈라져 가장자리의 빈터들로 (막다른 곳마다 숨은 것이 있다)
  const targets = [
    { x: 5, y: Math.floor(h * 0.5) + ri(g, -4, 4) },
    { x: w - 6, y: Math.floor(h * 0.6) + ri(g, -4, 4) },
    { x: 6 + ri(g, 0, 4), y: 6 + ri(g, 0, 3) },
    { x: w - 7 - ri(g, 0, 4), y: h - 8 - ri(g, 0, 3) },
    { x: 6, y: h - 8 },
  ];
  const roads: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isRoad(get(g, x, y))) roads.push({ x, y });
  targets.forEach((tg, i) => {
    let best = roads[0];
    let bd = Infinity;
    roads.forEach((r) => {
      const d = Math.abs(r.x - tg.x) + Math.abs(r.y - tg.y);
      if (d < bd && r.y < h - 3) {
        bd = d;
        best = r;
      }
    });
    carve(g, best.x, best.y, tg.x, tg.y, 'PLAIN', 0.3);
    clearing(g, tg.x, tg.y, 2, 'PLAIN');
    // 빈터의 생김새 — 못, 오두막, 바위 뜰
    if (i === 0) {
      clearing(g, tg.x, tg.y + 2, 1, 'WATER');
      put(g, tg.x + 2, tg.y + 2, 'REED');
    } else if (i === 1 && (leg.pois.MASTER || leg.pois.PEOPLE)) put(g, tg.x, tg.y - 2, 'HOUSE');
    else if (i === 2) {
      put(g, tg.x - 2, tg.y, 'ROCK');
      put(g, tg.x + 2, tg.y - 1, 'ROCK');
    }
  });
}

// ───────── 마을·길·강·바다 (가로) ─────────
function genWide(g: Grid, leg: JourneyLeg) {
  const { w, h, seed } = g;
  const cx = Math.floor(w / 2);
  const t = leg.terrain;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = valueNoise(x / 6, y / 6, seed + 1);
      const n2 = valueNoise(x / 3, y / 3, seed + 2);
      let k: TileKind = 'PLAIN';
      // 가장자리로 갈수록 우거진 숲이 두터워진다 — 트인 곳은 길과 마을 둘레뿐
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const wood = n + (edge < 5 ? (5 - edge) * 0.07 : 0);
      if (t === 'TOWN') k = wood > 0.74 ? 'GROVE' : n > 0.62 ? 'FIELD' : n < 0.2 ? 'FOREST' : 'PLAIN';
      else if (t === 'ROAD') k = n < 0.36 || wood > 0.8 ? 'GROVE' : n < 0.44 ? 'FOREST' : n > 0.64 ? 'FIELD' : n2 > 0.78 ? 'HILL' : 'PLAIN';
      else if (t === 'RIVER') k = n < 0.3 || wood > 0.8 ? 'GROVE' : n < 0.38 ? 'FOREST' : n > 0.62 ? 'FIELD' : 'PLAIN';
      else k = n < 0.34 || wood > 0.8 ? 'GROVE' : n < 0.42 ? 'FOREST' : n2 > 0.75 ? 'HILL' : 'PLAIN';
      put(g, x, y, k);
    }
  }
  walls(g, t === 'COAST' ? 'ROCK' : 'PEAK', 1, 2, { top: t !== 'COAST', bottom: true, left: true, right: true });
  const midY = Math.floor(h / 2) + ri(g, -2, 2);

  if (t === 'COAST') {
    // 바다 — 위쪽이 바다, 물가에 모래톱과 바위 벼랑, 앞바다에 섬 하나
    const shore: number[] = [];
    for (let x = 0; x < w; x++) shore[x] = 8 + Math.round(valueNoise(x / 7, 3.5, seed + 5) * 6);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < shore[x]; y++) put(g, x, y, 'SEA');
      for (let y = shore[x]; y < shore[x] + 2; y++) put(g, x, y, valueNoise(x / 3, y, seed + 6) > 0.72 ? 'ROCK' : 'SAND');
    }
    const ix = ri(g, 10, w - 12);
    const iy = Math.max(3, shore[ix] - 5);
    clearing(g, ix, iy, 2, 'SAND');
    put(g, ix, iy - 1, 'FOREST');
    for (let y = iy + 2; y < shore[ix]; y++) put(g, ix, y, 'SAND'); // 썰물 때 드러나는 모랫길
    const ty = Math.min(h - 6, Math.max(...shore) + 3);
    carve(g, 3, ty + ri(g, -1, 1), w - 4, ty + ri(g, -1, 1), 'ROAD', 0.25);
    carve(g, cx, h - 1, cx, ty, 'ROAD', 0.1);
    hamlet(g, cx - 14, ty - 4, cx + 6, ty + 3, 6);
    // 바위굴 — 물가 벼랑 안쪽의 빈터
    const kx = g.rng() < 0.5 ? ri(g, 4, 12) : ri(g, w - 13, w - 5);
    rect(g, kx - 2, shore[kx] - 1, kx + 2, shore[kx] + 1, 'ROCK');
    put(g, kx, shore[kx], 'PLAIN');
    put(g, kx, shore[kx] + 1, 'SAND');
  } else if (t === 'RIVER') {
    // 큰 강 — 가운데를 굽이쳐 흐르고, 다리 둘. 강 건너에 목적지가 있다
    const ry: number[] = [];
    for (let x = 0; x < w; x++) ry[x] = midY - 2 + Math.round(Math.sin(x / 7 + seed) * 2.2);
    for (let x = 0; x < w; x++) {
      for (let y = ry[x] - 1; y <= ry[x] + 1; y++) put(g, x, y, 'WATER');
      if (g.rng() < 0.6) put(g, x, ry[x] - 2, 'REED');
      if (g.rng() < 0.6) put(g, x, ry[x] + 2, g.rng() < 0.5 ? 'REED' : 'SAND');
    }
    const southY = Math.min(h - 6, Math.max(...ry) + 4);
    const northY = Math.max(5, Math.min(...ry) - 4);
    carve(g, cx, h - 1, cx, southY, 'ROAD', 0.1);
    carve(g, 4, southY + ri(g, -1, 1), w - 5, southY + ri(g, -1, 1), 'ROAD', 0.25);
    const b1 = ri(g, 10, 20);
    const b2 = ri(g, w - 21, w - 11);
    [b1, b2].forEach((bx) => carve(g, bx, southY, bx, northY, 'ROAD', 0));
    carve(g, b1, northY, b2, northY, 'ROAD', 0.25);
    hamlet(g, cx - 12, southY - 3, cx + 12, southY + 4, 5);
    const gx = ri(g, b1 + 4, b2 - 4);
    carve(g, gx, northY, gx, 4, 'ROAD', 0.2);
    rect(g, gx - 1, 2, gx + 1, 3, 'HALL'); // 강 건너 언덕의 정자
    put(g, gx, 4, 'ROAD');
  } else {
    // 마을·길 — 가로지르는 큰길과 골목
    const town = t === 'TOWN';
    if (town) {
      carve(g, 3, midY, w - 4, midY, 'ROAD', 0);
      carve(g, cx, h - 1, cx, midY, 'ROAD', 0);
      const xs = [ri(g, 9, 14), ri(g, 21, 26), ri(g, 38, 43), ri(g, 50, 55)];
      xs.forEach((sx, i) => {
        const top = i % 2 === 0 ? 5 : ri(g, 7, 11);
        const bot = i % 2 === 1 ? h - 5 : ri(g, h - 11, h - 7);
        carve(g, sx, midY, sx, top, 'ROAD', 0);
        carve(g, sx, midY, sx, bot, 'ROAD', 0);
      });
      // 장터 마당
      rect(g, cx - 4, midY - 4, cx + 3, midY - 1, 'PLAIN');
      // 관아·사당 — 가장 긴 골목의 끝
      const hx = xs[0];
      rect(g, hx - 2, 2, hx + 2, 4, 'HALL');
      put(g, hx, 4, 'ROAD');
      put(g, hx, 5, 'ROAD');
      xs.forEach((sx) => {
        hamlet(g, sx - 7, 3, sx + 7, midY - 1, 11);
        hamlet(g, sx - 7, midY + 1, sx + 7, h - 4, 11);
      });
      hamlet(g, 3, midY - 4, w - 4, midY + 3, 10); // 큰길가의 가게들
      // 길에서 멀어지면 마을 밖 — 논밭과 우거진 숲
      const dist = new Uint8Array(w * h).fill(255);
      const q: number[] = [];
      for (let i = 0; i < w * h; i++) if (isRoad(g.t[i])) { dist[i] = 0; q.push(i); }
      for (let head = 0; head < q.length; head++) {
        const u = q[head];
        const ux = u % w;
        const uy = Math.floor(u / w);
        for (const [nx, ny] of [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]]) {
          if (!inside(g, nx, ny)) continue;
          const v = ny * w + nx;
          if (dist[v] !== 255) continue;
          dist[v] = dist[u] + 1;
          q.push(v);
        }
      }
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const k = g.t[i];
          if (dist[i] < 5 || k === 'HOUSE' || k === 'HALL' || k === 'PEAK') continue;
          g.t[i] = valueNoise(x / 5, y / 5, seed + 13) < 0.45 ? 'GROVE' : 'FIELD';
        }
      }
    } else {
      // 굽이진 길과 길가 마을 두엇, 길을 가로지르는 개울
      let py = midY;
      let px = 3;
      while (px < w - 4) {
        const nx = Math.min(w - 4, px + ri(g, 7, 11));
        const ny = Math.max(6, Math.min(h - 7, py + ri(g, -5, 5)));
        carve(g, px, py, nx, ny, 'ROAD', 0.2);
        px = nx;
        py = ny;
      }
      let jy = midY;
      for (let y = 0; y < h; y++) if (isRoad(get(g, cx, y))) jy = y;
      carve(g, cx, h - 1, cx, jy, 'ROAD', 0.1);
      const sxw = ri(g, 14, 22);
      let wx = sxw;
      for (let y = 1; y < h - 1; y++) {
        wx += Math.round((valueNoise(2.5, y / 4, seed + 9) - 0.5) * 2);
        const k = get(g, wx, y);
        if (k === 'PEAK') continue;
        put(g, wx, y, isRoad(k) ? 'BRIDGE' : 'WATER');
        if (!isRoad(get(g, wx + 1, y)) && get(g, wx + 1, y) !== 'PEAK') put(g, wx + 1, y, isRoad(get(g, wx + 1, y)) ? 'BRIDGE' : 'WATER');
      }
      hamlet(g, cx - 10, 3, cx + 10, h - 4, 5);
      hamlet(g, w - 16, 3, w - 4, h - 4, 3);
    }
  }
  // 샛길 — 길에서 갈라져 숲·언덕 속 막다른 곳으로
  const roads: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isRoad(get(g, x, y))) roads.push({ x, y });
  const spots = [
    { x: ri(g, 4, 10), y: ri(g, 4, 9) },
    { x: ri(g, w - 11, w - 5), y: ri(g, h - 9, h - 5) },
    { x: ri(g, 4, 10), y: ri(g, h - 9, h - 5) },
    { x: ri(g, w - 11, w - 5), y: ri(g, 4, 9) },
  ];
  spots.forEach((sp, i) => {
    const k0 = get(g, sp.x, sp.y);
    if (k0 === 'SEA' || k0 === 'WATER' || k0 === 'PEAK') return;
    let best = roads[0];
    let bd = Infinity;
    roads.forEach((r) => {
      const d = Math.abs(r.x - sp.x) + Math.abs(r.y - sp.y);
      if (d < bd && r.y < h - 2) {
        bd = d;
        best = r;
      }
    });
    if (!best) return;
    carve(g, best.x, best.y, sp.x, sp.y, 'PLAIN', 0.3);
    clearing(g, sp.x, sp.y, 1, i % 2 ? 'PLAIN' : 'HILL');
    if (i === 1) for (let a = -2; a <= 2; a++) if (get(g, sp.x + a, sp.y - 2) !== 'ROAD') put(g, sp.x + a, sp.y - 2, 'FOREST');
  });
}

// 길과 이어지지 않은 빈터마다 오솔길을 낸다 — 우거진 숲·바위를 헤치고, 집·전각·봉우리·바다는 돌아서.
function connectPockets(g: Grid, ex: number, ey: number) {
  const { w, h } = g;
  const pass = (k: TileKind | null) => !!k && TILE_INFO[k].pass;
  for (let round = 0; round < 24; round++) {
    const reach = new Uint8Array(w * h);
    const q = [ey * w + ex];
    reach[q[0]] = 1;
    for (let head = 0; head < q.length; head++) {
      const u = q[head];
      const ux = u % w;
      const uy = Math.floor(u / w);
      for (const [nx, ny] of [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]]) {
        if (!inside(g, nx, ny)) continue;
        const v = ny * w + nx;
        if (reach[v] || !pass(g.t[v])) continue;
        reach[v] = 1;
        q.push(v);
      }
    }
    // 닿지 않는 덩어리 중 가장 큰 것 하나
    const seen = new Uint8Array(w * h);
    let best: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || reach[i] || !pass(g.t[i])) continue;
      const comp = [i];
      seen[i] = 1;
      for (let head = 0; head < comp.length; head++) {
        const u = comp[head];
        const ux = u % w;
        const uy = Math.floor(u / w);
        for (const [nx, ny] of [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]]) {
          if (!inside(g, nx, ny) || nx === 0 || ny === 0 || nx === w - 1 || ny === h - 1) continue;
          const v = ny * w + nx;
          if (seen[v] || reach[v] || !pass(g.t[v])) continue;
          seen[v] = 1;
          comp.push(v);
        }
      }
      if (comp.length > best.length) best = comp;
    }
    if (best.length < 10) return;
    // 그 덩어리에서 닿는 땅까지 — 헤칠 수 있는 칸만 지나는 가장 짧은 길
    const soft = (k: TileKind) => k !== 'HOUSE' && k !== 'HALL' && k !== 'PEAK' && k !== 'SEA';
    const prev = new Int32Array(w * h).fill(-2);
    const bq: number[] = [];
    best.forEach((i) => {
      prev[i] = -1;
      bq.push(i);
    });
    let hit = -1;
    for (let head = 0; head < bq.length && hit < 0; head++) {
      const u = bq[head];
      const ux = u % w;
      const uy = Math.floor(u / w);
      for (const [nx, ny] of [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]]) {
        const v = ny * w + nx;
        if ((nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) && v !== ey * w + ex) continue;
        if (prev[v] !== -2 || !soft(g.t[v])) continue;
        prev[v] = u;
        if (reach[v]) {
          hit = v;
          break;
        }
        bq.push(v);
      }
    }
    if (hit < 0) {
      if (best.length < 60) best.forEach((i) => (g.t[i] = 'GROVE')); // 끝내 닿지 못하는 작은 빈터는 숲으로 덮는다
      else carve(g, best[0] % w, Math.floor(best[0] / w), ex, ey - 1, 'PLAIN', 0.2);
      continue;
    }
    for (let c = prev[hit]; c >= 0 && prev[c] !== -1; c = prev[c]) {
      const k = g.t[c];
      if (!pass(k)) g.t[c] = k === 'WATER' ? 'BRIDGE' : 'PLAIN';
    }
  }
}

// ───────── 지도 만들기 ─────────
function buildArea(region: JourneyRegion, leg: JourneyLeg, useLayout = true): JourneyMap {
  const shape = areaShape(leg.terrain);
  const { w: W, h: H } = AREA_SIZE[shape];
  const seed = hashStr(`area:${leg.id}`);
  const g: Grid = { w: W, h: H, t: new Array(W * H).fill('PLAIN'), rng: mulberry32(seed), seed };
  if (shape === 'TALL') genTall(g, leg);
  else if (shape === 'SQUARE') genSquare(g, leg);
  else genWide(g, leg);
  const entrance = { x: Math.floor(W / 2), y: H - 1 };
  // 가장자리는 막고, 출구 길목만 연다
  for (let x = 0; x < W; x++) {
    for (const y of [0, H - 1]) if (TILE_INFO[g.t[y * W + x]].pass) g.t[y * W + x] = leg.terrain === 'COAST' && y === 0 ? 'SEA' : 'PEAK';
  }
  for (let y = 0; y < H; y++) {
    for (const x of [0, W - 1]) if (TILE_INFO[g.t[y * W + x]].pass) g.t[y * W + x] = 'PEAK';
  }
  g.t[entrance.y * W + entrance.x] = 'ROAD';
  if (!TILE_INFO[g.t[(entrance.y - 1) * W + entrance.x]].pass) g.t[(entrance.y - 1) * W + entrance.x] = 'ROAD';
  connectPockets(g, entrance.x, entrance.y);

  const layout = useLayout ? AREA_LAYOUTS[leg.id] : undefined;
  if (layout) {
    const fitted = parseLayout(layout, W, H);
    if (fitted) {
      fitted.forEach((k, i) => (g.t[i] = k));
      g.t[entrance.y * W + entrance.x] = 'ROAD';
    } else console.warn(`[journeyAreas] ${leg.id} 칸 배치의 크기가 ${W}×${H}와 맞지 않아 무시한다`);
  }
  const zone = new Int16Array(W * H);
  return finishMap({
    regionId: region.id,
    w: W,
    h: H,
    tiles: g.t,
    zone,
    zones: [{ legId: leg.id, terrain: leg.terrain, cx: Math.floor(W / 2), cy: Math.floor(H / 2), depth: 0 }],
    entrance,
    seed,
    area: leg.id,
  });
}

const cache = new Map<string, JourneyMap>();

export function getAreaMap(legId: string): JourneyMap {
  let m = cache.get(legId);
  if (!m) {
    const found = legRegion(legId);
    if (!found) throw new Error(`모르는 구간: ${legId}`);
    m = buildArea(found.region, found.leg);
    cache.set(legId, m);
  }
  return m;
}

// 그림에 맞추기 전, 생성기가 만든 그대로의 지도 (안내도·칸 맞춤 도구의 바탕)
export function getGeneratedAreaMap(legId: string): JourneyMap {
  const found = legRegion(legId);
  if (!found) throw new Error(`모르는 구간: ${legId}`);
  return buildArea(found.region, found.leg, false);
}

// ───────── 숨은 장소 고르기 ─────────
// 숨은 것(고수·보물·사당·절경)은 길에서 멀고 출구에서도 먼 곳 — 막다른 산허리, 숲속 빈터, 벼랑 너머.
// 사람·주막·시대의 현장은 길가에, 출구에서 가까운 곳부터 먼 곳까지 고루.
export const HIDDEN_KINDS = new Set(['MASTER', 'TREASURE', 'SHRINE', 'VISTA']);

export function pickAreaPoiTile(m: JourneyMap, kind: string, occupied: Array<{ tx: number; ty: number }>, rand: () => number = Math.random): { x: number; y: number } | null {
  let maxD = 1;
  for (let i = 0; i < m.w * m.h; i++) if (m.reach[i] && m.walkDist[i] !== 65535) maxD = Math.max(maxD, m.walkDist[i]);
  const cands: Array<[{ x: number; y: number }, number]> = [];
  for (let y = 1; y < m.h - 1; y++) {
    for (let x = 1; x < m.w - 1; x++) {
      const i = y * m.w + x;
      if (!m.reach[i]) continue;
      const t = m.tiles[i];
      if (!TILE_INFO[t].pass || t === 'BRIDGE') continue;
      const far = m.walkDist[i] / maxD;
      if (far < 0.12) continue; // 출구 바로 앞에는 놓지 않는다
      let dmin = 99;
      occupied.forEach((o) => (dmin = Math.min(dmin, Math.max(Math.abs(o.tx - x), Math.abs(o.ty - y)))));
      if (dmin < 4) continue;
      const rd = m.roadDist[i];
      let wgt: number;
      if (kind === 'VISTA') wgt = far > 0.9 ? 10 * far : 0;
      else if (HIDDEN_KINDS.has(kind)) wgt = t === 'ROAD' ? 0 : (rd >= 3 ? 2 + Math.min(6, rd) : rd === 2 ? 1 : 0.15) * (0.4 + far);
      else wgt = t === 'ROAD' ? 0.2 : rd === 1 ? 3 : rd === 2 ? 1 : 0.1;
      wgt *= Math.min(1, dmin / 7);
      if (wgt > 0) cands.push([{ x, y }, wgt]);
    }
  }
  if (!cands.length) return null;
  const total = cands.reduce((a, [, wv]) => a + wv, 0);
  let roll = rand() * total;
  for (const [p, wv] of cands) {
    roll -= wv;
    if (roll <= 0) return p;
  }
  return cands[cands.length - 1][0];
}

// ───────── 둘러본 칸 ─────────
// 구역 지도에서 걸으며 본 칸들. 세이브에 넣기 좋게 base64 글자로 담는다 (칸 하나가 1비트).
export const SIGHT = 4;

export function decodeExplored(str: string | undefined, n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (!str) return out;
  try {
    const bin = atob(str);
    for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch {
    /* 깨진 값은 비운다 */
  }
  return out;
}

export function encodeExplored(bits: Uint8Array): string {
  const bytes = new Array(Math.ceil(bits.length / 8)).fill(0);
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3] |= 1 << (i & 7);
  const bin = String.fromCharCode(...bytes);
  return btoa(bin);
}

// (x, y)에 선 사람이 둘러보는 칸들을 켠다. 새로 본 칸이 있으면 true.
export function revealAround(m: JourneyMap, bits: Uint8Array, x: number, y: number, r = SIGHT): boolean {
  let changed = false;
  for (let yy = y - r; yy <= y + r; yy++) {
    for (let xx = x - r; xx <= x + r; xx++) {
      if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
      if ((xx - x) * (xx - x) + (yy - y) * (yy - y) > r * r + r) continue;
      const i = yy * m.w + xx;
      if (!bits[i]) {
        bits[i] = 1;
        changed = true;
      }
    }
  }
  return changed;
}

export function paintedAreaSources(legId: string, season: string): { seasonal: string; base: string } {
  return { seasonal: `/assets/px_jr_area_${legId}_${season.toLowerCase()}.jpg`, base: `/assets/px_jr_area_${legId}.jpg` };
}
