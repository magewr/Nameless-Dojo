import React, { useEffect, useRef, useState } from 'react';
import { CountryId, Gender } from '../types/game';
import {
  getGridSpriteSheet,
  getHeroFightGridSrc,
  getKatanaStrokeAssets,
  getKoFallenIndex,
  getVfxGridSheet,
  loadRawImage,
  VFX_SHEETS,
} from '../pixel/spriteLoader';
import {
  createDarkFlurry,
  createDeflectSpark,
  DEFLECT_RATE_FREEZE,
  DEFLECT_RATE_SLOW,
  DeflectSpark,
  getClashPause,
  renderDeflectSpark,
  createKoOneStroke,
  DarkFlurryState,
  drawSmoothVfxSprite,
  KoOneStrokeState,
  renderDarkFlurry,
  renderKoOneStroke,
  SEQ_8F,
} from '../pixel/katanaVfxRenderer';
import { sound } from '../engine/sound';
import { AutoBattleView } from './AutoBattleView';
import { BATTLE_PREVIEW_PRESETS, buildBattlePreview } from './battlePreviewPresets';
import { BattleConfig, GameState } from '../types/game';
import { ArrowLeft, Flame, Play, Shield, Snowflake, Sparkles, Swords, Volume2, VolumeX, Zap } from 'lucide-react';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
  gravity: number; kind: 'SPARK' | 'INK';
}
interface SpriteAnimVfx {
  x: number; y: number; vx: number; vy: number;
  sheetSrc: string; frameSeq: number[];
  scale: number; flipX: number; rotation: number;
  life: number; maxLife: number;
}

const W = 820;
const H = 360;
const GY = 300;

