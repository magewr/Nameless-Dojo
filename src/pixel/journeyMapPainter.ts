import { CountryId, JourneyPoiKind, Season } from '../types/game';
import { JourneyMap, TileKind, tileHash, valueNoise } from '../data/journeyMap';
import { drawTopDownChar, pxRect } from './pixelArt';

// 무사수행 필드의 그림 — 스타듀 밸리 같은 16×16 도트 필드.
//  · 땅(풀·흙길·물·모래·논밭)은 픽셀마다 경계를 살짝 흐트러뜨려 칸 모양이 드러나지 않게 섞는다 (paintFieldGround).
//  · 물가에는 흙 둔덕과 밝은 물거품, 산은 평평한 고원과 바위 절벽으로 그린다.
//  · 나무·집·바위처럼 서 있는 것은 줄마다 따로 그려 두고(paintFieldObjects), 화면이 주인공과 줄 순서대로 겹친다.
//  · 테두리는 검정 대신 그 물건의 가장 어두운 색으로 — 부드러운 도트.
// 화면은 이 그림을 정수 배로 키워(이웃 픽셀 그대로) 쓴다.

export const TILE_PX = 16;

type Ramp = [string, string, string, string, string]; // 테두리 · 그늘 · 바탕 · 빛 · 반짝임

interface Pal {
  grass: [string, string, string, string]; // 어두운 풀포기 · 바탕(진) · 바탕 · 밝은 풀잎
  forest: [string, string, string, string];
  dirt: [string, string, string, string]; // 테두리 · 그늘 · 바탕 · 자갈
  bank: [string, string]; // 물가 둔덕
  water: [string, string, string, string]; // 깊은 · 바탕 · 얕은 · 거품
  sea: [string, string, string, string];
  sand: [string, string, string];
  soil: [string, string, string]; // 고랑 · 바탕 · 이랑
  crop?: [string, string];
  oak: Ramp[];
  pine: Ramp;
  bush: Ramp;
  flowers: string[];
  snow: boolean;
}

const RAMP = {
  springOak: ['#2a5a26', '#3c7a30', '#4f9a38', '#6cb848', '#9ad65e'] as Ramp,
  blossom: ['#8a3a5a', '#c8688a', '#e890b0', '#f8b8d0', '#ffe0ee'] as Ramp,
  summerOak: ['#1f4a22', '#2e6a2c', '#3e8a34', '#58a842', '#86c858'] as Ramp,
  fallOrange: ['#6a2a12', '#a8461c', '#d0682a', '#e8923c', '#f8c060'] as Ramp,
  fallYellow: ['#6a4a12', '#a8801c', '#cca22a', '#e4c44a', '#f6e48a'] as Ramp,
  fallRed: ['#5a1a16', '#8a2a20', '#b23e2a', '#d0603a', '#f0985a'] as Ramp,
  pine: ['#13332a', '#1e4a38', '#2a6248', '#3a7a56', '#5a9a6a'] as Ramp,
  winterPine: ['#13332a', '#1e4a38', '#2a5e46', '#3a7454', '#e8f0f8'] as Ramp,
};

const PAL: Record<Season, Pal> = {
  SPRING: {
    grass: ['#3f8a2c', '#55a033', '#62ad3c', '#86c84c'], forest: ['#2f6a24', '#3f7f2c', '#4a8c33', '#6aa842'],
    dirt: ['#8a5e38', '#b08050', '#c8985e', '#dcb47c'], bank: ['#6b4a2c', '#8a6038'],
    water: ['#2f72c0', '#3c8ad8', '#5aaaf0', '#c4ecff'], sea: ['#21579e', '#2c6cb8', '#4a8ed8', '#b8e0ff'],
    sand: ['#e8d29a', '#f2e0ae', '#d4ba7c'], soil: ['#6a4226', '#865632', '#9e6a3e'], crop: ['#5aa83a', '#8ad050'],
    oak: [RAMP.springOak, RAMP.springOak, RAMP.springOak, RAMP.blossom], pine: RAMP.pine, bush: RAMP.springOak,
    flowers: ['#ffe066', '#ff9ec0', '#ffffff', '#c8a0ff'], snow: false,
  },
  SUMMER: {
    grass: ['#2f7a2a', '#438f30', '#4f9c37', '#74b846'], forest: ['#23602a', '#2f722e', '#3a7f33', '#58a040'],
    dirt: ['#86593a', '#ab7b4e', '#c4945c', '#d8b07a'], bank: ['#664628', '#866034'],
    water: ['#2a6cb8', '#3684d2', '#55a6ec', '#c0eaff'], sea: ['#1e5298', '#2966b2', '#4688d2', '#b4dcff'],
    sand: ['#e6d096', '#f0deaa', '#d2b878'], soil: ['#664024', '#82542e', '#9a683a'], crop: ['#3e9a32', '#74c44a'],
    oak: [RAMP.summerOak, RAMP.summerOak, RAMP.summerOak], pine: RAMP.pine, bush: RAMP.summerOak,
    flowers: ['#ffffff', '#ffe066', '#7ab8ff'], snow: false,
  },
  AUTUMN: {
    grass: ['#7a7a2a', '#949436', '#a2a03c', '#c0b856'], forest: ['#64642a', '#7a7830', '#868436', '#a6a048'],
    dirt: ['#86593a', '#ab7b4e', '#c4945c', '#d8b07a'], bank: ['#664628', '#866034'],
    water: ['#2a66a8', '#357ec4', '#509ee0', '#bce2f8'], sea: ['#1e4e90', '#2962aa', '#4482c8', '#b0d8f8'],
    sand: ['#e2cc90', '#ecd8a4', '#cdb274'], soil: ['#664024', '#82542e', '#9a683a'], crop: ['#c89a2c', '#ecc650'],
    oak: [RAMP.fallOrange, RAMP.fallYellow, RAMP.fallRed, RAMP.fallOrange], pine: RAMP.pine, bush: RAMP.fallRed,
    flowers: ['#f0a040'], snow: false,
  },
  WINTER: {
    grass: ['#b8c8dc', '#e2eaf4', '#eef3fa', '#ffffff'], forest: ['#a8b8cc', '#d4dee9', '#e0e8f2', '#f4f8fc'],
    dirt: ['#7e6e62', '#9e8c7c', '#b4a494', '#cabcae'], bank: ['#5e5048', '#7a6a5e'],
    water: ['#3a6898', '#4a7eb0', '#6a9ccc', '#e8f4ff'], sea: ['#2a5488', '#3a68a0', '#5a88c0', '#dcecfc'],
    sand: ['#d8d2c4', '#e8e2d6', '#c4bcac'], soil: ['#a8a4a4', '#c8ccd2', '#e4e8ee'],
    oak: [], pine: RAMP.winterPine, bush: ['#1e3e30', '#2e5242', '#3e6652', '#e8f0f8', '#ffffff'],
    flowers: [], snow: true,
  },
};

