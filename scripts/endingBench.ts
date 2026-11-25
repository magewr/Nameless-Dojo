// 엔딩 분포 벤치 — 플레이 성향(페르소나)별로 일생 전체를 돌려 어떤 엔딩이 나오는지 잰다.
//   npm run test:ending          (기본 페르소나당 60인생)
//   RUNS=120 npm run test:ending
//   PERSONA=RUTHLESS            한 성향만
//   RUTH=1                      성향별 살기 출처 상위 항목
//   SRC=virtue                  RUTH와 같되 다른 세평 축 (virtue·ascetic·commerce·arcane·ruthless) — 무사수행은 사건별로 나눠 센다
//   DUMP=/tmp/x.json            일생별 세평을 JSON으로 (lineageFacts의 축 기회값을 다시 잡을 때)
// 목표: ① 무작위로 고르는 플레이어의 엔딩이 한두 가지에 쏠리지 않는다.
//       ② 한 세평 축을 의식해 고르는 플레이어는 그 축의 엔딩을 받는다 (플레이 방향이 엔딩에 반영된다).
//       ③ 이계를 노리는 플레이어는 실제로 이계 기술을 손에 넣고 쓸 수 있다.
import {
  advanceSeason,
  applyBattleOutcome,
  applyImprintedTrait,
  createNewGame,
  executeScheduleActivity,
  FACILITY_INFO,
  resolveEventOption,
} from '../src/engine/gameLogic';
import { simulateAutoBattleQuick } from '../src/engine/autoBattleSim';
import { BOOK_SKILL_TEMPLATES, getTraitCandidates, isAtMasteryWall } from '../src/data/booksAndSkills';
import { generatePostMortemEnding } from '../src/data/worldAndEndings';
import { extractLineageFacts } from '../src/data/lineageFacts';
import { withMilestones } from '../src/engine/milestones';
import { runJourneyHeadless } from '../src/engine/journey';
import { runTourneyHeadless } from '../src/engine/tourney';
import { regionsForCountry } from '../src/data/journeyRegions';
import { ActiveEvent, CountryId, DifficultyId, DojoFacilities, GameState, ScheduleActivityId } from '../src/types/game';

// Node 환경 localStorage mock (만물객의 전생 비급 조회 등)
const memStorage: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memStorage[k] ?? null,
  setItem: (k: string, v: string) => {
    memStorage[k] = v;
  },
  removeItem: (k: string) => {
    delete memStorage[k];
  },
  clear: () => undefined,
  key: () => null,
  length: 0,
} as Storage;

type Persona = 'RANDOM' | 'VIRTUE' | 'RUTHLESS' | 'COMMERCE' | 'ASCETIC' | 'ARCANE';
const PERSONAS: Persona[] = ['RANDOM', 'VIRTUE', 'RUTHLESS', 'COMMERCE', 'ASCETIC', 'ARCANE'];
const AXIS_WORD: Record<Exclude<Persona, 'RANDOM'>, string> = { VIRTUE: '인덕', RUTHLESS: '살기', COMMERCE: '상무', ASCETIC: '구도', ARCANE: '이단' };
const RUNS = Number(process.env.RUNS || 60);
const ONLY = process.env.PERSONA as Persona | undefined;

const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const ruthSrc = new Map<string, number>();
const SRC_AXIS = ((process.env.SRC || 'ruthless') as keyof GameState['reputation']);
const isFantasy = (origin: string[]) => origin.includes('FANTASY');

