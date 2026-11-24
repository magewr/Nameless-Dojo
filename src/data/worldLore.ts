import { Book, CountryId, GameState, Skill, Weapon } from '../types/game';
import {
  BOOK_SKILL_TEMPLATES,
  ELEMENT_LABEL,
  FORM_LABEL,
  MASTERY_NAMES,
  WEAPON_GROUP_LABEL,
  TRANSCEND_AURA_SUMMARY,
  TRANSCEND_SUMMARY,
} from './booksAndSkills';

export const STAT_GUIDE: Array<{ key: keyof GameState['stats']; abbr: string; name: string; desc: string }> = [
  { key: 'str', abbr: '근력', name: '근력 (筋力)', desc: '물리 초식의 타격 위력을 높이고, 적의 자세(체세)를 무너뜨리는 힘입니다.' },
  { key: 'agi', abbr: '민첩', name: '민첩 (敏捷)', desc: '초식 발동 속도와 보법 이동을 빠르게 하고, 강공격 회피율을 높입니다.' },
  { key: 'vit', abbr: '체력', name: '체력 (體力)', desc: '비무 최대 생명력과 체세(방어 지구력)를 높이며 진검결투 생존력을 키웁니다.' },
  { key: 'wil', abbr: '정신', name: '정신 (精神)', desc: '기력(QI) 최대치와 회복 속도를 높이고, 속성과 내공 초식의 위력을 보강합니다.' },
  { key: 'ins', abbr: '통찰', name: '통찰 (洞察)', desc: '적의 초식을 꿰뚫는 간파(看破)·반격 확률을 크게 높이고, 장착 가능한 초식 칸을 늘립니다.' },
  { key: 'qi', abbr: '영력', name: '영력 (靈力)', desc: '기공·속성·비술 초식의 핵심 위력이며, 운기 심법 장착 칸과 비급 연구 조건에 쓰입니다.' },
];

export const COUNTRY_LORE: Record<
  CountryId,
  {
    name: string;
    era: string;
    headline: string;
    atmosphere: string;
    martialCulture: string;
    bonusDesc: string;
  }
> = {
  KOREA: {
    name: '조선 (朝鮮)',
    era: '영조 26년 (1750년)',
    headline: '소나무 돌담 너머, 조용히 숨을 고르는 선비와 무인의 나라',
    atmosphere:
      '영조의 탕평 정국 아래 도성과 지방 장터가 차분히 번영하던 시기입니다. 군영의 실전 무예와 산중 선도(仙道)의 내공이 함께 숨 쉬며, 의리와 절개를 중시하는 기풍이 짙습니다.',
    martialCulture:
      '조선세법의 환도 검술, 택견의 부드러운 보법, 선도 양생 심법이 전통을 이룹니다. 정신(WIL)과 기공 수련에 강점이 있어 중·노년기 내공과 간파의 경지에 오르기 유리합니다.',
    bonusDesc: '정신(WIL) 성장 보너스 · 기공 명상 효율 상승 · 의로운 세평 형성 유리',
  },
  CHINA: {
    name: '청나라 (大淸)',
    era: '건륭 15년 (1750년)',
    headline: '붉은 기둥과 수많은 문파가 뒤엉키는 천하 무림의 중심',
    atmosphere:
      '건륭제 치세의 전성기. 강남과 북방의 거대한 상단이 은자를 굴리고, 골목마다 크고 작은 무관과 표국이 세를 다투며 천하의 고수들이 모여듭니다.',
    martialCulture:
      '소림의 강권, 태극의 유수 반격, 형의권과 팔괘장, 중원 도법까지 백가쟁명의 무학이 꽃핍니다. 상업과 제자 육성에 유리해 거대한 문파로 키우기 좋습니다.',
    bonusDesc: '호위·월사금 수익 +15% · 문하생 영입 및 대규모 문파 운영 유리',
  },
  JAPAN: {
    name: '일본 (江戶)',
    era: '간엔 3년 (1750년)',
    headline: '에도의 평화 속에서도 칼날의 극한을 깎아내는 검객들의 시대',
    atmosphere:
      '도쿠가와 막부의 오랜 태평성대 아래 전쟁은 사라졌지만, 전국 각지의 도장에서는 목검과 진검으로 한 합 승부의 극의를 겨루는 타류 시합이 끊이지 않습니다.',
    martialCulture:
      '신카게류, 이천일류, 거합도와 지겐류까지 오직 일격필살의 검리(劍理)를 추구합니다. 나가사키를 통해 들어오는 서양 교본을 접할 기회도 가장 많습니다.',
    bonusDesc: '비무·도장 명성 획득 +20% · 도검 초식 연마 가속 · 서양 무술서 출현율↑',
  },
};

