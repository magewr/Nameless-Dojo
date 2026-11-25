import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, JourneyPoi } from '../types/game';
import { getLeg, getRegion } from '../data/journeyRegions';
import { findPath, getJourneyMap, JourneyMap, TILE_INFO, tileAt, tileDays, walkable, zoneLegAt } from '../data/journeyMap';
import { atEntrance, poiHere } from '../engine/journey';
import { COUNTRIES, SEASON_META } from '../data/worldAndEndings';
import { drawEntranceSprite, drawFieldHero, drawPoiAlert, drawPoiSprite, paintFieldFog, paintFieldGround, paintFieldObjects, TILE_PX } from '../pixel/journeyMapPainter';
import { PixelPortrait } from './PixelPortrait';
import { sound } from '../engine/sound';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Footprints, Heart, Home, Map as MapIcon, MapPin, Search, Star } from 'lucide-react';

// 무사수행 필드 — 스타듀 밸리 같은 16×16 도트 필드 위를 위·아래·왼쪽·오른쪽으로 한 칸씩 걷는다.
// 지도 위에는 글자를 쓰지 않는다. 장소는 그림과 머리 위 「!」로 알아보고, 이름은 아래 창에 뜬다.
// 장소를 밟으면 사건이 열리고, 걷는 동안 돌발 사건이 끼어든다. 칸마다 땅에 따라 날수가 든다.

interface Props {
  state: GameState;
  hasOverlay: boolean; // 사건·결과 창이 떠 있으면 조작을 멈춘다
  onSceneReady: () => void;
  onStep: (dx: number, dy: number) => void;
  onInteract: (poiId: string) => void;
  onFinish: () => void;
}

const T = TILE_PX; // 월드 좌표의 한 칸 = 도트 16개. 화면에는 정수 배로 키워 그린다.
const STEP_MS = 160; // 한 걸음에 걸리는 시간

type Dir = 'up' | 'down' | 'left' | 'right';
const DIR_VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

interface Particle {
  x: number;
  y: number;
  r: number;
}

