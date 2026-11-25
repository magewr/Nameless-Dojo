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
import {
  DAY_PX,
  getLeg,
  getRegion,
  JOURNEY_DAYS_PER_SEASON,
  JourneyLeg,
  JourneyRegion,
  regionsForCountry,
  rumorsFor,
} from '../data/journeyRegions';
import { addFame, addHealth, highlight, JCtx, JourneyEventDef, isDone, markDone, triggerMet } from './journeyCore';
import { getDifficultyId } from '../data/difficulty';
import { BattleOutcomePayload, REAL_DUEL_RUTHLESS } from './gameLogic';
import { SceneDialogueLine } from '../types/game';
import { addLog } from './log';

// ───────────────────────── 무사수행 진행 엔진 ─────────────────────────
// 필드 화면(JourneyView)과 플레이테스트 봇이 함께 쓰는 순수 함수들.

const LEG_MARGIN = 80;

// 구간 표의 날수는 길만 걸었을 때 기준이다. 쉬고, 헤매고, 길을 묻는 날까지 쳐서 1.3배로 잡는다.
const LEG_DAYS_MULT = 1.3;

export function legDays(leg: JourneyLeg): number {
  return Math.round(leg.days * LEG_DAYS_MULT);
}

function legPx(leg: JourneyLeg): number {
  return legDays(leg) * DAY_PX;
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

// 이 구간에 놓일 장소들. 시대 사건은 가중치를 크게 주어 그 해의 공기가 길 위에 드러나게 한다.
function buildPois(s: GameState, r: JourneyRegion, leg: JourneyLeg, journey: Pick<JourneyState, 'pois' | 'usedKeys'> | JourneyState | null): JourneyPoi[] {
  const used = new Set<string>([...(journey?.pois || []).map((p) => p.eventKey), ...(journey?.usedKeys || [])]);
  const length = legPx(leg);
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

  const slots = 3 + (Math.random() < 0.5 ? 1 : 0);
  let guard = 0;
  while (out.length < slots + (leg.vista ? 1 : 0) && guard++ < 30) {
    const kind = weighted(
      (Object.entries(leg.pois) as Array<[JourneyPoiKind, number]>).map(([k, w]) => [k, k === 'HISTORY' ? w * 1.6 : w])
    );
    if (!kind || kind === 'VISTA') continue;
    const day = journey && 'day' in journey ? Number((journey as JourneyState).day) : 0;
    const pool = ALL_JOURNEY_EVENTS.filter((d) => d.kind === kind && eligible(d, s, r, used, leg, day) && !out.some((o) => o.key === d.key && d.once !== false));
    // 이 지역·연도에 맞는 시대 사건이 없으면 사람 사이의 인연으로 대신한다.
    const fallback = kind === 'HISTORY' || kind === 'MASTER' ? ALL_JOURNEY_EVENTS.filter((d) => d.kind === 'PEOPLE' && eligible(d, s, r, used, leg, day)) : [];
    // 시기가 정해진 사건(연도·특정 시기)은 그때가 아니면 볼 수 없으니 더 자주 놓는다
    const timed = (d: JourneyEventDef) => (d.years || d.trigger?.periods || d.trigger?.yearCycle ? 2.5 : d.trigger?.seasons ? 1.6 : 1);
    const pick = weighted((pool.length ? pool : fallback).map((d) => [d, (d.weight ?? 1) * timed(d) * (d.weightBy ? d.weightBy(s, r) : 1)]));
    if (!pick) continue;
    out.push({ kind: pick.kind as JourneyPoiKind, key: pick.key });
    used.add(pick.key);
  }

  // 길을 따라 고르게 흩뿌린다.
  const span = length - LEG_MARGIN * 2 - 260;
  return out.map((o, i) => {
    const def = getJourneyEventDef(o.key);
    const base = LEG_MARGIN + 260 + (span * (i + 0.5)) / out.length;
    const x = Math.round(Math.max(LEG_MARGIN + 200, Math.min(length - LEG_MARGIN - 60, base + (Math.random() - 0.5) * (span / out.length) * 0.6)));
    return {
      id: `poi_${s.turn}_${leg.id}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      kind: o.kind,
      eventKey: o.key,
      x,
      label: def?.label ? def.label(s, r) : o.key,
    };
  }).sort((a, b) => a.x - b.x);
}

function buildAmbushes(s: GameState, r: JourneyRegion, leg: JourneyLeg): number[] {
  const length = legPx(leg);
  const expected = r.danger * (leg.days / 16) * (s.season === 'WINTER' ? 1.2 : 1) * (leg.terrain === 'TOWN' || leg.terrain === 'TEMPLE' ? 0.4 : 1);
  const n = Math.floor(expected + Math.random() * 0.9);
  const xs: number[] = [];
  for (let i = 0; i < Math.min(2, n); i++) xs.push(Math.round(400 + Math.random() * (length - 700)));
  return xs.sort((a, b) => a - b);
}

// ───────── 출발 ─────────

export function defaultRegionFor(s: GameState): JourneyRegionId {
  const own = regionsForCountry(s.country);
  const planned = s.seasonPlan.journeyRegionId;
  return own.some((r) => r.id === planned) ? (planned as JourneyRegionId) : own[0].id;
}

export function startJourney(s: GameState, regionId?: JourneyRegionId): GameState {
  const r = getRegion(regionId || defaultRegionFor(s));
  const leg = getLeg(r, r.startLeg);
  const base: JourneyState = {
    regionId: r.id,
    day: 0,
    maxDays: JOURNEY_DAYS_PER_SEASON,
    legId: leg.id,
    legCount: 1,
    legLength: legPx(leg),
    heroX: LEG_MARGIN,
    pois: [],
    ambushAt: [],
    visitedLegs: [leg.id],
    highlights: [],
    start: { money: s.money, fame: s.fame, health: s.health, stats: { ...s.stats }, year: s.year, season: s.season },
    atFork: false,
    lastRumor: rumorsFor(s.country, s.year)[0],
  };
  let next: GameState = {
    ...s,
    lastSeasonSummary: null,
    flags: { ...s.flags, journeyCount: (s.flags.journeyCount || 0) + 1 },
  };
  base.pois = buildPois(next, r, leg, null);
  base.ambushAt = buildAmbushes(next, r, leg);
  next = { ...next, journey: base };
  return addLog(next, `무사수행을 떠났다 — ${r.name}(${r.hanja}). ${r.blurb}`, 'GOOD');
}

// ───────── 걷기 ─────────

// 화면이 주인공 위치를 넘겨줄 때마다 부른다. 걸은 거리만큼 날이 흐르고, 매복 지점을 넘으면 돌발 사건이 터진다.
export function syncWalk(s: GameState, heroX: number, walkedPx: number): GameState {
  const j = s.journey;
  if (!j) return s;
  const x = Math.max(LEG_MARGIN * 0.5, Math.min(j.legLength, heroX));
  let next: GameState = {
    ...s,
    journey: { ...j, heroX: x, day: Math.min(j.maxDays, j.day + walkedPx / DAY_PX), atFork: x >= j.legLength - 4 },
  };
  if (j.ambushAt.length > 0 && x >= j.ambushAt[0] && !s.activeEvent) {
    next = { ...next, journey: { ...next.journey!, ambushAt: j.ambushAt.slice(1) } };
    next = openAmbush(next);
  }
  // 길을 걷다 보면 새 풍문이 들린다
  if (Math.random() < walkedPx / (DAY_PX * 6)) {
    const rumors = rumorsFor(s.country, s.year);
    if (rumors.length) next = { ...next, journey: { ...next.journey!, lastRumor: rumors[Math.floor(Math.random() * rumors.length)] } };
  }
  return next;
}

export function currentRegion(s: GameState): JourneyRegion | null {
  return s.journey ? getRegion(s.journey.regionId) : null;
}

export function currentLeg(s: GameState): JourneyLeg | null {
  const r = currentRegion(s);
  return r && s.journey ? getLeg(r, s.journey.legId) : null;
}

export function nextLegs(s: GameState): JourneyLeg[] {
  const r = currentRegion(s);
  const leg = currentLeg(s);
  if (!r || !leg) return [];
  return leg.next.map((id) => getLeg(r, id));
}

export function enterLeg(s: GameState, legId: string): GameState {
  const r = currentRegion(s);
  const j = s.journey;
  if (!r || !j) return s;
  const leg = getLeg(r, legId);
  const pois = buildPois(s, r, leg, j);
  return {
    ...s,
    journey: {
      ...j,
      usedKeys: Array.from(new Set([...(j.usedKeys || []), ...j.pois.map((p) => p.eventKey)])),
      legId: leg.id,
      legCount: j.legCount + 1,
      legLength: legPx(leg),
      heroX: LEG_MARGIN,
      pois,
      ambushAt: buildAmbushes(s, r, leg),
      visitedLegs: [...j.visitedLegs, leg.id],
      atFork: false,
    },
  };
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
    const hl = next.flags.homeEventLast || {};
    const elderCount = s.age >= 55 && !def.elder ? { [`#${key}`]: (hl[`#${key}`] || 0) + 1 } : {};
    next = { ...next, flags: { ...next.flags, homeEventLast: { ...hl, [key]: s.turn, ...elderCount } } };
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
      (last[d.key] === undefined || s.turn - last[d.key] >= (d.cooldown ?? HOME_COOLDOWN) * (elder ? 1 : s.age >= 65 ? 2.5 : s.age >= 55 ? 1.75 : 1)) &&
      triggerMet(d.trigger, s, null, 0) &&
      (!d.cond || d.cond(s, region))
  ).map((d) => [d, (d.weight ?? 1) * (d.weightBy ? d.weightBy(s, region) : 1)] as [JourneyEventDef, number]).filter(([, w]) => w > 0);
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
  return j.day >= j.maxDays - 0.01 || (!!j.atFork && nextLegs(s).length === 0);
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
    highlights: [`${r.name}(${r.hanja}) 무사수행 — ${j.visitedLegs.length}개 구간, ${Math.round(j.day)}일`, ...(j.highlights.length ? j.highlights : ['큰일 없이 길을 걷고 돌아왔다.'])],
  };
  const next: GameState = { ...s, disciples, journey: null, lastSeasonSummary: summary, activeEvent: null };
  return addLog(next, `${r.name} 무사수행을 마치고 도장으로 돌아왔다. (${j.visitedLegs.length}개 구간, ${Math.round(j.day)}일)`, 'GOOD');
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
  onEvent?: (key: string) => void;
}

export function runJourneyHeadless(s0: GameState, regionId: JourneyRegionId | undefined, hooks: HeadlessJourneyHooks): GameState {
  let s = startJourney(s0, regionId);
  let guard = 0;
  const handleEvent = () => {
    let inner = 0;
    while (s.activeEvent && inner++ < 4) {
      const ev = s.activeEvent;
      const opt = hooks.choose(s, ev);
      hooks.onEvent?.(String(ev.meta?.jrKey || ev.id));
      s = resolveJourneyEvent({ ...s, activeEvent: null }, ev, opt);
      s = { ...s, pendingNotice: null };
      if (s.pendingBattle && s.phase === 'BATTLE') s = hooks.fight(s);
      if (s.pendingTraitSkillId) s = { ...s, pendingTraitSkillId: null };
    }
  };
  while (s.journey && s.phase === 'MAIN' && guard++ < 40) {
    const j = s.journey;
    // 구간을 끝까지 걸으며 장소마다 들른다
    const stops = [...j.pois.map((p) => ({ x: p.x, poi: p.id as string | null })), { x: j.legLength, poi: null }].sort((a, b) => a.x - b.x);
    for (const stop of stops) {
      if (!s.journey || s.phase !== 'MAIN') break;
      const walked = Math.max(0, stop.x - s.journey.heroX);
      s = syncWalk(s, stop.x, walked);
      handleEvent();
      if (!s.journey || journeyOver(s)) break;
      if (stop.poi) {
        s = openPoi(s, stop.poi);
        handleEvent();
      }
      if (!s.journey || journeyOver(s)) break;
    }
    if (!s.journey || s.phase !== 'MAIN') break;
    if (journeyOver(s)) break;
    const options = nextLegs(s);
    if (options.length === 0) break;
    s = enterLeg(s, options[Math.floor(Math.random() * options.length)].id);
  }
  if (s.journey && s.phase === 'MAIN') s = finishJourney(s);
  return s;
}
