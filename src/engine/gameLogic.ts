import {
  ActiveEvent,
  BattleConfig,
  Book,
  CountryId,
  DifficultyId,
  Disciple,
  DojoFacilities,
  GameState,
  Gender,
  ImprintedTrait,
  LogEntry,
  MerchantOffer,
  ScheduleActivityId,
  SeasonTickResult,
  Skill,
  Spouse,
  Stats,
  Weapon,
} from '../types/game';
import { pickMinorEvent } from '../data/minorEvents';
import {
  getDiscipleIllnessMeta,
  getDojoInvestmentCosts,
  getFacilityUpgradeCost,
  getFeverMedicineMeta,
  getHerbPeddlerMeta,
  getPlagueMedicineMeta,
  getShopPrice,
  getWeaponUpgradeCost,
} from '../data/balanceRules';
import { getDifficultyConfig, getDifficultyId } from '../data/difficulty';
export {
  getDiscipleIllnessMeta,
  getDojoInvestmentCosts,
  getFacilityUpgradeCost,
  getFeverMedicineMeta,
  getHerbPeddlerMeta,
  getPlagueMedicineMeta,
  getShopPrice,
  getWeaponUpgradeCost,
};
import {
  ALL_BOOKS_CATALOG,
  BOOK_SKILL_TEMPLATES,
  createBaseSkills,
  evaluateCraft,
  isAtMasteryWall,
  MASTERY_EXP_REQ,
  MASTERY_WALL_LEVEL,
  TRANSCEND_SUMMARY,
  transcendSkill,
} from '../data/booksAndSkills';
import { ALL_WEAPONS_CATALOG, getStartingWeapons, getWeaponById } from '../data/weapons';
import {
  createTournamentBattle,
  createTournamentSpectatorBattle,
  evaluateTournamentFameAdjustment,
  TOURNAMENT_ROUNDS,
} from '../data/tournament';
import { computeSectTitle, COUNTRIES, SEASON_META } from '../data/worldAndEndings';
import { createBattleConfig, createDiscipleEntity, getRewardWeaponForDemon, pickSeasonalEvent } from '../data/events';
import { loadLegacyRecords } from './storage';
import { createInitialSects, worstSect } from '../data/sects';
import { getTrainingMult } from '../data/temperament';
import { adjustRelation, applySectBattleFollowup, resolveSectEvent, settleDisciplesAndSects, syncRivalSect } from './sectLogic';

import { addLog } from './log';
import { applyJourneyBattle, applyJourneyDefeat, isJourneyEvent, pickDueHomeEcho, pickHomeEvent, resolveJourneyEvent } from './journey';
import { applyTourneyBattle, startTourney } from './tourney';
export { addLog };

export function createNewGame(
  country: CountryId,
  gender: Gender,
  name: string,
  startAge: 15 | 20 | 28,
  difficulty: DifficultyId = 'EASY'
): GameState {
  const cMeta = COUNTRIES[country];
  const diffCfg = getDifficultyConfig({ difficulty });
  const startingWeapons = getStartingWeapons(country);
  const baseSkills = createBaseSkills();

  const ageBonus =
    startAge === 15
      ? { str: 14, agi: 16, vit: 15, wil: 14, ins: 16, qi: 10, money: 15 }
      : startAge === 20
      ? { str: 20, agi: 20, vit: 20, wil: 18, ins: 18, qi: 12, money: 20 }
      : { str: 24, agi: 22, vit: 22, wil: 23, ins: 24, qi: 16, money: 40 };

  const initial: GameState = {
    phase: 'PROLOGUE',
    difficulty,
    country,
    gender,
    name: name.trim() || '이도현',
    sectName: '무명류(無名流)',
    sectNamed: false,
    year: 1750,
    season: 'SPRING',
    turn: 1,
    age: startAge,
    startAge,
    health: 96,
    maxLifespanPenalty: 0,
    ap: 2,
    maxAp: 2,
    money: ageBonus.money,
    debt: diffCfg.startDebt,
    debtTurns: 0,
    fame: 10,
    authority: 10,
    signboardStolen: false,
    stats: {
      str: ageBonus.str,
      agi: ageBonus.agi,
      vit: ageBonus.vit,
      wil: ageBonus.wil + (country === 'KOREA' ? 2 : 0),
      ins: ageBonus.ins,
      qi: ageBonus.qi,
    },
    reputation: { virtue: 0, ruthless: 0, commerce: 0, ascetic: 0, arcane: 0 },
    currentTitle: '이름 없는 소도장',
    facilities: { yard: 1, dorm: 1, library: 1, forge: 1, clinic: 1, sanctum: 1 },
    skills: baseSkills,
    equippedActiveIds: ['base_h_slash', 'base_v_slash'],
    equippedPassiveIds: [],
    books: [],
    weapons: startingWeapons,
    equippedWeaponId: startingWeapons[0].id,
    disciples: [],
    sects: createInitialSects(country, cMeta.rivalTemplate.name, difficulty),
    taughtSkillIds: ['base_h_slash', 'base_v_slash'],
    spouse: null,
    rival: { ...cMeta.rivalTemplate, age: startAge + 1 },
    statuses: [],
    disabilities: [],
    awakenings: [],
    disabilityProgress: { oneArmRealWins: 0, blindParries: 0, limpCounterWins: 0 },
    seasonPlan: {
      activities: ['TRAIN', 'ESCORT'],
      weights: { TRAIN: 2, ESCORT: 1 },
      trainSkillId: 'base_h_slash',
      decodeBookId: '',
    },
    activeCraft: null,
    activeBuild: null,
    battleTactic: 'BALANCED',
    lastSeasonSummary: null,
    flags: {
      usedMagicPublicly: false,
      magicCastCount: 0,
      forbiddenCastCount: 0,
      realDuelWins: 0,
      realDuelKills: 0,
      wroteManual: false,
      royalAlliance: false,
      westernFear: false,
      rivalFarewellDone: false,
      heirConflictDone: false,
      triggeredEvents: [],
      minorEventIdsSeen: [],
      storyMemory: {},
      tutorialDone: false,
      grandmasterWins: 0,
      tournamentWins: 0,
      maxParriesInBattle: 0,
      merchantVisits: 0,
      hasMetMerchant: false,
      hasHadFirstDisciple: false,
      hasCraftedOnce: false,
      debtDeadlinePassed: false,
      sparringWins: 0,
    },
    logs: [
      {
        id: 'init_1',
        year: 1750,
        season: 'SPRING',
        text: `1750년 봄, ${cMeta.name}. 횡베기와 종베기 두 초식만을 품고 무너져가는 도장을 물려받았다.`,
        type: 'NORMAL',
      },
    ],
    milestones: [],
    activeEvent: null,
    pendingBattle: null,
    merchantOffer: null,
    pendingTraitSkillId: null,
    deathCause: null,
  };

  return initial;
}

export const FACILITY_INFO: Record<
  keyof DojoFacilities,
  { name: string; stages: string[]; costs: number[]; effectDesc: string }
> = {
  yard: {
    name: '연무장',
    stages: ['잡초 흙마당', '지붕 얹은 마당', '목조 대련장', '웅장한 대도장'],
    costs: [0, 130, 420, 1400],
    effectDesc: '최대 문하생 수용(3→8→16→30) 및 수련 효율↑',
  },
  dorm: {
    name: '숙소·식당',
    stages: ['통학만 가능', '단칸 합숙소', '제자 기숙사', '내·외문 대형 숙소'],
    costs: [0, 110, 360, 1150],
    effectDesc: '타지 천재 제자 영입 확률↑ 및 도장 유지비 12% 절감',
  },
  library: {
    name: '장서각',
    stages: ['낡은 나무 상자', '작은 서재', '비급 보관실', '대장서각'],
    costs: [0, 120, 400, 1300],
    effectDesc: '서적 연구 가속 및 무술 조합 성공 보너스',
  },
  forge: {
    name: '대장간',
    stages: ['숫돌 1개', '간이 화로', '전속 대장간', '신병 공방'],
    costs: [0, 130, 420, 1350],
    effectDesc: '무기 강화 상한 해금(+1→+5) 및 무료 수리',
  },
  clinic: {
    name: '약방',
    stages: ['구급 약초함', '의원실', '약초원', '영약당'],
    costs: [0, 110, 370, 1250],
    effectDesc: '열병·역병 탕약 성공률↑, 회복 가속 및 노년 건강 방어',
  },
  sanctum: {
    name: '특수 수련장',
    stages: ['없음', '목인장·폭포', '기공 수련실', '천지영맥·마력탑'],
    costs: [0, 200, 580, 1850],
    effectDesc: 'QI 수련 극대화 및 마법·신기 연마 효율 +50%',
  },
};

// 후반 문파 투자 (양생 영약 / 문파 대연회 / 고을 빈민 구제) — 분기당 항목별 1회
export function performDojoInvestment(state: GameState, kind: 'TONIC' | 'BANQUET' | 'CHARITY'): GameState {
  const flagKey = `invest_${kind}_${state.turn}`;
  if (state.flags.triggeredEvents.includes(flagKey)) return state;
  const costs = getDojoInvestmentCosts(state);
  const cMeta = COUNTRIES[state.country];
  const cost = kind === 'TONIC' ? costs.tonic : kind === 'BANQUET' ? costs.banquet : costs.charity;
  if (state.money < cost) return state;

  let next: GameState = {
    ...state,
    money: state.money - cost,
    flags: {
      ...state.flags,
      triggeredEvents: [...state.flags.triggeredEvents, flagKey],
    },
  };

  if (kind === 'TONIC') {
    const goodChance = Math.min(0.92, 0.78 + (state.facilities.clinic - 1) * 0.04);
    if (Math.random() < goodChance) {
      next.health = Math.min(100, next.health + 14);
      return addLog(next, `특제 보양 탕약(-${cost}${cMeta.currency})을 달여 마셔 기력이 크게 돌았다! (건강 +14)`, 'GOOD');
    }
    next.health = Math.min(100, next.health + 4);
    return addLog(next, `특제 보양 탕약(-${cost}${cMeta.currency})을 마셨으나 약성이 다소 옅어 차도가 미미했다. (건강 +4)`, 'WARN');
  }

  if (kind === 'BANQUET') {
    const alive = next.disciples.filter((d) => !d.dead);
    next.disciples = next.disciples.map((d) =>
      d.dead
        ? d
        : {
            ...d,
            loyalty: Math.min(100, d.loyalty + 15),
            skills: d.skills.map((s, idx) => (idx === 0 ? gainSkillExp(s, 28).updated : s)),
          }
    );
    next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 10 };
    next.authority += 4;
    return addLog(
      next,
      `문파 대연회와 장학금(-${cost}${cMeta.currency})을 베풀었다! 문하생 ${alive.length}명 충성도 +15 · 주력 무공 크게 진전!`,
      'GOOD'
    );
  }

  // CHARITY
  next.fame += 24;
  next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 24 };
  next.authority += 6;
  return addLog(next, `고을 빈민 구제에 시주(-${cost}${cMeta.currency})해 백성들의 칭송이 자자하다! (명성 +24 · 인덕 +24)`, 'GOOD');
}

// 연령별 스탯 상한 & 최대 건강(수명) 상한 계산
export function getStatCaps(age: number): { bodyCap: number; mindCap: number } {
  if (age < 50) return { bodyCap: 95, mindCap: 75 };
  if (age < 65) return { bodyCap: 70, mindCap: 100 };
  return { bodyCap: 50, mindCap: 100 };
}

export function getMaxHealthByAge(age: number, maxLifespanPenalty: number, hasLongevity: boolean, clinicLv: number): number {
  const effectiveAge = age + maxLifespanPenalty;
  if (effectiveAge <= 55) return 100;
  const decayMult = (hasLongevity ? 0.65 : 1.0) * (clinicLv >= 4 ? 0.85 : 1.0);
  if (effectiveAge <= 65) {
    return Math.max(20, Math.round(100 - (effectiveAge - 55) * 2.2 * decayMult));
  }
  const baseAt65 = 100 - 22 * decayMult;
  return Math.max(0, Math.round(baseAt65 - (effectiveAge - 65) * 4.8 * decayMult));
}

export function clampStatsByAge(stats: GameState['stats'], age: number): GameState['stats'] {
  const { bodyCap, mindCap } = getStatCaps(age);
  return {
    str: Math.min(bodyCap, Math.max(12, stats.str)),
    agi: Math.min(bodyCap, Math.max(12, stats.agi)),
    vit: Math.min(bodyCap, Math.max(12, stats.vit)),
    wil: Math.min(mindCap, Math.max(10, stats.wil)),
    ins: Math.min(mindCap, Math.max(10, stats.ins)),
    qi: Math.min(mindCap, Math.max(0, stats.qi)),
  };
}

export function getMaxDisciples(facilities: DojoFacilities): number {
  return [0, 3, 8, 16, 30][facilities.yard] || 3;
}

export function getMaxActiveSlots(ins: number): number {
  return ins >= 50 ? 5 : 4;
}

export function getMaxPassiveSlots(qi: number): number {
  return qi >= 50 ? 2 : 1;
}

// 수련·사건·대련으로 얻는 숙련은 Lv.9(입신)에서 멈춘다. Lv.9 숙련이 가득 차면 "벽"이고,
// 그 너머 Lv.10 극의는 폐관수련의 돌파(transcendSkill)로만 연다.
export function gainSkillExp(skill: Skill, amount: number): { updated: Skill; leveledUp: boolean; triggeredTrait?: 3 | 6 | 9 } {
  if (skill.masteryLevel >= 10) return { updated: skill, leveledUp: false };
  let lv = skill.masteryLevel;
  let exp = skill.masteryExp + amount;
  let leveledUp = false;
  let triggeredTrait: 3 | 6 | 9 | undefined;

  while (lv < MASTERY_WALL_LEVEL && exp >= MASTERY_EXP_REQ[lv]) {
    exp -= MASTERY_EXP_REQ[lv];
    lv += 1;
    leveledUp = true;
    if ((lv === 3 || lv === 6 || lv === 9) && !skill.imprintedTraits.some((t) => t.tier === lv)) {
      triggeredTrait = lv;
    }
  }

  return {
    updated: {
      ...skill,
      masteryLevel: lv,
      masteryExp: lv >= MASTERY_WALL_LEVEL ? Math.min(exp, MASTERY_EXP_REQ[MASTERY_WALL_LEVEL]) : exp,
      pendingTraitTier: triggeredTrait || skill.pendingTraitTier,
    },
    leveledUp,
    triggeredTrait,
  };
}

// 개인 수련 (1 AP)
export function performPersonalTraining(state: GameState, skillId: string): GameState {
  if (state.ap < 1) return state;
  const idx = state.skills.findIndex((s) => s.id === skillId);
  if (idx === -1) return state;

  const skill = state.skills[idx];
  const seasonMult = state.season === 'SUMMER' ? 1.15 : 1.0;
  const ageMult = state.age < 20 ? 1.3 : state.age < 35 ? 1.15 : state.age < 50 ? 1.2 : 1.1;
  const facilityMult = 1 + (state.facilities.yard - 1) * 0.12 + (skill.origin.includes('FANTASY') ? (state.facilities.sanctum - 1) * 0.18 : 0);
  const countryBonus = state.country === 'JAPAN' && skill.weapon === 'BLADE' ? 1.1 : 1.0;

  const expGain = Math.round(36 * seasonMult * ageMult * facilityMult * countryBonus);
  const { updated, leveledUp, triggeredTrait } = gainSkillExp(skill, expGain);

  const nextSkills = [...state.skills];
  nextSkills[idx] = updated;

  // 스탯 소폭 성장
  const nextStats = { ...state.stats };
  if (skill.form === 'SLASH' || skill.form === 'STRIKE' || skill.form === 'GRAPPLE') nextStats.str += 1;
  if (skill.form === 'THRUST' || skill.form === 'STEP') nextStats.agi += 1;
  if (skill.form === 'PARRY' || skill.form === 'AURA') nextStats.wil += 1;
  if (skill.element !== 'PHYSICAL' || skill.form === 'AURA') nextStats.qi += 2;
  nextStats.ins += state.age >= 35 ? 2 : 1;

  let next: GameState = {
    ...state,
    ap: state.ap - 1,
    skills: nextSkills,
    stats: clampStatsByAge(nextStats, state.age),
    reputation: { ...state.reputation, ascetic: state.reputation.ascetic + 1 },
    pendingTraitSkillId: triggeredTrait ? updated.id : state.pendingTraitSkillId,
  };

  next = addLog(
    next,
    isAtMasteryWall(updated)
      ? `「${updated.customName || updated.name}」을(를) 휘둘러 보았으나 더는 늘지 않는다. 벽(壁)에 부딪혔다 — 폐관수련으로만 넘을 수 있다.`
      : `「${updated.customName || updated.name}」을(를) 집중 연마했다. (숙련도 +${expGain}${leveledUp ? ` → Lv.${updated.masteryLevel} 경지 돌파!` : ''})`,
    leveledUp ? 'GOOD' : 'NORMAL'
  );
  return next;
}

// 기초 신체/기공 단련 (1 AP)
export function performBasicConditioning(state: GameState, focus: 'BODY' | 'MIND'): GameState {
  if (state.ap < 1) return state;
  const nextStats = { ...state.stats };
  const sanctumBonus = state.facilities.sanctum >= 2 ? 2 : 0;

  if (focus === 'BODY') {
    const mult = state.age < 35 ? 1.3 : state.age < 50 ? 1.0 : 0.6;
    nextStats.str += Math.max(1, Math.round(2 * mult));
    nextStats.agi += Math.max(1, Math.round(2 * mult));
    nextStats.vit += Math.max(1, Math.round(2 * mult));
  } else {
    const mult = state.age >= 50 ? 1.5 : state.age >= 35 ? 1.3 : 1.0;
    const krBonus = state.country === 'KOREA' ? 1 : 0;
    nextStats.wil += Math.max(1, Math.round(2 * mult)) + krBonus;
    nextStats.ins += Math.max(1, Math.round(2 * mult));
    nextStats.qi += Math.max(2, Math.round(2 * mult) + sanctumBonus + krBonus);
  }

  let next: GameState = {
    ...state,
    ap: state.ap - 1,
    stats: clampStatsByAge(nextStats, state.age),
    reputation: { ...state.reputation, ascetic: state.reputation.ascetic + 2 },
  };
  next = addLog(
    next,
    focus === 'BODY'
      ? '마당에서 땀을 쏟으며 근력·민첩·체력을 단련했다.'
      : '고요히 호흡을 가다듬어 정신력·통찰·기(QI)를 끌어올렸다.',
    'NORMAL'
  );
  return next;
}

// 초반 생계 잡일 / 단기 호위 (1 AP)
export function performOddJob(state: GameState): GameState {
  if (state.ap < 1) return state;
  const pay = 20 + Math.floor(state.stats.str * 0.4) + (state.country === 'CHINA' ? 6 : 0);
  const famePenalty = state.fame >= 120 ? 3 : 0;
  let next: GameState = {
    ...state,
    ap: state.ap - 1,
    money: state.money + pay,
    fame: Math.max(0, state.fame - famePenalty),
    stats: { ...state.stats, vit: state.stats.vit + 1 },
    reputation: { ...state.reputation, commerce: state.reputation.commerce + 2 },
  };
  next = addLog(
    next,
    `장터 짐 나르기와 단기 호위 의뢰로 ${pay}${COUNTRIES[state.country].currency}을 벌었다.${famePenalty > 0 ? ' (체면이 살짝 깎였다)' : ''}`,
    'GOOD'
  );
  return next;
}

// 휴식 및 치료 (1 AP)
export function performRest(state: GameState): GameState {
  if (state.ap < 1) return state;
  const clinicBonus = (state.facilities.clinic - 1) * 5;
  const spouseBonus = state.spouse?.alive && state.spouse.bonusType === 'CLINIC' ? 8 : 0;
  const heal = 14 + clinicBonus + spouseBonus;
  const nextStatuses = state.statuses
    .map((s) => ({ ...s, turnsRemaining: s.turnsRemaining - (state.facilities.clinic >= 2 ? 2 : 1) }))
    .filter((s) => s.turnsRemaining > 0);

  const maxHealthCap = getMaxHealthByAge(
    state.age,
    state.maxLifespanPenalty,
    state.equippedPassiveIds.includes('sk_kr_08'),
    state.facilities.clinic
  );

  let next: GameState = {
    ...state,
    ap: state.ap - 1,
    health: Math.min(maxHealthCap, state.health + heal),
    statuses: nextStatuses,
  };
  next = addLog(next, `충분히 휴식하고 약탕을 달여 마셨다. (건강 +${heal})`, 'GOOD');
  return next;
}

// 문하생 지도 (1 AP)
export function performTeachDisciples(state: GameState): GameState {
  if (state.ap < 1) return state;
  const alive = state.disciples.filter((d) => !d.dead);
  if (alive.length === 0) return state;

  const spouseBonus = state.spouse?.alive && state.spouse.bonusType === 'COMBAT' ? 1.2 : 1.0;
  const nextDisciples = state.disciples.map((d) => {
    if (d.dead) return d;
    const trainedSkills = d.skills.map((s) => gainSkillExp(s, Math.round(45 * spouseBonus)).updated);
    return {
      ...d,
      loyalty: Math.min(100, d.loyalty + 5),
      stats: {
        ...d.stats,
        str: d.stats.str + 1,
        agi: d.stats.agi + 1,
        ins: d.stats.ins + 1,
        qi: d.stats.qi + (d.isGenius ? 2 : 1),
      },
      skills: trainedSkills,
    };
  });

  let next: GameState = {
    ...state,
    ap: state.ap - 1,
    authority: state.authority + 2,
    disciples: nextDisciples,
  };
  next = addLog(next, `문하생 ${alive.length}명에게 직접 초식의 맥을 짚어 지도했다. 전원 성장 및 충성도 상승!`, 'GOOD');
  return next;
}

// 서적 해독 (1 AP)
export function performDecodeBook(state: GameState, bookId: string): GameState {
  if (state.ap < 1) return state;
  const idx = state.books.findIndex((b) => b.id === bookId);
  if (idx === -1) return state;
  const book = state.books[idx];
  if (book.decoded) return state;

  // 이계 금서 조건 체크
  const maxMastery = Math.max(...state.skills.map((s) => s.masteryLevel));
  if (book.requiresMasteryLv && maxMastery < book.requiresMasteryLv) {
    return addLog(state, `『${book.title}』은 아직 이해할 수 없다. 보유 무술 중 하나 이상이 달인(Lv.${book.requiresMasteryLv}) 경지에 올라야 한다.`, 'WARN');
  }
  if (book.requiresQi && state.stats.qi < book.requiresQi) {
    return addLog(state, `『${book.title}』을 해독하기엔 기/영력(QI)이 부족하다. (필요 QI ${book.requiresQi})`, 'WARN');
  }

  const speedBonus =
    (state.season === 'WINTER' ? 1 : 0) +
    (state.facilities.library >= 3 ? 1 : 0) +
    (state.spouse?.alive && (state.spouse.bonusType === 'SCHOLAR' || state.spouse.bonusType === 'WESTERN') ? 1 : 0);
  const progressGain = 1 + (speedBonus >= 2 ? 1 : 0);
  const nextProg = book.decodeProgress + progressGain;
  const completed = nextProg >= book.decodeApRequired;

  const nextBooks = [...state.books];
  nextBooks[idx] = { ...book, decodeProgress: nextProg, decoded: completed };

  let next: GameState = { ...state, ap: state.ap - 1, books: nextBooks };

  if (completed) {
    if (book.isLegacy && book.legacySkill) {
      const learned: Skill = { ...book.legacySkill, masteryLevel: Math.min(3, book.legacySkill.masteryLevel) };
      next = { ...next, skills: [...next.skills, learned] };
      next = addLog(next, `전생의 유산 『${book.title}』 해독 완료! 「${learned.customName || learned.name}」을(를) 습득했다!`, 'MAGIC');
    } else {
      const tpl = BOOK_SKILL_TEMPLATES[book.skillTemplateId];
      if (tpl && !next.skills.some((s) => s.id === tpl.id)) {
        const learned: Skill = { ...tpl, masteryLevel: 1, masteryExp: 0, imprintedTraits: [] };
        next = { ...next, skills: [...next.skills, learned] };
        if (book.rarity === 'GRIMOIRE') {
          next = {
            ...next,
            reputation: { ...next.reputation, arcane: next.reputation.arcane + 15 },
          };
          next = addLog(next, `★ 이계 금서 해독 성공! ${book.enlightenmentText || `「${learned.name}」을(를) 깨달았다!`}`, 'MAGIC');
        } else {
          next = addLog(next, `『${book.title}』 해독 완료! 신규 무술 「${learned.name}」을(를) 습득했다.`, 'GOOD');
        }
      }
    }
  } else {
    next = addLog(next, `『${book.title}』의 난해한 문양을 연구했다. (${nextProg}/${book.decodeApRequired})`, 'NORMAL');
  }

  return next;
}

// 무술 크래프팅 실행 (1 AP)
export function performCraftSkill(
  state: GameState,
  skillAId: string,
  skillBId: string,
  customName: string
): { state: GameState; crafted?: Skill; error?: string } {
  if (state.ap < 1) return { state, error: '행동력(AP)이 부족합니다.' };
  const a = state.skills.find((s) => s.id === skillAId);
  const b = state.skills.find((s) => s.id === skillBId);
  if (!a || !b) return { state, error: '초식을 찾을 수 없습니다.' };

  const preview = evaluateCraft(a, b, state.stats.ins, state.name);
  if (!preview.possible || !preview.resultSkill) {
    return { state, error: preview.reason };
  }

  const finalSkill: Skill = {
    ...preview.resultSkill,
    customName: customName.trim() || preview.resultSkill.name,
  };

  const maxA = getMaxActiveSlots(state.stats.ins);
  const maxP = getMaxPassiveSlots(state.stats.qi);
  const nextActiveIds =
    !finalSkill.isPassive && state.equippedActiveIds.length < maxA
      ? [...state.equippedActiveIds, finalSkill.id]
      : state.equippedActiveIds;
  const nextPassiveIds =
    finalSkill.isPassive && state.equippedPassiveIds.length < maxP
      ? [...state.equippedPassiveIds, finalSkill.id]
      : state.equippedPassiveIds;

  let next: GameState = {
    ...state,
    ap: state.ap - 1,
    skills: [...state.skills, finalSkill],
    equippedActiveIds: nextActiveIds,
    equippedPassiveIds: nextPassiveIds,
    fame: state.fame + (finalSkill.isForbidden ? 20 : 12),
    stats: { ...state.stats, ins: state.stats.ins + 2 },
    reputation: {
      ...state.reputation,
      ascetic: state.reputation.ascetic + 5,
      arcane: state.reputation.arcane + (finalSkill.origin.includes('FANTASY') ? 10 : 0),
      ruthless: state.reputation.ruthless + (finalSkill.isForbidden ? 10 : 0),
    },
    flags: { ...state.flags, hasCraftedOnce: true },
    pendingTraitSkillId: finalSkill.pendingTraitTier ? finalSkill.id : state.pendingTraitSkillId,
  };

  next = addLog(
    next,
    `★ 신규 초식 「${finalSkill.customName}」 창시 성공! (Lv.${finalSkill.masteryLevel} 계승)`,
    finalSkill.origin.includes('FANTASY') || finalSkill.isForbidden ? 'MAGIC' : 'GOOD'
  );

  return { state: next, crafted: finalSkill };
}

// 연마 각인 적용
export function applyImprintedTrait(state: GameState, skillId: string, trait: ImprintedTrait): GameState {
  const nextSkills = state.skills.map((s) => {
    if (s.id !== skillId) return s;
    const nextPower = trait.effect.damageMult ? Math.round(s.power * trait.effect.damageMult) : s.power;
    const nextWindup = trait.effect.windupMult ? Math.max(80, Math.round(s.windupMs * trait.effect.windupMult)) : s.windupMs;
    const nextCd = trait.effect.cooldownMult ? Math.max(900, Math.round(s.cooldownMs * trait.effect.cooldownMult)) : s.cooldownMs;
    const nextPosture = trait.effect.postureMult ? Math.round((s.postureDamage || 20) * trait.effect.postureMult) : s.postureDamage;
    return {
      ...s,
      power: nextPower,
      windupMs: nextWindup,
      cooldownMs: nextCd,
      postureDamage: nextPosture,
      range: trait.effect.rangeExtend ? 'FAR' : s.range,
      telegraph: trait.effect.unblockable ? 'RED' : s.telegraph,
      imprintedTraits: [...s.imprintedTraits, trait],
      pendingTraitTier: undefined,
    };
  });

  const target = nextSkills.find((s) => s.id === skillId);
  let next: GameState = { ...state, skills: nextSkills, pendingTraitSkillId: null };
  next = addLog(
    next,
    trait.tier === 10
      ? `「${target?.customName || target?.name}」에 극의 각인 ${trait.label}을 새겼다!`
      : `「${target?.customName || target?.name}」에 ${trait.tier}단계 각인 【${trait.label}】을 새겼다!`,
    trait.tier === 10 ? 'MAGIC' : 'GOOD'
  );
  return next;
}

