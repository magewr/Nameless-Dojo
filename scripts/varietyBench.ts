// 사건 다양성 벤치 — 일생 전체(도장 + 무사수행 길 위)에서 같은 사건이 얼마나 되풀이되는지 잰다.
//   npm run test:variety            (기본 120인생)
//   RUNS=200 npm run test:variety
//   TOP=20                          구간별로 보여 줄 반복 상위 개수
// 보는 것:
//   ① 나이대별 도장 사건: 이번 생에 이미 본 종류가 또 나온 비율, 제목까지 같은 비율, 3년 안에 같은 종류
//   ② 일생당 같은 종류가 몇 번 나오는지 — 「또 이거네」의 주범 상위 목록
//   ③ 무사수행: 앞선 수행에서 이미 만난 장소 사건이 또 나온 비율, 제목까지 같은 비율, 매복의 문구 다양성
import {
  advanceSeason,
  applyBattleOutcome,
  applyImprintedTrait,
  createNewGame,
  executeScheduleActivity,
  resolveEventOption,
} from '../src/engine/gameLogic';
import { simulateAutoBattleQuick } from '../src/engine/autoBattleSim';
import { getTraitCandidates, isAtMasteryWall } from '../src/data/booksAndSkills';
import { withMilestones } from '../src/engine/milestones';
import { runJourneyHeadless } from '../src/engine/journey';
import { runTourneyHeadless } from '../src/engine/tourney';
import { regionsForCountry } from '../src/data/journeyRegions';
import { getJourneyEventDef } from '../src/data/journeyEvents';
import { ActiveEvent, CountryId, DifficultyId, GameState, ScheduleActivityId } from '../src/types/game';

const memStorage: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memStorage[k] ?? null,
  setItem: (k: string, v: string) => { memStorage[k] = v; },
  removeItem: (k: string) => { delete memStorage[k]; },
  clear: () => { Object.keys(memStorage).forEach((k) => delete memStorage[k]); },
  key: (i: number) => Object.keys(memStorage)[i] ?? null,
  get length() { return Object.keys(memStorage).length; },
};

const RUNS = Number(process.env.RUNS || 120);
const TOP = Number(process.env.TOP || 14);

// 사건의 "종류" — 같은 틀에서 사람만 바뀐 사건은 같은 종류로 본다 (elderBench와 같은 기준).
function eventKind(ev: ActiveEvent): string {
  if (ev.meta?.jrKey) return String(ev.meta.jrKey);
  return ev.id
    .replace(/^disciple_graduate_.*/, 'disciple_graduate')
    .replace(/^grad_revisit_([a-z]+)_.*/, 'grad_revisit_$1')
    .replace(/^disciple_illness_.*/, 'disciple_illness')
    .replace(/^disciple_passing_.*/, 'disciple_passing')
    .replace(/^gift_disciple_([a-z]+)_.*/, 'gift_disciple_$1')
    .replace(/^grand_tournament_y\d+/, 'grand_tournament')
    .replace(/^heir_appoint_\d+/, 'heir_appoint')
    .replace(/^duel_aftermath_.*/, 'duel_aftermath')
    .replace(/_\d+$/, '');
}
// 제목의 뼈대 — 숫자·이름처럼 매번 바뀌는 조각을 지운 것. 이것까지 같으면 플레이어 눈에는 「같은 사건」이다.
const titleCore = (t: string) => t.replace(/[0-9]+/g, '#').trim();

const band = (age: number) => (age < 30 ? '1 ~29' : age < 45 ? '2 30-44' : age < 55 ? '3 45-54' : age < 65 ? '4 55-64' : '5 65+');

interface BandStat {
  seasons: number;
  events: number;
  seenKind: number;
  seenTitle: number;
  recent3y: number;
  kinds: Map<string, number>; // 종류별 총 등장
  repeatKinds: Map<string, number>; // 이미 본 종류가 다시 나온 횟수
}
const bands = new Map<string, BandStat>();
const getBand = (b: string) => {
  if (!bands.has(b)) bands.set(b, { seasons: 0, events: 0, seenKind: 0, seenTitle: 0, recent3y: 0, kinds: new Map(), repeatKinds: new Map() });
  return bands.get(b)!;
};

