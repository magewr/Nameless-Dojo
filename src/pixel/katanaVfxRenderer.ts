import { getKatanaStrokeAssets, getVfxGridSheet } from './spriteLoader';

export const SEQ_8F = [0, 1, 2, 3, 4, 5, 6, 7];

// ★ 60fps 감각의 프레임 크로스페이드 + 탄력적 Ease-Out 스케일 보간 32비트 VFX 스프라이트 렌더러! ★
export function drawSmoothVfxSprite(
  ctx: CanvasRenderingContext2D,
  opts: {
    sheetSrc: string;
    frameSeq: number[];
    progress: number; // 0..1
    x: number;
    y: number;
    scale: number;
    flipX?: number;
    rotation?: number;
  }
) {
  const sheet = getVfxGridSheet(opts.sheetSrc, 4, 2);
  if (!sheet || sheet.frames.length < 8) return;
  const prog = Math.max(0, Math.min(0.999, opts.progress));
  const seq = opts.frameSeq.length > 0 ? opts.frameSeq : [0];

  // 빠른 점등(8%) + 자연스러운 끝 페이드아웃(마지막 22%)
  const envAlpha = prog < 0.08 ? prog / 0.08 : prog > 0.78 ? (1 - prog) / 0.22 : 1.0;

  // 탄력적 Ease-Out 펀치 스케일 (단일 프레임이면 0.72→1.12→1.04, 8프레임 애니면 미세 확장 0.94→1.06)
  const easeOut = 1 - Math.pow(1 - Math.min(1, prog * 2.5), 3);
  const punch = seq.length === 1 ? 0.72 + easeOut * 0.36 : 0.94 + prog * 0.12;
  const sizeW = Math.round(212 * opts.scale * punch);
  const sizeH = Math.round(184 * opts.scale * punch);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(Math.round(opts.x), Math.round(opts.y));
  if (opts.rotation) ctx.rotate(opts.rotation);
  if (opts.flipX && opts.flipX !== 1) ctx.scale(opts.flipX, 1);

  if (seq.length === 1) {
    const cell = sheet.frames[seq[0] % 8];
    ctx.globalAlpha = Math.max(0, Math.min(1, envAlpha));
    ctx.drawImage(cell, -sizeW / 2, -sizeH / 2, sizeW, sizeH);
  } else {
    // 인접한 두 프레임(idxA, idxB)을 부드럽게 크로스페이드 보간! → 뚝뚝 끊김 0%!
    const fPos = prog * (seq.length - 1);
    const idxA = Math.floor(fPos);
    const idxB = Math.min(seq.length - 1, idxA + 1);
    const frac = fPos - idxA;

    const cellA = sheet.frames[seq[idxA] % 8];
    const cellB = sheet.frames[seq[idxB] % 8];

    const alphaA = envAlpha * (1 - frac * 0.65);
    const alphaB = envAlpha * Math.min(1, frac * 1.15);

    if (alphaA > 0.02) {
      ctx.globalAlpha = Math.max(0, Math.min(1, alphaA));
      ctx.drawImage(cellA, -sizeW / 2, -sizeH / 2, sizeW, sizeH);
    }
    if (idxB !== idxA && alphaB > 0.02) {
      ctx.globalAlpha = Math.max(0, Math.min(1, alphaB));
      ctx.drawImage(cellB, -sizeW / 2, -sizeH / 2, sizeW, sizeH);
    }
  }
  ctx.restore();
}

export interface FlurryStrokeDef {
  cx: number;
  cy: number;
  angle: number;
  length: number;
  thicknessScale: number;
  strokeIdx: 0 | 1 | 2 | 3; // 0: 청백, 1: 진홍, 2: 황금, 3: 은백
  atMs: number;
  wipeMs: number;
  played: boolean;
}

export interface DarkFlurryState {
  startAt: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  title?: string;
  strokes: FlurryStrokeDef[];
  sheathPlayed: boolean;
  burstPlayed: boolean;
  totalDurationMs: number;
}