// 선택지 고르기: 추구하는 축의 세평이 오르는 선택지를 85% 확률로, 아니면 무작위(위험 표시는 피한다).
function choose(persona: Persona, ev: ActiveEvent): string {
  const opts = ev.options.filter((o) => !o.disabled && o.id !== 'home');
  const safe = opts.filter((o) => !(o.hint || '').includes('⚠'));
  if (persona !== 'RANDOM') {
    const w = AXIS_WORD[persona];
    const hits = opts.filter((o) => (o.hint || '').includes(w) && !(o.hint || '').includes(`${w} -`) && (persona === 'RUTHLESS' || persona === 'ARCANE' || !(o.hint || '').includes('⚠')));
    if (hits.length && Math.random() < 0.85) return rand(hits).id;
  }
  // 다른 축을 추구하는 사람은 살생(살기 +)을 일부러 고르지는 않는다
  const calm = persona !== 'RANDOM' && persona !== 'RUTHLESS' ? safe.filter((o) => !/살기 \+/.test(o.hint || '')) : safe;
  const pool = calm.length ? calm : safe.length ? safe : opts;
  return (rand(pool) || ev.options[0]).id;
}

function fight(s: GameState): GameState {
  return applyBattleOutcome(s, simulateAutoBattleQuick(s, s.pendingBattle!, 'HERO', s.age >= 45 ? 'COUNTER' : 'BALANCED'));
}

interface LifeResult {
  persona?: Persona;
  magic?: string;
  title: string;
  axis: string;
  scale: string;
  grimoireOffers: number;
  grimoireBought: number;
  fantasyLearned: boolean;
  knowsMagic: boolean;
  magicPublic: boolean;
  rep: GameState['reputation'];
  age: number;
}