// 일생 단위: 종류별 등장 횟수 (일생당 평균·최대)
const lifeKindCount = new Map<string, number[]>();
const pushLife = (m: Map<string, number[]>, k: string, v: number) => m.set(k, [...(m.get(k) || []), v]);

// 무사수행
let journeys = 0;
let jEvents = 0;
let jRest = 0; // 쉼터(주막·사찰) — 일부러 자주 놓이는 곳이라 따로 센다
let jRestSeenTitle = 0;
let jSeenKind = 0; // 앞선 수행(같은 생)에서 이미 만난 장소 사건 (쉼터 제외)
let jSeenTitle = 0;
let jSameJourneyTitle = 0; // 한 번의 수행 안에서 같은 제목
const jKinds = new Map<string, number>();
const jRepeatKinds = new Map<string, number>();
const jLifeKindCount = new Map<string, number[]>();
const ambushTitles = new Map<string, Map<string, number>>();
let ambushes = 0;

let lifeHomeEvents = 0;
let lifeHomeDistinct = 0;
let lifeHomeTitlesDistinct = 0;
let lifeJourneyDistinct = 0;
let ageSum = 0;

const countries: CountryId[] = ['KOREA', 'CHINA', 'JAPAN'];
const diffs: DifficultyId[] = ['EASY', 'EASY', 'HARD'];