export interface KoOneStrokeState {
  startAt: number;
  targetX: number;
  targetY: number;
  facing: 1 | -1;
  angle: number;
  totalDurationMs: number;
}

// ★ 암전 연참(11연속 초고속 단획 베기 → 납도 정적 → 일제 파열!) 생성기 ★
export function createDarkFlurry(
  now: number,
  targetX: number,
  targetY: number,
  facing: 1 | -1,
  title?: string
): DarkFlurryState {
  // 서로 확연히 다른 11개 각도·위치가 초고속(40~48ms 간격)으로 이어지며 하나씩 화면을 찢음!
  const presets: Array<{ dx: number; dy: number; ang: number; len: number; idx: 0 | 1 | 2 | 3; th: number }> = [
    { dx: -18, dy: -36, ang: -0.58, len: 310, idx: 3, th: 0.78 },
    { dx: 22, dy: 18, ang: 0.48, len: 325, idx: 0, th: 0.82 },
    { dx: -10, dy: -8, ang: -0.14, len: 370, idx: 1, th: 0.88 },
    { dx: 14, dy: -42, ang: 0.88, len: 295, idx: 3, th: 0.78 },
    { dx: -24, dy: 24, ang: -0.92, len: 305, idx: 2, th: 0.85 },
    { dx: 8, dy: -22, ang: 0.24, len: 360, idx: 1, th: 0.92 },
    { dx: -16, dy: 10, ang: -0.44, len: 380, idx: 0, th: 0.86 },
    { dx: 26, dy: -16, ang: 0.66, len: 335, idx: 2, th: 0.9 },
    { dx: -8, dy: 30, ang: -0.05, len: 410, idx: 3, th: 0.95 },
    { dx: 12, dy: -28, ang: -0.76, len: 365, idx: 1, th: 1.0 },
    { dx: 0, dy: -4, ang: -0.26, len: 520, idx: 2, th: 1.35 },
  ];

  let curMs = 70;
  const strokes: FlurryStrokeDef[] = presets.map((p, i) => {
    const atMs = curMs;
    // 점점 템포가 빨라지는 가속 연속 베기 (48ms → 34ms)!
    curMs += Math.max(34, 48 - i * 1.4);
    return {
      cx: targetX + p.dx,
      cy: targetY + p.dy,
      angle: p.ang * facing,
      length: p.len,
      thicknessScale: p.th,
      strokeIdx: p.idx,
      atMs,
      wipeMs: i === presets.length - 1 ? 52 : 36,
      played: false,
    };
  });

  return {
    startAt: now,
    targetX,
    targetY,
    facing,
    title,
    strokes,
    sheathPlayed: false,
    burstPlayed: false,
    totalDurationMs: 1020,
  };
}

// ★ KO 단칼 일섬 한 획 피니시 생성기 ★
export function createKoOneStroke(
  now: number,
  targetX: number,
  targetY: number,
  facing: 1 | -1
): KoOneStrokeState {
  return {
    startAt: now,
    targetX,
    targetY,
    facing,
    angle: -0.15 * facing, // 살짝 대각선으로 화면 전체를 양분하는 발도 일섬!
    totalDurationMs: 680,
  };
}

// 단획 픽셀 스프라이트를 좌→우로 초고속 와이프(mask clip)하며 그리기!
function drawWipedSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  cx: number,
  cy: number,
  angle: number,
  drawW: number,
  drawH: number,
  wipeRatio: number, // 0..1 (좌→우로 그어지는 진행률)
  alpha: number,
  flipX = 1
) {
  if (wipeRatio <= 0.01 || alpha <= 0.01) return;
  const clampedWipe = Math.min(1, wipeRatio);
  const srcW = Math.max(1, Math.round(sprite.width * clampedWipe));
  const destW = Math.max(1, drawW * clampedWipe);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(flipX, 1);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(sprite, 0, 0, srcW, sprite.height, -drawW / 2, -drawH / 2, destW, drawH);
  ctx.restore();
}

