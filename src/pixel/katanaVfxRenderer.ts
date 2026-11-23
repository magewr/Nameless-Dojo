import { getKatanaStrokeAssets, getVfxGridSheet } from './spriteLoader';

export const SEQ_8F = [0, 1, 2, 3, 4, 5, 6, 7];

// 빛 스프라이트 한 장을 그린다.
// 가산 합성(lighter)만 쓰면 여러 이펙트가 겹칠 때 화면이 하얗게 타 버리므로,
// 제 색을 살리는 일반 합성으로 몸통을 그리고 그 위에 옅은 가산 합성으로 빛 번짐만 얹는다.
export function drawGlowSprite(
  ctx: CanvasRenderingContext2D,
  cell: HTMLCanvasElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  alpha: number,
  glow = 0.3
) {
  const a = Math.max(0, Math.min(1, alpha));
  if (a <= 0.02) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a * 0.9;
  ctx.drawImage(cell, dx, dy, dw, dh);
  if (glow > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * glow;
    ctx.drawImage(cell, dx, dy, dw, dh);
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 8프레임 픽셀아트 VFX 스프라이트 렌더러.
// - 나타날 때는 두 프레임 안에 켜지고(타격 순간에 이미 보여야 한다), 끝의 30%에서 부드럽게 꺼진다.
// - 프레임마다 모양이 크게 다르므로 대부분의 시간은 한 장만 또렷하게 보여 주고,
//   다음 프레임으로 넘어가기 직전 40% 구간에서만 섞는다. (내내 섞으면 두 모양이 겹쳐 유령처럼 보인다)
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
    glow?: number;
  }
) {
  const sheet = getVfxGridSheet(opts.sheetSrc, 4, 2);
  if (!sheet || sheet.frames.length < 8) return;
  const prog = Math.max(0, Math.min(0.999, opts.progress));
  const seq = opts.frameSeq.length > 0 ? opts.frameSeq : [0];

  // 한 장짜리 섬광·폭발은 번쩍하고 곧 스러져야 한다. 오래 버티면 싸우는 두 사람을 가리는 원판이 된다.
  const fadeFrom = seq.length === 1 ? 0.3 : 0.7;
  const envIn = Math.min(1, prog / 0.05);
  const envOut = prog > fadeFrom ? 1 - Math.pow((prog - fadeFrom) / (1 - fadeFrom), 1.5) : 1;
  const envAlpha = envIn * envOut;

  // 단일 프레임은 빠르게 튀어나왔다가(0.78→1.06) 살짝 가라앉고, 8프레임 애니는 조금씩 퍼진다.
  const easeOut = 1 - Math.pow(1 - Math.min(1, prog * 4), 3);
  const punch = seq.length === 1 ? 0.78 + easeOut * 0.28 - prog * 0.04 : 0.95 + prog * 0.1;
  const sizeW = Math.round(212 * opts.scale * punch);
  const sizeH = Math.round(184 * opts.scale * punch);

  ctx.save();
  ctx.translate(Math.round(opts.x), Math.round(opts.y));
  if (opts.rotation) ctx.rotate(opts.rotation);
  if (opts.flipX && opts.flipX !== 1) ctx.scale(opts.flipX, 1);

  if (seq.length === 1) {
    drawGlowSprite(ctx, sheet.frames[seq[0] % 8], -sizeW / 2, -sizeH / 2, sizeW, sizeH, envAlpha, opts.glow);
  } else {
    const fPos = prog * seq.length;
    const idxA = Math.min(seq.length - 1, Math.floor(fPos));
    const idxB = Math.min(seq.length - 1, idxA + 1);
    const blend = idxB !== idxA ? smooth(0.6, 1, fPos - idxA) : 0;
    drawGlowSprite(ctx, sheet.frames[seq[idxA] % 8], -sizeW / 2, -sizeH / 2, sizeW, sizeH, envAlpha * (1 - blend), opts.glow);
    if (blend > 0.02) {
      drawGlowSprite(ctx, sheet.frames[seq[idxB] % 8], -sizeW / 2, -sizeH / 2, sizeW, sizeH, envAlpha * blend, opts.glow);
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

// 단획 스프라이트를 붓으로 긋듯 뻗어 나가게 그린다.
// 예전에는 왼쪽부터 잘라 보이는 방식이라 뻗는 동안 칼끝이 수직으로 뚝 잘려 보였다.
// 지금은 그림 전체를 진행률만큼의 길이에 맞춰 늘여 그리므로, 뻗는 내내 양끝이 뾰족하게 살아 있다.
function drawWipedSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  cx: number,
  cy: number,
  angle: number,
  drawW: number,
  drawH: number,
  wipeRatio: number, // 0..1 (시작점에서 끝점까지 뻗은 정도)
  alpha: number,
  flipX = 1
) {
  if (wipeRatio <= 0.01 || alpha <= 0.01) return;
  // 처음에 빠르게 뻗고 끝에서 살짝 감속한다 (칼끝이 화면을 가로지르는 속도감)
  const eased = 1 - Math.pow(1 - Math.min(1, wipeRatio), 2.2);
  const destW = Math.max(1, drawW * eased);
  // 뻗는 중에는 조금 가늘게 시작해 다 뻗었을 때 제 굵기가 된다
  const destH = drawH * (0.55 + 0.45 * eased);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(flipX, 1);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, -drawW / 2, -destH / 2, destW, destH);
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
    // 한 프레임 번쩍한 뒤 곧바로 어둠으로 가라앉는다 (화면 전체가 오래 하얗게 뜨지 않게)
    ctx.fillStyle = el < 34 ? `rgba(255, 250, 235, ${(0.46 * flash).toFixed(3)})` : `rgba(18, 4, 6, ${(0.72 * Math.min(1, (el - 34) / 40)).toFixed(3)})`;
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

// ---------------------------------------------------------------------------
// 패링 불꽃 (칼과 칼이 맞부딪힌 자리에서 주황빛 쇠불꽃이 크게 튄다)
// - 번쩍이는 심지 + 십자 섬광 + 가로로 길게 긋는 빛줄기 → 퍼지는 고리 → 사방으로 튀었다 떨어지는 불꽃 줄기
// - 합(chain)이 깊어질수록 섬광·고리·불꽃 수가 함께 커진다
// - 나이(age)는 부르는 쪽이 흘려 준다. 부딪힌 순간에는 거의 멈춰 두었다가(챙!) 느리게 풀어 주면
//   불꽃이 터져 나오는 모습이 슬로모션으로 보인다. 위치는 나이에서 식으로 계산한다.
// ---------------------------------------------------------------------------
export interface DeflectSpark {
  age: number; // ms. 부르는 쪽에서 매 프레임 더한다
  x: number;
  y: number;
  chain: number;
  tilt: number; // 맞부딪힌 칼날의 기울기
  durationMs: number;
  streaks: Array<{ ang: number; spd: number; life: number; width: number; delay: number }>;
  embers: Array<{ ang: number; spd: number; life: number }>;
}

// 부딪힌 순간의 정지와 그 뒤의 슬로모션 길이 (합이 깊어질수록 조금씩 짧아져 박자가 빨라진다)
export function getClashPause(chain: number): { freezeMs: number; slowMs: number } {
  const k = Math.max(1, Math.min(6, chain));
  return { freezeMs: 92 - k * 4, slowMs: 190 - k * 14 };
}

// 정지·슬로모션 동안 불꽃의 시간이 흐르는 속도
export const DEFLECT_RATE_FREEZE = 0.2;
export const DEFLECT_RATE_SLOW = 0.5;

export function createDeflectSpark(x: number, y: number, facing: 1 | -1, chain: number): DeflectSpark {
  const k = Math.max(1, Math.min(6, chain));
  const streaks: DeflectSpark['streaks'] = [];
  const count = 22 + k * 8;
  for (let i = 0; i < count; i++) {
    // 열에 여섯은 좌우 위쪽으로 부채꼴을 그리며 튀고, 나머지는 사방으로 흩어진다
    const fan = Math.random() < 0.62;
    const side = Math.random() < 0.5 ? -1 : 1;
    const ang = fan ? -Math.PI / 2 + side * (0.3 + Math.random() * 1.05) : Math.random() * Math.PI * 2;
    streaks.push({
      ang,
      // 빠른 것과 느린 것이 고르게 섞여야 둥근 테처럼 보이지 않고 흩날리는 불꽃으로 보인다
      spd: 300 + Math.pow(Math.random(), 1.5) * 1050 + k * 45,
      life: 190 + Math.random() * 280 + k * 16,
      width: 2.4 + Math.random() * 2 + k * 0.14,
      delay: Math.random() * 40,
    });
  }
  const embers: DeflectSpark['embers'] = [];
  for (let i = 0; i < 6 + k * 2; i++) {
    embers.push({ ang: -Math.PI / 2 + (Math.random() - 0.5) * 2.8, spd: 90 + Math.random() * 190, life: 340 + Math.random() * 300 });
  }
  return {
    age: 0,
    x,
    y,
    chain,
    tilt: -0.62 * facing + (Math.random() - 0.5) * 0.4,
    durationMs: 760,
    streaks,
    embers,
  };
}

// 그렸으면 true, 수명이 끝났으면 false
export function renderDeflectSpark(ctx: CanvasRenderingContext2D, s: DeflectSpark): boolean {
  const t = s.age;
  if (t > s.durationMs) return false;
  const k = Math.max(1, Math.min(6, s.chain));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'butt';

  // 1) 심지: 흰빛에서 주황으로 번지는 둥근 빛
  if (t < 150) {
    const a = 1 - Math.pow(t / 150, 1.3);
    const r = (34 + k * 8) * (0.7 + 0.3 * Math.min(1, t / 30));
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    grad.addColorStop(0, `rgba(255, 255, 255, ${a})`);
    grad.addColorStop(0.3, `rgba(255, 226, 150, ${a * 0.9})`);
    grad.addColorStop(0.62, `rgba(255, 150, 50, ${a * 0.45})`);
    grad.addColorStop(1, 'rgba(255, 110, 20, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2) 섬광: 맞부딪힌 칼날을 따라 길게, 그에 직각으로 짧게, 그리고 가로로 가늘게 긋는 빛줄기
  if (t < 140) {
    const grow = 0.6 + 0.4 * Math.min(1, t / 28);
    const fade = 1 - Math.pow(t / 140, 1.2);
    const drawBlade = (angle: number, len: number, half: number, warm = true) => {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(angle);
      if (warm) {
        ctx.fillStyle = `rgba(255, 165, 55, ${0.8 * fade})`;
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, -half * 1.8);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, half * 1.8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255, 252, 235, ${fade})`;
      ctx.beginPath();
      ctx.moveTo(-len * 0.86, 0);
      ctx.lineTo(0, -half);
      ctx.lineTo(len * 0.86, 0);
      ctx.lineTo(0, half);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    const len = (78 + k * 18) * grow;
    const half = Math.max(0.7, (6 + k * 0.9) * fade);
    drawBlade(s.tilt, len, half);
    drawBlade(s.tilt + Math.PI / 2, len * 0.55, half * 0.8);
    // 쇠가 부딪히는 순간의 가로 빛줄기 ("챙!")
    drawBlade(0, (120 + k * 34) * grow, Math.max(0.5, (1.6 + k * 0.2) * fade), false);
  }

  // 3) 고리: 가늘게 퍼지며 사라진다. 3합부터는 한 겹이 더 따라 나온다.
  const drawRing = (rt: number, span: number, maxR: number, alpha: number) => {
    if (rt < 0 || rt > span) return;
    const p = rt / span;
    const ease = 1 - Math.pow(1 - p, 2.4);
    ctx.strokeStyle = `rgba(255, 205, 130, ${alpha * (1 - p)})`;
    ctx.lineWidth = Math.max(0.7, 3.4 * (1 - p));
    ctx.beginPath();
    ctx.arc(s.x, s.y, 10 + maxR * ease, 0, Math.PI * 2);
    ctx.stroke();
  };
  drawRing(t, 210, 58 + k * 14, 0.85);
  if (k >= 3) drawRing(t - 50, 230, (58 + k * 14) * 1.45, 0.5);

  // 4) 불꽃 줄기: 빠르게 튀어나와 공기에 걸려 느려지며 아래로 떨어진다. 흰빛 → 주황 → 붉은 주황으로 식는다.
  const DRAG = 6.5;
  const GRAVITY = 620;
  const posAt = (ang: number, spd: number, ts: number) => {
    const d = (spd * (1 - Math.exp(-DRAG * ts))) / DRAG;
    return { x: s.x + Math.cos(ang) * d, y: s.y + Math.sin(ang) * d + 0.5 * GRAVITY * ts * ts };
  };
  s.streaks.forEach((sp) => {
    const lt = t - sp.delay;
    if (lt <= 0 || lt >= sp.life) return;
    const p = lt / sp.life;
    const head = posAt(sp.ang, sp.spd, lt / 1000);
    const tail = posAt(sp.ang, sp.spd, Math.max(0, lt - 46) / 1000);
    ctx.globalAlpha = 1 - p * p;
    ctx.strokeStyle = p < 0.3 ? '#fff6d6' : p < 0.68 ? '#ffb347' : '#ef6a1a';
    ctx.lineWidth = Math.max(0.9, sp.width * (1 - p * 0.55));
    ctx.beginPath();
    ctx.moveTo(Math.round(tail.x), Math.round(tail.y));
    ctx.lineTo(Math.round(head.x), Math.round(head.y));
    ctx.stroke();
  });

  // 5) 잔불: 불꽃이 지나간 뒤 잠깐 남아 떨어지는 작은 점
  s.embers.forEach((em) => {
    const lt = t - 40;
    if (lt <= 0 || lt >= em.life) return;
    const p = lt / em.life;
    const pos = posAt(em.ang, em.spd, lt / 1000);
    ctx.globalAlpha = 0.95 * (1 - p);
    ctx.fillStyle = p < 0.5 ? '#ffd27a' : '#f08a2a';
    const size = p < 0.4 ? 3 : 2;
    ctx.fillRect(Math.round(pos.x), Math.round(pos.y), size, size);
  });

  ctx.restore();
  return true;
}
