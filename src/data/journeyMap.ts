import { JourneyRegionId, Season } from '../types/game';
import { getRegion, JourneyRegion, JourneyTerrain } from './journeyRegions';
import { MAP_LAYOUTS } from './journeyMapLayouts';

// ───────────────────────── 무사수행 지도 ─────────────────────────
// 프린세스 메이커 2의 무사수행처럼, 한 지역은 위·아래·왼쪽·오른쪽으로 한 칸씩 걷는 지도 한 장이다.
// 지역의 구간(leg)은 지도 위의 「땅(구역)」이 된다. 구간 표의 갈림길(next)로 이어진 땅끼리는 길이 나 있고,
// 이어지지 않은 땅 사이에는 산줄기나 물길이 가로막는다. 그래서 예전 갈림길의 흐름이 지도 모양으로 남는다.
// 지도는 지역마다 늘 같다(지역 id로 씨앗을 정한다). 길 위의 장소와 사건만 떠날 때마다 새로 놓인다.

export type TileKind =
  | 'PLAIN'
  | 'ROAD'
  | 'BRIDGE'
  | 'FIELD'
  | 'FOREST'
  | 'GROVE'
  | 'HILL'
  | 'SAND'
  | 'REED'
  | 'PEAK'
  | 'ROCK'
  | 'WATER'
  | 'SEA'
  | 'HOUSE'
  | 'HALL';

// days: 그 칸으로 한 걸음 들어가는 데 드는 날수
export const TILE_INFO: Record<TileKind, { pass: boolean; days: number; name: string }> = {
  PLAIN: { pass: true, days: 0.85, name: '들판' },
  ROAD: { pass: true, days: 0.6, name: '길' },
  BRIDGE: { pass: true, days: 0.6, name: '다리' },
  FIELD: { pass: true, days: 0.85, name: '논밭' },
  FOREST: { pass: true, days: 1.2, name: '숲' },
  GROVE: { pass: false, days: 0, name: '우거진 숲' },
  HILL: { pass: true, days: 1.5, name: '산비탈' },
  SAND: { pass: true, days: 0.95, name: '모래톱' },
  REED: { pass: true, days: 1.1, name: '갈대밭' },
  PEAK: { pass: false, days: 0, name: '봉우리' },
  ROCK: { pass: false, days: 0, name: '바위 벼랑' },
  WATER: { pass: false, days: 0, name: '물길' },
  SEA: { pass: false, days: 0, name: '바다' },
  HOUSE: { pass: false, days: 0, name: '인가' },
  HALL: { pass: false, days: 0, name: '전각' },
};

export function tileDays(kind: TileKind, season: Season): number {
  const base = TILE_INFO[kind].days;
  // 겨울 산길과 숲은 눈에 묻혀 더디다
  if (season === 'WINTER' && (kind === 'HILL' || kind === 'FOREST')) return base + 0.3;
  return base;
}

export interface JourneyMapZone {
  legId: string;
  terrain: JourneyTerrain;
  cx: number;
  cy: number;
  depth: number;
}

export interface JourneyMap {
  regionId: JourneyRegionId;
  w: number;
  h: number;
  tiles: TileKind[];
  zone: Int16Array; // 칸마다 어느 땅인지 (zones의 번호)
  zones: JourneyMapZone[];
  entrance: { x: number; y: number }; // 도장으로 이어지는 길목 (출발점)
  reach: Uint8Array; // 출발점에서 걸어서 닿는 칸
  roadDist: Uint8Array; // 가장 가까운 길까지 몇 걸음
  walkDist: Uint16Array; // 출발점에서 몇 걸음 (닿지 않으면 65535)
  seed: number;
  area?: string; // 구역 지도면 그 구간 id (바깥 지도는 비어 있다)
  gates?: Array<{ legId: string; x: number; y: number }>; // 바깥 지도에서 구역 지도로 들어가는 자리
}

// ───────── 결정론적 난수 ─────────
export function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// 0~1 값 잡음 (격자 보간)
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function tileHash(x: number, y: number, seed: number): number {
  return hash2(x, y, seed);
}