// ★ 암전 연참 렌더링 (화면 좌표 또는 월드 좌표 캔버스 위 오버레이) ★
export function renderDarkFlurry(
  ctx: CanvasRenderingContext2D,
  state: DarkFlurryState,
  now: number,
  canvasW: number,
  canvasH: number,
  offsetX = 0
) {
  const assets = getKatanaStrokeAssets();
  const el = now - state.startAt;
  if (el < 0 || el > state.totalDurationMs) return;

  const burstAt = 680;
  const isBursting = el >= burstAt;
  const burstProg = isBursting ? Math.min(1, (el - burstAt) / (state.totalDurationMs - burstAt)) : 0;

  // 1) 암전 배경 (연참 중 순흑 → 파열 순간 진홍-순백 섬광 → 서서히 복귀)
  ctx.save();
  if (!isBursting) {
    const fadeIn = Math.min(1, el / 55);
    ctx.fillStyle = `rgba(3, 2, 6, ${0.88 * fadeIn})`;
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else if (burstProg < 0.16) {
    // 납도 정적 직후 폭발하는 임팩트 프레임!
    ctx.fillStyle = `rgba(255, 245, 225, ${(1 - burstProg / 0.16) * 0.55})`;
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else {
    const fadeOut = Math.max(0, 1 - (burstProg - 0.16) / 0.84);
    ctx.fillStyle = `rgba(14, 3, 5, ${0.82 * fadeOut})`;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // 2) 하나씩 초고속으로 그어져 쌓이는 11획 픽셀 단획 베기!
  ctx.globalCompositeOperation = 'lighter';
  state.strokes.forEach((st) => {
    if (el < st.atMs) return;
    const localEl = el - st.atMs;
    const wipe = Math.min(1, localEl / st.wipeMs);
    const isFresh = localEl < 95;

    // 파열 순간 모든 검흔이 일제히 번쩍 팽창했다가 면도날 실선으로 수축하며 소멸!
    let scaleY = st.thicknessScale;
    let alpha = isFresh ? 1.0 : 0.78;
    if (isBursting) {
      if (burstProg < 0.22) {
        const pop = burstProg / 0.22;
        scaleY = st.thicknessScale * (1 + pop * 1.45);
        alpha = 1.0;
      } else {
        const shrink = (burstProg - 0.22) / 0.78;
        scaleY = Math.max(0.06, st.thicknessScale * 2.45 * (1 - shrink));
        alpha = Math.max(0, 1 - shrink * 1.15);
      }
    }

    const sx = st.cx - offsetX;
    const sy = st.cy;
    const sprite = assets?.strokes[st.strokeIdx];
    if (sprite) {
      const drawW = st.length;
      const drawH = Math.round(132 * scaleY);
      drawWipedSprite(ctx, sprite, sx, sy, st.angle, drawW, drawH, wipe, alpha, 1);
      // 방금 그어진 찰나엔 한 번 더 덧그려 순백 휘도 강조!
      if (isFresh) {
        drawWipedSprite(ctx, sprite, sx, sy, st.angle, drawW * 1.04, drawH * 0.72, wipe, 0.7, 1);
      }
    }
  });

  // 3) 파열 직후 최후의 거대 일섬 한 획이 화면 전체를 가로지르며 피니시!
  if (isBursting && assets?.koPanorama) {
    const finWipe = Math.min(1, burstProg / 0.25);
    const finShrink = burstProg < 0.28 ? 1.0 : Math.max(0.05, 1 - (burstProg - 0.28) / 0.72);
    const finAlpha = burstProg < 0.35 ? 1.0 : Math.max(0, 1 - (burstProg - 0.35) / 0.65);
    drawWipedSprite(
      ctx,
      assets.koPanorama,
      state.targetX - offsetX,
      state.targetY,
      -0.22 * state.facing,
      canvasW * 1.12,
      Math.round(190 * finShrink),
      finWipe,
      finAlpha,
      state.facing
    );
  }

  ctx.restore();

  // 상단 극의 칭호
  if (state.title && el >= 60 && el < state.totalDurationMs - 80) {
    ctx.save();
    ctx.font = 'bold 16px NeoDunggeunmo, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#090504';
    ctx.fillText(state.title, canvasW / 2 + 2, 34);
    ctx.fillStyle = isBursting ? '#ffffff' : '#fde047';
    ctx.fillText(state.title, canvasW / 2, 32);
    ctx.restore();
  }
}

// ★ KO 단칼 일섬 한 획 피니시 렌더링 (임팩트 프리즈 → 화면 양분 단칼 와이프 → 실선 수축 소멸!) ★
export function renderKoOneStroke(
  ctx: CanvasRenderingContext2D,
  state: KoOneStrokeState,
  now: number,
  canvasW: number,
  canvasH: number,
  offsetX = 0
) {
  const assets = getKatanaStrokeAssets();
  const el = now - state.startAt;
  if (el < 0 || el > state.totalDurationMs) return;

  ctx.save();

  // Phase 1 (0 ~ 85ms): 강렬한 흑백/진홍 임팩트 프리즈 프레임!
  if (el < 85) {
    const flash = 1 - el / 85;
    ctx.fillStyle = el < 38 ? `rgba(255, 250, 235, ${0.52 * flash + 0.18})` : `rgba(18, 4, 6, 0.72)`;
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else {
    // Phase 2 & 3 배경 수묵 비네팅
    const bgFade = Math.max(0, 1 - (el - 85) / (state.totalDurationMs - 85));
    ctx.fillStyle = `rgba(10, 4, 6, ${0.62 * bgFade})`;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // Phase 2 (70 ~ 210ms): 화면 왼쪽 끝 → 오른쪽 끝으로 초대형 단칼 일섬 한 획이 초고속 와이프!
  if (el >= 65 && assets?.koPanorama) {
    const slashEl = el - 65;
    const wipe = Math.min(1, slashEl / 130); // 130ms 만에 화면 전체를 단칼에 베고 지나감!
    const holdEnd = 225;
    let scaleY = 1.0;
    let alpha = 1.0;

    if (slashEl < holdEnd) {
      // 칼날이 그어지는 직후 강렬한 순간 팽창
      scaleY = 0.92 + Math.sin(Math.min(1, slashEl / holdEnd) * Math.PI) * 0.25;
      alpha = 1.0;
    } else {
      // 그어진 한 획이 면도날 실선으로 날카롭게 수축하며 소멸!
      const shrinkProg = Math.min(1, (slashEl - holdEnd) / (state.totalDurationMs - 65 - holdEnd));
      scaleY = Math.max(0.03, Math.pow(1 - shrinkProg, 1.7));
      alpha = Math.max(0, 1 - Math.pow(shrinkProg, 1.4));
    }

    ctx.globalCompositeOperation = 'lighter';
    // 이음새 0% 통짜 면도날 일섬 한 획 — 적의 정중앙을 뚫고 좌→우 화면 전체를 완벽하게 양분!
    const anchorX = state.targetX - offsetX;
    const drawW = canvasW * 1.12;
    const drawH = Math.round(165 * scaleY);
    const centerX = canvasW * 0.5 + (anchorX - canvasW * 0.5) * 0.45;

    // 메인 단칼 파노라마 한 획
    drawWipedSprite(ctx, assets.koPanorama, centerX, state.targetY, state.angle, drawW, drawH, wipe, alpha, state.facing);
    // 칼이 그어지는 찰나 순백 코어 한 겹 더 얹어 강렬한 베임 쾌감!
    if (slashEl < 210) {
      drawWipedSprite(ctx, assets.koPanorama, centerX, state.targetY, state.angle, drawW, Math.round(drawH * 0.58), wipe, 0.85 * alpha, state.facing);
    }
  }

  ctx.restore();
}
