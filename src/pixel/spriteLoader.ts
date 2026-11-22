// 32비트 멀티프레임 그리드 스프라이트 시트 정밀 슬라이서 + 크로마키 & 블랙키 가산합성 VFX 엔진

export interface ProcessedSprite {
  canvas: HTMLCanvasElement;
  flashCanvas: HTMLCanvasElement;
  ghostCanvas?: HTMLCanvasElement; // 고속 보법·연마 잔상(Afterimage) 전용 캐시
  width: number;
  height: number;
  anchorX: number; // 몸통·하체 무게중심 X (칼을 앞으로 길게 뻗어도 발 축이 뒤로 안 밀림!)
}

export interface SpriteSheet {
  frames: ProcessedSprite[];
  refHeight: number; // Frame 0 기준 높이 (포즈 전환 시 캐릭터 크기 점프 방지!)
}

export interface VfxSheet {
  frames: HTMLCanvasElement[];
}

const spriteCache = new Map<string, ProcessedSprite>();
const sheetCache = new Map<string, SpriteSheet>();
const vfxCache = new Map<string, VfxSheet>();
const imageCache = new Map<string, HTMLImageElement>();
const loadingSingle = new Set<string>();
const loadingSheet = new Set<string>();
const loadingVfx = new Set<string>();

export function loadRawImage(src: string): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  imageCache.set(src, img);
  return null;
}

function isGreenKey(r: number, g: number, b: number): boolean {
  return g > 110 && g - r > 32 && g - b > 32;
}

