import {
  Book,
  ImprintedTrait,
  Skill,
  TraitTier,
  SkillElement,
  SkillForm,
  SkillOrigin,
  WeaponGroup,
} from '../types/game';

export const MASTERY_NAMES = [
  '',
  '입문',
  '초급',
  '숙달',
  '고수',
  '달인',
  '화경',
  '현경',
  '생사경',
  '입신',
  '극의',
];

export const MASTERY_EXP_REQ: Record<number, number> = {
  1: 100,
  2: 150,
  3: 200,
  4: 250,
  5: 350,
  6: 450,
  7: 550,
  8: 650,
  9: 800,
  10: 999999,
};

// 수련·사건·대련으로 오를 수 있는 마지막 경지. Lv.10 극의는 폐관수련이나 큰 깨달음으로만 연다.
export const MASTERY_WALL_LEVEL = 9;

// Lv.9에서 숙련이 가득 차 더는 오르지 않는 상태 — "벽(壁)에 부딪혔다"
export function isAtMasteryWall(skill: Pick<Skill, 'masteryLevel' | 'masteryExp'>): boolean {
  return skill.masteryLevel === MASTERY_WALL_LEVEL && skill.masteryExp >= MASTERY_EXP_REQ[MASTERY_WALL_LEVEL];
}

// 현재 경지 안에서의 숙련 진척(0~100). 극의는 100으로 본다.
export function getMasteryPct(skill: Pick<Skill, 'masteryLevel' | 'masteryExp'>): number {
  if (skill.masteryLevel >= 10) return 100;
  const req = MASTERY_EXP_REQ[skill.masteryLevel] || 999;
  return Math.min(100, Math.round((skill.masteryExp / req) * 100));
}

// 극의에 오르는 순간 초식 자체가 바뀐다: 위력↑, 선딜·쿨타임·기력 소모↓.
// 스킬 수치에 직접 새기므로 자동전투·실시간 전투·대회 관전 어디서나 똑같이 적용된다.
export const TRANSCEND_POWER_MULT = 1.5;
export const TRANSCEND_WINDUP_MULT = 0.85;
export const TRANSCEND_COOLDOWN_MULT = 0.8;
export const TRANSCEND_QI_MULT = 0.75;

// ── 극의의 경지 ──
// 극의는 세상에 나 하나뿐인 경지다. 강호의 어떤 고수도 Lv.9(입신)를 넘지 못하므로:
//  · 극의 초식은 극의에 이르지 못한 자가 간파(패링)할 수 없다 — 피하는 수밖에 없다.
//  · 극의 초식을 하나라도 지닌 무인은 상대의 수를 먼저 읽는다: 상대의 간파 확률이 줄고 나의 간파 확률이 오른다.
export const TRANSCEND_ENEMY_PARRY_MULT = 0.6;
export const TRANSCEND_PARRY_BONUS = 0.08;

export function isTranscended(skill: Pick<Skill, 'masteryLevel'> | null | undefined): boolean {
  return !!skill && skill.masteryLevel >= 10;
}

// 장착한 초식(심법 포함) 가운데 극의가 있는가
export function hasTranscendence(skills: Array<Pick<Skill, 'masteryLevel'>>): boolean {
  return skills.some((s) => s.masteryLevel >= 10);
}

// 경지 차이를 반영한 간파 확률. 한쪽만 극의일 때만 작동한다 (둘 다 극의라면 대등).
export function applyTranscendParry(chance: number, attackerTranscended: boolean, defenderTranscended: boolean): number {
  if (attackerTranscended && !defenderTranscended) return chance * TRANSCEND_ENEMY_PARRY_MULT;
  if (defenderTranscended && !attackerTranscended) return chance + TRANSCEND_PARRY_BONUS;
  return chance;
}

// 이 초식을 상대가 간파할 수 없는가 (극의 초식 vs 극의에 이르지 못한 자)
export function isUnparryableByTranscendence(skill: Pick<Skill, 'masteryLevel'>, defenderTranscended: boolean): boolean {
  return skill.masteryLevel >= 10 && !defenderTranscended;
}

export const TRANSCEND_SUMMARY = `위력 +${Math.round((TRANSCEND_POWER_MULT - 1) * 100)}%, 누구도 간파 못 함, 선딜·쿨타임·기력 소모 감소`;
export const TRANSCEND_AURA_SUMMARY = `극의를 지닌 채 싸우면 상대의 간파 −${Math.round((1 - TRANSCEND_ENEMY_PARRY_MULT) * 100)}%, 나의 간파 +${Math.round(TRANSCEND_PARRY_BONUS * 100)}%p`;

export function transcendSkill(skill: Skill): Skill {
  if (skill.masteryLevel >= 10) return skill;
  return {
    ...skill,
    masteryLevel: 10,
    masteryExp: 0,
    power: Math.round(skill.power * TRANSCEND_POWER_MULT),
    windupMs: Math.max(80, Math.round(skill.windupMs * TRANSCEND_WINDUP_MULT)),
    cooldownMs: Math.max(900, Math.round(skill.cooldownMs * TRANSCEND_COOLDOWN_MULT)),
    qiCost: Math.round(skill.qiCost * TRANSCEND_QI_MULT),
    pendingTraitTier: 10,
  };
}

export const FORM_LABEL: Record<SkillForm, string> = {
  SLASH: '베기',
  THRUST: '찌르기',
  STRIKE: '타격',
  GRAPPLE: '잡기',
  STEP: '보법',
  PARRY: '방어',
  PROJECTILE: '투사',
  AURA: '심법',
};

export const WEAPON_GROUP_LABEL: Record<WeaponGroup, string> = {
  BLADE: '도검',
  POLEARM: '창봉',
  UNARMED: '맨손',
  THROWN: '암기',
  CATALYST: '촉매',
  ANY: '무관',
};

export const ELEMENT_LABEL: Record<SkillElement, string> = {
  PHYSICAL: '물리',
  FIRE: '화염',
  ICE: '빙결',
  LIGHTNING: '뇌전',
  WIND: '질풍',
  QI: '강기',
  SHADOW: '환영/독',
};

export function createBaseSkills(): Skill[] {
  return [
    {
      id: 'base_h_slash',
      name: '횡베기',
      description: '허리를 틀어 수평으로 베는 가장 기초적인 일격. 아버지가 남긴 두 초식 중 하나.',
      creator: '무명(원형)',
      form: 'SLASH',
      weapon: 'BLADE',
      origin: ['NAMELESS'],
      element: 'PHYSICAL',
      masteryLevel: 1,
      masteryExp: 0,
      imprintedTraits: [],
      power: 18,
      windupMs: 360,
      recoveryMs: 240,
      cooldownMs: 1800,
      qiCost: 0,
      range: 'MID',
      telegraph: 'YELLOW',
      postureDamage: 16,
    },
    {
      id: 'base_v_slash',
      name: '종베기',
      description: '머리 위에서 수직으로 내리치는 묵직한 일격. 단순하지만 바르게 긋기 어렵다.',
      creator: '무명(원형)',
      form: 'SLASH',
      weapon: 'BLADE',
      origin: ['NAMELESS'],
      element: 'PHYSICAL',
      masteryLevel: 1,
      masteryExp: 0,
      imprintedTraits: [],
      power: 22,
      windupMs: 440,
      recoveryMs: 280,
      cooldownMs: 2100,
      qiCost: 0,
      range: 'MID',
      telegraph: 'YELLOW',
      postureDamage: 22,
    },
  ];
}

