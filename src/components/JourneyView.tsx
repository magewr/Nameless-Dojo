import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, JourneyPoi, JourneyPoiKind, Season } from '../types/game';
import { getLeg, getRegion, JourneyRegion, JourneyTerrain } from '../data/journeyRegions';
import { currentLeg, legDays, nextLegs } from '../engine/journey';
import { COUNTRIES, SEASON_META } from '../data/worldAndEndings';
import { getGridSpriteSheet, getHeroWalkSpriteInfo } from '../pixel/spriteLoader';
import { PixelPortrait } from './PixelPortrait';
import { sound } from '../engine/sound';
import { ChevronLeft, ChevronRight, Coins, Footprints, Heart, Home, MapPin, Search, Star } from 'lucide-react';

// 무사수행 필드 — 수묵 담채풍으로 절차 생성한 산수 속을 주인공이 직접 걷는다.

interface Props {
  state: GameState;
  hasOverlay: boolean; // 사건·결과 창이 떠 있으면 조작을 멈춘다
  onSceneReady: () => void;
  onSync: (heroX: number, walkedPx: number) => void;
  onInteract: (poiId: string) => void;
  onChooseLeg: (legId: string) => void;
  onFinish: () => void;
}

const VIEW_H = 576;
const GROUND = 0.8; // 길이 놓인 높이 (화면 높이 비율)
const WALK_SPEED = 230; // px/s
const NEAR = 95; // 살펴볼 수 있는 거리