// 비밀 상인 만물객 오퍼 생성
export function generateMerchantOffer(state: GameState): MerchantOffer {
  const ownedBookIds = new Set(state.books.map((b) => b.id));
  const ownedSkillIds = new Set(state.skills.map((s) => s.id));
  const discount = state.spouse?.alive && state.spouse.bonusType === 'COMMERCE' ? 0.9 : 1.0;

  const available = ALL_BOOKS_CATALOG.filter(
    (b) => !ownedBookIds.has(b.id) && !ownedSkillIds.has(b.skillTemplateId)
  );

  const commons = available.filter((b) => b.rarity === 'COMMON');
  const rares = available.filter((b) => b.rarity === 'RARE');
  const westerns = available.filter((b) => b.rarity === 'WESTERN');
  const legends = available.filter((b) => b.rarity === 'LEGEND');
  const grimoires = available.filter((b) => b.rarity === 'GRIMOIRE');

  const pick = <T,>(arr: T[]): T | undefined => (arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : undefined);
  const chosenBooks: Book[] = [];
  const toBook = (b: Omit<Book, 'decodeProgress' | 'decoded'>): Book => ({
    ...b,
    price: getShopPrice(Math.round(b.price * discount), state),
    decodeProgress: 0,
    decoded: false,
  });

  // 기본 1~2권 (일반/희귀)
  const b1 = pick(commons) || pick(rares);
  if (b1) chosenBooks.push(toBook(b1));
  const b2 = pick(rares) || pick(westerns);
  if (b2 && b2.id !== b1?.id) chosenBooks.push(toBook(b2));

  // 서양 무술서 또는 전설 비급
  const westProb = state.country === 'JAPAN' ? 0.65 : state.country === 'CHINA' ? 0.6 : 0.45;
  const b3 = Math.random() < westProb ? pick(westerns) : pick(legends);
  if (b3 && !chosenBooks.some((c) => c.id === b3.id)) chosenBooks.push(toBook(b3));

  // 극악 히든 이계 금서 (2% ~ 최대 5.5% 수준 유지)
  const grimoireChance = state.turn < 8 ? 0.015 : Math.min(0.055, 0.02 + state.fame * 0.00012 + (state.country === 'JAPAN' ? 0.008 : 0));
  let hasGrimoire = false;
  if (grimoires.length > 0 && Math.random() < grimoireChance) {
    const grim = pick(grimoires)!;
    chosenBooks.push(toBook(grim));
    hasGrimoire = true;
  }

  // 다회차 레거시 비급 (5~15% 확률)
  let hasLegacy = false;
  const legacies = loadLegacyRecords().filter((l) => l.signatureSkill);
  if (legacies.length > 0 && Math.random() < 0.15) {
    const leg = pick(legacies)!;
    chosenBooks.push({
      id: `legacy_bk_${leg.id}`,
      title: `『[전생비급] ${leg.sectName} 전서』`,
      rarity: 'LEGACY',
      price: Math.round(320 * discount),
      decodeApRequired: 1,
      decodeProgress: 0,
      decoded: false,
      skillTemplateId: leg.signatureSkill!.id,
      isLegacy: true,
      legacySkill: leg.signatureSkill,
    });
    hasLegacy = true;
  }

  // 무기 2종
  const ownedW = new Set(state.weapons.map((w) => w.id));
  const weaponPool = ALL_WEAPONS_CATALOG.filter(
    (w) => !ownedW.has(w.id) && w.grade !== 'CRUDE' && (w.grade !== 'ARCANE' || hasGrimoire || state.skills.some((s) => s.origin.includes('FANTASY')))
  );
  const chosenWeapons: Weapon[] = [];
  for (let i = 0; i < 2; i++) {
    const wp = pick(weaponPool.filter((w) => !chosenWeapons.some((c) => c.id === w.id)));
    if (wp) chosenWeapons.push({ ...wp, price: Math.round(wp.price * discount) });
  }

  let greeting =
    '“비가 꽤 오는군. 잠깐 처마 밑에서 쉬다 가도 되겠소? 바다 건너 굴러온 진귀한 책과 물건 몇 점을 가져왔지.”';
  if (hasGrimoire) {
    greeting =
      '“……원래 아무에게나 안 꺼내는 물건인데, 자네 눈빛이 요즘 달라졌더군. 지도에도 없는 먼 바다 난파선에서 건진 기이한 책이 하나 있소. 환불은 없소만, 구경해 보겠소?”';
  } else if (hasLegacy) {
    greeting =
      '“허허, 아주 먼 시대 어느 무명 도장의 대종사가 남겼다는 빛바랜 비급을 구해 왔네. 묘하게 자네와 인연이 닿는 것 같구려.”';
  } else if (state.age >= 55 && state.flags.hasMetMerchant) {
    greeting =
      '“어느새 자네 머리가 하얗게 셌구려. 나는 사십 년 전과 얼굴이 똑같다고? 하하, 먼 길을 오래 걷다 보면 세월이 가끔 나를 잊어먹곤 한다오.”';
  }

  return {
    books: chosenBooks,
    weapons: chosenWeapons,
    greeting,
    hasGrimoire,
    hasLegacy,
  };
}

// 제자 전수 (열화/변이 포함)
export function teachSkillToDisciple(state: GameState, discipleId: string, skillId: string): GameState {
  const dIdx = state.disciples.findIndex((d) => d.id === discipleId);
  const masterSkill = state.skills.find((s) => s.id === skillId);
  if (dIdx === -1 || !masterSkill) return state;

  const d = state.disciples[dIdx];
  if (d.skills.some((s) => s.id === masterSkill.id || s.parents?.[0] === masterSkill.id)) {
    return addLog(state, `${d.name}은(는) 이미 해당 계통의 초식을 익히고 있다.`, 'NORMAL');
  }

  // 열화 판정 (마법/고급 오의인데 제자 QI/INS 부족)
  const isAdvanced = masterSkill.origin.includes('FANTASY') || masterSkill.masteryLevel >= 6;
  const reqQi = masterSkill.origin.includes('FANTASY') ? 32 : 20;
  const isDegraded = isAdvanced && !d.isGenius && d.stats.qi < reqQi && d.childTalent !== 'PRODIGY';

  let transferred: Skill;
  let logText = '';
  let logType: LogEntry['type'] = 'GOOD';

  if (isDegraded) {
    transferred = {
      ...masterSkill,
      id: `deg_${masterSkill.id}_${d.id.slice(-3)}`,
      name: `${masterSkill.name.replace(/\(.*?\)/g, '')} (열화)`,
      customName: undefined,
      element: 'PHYSICAL',
      origin: ['EASTERN'],
      power: Math.max(18, Math.round(masterSkill.power * 0.65)),
      isDegraded: true,
      masteryLevel: 1,
      masteryExp: 0,
      imprintedTraits: [],
      parents: [masterSkill.id, d.name],
    };
    logText = `${d.name}에게 「${masterSkill.customName || masterSkill.name}」을 전수했으나, 영력 부족으로 「${transferred.name}」으로 열화되어 계승되었다.`;
    logType = 'WARN';
  } else {
    // 극의에 이른 초식은 원리까지 꿰뚫고 있어 훨씬 깊이 가르칠 수 있다 (Lv.6 · 각인 2개까지).
    const isTranscended = masterSkill.masteryLevel >= 10;
    transferred = {
      ...masterSkill,
      masteryLevel: isTranscended ? 6 : Math.max(1, Math.floor(masterSkill.masteryLevel * 0.4)),
      masteryExp: 0,
      imprintedTraits: masterSkill.imprintedTraits.filter((t) => t.tier < 10).slice(0, isTranscended ? 2 : 1),
      pendingTraitTier: undefined,
    };
    logText = isTranscended
      ? `${d.name}에게 극의에 이른 「${masterSkill.customName || masterSkill.name}」의 요체를 전수했다! (Lv.6 계승)`
      : `${d.name}에게 「${masterSkill.customName || masterSkill.name}」을 온전히 전수했다!`;
  }

  const nextDisciples = [...state.disciples];
  nextDisciples[dIdx] = {
    ...d,
    loyalty: Math.min(100, d.loyalty + 8),
    skills: [...d.skills, transferred],
  };

  return addLog({ ...state, disciples: nextDisciples }, logText, logType);
}

// 다음 계절로 진행 (핵심 턴 정산!)
export function advanceSeason(state: GameState, triggerEvent = true): GameState {
  if (state.phase !== 'MAIN') return state;

  const nextSeason = SEASON_META[state.season].next;
  const isNewYear = state.season === 'WINTER';
  const nextYear = isNewYear ? state.year + 1 : state.year;
  const nextAge = isNewYear ? state.age + 1 : state.age;
  const nextTurn = state.turn + 1;

  let next: GameState = {
    ...state,
    year: nextYear,
    season: nextSeason,
    turn: nextTurn,
    age: nextAge,
    merchantOffer: null,
  };

  // 1. 경제 정산 (난이도별 수입↓ · 지출↑ · 이자율↑ 반영!)
  const diffCfg = getDifficultyConfig(next);
  const aliveDisciples = next.disciples.filter((d) => !d.dead);
  const fameMult = 1 + Math.min(1.65, Math.sqrt(Math.max(0, next.fame)) * 0.062);
  const stolenPenalty = next.signboardStolen ? 0.4 : 1.0;
  const countryMoneyBonus = next.country === 'CHINA' ? 1.12 : 1.0;
  const spouseCommerce = next.spouse?.alive && next.spouse.bonusType === 'COMMERCE' ? 1.2 : 1.0;

  // 대규모 도장 합동 수련 체감: 1~8명 100%, 9~16명 75%, 17명+ 55%
  const rawTuitionSum = aliveDisciples.reduce((acc, d, idx) => {
    const scaleFactor = idx < 8 ? 1.0 : idx < 16 ? 0.75 : 0.55;
    return acc + d.tuition * fameMult * scaleFactor;
  }, 0);
  const tuitionIncome = Math.round(rawTuitionSum * stolenPenalty * countryMoneyBonus * spouseCommerce * diffCfg.incomeMult);
  const escortIncome = Math.round(
    aliveDisciples.filter((d) => d.role === 'ESCORT').length *
      (18 + Math.min(28, Math.sqrt(Math.max(0, next.fame)) * 1.1)) *
      spouseCommerce *
      diffCfg.incomeMult
  );
  const royalBonus = next.flags.royalAlliance ? Math.round(75 * diffCfg.incomeMult) : 0;
  const grossIncome = tuitionIncome + escortIncome + royalBonus;

  // 시설 단계별 누진 유지비 (Lv.1 무료 / Lv.2 12 / Lv.3 30 / Lv.4 대형시설 62) × 난이도 지출 배수
  const facUpkeepTable = [0, 0, 12, 30, 62];
  const facilityUpkeep =
    (facUpkeepTable[next.facilities.yard] || 0) +
    (facUpkeepTable[next.facilities.dorm] || 0) +
    (facUpkeepTable[next.facilities.library] || 0) +
    (facUpkeepTable[next.facilities.forge] || 0) +
    (facUpkeepTable[next.facilities.clinic] || 0) +
    (facUpkeepTable[next.facilities.sanctum] || 0);

  // 문하생 숙식·무구 수선비 (1~10명 7냥/인, 11명 초과 10냥/인) + 사범 급여 16냥/인
  const baseDiscCount = Math.min(10, aliveDisciples.length);
  const extraDiscCount = Math.max(0, aliveDisciples.length - 10);
  const instructorCountUpkeep = aliveDisciples.filter((d) => d.role === 'INSTRUCTOR').length;
  const upkeep = Math.round(
    (facilityUpkeep + baseDiscCount * 7 + extraDiscCount * 10 + instructorCountUpkeep * 16) *
      (next.facilities.dorm >= 4 ? 0.88 : 1.0) *
      diffCfg.expenseMult
  );

  // 관아 호세·문파세 (초반 비과세 · 중후반 대도장 누진 과세 — 조정 후원 시 35% 감면)
  const taxableIncome = Math.max(0, grossIncome - 160);
  const baseTaxRate = next.fame >= 1200 ? 0.18 : next.fame >= 500 ? 0.12 : next.fame >= 180 ? 0.06 : 0;
  const taxRelief = next.flags.royalAlliance ? 0.65 : 1.0;
  const seasonalTax = Math.round(taxableIncome * baseTaxRate * taxRelief * diffCfg.expenseMult);

  // 연말(겨울→봄) 거대 문파 보유 자산 공양·관아 헌납 (보유금 4,500냥 초과분의 10% → 무한 적체 방지)
  const wealthContribution = isNewYear && next.money > 4500 ? Math.round((next.money - 4500) * 0.1) : 0;

  const netIncome = grossIncome - upkeep - seasonalTax - wealthContribution;
  next.money += netIncome;

  if (seasonalTax + wealthContribution >= 35) {
    const cur = COUNTRIES[next.country].currency;
    next = addLog(
      next,
      `계절 정산: 수입 +${grossIncome} · 유지비 -${upkeep} · 관아세금/문파헌납 -${seasonalTax + wealthContribution}${cur}`,
      'NORMAL'
    );
  }

  if (next.money < 0) {
    next.debt += Math.abs(next.money);
    next.money = 0;
  }
  if (next.debt > 0) {
    next.debtTurns += 1;
    if (isNewYear) {
      next.debt = Math.round(next.debt * (1 + diffCfg.debtInterestRate));
    }
  } else {
    next.debtTurns = 0;
  }

  // ★ [어려움 / 지옥] 호위(ESCORT) 파견 문하생의 산적 습격 부상/전사 판정! ★
  if (diffCfg.escortPassiveDeathRate > 0) {
    const escortTargets = next.disciples.filter((d) => !d.dead && d.role === 'ESCORT');
    for (const ed of escortTargets) {
      const powerGuard = Math.min(0.45, (ed.stats.str + ed.stats.vit) * 0.004);
      const deathProb = diffCfg.escortPassiveDeathRate * (1 - powerGuard);
      const injuryProb = deathProb * 1.6;
      const roll = Math.random();
      if (roll < deathProb) {
        next.disciples = next.disciples.map((d) =>
          d.id === ed.id ? { ...d, dead: true, leftReason: '호위 파견 중 산적 습격으로 전사' } : d
        );
        next = addLog(next, `☠ 비보! 호위 파견 중이던 문하생 ${ed.name}이(가) 산적 떼의 습격을 막다 끝내 전사했다…`, 'DANGER');
      } else if (roll < deathProb + injuryProb) {
        next.disciples = next.disciples.map((d) =>
          d.id === ed.id
            ? { ...d, loyalty: Math.max(20, d.loyalty - 6), stats: { ...d.stats, vit: Math.max(10, d.stats.vit - 2) } }
            : d
        );
        next = addLog(next, `⚠ 호위 파견 중이던 문하생 ${ed.name}이(가) 마적과 교전하다 큰 부상을 입고 돌아왔다. (체력 -2)`, 'WARN');
      }
    }
  }

  // 2. 노화 스탯 커브 및 건강/수명 정산
  const nextStats = { ...next.stats };
  let healthDelta = 0;

  if (isNewYear) {
    if (nextAge < 20) {
      nextStats.str += 2;
      nextStats.agi += 2;
      nextStats.vit += 2;
    } else if (nextAge >= 35 && nextAge < 50) {
      nextStats.str = Math.max(15, nextStats.str - 1);
      nextStats.ins += 2;
      nextStats.wil += 1;
      healthDelta -= 1;
    } else if (nextAge >= 50 && nextAge < 65) {
      nextStats.str = Math.max(15, nextStats.str - 2);
      nextStats.agi = Math.max(15, nextStats.agi - 2);
      nextStats.ins += 3;
      nextStats.wil += 2;
      nextStats.qi += 2;
      healthDelta -= 3;
    } else if (nextAge >= 65) {
      nextStats.str = Math.max(15, nextStats.str - 2);
      nextStats.agi = Math.max(15, nextStats.agi - 2);
      nextStats.vit = Math.max(15, nextStats.vit - 2);
      nextStats.ins += 2;
      nextStats.wil += 2;
      healthDelta -= nextAge >= 78 ? 10 : 6;
    }
    // 라이벌 & 배우자 & 제자 전원 동반 노화 (+1세!)
    next.rival = { ...next.rival, age: next.rival.age + 1 };
    if (next.spouse && next.spouse.alive) {
      next.spouse = { ...next.spouse, age: next.spouse.age + 1 };
    }
    next.disciples = next.disciples.map((d) => (d.dead ? d : { ...d, age: d.age + 1 }));
  }

  // 양생 심법 / 약방 / 배우자 노화 방어 + 운기 심법 각인 건강 자연 회복!
  const hasLongevity = next.equippedPassiveIds.includes('sk_kr_08');
  const passiveHealthBonus = next.equippedPassiveIds.reduce((sum, pid) => {
    const ps = next.skills.find((s) => s.id === pid);
    return sum + (ps ? ps.imprintedTraits.reduce((a, t) => a + (t.effect.passiveHealthRegen || 0), 0) : 0);
  }, 0);
  healthDelta += passiveHealthBonus;
  if (healthDelta < 0) {
    healthDelta = Math.round(healthDelta * diffCfg.agingWearMult);
    if (hasLongevity) healthDelta = Math.round(healthDelta * 0.65);
    if (next.facilities.clinic >= 4) healthDelta = Math.round(healthDelta * 0.7);
    if (next.spouse?.alive && next.spouse.bonusType === 'CLINIC') healthDelta = Math.round(healthDelta * 0.8);
  }

  // 상태이상 처리
  next.statuses = next.statuses
    .map((st) => {
      if (st.id === 'PLAGUE') healthDelta -= 10;
      return { ...st, turnsRemaining: st.turnsRemaining - 1 };
    })
    .filter((st) => st.turnsRemaining > 0);

  // 수명 패널티 및 노화 최대 건강 상한 체크 (아무리 쉬어도 천수는 유한함!)
  const maxHealthCap = getMaxHealthByAge(nextAge, next.maxLifespanPenalty, hasLongevity, next.facilities.clinic);
  if (nextSeason === 'WINTER' && nextAge >= 65 - next.maxLifespanPenalty) {
    healthDelta -= 4 + Math.floor((nextAge - 62) * 0.7);
  }

  next.health = Math.max(0, Math.min(maxHealthCap, next.health + healthDelta));
  next.stats = clampStatsByAge(nextStats, nextAge);

  // 사망 판정 (천수/병사)
  if (next.health <= 0) {
    next.phase = 'ENDING';
    next.deathCause = nextAge >= 62 ? '천수(자연사)' : '병사(과로·역병)';
    return addLog(next, `${nextYear}년 ${SEASON_META[nextSeason].label}, 향년 ${nextAge}세로 영면에 들었다.`, 'DANGER');
  }

  // 3. AP 회복 (중상·황혼기 체크)
  const hasHeavy = next.statuses.some((s) => s.id === 'HEAVY_INJURY');
  next.maxAp = hasHeavy || (nextAge >= 75 && next.health < 35) ? 1 : 2;
  next.ap = next.maxAp;

  // 4. 문하생 자율 연마 & 천재 변이(청출어람) 발현
  const instructorCount = aliveDisciples.filter((d) => d.role === 'INSTRUCTOR').length;
  const discipleExp = 24 + instructorCount * 8 + (next.facilities.yard - 1) * 6;
  const mutationLogs: string[] = [];

  next.disciples = next.disciples.map((d) => {
    if (d.dead) return d;
    // 성실한 제자는 더 빨리, 나태한 제자는 더디게 는다.
    let updatedSkills = d.skills.map((s) => gainSkillExp(s, Math.round(discipleExp * (d.isGenius ? 1.45 : 1.0) * getTrainingMult(d))).updated);

    // 청출어람 변이 체크 (천재 제자 + Lv.5 이상 보유 + 아직 변이 없음)
    if (d.isGenius && !updatedSkills.some((s) => s.isMutated) && Math.random() < 0.12) {
      const candidate = updatedSkills.find((s) => s.masteryLevel >= 5 && s.element !== d.talentElement);
      if (candidate && d.talentElement && d.talentElement !== 'PHYSICAL') {
        const prefix = d.talentElement === 'ICE' ? '설화' : d.talentElement === 'FIRE' ? '홍염' : d.talentElement === 'LIGHTNING' ? '벽력' : '질풍';
        const mutated: Skill = {
          ...candidate,
          id: `mut_${candidate.id}_${d.id.slice(-3)}`,
          name: `${prefix}${candidate.name.slice(-3).replace(/\(.*?\)/g, '')}`,
          creator: d.name,
          element: d.talentElement,
          isMutated: true,
          power: Math.round(candidate.power * 1.18),
          parents: [candidate.id, d.name],
        };
        updatedSkills = [...updatedSkills, mutated];
        mutationLogs.push(`★ 청출어람! 제자 ${d.name}이(가) 스승의 초식을 변이시켜 「${mutated.name}」을(를) 독자 창안했다!`);
      }
    }

    // 나이는 위(2. 노화 정산)에서 이미 한 살 먹였다. 여기서 또 올리면 제자만 한 해에 두 살씩 늙는다.
    return {
      ...d,
      skills: updatedSkills,
    };
  });

  mutationLogs.forEach((m) => {
    next = addLog(next, m, 'MAGIC');
  });

  // 4.5 문하생 기질에 따른 충성 정산 · 흑심의 진척 · 타 문파와의 관계 표류
  next = settleDisciplesAndSects(next, isNewYear);

  // 5. 봄/명성 기반 자연 입문 지원자 (정원 여유 시)
  const maxD = getMaxDisciples(next.facilities);
  if (
    next.turn >= 4 &&
    aliveDisciples.length < maxD &&
    Math.random() < (nextSeason === 'SPRING' ? 0.45 : 0.22) + next.fame * 0.001
  ) {
    const newcomer = createDiscipleEntity(next);
    next.disciples = [...next.disciples, newcomer];
    next = addLog(next, `새 문하생 ${newcomer.name}(${newcomer.archetype}${newcomer.isGenius ? '·★천재' : ''})이(가) 도장에 입문했다.`, 'GOOD');
  }

  // 6. 세평 기반 문파 이명 자동 갱신
  const titleEval = computeSectTitle(next.reputation, next.fame);
  if (titleEval.title !== next.currentTitle) {
    next.currentTitle = titleEval.title;
    next = addLog(next, `세간의 평판이 변했다! 이제 사람들은 우리 도장을 「${titleEval.title}」이라 부른다. ${titleEval.rumor}`, 'RUMOR');
  }

  // 7. 계절 로그
  next = addLog(
    next,
    `${nextYear}년 ${SEASON_META[nextSeason].label} (${nextAge}세). 수지 ${netIncome >= 0 ? '+' : ''}${netIncome}${COUNTRIES[next.country].currency}. ${SEASON_META[nextSeason].flavor}`,
    'NORMAL'
  );

  // 8. 비밀 상인 만물객 출현 (4턴 첫 방문 보장 + 이후 매 계절 28% 확률)
  if (next.turn === 4 || (next.turn > 4 && Math.random() < 0.28)) {
    next.merchantOffer = generateMerchantOffer(next);
    next.flags = { ...next.flags, hasMetMerchant: true, merchantVisits: next.flags.merchantVisits + 1 };
    next = addLog(next, '비 오는 처마 밑으로 비밀 상인 「만물객」이 찾아왔다!', next.merchantOffer.hasGrimoire ? 'MAGIC' : 'GOOD');
  }

  // 9. 계절 스토리/역사/도장깨기 이벤트 발생 (PM2 실시간 타임라인 모드에서는 계절 진행 도중 별도 호출!)
  if (triggerEvent) {
    const ev = pickDueHomeEcho(next) || pickSeasonEventMixed(next);
    if (ev) {
      next.activeEvent = ev;
    }
  }

  return next;
}

// PM2 타임라인 진행 도중 주요 스토리·도장깨기·인연 이벤트 추출!
export function rollMidSeasonEvent(state: GameState): ActiveEvent | null {
  // 무사수행에서 남긴 메아리가 때가 되었으면 그것이 먼저 도장 대문을 두드린다.
  return pickDueHomeEcho(state) || pickSeasonEventMixed(state);
}

// 정해진 이야기(라이벌·가족·역사·대회 등)는 그대로 두고, 우연에 맡기던 자리에는 생성형 사건을 섞는다.
// 고정된 일회성 사건이 바닥나도 계절마다 다른 사람·다른 사연이 찾아온다.
const RANDOM_POOL_PREFIX = ['random_', 'life_', 'duel_british', 'duel_mongol', 'duel_henri'];
function pickSeasonEventMixed(state: GameState): ActiveEvent | null {
  const fixed = pickSeasonalEvent(state);
  const replaceable = !fixed || RANDOM_POOL_PREFIX.some((p) => fixed.id.startsWith(p));
  if (!replaceable) return fixed;
  const gen = pickHomeEvent(state);
  if (!gen) return fixed;
  if (!fixed) return Math.random() < 0.45 ? gen : null;
  // 이미 본 고정 사건의 되풀이(도장깨기·새벽 깨달음 등)보다는 새 사연을 더 자주
  const stale = fixed.id.startsWith('random_') || (state.flags.recentEventBases || []).some((b) => fixed.id.startsWith(b));
  return Math.random() < (stale ? 0.7 : 0.45) ? gen : fixed;
}