// 서적에서 습득 가능한 스킬 템플릿 40종
export const BOOK_SKILL_TEMPLATES: Record<string, Omit<Skill, 'masteryLevel' | 'masteryExp' | 'imprintedTraits'>> = {
  // 조선 8종
  sk_kr_01: {
    id: 'sk_kr_01', name: '예도 연격', description: '사도세자 명으로 편찬된 실전 검법. 균형 잡힌 2연격.',
    creator: '조선 무예', form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 24, windupMs: 320, recoveryMs: 260, cooldownMs: 2000, qiCost: 5, range: 'MID', telegraph: 'YELLOW', postureDamage: 20,
  },
  sk_kr_02: {
    id: 'sk_kr_02', name: '격자세', description: '조선세법의 정수. 빠르고 매서운 급소 찌르기.',
    creator: '조선세법', form: 'THRUST', weapon: 'BLADE', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 30, windupMs: 260, recoveryMs: 220, cooldownMs: 2200, qiCost: 8, range: 'MID', telegraph: 'YELLOW', postureDamage: 18,
  },
  sk_kr_03: {
    id: 'sk_kr_03', name: '품밟기', description: '리듬감 있는 삼각 보법으로 공격을 흘리며 이동.',
    creator: '택견', form: 'STEP', weapon: 'ANY', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 0, windupMs: 80, recoveryMs: 120, cooldownMs: 2600, qiCost: 6, range: 'ANY', telegraph: 'NONE',
  },
  sk_kr_04: {
    id: 'sk_kr_04', name: '째차기', description: '유연한 하체에서 나오는 기습 발차기. 체세를 크게 흔든다.',
    creator: '택견', form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 22, windupMs: 290, recoveryMs: 240, cooldownMs: 1900, qiCost: 5, range: 'CLOSE', telegraph: 'YELLOW', postureDamage: 32,
  },
  sk_kr_05: {
    id: 'sk_kr_05', name: '용약찌르기', description: '긴 창날로 적의 접근을 막는 조선 군영 기창술.',
    creator: '조선 군영', form: 'THRUST', weapon: 'POLEARM', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 28, windupMs: 350, recoveryMs: 280, cooldownMs: 2300, qiCost: 6, range: 'FAR', telegraph: 'YELLOW', postureDamage: 22,
  },
  sk_kr_06: {
    id: 'sk_kr_06', name: '파풍대참', description: '긴 장도를 양손으로 휘둘러 갑옷째 가르는 적색 강공.',
    creator: '쌍수도', form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'WIND',
    power: 48, windupMs: 600, recoveryMs: 420, cooldownMs: 3600, qiCost: 14, range: 'MID', telegraph: 'RED', postureDamage: 45,
  },
  sk_kr_07: {
    id: 'sk_kr_07', name: '연환도리깨', description: '방패 너머까지 꺾어 때리는 조선 기병의 편곤술.',
    creator: '조선 기병', form: 'STRIKE', weapon: 'POLEARM', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 34, windupMs: 420, recoveryMs: 300, cooldownMs: 2800, qiCost: 10, range: 'FAR', telegraph: 'YELLOW', postureDamage: 36,
  },
  sk_kr_08: {
    id: 'sk_kr_08', name: '단전호흡법', description: '[운기 심법] QI 회복 +35%, 노년기 건강 하락 경감.',
    creator: '선도 양생', form: 'AURA', weapon: 'ANY', origin: ['EASTERN'], element: 'QI',
    power: 0, windupMs: 0, recoveryMs: 0, cooldownMs: 0, qiCost: 0, range: 'ANY', telegraph: 'NONE', isPassive: true,
  },

  // 청 9종
  sk_cn_01: {
    id: 'sk_cn_01', name: '금강정권', description: '묵직하고 정직한 소림 정권. 근력 보정이 높다.',
    creator: '소림', form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 26, windupMs: 300, recoveryMs: 220, cooldownMs: 1700, qiCost: 4, range: 'CLOSE', telegraph: 'YELLOW', postureDamage: 24,
  },
  sk_cn_02: {
    id: 'sk_cn_02', name: '연환비퇴', description: '쉴 새 없이 몰아치는 북파 담퇴 3연속 발차기.',
    creator: '담퇴문', form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 28, windupMs: 280, recoveryMs: 260, cooldownMs: 2100, qiCost: 6, range: 'CLOSE', telegraph: 'YELLOW', postureDamage: 22,
  },
  sk_cn_03: {
    id: 'sk_cn_03', name: '사량발천근', description: '4냥의 힘으로 천 근을 흘려 역습하는 태극 간파 방어.',
    creator: '태극문', form: 'PARRY', weapon: 'ANY', origin: ['EASTERN'], element: 'QI',
    power: 26, windupMs: 100, recoveryMs: 180, cooldownMs: 2800, qiCost: 10, range: 'ANY', telegraph: 'BLUE', postureDamage: 45,
  },
  sk_cn_04: {
    id: 'sk_cn_04', name: '팔괘선보', description: '원형을 그리며 적의 사각으로 파고드는 팔괘 보법.',
    creator: '팔괘장', form: 'STEP', weapon: 'UNARMED', origin: ['EASTERN'], element: 'WIND',
    power: 12, windupMs: 90, recoveryMs: 140, cooldownMs: 2800, qiCost: 10, range: 'CLOSE', telegraph: 'NONE',
  },
  sk_cn_05: {
    id: 'sk_cn_05', name: '붕권', description: '한 걸음에 폭발적 발경을 실어 내부를 뚫는 적색 권법.',
    creator: '형의권', form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN'], element: 'QI',
    power: 38, windupMs: 380, recoveryMs: 320, cooldownMs: 2900, qiCost: 14, range: 'CLOSE', telegraph: 'RED', postureDamage: 40,
  },
  sk_cn_06: {
    id: 'sk_cn_06', name: '반월참', description: '넓은 사거리와 압도적 무게로 쓸어버리는 청룡도술.',
    creator: '중원 도법', form: 'SLASH', weapon: 'POLEARM', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 44, windupMs: 540, recoveryMs: 380, cooldownMs: 3400, qiCost: 12, range: 'FAR', telegraph: 'RED', postureDamage: 42,
  },
  sk_cn_07: {
    id: 'sk_cn_07', name: '비침산우', description: '은밀히 독침을 뿌려 적의 전조를 끊고 중독시킨다.',
    creator: '당문', form: 'PROJECTILE', weapon: 'THROWN', origin: ['EXOTIC'], element: 'SHADOW',
    power: 20, windupMs: 200, recoveryMs: 180, cooldownMs: 2400, qiCost: 10, range: 'FAR', telegraph: 'YELLOW',
    statusEffect: { type: 'POISON', chance: 0.75, value: 6, durationMs: 5000 },
  },
  sk_cn_08: {
    id: 'sk_cn_08', name: '축지법', description: '순간적으로 거리를 0으로 좁히고 다음 공격을 강화한다.',
    creator: '전설 보법', form: 'STEP', weapon: 'ANY', origin: ['EASTERN'], element: 'WIND',
    power: 0, windupMs: 60, recoveryMs: 80, cooldownMs: 3200, qiCost: 15, range: 'ANY', telegraph: 'NONE',
  },
  sk_cn_09: {
    id: 'sk_cn_09', name: '호신강기', description: '[운기 심법] 받는 피해 -15%, 강기·검기 위력 +25%.',
    creator: '혼원일기공', form: 'AURA', weapon: 'ANY', origin: ['EASTERN'], element: 'QI',
    power: 0, windupMs: 0, recoveryMs: 0, cooldownMs: 0, qiCost: 0, range: 'ANY', telegraph: 'NONE', isPassive: true,
  },

  // 일본 8종
  sk_jp_01: {
    id: 'sk_jp_01', name: '무도취', description: '맨손으로 칼날을 받아쳐 적을 제압하는 신카게류 비술.',
    creator: '신카게류', form: 'PARRY', weapon: 'ANY', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 22, windupMs: 110, recoveryMs: 180, cooldownMs: 3000, qiCost: 12, range: 'CLOSE', telegraph: 'BLUE', postureDamage: 48,
    statusEffect: { type: 'STUN', chance: 0.85, value: 1, durationMs: 1400 },
  },
  sk_jp_02: {
    id: 'sk_jp_02', name: '십자쌍검', description: '공수를 동시에 전개하는 이천일류 양손 검술.',
    creator: '이천일류', form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 42, windupMs: 340, recoveryMs: 260, cooldownMs: 2700, qiCost: 16, range: 'MID', telegraph: 'YELLOW', postureDamage: 30,
  },
  sk_jp_03: {
    id: 'sk_jp_03', name: '섬전발도', description: '칼집에서 뽑는 순간 베는 초고속 거합. 적색 전조 차단 특화.',
    creator: '거합도', form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'WIND',
    power: 34, windupMs: 190, recoveryMs: 240, cooldownMs: 2600, qiCost: 12, range: 'MID', telegraph: 'YELLOW', postureDamage: 24,
  },
  sk_jp_04: {
    id: 'sk_jp_04', name: '업어치기', description: '청색 방어 태세의 적을 메다꽂아 체세를 박살낸다.',
    creator: '야규 유술', form: 'GRAPPLE', weapon: 'UNARMED', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 26, windupMs: 320, recoveryMs: 260, cooldownMs: 2500, qiCost: 8, range: 'CLOSE', telegraph: 'RED', postureDamage: 50,
    statusEffect: { type: 'STUN', chance: 0.6, value: 1, durationMs: 1000 },
  },
  sk_jp_05: {
    id: 'sk_jp_05', name: '십자창 꿰기', description: '갈고리 창날로 적의 무기를 걸어 흐름을 늦추고 찌른다.',
    creator: '호조인류', form: 'THRUST', weapon: 'POLEARM', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 26, windupMs: 340, recoveryMs: 280, cooldownMs: 2400, qiCost: 8, range: 'FAR', telegraph: 'YELLOW', postureDamage: 24,
  },
  sk_jp_06: {
    id: 'sk_jp_06', name: '원숭이 괴성참', description: '두 번째 칼질은 생각지 않는 사쓰마의 극단적 일격.',
    creator: '지겐류', form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'PHYSICAL',
    power: 56, windupMs: 560, recoveryMs: 480, cooldownMs: 4000, qiCost: 16, range: 'MID', telegraph: 'RED', postureDamage: 52,
  },
  sk_jp_07: {
    id: 'sk_jp_07', name: '연막 분신술', description: '연막과 잔상으로 적의 조준을 흐리고 거리를 벌린다.',
    creator: '이가 인법', form: 'STEP', weapon: 'THROWN', origin: ['EXOTIC'], element: 'SHADOW',
    power: 12, windupMs: 100, recoveryMs: 140, cooldownMs: 3400, qiCost: 14, range: 'ANY', telegraph: 'NONE',
  },
  sk_jp_08: {
    id: 'sk_jp_08', name: '식신 결박부', description: '주술 부적을 날려 적의 이동과 공격 속도를 둔화시킨다.',
    creator: '음양도', form: 'PROJECTILE', weapon: 'CATALYST', origin: ['EXOTIC'], element: 'SHADOW',
    power: 18, windupMs: 300, recoveryMs: 240, cooldownMs: 3500, qiCost: 15, range: 'FAR', telegraph: 'YELLOW',
    statusEffect: { type: 'SLOW', chance: 0.9, value: 0.35, durationMs: 4000 },
  },

  // 서양 8종
  sk_we_01: {
    id: 'sk_we_01', name: '레이피어 런지', description: '이탈리아 르네상스 검술. 최단 거리 기하학 급소 찌르기.',
    creator: '아그리파', form: 'THRUST', weapon: 'BLADE', origin: ['WESTERN'], element: 'PHYSICAL',
    power: 32, windupMs: 240, recoveryMs: 200, cooldownMs: 2100, qiCost: 8, range: 'MID', telegraph: 'YELLOW', postureDamage: 18,
  },
  sk_we_02: {
    id: 'sk_we_02', name: '파리 리포스트', description: '프랑스 에페 결투술. 검을 살짝 튕겨내고 즉시 급소를 찌른다.',
    creator: '프랑스 에페', form: 'PARRY', weapon: 'BLADE', origin: ['WESTERN'], element: 'PHYSICAL',
    power: 32, windupMs: 110, recoveryMs: 160, cooldownMs: 2600, qiCost: 10, range: 'MID', telegraph: 'BLUE', postureDamage: 38,
  },
  sk_we_03: {
    id: 'sk_we_03', name: '츠베르히하우', description: '독일 롱소드 비전. 적의 내려베기를 가로로 쳐내며 반격.',
    creator: '리히테나워', form: 'SLASH', weapon: 'BLADE', origin: ['WESTERN'], element: 'PHYSICAL',
    power: 36, windupMs: 330, recoveryMs: 260, cooldownMs: 2600, qiCost: 10, range: 'MID', telegraph: 'YELLOW', postureDamage: 28,
  },
  sk_we_04: {
    id: 'sk_we_04', name: '베어너클 훅', description: '1743년 영국 브로턴 실전 권투. 빠른 연타와 기절 유발.',
    creator: '잭 브로턴', form: 'STRIKE', weapon: 'UNARMED', origin: ['WESTERN'], element: 'PHYSICAL',
    power: 28, windupMs: 240, recoveryMs: 190, cooldownMs: 1800, qiCost: 6, range: 'CLOSE', telegraph: 'YELLOW', postureDamage: 26,
    statusEffect: { type: 'STUN', chance: 0.25, value: 1, durationMs: 700 },
  },
  sk_we_05: {
    id: 'sk_we_05', name: '관절 꺾기', description: '고대 그리스 판크라티온. 방어하는 적을 붙잡아 힘을 꺾는다.',
    creator: '판크라티온', form: 'GRAPPLE', weapon: 'UNARMED', origin: ['WESTERN'], element: 'PHYSICAL',
    power: 30, windupMs: 310, recoveryMs: 260, cooldownMs: 2900, qiCost: 10, range: 'CLOSE', telegraph: 'RED', postureDamage: 45,
    statusEffect: { type: 'WEAKEN', chance: 0.85, value: 0.25, durationMs: 5000 },
  },
  sk_we_06: {
    id: 'sk_we_06', name: '원형 보법 찌르기', description: '스페인 데스트레자. 원 위를 걸으며 회피와 찌르기를 동시에.',
    creator: '데스트레자', form: 'STEP', weapon: 'BLADE', origin: ['WESTERN'], element: 'PHYSICAL',
    power: 30, windupMs: 260, recoveryMs: 200, cooldownMs: 2700, qiCost: 12, range: 'MID', telegraph: 'YELLOW',
  },
  sk_we_07: {
    id: 'sk_we_07', name: '대검 회전참', description: '스코틀랜드 클레이모어의 원심력으로 모든 방어를 찢는다.',
    creator: '클레이모어', form: 'SLASH', weapon: 'BLADE', origin: ['WESTERN'], element: 'PHYSICAL',
    power: 52, windupMs: 620, recoveryMs: 420, cooldownMs: 3800, qiCost: 14, range: 'FAR', telegraph: 'RED', postureDamage: 48,
  },
  sk_we_08: {
    id: 'sk_we_08', name: '갑판 연환베기', description: '영국 해군 사브르. 흔들리는 배 위에서도 끊기지 않는 3연격.',
    creator: '왕립 해군', form: 'SLASH', weapon: 'BLADE', origin: ['WESTERN'], element: 'PHYSICAL',
    power: 32, windupMs: 290, recoveryMs: 240, cooldownMs: 2300, qiCost: 8, range: 'MID', telegraph: 'YELLOW', postureDamage: 24,
  },

  // 이계 금서 (판타지 7종)
  sk_fn_01: {
    id: 'sk_fn_01', name: '파이어볼', description: '단전의 양기를 응축해 허공에 화염구를 터뜨리는 이계 마법.',
    creator: '이계 금서', form: 'PROJECTILE', weapon: 'CATALYST', origin: ['FANTASY'], element: 'FIRE',
    power: 62, windupMs: 540, recoveryMs: 320, cooldownMs: 4200, qiCost: 26, range: 'FAR', telegraph: 'RED', postureDamage: 40,
    statusEffect: { type: 'BURN', chance: 0.9, value: 8, durationMs: 5000 },
  },
  sk_fn_02: {
    id: 'sk_fn_02', name: '아이스 스피어', description: '수기를 극한으로 얼려 창날처럼 쏘아 적을 동결시키는 마법.',
    creator: '이계 금서', form: 'PROJECTILE', weapon: 'CATALYST', origin: ['FANTASY'], element: 'ICE',
    power: 54, windupMs: 460, recoveryMs: 280, cooldownMs: 3800, qiCost: 24, range: 'FAR', telegraph: 'RED', postureDamage: 32,
    statusEffect: { type: 'FREEZE', chance: 0.75, value: 0.4, durationMs: 1600 },
  },
  sk_fn_03: {
    id: 'sk_fn_03', name: '라이트닝 볼트', description: '하늘의 벼락과 기혈을 이어 쏘는 극속의 낙뢰술.',
    creator: '이계 금서', form: 'PROJECTILE', weapon: 'CATALYST', origin: ['FANTASY'], element: 'LIGHTNING',
    power: 58, windupMs: 260, recoveryMs: 300, cooldownMs: 4400, qiCost: 28, range: 'FAR', telegraph: 'RED', postureDamage: 35,
    statusEffect: { type: 'SHOCK', chance: 0.85, value: 1, durationMs: 1500 },
  },
  sk_fn_04: {
    id: 'sk_fn_04', name: '헤이스트', description: '[운기 심법] 시간의 흐름을 비껴가 선딜·쿨타임 -22%.',
    creator: '이계 금서', form: 'AURA', weapon: 'ANY', origin: ['FANTASY'], element: 'WIND',
    power: 0, windupMs: 0, recoveryMs: 0, cooldownMs: 0, qiCost: 0, range: 'ANY', telegraph: 'NONE', isPassive: true,
  },
  sk_fn_05: {
    id: 'sk_fn_05', name: '마나 실드', description: '보이지 않는 영기 장벽을 둘러 모든 피해를 흡수한다.',
    creator: '이계 금서', form: 'PARRY', weapon: 'ANY', origin: ['FANTASY'], element: 'QI',
    power: 0, windupMs: 120, recoveryMs: 140, cooldownMs: 5500, qiCost: 28, range: 'ANY', telegraph: 'BLUE',
    statusEffect: { type: 'SHIELD', chance: 1, value: 0.3, durationMs: 5000 },
  },
  sk_fn_06: {
    id: 'sk_fn_06', name: '블링크', description: '공간을 접어 즉시 적의 등 뒤로 순간 이동한다.',
    creator: '이계 금서', form: 'STEP', weapon: 'ANY', origin: ['FANTASY'], element: 'SHADOW',
    power: 0, windupMs: 40, recoveryMs: 60, cooldownMs: 4000, qiCost: 22, range: 'ANY', telegraph: 'NONE',
  },
  sk_fn_07: {
    id: 'sk_fn_07', name: '그래비티', description: '[운기 심법] 사방의 기압을 짓눌러 적의 속도와 회피를 봉쇄.',
    creator: '이계 금서', form: 'AURA', weapon: 'CATALYST', origin: ['FANTASY'], element: 'QI',
    power: 0, windupMs: 0, recoveryMs: 0, cooldownMs: 0, qiCost: 0, range: 'ANY', telegraph: 'NONE', isPassive: true,
  },
};