export interface LoreArticle {
  id: string;
  category: 'WORLD' | 'NPC' | 'SYSTEM';
  title: string;
  subtitle: string;
  body: string[];
  portraitRole?: 'MERCHANT' | 'RIVAL' | 'HERO' | 'SPOUSE';
}

export function getWorldLoreArticles(state: GameState): LoreArticle[] {
  const cLore = COUNTRY_LORE[state.country];
  const elderName = state.country === 'CHINA' ? '이웃 왕 노인' : state.country === 'JAPAN' ? '이웃 겐지 영감' : '이웃 김 영감';
  return [
    {
      id: 'lore_era',
      category: 'WORLD',
      title: `1750년 · ${cLore.name}`,
      subtitle: cLore.era,
      body: [cLore.headline, cLore.atmosphere, cLore.martialCulture],
    },
    {
      id: 'lore_dojo',
      category: 'WORLD',
      title: `【${state.sectName}】의 기원`,
      subtitle: '횡베기 하나, 종베기 하나로 시작된 무명의 도장',
      body: [
        '선대 도장주가 세상을 떠나며 남긴 것은 비 새는 마당과 낡은 목검, 그리고 가로로 한 번·세로로 한 번 긋는 가장 기초적인 두 초식뿐이었습니다.',
        '그러나 어떤 전설의 유파도 처음에는 이름 없는 칼질 하나에서 시작되었습니다. 당신의 선택과 수련, 제자들과의 인연이 훗날 200년 뒤의 역사서에 기록됩니다.',
      ],
    },
    {
      id: 'lore_merchant',
      category: 'NPC',
      title: '비밀 상인 「만물객(萬物客)」',
      subtitle: '비 오는 날 처마 밑에 나타나는 정체불명의 수집가',
      portraitRole: 'MERCHANT',
      body: [
        '삼국의 항구와 저잣거리를 자유롭게 넘나드는 행상입니다. 오래된 무술 비급부터 서양 상선에서 흘러나온 검술 교본, 심지어는 세상의 이치를 벗어난 기이한 고서까지 취급합니다.',
        '이상하게도 세월이 수십 년 흘러도 그의 얼굴은 좀처럼 늙지 않는다는 소문이 떠돕니다.',
      ],
    },
    {
      id: 'lore_rival',
      category: 'NPC',
      title: `숙적 · ${state.rival.name}`,
      subtitle: `현재 ${state.rival.age}세 · 평생을 나란히 걷는 맞수`,
      portraitRole: 'RIVAL',
      body: [
        '같은 시대에 검을 잡은 천재 무인입니다. 당신이 나이를 먹으며 성장하는 동안 그 역시 자신만의 경지를 쌓아 올립니다.',
        '일생에 걸쳐 여러 차례 마주치게 되며, 그가 꺾고자 하는 것은 단순한 승패가 아니라 당신이 평생 걸어온 무도의 증명입니다.',
      ],
    },
    {
      id: 'lore_elder',
      category: 'NPC',
      title: elderName,
      subtitle: '선대 도장주의 오랜 벗이자 도장의 든든한 이웃',
      body: [
        '도장이 가장 초라하던 첫 봄 아침, 따뜻한 죽 한 그릇을 들고 찾아와 길을 일러 준 어르신입니다.',
        '무림의 고수는 아니지만 저잣거리의 인심과 도장의 사정을 누구보다 잘 알고 있습니다.',
      ],
    },
    {
      id: 'lore_mastery',
      category: 'SYSTEM',
      title: '초식 연마 · 3/6/9 각인 · 조합',
      subtitle: '같은 횡베기라도 어떻게 갈고닦느냐에 따라 전혀 다른 검이 된다',
      body: [
        '모든 초식은 Lv.1(입문)부터 Lv.9(입신)까지 수련으로 성장하고, 그 너머 Lv.10 극의는 폐관수련으로만 열립니다. 강호의 어떤 고수도 극의에 이르지 못했습니다. 숙련도가 오를수록 위력뿐 아니라 비무 시 검기의 크기, 잔상, 연격 모션까지 극적으로 진화합니다.',
        'Lv.3·Lv.6·Lv.9에 도달하면 고유 연마 특성을 각인할 수 있으며, [무술 조합]으로 두 초식의 장점을 융합해 세상에 하나뿐인 유파 비기를 창시할 수 있습니다.',
      ],
    },
    {
      id: 'lore_counter',
      category: 'SYSTEM',
      title: '간파(看破)와 반격의 이치',
      subtitle: '힘이 쇠하는 노년에도 검성이 무너지지 않는 이유',
      body: [
        '나이가 들면 근력(STR)과 민첩(AGI)은 서서히 쇠하지만, 평생 쌓은 통찰(INS)과 영력(QI)은 오히려 깊어집니다.',
        '통찰이 높거나 반격 특화 초식(방어 계통)을 장착하면 적의 공격이 닿는 찰나에 칼을 흘려내고(看破), 즉시 치명적인 반격 일섬을 꽂아 넣습니다.',
      ],
    },
  ];
}