for (let run = 0; run < RUNS; run++) {
  const country = countries[run % 3];
  const diff = diffs[run % diffs.length];
  let st = createNewGame(country, run % 2 === 0 ? 'MALE' : 'FEMALE', `다양성벤치_${run}`, 20, diff);
  st.phase = 'MAIN';
  st.sectName = '무명류';
  st.sectNamed = true;
  const seenKinds = new Set<string>();
  const seenTitles = new Set<string>();
  const kindTurn = new Map<string, number>();
  const kindCount = new Map<string, number>();
  const jSeen = new Set<string>();
  const jSeenT = new Set<string>();
  const jCount = new Map<string, number>();
  let safety = 0;
  const jOff = (5 + run) % 8;

  const pick = (ev: ActiveEvent) => {
    const opts = ev.options.filter((o) => !o.disabled);
    const safe = opts.filter((o) => !(o.hint || '').includes('⚠'));
    const pool = safe.length ? safe : opts;
    return pool[Math.floor(Math.random() * pool.length)] || ev.options[0];
  };

  const handleEvent = () => {
    let inner = 0;
    while (st.activeEvent && inner++ < 4 && st.phase !== 'ENDING') {
      const ev = st.activeEvent;
      const kind = eventKind(ev);
      if (kind !== 'duel_aftermath') {
        const b = getBand(band(st.age));
        b.events++;
        const tc = titleCore(ev.title);
        if (seenKinds.has(kind)) {
          b.seenKind++;
          b.repeatKinds.set(kind, (b.repeatKinds.get(kind) || 0) + 1);
        }
        if (seenTitles.has(tc)) b.seenTitle++;
        const lastK = kindTurn.get(kind);
        if (lastK !== undefined && st.turn - lastK <= 12) b.recent3y++;
        b.kinds.set(kind, (b.kinds.get(kind) || 0) + 1);
        kindTurn.set(kind, st.turn);
        seenKinds.add(kind);
        seenTitles.add(tc);
        kindCount.set(kind, (kindCount.get(kind) || 0) + 1);
      }
      const opt = pick(ev);
      st = resolveEventOption(st, ev, opt.id);
      st = { ...st, pendingNotice: null };
      if (st.phase === 'BATTLE' && st.pendingBattle) {
        st = applyBattleOutcome(st, simulateAutoBattleQuick(st, st.pendingBattle, 'HERO', st.age >= 45 ? 'COUNTER' : 'BALANCED'));
        st = { ...st, pendingNotice: null };
      }
    }
  };

  while (st.phase !== 'ENDING' && safety++ < 340) {
    const turnStart = st;
    getBand(band(st.age)).seasons++;
    handleEvent();
    if (st.phase === 'ENDING') break;
    if (st.pendingTraitSkillId) {
      const sk = st.skills.find((s) => s.id === st.pendingTraitSkillId);
      const c = sk?.pendingTraitTier ? getTraitCandidates(sk, sk.pendingTraitTier)[0] : undefined;
      st = c && sk ? applyImprintedTrait(st, sk.id, c) : { ...st, pendingTraitSkillId: null };
    }
    const top = [...st.skills].filter((s) => !s.isPassive).sort((a, b) => b.power * b.masteryLevel - a.power * a.masteryLevel).slice(0, 4).map((s) => s.id);
    if (top.length) st.equippedActiveIds = top;
    if (st.debt > 0 && st.money >= 20) {
      const pay = Math.min(st.debt, st.money);
      st = { ...st, money: st.money - pay, debt: st.debt - pay };
    }
    if (st.tourney) {
      st = runTourneyHeadless(st, (x) => applyBattleOutcome(x, simulateAutoBattleQuick(x, x.pendingBattle!, 'HERO', x.battleTactic)));
      if (st.phase === 'ENDING') break;
    }
    const trainSk = [...st.skills].filter((s) => s.masteryLevel < 10 && !isAtMasteryWall(s)).sort((a, b) => b.power - a.power)[0] || st.skills[0];
    st.seasonPlan = { ...st.seasonPlan, trainSkillId: trainSk.id };
    // 두 해에 한 번꼴 무사수행 (실제 플레이어보다 약간 잦은 편)
    // 떠나는 계절은 일생마다 다르게 (한 계절에만 떠나면 계절별 길 위 장면을 못 본다)
    if (st.turn >= 6 && st.turn % 8 === jOff && st.health >= 60 && st.statuses.length === 0 && st.money >= 40 && st.age < 70) {
      journeys++;
      const thisJourney = new Set<string>();
      st = runJourneyHeadless(st, regionsForCountry(st.country)[Math.floor(Math.random() * 3)].id, {
        choose: (_s, ev) => {
          const key = String(ev.meta?.jrKey || ev.id);
          const def = getJourneyEventDef(key);
          const tc = titleCore(ev.title);
          if (def?.kind === 'AMBUSH') {
            ambushes++;
            const m = ambushTitles.get(key) || new Map<string, number>();
            m.set(tc, (m.get(tc) || 0) + 1);
            ambushTitles.set(key, m);
          } else if (def?.kind === 'INN' || def?.kind === 'SHRINE') {
            jRest++;
            if (jSeenT.has(tc) || thisJourney.has(tc)) jRestSeenTitle++;
            thisJourney.add(tc);
            jCount.set(key, (jCount.get(key) || 0) + 1);
          } else {
            jEvents++;
            if (jSeen.has(key)) {
              jSeenKind++;
              jRepeatKinds.set(key, (jRepeatKinds.get(key) || 0) + 1);
            }
            if (jSeenT.has(tc)) jSeenTitle++;
            if (thisJourney.has(tc)) jSameJourneyTitle++;
            thisJourney.add(tc);
            jKinds.set(key, (jKinds.get(key) || 0) + 1);
            jCount.set(key, (jCount.get(key) || 0) + 1);
          }
          const opts = ev.options.filter((o) => !o.disabled && o.id !== 'home');
          const safe = opts.filter((o) => o.id !== 'leave' && !(o.hint || '').includes('⚠'));
          const choice = safe.length && Math.random() < 0.85 ? safe[Math.floor(Math.random() * safe.length)].id : (opts.find((o) => o.id === 'leave') || opts[0] || ev.options[0]).id;
          return choice;
        },
        fight: (s) => applyBattleOutcome(s, simulateAutoBattleQuick(s, s.pendingBattle!, 'HERO', 'BALANCED')),
      });
      // 장소 사건의 「이미 만남」은 수행이 끝난 뒤에 반영한다 (한 번의 수행 안에서는 같은 장소가 두 번 놓이지 않는다)
      for (const [k] of jCount) jSeen.add(k);
      thisJourney.forEach((t) => jSeenT.add(t));
      if (st.phase === 'ENDING') break;
      st = advanceSeason({ ...st, lastSeasonSummary: null });
      st = withMilestones(turnStart, st) || st;
      continue;
    }
    let acts: ScheduleActivityId[];
    if (st.health < 58 || st.statuses.length > 0) acts = ['REST'];
    else if (st.money < 130 || st.debt > 0) acts = ['TRAIN', 'ESCORT'];
    else acts = ['TRAIN', st.age >= 42 ? 'MIND' : 'BODY'];
    if (acts[0] !== 'REST' && st.disciples.some((d) => !d.dead) && st.turn % 2 === 0) acts.push('TEACH');
    for (let i = 0; i < acts.length && st.phase !== 'ENDING'; i++) {
      st = executeScheduleActivity(st, acts[i], 1 / acts.length, i === 0 ? 'EARLY' : i === acts.length - 1 ? 'LATE' : 'MID').state;
    }
    if (st.phase === 'ENDING') break;
    st = advanceSeason(st);
    st = withMilestones(turnStart, st) || st;
  }

  ageSum += st.age;
  let homeTotal = 0;
  for (const [k, v] of kindCount) {
    pushLife(lifeKindCount, k, v);
    homeTotal += v;
  }
  for (const [k, v] of jCount) pushLife(jLifeKindCount, k, v);
  lifeHomeEvents += homeTotal;
  lifeHomeDistinct += kindCount.size;
  lifeHomeTitlesDistinct += seenTitles.size;
  lifeJourneyDistinct += jCount.size;
}