// ───────── 칸 배치 글자 ─────────
// 그림 지도에 맞춘 칸 배치는 journeyMapLayouts.ts에 글자 그림으로 적는다. 한 글자가 한 칸이다.
export const TILE_CHAR: Record<TileKind, string> = {
  PLAIN: '.',
  ROAD: '=',
  BRIDGE: '#',
  FIELD: 'f',
  FOREST: 'T',
  GROVE: 'F',
  HILL: 'h',
  SAND: 's',
  REED: 'r',
  PEAK: '^',
  ROCK: 'R',
  WATER: '~',
  SEA: 'w',
  HOUSE: 'H',
  HALL: 'A',
};
export const CHAR_TILE: Record<string, TileKind> = Object.fromEntries(Object.entries(TILE_CHAR).map(([k, c]) => [c, k as TileKind]));

export function parseLayout(rows: string[], W: number, H: number): TileKind[] | null {
  if (rows.length !== H || rows.some((r) => r.length !== W)) return null;
  const out: TileKind[] = [];
  for (const r of rows) for (const c of r) out.push(CHAR_TILE[c] || 'PLAIN');
  return out;
}

export function mapToLayout(m: JourneyMap): string[] {
  const rows: string[] = [];
  for (let y = 0; y < m.h; y++) rows.push(m.tiles.slice(y * m.w, (y + 1) * m.w).map((k) => TILE_CHAR[k]).join(''));
  return rows;
}

const COL_W = 9;
const MAP_H = 22;
const MARGIN_X = 2;

const LOWLAND: JourneyTerrain[] = ['TOWN', 'RIVER', 'ROAD', 'COAST', 'TEMPLE'];

