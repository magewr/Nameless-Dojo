import {
  ActiveEvent,
  BattleConfig,
  GameState,
  JourneyPoi,
  JourneyPoiKind,
  JourneyRegionId,
  JourneyState,
  SeasonSummaryData,
} from '../types/game';
import { ALL_JOURNEY_EVENTS, getJourneyEventDef } from '../data/journeyEvents';
import { getLeg, getRegion, JOURNEY_DAYS_PER_SEASON, JourneyLeg, JourneyRegion, regionsForCountry, rumorsFor } from '../data/journeyRegions';
import { findPath, getJourneyMap, JourneyMap, TileKind, tileAt, tileDays, TILE_INFO, zoneLegAt, zoneOf } from '../data/journeyMap';
import { decodeExplored, encodeExplored, getAreaMap, HIDDEN_KINDS, pickAreaPoiTile, revealAround } from '../data/journeyAreas';
import { addFame, addHealth, highlight, JCtx, JourneyEventDef, isDone, markDone, triggerMet } from './journeyCore';
import { noteSeen } from './fresh';
import { getDifficultyId } from '../data/difficulty';
import { BattleOutcomePayload, REAL_DUEL_RUTHLESS } from './gameLogic';
import { SceneDialogueLine } from '../types/game';
import { addLog } from './log';

// ───────────────────────── 무사수행 진행 엔진 ─────────────────────────
// 필드 화면(JourneyView)과 플레이테스트 봇이 함께 쓰는 순수 함수들.

// 지도는 두 겹이다. 바깥 지도(지역 전도)에서 땅과 땅 사이를 오가고, 땅마다 있는 입구를 밟으면 그 땅의 구역 지도로 들어간다.
// 구역 지도는 화면 여러 장 크기다 — 산은 벼랑 사이를 지그재그로 오르고, 사건은 길에서 벗어난 곳에 숨어 있다(journeyAreas.ts).
// 칸마다 땅의 생김새에 따라 날수가 든다. 바깥 지도의 한 걸음은 하룻길에 가깝고, 구역 지도의 한 걸음은 그 몇 분의 일이다.
// 구역 지도에 처음 들어서면 그 땅의 장소들이 놓이고, 장소가 놓인 칸을 밟으면 사건이 열린다.

// 바깥 지도·구역 지도의 한 걸음에 드는 날수 배율
export const OVER_DAYS = 0.6;
export const AREA_DAYS = 0.075;

export function currentMap(j: Pick<JourneyState, 'regionId' | 'area'>): JourneyMap {
  return j.area ? getAreaMap(j.area) : getJourneyMap(j.regionId);
}

// 그 칸으로 한 걸음 들어가는 데 드는 날수
export function stepDays(j: Pick<JourneyState, 'area'>, t: TileKind, season: GameState['season']): number {
  return Math.round(tileDays(t, season) * (j.area ? AREA_DAYS : OVER_DAYS) * 1000) / 1000;
}

// 지금 서 있는 지도 위의 장소들
export function poisOnMap(j: JourneyState): JourneyPoi[] {
  const a = j.area || null;
  return j.pois.filter((p) => (p.area || null) === a);
}

// 장소가 지금 보이는가 — 숨은 장소는 찾아야 보이고, 구역 지도에서는 둘러본 칸에 있어야 보인다
export function poiVisible(p: JourneyPoi, explored: Uint8Array | null, w: number): boolean {
  if (p.hidden && !p.found && !p.done) return false;
  if (explored && !explored[p.ty * w + p.tx]) return false;
  return true;
}

export function exploredBits(j: JourneyState): Uint8Array | null {
  if (!j.area) return null;
  const m = getAreaMap(j.area);
  return decodeExplored(j.explored?.[j.area], m.w * m.h);
}

function eligible(def: JourneyEventDef, s: GameState, r: JourneyRegion, usedKeys: Set<string>, leg: JourneyLeg | null = null, day = 0): boolean {
  if (!triggerMet(def.trigger, s, leg, day)) return false;
  if (def.regions && !def.regions.includes(r.id)) return false;
  if (def.countries && !def.countries.includes(r.country)) return false;
  if (def.years && (s.year < def.years[0] || s.year > def.years[1])) return false;
  if (def.once !== false && (def.kind === 'MASTER' || def.kind === 'HISTORY' || def.kind === 'VISTA' || def.once) && isDone(s, def.key)) return false;
  if (usedKeys.has(def.key) && !(def.kind === 'INN' || def.kind === 'SHRINE' || def.kind === 'TREASURE')) return false;
  if (def.cond && !def.cond(s, r)) return false;
  return true;
}

function weighted<T>(items: Array<[T, number]>): T | null {
  const total = items.reduce((a, [, w]) => a + Math.max(0, w), 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const [it, w] of items) {
    roll -= Math.max(0, w);
    if (roll <= 0) return it;
  }
  return items[items.length - 1][0];
}

// 앞선 무사수행들에서 만난 장소 사건일수록 덜 놓는다. 한 생에 스무 번 떠나도 길마다 새 얼굴을 만나게.
// 주막·사찰은 쉼터라 덜 깎는다 — 대신 들를 때마다 장면이 바뀐다 (common.ts의 변주).
function roadFresh(s: GameState, def: JourneyEventDef): number {
  const seen = s.flags.eventSeen || {};
  const lastJ = seen[`road:${def.key}`];
  if (lastJ === undefined) return 1;
  const ago = (s.flags.journeyCount || 0) - lastJ; // 0 = 이번 수행, 1 = 바로 앞 수행
  const count = seen[`road#${def.key}`] || 0;
  if (def.kind === 'INN' || def.kind === 'SHRINE') return (ago <= 0 ? 0.5 : 1) / (1 + 0.05 * count);
  const byAgo = ago <= 0 ? 0.1 : ago === 1 ? 0.12 : ago === 2 ? 0.3 : ago === 3 ? 0.55 : 0.85;
  return byAgo / (1 + 0.15 * count);
}

