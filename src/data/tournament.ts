import { BattleConfig, CountryId, EnemyAiType, GameState, Skill, Stats, WeaponGroup } from '../types/game';
import { BOOK_SKILL_TEMPLATES, createBaseSkills, SIGNATURE_RECIPES } from './booksAndSkills';
import { ALL_WEAPONS_CATALOG } from './weapons';

export interface TournamentRoundDef {
  round: number; // 1..8
  label: string; // '256강' ~ '결승전'
  tierTitle: string;
  fixedScale: number; // 플레이어 스탯 무관 절대 강도!
  expectedFame: number; // 이 라운드 진출이 기대되는 명성 기준선
  winMoney: number;
  winFame: number;
  skillLevel: number;
}

export const TOURNAMENT_ROUNDS: TournamentRoundDef[] = [
  { round: 1, label: '256강', tierTitle: '예선 1회전', fixedScale: 0.62, expectedFame: 20, winMoney: 15, winFame: 8, skillLevel: 2 },
  { round: 2, label: '128강', tierTitle: '예선 2회전', fixedScale: 0.9, expectedFame: 55, winMoney: 25, winFame: 14, skillLevel: 3 },
  { round: 3, label: '64강', tierTitle: '본선 1회전', fixedScale: 1.22, expectedFame: 110, winMoney: 40, winFame: 22, skillLevel: 5 },
  { round: 4, label: '32강', tierTitle: '본선 2회전', fixedScale: 1.58, expectedFame: 200, winMoney: 65, winFame: 32, skillLevel: 6 },
  { round: 5, label: '16강', tierTitle: '본선 16강', fixedScale: 1.95, expectedFame: 340, winMoney: 100, winFame: 48, skillLevel: 7 },
  { round: 6, label: '8강', tierTitle: '천하 8대 고수전', fixedScale: 2.35, expectedFame: 520, winMoney: 160, winFame: 72, skillLevel: 8 },
  { round: 7, label: '4강', tierTitle: '천하 4검(四劍) 결정전', fixedScale: 2.85, expectedFame: 780, winMoney: 260, winFame: 115, skillLevel: 9 },
  { round: 8, label: '결승전', tierTitle: '천하제일 무신 결정전', fixedScale: 3.35, expectedFame: 1100, winMoney: 600, winFame: 220, skillLevel: 10 },
];

export function getTournamentName(country: CountryId): string {
  if (country === 'CHINA') return '중원 무림맹 천하제일 비무대회';
  if (country === 'JAPAN') return '에도 어전 천하제일 검술대회';
  return '팔도 천하제일 무술대회';
}

export function getTournamentVenue(country: CountryId): string {
  if (country === 'CHINA') return '강남 금릉 대연무장';
  if (country === 'JAPAN') return '에도성 어전 특설 무대';
  return '한양 훈련원 특설 비무대';
}

function buildMasterSkill(id: string, level: number, withApexTraits = false): Skill {
  const sig = SIGNATURE_RECIPES.find((r) => r.result.id === id)?.result;
  const tpl = sig || BOOK_SKILL_TEMPLATES[id] || createBaseSkills()[0];
  const imprintedTraits: Skill['imprintedTraits'] = [];
  if (withApexTraits && level >= 6) {
    imprintedTraits.push({
      tier: 3,
      id: `t_fast_${id}`,
      label: '신속 운용',
      description: '선딜 -25%',
      effect: { windupMult: 0.78 },
    });
    if (tpl.form === 'SLASH') {
      imprintedTraits.push({
        tier: 6,
        id: `t_multi_${id}`,
        label: '연환 2연격',
        description: '2연격 콤보',
        effect: { multiHit: 2, damageMult: 1.15 },
      });
    } else if (tpl.form === 'PARRY') {
      imprintedTraits.push({
        tier: 6,
        id: `t_parry_${id}`,
        label: '【절대 간파】',
        description: '간파 반격 극대화',
        effect: { parryWindowBonus: 80, counterMult: 1.9 },
      });
    }
  }
  if (withApexTraits && level >= 9) {
    imprintedTraits.push({
      tier: 9,
      id: `t_apex_${id}`,
      label: '【입신 극의】',
      description: '극의 위력 상승',
      effect: { damageMult: 1.25, postureMult: 1.5 },
    });
  }
  return {
    creator: '천하 절정',
    ...tpl,
    masteryLevel: level,
    masteryExp: 0,
    imprintedTraits,
  };
}

interface RosterEntry {
  name: string;
  sect: string;
  age: number;
  ai: EnemyAiType;
  weapon: WeaponGroup;
  skills: string[];
  gender?: 'MALE' | 'FEMALE';
}