// ───────── 지도 만들기 ─────────
function buildMap(region: JourneyRegion): JourneyMap {
  const seed = hashStr(region.id);
  const rng = mulberry32(seed);
  const legs = region.legs;

  // 1) 출발 구간에서 몇 번째 갈림길인지 = 왼쪽에서 몇 번째 줄인지
  const depth = new Map<string, number>();
  depth.set(region.startLeg, 0);
  const queue = [region.startLeg];
  while (queue.length) {
    const id = queue.shift()!;
    const leg = legs.find((l) => l.id === id);
    if (!leg) continue;
    leg.next.forEach((n) => {
      if (!depth.has(n)) {
        depth.set(n, depth.get(id)! + 1);
        queue.push(n);
      }
    });
  }
  legs.forEach((l) => {
    if (!depth.has(l.id)) depth.set(l.id, 1);
  });
  const maxDepth = Math.max(...[...depth.values()]);
  const W = MARGIN_X + (maxDepth + 1) * COL_W + 1;
  const H = MAP_H;

  // 2) 줄마다 땅을 위아래로 벌여 놓는다 (앞 줄의 부모 위치를 따라 정렬해 길이 덜 엇갈리게)
  const zones: JourneyMapZone[] = [];
  const posY = new Map<string, number>();
  for (let d = 0; d <= maxDepth; d++) {
    const col = legs.filter((l) => depth.get(l.id) === d);
    const bary = (id: string) => {
      const parents = legs.filter((p) => p.next.includes(id) && posY.has(p.id));
      return parents.length ? parents.reduce((a, p) => a + posY.get(p.id)!, 0) / parents.length : H / 2;
    };
    col.sort((a, b) => bary(a.id) - bary(b.id));
    col.forEach((leg, i) => {
      const n = col.length;
      const cy = Math.round(Math.max(3, Math.min(H - 4, 1 + ((i + 0.5) * (H - 2)) / n + (rng() - 0.5) * 3)));
      const cx = Math.round(MARGIN_X + d * COL_W + COL_W / 2 + (rng() - 0.5) * 2.4);
      posY.set(leg.id, cy);
      zones.push({ legId: leg.id, terrain: leg.terrain, cx, cy, depth: d });
    });
  }
  const zoneIdx = new Map(zones.map((z, i) => [z.legId, i]));
  const linked = (a: number, b: number) => {
    const la = legs.find((l) => l.id === zones[a].legId)!;
    const lb = legs.find((l) => l.id === zones[b].legId)!;
    return la.next.includes(lb.id) || lb.next.includes(la.id);
  };

  // 3) 칸마다 가장 가까운 땅 (잡음으로 경계를 구불구불하게)
  const zone = new Int16Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let best = 0;
      let bestD = Infinity;
      zones.forEach((z, k) => {
        const warp = (valueNoise(x * 0.3, y * 0.3, seed + k * 31) - 0.5) * 4.2;
        const d = Math.hypot((x - z.cx) * 1.05, y - z.cy) + warp;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      zone[y * W + x] = best;
    }
  }

  // 4) 땅의 성격대로 칸을 채운다
  const tiles: TileKind[] = new Array(W * H).fill('PLAIN');
  const at = (x: number, y: number) => y * W + x;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = zones[zone[at(x, y)]];
      const n1 = valueNoise(x / 3.2, y / 3.2, seed + 7);
      const n2 = valueNoise(x / 1.6, y / 1.6, seed + 99);
      const r = hash2(x, y, seed + 3);
      const dc = Math.hypot(x - z.cx, y - z.cy);
      let t: TileKind = 'PLAIN';
      switch (z.terrain) {
        case 'TOWN':
          if (dc < 3.6 && x % 3 !== z.cx % 3 && y % 3 !== z.cy % 3 && r < 0.75) t = 'HOUSE';
          else if (dc >= 3.6) t = n1 < 0.45 ? 'FIELD' : n2 > 0.78 ? 'FOREST' : 'PLAIN';
          break;
        case 'ROAD':
          t = n1 < 0.36 ? 'FIELD' : n1 > 0.72 ? 'FOREST' : n2 > 0.86 ? 'HILL' : r < 0.04 ? 'HOUSE' : 'PLAIN';
          break;
        case 'FOREST':
          t = n1 > 0.3 ? (n2 > 0.82 ? 'HILL' : 'FOREST') : r < 0.06 ? 'ROCK' : 'PLAIN';
          break;
        case 'MOUNTAIN':
          t = dc < 1.6 ? 'HILL' : n1 > 0.6 ? (n2 > 0.4 ? 'PEAK' : 'HILL') : n1 < 0.32 ? 'FOREST' : 'HILL';
          break;
        case 'PASS':
          t = n2 > 0.7 ? 'ROCK' : n1 > 0.7 ? 'PEAK' : n1 < 0.28 ? 'FOREST' : 'HILL';
          break;
        case 'RIVER':
          t = n1 < 0.35 ? 'FIELD' : n2 > 0.75 ? 'FOREST' : 'PLAIN';
          break;
        case 'COAST':
          t = n2 > 0.8 ? 'FOREST' : n1 > 0.7 ? 'HILL' : 'PLAIN';
          break;
        case 'TEMPLE':
          if (Math.abs(y - (z.cy - 1)) < 0.5 && Math.abs(x - z.cx) <= 1) t = 'HALL';
          else if (dc < 2.4) t = 'PLAIN';
          else t = n1 > 0.48 ? 'FOREST' : n2 > 0.85 ? 'HILL' : 'PLAIN';
          break;
      }
      tiles[at(x, y)] = t;
    }
  }

  // 바닷가: 가까운 위·아래 가장자리 쪽이 바다가 된다
  zones.forEach((z, k) => {
    if (z.terrain !== 'COAST') return;
    const top = z.cy < H / 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (zone[at(x, y)] !== k) continue;
        const edge = top ? y : H - 1 - y;
        // 땅 한가운데까지 바다가 들어오지는 않게
        const centerEdge = top ? z.cy : H - 1 - z.cy;
        const shore = Math.min(centerEdge - 2.5, 2.2 + valueNoise(x / 2.5, 0, seed + k) * 3.2);
        if (edge < shore) tiles[at(x, y)] = hash2(x, y, seed + 11) < 0.06 ? 'ROCK' : 'SEA';
        else if (edge < shore + 1.2) tiles[at(x, y)] = 'SAND';
      }
    }
  });

  // 강: 강 구간 한가운데를 위에서 아래로 굽이쳐 흐른다 (같은 줄의 다른 땅도 지난다)
  zones.forEach((z, k) => {
    if (z.terrain !== 'RIVER') return;
    const phase = hash2(k, 5, seed) * 6.28;
    for (let y = 0; y < H; y++) {
      const rx = z.cx + Math.sin(y * 0.42 + phase) * 1.8 + (valueNoise(0, y / 3, seed + k * 13) - 0.5) * 2;
      for (let x = 0; x < W; x++) {
        const d = Math.abs(x - rx);
        if (d < 0.8) tiles[at(x, y)] = 'WATER';
        else if (d < 1.9 && zone[at(x, y)] === k && tiles[at(x, y)] !== 'HOUSE' && hash2(x, y, seed + 21) < 0.55) tiles[at(x, y)] = 'REED';
      }
    }
  });

  // 5) 이어지지 않은 땅 사이에는 산줄기(평지끼리는 물길)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = zone[at(x, y)];
      const nbs: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of nbs) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const b = zone[at(nx, ny)];
        if (b === a || a > b || linked(a, b)) continue;
        if (tiles[at(x, y)] === 'SEA') continue;
        const low = LOWLAND.includes(zones[a].terrain) && LOWLAND.includes(zones[b].terrain);
        tiles[at(x, y)] = low ? 'WATER' : hash2(x, y, seed + 41) < 0.62 ? 'PEAK' : 'ROCK';
        break;
      }
    }
  }

  // 지도 가장자리는 첩첩산중 (바닷가 쪽은 바다)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
        tiles[at(x, y)] = tiles[at(x, y)] === 'SEA' || tiles[at(x, y)] === 'SAND' ? 'SEA' : 'PEAK';
      }
    }
  }

  // 6) 길을 낸다 — 갈림길로 이어진 땅의 한가운데끼리, 그리고 도장에서 출발 구간까지
  const start = zones[zoneIdx.get(region.startLeg)!];
  const entrance = { x: 0, y: start.cy };
  const stepCost = (k: TileKind): number =>
    k === 'ROAD' || k === 'BRIDGE' ? 0.45 : k === 'PEAK' || k === 'ROCK' ? 9 : k === 'WATER' ? 5 : k === 'SEA' ? 60 : k === 'HOUSE' || k === 'HALL' ? 30 : k === 'HILL' ? 2.2 : k === 'FOREST' ? 1.8 : k === 'REED' ? 1.6 : 1;
  const carve = (sx: number, sy: number, tx: number, ty: number) => {
    const dist = new Float64Array(W * H).fill(Infinity);
    const prev = new Int32Array(W * H).fill(-1);
    const done = new Uint8Array(W * H);
    dist[at(sx, sy)] = 0;
    // 지도가 작아(최대 40×22) 단순한 다익스트라로 충분하다
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < W * H; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u === -1 || u === at(tx, ty)) break;
      done[u] = 1;
      const ux = u % W;
      const uy = Math.floor(u / W);
      for (const [nx, ny] of [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]] as Array<[number, number]>) {
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) {
          if (!(nx === tx && ny === ty)) continue;
        }
        const v = at(nx, ny);
        if (done[v]) continue;
        const c = best + stepCost(tiles[v]) + hash2(nx, ny, seed + 77) * 0.7;
        if (c < dist[v]) { dist[v] = c; prev[v] = u; }
      }
    }
    let cur = at(tx, ty);
    while (cur !== -1) {
      const k = tiles[cur];
      tiles[cur] = k === 'WATER' || k === 'SEA' ? 'BRIDGE' : 'ROAD';
      cur = prev[cur];
    }
  };
  carve(start.cx, start.cy, entrance.x, entrance.y);
  tiles[at(entrance.x, entrance.y)] = 'ROAD';
  legs.forEach((leg) => {
    const a = zones[zoneIdx.get(leg.id)!];
    leg.next.forEach((n) => {
      const bi = zoneIdx.get(n);
      if (bi === undefined) return;
      const b = zones[bi];
      carve(a.cx, a.cy, b.cx, b.cy);
    });
  });

  // 6-1) 그림 지도가 있는 지역은 그림에 맞춰 고친 칸 배치로 갈아 끼운다 (땅 나눔은 그대로 둔다)
  const layout = MAP_LAYOUTS[region.id];
  if (layout) {
    const fitted = parseLayout(layout, W, H);
    if (fitted) {
      fitted.forEach((k, i) => (tiles[i] = k));
      tiles[at(entrance.x, entrance.y)] = 'ROAD';
    }
    else console.warn(`[journeyMap] ${region.id} 칸 배치의 크기가 ${W}×${H}와 맞지 않아 무시한다`);
  }

  // 7) 출발점에서 걸어서 닿는 칸, 길까지의 거리 — 그리고 땅마다 구역 지도로 들어가는 자리
  const m = finishMap({ regionId: region.id, w: W, h: H, tiles, zone, zones, entrance, seed });
  m.gates = zones.map((z, zi) => {
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = at(x, y);
        if (zone[i] !== zi || !m.reach[i]) continue;
        const nearGate = Math.abs(x - entrance.x) + Math.abs(y - entrance.y);
        const road = tiles[i] === 'ROAD' || tiles[i] === 'BRIDGE';
        const sc = Math.hypot(x - z.cx, y - z.cy) + (road ? 0 : 3) + (nearGate < 5 ? 20 : 0) + (tiles[i] === 'BRIDGE' ? 2 : 0);
        if (sc < bestScore) {
          bestScore = sc;
          best = { x, y };
        }
      }
    }
    return { legId: z.legId, ...(best || { x: z.cx, y: z.cy }) };
  });
  return m;
}