const CLIFF = { lip: '#3c6a2a', face: ['#5e4a3a', '#7c6650', '#9c8466', '#bca482'], winterLip: '#9fb2c8' };
const STONE: Ramp = ['#4a4440', '#6e6862', '#8e8880', '#b0aaa0', '#d4cec4'];
const TRUNK = ['#3e2616', '#5e3a22', '#7e5232'];

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 땅의 종류 (픽셀 단위)
const G = { GRASS: 0, FOREST: 1, DIRT: 2, WATER: 3, SEA: 4, SAND: 5, SOIL: 6, PLATEAU: 7 } as const;

function groundOf(k: TileKind | null): number {
  switch (k) {
    case 'FOREST':
      return G.FOREST;
    case 'ROAD':
      return G.DIRT;
    case 'WATER':
    case 'BRIDGE':
      return G.WATER;
    case 'SEA':
      return G.SEA;
    case 'SAND':
      return G.SAND;
    case 'FIELD':
      return G.SOIL;
    case 'PEAK':
      return G.PLATEAU;
    default:
      return G.GRASS;
  }
}

// ───────── 땅 ─────────
export function paintFieldGround(m: JourneyMap, country: CountryId, season: Season): HTMLCanvasElement {
  void country;
  const P = PAL[season];
  const S = TILE_PX;
  const GW = m.w * S;
  const GH = m.h * S;
  const tile = (x: number, y: number): TileKind | null => (x < 0 || y < 0 || x >= m.w || y >= m.h ? null : m.tiles[y * m.w + x]);
  const isPath = (k: TileKind | null) => k === 'ROAD' || k === 'BRIDGE';

  // 1) 픽셀마다 땅의 종류 — 경계를 잡음으로 흐트러뜨린다 (산의 고원만은 칸 그대로)
  const cls = new Uint8Array(GW * GH);
  for (let py = 0; py < GH; py++) {
    for (let px = 0; px < GW; px++) {
      const own = tile(Math.floor(px / S), Math.floor(py / S));
      if (own === 'PEAK') {
        cls[py * GW + px] = G.PLATEAU;
        continue;
      }
      const sx = Math.max(0, Math.min(GW - 1, px + (valueNoise(px / 6, py / 6, m.seed + 11) - 0.5) * 7));
      const sy = Math.max(0, Math.min(GH - 1, py + (valueNoise(px / 6, py / 6, m.seed + 23) - 0.5) * 7));
      const tx = Math.floor(sx / S);
      const ty = Math.floor(sy / S);
      const k = tile(tx, ty);
      let c = groundOf(k);
      if (c === G.PLATEAU) c = groundOf(own);
      if (k === 'ROAD') {
        // 흙길은 칸 가운데로 폭 10픽셀, 이웃한 길 쪽으로만 뻗는다
        const lx = sx - tx * S;
        const ly = sy - ty * S;
        const core = lx >= 3 && lx < 13 && ly >= 3 && ly < 13;
        const n = ly < 3 && lx >= 3 && lx < 13 && (isPath(tile(tx, ty - 1)) || ty === 0);
        const so = ly >= 13 && lx >= 3 && lx < 13 && isPath(tile(tx, ty + 1));
        const w = lx < 3 && ly >= 3 && ly < 13 && (isPath(tile(tx - 1, ty)) || tx === 0);
        const e = lx >= 13 && ly >= 3 && ly < 13 && isPath(tile(tx + 1, ty));
        c = core || n || so || w || e ? G.DIRT : G.GRASS;
      }
      cls[py * GW + px] = c;
    }
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GW || y >= GH ? -1 : cls[y * GW + x]);
  const wet = (c: number) => c === G.WATER || c === G.SEA;

  // 2) 색칠
  const img = new ImageData(GW, GH);
  const d = img.data;
  const cache = new Map<string, [number, number, number]>();
  const put = (i: number, hex: string) => {
    let c = cache.get(hex);
    if (!c) {
      c = rgb(hex);
      cache.set(hex, c);
    }
    d[i * 4] = c[0];
    d[i * 4 + 1] = c[1];
    d[i * 4 + 2] = c[2];
    d[i * 4 + 3] = 255;
  };
  const H = (x: number, y: number, k: number) => tileHash(x, y, m.seed + k);

  for (let py = 0; py < GH; py++) {
    for (let px = 0; px < GW; px++) {
      const i = py * GW + px;
      const c = cls[i];
      if (wet(c)) {
        const pal = c === G.SEA ? P.sea : P.water;
        let dist = 4;
        for (let r = 1; r <= 3 && dist === 4; r++) {
          for (let oy = -r; oy <= r && dist === 4; oy++) {
            for (let ox = -r; ox <= r; ox++) {
              const n = at(px + ox, py + oy);
              if (n !== -1 && !wet(n)) {
                dist = r;
                break;
              }
            }
          }
        }
        if (dist === 1) put(i, pal[3]);
        else if (dist === 2) put(i, pal[2]);
        else {
          const v = valueNoise(px / 14, py / 9, m.seed + 41);
          put(i, v < 0.35 ? pal[0] : pal[1]);
          // 물결 줄
          if (H(Math.floor(px / 7), py, 43) < 0.06 && px % 7 < 4) put(i, pal[2]);
        }
        continue;
      }
      // 물가 둔덕 — 바로 아래가 물이면 흙 둔덕
      if (c !== G.PLATEAU && wet(at(px, py + 1))) {
        put(i, P.bank[0]);
        continue;
      }
      if (c !== G.PLATEAU && wet(at(px, py + 2))) {
        put(i, P.bank[1]);
        continue;
      }
      if (c === G.DIRT) {
        const edge = at(px - 1, py) !== G.DIRT || at(px + 1, py) !== G.DIRT || at(px, py - 1) !== G.DIRT || at(px, py + 1) !== G.DIRT;
        if (edge) put(i, P.dirt[0]);
        else {
          const h = H(px, py, 51);
          put(i, h < 0.08 ? P.dirt[1] : h > 0.95 ? P.dirt[3] : P.dirt[2]);
          // 자갈 (2픽셀)
          if (H(Math.floor(px / 5), Math.floor(py / 5), 53) < 0.12 && px % 5 === 2 && py % 5 < 2) put(i, py % 5 === 0 ? P.dirt[3] : P.dirt[1]);
        }
        continue;
      }
      if (c === G.SAND) {
        const h = H(px, py, 61);
        put(i, h < 0.07 ? P.sand[2] : h > 0.93 ? P.sand[1] : P.sand[0]);
        continue;
      }
      if (c === G.SOIL) {
        const row = py % 4;
        put(i, row === 0 ? P.soil[0] : row === 3 ? P.soil[2] : P.soil[1]);
        if ((px % 16 === 0 || py % 16 === 0) && !P.snow) put(i, P.grass[1]);
        continue;
      }
      // 풀밭 (숲 바닥·고원도 같은 결로, 색만 다르게)
      const pal = c === G.FOREST ? P.forest : P.grass;
      const tone = valueNoise(px / 22, py / 22, m.seed + 71);
      let col = tone < 0.33 ? pal[1] : pal[2];
      // 풀포기 — 6×6 칸마다 하나, 「ᐱ」 모양
      const cx = Math.floor(px / 6);
      const cy = Math.floor(py / 6);
      const hh = H(cx, cy, 73);
      if (hh < 0.7) {
        const tx0 = cx * 6 + 1 + Math.floor(H(cx, cy, 74) * 4);
        const ty0 = cy * 6 + 2 + Math.floor(H(cx, cy, 75) * 3);
        const dx = px - tx0;
        const dy = py - ty0;
        if ((dy === 0 && (dx === -1 || dx === 1)) || (dy === -1 && dx === 0)) col = pal[0];
        else if (dy === -2 && dx === 0) col = pal[3];
        else if (dy === -1 && (dx === -1 || dx === 1) && hh < 0.3) col = pal[3];
      }
      if (c === G.PLATEAU && P.snow) col = tone < 0.4 ? P.grass[1] : P.grass[2];
      put(i, col);
    }
  }

  const cv = document.createElement('canvas');
  cv.width = GW;
  cv.height = GH;
  const ctx = cv.getContext('2d')!;
  ctx.putImageData(img, 0, 0);
  const f = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };

  // 3) 땅에 붙은 작은 것들 — 들꽃, 논밭의 곡식
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const k = m.tiles[y * m.w + x];
      const ox = x * S;
      const oy = y * S;
      const r = H(x, y, 101);
      if ((k === 'PLAIN' || k === 'HILL') && P.flowers.length && r < 0.3) {
        const fc = P.flowers[Math.floor(H(x, y, 102) * P.flowers.length)];
        const n = 2 + Math.floor(H(x, y, 103) * 3);
        for (let i = 0; i < n; i++) {
          const fx = ox + 2 + Math.floor(H(x + i, y, 104) * 12);
          const fy = oy + 3 + Math.floor(H(x, y + i, 105) * 11);
          if (cls[fy * GW + fx] !== G.GRASS) continue;
          f(fx, fy + 1, 1, 1, P.grass[0]);
          f(fx, fy, 1, 1, fc);
          f(fx + 1, fy, 1, 1, fc);
          f(fx, fy - 1, 1, 1, fc);
          f(fx - 1, fy, 1, 1, fc);
          f(fx, fy, 1, 1, '#fff6c8');
        }
      } else if (k === 'FIELD' && P.crop) {
        for (let cy2 = 2; cy2 < 16; cy2 += 4) {
          for (let cx2 = 2; cx2 < 16; cx2 += 4) {
            const px = ox + cx2;
            const py = oy + cy2;
            if (season === 'AUTUMN') {
              f(px, py - 2, 1, 3, P.crop[0]);
              f(px + 1, py - 3, 1, 3, P.crop[1]);
              f(px - 1, py - 1, 1, 2, P.crop[0]);
            } else if (season === 'SUMMER') {
              f(px, py - 2, 2, 3, P.crop[0]);
              f(px, py - 2, 1, 1, P.crop[1]);
            } else {
              f(px, py - 1, 1, 2, P.crop[0]);
              f(px + 1, py - 1, 1, 1, P.crop[1]);
            }
          }
        }
      }
    }
  }

  // 4) 다리 — 나무 판자, 난간 기둥
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (tile(x, y) !== 'BRIDGE') continue;
      const ox = x * S;
      const oy = y * S;
      const horiz = isPath(tile(x - 1, y)) || isPath(tile(x + 1, y)) || !(isPath(tile(x, y - 1)) || isPath(tile(x, y + 1)));
      if (horiz) {
        f(ox - 3, oy + 3, S + 6, 11, '#5a3a22');
        for (let i = -3; i < S + 3; i += 3) {
          f(ox + i, oy + 4, 2, 9, '#b07c48');
          f(ox + i, oy + 4, 2, 1, '#d09c62');
        }
        f(ox - 3, oy + 2, S + 6, 1, '#7a5232');
        f(ox - 3, oy + 14, S + 6, 2, 'rgba(20,30,60,0.35)');
        for (const px of [ox - 2, ox + 7, ox + 15]) {
          f(px, oy, 2, 4, '#7a5232');
          f(px, oy + 11, 2, 4, '#7a5232');
        }
      } else {
        f(ox + 2, oy - 3, 12, S + 6, '#5a3a22');
        for (let i = -3; i < S + 3; i += 3) {
          f(ox + 3, oy + i, 10, 2, '#b07c48');
          f(ox + 3, oy + i, 10, 1, '#d09c62');
        }
        f(ox + 14, oy - 3, 2, S + 6, 'rgba(20,30,60,0.35)');
      }
    }
  }

  // 5) 산 — 고원의 테두리와 바위 절벽
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (tile(x, y) !== 'PEAK') continue;
      const ox = x * S;
      const oy = y * S;
      const south = tile(x, y + 1);
      const lip = P.snow ? CLIFF.winterLip : CLIFF.lip;
      // 옆으로 고원이 끝나면 가장자리를 어둡게
      if (tile(x - 1, y) && tile(x - 1, y) !== 'PEAK') f(ox, oy, 1, S, lip);
      if (tile(x + 1, y) && tile(x + 1, y) !== 'PEAK') f(ox + S - 1, oy, 1, S, lip);
      if (tile(x, y - 1) && tile(x, y - 1) !== 'PEAK') f(ox, oy, S, 1, lip);
      if (!south || south === 'PEAK') continue;
      // 남쪽이 트였다 — 칸 아래쪽 10픽셀이 절벽
      const top = oy + 6;
      for (let px = 0; px < S; px++) {
        const band = Math.floor(H(x * S + px, y, 111) * 3);
        const colBase = (Math.floor((x * S + px) / 3) + y) % 3 === 0 ? CLIFF.face[1] : CLIFF.face[2];
        for (let py = 0; py < 10; py++) {
          let col = colBase;
          if (py === 9) col = CLIFF.face[0];
          else if ((py + band) % 4 === 0) col = CLIFF.face[1];
          else if (px % 5 === 0 && H(x * S + px, py, 113) < 0.6) col = CLIFF.face[3];
          f(ox + px, top + py, 1, 1, col);
        }
        // 절벽 위로 늘어진 풀
        f(ox + px, top - 1, 1, 1, lip);
        if (H(x * S + px, y, 115) < 0.35) f(ox + px, top, 1, 1 + Math.floor(H(px, y, 116) * 2), lip);
      }
      f(ox, oy + S, S, 2, 'rgba(30,20,10,0.25)');
    }
  }
  return cv;
}