export const JourneyView: React.FC<Props> = ({ state, hasOverlay, onSceneReady, onStep, onInteract, onFinish }) => {
  const j = state.journey!;
  const region = getRegion(j.regionId);
  const map: JourneyMap = useMemo(() => getJourneyMap(j.regionId), [j.regionId]);
  const leg = getLeg(region, j.legId);
  const cMeta = COUNTRIES[state.country];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ w: 960, h: 560, dpr: 1 });
  const [mapMode, setMapMode] = useState(false);
  const [confirmHome, setConfirmHome] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null); // 마우스가 가리키는 칸

  const stateRef = useRef(state);
  stateRef.current = state;
  const visRef = useRef({ x: j.pos.x, y: j.pos.y }); // 화면에 그려지는 주인공 위치 (칸 단위, 걸음 사이를 보간)
  const lastStepRef = useRef(0);
  const heldRef = useRef<Dir[]>([]); // 누르고 있는 방향 (마지막에 누른 것이 우선)
  const tapRef = useRef<Dir[]>([]); // 짧게 누른 방향들 — 다음 프레임 전에 떼어도 누른 만큼 걷는다 (두 걸음까지 미리 받는다)
  const pathRef = useRef<Array<{ x: number; y: number }>>([]); // 지도를 눌러 정한 목적지까지의 걸음
  const walkTickRef = useRef(0);
  const zoomRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const camRef = useRef({ x: 0, y: 0, z: 3 });
  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  const outOfDays = j.day >= j.maxDays - 0.01;
  const blocked = hasOverlay || outOfDays || confirmHome;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const mapModeRef = useRef(mapMode);
  mapModeRef.current = mapMode;

  // 길 위의 사건은 누가 대문으로 걸어 들어오는 연출이 없다 — 사건이 뜨면 곧바로 장면 준비 완료.
  useEffect(() => {
    const t = setTimeout(onSceneReady, 120);
    return () => clearTimeout(t);
  }, [state.activeEvent?.id]);

  // 사건이 뜨면 자동 걷기를 멈춘다
  useEffect(() => {
    if (hasOverlay) pathRef.current = [];
  }, [hasOverlay]);

  // 크기 맞추기
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setView({ w: Math.max(280, Math.round(r.width)), h: Math.max(240, Math.round(r.height)), dpr: Math.min(2, window.devicePixelRatio || 1) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 땅과 서 있는 것들 — 지역·계절이 바뀔 때만 다시 그린다
  const terrain = useMemo(() => paintFieldGround(map, state.country, state.season), [map, state.country, state.season]);
  const objectRows = useMemo(() => paintFieldObjects(map, state.country, state.season), [map, state.country, state.season]);
  // 안개 — 아직 발을 들이지 않은 땅
  const visitedKey = j.visitedLegs.join('|');
  const fog = useMemo(() => paintFieldFog(map, new Set(j.visitedLegs)), [map, visitedKey]);

  // ───────── 입력 ─────────
  const interactHere = () => {
    const st = stateRef.current;
    if (blockedRef.current) return;
    const p = poiHere(st);
    if (p) {
      sound.playClick();
      onInteract(p.id);
    } else if (atEntrance(st)) {
      setConfirmHome(true);
    }
  };

  useEffect(() => {
    const keyDir = (e: KeyboardEvent): Dir | null => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') return 'up';
      if (k === 'arrowdown' || k === 's') return 'down';
      if (k === 'arrowleft' || k === 'a') return 'left';
      if (k === 'arrowright' || k === 'd') return 'right';
      return null;
    };
    const down = (e: KeyboardEvent) => {
      const d = keyDir(e);
      if (d) {
        e.preventDefault();
        pathRef.current = [];
        if (!e.repeat && tapRef.current.length < 2) tapRef.current = [...tapRef.current, d];
        heldRef.current = [...heldRef.current.filter((x) => x !== d), d];
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'm') {
        setMapMode((v) => !v);
        return;
      }
      if (k === 'e' || e.key === ' ' || e.key === 'Enter') {
        if (!blockedRef.current) {
          e.preventDefault();
          interactHere();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      const d = keyDir(e);
      if (d) heldRef.current = heldRef.current.filter((x) => x !== d);
    };
    const blur = () => (heldRef.current = []);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // 화면 좌표 → 칸 (장소 그림은 칸 위로 솟아 있으니 그림을 눌러도 그 장소로)
  const tileFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cam = camRef.current;
    const tx = Math.floor(((e.clientX - rect.left) / cam.z + cam.x) / T);
    const ty = Math.floor(((e.clientY - rect.top) / cam.z + cam.y) / T);
    const st = stateRef.current.journey;
    if (!st || tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return null;
    const hit = st.pois.find((p) => p.tx === tx && p.ty === ty) || st.pois.find((p) => p.tx === tx && p.ty === ty + 1);
    return hit ? { x: hit.tx, y: hit.ty } : { x: tx, y: ty };
  };

  // 지도를 누르면 그 칸까지 걸어간다
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (blockedRef.current) return;
    const tile = tileFromEvent(e);
    const st = stateRef.current.journey;
    if (!tile || !st) return;
    if (tile.x === st.pos.x && tile.y === st.pos.y) {
      interactHere();
      return;
    }
    if (!walkable(map, tile.x, tile.y)) return;
    const path = findPath(map, st.pos, (x, y) => x === tile.x && y === tile.y);
    if (path) {
      pathRef.current = path;
      if (mapModeRef.current) setMapMode(false);
    }
  };

  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const tile = tileFromEvent(e);
    setHover((prev) => (prev?.x === tile?.x && prev?.y === tile?.y ? prev : tile));
  };

  // ───────── 그리기 + 이동 루프 ─────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const W = view.w;
    const H = view.h;
    const worldW = map.w * T;
    const worldH = map.h * T;
    // 도트 하나 = 화면 픽셀 정수 배. 휴대폰 2배, 보통 화면 3배, 큰 화면 4배.
    const baseZoom = Math.max(2, Math.min(4, Math.round(Math.min(W / (18 * T), H / (11 * T)))));
    const fitZoom = Math.min(W / worldW, H / worldH);
    if (!zoomRef.current) zoomRef.current = baseZoom;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const js = st.journey;
      if (!js) return;

      // ── 이동: 보이는 위치를 실제 위치로 끌고 간다 ──
      const vis = visRef.current;
      const dx = js.pos.x - vis.x;
      const dy = js.pos.y - vis.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      let moving = false;
      if (dist > 2.5) {
        vis.x = js.pos.x;
        vis.y = js.pos.y;
      } else if (dist > 0.001) {
        const stepLen = (dt * 1000) / STEP_MS;
        if (dist <= stepLen) {
          vis.x = js.pos.x;
          vis.y = js.pos.y;
        } else {
          vis.x += (dx / dist) * stepLen;
          vis.y += (dy / dist) * stepLen;
        }
        moving = true;
      }
      if (moving || heldRef.current.length || pathRef.current.length) walkTickRef.current += dt * 7;
      // 다음 걸음
      if (blockedRef.current) tapRef.current = [];
      const arrived = Math.abs(js.pos.x - vis.x) + Math.abs(js.pos.y - vis.y) < 0.001;
      if (arrived && !blockedRef.current && now - lastStepRef.current >= STEP_MS * 0.9) {
        let dir: [number, number] | null = null;
        const tap = tapRef.current[0];
        tapRef.current = tapRef.current.slice(1);
        const held = tap || heldRef.current[heldRef.current.length - 1];
        if (held) {
          dir = DIR_VEC[held];
        } else if (pathRef.current.length) {
          const nxt = pathRef.current[0];
          if (Math.abs(nxt.x - js.pos.x) + Math.abs(nxt.y - js.pos.y) === 1) {
            dir = [nxt.x - js.pos.x, nxt.y - js.pos.y];
            pathRef.current = pathRef.current.slice(1);
          } else {
            pathRef.current = [];
          }
        }
        if (dir) {
          lastStepRef.current = now;
          onStep(dir[0], dir[1]);
        }
      }

      // ── 카메라 (도트가 어긋나지 않게 정수로 맞춘다) ──
      const targetZoom = mapModeRef.current ? fitZoom : baseZoom;
      const zr = zoomRef.current + (targetZoom - zoomRef.current) * Math.min(1, dt * 10);
      zoomRef.current = Math.abs(zr - targetZoom) < 0.02 ? targetZoom : zr;
      const z = zoomRef.current;
      const hx = Math.round((vis.x + 0.5) * T);
      const hy = Math.round((vis.y + 0.5) * T);
      const vw = W / z;
      const vh = H / z;
      let camX = worldW <= vw ? (worldW - vw) / 2 : Math.max(0, Math.min(worldW - vw, hx - vw / 2));
      let camY = worldH <= vh ? (worldH - vh) / 2 : Math.max(0, Math.min(worldH - vh, hy - vh / 2));
      camX = Math.round(camX * z) / z;
      camY = Math.round(camY * z) / z;
      camRef.current = { x: camX, y: camY, z };

      const k = view.dpr * z;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0e0a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, -camX * k, -camY * k);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrain, 0, 0);

      // 물 반짝임 — 두 프레임으로 깜박이는 도트
      const x0 = Math.max(0, Math.floor(camX / T));
      const y0 = Math.max(0, Math.floor(camY / T));
      const x1 = Math.min(map.w - 1, Math.ceil((camX + vw) / T));
      const y1 = Math.min(map.h - 1, Math.ceil((camY + vh) / T));
      const wf = Math.floor(now / 420);
      ctx.fillStyle = 'rgba(235,248,255,0.85)';
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const tk = map.tiles[y * map.w + x];
          if (tk !== 'WATER' && tk !== 'SEA') continue;
          const h = (x * 7 + y * 13 + wf) % 5;
          if (h > 1) continue;
          ctx.fillRect(x * T + 3 + ((x * 5 + y * 3 + wf) % 9), y * T + 4 + h * 6, 2, 1);
        }
      }

      // ── 서 있는 것 · 장소 · 주인공을 줄 순서대로 — 아래 줄의 나무가 주인공의 머리를 가린다 ──
      const heroRow = Math.floor(vis.y + 0.001);
      const poisByRow = new Map<number, JourneyPoi[]>();
      js.pois.forEach((p) => poisByRow.set(p.ty, [...(poisByRow.get(p.ty) || []), p]));
      const frame = moving || heldRef.current.length ? Math.floor(walkTickRef.current) % 4 : 0;
      const drawHero = (alpha: number) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        drawFieldHero(ctx, Math.round((vis.x + 0.5) * T), Math.round((vis.y + 1) * T), 1, js.facing || 'D', frame, {
          country: st.country,
          gender: st.gender,
          age: st.age,
          oneArm: st.disabilities.includes('ONE_ARM'),
          now,
        });
        ctx.restore();
      };
      const rowFrom = Math.max(0, y0 - 1);
      const rowTo = Math.min(map.h - 1, y1 + 3);
      for (let r = rowFrom; r <= rowTo; r++) {
        const row = objectRows[r];
        if (row?.canvas) ctx.drawImage(row.canvas, 0, row.y);
        if (r === map.entrance.y) drawEntranceSprite(ctx, map.entrance.x * T + T / 2, map.entrance.y * T + T, 1);
        (poisByRow.get(r) || []).forEach((p) => drawPoiSprite(ctx, p.kind, p.tx * T + T / 2, p.ty * T + T, 1, st.country, !!p.done, now));
        if (r === heroRow) drawHero(1);
      }
      // 나무 뒤에 선 주인공은 비쳐 보이게 (이미 보이는 자리에는 같은 그림이 겹칠 뿐이다)
      drawHero(0.45);

      ctx.drawImage(fog, 0, 0);

      // 아직 들르지 않은 장소의 「!」
      js.pois.forEach((p) => {
        if (p.done || (p.tx === js.pos.x && p.ty === js.pos.y)) return;
        drawPoiAlert(ctx, p.tx * T + T / 2, p.ty * T + (p.kind === 'VISTA' ? -14 : p.kind === 'INN' || p.kind === 'HISTORY' ? -6 : 0), 1, now + p.tx * 97);
      });

      // 자동 걷기 목적지 — 깜박이는 도트 테두리
      if (pathRef.current.length && Math.floor(now / 250) % 2 === 0) {
        const g = pathRef.current[pathRef.current.length - 1];
        ctx.fillStyle = '#fde047';
        const gx = g.x * T;
        const gy = g.y * T;
        [[0, 0], [12, 0], [0, 12], [12, 12]].forEach(([ax, ay]) => {
          ctx.fillRect(gx + ax, gy + ay + (ay ? 3 : 0), 4, 1);
          ctx.fillRect(gx + ax + (ax ? 3 : 0), gy + ay, 1, 4);
        });
      }
      // 마우스가 가리키는 칸
      const hv = hoverRef.current;
      if (hv && !blockedRef.current) {
        ctx.fillStyle = walkable(map, hv.x, hv.y) ? 'rgba(255,255,255,0.18)' : 'rgba(255,80,80,0.15)';
        ctx.fillRect(hv.x * T, hv.y * T, T, T);
      }

      // ── 날씨 (화면 위, 도트 크기로) ──
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const q = Math.max(2, Math.round(z));
      const ps = particlesRef.current;
      const want = st.season === 'WINTER' ? 90 : st.season === 'SUMMER' ? 60 : st.season === 'AUTUMN' ? 30 : 36;
      while (ps.length < want) ps.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() });
      const t = now / 1000;
      ps.forEach((p) => {
        let vx: number;
        let vy: number;
        if (st.season === 'SUMMER') {
          vy = 560;
          vx = -80;
        } else if (st.season === 'WINTER') {
          vy = 40 + p.r * 40;
          vx = -24 + Math.sin(t + p.r * 10) * 24;
        } else if (st.season === 'AUTUMN') {
          vy = 46 + p.r * 26;
          vx = -36 + Math.sin(t * 2 + p.r * 10) * 40;
        } else {
          vy = 28 + p.r * 22;
          vx = -18 + Math.sin(t * 1.5 + p.r * 10) * 32;
        }
        p.x += vx * dt;
        p.y += vy * dt;
        if (p.y > H) {
          p.y = -10;
          p.x = Math.random() * W;
        }
        if (p.x < -20) p.x = W + 10;
        if (p.x > W + 20) p.x = -10;
        const sx = Math.round(p.x / q) * q;
        const sy = Math.round(p.y / q) * q;
        if (st.season === 'SUMMER') {
          ctx.fillStyle = 'rgba(190,220,255,0.5)';
          ctx.fillRect(sx, sy, q / 2, q * 4);
        } else {
          ctx.fillStyle = st.season === 'WINTER' ? '#ffffff' : st.season === 'AUTUMN' ? (p.r > 0.5 ? '#d9601e' : '#e0a020') : '#ffc0d4';
          ctx.fillRect(sx, sy, q, q);
        }
      });

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view, terrain, objectRows, fog, map]);

  const dayInt = Math.floor(j.day);
  const dayPct = Math.min(100, (j.day / j.maxDays) * 100);
  const here = poiHere(state);
  const onGate = atEntrance(state);
  const hereTile = tileAt(map, j.pos.x, j.pos.y);
  // 바로 옆 칸의 장소 (아래 창에 이름으로 알려 준다)
  const besides = j.pois.find((p) => !p.done && Math.abs(p.tx - j.pos.x) + Math.abs(p.ty - j.pos.y) === 1);

  // 마우스가 가리키는 칸의 설명 — 지도 위 글자 대신 아래 창에
  const hoverInfo = (() => {
    if (!hover || blocked) return null;
    const legId = zoneLegAt(map, hover.x, hover.y);
    const tk = tileAt(map, hover.x, hover.y);
    if (!legId || !tk) return null;
    const known = j.visitedLegs.includes(legId);
    const zoneName = getLeg(region, legId).name;
    const poi = j.pois.find((p) => p.tx === hover.x && p.ty === hover.y);
    const gate = hover.x === map.entrance.x && hover.y === map.entrance.y;
    if (gate) return '도장으로 돌아가는 길';
    if (poi) return `${poi.label}${poi.done ? ' (다녀감)' : ''} · ${zoneName}`;
    if (!known) return `${zoneName} — 아직 가 보지 않은 땅`;
    return `${zoneName} · ${TILE_INFO[tk].name}${TILE_INFO[tk].pass ? ` (한 걸음 ${tileDays(tk, state.season)}일)` : ' — 지날 수 없다'}`;
  })();

  const holdBtn = (dir: Dir) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      pathRef.current = [];
      if (tapRef.current.length < 2) tapRef.current = [...tapRef.current, dir];
      heldRef.current = [...heldRef.current.filter((x) => x !== dir), dir];
    },
    onPointerUp: () => (heldRef.current = heldRef.current.filter((x) => x !== dir)),
    onPointerLeave: () => (heldRef.current = heldRef.current.filter((x) => x !== dir)),
    onPointerCancel: () => (heldRef.current = heldRef.current.filter((x) => x !== dir)),
  });

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0e0a14] text-[#f5e9ce] overflow-hidden select-none">
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
          {hereTile && (
            <span className="shrink-0 text-[#c7b394] hidden sm:inline">
              · {TILE_INFO[hereTile].name} (한 걸음 {tileDays(hereTile, state.season)}일)
            </span>
          )}
        </div>
      </header>

      {/* 필드 */}
      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          width={Math.round(view.w * view.dpr)}
          height={Math.round(view.h * view.dpr)}
          onClick={onCanvasClick}
          onMouseMove={onCanvasMove}
          onMouseLeave={() => setHover(null)}
          className="absolute inset-0 cursor-pointer"
          style={{ width: view.w, height: view.h, imageRendering: 'pixelated' }}
        />

        {/* 풍문 */}
        {j.lastRumor && !hasOverlay && !mapMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[92%] max-w-2xl bg-[#140d09]/80 border border-[#5c432c] px-3 py-1.5 text-[11px] sm:text-xs text-[#e6d8be] italic text-center pointer-events-none">
            “{j.lastRumor}”
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

      {/* 하단 조작 — 지도 위에 쓰지 않는 이름과 안내는 모두 여기에 */}
      <footer className="shrink-0 bg-[#1e1510] border-t-2 border-[#8c6239] px-2 py-2 z-20">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <div className="grid grid-cols-3 grid-rows-2 gap-1 shrink-0">
            <span />
            <button {...holdBtn('up')} className="rpg-btn w-10 h-9 flex items-center justify-center cursor-pointer touch-none" aria-label="위로 걷기">
              <ChevronUp className="w-5 h-5" />
            </button>
            <span />
            <button {...holdBtn('left')} className="rpg-btn w-10 h-9 flex items-center justify-center cursor-pointer touch-none" aria-label="왼쪽으로 걷기">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button {...holdBtn('down')} className="rpg-btn w-10 h-9 flex items-center justify-center cursor-pointer touch-none" aria-label="아래로 걷기">
              <ChevronDown className="w-5 h-5" />
            </button>
            <button {...holdBtn('right')} className="rpg-btn w-10 h-9 flex items-center justify-center cursor-pointer touch-none" aria-label="오른쪽으로 걷기">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button
            disabled={(!here && !onGate) || blocked}
            onClick={interactHere}
            className={`flex-1 min-w-0 h-[76px] px-2 font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-default ${(here || onGate) && !blocked ? 'seal-badge' : 'rpg-btn disabled:opacity-90'}`}
          >
            {here ? (
              <>
                <Search className="w-4 h-4 shrink-0" />
                <span className="truncate">{here.label} 다시 살펴보기</span>
                <span className="hidden sm:inline text-[10px] opacity-70">[E]</span>
              </>
            ) : onGate ? (
              <>
                <Home className="w-4 h-4 shrink-0" />
                <span className="truncate">도장으로 돌아가는 길</span>
              </>
            ) : hoverInfo ? (
              <span className="text-xs font-bold text-[#fde68a] truncate">{hoverInfo}</span>
            ) : besides ? (
              <span className="text-xs font-bold text-[#fde68a] truncate">바로 옆에 「{besides.label}」</span>
            ) : (
              <span className="text-[11px] sm:text-xs font-normal leading-snug text-center text-[#c7b394]">
                방향키·WASD로 걷거나 땅을 눌러 목적지를 정한다.
                <br className="hidden sm:inline" /> 머리 위에 「!」가 뜬 곳을 밟으면 사건이 일어난다.
              </span>
            )}
          </button>
          <button
            onClick={() => setMapMode((v) => !v)}
            className={`w-14 h-[76px] shrink-0 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer ${mapMode ? 'seal-badge' : 'rpg-btn'}`}
            aria-label="전도 보기"
          >
            <MapIcon className="w-5 h-5" />
            전도
            <span className="hidden sm:inline text-[9px] opacity-70">[M]</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