// 칸 배치가 정해진 지도에 「걸어서 닿는 칸 · 길까지의 거리 · 출발점에서의 걸음 수」를 붙인다 (바깥 지도·구역 지도 함께)
export function finishMap(base: Omit<JourneyMap, 'reach' | 'roadDist' | 'walkDist'>): JourneyMap {
  const { w: W, h: H, tiles, entrance } = base;
  const at = (x: number, y: number) => y * W + x;
  const pass = (i: number) => TILE_INFO[tiles[i]].pass;
  const reach = new Uint8Array(W * H);
  const walkDist = new Uint16Array(W * H).fill(65535);
  const q: number[] = [at(entrance.x, entrance.y)];
  reach[q[0]] = 1;
  walkDist[q[0]] = 0;
  let head = 0;
  while (head < q.length) {
    const u = q[head++];
    const ux = u % W;
    const uy = Math.floor(u / W);
    for (const [nx, ny] of [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]] as Array<[number, number]>) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const v = at(nx, ny);
      if (reach[v] || !pass(v)) continue;
      reach[v] = 1;
      walkDist[v] = walkDist[u] + 1;
      q.push(v);
    }
  }
  const roadDist = new Uint8Array(W * H).fill(255);
  const rq: number[] = [];
  for (let i = 0; i < W * H; i++) if (tiles[i] === 'ROAD' || tiles[i] === 'BRIDGE') { roadDist[i] = 0; rq.push(i); }
  head = 0;
  while (head < rq.length) {
    const u = rq[head++];
    const ux = u % W;
    const uy = Math.floor(u / W);
    for (const [nx, ny] of [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]] as Array<[number, number]>) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const v = at(nx, ny);
      if (roadDist[v] !== 255 || !pass(v)) continue;
      roadDist[v] = Math.min(254, roadDist[u] + 1);
      rq.push(v);
    }
  }
  return { ...base, reach, roadDist, walkDist };
}