function chromaClear(ctx: CanvasRenderingContext2D, W: number, H: number): ImageData {
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  const visited = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;

  const tryPush = (x: number, y: number) => {
    const idx = y * W + x;
    if (visited[idx]) return;
    const p = idx * 4;
    if (isGreenKey(d[p], d[p + 1], d[p + 2])) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < W; x++) {
    tryPush(x, 0);
    tryPush(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    tryPush(0, y);
    tryPush(W - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    d[idx * 4 + 3] = 0;
    const x = idx % W;
    const y = (idx - x) / W;
    if (x > 0) tryPush(x - 1, y);
    if (x < W - 1) tryPush(x + 1, y);
    if (y > 0) tryPush(x, y - 1);
    if (y < H - 1) tryPush(x, y + 1);
  }

  // 내부 닫힌 녹색 틈(다리/팔 사이) 제거 + 1px 녹색 경계 Despill
  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    if (d[p + 3] === 0) continue;
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    if (g > 175 && r < 95 && b < 95) {
      d[p + 3] = 0;
      continue;
    }
    if (g > Math.max(r, b) + 16) {
      d[p + 1] = Math.round((r + b) * 0.5);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return imgData;
}

function removeDetachedFragments(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number
): ImageData {
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  const labels = new Int32Array(W * H);
  const compSizes: number[] = [0];
  let curLabel = 0;
  const queue = new Int32Array(W * H);

  for (let i = 0; i < W * H; i++) {
    if (d[i * 4 + 3] <= 25 || labels[i] !== 0) continue;
    curLabel++;
    let head = 0;
    let tail = 0;
    labels[i] = curLabel;
    queue[tail++] = i;
    let count = 0;

    while (head < tail) {
      const idx = queue[head++];
      count++;
      const x = idx % W;
      const y = (idx - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const nIdx = ny * W + nx;
          if (labels[nIdx] === 0 && d[nIdx * 4 + 3] > 25) {
            labels[nIdx] = curLabel;
            queue[tail++] = nIdx;
          }
        }
      }
    }
    compSizes.push(count);
  }

  // 가장 큰 덩어리(캐릭터 본체) 기준으로 2.5% 미만인 미세 분리 노이즈만 제거 (의도된 혈흔/검기 보존)
  const maxComp = Math.max(...compSizes);
  if (maxComp > 0) {
    for (let i = 0; i < W * H; i++) {
      const lb = labels[i];
      if (lb > 0 && compSizes[lb] < maxComp * 0.025) {
        d[i * 4 + 3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }
  return imgData;
}

function trimRect(
  sourceCanvas: HTMLCanvasElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  withGhost = false
): ProcessedSprite {
  const sliceW = Math.max(1, x1 - x0 + 1);
  const sliceH = Math.max(1, y1 - y0 + 1);
  const temp = document.createElement('canvas');
  temp.width = sliceW;
  temp.height = sliceH;
  const tempCtx = temp.getContext('2d', { willReadFrequently: true })!;
  tempCtx.imageSmoothingEnabled = false;
  tempCtx.drawImage(sourceCanvas, x0, y0, sliceW, sliceH, 0, 0, sliceW, sliceH);

  const cleanData = removeDetachedFragments(tempCtx, sliceW, sliceH);
  const cd = cleanData.data;

  let minX = sliceW;
  let maxX = 0;
  let minY = sliceH;
  let maxY = 0;

  for (let y = 0; y < sliceH; y++) {
    for (let x = 0; x < sliceW; x++) {
      if (cd[(y * sliceW + x) * 4 + 3] > 25) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) {
    minX = 0; maxX = sliceW - 1; minY = 0; maxY = sliceH - 1;
  }

  const cw = Math.max(1, maxX - minX + 1);
  const ch = Math.max(1, maxY - minY + 1);

  // 하체·몸통(아래쪽 55% 구간)의 불투명 픽셀 무게중심 X를 계산 → 칼이 앞으로 길게 뻗어도 발 축 고정!
  const lowerStartY = minY + Math.floor(ch * 0.45);
  let sumX = 0;
  let countLower = 0;
  for (let y = lowerStartY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (cd[(y * sliceW + x) * 4 + 3] > 25) {
        sumX += x - minX;
        countLower++;
      }
    }
  }
  const anchorX = countLower > 0 ? sumX / countLower : cw / 2;

  const trimmed = document.createElement('canvas');
  trimmed.width = cw;
  trimmed.height = ch;
  const tctx = trimmed.getContext('2d')!;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(temp, minX, minY, cw, ch, 0, 0, cw, ch);

  const flash = document.createElement('canvas');
  flash.width = cw;
  flash.height = ch;
  const fctx = flash.getContext('2d')!;
  fctx.imageSmoothingEnabled = false;
  fctx.drawImage(trimmed, 0, 0);
  fctx.globalCompositeOperation = 'source-in';
  fctx.fillStyle = '#ffffff';
  fctx.fillRect(0, 0, cw, ch);

  let ghostCanvas: HTMLCanvasElement | undefined;
  if (withGhost) {
    const gc = document.createElement('canvas');
    gc.width = cw;
    gc.height = ch;
    const gctx = gc.getContext('2d')!;
    gctx.imageSmoothingEnabled = false;
    gctx.drawImage(trimmed, 0, 0);
    gctx.globalCompositeOperation = 'source-in';
    gctx.fillStyle = '#93c5fd';
    gctx.fillRect(0, 0, cw, ch);
    ghostCanvas = gc;
  }

  return { canvas: trimmed, flashCanvas: flash, ghostCanvas, width: cw, height: ch, anchorX };
}

export function getChromaSprite(src: string): ProcessedSprite | null {
  const cached = spriteCache.get(src);
  if (cached) return cached;
  if (!loadingSingle.has(src)) {
    loadingSingle.add(src);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const S = 256;
      const off = document.createElement('canvas');
      off.width = S;
      off.height = S;
      const ctx = off.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, S, S);
      chromaClear(ctx, S, S);
      spriteCache.set(src, trimRect(off, 0, 0, S - 1, S - 1));
    };
    img.src = src;
  }
  return null;
}

// 1D 투영 세그먼트 추출 헬퍼
function extractSegments(hasPixel: Uint8Array, len: number, maxGap = 6, minSize = 20): Array<[number, number]> {
  const segs: Array<[number, number]> = [];
  let inSeg = false;
  let start = 0;
  let gap = 0;
  for (let i = 0; i < len; i++) {
    if (hasPixel[i]) {
      if (!inSeg) {
        inSeg = true;
        start = i;
      }
      gap = 0;
    } else if (inSeg) {
      gap++;
      if (gap > maxGap) {
        const end = i - gap;
        if (end - start >= minSize) segs.push([start, end]);
        inSeg = false;
      }
    }
  }
  if (inSeg && len - 1 - start >= minSize) segs.push([start, len - 1]);
  return segs;
}

// 2D 그리드(cols × rows) 정밀 슬라이서 (4×1 보행 시트 & 4×2 8프레임 전투 시트 모두 지원!)
export function getGridSpriteSheet(src: string, cols = 4, rows = 2): SpriteSheet | null {
  const cacheKey = `${src}|${cols}x${rows}`;
  const cached = sheetCache.get(cacheKey);
  if (cached) return cached;
  if (!loadingSheet.has(cacheKey)) {
    loadingSheet.add(cacheKey);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = rows > 1 ? 1024 : 768;
      const H = rows > 1 ? 576 : 432;
      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      const ctx = off.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, W, H);
      const imgData = chromaClear(ctx, W, H);
      const d = imgData.data;

      // 1단계: 행(Row) 분리
      let rowBounds: Array<[number, number]> = [];
      if (rows === 1) {
        rowBounds = [[0, H - 1]];
      } else {
        const rowHas = new Uint8Array(H);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (d[(y * W + x) * 4 + 3] > 25) {
              rowHas[y] = 1;
              break;
            }
          }
        }
        const detectedRows = extractSegments(rowHas, H, 6, 40);
        if (detectedRows.length === rows) {
          rowBounds = detectedRows;
        } else {
          const rh = Math.floor(H / rows);
          for (let r = 0; r < rows; r++) {
            rowBounds.push([r * rh, Math.min(H - 1, (r + 1) * rh - 1)]);
          }
        }
      }

      // 2단계: 각 행 안에서 열(Col) 분리
      const frames: ProcessedSprite[] = [];
      for (const [ry0, ry1] of rowBounds) {
        const colHas = new Uint8Array(W);
        for (let x = 0; x < W; x++) {
          for (let y = ry0; y <= ry1; y++) {
            if (d[(y * W + x) * 4 + 3] > 25) {
              colHas[x] = 1;
              break;
            }
          }
        }
        const detectedCols = extractSegments(colHas, W, 6, 24);
        if (detectedCols.length === cols) {
          for (const [cx0, cx1] of detectedCols) {
            frames.push(trimRect(off, cx0, ry0, cx1, ry1, rows > 1));
          }
        } else {
          const cw = Math.floor(W / cols);
          for (let c = 0; c < cols; c++) {
            frames.push(trimRect(off, c * cw, ry0, Math.min(W - 1, (c + 1) * cw - 1), ry1, rows > 1));
          }
        }
      }

      sheetCache.set(cacheKey, {
        frames,
        refHeight: frames[0]?.height || 180,
      });
    };
    img.src = src;
  }
  return null;
}