// 이벤트 선택지 처리기
export function resolveEventOption(state: GameState, event: ActiveEvent, optionId: string): GameState {
  const triggered = Array.from(new Set([...state.flags.triggeredEvents, event.id]));
  // 최근 6턴 발동 이벤트 계열 기록 → 같은 반복 이벤트 도배 원천 차단!
  const baseKey = event.id
    .replace(/_\d+$/, '')
    .replace(/^disciple_graduate_.*/, 'disciple_graduate')
    .replace(/^grad_revisit_.*/, 'grad_revisit')
    .replace(/^disciple_illness_.*/, 'disciple_illness')
    .replace(/^disciple_passing_.*/, 'disciple_passing')
    .replace(/^hero_fever_.*/, 'hero_fever');
  const prevRecent = state.flags.recentEventBases || [];
  const coolLimit = getDifficultyId(state) === 'HELL' ? 2 : getDifficultyId(state) === 'HARD' ? 3 : 6;
  const nextRecent = [baseKey, ...prevRecent.filter((k) => k !== baseKey)].slice(0, coolLimit);

  let next: GameState = {
    ...state,
    activeEvent: null,
    flags: { ...state.flags, triggeredEvents: triggered, recentEventBases: nextRecent },
  };
  const cMeta = COUNTRIES[state.country];
  const diffCfg = getDifficultyConfig(state);
  const diffId = getDifficultyId(state);
  // 제곱근 완만 성장 곡선 + 난이도별 명확한 전투 강도 격차!
  const baseScale = Math.min(3.15, 0.72 + Math.sqrt(Math.max(1, state.turn)) * 0.165 + Math.sqrt(Math.max(0, state.fame)) * 0.028);
  const scale = Math.min(4.2, baseScale * diffCfg.enemyScaleMult);

  // 무사수행 길 위의 사건과, 그 메아리가 도장으로 돌아온 사건
  if (isJourneyEvent(event)) return resolveJourneyEvent(next, event, optionId);

  // 타 문파 사건 · 문하생 말썽 · 반란, 그리고 기존 이벤트에 끼어드는 문파의 선택지는 따로 처리한다.
  const sectHandled = resolveSectEvent(next, event, optionId, scale);
  if (sectHandled) return sectHandled;

  switch (optionId) {
    // ★ [어려움 / 지옥] 신규 자연재해 · 진검 암습 · 진검 도장깨기 처리! ★
    case 'disaster_pay': {
      const repairCost = Number(event.meta?.repairCost || 150);
      next.money = Math.max(0, next.money - repairCost);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 16 };
      return addLog(next, `사재 ${repairCost}${cMeta.currency}을(를) 털어 천재지변 피해를 신속히 수습하고 식솔들을 지켰다! (인덕 +16)`, 'GOOD');
    }
    case 'disaster_endure': {
      const hLoss = diffId === 'HELL' ? 28 : 18;
      next.health = Math.max(0, next.health - hLoss);
      next.statuses = [...next.statuses, { id: 'LIGHT_INJURY', label: '재해 후유증', turnsRemaining: 2 }];
      // 시설 손상 또는 문하생 부상/전사 위험!
      const aliveD = next.disciples.filter((d) => !d.dead && !d.isChild);
      if (aliveD.length > 0 && Math.random() < (diffId === 'HELL' ? 0.45 : 0.25)) {
        const vic = aliveD[Math.floor(Math.random() * aliveD.length)];
        if (Math.random() < (diffId === 'HELL' ? 0.55 : 0.35)) {
          next.disciples = next.disciples.map((d) => (d.id === vic.id ? { ...d, dead: true, leftReason: '천재지변으로 희생' } : d));
          next = addLog(next, `☠ 비극! 천재지변 속에서 문하생 ${vic.name}이(가) 무너진 담장에 깔려 끝내 숨졌다…`, 'DANGER');
        } else {
          next.disciples = next.disciples.map((d) =>
            d.id === vic.id ? { ...d, loyalty: Math.max(15, d.loyalty - 12), stats: { ...d.stats, vit: Math.max(10, d.stats.vit - 2) } } : d
          );
          next = addLog(next, `⚠ 재해 수습 도중 문하생 ${vic.name}이(가) 큰 부상을 입었다.`, 'WARN');
        }
      }
      if (next.health <= 0) {
        next.phase = 'ENDING';
        next.deathCause = '천재지변(재난·기근)';
        return addLog(next, '거센 천재지변과 기근을 견디지 못하고 끝내 쓰러졌다…', 'DANGER');
      }
      return addLog(next, `천재지변을 맨몸으로 버텨 냈으나 심신이 크게 상했다. (건강 -${hLoss})`, 'DANGER');
    }
    case 'real_ambush_fight': {
      next.pendingBattle = createBattleConfig(
        `b_ambush_${state.turn}`, '살수단 두목 — 진검 야습', '⚠ 패배 시 사망/영구장애', true,
        '피의 살수 두목', '암살단 두목', 34, 'RUSHDOWN', Math.max(1.1, scale * 1.04), 'BLADE',
        ['sk_jp_03', 'sk_jp_06', 'sk_cn_07'],
        {
          rewardMoney: Math.round(75 + scale * 32),
          rewardFame: 55,
          ...(event.meta?.sectId ? { eventFollowupId: `sect_duel|${event.meta.sectId}` } : {}),
        }
      );
      next.phase = 'BATTLE';
      return next;
    }
    case 'real_ambush_sacrifice': {
      const aliveD = next.disciples.filter((d) => !d.dead && !d.isChild);
      next.fame = Math.max(0, next.fame - 15);
      if (aliveD.length > 0) {
        const vic = aliveD[Math.floor(Math.random() * aliveD.length)];
        if (Math.random() < (diffId === 'HELL' ? 0.65 : 0.42)) {
          next.disciples = next.disciples.map((d) => (d.id === vic.id ? { ...d, dead: true, leftReason: '살수단 야습을 막다 전사' } : d));
          return addLog(next, `☠ 문하생들과 포위해 살수단을 몰아냈으나, 앞장섰던 ${vic.name}이(가) 진검에 베여 끝내 전사했다…`, 'DANGER');
        }
        next.disciples = next.disciples.map((d) =>
          d.id === vic.id ? { ...d, stats: { ...d.stats, vit: Math.max(10, d.stats.vit - 3) } } : d
        );
        return addLog(next, `살수단을 몰아냈으나 문하생 ${vic.name}이(가) 깊은 자상을 입었다. (제자 체력 -3)`, 'WARN');
      }
      return addLog(next, '간신히 살수단의 포위를 뚫고 물러났다. (명성 -15)', 'WARN');
    }
    case 'real_ambush_bribe': {
      const bribeCost = Number(event.meta?.bribeCost || 150);
      next.money = Math.max(0, next.money - bribeCost);
      next.fame = Math.max(0, next.fame - 22);
      next.authority = Math.max(0, next.authority - 10);
      return addLog(next, `살수단에게 ${bribeCost}${cMeta.currency}을(를) 건네고 목숨을 지켰다. 치욕스러우나 살아남았다. (명성 -22)`, 'WARN');
    }

    // ★ 문하생 독립(하산) & 독립 제자 재방문 & 질병/사망 & 신규 서사 이벤트 선택지 처리! ★
    case 'grad_let_go':
    case 'grad_gift_farewell':
    case 'grad_bless': {
      const dId = event.meta?.discipleId as string | undefined;
      const d = next.disciples.find((x) => x.id === dId);
      if (d) {
        const isGift = optionId === 'grad_gift_farewell';
        if (isGift) {
          next.money = Math.max(0, next.money - 40);
          next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 10 };
        } else if (optionId === 'grad_bless') {
          next.fame += 15;
          next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
        }
        const statSum = d.stats.str + d.stats.agi + d.stats.vit + d.stats.wil + d.stats.ins + d.stats.qi;
        const effLoyalty = d.loyalty + (isGift ? 25 : 0);
        const fate: 'GRANDMASTER' | 'SUCCESSFUL' | 'ORDINARY' | 'RIVAL_BETRAYER' =
          effLoyalty < 55
            ? 'RIVAL_BETRAYER'
            : statSum >= 185
            ? 'GRANDMASTER'
            : statSum >= 135
            ? 'SUCCESSFUL'
            : 'ORDINARY';
        const topSk = [...d.skills].sort((a, b) => b.masteryLevel - a.masteryLevel)[0];
        // 원한을 품고 떠난 제자는 사이가 나쁜 문파에 몸을 의탁한다.
        const refuge = fate === 'RIVAL_BETRAYER' ? worstSect(next, -15) : null;
        next.disciples = next.disciples.filter((x) => x.id !== d.id);
        next.graduatedDisciples = [
          ...(next.graduatedDisciples || []),
          {
            id: d.id,
            name: d.name,
            archetype: d.archetype,
            graduatedYear: next.year,
            graduatedAge: d.age,
            loyaltyAtExit: effLoyalty,
            powerScore: statSum,
            fate,
            topSkillName: topSk?.customName || topSk?.name || '횡베기',
            joinedSectName: refuge?.name,
          },
        ];
        return addLog(
          next,
          `문하생 ${d.name}(${d.age}세)이(가) 도장을 하산해 독립했다.${fate === 'RIVAL_BETRAYER' ? ' 서늘한 뒷모습에 불길한 예감이 스친다…' : ''}`,
          fate === 'RIVAL_BETRAYER' ? 'WARN' : 'GOOD'
        );
      }
      return next;
    }
    case 'grad_keep': {
      const dId = event.meta?.discipleId as string | undefined;
      next.disciples = next.disciples.map((d) =>
        d.id === dId ? { ...d, role: 'INSTRUCTOR', loyalty: Math.max(15, d.loyalty - 12) } : d
      );
      return addLog(next, '제자를 사범으로 붙잡아 두었다. (충성도 소폭 하락)', 'NORMAL');
    }

    case 'grad_betray_fight': {
      const gId = event.meta?.gradId as string | undefined;
      const gName = (event.meta?.gradName as string) || '배신한 옛 제자';
      const gPow = (event.meta?.gradPower as number) || 150;
      next.graduatedDisciples = (next.graduatedDisciples || []).map((g) => (g.id === gId ? { ...g, revisited: true } : g));
      next.pendingBattle = createBattleConfig(
        `b_betray_${next.turn}`,
        `배신한 옛 제자 — ${gName}`,
        '스승의 가르침을 등지고 적으로 돌아온 옛 문하생과의 대결',
        false,
        gName,
        '사파 배신자',
        32,
        'AGGRESSIVE',
        Math.max(1.15, Math.min(2.6, gPow / 95)),
        'BLADE',
        ['sig_cross_slash', 'sk_jp_02', 'sk_kr_06'],
        { rewardMoney: 80, rewardFame: 55 }
      );
      next.phase = 'BATTLE';
      return next;
    }
    case 'grad_betray_forgive': {
      const gId = event.meta?.gradId as string | undefined;
      next.graduatedDisciples = (next.graduatedDisciples || []).map((g) => (g.id === gId ? { ...g, revisited: true } : g));
      next.fame = Math.max(0, next.fame - 10);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 18, ascetic: next.reputation.ascetic + 10 };
      return addLog(next, '옛 제자의 원망을 묵묵히 품어 돌려보냈다. (인덕 +18, 구도 +10)', 'GOOD');
    }
    case 'grad_master_accept':
    case 'grad_master_spar': {
      const gId = event.meta?.gradId as string | undefined;
      const gName = (event.meta?.gradName as string) || '대성한 제자';
      next.graduatedDisciples = (next.graduatedDisciples || []).map((g) => (g.id === gId ? { ...g, revisited: true } : g));
      if (optionId === 'grad_master_accept') {
        next.money += 240;
        next.fame += 60;
        const giftB = ALL_BOOKS_CATALOG.find((b) => (b.rarity === 'RARE' || b.rarity === 'LEGEND') && !next.books.some((ob) => ob.id === b.id));
        if (giftB) next.books = [...next.books, { ...giftB, decodeProgress: 0, decoded: false }];
        return addLog(next, `대성한 옛 제자 ${gName}이(가) 거금 240${cMeta.currency}${giftB ? `과 『${giftB.title}』` : ''}을(를) 바쳤다!`, 'MAGIC');
      }
      next.stats = { ...next.stats, ins: next.stats.ins + 5 };
      next.money += 120;
      next.fame += 45;
      return addLog(next, `대성한 옛 제자 ${gName}과(와) 감격스러운 일합을 나누었다! (통찰 +5, 명성 +45)`, 'MAGIC');
    }
    case 'grad_success_money':
    case 'grad_success_recruit': {
      const gId = event.meta?.gradId as string | undefined;
      const gName = (event.meta?.gradName as string) || '출세한 제자';
      next.graduatedDisciples = (next.graduatedDisciples || []).map((g) => (g.id === gId ? { ...g, revisited: true } : g));
      if (optionId === 'grad_success_money') {
        next.money += 130;
        next.fame += 25;
        next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 6 };
        return addLog(next, `출세한 옛 제자 ${gName}이(가) 130${cMeta.currency}을(를) 도장에 기탁했다!`, 'GOOD');
      }
      next.money += 60;
      const recD = createDiscipleEntity(next, { archetype: `${gName}의 추천 인재`, isGenius: Math.random() < 0.45 });
      next.disciples = [...next.disciples, recD];
      return addLog(next, `옛 제자 ${gName}의 추천으로 유망주 ${recD.name}이(가) 입문했다! (+60${cMeta.currency})`, 'GOOD');
    }
    case 'grad_ordinary_warm':
    case 'grad_ordinary_tip': {
      const gId = event.meta?.gradId as string | undefined;
      next.graduatedDisciples = (next.graduatedDisciples || []).map((g) => (g.id === gId ? { ...g, revisited: true } : g));
      if (optionId === 'grad_ordinary_warm') {
        next.health = Math.min(100, next.health + 8);
        next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
        next.disciples = next.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 8) }));
        return addLog(next, '평범한 백성으로 살아가는 옛 제자를 따뜻하게 격려했다. 마음이 훈훈해진다. (건강 +8, 인덕 +15)', 'GOOD');
      }
      next.fame += 12;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 8 };
      return addLog(next, '옛 제자가 저잣거리에 도장 좋은 소문을 퍼뜨려 주기로 했다. (명성 +12)', 'NORMAL');
    }

    case 'fever_medicine': {
      const { cost, cureChance } = getFeverMedicineMeta(next);
      next.money = Math.max(0, next.money - cost);
      if (Math.random() < cureChance) {
        next.health = Math.min(100, next.health + 10);
        return addLog(next, `귀한 탕약(-${cost}${cMeta.currency})이 잘 들어 겨울 열병을 털어 냈다! (건강 +10)`, 'GOOD');
      }
      // 탕약 실패: 72% 차도 미미 / 28% 약성 충돌·고열 악화!
      if (Math.random() < 0.72) {
        next.health = Math.max(4, next.health - 10);
        next.statuses = [...next.statuses, { id: 'LIGHT_INJURY', label: '겨울 열병 후유증', turnsRemaining: 2 }];
        return addLog(next, `비싼 탕약(-${cost}${cMeta.currency})을 달여 마셨으나 열기가 쉽게 꺾이지 않았다… (건강 -10 · 후유증)`, 'WARN');
      }
      const severeLoss = diffId === 'HELL' ? 30 : diffId === 'HARD' ? 22 : 18;
      next.health = Math.max(0, next.health - severeLoss);
      next.statuses = [...next.statuses, { id: 'PLAGUE', label: '열병 악화', turnsRemaining: 2 }];
      if (next.health <= 0) {
        next.deathCause = '열병(탕약이 듣지 않음)';
        next.phase = 'ENDING';
        return addLog(next, `탕약이 되레 속열과 충돌해 고열이 치솟았다… 끝내 열병을 이기지 못하고 눈을 감았다.`, 'DANGER');
      }
      return addLog(next, `탕약이 되레 속열과 부딪쳐 고열이 악화되었다! (건강 -${severeLoss} · 열병 악화)`, 'DANGER');
    }
    case 'fever_endure': {
      const loss = next.age >= 55 ? 20 : 15;
      next.health = Math.max(0, next.health - loss);
      next.stats = { ...next.stats, qi: next.stats.qi + 3, wil: next.stats.wil + 2 };
      next.statuses = [...next.statuses, { id: 'LIGHT_INJURY', label: '겨울 열병 후유증', turnsRemaining: 2 }];
      if (next.health <= 0) {
        next.deathCause = '열병(치료 포기)';
        next.phase = 'ENDING';
        return addLog(next, '열병을 내공으로 버텨 내려다 끝내 기력이 다해 쓰러졌다…', 'DANGER');
      }
      return addLog(next, `열병을 내공으로 억눌렀으나 몸이 크게 축났다. (건강 -${loss}, 영력 +3)`, 'WARN');
    }

    case 'disc_ill_pay':
    case 'disc_ill_care':
    case 'disc_ill_leave': {
      const dId = event.meta?.discipleId as string | undefined;
      const dName = (event.meta?.discipleName as string) || '문하생';
      const illMeta = getDiscipleIllnessMeta(next);
      if (optionId === 'disc_ill_pay') {
        next.money = Math.max(0, next.money - illMeta.cost);
        if (Math.random() < illMeta.payCureChance) {
          next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 14 };
          next.disciples = next.disciples.map((d) => (d.id === dId ? { ...d, loyalty: 100 } : d));
          return addLog(next, `명의와 탕약(-${illMeta.cost}${cMeta.currency})으로 ${dName}을(를) 완치시켰다! 제자가 눈물을 흘리며 충성을 맹세했다.`, 'GOOD');
        }
        if (Math.random() < 0.6) {
          next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 10 };
          next.disciples = next.disciples.map((d) =>
            d.id === dId ? { ...d, loyalty: Math.min(100, d.loyalty + 15), stats: { ...d.stats, vit: Math.max(10, d.stats.vit - 2) } } : d
          );
          return addLog(next, `명의가 온갖 탕약(-${illMeta.cost}${cMeta.currency})을 썼으나 병세가 깊어 ${dName}은(는) 겨우 목숨만 건졌다… (제자 체력 -2)`, 'WARN');
        }
        next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
        next.disciples = next.disciples.map((d) => (d.id === dId ? { ...d, dead: true, leftReason: '탕약이 듣지 않아 병사' } : d));
        return addLog(next, `명의가 밤새 탕약(-${illMeta.cost}${cMeta.currency})을 달였으나 하늘의 뜻을 거스르지 못하고 ${dName}이(가) 끝내 눈을 감았다…`, 'DANGER');
      }
      if (optionId === 'disc_ill_care') {
        next.health = Math.max(8, next.health - 8);
        next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 10 };
        if (Math.random() < illMeta.careCureChance) {
          next.disciples = next.disciples.map((d) => (d.id === dId ? { ...d, loyalty: 100 } : d));
          return addLog(next, `밤새 내공으로 간호한 끝에 ${dName}이(가) 고비를 넘기고 살아났다! (건강 -8, 인덕 +10)`, 'GOOD');
        }
        next.disciples = next.disciples.map((d) => (d.id === dId ? { ...d, dead: true, leftReason: '중병으로 병사' } : d));
        return addLog(next, `필사적인 간호에도 불구하고 ${dName}이(가) 끝내 병마를 이기지 못하고 세상을 떠났다…`, 'DANGER');
      }
      if (Math.random() < 0.78) {
        next.disciples = next.disciples.map((d) =>
          d.id === dId ? { ...d, dead: true, leftReason: '치료받지 못하고 병사' } : d.dead ? d : { ...d, loyalty: Math.max(10, d.loyalty - 15) }
        );
        next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 8 };
        return addLog(next, `${dName}이(가) 끝내 병사했다… 남은 문하생들이 스승을 원망스러운 눈으로 바라본다.`, 'DANGER');
      }
      return addLog(next, `${dName}이(가) 천운으로 스스로 열병을 이겨 냈으나 마음의 앙금이 남았다.`, 'WARN');
    }

    case 'disc_pass_honor': {
      const dId = event.meta?.discipleId as string | undefined;
      const dName = (event.meta?.discipleName as string) || '원로 제자';
      next.disciples = next.disciples.map((d) => (d.id === dId ? { ...d, dead: true, leftReason: '노환 별세' } : d));
      next.stats = { ...next.stats, ins: next.stats.ins + 5, wil: next.stats.wil + 5 };
      next.fame += 30;
      return addLog(next, `평생을 함께한 원로 제자 ${dName}을(를) 정중히 배웅했다. (통찰 +5, 정신 +5, 명성 +30)`, 'GOOD');
    }

    case 'fest_demo_show':
      next.money += 65;
      next.fame += 22;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 8 };
      return addLog(next, `고을 축제 검무 시연이 대성황을 이뤘다! (+65${cMeta.currency}, 명성 +22)`, 'GOOD');
    case 'fest_demo_charity':
      next.fame += 28;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 16 };
      return addLog(next, '고을 백성들에게 무료로 호신술을 가르쳐 칭송이 자자하다. (명성 +28, 인덕 +16)', 'GOOD');

    case 'herb_buy': {
      const { cost, successChance } = getHerbPeddlerMeta(next);
      next.money = Math.max(0, next.money - cost);
      if (Math.random() < successChance) {
        next.health = Math.min(100, next.health + 18);
        next.stats = { ...next.stats, vit: next.stats.vit + 2, qi: next.stats.qi + 2 };
        return addLog(next, `귀한 산약초(-${cost}${cMeta.currency})를 달여 마셔 기력이 크게 돌았다! (건강 +18, 체력·영력 +2)`, 'GOOD');
      }
      next.health = Math.max(5, next.health - 6);
      return addLog(next, `산약초(-${cost}${cMeta.currency})가 불량 약재였는지 탕약이 탈이 나 하루 종일 복통에 시달렸다… (건강 -6)`, 'WARN');
    }
    case 'herb_tea':
      next.stats = { ...next.stats, ins: next.stats.ins + 2 };
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 4 };
      return addLog(next, '약초꾼과 담소를 나누며 약재와 경혈의 이치를 익혔다. (통찰 +2)', 'NORMAL');

    case 'assassin_fight':
      next.pendingBattle = createBattleConfig(
        `b_assassin_${next.turn}`,
        '달밤의 자객 제압전',
        '장서각 비급을 노리고 침입한 검은 복면 자객',
        false,
        '검은 복면 자객',
        '암영 자객',
        30,
        'RUSHDOWN',
        Math.max(1.0, scale * 0.92),
        'THROWN',
        ['sk_jp_07', 'sk_cn_07', 'base_h_slash'],
        { rewardMoney: 90, rewardFame: 35 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'assassin_scare':
      if (next.stats.ins + next.stats.qi >= 70) {
        next.fame += 25;
        return addLog(next, '압도적인 살기와 기백에 자객이 질려 담을 넘어 도주했다! (명성 +25)', 'GOOD');
      }
      next.money = Math.max(0, next.money - 45);
      return addLog(next, `기세가 밀린 사이 자객이 금고에서 45${cMeta.currency}을 훔쳐 달아났다!`, 'WARN');

    case 'quarrel_mediate':
      next.disciples = next.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 10) }));
      next.stats = { ...next.stats, ins: next.stats.ins + 2 };
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
      return addLog(next, '문하생들의 갈등을 지혜롭게 중재해 도장이 한층 화목해졌다. (전원 충성도 +10)', 'GOOD');
    case 'quarrel_spar': {
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 6 };
      next.disciples = next.disciples.map((d, idx) =>
        !d.dead && idx < 2 ? { ...d, stats: { ...d.stats, str: d.stats.str + 3, agi: d.stats.agi + 3 } } : d
      );
      return addLog(next, '공개 대련 끝에 두 문하생이 서로의 실력을 인정하며 크게 성장했다!', 'GOOD');
    }

    case 'tea_discuss': {
      next.stats = { ...next.stats, ins: next.stats.ins + 3, wil: next.stats.wil + 2 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 8 };
      if (next.skills.length > 0) {
        const res = gainSkillExp(next.skills[0], 55);
        const copy = [...next.skills];
        copy[0] = res.updated;
        next.skills = copy;
        if (res.triggeredTrait) next.pendingTraitSkillId = res.updated.id;
      }
      return addLog(next, '낯선 검객과 밤늦도록 검리를 논해 큰 깨달음을 얻었다! (통찰 +3, 정신 +2)', 'GOOD');
    }
    case 'tea_spar':
      next.pendingBattle = createBattleConfig(
        `spar_tea_${next.turn}`,
        '빗속 검객과의 친선 비무',
        '검리를 겨루는 즐거운 일합',
        false,
        '지나가던 중년 검객',
        '강호 유랑 검객',
        39,
        'DUELIST',
        Math.max(1.0, scale * 0.9),
        'BLADE',
        ['sk_jp_02', 'sk_kr_02', 'sk_cn_03'],
        { rewardMoney: 40, rewardFame: 28 }
      );
      next.phase = 'BATTLE';
      return next;

    case 'tourney_enter':
      // 256강 예선 네 판 → 본선 16강 실제 대진표 (다른 고수들의 경기도 실제로 승부가 갈린다)
      return startTourney(next, 'ENTER');
    case 'tourney_watch':
      // 객석에서 대진표 전체를 지켜본다 — 보고 싶은 경기는 직접 관전할 수 있다
      return startTourney(next, 'WATCH');

    case 'gm1_spar':
    case 'gm1_real': {
      const isReal = optionId === 'gm1_real';
      const gmName = (event.meta?.gmName as string) || '백운검선';
      const gmSect = (event.meta?.gmSect as string) || '명문 장문인';
      const rewardBook = ALL_BOOKS_CATALOG.find(
        (b) => (b.rarity === 'LEGEND' || b.rarity === 'RARE') && !next.books.some((ob) => ob.id === b.id)
      );
      const rewardWp = ALL_WEAPONS_CATALOG.find((w) => w.grade === 'TREASURE' && !next.weapons.some((ow) => ow.id === w.id));
      next.pendingBattle = createBattleConfig(
        'b_grandmaster_1',
        `절정 고수 결투 — ${gmName}`,
        isReal ? `${gmSect}과의 생사를 건 진검결투!` : `${gmSect}과의 절정 검리 비무`,
        isReal,
        gmName,
        gmSect,
        54,
        'DUELIST',
        Math.max(1.25, scale * 0.96),
        'BLADE',
        ['sk_jp_01', 'sk_kr_06', 'sk_cn_03'],
        {
          rewardMoney: isReal ? 180 : 120,
          rewardFame: isReal ? 120 : 65,
          rewardBookId: !isReal ? rewardBook?.id : undefined,
          rewardWeaponId: isReal ? rewardWp?.id : undefined,
          eventFollowupId: isReal ? 'gm_win_real' : 'gm_win_spar',
        }
      );
      next.phase = 'BATTLE';
      return next;
    }
    case 'gm1_tea':
      next.stats = { ...next.stats, ins: next.stats.ins + 3 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 12 };
      return addLog(next, '절정 고수와 차를 나누며 검리를 논했다. (통찰 +3)', 'GOOD');

    case 'gm2_spar':
    case 'gm2_real': {
      const isReal = optionId === 'gm2_real';
      const gmName = (event.meta?.gmName as string) || '무상대사';
      const gmSect = (event.meta?.gmSect as string) || '당대 절정';
      const rewardWp = ALL_WEAPONS_CATALOG.find((w) => w.grade === 'TREASURE' && !next.weapons.some((ow) => ow.id === w.id));
      next.pendingBattle = createBattleConfig(
        'b_grandmaster_2',
        `절정 고수 결투 — ${gmName}`,
        isReal ? `${gmSect}과의 진검 승부!` : `${gmSect}과의 정면 비무`,
        isReal,
        gmName,
        gmSect,
        58,
        'HEAVY',
        Math.max(1.45, scale * 1.02),
        'POLEARM',
        ['sk_cn_01', 'sk_kr_05', 'sk_cn_05'],
        {
          rewardMoney: isReal ? 260 : 200,
          rewardFame: isReal ? 160 : 95,
          rewardWeaponId: rewardWp?.id,
          eventFollowupId: isReal ? 'gm_win_real' : 'gm_win_spar',
        }
      );
      next.phase = 'BATTLE';
      return next;
    }
    case 'gm2_tea':
      next.fame = Math.max(0, next.fame - 10);
      next.stats = { ...next.stats, ins: next.stats.ins + 4 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 10 };
      return addLog(next, '당대 절정 고수에게 예를 다해 물러섰다. (통찰 +4)', 'NORMAL');

    case 'gm3_real':
    case 'gm3_spar': {
      const isReal = optionId === 'gm3_real';
      const rewardWp = ALL_WEAPONS_CATALOG.find((w) => (w.grade === 'TREASURE' || w.grade === 'ARCANE') && !next.weapons.some((ow) => ow.id === w.id));
      next.pendingBattle = createBattleConfig(
        'b_grandmaster_3',
        '최후의 절정 결전 — 검마 혈영',
        isReal ? '천하 최강의 검마와 생사를 건 일생일대의 결전!' : '검마 혈영과의 초고난도 비무',
        isReal,
        '검마 혈영',
        '천하무적 검마',
        49,
        'DUELIST',
        Math.max(1.65, scale * 1.08),
        'BLADE',
        ['sk_jp_06', 'sk_jp_03', 'sk_cn_06'],
        {
          rewardMoney: isReal ? 400 : 300,
          rewardFame: isReal ? 220 : 140,
          rewardWeaponId: rewardWp?.id,
          eventFollowupId: isReal ? 'gm_win_real' : 'gm_win_spar',
        }
      );
      next.phase = 'BATTLE';
      return next;
    }
    case 'gm3_refuse':
      next.fame = Math.max(0, next.fame - 25);
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 20, virtue: next.reputation.virtue + 15 };
      return addLog(next, '피를 부르는 검마의 도전을 거절하고 도장의 문하생들을 지켰다.', 'NORMAL');

    // 온보딩 (장기 기억 storyMemory 기록!)
    case 'fight_thug':
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, thug: 'FOUGHT' } };
      next.pendingBattle = createBattleConfig(
        'b_onboard_thug', '마당의 불청객', '첫 실전 비무', false,
        '장터 왈패 두목', '동네 건달', 26, 'AGGRESSIVE', 0.45, 'BLADE', ['base_h_slash', 'base_v_slash'],
        { isTutorial: true, rewardMoney: 25, rewardFame: 18 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'pay_thug':
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, thug: 'BRIBED' } };
      next.money = Math.max(0, next.money - 15);
      next.fame = Math.max(0, next.fame - 5);
      return addLog(next, '돈을 쥐여 왈패들을 돌려보냈다. 마음 한편이 쓰리다.', 'WARN');

    case 'accept_first':
    case 'accept_strict': {
      const firstD = createDiscipleEntity(next, { name: cMeta.discipleNames[0], archetype: '우직한 농부 아들', isGenius: false, temperament: 'UPRIGHT' });
      if (optionId === 'accept_strict') firstD.tuition = 14;
      next.disciples = [...next.disciples, firstD];
      next.flags = { ...next.flags, hasHadFirstDisciple: true };
      next.reputation = {
        ...next.reputation,
        virtue: next.reputation.virtue + (optionId === 'accept_first' ? 10 : 0),
        commerce: next.reputation.commerce + (optionId === 'accept_strict' ? 8 : 0),
      };
      // 최초 문하생이 입문 예물로 간단한 무술서 1권을 지참! (첫 신규 초식 습득 자연 유도)
      const starterBookId = next.country === 'CHINA' ? 'bk_cn_01' : next.country === 'JAPAN' ? 'bk_jp_02' : 'bk_kr_01';
      const starterCatalog = ALL_BOOKS_CATALOG.find((b) => b.id === starterBookId);
      let bookMsg = '';
      if (starterCatalog && !next.books.some((b) => b.id === starterCatalog.id)) {
        const easyBook: Book = { ...starterCatalog, decodeApRequired: 1, decodeProgress: 0, decoded: false };
        next.books = [...next.books, easyBook];
        next.seasonPlan = { ...next.seasonPlan, decodeBookId: next.seasonPlan.decodeBookId || easyBook.id };
        bookMsg = ` 입문 예물로 『${easyBook.title}』을(를) 바쳤다! ([독서]로 새 초식 습득 가능)`;
      }
      return addLog(next, `첫 문하생 ${firstD.name}이(가) 입문했다!${bookMsg}`, 'GOOD');
    }

    case 'gift_book_accept': {
      const d = createDiscipleEntity(next, { archetype: '몰락 무가의 후예', isGenius: Math.random() < 0.65 });
      d.loyalty = 88;
      next.disciples = [...next.disciples, d];
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
      const gBookId = event.meta?.giftBookId as string | undefined;
      const gBook = gBookId ? ALL_BOOKS_CATALOG.find((b) => b.id === gBookId) : undefined;
      if (gBook && !next.books.some((b) => b.id === gBook.id)) {
        next.books = [...next.books, { ...gBook, decodeProgress: 0, decoded: false }];
        next.seasonPlan = { ...next.seasonPlan, decodeBookId: next.seasonPlan.decodeBookId || gBook.id };
        return addLog(next, `${d.name}이(가) 가보 『${gBook.title}』을(를) 바치며 문하생으로 입문했다!`, 'MAGIC');
      }
      return addLog(next, `${d.name}이(가) 문하생으로 입문했다!`, 'GOOD');
    }

    case 'gift_book_return': {
      const d = createDiscipleEntity(next, { archetype: '몰락 무가의 후예', isGenius: true, temperament: 'UPRIGHT' });
      d.loyalty = 100;
      next.disciples = [...next.disciples, d];
      next.fame += 20;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 18 };
      return addLog(next, `비급을 돌려보낸 인덕에 감복한 천재 제자 ${d.name}이(가) 평생 충성을 맹세하며 입문했다!`, 'MAGIC');
    }

    case 'gift_weapon_accept': {
      const d = createDiscipleEntity(next, { archetype: '방랑 무사', isGenius: Math.random() < 0.55 });
      d.loyalty = 86;
      next.disciples = [...next.disciples, d];
      next.fame += 12;
      const gWId = event.meta?.giftWeaponId as string | undefined;
      const gW = gWId ? getWeaponById(gWId) : undefined;
      if (gW && !next.weapons.some((w) => w.id === gW.id)) {
        next.weapons = [...next.weapons, { ...gW }];
        return addLog(next, `방랑 무사 ${d.name}이(가) 명품 「${gW.name}」을(를) 바치며 문하생으로 입문했다!`, 'MAGIC');
      }
      return addLog(next, `방랑 무사 ${d.name}이(가) 문하생으로 입문했다!`, 'GOOD');
    }

    case 'gift_weapon_keep': {
      const d = createDiscipleEntity(next, { archetype: '방랑 무사', isGenius: true, temperament: 'UPRIGHT' });
      d.loyalty = 100;
      d.stats = { ...d.stats, str: d.stats.str + 6, agi: d.stats.agi + 6, ins: d.stats.ins + 4 };
      next.disciples = [...next.disciples, d];
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      return addLog(next, `명검을 되돌려준 스승의 도량에 감동한 정예 무사 ${d.name}이(가) 문하에 들어왔다!`, 'MAGIC');
    }

    case 'pay_all_debt':
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, debt: 'HONORED' } };
      next.money -= next.debt;
      next.debt = 0;
      next.debtTurns = 0;
      next.fame += 10;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
      return addLog(next, '선대가 남긴 빚을 깨끗이 청산했다! 마음이 홀가분하다.', 'GOOD');
    case 'delay_debt':
      return addLog(next, '빚 상환을 미뤘다. 이자가 쌓이기 전에 갚아야 한다.', 'WARN');

    case 'debt_enforcer':
      next.debt = 0;
      next.debtTurns = 0;
      next.fame = Math.max(0, next.fame - 15);
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 20 };
      return addLog(next, '전당포 해결사 노릇으로 빚을 탕감했다. 저잣거리의 시선이 싸늘하다.', 'WARN');
    case 'debt_duel':
      next.pendingBattle = createBattleConfig(
        'b_debt_duel', '빚 청산 진검결투', '패배 시 사망 위험', true,
        '전당포 두목', '무자비한 사채업자', 40, 'HEAVY', Math.max(1.2, scale), 'BLADE', ['base_v_slash', 'sk_kr_06'],
        { rewardMoney: 40, rewardFame: 25, eventFollowupId: 'clear_debt_win' }
      );
      next.phase = 'BATTLE';
      return next;

    // 판타지 충격파
    case 'fan_declare_immortal':
      next.reputation = { ...next.reputation, arcane: next.reputation.arcane + 35 };
      next.fame += 55;
      return addLog(next, '당신의 선언 이후 전국에서 구도자들이 몰려들기 시작했다!', 'MAGIC');
    case 'fan_hide_trick':
      next.reputation = { ...next.reputation, arcane: next.reputation.arcane + 12 };
      return addLog(next, '화약 눈속임이라 얼버무려 소란을 잠시 가라앉혔다.', 'NORMAL');

    case 'fan_overwhelm':
      next.fame += 90;
      next.reputation = { ...next.reputation, arcane: next.reputation.arcane + 40 };
      next.flags = { ...next.flags, royalAlliance: true };
      return addLog(next, '하늘을 가르는 영기에 토벌대 전원이 무릎을 꿇고 물러났다! 조정마저 당신의 도장을 함부로 건드리지 못한다.', 'MAGIC');
    case 'fan_fight_army':
      next.pendingBattle = createBattleConfig(
        'b_inquisition', '요괴 도장 토벌전', '관군 토벌대장과의 진검결투', true,
        '관군 토벌대장', '퇴마사·관군 지휘관', 44, 'RANGED', Math.max(1.8, scale + 0.2), 'POLEARM', ['sk_jp_08', 'sk_kr_05', 'sk_kr_06'],
        { rewardMoney: 150, rewardFame: 85 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'fan_bribe_court':
      next.money -= 260;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 20 };
      return addLog(next, '막대한 은자를 바쳐 토벌전을 호국 비술 시연으로 무마했다.', 'NORMAL');

    case 'fan_send_letter':
      next.reputation = { ...next.reputation, arcane: next.reputation.arcane + 20 };
      next.flags = { ...next.flags, westernFear: true };
      return addLog(next, '밀서는 바다를 건너 유럽 왕실에 전해졌다. 역사의 흐름이 미세하게 뒤틀리기 시작한다.', 'MAGIC');
    case 'fan_invite_priest': {
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      const westBook = ALL_BOOKS_CATALOG.find((b) => b.rarity === 'WESTERN' && !next.books.some((ob) => ob.id === b.id));
      if (westBook) {
        next.books = [...next.books, { ...westBook, decodeProgress: 0, decoded: false }];
        return addLog(next, `선교사와 깊은 대화를 나누고 『${westBook.title}』을(를) 선물받았다.`, 'GOOD');
      }
      return addLog(next, '선교사와 교류하며 통찰을 얻었다.', 'GOOD');
    }

    // 라이벌 4막
    case 'rival_1_fight':
      next.rival = { ...next.rival, act: 1 };
      next.pendingBattle = createBattleConfig(
        'b_rival_1', `라이벌 1막 — ${next.rival.name}`, '숙명의 첫 비무', false,
        next.rival.name, next.rival.title, next.rival.age, 'DUELIST', 1.0, 'BLADE', ['sk_kr_02', 'sk_jp_03', 'base_h_slash'],
        { isRivalBattle: true, rewardMoney: 40, rewardFame: 30 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'rival_1_tea':
      next.rival = { ...next.rival, act: 1, friendship: next.rival.friendship + 10 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 5 };
      next = syncRivalSect(next, 8, '도장주끼리 차를 나누며 다음을 기약했다');
      return addLog(next, `${next.rival.name}과(와) 차를 나누며 다음 대결을 기약했다.`, 'NORMAL');

    case 'rival_2_fight':
      next.rival = { ...next.rival, act: 2 };
      next.pendingBattle = createBattleConfig(
        'b_rival_2', `라이벌 2막 — 문파 대 문파`, '중년의 자존심을 건 비무', false,
        next.rival.name, '대도장주', next.rival.age, 'DUELIST', Math.max(2.0, scale + 0.3), 'BLADE', ['sk_kr_02', 'sk_cn_03', 'sk_jp_03'],
        { isRivalBattle: true, rewardMoney: 100, rewardFame: 55 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'rival_2_decline':
      next.rival = { ...next.rival, act: 2, friendship: next.rival.friendship + 15 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 10 };
      next = syncRivalSect(next, 10, '도장주끼리 서로의 성장을 인정했다');
      return addLog(next, `${next.rival.name}과(와) 서로의 성장을 인정하며 웃어 보였다.`, 'GOOD');

    case 'rival_3_disciple':
    case 'rival_3_self':
      next.rival = { ...next.rival, act: 3 };
      next.pendingBattle = createBattleConfig(
        'b_rival_3', `라이벌 3막 — 세대의 대결`, '노년기의 비무', false,
        optionId === 'rival_3_disciple' ? `${next.rival.name}의 수제자` : next.rival.name,
        optionId === 'rival_3_disciple' ? '라이벌 문파 수제자' : '노고수 대도장주',
        optionId === 'rival_3_disciple' ? 24 : next.rival.age,
        optionId === 'rival_3_disciple' ? 'RUSHDOWN' : 'OLD_MASTER',
        Math.max(2.5, scale + 0.4), 'BLADE', ['sk_jp_03', 'sk_cn_03', 'sk_kr_06'],
        { isRivalBattle: true, rewardMoney: 120, rewardFame: 65 }
      );
      next.phase = 'BATTLE';
      return next;

    case 'rival_4_duel':
      next.rival = { ...next.rival, act: 4, lastFarewellType: 'DUEL' };
      next.flags = { ...next.flags, rivalFarewellDone: true };
      next.pendingBattle = createBattleConfig(
        'b_rival_4', `최후의 한 합 — ${next.rival.name}`, '황혼의 진검결투', true,
        next.rival.name, '평생의 숙적 (백발 노검객)', next.rival.age, 'OLD_MASTER', 3.4, 'BLADE', ['sk_cn_03', 'sk_jp_03', 'sk_kr_06'],
        { isRivalBattle: true, rewardFame: 100, rewardWeaponId: 'wp_bl_11' }
      );
      next.phase = 'BATTLE';
      return next;
    case 'rival_4_drink':
      next.rival = { ...next.rival, act: 4, friendship: 100, lastFarewellType: 'DRINK', alive: false };
      next.flags = { ...next.flags, rivalFarewellDone: true };
      next.stats = { ...next.stats, wil: next.stats.wil + 10, ins: next.stats.ins + 6 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 20 };
      next = syncRivalSect(next, 40, `두 사람이 겨울밤 술잔을 나누며 반백 년의 앙금을 풀었다`);
      return addLog(next, `눈 내리는 겨울밤, ${next.rival.name}과(와) 새벽까지 술잔을 기울이며 50년 세월을 회고했다. 그는 이듬해 봄 조용히 눈을 감았다.`, 'MAGIC');

    // 가족
    case 'marry_yes': {
      const cand = event.meta?.candidate as Omit<Spouse, 'age' | 'marriedYear' | 'alive'>;
      if (cand) {
        next.spouse = { ...cand, age: Math.max(18, next.age - 2), marriedYear: next.year, alive: true };
        return addLog(next, `${cand.name}(${cand.occupation})과(와) 혼례를 올렸다! (${cand.bonusDesc})`, 'GOOD');
      }
      return next;
    }
    case 'marry_no':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 10 };
      return addLog(next, '혼담을 정중히 사양하고 무도의 길에 집중하기로 했다.', 'NORMAL');

    case 'child_martial':
    case 'child_free': {
      const childName = (event.meta?.childName as string) || '후계자';
      const roll = Math.random();
      const childTalent: Disciple['childTalent'] =
        optionId === 'child_free' && roll < 0.5 ? 'SCHOLAR' : roll < 0.35 ? 'PRODIGY' : roll < 0.72 ? 'DILIGENT' : 'SCHOLAR';
      const child = createDiscipleEntity(next, {
        name: childName,
        isChild: true,
        isGenius: childTalent === 'PRODIGY',
        childTalent,
      });
      next.disciples = [...next.disciples, child];
      if (optionId === 'child_free') next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 10 };
      const talentLabel = childTalent === 'PRODIGY' ? '무술 천재' : childTalent === 'SCHOLAR' ? '학자·상인 기질' : '성실한 노력파';

      // ★ 여성 주인공 직접 출산 리얼리티: 산고로 건강 대폭 감소 + 산후 몸조리 + 확률적 산후열(질병) 발병! ★
      if (next.gender === 'FEMALE') {
        const clinicRelief = (next.facilities.clinic - 1) * 3 + (next.spouse?.bonusType === 'CLINIC' ? 6 : 0);
        const agePenalty = next.age >= 38 ? 8 : 0;
        const birthWear = Math.max(14, 28 + agePenalty - clinicRelief);
        next.health = Math.max(10, next.health - birthWear);
        const feverChance = Math.max(0.1, 0.32 - (next.facilities.clinic - 1) * 0.06 - (next.spouse?.bonusType === 'CLINIC' ? 0.1 : 0));
        const gotFever = Math.random() < feverChance;
        if (gotFever) {
          next.statuses = [...next.statuses, { id: 'PLAGUE', label: '산후열(産後熱)', turnsRemaining: 2 }];
          return addLog(
            next,
            `긴 산고 끝에 자녀 ${childName}(${talentLabel})을(를) 출산했다! 산후 체력이 크게 떨어지고 【산후열】이 찾아왔다 (건강 -${birthWear} · 반드시 휴식·치료 필요!)`,
            'WARN'
          );
        }
        next.statuses = [...next.statuses, { id: 'LIGHT_INJURY', label: '산후 몸조리', turnsRemaining: 2 }];
        return addLog(
          next,
          `긴 산고 끝에 자녀 ${childName}(${talentLabel})을(를) 출산했다! (건강 -${birthWear} · 당분간 충분한 휴식이 필요하다)`,
          'GOOD'
        );
      }

      return addLog(next, `사랑스러운 자녀 ${childName}이(가) 태어나 도장의 일원이 되었다! (성향: ${talentLabel})`, 'GOOD');
    }

    case 'heir_pick_disciple':
    case 'heir_pick_child': {
      const targetId = (optionId === 'heir_pick_disciple' ? event.meta?.discipleId : event.meta?.childId) as string;
      next.flags = { ...next.flags, heirConflictDone: true, heirAskedYear: next.year };
      next.disciples = next.disciples.map((d) => ({
        ...d,
        role: d.id === targetId ? 'HEIR' : d.role === 'HEIR' ? 'INSTRUCTOR' : d.role,
      }));
      const picked = next.disciples.find((d) => d.id === targetId);
      return addLog(next, `${picked?.name || '후계자'}을(를) 【${next.sectName}】의 공식 2대 종주(후계자)로 선포했다!`, 'MAGIC');
    }
    case 'heir_postpone':
      next.flags = { ...next.flags, heirAskedYear: next.year };
      return addLog(next, '후계자 지명을 뒤로 미뤘다. 문하생들 사이에 말 없는 불안이 감돈다.', 'WARN');

    // 역사 이벤트
    case 'kr_sinbo_share': {
      next.fame += 25;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 10 };
      const b = ALL_BOOKS_CATALOG.find((x) => x.id === 'bk_kr_01');
      if (b && !next.books.some((x) => x.id === b.id)) {
        next.books = [...next.books, { ...b, decodeProgress: 0, decoded: false }];
      }
      return addLog(next, '훈련도감 교관과 교류하며 『무예신보초』를 얻었다.', 'GOOD');
    }
    case 'kr_sinbo_duel':
      next.pendingBattle = createBattleConfig(
        'b_kr_sinbo', '훈련도감 교관과의 공개 비무', '조선 군영 무예와의 대결', false,
        '훈련도감 교관', '조선 군영 사범', 35, 'DUELIST', Math.max(1.3, scale), 'BLADE', ['sk_kr_01', 'sk_kr_02'],
        { rewardMoney: 80, rewardFame: 45 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'kr_sinbo_refuse':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
      next.stats = { ...next.stats, ins: next.stats.ins + 3 };
      return addLog(next, '유파의 비전을 지켜내며 깊은 깨달음을 얻었다.', 'NORMAL');

    case 'kr_1762_patrol':
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 22 };
      next.fame += 20;
      return addLog(next, '밤길을 순찰하며 백성들을 지켜 저잣거리의 칭송을 얻었다.', 'GOOD');
    case 'kr_1762_guard':
      next.money += 120;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 20 };
      return addLog(next, '부호들의 저택 경호로 120냥의 막대한 수익을 올렸다.', 'GOOD');
    case 'kr_1762_close':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
      next.stats = { ...next.stats, ins: next.stats.ins + 3, qi: next.stats.qi + 3 };
      return addLog(next, '세상과 단절한 채 수련에 몰두해 내면이 깊어졌다.', 'NORMAL');

    case 'kr_1790_donate':
      next.fame += 70;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 25 };
      next.flags = { ...next.flags, wroteManual: true };
      return addLog(next, '당신의 유파가 『무예도보통지』에 정식으로 기록되었다!', 'MAGIC');
    case 'kr_1790_trade':
      next.fame += 30;
      next.stats = { ...next.stats, ins: next.stats.ins + 6 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
      return addLog(next, '규장각의 희귀 병서를 열람하며 통찰이 크게 넓어졌다.', 'GOOD');

    case 'cn_canton_escort':
      next.pendingBattle = createBattleConfig(
        'b_cn_canton', '광저우 서양 상단 호위전', '산적단 습격 격퇴', false,
        '강남 산적 두목', '표국 약탈자', 36, 'HEAVY', Math.max(1.4, scale), 'POLEARM', ['sk_cn_06', 'base_v_slash'],
        { rewardMoney: 160, rewardFame: 35, rewardBookId: 'bk_we_01' }
      );
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 25 };
      next.phase = 'BATTLE';
      return next;
    case 'cn_canton_refuse':
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 12, ascetic: next.reputation.ascetic + 10 };
      return addLog(next, '오랑캐 상단의 호위를 거절하고 강호의 명분을 지켰다.', 'NORMAL');

    case 'cn_bailian_shelter':
      next.money -= 70;
      next.fame += 30;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 35 };
      return addLog(next, '피난민들을 도장에 품어 민초의 방패로 칭송받았다.', 'GOOD');
    case 'cn_bailian_mercenary':
      next.money += 220;
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 18, commerce: next.reputation.commerce + 15 };
      return addLog(next, '관군 토벌대 선봉으로 220은자를 벌어들였다.', 'WARN');
    case 'cn_bailian_iron':
      next.authority += 15;
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 28 };
      return addLog(next, '도장을 넘보는 자는 모두 베어 버리자 사방이 쥐 죽은 듯 조용해졌다.', 'WARN');

    case 'jp_shinai_adopt': {
      next.money -= 30;
      next.fame += 20;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 12 };
      const shinai = getWeaponById('wp_bl_03');
      if (shinai && !next.weapons.some((w) => w.id === shinai.id)) next.weapons = [...next.weapons, shinai];
      return addLog(next, '죽도와 호구를 도입해 에도의 신식 도장으로 명성을 얻었다.', 'GOOD');
    }
    case 'jp_shinai_reject':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15, ruthless: next.reputation.ruthless + 10 };
      next.stats = { ...next.stats, str: next.stats.str + 2 };
      return addLog(next, '목검과 진검만을 고집하며 실전의 기풍을 세웠다.', 'NORMAL');

    case 'jp_fire_ice_magic':
      next.fame += 80;
      next.reputation = { ...next.reputation, arcane: next.reputation.arcane + 40, virtue: next.reputation.virtue + 20 };
      next.flags = { ...next.flags, usedMagicPublicly: true };
      return addLog(next, '★ 빙결 마법으로 에도 대화재의 불길을 통째로 얼려 버렸다! 온 도시가 경악하며 당신을 신선이라 부른다!', 'MAGIC');
    case 'jp_fire_evac':
      next.money = Math.max(0, next.money - 80);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 25 };
      return addLog(next, '이웃들과 함께 안전히 대피한 뒤 80료를 들여 도장을 복구했다.', 'GOOD');
    case 'jp_fire_defend':
      next.health = Math.max(10, next.health - 12);
      next.authority += 20;
      return addLog(next, '화상을 입으면서도 끝까지 지붕 위에서 도장을 지켜냈다!', 'WARN');

    case 'jp_bs_spirit':
      next.stats = { ...next.stats, ins: next.stats.ins + 5, qi: next.stats.qi + 5 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
      return addLog(next, '“대포마저 베어 넘길 경지를 만들겠다”는 말에 제자들의 눈이 불타올랐다.', 'GOOD');
    case 'jp_bs_calm':
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      return addLog(next, '흔들리던 제자들의 마음을 다잡아 주었다.', 'GOOD');

    // 특수 결투 & 일상
    case 'henri_fight':
      next.pendingBattle = createBattleConfig(
        'b_henri', '앙리 뒤퐁 — 프랑스 에페 결투', '동서양 검술의 첫 충돌', false,
        '앙리 뒤퐁', '프랑스 귀족 에페 마스터', 32, 'DUELIST', Math.max(1.5, scale), 'BLADE', ['sk_we_01', 'sk_we_02'],
        { rewardMoney: 80, rewardFame: 40, rewardBookId: 'bk_we_02' }
      );
      next.phase = 'BATTLE';
      return next;
    case 'henri_decline':
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
      next.stats = { ...next.stats, ins: next.stats.ins + 2 };
      return addLog(next, '앙리 뒤퐁과 동서양 검술의 차이를 논하며 통찰을 얻었다.', 'NORMAL');

    case 'demon_duel':
      next.pendingBattle = createBattleConfig(
        'b_demon', '낭인 검귀 — 사생결단', '⚠ 패배 시 사망/영구장애', true,
        '피의 낭인 검귀', '살인검객', 38, 'AGGRESSIVE', Math.max(1.3, scale), 'BLADE', ['sk_jp_06', 'sk_jp_03'],
        { rewardMoney: 110, rewardFame: 55, rewardWeaponId: getRewardWeaponForDemon(scale)?.id }
      );
      next.phase = 'BATTLE';
      return next;
    case 'demon_swarm':
      next.fame = Math.max(0, next.fame - 12);
      next.authority = Math.max(0, next.authority - 8);
      return addLog(next, '제자들과 에워싸 검귀를 쫓아냈다. 안전했으나 명성에 흠이 갔다.', 'WARN');

    case 'plague_buy_med': {
      const { cost, cureChance } = getPlagueMedicineMeta(next);
      next.money = Math.max(0, next.money - cost);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 22 };
      if (Math.random() < cureChance) {
        next.disciples = next.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 10) }));
        return addLog(next, `거금(-${cost}${cMeta.currency})을 들인 탕약이 효험을 보여 도장 전원이 역병을 무사히 넘겼다!`, 'GOOD');
      }
      // 역병 탕약 실패: 기세를 완전히 꺾지 못해 후유증 + 제자 피해 가능
      next.health = Math.max(6, next.health - 12);
      next.statuses = [...next.statuses, { id: 'PLAGUE', label: '역병 후유증', turnsRemaining: 2 }];
      const aliveTargets = next.disciples.filter((d) => !d.dead && !d.isChild);
      if (aliveTargets.length > 0 && Math.random() < 0.45) {
        const victim = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
        next.disciples = next.disciples.map((d) => (d.id === victim.id ? { ...d, dead: true, leftReason: '역병으로 병사(약효 미달)' } : d));
        return addLog(
          next,
          `비싼 탕약(-${cost}${cMeta.currency})을 쏟아부었으나 지독한 역병을 다 막지 못해 ${victim.name}이(가) 끝내 숨졌고 당신도 앓아누웠다… (건강 -12)`,
          'DANGER'
        );
      }
      return addLog(next, `비싼 탕약(-${cost}${cMeta.currency})을 썼으나 지독한 역병의 기세가 덜 꺾여 한동안 크게 앓아누웠다… (건강 -12)`, 'WARN');
    }
    case 'plague_endure': {
      const resistChance = next.facilities.clinic >= 3 || next.stats.vit >= 45 ? 0.72 : next.facilities.clinic >= 2 || next.stats.vit >= 32 ? 0.48 : 0.25;
      if (Math.random() < resistChance) {
        next.stats = { ...next.stats, vit: next.stats.vit + 3 };
        return addLog(next, '단련된 체력과 도장 약방으로 지독한 역병을 기적적으로 이겨 냈다! (체력 +3)', 'GOOD');
      }
      const plagueLoss = diffId === 'HELL' ? 34 : diffId === 'HARD' ? 26 : 20;
      next.health = Math.max(0, next.health - plagueLoss);
      next.statuses = [...next.statuses, { id: 'PLAGUE', label: '역병 후유증', turnsRemaining: 2 }];
      if (diffId !== 'EASY') {
        const aliveTargets = next.disciples.filter((d) => !d.dead && !d.isChild);
        if (aliveTargets.length > 0 && Math.random() < (diffId === 'HELL' ? 0.6 : 0.35)) {
          const victim = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
          next.disciples = next.disciples.map((d) => (d.id === victim.id ? { ...d, dead: true, leftReason: '대역병으로 병사' } : d));
          next = addLog(next, `☠ 대역병 속에서 문하생 ${victim.name}이(가) 끝내 목숨을 잃었다…`, 'DANGER');
        }
      }
      if (next.health <= 0) {
        next.phase = 'ENDING';
        next.deathCause = '대역병(병사)';
        return addLog(next, '지독한 역병을 끝내 이겨 내지 못하고 눈을 감았다…', 'DANGER');
      }
      return addLog(next, `역병에 크게 앓아누웠다. 건강이 심각하게 상했다. (건강 -${plagueLoss})`, 'DANGER');
    }

    case 'orphan_accept': {
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, orphan: 'ACCEPTED' } };
      const genius = createDiscipleEntity(next, { archetype: '장터 고아', isGenius: true });
      genius.tuition = 4;
      next.disciples = [...next.disciples, genius];
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      return addLog(next, `★ 천재 고아 ${genius.name}을(를) 내문 제자로 거두었다!`, 'GOOD');
    }
    case 'orphan_reject':
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, orphan: 'REJECTED' } };
      next.money = Math.max(0, next.money - 10);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 5 };
      return addLog(next, '은자 몇 푼을 쥐여 돌려보냈다. 아이는 한참이나 대문을 노려보다 빗속으로 사라졌다.', 'NORMAL');

    case 'famine_forgive':
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 18 };
      next.disciples = next.disciples.map((d) => ({ ...d, loyalty: Math.min(100, d.loyalty + 10) }));
      return addLog(next, '흉년 월사금을 면제해 주자 제자들의 충성심과 의욕이 하늘을 찔렀다.', 'GOOD');
    case 'famine_strict':
      next.money += 35;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 12 };
      next.disciples = next.disciples.map((d) => ({ ...d, loyalty: Math.max(10, d.loyalty - 8) }));
      return addLog(next, '원칙대로 밀린 월사금을 거두어 도장 재정을 지켰다.', 'NORMAL');

    case 'publish_yes':
      next.money += 220;
      next.fame += 30;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 25 };
      return addLog(next, '기초 입문서가 전국에서 날개 돋친 듯 팔려 220 재화를 벌어들였다!', 'GOOD');
    case 'publish_no':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 20 };
      next.stats = { ...next.stats, ins: next.stats.ins + 3 };
      return addLog(next, '상인의 제안을 물리치고 유파의 비전을 굳게 지켰다.', 'NORMAL');

    case 'hermit_fight':
      next.pendingBattle = createBattleConfig(
        'b_hermit', '산중 은둔 노고수', '전설적 간파의 극의', false,
        '산중 은둔 노고수', '무림 은자', 74, 'OLD_MASTER', 3.2, 'BLADE', ['sk_cn_03', 'sk_jp_01', 'sk_kr_06'],
        { rewardMoney: 0, rewardFame: 70, eventFollowupId: 'hermit_reward' }
      );
      next.phase = 'BATTLE';
      return next;
    case 'hermit_bow':
      next.stats = { ...next.stats, ins: next.stats.ins + 5, qi: next.stats.qi + 5 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 12 };
      return addLog(next, '노인과 차를 나누며 무도의 깊은 이치를 깨우쳤다.', 'GOOD');

    case 'breaker_fight':
    case 'breaker_fight_real': {
      const isReal = optionId === 'breaker_fight_real';
      const fromSect = (next.sects || []).find((sc) => sc.id === event.meta?.sectId);
      next.pendingBattle = createBattleConfig(
        `b_breaker_${state.turn}`,
        isReal ? '진검 도장깨기 결투' : '도장깨기 비무',
        isReal ? '⚠ 패배 시 사망/영구장애' : '현판을 건 자존심 대결',
        isReal,
        fromSect ? fromSect.champion : isReal ? '살기 띤 도장깨기 검객' : '타 문파 도전자',
        fromSect ? `${fromSect.name.replace(/\(.*?\)/g, '')} 대표 무사` : isReal ? '진검 도전자' : '도장깨기 무사',
        25 + Math.floor(Math.random() * 18),
        (['AGGRESSIVE', 'DUELIST', 'HEAVY', 'RUSHDOWN'] as const)[Math.floor(Math.random() * 4)],
        scale, 'BLADE', ['sk_kr_01', 'sk_cn_01', 'sk_jp_03'],
        {
          rewardMoney: Math.round((isReal ? 55 : 35) + scale * 25),
          rewardFame: Math.round((isReal ? 38 : 20) + scale * 12),
          ...(fromSect ? { eventFollowupId: `sect_duel|${fromSect.id}` } : {}),
        }
      );
      next.phase = 'BATTLE';
      return next;
    }
    case 'breaker_ignore':
      next.fame = Math.max(0, next.fame - 8);
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 5 };
      next = adjustRelation(next, event.meta?.sectId as string | undefined, -3, '도전을 피하자 더 얕보기 시작했다');
      return addLog(next, '도장깨기를 무시하고 돌려보냈다. 명성이 소폭 하락했다.', 'WARN');

    case 'insp_train': {
      next.health = Math.max(10, next.health - 4);
      next.stats = { ...next.stats, ins: next.stats.ins + 3 };
      if (next.skills.length > 0) {
        const res = gainSkillExp(next.skills[0], 110);
        const sList = [...next.skills];
        sList[0] = res.updated;
        next.skills = sList;
        if (res.triggeredTrait) next.pendingTraitSkillId = res.updated.id;
      }
      return addLog(next, '밤새 빗속에서 검을 휘둘러 주력 초식의 경지가 크게 올랐다!', 'GOOD');
    }
    case 'insp_note':
      next.stats = { ...next.stats, ins: next.stats.ins + 2 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 5 };
      return addLog(next, '영감을 붓으로 기록해 두고 몸을 아꼈다.', 'NORMAL');

    // v3.1 신규 역사·인간 드라마·강호 결투 이벤트 핸들러
    case 'kr_gyun_hide': {
      const farmer = createDiscipleEntity(next, { archetype: '우직한 농부 아들', isGenius: false });
      farmer.tuition = 4;
      next.disciples = [...next.disciples, farmer];
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 16 };
      return addLog(next, `도망친 농부 ${farmer.name}을(를) 숨겨 주어 충직한 문하생으로 거두었다.`, 'GOOD');
    }
    case 'kr_gyun_pay': {
      const farmer = createDiscipleEntity(next, { archetype: '우직한 농부 아들', isGenius: false });
      next.money -= 35;
      next.fame += 15;
      next.disciples = [...next.disciples, farmer];
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 22 };
      return addLog(next, `밀린 군포를 대신 갚아 주고 ${farmer.name}을(를) 문하생으로 맞이했다.`, 'GOOD');
    }
    case 'kr_gyun_handover':
      next.money += 25;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 8 };
      return addLog(next, '관법에 따라 농부를 넘기고 포상금 25냥을 받았다.', 'NORMAL');

    case 'kr_eosa_help':
      next.money += 90;
      next.fame += 45;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 28 };
      return addLog(next, '암행어사 출두를 도와 탐관오리를 제압했다! 고을 백성들이 환호한다.', 'GOOD');
    case 'kr_eosa_neutral':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 18 };
      next.stats = clampStatsByAge({ ...next.stats, ins: next.stats.ins + 3 }, next.age);
      return addLog(next, '정사에 관여하지 않고 무도의 본분을 지켰다.', 'NORMAL');

    case 'kr_1801_hide':
      if (next.stats.ins >= 40) {
        next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
        return addLog(next, '뛰어난 기지로 서양 서적을 완벽히 숨겨 포도청 수색을 무사히 넘겼다.', 'GOOD');
      }
      next.money = Math.max(0, next.money - 60);
      return addLog(next, '수색 도중 의심을 사 과태료 60냥을 물고 겨우 무마했다.', 'WARN');
    case 'kr_1801_bribe':
      next.money -= 90;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 15 };
      return addLog(next, '은자를 찔러 주어 장서각 수색을 조용히 무마했다.', 'NORMAL');

    case 'cn_nanxun_join':
      next.money += 75;
      next.fame += 25;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 10 };
      return addLog(next, '황제 남순 외곽 경호를 완수해 75은자와 명성을 얻었다.', 'GOOD');
    case 'cn_nanxun_skip':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
      next.stats = clampStatsByAge({ ...next.stats, ins: next.stats.ins + 2 }, next.age);
      return addLog(next, '관청 소집을 피하고 조용히 도장 수련에 집중했다.', 'NORMAL');

    case 'cn_tourney_enter':
      next.pendingBattle = createBattleConfig(
        'b_cn_tourney', '강남 천하 비무대회 결승', '중원 강호 고수와의 승부', false,
        '소림 속가 대사형', '강남 무림 고수', 36, 'RUSHDOWN', Math.max(1.8, scale + 0.2), 'UNARMED', ['sk_cn_01', 'sk_cn_05', 'sk_cn_03'],
        { rewardMoney: 240, rewardFame: 65 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'cn_tourney_watch':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 12 };
      next.stats = clampStatsByAge({ ...next.stats, ins: next.stats.ins + 5 }, next.age);
      return addLog(next, '천하 비무대회를 관전하며 각 문파의 초식 원리를 흡수했다.', 'GOOD');

    case 'cn_opium_raid':
      next.pendingBattle = createBattleConfig(
        'b_cn_opium', '아편 밀수단 소탕', '부두 무법자 두목과의 대결', false,
        '아편 밀수단 두목', '광둥 흑사회', 42, 'AGGRESSIVE', Math.max(2.0, scale), 'BLADE', ['sk_cn_07', 'sk_we_08'],
        { rewardMoney: 100, rewardFame: 45 }
      );
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 30 };
      next.phase = 'BATTLE';
      return next;
    case 'cn_opium_deal':
      next.money += 190;
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 20, commerce: next.reputation.commerce + 20 };
      return addLog(next, '밀수단에게서 190은자를 받고 눈감아 주었다.', 'WARN');

    case 'jp_famine_feed': {
      next.money -= 80;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 32 };
      const ronin = createDiscipleEntity(next, { archetype: '방랑 낭인', isGenius: false });
      next.disciples = [...next.disciples, ronin];
      return addLog(next, `죽을 나누어 주자 감화한 낭인 ${ronin.name}이(가) 문하에 들어왔다.`, 'GOOD');
    }
    case 'jp_famine_fight':
      next.pendingBattle = createBattleConfig(
        'b_jp_famine', '굶주린 낭인 무리 격퇴', '식량 창고 방어전', false,
        '낭인 두목', '배고픈 무사', 34, 'AGGRESSIVE', Math.max(1.5, scale), 'BLADE', ['sk_jp_03', 'base_v_slash'],
        { rewardMoney: 40, rewardFame: 25 }
      );
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 20 };
      next.phase = 'BATTLE';
      return next;

    case 'jp_shogun_fight':
      next.pendingBattle = createBattleConfig(
        'b_jp_shogun', '에도성 어전 시합', '쇼군 앞 천하 제일검 결정전', false,
        '야규 사범 대리', '막부 검술 지남역', 40, 'DUELIST', Math.max(2.4, scale + 0.3), 'BLADE', ['sk_jp_01', 'sk_jp_02', 'sk_jp_03'],
        { rewardMoney: 220, rewardFame: 90, rewardWeaponId: 'wp_bl_09' }
      );
      next.phase = 'BATTLE';
      return next;
    case 'jp_shogun_pass':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 25 };
      next.authority += 15;
      return addLog(next, '어전 시합을 사양하며 순수 무인의 기개를 지켰다.', 'GOOD');

    case 'smith_pay': {
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, smith: 'WARM' } };
      next.money -= 25;
      next.weapons = next.weapons.map((w) => (w.id === next.equippedWeaponId && w.upgradeLevel < 5 ? { ...w, upgradeLevel: w.upgradeLevel + 1 } : w));
      return addLog(next, '떠돌이 대장장이가 하룻밤 새 장착 무기를 +1강 더 예리하게 벼려 주었다!', 'GOOD');
    }
    case 'smith_meal':
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, smith: 'WARM' } };
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 12 };
      if (Math.random() < 0.5) {
        next.weapons = next.weapons.map((w) => (w.id === next.equippedWeaponId && w.upgradeLevel < 5 ? { ...w, upgradeLevel: w.upgradeLevel + 1 } : w));
        return addLog(next, '따뜻한 밥에 감동한 대장장이가 공짜로 무기를 +1강 연마해 주었다!', 'GOOD');
      }
      return addLog(next, '대장장이에게 따뜻한 국밥을 대접했다. 노인은 오래도록 고마워하며 떠났다.', 'GOOD');

    case 'mother_teach': {
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, mother: 'HELPED' } };
      const kid = createDiscipleEntity(next, { archetype: '장터 고아', isGenius: Math.random() < 0.35 });
      kid.tuition = 0;
      next.disciples = [...next.disciples, kid];
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 20 };
      return addLog(next, `가난한 어머니의 아들 ${kid.name}을(를) 무료 제자로 받아들였다.`, 'GOOD');
    }
    case 'mother_patrol':
      next.flags = { ...next.flags, storyMemory: { ...next.flags.storyMemory, mother: 'HELPED' } };
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      next.fame += 18;
      return addLog(next, '장터 불량배들을 혼내 주고 빼앗긴 돈을 되찾아 주었다.', 'GOOD');
    case 'mother_refuse':
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 8 };
      return addLog(next, '도장 형편상 무료 입문은 어렵다며 정중히 돌려보냈다.', 'NORMAL');

    case 'landlord_fight':
      next.pendingBattle = createBattleConfig(
        'b_landlord', '토호의 호위 무사 격퇴', '도장 터 수호 비무', false,
        '토호 수석 호위', '용병 무사', 33, 'HEAVY', Math.max(1.2, scale), 'POLEARM', ['sk_kr_05', 'base_v_slash'],
        { rewardMoney: 60, rewardFame: 35 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'landlord_firm':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
      next.authority += 10;
      return addLog(next, '단호한 기백으로 토호를 쫓아내 도장 터를 지켜 냈다.', 'GOOD');

    case 'burglar_fight':
      next.pendingBattle = createBattleConfig(
        'b_burglar', '장서각 야간 도둑 제압', '비급 수호전', false,
        '복면 비급 도둑', '강호 도적', 29, 'RUSHDOWN', Math.max(1.1, scale * 0.9), 'THROWN', ['sk_cn_07', 'sk_jp_07'],
        { rewardMoney: 65, rewardFame: 25 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'burglar_warn':
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 5 };
      return addLog(next, '호통을 쳐 도둑을 쫓아내고 장서각 비급을 지켜 냈다.', 'GOOD');

    case 'memorial_basic': {
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
      next.stats = clampStatsByAge({ ...next.stats, ins: next.stats.ins + 3 }, next.age);
      next.skills = next.skills.map((s) => (s.id === 'base_h_slash' || s.id === 'base_v_slash' ? gainSkillExp(s, 90).updated : s));
      return addLog(next, '선대 스승의 기일, 밤새 횡베기와 종베기를 그으며 초심과 경지를 되새겼다.', 'GOOD');
    }
    case 'memorial_feast':
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 12 };
      next.disciples = next.disciples.map((d) => ({ ...d, loyalty: Math.min(100, d.loyalty + 12) }));
      return addLog(next, '제자들과 조촐한 제사를 올리며 유파의 뿌리를 함께 기렸다.', 'GOOD');

    case 'anniv_open':
      next.money -= 60;
      next.fame += 45;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 30 };
      return addLog(next, '창립 10주년 대잔치에 온 마을 사람들이 모여 유파의 번영을 축복했다!', 'GOOD');
    case 'anniv_tourney':
      next.fame += 40;
      next.authority += 15;
      next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 10 };
      return addLog(next, '화려한 공개 무술 시연으로 도장의 위상을 천하에 떨쳤다!', 'GOOD');

    case 'fallen_accept': {
      const rareBook = ALL_BOOKS_CATALOG.find((b) => b.rarity === 'RARE' && !next.books.some((ob) => ob.id === b.id));
      next.fame += 20;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      if (rareBook) {
        next.books = [...next.books, { ...rareBook, decodeProgress: 0, decoded: false }];
        return addLog(next, `노사범의 뜻을 이어받아 『${rareBook.title}』을(를) 정중히 계승했다.`, 'GOOD');
      }
      return addLog(next, '노사범의 가르침을 새겨 통찰을 얻었다.', 'GOOD');
    }

    case 'boxer_fight':
      next.pendingBattle = createBattleConfig(
        'b_boxer', '영국 복서 잭과의 맨손 결투', '1743 브로턴 권투 대결', false,
        '영국 선원 잭', '베어너클 복서', 31, 'RUSHDOWN', Math.max(1.4, scale), 'UNARMED', ['sk_we_04', 'sk_we_05'],
        { rewardMoney: 85, rewardFame: 35, rewardBookId: 'bk_we_04' }
      );
      next.phase = 'BATTLE';
      return next;
    case 'boxer_drink':
      next.stats = clampStatsByAge({ ...next.stats, vit: next.stats.vit + 2 }, next.age);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
      return addLog(next, '영국 선원 잭과 호탕하게 술잔을 나누며 체력과 우정을 다졌다.', 'GOOD');

    case 'mongol_fight':
      next.pendingBattle = createBattleConfig(
        'b_mongol', '북방 초원의 씨름 장사', '압도적 괴력과의 대결', false,
        '초원 씨름 장사', '북방 괴력 무인', 35, 'HEAVY', Math.max(1.7, scale + 0.1), 'UNARMED', ['sk_jp_04', 'sk_we_05', 'sk_cn_05'],
        { rewardMoney: 90, rewardFame: 45 }
      );
      next.stats = clampStatsByAge({ ...next.stats, str: next.stats.str + 2 }, next.age);
      next.phase = 'BATTLE';
      return next;
    case 'mongol_skip':
      next.fame = Math.max(0, next.fame - 5);
      return addLog(next, '씨름 장사의 도전을 정중히 사양했다.', 'NORMAL');

    case 'tang_fight':
      next.pendingBattle = createBattleConfig(
        'b_tang', '당문 암기 여협객', '원거리 비침 공세 돌파', false,
        '당문 여협객', '촉나라 암기 고수', 28, 'RANGED', Math.max(1.9, scale + 0.15), 'THROWN', ['sk_cn_07', 'sk_jp_07'],
        { rewardMoney: 110, rewardFame: 50, rewardBookId: 'bk_cn_07' }
      );
      next.phase = 'BATTLE';
      return next;
    case 'tang_talk':
      next.stats = clampStatsByAge({ ...next.stats, ins: next.stats.ins + 3 }, next.age);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
      return addLog(next, '당문 여협객과 암기 파훼법을 논하며 통찰을 얻었다.', 'GOOD');

    case 'royal_accept':
      next.flags = { ...next.flags, royalAlliance: true };
      next.fame += 60;
      next.reputation = { ...next.reputation, arcane: next.reputation.arcane + 20 };
      return addLog(next, '★ 조정과 비밀 동맹을 맺어 국가 수호 유파가 되었다! (매 계절 국고 +100)', 'MAGIC');
    case 'royal_decline':
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 30 };
      next.authority += 25;
      return addLog(next, '국사 초빙을 거절하고 자유로운 무인의 길을 지켜 냈다.', 'GOOD');

    // 6대 인과응보 복선 회수 & 생애 변곡점 핸들러
    case 'karma_orphan_duel':
      next.pendingBattle = createBattleConfig(
        'b_karma_orphan', '돌아온 고아와의 진검결투', '십여 년 전 빗속의 원한', true,
        '복수의 젊은 검객', '빗속의 고아', 26, 'DUELIST', Math.max(1.8, scale + 0.1), 'BLADE', ['sk_jp_03', 'sk_kr_02'],
        { rewardMoney: 80, rewardFame: 70, rewardWeaponId: 'wp_bl_07' }
      );
      next.phase = 'BATTLE';
      return next;
    case 'karma_orphan_apologize':
      next.fame = Math.max(0, next.fame - 10);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 25 };
      return addLog(next, '그날의 매정함을 진심으로 사과하자, 젊은 검객은 칼을 거두고 빗속으로 사라졌다.', 'GOOD');

    case 'karma_smith_take': {
      const sword = getWeaponById('wp_bl_11') || getWeaponById('wp_bl_09');
      if (sword && !next.weapons.some((w) => w.id === sword.id)) {
        next.weapons = [...next.weapons, sword];
      }
      next.fame += 35;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      return addLog(next, `★ 은둔 명장 황 노인이 남긴 마지막 보검 「${sword?.name || '보검'}」을 이어받았다!`, 'MAGIC');
    }

    case 'karma_thug_ambush':
      next.money += 120;
      next.fame += 35;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      return addLog(next, '옛 왈패의 제보로 야습하던 산적들을 일망타진하고 현상금 120을 얻었다!', 'GOOD');

    case 'karma_thug_crush':
      next.pendingBattle = createBattleConfig(
        'b_karma_thug', '커져 버린 악연 청산', '장터 조직 두목과의 대결', false,
        '장터 조직 두목', '옛날의 왈패', 35, 'HEAVY', Math.max(1.4, scale), 'BLADE', ['sk_kr_06', 'base_v_slash'],
        { rewardMoney: 100, rewardFame: 45 }
      );
      next.phase = 'BATTLE';
      return next;
    case 'karma_thug_pay_again':
      next.money = Math.max(0, next.money - 80);
      next.fame = Math.max(0, next.fame - 20);
      return addLog(next, '또다시 돈을 건네며 굴욕을 삼켰다.', 'WARN');

    case 'karma_mother_accept':
      next.money += 320;
      next.fame += 45;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 20, commerce: next.reputation.commerce + 15 };
      return addLog(next, '★ 거상으로 성장한 옛 소년이 은혜를 갚으며 320 재화를 바쳤다!', 'MAGIC');

    case 'karma_debt_bow':
      next.money += 60;
      next.fame += 30;
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 12, commerce: next.reputation.commerce + 10 };
      return addLog(next, '은퇴하는 영감이 장터 단골들에게 도장 이름을 널리 알려 주었다.', 'GOOD');

    case 'age35_body':
      next.stats = clampStatsByAge({ ...next.stats, str: next.stats.str + 3, agi: next.stats.agi + 3, vit: next.stats.vit + 2 }, next.age);
      return addLog(next, '서른다섯, 육체의 전성기를 끝까지 밀어붙이기로 다짐했다.', 'GOOD');
    case 'age35_mind':
      next.stats = clampStatsByAge({ ...next.stats, ins: next.stats.ins + 4, wil: next.stats.wil + 3, qi: next.stats.qi + 4 }, next.age);
      return addLog(next, '서른다섯, 힘보다 눈과 마음으로 베는 경지에 눈을 떴다.', 'GOOD');

    case 'age50_accept':
      next.stats = clampStatsByAge({ ...next.stats, ins: next.stats.ins + 6, wil: next.stats.wil + 5, qi: next.stats.qi + 5 }, next.age);
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 15 };
      return addLog(next, '쉰 살의 첫 백발과 함께, 노고수의 깊은 통찰이 열렸다.', 'MAGIC');

    case 'spouse_silver_ok': {
      const cap = getMaxHealthByAge(next.age, next.maxLifespanPenalty, next.equippedPassiveIds.includes('sk_kr_08'), next.facilities.clinic);
      next.health = Math.min(cap, next.health + 12);
      next.stats = clampStatsByAge({ ...next.stats, wil: next.stats.wil + 4 }, next.age);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 15 };
      return addLog(next, '함께 늙어 온 동반자와 차를 나누며 깊은 평온을 얻었다.', 'GOOD');
    }

    case 'write_manual_yes':
      next.health = Math.max(5, next.health - 8);
      next.fame += 80;
      next.flags = { ...next.flags, wroteManual: true };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 20 };
      return addLog(next, `★ 평생의 무도를 담은 『【${next.sectName}】 정통 비급 전서』를 탈고했다!`, 'MAGIC');

    default:
      return next;
  }
}