const cache = new Map<string, JourneyMap>();

export function getJourneyMap(regionId: JourneyRegionId): JourneyMap {
  let m = cache.get(regionId);
  if (!m) {
    m = buildMap(getRegion(regionId));
    cache.set(regionId, m);
  }
  return m;
}

export function tileAt(m: JourneyMap, x: number, y: number): TileKind | null {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
  return m.tiles[y * m.w + x];
}

export function zoneLegAt(m: JourneyMap, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
  return m.zones[m.zone[y * m.w + x]].legId;
}

export function zoneOf(m: JourneyMap, legId: string): JourneyMapZone | undefined {
  return m.zones.find((z) => z.legId === legId);
}

// 출발점에서 걸어서 닿는, 사람이 설 수 있는 칸인가
export function walkable(m: JourneyMap, x: number, y: number): boolean {
  const t = tileAt(m, x, y);
  return !!t && TILE_INFO[t].pass;
}

// 4방향 최단 경로 (봇·자동 걷기용). 도착 칸까지의 걸음 목록을 돌려준다 (출발 칸 제외). 닿지 못하면 null.
export function findPath(
  m: JourneyMap,
  from: { x: number; y: number },
  isGoal: (x: number, y: number) => boolean,
  canEnter: (x: number, y: number) => boolean = (x, y) => walkable(m, x, y)
): Array<{ x: number; y: number }> | null {
  const W = m.w;
  const prev = new Int32Array(W * m.h).fill(-2);
  const s = from.y * W + from.x;
  prev[s] = -1;
  const q = [s];
  let head = 0;
  while (head < q.length) {
    const u = q[head++];
    const ux = u % W;
    const uy = Math.floor(u / W);
    if (u !== s && isGoal(ux, uy)) {
      const out: Array<{ x: number; y: number }> = [];
      let c = u;
      while (c !== s) {
        out.push({ x: c % W, y: Math.floor(c / W) });
        c = prev[c];
      }
      return out.reverse();
    }
    for (const [nx, ny] of [[ux + 1, uy], [ux - 1, uy], [ux, uy + 1], [ux, uy - 1]] as Array<[number, number]>) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= m.h) continue;
      const v = ny * W + nx;
      if (prev[v] !== -2 || !canEnter(nx, ny)) continue;
      prev[v] = u;
      q.push(v);
    }
  }
  return null;
}