function runLife(persona: Persona, idx: number): LifeResult {
  const countries: CountryId[] = ['KOREA', 'CHINA', 'JAPAN'];
  const diffs: DifficultyId[] = ['EASY', 'EASY', 'HARD'];
  const country = countries[idx % 3];
  let st = createNewGame(country, idx % 2 === 0 ? 'MALE' : 'FEMALE', `엔딩벤치_${persona}_${idx}`, 20, diffs[idx % diffs.length]);
  st.phase = 'MAIN';
  st.sectName = '무명류';
  st.sectNamed = true;
  let grimoireOffers = 0;
  let grimoireBought = 0;
  let lastOfferTurn = -1;
  let safety = 0;

  const track = (label: string, before: GameState, after: GameState = st) => {
    const d = after.reputation[SRC_AXIS] - before.reputation[SRC_AXIS];
    if (d > 0) ruthSrc.set(`${persona}|${label}`, (ruthSrc.get(`${persona}|${label}`) || 0) + d);
  };
  const handleEvents = () => {
    let inner = 0;
    while (st.activeEvent && inner++ < 4 && st.phase !== 'ENDING') {
      const ev = st.activeEvent;
      const b = st;
      const opt = choose(persona, ev);
      st = resolveEventOption(st, ev, opt);
      st = { ...st, pendingNotice: null };
      track(`사건:${ev.id.replace(/_\d+$/, '').replace(/_\d+_.*/, '')}:${opt}`, b);
      if (st.phase === 'BATTLE' && st.pendingBattle) {
        const bb = st;
        const kind = st.pendingBattle.isRealDuel ? '진검' : '비무';
        st = { ...fight(st), pendingNotice: null };
        track(`전투:${kind}`, bb);
      }
    }
  };

  while (st.phase !== 'ENDING' && safety++ < 360) {
    const turnStart = st;
    handleEvents();
    if (st.phase === 'ENDING') break;
    if (st.pendingTraitSkillId) {
      const sk = st.skills.find((s) => s.id === st.pendingTraitSkillId);
      const c = sk?.pendingTraitTier ? getTraitCandidates(sk, sk.pendingTraitTier)[0] : undefined;
      st = c && sk ? applyImprintedTrait(st, sk.id, c) : { ...st, pendingTraitSkillId: null };
    }

    // 만물객: 일반 서적은 여유가 있으면 산다. 금서는 이계 추구형은 무조건, 나머지는 여유가 넉넉할 때 가끔.
    if (st.merchantOffer && lastOfferTurn !== st.turn) {
      lastOfferTurn = st.turn;
      for (const bk of st.merchantOffer.books) {
        if (st.books.some((ob) => ob.id === bk.id)) continue;
        const grim = bk.rarity === 'GRIMOIRE';
        if (grim) grimoireOffers++;
        const want = grim ? persona === 'ARCANE' || (st.money >= bk.price + 150 && Math.random() < 0.35) : st.money >= bk.price + 80;
        if (!want || st.money < bk.price) continue;
        if (grim) grimoireBought++;
        if (bk.decodeApRequired === 0) {
          const tpl = BOOK_SKILL_TEMPLATES[bk.skillTemplateId];
          const learned = tpl && !st.skills.some((s) => s.id === tpl.id) ? { ...tpl, masteryLevel: 1, masteryExp: 0, imprintedTraits: [] } : null;
          st = { ...st, money: st.money - bk.price, books: [...st.books, { ...bk, decoded: true }], skills: learned ? [...st.skills, learned] : st.skills };
        } else {
          st = { ...st, money: st.money - bk.price, books: [...st.books, { ...bk }] };
        }
      }
    }

    // 빚 상환·시설 증축 (연무장 먼저 — 제자 수용이 규모를 정한다)
    if (st.debt > 0 && st.money >= st.debt) st = { ...st, money: st.money - st.debt, debt: 0, debtTurns: 0 };
    const facs: (keyof DojoFacilities)[] = ['yard', 'dorm', 'library', 'clinic', 'forge', 'sanctum'];
    for (const fk of facs) {
      const lv = st.facilities[fk];
      if (lv < 4 && st.money >= FACILITY_INFO[fk].costs[lv] + 120) {
        st = { ...st, money: st.money - FACILITY_INFO[fk].costs[lv], facilities: { ...st.facilities, [fk]: lv + 1 } };
        break;
      }
    }

    // 장착·수련 대상: 이계 추구형은 술법 초식을 먼저 단다
    const byPower = [...st.skills].filter((s) => !s.isPassive).sort((a, b) => b.power * b.masteryLevel - a.power * a.masteryLevel);
    const active = persona === 'ARCANE' ? [...byPower.filter((s) => isFantasy(s.origin)), ...byPower.filter((s) => !isFantasy(s.origin))] : byPower;
    if (active.length) st.equippedActiveIds = active.slice(0, 4).map((s) => s.id);
    const trainable = st.skills.filter((s) => s.masteryLevel < 10 && !isAtMasteryWall(s));
    const fantasyTrain = trainable.filter((s) => isFantasy(s.origin) && !s.isPassive);
    // 보통의 플레이어는 주력 초식(가장 높은 경지)을 닦고, 네 번에 한 번쯤 새로 얻은 센 초식을 닦아 본다.
    const main = [...trainable].sort((a, b) => b.masteryLevel - a.masteryLevel || b.power - a.power)[0];
    const strongest = [...trainable].sort((a, b) => b.power - a.power)[0];
    const trainSk = (persona === 'ARCANE' && fantasyTrain[0]) || (Math.random() < 0.25 ? strongest : main) || st.skills[0];
    st.seasonPlan = { ...st.seasonPlan, trainSkillId: trainSk.id };
    const maxLv = Math.max(...st.skills.map((s) => s.masteryLevel));
    const unread = st.books.find((b) => !b.decoded && (!b.requiresMasteryLv || maxLv >= b.requiresMasteryLv) && (!b.requiresQi || st.stats.qi >= b.requiresQi));
    if (unread) st.seasonPlan = { ...st.seasonPlan, decodeBookId: unread.id };

    if (st.tourney) {
      const tb = st;
      st = runTourneyHeadless(st, (x) => fight(x));
      track('천하대회', tb);
      if (st.phase === 'ENDING') break;
    }

    // 두 해에 한 번꼴 무사수행
    if (st.turn >= 6 && st.turn % 8 === 5 && st.health >= 60 && st.statuses.length === 0 && st.money >= 40 && st.age < 70) {
      const jb = st;
      // 길 위의 세평은 사건별로 나눠 센다 (다음 사건을 고를 때, 또는 수행이 끝날 때 앞 사건 몫을 정산)
      let jPrev: { label: string; s: GameState } | null = null;
      st = runJourneyHeadless(st, rand(regionsForCountry(st.country)).id, {
        choose: (s0, ev) => {
          if (jPrev) track(jPrev.label, jPrev.s, s0);
          jPrev = { label: `길:${String(ev.meta?.jrKey || ev.id)}`, s: s0 };
          const opts = ev.options.filter((o) => !o.disabled && o.id !== 'home');
          if (persona !== 'RANDOM') {
            const w = AXIS_WORD[persona];
            const hits = opts.filter((o) => (o.hint || '').includes(w) && !(o.hint || '').includes(`${w} -`));
            if (hits.length && Math.random() < 0.85) return rand(hits).id;
          }
          const safe = opts.filter((o) => o.id !== 'leave' && !(o.hint || '').includes('⚠'));
          if (safe.length && Math.random() < 0.85) return rand(safe).id;
          return (opts.find((o) => o.id === 'leave') || opts[0] || ev.options[0]).id;
        },
        fight: (s) => fight(s),
      });
      if (jPrev) track((jPrev as { label: string; s: GameState }).label, (jPrev as { label: string; s: GameState }).s, st);
      void jb;
      if (st.phase === 'ENDING') break;
      st = advanceSeason({ ...st, lastSeasonSummary: null });
      st = withMilestones(turnStart, st) || st;
      continue;
    }

    // 계절 계획
    const wall = st.skills.find((s) => isAtMasteryWall(s));
    let acts: ScheduleActivityId[];
    const poor = st.money < 130 || st.debt > 0;
    const hasDisc = st.disciples.some((d) => !d.dead);
    if (st.health < 58 || st.statuses.length > 0) acts = ['REST'];
    else if (wall && persona !== 'COMMERCE' && st.health >= 65) {
      st.seasonPlan = { ...st.seasonPlan, seclusionSkillId: wall.id };
      acts = ['SECLUSION'];
    } else if (persona === 'COMMERCE') acts = ['ESCORT', hasDisc ? 'TEACH' : 'TRAIN'];
    // 돈이 바닥나면 누구든 호위로 벌러 나간다 (빚 독촉에 몰려 해결사가 되는 일을 실제 플레이어는 피하려 한다)
    else if (poor && persona !== 'ARCANE') acts = ['TRAIN', 'ESCORT'];
    else if (persona === 'ASCETIC') acts = ['TRAIN', st.age >= 40 ? 'MIND' : 'BODY'];
    else if (persona === 'ARCANE') acts = [unread ? 'DECODE' : 'MIND', poor ? 'ESCORT' : 'TRAIN'];
    else if (persona === 'VIRTUE') acts = ['TRAIN', hasDisc ? 'TEACH' : poor ? 'ESCORT' : 'MIND'];
    else if (poor) acts = ['TRAIN', 'ESCORT'];
    else acts = ['TRAIN', rand<ScheduleActivityId>(unread ? ['DECODE', 'MIND', 'BODY', 'TEACH'] : hasDisc ? ['MIND', 'BODY', 'TEACH', 'ESCORT'] : ['MIND', 'BODY', 'ESCORT'])];
    const ab = st;
    for (let i = 0; i < acts.length && st.phase !== 'ENDING'; i++) {
      st = executeScheduleActivity(st, acts[i], 1 / acts.length, i === 0 ? 'EARLY' : i === acts.length - 1 ? 'LATE' : 'MID').state;
    }
    track('계절 활동', ab);
    if (st.phase === 'ENDING') break;
    const sb = st;
    st = advanceSeason(st);
    track('계절 정산', sb);
    st = withMilestones(turnStart, st) || st;
  }

  const facts = extractLineageFacts(st);
  const ending = generatePostMortemEnding(st);
  return {
    persona,
    magic: facts.magic,
    title: ending.endingTitle.split(' — ')[0],
    axis: facts.axis,
    scale: facts.scale,
    grimoireOffers,
    grimoireBought,
    fantasyLearned: st.skills.some((s) => isFantasy(s.origin)),
    knowsMagic: st.skills.some((s) => isFantasy(s.origin) && s.masteryLevel >= 3),
    magicPublic: !!st.flags.usedMagicPublicly,
    rep: st.reputation,
    age: st.age,
  };
}

