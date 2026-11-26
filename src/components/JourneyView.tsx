import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, JourneyPoi } from '../types/game';
import { getLeg, getRegion } from '../data/journeyRegions';
import { findPath, JourneyMap, TILE_INFO, tileAt, walkable, zoneLegAt } from '../data/journeyMap';
import { paintedAreaSources } from '../data/journeyAreas';
import { atAreaExit, atEntrance, currentMap, exploredBits, gateHere, poiHere, poisOnMap, poiVisible, stepDays } from '../engine/journey';
import { COUNTRIES, SEASON_META } from '../data/worldAndEndings';
import {
  CLOUD_TILE,
  drawEntranceSprite,
  drawExitMarker,
  drawFieldHero,
  drawGateMarker,
  drawPoiAlert,
  drawPoiSprite,
  fieldSmokeSources,
  paintCloudShadows,
  paintFieldFog,
  paintFieldGround,
  paintFieldObjects,
  paintedMapSources,
  paintKnownVeil,
  paintPaintedVeil,
  flattenField,
  TILE_PX,
} from '../pixel/journeyMapPainter';
import { loadRawImage } from '../pixel/spriteLoader';
import { PixelPortrait } from './PixelPortrait';
import { sound } from '../engine/sound';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Footprints, Heart, Home, LogIn, LogOut, Map as MapIcon, MapPin, Search, Star } from 'lucide-react';

// 무사수행 필드 — 스타듀 밸리 같은 16×16 도트 필드 위를 위·아래·왼쪽·오른쪽으로 한 칸씩 걷는다.
// 지도 위에는 글자를 쓰지 않는다. 장소는 그림과 머리 위 「!」로 알아보고, 이름은 아래 창에 뜬다.
// 장소를 밟으면 사건이 열리고, 걷는 동안 돌발 사건이 끼어든다. 칸마다 땅에 따라 날수가 든다.

interface Props {
  state: GameState;
  hasOverlay: boolean; // 사건·결과 창이 떠 있으면 조작을 멈춘다
  onSceneReady: () => void;
  onStep: (dx: number, dy: number) => void;
  onInteract: (poiId: string) => void;
  onEnterArea: (legId: string) => void;
  onLeaveArea: () => void;
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

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
}

interface Flutter {
  ax: number; // 맴도는 자리 (월드 도트)
  ay: number;
  ph: number;
  col: string;
}

// 계절마다 빛의 빛깔 — 화면 전체에 soft-light로 얹는다. glow는 왼쪽 위에서 드는 햇살.
const GRADE: Record<string, { tint: string; glow: string; shadow: number; clouds: number }> = {
  SPRING: { tint: 'rgba(255,210,190,0.34)', glow: 'rgba(255,238,205,0.20)', shadow: 0.24, clouds: 0.13 },
  SUMMER: { tint: 'rgba(255,232,160,0.26)', glow: 'rgba(255,250,214,0.16)', shadow: 0.28, clouds: 0.15 },
  AUTUMN: { tint: 'rgba(255,168,82,0.38)', glow: 'rgba(255,206,130,0.22)', shadow: 0.26, clouds: 0.12 },
  WINTER: { tint: 'rgba(150,178,232,0.36)', glow: 'rgba(222,236,255,0.12)', shadow: 0.2, clouds: 0.09 },
};
const COUNTRY_TAG: Record<string, string> = { KOREA: 'kr', CHINA: 'cn', JAPAN: 'jp' };