export const ALL_BOOKS_CATALOG: Omit<Book, 'decodeProgress' | 'decoded'>[] = [
  // 조선 8권
  { id: 'bk_kr_01', title: '『무예신보초(武藝新譜抄)』', rarity: 'COMMON', countryBias: 'KOREA', price: 50, decodeApRequired: 0, skillTemplateId: 'sk_kr_01' },
  { id: 'bk_kr_02', title: '『조선세법 비전(朝鮮勢法)』', rarity: 'RARE', countryBias: 'KOREA', price: 130, decodeApRequired: 1, skillTemplateId: 'sk_kr_02' },
  { id: 'bk_kr_03', title: '『택견 활개보(步法錄)』', rarity: 'COMMON', countryBias: 'KOREA', price: 45, decodeApRequired: 0, skillTemplateId: 'sk_kr_03' },
  { id: 'bk_kr_04', title: '『택견 곁차기 비록』', rarity: 'COMMON', countryBias: 'KOREA', price: 50, decodeApRequired: 0, skillTemplateId: 'sk_kr_04' },
  { id: 'bk_kr_05', title: '『장창 기창결(旗槍訣)』', rarity: 'COMMON', countryBias: 'KOREA', price: 60, decodeApRequired: 0, skillTemplateId: 'sk_kr_05' },
  { id: 'bk_kr_06', title: '『쌍수도 요결(雙手刀)』', rarity: 'RARE', countryBias: 'KOREA', price: 160, decodeApRequired: 1, skillTemplateId: 'sk_kr_06' },
  { id: 'bk_kr_07', title: '『편곤 타격보(鞭棍譜)』', rarity: 'RARE', countryBias: 'KOREA', price: 150, decodeApRequired: 1, skillTemplateId: 'sk_kr_07' },
  { id: 'bk_kr_08', title: '『선도 양생결(仙道養生訣)』', rarity: 'LEGEND', countryBias: 'KOREA', price: 400, decodeApRequired: 2, skillTemplateId: 'sk_kr_08' },

  // 청 9권
  { id: 'bk_cn_01', title: '『소림 나한권보』', rarity: 'COMMON', countryBias: 'CHINA', price: 45, decodeApRequired: 0, skillTemplateId: 'sk_cn_01' },
  { id: 'bk_cn_02', title: '『담퇴 십이로(譚腿)』', rarity: 'COMMON', countryBias: 'CHINA', price: 55, decodeApRequired: 0, skillTemplateId: 'sk_cn_02' },
  { id: 'bk_cn_03', title: '『태극 십삼세(太極十三勢)』', rarity: 'RARE', countryBias: 'CHINA', price: 180, decodeApRequired: 1, skillTemplateId: 'sk_cn_03' },
  { id: 'bk_cn_04', title: '『팔괘장 유신보』', rarity: 'RARE', countryBias: 'CHINA', price: 150, decodeApRequired: 1, skillTemplateId: 'sk_cn_04' },
  { id: 'bk_cn_05', title: '『형의 오행권』', rarity: 'RARE', countryBias: 'CHINA', price: 170, decodeApRequired: 1, skillTemplateId: 'sk_cn_05' },
  { id: 'bk_cn_06', title: '『청룡언월도보』', rarity: 'RARE', countryBias: 'CHINA', price: 160, decodeApRequired: 1, skillTemplateId: 'sk_cn_06' },
  { id: 'bk_cn_07', title: '『당문 암기보(唐門)』', rarity: 'RARE', countryBias: 'CHINA', price: 140, decodeApRequired: 1, skillTemplateId: 'sk_cn_07' },
  { id: 'bk_cn_08', title: '『축지성촌 비급』', rarity: 'LEGEND', countryBias: 'CHINA', price: 380, decodeApRequired: 2, skillTemplateId: 'sk_cn_08' },
  { id: 'bk_cn_09', title: '『혼원일기공(混元一氣功)』', rarity: 'LEGEND', countryBias: 'CHINA', price: 450, decodeApRequired: 2, skillTemplateId: 'sk_cn_09' },

  // 일본 8권
  { id: 'bk_jp_01', title: '『신카게류 병법서』', rarity: 'RARE', countryBias: 'JAPAN', price: 190, decodeApRequired: 1, skillTemplateId: 'sk_jp_01' },
  { id: 'bk_jp_02', title: '『이천일류 검서(오륜서)』', rarity: 'LEGEND', countryBias: 'JAPAN', price: 420, decodeApRequired: 2, skillTemplateId: 'sk_jp_02' },
  { id: 'bk_jp_03', title: '『거합 발도술 극의』', rarity: 'RARE', countryBias: 'JAPAN', price: 180, decodeApRequired: 1, skillTemplateId: 'sk_jp_03' },
  { id: 'bk_jp_04', title: '『야규 심안 유술전』', rarity: 'COMMON', countryBias: 'JAPAN', price: 55, decodeApRequired: 0, skillTemplateId: 'sk_jp_04' },
  { id: 'bk_jp_05', title: '『호조인 창술록』', rarity: 'COMMON', countryBias: 'JAPAN', price: 60, decodeApRequired: 0, skillTemplateId: 'sk_jp_05' },
  { id: 'bk_jp_06', title: '『지겐류 일격비전』', rarity: 'RARE', countryBias: 'JAPAN', price: 170, decodeApRequired: 1, skillTemplateId: 'sk_jp_06' },
  { id: 'bk_jp_07', title: '『이가 인법첩(伊賀)』', rarity: 'RARE', countryBias: 'JAPAN', price: 150, decodeApRequired: 1, skillTemplateId: 'sk_jp_07' },
  { id: 'bk_jp_08', title: '『음양도 부적술 단편』', rarity: 'RARE', countryBias: 'JAPAN', price: 160, decodeApRequired: 1, skillTemplateId: 'sk_jp_08' },

  // 서양 8권
  { id: 'bk_we_01', title: '『아그리파의 검술론 (1553)』', rarity: 'WESTERN', price: 150, decodeApRequired: 1, skillTemplateId: 'sk_we_01' },
  { id: 'bk_we_02', title: '『프랑스 에페 결투 교본』', rarity: 'WESTERN', price: 170, decodeApRequired: 1, skillTemplateId: 'sk_we_02' },
  { id: 'bk_we_03', title: '『리히테나워 롱소드 비전』', rarity: 'WESTERN', price: 180, decodeApRequired: 1, skillTemplateId: 'sk_we_03' },
  { id: 'bk_we_04', title: '『브로턴의 권투 규칙 (1743)』', rarity: 'WESTERN', price: 130, decodeApRequired: 1, skillTemplateId: 'sk_we_04' },
  { id: 'bk_we_05', title: '『그리스 판크라티온 단편』', rarity: 'WESTERN', price: 160, decodeApRequired: 1, skillTemplateId: 'sk_we_05' },
  { id: 'bk_we_06', title: '『스페인 데스트레자 검서』', rarity: 'WESTERN', price: 190, decodeApRequired: 1, skillTemplateId: 'sk_we_06' },
  { id: 'bk_we_07', title: '『스코틀랜드 클레이모어 전서』', rarity: 'WESTERN', price: 200, decodeApRequired: 1, skillTemplateId: 'sk_we_07' },
  { id: 'bk_we_08', title: '『영국 해군 사브르 교본』', rarity: 'WESTERN', price: 150, decodeApRequired: 1, skillTemplateId: 'sk_we_08' },

  // 이계 금서 (판타지 7권)
  {
    id: 'bk_fn_01', title: '『붉은 재의 양피지』', rarity: 'GRIMOIRE', price: 420, decodeApRequired: 3,
    requiresMasteryLv: 5, requiresQi: 35, requiresWil: 32,
    unreadableHint: '만지면 미지근한 열기가 도는 알 수 없는 고대 기하학 문양의 책.',
    enlightenmentText: '이건 주문이 아니었다! 단전의 양기(陽氣)를 손끝 한 점에 몰아 공기를 발화시키는 궁극의 내공 운용법— 화구술(파이어볼)을 깨달았다!',
    skillTemplateId: 'sk_fn_01',
  },
  {
    id: 'bk_fn_02', title: '『서리 낀 은빛 석판』', rarity: 'GRIMOIRE', price: 420, decodeApRequired: 3,
    requiresMasteryLv: 5, requiresQi: 35, requiresWil: 32,
    unreadableHint: '한여름에도 표면에 하얀 성에가 맺히는 푸른 서판.',
    enlightenmentText: '대기의 수기(水氣)를 극한으로 응축해 얼음 창날로 쏘아내는 음기 응축법— 빙창술(아이스 스피어)을 깨달았다!',
    skillTemplateId: 'sk_fn_02',
  },
  {
    id: 'bk_fn_03', title: '『구리실로 꿰맨 번개첩』', rarity: 'GRIMOIRE', price: 480, decodeApRequired: 3,
    requiresMasteryLv: 5, requiresQi: 38, requiresWil: 35,
    unreadableHint: '책장을 넘길 때마다 손끝이 찌릿하게 울리는 기이한 고서.',
    enlightenmentText: '하늘의 벼락과 몸속 기혈의 전율을 이어 쏘는 극속의 술법— 낙뢰술(라이트닝 볼트)을 깨달았다!',
    skillTemplateId: 'sk_fn_03',
  },
  {
    id: 'bk_fn_04', title: '『날개 문양의 고서』', rarity: 'GRIMOIRE', price: 450, decodeApRequired: 3,
    requiresMasteryLv: 5, requiresQi: 35, requiresWil: 32,
    unreadableHint: '바람이 불지 않는데도 책장이 미세하게 팔랑거리는 서책.',
    enlightenmentText: '시간의 흐름마저 비껴가는 극한의 기혈 가속 심법— 헤이스트를 깨달았다!',
    skillTemplateId: 'sk_fn_04',
  },
  {
    id: 'bk_fn_05', title: '『육각형 수정 서판』', rarity: 'GRIMOIRE', price: 400, decodeApRequired: 2,
    requiresMasteryLv: 5, requiresQi: 34, requiresWil: 30,
    unreadableHint: '투명한 수정처럼 빛을 기묘하게 굴절시키는 문양이 새겨져 있다.',
    enlightenmentText: '보이지 않는 기의 장벽을 전신에 둘러 칼날을 튕겨내는 술법— 마나 실드를 깨달았다!',
    skillTemplateId: 'sk_fn_05',
  },
  {
    id: 'bk_fn_06', title: '『뒤틀린 거울의 단장』', rarity: 'GRIMOIRE', price: 520, decodeApRequired: 3,
    requiresMasteryLv: 5, requiresQi: 40, requiresWil: 36,
    unreadableHint: '오래 들여다보고 있으면 눈앞의 공간이 일렁이며 어지러워진다.',
    enlightenmentText: '두 걸음 사이의 공간을 접어 적의 등 뒤로 이동하는 허공 도약— 블링크를 깨달았다!',
    skillTemplateId: 'sk_fn_06',
  },
  {
    id: 'bk_fn_07', title: '『납처럼 무거운 검은 책』', rarity: 'GRIMOIRE', price: 560, decodeApRequired: 3,
    requiresMasteryLv: 5, requiresQi: 42, requiresWil: 38,
    unreadableHint: '얇은 책인데 장정 둘이 겨우 들 만큼 기이하게 무겁다.',
    enlightenmentText: '사방의 기압을 짓눌러 적을 무릎 꿇리는 절대 위압— 그래비티를 깨달았다!',
    skillTemplateId: 'sk_fn_07',
  },
];