// ───────── 서 있는 것들 — 줄마다 따로 ─────────
// 줄 r의 그림은 y = r*16 - ROW_UP 부터 높이 ROW_H. 나무 꼭대기가 두 칸 위까지 솟는다.
export const ROW_UP = 40;
const ROW_H = ROW_UP + TILE_PX + 4;

export interface FieldRow {
  canvas: HTMLCanvasElement | null; // 서 있는 것이 없는 줄은 null
  y: number;
}

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  ctx.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy) + 0.35);
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

// 활엽수 — 덩어리 몇 개를 겹쳐 둥근 수관, 위 왼쪽이 밝다
function drawOak(ctx: CanvasRenderingContext2D, bx: number, by: number, ramp: Ramp, seed: number) {
  ctx.fillStyle = 'rgba(20,30,10,0.28)';
  for (let i = -1; i <= 1; i++) ctx.fillRect(bx - 8 + Math.abs(i), by - 1 + i, 17 - Math.abs(i) * 2, 1);
  // 줄기와 뿌리
  ctx.fillStyle = TRUNK[1];
  ctx.fillRect(bx - 2, by - 11, 5, 11);
  ctx.fillStyle = TRUNK[2];
  ctx.fillRect(bx - 2, by - 11, 1, 10);
  ctx.fillStyle = TRUNK[0];
  ctx.fillRect(bx + 2, by - 11, 1, 11);
  ctx.fillRect(bx - 3, by - 1, 1, 1);
  ctx.fillRect(bx + 3, by - 1, 1, 1);
  const s = (k: number) => tileHash(seed, k, 7);
  const blobs: Array<[number, number, number]> = [
    [0, -19, 9],
    [-7, -15, 6],
    [7, -15, 6],
    [-4, -24, 6],
    [5, -24, 5],
    [0, -12, 6],
  ].map(([x, y, r]) => [x + Math.round((s(x + 10) - 0.5) * 2), y + Math.round((s(y + 50) - 0.5) * 2), r] as [number, number, number]);
  blobs.forEach(([x, y, r]) => blob(ctx, bx + x, by + y, r + 1, ramp[0]));
  blobs.forEach(([x, y, r]) => blob(ctx, bx + x, by + y, r, ramp[1]));
  blobs.forEach(([x, y, r]) => blob(ctx, bx + x - 1, by + y - 1, r - 1, ramp[2]));
  blobs.forEach(([x, y, r]) => blob(ctx, bx + x - 2, by + y - 3, Math.max(1, r - 4), ramp[3]));
  // 반짝이는 잎과 그늘 점
  for (let i = 0; i < 9; i++) {
    const [x, y, r] = blobs[i % blobs.length];
    const ax = bx + x + Math.round((s(i + 100) - 0.6) * r);
    const ay = by + y + Math.round((s(i + 200) - 0.6) * r);
    ctx.fillStyle = i % 3 === 0 ? ramp[4] : ramp[1];
    ctx.fillRect(ax, ay, 1, 1);
  }
}