// 만물객 서적 상세 감정 대사 생성기
export function getMerchantBookAppraisal(book: Book): {
  merchantQuote: string;
  skillPreview: Skill | null;
  rarityLabel: string;
  decodeNote: string;
  craftTip: string;
} {
  const tpl = book.isLegacy && book.legacySkill ? book.legacySkill : BOOK_SKILL_TEMPLATES[book.skillTemplateId];
  const skillPreview: Skill | null = tpl
    ? { ...tpl, masteryLevel: book.legacySkill?.masteryLevel || 1, masteryExp: 0, imprintedTraits: book.legacySkill?.imprintedTraits || [] }
    : null;

  const rarityLabel =
    book.rarity === 'GRIMOIRE'
      ? '이계 금서'
      : book.rarity === 'LEGACY'
      ? '전생 유파 비급'
      : book.rarity === 'WESTERN'
      ? '서양 무술 교본'
      : book.rarity === 'LEGEND'
      ? '전설 비급'
      : book.rarity === 'RARE'
      ? '희귀 무술서'
      : '실전 무술서';

  let merchantQuote = '';
  if (book.rarity === 'GRIMOIRE') {
    merchantQuote = `“……목소리를 낮추시오. 이 『${book.title}』은 바깥세상의 이치가 담긴 물건이오. 끝까지 연구해 내면 【${skillPreview?.name || '금단의 비술'}】을 깨우칠 수 있소만, 세상의 시선과 반동까지 감당할 각오가 되어 있소?”`;
  } else if (book.rarity === 'LEGACY') {
    merchantQuote = `“허허, 아주 먼 옛날 어느 무명의 대종사가 남긴 친필 비급이오. 펼치는 순간 【${skillPreview?.customName || skillPreview?.name || '비전 초식'}】의 검로가 고스란히 전해질 것이오.”`;
  } else if (book.rarity === 'WESTERN') {
    merchantQuote = `“멀리 서양 상선에서 들여온 귀한 교본이라오. 【${skillPreview?.name || '서양 검술'}】은 동양의 베기와 결이 완전히 다르지. 자네가 익힌 동양 초식과 조합해 보면 깜짝 놀랄 신초식이 나올 게요.”`;
  } else if (book.rarity === 'LEGEND') {
    merchantQuote = `“쉽게 내놓을 물건이 아니오만, 자네라면 값을 치를 눈이 있을 테지. 【${skillPreview?.name || '전설 초식'}】은 한 유파의 근간이 될 만한 절학이라오.”`;
  } else {
    merchantQuote = `“실전에서 바로 써먹기 좋은 알짜 무술서요. 익혀 두면 【${skillPreview?.name || '신초식'}】을 바로 쓸 수 있고, ${skillPreview ? WEAPON_GROUP_LABEL[skillPreview.weapon] : '병기'}와 궁합이 아주 좋지.”`;
  }

  const decodeNote =
    book.decodeApRequired === 0
      ? '구매 즉시 습득 가능 (별도 연구 불필요)'
      : `장서각에서 [서적 연구] 필요${book.requiresMasteryLv ? ` · 최고 초식 Lv.${book.requiresMasteryLv} 이상` : ''}${book.requiresQi ? ` · 영력(QI) ${book.requiresQi} 이상` : ''}`;

  const craftTip = skillPreview
    ? skillPreview.isPassive
      ? '운기 심법(패시브)으로 장착하면 상시 능력이 강화되며, 공격 초식과 조합해 속성·기공 비기를 만들 수 있습니다.'
      : `${FORM_LABEL[skillPreview.form]} · ${ELEMENT_LABEL[skillPreview.element]} 계통 초식입니다. 기존 초식과 [무술 조합] 시 새로운 시그니처 비기로 발전할 수 있습니다.`
    : '독파 시 새로운 무술의 이치를 깨닫게 됩니다.';

  return { merchantQuote, skillPreview, rarityLabel, decodeNote, craftTip };
}

