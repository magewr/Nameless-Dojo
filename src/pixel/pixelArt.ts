import { CountryId, Gender, Season, SkillElement, WeaponGroup } from '../types/game';

// 2000년대 16비트 픽셀아트 렌더러 (모든 좌표는 픽셀 단위 p = pixelSize 로 정수 스냅)

export function pxRect(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  p: number
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(ox + x * p), Math.round(oy + y * p), Math.round(w * p), Math.round(h * p));
}

export interface TopDownCharOpts {
  x: number;
  y: number;
  p?: number; // pixel scale (default 3)
  dir: 'DOWN' | 'UP' | 'LEFT' | 'RIGHT';
  walkFrame: number; // 0, 1, 2, 3
  swinging?: boolean;
  role: 'HERO' | 'DISCIPLE' | 'MERCHANT' | 'SPOUSE' | 'RIVAL';
  country: CountryId;
  gender?: Gender;
  age?: number;
  oneArm?: boolean;
  isGenius?: boolean;
  isChild?: boolean;
  elementAffinity?: SkillElement;
  weaponGroup?: WeaponGroup;
  label?: string;
  bubble?: string;
  alertMark?: 'GOLD' | 'RED' | null;
  now?: number;
}

export function drawTopDownChar(ctx: CanvasRenderingContext2D, opts: TopDownCharOpts) {
  const p = opts.p ?? 3;
  const ox = Math.round(opts.x - 8 * p);
  const oy = Math.round(opts.y - 18 * p);
  const age = opts.age ?? 22;
  const now = opts.now ?? 0;

  // 발밑 픽셀 그림자
  pxRect(ctx, ox, oy, 3, 18, 10, 3, 'rgba(18, 12, 8, 0.35)', p);

  const bob = opts.walkFrame % 2 === 1 ? -1 : 0;
  const legL = opts.walkFrame === 1 ? -1 : opts.walkFrame === 3 ? 1 : 0;
  const legR = -legL;

  // 색상 팔레트 (국가/역할별)
  let robeMain = '#2c4c6e';
  let robeDark = '#1c334a';
  let sash = '#c93b2b';
  let skin = '#f2cfa7';
  let hair = age >= 62 ? '#e8e8ec' : age >= 48 ? '#9a9aa6' : '#1b1614';

  if (opts.role === 'HERO') {
    if (opts.country === 'KOREA') { robeMain = '#e8e2d0'; robeDark = '#bfb69f'; sash = '#2c4c6e'; }
    else if (opts.country === 'CHINA') { robeMain = '#942923'; robeDark = '#661a16'; sash = '#e5b75a'; }
    else { robeMain = '#26344a'; robeDark = '#182233'; sash = '#c93b2b'; }
  } else if (opts.role === 'DISCIPLE') {
    robeMain = opts.isChild ? '#a84438' : opts.isGenius ? '#355c7d' : '#6e5c49';
    robeDark = opts.isChild ? '#782b22' : opts.isGenius ? '#223e54' : '#4a3d2f';
    sash = opts.isGenius ? '#e5b75a' : '#2e241b';
  } else if (opts.role === 'MERCHANT') {
    robeMain = '#33302c';
    robeDark = '#1e1c1a';
    sash = '#9e2a2b';
  } else if (opts.role === 'SPOUSE') {
    robeMain = '#b55b6c';
    robeDark = '#873d4c';
    sash = '#f0d799';
  } else if (opts.role === 'RIVAL') {
    robeMain = '#232026';
    robeDark = '#121014';
    sash = '#d97706';
  }

  // 외곽선 감각의 신발 & 다리
  pxRect(ctx, ox, oy, 4, 15 + legL, 3, 4, '#241a13', p);
  pxRect(ctx, ox, oy, 9, 15 + legR, 3, 4, '#241a13', p);

  // 도복 하의 & 몸통
  pxRect(ctx, ox, oy, 3, 9 + bob, 10, 7, robeDark, p);
  pxRect(ctx, ox, oy, 4, 9 + bob, 8, 6, robeMain, p);
  // 허리띠
  pxRect(ctx, ox, oy, 3, 12 + bob, 10, 2, sash, p);

  // 팔 (외팔 장애 시 왼팔 생략)
  if (!opts.oneArm) {
    pxRect(ctx, ox, oy, 1, 9 + bob, 2, 5, robeDark, p);
    pxRect(ctx, ox, oy, 1, 13 + bob, 2, 2, skin, p);
  }
  const rightArmY = opts.swinging ? 6 : 9;
  pxRect(ctx, ox, oy, 13, rightArmY + bob, 2, 5, robeDark, p);
  pxRect(ctx, ox, oy, 13, rightArmY + 4 + bob, 2, 2, skin, p);

  // 손에 쥔 칼 / 수련 목검
  if (opts.role === 'HERO' || opts.role === 'DISCIPLE' || opts.role === 'RIVAL') {
    const bladeCol =
      opts.elementAffinity === 'FIRE'
        ? '#ff5522'
        : opts.elementAffinity === 'ICE'
        ? '#55ddff'
        : opts.elementAffinity === 'LIGHTNING'
        ? '#c084fc'
        : opts.role === 'DISCIPLE'
        ? '#8c6239'
        : '#d8dee9';
    if (opts.swinging) {
      // 휘두르는 칼날 + 반짝임
      pxRect(ctx, ox, oy, 14, 1 + bob, 2, 8, bladeCol, p);
      pxRect(ctx, ox, oy, 13, 8 + bob, 4, 1, '#d4a359', p);
      pxRect(ctx, ox, oy, 16, 0 + bob, 3, 2, 'rgba(255,250,210,0.8)', p);
    } else if (opts.role === 'HERO' || opts.role === 'RIVAL') {
      // 허리/등 뒤 칼자루
      pxRect(ctx, ox, oy, 14, 11 + bob, 2, 6, bladeCol, p);
    }
  }

  // 만물객 등 뒤 옻칠 괴짝 + 붉은 금서 반짝임
  if (opts.role === 'MERCHANT') {
    pxRect(ctx, ox, oy, 0, 7 + bob, 4, 7, '#3a2314', p);
    pxRect(ctx, ox, oy, 1, 8 + bob, 2, 2, Math.floor(now / 300) % 2 === 0 ? '#ef4444' : '#fbbf24', p);
  }

  // 머리 (얼굴 & 머리카락)
  pxRect(ctx, ox, oy, 4, 2 + bob, 8, 7, skin, p);
  // 머리 윗부분
  pxRect(ctx, ox, oy, 3, 1 + bob, 10, 3, hair, p);
  if (opts.dir !== 'UP') {
    // 옆머리 & 눈
    pxRect(ctx, ox, oy, 3, 3 + bob, 1, 4, hair, p);
    pxRect(ctx, ox, oy, 12, 3 + bob, 1, 4, hair, p);
    const eyeOff = opts.dir === 'LEFT' ? -1 : opts.dir === 'RIGHT' ? 1 : 0;
    pxRect(ctx, ox, oy, 5 + eyeOff, 5 + bob, 1, 2, '#18120e', p);
    pxRect(ctx, ox, oy, 10 + eyeOff, 5 + bob, 1, 2, '#18120e', p);
    if (age >= 55 && opts.gender !== 'FEMALE' && opts.role !== 'SPOUSE') {
      // 노년 흰 수염!
      pxRect(ctx, ox, oy, 6, 8 + bob, 4, 2, '#e5e7eb', p);
    }
  } else {
    pxRect(ctx, ox, oy, 3, 3 + bob, 10, 5, hair, p);
  }

  // 성별별 머리장식 / 상투 / 만물객 삿갓
  if (opts.role === 'MERCHANT') {
    // 넓은 대나무 삿갓!
    pxRect(ctx, ox, oy, 0, 1 + bob, 16, 2, '#8c693a', p);
    pxRect(ctx, ox, oy, 2, 0 + bob, 12, 1, '#a67f49', p);
    pxRect(ctx, ox, oy, 5, -1 + bob, 6, 1, '#6b4e29', p);
  } else if (opts.gender === 'FEMALE' || opts.role === 'SPOUSE') {
    // 쪽머리 + 비녀
    pxRect(ctx, ox, oy, 5, -1 + bob, 6, 2, hair, p);
    pxRect(ctx, ox, oy, 4, 0 + bob, 8, 1, '#c93b2b', p);
  } else {
    // 상투 + 머리띠
    pxRect(ctx, ox, oy, 6, -1 + bob, 4, 2, hair, p);
    if (opts.role === 'HERO' || opts.role === 'RIVAL') {
      pxRect(ctx, ox, oy, 3, 2 + bob, 10, 1, sash, p);
    }
  }

  // 머리 위 느낌표 (!) 아이콘 (만물객/이벤트)
  if (opts.alertMark) {
    const floatY = Math.sin(now / 180) * 3;
    const markColor = opts.alertMark === 'RED' ? '#ef4444' : '#facc15';
    ctx.fillStyle = '#18120e';
    ctx.fillRect(opts.x - 10, oy - 24 + floatY, 20, 20);
    ctx.strokeStyle = markColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(opts.x - 10, oy - 24 + floatY, 20, 20);
    ctx.fillStyle = markColor;
    ctx.font = 'bold 14px NeoDunggeunmo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('!', opts.x, oy - 9 + floatY);
  }

  // 이름표
  if (opts.label) {
    ctx.font = '12px NeoDunggeunmo, monospace';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(opts.label).width;
    ctx.fillStyle = 'rgba(20, 14, 10, 0.72)';
    ctx.fillRect(Math.round(opts.x - tw / 2 - 4), Math.round(opts.y + 8), Math.round(tw + 8), 16);
    ctx.fillStyle = opts.role === 'HERO' ? '#fde68a' : opts.role === 'MERCHANT' ? '#fb923c' : '#f5e9ce';
    ctx.fillText(opts.label, Math.round(opts.x), Math.round(opts.y + 20));
  }

  // 말풍선
  if (opts.bubble) {
    ctx.font = '12px NeoDunggeunmo, monospace';
    ctx.textAlign = 'center';
    const bw = Math.max(60, ctx.measureText(opts.bubble).width + 14);
    const bx = Math.round(opts.x - bw / 2);
    const by = Math.round(oy - 32);
    ctx.fillStyle = '#fff9eb';
    ctx.fillRect(bx, by, bw, 22);
    ctx.strokeStyle = '#3b2616';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, 22);
    ctx.fillStyle = '#241911';
    ctx.fillText(opts.bubble, Math.round(opts.x), by + 15);
  }
}

