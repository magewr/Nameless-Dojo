import { CountryId, Weapon } from '../types/game';

export const ALL_WEAPONS_CATALOG: Weapon[] = [
  // 초기 / 일반 동양 도검
  {
    id: 'wp_bl_01', name: '낡은 삼나무 목검', group: 'BLADE', grade: 'CRUDE', price: 15,
    attack: 10, speedBonus: 0.05, range: 'MID', postureBreak: 8, upgradeLevel: 0, durability: 80, maxDurability: 80,
    passiveText: '비무용 기본 목검. 손에 익어 가볍다.',
    flavorText: '손잡이에 아버지의 검은 땀때가 굳어 있다. 부러질 듯하면서도 묘하게 손에 감긴다.',
  },
  {
    id: 'wp_bl_02', name: '녹슨 철환도', group: 'BLADE', grade: 'CRUDE', price: 35,
    attack: 16, speedBonus: -0.05, range: 'MID', postureBreak: 12, upgradeLevel: 0, durability: 70, maxDurability: 70,
    passiveText: '진검결투 가능. 연마하면 실전 병기로 쓸 수 있다.',
    flavorText: '날이 군데군데 이가 빠진 낡은 환도. 숫돌에 갈아도 녹 냄새가 가시지 않는다.',
  },
  {
    id: 'wp_bl_03', name: '수련용 죽도(竹刀)', group: 'BLADE', grade: 'NORMAL', price: 55,
    attack: 15, speedBonus: 0.14, range: 'MID', postureBreak: 10, upgradeLevel: 0, durability: 90, maxDurability: 90,
    passiveText: '선딜 단축 우수. 비무 승리 명성 소폭 상승.',
    flavorText: '네 조각 대나무를 가죽으로 묶어 에도 도장들에서 유행하기 시작한 최신 수련구.',
  },
  {
    id: 'wp_bl_04', name: '조선 군영 환도', group: 'BLADE', grade: 'NORMAL', price: 95,
    attack: 26, speedBonus: 0.0, range: 'MID', postureBreak: 18, upgradeLevel: 0, durability: 100, maxDurability: 100,
    passiveText: '횡베기·종베기 균형 잡힌 표준 실전 도검.',
    flavorText: '훈련도감 규격에 맞춰 벼려낸 실전 도검. 군더더기 없는 무게 중심이 일품이다.',
  },
  {
    id: 'wp_bl_05', name: '강남 유엽도(柳葉刀)', group: 'BLADE', grade: 'NORMAL', price: 95,
    attack: 25, speedBonus: 0.08, range: 'MID', postureBreak: 16, upgradeLevel: 0, durability: 100, maxDurability: 100,
    passiveText: '연속 베기 회전율이 우수하다.',
    flavorText: '버들잎처럼 완만히 휜 청나라 표사들의 애용도.',
  },
  {
    id: 'wp_bl_06', name: '에도 우치가타나', group: 'BLADE', grade: 'NORMAL', price: 110,
    attack: 28, speedBonus: 0.06, range: 'MID', postureBreak: 17, upgradeLevel: 0, durability: 100, maxDurability: 100,
    passiveText: '발도·베기 초식 선딜 단축.',
    flavorText: '에도 대장장이가 정성껏 담금질한 표준 타도.',
  },
  {
    id: 'wp_bl_07', name: '명품 별운검(別雲劍)', group: 'BLADE', grade: 'FINE', price: 240,
    attack: 42, speedBonus: -0.04, range: 'MID', postureBreak: 28, upgradeLevel: 0, durability: 130, maxDurability: 130,
    passiveText: '종베기·파갑기 위력 +15%.',
    flavorText: '구름 문양을 새긴 조선 어검 양식의 명검. 칼날에 서늘한 기품이 서려 있다.',
  },
  {
    id: 'wp_bl_08', name: '칠성 태극검', group: 'BLADE', grade: 'FINE', price: 230,
    attack: 38, speedBonus: 0.12, range: 'MID', postureBreak: 20, upgradeLevel: 0, durability: 125, maxDurability: 125,
    passiveText: '방어·간파 판정 창 +40ms.',
    flavorText: '양날이 곧게 뻗은 명검. 기운을 흘리고 받아치는 데 최적이다.',
  },
  {
    id: 'wp_bl_09', name: '비젠 오사후네 명도', group: 'BLADE', grade: 'FINE', price: 260,
    attack: 44, speedBonus: 0.1, range: 'MID', postureBreak: 24, upgradeLevel: 0, durability: 130, maxDurability: 130,
    passiveText: '치명타 및 출혈 위력 강화.',
    flavorText: '명문 비젠 도공의 걸작. 베이는 줄도 모르게 뼈를 가른다.',
  },
  {
    id: 'wp_bl_10', name: '쌍수도 흑룡', group: 'BLADE', grade: 'FINE', price: 290,
    attack: 52, speedBonus: -0.15, range: 'FAR', postureBreak: 38, upgradeLevel: 0, durability: 140, maxDurability: 140,
    passiveText: '양손 대장도(외팔 장착 불가). 적색 강공 피해 +25%.',
    flavorText: '장정 키에 육박하는 조선식 대장도. 기병의 말다리까지 베던 위엄.',
  },
  {
    id: 'wp_bl_11', name: '사인참사검(四寅斬邪劍)', group: 'BLADE', grade: 'TREASURE', price: 540,
    attack: 64, speedBonus: 0.08, range: 'MID', postureBreak: 32, upgradeLevel: 0, durability: 180, maxDurability: 180,
    elementAffinity: 'QI',
    passiveText: 'QI 회복 +20%, 강기 초식 공명.',
    flavorText: '호랑이 해·달·날·시에만 벼려낸다는 조선의 영검. 잡귀와 사악한 기운을 베어 낸다.',
  },
  {
    id: 'wp_bl_12', name: '요도 무라마사', group: 'BLADE', grade: 'TREASURE', price: 580,
    attack: 68, speedBonus: 0.15, range: 'MID', postureBreak: 30, upgradeLevel: 0, durability: 170, maxDurability: 170,
    passiveText: '모든 베기 피해 +25% (전투 시 살기 세평 상승).',
    flavorText: '칼집에서 뽑으면 피를 보아야만 돌아간다는 전설의 명도.',
  },

  // 서양 실존 검
  {
    id: 'wp_we_01', name: '이탈리아 레이피어', group: 'BLADE', grade: 'FINE', price: 210,
    attack: 34, speedBonus: 0.18, range: 'MID', postureBreak: 14, upgradeLevel: 0, durability: 110, maxDurability: 110,
    passiveText: '찌르기 초식 피해 +25%.',
    flavorText: '얇고 긴 칼날이 갑옷 틈새를 바늘처럼 파고드는 유럽 결투검.',
  },
  {
    id: 'wp_we_02', name: '프랑스 귀족 에페', group: 'BLADE', grade: 'FINE', price: 270,
    attack: 40, speedBonus: 0.22, range: 'MID', postureBreak: 16, upgradeLevel: 0, durability: 120, maxDurability: 120,
    passiveText: '초고속 반격·파리 리포스트 특화.',
    flavorText: '파리 귀족들의 새벽 결투장에서 바다 건너 흘러온 우아한 흉기.',
  },
  {
    id: 'wp_we_04', name: '독일 츠바이핸더', group: 'BLADE', grade: 'FINE', price: 320,
    attack: 58, speedBonus: -0.2, range: 'FAR', postureBreak: 46, upgradeLevel: 0, durability: 150, maxDurability: 150,
    passiveText: '양손 대검(외팔 불가). 방어 관통 30%.',
    flavorText: '웬만한 목검은 한 번 부딪히면 두 동강 나는 거대한 유럽 양손검.',
  },
  {
    id: 'wp_we_05', name: '다마스쿠스 세이버', group: 'BLADE', grade: 'TREASURE', price: 520,
    attack: 62, speedBonus: 0.14, range: 'MID', postureBreak: 30, upgradeLevel: 0, durability: 200, maxDurability: 200,
    passiveText: '내구도 손실 극소, 날카로운 연속 절단.',
    flavorText: '물결무늬가 살아 있는 서역 강철 명검. 천 번을 베어도 날이 무뎌지지 않는다.',
  },

  // 창·봉
  {
    id: 'wp_pl_01', name: '물푸레나무 6척봉', group: 'POLEARM', grade: 'CRUDE', price: 35,
    attack: 16, speedBonus: 0.05, range: 'FAR', postureBreak: 16, upgradeLevel: 0, durability: 90, maxDurability: 90,
    passiveText: '비살상 제압에 적합한 단단한 장봉.',
    flavorText: '단단한 물푸레나무를 깎아 기름을 먹인 소박한 봉.',
  },
  {
    id: 'wp_pl_02', name: '조선 군영 기창', group: 'POLEARM', grade: 'NORMAL', price: 105,
    attack: 28, speedBonus: 0.0, range: 'FAR', postureBreak: 20, upgradeLevel: 0, durability: 100, maxDurability: 100,
    passiveText: '원거리 견제와 찌르기 치명타 보정.',
    flavorText: '창날 아래 붉은 깃발이 적의 시야를 흐리는 실전 장창.',
  },
  {
    id: 'wp_pl_04', name: '호조인 십자창', group: 'POLEARM', grade: 'FINE', price: 250,
    attack: 44, speedBonus: 0.05, range: 'FAR', postureBreak: 28, upgradeLevel: 0, durability: 130, maxDurability: 130,
    passiveText: '갈고리 창날로 적의 공격 흐름 지연.',
    flavorText: '에도 창술 명문이 완성한 좌우 갈고리형 십자창.',
  },
  {
    id: 'wp_pl_06', name: '청룡언월도(명품)', group: 'POLEARM', grade: 'FINE', price: 290,
    attack: 54, speedBonus: -0.14, range: 'FAR', postureBreak: 42, upgradeLevel: 0, durability: 140, maxDurability: 140,
    passiveText: '중원 대도술·회전 베기 위력 +25%.',
    flavorText: '장정 팔뚝만 한 무게에서 뿜어지는 압도적 파괴력.',
  },
  {
    id: 'wp_pl_07', name: '파군 화첨창', group: 'POLEARM', grade: 'TREASURE', price: 540,
    attack: 65, speedBonus: 0.1, range: 'FAR', postureBreak: 34, upgradeLevel: 0, durability: 170, maxDurability: 170,
    elementAffinity: 'FIRE',
    passiveText: '화염·찌르기 초식 공명.',
    flavorText: '창끝이 불꽃처럼 굽은 전설의 장창.',
  },

  // 맨손(권갑)
  {
    id: 'wp_un_01', name: '삼베 권대', group: 'UNARMED', grade: 'CRUDE', price: 25,
    attack: 12, speedBonus: 0.15, range: 'CLOSE', postureBreak: 10, upgradeLevel: 0, durability: 80, maxDurability: 80,
    passiveText: '맨손 타격 쿨타임 단축.',
    flavorText: '주먹 관절을 보호하기 위해 칭칭 감은 거친 베 천.',
  },
  {
    id: 'wp_un_02', name: '가죽 권갑', group: 'UNARMED', grade: 'NORMAL', price: 85,
    attack: 22, speedBonus: 0.12, range: 'CLOSE', postureBreak: 18, upgradeLevel: 0, durability: 100, maxDurability: 100,
    passiveText: '복싱·권법 연타 피해 강화.',
    flavorText: '영국 베어너클 복서들도 탐낼 튼튼한 무두질 가죽 장갑.',
  },
  {
    id: 'wp_un_03', name: '철정 강권갑', group: 'UNARMED', grade: 'FINE', price: 220,
    attack: 38, speedBonus: 0.05, range: 'CLOSE', postureBreak: 32, upgradeLevel: 0, durability: 130, maxDurability: 130,
    passiveText: '타격 시 적 체세 파괴 대폭 상승.',
    flavorText: '너클 부위에 강철 징을 박은 무자비한 실전 권갑.',
  },
  {
    id: 'wp_un_05', name: '천잠사 장갑', group: 'UNARMED', grade: 'TREASURE', price: 480,
    attack: 54, speedBonus: 0.2, range: 'CLOSE', postureBreak: 28, upgradeLevel: 0, durability: 180, maxDurability: 180,
    elementAffinity: 'QI',
    passiveText: 'QI 전도율 최상. 내공·마법 권법 피해 +35%.',
    flavorText: '천년 빙잠의 실로 짠 신물. 칼날마저 맨손으로 잡아 챈다.',
  },

  // 암기
  {
    id: 'wp_th_01', name: '무쇠 비도 묶음', group: 'THROWN', grade: 'NORMAL', price: 80,
    attack: 22, speedBonus: 0.15, range: 'FAR', postureBreak: 10, upgradeLevel: 0, durability: 100, maxDurability: 100,
    passiveText: '원거리 투척·전조 차단용.',
    flavorText: '허리춤에 차고 다니는 날렵한 투척용 단검 묶음.',
  },
  {
    id: 'wp_th_03', name: '당문 소매전', group: 'THROWN', grade: 'FINE', price: 240,
    attack: 38, speedBonus: 0.2, range: 'FAR', postureBreak: 16, upgradeLevel: 0, durability: 120, maxDurability: 120,
    elementAffinity: 'SHADOW',
    passiveText: '투사 선딜 -25%, 중독 강화.',
    flavorText: '소매 속에 숨겨 쏘는 촉나라 당문의 정교한 기관 암기.',
  },
  {
    id: 'wp_th_05', name: '폭우 이화침', group: 'THROWN', grade: 'TREASURE', price: 520,
    attack: 58, speedBonus: 0.22, range: 'FAR', postureBreak: 26, upgradeLevel: 0, durability: 160, maxDurability: 160,
    elementAffinity: 'SHADOW',
    passiveText: '원거리 암기 최상급 위력.',
    flavorText: '배꽃이 폭우처럼 쏟아지듯 사방에서 날아드는 전설의 비기.',
  },

  // 이계 마도구 (6종)
  {
    id: 'wp_fn_01', name: '적철 화염도(赤鐵火焰刀)', group: 'BLADE', grade: 'ARCANE', price: 780,
    attack: 68, speedBonus: 0.06, range: 'MID', postureBreak: 34, upgradeLevel: 0, durability: 200, maxDurability: 200,
    elementAffinity: 'FIRE',
    passiveText: '화염 속성 공명! 화염 초식 피해 +35%.',
    flavorText: '화산 운철로 벼려 늘 따뜻한 붉은 칼날. 불꽃을 부르는 자의 손에서 진가를 발휘한다.',
  },
  {
    id: 'wp_fn_02', name: '만년 한빙검(寒氷劍)', group: 'BLADE', grade: 'ARCANE', price: 780,
    attack: 64, speedBonus: 0.12, range: 'MID', postureBreak: 30, upgradeLevel: 0, durability: 200, maxDurability: 200,
    elementAffinity: 'ICE',
    passiveText: '빙결 속성 공명! 빙결 초식 피해 +35%.',
    flavorText: '칼집에서 뽑으면 한여름에도 주변 풀잎에 서리가 앉는다.',
  },
  {
    id: 'wp_fn_03', name: '뇌운 세이버(雷雲劍)', group: 'BLADE', grade: 'ARCANE', price: 820,
    attack: 66, speedBonus: 0.2, range: 'MID', postureBreak: 30, upgradeLevel: 0, durability: 200, maxDurability: 200,
    elementAffinity: 'LIGHTNING',
    passiveText: '뇌전 속성 공명! 선딜 대폭 단축.',
    flavorText: '구리와 미지의 은백색 금속이 섞인 검. 휘두를 때마다 정전기가 튄다.',
  },
  {
    id: 'wp_fn_04', name: '현자의 참나무 지팡이', group: 'CATALYST', grade: 'ARCANE', price: 720,
    attack: 54, speedBonus: 0.1, range: 'FAR', postureBreak: 24, upgradeLevel: 0, durability: 200, maxDurability: 200,
    elementAffinity: 'QI',
    passiveText: '모든 이계 마법 QI 소모 -30%, 영창 속도 대폭↑.',
    flavorText: '서양 난파선에서 건진 기묘한 룬 문양 지팡이. 기의 흐름을 증폭한다.',
  },
  {
    id: 'wp_fn_05', name: '허공의 은빛 단검', group: 'THROWN', grade: 'ARCANE', price: 760,
    attack: 60, speedBonus: 0.25, range: 'MID', postureBreak: 24, upgradeLevel: 0, durability: 200, maxDurability: 200,
    elementAffinity: 'SHADOW',
    passiveText: '환영/보법 초식 쿨타임 대폭 단축.',
    flavorText: '빛을 반사하지 않고 삼키는 기묘한 단검.',
  },
  {
    id: 'wp_fn_06', name: '성석(星石) 룬 블레이드', group: 'BLADE', grade: 'ARCANE', price: 960,
    attack: 75, speedBonus: 0.12, range: 'MID', postureBreak: 40, upgradeLevel: 0, durability: 240, maxDurability: 240,
    elementAffinity: 'QI',
    passiveText: '모든 무술×마법 융합 초식 위력 +40%!',
    flavorText: '하늘에서 떨어진 운석에 이계 술식을 새긴 궁극의 마검.',
  },
];

export function getStartingWeapons(country: CountryId): Weapon[] {
  const wood = { ...ALL_WEAPONS_CATALOG.find((w) => w.id === 'wp_bl_01')! };
  const iron = { ...ALL_WEAPONS_CATALOG.find((w) => w.id === 'wp_bl_02')! };
  if (country === 'CHINA') {
    iron.name = '녹슨 유엽도';
    iron.flavorText = '어머니가 마지막에 쥐여 준 낡은 강남 유엽도.';
  } else if (country === 'JAPAN') {
    iron.name = '이 빠진 구식 타도';
    iron.flavorText = '에도 변두리 도장 벽에 걸려 있던 아버지의 낡은 칼.';
  }
  return [wood, iron];
}

export function getWeaponById(id: string): Weapon | undefined {
  const found = ALL_WEAPONS_CATALOG.find((w) => w.id === id);
  return found ? { ...found } : undefined;
}