// 시그니처 조합 레시피 (주요 40종)
export interface SignatureRecipe {
  id: string;
  a: string;
  b: string;
  isForbidden?: boolean;
  result: Omit<Skill, 'masteryLevel' | 'masteryExp' | 'imprintedTraits' | 'parents' | 'creator'>;
}

export const SIGNATURE_RECIPES: SignatureRecipe[] = [
  // ① 기초 · 동양 정통
  {
    id: 'sig_01', a: 'base_h_slash', b: 'base_v_slash',
    result: {
      id: 'sig_cross_slash', name: '십자참(十字斬)', description: '횡베기와 종베기를 쉼 없이 이어 긋는 유파 최초의 연환 참격.',
      form: 'SLASH', weapon: 'BLADE', origin: ['NAMELESS', 'EASTERN'], element: 'PHYSICAL',
      power: 34, windupMs: 340, recoveryMs: 240, cooldownMs: 2200, qiCost: 6, range: 'MID', telegraph: 'YELLOW', postureDamage: 28,
    },
  },
  {
    id: 'sig_02', a: 'base_h_slash', b: 'sk_cn_08',
    result: {
      id: 'sig_flash_draw', name: '섬광발도(閃光拔刀)', description: '축지보법으로 거리를 지우며 가로로 베는 초고속 선제기.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'WIND',
      power: 42, windupMs: 210, recoveryMs: 220, cooldownMs: 2800, qiCost: 14, range: 'FAR', telegraph: 'YELLOW', postureDamage: 26,
    },
  },
  {
    id: 'sig_03', a: 'base_v_slash', b: 'sk_kr_06',
    result: {
      id: 'sig_mountain_split', name: '벽산대참(劈山大斬)', description: '산을 가를 기세로 내리치는 적색 방어불가 대참격.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'WIND',
      power: 62, windupMs: 580, recoveryMs: 380, cooldownMs: 3800, qiCost: 16, range: 'MID', telegraph: 'RED', postureDamage: 60,
    },
  },
  {
    id: 'sig_04', a: 'base_h_slash', b: 'sk_jp_03',
    result: {
      id: 'sig_issen', name: '일섬(一閃)', description: '전조를 극단으로 줄여 적의 공격을 끊고 베어 넘기는 검술.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'WIND',
      power: 46, windupMs: 170, recoveryMs: 220, cooldownMs: 2900, qiCost: 14, range: 'MID', telegraph: 'YELLOW', postureDamage: 30,
    },
  },
  {
    id: 'sig_05', a: 'base_v_slash', b: 'sk_jp_06',
    result: {
      id: 'sig_behead', name: '필살단두참(必殺斷頭斬)', description: '일격에 모든 힘을 실어 내리꽂는 궁극의 물리 내려베기.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN'], element: 'PHYSICAL',
      power: 74, windupMs: 620, recoveryMs: 460, cooldownMs: 4500, qiCost: 18, range: 'MID', telegraph: 'RED', postureDamage: 65,
    },
  },
  {
    id: 'sig_06', a: 'base_h_slash', b: 'sk_cn_09',
    result: {
      id: 'sig_formless_qi', name: '무형검기(無形劍氣)', description: '호신강기를 검날에 실어 원거리까지 보이지 않는 검기를 날린다.',
      form: 'PROJECTILE', weapon: 'BLADE', origin: ['EASTERN'], element: 'QI',
      power: 48, windupMs: 340, recoveryMs: 260, cooldownMs: 3000, qiCost: 18, range: 'FAR', telegraph: 'YELLOW', postureDamage: 34,
    },
  },
  {
    id: 'sig_07', a: 'sk_cn_03', b: 'sk_jp_01',
    result: {
      id: 'sig_barehand_blade', name: '공수입백인(空手入白刃)', description: '태극의 흘리기와 무도취가 합쳐진 궁극의 간파 제압기.',
      form: 'PARRY', weapon: 'ANY', origin: ['EASTERN'], element: 'QI',
      power: 38, windupMs: 100, recoveryMs: 160, cooldownMs: 3200, qiCost: 14, range: 'ANY', telegraph: 'BLUE', postureDamage: 60,
      statusEffect: { type: 'STUN', chance: 0.9, value: 1, durationMs: 1800 },
    },
  },
  {
    id: 'sig_08', a: 'sk_cn_01', b: 'sk_cn_05',
    result: {
      id: 'sig_shatter_fist', name: '파산발경(破山發勁)', description: '방어를 꿰뚫고 내부를 박살내는 중원 최강의 정권.',
      form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN'], element: 'QI',
      power: 52, windupMs: 360, recoveryMs: 280, cooldownMs: 3000, qiCost: 16, range: 'CLOSE', telegraph: 'RED', postureDamage: 55,
    },
  },
  {
    id: 'sig_09', a: 'sk_kr_03', b: 'sk_cn_04',
    result: {
      id: 'sig_phantom_step', name: '유영환보(流影幻步)', description: '택견의 리듬과 팔괘의 원형 보법이 결합된 환상적인 회피기.',
      form: 'STEP', weapon: 'ANY', origin: ['EASTERN'], element: 'WIND',
      power: 14, windupMs: 70, recoveryMs: 100, cooldownMs: 2500, qiCost: 10, range: 'ANY', telegraph: 'NONE',
    },
  },
  {
    id: 'sig_10', a: 'sk_cn_02', b: 'sk_kr_04',
    result: {
      id: 'sig_whirl_kicks', name: '선풍십이퇴(旋風十二腿)', description: '상하단을 가리지 않고 몰아치는 4연속 발차기 콤보.',
      form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN'], element: 'WIND',
      power: 46, windupMs: 280, recoveryMs: 240, cooldownMs: 2600, qiCost: 12, range: 'CLOSE', telegraph: 'YELLOW', postureDamage: 38,
    },
  },
  {
    id: 'sig_11', a: 'sk_kr_05', b: 'sk_jp_05',
    result: {
      id: 'sig_dragon_spear', name: '비룡관천창(飛龍貫天槍)', description: '한일 양국의 장창술이 결합된 3연 관통 찌르기.',
      form: 'THRUST', weapon: 'POLEARM', origin: ['EASTERN'], element: 'PHYSICAL',
      power: 48, windupMs: 320, recoveryMs: 260, cooldownMs: 2800, qiCost: 12, range: 'FAR', telegraph: 'YELLOW', postureDamage: 34,
    },
  },
  {
    id: 'sig_12', a: 'sk_cn_06', b: 'sk_kr_07',
    result: {
      id: 'sig_breaker_halberd', name: '파진선풍도(破陣旋風刀)', description: '적진을 가르는 광범위 회전 충격파 병기술.',
      form: 'SLASH', weapon: 'POLEARM', origin: ['EASTERN'], element: 'PHYSICAL',
      power: 58, windupMs: 520, recoveryMs: 360, cooldownMs: 3600, qiCost: 16, range: 'FAR', telegraph: 'RED', postureDamage: 54,
    },
  },

  // ② 동서양 이종 융합
  {
    id: 'sig_13', a: 'base_v_slash', b: 'sk_we_01',
    result: {
      id: 'sig_falling_lunge', name: '낙화연환검(落花連環劍)', description: '종베기로 방어를 열고 즉시 서양식 급소 찌르기를 꽂는다.',
      form: 'THRUST', weapon: 'BLADE', origin: ['EASTERN', 'WESTERN'], element: 'PHYSICAL',
      power: 48, windupMs: 320, recoveryMs: 240, cooldownMs: 2600, qiCost: 12, range: 'MID', telegraph: 'YELLOW', postureDamage: 34,
    },
  },
  {
    id: 'sig_14', a: 'base_h_slash', b: 'sk_we_03',
    result: {
      id: 'sig_counter_zwerch', name: '반전횡격(反轉橫擊)', description: '독일 검술의 가로 쳐내기를 횡베기에 접목한 공방일체기.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'WESTERN'], element: 'PHYSICAL',
      power: 44, windupMs: 280, recoveryMs: 220, cooldownMs: 2500, qiCost: 10, range: 'MID', telegraph: 'YELLOW', postureDamage: 32,
    },
  },
  {
    id: 'sig_15', a: 'sk_cn_03', b: 'sk_we_02',
    result: {
      id: 'sig_flowing_riposte', name: '유수반격검(流水反擊劍)', description: '태극의 부드러운 흘리기 직후 에페의 정밀 찌르기로 심장을 꿰뚫는다.',
      form: 'PARRY', weapon: 'BLADE', origin: ['EASTERN', 'WESTERN'], element: 'QI',
      power: 52, windupMs: 100, recoveryMs: 160, cooldownMs: 2800, qiCost: 12, range: 'MID', telegraph: 'BLUE', postureDamage: 46,
    },
  },
  {
    id: 'sig_16', a: 'sk_cn_03', b: 'sk_we_05',
    result: {
      id: 'sig_bone_breaker', name: '혼원쇄골수(混元碎骨手)', description: '공격을 흘림과 동시에 관절을 꺾어 적의 힘을 앗아간다.',
      form: 'PARRY', weapon: 'UNARMED', origin: ['EASTERN', 'WESTERN'], element: 'QI',
      power: 42, windupMs: 110, recoveryMs: 180, cooldownMs: 3200, qiCost: 14, range: 'CLOSE', telegraph: 'BLUE', postureDamage: 44,
      statusEffect: { type: 'WEAKEN', chance: 0.9, value: 0.35, durationMs: 5000 },
    },
  },
  {
    id: 'sig_17', a: 'sk_jp_04', b: 'sk_we_05',
    result: {
      id: 'sig_hell_drop', name: '지옥낙하(地獄落下)', description: '동양 유술과 그리스 판크라티온이 결합된 방어 붕괴 필살 잡기.',
      form: 'GRAPPLE', weapon: 'UNARMED', origin: ['EASTERN', 'WESTERN'], element: 'PHYSICAL',
      power: 48, windupMs: 300, recoveryMs: 260, cooldownMs: 3000, qiCost: 12, range: 'CLOSE', telegraph: 'RED', postureDamage: 65,
      statusEffect: { type: 'BLEED', chance: 0.8, value: 7, durationMs: 5000 },
    },
  },
  {
    id: 'sig_18', a: 'sk_cn_01', b: 'sk_we_04',
    result: {
      id: 'sig_thunder_boxing', name: '뇌명연타권(雷鳴連打拳)', description: '소림 정권의 묵직함과 영국 복싱의 초고속 훅이 쏟아지는 난타.',
      form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN', 'WESTERN'], element: 'PHYSICAL',
      power: 46, windupMs: 240, recoveryMs: 200, cooldownMs: 2200, qiCost: 10, range: 'CLOSE', telegraph: 'YELLOW', postureDamage: 36,
      statusEffect: { type: 'STUN', chance: 0.35, value: 1, durationMs: 800 },
    },
  },
  {
    id: 'sig_19', a: 'sk_kr_03', b: 'sk_we_06',
    result: {
      id: 'sig_meteor_circle', name: '유성환검보(流星環劍步)', description: '품밟기와 스페인 기하학 보법으로 적의 사각에서 찌른다.',
      form: 'STEP', weapon: 'BLADE', origin: ['EASTERN', 'WESTERN'], element: 'WIND',
      power: 42, windupMs: 220, recoveryMs: 180, cooldownMs: 2700, qiCost: 12, range: 'MID', telegraph: 'YELLOW',
    },
  },
  {
    id: 'sig_20', a: 'sk_kr_06', b: 'sk_we_07',
    result: {
      id: 'sig_tyrant_cleave', name: '패왕단공참(霸王斷空斬)', description: '조선 쌍수도와 클레이모어의 압도적 2회전 방어불가 참격.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'WESTERN'], element: 'WIND',
      power: 68, windupMs: 600, recoveryMs: 420, cooldownMs: 4200, qiCost: 18, range: 'FAR', telegraph: 'RED', postureDamage: 68,
    },
  },
  {
    id: 'sig_21', a: 'sk_kr_01', b: 'sk_we_08',
    result: {
      id: 'sig_gale_flurry', name: '질풍난무(疾風亂舞)', description: '어떤 지형과 체세에서도 끊기지 않는 5연속 실전 검무.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'WESTERN'], element: 'WIND',
      power: 54, windupMs: 300, recoveryMs: 240, cooldownMs: 2900, qiCost: 14, range: 'MID', telegraph: 'YELLOW', postureDamage: 38,
    },
  },
  {
    id: 'sig_22', a: 'sk_kr_02', b: 'sk_we_01',
    result: {
      id: 'sig_heaven_point', name: '천광일점(天光一點)', description: '조선세법과 이탈리아 레이피어가 만난 초장거리 일점 찌르기.',
      form: 'THRUST', weapon: 'BLADE', origin: ['EASTERN', 'WESTERN'], element: 'PHYSICAL',
      power: 52, windupMs: 220, recoveryMs: 200, cooldownMs: 2800, qiCost: 14, range: 'FAR', telegraph: 'YELLOW', postureDamage: 30,
    },
  },

  // ③ 무술 × 판타지 마법 융합 (마검술·초자연 오의)
  {
    id: 'sig_23', a: 'base_h_slash', b: 'sk_fn_01',
    result: {
      id: 'sig_crimson_slash', name: '홍련횡단참(紅蓮橫斷斬)', description: '횡베기에 이계의 불꽃을 둘러 전방을 불태우는 화염 검기.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'FANTASY'], element: 'FIRE',
      power: 72, windupMs: 340, recoveryMs: 260, cooldownMs: 3400, qiCost: 24, range: 'FAR', telegraph: 'RED', postureDamage: 48,
      statusEffect: { type: 'BURN', chance: 0.9, value: 10, durationMs: 5000 },
    },
  },
  {
    id: 'sig_24', a: 'base_v_slash', b: 'sk_fn_03',
    result: {
      id: 'sig_thunder_drop', name: '벽력낙천검(霹靂落天劍)', description: '번개를 칼날에 감아 초고속으로 내리꽂는 뇌전 참격.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'FANTASY'], element: 'LIGHTNING',
      power: 78, windupMs: 310, recoveryMs: 280, cooldownMs: 3800, qiCost: 26, range: 'MID', telegraph: 'RED', postureDamage: 52,
      statusEffect: { type: 'SHOCK', chance: 0.9, value: 1, durationMs: 1600 },
    },
  },
  {
    id: 'sig_25', a: 'sk_we_01', b: 'sk_fn_02',
    result: {
      id: 'sig_frost_lunge', name: '만년빙천자(萬年氷穿刺)', description: '서양 레이피어에 만년빙의 냉기를 실어 적을 동결시킨다.',
      form: 'THRUST', weapon: 'BLADE', origin: ['WESTERN', 'FANTASY'], element: 'ICE',
      power: 66, windupMs: 260, recoveryMs: 220, cooldownMs: 3200, qiCost: 22, range: 'FAR', telegraph: 'RED', postureDamage: 38,
      statusEffect: { type: 'FREEZE', chance: 0.85, value: 0.4, durationMs: 1800 },
    },
  },
  {
    id: 'sig_26', a: 'sig_cross_slash', b: 'sk_fn_01',
    result: {
      id: 'sig_hellfire_cross', name: '업화십자참(業火十字斬)', description: '허공에 불타는 십자 검기를 남겨 연속 폭발시키는 오의.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'FANTASY'], element: 'FIRE',
      power: 82, windupMs: 380, recoveryMs: 280, cooldownMs: 4000, qiCost: 28, range: 'FAR', telegraph: 'RED', postureDamage: 56,
      statusEffect: { type: 'BURN', chance: 0.95, value: 12, durationMs: 5500 },
    },
  },
  {
    id: 'sig_27', a: 'sk_jp_03', b: 'sk_fn_04',
    result: {
      id: 'sig_shadowless_draw', name: '무영신속발도(無影神速拔刀)', description: '헤이스트와 거합이 융합해 잔상이 남을 속도로 3연 발도.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'FANTASY'], element: 'WIND',
      power: 68, windupMs: 140, recoveryMs: 180, cooldownMs: 3200, qiCost: 24, range: 'MID', telegraph: 'YELLOW', postureDamage: 40,
    },
  },
  {
    id: 'sig_28', a: 'sk_cn_01', b: 'sk_fn_02',
    result: {
      id: 'sig_frost_fist', name: '한빙파산권(寒氷破山拳)', description: '주먹이 닿는 순간 적의 혈맥을 얼려버리는 빙결 권법.',
      form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN', 'FANTASY'], element: 'ICE',
      power: 70, windupMs: 340, recoveryMs: 260, cooldownMs: 3600, qiCost: 24, range: 'CLOSE', telegraph: 'RED', postureDamage: 52,
      statusEffect: { type: 'FREEZE', chance: 0.9, value: 1, durationMs: 2000 },
    },
  },
  {
    id: 'sig_29', a: 'sk_cn_09', b: 'sk_fn_05',
    result: {
      id: 'sig_indestructible_barrier', name: '불괴영기장(不壞靈氣障)', description: '호신강기와 마나 실드의 융합. 피해를 흡수하고 근접 반사.',
      form: 'PARRY', weapon: 'ANY', origin: ['EASTERN', 'FANTASY'], element: 'QI',
      power: 28, windupMs: 120, recoveryMs: 140, cooldownMs: 5200, qiCost: 28, range: 'ANY', telegraph: 'BLUE',
      statusEffect: { type: 'SHIELD', chance: 1, value: 0.42, durationMs: 6000 },
    },
  },
  {
    id: 'sig_30', a: 'sk_cn_08', b: 'sk_fn_06',
    result: {
      id: 'sig_void_step', name: '허공섬보(虛空閃步)', description: '축지법과 블링크의 결합. 즉시 배후 이동 + 치명타 준비.',
      form: 'STEP', weapon: 'ANY', origin: ['EASTERN', 'FANTASY'], element: 'SHADOW',
      power: 0, windupMs: 40, recoveryMs: 60, cooldownMs: 3600, qiCost: 20, range: 'ANY', telegraph: 'NONE',
    },
  },
  {
    id: 'sig_31', a: 'sk_cn_07', b: 'sk_fn_03',
    result: {
      id: 'sig_thunder_needles', name: '뇌침만우(雷針萬雨)', description: '번개를 머금은 암기를 살포해 적의 모든 전조를 즉각 차단.',
      form: 'PROJECTILE', weapon: 'THROWN', origin: ['EXOTIC', 'FANTASY'], element: 'LIGHTNING',
      power: 56, windupMs: 200, recoveryMs: 180, cooldownMs: 3200, qiCost: 22, range: 'FAR', telegraph: 'YELLOW',
      statusEffect: { type: 'SHOCK', chance: 0.85, value: 1, durationMs: 1400 },
    },
  },
  {
    id: 'sig_32', a: 'sig_mountain_split', b: 'sk_fn_07',
    result: {
      id: 'sig_gravity_cleave', name: '태산압정참(泰山壓頂斬)', description: '중력으로 회피를 봉쇄한 뒤 태산의 무게로 내리찍는 오의.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'FANTASY'], element: 'QI',
      power: 86, windupMs: 540, recoveryMs: 360, cooldownMs: 4400, qiCost: 30, range: 'FAR', telegraph: 'RED', postureDamage: 75,
    },
  },

  // ④ 금기 초식 (Forbidden Arts — INS 75+ 이단 발상)
  {
    id: 'sig_33', a: 'sk_jp_04', b: 'sk_fn_01', isForbidden: true,
    result: {
      id: 'forb_inferno_throw', name: '【금기】업화투척(業火投擲)', description: '상대를 메다꽂으며 지근거리에서 화염 폭발을 일으키는 금기.',
      form: 'GRAPPLE', weapon: 'UNARMED', origin: ['EASTERN', 'FANTASY'], element: 'FIRE', isForbidden: true,
      power: 115, windupMs: 280, recoveryMs: 260, cooldownMs: 4500, qiCost: 28, range: 'CLOSE', telegraph: 'RED', postureDamage: 90,
      statusEffect: { type: 'BURN', chance: 1, value: 14, durationMs: 5000 },
      selfRecoil: { hpPercent: 0.12 },
    },
  },
  {
    id: 'sig_34', a: 'sk_fn_01', b: 'sk_fn_02', isForbidden: true,
    result: {
      id: 'forb_frostfire_nova', name: '【금기】빙화상극포(氷火相剋砲)', description: '상극의 화염과 빙결을 억지로 충돌시켜 전장을 초토화한다.',
      form: 'PROJECTILE', weapon: 'CATALYST', origin: ['FANTASY'], element: 'FIRE', isForbidden: true,
      power: 130, windupMs: 460, recoveryMs: 360, cooldownMs: 5500, qiCost: 36, range: 'FAR', telegraph: 'RED', postureDamage: 100,
      selfRecoil: { hpPercent: 0.15, healthLoss: 4 },
    },
  },
  {
    id: 'sig_35', a: 'sk_jp_03', b: 'sk_fn_03', isForbidden: true,
    result: {
      id: 'forb_blood_lightning', name: '【금기】혈뢰발도(血雷拔刀)', description: '신경에 직접 번개를 흘려 0.09초 만에 베는 금단의 발도.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'FANTASY'], element: 'LIGHTNING', isForbidden: true,
      power: 105, windupMs: 90, recoveryMs: 220, cooldownMs: 4200, qiCost: 28, range: 'MID', telegraph: 'RED', postureDamage: 65,
      statusEffect: { type: 'SHOCK', chance: 1, value: 1, durationMs: 1800 },
      selfRecoil: { hpPercent: 0.1 },
    },
  },
  {
    id: 'sig_36', a: 'sk_kr_08', b: 'sk_fn_04', isForbidden: true,
    result: {
      id: 'forb_lifespan_burn', name: '【금기】수명연소(壽命燃燒)', description: '남은 수명 1년을 불태워 압도적 공격력과 속도를 끌어낸다.',
      form: 'STEP', weapon: 'ANY', origin: ['EASTERN', 'FANTASY'], element: 'FIRE', isForbidden: true,
      power: 95, windupMs: 100, recoveryMs: 120, cooldownMs: 9000, qiCost: 30, range: 'MID', telegraph: 'RED',
      selfRecoil: { lifespanYears: 1, healthLoss: 5 },
    },
  },
  {
    id: 'sig_37', a: 'sk_fn_07', b: 'sk_cn_05', isForbidden: true,
    result: {
      id: 'forb_void_crush', name: '【금기】허공압괴권(虛空壓壞拳)', description: '공간째 압축해 적의 내장을 붕괴시키는 필살 금기권.',
      form: 'STRIKE', weapon: 'UNARMED', origin: ['EASTERN', 'FANTASY'], element: 'QI', isForbidden: true,
      power: 140, windupMs: 380, recoveryMs: 340, cooldownMs: 5200, qiCost: 34, range: 'CLOSE', telegraph: 'RED', postureDamage: 100,
      selfRecoil: { hpPercent: 0.14, healthLoss: 3 },
    },
  },
  {
    id: 'sig_38', a: 'sk_cn_07', b: 'sk_fn_06', isForbidden: true,
    result: {
      id: 'forb_reaper_dance', name: '【금기】사신난무(死神亂舞)', description: '차원 틈에서 사방으로 암기를 꽂아 넣는 절대 회피불가 비기.',
      form: 'PROJECTILE', weapon: 'THROWN', origin: ['EXOTIC', 'FANTASY'], element: 'SHADOW', isForbidden: true,
      power: 120, windupMs: 220, recoveryMs: 240, cooldownMs: 5000, qiCost: 32, range: 'FAR', telegraph: 'RED', postureDamage: 75,
      selfRecoil: { hpPercent: 0.14 },
    },
  },
  {
    id: 'sig_39', a: 'sig_formless_qi', b: 'sk_fn_07', isForbidden: true,
    result: {
      id: 'forb_world_sever', name: '【금기】단계참(斷界斬)', description: '공간과 모든 방어를 두 동강 내는 신역의 금기 참격.',
      form: 'SLASH', weapon: 'BLADE', origin: ['EASTERN', 'FANTASY'], element: 'QI', isForbidden: true,
      power: 150, windupMs: 420, recoveryMs: 340, cooldownMs: 5800, qiCost: 38, range: 'FAR', telegraph: 'RED', postureDamage: 120,
      selfRecoil: { healthLoss: 6, durabilityLoss: 25 },
    },
  },
  {
    id: 'sig_40', a: 'sk_cn_09', b: 'sk_fn_01', isForbidden: true,
    result: {
      id: 'forb_fire_avatar', name: '【금기】화신강림(火神降臨)', description: '온몸을 불길로 감싸며 전방을 잿더미로 만드는 화신 오의.',
      form: 'SLASH', weapon: 'ANY', origin: ['EASTERN', 'FANTASY'], element: 'FIRE', isForbidden: true,
      power: 125, windupMs: 200, recoveryMs: 260, cooldownMs: 5400, qiCost: 32, range: 'MID', telegraph: 'RED', postureDamage: 80,
      statusEffect: { type: 'BURN', chance: 1, value: 15, durationMs: 6000 },
      selfRecoil: { hpPercent: 0.16 },
    },
  },
];