// 겨울 활엽수 — 잎 진 가지에 눈
function drawBareTree(ctx: CanvasRenderingContext2D, bx: number, by: number, seed: number) {
  ctx.fillStyle = 'rgba(40,50,70,0.22)';
  ctx.fillRect(bx - 7, by - 1, 15, 2);
  ctx.fillStyle = TRUNK[1];
  ctx.fillRect(bx - 2, by - 14, 4, 14);
  ctx.fillStyle = TRUNK[0];
  ctx.fillRect(bx + 1, by - 14, 1, 14);
  const branch = (x: number, y: number, dx: number, len: number) => {
    for (let i = 0; i < len; i++) {
      ctx.fillStyle = TRUNK[i < 2 ? 1 : 0];
      ctx.fillRect(x + dx * i, y - i, 1, 1);
      if (i % 2 === 1) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + dx * i, y - i - 1, 1, 1);
      }
    }
  };
  const s = (k: number) => tileHash(seed, k, 9);
  branch(bx - 1, by - 13, -1, 7 + Math.floor(s(1) * 3));
  branch(bx + 1, by - 14, 1, 8 + Math.floor(s(2) * 3));
  branch(bx, by - 16, -1, 5);
  branch(bx, by - 17, 1, 6);
  branch(bx - 4, by - 18, -1, 3);
  branch(bx + 5, by - 19, 1, 3);
  ctx.fillStyle = TRUNK[1];
  ctx.fillRect(bx - 1, by - 22, 2, 8);
}

