import {
  ActiveEvent,
  Season,
  BattleConfig,
  CountryId,
  EchoEntry,
  GameState,
  JourneyPoiKind,
  JourneyRegionId,
  SceneDialogueLine,
  WeaponGroup,
} from '../types/game';
import { ALL_BOOKS_CATALOG, getTraitCandidates, isAtMasteryWall, TRANSCEND_SUMMARY, transcendSkill } from '../data/booksAndSkills';
import { getWeaponById } from '../data/weapons';
import { createBattleConfig } from '../data/events';
import { COUNTRIES } from '../data/worldAndEndings';
import { getDifficultyConfig } from '../data/difficulty';
import { JourneyLeg, JourneyRegion, JourneyTerrain } from '../data/journeyRegions';
import { getJourneyMap, pickPoiTile } from '../data/journeyMap';
import { addLog } from './log';
import { gainSkillExp, getBreakthroughChance, getMaxHealthByAge, isSeclusionContinuing } from './gameLogic';

// 무사수행 사건들이 함께 쓰는 도구 모음. 사건 정의(journeyEvents)와 진행 엔진(journey)이 모두 이걸 쓴다.

export interface JCtx {
  key: string;
  poiId?: string;
  region: JourneyRegion | null; // 도장으로 돌아온 메아리 사건은 지역이 없다
  data?: Record<string, string | number>;
}

export type JourneyEventKind = JourneyPoiKind | 'AMBUSH' | 'ECHO_HOME' | 'HOME';

export type JourneyEventBody = Omit<ActiveEvent, 'id'>;

// 프린세스 메이커식 발동 조건. 적힌 조건을 모두 만족해야 길 위에 놓인다.
export interface JourneyTrigger {
  seasons?: Season[]; // 이 계절에만
  periods?: Array<{ year: number; seasons?: Season[] }>; // 특정 해(의 특정 계절)에만 — 실제 사건의 시기
  yearCycle?: { every: number; rem: number }; // 주기 (예: 식년시 — 자·묘·오·유년, 3년마다)
  terrain?: JourneyTerrain[]; // 이 지형의 구간에서만
  legs?: string[]; // 이 구간에서만
  day?: [number, number]; // 무사수행 n일째 범위
  age?: [number, number];
  fame?: [number, number];
  minRep?: Partial<Record<keyof GameState['reputation'], number>>;
  money?: [number, number];
  health?: [number, number];
  done?: string[]; // 이미 겪은 사건 (일생 기록)
  notDone?: string[];
  echoPending?: string; // 아직 돌아오지 않은 메아리가 걸려 있을 때
  transcended?: boolean; // 극의를 이룬 초식이 있을 때
  atWall?: boolean; // 벽에 닿은 초식이 있을 때
  rivalAct?: number; // 숙적과의 인연이 이 막 이상일 때
  spouse?: boolean;
  champion?: boolean; // 천하대회 우승 경력
  disciples?: number; // 살아 있는 문하생 최소 수
}

export function triggerMet(t: JourneyTrigger | undefined, s: GameState, leg: JourneyLeg | null, day: number): boolean {
  if (!t) return true;
  if (t.seasons && !t.seasons.includes(s.season)) return false;
  if (t.periods && !t.periods.some((p) => p.year === s.year && (!p.seasons || p.seasons.includes(s.season)))) return false;
  if (t.yearCycle && ((s.year % t.yearCycle.every) + t.yearCycle.every) % t.yearCycle.every !== t.yearCycle.rem) return false;
  if (t.terrain && (!leg || !t.terrain.includes(leg.terrain))) return false;
  if (t.legs && (!leg || !t.legs.includes(leg.id))) return false;
  if (t.day && (day < t.day[0] || day > t.day[1])) return false;
  if (t.age && (s.age < t.age[0] || s.age > t.age[1])) return false;
  if (t.fame && (s.fame < t.fame[0] || s.fame > t.fame[1])) return false;
  if (t.minRep && (Object.keys(t.minRep) as Array<keyof GameState['reputation']>).some((k) => s.reputation[k] < (t.minRep![k] || 0))) return false;
  if (t.money && (s.money < t.money[0] || s.money > t.money[1])) return false;
  if (t.health && (s.health < t.health[0] || s.health > t.health[1])) return false;
  if (t.done && !t.done.every((k) => isDone(s, k))) return false;
  if (t.notDone && t.notDone.some((k) => isDone(s, k))) return false;
  if (t.echoPending && !(s.flags.echoes || []).some((e) => e.key === t.echoPending)) return false;
  if (t.transcended && !s.skills.some((sk) => sk.masteryLevel >= 10)) return false;
  if (t.atWall && !s.skills.some((sk) => isAtMasteryWall(sk))) return false;
  if (t.rivalAct !== undefined && (!s.rival.alive || s.rival.act < t.rivalAct)) return false;
  if (t.spouse && !s.spouse?.alive) return false;
  if (t.champion && !(s.flags.tournamentWins || 0)) return false;
  if (t.disciples !== undefined && s.disciples.filter((d) => !d.dead && !d.isChild).length < t.disciples) return false;
  return true;
}