// =========================================================================
// v3.0 프린세스 메이커식 계절 계획 (1/n 배분) 실행 엔진
// =========================================================================

// ───────────────────────── 폐관수련(閉關修鍊) ─────────────────────────
// 계절 하나를 통째로 써서 관문을 닫고 초식 하나만 붙든다. 계절을 이어 폐관할수록 깨달음이 쌓이고,
// Lv.9 벽에 닿은 초식이 깨달음 100에 이르면 극의 돌파를 시도한다. 실패하면 주화입마.

// 이번 계절 폐관 대상 초식. 계획에 고른 초식이 없거나 이미 극의라면 벽에 닿은 초식 → 가장 높은 초식 순으로 고른다.
export function getSeclusionTargetId(state: GameState): string {
  const planned = state.seasonPlan.seclusionSkillId;
  if (planned && state.skills.some((s) => s.id === planned && s.masteryLevel < 10)) return planned;
  const wall = state.skills.find((s) => isAtMasteryWall(s));
  if (wall) return wall.id;
  const open = [...state.skills]
    .filter((s) => s.masteryLevel < 10)
    .sort((a, b) => b.masteryLevel - a.masteryLevel || b.masteryExp - a.masteryExp)[0];
  return open?.id || '';
}

// 지난 계절에 같은 초식으로 폐관했다면 이번 계절은 "이어지는" 폐관이다.
export function isSeclusionContinuing(state: GameState, skillId: string): boolean {
  const sec = state.seclusion;
  return !!sec && sec.skillId === skillId && sec.lastTurn === state.turn - 1;
}