const pct = (n: number, d: number) => `${d ? Math.round((n / d) * 100) : 0}%`;
console.log(`\n[사건 다양성 벤치] ${RUNS}인생 · 평균 사망 ${(ageSum / RUNS).toFixed(1)}세 · 무사수행 ${(journeys / RUNS).toFixed(1)}회/인`);
console.log(`  도장 사건 일생당 ${(lifeHomeEvents / RUNS).toFixed(1)}건 · 서로 다른 종류 ${(lifeHomeDistinct / RUNS).toFixed(1)} · 서로 다른 제목 ${(lifeHomeTitlesDistinct / RUNS).toFixed(1)}`);
for (const k of [...bands.keys()].sort()) {
  const b = bands.get(k)!;
  console.log(
    `  ${k.slice(2).padEnd(6)} 계절당 ${(b.events / Math.max(1, b.seasons)).toFixed(2)} · 이미 본 종류 ${pct(b.seenKind, b.events)} · 같은 제목 ${pct(b.seenTitle, b.events)} · 3년 내 같은 종류 ${pct(b.recent3y, b.events)} · 종류 ${b.kinds.size}`
  );
  const rep = [...b.repeatKinds.entries()].sort((a, c) => c[1] - a[1]).slice(0, TOP);
  console.log(`         재등장 상위: ${rep.map(([kk, v]) => `${kk} ${pct(v, b.events)}`).join(' · ')}`);
}
// 일생당 평균 등장 횟수 상위 — 나온 생 기준 평균 (최대)
const perLife = (m: Map<string, number[]>, n: number) =>
  [...m.entries()]
    .map(([k, arr]) => ({ k, avg: arr.reduce((a, x) => a + x, 0) / RUNS, inLives: arr.length, max: Math.max(...arr) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, n)
    .map((r) => `${r.k} ${r.avg.toFixed(1)}(최대 ${r.max})`)
    .join(' · ');
console.log(`  일생당 등장 상위(도장): ${perLife(lifeKindCount, TOP + 6)}`);
console.log(
  `\n  무사수행 장소 사건(쉼터 제외) ${(jEvents / RUNS).toFixed(1)}건/인 · 서로 다른 종류 ${(lifeJourneyDistinct / RUNS).toFixed(1)} · 앞선 수행에서 본 종류 ${pct(jSeenKind, jEvents)} · 같은 제목 ${pct(jSeenTitle, jEvents)} · 한 수행 안 같은 제목 ${pct(jSameJourneyTitle, jEvents)}`
);
console.log(`  쉼터(주막·사찰) ${(jRest / RUNS).toFixed(1)}건/인 · 이미 본 제목 ${pct(jRestSeenTitle, jRest)}`);
console.log(`  재등장 상위(길): ${[...jRepeatKinds.entries()].sort((a, c) => c[1] - a[1]).slice(0, TOP).map(([kk, v]) => `${kk} ${pct(v, jEvents)}`).join(' · ')}`);
console.log(`  일생당 등장 상위(길): ${perLife(jLifeKindCount, TOP + 6)}`);
console.log(`  매복 ${(ambushes / RUNS).toFixed(1)}건/인 — 문구 종류: ${[...ambushTitles.entries()].map(([k, m]) => `${k} ${[...m.values()].reduce((a, x) => a + x, 0)}건/${m.size}가지`).join(' · ')}`);