export interface JourneyEventDef {
  key: string;
  kind: JourneyEventKind;
  label?: (s: GameState, r: JourneyRegion) => string; // 필드 위에 뜨는 장소 이름
  regions?: JourneyRegionId[];
  countries?: CountryId[];
  years?: [number, number];
  once?: boolean; // 일생에 한 번
  weight?: number;
  cooldown?: number; // 도장 생성형 사건: 다시 나오기까지의 계절 수 (기본 6)
  elder?: boolean; // 노년(55세+)의 사건 — 도장 생성형 사건과 따로 뽑는다 (노년 몫의 자리에만 나온다)
  cond?: (s: GameState, r: JourneyRegion) => boolean;
  trigger?: JourneyTrigger;
  weightBy?: (s: GameState, r: JourneyRegion) => number; // 상황에 따른 가중치 배수 (예: 호환은 겨울에 잦다)
  build: (s: GameState, c: JCtx) => JourneyEventBody;
  resolve: (s: GameState, opt: string, c: JCtx) => GameState;
  onBattle?: (s: GameState, opt: string, won: boolean, c: JCtx) => GameState;
}

// ───────── 기본 ─────────

export function cur(s: GameState): string {
  return COUNTRIES[s.country].currency;
}

export function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function isDone(s: GameState, key: string): boolean {
  return (s.flags.journeyDone || []).includes(key);
}

export function markDone(s: GameState, key: string): GameState {
  if (isDone(s, key)) return s;
  return { ...s, flags: { ...s.flags, journeyDone: [...(s.flags.journeyDone || []), key] } };
}

// 무사수행 중이면 날수를 쓴다.
export function spendDays(s: GameState, days: number): GameState {
  if (!s.journey || days <= 0) return s;
  return { ...s, journey: { ...s.journey, day: Math.min(s.journey.maxDays, s.journey.day + days) } };
}

export function highlight(s: GameState, text: string): GameState {
  if (!s.journey) return s;
  return { ...s, journey: { ...s.journey, highlights: [...s.journey.highlights, text].slice(-24) } };
}

// 결과 창에 띄울 대사. [화자, 대사] — 화자가 '나레이션'이면 해설, 주인공 이름이면 주인공.
export function say(s: GameState, lines: Array<[string, string]>): GameState {
  const out: SceneDialogueLine[] = lines.map(([speaker, text]) => ({
    speaker,
    text,
    role: speaker === '나레이션' ? 'NARRATOR' : speaker === s.name ? 'HERO' : 'NPC',
  }));
  return { ...s, pendingNotice: out };
}

export function addMoney(s: GameState, delta: number): GameState {
  return { ...s, money: Math.max(0, s.money + delta) };
}

export function addHealth(s: GameState, delta: number): GameState {
  const cap = getMaxHealthByAge(s.age, s.maxLifespanPenalty, s.equippedPassiveIds.includes('sk_kr_08'), s.facilities.clinic);
  return { ...s, health: Math.max(1, Math.min(cap, s.health + delta)) };
}

export function addStats(s: GameState, d: Partial<GameState['stats']>): GameState {
  const st = { ...s.stats };
  (Object.keys(d) as Array<keyof GameState['stats']>).forEach((k) => {
    st[k] = st[k] + (d[k] || 0);
  });
  return { ...s, stats: st };
}