// 이 땅에 놓일 장소들. 시대 사건은 가중치를 크게 주어 그 해의 공기가 길 위에 드러나게 한다.
function buildPois(s: GameState, r: JourneyRegion, leg: JourneyLeg, journey: JourneyState | null): JourneyPoi[] {
  const used = new Set<string>([...(journey?.pois || []).map((p) => p.eventKey), ...(journey?.usedKeys || [])]);
  const out: Array<{ kind: JourneyPoiKind; key: string }> = [];

  // 대오의 장소는 그 구간에 반드시 놓인다.
  if (leg.vista && !isDone(s, leg.vista)) out.push({ kind: 'VISTA', key: leg.vista });

  // 길 위로 돌아온 메아리
  (s.flags.echoes || [])
    .filter((e) => e.channel === 'ROAD' && e.dueTurn <= s.turn && (!e.regionId || e.regionId === r.id))
    .forEach((e) => {
      const key = `echo_${e.key}`;
      if (getJourneyEventDef(key) && !used.has(key)) out.push({ kind: 'ECHO', key });
    });

  const slots = 4 + (Math.random() < 0.5 ? 1 : 0);
  let guard = 0;
  while (out.length < slots + (leg.vista ? 1 : 0) && guard++ < 30) {
    const kind = weighted(
      (Object.entries(leg.pois) as Array<[JourneyPoiKind, number]>).map(([k, w]) => [k, k === 'HISTORY' ? w * 1.6 : w])
    );
    if (!kind || kind === 'VISTA') continue;
    // 쉼터(주막·사찰)는 한 구간에 하나씩이면 족하다 — 빈자리는 사람과 사연이 채운다
    if ((kind === 'INN' || kind === 'SHRINE') && out.some((o) => o.kind === kind)) continue;
    const day = journey && 'day' in journey ? Number((journey as JourneyState).day) : 0;
    const pool = ALL_JOURNEY_EVENTS.filter((d) => d.kind === kind && eligible(d, s, r, used, leg, day) && !out.some((o) => o.key === d.key && d.once !== false));
    // 이 지역·연도에 맞는 시대 사건이 없으면 사람 사이의 인연으로 대신한다.
    const fallback = kind === 'HISTORY' || kind === 'MASTER' ? ALL_JOURNEY_EVENTS.filter((d) => d.kind === 'PEOPLE' && eligible(d, s, r, used, leg, day)) : [];
    // 시기가 정해진 사건(연도·특정 시기)은 그때가 아니면 볼 수 없으니 더 자주 놓는다
    const timed = (d: JourneyEventDef) => (d.years || d.trigger?.periods || d.trigger?.yearCycle ? 2.5 : d.trigger?.seasons ? 1.6 : 1);
    const cands = pool.length ? pool : fallback;
    // 이 종류의 사건을 모두 최근에 만났다면, 자리를 다른 종류에 넘길 기회를 준다
    const freshest = cands.reduce((m, d) => Math.max(m, roadFresh(s, d)), 0);
    if (freshest < 0.3 && guard < 24 && Math.random() < 0.75) continue;
    const pick = weighted(cands.map((d) => [d, (d.weight ?? 1) * timed(d) * (d.weightBy ? d.weightBy(s, r) : 1) * roadFresh(s, d)]));
    if (!pick) continue;
    out.push({ kind: pick.kind as JourneyPoiKind, key: pick.key });
    used.add(pick.key);
  }

  // 구역 지도 안에 흩뿌린다 — 주막·사람은 길가에, 고수·보물·사당·절경은 길에서 멀리 벗어난 막다른 곳에 숨긴다.
  const m = getAreaMap(leg.id);
  const occupied: Array<{ tx: number; ty: number }> = (journey?.pois || []).filter((p) => p.area === leg.id);
  occupied.push({ tx: m.entrance.x, ty: m.entrance.y });
  const placed: JourneyPoi[] = [];
  out.forEach((o, i) => {
    const spot = pickAreaPoiTile(m, o.kind, [...occupied, ...placed]);
    if (!spot) return;
    const def = getJourneyEventDef(o.key);
    placed.push({
      id: `poi_${s.turn}_${leg.id}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      kind: o.kind,
      eventKey: o.key,
      tx: spot.x,
      ty: spot.y,
      legId: leg.id,
      area: leg.id,
      ...(HIDDEN_KINDS.has(o.kind) ? { hidden: true } : {}),
      label: def?.label ? def.label(s, r) : o.key,
    });
  });
  return placed;
}

// ───────── 출발 ─────────

export function defaultRegionFor(s: GameState): JourneyRegionId {
  const own = regionsForCountry(s.country);
  const planned = s.seasonPlan.journeyRegionId;
  return own.some((r) => r.id === planned) ? (planned as JourneyRegionId) : own[0].id;
}

export function startJourney(s: GameState, regionId?: JourneyRegionId): GameState {
  const r = getRegion(regionId || defaultRegionFor(s));
  const m = getJourneyMap(r.id);
  const leg = getLeg(r, r.startLeg);
  const base: JourneyState = {
    regionId: r.id,
    day: 0,
    maxDays: JOURNEY_DAYS_PER_SEASON,
    legId: leg.id,
    pos: { ...m.entrance },
    facing: 'R',
    steps: 0,
    pois: [],
    builtLegs: [leg.id],
    builtAreas: [],
    area: null,
    visitedLegs: [leg.id],
    highlights: [],
    start: { money: s.money, fame: s.fame, health: s.health, stats: { ...s.stats }, year: s.year, season: s.season },
    lastRumor: rumorsFor(s.country, s.year)[0],
  };
  let next: GameState = {
    ...s,
    lastSeasonSummary: null,
    flags: { ...s.flags, journeyCount: (s.flags.journeyCount || 0) + 1 },
  };
  next = { ...next, journey: base };
  return addLog(next, `무사수행을 떠났다 — ${r.name}(${r.hanja}). ${r.blurb}`, 'GOOD');
}

// 그 칸이 집·물·벼랑이면 출발점에서 닿는 가장 가까운 걸을 칸으로 비킨다 (그림에 맞춘 칸 배치에선 구역 한가운데가 막혀 있기도 하다).
function standableNear(m: ReturnType<typeof getJourneyMap>, x: number, y: number): { x: number; y: number } {
  const ok = (cx: number, cy: number) => {
    const t = tileAt(m, cx, cy);
    return !!t && TILE_INFO[t].pass && !!m.reach[cy * m.w + cx];
  };
  if (ok(x, y)) return { x, y };
  for (let r = 1; r < Math.max(m.w, m.h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return { ...m.entrance };
}

// 예전(좌우로 걷던 필드) 세이브의 무사수행을 지도 위로 옮긴다. 지금 구간의 장소만 새로 놓는다.
export function normalizeJourney(s: GameState): GameState {
  const j = s.journey as (JourneyState & { heroX?: number }) | null | undefined;
  if (!j || (j.pos && Array.isArray(j.builtLegs) && j.pois.every((p) => typeof p.tx === 'number'))) return s;
  const r = getRegion(j.regionId);
  const m = getJourneyMap(r.id);
  const zone = zoneOf(m, j.legId) || zoneOf(m, r.startLeg)!;
  const fixed: JourneyState = {
    regionId: j.regionId,
    day: j.day,
    maxDays: j.maxDays,
    legId: zone.legId,
    pos: standableNear(m, zone.cx, zone.cy),
    facing: 'R',
    steps: 0,
    pois: [],
    builtLegs: [zone.legId],
    builtAreas: [zone.legId],
    area: null,
    visitedLegs: Array.from(new Set([...(j.visitedLegs || []), zone.legId])),
    highlights: j.highlights || [],
    start: j.start,
    usedKeys: Array.from(new Set([...(j.usedKeys || []), ...(j.pois || []).map((p) => p.eventKey)])),
    lastRumor: j.lastRumor,
  };
  fixed.pois = buildPois(s, r, getLeg(r, zone.legId), fixed);
  return { ...s, journey: fixed };
}

// ───────── 걷기 ─────────

export function currentRegion(s: GameState): JourneyRegion | null {
  return s.journey ? getRegion(s.journey.regionId) : null;
}

export function currentLeg(s: GameState): JourneyLeg | null {
  const r = currentRegion(s);
  return r && s.journey ? getLeg(r, s.journey.legId) : null;
}

// 돌발 사건(매복·맹수·폭설·검문)이 하루에 일어날 확률. 지역의 위험도, 땅의 성격, 계절에 따른다.
function ambushRatePerDay(s: GameState, r: JourneyRegion, leg: JourneyLeg): number {
  const base = Math.max(0, r.danger - 0.15) * 0.05;
  const terrain = leg.terrain === 'TOWN' || leg.terrain === 'TEMPLE' ? 0.4 : 1;
  return base * terrain * (s.season === 'WINTER' ? 1.2 : 1);
}

// 처음 발을 들인 땅 — 그 땅의 장소들을 놓는다
function enterZone(s: GameState, legId: string): GameState {
  const r = currentRegion(s);
  const j = s.journey;
  if (!r || !j || j.legId === legId) return s;
  const leg = getLeg(r, legId);
  void leg;
  const journey: JourneyState = {
    ...j,
    legId,
    visitedLegs: j.visitedLegs.includes(legId) ? j.visitedLegs : [...j.visitedLegs, legId],
    builtLegs: j.builtLegs.includes(legId) ? j.builtLegs : [...j.builtLegs, legId],
  };
  return { ...s, journey };
}

// 둘러본 칸을 넓히고, 가까이 다가간 숨은 장소를 찾는다
const FIND_RANGE = 2;
function lookAround(j: JourneyState): JourneyState {
  if (!j.area) return j;
  const m = getAreaMap(j.area);
  const bits = decodeExplored(j.explored?.[j.area], m.w * m.h);
  const changed = revealAround(m, bits, j.pos.x, j.pos.y);
  let pois = j.pois;
  if (pois.some((p) => p.area === j.area && p.hidden && !p.found && Math.max(Math.abs(p.tx - j.pos.x), Math.abs(p.ty - j.pos.y)) <= FIND_RANGE)) {
    pois = pois.map((p) =>
      p.area === j.area && p.hidden && !p.found && Math.max(Math.abs(p.tx - j.pos.x), Math.abs(p.ty - j.pos.y)) <= FIND_RANGE ? { ...p, found: true } : p
    );
  }
  if (!changed && pois === j.pois) return j;
  return { ...j, pois, explored: changed ? { ...(j.explored || {}), [j.area]: encodeExplored(bits) } : j.explored };
}

// 바깥 지도의 입구를 밟아 구역 지도로 들어간다. 처음 들어서면 그 땅의 장소들이 놓인다.
export function enterArea(s: GameState, legId: string): GameState {
  const r = currentRegion(s);
  const j = s.journey;
  if (!r || !j || j.area) return s;
  const leg = getLeg(r, legId);
  const m = getAreaMap(legId);
  let journey: JourneyState = {
    ...j,
    legId,
    area: legId,
    overPos: { ...j.pos },
    pos: { ...m.entrance },
    facing: 'U',
    visitedLegs: j.visitedLegs.includes(legId) ? j.visitedLegs : [...j.visitedLegs, legId],
  };
  if (!(j.builtAreas || []).includes(legId)) {
    const pois = buildPois(s, r, leg, journey);
    journey = { ...journey, builtAreas: [...(j.builtAreas || []), legId], pois: [...journey.pois, ...pois] };
  }
  return { ...s, journey: lookAround(journey) };
}

// 구역 지도의 출구로 나가 바깥 지도의 입구에 선다
export function leaveArea(s: GameState): GameState {
  const j = s.journey;
  if (!j || !j.area) return s;
  const over = getJourneyMap(j.regionId);
  const gate = over.gates?.find((g) => g.legId === j.area);
  const pos = j.overPos || (gate ? { x: gate.x, y: gate.y } : { ...over.entrance });
  return { ...s, journey: { ...j, area: null, pos, facing: 'D' } };
}

// 바깥 지도에서 지금 선 칸이 구역 지도의 입구인가
export function gateHere(s: GameState): string | null {
  const j = s.journey;
  if (!j || j.area) return null;
  const g = getJourneyMap(j.regionId).gates?.find((gt) => gt.x === j.pos.x && gt.y === j.pos.y);
  return g ? g.legId : null;
}

// 구역 지도의 출구 칸에 서 있는가
export function atAreaExit(s: GameState): boolean {
  const j = s.journey;
  if (!j || !j.area) return false;
  const m = getAreaMap(j.area);
  return j.pos.x === m.entrance.x && j.pos.y === m.entrance.y;
}

const FACING: Record<string, JourneyState['facing']> = { '1,0': 'R', '-1,0': 'L', '0,1': 'D', '0,-1': 'U' };

// 한 칸 걷는다. 길이 막혔으면 방향만 바꾼다. 장소를 밟으면 사건이 열리고, 걷는 동안 돌발 사건이 끼어든다.
export function stepJourney(s: GameState, dx: number, dy: number): GameState {
  const j = s.journey;
  if (!j || s.activeEvent || s.pendingBattle || s.phase !== 'MAIN') return s;
  if (j.day >= j.maxDays - 0.01) return s;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return s;
  const r = currentRegion(s)!;
  const m = currentMap(j);
  const nx = j.pos.x + dx;
  const ny = j.pos.y + dy;
  const facing = FACING[`${dx},${dy}`] || j.facing;
  // 구역 지도의 출구에서 아래로 걸어 나가면 바깥 지도로
  if (j.area && dy === 1 && j.pos.x === m.entrance.x && j.pos.y === m.entrance.y) return leaveArea(s);
  const t = tileAt(m, nx, ny);
  if (!t || !TILE_INFO[t].pass) return facing === j.facing ? s : { ...s, journey: { ...j, facing } };
  const cost = stepDays(j, t, s.season);
  let next: GameState = {
    ...s,
    journey: { ...j, pos: { x: nx, y: ny }, facing, day: Math.min(j.maxDays, j.day + cost), steps: (j.steps || 0) + 1 },
  };
  if (!j.area) {
    const zone = zoneLegAt(m, nx, ny);
    if (zone && zone !== j.legId) next = enterZone(next, zone);
    // 땅의 입구를 밟았다 — 그 땅의 구역 지도로
    const gate = m.gates?.find((g) => g.x === nx && g.y === ny);
    if (gate) return enterArea(next, gate.legId);
  } else {
    next = { ...next, journey: lookAround(next.journey!) };
  }
  const js = next.journey!;

  // 길을 걷다 보면 새 풍문이 들린다
  if (Math.random() < cost / 6) {
    const rumors = rumorsFor(s.country, s.year);
    if (rumors.length) next = { ...next, journey: { ...js, lastRumor: rumors[Math.floor(Math.random() * rumors.length)] } };
  }

  // 장소를 밟았다 (숨은 장소도 밟으면 드러난다)
  const poi = poisOnMap(js).find((p) => p.tx === nx && p.ty === ny && !p.done);
  if (poi) return openPoi(next, poi.id);

  // 돌발 사건 — 바로 앞선 돌발에서 나흘은 지나야 또 일어난다
  const leg = getLeg(r, js.legId);
  const sinceLast = js.day - (js.lastAmbushDay ?? -99);
  if (js.day >= 3 && sinceLast >= 4 && !(js.safeLegs || []).includes(js.legId) && Math.random() < ambushRatePerDay(s, r, leg) * cost) {
    next = { ...next, journey: { ...next.journey!, lastAmbushDay: js.day } };
    next = openAmbush(next);
  }
  return next;
}

// 지금 선 칸의 장소 (다시 살펴보기용)
export function poiHere(s: GameState): JourneyPoi | null {
  const j = s.journey;
  if (!j) return null;
  return poisOnMap(j).find((p) => p.tx === j.pos.x && p.ty === j.pos.y && !p.done) || null;
}

// 도장으로 이어지는 길목에 서 있는가
export function atEntrance(s: GameState): boolean {
  const j = s.journey;
  if (!j || j.area) return false;
  const m = getJourneyMap(j.regionId);
  return j.pos.x === m.entrance.x && j.pos.y === m.entrance.y;
}

// ───────── 사건 열기 ─────────

function toEvent(s: GameState, def: JourneyEventDef, ctx: JCtx): ActiveEvent {
  const body = def.build(s, ctx);
  return {
    ...body,
    id: `jr_${def.key}_${s.turn}${Math.random().toString(36).slice(2, 5)}`,
    meta: { ...(body.meta || {}), jrKey: def.key, poiId: ctx.poiId || '' },
  };
}

export function openPoi(s: GameState, poiId: string): GameState {
  const j = s.journey;
  const r = currentRegion(s);
  const poi = j?.pois.find((p) => p.id === poiId);
  if (!j || !r || !poi || poi.done) return s;
  const def = getJourneyEventDef(poi.eventKey);
  if (!def) return s;
  return { ...s, activeEvent: toEvent(s, def, { key: def.key, poiId, region: r, data: poi.data }) };
}

export function openAmbush(s: GameState): GameState {
  const r = currentRegion(s);
  if (!r) return s;
  const keys: Array<[string, number]> = [
    ['amb_bandit', 0.45],
    ['amb_beast', 0.3],
    ['amb_weather', 0.15],
    ['amb_checkpoint', 0.12],
  ];
  const usable = keys.filter(([k]) => {
    const d = getJourneyEventDef(k);
    return d && (!d.cond || d.cond(s, r));
  });
  const key = weighted(usable);
  const def = key ? getJourneyEventDef(key) : undefined;
  if (!def) return s;
  return { ...s, activeEvent: toEvent(s, def, { key: def.key, region: r }) };
}

// ───────── 사건 결말 ─────────

export function isJourneyEvent(ev: ActiveEvent): boolean {
  return ev.id.startsWith('jr_') && typeof ev.meta?.jrKey === 'string';
}

// resolveEventOption이 넘겨준다 (activeEvent는 이미 비워진 상태).
export function resolveJourneyEvent(s: GameState, ev: ActiveEvent, optionId: string): GameState {
  const key = String(ev.meta?.jrKey || '');
  const def = getJourneyEventDef(key);
  if (!def) return s;
  const poiId = String(ev.meta?.poiId || '') || undefined;
  const ctx: JCtx = { key, poiId, region: currentRegion(s), data: (ev.meta || {}) as Record<string, string | number> };
  let next = def.resolve({ ...s, pendingNotice: null }, optionId, ctx);
  // 본 장면을 적어 둔다 — 고른 선택지와 상관없이, 플레이어는 이 장면을 이미 읽었다.
  //  변주(vkey): 같은 틀 안의 같은 장면이 연달아 나오지 않게 / 길 위 장소: 바로 앞선 수행들에서 만난 사건은 덜 놓이게
  {
    const seen: Record<string, number> = {};
    const vkey = ev.meta?.vkey;
    if (vkey !== undefined && vkey !== '') seen[`${key}:${String(vkey)}`] = s.turn;
    if (Array.isArray(ev.meta?.vkeys)) (ev.meta.vkeys as unknown[]).forEach((k) => (seen[`${key}:${String(k)}`] = s.turn));
    if (s.journey && def.kind !== 'HOME' && def.kind !== 'ECHO_HOME') {
      seen[`road:${key}`] = s.flags.journeyCount || 0;
      seen[`road#${key}`] = (s.flags.eventSeen?.[`road#${key}`] || 0) + 1;
    }
    next = noteSeen(next, seen);
  }
  if (optionId !== 'leave') {
    if (poiId && next.journey) {
      next = { ...next, journey: { ...next.journey, pois: next.journey.pois.map((p) => (p.id === poiId ? { ...p, done: true } : p)) } };
    }
    if (def.once || def.kind === 'MASTER' || def.kind === 'HISTORY' || def.kind === 'VISTA') {
      if (def.once !== false) next = markDone(next, key);
    }
  }
  if (def.kind === 'HOME') {
    // 노년(55+)에 같은 생성형 틀이 몇 번 나왔는지도 센다 (#키) — 노년에는 같은 틀을 두 번까지만
    // 일생 동안 같은 틀이 몇 번 나왔는지(%키) — 자주 나온 틀일수록 덜 뽑히고 더 오래 쉰다
    const hl = next.flags.homeEventLast || {};
    const elderCount = s.age >= 55 && !def.elder ? { [`#${key}`]: (hl[`#${key}`] || 0) + 1 } : {};
    next = { ...next, flags: { ...next.flags, homeEventLast: { ...hl, [key]: s.turn, [`%${key}`]: (hl[`%${key}`] || 0) + 1, ...elderCount } } };
    // 생성형 사건은 자주 오므로 명성 보상을 덜어 낸다 (고정된 큰 사건보다 무겁지 않게)
    const gained = next.fame - s.fame;
    if (gained > 0) next = { ...next, fame: s.fame + Math.round(gained * HOME_FAME_MULT) };
  }
  return addLog(next, `${s.journey ? '[무사수행] ' : ''}${ev.title}`, def.kind === 'HISTORY' || def.kind === 'ECHO_HOME' ? 'RUMOR' : 'NORMAL');
}

// ───────── 도장의 생성형 사건 ─────────
// 같은 틀은 6계절 안에 되풀이되지 않는다. 틀 안의 사람·사연·시절은 매번 새로 뽑는다.
const HOME_COOLDOWN = 6;
// 노년(55+)에 같은 도장 생성형 틀(도전장·의뢰·병기상…)이 나올 수 있는 횟수 — 그 자리는 노년의 사건이 채운다
const ELDER_GENERIC_CAP = 2;
const HOME_FAME_MULT = 0.65;
// 일생 동안 자주 나온 틀일수록 덜 뽑히고(가중치 ÷(1+0.35×횟수)) 더 오래 쉰다(쉬는 계절 ×(1+0.25×횟수)).
// 한 틀이 네 번째쯤부터는 아직 덜 본 다른 틀에 자리를 내준다.
const USE_WEIGHT_DECAY = 0.35;
const USE_COOLDOWN_GROWTH = 0.25;

function homePool(s: GameState, elder: boolean): Array<[JourneyEventDef, number]> {
  const last = s.flags.homeEventLast || {};
  const region = getRegion(regionsForCountry(s.country)[0].id);
  return ALL_JOURNEY_EVENTS.filter(
    (d) =>
      d.kind === 'HOME' &&
      !!d.elder === elder &&
      (elder || s.age < 55 || (last[`#${d.key}`] || 0) < ELDER_GENERIC_CAP) &&
      !(d.once && isDone(s, d.key)) &&
      (!d.countries || d.countries.includes(s.country)) &&
      (last[d.key] === undefined ||
        s.turn - last[d.key] >= (d.cooldown ?? HOME_COOLDOWN) * (elder ? 1 : s.age >= 65 ? 2.5 : s.age >= 55 ? 1.75 : 1) * (1 + USE_COOLDOWN_GROWTH * (last[`%${d.key}`] || 0))) &&
      triggerMet(d.trigger, s, null, 0) &&
      (!d.cond || d.cond(s, region))
  )
    .map((d) => [d, ((d.weight ?? 1) * (d.weightBy ? d.weightBy(s, region) : 1)) / (1 + USE_WEIGHT_DECAY * (last[`%${d.key}`] || 0))] as [JourneyEventDef, number])
    .filter(([, w]) => w > 0);
}

export function pickHomeEvent(s: GameState): ActiveEvent | null {
  if (s.journey || s.turn < 3) return null;
  const def = weighted(homePool(s, false));
  if (!def) return null;
  return toEvent(s, def, { key: def.key, region: null });
}

// 노년(55세+)의 사건. 도장 생성형 사건과는 따로, 노년 몫의 자리에서만 뽑는다.
export function pickElderEvent(s: GameState): ActiveEvent | null {
  if (s.journey || s.age < 55) return null;
  const def = weighted(homePool(s, true));
  if (!def) return null;
  return toEvent(s, def, { key: def.key, region: null });
}

// applyBattleOutcome이 넘겨준다.
export function applyJourneyBattle(s: GameState, battle: BattleConfig, victory: boolean): GameState {
  const [, key, opt] = (battle.eventFollowupId || '').split('|');
  const def = getJourneyEventDef(key);
  let base = s;
  // 길 위의 진검승부는 살생이 아니다. 도장 전투 정산이 진검 승리에 얹는 살기(REAL_DUEL_RUTHLESS)를 덜어 낸다.
  // 길 위의 살기는 「벤다 / 살려 보낸다」 같은 선택에서만 붙는다 — 예전에는 살의를 품은 상대를 꺾을 때마다 조금씩 남아,
  // 산적을 자주 만난 사람일수록 저절로 「살인검」의 엔딩으로 기울었다.
  if (victory && battle.journeyStakes && s.phase !== 'ENDING') {
    base = { ...base, reputation: { ...base.reputation, ruthless: Math.max(0, base.reputation.ruthless - REAL_DUEL_RUTHLESS) } };
  }
  if (!def?.onBattle || base.phase === 'ENDING') return { ...base, journeyBattleCtx: null };
  const ctx: JCtx = { key, region: currentRegion(base), data: base.journeyBattleCtx || undefined };
  const next = def.onBattle({ ...base, pendingNotice: null }, opt, victory, ctx);
  return { ...next, journeyBattleCtx: null };
}

// ───────── 무사수행 중의 패배 ─────────
// 길 위의 승부는 진검이다. 대부분의 상대는 이겨도 목숨은 거두지 않지만(MERCY), 살의를 품은 상대(HOSTILE)는 난이도에 따라 목숨을 앗는다.
// 진검승부에서 지면 무사수행을 접고 곧바로 귀환해, 남은 날은 요양으로 보낸다. 목검 시합에서 진 것은 수행을 이어 간다.
const DEFEAT_RISK: Record<string, { death: number; disability: number }> = {
  EASY: { death: 0, disability: 0.12 },
  HARD: { death: 0.3, disability: 0.3 },
  HELL: { death: 0.55, disability: 0.45 },
};

const NL = (text: string): SceneDialogueLine => ({ speaker: '나레이션', role: 'NARRATOR', text });

export function applyJourneyDefeat(state: GameState, battle: BattleConfig, outcome: BattleOutcomePayload): GameState {
  const stakes = battle.journeyStakes;
  const region = currentRegion(state);
  let next: GameState = {
    ...state,
    phase: 'MAIN',
    pendingBattle: null,
    flags: { ...state.flags, maxParriesInBattle: Math.max(state.flags.maxParriesInBattle || 0, outcome.justParriesCount) },
  };
  // 술법·금기 초식의 흔적은 도장의 전투 정산과 똑같이 남는다
  if (outcome.usedMagic) {
    next = { ...next, flags: { ...next.flags, usedMagicPublicly: true, magicCastCount: next.flags.magicCastCount + 1 }, reputation: { ...next.reputation, arcane: next.reputation.arcane + 6 } };
  }
  if (outcome.usedForbidden) {
    next = {
      ...next,
      flags: { ...next.flags, forbiddenCastCount: next.flags.forbiddenCastCount + 1 },
      health: Math.max(0, next.health - outcome.recoilHealthLoss),
      maxLifespanPenalty: next.maxLifespanPenalty + outcome.recoilLifespanYears,
    };
    if (next.health <= 0) {
      next = { ...next, phase: 'ENDING', deathCause: '주화입마 반동사', journey: null };
      return addLog(next, '금기 초식의 반동을 길 위에서 견디지 못하고 경맥이 무너졌다.', 'DANGER');
    }
  }
  // 사건이 정해 둔 뒷이야기 (진 경우의 대사·보상)
  next = applyJourneyBattle(next, battle, false);
  const lines: SceneDialogueLine[] = [...(next.pendingNotice || [])];

  if (!stakes) {
    // 목검·죽도 시합 — 멍이 들었을 뿐, 수행은 계속된다
    next = addHealth(addFame(next, -5), -5);
    lines.push(NL('시합에서 졌다. 멍든 어깨를 주무르며 다시 길에 올랐다. (명성 -5, 건강 -5)'));
    return addLog({ ...next, pendingNotice: lines }, `[무사수행] ${battle.title}에서 졌다.`, 'NORMAL');
  }

  const risk = DEFEAT_RISK[getDifficultyId(state)] || DEFEAT_RISK.EASY;
  let hurt: number;
  if (stakes === 'HOSTILE') {
    const guard = Math.min(0.4, (state.stats.vit + state.stats.wil) * 0.002);
    if (Math.random() < risk.death * (1 - guard)) {
      next = { ...next, phase: 'ENDING', health: 0, deathCause: '진검결투 전사 (무사수행)', journey: null };
      return addLog(next, `${region?.name || '길 위'}에서 ${battle.enemyName}의 칼에 쓰러져 다시 일어나지 못했다.`, 'DANGER');
    }
    const possible = (['ONE_ARM', 'BLIND', 'LIMP'] as const).filter((d) => !next.disabilities.includes(d));
    if (possible.length > 0 && Math.random() < risk.disability) {
      const gained = possible[Math.floor(Math.random() * possible.length)];
      const label = gained === 'ONE_ARM' ? '한 팔을 잃었다' : gained === 'BLIND' ? '두 눈의 빛을 잃었다' : '다리를 크게 다쳐 절게 되었다';
      next = { ...next, disabilities: [...next.disabilities, gained] };
      lines.push(NL(`${battle.enemyName}의 칼은 사정을 두지 않았다. 목숨은 건졌으나… ${label}.`));
    } else {
      lines.push(NL(`${battle.enemyName}의 칼끝이 목을 겨눈 순간, 지나던 이들이 몰려와 겨우 목숨을 건졌다.`));
    }
    hurt = 26 + Math.floor(Math.random() * 12);
  } else {
    lines.push(NL(`${battle.enemyName}이(가) 마지막 칼을 거두었다. 「목숨까지 가져갈 승부는 아니었소.」`));
    hurt = 14 + Math.floor(Math.random() * 8);
  }
  next = {
    ...next,
    health: Math.max(1, next.health - hurt),
    statuses: [
      ...next.statuses.filter((x) => x.id !== 'HEAVY_INJURY'),
      { id: 'HEAVY_INJURY', label: '진검승부의 상처', turnsRemaining: stakes === 'HOSTILE' ? 2 : 1 },
    ],
  };
  next = addFame(next, stakes === 'HOSTILE' ? -10 : -6);

  // 곧바로 귀환 — 남은 날은 요양으로
  const j = next.journey;
  if (j) {
    const remaining = Math.max(0, Math.round(j.maxDays - j.day));
    const heal = Math.min(30, Math.round(remaining * 0.35));
    next = highlight(next, `${battle.enemyName}에게 진검승부로 패해 귀환 — 남은 ${remaining}일은 요양`);
    next = finishJourney(next);
    next = addHealth(next, heal);
    lines.push(NL(`무사수행을 접고 도장으로 돌아왔다. 남은 ${remaining}일은 몸을 추스르며 보냈다. (건강 -${hurt}, 요양 +${heal}, 다음 계절까지 중상)`));
  }
  return { ...next, pendingNotice: lines };
}

// ───────── 귀환 ─────────

export function journeyOver(s: GameState): boolean {
  const j = s.journey;
  if (!j) return false;
  return j.day >= j.maxDays - 0.01;
}

export function finishJourney(s: GameState): GameState {
  const j = s.journey;
  if (!j) return s;
  const r = getRegion(j.regionId);
  const keys: Array<[keyof GameState['stats'], string]> = [
    ['str', '근력'], ['agi', '민첩'], ['vit', '체력'], ['wil', '정신'], ['ins', '통찰'], ['qi', '영력'],
  ];
  const statDeltas: string[] = [];
  keys.forEach(([k, lbl]) => {
    const d = s.stats[k] - j.start.stats[k];
    if (d !== 0) statDeltas.push(`${lbl} ${d > 0 ? '+' : ''}${d}`);
  });
  // 스승 없이 보낸 한 계절
  const alive = s.disciples.filter((d) => !d.dead);
  const disciples = s.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.max(0, d.loyalty - (d.temperament === 'GENTLE' || d.temperament === 'UPRIGHT' ? 1 : 2)) }));
  const summary: SeasonSummaryData = {
    year: j.start.year,
    season: j.start.season,
    activitiesDone: ['JOURNEY'],
    moneyDelta: s.money - j.start.money,
    fameDelta: s.fame - j.start.fame,
    healthDelta: s.health - j.start.health,
    statDeltas,
    majorEvents: [],
    discipleNote: alive.length > 0 ? `스승이 길을 떠난 사이 문하생 ${alive.length}명이 저희끼리 도장을 지켰습니다. (충성 -1~2)` : undefined,
    highlights: [`${r.name}(${r.hanja}) 무사수행 — ${j.visitedLegs.length}곳을 지나 ${Math.round(j.day)}일`, ...(j.highlights.length ? j.highlights : ['큰일 없이 길을 걷고 돌아왔다.'])],
  };
  const next: GameState = { ...s, disciples, journey: null, lastSeasonSummary: summary, activeEvent: null };
  return addLog(next, `${r.name} 무사수행을 마치고 도장으로 돌아왔다. (${j.visitedLegs.length}곳, ${Math.round(j.day)}일)`, 'GOOD');
}

