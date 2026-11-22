import React, { useEffect, useRef, useState } from 'react';
import { GameState } from '../types/game';
import { COUNTRIES, SEASON_META } from '../data/worldAndEndings';
import {
  getChromaSprite,
  getGridSpriteSheet,
  getHeroWalkSpriteInfo,
  getSpriteSheet,
  loadRawImage,
  preloadAllGameArt,
  ProcessedSprite,
  SpriteSheet,
} from '../pixel/spriteLoader';
import { PixelPortrait } from './PixelPortrait';
import { sound } from '../engine/sound';
import {
  Briefcase,
  ChevronRight,
  Coins,
  Heart,
  Home,
  Menu,
  ScrollText,
  Star,
  Swords,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';

interface Props {
  state: GameState;
  onSceneReady: () => void;
  onOpenTrain: (tab?: 'TRAIN' | 'CRAFT' | 'BOOKS') => void;
  onOpenDojo: () => void;
  onOpenDisciples: () => void;
  onOpenMerchant: () => void;
  onRest: () => void;
  onOddJob: () => void;
  onPracticeSpar: () => void;
  onNextSeason: () => void;
  onReturnTitle: () => void;
}

const WORLD_W = 1024;
const WORLD_H = 576;

interface Hotspot {
  id: 'HALL' | 'LIBRARY' | 'DUMMY' | 'FORGE' | 'CLINIC' | 'GATE' | 'MERCHANT' | 'DISCIPLES';
  label: string;
  x: number;
  y: number;
  radius: number;
}

interface DiscipleAgent {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  walkTick: number;
  practiceStart: number;
  practiceUntil: number;
  bubble?: string;
  bubbleUntil: number;
  nextThink: number;
}

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

const DISCIPLE_LINES = ['횡베기!', '종베기!', '하압!', '더 빠르게!', '기합!'];

export const DojoWorld2D: React.FC<Props> = ({
  state,
  onSceneReady,
  onOpenTrain,
  onOpenDojo,
  onOpenDisciples,
  onOpenMerchant,
  onRest,
  onOddJob,
  onPracticeSpar,
  onNextSeason,
  onReturnTitle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [muted, setMuted] = useState(sound.muted);
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [showGateMenu, setShowGateMenu] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [nearbyHotspot, setNearbyHotspot] = useState<Hotspot | null>(null);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;

  const heroRef = useRef({
    x: 512,
    y: 315,
    facing: 1 as 1 | -1,
    walkTick: 0,
    stepTimer: 0,
    targetX: null as number | null,
    targetY: null as number | null,
    autoInteractId: null as Hotspot['id'] | null,
  });

  const visitorRef = useRef<{
    eventId: string | null;
    spriteSrc: string;
    isSheet: boolean;
    name: string;
    x: number;
    y: number;
    tx: number;
    ty: number;
    arrived: boolean;
    emote?: string;
  }>({
    eventId: null,
    spriteSrc: '/assets/sp_enemy_top.jpg',
    isSheet: false,
    name: '',
    x: 512,
    y: 515,
    tx: 590,
    ty: 315,
    arrived: true,
  });

  useEffect(() => {
    const ev = state.activeEvent;
    if (!ev) {
      visitorRef.current.eventId = null;
      visitorRef.current.arrived = true;
      return;
    }
    const isDisc = ev.sceneActor === 'DISCIPLE';
    const isSpouse = ev.sceneActor === 'SPOUSE';
    const actorSrc =
      ev.sceneActor === 'MERCHANT'
        ? '/assets/sp_merchant_top.jpg'
        : isDisc
        ? '/assets/sheet_walk_disciple.jpg'
        : isSpouse
        ? '/assets/sheet_walk_female.jpg'
        : '/assets/sp_enemy_top.jpg';

    heroRef.current.targetX = null;
    heroRef.current.targetY = null;
    heroRef.current.facing = 1;

    visitorRef.current = {
      eventId: ev.id,
      spriteSrc: actorSrc,
      isSheet: isDisc || isSpouse,
      name: ev.speaker || '방문자',
      x: 512,
      y: 515,
      tx: Math.min(WORLD_W - 140, heroRef.current.x + 88),
      ty: heroRef.current.y,
      arrived: false,
      emote: ev.category === 'DUEL' || ev.category === 'DEBT' ? '!' : '?',
    };
    sound.playDrum();
  }, [state.activeEvent?.id]);

  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const hoveredIdRef = useRef<Hotspot['id'] | null>(null);
  const agentsRef = useRef<DiscipleAgent[]>([]);
  const weatherRef = useRef<WeatherParticle[]>([]);
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    preloadAllGameArt();
  }, []);

  const getHotspots = (st: GameState): Hotspot[] => {
    const list: Hotspot[] = [
      { id: 'HALL', label: '본관', x: 512, y: 145, radius: 100 },
      { id: 'LIBRARY', label: '장서각', x: 168, y: 150, radius: 80 },
      { id: 'DUMMY', label: '수련터', x: 195, y: 315, radius: 80 },
      { id: 'FORGE', label: '대장간', x: 842, y: 155, radius: 84 },
      { id: 'CLINIC', label: '약방', x: 855, y: 355, radius: 84 },
      { id: 'GATE', label: '대문', x: 512, y: 495, radius: 74 },
    ];
    if (st.merchantOffer) {
      list.push({ id: 'MERCHANT', label: '만물객', x: 415, y: 448, radius: 62 });
    }
    if (st.disciples.some((d) => !d.dead) || st.spouse) {
      list.push({ id: 'DISCIPLES', label: '문하생', x: 615, y: 335, radius: 64 });
    }
    return list;
  };

  const triggerInteraction = (id: Hotspot['id']) => {
    if (stateRef.current.activeEvent) return;
    sound.playClick();
    if (id === 'HALL' || id === 'FORGE') onOpenDojo();
    else if (id === 'LIBRARY') onOpenTrain('CRAFT');
    else if (id === 'DUMMY') onOpenTrain('TRAIN');
    else if (id === 'CLINIC') {
      if (stateRef.current.ap > 0) onRest();
      else onOpenDisciples();
    } else if (id === 'MERCHANT') onOpenMerchant();
    else if (id === 'DISCIPLES') onOpenDisciples();
    else if (id === 'GATE') setShowGateMenu(true);
  };

  const triggerInteractRef = useRef(triggerInteraction);
  triggerInteractRef.current = triggerInteraction;

  useEffect(() => {
    const alive = state.disciples.filter((d) => !d.dead).slice(0, 7);
    const existing = new Map(agentsRef.current.map((a) => [a.id, a]));
    agentsRef.current = alive.map((d, idx) => {
      const prev = existing.get(d.id);
      if (prev) return prev;
      const baseX = 330 + (idx % 4) * 95;
      const baseY = 265 + Math.floor(idx / 4) * 95;
      return {
        id: d.id,
        x: baseX,
        y: baseY,
        tx: baseX,
        ty: baseY,
        facing: 1,
        walkTick: 0,
        practiceStart: 0,
        practiceUntil: 0,
        bubbleUntil: 0,
        nextThink: performance.now() + 1200 + idx * 650,
      };
    });
  }, [state.disciples]);

  useEffect(() => {
    const count = state.season === 'SUMMER' ? 50 : 30;
    weatherRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      vx: state.season === 'SUMMER' ? -2.4 : -0.4 - Math.random() * 0.6,
      vy: state.season === 'SUMMER' ? 8.5 : 0.7 + Math.random() * 0.8,
      size: state.season === 'SUMMER' ? 2 : 3 + Math.floor(Math.random() * 2),
    }));
  }, [state.season]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current.activeEvent) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') { keysRef.current.up = true; heroRef.current.targetX = null; }
      if (k === 's' || e.key === 'ArrowDown') { keysRef.current.down = true; heroRef.current.targetX = null; }
      if (k === 'a' || e.key === 'ArrowLeft') { keysRef.current.left = true; heroRef.current.targetX = null; }
      if (k === 'd' || e.key === 'ArrowRight') { keysRef.current.right = true; heroRef.current.targetX = null; }
      if (k === 'e' || e.code === 'Space') {
        const hs = getHotspots(stateRef.current);
        const h = heroRef.current;
        const near = hs.find((spot) => Math.hypot(spot.x - h.x, spot.y - h.y) <= spot.radius + 18);
        if (near) {
          e.preventDefault();
          triggerInteractRef.current(near.id);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keysRef.current.up = false;
      if (k === 's' || e.key === 'ArrowDown') keysRef.current.down = false;
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.left = false;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.right = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { wx: 512, wy: 315 };
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    return {
      wx: (clientX - rect.left) / cam.scale + cam.x,
      wy: (clientY - rect.top) / cam.scale + cam.y,
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (stateRef.current.activeEvent) return;
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const hs = getHotspots(stateRef.current);
    const clickedSpot = hs.find((s) => Math.hypot(s.x - wx, s.y - wy) <= s.radius);
    if (clickedSpot) {
      const dist = Math.hypot(clickedSpot.x - heroRef.current.x, clickedSpot.y - heroRef.current.y);
      if (dist <= clickedSpot.radius + 20) {
        triggerInteraction(clickedSpot.id);
      } else {
        heroRef.current.targetX = Math.max(120, Math.min(WORLD_W - 120, clickedSpot.x));
        heroRef.current.targetY = Math.max(210, Math.min(WORLD_H - 95, clickedSpot.y + 42));
        heroRef.current.autoInteractId = clickedSpot.id;
      }
    } else {
      heroRef.current.targetX = Math.max(115, Math.min(WORLD_W - 115, wx));
      heroRef.current.targetY = Math.max(215, Math.min(WORLD_H - 95, wy));
      heroRef.current.autoInteractId = null;
    }
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const hs = getHotspots(stateRef.current);
    const spot = hs.find((s) => Math.hypot(s.x - wx, s.y - wy) <= s.radius);
    hoveredIdRef.current = spot ? spot.id : null;
  };

  const drawFrameUnit = (
    ctx: CanvasRenderingContext2D,
    frame: ProcessedSprite | null,
    refHeight: number,
    x: number,
    y: number,
    baseHeightPx: number,
    facing: 1 | -1,
    opts?: { label?: string; labelColor?: string; bubble?: string; alertMark?: string; now?: number }
  ) => {
    const now = opts?.now ?? 0;

    // 발밑 그림자
    ctx.fillStyle = 'rgba(10, 7, 4, 0.45)';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), baseHeightPx * 0.28, baseHeightPx * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    let drawnH = baseHeightPx;
    if (frame) {
      // refHeight 기준 스케일 통일 (칼을 들거나 몸을 숙여도 크기 점프 없음!)
      const scaleRatio = baseHeightPx / Math.max(1, refHeight);
      const dw = Math.round(frame.width * scaleRatio);
      const dh = Math.round(frame.height * scaleRatio);
      drawnH = dh;

      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(facing, 1);
      ctx.drawImage(frame.canvas, -dw / 2, -dh + 4, dw, dh);
      ctx.restore();
    }

    if (opts?.alertMark) {
      const fy = Math.sin(now / 160) * 3;
      const col = opts.alertMark === '!' ? '#ef4444' : '#facc15';
      const ex = Math.round(x);
      const ey = Math.round(y - drawnH - 22 + fy);
      ctx.fillStyle = '#18100b';
      ctx.fillRect(ex - 10, ey, 20, 20);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.strokeRect(ex - 10, ey, 20, 20);
      ctx.fillStyle = col;
      ctx.font = 'bold 14px NeoDunggeunmo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(opts.alertMark, ex, ey + 15);
    }

    if (opts?.label) {
      ctx.font = '11px NeoDunggeunmo, monospace';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(opts.label).width;
      ctx.fillStyle = 'rgba(18, 12, 8, 0.78)';
      ctx.fillRect(Math.round(x - tw / 2 - 4), Math.round(y + 5), Math.round(tw + 8), 15);
      ctx.fillStyle = opts.labelColor || '#f5e9ce';
      ctx.fillText(opts.label, Math.round(x), Math.round(y + 16));
    }

    if (opts?.bubble) {
      ctx.font = '11px NeoDunggeunmo, monospace';
      ctx.textAlign = 'center';
      const bw = Math.max(46, ctx.measureText(opts.bubble).width + 12);
      const bx = Math.round(x - bw / 2);
      const by = Math.round(y - drawnH - 24);
      ctx.fillStyle = '#fff9eb';
      ctx.fillRect(bx, by, bw, 20);
      ctx.strokeStyle = '#3b2616';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, 20);
      ctx.fillStyle = '#241911';
      ctx.fillText(opts.bubble, Math.round(x), by + 14);
    }
  };

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastNearbyCheck = 0;

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const st = stateRef.current;
      const h = heroRef.current;
      const k = keysRef.current;

      // 컷신 방문자 입장
      const vis = visitorRef.current;
      if (vis.eventId && !vis.arrived) {
        const dx = vis.tx - vis.x;
        const dy = vis.ty - vis.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10) {
          vis.x = vis.tx;
          vis.y = vis.ty;
          vis.arrived = true;
          onSceneReadyRef.current();
        } else {
          vis.x += (dx / dist) * 240 * dt;
          vis.y += (dy / dist) * 240 * dt;
        }
      }

      // 주인공 이동
      if (!st.activeEvent) {
        let vx = 0;
        let vy = 0;
        const spd = st.disabilities.includes('LIMP') ? 115 : st.age >= 60 ? 160 : 225;

        if (k.left) vx -= 1;
        if (k.right) vx += 1;
        if (k.up) vy -= 1;
        if (k.down) vy += 1;

        if (vx === 0 && vy === 0 && h.targetX !== null && h.targetY !== null) {
          const dx = h.targetX - h.x;
          const dy = h.targetY - h.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 16) {
            h.targetX = null;
            h.targetY = null;
            if (h.autoInteractId) {
              const targetId = h.autoInteractId;
              h.autoInteractId = null;
              triggerInteractRef.current(targetId);
            }
          } else {
            vx = dx / dist;
            vy = dy / dist;
          }
        }

        if (vx !== 0 || vy !== 0) {
          const len = Math.hypot(vx, vy);
          h.x = Math.max(110, Math.min(WORLD_W - 110, h.x + (vx / len) * spd * dt));
          h.y = Math.max(205, Math.min(WORLD_H - 85, h.y + (vy / len) * spd * dt));
          if (Math.abs(vx) > 0.1) h.facing = vx > 0 ? 1 : -1;
          h.walkTick += dt * 8.5;
          h.stepTimer -= dt;
          if (h.stepTimer <= 0) {
            sound.playStep();
            h.stepTimer = 0.28;
          }
        } else {
          h.walkTick = 0;
        }
      } else {
        h.walkTick = 0;
      }

      // 문하생 자율 걷기 + 실제 목검 수련 2프레임(치켜듦 → 베기!)
      agentsRef.current.forEach((ag) => {
        if (now >= ag.nextThink) {
          ag.nextThink = now + 2400 + Math.random() * 3000;
          if (Math.random() < 0.5) {
            ag.practiceStart = now;
            ag.practiceUntil = now + 1100;
            if (Math.random() < 0.35 && !st.activeEvent) {
              ag.bubble = DISCIPLE_LINES[Math.floor(Math.random() * DISCIPLE_LINES.length)];
              ag.bubbleUntil = now + 1800;
            }
          } else {
            ag.tx = 290 + Math.random() * 440;
            ag.ty = 240 + Math.random() * 190;
          }
        }
        const dx = ag.tx - ag.x;
        const dy = ag.ty - ag.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8 && now >= ag.practiceUntil) {
          ag.x += (dx / dist) * 65 * dt;
          ag.y += (dy / dist) * 65 * dt;
          if (Math.abs(dx) > 1) ag.facing = dx > 0 ? 1 : -1;
          ag.walkTick += dt * 6;
        } else {
          ag.walkTick = 0;
        }
      });

      weatherRef.current.forEach((wp) => {
        wp.x += wp.vx;
        wp.y += wp.vy;
        if (wp.y > WORLD_H) { wp.y = -6; wp.x = Math.random() * WORLD_W; }
        if (wp.x < 0) wp.x = WORLD_W;
      });

      if (now - lastNearbyCheck > 150) {
        lastNearbyCheck = now;
        const hs = getHotspots(st);
        const near = hs.find((s) => Math.hypot(s.x - h.x, s.y - h.y) <= s.radius + 18) || null;
        setNearbyHotspot((prev) => (prev?.id === near?.id ? prev : near));
      }

      renderWorld(now, st);
      rafId = requestAnimationFrame(loop);
    };

    const renderWorld = (now: number, st: GameState) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cw = canvas.width;
      const ch = canvas.height;
      ctx.imageSmoothingEnabled = false;

      const isMobile = cw < 720;
      const scale = isMobile ? Math.max(0.85, ch / WORLD_H) : Math.max(cw / WORLD_W, ch / WORLD_H);
      const viewW = cw / scale;
      const viewH = ch / scale;
      let camX = heroRef.current.x - viewW / 2;
      let camY = heroRef.current.y - viewH / 2;
      camX = viewW >= WORLD_W ? -(viewW - WORLD_W) / 2 : Math.max(0, Math.min(WORLD_W - viewW, camX));
      camY = viewH >= WORLD_H ? -(viewH - WORLD_H) / 2 : Math.max(0, Math.min(WORLD_H - viewH, camY));
      cameraRef.current = { x: camX, y: camY, scale };

      ctx.fillStyle = '#120d0a';
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-camX, -camY);

      const mapImg = loadRawImage(st.facilities.yard >= 3 ? '/assets/px_dojo_grand_map.jpg' : '/assets/px_dojo_ruin_map.jpg');
      if (mapImg) ctx.drawImage(mapImg, 0, 0, WORLD_W, WORLD_H);

      if (st.season === 'SUMMER') { ctx.fillStyle = 'rgba(20, 42, 68, 0.14)'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }
      else if (st.season === 'AUTUMN') { ctx.fillStyle = 'rgba(180, 80, 20, 0.12)'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }
      else if (st.season === 'WINTER') { ctx.fillStyle = 'rgba(190, 220, 255, 0.18)'; ctx.fillRect(0, 0, WORLD_W, WORLD_H); }

      // 유파 현판
      const signW = Math.min(168, Math.max(88, st.sectName.length * 13 + 20));
      ctx.fillStyle = 'rgba(22, 14, 9, 0.9)';
      ctx.fillRect(Math.round(512 - signW / 2), 92, signW, 20);
      ctx.strokeStyle = st.facilities.yard >= 3 ? '#f2c96b' : '#8c6239';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(512 - signW / 2), 92, signW, 20);
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 11px NeoDunggeunmo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(st.sectName, 512, 106);

      // 초미니 2~3글자 건물 태그
      const hov = hoveredIdRef.current;
      const drawMiniTag = (id: Hotspot['id'], x: number, y: number, text: string) => {
        const isHov = hov === id;
        ctx.font = '11px NeoDunggeunmo, monospace';
        ctx.textAlign = 'center';
        const w = ctx.measureText(text).width + 10;
        ctx.fillStyle = isHov ? 'rgba(181, 43, 39, 0.95)' : 'rgba(20, 13, 9, 0.72)';
        ctx.fillRect(Math.round(x - w / 2), y, w, 16);
        ctx.strokeStyle = isHov ? '#fde047' : '#a87d44';
        ctx.lineWidth = isHov ? 2 : 1;
        ctx.strokeRect(Math.round(x - w / 2), y, w, 16);
        ctx.fillStyle = isHov ? '#fffbeb' : '#fde68a';
        ctx.fillText(text, x, y + 12);
      };

      if (!st.activeEvent) {
        drawMiniTag('LIBRARY', 168, 198, '장서각');
        drawMiniTag('DUMMY', 195, 368, '수련터');
        drawMiniTag('FORGE', 842, 206, '대장간');
        drawMiniTag('CLINIC', 855, 424, '약방');
        drawMiniTag('GATE', 512, 536, '대문');
      }

      if (heroRef.current.targetX !== null && heroRef.current.targetY !== null) {
        const pulse = Math.sin(now / 120) * 3;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.strokeRect(heroRef.current.targetX - 8 - pulse / 2, heroRef.current.targetY - 8 - pulse / 2, 16 + pulse, 16 + pulse);
      }

      // 국가/성별/3연령대(청년/중년/원로)에 맞춘 18종 멀티프레임 걷기 시트!
      const walkInfo = getHeroWalkSpriteInfo(st.country, st.gender, st.age);
      const heroSheet: SpriteSheet | null = getGridSpriteSheet(walkInfo.src, 4, walkInfo.rows);
      const heroRowOffset = walkInfo.rowIndex * 4;
      const discSheet = getSpriteSheet('/assets/sheet_walk_disciple.jpg', 4);
      const spouseGender = st.spouse?.gender || (st.gender === 'FEMALE' ? 'MALE' : 'FEMALE');
      const spouseWalk = getHeroWalkSpriteInfo(st.country, spouseGender, st.age);
      const spouseSheet = getGridSpriteSheet(spouseWalk.src, 4, spouseWalk.rows);
      const merchSp = getChromaSprite('/assets/sp_merchant_top.jpg');

      const units: Array<{ y: number; draw: () => void }> = [];

      // 주인공 (4프레임 걷기 사이클: 0=대기, 걸을 땐 0→1→0→3!)
      units.push({
        y: heroRef.current.y,
        draw: () => {
          const walkCycle = [0, 1, 0, 3];
          const localIdx = heroRef.current.walkTick > 0 ? walkCycle[Math.floor(heroRef.current.walkTick) % 4] : 0;
          const frame = heroSheet?.frames[heroRowOffset + localIdx] || heroSheet?.frames[0] || null;
          const refH = heroSheet?.refHeight || 180;
          drawFrameUnit(ctx, frame, refH, heroRef.current.x, heroRef.current.y, 82, heroRef.current.facing, {
            label: st.name,
            labelColor: '#fde68a',
            now,
          });
        },
      });

      // 문하생 (4프레임 시트: 0=대기, 1=걷기, 2=목검 치켜듦, 3=목검 휘두름!)
      agentsRef.current.forEach((ag) => {
        const disc = st.disciples.find((d) => d.id === ag.id);
        if (!disc || !discSheet) return;
        let fIdx = 0;
        if (now < ag.practiceUntil) {
          const elapsed = now - ag.practiceStart;
          fIdx = elapsed < 450 ? 2 : 3;
        } else if (ag.walkTick > 0) {
          fIdx = Math.floor(ag.walkTick) % 2;
        }
        units.push({
          y: ag.y,
          draw: () =>
            drawFrameUnit(ctx, discSheet.frames[fIdx], discSheet.refHeight, ag.x, ag.y, 74, ag.facing, {
              label: `${disc.name}${disc.role === 'HEIR' ? '★' : ''}`,
              bubble: now < ag.bubbleUntil ? ag.bubble : undefined,
              now,
            }),
        });
      });

      // 배우자
      if (st.spouse && st.spouse.alive && spouseSheet) {
        units.push({
          y: 410,
          draw: () =>
            drawFrameUnit(ctx, spouseSheet.frames[spouseWalk.rowIndex * 4] || spouseSheet.frames[0], spouseSheet.refHeight, 755, 410, 76, -1, {
              label: `${st.spouse!.name} ♥`,
              labelColor: '#fda4af',
              now,
            }),
        });
      }

      // 만물객
      if (st.merchantOffer && !st.activeEvent && merchSp) {
        units.push({
          y: 455,
          draw: () =>
            drawFrameUnit(ctx, merchSp, merchSp.height, 415, 455, 84, 1, {
              label: '만물객',
              labelColor: '#fb923c',
              alertMark: st.merchantOffer?.hasGrimoire ? '!' : '?',
              now,
            }),
        });
      }

      // 컷신 방문자 NPC
      if (visitorRef.current.eventId) {
        const vis = visitorRef.current;
        const visSheet = vis.isSheet ? getSpriteSheet(vis.spriteSrc, 4) : null;
        const visSp = !vis.isSheet ? getChromaSprite(vis.spriteSrc) : null;
        const visFrame = visSheet
          ? visSheet.frames[vis.arrived ? 0 : Math.floor(now / 140) % 2]
          : visSp;
        const visRefH = visSheet ? visSheet.refHeight : visSp?.height || 180;
        units.push({
          y: vis.y,
          draw: () =>
            drawFrameUnit(ctx, visFrame, visRefH, vis.x, vis.y, 86, vis.x >= heroRef.current.x ? -1 : 1, {
              label: vis.name,
              labelColor: '#fca5a5',
              alertMark: vis.arrived ? vis.emote : undefined,
              now,
            }),
        });
      }

      units.sort((a, b) => a.y - b.y).forEach((u) => u.draw());

      const pColor =
        st.season === 'SPRING' ? '#fbcfe8' : st.season === 'SUMMER' ? 'rgba(186, 230, 253, 0.72)' : st.season === 'AUTUMN' ? '#fb923c' : '#ffffff';
      ctx.fillStyle = pColor;
      weatherRef.current.forEach((wp) => {
        if (st.season === 'SUMMER') ctx.fillRect(Math.round(wp.x), Math.round(wp.y), 2, 12);
        else ctx.fillRect(Math.round(wp.x), Math.round(wp.y), wp.size, wp.size);
      });

      ctx.restore();
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const cMeta = COUNTRIES[state.country];
  const sMeta = SEASON_META[state.season];

  const toggleMute = () => {
    sound.muted = !sound.muted;
    setMuted(sound.muted);
  };

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#120d0a] select-none">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
        className="pixel-canvas block w-full h-full cursor-pointer"
      />

      {!state.activeEvent && (
        <>
          {/* 상단 아이콘 우선 초슬림 HUD (글자 밀림 0%!) */}
          <div className="fixed top-2.5 left-2.5 right-2.5 z-20 pointer-events-none flex items-start justify-between gap-2">
            <div className="pointer-events-auto rpg-window p-1.5 pr-3 flex items-center gap-2.5 bg-[#221710]/92 max-w-[78vw]">
              <PixelPortrait role="HERO" country={state.country} age={state.age} gender={state.gender} size={44} />
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <span className="bg-[#b52b27] text-white px-1.5 py-0.5 text-[10px]">
                    {state.year} {sMeta.label}
                  </span>
                  <span className="font-bold text-[#fde68a] truncate">
                    {state.name} · {state.age}세
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] whitespace-nowrap">
                  <span className="flex items-center gap-0.5 text-emerald-300" title="건강">
                    <Heart className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" /> {state.health}
                  </span>
                  <span className="flex items-center gap-0.5 text-amber-300" title="재화">
                    <Coins className="w-3.5 h-3.5" /> {state.money}
                    {state.debt > 0 && <span className="text-rose-400">(-{state.debt})</span>}
                  </span>
                  <span className="flex items-center gap-0.5 text-rose-300 font-bold" title="행동력 AP">
                    <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                    {'●'.repeat(state.ap)}{'○'.repeat(Math.max(0, state.maxAp - state.ap))}
                  </span>
                  <span className="hidden sm:flex items-center gap-0.5 text-sky-300" title="명성">
                    <Star className="w-3.5 h-3.5 fill-sky-300 text-sky-300" /> {state.fame}
                  </span>
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1">
              <button onClick={() => { sound.playClick(); setShowQuickMenu((v) => !v); }} className="rpg-btn p-2 cursor-pointer" title="메뉴">
                <Menu className="w-4 h-4 text-[#fde68a]" />
              </button>
              <button onClick={() => { sound.playClick(); setShowLogDrawer(true); }} className="rpg-btn p-2 cursor-pointer" title="일지·스탯">
                <ScrollText className="w-4 h-4 text-[#fde68a]" />
              </button>
              <button onClick={toggleMute} className="rpg-btn p-2 cursor-pointer" title="사운드">
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button onClick={onReturnTitle} className="rpg-btn p-2 cursor-pointer" title="타이틀">
                <Home className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showQuickMenu && (
            <div className="fixed top-14 right-2.5 z-30 rpg-window p-2 w-40 space-y-1 animate-ink">
              <button onClick={() => { setShowQuickMenu(false); onOpenTrain('TRAIN'); }} className="w-full rpg-btn py-1.5 px-2 text-xs text-left cursor-pointer">⚔ 연마·장착</button>
              <button onClick={() => { setShowQuickMenu(false); onOpenTrain('CRAFT'); }} className="w-full rpg-btn py-1.5 px-2 text-xs text-left cursor-pointer">📖 조합·서적</button>
              <button onClick={() => { setShowQuickMenu(false); onOpenDojo(); }} className="w-full rpg-btn py-1.5 px-2 text-xs text-left cursor-pointer">🏯 도장·무기</button>
              <button onClick={() => { setShowQuickMenu(false); onOpenDisciples(); }} className="w-full rpg-btn py-1.5 px-2 text-xs text-left cursor-pointer">👥 제자·세평</button>
              <button onClick={() => { setShowQuickMenu(false); setShowGateMenu(true); }} className="w-full rpg-btn py-1.5 px-2 text-xs text-left cursor-pointer">🚪 대련·의뢰</button>
              {state.merchantOffer && (
                <button onClick={() => { setShowQuickMenu(false); onOpenMerchant(); }} className="w-full seal-badge py-1.5 px-2 text-xs text-left cursor-pointer">★ 만물객</button>
              )}
            </div>
          )}

          {/* 하단 중앙: 근처 상호작용 프롬프트만 깔끔하게! */}
          {nearbyHotspot && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20">
              <button
                onClick={() => triggerInteraction(nearbyHotspot.id)}
                className="rpg-window px-4 py-2 text-xs sm:text-sm flex items-center gap-2 border-[#fde047] animate-bob cursor-pointer bg-[#221710]/95 whitespace-nowrap"
              >
                <span className="bg-[#fde047] text-[#1c130c] px-1.5 py-0.5 font-bold text-[10px]">E</span>
                <span className="font-bold text-[#fff8e7]">{nearbyHotspot.label}</span>
              </button>
            </div>
          )}

          {/* 우하단: 다음 계절 */}
          <div className="fixed bottom-3 right-3 z-20 flex flex-col items-end gap-1.5">
            {state.merchantOffer && (
              <button onClick={onOpenMerchant} className="seal-badge px-2.5 py-1 text-xs font-bold animate-bob cursor-pointer">
                ★ 만물객
              </button>
            )}
            <button
              onClick={() => { sound.playDrum(); onNextSeason(); }}
              className="bg-[#b52b27] hover:bg-[#991b1b] text-white border-2 border-[#f2b766] px-3.5 py-2 text-xs sm:text-sm font-bold flex items-center gap-1 shadow-[0_3px_0_#4d100e] cursor-pointer whitespace-nowrap"
            >
              다음 계절 <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 모바일 D-Pad */}
          <div className="fixed bottom-3 left-3 z-20 sm:hidden grid grid-cols-3 gap-1 w-28 h-28 opacity-85">
            <div />
            <button onPointerDown={() => { keysRef.current.up = true; heroRef.current.targetX = null; }} onPointerUp={() => { keysRef.current.up = false; }} onPointerLeave={() => { keysRef.current.up = false; }} className="rpg-btn flex items-center justify-center text-xs">▲</button>
            <div />
            <button onPointerDown={() => { keysRef.current.left = true; heroRef.current.targetX = null; }} onPointerUp={() => { keysRef.current.left = false; }} onPointerLeave={() => { keysRef.current.left = false; }} className="rpg-btn flex items-center justify-center text-xs">◀</button>
            <button onClick={() => nearbyHotspot && triggerInteraction(nearbyHotspot.id)} className="seal-badge flex items-center justify-center text-[10px] font-bold">A</button>
            <button onPointerDown={() => { keysRef.current.right = true; heroRef.current.targetX = null; }} onPointerUp={() => { keysRef.current.right = false; }} onPointerLeave={() => { keysRef.current.right = false; }} className="rpg-btn flex items-center justify-center text-xs">▶</button>
            <div />
            <button onPointerDown={() => { keysRef.current.down = true; heroRef.current.targetX = null; }} onPointerUp={() => { keysRef.current.down = false; }} onPointerLeave={() => { keysRef.current.down = false; }} className="rpg-btn flex items-center justify-center text-xs">▼</button>
            <div />
          </div>
        </>
      )}

      {showGateMenu && (
        <div className="fixed inset-0 z-40 bg-black/65 flex items-center justify-center p-4">
          <div className="rpg-window max-w-xs w-full p-4 space-y-2.5 animate-ink">
            <div className="flex justify-between items-center border-b border-[#8c6239] pb-2">
              <span className="font-bold text-sm text-[#fde68a]">도장 대문</span>
              <button onClick={() => setShowGateMenu(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <button disabled={state.ap < 1} onClick={() => { setShowGateMenu(false); sound.playDrum(); onPracticeSpar(); }} className="w-full rpg-btn py-2.5 px-3 text-xs flex items-center justify-between disabled:opacity-45 cursor-pointer">
              <span className="flex items-center gap-2"><Swords className="w-4 h-4 text-rose-400" /> 타류 대련</span>
              <span className="text-[#fde68a]">⚡1</span>
            </button>
            <button disabled={state.ap < 1} onClick={() => { setShowGateMenu(false); sound.playClick(); onOddJob(); }} className="w-full rpg-btn py-2.5 px-3 text-xs flex items-center justify-between disabled:opacity-45 cursor-pointer">
              <span className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-emerald-400" /> 생계 · 호위</span>
              <span className="text-[#fde68a]">⚡1</span>
            </button>
          </div>
        </div>
      )}

      {showLogDrawer && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-3">
          <div className="rpg-window max-w-lg w-full max-h-[82vh] flex flex-col p-4 space-y-3 animate-ink">
            <div className="flex justify-between items-center border-b border-[#8c6239] pb-2">
              <span className="font-bold text-sm text-[#fde68a]">{state.name} · 「{state.currentTitle}」</span>
              <button onClick={() => setShowLogDrawer(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-6 gap-1.5 text-center text-xs">
              {[['STR', state.stats.str], ['AGI', state.stats.agi], ['VIT', state.stats.vit], ['WIL', state.stats.wil], ['INS', state.stats.ins], ['QI', state.stats.qi]].map(([k, v]) => (
                <div key={String(k)} className="bg-[#1b120c] border border-[#6b4728] py-1.5">
                  <div className="text-[10px] text-[#c7b394]">{k}</div>
                  <div className="font-bold text-[#fde68a]">{v}</div>
                </div>
              ))}
            </div>
            <div className="overflow-y-auto flex-1 space-y-1.5 text-xs pr-1">
              {state.logs.map((lg) => (
                <div key={lg.id} className="bg-[#1b120c]/85 border-l-2 border-[#d4a359] p-2 leading-relaxed">
                  <span className="text-[#c9974c] mr-1.5">[{lg.year} {SEASON_META[lg.season].label}]</span>
                  <span>{lg.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