// ------------------------------------------------------------------
// 도장 월드 건물 · 오브젝트 픽셀 아트 렌더러
// ------------------------------------------------------------------

export function drawDojoMainHall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  level: number,
  country: CountryId,
  sectName: string,
  season: Season,
  hovered: boolean
) {
  const p = 4;
  const w = 52;
  const h = 30;
  const ox = Math.round(x - (w * p) / 2);
  const oy = Math.round(y - (h * p) / 2);

  // 그림자
  pxRect(ctx, ox, oy, 2, 26, 48, 6, 'rgba(15, 10, 6, 0.35)', p);

  // 기단(돌계단)
  pxRect(ctx, ox, oy, 3, 23, 46, 5, level >= 3 ? '#7c7872' : '#8a7356', p);
  pxRect(ctx, ox, oy, 21, 24, 10, 5, '#a89f91', p);

  // 벽체 (Lv.1 허름한 흙벽 → Lv.2 목조 → Lv.3~4 붉은/기와 대도장)
  const wallBg = level === 1 ? '#8c7658' : country === 'CHINA' && level >= 3 ? '#7a251e' : '#b89f7d';
  const pillar = country === 'CHINA' ? '#9e2a2b' : '#4a311e';
  pxRect(ctx, ox, oy, 5, 11, 42, 13, wallBg, p);
  // 기둥 4개
  [5, 18, 32, 44].forEach((gx) => pxRect(ctx, ox, oy, gx, 11, 3, 13, pillar, p));
  // 창호문
  pxRect(ctx, ox, oy, 9, 13, 8, 8, '#efe3c6', p);
  pxRect(ctx, ox, oy, 36, 13, 7, 8, '#efe3c6', p);
  // 중앙 대문
  pxRect(ctx, ox, oy, 22, 13, 8, 11, '#2a1b12', p);
  pxRect(ctx, ox, oy, 23, 14, 6, 9, '#3d281a', p);

  // 지붕 (Lv.1 구멍 뚫린 초가지붕 → Lv.2 목조 → Lv.3~4 웅장한 기와!)
  const roofMain =
    season === 'WINTER'
      ? '#e2e8f0'
      : level === 1
      ? '#9c8252'
      : level === 2
      ? '#5c4330'
      : '#333842';
  const roofDark =
    season === 'WINTER'
      ? '#94a3b8'
      : level === 1
      ? '#6e5833'
      : level === 2
      ? '#3d2b1d'
      : '#1f232b';

  pxRect(ctx, ox, oy, 0, 7, 52, 5, roofDark, p);
  pxRect(ctx, ox, oy, 2, 4, 48, 5, roofMain, p);
  pxRect(ctx, ox, oy, 6, 1, 40, 4, roofMain, p);
  pxRect(ctx, ox, oy, 10, 0, 32, 2, roofDark, p);

  // Lv.1 지붕 구멍 표현!
  if (level === 1) {
    pxRect(ctx, ox, oy, 14, 4, 5, 3, '#2b1e14', p);
    pxRect(ctx, ox, oy, 33, 6, 4, 2, '#2b1e14', p);
  }
  // Lv.3+ 처마 황금 장식 & 빛나는 등불
  if (level >= 3) {
    pxRect(ctx, ox, oy, 0, 6, 2, 2, '#e5b75a', p);
    pxRect(ctx, ox, oy, 50, 6, 2, 2, '#e5b75a', p);
    pxRect(ctx, ox, oy, 19, 13, 2, 3, '#fbbf24', p);
    pxRect(ctx, ox, oy, 31, 13, 2, 3, '#fbbf24', p);
  }

  // 중앙 현판
  const signW = Math.min(180, Math.max(88, sectName.length * 14 + 16));
  ctx.fillStyle = level >= 3 ? '#1c120d' : '#573c26';
  ctx.fillRect(Math.round(x - signW / 2), Math.round(oy + 9 * p), signW, 20);
  ctx.strokeStyle = level >= 3 ? '#e5b75a' : '#8c6239';
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(x - signW / 2), Math.round(oy + 9 * p), signW, 20);
  ctx.fillStyle = level >= 3 ? '#fde68a' : '#e6d8be';
  ctx.font = 'bold 12px NeoDunggeunmo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(sectName, x, Math.round(oy + 9 * p + 14));

  if (hovered) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox - 4, oy - 4, w * p + 8, h * p + 8);
  }
}