// ───────── 장소 놓을 칸 고르기 ─────────
// 주막·사람·시대의 현장은 길가에, 고수의 거처·보물·사당·절경은 길에서 조금 들어간 곳에.
const ROADSIDE = new Set(['INN', 'PEOPLE', 'HISTORY', 'ECHO']);

export function pickPoiTile(
  m: JourneyMap,
  legId: string,
  kind: string,
  occupied: Array<{ tx: number; ty: number }>,
  near?: { x: number; y: number; min: number; max: number }
): { x: number; y: number } | null {
  const zi = m.zones.findIndex((z) => z.legId === legId);
  if (zi < 0) return null;
  const cands: Array<[{ x: number; y: number }, number]> = [];
  const pass2 = (relax: boolean) => {
    for (let y = 1; y < m.h - 1; y++) {
      for (let x = 1; x < m.w - 1; x++) {
        const i = y * m.w + x;
        if (m.zone[i] !== zi || !m.reach[i]) continue;
        const t = m.tiles[i];
        if (!TILE_INFO[t].pass) continue;
        if (!relax && (t === 'ROAD' || t === 'BRIDGE')) continue;
        if (x === m.entrance.x && y === m.entrance.y) continue;
        let dmin = 99;
        occupied.forEach((o) => (dmin = Math.min(dmin, Math.max(Math.abs(o.tx - x), Math.abs(o.ty - y)))));
        if (dmin < 2) continue;
        if (near) {
          const d = Math.abs(near.x - x) + Math.abs(near.y - y);
          if (d < near.min || (!relax && d > near.max)) continue;
        }
        const rd = m.roadDist[i];
        let w = ROADSIDE.has(kind) ? (rd === 1 ? 3 : rd === 2 ? 1 : 0.25) : rd >= 2 && rd <= 4 ? 3 : rd === 1 ? 1 : 1.5;
        if (kind === 'VISTA' && t === 'HILL') w *= 3;
        w *= Math.min(1, dmin / 4);
        cands.push([{ x, y }, w]);
      }
    }
  };
  pass2(false);
  if (!cands.length) pass2(true);
  if (!cands.length) return null;
  const total = cands.reduce((a, [, w]) => a + w, 0);
  let roll = Math.random() * total;
  for (const [p, w] of cands) {
    roll -= w;
    if (roll <= 0) return p;
  }
  return cands[cands.length - 1][0];
}