export function addRep(s: GameState, d: Partial<GameState['reputation']>): GameState {
  const r = { ...s.reputation };
  (Object.keys(d) as Array<keyof GameState['reputation']>).forEach((k) => {
    r[k] = r[k] + (d[k] || 0);
  });
  return { ...s, reputation: r };
}

export function addFame(s: GameState, delta: number): GameState {
  return { ...s, fame: Math.max(0, s.fame + delta) };
}

export function remember(s: GameState, key: string, value: string): GameState {
  return { ...s, flags: { ...s.flags, storyMemory: { ...s.flags.storyMemory, [key]: value } } };
}

// 비급을 손에 넣는다. 이미 있으면 null을 돌려준다. progress는 이미 해독한 정도(%).
export function giveBook(s: GameState, bookId: string, progress = 0): { state: GameState; title: string | null } {
  if (s.books.some((b) => b.id === bookId)) return { state: s, title: null };
  const tpl = ALL_BOOKS_CATALOG.find((b) => b.id === bookId);
  if (!tpl) return { state: s, title: null };
  return { state: { ...s, books: [...s.books, { ...tpl, decodeProgress: progress, decoded: false }] }, title: tpl.title };
}

// 아직 없는 책 가운데 하나를 고른다.
export function pickBook(s: GameState, filter: (b: (typeof ALL_BOOKS_CATALOG)[number]) => boolean): string | null {
  const pool = ALL_BOOKS_CATALOG.filter((b) => filter(b) && !s.books.some((x) => x.id === b.id));
  return pool.length > 0 ? rand(pool).id : null;
}

export function giveWeapon(s: GameState, weaponId: string): { state: GameState; name: string | null } {
  if (s.weapons.some((w) => w.id === weaponId)) return { state: s, name: null };
  const w = getWeaponById(weaponId);
  if (!w) return { state: s, name: null };
  return { state: { ...s, weapons: [...s.weapons, { ...w }] }, name: w.name };
}

// 장착 초식 전부에 숙련을 조금씩 (Lv.9 벽은 넘지 않는다)
export function trainEquipped(s: GameState, exp: number): GameState {
  return { ...s, skills: s.skills.map((sk) => (s.equippedActiveIds.includes(sk.id) ? gainSkillExp(sk, exp).updated : sk)) };
}

// ───────── 깨달음 (극의로 가는 두 번째 길) ─────────

// 벽에 닿은 초식(없으면 폐관 중인 초식)에 깨달음을 보탠다. 길 위의 깨달음은 다음 계절 폐관으로 이어진다.
// 깨달음이 100에 닿으면 그 자리에서 벽을 두드린다 — 폐관보다 확률은 낮다(×0.6), 실패해도 주화입마는 없다.
export function gainInsight(s: GameState, amount: number, place: string): { state: GameState; text: string; transcended: boolean } {
  const wall = s.skills.find((sk) => isAtMasteryWall(sk));
  const sec = s.seclusion;
  const target = wall || (sec ? s.skills.find((sk) => sk.id === sec.skillId && sk.masteryLevel < 10) : undefined);
  if (!target) {
    const next = addStats(s, { ins: 2, wil: 1 });
    return { state: next, text: '벽에 닿은 초식이 없어, 마음만 한결 맑아졌다. (통찰 +2, 정신 +1)', transcended: false };
  }
  const carried =
    sec && sec.skillId === target.id ? (isSeclusionContinuing(s, target.id) || sec.lastTurn === s.turn ? sec.insight : Math.floor(sec.insight * 0.5)) : 0;
  const insight = Math.min(100, carried + amount);
  const name = target.customName || target.name;
  let next: GameState = {
    ...s,
    seclusion: { skillId: target.id, insight, seasons: sec && sec.skillId === target.id ? sec.seasons : 0, lastTurn: s.turn },
  };
  if (insight >= 100 && isAtMasteryWall(target)) {
    const p = getBreakthroughChance(next, target) * 0.6;
    if (chance(p)) {
      const t = transcendSkill(target);
      next = {
        ...next,
        skills: next.skills.map((sk) => (sk.id === target.id ? t : sk)),
        pendingTraitSkillId: t.id,
        seclusion: { skillId: t.id, insight: 0, seasons: 0, lastTurn: s.turn },
        fame: next.fame + 60,
      };
      next = addLog(next, `${place}에서 벽이 무너졌다. 관문 안이 아닌 길 위에서 「${name}」이(가) 극의(極意)에 이르렀다!`, 'MAGIC');
      return { state: next, text: `★ 벽이 무너졌다! 「${name}」 극의 돌파 — ${TRANSCEND_SUMMARY}`, transcended: true };
    }
    next = { ...next, seclusion: { ...next.seclusion!, insight: 70 } };
    return { state: next, text: `벽 바로 앞까지 갔으나 끝내 넘지 못했다. 「${name}」의 깨달음은 70%에 머문다.`, transcended: false };
  }
  return { state: next, text: `「${name}」의 깨달음 ${carried}% → ${insight}% (다음 계절 폐관으로 이어진다)`, transcended: false };
}