// 기존 1D 4프레임 시트 호환 래퍼
export function getSpriteSheet(src: string, expectedFrames = 4): SpriteSheet | null {
  return getGridSpriteSheet(src, expectedFrames, 1);
}

// 순수 검정(#000000) 배경 4×2 전투 VFX 그리드 로더 (Luma-to-Alpha + Additive Blend용!)
export function getVfxGridSheet(src: string, cols = 4, rows = 2): VfxSheet | null {
  const cached = vfxCache.get(src);
  if (cached) return cached;
  if (!loadingVfx.has(src)) {
    loadingVfx.add(src);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = 1024;
      const H = 576;
      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      const ctx = off.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, W, H);

      const cw = Math.floor(W / cols);
      const ch = Math.floor(H / rows);
      const frames: HTMLCanvasElement[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('canvas');
          cell.width = cw;
          cell.height = ch;
          const cctx = cell.getContext('2d', { willReadFrequently: true })!;
          cctx.imageSmoothingEnabled = false;
          cctx.drawImage(off, c * cw, r * ch, cw, ch, 0, 0, cw, ch);

          // 검정 배경을 매끄러운 광원 알파로 변환 (어두울수록 완전 투명!)
          const idata = cctx.getImageData(0, 0, cw, ch);
          const pd = idata.data;
          for (let i = 0; i < pd.length; i += 4) {
            const maxC = Math.max(pd[i], pd[i + 1], pd[i + 2]);
            if (maxC < 18) {
              pd[i + 3] = 0;
            } else {
              pd[i + 3] = Math.min(255, Math.round((maxC - 18) * 1.45));
            }
          }
          cctx.putImageData(idata, 0, 0);
          frames.push(cell);
        }
      }

      vfxCache.set(src, { frames });
    };
    img.src = src;
  }
  return null;
}

export function getDojoMapSrc(country: 'KOREA' | 'CHINA' | 'JAPAN', yardLevel: number): string {
  const isGrand = yardLevel >= 3;
  if (country === 'KOREA') return isGrand ? '/assets/px_dojo_kr_grand.jpg' : '/assets/px_dojo_kr_ruin.jpg';
  if (country === 'CHINA') return isGrand ? '/assets/px_dojo_cn_grand.jpg' : '/assets/px_dojo_cn_ruin.jpg';
  return isGrand ? '/assets/px_dojo_grand_map.jpg' : '/assets/px_dojo_ruin_map.jpg';
}