// 극의(Lv.10) 각인. 위력 배수는 극의 돌파 때 이미 올렸으므로 여기서는 성질을 바꾸는 효과 위주로 둔다.
function getTranscendTraits(skill: Skill): ImprintedTrait[] {
  if (skill.isPassive) {
    return [
      {
        tier: 10,
        id: 'x_p_life_gate',
        label: '【생사현관 타통(生死玄關)】',
        description: '비무 중 기력 회복 +80%, 모든 초식 위력 +20%, 최대 생명력 +20%',
        effect: { passiveQiRegenBonus: 0.8, passiveAllDamageBonus: 0.2, passiveMaxHpBonus: 0.2 },
      },
      {
        tier: 10,
        id: 'x_p_rebirth',
        label: '【환골탈태(換骨奪胎)】',
        description: '매 계절 건강 회복 +10, 받는 피해 -18%, 최대 생명력 +25%',
        effect: { passiveHealthRegen: 10, passiveDamageReduce: 0.18, passiveMaxHpBonus: 0.25 },
      },
      {
        tier: 10,
        id: 'x_p_mind_sword',
        label: '【심검(心劍)】',
        description: '간파(看破) 확률 +18%, 모든 초식 위력 +16%, 받는 피해 -8%',
        effect: { passiveParryBonus: 0.18, passiveAllDamageBonus: 0.16, passiveDamageReduce: 0.08 },
      },
    ];
  }
  if (skill.form === 'PARRY') {
    return [
      { tier: 10, id: 'x_parry_first', label: '【후발선지(後發先至)】', description: '간파 판정 창 +160ms, 간파 직후 반격 3배', effect: { parryWindowBonus: 160, counterMult: 3.0 } },
      { tier: 10, id: 'x_parry_wall', label: '【철벽무애(鐵壁無礙)】', description: '간파 판정 창 +100ms, 명중 시 기력 +20, 체세 피해 +80%', effect: { parryWindowBonus: 100, qiGainOnHit: 20, postureMult: 1.8 } },
      { tier: 10, id: 'x_parry_void', label: '【이유제강(以柔制剛)】', description: '반격 2.6배, 방어 완전 무시', effect: { counterMult: 2.6, armorPierce: 1.0 } },
    ];
  }
  return [
    {
      tier: 10,
      id: 'x_one_strike',
      label: '【일격필살(一擊必殺)】',
      description: 'HP 38% 이하 적 처형, 방어 완전 무시',
      effect: { executeThreshold: 0.38, armorPierce: 1.0 },
    },
    {
      tier: 10,
      id: 'x_formless',
      label: '【무초승유초(無招勝有招)】',
      description: '선딜 -45%, 쿨타임 -35%, 방어 불가',
      effect: { windupMult: 0.55, cooldownMult: 0.65, unblockable: true },
    },
    {
      tier: 10,
      id: 'x_sword_qi',
      label: '【검기성강(劍氣成罡)】',
      description: '원거리 확장, 회피 무시, 병기 궁합 무시, 명중 시 기력 +15',
      effect: { rangeExtend: true, ignoreEvade: true, multiHit: 2, noWeaponPenalty: true, qiGainOnHit: 15 },
    },
  ];
}