const pct = (n: number, d: number) => `${d ? Math.round((n / d) * 100) : 0}%`;
const q = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : 0;
};
const top = (m: Map<string, number>, n: number, total: number) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} ${pct(v, total)}`)
    .join(' · ');

console.log(`\n[엔딩 벤치] 페르소나당 ${RUNS}인생 (쉬움 2 : 어려움 1, 3국 순환)`);
const allTitles = new Map<string, number>();
let allLives = 0;
const dump: LifeResult[] = [];
for (const persona of PERSONAS) {
  if (ONLY && persona !== ONLY) continue;
  const results: LifeResult[] = [];
  for (let i = 0; i < RUNS; i++) results.push(runLife(persona, i));
  dump.push(...results);
  const titles = new Map<string, number>();
  const axes = new Map<string, number>();
  const scales = new Map<string, number>();
  results.forEach((r) => {
    titles.set(r.title, (titles.get(r.title) || 0) + 1);
    axes.set(r.axis, (axes.get(r.axis) || 0) + 1);
    scales.set(r.scale, (scales.get(r.scale) || 0) + 1);
    if (persona === 'RANDOM') allTitles.set(r.title, (allTitles.get(r.title) || 0) + 1);
  });
  if (persona === 'RANDOM') allLives += results.length;
  const n = results.length;
  const repQ = (k: keyof GameState['reputation']) => `${q(results.map((r) => r.rep[k]), 0.5)}/${q(results.map((r) => r.rep[k]), 0.9)}`;
  console.log(`\n  [${persona}] 평균 사망 ${(results.reduce((a, r) => a + r.age, 0) / n).toFixed(1)}세 · 엔딩 종류 ${titles.size}`);
  console.log(`    엔딩: ${top(titles, 6, n)}`);
  console.log(`    세평 축: ${top(axes, 5, n)} | 규모: ${top(scales, 3, n)}`);
  console.log(
    `    이계: 금서 제안 ${(results.reduce((a, r) => a + r.grimoireOffers, 0) / n).toFixed(2)}회/인 · 구매 ${(results.reduce((a, r) => a + r.grimoireBought, 0) / n).toFixed(2)}권/인 · 술법 습득 ${pct(results.filter((r) => r.fantasyLearned).length, n)} · Lv3+ ${pct(results.filter((r) => r.knowsMagic).length, n)} · 공개 사용 ${pct(results.filter((r) => r.magicPublic).length, n)}`
  );
  console.log(`    세평 중앙/90%: 인덕 ${repQ('virtue')} · 살기 ${repQ('ruthless')} · 상무 ${repQ('commerce')} · 구도 ${repQ('ascetic')} · 이단 ${repQ('arcane')}`);
}
if (process.env.RUTH || process.env.SRC) {
  for (const persona of PERSONAS) {
    const rows = [...ruthSrc.entries()].filter(([k]) => k.startsWith(persona + '|')).sort((a, b) => b[1] - a[1]).slice(0, process.env.SRC ? 16 : 8);
    if (rows.length) console.log(`  ${SRC_AXIS} 출처 [${persona}] ${rows.map(([k, v]) => `${k.split('|')[1]} ${Math.round(v / RUNS)}`).join(' · ')}`);
  }
}
if (allLives) {
  const maxShare = Math.max(...allTitles.values()) / allLives;
  console.log(`\n  무작위 플레이어 엔딩 쏠림: 1위 ${Math.round(maxShare * 100)}% · 종류 ${allTitles.size}`);
}
if (process.env.DUMP) {
  // 축 보정값을 다시 잡을 때 쓰는 일생별 세평 (scripts 밖, /tmp에 쓴다)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('fs').writeFileSync(process.env.DUMP, JSON.stringify(dump.map((r) => ({ p: r.persona, m: r.magic, rep: r.rep, scale: r.scale }))));
  console.log(`  일생별 세평 → ${process.env.DUMP}`);
}
