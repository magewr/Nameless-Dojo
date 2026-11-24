// 노년부 사건 다양성·개연성 측정 벤치.
// 여러 일생을 끝까지 돌려 나이대별로 "이번 생에 이미 본 사건이 또 나온 비율", 한 종류의 쏠림, 일생당 서로 다른 사건 수를 재고,
// 사건 문구 오류 · 이미 죽은 사람이 나오는 사건 같은 개연성 문제를 잡는다. 노년 사건 연표 표본도 파일로 남긴다.
//
//   npx esbuild scripts/elderBench.ts --bundle --platform=node --outfile=/tmp/elderBench.cjs && node /tmp/elderBench.cjs
//   환경 변수: RUNS(기본 120) · SAMPLES(연표 표본 수, 기본 4) · OUT(연표를 쓸 파일, 기본 /tmp/elder_timelines.txt)
import * as fs from 'fs';
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
const SAMPLES = Number(process.env.SAMPLES || 4);
const OUT = process.env.OUT || '/tmp/elder_timelines.txt';

// 사건의 "종류" — 같은 틀에서 사람만 바뀐 사건은 같은 종류로 본다.
export function eventKind(ev: ActiveEvent): string {
  if (ev.meta?.jrKey) return String(ev.meta.jrKey);
  return ev.id
    .replace(/^disciple_graduate_.*/, 'disciple_graduate')
    .replace(/^grad_revisit_([a-z]+)_.*/, 'grad_revisit_$1')
    .replace(/^disciple_illness_.*/, 'disciple_illness')
    .replace(/^disciple_passing_.*/, 'disciple_passing')
    .replace(/^gift_disciple_([a-z]+)_.*/, 'gift_disciple_$1')
    .replace(/^grand_tournament_y\d+/, 'grand_tournament')
    .replace(/^heir_appoint_\d+/, 'heir_appoint')
    .replace(/_\d+$/, '');
}

const band = (age: number) => (age < 30 ? '1 ~29' : age < 45 ? '2 30-44' : age < 55 ? '3 45-54' : age < 65 ? '4 55-64' : age < 75 ? '5 65-74' : '6 75+');

interface BandStat { seasons: number; events: number; seenKind: number; seenTitle: number; nonTourney: number; seenKindNT: number; recent3y: number; kinds: Map<string, number> }
const bands = new Map<string, BandStat>();
const getBand = (b: string) => {
  if (!bands.has(b)) bands.set(b, { seasons: 0, events: 0, seenKind: 0, seenTitle: 0, nonTourney: 0, seenKindNT: 0, recent3y: 0, kinds: new Map() });
  return bands.get(b)!;
};

const problems = new Map<string, number>();
const elderTitleRepeat = new Map<string, number>(); // 55+에서 같은 제목이 다시 나온 사건 종류
const elderKindRepeat = new Map<string, number>(); // 55+에서 이미 본 종류가 다시 나온 사건 종류
const elderSource = new Map<string, number>(); // 55+ 사건의 출처 (노년 사건 / 도장 생성형 / 고정 사건)
const problemSamples: string[] = [];
const flag = (msg: string, detail: string) => {
  problems.set(msg, (problems.get(msg) || 0) + 1);
  if (problemSamples.filter((x) => x.startsWith(msg)).length < 6) problemSamples.push(`${msg} — ${detail}`);
};

// 노년(55+) 일생당 서로 다른 사건 종류 수, 노년 계절 수
let elderLives = 0;
let elderDistinctSum = 0;
let elderEventsSum = 0;
let elderSeasonsSum = 0;
let deathAgeSum = 0;
const deathCauses = new Map<string, number>();
const timelines: string[] = [];

function allText(ev: ActiveEvent): string {
  return [
    ev.title,
    ev.narration,
    ev.dialogue || '',
    ...(ev.script || []).map((l) => `${l.speaker}${l.text}${l.stageDirection || ''}`),
    ...ev.options.map((o) => `${o.label}${o.hint || ''}`),
  ].join(' ');
}