export function drawSmallBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: 'LIBRARY' | 'FORGE' | 'CLINIC' | 'DUMMY',
  level: number,
  season: Season,
  now: number,
  hovered: boolean,
  hasGrimoire?: boolean
) {
  const p = 3;
  const ox = Math.round(x - 16 * p);
  const oy = Math.round(y - 14 * p);

  if (type === 'DUMMY') {
    // 목인장 2개 + 무기 거치대
    for (let i = 0; i < 2; i++) {
      const dx = ox + (3 + i * 14) * p;
      pxRect(ctx, dx, oy, 3, 18, 6, 2, 'rgba(15,10,6,0.35)', p);
      pxRect(ctx, dx, oy, 5, 6, 2, 13, '#7c5330', p);
      pxRect(ctx, dx, oy, 4, 4, 4, 3, '#a67446', p);
      pxRect(ctx, dx, oy, 2, 9, 8, 2, '#5c3b1e', p);
    }
    if (hovered) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox - 2, oy + 4, 32 * p + 4, 22 * p);
    }
    return;
  }

  // 작은 건물 공통 그림자 & 기단
  pxRect(ctx, ox, oy, 2, 22, 28, 4, 'rgba(15,10,6,0.35)', p);
  pxRect(ctx, ox, oy, 4, 11, 24, 12, type === 'FORGE' ? '#574e47' : '#bfa784', p);

  const roofColor =
    season === 'WINTER'
      ? '#e2e8f0'
      : type === 'FORGE'
      ? '#3f3b38'
      : type === 'LIBRARY'
      ? '#2d3a4b'
      : '#4b5940';
  pxRect(ctx, ox, oy, 1, 7, 30, 5, roofColor, p);
  pxRect(ctx, ox, oy, 4, 4, 24, 4, roofColor, p);

  // 타입별 고유 픽셀 애니메이션!
  const blink = Math.floor(now / 260) % 2 === 0;
  if (type === 'FORGE') {
    // 타오르는 화로 불꽃 + 모루
    pxRect(ctx, ox, oy, 7, 15, 7, 6, '#1f1612', p);
    pxRect(ctx, ox, oy, 8, blink ? 16 : 17, 5, blink ? 4 : 3, '#f97316', p);
    pxRect(ctx, ox, oy, 9, 18, 3, 2, '#fde047', p);
    pxRect(ctx, ox, oy, 18, 19, 6, 3, '#334155', p);
  } else if (type === 'LIBRARY') {
    // 서가 책장 + 촛불 / 금서 보유 시 보라 마법 오라!
    pxRect(ctx, ox, oy, 8, 13, 16, 8, '#3b2616', p);
    pxRect(ctx, ox, oy, 9, 14, 14, 2, '#d4a359', p);
    pxRect(ctx, ox, oy, 9, 17, 14, 2, '#9e2a2b', p);
    if (hasGrimoire) {
      pxRect(ctx, ox, oy, 14, blink ? 12 : 11, 4, 4, '#c084fc', p);
    }
  } else if (type === 'CLINIC') {
    // 약탕기 + 모락모락 김
    pxRect(ctx, ox, oy, 11, 14, 10, 8, '#efe3c6', p);
    pxRect(ctx, ox, oy, 22, 18, 5, 4, '#3d281a', p);
    pxRect(ctx, ox, oy, 23, blink ? 14 : 13, 2, 2, 'rgba(255,255,255,0.75)', p);
  }

  // 레벨 별점
  for (let i = 0; i < level; i++) {
    pxRect(ctx, ox, oy, 8 + i * 4, 2, 2, 2, '#facc15', p);
  }

  if (hovered) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 4, oy + 2, 32 * p + 8, 25 * p);
  }
}