// 소나무 — 겹겹의 삼각 층
function drawPine(ctx: CanvasRenderingContext2D, bx: number, by: number, ramp: Ramp, h: number) {
  ctx.fillStyle = 'rgba(20,30,10,0.28)';
  ctx.fillRect(bx - 6, by - 1, 13, 2);
  ctx.fillStyle = TRUNK[1];
  ctx.fillRect(bx - 1, by - 5, 3, 5);
  const tiers = 3;
  const tierH = Math.floor(h / tiers);
  for (let t = 0; t < tiers; t++) {
    const topY = by - 4 - h + t * tierH - 2;
    const baseW = 4 + t * 2;
    for (let i = 0; i <= tierH + 3; i++) {
      const w = Math.round(((i + 1) / (tierH + 4)) * baseW) + 1;
      const yy = topY + i;
      ctx.fillStyle = ramp[0];
      ctx.fillRect(bx - w - 1, yy, w * 2 + 3, 1);
      ctx.fillStyle = ramp[1];
      ctx.fillRect(bx - w, yy, w * 2 + 1, 1);
      ctx.fillStyle = ramp[2];
      ctx.fillRect(bx - w, yy, w + 1, 1);
      ctx.fillStyle = ramp[3];
      ctx.fillRect(bx - w, yy, Math.max(1, Math.floor(w / 2)), 1);
      if (i === 0 || (i === 1 && ramp === RAMP.winterPine)) {
        ctx.fillStyle = ramp[4];
        ctx.fillRect(bx - w + 1, yy, Math.max(1, w), 1);
      }
    }
  }
}

function drawBush(ctx: CanvasRenderingContext2D, bx: number, by: number, ramp: Ramp, berries: string | null) {
  ctx.fillStyle = 'rgba(20,30,10,0.25)';
  ctx.fillRect(bx - 5, by - 1, 11, 2);
  blob(ctx, bx, by - 4, 5, ramp[0]);
  blob(ctx, bx, by - 4, 4, ramp[1]);
  blob(ctx, bx - 1, by - 5, 3, ramp[2]);
  blob(ctx, bx - 2, by - 6, 1, ramp[3]);
  if (ramp[4] === '#ffffff') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - 3, by - 9, 6, 2);
    ctx.fillRect(bx - 4, by - 7, 2, 1);
  }
  if (berries) {
    ctx.fillStyle = berries;
    ctx.fillRect(bx + 2, by - 5, 1, 1);
    ctx.fillRect(bx - 2, by - 3, 1, 1);
    ctx.fillRect(bx + 1, by - 2, 1, 1);
  }
}

function drawBoulder(ctx: CanvasRenderingContext2D, bx: number, by: number, r: number, snow: boolean, moss: boolean) {
  ctx.fillStyle = 'rgba(20,20,20,0.25)';
  ctx.fillRect(bx - r - 1, by - 1, r * 2 + 3, 2);
  blob(ctx, bx, by - r, r + 1, STONE[0]);
  blob(ctx, bx, by - r, r, STONE[1]);
  blob(ctx, bx - 1, by - r - 1, r - 1, STONE[2]);
  blob(ctx, bx - 2, by - r - 2, Math.max(1, r - 3), STONE[3]);
  ctx.fillStyle = STONE[4];
  ctx.fillRect(bx - 2, by - r * 2 + 1, 2, 1);
  if (snow) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - r + 1, by - r * 2, r * 2 - 1, 2);
  } else if (moss) {
    ctx.fillStyle = '#5a8a34';
    ctx.fillRect(bx - r + 1, by - r * 2 + 1, r, 1);
    ctx.fillRect(bx - r, by - r * 2 + 2, 2, 1);
  }
}

function drawCattails(ctx: CanvasRenderingContext2D, ox: number, oy: number, seed: number, snow: boolean) {
  for (let i = 0; i < 5; i++) {
    const x = ox + 2 + Math.floor(tileHash(seed, i, 13) * 12);
    const y = oy + 8 + Math.floor(tileHash(seed, i, 14) * 7);
    const h = 5 + Math.floor(tileHash(seed, i, 15) * 4);
    ctx.fillStyle = snow ? '#8a9a7a' : '#4a7a2a';
    ctx.fillRect(x, y - h, 1, h);
    ctx.fillStyle = snow ? '#a8b898' : '#6a9a3a';
    ctx.fillRect(x + 1, y - h + 3, 1, 2);
    ctx.fillStyle = '#6a3e1e';
    ctx.fillRect(x, y - h - 2, 1, 3);
    if (snow) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y - h - 3, 1, 1);
    }
  }
}