// 만물객 / 대장간 무기 상세 감정 대사 생성기
export function getWeaponAppraisal(weapon: Weapon): {
  merchantQuote: string;
  gradeLabel: string;
  affinityText: string;
} {
  const gradeMap: Record<Weapon['grade'], string> = {
    CRUDE: '낡은 수련용 병기',
    NORMAL: '실전용 단조 병기',
    FINE: '명장의 수작 병기',
    TREASURE: '천하 보물 · 전설 병기',
    ARCANE: '이계의 마도 병기',
  };
  const gradeLabel = gradeMap[weapon.grade];
  const groupLabel = WEAPON_GROUP_LABEL[weapon.group];
  const affinityText = weapon.elementAffinity
    ? `${ELEMENT_LABEL[weapon.elementAffinity]} 속성 초식과 완벽 공명 (위력 +35%)`
    : `${groupLabel} 계통 초식 사용 시 위력 +15% 보너스`;

  let merchantQuote = '';
  if (weapon.grade === 'ARCANE') {
    merchantQuote = `“손잡이에서 서늘한 기운이 감돌지 않소? 평범한 쇠가 아니오. 【${weapon.name}】은 기공과 비술을 담아낼 때 진짜 빛을 발하는 물건이지.”`;
  } else if (weapon.grade === 'TREASURE' || weapon.grade === 'FINE') {
    merchantQuote = `“보시오, 날에 서린 서슬이 다르지 않소? 【${weapon.name}】은 평생을 함께하며 유파의 가보로 물려주어도 손색없는 명검이라오.”`;
  } else {
    merchantQuote = `“무게 중심이 아주 정직한 ${groupLabel} 병기요. 대장간에서 숫돌로 갈고 단련하면 실전에서 제 몫을 톡톡히 해낼 게요.”`;
  }

  return { merchantQuote, gradeLabel, affinityText };
}

export function getMasteryEvolutionDesc(level: number): string {
  if (level >= 10) return `Lv.10 (${MASTERY_NAMES[10]}) — 세상에 나 하나뿐인 경지: ${TRANSCEND_SUMMARY}. ${TRANSCEND_AURA_SUMMARY}. 제자에게 Lv.6으로 전수`;
  if (level >= 9) return `Lv.${level} (${MASTERY_NAMES[level]}) — 입신 경지: 먹물 일섬 암전, 3중 잔상, 거대 검기 파동 발현. 이 너머는 폐관수련으로만 열린다`;
  if (level >= 6) return `Lv.${level} (${MASTERY_NAMES[level]}) — 대성 경지: 대형 검기, 2중 잔상, 다중 참격선 및 오의 컷인 발현`;
  if (level >= 3) return `Lv.${level} (${MASTERY_NAMES[level]}) — 숙달 경지: 기 모음 오라, 1중 잔상, 선명한 강철 검기 발현`;
  return `Lv.${level} (${MASTERY_NAMES[level]}) — 입문 경지: 기본 동작과 은백 검기. 수련을 거듭할수록 이펙트와 연격이 진화합니다.`;
}