export const JourneyView: React.FC<Props> = ({ state, hasOverlay, onSceneReady, onStep, onInteract, onEnterArea, onLeaveArea, onFinish }) => {
  const j = state.journey!;
  const region = getRegion(j.regionId);
  const areaId = j.area || null;
  // 바깥 지도(지역 전도) 또는 들어와 있는 구역 지도
  const map: JourneyMap = useMemo(() => currentMap({ regionId: j.regionId, area: areaId }), [j.regionId, areaId]);
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
  const baseZoomRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const birdsRef = useRef<Bird[]>([]);
  const fluttersRef = useRef<Flutter[]>([]);
  const camRef = useRef({ x: 0, y: 0, z: 3 });
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const exploredRef = useRef<Uint8Array | null>(null);
  const fadeRef = useRef(0); // 지도를 옮겨 갈 때 잠깐 어두워진다
  const sparksRef = useRef<Array<{ x: number; y: number; t0: number }>>([]); // 숨은 곳을 찾은 자리의 반짝임
  const [areaBanner, setAreaBanner] = useState<string | null>(null);
  const [foundNote, setFoundNote] = useState<string | null>(null);

  // 지도를 옮겨 가면 — 보이는 위치를 곧장 옮기고, 화면을 한 번 어둡게 했다가 밝히고, 구역 이름을 띄운다
  const lastAreaRef = useRef(areaId);
  useEffect(() => {
    if (lastAreaRef.current === areaId) return;
    lastAreaRef.current = areaId;
    visRef.current = { x: j.pos.x, y: j.pos.y };
    pathRef.current = [];
    fadeRef.current = 1;
    if (areaId) {
      setAreaBanner(areaId);
      const t = setTimeout(() => setAreaBanner(null), 2800);
      return () => clearTimeout(t);
    }
    setAreaBanner(null);
  }, [areaId]);

  // 숨은 장소를 찾았다
  const foundKey = j.pois.filter((p) => p.found).map((p) => p.id).join('|');
  const lastFoundRef = useRef(new Set(j.pois.filter((p) => p.found).map((p) => p.id)));
  useEffect(() => {
    const fresh = j.pois.filter((p) => p.found && !lastFoundRef.current.has(p.id));
    lastFoundRef.current = new Set(j.pois.filter((p) => p.found).map((p) => p.id));
    if (!fresh.length) return;
    const now = performance.now();
    fresh.forEach((p) => sparksRef.current.push({ x: p.tx, y: p.ty, t0: now }));
    sound.playClick();
    setFoundNote(fresh[0].label);
    const t = setTimeout(() => setFoundNote(null), 2600);
    return () => clearTimeout(t);
  }, [foundKey]);

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
  const fieldObjects = useMemo(() => paintFieldObjects(map, state.country, state.season), [map, state.country, state.season]);
  const objectRows = fieldObjects.rows;
  const clouds = useMemo(() => paintCloudShadows(map.seed), [map]);
  const smoke = useMemo(() => fieldSmokeSources(map), [map]);
  // 안개 — 바깥 지도는 아직 발을 들이지 않은 땅, 구역 지도는 아직 둘러보지 않은 칸
  const visitedKey = j.visitedLegs.join('|');
  const fog = useMemo(() => paintFieldFog(map, new Set(j.visitedLegs), state.season), [map, visitedKey, state.season]);
  const exploredKey = areaId ? j.explored?.[areaId] || '' : '';
  const explored = useMemo(() => exploredBits({ ...j, area: areaId }), [areaId, exploredKey]);
  exploredRef.current = explored;
  const flatField = useMemo(() => (areaId ? flattenField(terrain, fieldObjects.rows) : null), [areaId, terrain, fieldObjects]);
  // 지역 지도를 통째로 그린 그림 — 계절 그림이 없으면 기본 그림, 그것도 없으면 코드로 그린 땅
  const [painted, setPainted] = useState<{ img: HTMLImageElement; seasonal: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    setPainted(null);
    const src = areaId ? paintedAreaSources(areaId, state.season) : paintedMapSources(j.regionId, state.season);
    const tryLoad = (list: Array<[string, boolean]>) => {
      if (!list.length) return;
      const img = new Image();
      img.onload = () => alive && img.naturalWidth > 0 && setPainted({ img, seasonal: list[0][1] });
      img.onerror = () => alive && tryLoad(list.slice(1));
      img.src = list[0][0];
    };
    tryLoad(
      state.season === 'SPRING'
        ? [[src.base, true]]
        : [
            [src.seasonal, true],
            [src.base, false],
          ]
    );
    return () => {
      alive = false;
    };
  }, [j.regionId, areaId, state.season]);
  const veil = useMemo(() => {
    if (explored) {
      const known = (x: number, y: number) => !!explored[y * map.w + x];
      if (painted) return paintKnownVeil(painted.img, painted.img.naturalWidth, painted.img.naturalHeight, map, known, state.season);
      if (flatField) return paintKnownVeil(flatField, flatField.width, flatField.height, map, known, state.season);
      return null;
    }
    return painted ? paintPaintedVeil(painted.img, map, new Set(j.visitedLegs), state.season) : null;
  }, [painted, map, visitedKey, explored, flatField, state.season]);
  // 지도 바깥에 깔리는 그림 (없으면 어두운 바탕)
  const backdropSrc = `/assets/px_jr_field_backdrop_${COUNTRY_TAG[region.country] || 'kr'}.jpg`;
  // 무사수행 첫날에는 지역 표제를 잠깐 띄운다
  const [titleCard, setTitleCard] = useState(() => j.day < 0.5);
  const [titleImgOk, setTitleImgOk] = useState(true);
  useEffect(() => {
    if (!titleCard) return;
    const t = setTimeout(() => setTitleCard(false), 3200);
    return () => clearTimeout(t);
  }, [titleCard]);

  // ───────── 입력 ─────────
  const interactHere = () => {
    const st = stateRef.current;
    if (blockedRef.current) return;
    const p = poiHere(st);
    const gate = gateHere(st);
    if (p) {
      sound.playClick();
      onInteract(p.id);
    } else if (gate) {
      sound.playClick();
      onEnterArea(gate);
    } else if (atAreaExit(st)) {
      sound.playClick();
      onLeaveArea();
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
    const shown = poisOnMap(st).filter((p) => poiVisible(p, exploredRef.current, map.w));
    const hit = shown.find((p) => p.tx === tx && p.ty === ty) || shown.find((p) => p.tx === tx && p.ty === ty + 1);
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
    let baseZoom = Math.max(2, Math.min(4, Math.round(Math.min(W / (18 * T), H / (11 * T)))));
    // 구역 지도는 가로 스무남은 칸이 보이게 바짝 다가선다 — 화면 너머는 걸어가 봐야 안다
    const areaZoom = Math.max(2, Math.min(W / (20 * T), H / (12 * T)));
    if (areaId) baseZoom = Math.max(2, Math.round(areaZoom));
    if (painted) {
      // 그림 지도는 그림의 화소 하나가 화면 화소 정수 배가 되게
      const img = painted.img;
      const s = img.naturalWidth / worldW;
      if (areaId) {
        baseZoom = (Math.max(1, Math.round((areaZoom * view.dpr) / s)) / view.dpr) * s;
      } else {
        const f = W >= img.naturalWidth * 1.9 && H >= img.naturalHeight * 1.9 ? 2 : 1;
        baseZoom = (Math.max(1, Math.round(view.dpr * f)) / view.dpr) * s;
      }
    }
    const fitZoom = Math.min(W / worldW, H / worldH);
    // 그림이 들어오거나 빠져 배율 기준이 바뀌면 그 배율로 곧장 옮긴다
    if (!zoomRef.current || baseZoomRef.current !== baseZoom) zoomRef.current = baseZoom;
    baseZoomRef.current = baseZoom;

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
      const grade = GRADE[st.season] || GRADE.SPRING;
      // 지도 바깥 — 그림이 있으면 그림, 없으면 어둑한 바탕
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0e0a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (worldW * z < W - 1 || worldH * z < H - 1) {
        const bd = loadRawImage(backdropSrc);
        if (bd) {
          const sc = Math.max(canvas.width / bd.naturalWidth, canvas.height / bd.naturalHeight);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(bd, (canvas.width - bd.naturalWidth * sc) / 2, (canvas.height - bd.naturalHeight * sc) / 2, bd.naturalWidth * sc, bd.naturalHeight * sc);
          ctx.fillStyle = 'rgba(14,10,20,0.35)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
      ctx.setTransform(k, 0, 0, k, -camX * k, -camY * k);
      ctx.imageSmoothingEnabled = false;
      // 지도 판의 그림자와 테두리 (지도가 화면보다 작을 때만 보인다)
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(3, 5, worldW, worldH);
      ctx.fillStyle = '#2a1d14';
      ctx.fillRect(-2, -2, worldW + 4, worldH + 4);
      ctx.fillStyle = '#8c6239';
      ctx.fillRect(-1, -1, worldW + 2, worldH + 2);
      if (painted) {
        ctx.drawImage(painted.img, 0, 0, worldW, worldH);
        // 계절 그림이 없으면 기본 그림에 계절을 입힌다 — 겨울은 빛을 빼고 희게
        if (!painted.seasonal && st.season === 'WINTER') {
          ctx.globalCompositeOperation = 'saturation';
          ctx.fillStyle = 'rgba(128,128,128,0.5)';
          ctx.fillRect(0, 0, worldW, worldH);
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = 'rgba(176,192,226,0.3)';
          ctx.fillRect(0, 0, worldW, worldH);
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        ctx.drawImage(terrain, 0, 0);
        // 서 있는 것들의 그림자
        ctx.globalAlpha = grade.shadow;
        ctx.drawImage(fieldObjects.shadow, 0, 0);
        ctx.globalAlpha = 1;
      }

      // 물 반짝임 — 두 프레임으로 깜박이는 도트
      const x0 = Math.max(0, Math.floor(camX / T));
      const y0 = Math.max(0, Math.floor(camY / T));
      const x1 = Math.min(map.w - 1, Math.ceil((camX + vw) / T));
      const y1 = Math.min(map.h - 1, Math.ceil((camY + vh) / T));
      const wf = Math.floor(now / 420);
      ctx.fillStyle = 'rgba(235,248,255,0.85)';
      for (let y = y0; y <= (painted ? -1 : y1); y++) {
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
      const shownPois = poisOnMap(js).filter((p) => poiVisible(p, exploredRef.current, map.w));
      shownPois.forEach((p) => poisByRow.set(p.ty, [...(poisByRow.get(p.ty) || []), p]));
      const gatesByRow = new Map<number, Array<{ legId: string; x: number; y: number }>>();
      if (!js.area) (map.gates || []).forEach((g) => gatesByRow.set(g.y, [...(gatesByRow.get(g.y) || []), g]));
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
        if (row?.canvas && !painted) ctx.drawImage(row.canvas, 0, row.y);
        if (r === map.entrance.y) {
          if (js.area) drawExitMarker(ctx, map.entrance.x * T + T / 2, map.entrance.y * T + T, 1, now);
          else drawEntranceSprite(ctx, map.entrance.x * T + T / 2, map.entrance.y * T + T, 1);
        }
        (gatesByRow.get(r) || []).forEach((g) => drawGateMarker(ctx, g.x * T + T / 2, g.y * T + T, 1, (js.builtAreas || []).includes(g.legId), now));
        (poisByRow.get(r) || []).forEach((p) => drawPoiSprite(ctx, p.kind, p.tx * T + T / 2, p.ty * T + T, 1, st.country, !!p.done, now));
        if (r === heroRow) drawHero(1);
      }
      // 나무 뒤에 선 주인공은 비쳐 보이게 (이미 보이는 자리에는 같은 그림이 겹칠 뿐이다)
      if (!painted) drawHero(0.45);

      const secs = now / 1000;
      // 굴뚝 연기 — 바람에 오른쪽으로 쏠리며 흩어진다
      if (!painted) smoke.forEach((sm) => {
        if (sm.x < camX - 20 || sm.x > camX + vw + 20 || sm.y < camY - 30 || sm.y > camY + vh + 30) return;
        for (let i = 0; i < 4; i++) {
          const ph = (secs * 0.32 + sm.ph + i / 4) % 1;
          const sz = ph < 0.25 ? 1 : ph < 0.6 ? 2 : 3;
          ctx.fillStyle = `rgba(236,240,246,${((1 - ph) * 0.6).toFixed(3)})`;
          ctx.fillRect(Math.round(sm.x + Math.sin(ph * 5 + sm.ph * 6) * 1.5 + ph * 6 - sz / 2), Math.round(sm.y - ph * 20), sz, sz);
        }
      });

      // 나비 (봄·여름) — 주인공 둘레 풀밭을 맴돈다
      const fl = fluttersRef.current;
      if (st.season === 'SPRING' || st.season === 'SUMMER') {
        for (let i = fl.length - 1; i >= 0; i--) {
          const f = fl[i];
          if (f.ax < camX - 40 || f.ax > camX + vw + 40 || f.ay < camY - 40 || f.ay > camY + vh + 40) fl.splice(i, 1);
        }
        let tries = 0;
        while (fl.length < 6 && tries++ < 12) {
          const tx = Math.floor((camX + Math.random() * vw) / T);
          const ty = Math.floor((camY + Math.random() * vh) / T);
          const tk = tileAt(map, tx, ty);
          if (tk !== 'PLAIN' && tk !== 'HILL' && tk !== 'FIELD') continue;
          const cols = st.season === 'SPRING' ? ['#fff4f8', '#ffe066', '#ffb8d8'] : ['#ffffff', '#ffd040', '#9ad0ff'];
          fl.push({ ax: tx * T + 8, ay: ty * T + 6, ph: Math.random() * 20, col: cols[Math.floor(Math.random() * cols.length)] });
        }
        fl.forEach((f) => {
          const t2 = secs * 0.9 + f.ph;
          const bx = Math.round(f.ax + Math.sin(t2) * 10 + Math.sin(t2 * 2.3) * 4);
          const by = Math.round(f.ay + Math.cos(t2 * 0.8) * 6 + Math.sin(t2 * 3.1) * 2);
          const open = Math.floor(now / 110 + f.ph * 7) % 2 === 0;
          ctx.fillStyle = 'rgba(18,30,44,0.22)';
          ctx.fillRect(bx, by + 6, 2, 1);
          ctx.fillStyle = f.col;
          if (open) {
            ctx.fillRect(bx - 1, by, 1, 1);
            ctx.fillRect(bx + 1, by, 1, 1);
          } else ctx.fillRect(bx, by - 1, 1, 2);
          ctx.fillStyle = '#3a2a22';
          ctx.fillRect(bx, by, 1, 1);
        });
      } else fl.length = 0;

      // 구름 그림자 — 천천히 흘러간다
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, worldW, worldH);
      ctx.clip();
      ctx.globalAlpha = grade.clouds;
      const cox = (secs * 5) % CLOUD_TILE;
      const coy = (secs * 2) % CLOUD_TILE;
      for (let cy = Math.floor((camY - coy) / CLOUD_TILE); cy * CLOUD_TILE + coy < camY + vh; cy++) {
        for (let cx = Math.floor((camX - cox) / CLOUD_TILE); cx * CLOUD_TILE + cox < camX + vw; cx++) {
          ctx.drawImage(clouds, cx * CLOUD_TILE + cox, cy * CLOUD_TILE + coy);
        }
      }
      ctx.restore();

      // 새 떼 — 이따금 지도를 가로질러 날아가고, 땅에 그림자가 진다
      const birds = birdsRef.current;
      if (birds.length === 0 && Math.random() < dt * 0.1) {
        const fromLeft = Math.random() < 0.5;
        const n = 3 + Math.floor(Math.random() * 3);
        const sx = fromLeft ? camX - 20 : camX + vw + 20;
        const sy = camY + vh * (0.2 + Math.random() * 0.5);
        const vx = (fromLeft ? 1 : -1) * (34 + Math.random() * 12);
        const vy = (Math.random() - 0.5) * 8;
        for (let i = 0; i < n; i++) {
          const rank = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
          birds.push({ x: sx - Math.sign(vx) * Math.abs(rank) * 7, y: sy + rank * 5, vx, vy, ph: Math.random() * 3 });
        }
      }
      for (let i = birds.length - 1; i >= 0; i--) {
        const b = birds[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < camX - 60 || b.x > camX + vw + 60) birds.splice(i, 1);
      }
      birds.forEach((b) => {
        const bx = Math.round(b.x);
        const by = Math.round(b.y);
        ctx.fillStyle = 'rgba(18,30,44,0.22)';
        ctx.fillRect(bx - 2 + 10, by + 34, 5, 1);
        ctx.fillStyle = st.season === 'WINTER' ? '#1e1a22' : '#2e2a36';
        const up = Math.floor(now / 140 + b.ph) % 2 === 0;
        ctx.fillRect(bx, by, 1, 1);
        if (up) {
          ctx.fillRect(bx - 1, by - 1, 1, 1);
          ctx.fillRect(bx + 1, by - 1, 1, 1);
          ctx.fillRect(bx - 2, by - 2, 1, 1);
          ctx.fillRect(bx + 2, by - 2, 1, 1);
        } else {
          ctx.fillRect(bx - 2, by, 2, 1);
          ctx.fillRect(bx + 1, by, 2, 1);
          ctx.fillRect(bx - 3, by + 1, 1, 1);
          ctx.fillRect(bx + 3, by + 1, 1, 1);
        }
      });

      if (veil) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(veil, 0, 0, worldW, worldH);
        ctx.imageSmoothingEnabled = false;
      } else if (!js.area) {
        ctx.globalAlpha = 0.92;
        ctx.drawImage(fog, 0, 0);
        ctx.globalAlpha = 1;
      }

      // 아직 들르지 않은 장소의 「!」
      shownPois.forEach((p) => {
        if (p.done || (p.tx === js.pos.x && p.ty === js.pos.y)) return;
        drawPoiAlert(ctx, p.tx * T + T / 2, p.ty * T + (p.kind === 'VISTA' ? -14 : p.kind === 'INN' || p.kind === 'HISTORY' ? -6 : 0), 1, now + p.tx * 97);
      });
      // 숨은 곳을 찾은 자리 — 퍼져 나가는 빛 고리와 튀는 별빛
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        const age = (now - sp.t0) / 1000;
        if (age > 1.4) {
          sparks.splice(i, 1);
          continue;
        }
        const cxp = sp.x * T + T / 2;
        const cyp = sp.y * T + T / 2;
        ctx.strokeStyle = `rgba(253,230,138,${(1 - age / 1.4).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cxp, cyp, 4 + age * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,240,${(1 - age / 1.4).toFixed(3)})`;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + age * 2;
          ctx.fillRect(Math.round(cxp + Math.cos(a) * (6 + age * 16)), Math.round(cyp + Math.sin(a) * (6 + age * 16) - age * 6), 1, 1);
        }
      }

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

      // ── 빛 — 계절의 빛깔과 왼쪽 위에서 드는 햇살 ──
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.globalCompositeOperation = 'soft-light';
      // 계절 그림은 이미 그 계절의 빛으로 그려져 있으니 엷게만
      ctx.globalAlpha = painted?.seasonal ? 0.35 : painted ? 0.7 : 1;
      ctx.fillStyle = grade.tint;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'screen';
      const sun = ctx.createRadialGradient(W * 0.12, -H * 0.1, 0, W * 0.12, -H * 0.1, Math.max(W, H) * 0.9);
      sun.addColorStop(0, grade.glow);
      sun.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      // ── 날씨 (화면 위, 도트 크기로) ──
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

      // 가장자리를 어둡게 — 시선이 가운데로 모인다
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, 'rgba(12,8,24,0)');
      vg.addColorStop(1, 'rgba(12,8,24,0.42)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      // 지도를 옮겨 갈 때의 암전
      if (fadeRef.current > 0) {
        ctx.fillStyle = `rgba(8,6,12,${Math.min(1, fadeRef.current).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
        fadeRef.current = Math.max(0, fadeRef.current - dt * 2.4);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view, terrain, fieldObjects, fog, map, clouds, smoke, backdropSrc, painted, veil, areaId]);

  const dayInt = Math.floor(j.day);
  const dayPct = Math.min(100, (j.day / j.maxDays) * 100);
  const here = poiHere(state);
  const onGate = atEntrance(state);
  const gateLeg = gateHere(state);
  const onExit = atAreaExit(state);
  const hereTile = tileAt(map, j.pos.x, j.pos.y);
  const shownPois = poisOnMap(j).filter((p) => poiVisible(p, explored, map.w));
  // 바로 옆 칸의 장소 (아래 창에 이름으로 알려 준다)
  const besides = shownPois.find((p) => !p.done && Math.abs(p.tx - j.pos.x) + Math.abs(p.ty - j.pos.y) === 1);
  const areaLeg = areaId ? getLeg(region, areaId) : null;
  const canAct = !!(here || onGate || gateLeg || onExit);

  // 마우스가 가리키는 칸의 설명 — 지도 위 글자 대신 아래 창에
  const hoverInfo = (() => {
    if (!hover || blocked) return null;
    const legId = zoneLegAt(map, hover.x, hover.y);
    const tk = tileAt(map, hover.x, hover.y);
    if (!legId || !tk) return null;
    const known = explored ? !!explored[hover.y * map.w + hover.x] : j.visitedLegs.includes(legId);
    const zoneName = getLeg(region, legId).name;
    const poi = shownPois.find((p) => p.tx === hover.x && p.ty === hover.y);
    const atDoor = hover.x === map.entrance.x && hover.y === map.entrance.y;
    if (atDoor) return areaId ? '바깥 지도로 나가는 길' : '도장으로 돌아가는 길';
    const gate = !areaId && map.gates?.find((g) => g.x === hover.x && g.y === hover.y);
    if (gate) return `「${getLeg(region, gate.legId).name}」으로 들어가는 길목`;
    if (poi) return `${poi.label}${poi.done ? ' (다녀감)' : ''} · ${zoneName}`;
    if (!known) return areaId ? `${zoneName} — 아직 둘러보지 않은 곳` : `${zoneName} — 아직 가 보지 않은 땅`;
    return `${zoneName} · ${TILE_INFO[tk].name}${TILE_INFO[tk].pass ? ` (한 걸음 ${stepDays(j, tk, state.season)}일)` : ' — 지날 수 없다'}`;
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
                  {region.name}({region.hanja}) · {areaLeg ? areaLeg.name : `${leg.name} 근방 (전도)`}
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
              · {TILE_INFO[hereTile].name} (한 걸음 {stepDays(j, hereTile, state.season)}일)
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

        {/* 지역 표제 — 무사수행 첫날 */}
        {titleCard && !hasOverlay && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 animate-region-title cursor-pointer" onClick={() => setTitleCard(false)}>
            <div className="relative w-full max-w-xl overflow-hidden border-2 border-[#8c6239] bg-[#140d09]/85 shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              {titleImgOk && (
                <img
                  src={`/assets/px_jr_region_${region.id.toLowerCase()}.jpg`}
                  alt=""
                  className="block w-full aspect-[16/9] object-cover"
                  style={{ imageRendering: 'pixelated' }}
                  onError={() => setTitleImgOk(false)}
                />
              )}
              <div className={`${titleImgOk ? 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent pt-10' : ''} px-4 py-3 text-center`}>
                <div className="text-[10px] tracking-[0.4em] text-[#c9974c]">무사수행 {state.flags.journeyCount || 1}번째 · {SEASON_META[state.season].label}</div>
                <div className="mt-1 text-2xl sm:text-3xl font-bold text-[#fde68a] drop-shadow-[0_2px_0_#000]">
                  {region.name} <span className="text-lg sm:text-xl text-[#e6d8be]">{region.hanja}</span>
                </div>
                <div className="mt-1 text-[11px] text-[#c7b394]">{leg.name}에서 길을 나선다</div>
              </div>
            </div>
          </div>
        )}

        {/* 구역 이름 — 구역 지도에 들어설 때 */}
        {areaBanner && !titleCard && !hasOverlay && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-region-title">
            <div className="border-y-2 border-[#8c6239] bg-gradient-to-r from-transparent via-[#140d09]/90 to-transparent px-16 py-2 text-center">
              <div className="text-xl sm:text-2xl font-bold text-[#fde68a] drop-shadow-[0_2px_0_#000]">{getLeg(region, areaBanner).name}</div>
              <div className="text-[11px] text-[#c7b394]">{getLeg(region, areaBanner).hint}</div>
            </div>
          </div>
        )}

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
            disabled={!canAct || blocked}
            onClick={interactHere}
            className={`flex-1 min-w-0 h-[76px] px-2 font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-default ${canAct && !blocked ? 'seal-badge' : 'rpg-btn disabled:opacity-90'}`}
          >
            {here ? (
              <>
                <Search className="w-4 h-4 shrink-0" />
                <span className="truncate">{here.label} 다시 살펴보기</span>
                <span className="hidden sm:inline text-[10px] opacity-70">[E]</span>
              </>
            ) : gateLeg ? (
              <>
                <LogIn className="w-4 h-4 shrink-0" />
                <span className="truncate">「{getLeg(region, gateLeg).name}」으로 들어간다</span>
                <span className="hidden sm:inline text-[10px] opacity-70">[E]</span>
              </>
            ) : onExit ? (
              <>
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="truncate">바깥 지도로 나간다</span>
                <span className="hidden sm:inline text-[10px] opacity-70">[E · ↓]</span>
              </>
            ) : foundNote ? (
              <span className="text-xs font-bold text-[#fde68a] truncate">숨은 곳을 찾았다 — 「{foundNote}」</span>
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
                {areaId ? (
                  <>
                    길에서 벗어난 막다른 곳, 숲속 빈터, 벼랑 너머에 무언가 숨어 있다.
                    <br className="hidden sm:inline" /> 가까이 다가가면 드러난다. 출구에서 아래로 걸으면 바깥 지도로.
                  </>
                ) : (
                  <>
                    방향키·WASD로 걷거나 땅을 눌러 목적지를 정한다.
                    <br className="hidden sm:inline" /> 붉은 깃발을 밟으면 그 땅 안으로 들어간다.
                  </>
                )}
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
