import {
  advanceSeason,
  applyBattleOutcome,
  applyImprintedTrait,
  createNewGame,
  executeScheduleActivity,
  FACILITY_INFO,
  generateMerchantOffer,
  resolveEventOption,
  teachSkillToDisciple,
} from '../src/engine/gameLogic';
import { simulateAutoBattleQuick } from '../src/engine/autoBattleSim';
import {
  ALL_BOOKS_CATALOG,
  BOOK_SKILL_TEMPLATES,
  createBaseSkills,
  evaluateCraft,
  getTraitCandidates,
  SIGNATURE_RECIPES,
} from '../src/data/booksAndSkills';
import { MINOR_EVENTS } from '../src/data/minorEvents';
import { generatePostMortemEnding } from '../src/data/worldAndEndings';
import { BattleTactic, CountryId, DojoFacilities, ScheduleActivityId, Skill } from '../src/types/game';

// Node 환경 localStorage mock
const memStorage: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memStorage[k] ?? null,
  setItem: (k: string, v: string) => { memStorage[k] = v; },
  removeItem: (k: string) => { delete memStorage[k]; },
  clear: () => { Object.keys(memStorage).forEach((k) => delete memStorage[k]); },
  key: (i: number) => Object.keys(memStorage)[i] ?? null,
  get length() { return Object.keys(memStorage).length; },
};

const failures: string[] = [];
const warnings: string[] = [];
const assert = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };

console.log('==================================================================');
console.log('  《무명도장 v3.1》 몬테카를로 150회 풀 일생 밸런스 & 이벤트 분석봇');
console.log('==================================================================\n');

// ------------------------------------------------------------------
// TEST 1: 시그니처 조합 레시피 40종 전수 검사
// ------------------------------------------------------------------
const baseSkills = createBaseSkills();
const allTemplates: Record<string, Skill> = {};
baseSkills.forEach((s) => { allTemplates[s.id] = { ...s, masteryLevel: 5 }; });
Object.values(BOOK_SKILL_TEMPLATES).forEach((t) => {
  allTemplates[t.id] = { ...t, masteryLevel: 5, masteryExp: 0, imprintedTraits: [] };
});
const createdByCraft: Record<string, Skill> = {};
let sigPass = 0;
for (const r of SIGNATURE_RECIPES) {
  const sA = allTemplates[r.a] || createdByCraft[r.a];
  const sB = allTemplates[r.b] || createdByCraft[r.b];
  if (!sA || !sB) { failures.push(`레시피 재료 누락: ${r.id}`); continue; }
  const res = evaluateCraft(sA, sB, 85, '테스터');
  if (res.possible && res.isSignature && res.resultSkill) {
    sigPass++;
    createdByCraft[r.result.id] = res.resultSkill;
  } else {
    failures.push(`시그니처 실패: ${r.id} (${r.result.name})`);
  }
}
console.log(`[TEST 1] 시그니처 조합 40종 (2차·금기 포함): ${sigPass}/40 통과`);

// ------------------------------------------------------------------
// TEST 2: 5가지 전략 × 30회 = 150회 풀 일생 몬테카를로 시뮬레이션!
// ------------------------------------------------------------------
type Strategy = 'FOCUS_100' | 'DUAL_50' | 'MULTI_25' | 'ARCANE' | 'COMMERCE';
const strategies: Strategy[] = ['FOCUS_100', 'DUAL_50', 'MULTI_25', 'ARCANE', 'COMMERCE'];
const countries: CountryId[] = ['KOREA', 'CHINA', 'JAPAN'];

const majorEventCounts = new Map<string, number>();
const minorEventSeenGlobal = new Set<string>();
const endingCounts = new Map<string, number>();

interface StratStats {
  runs: number;
  sumAge: number;
  naturalDeaths: number;
  duelDeaths: number;
  sumFame: number;
  sumMoney: number;
  sumMaxLv: number;
  sumSkills: number;
  sumCrafts: number;
  sumDisciples: number;
  sumMutations: number;
  sumDegradations: number;
  marriedCount: number;
  childCount: number;
  rivalAct4Count: number;
  sumParriesYoung: number;
  sumParriesOld: number;
  battlesYoung: number;
  battlesOld: number;
  winsYoung: number;
  winsOld: number;
  sumUniqueMajor: number;
  sumUniqueMinor: number;
}

function emptyStats(): StratStats {
  return {
    runs: 0, sumAge: 0, naturalDeaths: 0, duelDeaths: 0, sumFame: 0, sumMoney: 0,
    sumMaxLv: 0, sumSkills: 0, sumCrafts: 0, sumDisciples: 0, sumMutations: 0, sumDegradations: 0,
    marriedCount: 0, childCount: 0, rivalAct4Count: 0,
    sumParriesYoung: 0, sumParriesOld: 0, battlesYoung: 0, battlesOld: 0, winsYoung: 0, winsOld: 0,
    sumUniqueMajor: 0, sumUniqueMinor: 0,
  };
}