export function drawPixelTree(ctx: CanvasRenderingContext2D, x: number, y: number, season: Season) {
  const p = 3;
  const ox = Math.round(x - 8 * p);
  const oy = Math.round(y - 16 * p);
  pxRect(ctx, ox, oy, 4, 15, 8, 3, 'rgba(15,10,6,0.3)', p);
  pxRect(ctx, ox, oy, 6, 10, 4, 7, '#5c3c24', p);

  const leafMain =
    season === 'SPRING'
      ? '#f4a4b8'
      : season === 'SUMMER'
      ? '#3d6b3c'
      : season === 'AUTUMN'
      ? '#d96b27'
      : '#e2e8f0';
  const leafDark =
    season === 'SPRING'
      ? '#d67691'
      : season === 'SUMMER'
      ? '#274a26'
      : season === 'AUTUMN'
      ? '#9e3e14'
      : '#94a3b8';

  pxRect(ctx, ox, oy, 2, 5, 12, 6, leafDark, p);
  pxRect(ctx, ox, oy, 3, 2, 10, 7, leafMain, p);
  pxRect(ctx, ox, oy, 5, 0, 6, 3, leafMain, p);
}

// ------------------------------------------------------------------
// 횡스크롤 2D 도트 격투 캐릭터 (사무라이 쇼다운 감성, 22×32 픽셀)
// ------------------------------------------------------------------
export interface SideFighterOpts {
  x: number;
  y: number;
  facing: 1 | -1;
  isPlayer: boolean;
  isRealDuel: boolean;
  age: number;
  gender?: Gender;
  country: CountryId;
  weaponGroup: WeaponGroup;
  elementAffinity?: SkillElement;
  pose: 'IDLE' | 'WINDUP' | 'STRIKE' | 'BLOCK' | 'HURT';
  oneArm?: boolean;
  blindShadow?: boolean;
  invuln?: boolean;
  shield?: boolean;
  now: number;
}