// 이번 계절을 시작할 때 이어받는 깨달음. 같은 초식이라도 관을 나섰다 오면 절반이 흩어진다.
function carriedInsight(state: GameState, skillId: string): number {
  const sec = state.seclusion;
  if (!sec || sec.skillId !== skillId) return 0;
  return isSeclusionContinuing(state, skillId) ? sec.insight : Math.floor(sec.insight * 0.5);
}

// 한 계절 폐관으로 쌓이는 깨달음(평균). 정신·통찰·영력과 특수 수련장이 받쳐 준다.
// 기준: 중년의 평범한 고수(정신 60·통찰 60·영력 50·수련장 2단계)가 약 3계절에 100에 닿는다.
export function getSeclusionInsightPerSeason(state: GameState): number {
  const st = state.stats;
  const ageMult = state.age < 25 ? 0.8 : state.age >= 60 ? 1.15 : 1.0;
  const healthMult = state.health < 40 ? 0.6 : 1.0;
  const injuryMult = state.statuses.some((x) => x.id === 'HEAVY_INJURY' || x.id === 'INTERNAL_INJURY') ? 0.5 : 1.0;
  const base = 14 + st.wil * 0.12 + st.ins * 0.08 + st.qi * 0.06 + (state.facilities.sanctum - 1) * 4;
  return Math.max(8, Math.round(base * ageMult * healthMult * injuryMult));
}

// 깨달음이 가득 찬 뒤 벽을 깨뜨릴 확률. 극의는 일생을 걸어도 닿을까 말까 한 경지라, 한 번 두드려 열릴 확률은 반반 남짓이다.
// 금기·이계 초식은 반동이 크고, 쇠약한 몸은 버티지 못한다.
export function getBreakthroughChance(state: GameState, skill: Skill): number {
  let c = 0.38 + state.stats.wil * 0.002 + (state.facilities.sanctum - 1) * 0.03;
  if (skill.isForbidden) c -= 0.15;
  if (skill.origin.includes('FANTASY')) c -= 0.06;
  if (state.health < 40) c -= 0.12;
  // 극의는 세상에 하나뿐인 경지 — 이미 극의를 이룬 초식이 있으면 다음 벽은 훨씬 두껍다.
  const already = state.skills.filter((s) => s.masteryLevel >= 10).length;
  const repeatMult = TRANSCEND_REPEAT_MULT[Math.min(TRANSCEND_REPEAT_MULT.length - 1, already)];
  return Math.max(0.2, Math.min(0.72, c)) * repeatMult;
}

// 첫 극의 ×1, 두 번째 ×0.25, 세 번째 ×0.1, 그 너머 ×0.05
export const TRANSCEND_REPEAT_MULT = [1, 0.25, 0.1, 0.05];

// 돌파에 실패하면 깨달음이 이만큼으로 물러난다 (다시 두드리려면 한두 계절이 더 든다).
export const SECLUSION_FAIL_INSIGHT = 50;
// 실패 가운데 내력이 뒤틀려 주화입마로 번지는 비율. 나머지는 벽 앞에서 물러나는 데 그친다.
export const SECLUSION_DEVIATION_ON_FAIL = 0.4;

export interface SeclusionPreview {
  skill: Skill | null;
  atWall: boolean;
  continuing: boolean;
  seasonNo: number; // 이번이 연속 몇 번째 폐관 계절인가
  insight: number; // 이번 계절 시작 시 깨달음
  lostInsight: number; // 관을 나섰다 와서 흩어지는 깨달음
  perSeason: number;
  seasonsToFull: number;
  chance: number;
}

export function getSeclusionPreview(state: GameState, skillId?: string): SeclusionPreview {
  const id = skillId || getSeclusionTargetId(state);
  const skill = state.skills.find((s) => s.id === id) || null;
  const continuing = !!skill && isSeclusionContinuing(state, id);
  const insight = skill ? carriedInsight(state, id) : 0;
  const prevSame = state.seclusion && state.seclusion.skillId === id ? state.seclusion.insight : 0;
  const perSeason = getSeclusionInsightPerSeason(state);
  return {
    skill,
    atWall: !!skill && isAtMasteryWall(skill),
    continuing,
    seasonNo: continuing ? (state.seclusion?.seasons || 0) + 1 : 1,
    insight,
    lostInsight: Math.max(0, prevSame - insight),
    perSeason,
    seasonsToFull: insight >= 100 ? 0 : Math.ceil((100 - insight) / perSeason),
    chance: skill ? getBreakthroughChance(state, skill) : 0,
  };
}

const SECLUSION_FLAVOR: Record<'EARLY' | 'MID' | 'LATE', string[]> = {
  EARLY: [
    '벽을 마주 보고 앉았다. 제 숨소리마저 거슬린다.',
    '관문에 빗장을 걸자 바깥의 소리가 하나씩 멀어졌다.',
    '하루 한 끼 주먹밥만 문틈으로 들어온다.',
  ],
  MID: [
    '같은 초식을 머릿속으로만 만 번 휘둘렀다.',
    '돌아가신 스승의 목소리가 환청처럼 들렸다 사라진다.',
    '검로 하나하나가 낯설어졌다가, 다시 익숙해진다.',
    '꿈속에서 숙적과 백 합을 겨루고 깨어났다.',
  ],
  LATE: [
    '촛불 심지가 다 타도록 눈을 감고 있었다.',
    '손끝에 닿는 바람결이 어제와 다르다.',
    '관문 밖에서 제자들의 기합 소리가 아득하게 들려온다.',
  ],
};

export function getBookDecodeTarget(book: Book): number {
  if (book.decodeApRequired <= 0) return 0;
  if (book.rarity === 'GRIMOIRE') return 260;
  if (book.rarity === 'LEGEND') return 180;
  return 100;
}