// 3·6·9단계 연마 각인 생성기 (10은 극의 각인)
export function getTraitCandidates(skill: Skill, tier: TraitTier): ImprintedTrait[] {
  if (tier === 10) return getTranscendTraits(skill);
  // ★ 운기 심법(패시브) 전용 3/6/9레벨 내공·호신·양생 각인 풀! ★
  if (skill.isPassive) {
    if (tier === 3) {
      return [
        {
          tier: 3,
          id: 'p3_qi_flow',
          label: '소주천 순환(小周天)',
          description: '비무 중 기력(QI) 회복 +25%, 모든 초식 위력 +6%',
          effect: { passiveQiRegenBonus: 0.25, passiveAllDamageBonus: 0.06 },
        },
        {
          tier: 3,
          id: 'p3_body_guard',
          label: '호신강기(護身罡氣)',
          description: '비무 중 받는 피해 -8%, 최대 생명력 +8%',
          effect: { passiveDamageReduce: 0.08, passiveMaxHpBonus: 0.08 },
        },
        {
          tier: 3,
          id: 'p3_clear_mind',
          label: '명경지수(明鏡止水)',
          description: '비무 중 간파(看破) 확률 +5%, 기력 회복 +15%',
          effect: { passiveParryBonus: 0.05, passiveQiRegenBonus: 0.15 },
        },
      ];
    }
    if (tier === 6) {
      return [
        {
          tier: 6,
          id: 'p6_grand_orbit',
          label: '대주천 개방(大周天)',
          description: '비무 중 기력(QI) 회복 +45%, 모든 초식 위력 +12%',
          effect: { passiveQiRegenBonus: 0.45, passiveAllDamageBonus: 0.12 },
        },
        {
          tier: 6,
          id: 'p6_diamond',
          label: '금강불괴(金剛不壞)',
          description: '비무 중 받는 피해 -14%, 최대 생명력 +14%',
          effect: { passiveDamageReduce: 0.14, passiveMaxHpBonus: 0.14 },
        },
        {
          tier: 6,
          id: 'p6_longevity',
          label: '양생 연수(養生延壽)',
          description: '매 계절 건강 자연 회복 +4, 비무 최대 생명력 +10%',
          effect: { passiveHealthRegen: 4, passiveMaxHpBonus: 0.1 },
        },
      ];
    }
    return [
      {
        tier: 9,
        id: 'p9_heaven_unity',
        label: '【천인합일(天人合一)】',
        description: '비무 중 기력 회복 +70%, 모든 초식 위력 +22%, 간파 +8%',
        effect: { passiveQiRegenBonus: 0.7, passiveAllDamageBonus: 0.22, passiveParryBonus: 0.08 },
      },
      {
        tier: 9,
        id: 'p9_rejuvenate',
        label: '【반로환동(返老還童)】',
        description: '매 계절 건강 회복 +7, 최대 생명력 +20%, 받는 피해 -15%',
        effect: { passiveHealthRegen: 7, passiveMaxHpBonus: 0.2, passiveDamageReduce: 0.15 },
      },
      {
        tier: 9,
        id: 'p9_limitless',
        label: '【무극심경(無極心經)】',
        description: '간파(看破) 확률 +14%, 받는 피해 -12%, 모든 초식 위력 +16%',
        effect: { passiveParryBonus: 0.14, passiveDamageReduce: 0.12, passiveAllDamageBonus: 0.16 },
      },
    ];
  }

  // 횡베기 전용 각인
  if (skill.id === 'base_h_slash') {
    if (tier === 3) {
      return [
        { tier: 3, id: 'h3_fast', label: '신속 발도', description: '선딜 -30%, 쿨타임 -20%', effect: { windupMult: 0.7, cooldownMult: 0.8 } },
        { tier: 3, id: 'h3_break', label: '파갑 호선', description: '적 체세 피해 +55%', effect: { postureMult: 1.55 } },
        { tier: 3, id: 'h3_wide', label: '넓은 궤적', description: '회피 무시 & 피해 +20%', effect: { ignoreEvade: true, damageMult: 1.2 } },
      ];
    }
    if (tier === 6) {
      return [
        { tier: 6, id: 'h6_wind', label: '검풍 발현', description: '사거리 원거리 확장 & 피해 +25%', effect: { rangeExtend: true, damageMult: 1.25 } },
        { tier: 6, id: 'h6_flow', label: '연환 기세', description: '쿨타임 -25%, 명중 시 QI +12', effect: { cooldownMult: 0.75, qiGainOnHit: 12 } },
        { tier: 6, id: 'h6_counter', label: '간파 일섬', description: '간파 직후 피해 2.2배', effect: { counterMult: 2.2 } },
      ];
    }
    return [
      { tier: 9, id: 'h9_formless', label: '【무형일선】', description: '선딜 50% 감소 & 피해 +45%', effect: { windupMult: 0.5, damageMult: 1.45 } },
      { tier: 9, id: 'h9_exec', label: '【단산참】', description: 'HP 30% 이하 적 즉사급 처형 & 피해 +35%', effect: { executeThreshold: 0.3, damageMult: 1.35 } },
      { tier: 9, id: 'h9_pierce', label: '【만화귀일】', description: '모든 방어 무시 & 피해 +50%', effect: { armorPierce: 1.0, damageMult: 1.5 } },
    ];
  }

  // 종베기 전용 각인
  if (skill.id === 'base_v_slash') {
    if (tier === 3) {
      return [
        { tier: 3, id: 'v3_heavy', label: '천근추', description: '피해 +35%, 적색 방어불가 승격', effect: { damageMult: 1.35, unblockable: true } },
        { tier: 3, id: 'v3_double', label: '연속 내려치기', description: '추가타 발동 (총 피해 +40%)', effect: { damageMult: 1.4 } },
        { tier: 3, id: 'v3_clash', label: '무기 쳐내기', description: '체세 피해 +65%, 선딜 -15%', effect: { postureMult: 1.65, windupMult: 0.85 } },
      ];
    }
    if (tier === 6) {
      return [
        { tier: 6, id: 'v6_quake', label: '지열참', description: '사거리 확장 & 체세 피해 +60%', effect: { rangeExtend: true, postureMult: 1.6 } },
        { tier: 6, id: 'v6_qi', label: '강기 응축', description: '피해 +55%, 방어 관통 40%', effect: { damageMult: 1.55, armorPierce: 0.4 } },
        { tier: 6, id: 'v6_iron', label: '불굴의 일격', description: '피해 +35%, 쿨타임 -20%', effect: { damageMult: 1.35, cooldownMult: 0.8 } },
      ];
    }
    return [
      { tier: 9, id: 'v9_bisect', label: '【양단참】', description: '방어불가 + 체세 즉시 붕괴 + 피해 +55%', effect: { unblockable: true, postureMult: 2.5, damageMult: 1.55 } },
      { tier: 9, id: 'v9_star', label: '【낙성격】', description: '원거리 도약 참격 + 피해 +65%', effect: { rangeExtend: true, damageMult: 1.65 } },
      { tier: 9, id: 'v9_nosword', label: '【무검승유검】', description: '무기 궁합 패널티 완전 무시 + 피해 +45%', effect: { noWeaponPenalty: true, damageMult: 1.45 } },
    ];
  }

  // 범용 태그 기반 각인 풀
  const basePool: ImprintedTrait[] =
    tier === 3
      ? [
          { tier: 3, id: 'g3_fast', label: '신속 운용', description: '선딜 -25%, 쿨타임 -15%', effect: { windupMult: 0.75, cooldownMult: 0.85 } },
          { tier: 3, id: 'g3_power', label: '파갑 발경', description: '피해 +28%, 체세 피해 +45%', effect: { damageMult: 1.28, postureMult: 1.45 } },
          { tier: 3, id: 'g3_qi', label: '기혈 순환', description: '명중 시 QI +10, 피해 +18%', effect: { qiGainOnHit: 10, damageMult: 1.18 } },
        ]
      : tier === 6
      ? [
          { tier: 6, id: 'g6_reach', label: '기세 확장', description: '사거리 확장 & 피해 +30%', effect: { rangeExtend: true, damageMult: 1.3 } },
          { tier: 6, id: 'g6_pierce', label: '관통 일점', description: '적 방어력 55% 무시 & 피해 +25%', effect: { armorPierce: 0.55, damageMult: 1.25 } },
          { tier: 6, id: 'g6_counter', label: '간파 극대화', description: '간파 직후 피해 2.0배, 쿨 -15%', effect: { counterMult: 2.0, cooldownMult: 0.85 } },
        ]
      : [
          { tier: 9, id: 'g9_apex', label: '【입신 절초】', description: '피해 +55%, 선딜 -25%', effect: { damageMult: 1.55, windupMult: 0.75 } },
          { tier: 9, id: 'g9_break', label: '【절대 파훼】', description: '방어 불가 + 방어 70% 무시 + 피해 +40%', effect: { unblockable: true, armorPierce: 0.7, damageMult: 1.4 } },
          { tier: 9, id: 'g9_exec', label: '【생사결단】', description: 'HP 28% 이하 처형 + 피해 +45%', effect: { executeThreshold: 0.28, damageMult: 1.45 } },
        ];

  // 속성 보너스 1개 교체
  if (skill.element === 'FIRE') {
    basePool[2] = { tier, id: `el_fire_${tier}`, label: tier === 9 ? '【업화 멸살】' : '폭염 연소', description: `화염 피해 +${tier * 6}%, 화상 강화`, effect: { damageMult: 1 + tier * 0.06, statusBonus: 0.25 } };
  } else if (skill.element === 'ICE') {
    basePool[2] = { tier, id: `el_ice_${tier}`, label: tier === 9 ? '【절대 영도】' : '만년 서리', description: `빙결 피해 +${tier * 5}%, 체세 +40%`, effect: { damageMult: 1 + tier * 0.05, postureMult: 1.4 } };
  } else if (skill.element === 'LIGHTNING') {
    basePool[2] = { tier, id: `el_lt_${tier}`, label: tier === 9 ? '【천뢰 강림】' : '신경 가속', description: `선딜 -${tier * 4}%, 피해 +${tier * 4}%`, effect: { windupMult: 1 - tier * 0.04, damageMult: 1 + tier * 0.04 } };
  } else if (skill.form === 'PARRY') {
    basePool[2] = { tier, id: `f_parry_${tier}`, label: tier === 9 ? '【절대 간파】' : '넓은 간파', description: `간파 판정 창 +${tier * 12}ms, 반격 강화`, effect: { parryWindowBonus: tier * 12, counterMult: 1.8 } };
  }

  return basePool;
}

