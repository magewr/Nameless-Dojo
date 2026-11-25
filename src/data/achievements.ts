import { GameState } from '../types/game';

export type AchievementCategory = 'LIFE' | 'MARTIAL' | 'BATTLE' | 'DOJO' | 'SECRET';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  secret?: boolean;
  check: (state: GameState) => boolean;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;
  sectName: string;
  heroName: string;
}

export const ACHIEVEMENT_CATEGORY_LABEL: Record<AchievementCategory, string> = {
  LIFE: '일생·인연',
  MARTIAL: '무술·연마',
  BATTLE: '비무·고수',
  DOJO: '도장·경영',
  SECRET: '기연·비술',
};

export const ACHIEVEMENTS: AchievementDef[] = [
  // 1. 도장 · 경영
  {
    id: 'ach_first_disciple',
    title: '첫 번째 기합',
    description: '첫 문하생을 도장에 들였다.',
    category: 'DOJO',
    check: (s) => s.disciples.length >= 1,
  },
  {
    id: 'ach_debt_free',
    title: '족쇄를 끊다',
    description: '선대가 남긴 빚을 완전히 청산했다.',
    category: 'DOJO',
    check: (s) => s.turn >= 2 && s.debt === 0,
  },
  {
    id: 'ach_sect_named',
    title: '현판에 새긴 이름',
    description: '도장에 자신만의 유파 이름을 새겼다.',
    category: 'DOJO',
    check: (s) => s.sectNamed,
  },
  {
    id: 'ach_grand_dojo',
    title: '천하 대무관',
    description: '연무장을 3단계 이상으로 증축 완공했다.',
    category: 'DOJO',
    check: (s) => s.facilities.yard >= 3,
  },
  {
    id: 'ach_disciples_8',
    title: '문하생 구름 같아라',
    description: '살아있는 문하생을 동시에 8명 이상 거느렸다.',
    category: 'DOJO',
    check: (s) => s.disciples.filter((d) => !d.dead).length >= 8,
  },
  {
    id: 'ach_rich_2000',
    title: '거대 상무 재단',
    description: '보유 재화 2,000 이상을 모았다.',
    category: 'DOJO',
    check: (s) => s.money >= 2000,
  },

  // 2. 무술 · 연마
  {
    id: 'ach_first_craft',
    title: '무명에서 유명으로',
    description: '두 초식을 조합해 첫 창시 무술을 완성했다.',
    category: 'MARTIAL',
    check: (s) => s.flags.hasCraftedOnce || s.skills.some((sk) => Boolean(sk.parents)),
  },
  {
    id: 'ach_mastery_6',
    title: '일가를 이루다',
    description: '하나의 초식을 Lv.6(대성) 이상 연마했다.',
    category: 'MARTIAL',
    check: (s) => s.skills.some((sk) => sk.masteryLevel >= 6),
  },
  {
    id: 'ach_mastery_10',
    title: '칼끝의 신화',
    description: '하나의 초식을 최고 경지 Lv.10에 도달시켰다.',
    category: 'MARTIAL',
    check: (s) => s.skills.some((sk) => sk.masteryLevel >= 10),
  },
  {
    id: 'ach_heirloom',
    title: '대를 잇는 보검',
    description: '병기에 이름을 새겨 유파의 가보로 선포했다.',
    category: 'MARTIAL',
    check: (s) => s.weapons.some((w) => w.isHeirloom),
  },
  {
    id: 'ach_book_5',
    title: '만권의 장서각',
    description: '무술 서적 5권 이상을 독파했다.',
    category: 'MARTIAL',
    check: (s) => s.books.filter((b) => b.decoded).length >= 5,
  },

  // 3. 비무 · 절정 고수 · 무술대회
  {
    id: 'ach_fame_300',
    title: '사방에 떨친 이름',
    description: '도장 명성 300 이상을 달성했다.',
    category: 'BATTLE',
    check: (s) => s.fame >= 300,
  },
  {
    id: 'ach_fame_1000',
    title: '당대 제일문파',
    description: '도장 명성 1,000 이상을 달성했다.',
    category: 'BATTLE',
    check: (s) => s.fame >= 1000,
  },
  {
    id: 'ach_parry_master',
    title: '눈으로 베는 검',
    description: '한 번의 비무에서 간파(看破)를 3회 이상 성공시켰다.',
    category: 'BATTLE',
    check: (s) => (s.flags.maxParriesInBattle || 0) >= 3,
  },
  {
    id: 'ach_real_duel_3',
    title: '생사를 가른 칼날',
    description: '진검결투에서 3회 이상 승리했다.',
    category: 'BATTLE',
    check: (s) => s.flags.realDuelWins >= 3,
  },
  {
    id: 'ach_grandmaster_defeat',
    title: '절정 고수를 꺾다',
    description: '명성을 듣고 찾아온 문파의 절정 고수와의 결투에서 승리했다.',
    category: 'BATTLE',
    check: (s) => (s.flags.grandmasterWins || 0) >= 1,
  },
  {
    id: 'ach_tournament_champ',
    title: '천하제일 무술대회 우승',
    description: '천하제일 무술대회 3연전을 제패하고 우승을 차지했다.',
    category: 'BATTLE',
    check: (s) => (s.flags.tournamentWins || 0) >= 1,
  },

  // 4. 일생 · 인연
  {
    id: 'ach_marry',
    title: '평생의 반려',
    description: '도장의 곁을 함께 걸어갈 반려자와 혼례를 올렸다.',
    category: 'LIFE',
    check: (s) => Boolean(s.spouse),
  },
  {
    id: 'ach_child_heir',
    title: '핏줄과 무도의 계승',
    description: '친자녀를 문하에 들여 무술을 전수했다.',
    category: 'LIFE',
    check: (s) => s.disciples.some((d) => d.isChild && !d.adopted),
  },
  {
    id: 'ach_rival_4',
    title: '평생의 맞수',
    description: '숙적과의 인연을 4막까지 마주했다.',
    category: 'LIFE',
    check: (s) => s.rival.act >= 4 || s.flags.rivalFarewellDone,
  },
  {
    id: 'ach_silver_65',
    title: '백발의 검성',
    description: '65세 이상 생존해 원로 대종사의 경지에 올랐다.',
    category: 'LIFE',
    check: (s) => s.age >= 65,
  },
  {
    id: 'ach_ending_clear',
    title: '역사에 남긴 일생',
    description: '한 일생을 완주해 사후 200년 연대기를 기록했다.',
    category: 'LIFE',
    check: (s) => s.phase === 'ENDING',
  },

  // 5. 기연 · 비술 (히든)
  {
    id: 'ach_merchant_grimoire',
    title: '금단의 서책',
    description: '세상의 이치를 벗어난 이계 금서를 손에 넣었다.',
    category: 'SECRET',
    secret: true,
    check: (s) => s.books.some((b) => b.rarity === 'GRIMOIRE'),
  },
  {
    id: 'ach_awakening',
    title: '한계를 부순 경지',
    description: '영구 장애를 극복하고 초월 경지(외팔 검성·심안 등)에 각성했다.',
    category: 'SECRET',
    secret: true,
    check: (s) => s.awakenings.length >= 1,
  },
  {
    id: 'ach_hard_clear',
    title: '험난한 강호의 생존자',
    description: '【어려움】 난이도에서 60세 이상 살아남거나 천수를 누렸다.',
    category: 'LIFE',
    check: (s) => s.difficulty === 'HARD' && (s.age >= 60 || (s.deathCause || '').includes('천수')),
  },
  {
    id: 'ach_hell_survive',
    title: '지옥에서 살아남은 자',
    description: '【지옥】 난이도의 재해와 진검승부 속에서 50세 이상 살아남았다.',
    category: 'SECRET',
    secret: true,
    check: (s) => s.difficulty === 'HELL' && s.age >= 50,
  },
  {
    id: 'ach_hell_master',
    title: '수라도의 천하무신',
    description: '【지옥】 난이도에서 천수를 누리거나 천하제일 무술대회 우승을 차지했다.',
    category: 'SECRET',
    secret: true,
    check: (s) =>
      s.difficulty === 'HELL' &&
      ((s.deathCause || '').includes('천수') || s.age >= 62 || (s.flags.tournamentWins || 0) >= 1),
  },
];