export function getHeroWalkSpriteInfo(
  country: 'KOREA' | 'CHINA' | 'JAPAN',
  gender: 'MALE' | 'FEMALE',
  age: number
): { src: string; rows: 1 | 2; rowIndex: 0 | 1 } {
  const cCode = country === 'CHINA' ? 'cn' : country === 'JAPAN' ? 'jp' : 'kr';
  const gCode = gender === 'FEMALE' ? 'f' : 'm';
  // 중년(35~54세) → 4×2 시트 Row 0, 원로(55세+) → 4×2 시트 Row 1!
  if (age >= 55) {
    return { src: `/assets/grid_walk_${cCode}_${gCode}_age.jpg`, rows: 2, rowIndex: 1 };
  }
  if (age >= 35) {
    return { src: `/assets/grid_walk_${cCode}_${gCode}_age.jpg`, rows: 2, rowIndex: 0 };
  }
  // 청년/소년(15~34세) → 4×1 시트
  if (gender === 'FEMALE') {
    if (country === 'KOREA') return { src: '/assets/sheet_walk_female_kr.jpg', rows: 1, rowIndex: 0 };
    if (country === 'JAPAN') return { src: '/assets/sheet_walk_female_jp.jpg', rows: 1, rowIndex: 0 };
    return { src: '/assets/sheet_walk_female.jpg', rows: 1, rowIndex: 0 };
  }
  if (country === 'CHINA') return { src: '/assets/sheet_walk_cn.jpg', rows: 1, rowIndex: 0 };
  if (country === 'JAPAN') return { src: '/assets/sheet_walk_jp.jpg', rows: 1, rowIndex: 0 };
  return { src: '/assets/sheet_walk_kr.jpg', rows: 1, rowIndex: 0 };
}

export function getHeroFightGridSrc(
  country: 'KOREA' | 'CHINA' | 'JAPAN',
  gender: 'MALE' | 'FEMALE',
  age: number,
  weaponGroup?: string
): { src: string; nativeDir: 1 | -1 } {
  const cCode = country === 'CHINA' ? 'cn' : country === 'JAPAN' ? 'jp' : 'kr';
  const gCode = gender === 'FEMALE' ? 'f' : 'm';

  if (weaponGroup === 'UNARMED') {
    if (age >= 55) {
      return { src: gender === 'FEMALE' ? '/assets/grid_unarmed_old_f_8f.jpg' : '/assets/grid_unarmed_old_8f.jpg', nativeDir: 1 };
    }
    return { src: `/assets/grid_unarmed_${cCode}_${gCode}_8f.jpg`, nativeDir: 1 };
  }

  // 도검/일반 병기: 3국 × 남/여 × 청년(15~34) / 중년(35~54) / 원로(55+) 18종 100% 매칭!
  if (age >= 55) {
    return { src: `/assets/grid_fight_${cCode}_${gCode}_old_8f.jpg`, nativeDir: 1 };
  }
  if (age >= 35) {
    return { src: `/assets/grid_fight_${cCode}_${gCode}_mid_8f.jpg`, nativeDir: 1 };
  }
  if (gender === 'FEMALE') {
    if (country === 'KOREA') return { src: '/assets/grid_fight_female_kr_8f.jpg', nativeDir: 1 };
    if (country === 'JAPAN') return { src: '/assets/grid_fight_female_jp_8f.jpg', nativeDir: 1 };
    return { src: '/assets/grid_fight_female_8f.jpg', nativeDir: 1 };
  }
  if (country === 'KOREA') return { src: '/assets/grid_fight_kr_8f.jpg', nativeDir: 1 };
  if (country === 'CHINA') return { src: '/assets/grid_fight_cn_8f.jpg', nativeDir: 1 };
  return { src: '/assets/grid_fight_jp_8f.jpg', nativeDir: 1 };
}