export const VfxAudioShowcase: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [country, setCountry] = useState<CountryId>('JAPAN');
  const [gender, setGender] = useState<Gender>('FEMALE');
  const [ageTier, setAgeTier] = useState<'YOUTH' | 'MID' | 'OLD'>('OLD');
  const [unarmed, setUnarmed] = useState(false);
  const [panMode, setPanMode] = useState<'AUTO' | 'LEFT' | 'CENTER' | 'RIGHT'>('AUTO');
  const [slowView, setSlowView] = useState(false);
  const [muted, setMuted] = useState(sound.muted);
  const [autoPlay, setAutoPlay] = useState(false);
  const [chainCount, setChainCount] = useState(1);
  const [lastLabel, setLastLabel] = useState('아래 버튼을 눌러 32비트 픽셀 스프라이트 VFX + 입체 효과음을 체험해 보세요!');
  // 실제 전투 화면 미리보기 (실전과 같은 코드로 이펙트를 확인한다)
  const [preview, setPreview] = useState<{ state: GameState; battle: BattleConfig } | null>(null);

  const fxRef = useRef({
    particles: [] as Particle[],
    anims: [] as SpriteAnimVfx[],
    deflects: [] as DeflectSpark[],
    enemyNoKnockUntil: 0,
    clashFreezeUntil: 0,
    clashSlowUntil: 0,
    darkFlurry: null as DarkFlurryState | null,
    koStroke: null as KoOneStrokeState | null,
    heroX: 280,
    enemyX: 540,
    heroFrame: 0,
    enemyFrame: 0,
    heroActionUntil: 0,
    enemyHurtUntil: 0,
    enemyFlashUntil: 0,
    enemyKoUntil: 0,
    shakeUntil: 0,
    shakePower: 0,
    darkBgUntil: 0,
    timeSlowUntil: 0,
    inkFlashUntil: 0,
    bannerText: '',
    bannerColor: '#fde047',
    bannerUntil: 0,
  });

  const ageNum = ageTier === 'OLD' ? 60 : ageTier === 'MID' ? 42 : 22;
  const heroInfo = getHeroFightGridSrc(country, gender, ageNum, unarmed ? 'UNARMED' : undefined);
  const enemySrc = '/assets/grid_enemy_gm_demon_8f.jpg';

  const resolvePan = (defaultPan: number) => {
    if (panMode === 'LEFT') return -0.75;
    if (panMode === 'CENTER') return 0;
    if (panMode === 'RIGHT') return 0.75;
    return defaultPan;
  };

  const spawnVfx = (opts: {
    x: number; y: number; sheetSrc: string; frameSeq: number[];
    scale?: number; flipX?: number; rotation?: number; duration?: number; vx?: number; vy?: number;
  }) => {
    const dur = opts.duration ?? 0.56;
    fxRef.current.anims.push({
      x: opts.x, y: opts.y, vx: opts.vx ?? 0, vy: opts.vy ?? 0,
      sheetSrc: opts.sheetSrc, frameSeq: opts.frameSeq,
      scale: opts.scale ?? 1.4, flipX: opts.flipX ?? 1, rotation: opts.rotation ?? 0,
      life: dur, maxLife: dur,
    });
  };

  const spawnSparks = (x: number, y: number, color: string, count: number, spd = 12) => {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = spd * (0.45 + Math.random() * 0.85);
      fxRef.current.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2,
        life: 0.28 + Math.random() * 0.25, maxLife: 0.53,
        color: i % 3 === 0 ? '#ffffff' : color, size: 2 + Math.random() * 2, gravity: 0.24, kind: 'SPARK',
      });
    }
  };

  const setBanner = (text: string, color: string) => {
    const now = performance.now();
    fxRef.current.bannerText = text;
    fxRef.current.bannerColor = color;
    fxRef.current.bannerUntil = now + 1050;
    setLastLabel(text);
  };

  // ── 32비트 픽셀 스프라이트 VFX + 입체 사운드 시연 ──
  const triggerSlashHit = () => {
    const now = performance.now();
    const s = fxRef.current;
    const tx = s.enemyX;
    s.heroFrame = 3; s.heroActionUntil = now + 380;
    s.enemyFrame = 7; s.enemyHurtUntil = now + 340; s.enemyFlashUntil = now + 170;
    s.shakeUntil = now + 180; s.shakePower = 11;
    sound.playUnsheathe(resolvePan(-0.45));
    setTimeout(() => {
      sound.playSlash(true, { pan: resolvePan(0), unarmed, tier: 4 });
      sound.playHit(true, { pan: resolvePan(0.45), unarmed, tier: 4 });
    }, 65);
    spawnVfx({
      x: tx - 14, y: GY - 64, vx: 32,
      sheetSrc: unarmed ? VFX_SHEETS.SLASH_PARRY : VFX_SHEETS.SLASH_8F,
      frameSeq: unarmed ? [3] : SEQ_8F,
      scale: unarmed ? 0.9 : 1.48, duration: slowView ? 0.68 : 0.28,
    });
    // 칼끝이 닿은 자리의 짧은 섬광 (실전과 같은 구성)
    spawnVfx({ x: tx - 10, y: GY - 70, sheetSrc: VFX_SHEETS.LEGACY, frameSeq: [7], scale: 0.56, duration: slowView ? 0.32 : 0.13 });
    spawnSparks(tx, GY - 64, '#7dd3fc', 16, 11);
    setBanner('⚔ 8프레임 초고속(30fps) 초승달 대참격 + 크로스페이드 + 3층 타격음', '#38bdf8');
  };

  const triggerParryChain = () => {
    const now = performance.now();
    const s = fxRef.current;
    const nextC = chainCount >= 8 ? 1 : chainCount + 1;
    setChainCount(nextC);
    const cx = Math.round((s.heroX + s.enemyX) / 2);
    // 실전과 같은 구성: 막는 쪽은 간파 자세, 막힌 쪽은 칼을 내지른 자세 그대로(맞은 자세·흰 섬광 없음)
    s.heroFrame = 5; s.heroActionUntil = now + 300;
    s.enemyFrame = 3; s.enemyHurtUntil = now + 260; s.enemyNoKnockUntil = now + 260;
    // 실전과 같은 박자: 부딪힌 순간 멈췄다가 슬로모션으로 풀린다
    const pause = getClashPause(nextC);
    s.clashFreezeUntil = now + pause.freezeMs;
    s.clashSlowUntil = now + pause.freezeMs + pause.slowMs;
    s.heroActionUntil = now + pause.freezeMs + pause.slowMs + 200;
    s.enemyHurtUntil = s.heroActionUntil; s.enemyNoKnockUntil = s.heroActionUntil;
    s.shakeUntil = now + 150; s.shakePower = Math.min(13, 5 + nextC * 1.4);
    sound.playParry(true, nextC, resolvePan(0));
    s.deflects.push(createDeflectSpark(cx + 16, GY - 78, 1, nextC));
    setBanner(`✨ 간파 ${nextC}합 — 맞부딪힌 자리에서 튀는 쇠불꽃 (합이 깊어질수록 커진다)`, nextC >= 5 ? '#ff5a3c' : nextC >= 3 ? '#ff8a3c' : '#ffb347');
  };

  const triggerGuardBreak = () => {
    const now = performance.now();
    const s = fxRef.current;
    const tx = s.enemyX;
    s.heroFrame = 4; s.heroActionUntil = now + 420;
    s.enemyFrame = 7; s.enemyHurtUntil = now + 700; s.enemyFlashUntil = now + 170;
    s.shakeUntil = now + 240; s.shakePower = 14;
    sound.playGuardBreak(resolvePan(0.45));
    spawnVfx({ x: tx, y: GY - 70, sheetSrc: VFX_SHEETS.SLASH_PARRY, frameSeq: [6], scale: 1.45, duration: slowView ? 0.72 : 0.32 });
    spawnVfx({ x: tx, y: GY - 48, sheetSrc: VFX_SHEETS.SLASH_PARRY, frameSeq: [7], scale: 1.38, duration: slowView ? 0.78 : 0.36 });
    spawnSparks(tx, GY - 62, '#fb923c', 22, 12);
    setBanner('💥 체세 붕괴! (방패 파편 + 암석 지면 파쇄 + 3연타 크랙)', '#fb923c');
  };

  const triggerElement = (kind: 'FIRE' | 'LIGHTNING' | 'ICE' | 'SHADOW' | 'QI', label: string, color: string) => {
    const now = performance.now();
    const s = fxRef.current;
    const tx = s.enemyX;
    s.heroFrame = 6; s.heroActionUntil = now + 480;
    s.enemyFrame = 7; s.enemyHurtUntil = now + 480; s.enemyFlashUntil = now + 170;
    s.shakeUntil = now + 220; s.shakePower = 13;
    s.timeSlowUntil = now + 180;
    sound.playTimeSlow();
    setTimeout(() => {
      sound.playMagic(kind, resolvePan(0.45));
      sound.playHit(true, { pan: resolvePan(0.45), unarmed: false, tier: 4 });
    }, 65);

    const durMult = slowView ? 2.4 : 1.0;
    if (kind === 'FIRE') {
      spawnVfx({ x: tx, y: GY - 86, sheetSrc: VFX_SHEETS.FIRE_8F, frameSeq: SEQ_8F, scale: 1.78, duration: 0.44 * durMult });
    } else if (kind === 'LIGHTNING') {
      spawnVfx({ x: tx, y: GY - 96, sheetSrc: VFX_SHEETS.LIGHTNING_8F, frameSeq: SEQ_8F, scale: 1.85, duration: 0.40 * durMult });
    } else if (kind === 'ICE') {
      spawnVfx({ x: tx, y: GY - 66, sheetSrc: VFX_SHEETS.ICE_8F, frameSeq: SEQ_8F, scale: 1.68, duration: 0.44 * durMult });
    } else if (kind === 'SHADOW') {
      spawnVfx({ x: tx, y: GY - 72, sheetSrc: VFX_SHEETS.SHADOW_8F, frameSeq: SEQ_8F, scale: 1.68, duration: 0.46 * durMult });
    } else {
      spawnVfx({ x: tx, y: GY - 84, sheetSrc: VFX_SHEETS.QI_8F, frameSeq: SEQ_8F, scale: 1.74, duration: 0.46 * durMult });
    }
    // 원소 폭발이 주인공이므로 지면 균열 같은 다른 큰 장식은 겹치지 않는다 (실전과 같은 구성)
    spawnSparks(tx, GY - 66, color, 10, 11);
    setBanner(label, color);
  };

  const triggerDarkSlash = () => {
    const now = performance.now();
    const s = fxRef.current;
    const tx = s.enemyX;
    s.heroFrame = 6; s.heroActionUntil = now + 980;
    s.enemyFrame = 7; s.enemyHurtUntil = now + 1020; s.enemyFlashUntil = now + 170;
    s.darkFlurry = createDarkFlurry(now, tx, GY - 68, 1, '극의 절명 11연참 · 【천하일섬】');
    if (slowView) {
      s.darkFlurry.totalDurationMs = 2450;
    }
    sound.playTimeSlow();
    setBanner('🌑 암전 11연속 초고속 단획 베기 → 납도 정적 → 일제 파열!', '#fde047');
  };

  const triggerKoFinisher = () => {
    const now = performance.now();
    const s = fxRef.current;
    const tx = s.enemyX;
    s.heroFrame = 6; s.heroActionUntil = now + 650;
    s.enemyKoUntil = now + 2400;
    s.enemyFlashUntil = now + 170;
    s.timeSlowUntil = now + 480;
    s.shakeUntil = now + 260; s.shakePower = 15;
    s.koStroke = createKoOneStroke(now, tx, GY - 68, 1);
    if (slowView) {
      s.koStroke.totalDurationMs = 1900;
    }
    sound.playSlash(true, { pan: resolvePan(0.25), tier: 4 });
    sound.playKoFinisher(resolvePan(0.45));
    setTimeout(() => sound.playLevelUp(), 520);
    spawnSparks(tx, GY - 68, '#fde047', 16, 13);
    setBanner('🏆 KO 단칼 일섬 피니시! (임팩트 프리즈 → 화면 양분 거대 한 획 → 실선 소멸)', '#fde047');
  };

  // 자동 연속 시연
  useEffect(() => {
    if (!autoPlay) return;
    const seq = [
      () => triggerSlashHit(),
      () => triggerParryChain(),
      () => triggerParryChain(),
      () => triggerGuardBreak(),
      () => triggerElement('FIRE', '🔥 화염 4프레임 픽셀 스프라이트 애니메이션 + 화염 굉음', '#fb923c'),
      () => triggerElement('LIGHTNING', '⚡ 천뢰 4프레임 픽셀 스프라이트 애니메이션 + 전격·천둥', '#c084fc'),
      () => triggerElement('ICE', '❄ 빙결 4프레임 픽셀 스프라이트 애니메이션 + 수정 하모닉', '#38bdf8'),
      () => triggerElement('SHADOW', '🟣 암영 4프레임 픽셀 스프라이트 애니메이션 + 불협 드론', '#e879f9'),
      () => triggerElement('QI', '✨ 강기 4프레임 픽셀 스프라이트 애니메이션 + 동양 징 공명', '#fde047'),
      () => triggerDarkSlash(),
      () => triggerKoFinisher(),
    ];
    let idx = 0;
    seq[0]();
    const id = setInterval(() => {
      idx = (idx + 1) % seq.length;
      seq[idx]();
    }, 1750);
    return () => clearInterval(id);
  }, [autoPlay, unarmed, country, gender, ageTier, panMode]);

  // 60fps 캔버스 렌더 루프 (100% 32비트 픽셀 스프라이트 VFX!)
  useEffect(() => {
    let rafId = 0;
    let lastT = performance.now();
    loadRawImage('/assets/px_battle_duel_stage.jpg');
    Object.values(VFX_SHEETS).forEach((src) => getVfxGridSheet(src, 4, 2));
    getKatanaStrokeAssets();
    getGridSpriteSheet('/assets/grid_ko_fallen_4x2.jpg', 4, 2);

    const loop = (now: number) => {
      const rawDt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const s = fxRef.current;
      const dt = rawDt * (now < s.timeSlowUntil ? 0.35 : 1.0);
      const deflectRate = now < s.clashFreezeUntil ? DEFLECT_RATE_FREEZE : now < s.clashSlowUntil ? DEFLECT_RATE_SLOW : 1;
      s.deflects.forEach((df) => { df.age += rawDt * 1000 * deflectRate; });

      // 암전 11연참 초고속 단획 사운드 스케줄
      if (s.darkFlurry) {
        const df = s.darkFlurry;
        const slowFactor = df.totalDurationMs > 1500 ? 2.4 : 1.0;
        const el = (now - df.startAt) / slowFactor;
        df.strokes.forEach((st, i) => {
          if (!st.played && el >= st.atMs) {
            st.played = true;
            sound.playSlash(i === df.strokes.length - 1, { pan: resolvePan(i % 2 === 0 ? -0.32 : 0.32), tier: 4 });
          }
        });
        if (!df.burstPlayed && el >= 680) {
          df.burstPlayed = true;
          sound.playDarkSlashFinish(resolvePan(0.3));
          spawnVfx({ x: df.targetX, y: GY - 46, sheetSrc: VFX_SHEETS.SLASH_PARRY, frameSeq: [7], scale: 1.35, duration: 0.5 });
          spawnSparks(df.targetX, df.targetY, '#fde047', 24, 14);
          s.shakeUntil = now + 260; s.shakePower = 18;
        }
        if (now - df.startAt >= df.totalDurationMs) s.darkFlurry = null;
      }
      if (s.koStroke && now - s.koStroke.startAt >= s.koStroke.totalDurationMs) {
        s.koStroke = null;
      }

      s.particles = s.particles.filter((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.life -= dt; return p.life > 0;
      });
      s.anims = s.anims.filter((a) => {
        a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt; return a.life > 0;
      });

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.save();
          if (now < s.shakeUntil) {
            ctx.translate((Math.random() - 0.5) * s.shakePower, (Math.random() - 0.5) * s.shakePower);
          }

          const bg = loadRawImage('/assets/px_battle_duel_stage.jpg');
          if (bg && bg.naturalWidth > 0) ctx.drawImage(bg, 0, 0, W, H);
          else { ctx.fillStyle = '#18110c'; ctx.fillRect(0, 0, W, H); }

          ctx.fillStyle = now < s.darkBgUntil ? 'rgba(4, 2, 6, 0.84)' : 'rgba(10, 6, 4, 0.22)';
          ctx.fillRect(0, 0, W, H);

          if (now < s.inkFlashUntil) {
            ctx.fillStyle = 'rgba(255, 250, 230, 0.36)';
            ctx.fillRect(0, 0, W, H);
          }

          // 캐릭터 렌더링
          const hSheet = getGridSpriteSheet(heroInfo.src, 4, 2);
          const eSheet = getGridSpriteSheet(enemySrc, 4, 2);
          const koSheet = getGridSpriteSheet('/assets/grid_ko_fallen_4x2.jpg', 4, 2);
          // 피격 섬광은 실전과 같은 규칙: 처음 50ms만 새하얗게, 그 뒤 120ms 동안 옅게 걷힌다.
          const drawChar = (sheet: ReturnType<typeof getGridSpriteSheet>, fIdx: number, x: number, flipX: number, flashLeft: number) => {
            if (!sheet || !sheet.frames[fIdx]) return;
            const sp = sheet.frames[fIdx];
            const scale = 148 / Math.max(1, sheet.refHeight);
            const dw = Math.round(sp.width * scale);
            const dh = Math.round(sp.height * scale);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath(); ctx.ellipse(x, GY + 2, 42, 9, 0, 0, Math.PI * 2); ctx.fill();
            ctx.save();
            ctx.translate(x, GY);
            ctx.scale(flipX, 1);
            if (flashLeft > 120) {
              ctx.drawImage(sp.flashCanvas, -Math.round(sp.anchorX * scale), -dh, dw, dh);
            } else {
              ctx.drawImage(sp.canvas, -Math.round(sp.anchorX * scale), -dh, dw, dh);
              if (flashLeft > 0) {
                ctx.globalAlpha = 0.6 * Math.pow(flashLeft / 120, 1.4);
                ctx.drawImage(sp.flashCanvas, -Math.round(sp.anchorX * scale), -dh, dw, dh);
                ctx.globalAlpha = 1;
              }
            }
            ctx.restore();
          };

          const hIdx = now < s.heroActionUntil ? s.heroFrame : 0;
          const lunge = now < s.heroActionUntil ? 36 : 0;
          drawChar(hSheet, hIdx, s.heroX + lunge, 1, 0);

          if (now < s.enemyKoUntil && koSheet && koSheet.frames[7]) {
            const ksp = koSheet.frames[getKoFallenIndex({ isHero: false, enemySrc })];
            const r = Math.min(160 / ksp.width, 96 / ksp.height);
            ctx.save();
            ctx.translate(s.enemyX + 20, GY);
            ctx.scale(-1, 1);
            ctx.drawImage(ksp.canvas, -Math.round((ksp.width * r) / 2), -Math.round(ksp.height * r), Math.round(ksp.width * r), Math.round(ksp.height * r));
            ctx.restore();
          } else {
            const eIdx = now < s.enemyHurtUntil ? s.enemyFrame : 0;
            // 간파 시연에서는 상대가 밀려나지 않고 한 발 내디딘 채 칼을 맞댄다
            const knock = now < s.enemyNoKnockUntil ? -46 : now < s.enemyHurtUntil ? 18 : 0;
            drawChar(eSheet, eIdx, s.enemyX + knock, 1, s.enemyFlashUntil - now);
          }

          // ★ 60fps 크로스페이드 보간 32비트 픽셀아트 8프레임 VFX 렌더링! ★
          s.anims.forEach((v) => {
            drawSmoothVfxSprite(ctx, {
              sheetSrc: v.sheetSrc,
              frameSeq: v.frameSeq,
              progress: 1 - v.life / v.maxLife,
              x: v.x,
              y: v.y,
              scale: v.scale,
              flipX: v.flipX,
              rotation: v.rotation,
            });
          });

          // 패링 불꽃
          s.deflects = s.deflects.filter((df) => renderDeflectSpark(ctx, df));

          // 보조 쇠불꽃 스파크
          s.particles.forEach((pt) => {
            const a = Math.max(0, pt.life / pt.maxLife);
            ctx.save(); ctx.globalAlpha = a;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = pt.color; ctx.lineWidth = pt.size;
            ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x - pt.vx * 2.4, pt.y - pt.vy * 2.4); ctx.stroke();
            ctx.restore();
          });

          // ★ 암전 11연참 단획 오버레이 & KO 단칼 일섬 한 획 피니시! ★
          if (s.darkFlurry) {
            const mappedNow = s.darkFlurry.totalDurationMs > 1500
              ? s.darkFlurry.startAt + (now - s.darkFlurry.startAt) / 2.4
              : now;
            renderDarkFlurry(ctx, s.darkFlurry, mappedNow, W, H, 0);
          }
          if (s.koStroke) {
            const mappedNow = s.koStroke.totalDurationMs > 1000
              ? s.koStroke.startAt + (now - s.koStroke.startAt) / 2.8
              : now;
            renderKoOneStroke(ctx, s.koStroke, mappedNow, W, H, 0);
          }

          if (now < s.bannerUntil && s.bannerText && !s.darkFlurry) {
            ctx.save();
            ctx.fillStyle = 'rgba(12, 8, 5, 0.78)';
            ctx.fillRect(0, 0, W, 38);
            ctx.font = 'bold 16px NeoDunggeunmo, monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = s.bannerColor;
            ctx.fillText(s.bannerText, W / 2, 25);
            ctx.restore();
          }

          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [heroInfo.src]);

  if (preview) {
    return (
      <div className="relative">
        <button
          onClick={() => setPreview(null)}
          className="fixed top-2 right-2 z-[60] rpg-btn px-3 py-1.5 text-xs font-bold flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 테스트관으로
        </button>
        <AutoBattleView
          key={preview.battle.id}
          state={preview.state}
          battle={preview.battle}
          onChangeTactic={(t) => setPreview({ ...preview, state: { ...preview.state, battleTactic: t } })}
          onFinish={() => setPreview(null)}
        />
      </div>
    );
  }

  return (
    // body가 overflow-hidden(본 게임은 화면 고정)이라, 테스트관은 스스로 스크롤 영역이 되어야 아래 항목까지 내려갈 수 있다.
    <div className="h-full overflow-y-auto bg-[#120c08] text-[#f5ecd7] p-3 sm:p-6 flex flex-col items-center gap-4">
      <div className="max-w-4xl w-full space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#8c6239] pb-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[#fde047]" />
            <h1 className="text-lg sm:text-xl font-bold text-[#fde68a]">《무명도장》 32비트 픽셀 VFX · 입체 사운드 테스트관</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { sound.muted = !sound.muted; setMuted(sound.muted); }}
              className="rpg-btn px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-300" />}
              {muted ? '음소거 중' : '소리 켜짐'}
            </button>
            <button
              onClick={() => setAutoPlay((v) => !v)}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer ${autoPlay ? 'seal-badge' : 'rpg-btn'}`}
            >
              <Play className="w-3.5 h-3.5" /> {autoPlay ? '자동 연속 시연 중 ■' : '전체 자동 시연 ▶'}
            </button>
            <a href="/" className="rpg-btn px-3 py-1.5 text-xs font-bold flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> 본 게임으로
            </a>
          </div>
        </div>

        <div className="rpg-window p-2 bg-[#0e0906]">
          <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto block border border-[#5c432c]" />
          <div className="mt-2 px-2 py-1 text-xs text-amber-200 flex items-center justify-between flex-wrap gap-2">
            <span>{lastLabel}</span>
            <span className="text-[11px] text-[#c7b394]">신규 32비트 픽셀 VFX 4시트(32프레임) 적용 중 · {heroInfo.src.split('/').pop()}</span>
          </div>
        </div>

        <div className="rpg-window p-3 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-[#c7b394] mr-1">국적:</span>
            {(['KOREA', 'CHINA', 'JAPAN'] as CountryId[]).map((c) => (
              <button key={c} onClick={() => setCountry(c)} className={`px-2 py-1 cursor-pointer ${country === c ? 'seal-badge' : 'rpg-btn'}`}>
                {c === 'KOREA' ? '조선' : c === 'CHINA' ? '청' : '일본'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#c7b394] mr-1">성별:</span>
            {(['MALE', 'FEMALE'] as Gender[]).map((g) => (
              <button key={g} onClick={() => setGender(g)} className={`px-2 py-1 cursor-pointer ${gender === g ? 'seal-badge' : 'rpg-btn'}`}>
                {g === 'MALE' ? '남' : '여'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#c7b394] mr-1">연령:</span>
            {(['YOUTH', 'MID', 'OLD'] as const).map((t) => (
              <button key={t} onClick={() => setAgeTier(t)} className={`px-2 py-1 cursor-pointer ${ageTier === t ? 'seal-badge' : 'rpg-btn'}`}>
                {t === 'YOUTH' ? '청년' : t === 'MID' ? '중년' : '원로'}
              </button>
            ))}
          </div>
          <button onClick={() => setUnarmed((u) => !u)} className={`px-2.5 py-1 cursor-pointer ${unarmed ? 'seal-badge' : 'rpg-btn'}`}>
            {unarmed ? '👊 맨손 무술' : '⚔ 도검 무술'}
          </button>
          <button onClick={() => setSlowView((v) => !v)} className={`px-2.5 py-1 cursor-pointer ${slowView ? 'seal-badge' : 'rpg-btn'}`}>
            {slowView ? '🐢 0.4x 슬로우 감상' : '⚡ 1.0x 실전 속도'}
          </button>
          <div className="flex items-center gap-1">
            <span className="text-[#c7b394] mr-1">스테레오:</span>
            {(['AUTO', 'LEFT', 'CENTER', 'RIGHT'] as const).map((p) => (
              <button key={p} onClick={() => setPanMode(p)} className={`px-2 py-1 cursor-pointer ${panMode === p ? 'seal-badge' : 'rpg-btn'}`}>
                {p === 'AUTO' ? '자동' : p === 'LEFT' ? '좌' : p === 'CENTER' ? '중앙' : '우'}
              </button>
            ))}
          </div>
        </div>

        <div className="rpg-window p-3.5 space-y-2.5">
          <div className="text-xs font-bold text-[#fde68a] flex items-center gap-1.5">
            <Swords className="w-4 h-4" /> 32비트 픽셀 스프라이트 VFX + 입체 효과음 동시 시연
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs font-bold">
            <button onClick={triggerSlashHit} className="rpg-btn py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Swords className="w-4 h-4 text-sky-300" /><span>초승달 (8프레임)</span>
            </button>
            <button onClick={triggerParryChain} className="rpg-btn py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Shield className="w-4 h-4 text-amber-300" /><span>간파 연환 ({chainCount}합)</span>
            </button>
            <button onClick={triggerGuardBreak} className="rpg-btn py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Sparkles className="w-4 h-4 text-orange-400" /><span>체세 붕괴·파쇄</span>
            </button>
            <button onClick={() => triggerElement('FIRE', '🔥 화염 8프레임 초고속(20fps+크로스페이드) + 폭발 굉음', '#fb923c')} className="rpg-btn py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Flame className="w-4 h-4 text-orange-400" /><span>화염 (8프레임)</span>
            </button>
            <button onClick={() => triggerElement('LIGHTNING', '⚡ 천뢰 8프레임 초고속(20fps+크로스페이드) + 천둥', '#c084fc')} className="rpg-btn py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Zap className="w-4 h-4 text-purple-300" /><span>천뢰 (8프레임)</span>
            </button>
            <button onClick={() => triggerElement('ICE', '❄ 빙결 8프레임 초고속(20fps+크로스페이드) + 수정음', '#38bdf8')} className="rpg-btn py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Snowflake className="w-4 h-4 text-sky-300" /><span>빙결 (8프레임)</span>
            </button>
            <button onClick={() => triggerElement('SHADOW', '🟣 암영 8프레임 초고속(20fps+크로스페이드) + 드론', '#e879f9')} className="rpg-btn py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Sparkles className="w-4 h-4 text-fuchsia-400" /><span>암영 (8프레임)</span>
            </button>
            <button onClick={() => triggerElement('QI', '✨ 강기·승룡 8프레임 초고속(20fps+크로스페이드) + 동양 징', '#fde047')} className="rpg-btn py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Sparkles className="w-4 h-4 text-yellow-300" /><span>강기 (8프레임)</span>
            </button>
            <button onClick={triggerDarkSlash} className="seal-badge py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Swords className="w-4 h-4" /><span>🌑 암전 연참</span>
            </button>
            <button onClick={triggerKoFinisher} className="seal-badge py-2.5 px-2 flex flex-col items-center gap-1 cursor-pointer">
              <Sparkles className="w-4 h-4" /><span>🏆 KO 피니시</span>
            </button>
          </div>
        </div>

        <div className="rpg-window p-3.5 space-y-2.5">
          <div className="text-xs font-bold text-[#fde68a] flex items-center gap-1.5">
            <Play className="w-4 h-4" /> 실제 전투 화면으로 보기 (위에서 고른 국적·성별 적용)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {BATTLE_PREVIEW_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreview(buildBattlePreview(p, country, gender))}
                className="rpg-btn py-2 px-2 flex flex-col items-center gap-0.5 cursor-pointer"
              >
                <span className="font-bold">{p.label}</span>
                <span className="text-[10px] text-[#c7b394]">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rpg-window p-3.5 space-y-2">
          <div className="text-xs font-bold text-[#fde68a] flex items-center gap-1.5">
            <Volume2 className="w-4 h-4" /> 단독 입체 사운드보드
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button onClick={() => sound.playUnsheathe(resolvePan(-0.4))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">발도 스르릉</button>
            <button onClick={() => sound.playDash(resolvePan(-0.3))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">도약 풍압</button>
            <button onClick={() => sound.playSlash(false, { pan: resolvePan(0), unarmed: false, tier: 2 })} className="rpg-btn px-2.5 py-1.5 cursor-pointer">도검 경참</button>
            <button onClick={() => sound.playSlash(true, { pan: resolvePan(0), unarmed: false, tier: 4 })} className="rpg-btn px-2.5 py-1.5 cursor-pointer">도검 강참</button>
            <button onClick={() => sound.playSlash(true, { pan: resolvePan(0), unarmed: true, tier: 3 })} className="rpg-btn px-2.5 py-1.5 cursor-pointer">맨손 권풍</button>
            <button onClick={() => sound.playHit(false, { pan: resolvePan(0.4), unarmed })} className="rpg-btn px-2.5 py-1.5 cursor-pointer">일반 타격</button>
            <button onClick={() => sound.playHit(true, { pan: resolvePan(0.4), unarmed, tier: 4 })} className="rpg-btn px-2.5 py-1.5 cursor-pointer">치명 강타</button>
            <button onClick={() => sound.playParry(true, 1, resolvePan(0))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">강철 간파 1합</button>
            <button onClick={() => sound.playParry(true, 4, resolvePan(0))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">강철 간파 4합</button>
            <button onClick={() => sound.playCounterImpact(resolvePan(0.35))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">반격 작렬</button>
            <button onClick={() => sound.playGuardBreak(resolvePan(0.4))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">체세 붕괴</button>
            <button onClick={() => sound.playTimeSlow()} className="rpg-btn px-2.5 py-1.5 cursor-pointer">타임 슬로우</button>
            <button onClick={() => sound.playDarkSlashFinish(resolvePan(0.3))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">납도 대폭발</button>
            <button onClick={() => sound.playKoFinisher(resolvePan(0.4))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">KO 동양 징</button>
            <button onClick={() => sound.playDrum(resolvePan(0))} className="rpg-btn px-2.5 py-1.5 cursor-pointer">동양 대북</button>
            <button onClick={() => sound.playLevelUp()} className="rpg-btn px-2.5 py-1.5 cursor-pointer">5음계 팡파르</button>
          </div>
        </div>
      </div>
    </div>
  );
};