export function drawPixelSideFighter(ctx: CanvasRenderingContext2D, o: SideFighterOpts) {
  const p = 4;
  ctx.save();
  ctx.translate(Math.round(o.x), Math.round(o.y));
  if (o.facing === -1) ctx.scale(-1, 1);
  if (o.blindShadow) ctx.globalAlpha = 0.22;
  if (o.invuln) ctx.globalAlpha = 0.48;

  const ox = -11 * p;
  const oy = -30 * p;
  const breath = o.pose === 'IDLE' ? (Math.floor(o.now / 260) % 2 === 0 ? 0 : 1) : 0;
  const hair = o.age >= 60 ? '#e5e7eb' : o.age >= 48 ? '#9ca3af' : '#181411';

  let robe = o.isPlayer
    ? o.country === 'KOREA'
      ? '#ebe3cf'
      : o.country === 'CHINA'
      ? '#9e2a2b'
      : '#26344a'
    : o.isRealDuel
    ? '#4a1212'
    : '#4a3728';
  let robeDark = o.isPlayer
    ? o.country === 'KOREA'
      ? '#bdb299'
      : o.country === 'CHINA'
      ? '#6b1a1a'
      : '#172130'
    : '#291c14';
  const sash = o.isPlayer ? '#c93b2b' : '#d97706';

  // 그림자
  pxRect(ctx, ox, oy, 4, 29, 14, 3, 'rgba(15,10,6,0.38)', p);

  // 다리 (무술 기마자세)
  pxRect(ctx, ox, oy, 5, 22, 4, 8, '#261e19', p);
  pxRect(ctx, ox, oy, 13, 22, 4, 8, '#261e19', p);
  pxRect(ctx, ox, oy, 4, 28, 5, 2, '#14100d', p);
  pxRect(ctx, ox, oy, 13, 28, 5, 2, '#14100d', p);

  // 하카마 / 도복 하단
  pxRect(ctx, ox, oy, 4, 16 + breath, 14, 8, robeDark, p);
  pxRect(ctx, ox, oy, 6, 16 + breath, 10, 7, robe, p);

  // 상체 & 허리띠
  pxRect(ctx, ox, oy, 5, 8 + breath, 12, 9, robe, p);
  pxRect(ctx, ox, oy, 5, 14 + breath, 12, 2, sash, p);
  // 펄럭이는 띠 끝
  const flutter = Math.floor(o.now / 180) % 2;
  pxRect(ctx, ox, oy, 2 - flutter, 15 + breath, 3, 2, sash, p);

  // 머리 & 얼굴
  pxRect(ctx, ox, oy, 7, 1 + breath, 8, 7, '#f2cfa7', p);
  pxRect(ctx, ox, oy, 6, 0 + breath, 10, 3, hair, p);
  pxRect(ctx, ox, oy, 6, 2 + breath, 2, 5, hair, p);
  // 상투 / 머리띠
  pxRect(ctx, ox, oy, 7, -2 + breath, 4, 2, hair, p);
  pxRect(ctx, ox, oy, 6, 2 + breath, 9, 1, sash, p);
  // 눈
  pxRect(ctx, ox, oy, 12, 4 + breath, 2, 1, '#14100d', p);
  if (o.age >= 55 && o.gender !== 'FEMALE') {
    pxRect(ctx, ox, oy, 11, 7 + breath, 4, 2, '#e5e7eb', p);
  }

  // 뒤쪽 왼팔 (외팔이 아닐 때)
  if (!o.oneArm) {
    pxRect(ctx, ox, oy, 3, 10 + breath, 3, 5, robeDark, p);
  }

  // 무기 색상
  const bladeColor =
    o.elementAffinity === 'FIRE'
      ? '#ff5522'
      : o.elementAffinity === 'ICE'
      ? '#55ddff'
      : o.elementAffinity === 'LIGHTNING'
      ? '#c084fc'
      : o.isPlayer
      ? '#d8dee9'
      : '#cbd5e1';

  // 포즈별 주 팔 + 도트 무기 렌더링!
  if (o.pose === 'WINDUP') {
    // 칼을 머리 위로 치켜든 선딜 포즈!
    pxRect(ctx, ox, oy, 12, 3, 4, 5, robeDark, p);
    if (o.weaponGroup !== 'UNARMED') {
      pxRect(ctx, ox, oy, 6, -9, 3, 12, bladeColor, p);
      pxRect(ctx, ox, oy, 5, 2, 5, 2, '#e5b75a', p);
    }
  } else if (o.pose === 'STRIKE') {
    // 전방으로 쭉 뻗어 베는 포즈!
    pxRect(ctx, ox, oy, 16, 10, 5, 3, robeDark, p);
    if (o.weaponGroup !== 'UNARMED') {
      const len = o.weaponGroup === 'POLEARM' ? 18 : 14;
      pxRect(ctx, ox, oy, 20, 10, len, 2, bladeColor, p);
      pxRect(ctx, ox, oy, 19, 9, 2, 4, '#e5b75a', p);
    }
  } else if (o.pose === 'BLOCK') {
    // 칼을 세워 막는 자세 + 푸른 오라
    pxRect(ctx, ox, oy, 15, 9, 3, 4, robeDark, p);
    pxRect(ctx, ox, oy, 18, 2, 2, 16, bladeColor, p);
    pxRect(ctx, ox, oy, 20, 1, 2, 18, 'rgba(59,130,246,0.8)', p);
  } else {
    // 대기 자세 (칼을 앞으로 겨눔)
    pxRect(ctx, ox, oy, 15, 10 + breath, 4, 3, robeDark, p);
    if (o.weaponGroup !== 'UNARMED') {
      const len = o.weaponGroup === 'POLEARM' ? 16 : 11;
      pxRect(ctx, ox, oy, 18, 7 + breath, len, 2, bladeColor, p);
      pxRect(ctx, ox, oy, 18, 9 + breath, 2, 3, '#e5b75a', p);
    }
  }

  // 보호막 도트 링
  if (o.shield) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox - 4, oy - 4, 24 * p, 33 * p);
  }

  ctx.restore();
}