export function getEnemyFightGridSrc(
  enemyName: string,
  enemyTitle: string,
  weaponGroup: string
): string {
  const txt = `${enemyName} ${enemyTitle}`;
  if (/(혈영|검마|뇌제|어전 검성|화룡검존|마도)/.test(txt)) return '/assets/grid_enemy_gm_demon_8f.jpg';
  if (/(검선|검존|검황|태극|무상대사|노고수|은둔|야규|장문인|검성|진인)/.test(txt)) return '/assets/grid_enemy_gm_sage_8f.jpg';
  if (/(여협|여검|여무사|설화|빙월|당문|홍련)/.test(txt)) return '/assets/grid_enemy_female_8f.jpg';
  if (weaponGroup === 'UNARMED' || /(택견|소림|담퇴|유술|권법|무승)/.test(txt)) return '/assets/grid_enemy_unarmed_8f.jpg';
  if (weaponGroup === 'POLEARM' || /(장창|창술|창호|관군|포도|금군|교관|토벌|철산장군|호조인)/.test(txt)) return '/assets/grid_enemy_polearm_8f.jpg';
  return '/assets/grid_fight_enemy_8f.jpg';
}

export function getKoFallenIndex(opts: {
  isHero: boolean;
  country?: 'KOREA' | 'CHINA' | 'JAPAN';
  gender?: 'MALE' | 'FEMALE';
  age?: number;
  enemySrc?: string;
}): number {
  // grid_ko_fallen_4x2.jpg:
  // Row 0: [0] 조선남 | [1] 청남 | [2] 일본남 | [3] 여성
  // Row 1: [4] 백발원로/검선 | [5] 흑의낭인 | [6] 맨손무승 | [7] 갑주장병/검마
  if (opts.isHero) {
    // 여성 주인공은 원로가 되어도 남성 할아버지 KO가 아니라 여성 KO(idx 3) 사용!
    if (opts.gender === 'FEMALE') return 3;
    if ((opts.age || 20) >= 55) return 4;
    if (opts.country === 'CHINA') return 1;
    if (opts.country === 'JAPAN') return 2;
    return 0;
  }
  const es = opts.enemySrc || '';
  if (es.includes('unarmed')) return 6;
  if (es.includes('polearm') || es.includes('demon')) return 7;
  if (es.includes('sage')) return 4;
  if (es.includes('female')) return 3;
  return 5;
}

export function preloadAllGameArt() {
  [
    '/assets/px_title_bg.jpg',
    '/assets/px_dojo_ruin_map.jpg',
    '/assets/px_dojo_grand_map.jpg',
    '/assets/px_dojo_kr_ruin.jpg',
    '/assets/px_dojo_kr_grand.jpg',
    '/assets/px_dojo_cn_ruin.jpg',
    '/assets/px_dojo_cn_grand.jpg',
    '/assets/px_battle_stage.jpg',
    '/assets/px_battle_duel_stage.jpg',
    '/assets/grid_portraits_heroes_4x3.jpg',
    '/assets/grid_portraits_ages_4x3.jpg',
    '/assets/grid_portraits_npcs_4x3.jpg',
  ].forEach(loadRawImage);

  [
    '/assets/sp_hero_old_top.jpg',
    '/assets/sp_merchant_top.jpg',
    '/assets/sp_enemy_top.jpg',
  ].forEach(getChromaSprite);

  [
    '/assets/sheet_walk_kr.jpg',
    '/assets/sheet_walk_cn.jpg',
    '/assets/sheet_walk_jp.jpg',
    '/assets/sheet_walk_female.jpg',
    '/assets/sheet_walk_female_kr.jpg',
    '/assets/sheet_walk_female_jp.jpg',
    '/assets/sheet_walk_disciple.jpg',
  ].forEach((s) => getSpriteSheet(s, 4));

  // 8프레임 4×2 전투·연령보행 그리드 시트 프리로드 (중년/원로 시트는 온디맨드 캐시와 병행해 초기 부하 방지)
  [
    '/assets/grid_fight_kr_8f.jpg',
    '/assets/grid_fight_cn_8f.jpg',
    '/assets/grid_fight_jp_8f.jpg',
    '/assets/grid_fight_female_kr_8f.jpg',
    '/assets/grid_fight_female_8f.jpg',
    '/assets/grid_fight_female_jp_8f.jpg',
    '/assets/grid_fight_enemy_8f.jpg',
    '/assets/grid_enemy_unarmed_8f.jpg',
    '/assets/grid_enemy_polearm_8f.jpg',
    '/assets/grid_enemy_female_8f.jpg',
    '/assets/grid_enemy_gm_sage_8f.jpg',
    '/assets/grid_enemy_gm_demon_8f.jpg',
    '/assets/grid_ko_fallen_4x2.jpg',
  ].forEach((s) => getGridSpriteSheet(s, 4, 2));

  // 4×2 무술 VFX 그리드 시트 프리로드
  getVfxGridSheet('/assets/grid_vfx_martial_8f.jpg', 4, 2);
}