const RUNS_PER_STRAT = 30;
console.log(`\n[TEST 2] 5전략 × ${RUNS_PER_STRAT}회 = ${strategies.length * RUNS_PER_STRAT}회 풀 일생 몬테카를로 시뮬레이션 실행 중...\n`);

for (const strat of strategies) {
  const agg = emptyStats();
  for (let i = 0; i < RUNS_PER_STRAT; i++) {
    const country = countries[i % 3];
    let st = createNewGame(country, i % 2 === 0 ? 'MALE' : 'FEMALE', `봇_${strat}_${i}`, 20);
    st.phase = 'MAIN';
    st.battleTactic = (strat === 'FOCUS_100' ? 'COUNTER' : strat === 'COMMERCE' ? 'BALANCED' : 'AGGRESSIVE') as BattleTactic;

    let craftsDone = 0;
    const maxTurns = 340;

    while (st.phase !== 'ENDING' && st.turn < maxTurns) {
      // 노년기엔 간파 수비로 전환해 노고수 AI 테스트
      if (st.age >= 50) st.battleTactic = 'COUNTER';

      // 대기 각인 선택
      if (st.pendingTraitSkillId) {
        const sk = st.skills.find((s) => s.id === st.pendingTraitSkillId);
        if (sk && sk.pendingTraitTier) {
          st = applyImprintedTrait(st, sk.id, getTraitCandidates(sk, sk.pendingTraitTier)[0]);
        } else {
          st = { ...st, pendingTraitSkillId: null };
        }
      }

      // 주요 이벤트 처리 & 집계
      if (st.activeEvent) {
        const ev = st.activeEvent;
        const baseEvId = ev.id.startsWith('random_dojo_breaker') ? 'random_dojo_breaker' : ev.id.startsWith('random_inspiration') ? 'random_inspiration' : ev.id;
        majorEventCounts.set(baseEvId, (majorEventCounts.get(baseEvId) || 0) + 1);
        const valid = ev.options.filter((o) => !o.disabled);
        // 전략별 성향 선택
        let pick = valid[0] || ev.options[0];
        if (strat === 'COMMERCE' && valid.length > 1 && Math.random() < 0.5) pick = valid[1];
        st = resolveEventOption(st, ev, pick.id);
      }

      // 완전 자동전투 실행
      if (st.phase === 'BATTLE' && st.pendingBattle) {
        const b = st.pendingBattle;
        const aliveD = st.disciples.filter((d) => !d.dead).sort((a, b2) => b2.stats.str - a.stats.str)[0];
        const useDisc = b.canUseDisciple && st.age >= 60 && !!aliveD && Math.random() < 0.45;
        const out = simulateAutoBattleQuick(st, b, useDisc ? 'DISCIPLE' : 'HERO', st.battleTactic, useDisc ? aliveD.id : undefined);

        if (!useDisc) {
          if (st.age < 40) { agg.battlesYoung++; if (out.victory) agg.winsYoung++; agg.sumParriesYoung += out.justParriesCount; }
          else if (st.age >= 50) { agg.battlesOld++; if (out.victory) agg.winsOld++; agg.sumParriesOld += out.justParriesCount; }
        }
        st = applyBattleOutcome(st, out);
        if (st.phase === 'ENDING') break;
      }

      // 만물객 거래
      if (st.merchantOffer) {
        for (const bk of st.merchantOffer.books) {
          const want = strat === 'FOCUS_100' ? bk.rarity === 'LEGEND' : strat === 'ARCANE' ? true : bk.rarity !== 'GRIMOIRE' || st.money >= bk.price + 100;
          if (want && st.money >= bk.price && !st.books.some((ob) => ob.id === bk.id)) {
            if (bk.decodeApRequired === 0) {
              const tpl = BOOK_SKILL_TEMPLATES[bk.skillTemplateId];
              const learned = tpl && !st.skills.some((s) => s.id === tpl.id) ? { ...tpl, masteryLevel: 1, masteryExp: 0, imprintedTraits: [] } : null;
              st = { ...st, money: st.money - bk.price, books: [...st.books, { ...bk, decoded: true }], skills: learned ? [...st.skills, learned] : st.skills };
            } else {
              st = { ...st, money: st.money - bk.price, books: [...st.books, { ...bk }] };
            }
          }
        }
        const curW = st.weapons.find((w) => w.id === st.equippedWeaponId);
        for (const wp of st.merchantOffer.weapons) {
          if (st.money >= wp.price + 80 && (!curW || wp.attack > curW.attack + 10)) {
            st = { ...st, money: st.money - wp.price, weapons: [...st.weapons, { ...wp }], equippedWeaponId: wp.id };
          }
        }
      }

      // 빚 상환 & 시설 증축 & 제자 전수
      if (st.debt > 0 && st.money >= st.debt) st = { ...st, money: st.money - st.debt, debt: 0, debtTurns: 0 };
      const facs: (keyof DojoFacilities)[] = ['yard', 'library', 'clinic', 'dorm', 'forge', 'sanctum'];
      for (const fk of facs) {
        const lv = st.facilities[fk];
        if (lv < 4 && st.money >= FACILITY_INFO[fk].costs[lv] + 100) {
          st = { ...st, money: st.money - FACILITY_INFO[fk].costs[lv], fame: st.fame + 10, facilities: { ...st.facilities, [fk]: lv + 1 } };
          break;
        }
      }
      const aliveD = st.disciples.filter((d) => !d.dead);
      if (aliveD.length > 0 && st.skills.length >= 2) {
        const topS = [...st.skills].sort((a, b) => b.masteryLevel - a.masteryLevel)[0];
        const targetD = aliveD.find((d) => !d.skills.some((ds) => ds.id === topS.id || ds.parents?.[0] === topS.id));
        if (targetD) st = teachSkillToDisciple(st, targetD.id, topS.id);
      }

      // 조합 프로젝트 자동 세팅
      if (!st.activeCraft && strat !== 'FOCUS_100' && craftsDone < 4 && st.skills.length >= 2) {
        outer: for (let a = 0; a < st.skills.length; a++) {
          for (let b = a + 1; b < st.skills.length; b++) {
            const sa = st.skills[a], sb = st.skills[b];
            if (st.skills.some((s) => s.parents && ((s.parents[0] === sa.id && s.parents[1] === sb.id) || (s.parents[0] === sb.id && s.parents[1] === sa.id)))) continue;
            const prev = evaluateCraft(sa, sb, st.stats.ins, st.name);
            if (prev.possible && (prev.isSignature || craftsDone < 2)) {
              st.activeCraft = { skillAId: sa.id, skillBId: sb.id, customName: prev.suggestedName, progress: 0 };
              break outer;
            }
          }
        }
      }

      // 전략별 계절 계획(1~4개, 1/n) 구성!
      const unread = st.books.find((b) => !b.decoded && (!b.requiresMasteryLv || Math.max(...st.skills.map((s) => s.masteryLevel)) >= b.requiresMasteryLv) && (!b.requiresQi || st.stats.qi >= b.requiresQi));
      const trainSk = [...st.skills].filter((s) => s.masteryLevel < 10).sort((a, b) => b.power - a.power)[0] || st.skills[0];
      st.seasonPlan.trainSkillId = trainSk.id;
      if (unread) st.seasonPlan.decodeBookId = unread.id;

      let acts: ScheduleActivityId[] = [];
      if (st.health < 52 || st.statuses.length > 0) {
        acts = ['REST'];
      } else if (strat === 'FOCUS_100') {
        acts = [trainSk.masteryLevel < 10 ? 'TRAIN' : st.age >= 40 ? 'MIND' : 'BODY'];
      } else if (strat === 'DUAL_50') {
        acts = ['TRAIN', unread ? 'DECODE' : st.activeCraft ? 'CRAFT' : st.money < 60 ? 'ESCORT' : 'BODY'];
      } else if (strat === 'MULTI_25') {
        acts = ['TRAIN', unread ? 'DECODE' : 'MIND', st.activeCraft ? 'CRAFT' : 'BODY', aliveD.length > 0 ? 'TEACH' : 'ESCORT'];
      } else if (strat === 'ARCANE') {
        acts = [unread ? 'DECODE' : 'MIND', st.activeCraft ? 'CRAFT' : 'TRAIN'];
      } else {
        acts = ['ESCORT', aliveD.length > 0 ? 'TEACH' : 'TRAIN', 'BODY'];
      }

      const prevSkillCount = st.skills.length;
      const share = 1 / acts.length;
      acts.forEach((act, idx) => {
        const ph = idx === 0 ? 'EARLY' : idx === acts.length - 1 ? 'LATE' : 'MID';
        const r = executeScheduleActivity(st, act, share, ph);
        st = r.state;
      });
      if (st.skills.length > prevSkillCount && !st.activeCraft) craftsDone++;

      st = advanceSeason(st);
    }

    const ending = generatePostMortemEnding(st);
    endingCounts.set(ending.endingTitle, (endingCounts.get(ending.endingTitle) || 0) + 1);
    st.flags.minorEventIdsSeen.forEach((id) => minorEventSeenGlobal.add(id));

    agg.runs++;
    agg.sumAge += st.age;
    if (st.deathCause?.includes('천수')) agg.naturalDeaths++;
    if (st.deathCause?.includes('진검')) agg.duelDeaths++;
    agg.sumFame += st.fame;
    agg.sumMoney += st.money;
    agg.sumMaxLv += Math.max(...st.skills.map((s) => s.masteryLevel));
    agg.sumSkills += st.skills.length;
    agg.sumCrafts += craftsDone;
    agg.sumDisciples += st.disciples.filter((d) => !d.dead).length;
    agg.sumMutations += st.disciples.reduce((a, d) => a + d.skills.filter((s) => s.isMutated).length, 0);
    agg.sumDegradations += st.disciples.reduce((a, d) => a + d.skills.filter((s) => s.isDegraded).length, 0);
    if (st.spouse) agg.marriedCount++;
    if (st.disciples.some((d) => d.isChild)) agg.childCount++;
    if (st.rival.act >= 4) agg.rivalAct4Count++;
    agg.sumUniqueMajor += st.flags.triggeredEvents.length;
    agg.sumUniqueMinor += st.flags.minorEventIdsSeen.length;
  }

  const r = agg.runs;
  const youngWr = agg.battlesYoung > 0 ? ((agg.winsYoung / agg.battlesYoung) * 100).toFixed(0) : '-';
  const oldWr = agg.battlesOld > 0 ? ((agg.winsOld / agg.battlesOld) * 100).toFixed(0) : '-';
  const oldParryAvg = agg.battlesOld > 0 ? (agg.sumParriesOld / agg.battlesOld).toFixed(1) : '-';

  console.log(
    `  [${strat.padEnd(9)}] 평균수명 ${(agg.sumAge / r).toFixed(1)}세 (천수 ${Math.round((agg.naturalDeaths / r) * 100)}% / 진검전사 ${Math.round((agg.duelDeaths / r) * 100)}%) | ` +
    `명성 ${Math.round(agg.sumFame / r)} | 돈 ${Math.round(agg.sumMoney / r)} | ` +
    `최고Lv.${(agg.sumMaxLv / r).toFixed(1)} · 스킬 ${(agg.sumSkills / r).toFixed(1)}종`
  );
  console.log(
    `     ↳ 제자 ${(agg.sumDisciples / r).toFixed(1)}명(변이 ${(agg.sumMutations / r).toFixed(1)}/열화 ${(agg.sumDegradations / r).toFixed(1)}) | ` +
    `결혼 ${Math.round((agg.marriedCount / r) * 100)}% · 자녀 ${Math.round((agg.childCount / r) * 100)}% · 라이벌4막 ${Math.round((agg.rivalAct4Count / r) * 100)}% | ` +
    `승률(청년 ${youngWr}% / 노년 ${oldWr}%, 노년 평균간파 ${oldParryAvg}회) | 고유이벤트 주요 ${(agg.sumUniqueMajor / r).toFixed(1)} / 사소 ${(agg.sumUniqueMinor / r).toFixed(1)}`
  );

  if (agg.naturalDeaths / r < 0.25) {
    warnings.push(`[밸런스 경고] ${strat} 전략의 천수 완주율이 너무 낮음 (${Math.round((agg.naturalDeaths / r) * 100)}%)`);
  }
}