// 동적 초식 작명 사전
const PREFIX_BY_ELEMENT: Record<SkillElement, string[]> = {
  PHYSICAL: ['청풍', '백호', '비룡', '낙화', '무영', '유수', '파산', '철혈'],
  FIRE: ['홍련', '열화', '적염', '주작', '화룡', '업화'],
  ICE: ['설화', '한빙', '빙하', '만년', '백설', '서리'],
  LIGHTNING: ['벽력', '천뢰', '뇌명', '자전', '섬전'],
  WIND: ['질풍', '선풍', '초음', '태풍', '섬광'],
  QI: ['혼원', '태극', '무형', '천지', '강기'],
  SHADOW: ['몽환', '귀곡', '흑영', '유령', '암야'],
};

const SUFFIX_BY_FORM: Record<SkillForm, string[]> = {
  SLASH: ['참', '검', '도', '일섬'],
  THRUST: ['자', '창', '일점', '관천'],
  STRIKE: ['권', '장', '격', '파쇄'],
  GRAPPLE: ['수', '낙하', '제압', '쇄골'],
  STEP: ['보', '섬보', '환보'],
  PARRY: ['류', '진', '장벽', '반격'],
  PROJECTILE: ['우', '포', '검기', '술'],
  AURA: ['심법', '기공', '오라'],
};