// 극의 각인 후보가 있는지 미리 보는 용도 (UI 안내문)
export function hasWallSkill(s: GameState): boolean {
  return s.skills.some((sk) => isAtMasteryWall(sk));
}

export { getTraitCandidates };

// ───────── 메아리 (나비효과) ─────────

export function addEcho(
  s: GameState,
  e: { key: string; minYears: number; maxYears: number; channel: EchoEntry['channel']; bornText: string; regionId?: JourneyRegionId; data?: EchoEntry['data'] }
): GameState {
  // 나비효과는 특별해야 한다 — 같은 메아리는 하나만 걸려 있고, 한 번 돌아온 메아리는 일생에 다시 심지 않는다.
  if ((s.flags.echoes || []).some((x) => x.key === e.key) || isDone(s, `echoed_${e.key}`)) return s;
  const years = e.minYears + Math.random() * (e.maxYears - e.minYears);
  const entry: EchoEntry = {
    key: e.key,
    dueTurn: s.turn + Math.max(1, Math.round(years * 4)),
    channel: e.channel,
    bornYear: s.year,
    bornText: e.bornText,
    regionId: e.regionId,
    data: e.data,
  };
  return { ...s, flags: { ...s.flags, echoes: [...(s.flags.echoes || []), entry] } };
}

export function takeEcho(s: GameState, key: string): { state: GameState; echo: EchoEntry | null } {
  const list = s.flags.echoes || [];
  const idx = list.findIndex((e) => e.key === key);
  if (idx === -1) return { state: s, echo: null };
  const echo = list[idx];
  return { state: markDone({ ...s, flags: { ...s.flags, echoes: list.filter((_, i) => i !== idx) } }, `echoed_${key}`), echo };
}

// 메아리가 돌아왔을 때 생전 기록에 "원인 → 결과"로 남긴다.
export function echoMilestone(s: GameState, echo: EchoEntry, result: string): GameState {
  const m = { key: `ECHO_${echo.key.toUpperCase()}`, year: s.year, season: s.season, age: s.age, text: `${echo.bornYear}년 ${echo.bornText} — 그 인연으로 ${result}` };
  return { ...s, milestones: [...(s.milestones || []), m].slice(-120) };
}

// ───────── 전투 ─────────

// 길 위 상대의 강도. 도장 사건과 같은 곡선에 지역 위험도와 배수를 얹는다.
export function roadScale(s: GameState, mult = 1): number {
  const diff = getDifficultyConfig(s);
  const base = Math.min(3.15, 0.72 + Math.sqrt(Math.max(1, s.turn)) * 0.165 + Math.sqrt(Math.max(0, s.fame)) * 0.028);
  return Math.max(0.6, Math.min(4.0, base * diff.enemyScaleMult * mult));
}