function checkEvent(st: GameState, ev: ActiveEvent, where: string) {
  const text = allText(ev);
  if (/undefined|NaN|\[object|【】|\$\{/.test(text)) flag('문구 오류', `${where} ${ev.title}`);
  const did = ev.meta?.discipleId ?? ev.meta?.discId;
  if (did) {
    const d = st.disciples.find((x) => x.id === did);
    if (!d || d.dead) flag('죽거나 없는 제자가 등장', `${where} ${ev.title}`);
  }
  // 이미 죽은 제자의 이름이 사건 제목에 나온다 (추모·임종류는 제외)
  if (!/추모|임종|기일|제사|무덤|묘|부고|넋|영전|혼백/.test(text)) {
    const deadNames = st.disciples.filter((d) => d.dead).map((d) => d.name);
    const hit = deadNames.find((n) => n.length >= 2 && ev.title.includes(n) && !st.disciples.some((d) => !d.dead && d.name === n));
    if (hit) flag('죽은 제자 이름이 제목에', `${where} ${ev.title}`);
  }
  const spWord = st.gender === 'FEMALE' ? '남편' : '아내';
  if (st.spouse && !st.spouse.alive && !/추모|기일|제사|무덤|묘|부고|넋|영전|혼백|홀로|빈자리|생전|혼례를 올렸다/.test(text) && ((ev.sceneActor === 'SPOUSE' && (ev.speaker === st.spouse.name || (ev.script || []).some((l) => l.speaker === st.spouse!.name))) || text.includes(`${spWord} ${st.spouse.name}`))) {
    flag('세상을 뜬 배우자가 살아 있는 듯 등장', `${where} ${ev.title}`);
  }
  if (ev.options.filter((o) => !o.disabled).length === 0) flag('고를 수 있는 선택지가 없음', `${where} ${ev.title}`);
}

// 연쇄 사건의 순서: 뒤의 것은 반드시 앞의 것이 먼저 일어난 뒤에만
const CHAIN_ORDER: Array<[string, string]> = [
  ['elder_tremor_revealed', 'elder_tremor'],
  ['elder_spouse_farewell', 'elder_spouse_ill'],
  ['elder_widowed', 'elder_spouse_farewell'],
  ['elder_grandchild_sword', 'elder_grandchild'],
  ['elder_grandchild_question', 'elder_grandchild'],
  ['elder_last_disciple_test', 'elder_last_disciple'],
  ['elder_young_dojo_later', 'elder_young_dojo'],
  ['elder_heir_consult', 'elder_abdication'],
  ['elder_heir_challenged', 'elder_abdication'],
  ['elder_factions', 'elder_abdication'],
  ['elder_heir_lost', 'elder_abdication'],
  ['elder_disc_baby', 'elder_disc_wedding'],
];
const countries: CountryId[] = ['KOREA', 'CHINA', 'JAPAN'];
const diffs: DifficultyId[] = ['EASY', 'EASY', 'HARD', 'HELL']; // 노년까지 사는 일생을 넉넉히 보려고 쉬움 비중을 높인다

for (let run = 0; run < RUNS; run++) {
  const country = countries[run % 3];
  const diff = diffs[run % diffs.length];
  let st = createNewGame(country, run % 2 === 0 ? 'MALE' : 'FEMALE', `노년벤치_${run}`, 20, diff);
  st.phase = 'MAIN';
  st.sectName = '무명류';
  st.sectNamed = true;
  const seenKinds = new Set<string>();
  const seenTitles = new Set<string>();
  const titleTurn = new Map<string, number>();
  const kindTurn = new Map<string, number>();
  const elderKinds = new Set<string>();
  let elderEvents = 0;
  let elderSeasons = 0;
  const lines: string[] = [];
  let safety = 0;

  const handleEvent = () => {
    let inner = 0;
    while (st.activeEvent && inner++ < 4 && st.phase !== 'ENDING') {
      const ev = st.activeEvent;
      const where = `[${diff} ${country} ${st.age}세 T${st.turn}]`;
      checkEvent(st, ev, where);
      const kind = eventKind(ev);
      for (const [after, before] of CHAIN_ORDER) {
        // 배우자 이별은 병 없이 고령으로도 올 수 있다
        if (kind === after && !seenKinds.has(before) && !(after === 'elder_spouse_farewell')) flag('연쇄 순서가 뒤바뀜', `${where} ${after} 이전에 ${before} 없음`);
      }
      const b = getBand(band(st.age));
      b.events++;
      if (seenKinds.has(kind)) b.seenKind++;
      if (kind !== 'grand_tournament') { b.nonTourney++; if (seenKinds.has(kind)) b.seenKindNT++; }
      // 3년(12계절) 안에 같은 종류가 또 — 플레이어가 「또 이거네」 하고 느끼는 반복
      const lastK = kindTurn.get(kind);
      if (lastK !== undefined && st.turn - lastK <= 12 && kind !== 'grand_tournament') b.recent3y++;
      kindTurn.set(kind, st.turn);
      if (seenTitles.has(ev.title)) b.seenTitle++;
      if (st.age >= 55 && seenTitles.has(ev.title)) elderTitleRepeat.set(kind, (elderTitleRepeat.get(kind) || 0) + 1);
      if (st.age >= 55) { const src = kind.startsWith('elder_') ? '노년' : kind.startsWith('home_') || kind.startsWith('echo_') ? '도장생성형·메아리' : kind.startsWith('grand_tournament') ? '천하대회' : '고정'; elderSource.set(src, (elderSource.get(src) || 0) + 1); }
      if (st.age >= 55 && seenKinds.has(kind)) elderKindRepeat.set(kind, (elderKindRepeat.get(kind) || 0) + 1);
      const lastT = titleTurn.get(ev.title);
      if (st.age >= 55 && lastT !== undefined && st.turn - lastT <= 6 && !ev.id.startsWith('duel_aftermath_')) flag('같은 제목이 1년 반 안에 다시', `${where} ${ev.title}`);
      b.kinds.set(kind, (b.kinds.get(kind) || 0) + 1);
      seenKinds.add(kind);
      seenTitles.add(ev.title);
      titleTurn.set(ev.title, st.turn);
      if (st.age >= 55) {
        elderEvents++;
        elderKinds.add(kind);
      }
      // 선택: 위험(⚠) 표시가 없는 선택지 가운데 무작위 — 여러 갈래를 고루 밟아 보려고
      const opts = ev.options.filter((o) => !o.disabled);
      const safe = opts.filter((o) => !(o.hint || '').includes('⚠'));
      const pool = safe.length ? safe : opts;
      const opt = pool[Math.floor(Math.random() * pool.length)] || ev.options[0];
      const logIds = new Set(st.logs.map((l) => l.id));
      st = resolveEventOption(st, ev, opt.id);
      if (st.age >= 55) {
        const fresh = st.logs.filter((l) => !logIds.has(l.id)).reverse().map((l) => l.text).filter((t) => t !== ev.title && !t.endsWith(ev.title));
        const notice = st.pendingNotice?.filter((l) => l.text).map((l) => l.text).join(' / ') || fresh.join(' / ') || '';
        lines.push(`  ${st.year} ${st.season.padEnd(6)} ${String(st.age).padStart(2)}세 │ ${ev.title}\n       ▸ ${opt.label}\n       ↳ ${notice.slice(0, 150)}`);
      }
      st = { ...st, pendingNotice: null };
      if (st.phase === 'BATTLE' && st.pendingBattle) {
        const out = simulateAutoBattleQuick(st, st.pendingBattle, 'HERO', st.age >= 45 ? 'COUNTER' : 'BALANCED');
        st = applyBattleOutcome(st, out);
        st = { ...st, pendingNotice: null };
        if (st.age >= 55) lines.push(`       ⚔ ${out.victory ? '승리' : '패배'} (${out.endedBy || ''})`);
      }
    }
  };

  while (st.phase !== 'ENDING' && safety++ < 340) {
    const turnStart = st;
    getBand(band(st.age)).seasons++;
    if (st.age >= 55) elderSeasons++;
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
    if (st.turn >= 6 && st.turn % 8 === 5 && st.health >= 60 && st.statuses.length === 0 && st.money >= 40 && st.age < 70) {
      st = runJourneyHeadless(st, regionsForCountry(st.country)[Math.floor(Math.random() * 3)].id, {
        choose: (_s, ev) => {
          const opts = ev.options.filter((o) => !o.disabled && o.id !== 'home');
          const safe = opts.filter((o) => o.id !== 'leave' && !(o.hint || '').includes('⚠'));
          if (safe.length && Math.random() < 0.85) return safe[Math.floor(Math.random() * safe.length)].id;
          return (opts.find((o) => o.id === 'leave') || opts[0] || ev.options[0]).id;
        },
        fight: (s) => applyBattleOutcome(s, simulateAutoBattleQuick(s, s.pendingBattle!, 'HERO', 'BALANCED')),
      });
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

  deathAgeSum += st.age;
  const cause = (st.deathCause || '?').replace(/\(.*\)/, '');
  deathCauses.set(cause, (deathCauses.get(cause) || 0) + 1);
  if (elderSeasons > 0) {
    elderLives++;
    elderDistinctSum += elderKinds.size;
    elderEventsSum += elderEvents;
    elderSeasonsSum += elderSeasons;
  }
  if (timelines.length < SAMPLES && st.age >= 72) {
    timelines.push(`━━━ [${diff} · ${country} · ${st.gender}] ${st.name} — ${st.age}세 ${st.deathCause} · 명성 ${st.fame} · 배우자 ${st.spouse ? (st.spouse.alive ? '생존' : '사별') : '없음'} · 문하생 ${st.disciples.filter((d) => !d.dead).length}명\n${lines.join('\n')}`);
  }
}

console.log(`\n[노년 사건 벤치] ${RUNS}인생 · 평균 사망 ${(deathAgeSum / RUNS).toFixed(1)}세 · 사인 ${[...deathCauses.entries()].map(([k, v]) => `${k} ${v}`).join(' / ')}`);
for (const k of [...bands.keys()].sort()) {
  const b = bands.get(k)!;
  const sorted = [...b.kinds.entries()].sort((a, c) => c[1] - a[1]);
  const topShare = sorted.length ? sorted[0][1] / b.events : 0;
  const top3 = sorted.slice(0, 3).reduce((a, x) => a + x[1], 0) / Math.max(1, b.events);
  console.log(
    `  ${k.slice(2).padEnd(6)} 계절당 ${(b.events / Math.max(1, b.seasons)).toFixed(2)} · 이미 본 종류 ${Math.round((b.seenKind / Math.max(1, b.events)) * 100)}% (대회 빼면 ${Math.round((b.seenKindNT / Math.max(1, b.nonTourney)) * 100)}%) · 같은 제목 ${Math.round((b.seenTitle / Math.max(1, b.events)) * 100)}% · 3년 내 같은 종류 ${Math.round((b.recent3y / Math.max(1, b.events)) * 100)}% · 1위 쏠림 ${Math.round(topShare * 100)}% · 상위3 ${Math.round(top3 * 100)}% · 종류 ${b.kinds.size}`
  );
  if (k >= '4') console.log(`         ${sorted.slice(0, 12).map(([kk, v]) => `${kk} ${Math.round((v / b.events) * 100)}%`).join(' · ')}`);
}
console.log(`  노년(55+) 일생당: 계절 ${(elderSeasonsSum / Math.max(1, elderLives)).toFixed(1)} · 사건 ${(elderEventsSum / Math.max(1, elderLives)).toFixed(1)} · 서로 다른 종류 ${(elderDistinctSum / Math.max(1, elderLives)).toFixed(1)} (${elderLives}인생)`);
const topOf = (m: Map<string, number>) => { const tot = [...m.values()].reduce((a, x) => a + x, 0); return [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${Math.round((v / Math.max(1, tot)) * 100)}%`).join(' · '); };
console.log(`  55+ 사건 구성: ${topOf(elderSource)}`);
console.log(`  55+ 같은 제목 재등장의 출처: ${topOf(elderTitleRepeat)}`);
console.log(`  55+ 이미 본 종류 재등장의 출처: ${topOf(elderKindRepeat)}`);
console.log(`  개연성 점검: ${problems.size === 0 ? '문제 없음' : [...problems.entries()].map(([k, v]) => `${k} ${v}건`).join(' · ')}`);
problemSamples.slice(0, 40).forEach((p) => console.log(`    - ${p}`));
fs.writeFileSync(OUT, timelines.join('\n\n'));
console.log(`  노년 연표 표본 ${timelines.length}개 → ${OUT}`);