export function executeScheduleActivity(
  state: GameState,
  activity: ScheduleActivityId,
  share: number, // 1/n (1.0, 0.5, 0.333, 0.25)
  phase: 'EARLY' | 'MID' | 'LATE'
): { state: GameState; tick: SeasonTickResult; triggerSparBattle?: boolean } {
  const phaseLabel = phase === 'EARLY' ? '초순' : phase === 'MID' ? '중순' : '하순';
  const injuredPenalty = state.statuses.some((s) => s.id === 'HEAVY_INJURY') ? 0.75 : 1.0;
  const eff = share * injuredPenalty;
  const cMeta = COUNTRIES[state.country];

  let next: GameState = { ...state, stats: { ...state.stats }, reputation: { ...state.reputation } };
  let location: SeasonTickResult['location'] = 'YARD';
  let floatingText = '';
  let floatingColor = '#fde68a';
  const feedLines: SeasonTickResult['feedLines'] = [];
  let triggerSparBattle = false;

  const aliveDisciples = next.disciples.filter((d) => !d.dead);
  const aliveCount = aliveDisciples.length;
  let discipleBadgeText = '';

  // 1. 작업별 기본 효과 (비중 배분 + 문하생 동반 참여/성장/시너지!)
  if (activity === 'TRAIN') {
    location = 'DUMMY';
    const skId = next.seasonPlan.trainSkillId || next.skills[0]?.id;
    const idx = next.skills.findIndex((s) => s.id === skId);
    if (idx !== -1) {
      const sk = next.skills[idx];
      const seasonMult = next.season === 'SUMMER' ? 1.15 : 1.0;
      const ageMult = next.age < 20 ? 1.25 : next.age < 35 ? 1.12 : next.age < 50 ? 1.18 : 1.08;
      const facMult = 1 + (next.facilities.yard - 1) * 0.12 + (sk.origin.includes('FANTASY') ? (next.facilities.sanctum - 1) * 0.18 : 0);
      const jpBonus = next.country === 'JAPAN' && sk.weapon === 'BLADE' ? 1.1 : 1.0;
      const sparSynergy = 1 + Math.min(0.24, aliveCount * 0.04); // 문하생과 합동 연마 시너지!
      const expGain = Math.max(10, Math.round(110 * eff * seasonMult * ageMult * facMult * jpBonus * sparSynergy));
      const { updated, leveledUp, triggeredTrait } = gainSkillExp(sk, expGain);
      const nextSkills = [...next.skills];
      nextSkills[idx] = updated;
      next.skills = nextSkills;
      if (triggeredTrait) next.pendingTraitSkillId = updated.id;
      if (Math.random() < eff * 1.4) {
        if (sk.form === 'SLASH' || sk.form === 'STRIKE' || sk.form === 'GRAPPLE') next.stats.str += 1;
        if (sk.form === 'THRUST' || sk.form === 'STEP') next.stats.agi += 1;
        if (sk.element !== 'PHYSICAL' || sk.form === 'AURA') next.stats.qi += 2;
        next.stats.ins += 1;
      }
      // 문하생도 함께 마당에서 초식 연마하며 동반 성장!
      if (aliveCount > 0) {
        const dExp = Math.max(8, Math.round(45 * eff));
        next.disciples = next.disciples.map((d) => {
          if (d.dead) return d;
          return {
            ...d,
            stats: {
              ...d.stats,
              str: d.stats.str + (Math.random() < eff * 0.7 ? 1 : 0),
              ins: d.stats.ins + (Math.random() < eff * 0.6 ? 1 : 0),
            },
            skills: d.skills.map((s) => gainSkillExp(s, dExp).updated),
          };
        });
        discipleBadgeText = `문하생 ${aliveCount}명 합동 연마`;
      }
      next.reputation.ascetic += Math.max(1, Math.round(2 * eff));
      floatingText = `${updated.customName || updated.name} +${expGain}`;
      floatingColor = leveledUp ? '#fde047' : '#fbbf24';
      feedLines.push({
        text: `[${phaseLabel}] 「${updated.customName || updated.name}」 연마 (EXP +${expGain}${leveledUp ? ` → Lv.${updated.masteryLevel} 돌파!` : ''}${aliveCount > 0 ? ` · 문하생 ${aliveCount}명 동반 성장` : ''})`,
        tone: leveledUp ? 'GOOD' : 'NORMAL',
      });
      if (isAtMasteryWall(updated)) {
        floatingText = '벽(壁)';
        feedLines.push({ text: `  ↳ 더는 늘지 않는다. 벽에 부딪혔다 — 폐관수련으로만 극의에 이를 수 있다.`, tone: 'WARN' });
      }
    }
  } else if (activity === 'BODY') {
    location = 'YARD';
    const ageMult = next.age < 35 ? 1.35 : next.age < 50 ? 1.0 : 0.65;
    const gain = Math.max(1, Math.round(3 * eff * ageMult));
    next.stats.str += gain;
    next.stats.agi += gain;
    next.stats.vit += gain;
    if (aliveCount > 0) {
      const dGain = Math.max(1, Math.round(2 * eff));
      next.disciples = next.disciples.map((d) =>
        d.dead ? d : { ...d, stats: { ...d.stats, str: d.stats.str + dGain, agi: d.stats.agi + dGain, vit: d.stats.vit + dGain } }
      );
      discipleBadgeText = `문하생 ${aliveCount}명 근력·체력↑`;
    }
    next.reputation.ascetic += Math.max(1, Math.round(2 * eff));
    floatingText = `STR·AGI·VIT +${gain}`;
    floatingColor = '#4ade80';
    feedLines.push({
      text: `[${phaseLabel}] 신체 단련 (근력·민첩·체력 +${gain}${aliveCount > 0 ? ` · 문하생 ${aliveCount}명 함께 단련` : ''})`,
      tone: 'NORMAL',
    });
  } else if (activity === 'MIND') {
    location = 'HALL';
    const ageMult = next.age >= 50 ? 1.45 : next.age >= 35 ? 1.25 : 1.0;
    const krBonus = next.country === 'KOREA' ? 1 : 0;
    const sanctumBonus = next.facilities.sanctum >= 2 ? 1 : 0;
    const wGain = Math.max(1, Math.round(3 * eff * ageMult)) + (eff >= 0.5 ? krBonus : 0);
    const qGain = Math.max(1, Math.round(4 * eff * ageMult)) + sanctumBonus;
    next.stats.wil += wGain;
    next.stats.ins += Math.max(1, Math.round(3 * eff * ageMult));
    next.stats.qi += qGain;
    if (aliveCount > 0) {
      const dGain = Math.max(1, Math.round(2 * eff));
      next.disciples = next.disciples.map((d) =>
        d.dead ? d : { ...d, stats: { ...d.stats, wil: d.stats.wil + dGain, ins: d.stats.ins + dGain, qi: d.stats.qi + dGain } }
      );
      discipleBadgeText = `문하생 ${aliveCount}명 기공 수련`;
    }
    next.reputation.ascetic += Math.max(1, Math.round(2 * eff));
    floatingText = `WIL·INS·QI +${qGain}`;
    floatingColor = '#60a5fa';
    feedLines.push({
      text: `[${phaseLabel}] 기공 명상 (정신 +${wGain}, 영력 +${qGain}${aliveCount > 0 ? ` · 문하생 ${aliveCount}명 함께 명상` : ''})`,
      tone: 'NORMAL',
    });
  } else if (activity === 'DECODE') {
    location = 'LIBRARY';
    const targetBook =
      next.books.find((b) => b.id === next.seasonPlan.decodeBookId && !b.decoded) ||
      next.books.find((b) => !b.decoded);
    if (targetBook) {
      const maxMastery = Math.max(...next.skills.map((s) => s.masteryLevel));
      const blockedLv = targetBook.requiresMasteryLv && maxMastery < targetBook.requiresMasteryLv;
      const blockedQi = targetBook.requiresQi && next.stats.qi < targetBook.requiresQi;
      if (blockedLv || blockedQi) {
        floatingText = '수련 조건 부족';
        floatingColor = '#f87171';
        feedLines.push({
          text: `[${phaseLabel}] ${targetBook.title} 이해 난항 (필요 Lv.${targetBook.requiresMasteryLv || 1} / 영력 ${targetBook.requiresQi || 0})`,
          tone: 'WARN',
        });
      } else {
        const helperMult = 1 + Math.min(0.28, aliveCount * 0.06);
        const libMult = (1 + (next.facilities.library - 1) * 0.2 + (next.season === 'WINTER' ? 0.2 : 0) + (next.spouse?.alive && (next.spouse.bonusType === 'SCHOLAR' || next.spouse.bonusType === 'WESTERN') ? 0.3 : 0)) * helperMult;
        const progGain = Math.max(18, Math.round(105 * eff * libMult));
        if (aliveCount > 0) {
          next.disciples = next.disciples.map((d) =>
            d.dead ? d : { ...d, stats: { ...d.stats, ins: d.stats.ins + (Math.random() < eff * 0.7 ? 1 : 0) } }
          );
          discipleBadgeText = `문하생 ${aliveCount}명 필사 보조`;
        }
        const targetPts = getBookDecodeTarget(targetBook);
        const nextProg = targetBook.decodeProgress + progGain;
        const done = nextProg >= targetPts;
        next.books = next.books.map((b) => (b.id === targetBook.id ? { ...b, decodeProgress: Math.min(targetPts, nextProg), decoded: done } : b));
        if (done) {
          // 미해독 서적이 더 이상 없으면 계획에서 DECODE 자동 해제
          const remainingUnread = next.books.find((b) => !b.decoded);
          if (!remainingUnread) {
            const cleaned = next.seasonPlan.activities.filter((a) => a !== 'DECODE');
            next.seasonPlan = { ...next.seasonPlan, decodeBookId: '', activities: cleaned.length > 0 ? cleaned : ['TRAIN'] };
          } else {
            next.seasonPlan = { ...next.seasonPlan, decodeBookId: remainingUnread.id };
          }
          if (targetBook.isLegacy && targetBook.legacySkill) {
            const learned = { ...targetBook.legacySkill, masteryLevel: Math.min(3, targetBook.legacySkill.masteryLevel) };
            next.skills = [...next.skills, learned];
            floatingText = `전생 비급 습득!`;
            floatingColor = '#e879f9';
            feedLines.push({ text: `[${phaseLabel}] ★ ${targetBook.title} 독파 완료! 「${learned.customName || learned.name}」 습득!`, tone: 'MAGIC' });
          } else {
            const tpl = BOOK_SKILL_TEMPLATES[targetBook.skillTemplateId];
            if (tpl && !next.skills.some((s) => s.id === tpl.id)) {
              const learned: Skill = { ...tpl, masteryLevel: 1, masteryExp: 0, imprintedTraits: [] };
              next.skills = [...next.skills, learned];
              const maxA = getMaxActiveSlots(next.stats.ins);
              if (!learned.isPassive && next.equippedActiveIds.length < maxA) {
                next.equippedActiveIds = [...next.equippedActiveIds, learned.id];
              }
              if (targetBook.rarity === 'GRIMOIRE') next.reputation.arcane += 18;
              floatingText = `「${learned.name}」 습득!`;
              floatingColor = targetBook.rarity === 'GRIMOIRE' ? '#e879f9' : '#4ade80';
              feedLines.push({
                text: `[${phaseLabel}] ★ ${targetBook.title} 독파 완료! ${targetBook.enlightenmentText || `「${learned.name}」 습득!`}`,
                tone: targetBook.rarity === 'GRIMOIRE' ? 'MAGIC' : 'GOOD',
              });
            }
          }
        } else {
          floatingText = `연구 +${progGain}%`;
          floatingColor = '#a78bfa';
          feedLines.push({
            text: `[${phaseLabel}] ${targetBook.title} 연구 (${Math.round((nextProg / Math.max(1, targetPts)) * 100)}%)`,
            tone: 'NORMAL',
          });
        }
      }
    } else {
      floatingText = '읽을 서적 없음';
      floatingColor = '#94a3b8';
    }
  } else if (activity === 'CRAFT') {
    location = 'LIBRARY';
    if (next.activeCraft) {
      const libMult = 1 + (next.facilities.library - 1) * 0.15 + (next.season === 'WINTER' ? 0.2 : 0);
      const gain = Math.max(20, Math.round(105 * eff * libMult));
      const newProg = next.activeCraft.progress + gain;
      if (newProg >= 100) {
        const proj = next.activeCraft;
        // AP 조건 없이 즉시 완성 실행 + 계획에서 CRAFT 자동 해제!
        const tempSt = { ...next, ap: 1 };
        const res = performCraftSkill(tempSt, proj.skillAId, proj.skillBId, proj.customName);
        const cleanedActs = res.state.seasonPlan.activities.filter((a) => a !== 'CRAFT');
        next = {
          ...res.state,
          activeCraft: null,
          seasonPlan: { ...res.state.seasonPlan, activities: cleanedActs.length > 0 ? cleanedActs : ['TRAIN'] },
        };
        floatingText = res.crafted ? `★「${res.crafted.customName}」 창시!` : '조합 완료';
        floatingColor = '#fde047';
        feedLines.push({
          text: `[${phaseLabel}] ★ 신규 초식 「${res.crafted?.customName || proj.customName}」 창시 완성!`,
          tone: res.crafted?.origin.includes('FANTASY') || res.crafted?.isForbidden ? 'MAGIC' : 'GOOD',
        });
      } else {
        next.activeCraft = { ...next.activeCraft, progress: newProg };
        floatingText = `조합 연구 ${newProg}%`;
        floatingColor = '#c084fc';
        feedLines.push({ text: `[${phaseLabel}] 「${next.activeCraft.customName}」 창안 연구 (${newProg}%)`, tone: 'NORMAL' });
      }
    } else {
      floatingText = '조합 프로젝트 미설정';
      floatingColor = '#94a3b8';
    }
  } else if (activity === 'BUILD') {
    location = 'FORGE';
    if (next.activeBuild) {
      const proj = next.activeBuild;
      // 문하생이 많을수록 증축 공사 기간이 대폭 단축!
      const progGain = Math.max(18, Math.round((54 + aliveCount * 15 + next.stats.str * 0.25) * eff));
      const newProg = Math.min(100, proj.progress + progGain);
      if (aliveCount > 0) {
        next.disciples = next.disciples.map((d) =>
          d.dead
            ? d
            : {
                ...d,
                loyalty: Math.min(100, d.loyalty + Math.max(1, Math.round(4 * eff))),
                stats: { ...d.stats, str: d.stats.str + (Math.random() < eff * 0.6 ? 1 : 0), vit: d.stats.vit + (Math.random() < eff * 0.6 ? 1 : 0) },
              }
        );
        discipleBadgeText = `문하생 ${aliveCount}명 일손 가속!`;
      }
      if (newProg >= 100) {
        const cleaned = next.seasonPlan.activities.filter((a) => a !== 'BUILD');
        next.facilities = { ...next.facilities, [proj.facilityKey]: proj.targetLevel };
        next.activeBuild = null;
        next.fame += 15;
        next.seasonPlan = { ...next.seasonPlan, activities: cleaned.length > 0 ? cleaned : ['TRAIN'] };
        floatingText = `★【${proj.targetName}】 완공!`;
        floatingColor = '#fde047';
        feedLines.push({
          text: `[${phaseLabel}] ★ ${FACILITY_INFO[proj.facilityKey].name} → 【${proj.targetName}】 증축 완공! (명성 +15)`,
          tone: 'MAGIC',
        });
        next = addLog(next, `${FACILITY_INFO[proj.facilityKey].name}을(를) 【${proj.targetName}】 단계로 완공했다!`, 'GOOD');
      } else {
        next.activeBuild = { ...proj, progress: newProg };
        floatingText = `공사 ${newProg}%`;
        floatingColor = '#fbbf24';
        feedLines.push({
          text: `[${phaseLabel}] 【${proj.targetName}】 증축 공사 (${newProg}%${aliveCount > 0 ? ` · 문하생 ${aliveCount}명 합력` : ''})`,
          tone: 'NORMAL',
        });
      }
    } else {
      floatingText = '진행 중인 공사 없음';
      floatingColor = '#94a3b8';
    }
  } else if (activity === 'TEACH') {
    location = 'YARD';
    const alive = next.disciples.filter((d) => !d.dead);
    if (alive.length > 0) {
      const spouseBonus = next.spouse?.alive && next.spouse.bonusType === 'COMBAT' ? 1.2 : 1.0;
      const expGain = Math.max(15, Math.round(90 * eff * spouseBonus));
      next.disciples = next.disciples.map((d) => {
        if (d.dead) return d;
        return {
          ...d,
          loyalty: Math.min(100, d.loyalty + Math.max(2, Math.round(8 * eff))),
          stats: {
            ...d.stats,
            str: d.stats.str + (Math.random() < eff * 1.4 ? 1 : 0),
            agi: d.stats.agi + (Math.random() < eff * 1.4 ? 1 : 0),
            ins: d.stats.ins + (Math.random() < eff * 1.4 ? 1 : 0),
            qi: d.stats.qi + (Math.random() < eff * (d.isGenius ? 2 : 1) ? 1 : 0),
          },
          skills: d.skills.map((s) => gainSkillExp(s, expGain).updated),
        };
      });
      next.authority += Math.max(1, Math.round(3 * eff));
      discipleBadgeText = `문하생 ${alive.length}명 집중 성장`;
      floatingText = `제자 지도 +${expGain}`;
      floatingColor = '#38bdf8';
      feedLines.push({ text: `[${phaseLabel}] 문하생 ${alive.length}명 지도 (전원 EXP +${expGain})`, tone: 'GOOD' });
    } else {
      floatingText = '문하생 없음';
      floatingColor = '#94a3b8';
    }
  } else if (activity === 'ESCORT') {
    location = 'GATE';
    const diffCfg = getDifficultyConfig(next);
    // 문하생 합동 호위 보너스 × 난이도 수입 배수
    const escortRoles = aliveDisciples.filter((d) => d.role === 'ESCORT').length;
    const discipleMoneyMult = 1 + Math.min(1.3, aliveCount * 0.09 + escortRoles * 0.09);
    const pay = Math.max(
      8,
      Math.round((40 + Math.min(45, next.stats.str * 0.55) + (next.country === 'CHINA' ? 8 : 0)) * discipleMoneyMult * eff * diffCfg.incomeMult)
    );
    next.money += pay;
    next.reputation.commerce += Math.max(2, Math.round(7 * eff));
    if (Math.random() < eff) next.stats.vit += 1;

    // ★ [어려움 / 지옥] 호위 중 산적·마적 습격 → 주인공 & 동행 문하생 중상/전사 위험! ★
    let escortDangerLog: string | null = null;
    if (diffCfg.escortHeroHazardRate > 0) {
      const combatProtect = Math.min(0.45, (next.stats.str + next.stats.agi + next.stats.ins) * 0.0022);
      const heroHazardProb = diffCfg.escortHeroHazardRate * eff * (1 - combatProtect);
      if (Math.random() < heroHazardProb) {
        const isLethalAmbush = Math.random() < diffCfg.escortHeroDeathChance;
        const dmg = isLethalAmbush
          ? (diffCfg.id === 'HELL' ? 46 : 36)
          : (diffCfg.id === 'HELL' ? 18 : 13) + Math.floor(Math.random() * 8);
        next.health = Math.max(0, next.health - dmg);
        next.statuses = [...next.statuses, { id: isLethalAmbush ? 'HEAVY_INJURY' : 'LIGHT_INJURY', label: '호위 중 산적 자상', turnsRemaining: 2 }];
        if (next.health <= 0 || (isLethalAmbush && Math.random() < (diffCfg.id === 'HELL' ? 0.35 : 0.16))) {
          next.phase = 'ENDING';
          next.health = 0;
          next.deathCause = '호위 임무 중 전사';
          escortDangerLog = `☠ 호위 도중 매복한 마적 떼의 독화살과 기습을 맞고 끝내 전사했다…`;
          next = addLog(next, escortDangerLog, 'DANGER');
        } else {
          escortDangerLog = isLethalAmbush
            ? `⚠ 호위 중 마적 두목의 기습에 치명적인 중상을 입었다! (건강 -${dmg})`
            : `⚠ 호위 중 산적 떼의 습격을 받아 큰 부상을 입었다! (건강 -${dmg})`;
          next = addLog(next, escortDangerLog, 'DANGER');
        }
      }
      // 동행 문하생 중상/전사 판정
      const escortCandidates = next.disciples.filter((d) => !d.dead && !d.isChild);
      if (escortCandidates.length > 0 && Math.random() < diffCfg.escortDiscipleCasualtyRate * eff) {
        const victim = escortCandidates[Math.floor(Math.random() * escortCandidates.length)];
        const discPower = Math.min(0.4, (victim.stats.str + victim.stats.vit) * 0.0035);
        if (Math.random() < 0.45 * (1 - discPower)) {
          next.disciples = next.disciples.map((d) =>
            d.id === victim.id ? { ...d, dead: true, leftReason: '호위 임무 중 산적 습격으로 전사' } : d
          );
          const dMsg = `☠ 비보! 합동 호위에 나섰던 문하생 ${victim.name}이(가) 산적의 칼에 맞아 전사했다…`;
          next = addLog(next, dMsg, 'DANGER');
          feedLines.push({ text: `[${phaseLabel}] ${dMsg}`, tone: 'WARN' });
        } else {
          next.disciples = next.disciples.map((d) =>
            d.id === victim.id ? { ...d, stats: { ...d.stats, vit: Math.max(10, d.stats.vit - 2) } } : d
          );
          const dMsg = `⚠ 합동 호위 중 문하생 ${victim.name}이(가) 산적과 교전하다 중상을 입었다. (체력 -2)`;
          next = addLog(next, dMsg, 'WARN');
          feedLines.push({ text: `[${phaseLabel}] ${dMsg}`, tone: 'WARN' });
        }
      }
    }

    if (aliveCount > 0) {
      next.disciples = next.disciples.map((d) =>
        d.dead
          ? d
          : {
              ...d,
              loyalty: Math.min(100, d.loyalty + Math.max(1, Math.round(3 * eff))),
              stats: { ...d.stats, str: d.stats.str + (Math.random() < eff * 0.65 ? 1 : 0), agi: d.stats.agi + (Math.random() < eff * 0.65 ? 1 : 0) },
            }
      );
      discipleBadgeText = `문하생 ${aliveCount}명 합동 호위 (+${Math.round((discipleMoneyMult - 1) * 100)}%)`;
    }
    floatingText = escortDangerLog ? '⚠ 호위 습격!' : `+${pay}${cMeta.currency}`;
    floatingColor = escortDangerLog ? '#f43f5e' : '#fbbf24';
    feedLines.push({
      text: escortDangerLog
        ? `[${phaseLabel}] ${escortDangerLog} (+${pay}${cMeta.currency})`
        : `[${phaseLabel}] 호위 · 생계 의뢰 수행 (+${pay}${cMeta.currency}${aliveCount > 0 ? ` · 문하생 ${aliveCount}명 합동` : ''})`,
      tone: escortDangerLog ? 'WARN' : 'GOOD',
    });
  } else if (activity === 'REST') {
    location = 'CLINIC';
    const clinicBonus = (next.facilities.clinic - 1) * 7;
    const spouseBonus = next.spouse?.alive && next.spouse.bonusType === 'CLINIC' ? 10 : 0;
    const heal = Math.max(6, Math.round((26 + clinicBonus + spouseBonus) * eff));
    if (aliveCount > 0) {
      next.disciples = next.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + Math.max(1, Math.round(4 * eff))) }));
      discipleBadgeText = `문하생 ${aliveCount}명 휴식·충성↑`;
    }
    const maxCap = getMaxHealthByAge(next.age, next.maxLifespanPenalty, next.equippedPassiveIds.includes('sk_kr_08'), next.facilities.clinic);
    next.health = Math.min(maxCap, next.health + heal);
    next.statuses = next.statuses
      .map((st) => ({ ...st, turnsRemaining: st.turnsRemaining - (eff >= 0.5 ? 1 : 0) }))
      .filter((st) => st.turnsRemaining > 0);
    floatingText = `♥ +${heal}`;
    floatingColor = '#34d399';
    feedLines.push({ text: `[${phaseLabel}] 약방 휴식 및 치료 (건강 +${heal})`, tone: 'GOOD' });
  } else if (activity === 'SECLUSION') {
    location = 'HALL';
    // 같은 계절 안에서는 처음 정한 대상을 끝까지 붙든다 (중간에 극의를 이뤄도 대상이 바뀌지 않게).
    const sameSeason = next.seclusion && next.seclusion.lastTurn === next.turn ? next.seclusion : null;
    const skId = sameSeason ? sameSeason.skillId : getSeclusionTargetId(next);
    const idx = next.skills.findIndex((s) => s.id === skId);
    if (idx !== -1) {
      if (!sameSeason) {
        const continuing = isSeclusionContinuing(next, skId);
        const prev = next.seclusion;
        const carried = carriedInsight(next, skId);
        if (prev && prev.skillId === skId && !continuing && prev.insight - carried >= 5) {
          feedLines.push({ text: `  ↳ 관을 나섰던 사이 쌓아 둔 깨달음이 반쯤 흩어졌다 (깨달음 ${prev.insight}% → ${carried}%)`, tone: 'WARN' });
        }
        const seasons = continuing && prev ? prev.seasons + 1 : 1;
        next.seclusion = { skillId: skId, insight: carried, seasons, lastTurn: next.turn };
        const sk0 = next.skills[idx];
        feedLines.push({
          text: `[${phaseLabel}] 관문을 닫았다. 「${sk0.customName || sk0.name}」 하나만을 붙들고 폐관 ${seasons}계절째에 든다.`,
          tone: 'MAGIC',
        });
      }

      const sec = next.seclusion!;
      const sk = next.skills[idx];
      const skName = sk.customName || sk.name;

      if (sk.masteryLevel >= 10) {
        // 극의를 이룬 뒤 남은 시간은 깨달음을 갈무리하는 데 쓴다.
        next.stats.wil += 1;
        next.stats.qi += 1;
        floatingText = '극의 갈무리';
        floatingColor = '#c084fc';
        feedLines.push({ text: `[${phaseLabel}] 「${skName}」의 극의를 갈무리하며 마음을 가라앉힌다 (정신 +1, 영력 +1)`, tone: 'MAGIC' });
      } else {
        const facMult = 1 + (next.facilities.sanctum - 1) * 0.1;
        // 깨달음이 가득 찼는데 아직 벽에 닿지 않았다면, 넘치는 깨달음이 숙련으로 흘러든다.
        const overflowMult = sec.insight >= 100 && !isAtMasteryWall(sk) ? 1.6 : 1.0;
        const expGain = Math.max(8, Math.round(110 * eff * 0.75 * facMult * overflowMult));
        const { updated, leveledUp, triggeredTrait } = gainSkillExp(sk, expGain);
        const nextSkills = [...next.skills];
        nextSkills[idx] = updated;
        next.skills = nextSkills;
        if (triggeredTrait) next.pendingTraitSkillId = updated.id;

        const insightGain = Math.max(3, Math.round(getSeclusionInsightPerSeason(next) * eff * (0.75 + Math.random() * 0.5)));
        let insight = Math.min(100, sec.insight + insightGain);

        if (Math.random() < 0.75) next.stats.wil += 1;
        if (Math.random() < 0.7) next.stats.qi += 1;
        if (Math.random() < 0.5) next.stats.ins += 1;
        next.reputation.ascetic += Math.max(1, Math.round(3 * eff));

        floatingText = `깨달음 ${insight}%`;
        floatingColor = '#c084fc';
        feedLines.push({
          text: `[${phaseLabel}] 폐관 중 「${skName}」의 구결을 되새긴다 (깨달음 ${sec.insight}% → ${insight}%, EXP +${expGain}${leveledUp ? ` → Lv.${updated.masteryLevel} 돌파!` : ''})`,
          tone: leveledUp ? 'GOOD' : 'MAGIC',
        });
        if (Math.random() < 0.5) {
          const pool = SECLUSION_FLAVOR[phase];
          feedLines.push({ text: `  ↳ ${pool[Math.floor(Math.random() * pool.length)]}`, tone: 'NORMAL' });
        }

        // 가벼운 주화입마 — 금기·이계 초식이나 쇠약한 몸일수록 기혈이 엇나간다.
        const deviationRisk =
          (0.012 + (sk.isForbidden ? 0.05 : 0) + (sk.origin.includes('FANTASY') ? 0.025 : 0) + (next.health < 35 ? 0.03 : 0)) *
          Math.max(0.4, 1 - next.stats.wil / 150);
        if (Math.random() < deviationRisk) {
          const hurt = 8 + Math.floor(Math.random() * 7);
          next.health = Math.max(1, next.health - hurt);
          insight = Math.max(0, insight - 20);
          if (!next.statuses.some((x) => x.id === 'INTERNAL_INJURY')) {
            next.statuses = [...next.statuses, { id: 'INTERNAL_INJURY', label: '내상', turnsRemaining: 2 }];
          }
          feedLines.push({ text: `  ↳ ⚠ 기혈이 거꾸로 치솟았다! 가벼운 주화입마 (건강 -${hurt}, 깨달음 -20)`, tone: 'WARN' });
        }
        next.seclusion = { ...sec, insight };

        // 극의 돌파 판정 — Lv.9 벽에 닿은 초식이 깨달음 100에 이르면 벽을 두드린다.
        const cur = next.skills[idx];
        if (insight >= 100 && isAtMasteryWall(cur)) {
          const chance = getBreakthroughChance(next, cur);
          if (Math.random() < chance) {
            const transcended = transcendSkill(cur);
            const copy = [...next.skills];
            copy[idx] = transcended;
            next.skills = copy;
            next.pendingTraitSkillId = transcended.id;
            next.seclusion = { ...sec, insight: 0 };
            next.stats.wil += 3;
            next.stats.qi += 3;
            next.stats.ins += 3;
            next.fame += 40;
            floatingText = '극의 돌파!';
            floatingColor = '#f0abfc';
            feedLines.push({
              text: `★ 벽이 무너졌다! 「${skName}」 극의(極意) 돌파 — ${TRANSCEND_SUMMARY}`,
              tone: 'MAGIC',
            });
            next = addLog(next, `폐관 ${sec.seasons}계절 만에 벽이 무너졌다. 「${skName}」이(가) 극의(極意)에 이르렀다!`, 'MAGIC');
          } else if (Math.random() >= SECLUSION_DEVIATION_ON_FAIL) {
            // 벽이 흔들렸으나 무너지지 않았다 — 몸은 멀쩡하지만 깨달음이 물러난다.
            next.seclusion = { ...sec, insight: SECLUSION_FAIL_INSIGHT };
            floatingText = '벽이 버텼다';
            floatingColor = '#a78bfa';
            feedLines.push({
              text: `✖ 벽이 흔들렸으나 끝내 무너지지 않았다. 손에 잡힐 듯하던 깨달음이 멀어진다 (깨달음 ${SECLUSION_FAIL_INSIGHT}%로 후퇴)`,
              tone: 'WARN',
            });
            next = addLog(next, `「${skName}」의 벽을 두드렸으나 열리지 않았다. 관문 안에서 다시 마음을 다잡는다.`, 'WARN');
          } else {
            const hurt = Math.round((12 + Math.random() * 10) * Math.max(0.6, 1 - next.stats.wil / 200));
            next.health = Math.max(0, next.health - hurt);
            next.maxLifespanPenalty += 1;
            next.statuses = [
              ...next.statuses.filter((x) => x.id !== 'INTERNAL_INJURY'),
              { id: 'INTERNAL_INJURY', label: '내상', turnsRemaining: 3 },
            ];
            next.seclusion = { ...sec, insight: Math.max(0, SECLUSION_FAIL_INSIGHT - 20) };
            floatingText = '주화입마!';
            floatingColor = '#f43f5e';
            feedLines.push({
              text: `✖ 벽 앞에서 내력이 뒤틀렸다! 주화입마 — 건강 -${hurt}, 수명 -1년, 깨달음 ${Math.max(0, SECLUSION_FAIL_INSIGHT - 20)}%로 후퇴`,
              tone: 'WARN',
            });
            next = addLog(next, `「${skName}」의 벽을 깨려다 내력이 뒤틀려 주화입마에 빠졌다.`, 'DANGER');
            if (next.health <= 0) {
              next.phase = 'ENDING';
              next.deathCause = '폐관 중 주화입마';
              next = addLog(next, `${next.year}년 ${SEASON_META[next.season].label}, 닫힌 관문 안에서 향년 ${next.age}세로 숨을 거두었다.`, 'DANGER');
            }
          }
        }
      }

      // 하순: 스승 없이 보낸 계절 — 문하생들이 서운해한다 (온순·강직한 제자는 덜하다).
      if (phase === 'LATE' && aliveCount > 0 && next.phase === 'MAIN') {
        next.disciples = next.disciples.map((d) => {
          if (d.dead) return d;
          const drop = d.temperament === 'GENTLE' || d.temperament === 'UPRIGHT' ? 1 : 2;
          return { ...d, loyalty: Math.max(0, d.loyalty - drop) };
        });
        discipleBadgeText = `문하생 ${aliveCount}명 스승 부재`;
        feedLines.push({ text: `[${phaseLabel}] 문하생들은 닫힌 관문 앞에서 저희끼리 수련했다 (충성 -1~2)`, tone: 'NORMAL' });
      }
    }
  } else if (activity === 'SPAR') {
    location = 'GATE';
    triggerSparBattle = true;
    floatingText = '타류 대련 출격!';
    floatingColor = '#f87171';
    feedLines.push({ text: `[${phaseLabel}] 타 도장 사범과 친선 대련을 벌인다!`, tone: 'NORMAL' });
  }

  let minorEventText: string | undefined;
  let minorEventTone: 'NORMAL' | 'GOOD' | 'WARN' | 'MAGIC' | undefined;

  // 2. 작업별 사소한 이벤트 (약 55% 확률) + 하순 계절 일상 이벤트
  const rollMinor = (act?: ScheduleActivityId) => {
    const ev = pickMinorEvent(next, act);
    if (!ev) return;
    const res = ev.apply(next, eff);
    if (res.statsDelta) {
      if (res.statsDelta.str) next.stats.str += res.statsDelta.str;
      if (res.statsDelta.agi) next.stats.agi += res.statsDelta.agi;
      if (res.statsDelta.vit) next.stats.vit += res.statsDelta.vit;
      if (res.statsDelta.wil) next.stats.wil += res.statsDelta.wil;
      if (res.statsDelta.ins) next.stats.ins += res.statsDelta.ins;
      if (res.statsDelta.qi) next.stats.qi += res.statsDelta.qi;
    }
    if (res.moneyDelta) next.money = Math.max(0, next.money + res.moneyDelta);
    if (res.fameDelta) next.fame = Math.max(0, next.fame + res.fameDelta);
    if (res.healthDelta) {
      const maxCap = getMaxHealthByAge(next.age, next.maxLifespanPenalty, next.equippedPassiveIds.includes('sk_kr_08'), next.facilities.clinic);
      next.health = Math.max(1, Math.min(maxCap, next.health + res.healthDelta));
    }
    if (res.skillExpBonus && next.skills.length > 0) {
      const sIdx = Math.max(0, next.skills.findIndex((s) => s.id === next.seasonPlan.trainSkillId));
      const { updated, triggeredTrait } = gainSkillExp(next.skills[sIdx], res.skillExpBonus);
      const copy = [...next.skills];
      copy[sIdx] = updated;
      next.skills = copy;
      if (triggeredTrait) next.pendingTraitSkillId = updated.id;
    }
    if (res.decodeBonus) {
      const bIdx = next.books.findIndex((b) => !b.decoded);
      if (bIdx !== -1) {
        const bk = next.books[bIdx];
        const target = getBookDecodeTarget(bk);
        const np = Math.min(target, bk.decodeProgress + res.decodeBonus);
        const copy = [...next.books];
        copy[bIdx] = { ...bk, decodeProgress: np };
        next.books = copy;
      }
    }
    if (res.craftBonus && next.activeCraft) {
      next.activeCraft = { ...next.activeCraft, progress: Math.min(99, next.activeCraft.progress + res.craftBonus) };
    }
    if (res.repDelta) {
      if (res.repDelta.virtue) next.reputation.virtue += res.repDelta.virtue;
      if (res.repDelta.ruthless) next.reputation.ruthless += res.repDelta.ruthless;
      if (res.repDelta.commerce) next.reputation.commerce += res.repDelta.commerce;
      if (res.repDelta.ascetic) next.reputation.ascetic += res.repDelta.ascetic;
      if (res.repDelta.arcane) next.reputation.arcane += res.repDelta.arcane;
    }
    if (res.loyaltyDelta) {
      next.disciples = next.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + res.loyaltyDelta!) }));
    }
    if (!next.flags.minorEventIdsSeen.includes(ev.id)) {
      next.flags = { ...next.flags, minorEventIdsSeen: [...next.flags.minorEventIdsSeen, ev.id] };
    }
    if (!minorEventText) {
      minorEventText = ev.text;
      minorEventTone = ev.tone;
    }
    feedLines.push({ text: `  ↳ ${ev.text}`, tone: ev.tone });
    next = addLog(next, ev.text, ev.tone === 'MAGIC' ? 'MAGIC' : ev.tone === 'WARN' ? 'WARN' : ev.tone === 'GOOD' ? 'GOOD' : 'NORMAL');
  };

  // 폐관 중에는 바깥 일이 닿지 않는다.
  if (activity !== 'SECLUSION') {
    if (Math.random() < 0.55) rollMinor(activity);
    if (phase === 'LATE' && Math.random() < 0.45) rollMinor(undefined);
  }

  next.stats = clampStatsByAge(next.stats, next.age);

  // PM2 활동 연출 카드용 명확한 변동 뱃지 자동 집계!
  const badges: Array<{ label: string; tone: 'GOOD' | 'WARN' | 'MAGIC' }> = [];
  if (floatingText && activity === 'TRAIN') badges.push({ label: floatingText, tone: 'GOOD' });
  if (floatingText && activity === 'SECLUSION') badges.push({ label: floatingText, tone: floatingColor === '#f43f5e' ? 'WARN' : 'MAGIC' });
  if (floatingText && (activity === 'DECODE' || activity === 'CRAFT' || activity === 'TEACH' || activity === 'BUILD')) {
    badges.push({ label: floatingText, tone: floatingColor === '#f87171' ? 'WARN' : 'MAGIC' });
  }
  if (discipleBadgeText) {
    badges.push({ label: discipleBadgeText, tone: 'GOOD' });
  }
  const statPairs: Array<[keyof Stats, string]> = [
    ['str', '근력'], ['agi', '민첩'], ['vit', '체력'], ['wil', '정신'], ['ins', '통찰'], ['qi', '영력'],
  ];
  statPairs.forEach(([k, lbl]) => {
    const d = next.stats[k] - state.stats[k];
    if (d !== 0) badges.push({ label: `${lbl} ${d > 0 ? '+' : ''}${d}`, tone: d > 0 ? 'GOOD' : 'WARN' });
  });
  const dMoney = next.money - state.money;
  if (dMoney !== 0) badges.push({ label: `${cMeta.currency} ${dMoney > 0 ? '+' : ''}${dMoney}`, tone: dMoney > 0 ? 'GOOD' : 'WARN' });
  const dFame = next.fame - state.fame;
  if (dFame !== 0) badges.push({ label: `명성 ${dFame > 0 ? '+' : ''}${dFame}`, tone: dFame > 0 ? 'GOOD' : 'WARN' });
  const dHealth = next.health - state.health;
  if (dHealth !== 0) badges.push({ label: `건강 ${dHealth > 0 ? '+' : ''}${dHealth}`, tone: dHealth > 0 ? 'GOOD' : 'WARN' });

  return {
    state: next,
    tick: {
      phase,
      phaseLabel,
      activity,
      location,
      floatingText,
      floatingColor,
      feedLines,
      badges,
      minorEventText,
      minorEventTone,
    },
    triggerSparBattle,
  };
}