// 집 — 판자벽, 창의 불빛, 겹겹 기와(또는 초가) 지붕
function drawHouse(ctx: CanvasRenderingContext2D, ox: number, oy: number, country: CountryId, hall: boolean, r: number, snow: boolean) {
  const f = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, w, h);
  };
  const thatch = country === 'KOREA' && !hall && r < 0.5;
  const roof: [string, string, string, string] = hall
    ? country === 'CHINA'
      ? ['#7a4a12', '#a8701c', '#cc9a2a', '#e8c05a']
      : country === 'JAPAN'
      ? ['#2a2622', '#3e3630', '#54483e', '#6e5e50']
      : ['#1e4a40', '#2e6a5a', '#3e8a74', '#5aa890']
    : thatch
    ? ['#7a5228', '#a8783a', '#c89a52', '#e0bc72']
    : country === 'CHINA'
    ? ['#2e3640', '#424e5c', '#586878', '#7a8a9a']
    : country === 'JAPAN'
    ? ['#3a302c', '#54463e', '#6e5c50', '#8a7464']
    : ['#3a4256', '#4e5a74', '#66748e', '#8494ac'];
  const wall = hall ? ['#e8dcc0', '#c8b898'] : country === 'CHINA' ? ['#c0583e', '#9a4230'] : country === 'JAPAN' ? ['#9a7652', '#7a5a3e'] : ['#efe6d0', '#cfc2a4'];
  // 그림자
  ctx.fillStyle = 'rgba(20,20,10,0.28)';
  ctx.fillRect(ox + 1, oy + 15, 16, 2);
  // 벽
  f(1, 7, 14, 9, '#5a3a22');
  f(2, 7, 12, 8, wall[0]);
  for (let y = 9; y < 15; y += 3) f(2, y, 12, 1, wall[1]);
  if (country === 'KOREA' || hall) {
    f(2, 7, 1, 8, '#7a5232');
    f(13, 7, 1, 8, '#7a5232');
  }
  if (hall) {
    for (const x of [3, 7, 8, 12]) f(x, 8, 1, 7, '#b02a1e');
  } else {
    // 창과 문
    f(3, 9, 4, 3, '#5a3a22');
    f(4, 10, 2, 1, country === 'JAPAN' ? '#efe8d8' : '#f8d878');
    f(9, 10, 4, 5, '#5a3a22');
    f(10, 10, 2, 5, '#7e5232');
    f(11, 12, 1, 1, '#d8b060');
  }
  // 지붕 — 위가 좁고 처마가 넓다
  const rows = 11;
  for (let i = 0; i < rows; i++) {
    const y = -5 + i;
    const half = Math.min(9, 4 + Math.round(i * 0.6));
    const x0 = 8 - half;
    const w = half * 2;
    const band = Math.floor(i / 2) % 2 === 0;
    let col = band ? roof[2] : roof[1];
    if (i === rows - 1) col = roof[0];
    if (snow && i < rows - 3) col = i % 2 === 0 ? '#ffffff' : '#e4ecf6';
    f(x0 - 1, y, 1, 1, roof[0]);
    f(x0 + w, y, 1, 1, roof[0]);
    f(x0, y, w, 1, col);
    if (!snow && !thatch && i < rows - 1 && i % 2 === 1) {
      // 기와 골
      for (let x = x0 + 1; x < x0 + w; x += 3) f(x, y, 1, 1, roof[0]);
    }
    if (!snow) f(x0, y, 1, 1, roof[3]);
  }
  f(4, -6, 8, 1, roof[0]);
  f(5, -6, 6, 1, snow ? '#ffffff' : roof[3]);
  // 처마 끝이 들린 기와 (조선·청 기와집과 전각)
  if (!thatch && country !== 'JAPAN') {
    f(-2, 3, 2, 1, roof[1]);
    f(16, 3, 2, 1, roof[1]);
    f(-2, 2, 1, 1, roof[0]);
    f(17, 2, 1, 1, roof[0]);
  }
  f(0, 6, 16, 1, 'rgba(20,10,0,0.35)');
}

export function paintFieldObjects(m: JourneyMap, country: CountryId, season: Season): FieldRow[] {
  const P = PAL[season];
  const S = TILE_PX;
  const rows: FieldRow[] = [];
  for (let y = 0; y < m.h; y++) {
    let cv: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    const top = y * S - ROW_UP;
    const get = () => {
      if (!ctx) {
        cv = document.createElement('canvas');
        cv.width = m.w * S + 8;
        cv.height = ROW_H;
        ctx = cv.getContext('2d')!;
        ctx.translate(0, -top);
      }
      return ctx;
    };
    for (let x = 0; x < m.w; x++) {
      const k = m.tiles[y * m.w + x];
      const ox = x * S;
      const oy = y * S;
      const r = tileHash(x, y, m.seed + 201);
      const seed = x * 131 + y * 17 + m.seed;
      const jx = Math.round((tileHash(x, y, m.seed + 203) - 0.5) * 4);
      if (k === 'FOREST') {
        const c = get();
        const pine = r < (season === 'WINTER' ? 0.6 : 0.4);
        if (pine) drawPine(c, ox + 8 + jx, oy + 15, P.pine, 22 + Math.floor(r * 10));
        else if (P.snow) drawBareTree(c, ox + 8 + jx, oy + 15, seed);
        else drawOak(c, ox + 8 + jx, oy + 15, P.oak[Math.floor(tileHash(x, y, m.seed + 205) * P.oak.length)], seed);
      } else if (k === 'PLAIN' || k === 'HILL') {
        const lone = k === 'PLAIN' ? 0.955 : 0.9;
        if (r > lone) {
          const c = get();
          if (P.snow) drawBareTree(c, ox + 8 + jx, oy + 15, seed);
          else drawOak(c, ox + 8 + jx, oy + 15, P.oak[Math.floor(tileHash(x, y, m.seed + 206) * P.oak.length)], seed);
        } else if (r < (k === 'HILL' ? 0.22 : 0.07)) {
          drawBush(get(), ox + 5 + Math.floor(r * 40), oy + 13, P.bush, season === 'SUMMER' ? '#e04848' : season === 'AUTUMN' ? '#7a3aa8' : null);
        } else if (r > (k === 'HILL' ? 0.84 : 0.92)) {
          drawBoulder(get(), ox + 4 + Math.floor((r - 0.84) * 40), oy + 13, 2, P.snow, !P.snow);
        }
      } else if (k === 'REED') {
        drawCattails(get(), ox, oy, seed, P.snow);
      } else if (k === 'ROCK') {
        const c = get();
        drawBoulder(c, ox + 5, oy + 12, 4, P.snow, r < 0.4 && !P.snow);
        drawBoulder(c, ox + 12, oy + 15, 3, P.snow, false);
      } else if (k === 'PEAK') {
        // 고원의 나무와 바위 — 절벽 쪽 칸(남쪽이 트인 칸)은 비워 둔다
        const south = y + 1 < m.h ? m.tiles[(y + 1) * m.w + x] : 'PEAK';
        if (south !== 'PEAK') continue;
        if (r < 0.5) drawPine(get(), ox + 8 + jx, oy + 14, P.pine, 18 + Math.floor(r * 12));
        else if (r < 0.62) drawBoulder(get(), ox + 8, oy + 12, 3, P.snow, !P.snow);
      } else if (k === 'HOUSE' || k === 'HALL') {
        drawHouse(get(), ox, oy, country, k === 'HALL', r, P.snow);
      } else if (k === 'SAND' && r < 0.08) {
        // 조개껍데기
        const c = get();
        c.fillStyle = '#f8e8e0';
        c.fillRect(ox + 6, oy + 10, 2, 1);
        c.fillStyle = '#e0a8a0';
        c.fillRect(ox + 6, oy + 11, 2, 1);
      }
    }
    rows.push({ canvas: cv, y: top });
  }
  return rows;
}

