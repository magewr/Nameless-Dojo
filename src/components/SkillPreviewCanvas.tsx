import { drawGlowSprite } from '../pixel/katanaVfxRenderer';
import React, { useEffect, useRef, useState } from 'react';
import { GameState, Skill } from '../types/game';
import {
  ELEMENT_LABEL,
  FORM_LABEL,
  MASTERY_EXP_REQ,
  MASTERY_NAMES,
  WEAPON_GROUP_LABEL,
} from '../data/booksAndSkills';
import { getMasteryEvolutionDesc } from '../data/worldLore';
import {
  getGridSpriteSheet,
  getHeroFightGridSrc,
  getVfxGridSheet,
  loadRawImage,
  VFX_SHEETS,
} from '../pixel/spriteLoader';
import { Flame, RotateCcw, Shield, Snowflake, Sparkles, Swords, X, Zap } from 'lucide-react';
import { sound } from '../engine/sound';

// 내가 연마한 초식의 실제 8프레임 동작 + 숙련도/각인/마법/암전반격 VFX를 라이브로 시연하는 미니 캔버스!
export const SkillPreviewCanvas: React.FC<{
  state: GameState;
  skill: Skill;
  formNumber: number;
  replayKey: number;
}> = ({ state, skill, formNumber, replayKey }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    const startAt = performance.now();
    const sfxPlayed = { unsheathe: false, parry: false, hit: false, combo2: false, dark: false };
    const isUnarmedSkill = skill.weapon === 'UNARMED' || skill.form === 'STRIKE' || skill.form === 'GRAPPLE';
    const heroInfo = getHeroFightGridSrc(
      state.country,
      state.gender,
      state.age,
      isUnarmedSkill ? 'UNARMED' : undefined
    );
    const heroSrc = heroInfo.src;
    const heroNativeDir = heroInfo.nativeDir;
    const enemySrc = '/assets/grid_fight_enemy_8f.jpg';
    const vfxSrc = '/assets/grid_vfx_martial_8f.jpg';

    const lv = skill.masteryLevel || 1;
    const tier = lv >= 9 ? 4 : lv >= 6 ? 3 : lv >= 3 ? 2 : 1;
    const traits = skill.imprintedTraits || [];
    const isCounter = skill.form === 'PARRY' || traits.some((t) => Boolean(t.effect.counterMult) || Boolean(t.effect.parryWindowBonus));
    const isMulti = !isCounter && (traits.some((t) => (t.effect.multiHit || 0) >= 2) || (skill.form === 'SLASH' && lv >= 6));
    const isRanged = skill.form === 'PROJECTILE' || skill.range === 'FAR' || traits.some((t) => Boolean(t.effect.rangeExtend));
    const isSwift = traits.some((t) => (t.effect.windupMult || 1) <= 0.85) || skill.form === 'STEP';

    const nm = skill.customName || skill.name;
    let vfxIdx = 0;
    let color = '#f8fafc';
    if (skill.element === 'FIRE') { vfxIdx = 4; color = '#ff5722'; }
    else if (skill.element === 'LIGHTNING') { vfxIdx = 5; color = '#c084fc'; }
    else if (skill.element === 'ICE') { vfxIdx = 6; color = '#38bdf8'; }
    else if (isUnarmedSkill || skill.element === 'QI') { vfxIdx = 3; color = '#facc15'; }
    else if (isCounter || skill.form === 'THRUST') { vfxIdx = 2; color = isCounter ? '#fde047' : '#67e8f9'; }
    else if (nm.includes('종') || nm.includes('낙') || nm.includes('양단')) { vfxIdx = 1; color = '#fde68a'; }

    const cleanSect = state.sectName.replace(/\(.*?\)/g, '').trim() || '무명류';
    const shout = isCounter ? `${cleanSect} 반격 · ${nm}!` : `${cleanSect} ${formNumber}식 · ${nm}!`;

    const W = 440;
    const H = 200;
    const GY = 166; // 실제 배경 흙바닥 착지 지면선!
    const CYCLE = 2600;

    const tick = (now: number) => {
      const t = (now - startAt) % CYCLE;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;

          // ★ 공중부양 버그 수정: 배경 원본 naturalWidth/naturalHeight 비율로 하단 흙마당을 정확히 맞춰 그림! ★
          const bg = loadRawImage('/assets/px_battle_stage.jpg');
          if (bg && bg.naturalWidth > 0) {
            const nw = bg.naturalWidth;
            const nh = bg.naturalHeight;
            // 배경 하단(발 딛는 흙마당 포함 0.22~1.0) 영역을 aspect 440/200에 맞춰 깔끔하게 크롭!
            ctx.drawImage(bg, Math.round(nw * 0.1), Math.round(nh * 0.26), Math.round(nw * 0.8), Math.round(nh * 0.74), 0, 0, W, H);
          } else {
            ctx.fillStyle = '#1a120d';
            ctx.fillRect(0, 0, W, H);
          }

          const heroSheet = getGridSpriteSheet(heroSrc, 4, 2);
          const enemySheet = getGridSpriteSheet(enemySrc, 4, 2);
          const koSheet = getGridSpriteSheet('/assets/grid_ko_fallen_4x2.jpg', 4, 2);
          const vfxSheet = getVfxGridSheet(vfxSrc, 4, 2);

          let hx = 148;
          let ex = 302;
          let hFrame = 0;
          let eFrame = 0;
          let eKo = false;
          let showVfx = false;
          let showParrySpark = false;
          let showCombo2 = false;
          let showMagic = false;
          let showDarkSlash = false;
          let vfxX = 282;
          let eFlash = false;

          if (skill.isPassive) {
            hFrame = 0;
            ctx.save();
            ctx.globalAlpha = 0.6 + Math.sin(now / 180) * 0.2;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(hx, GY - 2, 42 + Math.sin(now / 150) * 8, 10, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          } else if (isCounter) {
            const isApexCounter = lv >= 8;
            if (t < 420) { hFrame = 0; eFrame = 1; ex = 302 - (t / 420) * 76; }
            else if (t < 740) { hFrame = 5; eFrame = 3; ex = 226; showParrySpark = true; }
            else if (isApexCounter ? t < 1420 : t < 1220) {
              if (isApexCounter) {
                showDarkSlash = true;
                hFrame = 6; hx = 340; eFrame = 7; ex = 235;
              } else {
                hFrame = 6; hx = 186; eFrame = 7; ex = 276; showVfx = true; vfxX = 266; eFlash = t < 940;
              }
            } else if (t < 1950) {
              hFrame = 0;
              hx = isApexCounter ? 340 : 186;
              ex = 240;
              eKo = isApexCounter;
            } else {
              hFrame = 0; eFrame = 0;
            }
          } else {
            if (t < 340) { hFrame = 1; hx = 148 + (t / 340) * (isRanged ? 14 : 46); }
            else if (t < 780) {
              hFrame = isUnarmedSkill || skill.form === 'STEP' ? 1 : 2;
              hx = isRanged ? 162 : 194;
            } else if (t < 1220) {
              hFrame =
                skill.form === 'THRUST' || isUnarmedSkill
                  ? 6
                  : skill.form === 'STEP'
                  ? 4
                  : 3;
              hx = isRanged ? 170 : 210;
              showVfx = true;
              showMagic = true;
              vfxX = isRanged ? 195 + ((t - 780) / 440) * 110 : 280;
              eFrame = !isRanged || t > 980 ? 7 : 0;
              eFlash = !isRanged ? t < 940 : t > 980 && t < 1120;
              ex = eFrame === 7 ? 318 : 302;
            } else if (isMulti && t < 1620) {
              hFrame = 4; hx = 214; showCombo2 = true; showMagic = true; vfxX = 286; eFrame = 7; eFlash = t < 1340; ex = 326;
            } else if (tier >= 4 && t < 2100) {
              hFrame = 0; hx = 210; ex = 326; eKo = true;
            } else {
              hFrame = 0; eFrame = 0;
            }
          }

          // 극의(Lv.9+) 타임 슬로우 수묵 비네팅 & 집중선
          if (tier >= 4 && !showDarkSlash && t >= 620 && t <= 1180) {
            ctx.save();
            ctx.fillStyle = 'rgba(8, 5, 4, 0.38)';
            ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * Math.PI * 2 + now / 380;
              ctx.beginPath();
              ctx.moveTo(W / 2 + Math.cos(a) * 110, H / 2 + Math.sin(a) * 58);
              ctx.lineTo(W / 2 + Math.cos(a) * 260, H / 2 + Math.sin(a) * 140);
              ctx.stroke();
            }
            ctx.restore();
          }

          // 고속 잔상 (숙련 Lv.3+ 또는 신속 각인 — Foot-Anchor 고정!)
          if ((tier >= 2 || isSwift) && heroSheet && heroSheet.frames.length >= 8 && (hFrame === 3 || hFrame === 6 || hFrame === 4)) {
            const gCount = tier >= 4 ? 3 : tier >= 3 || isSwift ? 2 : 1;
            const gSp = heroSheet.frames[hFrame];
            const ratio = 104 / Math.max(1, heroSheet.refHeight);
            const dw = Math.round(gSp.width * ratio);
            const dh = Math.round(gSp.height * ratio);
            const ax = Math.round(gSp.anchorX * ratio);
            const flipX = heroNativeDir === 1 ? 1 : -1;
            for (let i = 1; i <= gCount; i++) {
              ctx.save();
              ctx.globalAlpha = 0.36 / i;
              ctx.translate(Math.round(hx - i * 18), GY);
              ctx.scale(flipX, 1);
              ctx.drawImage(gSp.ghostCanvas || gSp.canvas, -ax, -dh + 4, dw, dh);
              ctx.restore();
            }
          }

          // 기 모으기 오라 (Windup 중 Lv.3+)
          if (!skill.isPassive && (hFrame === 2 || (isUnarmedSkill && hFrame === 1)) && tier >= 2) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(hx, GY - 2, 32 + Math.sin(now / 50) * 6, 8, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          const drawSp = (sheet: ReturnType<typeof getGridSpriteSheet>, idx: number, x: number, flipX: number, flash = false) => {
            ctx.fillStyle = 'rgba(10, 8, 5, 0.48)';
            ctx.beginPath();
            ctx.ellipse(Math.round(x), GY, 34, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            if (!sheet || sheet.frames.length < 8) return;
            const sp = sheet.frames[idx];
            const ratio = 104 / Math.max(1, sheet.refHeight);
            const dw = Math.round(sp.width * ratio);
            const dh = Math.round(sp.height * ratio);
            const ax = Math.round(sp.anchorX * ratio);
            ctx.save();
            ctx.translate(Math.round(x), GY);
            ctx.scale(flipX, 1);
            ctx.drawImage(flash ? sp.flashCanvas : sp.canvas, -ax, -dh + 4, dw, dh);
            ctx.restore();
          };

          const heroWantDir = ex >= hx ? 1 : -1;
          const heroFlip = heroNativeDir === heroWantDir ? 1 : -1;
          drawSp(heroSheet, hFrame, hx, heroFlip);

          if (!skill.isPassive) {
            if (eKo && koSheet && koSheet.frames.length >= 8) {
              const sp = koSheet.frames[5];
              const ratio = Math.min(110 / Math.max(1, sp.width), 62 / Math.max(1, sp.height));
              const dw = Math.round(sp.width * ratio);
              const dh = Math.round(sp.height * ratio);
              ctx.fillStyle = 'rgba(10, 8, 5, 0.52)';
              ctx.beginPath();
              ctx.ellipse(Math.round(ex), GY + 1, 48, 8, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.drawImage(sp.canvas, Math.round(ex - dw / 2), Math.round(GY - dh + 4), dw, dh);
            } else {
              drawSp(enemySheet, eFrame, ex, 1, eFlash);
            }
          }

          // ★ 마법·속성 전용 8프레임 초고속(20fps) 32비트 픽셀 스프라이트 애니메이션! ★
          if (showMagic && !skill.isPassive) {
            const animStep = Math.floor((now / 52) % 8);
            let mSheetSrc: string | null = null;
            if (skill.element === 'FIRE') mSheetSrc = VFX_SHEETS.FIRE_8F;
            else if (skill.element === 'LIGHTNING') mSheetSrc = VFX_SHEETS.LIGHTNING_8F;
            else if (skill.element === 'ICE') mSheetSrc = VFX_SHEETS.ICE_8F;
            else if (skill.element === 'SHADOW' || skill.isForbidden) mSheetSrc = VFX_SHEETS.SHADOW_8F;
            else if (skill.element === 'QI') mSheetSrc = VFX_SHEETS.QI_8F;
            if (mSheetSrc) {
              const mSheet = getVfxGridSheet(mSheetSrc, 4, 2);
              if (mSheet && mSheet.frames[animStep]) {
                ctx.save();
                const mw = 158;
                const mh = 138;
                drawGlowSprite(ctx, mSheet.frames[animStep], Math.round(ex - mw / 2), Math.round(GY - mh + 8), mw, mh, 1);
                ctx.restore();
              }
            }
          }

          // 첫 1회 시연 입체 사운드 트리거 (루프 반복 시 소음 방지)
          const rawElapsed = now - startAt;
          if (rawElapsed < 2500) {
            if (!sfxPlayed.unsheathe && t >= 120) {
              sfxPlayed.unsheathe = true;
              sound.playUnsheathe(-0.35);
            }
            if (!sfxPlayed.parry && showParrySpark) {
              sfxPlayed.parry = true;
              sound.playParry(true, 2, 0);
            }
            if (!sfxPlayed.hit && showVfx) {
              sfxPlayed.hit = true;
              if (isCounter) sound.playCounterImpact(0.35);
              else {
                sound.playSlash(tier >= 3, { pan: -0.1, unarmed: isUnarmedSkill, tier });
                sound.playHit(tier >= 3, { pan: 0.35, unarmed: isUnarmedSkill, tier });
                if (skill.element !== 'PHYSICAL') sound.playMagic(skill.element, 0.35);
              }
            }
            if (!sfxPlayed.combo2 && showCombo2) {
              sfxPlayed.combo2 = true;
              sound.playHit(true, { pan: 0.4, unarmed: isUnarmedSkill, tier });
            }
            if (!sfxPlayed.dark && showDarkSlash && t >= 1120) {
              sfxPlayed.dark = true;
              sound.playDarkSlashFinish(0.3);
            }
          }

          // ★ 가산합성 32비트 픽셀아트 VFX (검궤·간파·충격파 스프라이트 시트!) ★
          const spVfxSheet = getVfxGridSheet(VFX_SHEETS.SLASH_PARRY, 4, 2);
          if (spVfxSheet && spVfxSheet.frames.length === 8 && !showDarkSlash) {
            // 전투 화면과 같은 합성: 제 색으로 몸통을 그리고 옅은 빛 번짐만 얹는다
            ctx.save();
            if (showParrySpark) {
              const s = 104;
              const cx = Math.round((hx + ex) / 2);
              const cy = Math.round(GY - 66);
              drawGlowSprite(ctx, spVfxSheet.frames[tier >= 3 ? 5 : 4], Math.round(cx - s / 2), Math.round(cy - s / 2), s, s, 1);
            }
            if (showVfx) {
              const s = Math.round((92 + tier * 20) * (isUnarmedSkill ? 0.7 : 1));
              const idx = isUnarmedSkill ? 3 : isCounter || tier >= 4 ? 2 : tier >= 2 ? 1 : 0;
              drawGlowSprite(ctx, spVfxSheet.frames[idx], Math.round(vfxX - s / 2), Math.round(GY - 58 - s / 2), s, s, 1);
            }
            if (showCombo2) {
              const s = Math.round((86 + tier * 18) * (isUnarmedSkill ? 0.7 : 1));
              drawGlowSprite(ctx, spVfxSheet.frames[isUnarmedSkill ? 3 : 2], Math.round(vfxX - s / 2), Math.round(GY - 52 - s / 2), s, s, 1);
            }
            ctx.restore();
          }

          // 필살 반격 암전 일섬 연참 오버레이 (Lv.8+ 대고수 경지 전용 초다이나믹 테이퍼드 연참!)
          if (showDarkSlash) {
            ctx.save();
            const el = t - 740;
            if (el < 480) {
              ctx.fillStyle = el < 400 ? 'rgba(3, 1, 4, 0.94)' : 'rgba(18, 2, 4, 0.92)';
              ctx.fillRect(0, 0, W, H);
              const scars: Array<[number, number, number, number, number, number, boolean]> = [
                [140, 72, 315, 146, 30, 6, false],
                [325, 68, 150, 152, 85, 6, false],
                [135, 118, 335, 108, 135, 7, false],
                [180, 52, 295, 166, 185, 6, false],
                [300, 56, 175, 162, 230, 7, false],
                [35, 168, 405, 42, 300, 12, true],
              ];
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              scars.forEach(([x1, y1, x2, y2, at, hw, isFin]) => {
                if (el < at) return;
                const prog = Math.min(1, (el - at) / 55);
                const ex2 = x1 + (x2 - x1) * prog;
                const ey2 = y1 + (y2 - y1) * prog;
                const mx = (x1 + ex2) / 2;
                const my = (y1 + ey2) / 2;
                const dx = ex2 - x1;
                const dy = ey2 - y1;
                const dist = Math.hypot(dx, dy) || 1;
                const nx = (-dy / dist) * hw;
                const ny = (dx / dist) * hw;
                ctx.fillStyle = isFin ? '#ef4444' : color;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.quadraticCurveTo(mx + nx * 1.4, my + ny * 1.4, ex2, ey2);
                ctx.quadraticCurveTo(mx - nx * 1.4, my - ny * 1.4, x1, y1);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.quadraticCurveTo(mx + nx * 0.5, my + ny * 0.5, ex2, ey2);
                ctx.quadraticCurveTo(mx - nx * 0.5, my - ny * 0.5, x1, y1);
                ctx.fill();
              });
              ctx.restore();
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, W, 24);
              ctx.fillRect(0, H - 20, W, 20);
              ctx.font = 'bold 13px "Noto Serif KR", NeoDunggeunmo, serif';
              ctx.fillStyle = '#fde047';
              ctx.textAlign = 'center';
              ctx.fillText(`극의 절명 반격 · 【${nm}】`, W / 2, 17);
            } else {
              const fade = Math.max(0, 1 - (el - 480) / 200);
              ctx.fillStyle = `rgba(255, 245, 235, ${fade * 0.9})`;
              ctx.fillRect(0, 0, W, H);
            }
            ctx.restore();
          }

          // 고레벨 일섬선
          if (tier >= 3 && !showDarkSlash && (showVfx || showCombo2)) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = tier >= 4 ? 4 : 2.5;
            ctx.beginPath();
            ctx.moveTo(vfxX - 62, showCombo2 ? GY - 28 : GY - 92);
            ctx.lineTo(vfxX + 66, showCombo2 ? GY - 90 : GY - 26);
            ctx.stroke();
            ctx.restore();
          }

          // 문파 외침 말풍선
          if (t >= 220 && t <= 1650 && !skill.isPassive && !showDarkSlash) {
            ctx.save();
            ctx.font = 'bold 11px NeoDunggeunmo, monospace';
            const tw = ctx.measureText(shout).width;
            const pw = Math.max(100, tw + 18);
            const bx = Math.max(pw / 2 + 8, Math.min(W - pw / 2 - 8, hx));
            ctx.fillStyle = isCounter ? 'rgba(92, 18, 16, 0.92)' : 'rgba(20, 13, 8, 0.9)';
            ctx.fillRect(Math.round(bx - pw / 2), 10, Math.round(pw), 22);
            ctx.strokeStyle = isCounter ? '#fde047' : '#d4a359';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(Math.round(bx - pw / 2), 10, Math.round(pw), 22);
            ctx.textAlign = 'center';
            ctx.fillStyle = isCounter ? '#fde047' : '#fff7d6';
            ctx.fillText(shout, bx, 25);
            ctx.restore();
          }

          if (showParrySpark) {
            ctx.font = 'bold 28px "Noto Serif KR", NeoDunggeunmo, serif';
            ctx.fillStyle = '#fde047';
            ctx.textAlign = 'center';
            ctx.fillText('看破!', (hx + ex) / 2, 62);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [state.country, state.gender, state.age, state.sectName, skill, formNumber, replayKey]);

  return (
    <canvas
      ref={canvasRef}
      width={440}
      height={200}
      className="pixel-canvas w-full aspect-[440/200] border-2 border-[#8c6239] bg-[#120c08] block"
    />
  );
};

// 초식 상세보기 + 라이브 동작 시연 모달!
export const SkillDetailModal: React.FC<{
  state: GameState;
  skill: Skill;
  formNumber: number;
  onClose: () => void;
}> = ({ state, skill, formNumber, onClose }) => {
  const [replayKey, setReplayKey] = useState(0);
  const Icon =
    skill.element === 'FIRE'
      ? Flame
      : skill.element === 'ICE'
      ? Snowflake
      : skill.element === 'LIGHTNING'
      ? Zap
      : skill.form === 'PARRY'
      ? Shield
      : Swords;

  const req = MASTERY_EXP_REQ[skill.masteryLevel] || 999;
  const pct = skill.masteryLevel >= 10 ? 100 : Math.min(100, Math.round((skill.masteryExp / req) * 100));
  const cleanSect = state.sectName.replace(/\(.*?\)/g, '').trim() || '무명류';

  const statusLabelMap: Record<string, string> = {
    BURN: '화상(지속 피해)',
    FREEZE: '빙결(속도 저하)',
    SHOCK: '감전(체세 약화)',
    POISON: '중독(지속 피해)',
    STUN: '기절(행동 불가)',
    BLEED: '출혈',
    WEAKEN: '약화',
    SHIELD: '호신강기(보호막)',
    SLOW: '둔화',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2.5 sm:p-4">
      <div className="rpg-window max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-ink">
        <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[#8c6239] bg-[#1b120c]">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="w-4 h-4 text-[#fde68a] shrink-0" />
            <h3 className="font-bold text-sm sm:text-base text-[#fde68a] truncate">
              {skill.customName || skill.name}
            </h3>
            <span className="text-[11px] px-1.5 py-0.5 bg-[#3d291a] border border-[#8c6239] text-amber-300 shrink-0">
              Lv.{skill.masteryLevel} {MASTERY_NAMES[skill.masteryLevel]}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#fde68a] font-bold">
                시연: 「{cleanSect} {skill.form === 'PARRY' ? '반격' : `${formNumber}식`} · {skill.customName || skill.name}!」
              </span>
              <button
                onClick={() => { sound.playClick(); setReplayKey((k) => k + 1); }}
                className="rpg-btn px-2 py-0.5 text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> 다시 보기
              </button>
            </div>
            <SkillPreviewCanvas state={state} skill={skill} formNumber={formNumber} replayKey={replayKey} />
            <div className="text-[11px] text-amber-200/90 bg-[#1b120c] px-2.5 py-1.5 border border-[#5c432c]">
              {getMasteryEvolutionDesc(skill.masteryLevel)}
            </div>
          </div>

          <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-1.5 text-xs">
            <p className="text-[#f5e9ce] leading-relaxed">{skill.description}</p>
            <div className="text-[11px] text-[#c7b394] flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-[#3d291a]">
              <span>출처·창시: <b className="text-[#fde68a]">{skill.creator}</b></span>
              <span>계통: <b className="text-[#fde68a]">{FORM_LABEL[skill.form]}</b></span>
              <span>속성: <b className="text-sky-300">{ELEMENT_LABEL[skill.element]}</b></span>
              <span>궁합 병기: <b className="text-amber-300">{WEAPON_GROUP_LABEL[skill.weapon]}</b></span>
            </div>
          </div>

          {!skill.isPassive && (
            <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
              <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                <div className="text-[10px] text-[#c7b394]">기본 위력</div>
                <div className="font-bold text-[#fde68a]">{skill.power}</div>
              </div>
              <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                <div className="text-[10px] text-[#c7b394]">소모 기력</div>
                <div className="font-bold text-sky-300">{skill.qiCost}</div>
              </div>
              <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                <div className="text-[10px] text-[#c7b394]">사거리</div>
                <div className="font-bold text-emerald-300">{skill.range === 'FAR' ? '원거리' : skill.range === 'MID' ? '중거리' : '근접'}</div>
              </div>
              <div className="bg-[#1b120c] border border-[#5c432c] py-1.5">
                <div className="text-[10px] text-[#c7b394]">체세 파괴</div>
                <div className="font-bold text-amber-300">{skill.postureDamage || 16}</div>
              </div>
            </div>
          )}

          {(skill.form === 'PARRY' || skill.statusEffect || skill.isForbidden || skill.telegraph === 'RED') && (
            <div className="space-y-1.5 text-xs">
              {skill.form === 'PARRY' && (
                <div className="p-2 bg-[#2b2112] border border-amber-400 text-amber-200">
                  ★ <b>반격 특화 초식</b>: 적이 공격을 꽂아 넣는 찰나에 자동 간파(看破) 후 암전 일섬 연참을 발동합니다.
                </div>
              )}
              {skill.telegraph === 'RED' && (
                <div className="p-2 bg-[#381612] border border-rose-400 text-rose-200">
                  ★ <b>방어 파쇄 강공</b>: 상대의 평범한 간파(看破)로 막을 수 없는 일격입니다.
                </div>
              )}
              {skill.statusEffect && (
                <div className="p-2 bg-[#1a2236] border border-sky-400 text-sky-200">
                  ★ <b>특수 효과</b>: 명중 시 {Math.round(skill.statusEffect.chance * 100)}% 확률로 [{statusLabelMap[skill.statusEffect.type] || skill.statusEffect.type}] 부여
                </div>
              )}
              {skill.isForbidden && (
                <div className="p-2 bg-[#3d102a] border border-fuchsia-400 text-fuchsia-200">
                  ⚠ <b>금기 비술</b>: 압도적인 위력을 지니나 시전 시 육체와 수명에 반동이 누적됩니다.
                </div>
              )}
            </div>
          )}

          <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#fde68a] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> 연마 각인 특성 (Lv.3 · 6 · 9)
              </span>
              <span className="text-[11px] text-[#c7b394]">숙련 {pct}%</span>
            </div>
            <div className="h-2 bg-[#120c08] border border-[#5c432c]">
              <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
            </div>

            {skill.imprintedTraits.length === 0 ? (
              <div className="text-[11px] text-[#c7b394] py-1">
                아직 각인된 특성이 없습니다. 이 초식을 Lv.3까지 연마하면 첫 번째 고유 연마 방향을 선택할 수 있습니다.
              </div>
            ) : (
              <div className="space-y-1.5">
                {skill.imprintedTraits.map((tr) => (
                  <div key={tr.id} className="p-2 bg-[#2d1f14] border border-[#d4a359] text-xs">
                    <div className="font-bold text-[#fde68a]">[Lv.{tr.tier} 각인] {tr.label}</div>
                    <div className="text-[11px] text-[#e6d8be] mt-0.5">{tr.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