export function journeyBattle(
  s: GameState,
  c: JCtx,
  opt: string,
  b: {
    title: string;
    subtitle: string;
    name: string;
    enemyTitle: string;
    age: number;
    ai: BattleConfig['enemyAi'];
    scale: number;
    weapon: WeaponGroup;
    skills: string[];
    realDuel?: boolean;
    // 무사수행에서의 승부 성격. 길 위의 승부는 기본이 진검이다.
    //  SPAR    — 죽도·목검 시합, 시연처럼 처음부터 겨루기로 합의한 승부 (진검 아님)
    //  MERCY   — 진검이지만 상대에게 살의는 없다. 지면 크게 다치고 귀환하지만 목숨은 건진다
    //  HOSTILE — 상대가 목숨을 노린다. 난이도에 따라 지면 죽을 수 있다
    // 도장에서 벌어지는 승부(메아리·생성형 사건)에는 쓰지 않는다.
    stakes?: 'SPAR' | 'MERCY' | 'HOSTILE';
    rewardMoney?: number;
    rewardFame?: number;
    rewardBookId?: string;
    rewardWeaponId?: string;
  }
): GameState {
  const onRoad = !!s.journey;
  const stakes = onRoad ? b.stakes ?? (b.realDuel ? 'HOSTILE' : 'MERCY') : undefined;
  const isReal = onRoad ? stakes !== 'SPAR' : !!b.realDuel;
  const battle = createBattleConfig(
    `jr_${c.key}_${s.turn}_${Math.random().toString(36).slice(2, 6)}`,
    b.title,
    stakes === 'HOSTILE' ? `${b.subtitle} — ⚠ 살의를 품은 진검` : stakes === 'MERCY' ? `${b.subtitle} — 진검승부` : b.subtitle,
    isReal,
    b.name,
    b.enemyTitle,
    b.age,
    b.ai,
    b.scale,
    b.weapon,
    b.skills,
    {
      rewardMoney: b.rewardMoney ?? 0,
      rewardFame: b.rewardFame ?? 0,
      rewardBookId: b.rewardBookId,
      rewardWeaponId: b.rewardWeaponId,
      eventFollowupId: `journey|${c.key}|${opt}|${c.poiId || ''}`,
    }
  );
  const cfg = {
    ...battle,
    ...(onRoad ? { canUseDisciple: false } : {}), // 길 위에서는 혼자다
    ...(stakes && stakes !== 'SPAR' ? { journeyStakes: stakes } : {}),
  };
  return { ...s, pendingBattle: cfg, phase: 'BATTLE', journeyBattleCtx: c.data ? { ...c.data } : null };
}

// ───────── 길 위의 상태를 바꾸는 도구 ─────────
// 지금 서 있는 땅에, 주인공에게서 몇 걸음 떨어진 곳에 새 장소를 놓는다 (소문, 안내 등)
export function addPoiAhead(s: GameState, kind: JourneyPoiKind, eventKey: string, label: string): GameState {
  const j = s.journey;
  if (!j) return s;
  const m = getJourneyMap(j.regionId);
  const occupied = [...j.pois, { tx: j.pos.x, ty: j.pos.y }];
  const spot = pickPoiTile(m, j.legId, kind, occupied, { x: j.pos.x, y: j.pos.y, min: 3, max: 9 });
  if (!spot) return s;
  const poi = { id: `poi_add_${s.turn}_${Math.random().toString(36).slice(2, 6)}`, kind, eventKey, tx: spot.x, ty: spot.y, legId: j.legId, label };
  return { ...s, journey: { ...j, pois: [...j.pois, poi] } };
}

// 지금 서 있는 땅에서는 더 이상 돌발 사건(매복·맹수)이 일어나지 않는다
export function clearAmbushes(s: GameState): GameState {
  const j = s.journey;
  if (!j) return s;
  return { ...s, journey: { ...j, safeLegs: Array.from(new Set([...(j.safeLegs || []), j.legId])) } };
}

// ───────── 변주 고르기 — 같은 사건이라도 최근에 본 장면은 피한다 ─────────
// 구현은 engine/fresh.ts (고정 사건을 만드는 events.ts도 쓰므로 의존성 없는 모듈로 뺐다). 쓰는 법은 그 파일의 설명.
export { freshFactor, noteSeen, pickFresh, seenAt } from './fresh';
export type { FreshVariant } from './fresh';

// ───────── 대사 한 줄 만들기 ─────────
export const N = (text: string): SceneDialogueLine => ({ speaker: '나레이션', role: 'NARRATOR', text });
export const P = (speaker: string, text: string, stageDirection?: string, emote?: SceneDialogueLine['emote']): SceneDialogueLine => ({
  speaker,
  role: 'NPC',
  text,
  stageDirection,
  emote,
});
export const H = (s: GameState, text: string, stageDirection?: string): SceneDialogueLine => ({ speaker: s.name, role: 'HERO', text, stageDirection });

// 나라마다 다른 이름
export function byCountry<T>(s: GameState, kr: T, cn: T, jp: T): T {
  return s.country === 'CHINA' ? cn : s.country === 'JAPAN' ? jp : kr;
}