export interface BattleOutcomePayload {
  victory: boolean;
  fighterType: 'HERO' | 'DISCIPLE';
  discipleId?: string;
  usedMagic: boolean;
  usedForbidden: boolean;
  justParriesCount: number;
  recoilHealthLoss: number;
  recoilLifespanYears: number;
  hpRemainingRatio: number;
  /** 결착 방식: 쓰러뜨림 / (목검) 항복 / (진검) 치명상 / 시간 종료 판정 */
  endedBy?: import('./duelRules').DuelEnding;
  /** 진검결투에서 내가 입은 / 상대에게 입힌 치명상 수 */
  fatalWoundsTaken?: number;
  fatalWoundsDealt?: number;
}

// 실시간 전투 종료 후 상태 정산
const PHANTOM_MAGIC_EVENTS = ['fan_first_shock', 'fan_inquisition', 'fan_missionary', 'fan_royal_summon'];

// 세이브 보정: 예전에는 대회 관전에서 비무대 위 무사가 쓴 술법이 내 기록으로 남았다.
// 나도 문하생도 술법 초식을 하나도 익히지 않았는데 "사람들 앞에서 이적을 드러냈다"고 적혀 있으면 그 기록을 걷어낸다.
export function repairPhantomMagicRecord(state: GameState): GameState {
  const f = state.flags;
  if (!f.usedMagicPublicly && !f.magicCastCount) return state;
  // 이 기록이 정당하게 남는 길은 둘뿐이다: 술법(FANTASY) 초식을 실전에 썼거나, 빙결 초식으로 대화재를 얼렸거나.
  const isArcane = (s: Skill) => s.origin.includes('FANTASY') || s.element === 'ICE';
  const sideKnowsMagic = state.skills.some(isArcane) || state.disciples.some((d) => d.skills.some(isArcane));
  if (sideKnowsMagic) return state;
  return {
    ...state,
    flags: {
      ...f,
      usedMagicPublicly: false,
      magicCastCount: 0,
      // 잘못 열린 충격 이벤트는 나중에 진짜로 술법을 드러냈을 때 다시 일어날 수 있게 되돌린다.
      triggeredEvents: f.triggeredEvents.filter((id) => !PHANTOM_MAGIC_EVENTS.includes(id)),
    },
    reputation: { ...state.reputation, arcane: Math.max(0, state.reputation.arcane - 12 * (f.magicCastCount || 0)) },
    milestones: (state.milestones || []).filter((m) => m.key !== 'MAGIC_PUBLIC'),
  };
}

export function applyBattleOutcome(state: GameState, outcome: BattleOutcomePayload): GameState {
  const battle = state.pendingBattle;
  // 무사수행 길 위에서 진 승부는 도장의 패배 정산(현판 탈취·진검 사망 판정)이 아니라 무사수행의 규칙으로 처리한다.
  if (battle?.eventFollowupId?.startsWith('journey|') && state.journey && !outcome.victory) {
    return applyJourneyDefeat(state, battle, outcome);
  }
  const next = applyBattleOutcomeWithSects(state, outcome);
  // 무사수행 비무(그리고 도장으로 돌아온 메아리의 비무)는 사건 정의가 뒷이야기를 잇는다.
  if (battle?.eventFollowupId?.startsWith('journey|')) return applyJourneyBattle(next, battle, outcome.victory);
  // 천하제일 무술대회 대진표
  if (battle?.eventFollowupId?.startsWith('tourney2|')) return applyTourneyBattle(next, battle, outcome.victory);
  return next;
}

function applyBattleOutcomeWithSects(state: GameState, outcome: BattleOutcomePayload): GameState {
  const battle = state.pendingBattle;
  let after = applyBattleOutcomeCore(state, outcome);
  // 숙적과 칼을 맞대면 두 문파 사이도 팽팽해진다.
  if (battle?.isRivalBattle && after.phase !== 'ENDING') {
    after = syncRivalSect(after, outcome.victory ? -4 : -2, outcome.victory ? '도장주끼리의 비무에서 패해 자존심이 상했다' : '도장주끼리의 비무에서 이겨 기세가 올랐다');
  }
  // 타 문파·반란과 얽힌 싸움의 뒷일 (관계 변화, 반란 무리의 처분 등)
  return applySectBattleFollowup(battle, after, outcome.victory);
}

function applyBattleOutcomeCore(state: GameState, outcome: BattleOutcomePayload): GameState {
  const battle = state.pendingBattle;
  if (!battle) return { ...state, phase: 'MAIN' };

  // 객석 관전은 남의 싸움이다. 비무대 위 무사가 쓴 술법·금기·간파는 내 기록에 남기지 않는다.
  if (battle.spectatorMode) {
    outcome = { ...outcome, usedMagic: false, usedForbidden: false, justParriesCount: 0, recoilHealthLoss: 0, recoilLifespanYears: 0 };
  }

  let next: GameState = {
    ...state,
    phase: 'MAIN',
    pendingBattle: null,
    flags: {
      ...state.flags,
      maxParriesInBattle: Math.max(state.flags.maxParriesInBattle || 0, outcome.justParriesCount),
    },
  };

  // 반동 & 마법 공개 기록
  if (outcome.usedMagic) {
    next.flags = {
      ...next.flags,
      usedMagicPublicly: true,
      magicCastCount: next.flags.magicCastCount + 1,
    };
    next.reputation = { ...next.reputation, arcane: next.reputation.arcane + 12 };
  }
  if (outcome.usedForbidden) {
    next.flags = { ...next.flags, forbiddenCastCount: next.flags.forbiddenCastCount + 1 };
    next.health = Math.max(0, next.health - outcome.recoilHealthLoss);
    next.maxLifespanPenalty += outcome.recoilLifespanYears;
    next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 8 };
    if (next.health <= 0) {
      next.phase = 'ENDING';
      next.deathCause = '주화입마 반동사';
      return addLog(next, '금기 초식의 끔찍한 반동을 육체가 버티지 못하고 경맥이 무너졌다.', 'DANGER');
    }
  }

  // ★ 천하제일 무술대회 객석 관전 모드 처리 (8강 → 4강 → 결승 감상 후 깨달음 보상!) ★
  if (battle.spectatorMode) {
    // 새 대진표의 관전 경기는 대진표가 결과를 받는다 (여기서는 옛 관전 보상을 주지 않는다)
    if (battle.eventFollowupId?.startsWith('tourney2|')) return next;
    const wins = next.flags.tournamentWins || 0;
    if (battle.eventFollowupId?.startsWith('tourney_spec_next|')) {
      const nextR = Number(battle.eventFollowupId.split('|')[1]) as 7 | 8;
      if (nextR === 7 || nextR === 8) {
        next.pendingBattle = createTournamentSpectatorBattle(next, nextR);
      }
      const midLog =
        next.age >= 55 || wins >= 1
          ? `[관전] ${battle.title}의 공방을 차분히 지켜보며 후배들의 검리를 헤아렸다.`
          : `[관전] ${battle.title}의 눈부신 절정 공방을 두 눈에 담았다.`;
      return addLog(next, midLog, 'NORMAL');
    }
    // 결승까지 관전 완료!
    next.stats = { ...next.stats, ins: next.stats.ins + 6, qi: next.stats.qi + 5 };
    next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 12 };
    next.skills = next.skills.map((s) => (next.equippedActiveIds.includes(s.id) ? gainSkillExp(s, 75).updated : s));
    const endLog =
      next.age >= 55 && wins >= 1
        ? `옛 천하제일 우승자로서 후학들의 8강~결승 비무를 지켜보며 한층 깊은 경지를 정리했다. (통찰 +6, 영력 +5, 초식 숙련↑)`
        : next.age >= 55
        ? `원로의 시선으로 젊은 고수들의 8강~결승 공방을 감상하며 노련한 통찰을 더했다. (통찰 +6, 영력 +5, 초식 숙련↑)`
        : wins >= 1
        ? `역대 우승자의 안목으로 후진과 강자들의 8강~결승 대결을 꿰뚫어 보며 검리를 다듬었다. (통찰 +6, 영력 +5, 초식 숙련↑)`
        : `천하제일 무술대회 8강~결승을 직접 관전하며 절정의 검리를 눈에 새겼다! (통찰 +6, 영력 +5, 장착 초식 숙련↑)`;
    return addLog(next, endLog, 'MAGIC');
  }

  // 제자 대리전 처리
  if (outcome.fighterType === 'DISCIPLE' && outcome.discipleId) {
    const dIdx = next.disciples.findIndex((d) => d.id === outcome.discipleId);
    if (dIdx !== -1) {
      const d = next.disciples[dIdx];
      if (outcome.victory) {
        const fameGain = Math.round((battle.rewardFame || 25) * 1.25);
        next.fame += fameGain;
        next.money += battle.rewardMoney || 30;
        next.signboardStolen = false;
        const upgradedSkills = d.skills.map((s) => gainSkillExp(s, 95).updated);
        const nextDisciples = [...next.disciples];
        nextDisciples[dIdx] = { ...d, loyalty: Math.min(100, d.loyalty + 12), skills: upgradedSkills };
        next.disciples = nextDisciples;
        // 토너먼트 제자 대리전 승리 시에도 다음 라운드 연계!
        if (battle.isTournament && battle.eventFollowupId?.startsWith('tourney_advance|')) {
          const nextRound = Number(battle.eventFollowupId.split('|')[1]);
          next.pendingBattle = createTournamentBattle(next, nextRound);
        } else if (battle.isTournament && battle.eventFollowupId?.startsWith('tourney_champ|')) {
          const adj = evaluateTournamentFameAdjustment(state.fame, 8, true);
          next.fame = Math.max(0, next.fame + adj.bonusFame);
          next.flags = { ...next.flags, tournamentWins: (next.flags.tournamentWins || 0) + 1 };
          if (battle.rewardWeaponId && !next.weapons.some((w) => w.id === battle.rewardWeaponId)) {
            const w = getWeaponById(battle.rewardWeaponId);
            if (w) next.weapons = [...next.weapons, w];
          }
        }
        return addLog(next, `제자 ${d.name}이(가) 「${battle.title}」에서 승리했다! (명성 +${fameGain})`, 'GOOD');
      } else {
        if (battle.isRealDuel) {
          const nextDisciples = [...next.disciples];
          nextDisciples[dIdx] = { ...d, dead: true, leftReason: '진검결투 전사' };
          next.disciples = nextDisciples;
          next.health = Math.max(10, next.health - 8);
          return addLog(next, `비극! 제자 ${d.name}이(가) 진검결투에서 끝내 쓰러져 세상을 떠났다…`, 'DANGER');
        } else if (battle.isTournament) {
          // ★ 버그 수정: 무술대회 패배 시 절대 현판이 뜯기지 않음! 명성 기대치 대비 보정만 적용!
          const rNum = battle.tournamentRound || 1;
          const adj = evaluateTournamentFameAdjustment(state.fame, rNum, false);
          next.fame = Math.max(0, next.fame + adj.bonusFame);
          return addLog(next, `제자 ${d.name}이(가) ${battle.title}에서 아쉽게 탈락했다. ${adj.summaryLine}`, adj.bonusFame >= 0 ? 'GOOD' : 'WARN');
        } else {
          next.fame = Math.max(0, next.fame - 15);
          next.signboardStolen = true;
          return addLog(next, `제자 ${d.name}이(가) 비무에서 패배했다. 도장 현판을 빼앗겼다!`, 'WARN');
        }
      }
    }
  }

  const diffCfg = getDifficultyConfig(next);
  // ★ 결투 결과 HP 소모 → 건강(Health) 연동! (난이도가 높을수록 실전 부상 마모 가중!) ★
  // 목검 비무는 멍과 타박상으로 끝나지만, 진검결투는 이겨도 몸에 칼자국이 남는다.
  const lostRatio = Math.max(0, Math.min(1, 1 - (outcome.hpRemainingRatio ?? 1)));
  const fatalTaken = outcome.fatalWoundsTaken || 0;
  const withStatus = (st: GameState, status: GameState['statuses'][number]): GameState => {
    const prevSame = st.statuses.find((x) => x.id === status.id);
    const turns = Math.max(status.turnsRemaining, prevSame?.turnsRemaining || 0);
    return { ...st, statuses: [...st.statuses.filter((x) => x.id !== status.id), { ...status, turnsRemaining: turns }] };
  };
  const applyBattleWear = (st: GameState): GameState => {
    if (battle.isRealDuel) {
      const wear = Math.round((Math.max(4, lostRatio * 36) + fatalTaken * 10) * diffCfg.battleWearMult);
      let out: GameState = { ...st, health: Math.max(4, st.health - wear) };
      if (fatalTaken > 0 || lostRatio >= 0.55) {
        out = withStatus(out, { id: 'HEAVY_INJURY', label: fatalTaken > 0 ? '깊은 검상(劍傷)' : '칼에 베인 중상', turnsRemaining: fatalTaken > 0 ? 3 : 2 });
      } else if (lostRatio >= 0.2) {
        out = withStatus(out, { id: 'LIGHT_INJURY', label: '칼에 베인 상처', turnsRemaining: 2 });
      }
      return out;
    }
    if (lostRatio < 0.15) return st;
    const maxWear = (battle.isTournament ? 7 : 9) * diffCfg.battleWearMult;
    const wear = Math.max(1, Math.round(lostRatio * maxWear));
    return { ...st, health: Math.max(4, st.health - wear) };
  };

  // 주인공 직접 출전 결과
  if (outcome.victory) {
    next = applyBattleWear(next);
    const jpFameBonus = next.country === 'JAPAN' ? 1.2 : 1.0;
    const fameGain = Math.round((battle.rewardFame ?? 20) * jpFameBonus * diffCfg.fameGainMult);
    const rewardCash = Math.round((battle.rewardMoney || 0) * diffCfg.incomeMult);
    next.fame += fameGain;
    next.money += rewardCash;
    next.signboardStolen = false;

    // 장착 초식 실전 경험치 (어려움 +10%, 지옥 +20% 보너스!)
    let pendingTrait = next.pendingTraitSkillId;
    next.skills = next.skills.map((s) => {
      if (!next.equippedActiveIds.includes(s.id)) return s;
      const res = gainSkillExp(s, Math.round((battle.isRealDuel ? 85 : 55) * diffCfg.expGainMult));
      if (res.triggeredTrait) pendingTrait = res.updated.id;
      return res.updated;
    });
    next.pendingTraitSkillId = pendingTrait;

    // ★ 사선(死線)을 넘은 자의 각성 「절처봉생(絶處逢生)」 (어려움/지옥 전용!) ★
    if (diffCfg.id !== 'EASY' && (battle.isRealDuel || lostRatio >= 0.7)) {
      next.stats = clampStatsByAge(
        { ...next.stats, ins: next.stats.ins + 2, wil: next.stats.wil + 2, qi: next.stats.qi + 1 },
        next.age
      );
      next = addLog(next, '★ 절처봉생(絶處逢生)! 사선을 넘어 살아남으며 통찰·정신이 날카롭게 각성했다! (통찰·정신 +2, 영력 +1)', 'MAGIC');
    }

    // 무기 이력 및 가보 성장
    next.weapons = next.weapons.map((w) => {
      if (w.id !== next.equippedWeaponId) return w;
      const wins = (w.winsCount || 0) + 1;
      const realWins = (w.realDuelWins || 0) + (battle.isRealDuel ? 1 : 0);
      const magicCasts = (w.magicCasts || 0) + (outcome.usedMagic ? 1 : 0);
      return { ...w, winsCount: wins, realDuelWins: realWins, magicCasts };
    });

    // 보상 서적/무기
    if (battle.rewardBookId && !next.books.some((b) => b.id === battle.rewardBookId)) {
      const b = ALL_BOOKS_CATALOG.find((x) => x.id === battle.rewardBookId);
      if (b) {
        next.books = [...next.books, { ...b, decodeProgress: 0, decoded: false }];
        next = addLog(next, `전투 승리 보상으로 『${b.title}』을(를) 얻었다!`, 'GOOD');
      }
    }
    if (battle.rewardWeaponId && !next.weapons.some((w) => w.id === battle.rewardWeaponId)) {
      const w = getWeaponById(battle.rewardWeaponId);
      if (w) {
        next.weapons = [...next.weapons, w];
        next = addLog(next, `전투 승리로 「${w.name}」을(를) 노획했다!`, 'GOOD');
      }
    }

    if (battle.eventFollowupId === 'gm_win_spar' || battle.eventFollowupId === 'gm_win_real') {
      next.flags = { ...next.flags, grandmasterWins: (next.flags.grandmasterWins || 0) + 1 };
      if (battle.eventFollowupId === 'gm_win_real') {
        next.stats = {
          ...next.stats,
          str: next.stats.str + 4,
          agi: next.stats.agi + 4,
          ins: next.stats.ins + 6,
          qi: next.stats.qi + 6,
        };
      }
      next = addLog(next, `★ 절정 고수 ${battle.enemyName}을(를) 꺾고 천하에 【${next.sectName}】의 위명을 떨쳤다!`, 'MAGIC');
    }

    // ★ 천하제일 무술대회 256강(1) → 128강(2) → 64강(3) → 32강(4) → 16강(5) → 8강(6) → 4강 천하4검(7) → 결승(8)!
    if (battle.isTournament && battle.eventFollowupId?.startsWith('tourney_advance|')) {
      const nextRound = Number(battle.eventFollowupId.split('|')[1]);
      const nextDef = TOURNAMENT_ROUNDS[Math.min(7, nextRound - 1)];
      next.pendingBattle = createTournamentBattle(next, nextRound);
      next = addLog(next, `🏆 ${battle.title} 승리! ${nextDef.label}(${nextDef.tierTitle}) 진출!`, nextRound >= 6 ? 'MAGIC' : 'GOOD');
    } else if (battle.isTournament && battle.eventFollowupId?.startsWith('tourney_champ|')) {
      const adj = evaluateTournamentFameAdjustment(state.fame, 8, true);
      next.fame = Math.max(0, next.fame + adj.bonusFame);
      next.flags = { ...next.flags, tournamentWins: (next.flags.tournamentWins || 0) + 1 };
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 18, commerce: next.reputation.commerce + 12 };
      next = addLog(
        next,
        `🏆 ★ 천하제패!! 【${next.sectName}】이(가) 256강 대토너먼트를 제패하고 천하 보검과 최고의 명성을 거머쥐었다! ${adj.summaryLine}`,
        'MAGIC'
      );
    }

    if (battle.eventFollowupId === 'clear_debt_win') {
      next.debt = 0;
      next.debtTurns = 0;
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 30 };
    }
    if (battle.eventFollowupId === 'hermit_reward') {
      next.stats = { ...next.stats, ins: next.stats.ins + 10, qi: next.stats.qi + 10 };
      next = addLog(next, '은둔 노고수가 감탄하며 고개를 끄덕였다. 통찰과 기(QI)가 크게 깨어났다!', 'MAGIC');
    }
    if (battle.isRivalBattle) {
      next.rival = { ...next.rival, lossesAgainstPlayer: next.rival.lossesAgainstPlayer + 1 };
    }

    if (battle.isRealDuel) {
      next.flags = { ...next.flags, realDuelWins: next.flags.realDuelWins + 1 };
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 12 };
    } else {
      next.flags = { ...next.flags, sparringWins: next.flags.sparringWins + 1 };
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 2 };
    }

    // 영구 장애 극복 각성 체크
    const prog = { ...next.disabilityProgress };
    if (next.disabilities.includes('ONE_ARM') && battle.isRealDuel) {
      prog.oneArmRealWins += 1;
      if (prog.oneArmRealWins >= 3 && !next.awakenings.includes('ONE_ARM_SAINT')) {
        next.awakenings = [...next.awakenings, 'ONE_ARM_SAINT'];
        next = addLog(next, '★ 각성! 【외팔 검성】 — 한 팔의 한계를 넘어선 절대 검기를 깨우쳤다!', 'MAGIC');
      }
    }
    if (next.disabilities.includes('BLIND')) {
      prog.blindParries += outcome.justParriesCount;
      if (prog.blindParries >= 8 && !next.awakenings.includes('MIND_EYE')) {
        next.awakenings = [...next.awakenings, 'MIND_EYE'];
        next.stats = { ...next.stats, ins: next.stats.ins + 25 };
        next = addLog(next, '★ 각성! 【심안의 맹인 검객】 — 어둠 속에서 천하 최강의 간파를 깨우쳤다!', 'MAGIC');
      }
    }
    next.disabilityProgress = prog;

    const howWon =
      outcome.endedBy === 'SURRENDER'
        ? ` ${battle.enemyName}이(가) 항복했다.`
        : battle.isRealDuel && (outcome.fatalWoundsDealt || 0) > 0
        ? ' 일격이 급소를 갈랐다.'
        : '';
    const scar = battle.isRealDuel && fatalTaken > 0 ? ' 대신 깊은 검상을 입었다.' : '';
    return addLog(next, `「${battle.title}」 승리!${howWon}${scar} (명성 +${fameGain}, 재화 +${battle.rewardMoney || 0})`, 'GOOD');
  } else {
    // 패배 시에도 HP 전소 피로/부상 반영 (진검결투 즉사는 아래 분기에서 처리)
    next = applyBattleWear(next);
    // 패배 처리
    if (battle.isRivalBattle) {
      next.rival = { ...next.rival, winsAgainstPlayer: next.rival.winsAgainstPlayer + 1 };
    }
    if (battle.eventFollowupId === 'hermit_reward') {
      next.stats = { ...next.stats, ins: next.stats.ins + 7, qi: next.stats.qi + 7 };
      return addLog(next, '은둔 노고수에게 패했으나, 그의 한 합에서 엄청난 깨달음을 얻었다! (통찰/QI +7)', 'GOOD');
    }

    if (battle.isRealDuel) {
      // 진검결투 패배 -> 기적 생존(영구 장애) vs 즉사 (난이도별 즉사율: 쉬움 50% / 어려움 68% / 지옥 85%!)
      const maxSurvive = Math.max(0.1, 1 - diffCfg.realDuelDeathRate);
      const surviveChance = Math.min(maxSurvive, (next.stats.vit + next.stats.wil) * 0.0038 * (maxSurvive / 0.45));
      const possibleDis = (['ONE_ARM', 'BLIND', 'LIMP'] as const).filter((d) => !next.disabilities.includes(d));
      if (possibleDis.length > 0 && Math.random() < surviveChance) {
        const gained = possibleDis[Math.floor(Math.random() * possibleDis.length)];
        next.disabilities = [...next.disabilities, gained];
        next.health = Math.max(12, next.health - 28);
        next = withStatus(next, { id: 'HEAVY_INJURY', label: '치명적 중상', turnsRemaining: 3 });
        const label = gained === 'ONE_ARM' ? '왼팔 상실(외팔)' : gained === 'BLIND' ? '실명(두 눈 상실)' : '다리 장애';
        return addLog(next, `진검결투에서 패배했으나 구사일생으로 살아남았다… 대신 영구 장애 【${label}】를 입었다.`, 'DANGER');
      } else {
        next.phase = 'ENDING';
        next.health = 0;
        next.deathCause = '진검결투 전사';
        return addLog(next, `「${battle.title}」 진검결투에서 치명상을 입고 끝내 쓰러졌다.`, 'DANGER');
      }
    } else if (battle.isTournament) {
      // ★ 버그 수정: 무술대회 패배 시 현판 절대 안 뺏김! 현재 명성 대비 기대치 손익만 공정하게 반영!
      const rNum = battle.tournamentRound || 1;
      const rDef = TOURNAMENT_ROUNDS[Math.max(0, Math.min(7, rNum - 1))];
      const adj = evaluateTournamentFameAdjustment(state.fame, rNum, false);
      next.fame = Math.max(0, next.fame + adj.bonusFame);
      return addLog(
        next,
        `「${battle.title}」(${rDef.label})에서 아쉽게 패배하며 대회를 마쳤다. ${adj.summaryLine}`,
        adj.bonusFame > 0 ? 'GOOD' : adj.bonusFame < 0 ? 'WARN' : 'NORMAL'
      );
    } else {
      // 일반 비무 패배 (도장깨기 등)
      next.fame = Math.max(0, next.fame - 18);
      next.signboardStolen = !battle.isTutorial && !battle.isRivalBattle && !battle.id.startsWith('spar_');
      next = withStatus(next, { id: 'LIGHT_INJURY', label: '비무 타박상', turnsRemaining: 1 });
      const howLost = outcome.endedBy === 'SURRENDER' ? '목검을 내려놓고 항복했다' : '패배했다';
      return addLog(
        next,
        `「${battle.title}」에서 ${howLost}. 명성이 하락하고 멍이 들었다.${next.signboardStolen ? ' 도장 현판을 빼앗겼다!' : ''}`,
        'WARN'
      );
    }
  }
}