// ───────── 색 ─────────
function hexToRgb(h: string): [number, number, number] {
  if (h.startsWith('rgb')) {
    const m = h.match(/\d+/g) || ['0', '0', '0'];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
}
function rgbToHex(c: string): string {
  if (c.startsWith('#')) return c;
  const m = c.match(/\d+/g) || ['0', '0', '0'];
  return '#' + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}

const SEASON_TINT: Record<Season, { tint: string; amt: number; foliage: string }> = {
  SPRING: { tint: '#f9a8d4', amt: 0.14, foliage: '#4d7c0f' },
  SUMMER: { tint: '#22c55e', amt: 0.1, foliage: '#166534' },
  AUTUMN: { tint: '#ea580c', amt: 0.22, foliage: '#9a3412' },
  WINTER: { tint: '#e2e8f0', amt: 0.32, foliage: '#334155' },
};

// ───────── 결정론적 잡음 (같은 구간은 언제 봐도 같은 산) ─────────
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
function ridge(x: number, seed: number, freq: number): number {
  return (
    Math.sin(x * freq + seed * 17.3) * 0.5 +
    Math.sin(x * freq * 2.13 + seed * 5.1) * 0.27 +
    Math.sin(x * freq * 4.7 + seed * 9.7) * 0.13 +
    Math.abs(Math.sin(x * freq * 0.53 + seed * 3.3)) * 0.4
  );
}

// ───────── 장소 그리기 ─────────
function drawPoi(ctx: CanvasRenderingContext2D, kind: JourneyPoiKind, x: number, gy: number, country: string, done: boolean, t: number, accent: string) {
  ctx.save();
  ctx.globalAlpha = done ? 0.45 : 1;
  const ink = '#1c1410';
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (kind === 'INN') {
    ctx.fillStyle = '#3f2a1c';
    ctx.fillRect(x - 46, gy - 58, 92, 58);
    ctx.fillStyle = '#26190f';
    ctx.beginPath();
    ctx.moveTo(x - 62, gy - 54);
    ctx.quadraticCurveTo(x, gy - 92, x + 62, gy - 54);
    ctx.lineTo(x + 54, gy - 50);
    ctx.lineTo(x - 54, gy - 50);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(x - 12, gy - 40, 24, 26);
    // 깃발
    ctx.fillStyle = ink;
    ctx.fillRect(x + 54, gy - 104, 3, 104);
    ctx.fillStyle = '#b91c1c';
    const sway = Math.sin(t * 2) * 3;
    ctx.fillRect(x + 57, gy - 100 + sway * 0.2, 22, 34);
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 15px "Noto Serif KR", serif';
    ctx.textAlign = 'center';
    ctx.fillText(country === 'CHINA' ? '客' : country === 'JAPAN' ? '宿' : '酒', x + 68, gy - 78);
    // 등
    ctx.fillStyle = `rgba(251,191,36,${0.6 + Math.sin(t * 3) * 0.2})`;
    ctx.beginPath();
    ctx.arc(x - 40, gy - 46, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'SHRINE') {
    ctx.fillStyle = '#2a1d14';
    ctx.fillRect(x - 30, gy - 50, 60, 50);
    ctx.beginPath();
    ctx.moveTo(x - 58, gy - 46);
    ctx.quadraticCurveTo(x - 30, gy - 58, x, gy - 84);
    ctx.quadraticCurveTo(x + 30, gy - 58, x + 58, gy - 46);
    ctx.closePath();
    ctx.fill();
    if (country === 'JAPAN') {
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(x - 64, gy - 70, 6, 70);
      ctx.fillRect(x + 58, gy - 70, 6, 70);
      ctx.fillRect(x - 74, gy - 76, 148, 7);
      ctx.fillRect(x - 64, gy - 62, 128, 4);
    }
  } else if (kind === 'VISTA') {
    ctx.fillStyle = '#1f1611';
    ctx.beginPath();
    ctx.moveTo(x - 40, gy);
    ctx.lineTo(x - 18, gy - 120);
    ctx.lineTo(x - 4, gy - 150);
    ctx.lineTo(x + 12, gy - 110);
    ctx.lineTo(x + 40, gy);
    ctx.fill();
    const glow = ctx.createRadialGradient(x, gy - 150, 2, x, gy - 150, 60);
    glow.addColorStop(0, `rgba(253,230,138,${done ? 0.15 : 0.55 + Math.sin(t * 2) * 0.15})`);
    glow.addColorStop(1, 'rgba(253,230,138,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 70, gy - 220, 140, 140);
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 18px "Noto Serif KR", serif';
    ctx.textAlign = 'center';
    ctx.fillText('大悟', x, gy - 162);
  } else if (kind === 'TREASURE') {
    ctx.fillStyle = '#2b221c';
    ctx.beginPath();
    ctx.ellipse(x, gy - 18, 34, 22, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 34, gy - 18, 68, 18);
    if (!done) {
      const s = 4 + Math.sin(t * 5) * 2;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(x + 12, gy - 46 - s);
      ctx.lineTo(x + 15, gy - 46);
      ctx.lineTo(x + 12 + s, gy - 43);
      ctx.lineTo(x + 15, gy - 40);
      ctx.lineTo(x + 12, gy - 37 + s);
      ctx.lineTo(x + 9, gy - 40);
      ctx.lineTo(x + 12 - s, gy - 43);
      ctx.lineTo(x + 9, gy - 46);
      ctx.fill();
    }
  } else if (kind === 'MASTER') {
    ctx.fillStyle = '#2a1d14';
    ctx.fillRect(x - 34, gy - 42, 68, 42);
    ctx.fillStyle = '#5b4632';
    ctx.beginPath();
    ctx.moveTo(x - 46, gy - 38);
    ctx.lineTo(x, gy - 74);
    ctx.lineTo(x + 46, gy - 38);
    ctx.fill();
    // 굴뚝 연기
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.6 + i * 0.25) % 1;
      ctx.fillStyle = `rgba(226,232,240,${0.35 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(x + 24 + Math.sin(ph * 6 + i) * 6, gy - 80 - ph * 50, 6 + ph * 10, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'HISTORY') {
    for (let i = 0; i < 3; i++) {
      const fx = x - 30 + i * 30;
      ctx.fillStyle = ink;
      ctx.fillRect(fx, gy - 96 + i * 6, 3, 96 - i * 6);
      ctx.fillStyle = i === 1 ? accent : '#7f1d1d';
      const w = Math.sin(t * 2.5 + i) * 4;
      ctx.beginPath();
      ctx.moveTo(fx + 3, gy - 94 + i * 6);
      ctx.lineTo(fx + 30 + w, gy - 86 + i * 6);
      ctx.lineTo(fx + 3, gy - 70 + i * 6);
      ctx.fill();
    }
    // 사람들
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = ink;
      const px = x - 44 + i * 22;
      ctx.beginPath();
      ctx.arc(px, gy - 30, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px - 5, gy - 25, 10, 25);
    }
  } else if (kind === 'ECHO') {
    const glow = ctx.createRadialGradient(x, gy - 30, 2, x, gy - 30, 50);
    glow.addColorStop(0, `rgba(192,132,252,${0.7 + Math.sin(t * 3) * 0.2})`);
    glow.addColorStop(1, 'rgba(192,132,252,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 60, gy - 90, 120, 100);
    ctx.fillStyle = '#2a1d14';
    ctx.fillRect(x - 10, gy - 44, 20, 44);
    ctx.fillRect(x - 16, gy - 48, 32, 6);
  } else {
    // PEOPLE — 길가에 선 사람
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(x, gy - 52, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 12, gy);
    ctx.lineTo(x - 7, gy - 44);
    ctx.lineTo(x + 7, gy - 44);
    ctx.lineTo(x + 12, gy);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, gy - 58, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 나라별 길가 소품
function drawRoadProp(ctx: CanvasRenderingContext2D, country: string, x: number, gy: number, kind: number) {
  ctx.save();
  ctx.fillStyle = '#21170f';
  if (country === 'KOREA') {
    if (kind === 0) {
      // 장승 한 쌍
      for (const dx of [-12, 12]) {
        ctx.fillRect(x + dx - 5, gy - 60, 10, 60);
        ctx.beginPath();
        ctx.ellipse(x + dx, gy - 64, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // 서낭당 돌무더기
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(x - 14 + (i % 3) * 14, gy - 6 - Math.floor(i / 3) * 10, 9, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(x - 1, gy - 50, 2, 34);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(x + 1, gy - 48, 10, 4);
    }
  } else if (country === 'CHINA') {
    if (kind === 0) {
      // 패루
      ctx.fillRect(x - 40, gy - 76, 7, 76);
      ctx.fillRect(x + 33, gy - 76, 7, 76);
      ctx.beginPath();
      ctx.moveTo(x - 56, gy - 76);
      ctx.quadraticCurveTo(x, gy - 92, x + 56, gy - 76);
      ctx.lineTo(x + 46, gy - 70);
      ctx.lineTo(x - 46, gy - 70);
      ctx.fill();
    } else {
      // 이정 석비
      ctx.fillRect(x - 7, gy - 44, 14, 44);
      ctx.beginPath();
      ctx.arc(x, gy - 44, 7, Math.PI, 0);
      ctx.fill();
    }
  } else {
    if (kind === 0) {
      // 석등
      ctx.fillRect(x - 4, gy - 36, 8, 36);
      ctx.fillRect(x - 12, gy - 52, 24, 16);
      ctx.beginPath();
      ctx.moveTo(x - 16, gy - 52);
      ctx.lineTo(x, gy - 66);
      ctx.lineTo(x + 16, gy - 52);
      ctx.fill();
    } else {
      // 이정표 기둥
      ctx.fillRect(x - 4, gy - 70, 8, 70);
      ctx.fillStyle = '#d6cbb8';
      ctx.fillRect(x - 3, gy - 66, 6, 40);
    }
  }
  ctx.restore();
}

function drawPine(ctx: CanvasRenderingContext2D, x: number, gy: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x - 2, gy - h * 0.35, 4, h * 0.35);
  for (let i = 0; i < 3; i++) {
    const w = h * (0.42 - i * 0.1);
    const y = gy - h * (0.3 + i * 0.22);
    ctx.beginPath();
    ctx.ellipse(x + (i % 2 ? 6 : -6), y, w, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, gy: number, s: number, country: string, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x - 26 * s, gy - 28 * s, 52 * s, 28 * s);
  ctx.beginPath();
  if (country === 'JAPAN') {
    ctx.moveTo(x - 34 * s, gy - 26 * s);
    ctx.lineTo(x, gy - 50 * s);
    ctx.lineTo(x + 34 * s, gy - 26 * s);
  } else {
    ctx.moveTo(x - 38 * s, gy - 30 * s);
    ctx.quadraticCurveTo(x, gy - (country === 'CHINA' ? 34 : 46) * s, x + 38 * s, gy - 30 * s);
    ctx.lineTo(x + 30 * s, gy - 26 * s);
    ctx.lineTo(x - 30 * s, gy - 26 * s);
  }
  ctx.fill();
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}

export const JourneyView: React.FC<Props> = ({ state, hasOverlay, onSceneReady, onSync, onInteract, onChooseLeg, onFinish }) => {
  const j = state.journey!;
  const region = getRegion(j.regionId);
  const leg = currentLeg(state) || getLeg(region, j.legId);
  const cMeta = COUNTRIES[state.country];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const heroXRef = useRef(j.heroX);
  const walkedRef = useRef(0);
  const keysRef = useRef({ left: false, right: false });
  const facingRef = useRef<1 | -1>(1);
  const walkTickRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const [viewW, setViewW] = useState(1024);
  const [nearPoi, setNearPoi] = useState<JourneyPoi | null>(null);
  const [confirmHome, setConfirmHome] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const overlayRef = useRef(hasOverlay);
  overlayRef.current = hasOverlay;

  // 구간이 바뀌면 주인공을 그 구간의 출발점으로
  useEffect(() => {
    heroXRef.current = j.heroX;
    walkedRef.current = 0;
  }, [j.legCount]);

  // 길 위의 사건은 누가 대문으로 걸어 들어오는 연출이 없다 — 사건이 뜨면 곧바로 장면 준비 완료.
  useEffect(() => {
    const t = setTimeout(onSceneReady, 120);
    return () => clearTimeout(t);
  }, [state.activeEvent?.id]);

  const atFork = !!j.atFork;
  const outOfDays = j.day >= j.maxDays - 0.01;
  const forkOptions = useMemo(() => (atFork ? nextLegs(state) : []), [atFork, j.legId]);
  const blocked = hasOverlay || atFork || outOfDays || confirmHome;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  // 크기 맞추기
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.max(560, Math.min(1400, Math.round((r.width / Math.max(1, r.height)) * VIEW_H)));
      setViewW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 키보드
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.left = true;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.right = true;
      if ((k === 'e' || e.key === ' ' || e.key === 'Enter') && !blockedRef.current) {
        const p = findNear();
        if (p) {
          e.preventDefault();
          interact(p);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.left = false;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const findNear = (): JourneyPoi | null => {
    const js = stateRef.current.journey;
    if (!js) return null;
    let best: JourneyPoi | null = null;
    let bestD = NEAR;
    js.pois.forEach((p) => {
      const d = Math.abs(p.x - heroXRef.current);
      if (!p.done && d < bestD) {
        best = p;
        bestD = d;
      }
    });
    return best;
  };

  const flush = () => {
    if (walkedRef.current > 0) {
      onSync(heroXRef.current, walkedRef.current);
      walkedRef.current = 0;
    }
  };

  const interact = (p: JourneyPoi) => {
    flush();
    sound.playClick();
    keysRef.current.left = false;
    keysRef.current.right = false;
    onInteract(p.id);
  };

  // 그리기 + 이동 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let syncAcc = 0;
    let nearAcc = 0;
    const seed = hashSeed(`${j.regionId}|${j.legId}`);
    const terrain: JourneyTerrain = leg.terrain;
    const pal = region.palette;
    const st0 = stateRef.current;
    const season = SEASON_TINT[st0.season];
    const walkInfo = getHeroWalkSpriteInfo(st0.country, st0.gender, st0.age);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const st = stateRef.current;
      const js = st.journey;
      if (!js) return;
      const W = canvas.width;
      const H = canvas.height;
      const gy = Math.round(H * GROUND);

      // ── 이동 ──
      let moving = false;
      if (!blockedRef.current) {
        const dir = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
        if (dir !== 0) {
          const nx = Math.max(40, Math.min(js.legLength, heroXRef.current + dir * WALK_SPEED * dt));
          const moved = Math.abs(nx - heroXRef.current);
          if (moved > 0) {
            heroXRef.current = nx;
            walkedRef.current += moved;
            facingRef.current = dir > 0 ? 1 : -1;
            walkTickRef.current += dt * 7;
            moving = true;
          }
        }
      }
      syncAcc += dt;
      if (syncAcc > 0.35 || (heroXRef.current >= js.legLength - 4 && walkedRef.current > 0)) {
        syncAcc = 0;
        if (walkedRef.current > 0) {
          onSync(heroXRef.current, walkedRef.current);
          walkedRef.current = 0;
        }
      }
      nearAcc += dt;
      if (nearAcc > 0.12) {
        nearAcc = 0;
        const p = findNear();
        setNearPoi((prev) => (prev?.id === p?.id && prev?.done === p?.done ? prev : p));
      }

      const heroX = heroXRef.current;
      const cam = Math.max(0, Math.min(js.legLength + 120 - W, heroX - W * 0.38));
      const prog = Math.min(1, heroX / Math.max(1, js.legLength)); // 구간 안에서의 하루: 아침 → 저녁

      // ── 하늘 ──
      const skyTop = mix(mix(mix(pal.sky[0], pal.sky[1], 0.45), season.tint, season.amt * 0.6), '#0b0a14', Math.max(0, prog - 0.78) * 2);
      const skyBot = mix(mix(pal.sky[1], season.tint, season.amt), prog > 0.7 ? '#f97316' : pal.sky[1], Math.max(0, prog - 0.7) * 2);
      const sky = ctx.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, skyTop);
      sky.addColorStop(1, skyBot);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // 해 / 달
      const sunX = W * (0.15 + prog * 0.7);
      const sunY = H * (0.42 - Math.sin(prog * Math.PI) * 0.28);
      ctx.fillStyle = prog > 0.82 ? 'rgba(254,243,199,0.85)' : 'rgba(254,215,170,0.8)';
      ctx.beginPath();
      ctx.arc(sunX, sunY, prog > 0.82 ? 16 : 24, 0, Math.PI * 2);
      ctx.fill();

      // ── 먼 산 ──
      const layers: Array<{ par: number; base: number; amp: number; freq: number; col: string; snow?: boolean }> = [
        { par: 0.08, base: 0.46, amp: 0.22, freq: 0.0025, col: mix(pal.far, rgbToHex(skyBot), 0.4), snow: st.season === 'WINTER' },
        { par: 0.2, base: 0.56, amp: terrain === 'MOUNTAIN' || terrain === 'PASS' ? 0.24 : 0.13, freq: 0.004, col: mix(pal.far, rgbToHex(skyBot), 0.12) },
        { par: 0.4, base: 0.62, amp: terrain === 'COAST' || terrain === 'RIVER' ? 0.06 : 0.12, freq: 0.006, col: mix(pal.mid, season.foliage, 0.25) },
      ];
      layers.forEach((L, li) => {
        ctx.fillStyle = L.col;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        for (let x = 0; x <= W + 8; x += 8) {
          const wx = x + cam * L.par;
          const y = H * L.base - ridge(wx, seed + li, L.freq) * H * L.amp;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, gy);
        ctx.closePath();
        ctx.fill();
        if (L.snow) {
          ctx.fillStyle = 'rgba(248,250,252,0.55)';
          for (let x = 0; x <= W; x += 8) {
            const wx = x + cam * L.par;
            const y = H * L.base - ridge(wx, seed + li, L.freq) * H * L.amp;
            if (y < H * (L.base - L.amp * 0.6)) ctx.fillRect(x, y, 8, 6);
          }
        }
        // 운무
        if (li < 2) {
          const mist = ctx.createLinearGradient(0, H * (L.base - 0.04), 0, H * (L.base + 0.08));
          mist.addColorStop(0, 'rgba(255,255,255,0)');
          mist.addColorStop(0.5, `rgba(241,245,249,${0.28 + Math.sin(t * 0.3 + li) * 0.05})`);
          mist.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = mist;
          ctx.fillRect(0, H * (L.base - 0.04), W, H * 0.12);
        }
      });

      // ── 가까운 경치 (지형별) ──
      const nearPar = 0.7;
      const nearCol = mix(pal.near, season.foliage, 0.35);
      if (terrain === 'COAST' || terrain === 'RIVER') {
        // 물
        const wy = gy - (terrain === 'COAST' ? 70 : 34);
        const water = ctx.createLinearGradient(0, wy, 0, gy);
        water.addColorStop(0, mix(rgbToHex(skyBot), '#0c4a6e', 0.45));
        water.addColorStop(1, '#0c4a6e');
        ctx.fillStyle = water;
        ctx.fillRect(0, wy, W, gy - wy);
        ctx.strokeStyle = 'rgba(226,232,240,0.35)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 18; i++) {
          const wx = ((i * 137 - cam * nearPar + t * 14) % (W + 80) + W + 80) % (W + 80) - 40;
          const wyy = wy + 8 + ((i * 53) % Math.max(1, gy - wy - 12));
          ctx.beginPath();
          ctx.moveTo(wx, wyy);
          ctx.quadraticCurveTo(wx + 10, wyy - 3, wx + 22, wyy);
          ctx.stroke();
        }
      }
      for (let i = -1; i < W / 70 + 2; i++) {
        const wx = Math.floor((cam * nearPar) / 70) * 70 + i * 70;
        const sx = wx - cam * nearPar;
        const r = hashSeed(`${seed}|${wx}`);
        if (terrain === 'TOWN' && r < 0.55) {
          drawHouse(ctx, sx, gy - 6, 0.8 + r * 0.6, st.country, mix(pal.near, '#000000', 0.2));
        } else if ((terrain === 'FOREST' && r < 0.9) || ((terrain === 'MOUNTAIN' || terrain === 'PASS') && r < 0.55) || r < 0.28) {
          drawPine(ctx, sx, gy - 4, 70 + r * (terrain === 'FOREST' ? 110 : 60), nearCol);
        } else if (terrain === 'TEMPLE' && r > 0.85) {
          drawHouse(ctx, sx, gy - 6, 1.1, st.country, mix(pal.near, '#000000', 0.3));
        }
      }

      // ── 길 ──
      ctx.fillStyle = mix(pal.ground, season.tint, season.amt * 0.5);
      ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = mix(pal.ground, '#000000', 0.25);
      ctx.fillRect(0, gy, W, 4);
      for (let i = 0; i < 40; i++) {
        const wx = ((i * 97 - cam) % (W + 40) + W + 40) % (W + 40);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(wx, gy + 10 + ((i * 31) % Math.max(1, H - gy - 14)), 6 + (i % 3) * 4, 2);
      }

      // 길가 소품
      const propEvery = 900;
      for (let px = Math.floor(cam / propEvery) * propEvery + 300; px < cam + W + propEvery; px += propEvery) {
        drawRoadProp(ctx, st.country, px - cam, gy, Math.floor(hashSeed(`${seed}${px}`) * 2));
      }

      // 구간 끝 — 갈림길 이정표
      const endX = js.legLength - cam;
      if (endX > -60 && endX < W + 60) {
        ctx.fillStyle = '#21170f';
        ctx.fillRect(endX - 3, gy - 90, 6, 90);
        ctx.fillRect(endX - 3, gy - 84, 46, 14);
        ctx.fillRect(endX - 43, gy - 62, 46, 14);
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 12px "Noto Serif KR", serif';
        ctx.textAlign = 'center';
        ctx.fillText(leg.next.length > 0 ? '갈림길' : '길의 끝', endX, gy - 98);
      }

      // ── 장소 ──
      js.pois.forEach((p) => {
        const sx = p.x - cam;
        if (sx < -120 || sx > W + 120) return;
        drawPoi(ctx, p.kind, sx, gy, st.country, !!p.done, t, pal.accent);
        const near = !p.done && Math.abs(p.x - heroX) < NEAR;
        ctx.font = `bold ${near ? 14 : 12}px "Noto Serif KR", serif`;
        ctx.textAlign = 'center';
        const label = p.done ? `${p.label} (다녀감)` : p.label;
        const lw = ctx.measureText(label).width + 14;
        const ly = gy - (p.kind === 'VISTA' ? 196 : p.kind === 'HISTORY' || p.kind === 'INN' ? 124 : 104);
        ctx.fillStyle = near ? 'rgba(127,29,29,0.92)' : 'rgba(20,13,9,0.72)';
        ctx.fillRect(sx - lw / 2, ly - 15, lw, 21);
        ctx.fillStyle = near ? '#fff7ed' : p.done ? '#a8a29e' : '#fde68a';
        ctx.fillText(label, sx, ly);
      });

      // ── 주인공 ──
      const sheet = getGridSpriteSheet(walkInfo.src, 4, walkInfo.rows);
      const cycle = [0, 1, 0, 3];
      const fi = moving ? cycle[Math.floor(walkTickRef.current) % 4] : 0;
      const frame = sheet?.frames[walkInfo.rowIndex * 4 + fi] || sheet?.frames[0];
      const hx = heroX - cam;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(hx, gy + 2, 26, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (frame && sheet) {
        const hPx = 118;
        const ratio = hPx / Math.max(1, sheet.refHeight);
        const dw = frame.width * ratio;
        const dh = frame.height * ratio;
        ctx.save();
        ctx.translate(Math.round(hx), gy + 4);
        ctx.scale(facingRef.current, 1);
        ctx.drawImage(frame.canvas, -dw / 2, -dh, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#1c1410';
        ctx.fillRect(hx - 10, gy - 70, 20, 70);
      }

      // ── 날씨 ──
      const ps = particlesRef.current;
      const want = st.season === 'WINTER' ? 120 : st.season === 'SUMMER' ? 90 : st.season === 'AUTUMN' ? 40 : 50;
      while (ps.length < want) {
        ps.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, r: Math.random(), life: Math.random() });
      }
      ps.forEach((p) => {
        if (st.season === 'SUMMER') {
          p.vy = 620;
          p.vx = -90;
        } else if (st.season === 'WINTER') {
          p.vy = 40 + p.r * 50;
          p.vx = -30 + Math.sin(t + p.r * 10) * 30;
        } else if (st.season === 'AUTUMN') {
          p.vy = 50 + p.r * 30;
          p.vx = -40 + Math.sin(t * 2 + p.r * 10) * 50;
        } else {
          p.vy = 30 + p.r * 25;
          p.vx = -20 + Math.sin(t * 1.5 + p.r * 10) * 40;
        }
        p.x += (p.vx - (moving ? facingRef.current * WALK_SPEED * 0.3 : 0)) * dt;
        p.y += p.vy * dt;
        if (p.y > H) {
          p.y = -10;
          p.x = Math.random() * W;
        }
        if (p.x < -20) p.x = W + 10;
        if (p.x > W + 20) p.x = -10;
        if (st.season === 'SUMMER') {
          ctx.strokeStyle = 'rgba(191,219,254,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 4, p.y + 14);
          ctx.stroke();
        } else {
          ctx.fillStyle = st.season === 'WINTER' ? 'rgba(248,250,252,0.85)' : st.season === 'AUTUMN' ? (p.r > 0.5 ? '#c2410c' : '#ca8a04') : 'rgba(251,207,232,0.9)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, st.season === 'WINTER' ? 1.5 + p.r * 1.5 : 3, st.season === 'WINTER' ? 1.5 + p.r * 1.5 : 2, t * 2 + p.r * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 수묵 비네팅
      const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(12,8,5,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [j.legId, j.regionId, viewW, state.season]);

  const dayInt = Math.floor(j.day);
  const dayPct = Math.min(100, (j.day / j.maxDays) * 100);
  const legPct = Math.min(100, (j.heroX / Math.max(1, j.legLength)) * 100);

  const holdBtn = (dir: 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      keysRef.current[dir] = true;
    },
    onPointerUp: () => (keysRef.current[dir] = false),
    onPointerLeave: () => (keysRef.current[dir] = false),
    onPointerCancel: () => (keysRef.current[dir] = false),
  });

  return (
    <div className="fixed inset-0 flex flex-col bg-[#120d0a] text-[#f5e9ce] overflow-hidden select-none">
      {/* 상단 HUD */}
      <header className="shrink-0 bg-[#1e1510] border-b-2 border-[#8c6239] px-2 sm:px-4 py-1.5 z-20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <PixelPortrait role="HERO" country={state.country} age={state.age} gender={state.gender} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                <span className="font-bold text-[#fde68a]">{state.name}</span>
                <span className="bg-[#b52b27] text-white px-1.5 py-0.5 text-[10px] font-bold">
                  {state.year} {SEASON_META[state.season].label}
                </span>
                <span className="text-[10px] text-[#c7b394] hidden sm:inline">무사수행 {state.flags.journeyCount || 1}번째</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[#e6d8be] truncate">
                <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="font-bold truncate">
                  {region.name}({region.hanja}) · {leg.name}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-[11px] shrink-0">
            <span className="flex items-center gap-0.5 text-amber-300">
              <Coins className="w-3 h-3" /> {state.money}
              {cMeta.currency}
            </span>
            <span className="flex items-center gap-0.5 text-rose-300">
              <Heart className="w-3 h-3" /> {state.health}
            </span>
            <span className="hidden sm:flex items-center gap-0.5 text-sky-300">
              <Star className="w-3 h-3" /> {state.fame}
            </span>
            <button
              onClick={() => setConfirmHome(true)}
              className="rpg-btn px-2 py-1 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="무사수행을 끝내고 도장으로 돌아간다"
            >
              <Home className="w-3 h-3" /> <span className="hidden sm:inline">귀환</span>
            </button>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px]">
          <Footprints className="w-3 h-3 text-[#c9974c] shrink-0" />
          <div className="flex-1 h-1.5 bg-[#120c08] border border-[#5c432c] relative">
            <div className="h-full bg-[#c9974c]" style={{ width: `${dayPct}%` }} />
          </div>
          <span className="shrink-0 font-bold text-[#fde68a]">
            {dayInt}/{j.maxDays}일
          </span>
          <span className="shrink-0 text-[#c7b394] hidden sm:inline">· 이 구간 {Math.round(legPct)}%</span>
        </div>
      </header>

      {/* 필드 */}
      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          width={viewW}
          height={VIEW_H}
          className="absolute inset-0 w-full h-full"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* 풍문 */}
        {j.lastRumor && !hasOverlay && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[92%] max-w-2xl bg-[#140d09]/80 border border-[#5c432c] px-3 py-1.5 text-[11px] sm:text-xs text-[#e6d8be] italic text-center pointer-events-none">
            “{j.lastRumor}”
          </div>
        )}

        {/* 갈림길 */}
        {atFork && !outOfDays && !hasOverlay && (
          <div className="absolute inset-0 z-10 bg-black/55 flex items-center justify-center p-4">
            <div className="rpg-window max-w-lg w-full p-4 space-y-3 animate-ink">
              <div className="text-center">
                <div className="seal-badge inline-block text-[11px] px-2 py-0.5">{forkOptions.length > 0 ? '갈림길' : '길의 끝'}</div>
                <h3 className="text-lg font-bold text-[#fde68a] mt-1">{forkOptions.length > 0 ? '어느 길로 갈 것인가' : `${region.name}의 깊은 곳에 닿았다`}</h3>
                <p className="text-[11px] text-[#c7b394]">
                  남은 날 {Math.max(0, j.maxDays - dayInt)}일
                </p>
              </div>
              {forkOptions.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    sound.playClick();
                    onChooseLeg(o.id);
                  }}
                  className="w-full rpg-btn text-left p-3 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#fde68a]">{o.name}</span>
                    <span className="text-[10px] text-[#c7b394]">약 {legDays(o)}일</span>
                  </div>
                  <div className="text-[11px] text-[#e6d8be] mt-0.5">{o.hint}</div>
                </button>
              ))}
              <button onClick={onFinish} className="w-full seal-badge py-2 font-bold text-sm cursor-pointer">
                {forkOptions.length > 0 ? '여기서 발길을 돌린다' : '귀로에 오른다'}
              </button>
            </div>
          </div>
        )}

        {/* 계절이 다했다 */}
        {outOfDays && !hasOverlay && (
          <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4">
            <div className="rpg-window max-w-md w-full p-5 text-center space-y-3 animate-ink">
              <h3 className="text-lg font-bold text-[#fde68a]">한 계절이 저물었다</h3>
              <p className="text-xs text-[#e6d8be]">길 위의 날들이 다했다. 이제 도장으로 돌아갈 때다.</p>
              <button onClick={onFinish} className="w-full seal-badge py-2.5 font-bold cursor-pointer">
                귀로에 오른다
              </button>
            </div>
          </div>
        )}

        {/* 귀환 확인 */}
        {confirmHome && (
          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
            <div className="rpg-window max-w-sm w-full p-4 text-center space-y-3">
              <h3 className="font-bold text-[#fde68a]">무사수행을 끝내고 돌아가겠습니까?</h3>
              <p className="text-[11px] text-[#c7b394]">남은 {Math.max(0, j.maxDays - dayInt)}일은 버려집니다.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmHome(false)} className="flex-1 rpg-btn py-2 text-sm cursor-pointer">
                  계속 걷는다
                </button>
                <button
                  onClick={() => {
                    setConfirmHome(false);
                    flush();
                    onFinish();
                  }}
                  className="flex-1 seal-badge py-2 text-sm font-bold cursor-pointer"
                >
                  돌아간다
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 조작 */}
      <footer className="shrink-0 bg-[#1e1510] border-t-2 border-[#8c6239] px-2 py-2 z-20">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <button {...holdBtn('left')} className="rpg-btn w-14 h-12 flex items-center justify-center cursor-pointer touch-none" aria-label="왼쪽으로 걷기">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            disabled={!nearPoi || blocked}
            onClick={() => nearPoi && interact(nearPoi)}
            className={`flex-1 h-12 font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 ${nearPoi && !blocked ? 'seal-badge' : 'rpg-btn'}`}
          >
            <Search className="w-4 h-4" />
            {nearPoi ? `${nearPoi.label} 살펴보기` : '← → 로 걷다가 장소에 다가가면 살펴볼 수 있다'}
            <span className="hidden sm:inline text-[10px] opacity-70">[E]</span>
          </button>
          <button {...holdBtn('right')} className="rpg-btn w-14 h-12 flex items-center justify-center cursor-pointer touch-none" aria-label="오른쪽으로 걷기">
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </footer>
    </div>
  );
};