// ───────── 안개 (아직 밟지 않은 땅) ─────────
export function paintFieldFog(m: JourneyMap, visited: Set<string>): HTMLCanvasElement {
  const S = TILE_PX;
  const GW = m.w * S;
  const GH = m.h * S;
  const img = new ImageData(GW, GH);
  const d = img.data;
  const known = (x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || visited.has(m.zones[m.zone[y * m.w + x]].legId);
  for (let py = 0; py < GH; py++) {
    for (let px = 0; px < GW; px++) {
      const sx = px + (valueNoise(px / 9, py / 9, m.seed + 301) - 0.5) * 12;
      const sy = py + (valueNoise(px / 9, py / 9, m.seed + 307) - 0.5) * 12;
      if (known(Math.floor(sx / S), Math.floor(sy / S))) continue;
      const i = (py * GW + px) * 4;
      d[i] = 22;
      d[i + 1] = 18;
      d[i + 2] = 38;
      d[i + 3] = 140;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = GW;
  cv.height = GH;
  cv.getContext('2d')!.putImageData(img, 0, 0);
  return cv;
}

// ───────── 장소 스프라이트 (도트 p배, 칸 아래 가운데가 바닥) ─────────
const LINE = '#3a2a22';

export function drawPoiSprite(ctx: CanvasRenderingContext2D, kind: JourneyPoiKind, cx: number, by: number, p: number, country: CountryId, done: boolean, now: number) {
  const ox = Math.round(cx - 8 * p);
  const oy = Math.round(by - 16 * p);
  const R = (x: number, y: number, w: number, h: number, c: string) => pxRect(ctx, ox, oy, x, y, w, h, c, p);
  const blink = Math.floor(now / 300) % 2 === 0;
  ctx.save();
  if (done) ctx.globalAlpha = 0.55;
  R(2, 15, 12, 2, 'rgba(20,20,10,0.28)');
  switch (kind) {
    case 'INN': {
      // 주막 — 초가, 술 깃발, 등불, 평상
      R(1, 7, 14, 9, LINE);
      R(2, 7, 12, 8, '#efe2c4');
      R(2, 10, 12, 1, '#d4c49e');
      R(2, 13, 12, 1, '#d4c49e');
      R(6, 10, 3, 5, '#6a4228');
      R(10, 9, 3, 2, blink ? '#ffd860' : '#f0b040');
      for (let i = 0; i < 8; i++) {
        const half = 5 + Math.round(i * 0.5);
        R(8 - half - 1, 0 + i, half * 2 + 2, 1, LINE);
        R(8 - half, 0 + i, half * 2, 1, i % 2 ? '#c89a52' : '#e0bc72');
      }
      R(3, -1, 10, 1, '#a8783a');
      R(14, -7, 1, 22, '#5a3a22');
      R(15, -7, 4, 7, '#c8382c');
      R(15, -7, 4, 1, '#e8584a');
      R(16, -5, 2, 1, '#fff0c8');
      R(16, -3, 2, 1, '#fff0c8');
      R(-2, 12, 3, 1, '#8a5a32');
      R(-2, 13, 1, 2, '#5a3a22');
      break;
    }
    case 'MASTER': {
      // 은자의 띠집 — 굴뚝 연기
      R(3, 8, 10, 8, LINE);
      R(4, 8, 8, 7, '#c8b088');
      R(4, 11, 8, 1, '#a8906a');
      R(7, 10, 2, 5, '#3a2818');
      for (let i = 0; i < 7; i++) {
        const half = 3 + i;
        R(8 - half - 1, 1 + i, half * 2 + 2, 1, LINE);
        R(8 - half, 1 + i, half * 2, 1, i % 2 ? '#8a6a40' : '#a8845a');
      }
      R(11, -1, 2, 4, '#6a5a4a');
      const ph = Math.floor(now / 250) % 3;
      R(12 + (ph === 1 ? 1 : 0), -3 - ph, 2, 2, 'rgba(240,244,248,0.85)');
      R(11 - (ph === 2 ? 1 : 0), -6 - ph, 3, 2, 'rgba(240,244,248,0.55)');
      break;
    }
    case 'TREASURE': {
      // 보물 상자
      R(3, 8, 10, 8, LINE);
      R(4, 9, 8, 6, '#a8642c');
      R(4, 9, 8, 1, '#c88040');
      R(4, 11, 8, 1, '#e0b048');
      R(7, 10, 2, 3, '#f8d878');
      R(3, 5, 10, 4, LINE);
      R(4, 6, 8, 2, '#c07a38');
      R(4, 6, 8, 1, '#d89650');
      if (!done) {
        const s = Math.floor(now / 200) % 4;
        const sx = s < 2 ? 12 : 2;
        R(sx, 1 + (s % 2), 1, 3, '#fff6c0');
        R(sx - 1, 2 + (s % 2), 3, 1, '#fff6c0');
      }
      break;
    }
    case 'SHRINE': {
      if (country === 'JAPAN') {
        // 도리이
        R(2, 3, 2, 13, '#c0302a');
        R(2, 3, 1, 13, '#e05040');
        R(12, 3, 2, 13, '#c0302a');
        R(12, 3, 1, 13, '#e05040');
        R(-1, 1, 18, 2, LINE);
        R(0, 1, 16, 1, '#d8402e');
        R(1, 5, 14, 1, '#c0302a');
        R(6, 10, 4, 5, '#8a7a6a');
        R(6, 10, 4, 1, '#a89888');
        R(5, 9, 6, 1, '#5a4a3e');
      } else {
        // 작은 전각과 석등
        R(3, 9, 10, 7, LINE);
        R(4, 9, 8, 6, '#e8dcc0');
        R(4, 9, 1, 6, '#b52a20');
        R(11, 9, 1, 6, '#b52a20');
        R(7, 11, 2, 4, '#6a4228');
        for (let i = 0; i < 6; i++) {
          const half = 3 + i;
          R(8 - half - 1, 3 + i, half * 2 + 2, 1, '#1e4a40');
          R(8 - half, 3 + i, half * 2, 1, i % 2 ? '#2e6a5a' : '#3e8a74');
        }
        R(-1, 7, 2, 1, '#2e6a5a');
        R(15, 7, 2, 1, '#2e6a5a');
        R(7, 0, 2, 3, '#d0a840');
      }
      break;
    }
    case 'VISTA': {
      // 대오의 자리 — 빛기둥이 서린 바위
      const glow = blink ? 'rgba(255,236,150,0.5)' : 'rgba(255,236,150,0.32)';
      R(6, -12, 4, 24, glow);
      R(7, -16, 2, 4, glow);
      R(2, 7, 12, 9, '#4a4440');
      R(3, 8, 10, 7, '#8e8880');
      R(3, 8, 5, 3, '#b0aaa0');
      R(4, 3, 8, 5, '#4a4440');
      R(5, 4, 6, 4, '#8e8880');
      R(5, 4, 3, 2, '#b0aaa0');
      R(7, 1 + (blink ? 0 : 1), 2, 2, '#fff2a8');
      break;
    }
    case 'HISTORY': {
      // 시대의 현장 — 깃발과 막사
      R(0, 8, 10, 8, LINE);
      R(1, 9, 8, 6, '#efe2c4');
      R(4, 11, 2, 4, '#6a4228');
      for (let i = 0; i < 4; i++) R(-1 + i, 5 + i, 12 - i * 2, 1, i % 2 ? '#a83a2c' : '#c84a38');
      R(12, -3, 1, 19, '#5a3a22');
      const w = blink ? 0 : 1;
      R(13, -3, 4 - w, 3, '#d8402e');
      R(13, 0, 3 + w, 2, '#a83a2c');
      R(13, -3, 4 - w, 1, '#f06050');
      R(10, 2, 1, 14, '#5a3a22');
      R(7, 2, 3, 2, '#e8c040');
      break;
    }
    case 'ECHO': {
      // 돌아온 인연 — 보랏빛 넋
      const f = Math.floor(now / 180) % 4;
      R(5, 3 - (f % 2), 6, 10, 'rgba(192,132,252,0.4)');
      R(6, 4 - (f % 2), 4, 8, 'rgba(216,180,254,0.85)');
      R(7, 2 - (f % 2), 2, 2, '#f5e8ff');
      R(4, 12, 8, 4, '#4a3e4a');
      R(5, 12, 6, 3, '#7a6a7a');
      R(5, 12, 6, 1, '#9a8a9a');
      break;
    }
    case 'PEOPLE':
    default: {
      ctx.restore();
      ctx.save();
      if (done) ctx.globalAlpha = 0.55;
      drawTopDownChar(ctx, { x: cx, y: by - 3 * p, p, dir: 'DOWN', walkFrame: 0, role: 'MERCHANT', country, now });
      break;
    }
  }
  ctx.restore();
}

// 아직 들르지 않은 장소 머리 위의 「!」 — 글자 대신 도트로
export function drawPoiAlert(ctx: CanvasRenderingContext2D, cx: number, topY: number, p: number, now: number) {
  const bob = Math.round(Math.sin(now / 200) * 1.5);
  const ox = Math.round(cx - 3 * p);
  const oy = Math.round(topY - 10 * p + bob * p);
  pxRect(ctx, ox, oy, 0, 0, 6, 8, LINE, p);
  pxRect(ctx, ox, oy, 1, 1, 4, 6, '#fff8e0', p);
  pxRect(ctx, ox, oy, 2, 1, 2, 3, '#e07a10', p);
  pxRect(ctx, ox, oy, 2, 5, 2, 1, '#e07a10', p);
  pxRect(ctx, ox, oy, 2, 8, 2, 1, LINE, p);
}

// 도장으로 이어지는 길목 — 나무 이정표
export function drawEntranceSprite(ctx: CanvasRenderingContext2D, cx: number, by: number, p: number) {
  const ox = Math.round(cx - 8 * p);
  const oy = Math.round(by - 16 * p);
  const R = (x: number, y: number, w: number, h: number, c: string) => pxRect(ctx, ox, oy, x, y, w, h, c, p);
  R(5, 15, 6, 2, 'rgba(20,20,10,0.28)');
  R(7, 2, 2, 14, '#5a3a22');
  R(7, 2, 1, 14, '#7e5232');
  R(2, 3, 12, 6, LINE);
  R(3, 4, 10, 4, '#b8864e');
  R(3, 4, 10, 1, '#d4a26a');
  // ← 화살표 (도장 쪽)
  R(5, 6, 6, 1, '#5a3a22');
  R(6, 5, 1, 3, '#5a3a22');
}

// 주인공 (4방향 도트 캐릭터)
export function drawFieldHero(
  ctx: CanvasRenderingContext2D,
  cx: number,
  by: number,
  p: number,
  dir: 'L' | 'R' | 'U' | 'D',
  frame: number,
  o: { country: CountryId; gender: 'MALE' | 'FEMALE'; age: number; oneArm: boolean; now: number }
) {
  drawTopDownChar(ctx, {
    x: cx,
    y: by - 3 * p,
    p,
    dir: dir === 'L' ? 'LEFT' : dir === 'R' ? 'RIGHT' : dir === 'U' ? 'UP' : 'DOWN',
    walkFrame: frame,
    role: 'HERO',
    country: o.country,
    gender: o.gender,
    age: o.age,
    oneArm: o.oneArm,
    now: o.now,
  });
}