// ------------------------------------------------------------------
// TEST 3: 이벤트 커버리지 & 엔딩 다양성 분석
// ------------------------------------------------------------------
console.log('\n[TEST 3] 이벤트 다양성 & 엔딩 분포 분석 (150회 누적)');
console.log(`  • 발동된 고유 주요 이벤트 종류: ${majorEventCounts.size}종`);
console.log(`  • 발동된 고유 사소한 이벤트 종류: ${minorEventSeenGlobal.size} / ${MINOR_EVENTS.length}종`);
console.log('  • 엔딩 분포:');
Array.from(endingCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .forEach(([title, cnt]) => console.log(`     - ${title}: ${cnt}회 (${((cnt / 150) * 100).toFixed(1)}%)`));

// 만물객 200회 샘플링
let grimHits = 0;
const sampleSt = createNewGame('JAPAN', 'MALE', '샘플', 30);
sampleSt.turn = 30;
sampleSt.fame = 180;
for (let i = 0; i < 200; i++) {
  if (generateMerchantOffer(sampleSt).hasGrimoire) grimHits++;
}
console.log(`  • 만물객 이계 금서 출현율: ${grimHits}/200 (${(grimHits / 2).toFixed(1)}%)`);

console.log('\n==================================================================');
console.log(`  분석 완료 | 치명 오류(FAIL): ${failures.length}건 | 밸런스 경고(WARN): ${warnings.length}건`);
console.log('==================================================================');
if (failures.length > 0) failures.forEach((f) => console.log('  ❌ ' + f));
if (warnings.length > 0) warnings.forEach((w) => console.log('  ⚠ ' + w));
process.exit(failures.length > 0 ? 1 : 0);