export interface CraftPreview {
  possible: boolean;
  isSignature: boolean;
  isForbidden: boolean;
  reason: string;
  suggestedName: string;
  resultSkill?: Skill;
  inheritedLevel: number;
}

export function evaluateCraft(skillA: Skill, skillB: Skill, ins: number, creatorName: string): CraftPreview {
  if (skillA.id === skillB.id) {
    return { possible: false, isSignature: false, isForbidden: false, reason: '같은 초식끼리는 조합할 수 없습니다.', suggestedName: '', inheritedLevel: 1 };
  }

  const inheritedLevel = Math.max(1, Math.min(5, Math.floor((skillA.masteryLevel + skillB.masteryLevel) * 0.4)));

  // 1. 시그니처 레시피 확인 (2차 조합 시 생성 ID의 랜덤 접미사까지 매칭)
  const matchRecipeId = (skillId: string, recipeKey: string) =>
    skillId === recipeKey || skillId.startsWith(`${recipeKey}_`);
  const sig = SIGNATURE_RECIPES.find(
    (r) =>
      (matchRecipeId(skillA.id, r.a) && matchRecipeId(skillB.id, r.b)) ||
      (matchRecipeId(skillA.id, r.b) && matchRecipeId(skillB.id, r.a))
  );
  if (sig) {
    if (sig.isForbidden && ins < 75) {
      return {
        possible: false,
        isSignature: true,
        isForbidden: true,
        reason: `개연성이 크게 충돌합니다. 이단적 발상을 밀어붙이려면 통찰(INS) 75 이상이 필요합니다. (현재 ${ins})`,
        suggestedName: sig.result.name,
        inheritedLevel,
      };
    }
    const built: Skill = {
      ...sig.result,
      id: `${sig.result.id}_${Date.now().toString(36).slice(-4)}`,
      creator: creatorName,
      parents: [skillA.id, skillB.id],
      masteryLevel: inheritedLevel,
      masteryExp: 0,
      imprintedTraits: [],
      pendingTraitTier: inheritedLevel >= 3 ? 3 : undefined,
    };
    return {
      possible: true,
      isSignature: true,
      isForbidden: !!sig.isForbidden,
      reason: sig.isForbidden
        ? '⚠ 이단적 발상 감지! 압도적 위력의 【금기 초식】이 탄생합니다. (시전 시 HP/건강 반동)'
        : '◎ 시그니처 조합 확인! 두 무술의 원리가 완벽히 맞물립니다.',
      suggestedName: built.name,
      resultSkill: built,
      inheritedLevel,
    };
  }

  // 2. 일반 태그 호환 규칙
  const isAttack = (f: SkillForm) => f === 'SLASH' || f === 'THRUST' || f === 'STRIKE';
  const isElemental = (e: SkillElement) => e !== 'PHYSICAL';

  let compatible = false;
  let forbiddenFallback = false;

  // 공격 + 원소/마법
  if ((isAttack(skillA.form) && isElemental(skillB.element)) || (isAttack(skillB.form) && isElemental(skillA.element))) {
    compatible = true;
  }
  // 공격 + 보법/심법
  if ((isAttack(skillA.form) && (skillB.form === 'STEP' || skillB.form === 'AURA')) || (isAttack(skillB.form) && (skillA.form === 'STEP' || skillA.form === 'AURA'))) {
    compatible = true;
  }
  // 동일/호환 무기 공격 + 공격
  if (isAttack(skillA.form) && isAttack(skillB.form) && (skillA.weapon === skillB.weapon || skillA.weapon === 'ANY' || skillB.weapon === 'ANY')) {
    compatible = true;
  }
  // 방어 + 잡기/찌르기
  if (
    (skillA.form === 'PARRY' && (skillB.form === 'GRAPPLE' || skillB.form === 'THRUST')) ||
    (skillB.form === 'PARRY' && (skillA.form === 'GRAPPLE' || skillA.form === 'THRUST'))
  ) {
    compatible = true;
  }
  // 충돌 체크 (화염+빙결, 잡기+투사, 완전 이질 무기)
  const conflictFireIce =
    (skillA.element === 'FIRE' && skillB.element === 'ICE') ||
    (skillA.element === 'ICE' && skillB.element === 'FIRE');
  const conflictGrappleProj =
    (skillA.form === 'GRAPPLE' && skillB.form === 'PROJECTILE') ||
    (skillB.form === 'GRAPPLE' && skillA.form === 'PROJECTILE');

  if (conflictFireIce || conflictGrappleProj) {
    compatible = false;
    forbiddenFallback = true;
  }

  if (!compatible) {
    if (forbiddenFallback && ins >= 75) {
      // 이단 금기 자유 조합 허용
      const primary = isAttack(skillA.form) ? skillA : skillB;
      const elem: SkillElement = skillB.element !== 'PHYSICAL' ? skillB.element : skillA.element;
      const prefix = PREFIX_BY_ELEMENT[elem][Math.floor(Math.random() * PREFIX_BY_ELEMENT[elem].length)];
      const suffix = SUFFIX_BY_FORM[primary.form][0];
      const name = `【금기】${prefix}파멸${suffix}`;
      const built: Skill = {
        id: `custom_forb_${Date.now().toString(36)}`,
        name,
        description: `${skillA.name}과(와) ${skillB.name}을 금단의 발상으로 억지 융합한 초식.`,
        creator: creatorName,
        form: primary.form === 'AURA' ? 'SLASH' : primary.form,
        weapon: primary.weapon,
        origin: Array.from(new Set([...skillA.origin, ...skillB.origin])) as SkillOrigin[],
        element: elem,
        parents: [skillA.id, skillB.id],
        isForbidden: true,
        masteryLevel: inheritedLevel,
        masteryExp: 0,
        imprintedTraits: [],
        pendingTraitTier: inheritedLevel >= 3 ? 3 : undefined,
        power: Math.round((skillA.power + skillB.power) * 1.15) + 30,
        windupMs: Math.max(180, Math.round((skillA.windupMs + skillB.windupMs) * 0.45)),
        recoveryMs: 280,
        cooldownMs: 4600,
        qiCost: 28,
        range: skillA.range === 'FAR' || skillB.range === 'FAR' ? 'FAR' : primary.range,
        telegraph: 'RED',
        postureDamage: 70,
        selfRecoil: { hpPercent: 0.12, healthLoss: 2 },
      };
      return {
        possible: true,
        isSignature: false,
        isForbidden: true,
        reason: '⚠ 개연성 충돌을 통찰력으로 돌파했습니다! 치명적 반동을 동반한 금기 초식이 창안됩니다.',
        suggestedName: name,
        resultSkill: built,
        inheritedLevel,
      };
    }

    return {
      possible: false,
      isSignature: false,
      isForbidden: false,
      reason: '두 무술의 동작 원리와 무기 체계가 어긋나 개연성 있는 초식으로 엮이지 않습니다.',
      suggestedName: '',
      inheritedLevel,
    };
  }

  // 일반 호환 조합 생성
  const primary = isAttack(skillA.form) ? skillA : isAttack(skillB.form) ? skillB : skillA;
  const secondary = primary === skillA ? skillB : skillA;
  const elem: SkillElement = secondary.element !== 'PHYSICAL' ? secondary.element : primary.element;
  const origins = Array.from(new Set([...skillA.origin, ...skillB.origin])) as SkillOrigin[];
  const prefixes = origins.includes('WESTERN') && elem === 'PHYSICAL' ? ['백은', '유성', '섬광', '성광'] : PREFIX_BY_ELEMENT[elem];
  const pWord = prefixes[(skillA.name.length + skillB.name.length) % prefixes.length];
  const mWord = secondary.form === 'STEP' ? '섬광' : secondary.form === 'PARRY' ? '반전' : '연환';
  const sList = SUFFIX_BY_FORM[primary.form];
  const sWord = sList[(skillA.power + skillB.power) % sList.length];
  const name = `${pWord}${mWord}${sWord}`;

  const isMagicFusion = origins.includes('FANTASY');
  const range =
    skillA.range === 'FAR' || skillB.range === 'FAR' || isMagicFusion
      ? 'FAR'
      : primary.range;

  const built: Skill = {
    id: `custom_${Date.now().toString(36)}`,
    name,
    description: `${skillA.name}의 골격에 ${skillB.name}의 원리를 녹여낸 ${creatorName} 독자 창안 초식.`,
    creator: creatorName,
    form: primary.form === 'AURA' ? 'SLASH' : primary.form,
    weapon: primary.weapon !== 'ANY' ? primary.weapon : secondary.weapon,
    origin: origins,
    element: elem,
    parents: [skillA.id, skillB.id],
    masteryLevel: inheritedLevel,
    masteryExp: 0,
    imprintedTraits: [],
    pendingTraitTier: inheritedLevel >= 3 ? 3 : undefined,
    power: Math.round(Math.max(skillA.power, skillB.power) * 1.25 + Math.min(skillA.power, skillB.power) * 0.35 + (isMagicFusion ? 16 : 6)),
    windupMs: Math.max(160, Math.round((primary.windupMs || 320) * (secondary.form === 'STEP' ? 0.78 : 0.95))),
    recoveryMs: Math.max(160, primary.recoveryMs || 240),
    cooldownMs: Math.max(1900, Math.round(((primary.cooldownMs || 2400) + (secondary.cooldownMs || 2400)) * 0.55)),
    qiCost: Math.min(30, Math.round((primary.qiCost + secondary.qiCost) * 0.65) + (isMagicFusion ? 10 : 4)),
    range,
    telegraph: isMagicFusion || primary.telegraph === 'RED' || secondary.telegraph === 'RED' ? 'RED' : primary.telegraph,
    postureDamage: Math.round(((primary.postureDamage || 22) + (secondary.postureDamage || 16)) * 0.8),
    statusEffect: secondary.statusEffect || primary.statusEffect,
  };

  return {
    possible: true,
    isSignature: false,
    isForbidden: false,
    reason: '○ 개연성 확인! 두 초식의 태그가 자연스럽게 융합됩니다.',
    suggestedName: name,
    resultSkill: built,
    inheritedLevel,
  };
}