// ───────── 도장으로 돌아오는 메아리 ─────────

export function pickDueHomeEcho(s: GameState): ActiveEvent | null {
  if (s.turn < 5 || s.journey) return null;
  const due = (s.flags.echoes || []).filter((e) => e.channel === 'HOME' && e.dueTurn <= s.turn).sort((a, b) => a.dueTurn - b.dueTurn);
  for (const e of due) {
    const def = getJourneyEventDef(`echo_${e.key}`);
    if (!def) continue;
    if (def.cond && !def.cond(s, getRegion(undefined))) continue;
    return toEvent(s, def, { key: def.key, region: null, data: e.data });
  }
  return null;
}

// ───────── 봇·테스트용: 화면 없이 무사수행 한 계절을 돈다 ─────────

export interface HeadlessJourneyHooks {
  choose: (s: GameState, ev: ActiveEvent) => string;
  fight: (s: GameState) => GameState; // pendingBattle을 치르고 결과를 반영해 돌려준다
  onEvent?: (key: string, s: GameState) => void;
  onStep?: (s: GameState) => void;
}

// 봇은 사람처럼 걷는다 — 숨은 장소를 미리 알지 못한다.
//  구역 지도: 보이는 장소로 가고, 없으면 아직 둘러보지 않은 칸 쪽으로. 땅의 대부분을 보았거나 오래 머물렀으면 출구로 나간다.
//  바깥 지도: 아직 들어가 보지 않은 땅의 입구로. 갈 곳이 없으면 수행을 마친다.
const BOT_AREA_SEEN = 0.72; // 이만큼 둘러보면 나간다
const BOT_AREA_DAYS = 24; // 한 땅에 이보다 오래 머물지 않는다
export function runJourneyHeadless(s0: GameState, regionId: JourneyRegionId | undefined, hooks: HeadlessJourneyHooks): GameState {
  let s = startJourney(s0, regionId);
  const tried = new Set<string>(); // 한 번 살펴본 장소 (그냥 지나쳤어도 다시 가지 않는다)
  const done = new Set<string>(); // 다 둘러보고 나온 땅
  let areaSince = 0;
  const handleEvent = () => {
    let inner = 0;
    while (s.activeEvent && inner++ < 4) {
      const ev = s.activeEvent;
      const opt = hooks.choose(s, ev);
      hooks.onEvent?.(String(ev.meta?.jrKey || ev.id), s);
      if (ev.meta?.poiId) tried.add(String(ev.meta.poiId));
      s = resolveJourneyEvent({ ...s, activeEvent: null }, ev, opt);
      s = { ...s, pendingNotice: null };
      if (s.pendingBattle && s.phase === 'BATTLE') s = hooks.fight(s);
      if (s.pendingTraitSkillId) s = { ...s, pendingTraitSkillId: null };
    }
  };
  let guard = 0;
  while (s.journey && s.phase === 'MAIN' && !journeyOver(s) && guard++ < 400) {
    const j = s.journey;
    const m = currentMap(j);
    let path: Array<{ x: number; y: number }> | null = null;
    let leaving = false;
    if (j.area) {
      const bits = exploredBits(j)!;
      let seen = 0;
      let reachable = 0;
      for (let i = 0; i < m.w * m.h; i++) if (m.reach[i]) { reachable++; if (bits[i]) seen++; }
      const open = poisOnMap(j).filter((p) => !p.done && !tried.has(p.id) && poiVisible(p, bits, m.w));
      if (open.length) path = findPath(m, j.pos, (x, y) => open.some((p) => p.tx === x && p.ty === y));
      const stay = seen / Math.max(1, reachable) < BOT_AREA_SEEN && j.day - areaSince < BOT_AREA_DAYS;
      if (!path && stay) path = findPath(m, j.pos, (x, y) => !bits[y * m.w + x]);
      if (!path) {
        leaving = true;
        done.add(j.area);
        path = j.pos.x === m.entrance.x && j.pos.y === m.entrance.y ? [] : findPath(m, j.pos, (x, y) => x === m.entrance.x && y === m.entrance.y);
        if (!path) break;
      }
    } else {
      const gates = (m.gates || []).filter((g) => !done.has(g.legId));
      path = gates.length ? findPath(m, j.pos, (x, y) => gates.some((g) => g.x === x && g.y === y)) : null;
      if (!path) break;
    }
    // 구역 지도에서는 몇 걸음마다 목표를 다시 고른다 (걷는 사이에 새 장소가 드러난다)
    const chunk = j.area && !leaving ? path.slice(0, 6) : path;
    for (const step of chunk) {
      if (!s.journey || s.phase !== 'MAIN' || journeyOver(s)) break;
      const before = s.journey.area;
      const cur = s.journey.pos;
      s = stepJourney(s, step.x - cur.x, step.y - cur.y);
      hooks.onStep?.(s);
      if (s.activeEvent) {
        handleEvent();
        break;
      }
      if (s.journey && s.journey.area !== before) {
        if (s.journey.area) areaSince = s.journey.day;
        break;
      }
    }
    if (leaving && s.journey?.area && !s.activeEvent) {
      s = stepJourney(s, 0, 1); // 출구에서 아래로 걸어 나간다
      hooks.onStep?.(s);
    }
  }
  if (s.journey) hooks.onStep?.(s);
  if (s.journey && s.phase === 'MAIN') s = finishJourney(s);
  return s;
}