function getOpponentForRound(country: CountryId, round: number): RosterEntry {
  const rosters: Record<CountryId, RosterEntry[]> = {
    KOREA: [
      { name: '경기 포졸 무인', sect: '수원 소도장', age: 23, ai: 'AGGRESSIVE', weapon: 'BLADE', skills: ['base_h_slash', 'base_v_slash'] },
      { name: '충청 목검 사범', sect: '청주 검도장', age: 28, ai: 'AGGRESSIVE', weapon: 'BLADE', skills: ['base_h_slash', 'sk_kr_01', 'sk_kr_02'] },
      { name: '전라 택견 고수', sect: '전주 활보문', age: 31, ai: 'RUSHDOWN', weapon: 'UNARMED', skills: ['sk_kr_03', 'sk_kr_04', 'sk_kr_01'] },
      { name: '영남 창술 교두', sect: '안동 장창문', age: 35, ai: 'HEAVY', weapon: 'POLEARM', skills: ['sk_kr_05', 'sk_kr_07', 'sk_kr_02'] },
      { name: '평안 쌍수 검호', sect: '관서 쌍수도장', age: 38, ai: 'DUELIST', weapon: 'BLADE', skills: ['sk_kr_06', 'sk_kr_01', 'sk_jp_03'] },
      { name: '한양 금군 대교관', sect: '금위영 어영청', age: 44, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_cross_slash', 'sk_kr_06', 'sk_jp_01'] },
      // 4강: 천하 4검! (실존 시그니처: 만년빙천자 + 벽산대참[RED] + 태극권[PARRY] + 무도취[PARRY])
      { name: '천하4검 · 설화검선(雪花劍仙)', sect: '백두 설화문', age: 49, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_frost_lunge', 'sig_mountain_split', 'sk_cn_03', 'sk_jp_01'], gender: 'FEMALE' },
      // 결승: 천하제일 무신! (실존 시그니처: 벽력낙천검 + 패왕단공참[RED] + 공수입백인[PARRY] + 유수반격검[PARRY])
      { name: '천하제일 · 뇌제검성(雷帝劍聖)', sect: '태백 천뢰검파', age: 56, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_thunder_drop', 'sig_tyrant_cleave', 'sig_barehand_blade', 'sig_flowing_riposte'] },
    ],
    CHINA: [
      { name: '강소 소무관 사형', sect: '양주 소무관', age: 22, ai: 'AGGRESSIVE', weapon: 'UNARMED', skills: ['base_h_slash', 'sk_cn_01'] },
      { name: '하북 담퇴 사범', sect: '북평 담퇴문', age: 27, ai: 'RUSHDOWN', weapon: 'UNARMED', skills: ['sk_cn_02', 'sk_cn_01', 'base_v_slash'] },
      { name: '사천 당문 여협', sect: '촉중 당문', age: 29, ai: 'RANGED', weapon: 'THROWN', skills: ['sk_cn_07', 'sk_cn_04', 'sk_cn_06'], gender: 'FEMALE' },
      { name: '강남 표국 총표두', sect: '진위 대표국', age: 36, ai: 'HEAVY', weapon: 'POLEARM', skills: ['sk_cn_06', 'sk_cn_05', 'sk_cn_01'] },
      { name: '무당 태극 진인', sect: '무당파', age: 42, ai: 'DUELIST', weapon: 'BLADE', skills: ['sk_cn_03', 'sk_cn_04', 'sig_formless_qi'] },
      { name: '화산 자하 대검객', sect: '화산파', age: 45, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_crimson_slash', 'sk_cn_06', 'sk_cn_03'] },
      // 4강: 천하 4검!
      { name: '천하4검 · 화룡검존(火龍劍尊)', sect: '곤륜 화룡검문', age: 51, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_crimson_slash', 'sig_hellfire_cross', 'sk_cn_03', 'sk_jp_01'] },
      // 결승: 천하제일 무신!
      { name: '천하제일 · 태극검황(太極劍皇)', sect: '중원 무림맹', age: 58, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_thunder_drop', 'sig_tyrant_cleave', 'sig_flowing_riposte', 'sig_barehand_blade'] },
    ],
    JAPAN: [
      { name: '오사카 낭인 검객', sect: '나니와 검도장', age: 24, ai: 'AGGRESSIVE', weapon: 'BLADE', skills: ['base_h_slash', 'base_v_slash'] },
      { name: '교토 유술 사범', sect: '야규 유술관', age: 29, ai: 'RUSHDOWN', weapon: 'UNARMED', skills: ['sk_jp_04', 'sk_jp_02', 'base_h_slash'] },
      { name: '사쓰마 지겐류 고수', sect: '지겐류 도장', age: 33, ai: 'HEAVY', weapon: 'BLADE', skills: ['sk_jp_06', 'sk_jp_03', 'sk_jp_02'] },
      { name: '나라 호조인류 창호', sect: '호조인류', age: 37, ai: 'HEAVY', weapon: 'POLEARM', skills: ['sk_jp_05', 'sk_jp_01', 'sk_jp_02'] },
      { name: '이가 닌자 두령', sect: '이가 인법당', age: 39, ai: 'RUSHDOWN', weapon: 'THROWN', skills: ['sk_jp_07', 'sk_jp_08', 'sk_jp_03'] },
      { name: '이천일류 수석 사범', sect: '이천일류 본가', age: 44, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_cross_slash', 'sk_jp_02', 'sk_jp_01'] },
      // 4강: 천하 4검!
      { name: '천하4검 · 빙월 여검호(氷月)', sect: '에치고 설월류', age: 46, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_frost_lunge', 'sig_behead', 'sk_jp_01', 'sk_cn_03'], gender: 'FEMALE' },
      // 결승: 천하제일 무신!
      { name: '천하제일 · 어전 검성(御前劍聖)', sect: '에도 신카게류', age: 57, ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_thunder_drop', 'sig_behead', 'sig_barehand_blade', 'sig_flowing_riposte'] },
    ],
  };

  const list = rosters[country];
  return list[Math.max(0, Math.min(list.length - 1, round - 1))];
}

// 256강(R1) ~ 결승(R8) 토너먼트 배틀 설정 생성기 (절대 난이도 기준 적용!)
export function createTournamentBattle(state: GameState, round: number): BattleConfig {
  const rDef = TOURNAMENT_ROUNDS[Math.max(0, Math.min(7, round - 1))];
  const tName = getTournamentName(state.country);
  const opp = getOpponentForRound(state.country, round);
  const scale = rDef.fixedScale;

  const stats: Stats = {
    str: Math.round(14 + scale * 21),
    agi: Math.round(14 + scale * 20),
    vit: Math.round(14 + scale * 21),
    wil: Math.round(14 + scale * 21),
    ins: Math.round(14 + scale * 22),
    qi: Math.round(14 + scale * 21),
  };
  const hp = Math.round(135 + scale * 255);
  const isFinal = round === 8;
  const prizeWeapon = isFinal
    ? ALL_WEAPONS_CATALOG.find((w) => w.grade === 'TREASURE' && !state.weapons.some((ow) => ow.id === w.id)) ||
      ALL_WEAPONS_CATALOG.find((w) => w.grade === 'TREASURE')
    : undefined;

  return {
    id: `tourney_r${round}_${state.year}`,
    title: `${tName} · ${rDef.label}`,
    subtitle: `${rDef.tierTitle} · 상대 유파 【${opp.sect}】`,
    isRealDuel: false,
    isTournament: true,
    tournamentRound: round,
    tournamentName: tName,
    enemyName: opp.name,
    enemyTitle: opp.sect,
    enemyAge: opp.age,
    enemyAi: opp.ai,
    enemyHp: hp,
    enemyStats: stats,
    enemyWeaponGroup: opp.weapon,
    enemySkills: opp.skills.map((sid) => buildMasterSkill(sid, rDef.skillLevel, round >= 6)),
    rewardMoney: rDef.winMoney,
    rewardFame: rDef.winFame,
    rewardWeaponId: prizeWeapon?.id,
    canUseDisciple: true,
    eventFollowupId: isFinal ? `tourney_champ|${round}` : `tourney_advance|${round + 1}`,
  };
}

// ★ 객석 관전 모드용 8강(6) → 4강(7) → 결승(8) 초절정 고수 vs 고수 화려한 대결 생성기! ★
export function createTournamentSpectatorBattle(state: GameState, round: 6 | 7 | 8): BattleConfig {
  const rDef = TOURNAMENT_ROUNDS[round - 1];
  const tName = getTournamentName(state.country);
  const rightOpp = getOpponentForRound(state.country, round);

  // 왼쪽 절정 고수는 다른 나라/전설 유파 초절정 고수로 매칭해 Lv.9~10 화염·뇌전·빙결·카운터 초식 난무 연출!
  const leftPool: Record<6 | 7 | 8, RosterEntry & { country: CountryId }> = {
    6: {
      name: '천하8검 · 청풍검객',
      sect: '관동 청풍류',
      age: 43,
      ai: 'DUELIST',
      weapon: 'BLADE',
      skills: ['sig_issen', 'sig_cross_slash', 'sk_cn_03'],
      country: state.country === 'KOREA' ? 'JAPAN' : 'KOREA',
      gender: 'MALE',
    },
    7: {
      name: '천하4검 · 홍련여제(紅蓮女帝)',
      sect: '강남 홍련검문',
      age: 38,
      ai: 'DUELIST',
      weapon: 'BLADE',
      skills: ['sig_crimson_slash', 'sig_hellfire_cross', 'sk_jp_01'],
      country: 'CHINA',
      gender: 'FEMALE',
    },
    8: {
      name: '천하4검 · 백발검선(白髮劍仙)',
      sect: '금강 산중문',
      age: 63,
      ai: 'DUELIST',
      weapon: 'BLADE',
      skills: ['sig_frost_lunge', 'sig_flowing_riposte', 'sig_thunder_drop'],
      country: state.country,
      gender: 'MALE',
    },
  };

  const left = leftPool[round];
  const scale = rDef.fixedScale;
  const makeStats = (s: number): Stats => ({
    str: Math.round(18 + s * 18),
    agi: Math.round(18 + s * 18),
    vit: Math.round(18 + s * 18),
    wil: Math.round(20 + s * 19),
    ins: Math.round(24 + s * 18),
    qi: Math.round(24 + s * 19),
  });
  const hp = Math.round(260 + scale * 155); // 관전용은 너무 길지 않으면서 화끈하게 공방이 오가도록!

  return {
    id: `tourney_spec_r${round}_${state.year}`,
    title: `[객석 관전] ${tName} · ${rDef.label}`,
    subtitle: `${rDef.tierTitle} — 천하 절정 고수들의 극의 비무를 직접 감상합니다`,
    isRealDuel: false,
    isTournament: true,
    tournamentRound: round,
    tournamentName: tName,
    canUseDisciple: false,
    spectatorMode: true,
    spectatorLeft: {
      name: left.name,
      sectName: left.sect,
      age: left.age,
      hp,
      stats: makeStats(scale),
      skills: left.skills.map((sid) => buildMasterSkill(sid, rDef.skillLevel, true)),
      country: left.country,
      gender: left.gender || 'MALE',
    },
    enemyName: rightOpp.name,
    enemyTitle: rightOpp.sect,
    enemyAge: rightOpp.age,
    enemyAi: rightOpp.ai,
    enemyHp: hp,
    enemyStats: makeStats(scale),
    enemyWeaponGroup: rightOpp.weapon,
    enemySkills: rightOpp.skills.map((sid) => buildMasterSkill(sid, rDef.skillLevel, true)),
    eventFollowupId: round < 8 ? `tourney_spec_next|${round + 1}` : 'tourney_spec_done',
  };
}

// 현재 명성 대비 도달 라운드(패배 시 또는 우승 시) 기대치 명성 보정 계산!
export function evaluateTournamentFameAdjustment(currentFame: number, reachedRound: number, wonFinal: boolean): {
  bonusFame: number;
  summaryLine: string;
} {
  const rDef = TOURNAMENT_ROUNDS[Math.max(0, Math.min(7, reachedRound - 1))];
  if (wonFinal) {
    const underdogBonus = currentFame < rDef.expectedFame ? Math.min(180, Math.round((rDef.expectedFame - currentFame) * 0.25)) : 0;
    return {
      bonusFame: underdogBonus,
      summaryLine:
        underdogBonus > 0
          ? `기대치를 훌쩍 뛰어넘는 대이변 우승! 세간의 경악 속에 명성 +${underdogBonus} 추가 상승!`
          : `천하가 인정한 최강 문파로서 위명을 공고히 했다!`,
    };
  }

  // 패배 시: 직전까지 올라간 라운드 기준으로 현재 명성과 기대 명성을 비교!
  const achievedDef = reachedRound > 1 ? TOURNAMENT_ROUNDS[reachedRound - 2] : rDef;
  if (reachedRound >= 4 && currentFame < achievedDef.expectedFame) {
    // 명성 대비 훨씬 높은 라운드까지 선전한 언더독!
    const extra = Math.min(95, Math.round((achievedDef.expectedFame - currentFame) * 0.32));
    return {
      bonusFame: extra,
      summaryLine: `명성(${currentFame})에 비해 무려 ${rDef.label}까지 오르는 대이변을 일으켜, 패배에도 불구하고 뜨거운 찬사를 받았다! (추가 명성 +${extra})`,
    };
  }
  if (currentFame > rDef.expectedFame * 1.35 && reachedRound <= 5) {
    // 명성이 높은 대문파가 초반 라운드에서 조기 탈락!
    const drop = Math.min(65, Math.max(12, Math.round((currentFame - rDef.expectedFame) * 0.14)));
    return {
      bonusFame: -drop,
      summaryLine: `높은 명성(${currentFame})에 비해 ${rDef.label}에서 너무 일찍 탈락하여 세간의 실망을 샀다. (명성 -${drop})`,
    };
  }
  return {
    bonusFame: 0,
    summaryLine: `${rDef.label} 무대에서 값진 실전 경험을 쌓고 도장으로 돌아왔다.`,
  };
}