// 전투 종료 직후 이벤트 결론(후일담 대사 + 변화량 뱃지) 생성기!
export interface BattleConclusionResult {
  title: string;
  speaker: string;
  body: string;
  role: 'HERO' | 'RIVAL' | 'ENEMY' | 'DISCIPLE';
  badges: Array<{ label: string; tone: 'GOOD' | 'WARN' | 'MAGIC' }>;
}

export function buildBattleConclusionNotice(
  prev: GameState,
  next: GameState,
  battle: BattleConfig,
  outcome: BattleOutcomePayload
): BattleConclusionResult {
  const currency = COUNTRIES[prev.country].currency;
  const badges: BattleConclusionResult['badges'] = [];

  const dMoney = next.money - prev.money;
  const dFame = next.fame - prev.fame;
  const dHealth = next.health - prev.health;
  const dDebt = next.debt - prev.debt;
  const dBooks = next.books.length - prev.books.length;
  const dWeapons = next.weapons.length - prev.weapons.length;
  const dAwaken = next.awakenings.length - prev.awakenings.length;

  if (dFame !== 0) badges.push({ label: `명성 ${dFame > 0 ? '+' : ''}${dFame}`, tone: dFame > 0 ? 'GOOD' : 'WARN' });
  if (dMoney !== 0) badges.push({ label: `${currency} ${dMoney > 0 ? '+' : ''}${dMoney}`, tone: dMoney > 0 ? 'GOOD' : 'WARN' });
  if (dDebt < 0) badges.push({ label: `빚 전액 청산!`, tone: 'GOOD' });
  if (dHealth !== 0) {
    badges.push({
      label: `건강 ${dHealth > 0 ? '+' : ''}${dHealth}${next.health <= 45 && dHealth < 0 ? ' (휴식 필요!)' : ''}`,
      tone: dHealth > 0 ? 'GOOD' : 'WARN',
    });
  }
  if (dBooks > 0) badges.push({ label: `비급 서적 획득!`, tone: 'MAGIC' });
  if (dWeapons > 0) badges.push({ label: `명검 병기 노획!`, tone: 'MAGIC' });
  if (outcome.justParriesCount > 0) badges.push({ label: `간파 ${outcome.justParriesCount}회`, tone: 'MAGIC' });
  if (dAwaken > 0) badges.push({ label: `★ 경지 각성!`, tone: 'MAGIC' });
  if (!outcome.victory && next.signboardStolen && !prev.signboardStolen) {
    badges.push({ label: `현판 탈취당함`, tone: 'WARN' });
  }
  // 목검 비무는 항복으로, 진검결투는 치명상으로 갈린다
  if (outcome.endedBy === 'SURRENDER') {
    badges.unshift({ label: outcome.victory ? '상대 항복' : '항복', tone: outcome.victory ? 'GOOD' : 'WARN' });
  }
  if (battle.isRealDuel && outcome.victory && (outcome.fatalWoundsDealt || 0) > 0) {
    badges.unshift({ label: '일격 치명상', tone: 'MAGIC' });
  }
  if (battle.isRealDuel && outcome.victory && (outcome.fatalWoundsTaken || 0) > 0) {
    badges.push({ label: '치명상을 입음', tone: 'WARN' });
  }
  const gotHeavy = next.statuses.some((s) => s.id === 'HEAVY_INJURY') && !prev.statuses.some((s) => s.id === 'HEAVY_INJURY');
  if (outcome.victory && gotHeavy) badges.push({ label: '중상 (행동력↓ · 수련↓)', tone: 'WARN' });

  if (outcome.fighterType === 'DISCIPLE' && outcome.discipleId) {
    const d = next.disciples.find((x) => x.id === outcome.discipleId);
    const dName = d?.name || '문하생';
    if (outcome.victory) {
      return {
        title: `${battle.title} — 제자의 승전보`,
        speaker: dName,
        role: 'DISCIPLE',
        body: `“사부님! 가르쳐 주신 초식으로 해냈습니다!”\n${battle.enemyName}이(가) 혀를 내두르며 물러갔다. 저잣거리에는 스승뿐 아니라 제자마저 무섭다는 소문이 번지기 시작했다.`,
        badges,
      };
    }
    if (battle.isRealDuel) {
      return {
        title: `${battle.title} — 비통한 결말`,
        speaker: prev.name,
        role: 'HERO',
        body: `피투성이가 되어 쓰러진 제자 ${dName}을(를) 품에 안았다. 마당에 무거운 침묵이 내려앉았고, 살아남은 문하생들이 눈물을 삼키며 주먹을 쥐었다.`,
        badges: [{ label: `제자 ${dName} 전사`, tone: 'WARN' }, ...badges],
      };
    }
    return {
      title: `${battle.title} — 아쉬운 패배`,
      speaker: dName,
      role: 'DISCIPLE',
      body: `“죄송합니다, 사부님…… 제 수련이 모자랐습니다.”\n${battle.enemyName}은(는) 도장 현판을 떼어 들며 비웃음을 남기고 사라졌다.`,
      badges,
    };
  }

  // ★ 객석 관전 모드 결말 (8강 → 4강 → 결승) — 나이·우승 경력에 맞춘 시선 분기! ★
  if (battle.spectatorMode) {
    const rNum = battle.tournamentRound || 6;
    const rDef = TOURNAMENT_ROUNDS[Math.max(0, Math.min(7, rNum - 1))];
    const prevWins = prev.flags.tournamentWins || 0;
    const isElder = prev.age >= 55;
    const isMid = prev.age >= 35 && prev.age < 55;

    if (battle.eventFollowupId?.startsWith('tourney_spec_next|')) {
      const nextR = rNum + 1;
      const nextDef = TOURNAMENT_ROUNDS[Math.min(7, nextR - 1)];
      const interlude =
        isElder && prevWins >= 1
          ? `객석의 환호 속에서, 옛 우승자인 당신은 고요히 고개를 끄덕이며 후배들의 칼길을 가늠했다.\n곧이어 다음 무대 【${nextDef.label} · ${nextDef.tierTitle}】의 두 고수가 비무대에 오른다.`
          : prevWins >= 1
          ? `귀빈석에서 지켜본 ${rDef.label}의 공방은 제법 매서웠다.\n숨 돌릴 틈도 없이 다음 무대 【${nextDef.label} · ${nextDef.tierTitle}】이 막을 올린다.`
          : `천하 절정 고수들의 화려한 검기와 간파가 객석을 뒤흔들었다!\n잠시 숨을 돌릴 새도 없이, 다음 무대 【${nextDef.label} · ${nextDef.tierTitle}】의 두 고수가 비무대에 오른다!`;
      return {
        title: `[관전] ${rDef.label} 종료 → ${nextDef.label} 개막!`,
        speaker: prevWins >= 1 ? prev.name : '대회 집행관',
        role: prevWins >= 1 ? 'HERO' : 'ENEMY',
        body: interlude,
        badges: [{ label: `다음 관전: ${nextDef.label}`, tone: 'MAGIC' }],
      };
    }

    let watchTitle = '🏆 천하제일 무술대회 관전 완료!';
    let watchBody = `8강부터 천하 4검, 그리고 대망의 결승까지 당대 최강자들의 극의를 두 눈에 고스란히 새겼다.\n“언젠가 나도 저 비무대 한가운데에 서겠어…… 당장 도장으로 돌아가 내 초식에 녹여 내야지!”`;

    if (isElder && prevWins >= 1) {
      watchTitle = '🏆 옛 우승자의 조용한 관전';
      watchBody = `통산 ${prevWins}회 우승에 빛나는 전설이 이제는 귀빈석에 조용히 앉아 후배들의 8강·4강·결승 공방을 끝까지 지켜보았다.\n“허허, 새 시대의 검들도 제법 날이 섰구나. 내가 칼을 내려놓은 뒤에도 강호의 칼길은 멈추지 않겠어…… 도장에 돌아가 제자들에게 들려줘야겠다.”`;
    } else if (isElder) {
      watchTitle = '🏆 원로의 시선으로 본 천하 비무';
      watchBody = `은발을 쓸어 넘기며 객석에서 젊은 절정 고수들의 8강~결승 공방을 고요히 감상했다.\n“세월이 흘러 몸은 예전 같지 않으나, 칼길을 읽는 눈만큼은 오히려 더 맑아졌군. 도장으로 돌아가 제자들과 나누어야겠다.”`;
    } else if (isMid && prevWins >= 1) {
      watchTitle = '🏆 역대 우승자의 날카로운 관전';
      watchBody = `${prevWins >= 2 ? `통산 ${prevWins}회 우승자` : '역대 우승자'}로서 귀빈석에 앉아 후진들과 강자들의 8강~결승 대결을 냉철하게 꿰뚫어 보았다.\n“내 검을 넘으려 애쓰는 자들의 수가 훤히 보이는군. 나 역시 옛 영광에 안주하지 말고 한 수 더 다듬어야겠다.”`;
    } else if (isMid) {
      watchTitle = '🏆 천하제일 무술대회 관전 완료';
      watchBody = `객석에서 당대 최강자들의 8강~결승 공방을 차분히 지켜보며 평생 다져 온 내 검과 견주어 보았다.\n“저들의 간격과 호흡…… 내 검리에도 아직 더 파고들 여지가 남아 있군.”`;
    }

    return {
      title: watchTitle,
      speaker: prev.name,
      role: 'HERO',
      body: watchBody,
      badges: [
        { label: '통찰 +6', tone: 'MAGIC' },
        { label: '영력 +5', tone: 'MAGIC' },
        { label: '초식 안목·숙련↑', tone: 'GOOD' },
      ],
    };
  }

  if (outcome.victory) {
    const totalWinsAfter = next.flags.tournamentWins || 1;
    const isElder = prev.age >= 55;
    const prevWins = prev.flags.tournamentWins || 0;

    if (battle.isTournament && battle.eventFollowupId?.startsWith('tourney_advance|')) {
      const curR = battle.tournamentRound || 1;
      const nextR = Number(battle.eventFollowupId.split('|')[1]);
      const curDef = TOURNAMENT_ROUNDS[Math.min(7, curR - 1)];
      const nextDef = TOURNAMENT_ROUNDS[Math.min(7, nextR - 1)];
      return {
        title: `🏆 ${curDef.label} 돌파 → ${nextDef.label} 진출!`,
        speaker: battle.enemyName,
        role: 'RIVAL',
        body: `${battle.enemyName}을(를) 제압하고 ${curDef.label}을 통과했다!\n${nextR === 7 ? '이제부터는 천하 4검(天下四劍)이 버티는 진정한 절정의 무대다!' : nextR === 8 ? (prevWins >= 1 ? `통산 ${prevWins + 1}회 제패가 걸린 대망의 결승전이다!` : '드디어 천하 보검과 무신의 칭호가 걸린 대망의 결승전이다!') : `곧바로 ${nextDef.label}(${nextDef.tierTitle}) 상대가 비무대에 오른다!`}`,
        badges: [{ label: `${nextDef.label} 진출!`, tone: nextR >= 6 ? 'MAGIC' : 'GOOD' }, ...badges],
      };
    }
    if (battle.isTournament && battle.eventFollowupId?.startsWith('tourney_champ|')) {
      const champTitle =
        totalWinsAfter >= 2
          ? `🏆 천하제일 무술대회 통산 ${totalWinsAfter}회 제패!!`
          : isElder
          ? `🏆 백발의 무신 — 천하제일 우승!!`
          : `🏆 천하제일 무술대회 우승!!`;
      const champBody =
        totalWinsAfter >= 2 && isElder
          ? `“믿을 수 없소! 백발의 대종사 【${prev.sectName}】의 ${prev.name} 님이 또다시 256명의 고수를 모두 꺾고 통산 ${totalWinsAfter}번째 우승을 거머쥐었소!!”\n수천 관중이 자리에서 일어나 경의를 표하며 천하 보검과 상금 600${currency}을 바쳤다. 세월조차 꺾지 못한 살아 있는 전설이다!`
          : totalWinsAfter >= 2
          ? `“또다시 【${prev.sectName}】의 ${prev.name}!! 통산 ${totalWinsAfter}회 천하제일 제패!!”\n어느 도전자도 왕좌를 흔들지 못했다. 환호 속에 천하 보검과 우승 상금 600${currency}이 올려지며 당신의 시대가 한 번 더 증명되었다!`
          : isElder
          ? `“평생을 검에 바친 백발의 원로, 【${prev.sectName}】의 ${prev.name} 님이 256명의 고수를 모두 넘어 천하제일에 올랐소!!”\n우레와 같은 박수 속에 천하 보검과 우승 상금 600${currency}이 두 손에 올려졌다. 늦게 핀 꽃이 천하를 뒤덮은 순간이다!`
          : `“256명의 고수를 모두 꺾은 최후의 승자는 【${prev.sectName}】의 ${prev.name}!!”\n수천 관중의 환호 속에 천하 보검과 우승 상금 600${currency}이 두 손에 올려졌다. 오늘부로 당신의 유파는 천하제일로 영원히 기록된다!`;
      return {
        title: champTitle,
        speaker: '대회 집행관',
        role: 'ENEMY',
        body: champBody,
        badges: [{ label: totalWinsAfter >= 2 ? `🏆 통산 ${totalWinsAfter}회 우승!` : '🏆 천하제일 우승!', tone: 'MAGIC' }, ...badges],
      };
    }
    if (battle.eventFollowupId === 'gm_win_spar' || battle.eventFollowupId === 'gm_win_real') {
      const gmLine =
        prevWins >= 1 || isElder
          ? `“……과연 천하가 우러르는 【${prev.sectName}】 대종사의 검이로군. 오늘 일합은 평생의 영광으로 간직하겠네.”`
          : `“……믿기지 않는구나. 무명의 칼이 여기까지 닿았단 말인가. 오늘부로 강호는 【${prev.sectName}】의 시대일세.”`;
      return {
        title: `${battle.title} — 절정 고수를 꺾다!`,
        speaker: battle.enemyName,
        role: 'RIVAL',
        body: `${battle.enemyName}이(가) 칼을 거두며 깊은 탄식을 내뱉었다.\n${gmLine}`,
        badges: [{ label: '★ 절정 고수 격파!', tone: 'MAGIC' }, ...badges],
      };
    }
    if (battle.id === 'b_onboard_thug') {
      return {
        title: '마당의 불청객 — 첫 승리',
        speaker: battle.enemyName,
        role: 'ENEMY',
        body: `“으악! 이, 이 녀석 눈빛이 예사롭지 않군! 두고 보자!”\n왈패들이 꽁지가 빠지게 달아났다. 골목에서 숨어 보던 이웃들이 박수를 치며 도장 문 앞으로 모여들었다.`,
        badges,
      };
    }
    if (battle.isRivalBattle) {
      return {
        title: `${battle.title} — 숙적과의 일합`,
        speaker: battle.enemyName,
        role: 'RIVAL',
        body: `${battle.enemyName}이(가) 떨리는 손으로 칼을 집어넣으며 옅게 웃었다.\n${isElder ? '“……백발이 되어서도 자네 칼은 여전히 매섭군. 오늘 승부는 내가 졌네, 오랜 벗이여.”' : '“……네 검은 이제 내가 알던 그 칼이 아니군. 오늘 패배는 인정하지. 하지만 끝이 아니다.”'}`,
        badges,
      };
    }
    if (battle.eventFollowupId === 'clear_debt_win') {
      return {
        title: '빚 청산 진검결투 — 족쇄를 끊다',
        speaker: battle.enemyName,
        role: 'ENEMY',
        body: `바닥에 나뒹군 전당포 두목이 창백한 얼굴로 차용증을 찢어 던졌다.\n“알았소! 빚은 없던 일로 하겠소! 제발 목숨만 살려 주시오!”`,
        badges,
      };
    }
    if (battle.eventFollowupId === 'hermit_reward') {
      const hermitWinBody =
        isElder || prevWins >= 1
          ? `노고수가 수염을 쓰다듬으며 껄껄 웃었다.\n“허허, 과연 당대 대종사의 칼끝이 이토록 서늘하구나! 내 연배에 이런 상대를 만나다니, 오늘이야말로 평생에 남을 일합이었네.”`
          : `노고수가 수염을 쓰다듬으며 껄껄 웃었다.\n“허허, 과연 무명의 칼끝에 하늘이 서려 있구나! 자네 검의 앞날이 참으로 기대되네.”`;
      return {
        title: '은둔 노고수의 시험 — 인정받다',
        speaker: battle.enemyName,
        role: 'RIVAL',
        body: hermitWinBody,
        badges: [{ label: '통찰 +10', tone: 'MAGIC' }, { label: '영력 +10', tone: 'MAGIC' }, ...badges],
      };
    }
    if (battle.id.startsWith('spar_')) {
      return {
        title: '타류 친선 대련 — 일합의 수확',
        speaker: battle.enemyName,
        role: 'ENEMY',
        body: `${battle.enemyName}이(가) 땀을 닦으며 공손히 포권했다.\n${prevWins >= 1 || isElder ? '“명불허전이십니다, 큰 사부님. 오늘 받아 낸 한 합은 평생의 가르침으로 삼겠습니다.”' : '“훌륭한 검이오. 오늘 겨룬 초식은 평생 잊지 못할 것이오.”'}\n실전을 통해 장착한 초식들의 감각이 한층 날카로워졌다.`,
        badges: [{ label: '초식 숙련도↑', tone: 'GOOD' }, ...badges],
      };
    }
    if (battle.isRealDuel) {
      const scarLine =
        (outcome.fatalWoundsTaken || 0) > 0
          ? '\n이겼으나 옆구리를 가른 칼자국에서 피가 멎지 않는다. 한동안은 칼을 쥐기도 버거울 것이다.'
          : (outcome.hpRemainingRatio ?? 1) < 0.5
          ? '\n살아남았으나 온몸이 칼에 베인 상처투성이다.'
          : '';
      return {
        title: `${battle.title} — 생사의 일합`,
        speaker: battle.enemyName,
        role: 'ENEMY',
        body: `${(outcome.fatalWoundsDealt || 0) > 0 ? '칼끝이 급소를 가르는 순간 승부는 끝났다. ' : ''}${battle.enemyName}이(가) 피를 쏟으며 무너졌다.\n“……【${prev.sectName}】…… 진짜 칼이었군……”${scarLine}`,
        badges,
      };
    }
    return {
      title: `${battle.title} — 완승`,
      speaker: battle.enemyName,
      role: 'ENEMY',
      body: `${battle.enemyName}이(가) ${outcome.endedBy === 'SURRENDER' ? '목검을 내려놓고 패배를 인정했다' : '무릎을 꿇고 꺾인 무기를 거두었다'}.\n${prevWins >= 1 || isElder ? `“……천하에 이름난 【${prev.sectName}】 대종사 앞에 감히 칼을 들었던 내 안목이 짧았소.”` : `“……【${prev.sectName}】의 이름은 헛된 소문이 아니었군. 오늘의 패배를 뼈에 새기겠소.”`}`,
      badges,
    };
  } else {
    const isElder = prev.age >= 55;
    const prevWins = prev.flags.tournamentWins || 0;
    if (battle.eventFollowupId === 'hermit_reward') {
      return {
        title: '은둔 노고수의 벽 — 값진 깨달음',
        speaker: battle.enemyName,
        role: 'RIVAL',
        body:
          isElder || prevWins >= 1
            ? `치열한 공방 끝에 한 수 밀렸으나, 노고수는 흐뭇하게 웃으며 손을 내밀었다.\n“허허, 한 수 삐끗했을 뿐 그대의 검리는 이미 일가를 이루었네. 방금 부딪친 그 한 틈을 두고두고 곱씹어 보게.”`
            : `단 몇 합 만에 제압당했지만, 노고수는 미소를 지으며 손을 내밀었다.\n“아직 멀었으나 눈은 살아 있구나. 방금 내 칼이 꺾인 자리를 잊지 마라.”`,
        badges: [{ label: '통찰 +7', tone: 'MAGIC' }, { label: '영력 +7', tone: 'MAGIC' }],
      };
    }
    if (battle.isRealDuel && next.disabilities.length > prev.disabilities.length) {
      const gained = next.disabilities[next.disabilities.length - 1];
      const disLabel = gained === 'ONE_ARM' ? '왼팔 상실' : gained === 'BLIND' ? '실명' : '다리 장애';
      return {
        title: `${battle.title} — 구사일생`,
        speaker: prev.name,
        role: 'HERO',
        body: `치명상을 입고 쓰러졌으나, 이웃과 제자들의 필사적인 간호로 목숨만은 건졌다.\n몸에는 지울 수 없는 상처(${disLabel})가 남았지만…… 아직 숨은 붙어 있다.`,
        badges: [{ label: `영구 장애: ${disLabel}`, tone: 'WARN' }, ...badges],
      };
    }
    if (battle.isTournament) {
      const rNum = battle.tournamentRound || 1;
      const rDef = TOURNAMENT_ROUNDS[Math.max(0, Math.min(7, rNum - 1))];
      const adj = evaluateTournamentFameAdjustment(prev.fame, rNum, false);
      return {
        title: `${battle.title} — ${rDef.label} 탈락`,
        speaker: battle.enemyName,
        role: 'RIVAL',
        body: `${rDef.label} 무대에서 ${battle.enemyName}의 벽을 넘지 못하고 대회를 마감했다.\n${adj.summaryLine}`,
        badges,
      };
    }
    if (battle.isRivalBattle) {
      return {
        title: `${battle.title} — 숙적의 벽`,
        speaker: battle.enemyName,
        role: 'RIVAL',
        body: `${battle.enemyName}이(가) 칼끝을 거두며 차갑게 돌아섰다.\n“고작 이 정도였나. 더 갈고닦아 다음에는 제대로 된 칼을 보여 다오.”`,
        badges,
      };
    }
    return {
      title: `${battle.title} — 뼈아픈 패배`,
      speaker: battle.enemyName,
      role: 'ENEMY',
      body: `${battle.enemyName}에게 밀려 끝내 무릎을 꿇고 말았다.\n${next.signboardStolen ? '상대가 도장 현판을 떼어 들고 유유히 정문을 빠져나갔다. 반드시 되찾아야 한다.' : '얼얼한 통증을 삼키며 패인을 곱씹었다. 더 강해져야 한다.'}`,
      badges,
    };
  }
}
