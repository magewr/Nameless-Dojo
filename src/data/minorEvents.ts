import { GameState, ScheduleActivityId, Season } from '../types/game';

export interface MinorEventDef {
  id: string;
  activity?: ScheduleActivityId;
  season?: Season;
  condition?: (st: GameState) => boolean;
  tone: 'GOOD' | 'NORMAL' | 'WARN' | 'MAGIC';
  text: string;
  apply: (st: GameState, share: number) => {
    statsDelta?: Partial<GameState['stats']>;
    moneyDelta?: number;
    fameDelta?: number;
    healthDelta?: number;
    skillExpBonus?: number;
    decodeBonus?: number;
    craftBonus?: number;
    repDelta?: Partial<GameState['reputation']>;
    loyaltyDelta?: number;
  };
}

// 총 75종 사소한 작업·계절·일상 이벤트 풀 (진행을 끊지 않고 미니 로그로 흘러감)
export const MINOR_EVENTS: MinorEventDef[] = [
  // 1. 무술 연마 (6종)
  {
    id: 'mn_tr_1', activity: 'TRAIN', tone: 'GOOD',
    text: '호흡과 칼끝이 하나로 맞물렸다! 연마 대성공!',
    apply: (_s, sh) => ({ skillExpBonus: Math.round(52 * sh) }),
  },
  {
    id: 'mn_tr_2', activity: 'TRAIN', tone: 'GOOD',
    text: '처마 밑 빗방울 박자에서 빈틈없는 연결을 깨달았다.',
    apply: (_s, sh) => ({ statsDelta: { ins: 1 }, skillExpBonus: Math.round(24 * sh) }),
  },
  {
    id: 'mn_tr_3', activity: 'TRAIN', tone: 'GOOD',
    text: '며칠간 막혀 있던 손목 각도가 거짓말처럼 풀렸다.',
    apply: (_s, sh) => ({ skillExpBonus: Math.round(32 * sh) }),
  },
  {
    id: 'mn_tr_4', activity: 'TRAIN', tone: 'NORMAL',
    text: '땀에 젖은 손잡이가 손바닥에 착 감기며 힘이 붙었다.',
    apply: () => ({ statsDelta: { str: 1 } }),
  },
  {
    id: 'mn_tr_5', activity: 'TRAIN', tone: 'WARN',
    text: '지나치게 힘을 주다 손목이 살짝 삐끗했다.',
    apply: () => ({ healthDelta: -3 }),
  },
  {
    id: 'mn_tr_6', activity: 'TRAIN', condition: (s) => s.age >= 50, tone: 'GOOD',
    text: '팔은 예전보다 무거워졌지만 검끝의 무게가 한층 묵직해졌다.',
    apply: (_s, sh) => ({ statsDelta: { wil: 1 }, skillExpBonus: Math.round(30 * sh) }),
  },

  // 2. 신체 단련 (6종)
  {
    id: 'mn_bd_1', activity: 'BODY', tone: 'GOOD',
    text: '땀이 비 오듯 쏟아졌으나 몸이 깃털처럼 가볍다!',
    apply: () => ({ statsDelta: { str: 1, agi: 1 } }),
  },
  {
    id: 'mn_bd_2', activity: 'BODY', tone: 'GOOD',
    text: '새벽 산길을 왕복하며 하체와 폐활량을 단단히 다졌다.',
    apply: () => ({ statsDelta: { vit: 2 } }),
  },
  {
    id: 'mn_bd_3', activity: 'BODY', tone: 'GOOD',
    text: '떨어지는 낙엽을 검집으로 쳐 내며 반사신경을 끌어올렸다.',
    apply: () => ({ statsDelta: { agi: 2 } }),
  },
  {
    id: 'mn_bd_4', activity: 'BODY', tone: 'NORMAL',
    text: '무거운 돌절구를 들어 올리며 악력을 길렀다.',
    apply: () => ({ statsDelta: { str: 2 } }),
  },
  {
    id: 'mn_bd_5', activity: 'BODY', tone: 'WARN',
    text: '무리한 단련 끝에 어깨 근육이 단단히 뭉쳤다.',
    apply: () => ({ healthDelta: -4 }),
  },
  {
    id: 'mn_bd_6', activity: 'BODY', tone: 'GOOD',
    text: '지나가던 장사꾼이 다부진 기세를 보고 감탄했다.',
    apply: () => ({ fameDelta: 4 }),
  },

  // 3. 기공 명상 (6종)
  {
    id: 'mn_md_1', activity: 'MIND', tone: 'GOOD',
    text: '단전에 뜨거운 기운이 맑게 감돌며 시야가 트였다!',
    apply: () => ({ statsDelta: { qi: 3, wil: 1 } }),
  },
  {
    id: 'mn_md_2', activity: 'MIND', tone: 'GOOD',
    text: '고요한 호흡 속에서 지난 결투의 허점이 선명히 보였다.',
    apply: () => ({ statsDelta: { ins: 2 } }),
  },
  {
    id: 'mn_md_3', activity: 'MIND', tone: 'GOOD',
    text: '흔들리던 마음이 잔잔한 호수처럼 가라앉았다.',
    apply: () => ({ healthDelta: 4, statsDelta: { wil: 1 } }),
  },
  {
    id: 'mn_md_4', activity: 'MIND', tone: 'NORMAL',
    text: '손끝까지 따뜻한 기운이 퍼져 나간다.',
    apply: () => ({ statsDelta: { qi: 2 } }),
  },
  {
    id: 'mn_md_5', activity: 'MIND', tone: 'WARN',
    text: '저잣거리 소음에 집중이 흐트러져 잡념이 들었다.',
    apply: () => ({ repDelta: { ascetic: 1 } }),
  },
  {
    id: 'mn_md_6', activity: 'MIND', condition: (s) => s.skills.some((k) => k.origin.includes('FANTASY')), tone: 'MAGIC',
    text: '숨을 내쉴 때마다 방 안 공기가 기이하게 일렁인다.',
    apply: () => ({ statsDelta: { qi: 3 }, repDelta: { arcane: 3 } }),
  },

  // 4. 서적 해독 (6종)
  {
    id: 'mn_dc_1', activity: 'DECODE', tone: 'GOOD',
    text: '난해하던 행간의 도해가 한순간에 읽혔다! (서적 연구 대성공)',
    apply: (_s, sh) => ({ decodeBonus: Math.round(38 * sh) }),
  },
  {
    id: 'mn_dc_2', activity: 'DECODE', tone: 'GOOD',
    text: '서책 여백에 적힌 선인의 주석에서 핵심을 짚었다.',
    apply: (_s, sh) => ({ statsDelta: { ins: 1 }, decodeBonus: Math.round(22 * sh) }),
  },
  {
    id: 'mn_dc_3', activity: 'DECODE', tone: 'NORMAL',
    text: '낯선 이국 문자의 규칙을 어렴풋이 파악했다.',
    apply: (_s, sh) => ({ decodeBonus: Math.round(20 * sh) }),
  },
  {
    id: 'mn_dc_4', activity: 'DECODE', tone: 'NORMAL',
    text: '이해한 초식 원리를 붓으로 정갈하게 옮겨 적었다.',
    apply: (_s, sh) => ({ repDelta: { ascetic: 2 }, decodeBonus: Math.round(16 * sh) }),
  },
  {
    id: 'mn_dc_5', activity: 'DECODE', tone: 'WARN',
    text: '등잔불 아래 밤을 새우다 심한 두통이 찾아왔다.',
    apply: () => ({ healthDelta: -3 }),
  },
  {
    id: 'mn_dc_6', activity: 'DECODE', condition: (s) => s.books.some((b) => b.rarity === 'GRIMOIRE' && !b.decoded), tone: 'MAGIC',
    text: '금서 책장을 넘기자 손끝에서 작은 불티가 튀었다!',
    apply: (_s, sh) => ({ statsDelta: { qi: 2 }, repDelta: { arcane: 3 }, decodeBonus: Math.round(25 * sh) }),
  },

  // 5. 무술 조합 (6종)
  {
    id: 'mn_cr_1', activity: 'CRAFT', tone: 'GOOD',
    text: '두 초식의 맥이 번개처럼 맞물리며 연구가 크게 진척되었다!',
    apply: (_s, sh) => ({ craftBonus: Math.round(42 * sh) }),
  },
  {
    id: 'mn_cr_2', activity: 'CRAFT', tone: 'GOOD',
    text: '마당에서 두 동작을 이어 휘둘러 보며 궤적을 다듬었다.',
    apply: (_s, sh) => ({ statsDelta: { ins: 1 }, craftBonus: Math.round(25 * sh) }),
  },
  {
    id: 'mn_cr_3', activity: 'CRAFT', tone: 'NORMAL',
    text: '흙바닥에 나뭇가지로 발놀림 도해를 수십 번 그려 보았다.',
    apply: (_s, sh) => ({ craftBonus: Math.round(20 * sh) }),
  },
  {
    id: 'mn_cr_4', activity: 'CRAFT', condition: (s) => s.disciples.some((d) => !d.dead), tone: 'GOOD',
    text: '제자와 합을 맞춰 보며 실전 빈틈을 보완했다.',
    apply: (_s, sh) => ({ craftBonus: Math.round(24 * sh), loyaltyDelta: 3 }),
  },
  {
    id: 'mn_cr_5', activity: 'CRAFT', tone: 'WARN',
    text: '억지로 동작을 잇다 중심을 잃고 마당에 나뒹굴었다.',
    apply: () => ({ healthDelta: -2 }),
  },
  {
    id: 'mn_cr_6', activity: 'CRAFT', condition: (s) => s.stats.ins >= 70, tone: 'MAGIC',
    text: '상식을 뒤엎는 이단적 발상이 머리를 번뜩 스쳤다.',
    apply: () => ({ statsDelta: { ins: 2 }, repDelta: { ascetic: 2 } }),
  },

  // 6. 문하생 지도 (6종)
  {
    id: 'mn_tc_1', activity: 'TEACH', tone: 'GOOD',
    text: '시범 한 번에 문하생들의 눈빛이 일제히 빛났다!',
    apply: () => ({ loyaltyDelta: 5, fameDelta: 4 }),
  },
  {
    id: 'mn_tc_2', activity: 'TEACH', tone: 'GOOD',
    text: '제자의 어설픈 자세를 고쳐 주다 오히려 내 빈틈을 깨달았다.',
    apply: () => ({ statsDelta: { ins: 2 } }),
  },
  {
    id: 'mn_tc_3', activity: 'TEACH', tone: 'GOOD',
    text: '기합 소리가 담장 너머까지 우렁차게 울려 퍼졌다.',
    apply: () => ({ fameDelta: 6 }),
  },
  {
    id: 'mn_tc_4', activity: 'TEACH', tone: 'GOOD',
    text: '감동한 제자 집안에서 햅쌀과 닭을 보내왔다.',
    apply: () => ({ moneyDelta: 16, repDelta: { virtue: 3 } }),
  },
  {
    id: 'mn_tc_5', activity: 'TEACH', tone: 'WARN',
    text: '대련 중 제자 둘이 감정이 격해져 말다툼을 벌여 말렸다.',
    apply: () => ({ repDelta: { virtue: 1 } }),
  },
  {
    id: 'mn_tc_6', activity: 'TEACH', tone: 'NORMAL',
    text: '저녁 무렵까지 마당에 남아 제자들과 칼을 맞댔다.',
    apply: () => ({ loyaltyDelta: 4 }),
  },

  // 7. 호위 · 생계 (6종)
  {
    id: 'mn_es_1', activity: 'ESCORT', tone: 'GOOD',
    text: '고갯길 좀도둑을 단칼에 쫓아내 상단 주인이 사례금을 얹어 주었다!',
    apply: () => ({ moneyDelta: 24, fameDelta: 5 }),
  },
  {
    id: 'mn_es_2', activity: 'ESCORT', tone: 'GOOD',
    text: '의뢰를 깔끔히 완수해 저잣거리에 좋은 소문이 돌았다.',
    apply: () => ({ fameDelta: 6, repDelta: { commerce: 3 } }),
  },
  {
    id: 'mn_es_3', activity: 'ESCORT', tone: 'GOOD',
    text: '거상이 다음에도 꼭 맡기겠다며 웃돈을 챙겨 주었다.',
    apply: () => ({ moneyDelta: 18, repDelta: { commerce: 3 } }),
  },
  {
    id: 'mn_es_4', activity: 'ESCORT', tone: 'GOOD',
    text: '힘없는 노인의 짐을 공짜로 지켜 주었다.',
    apply: () => ({ repDelta: { virtue: 5 }, fameDelta: 4 }),
  },
  {
    id: 'mn_es_5', activity: 'ESCORT', tone: 'WARN',
    text: '궂은비 속에 짐을 나르다 가벼운 몸살 기운이 돌았다.',
    apply: () => ({ healthDelta: -4 }),
  },
  {
    id: 'mn_es_6', activity: 'ESCORT', tone: 'NORMAL',
    text: '주막에서 떠돌이 상인에게 귀한 무술 서적 소문을 들었다.',
    apply: () => ({ statsDelta: { ins: 1 } }),
  },

  // 8. 휴식 · 치료 (6종)
  {
    id: 'mn_rs_1', activity: 'REST', tone: 'GOOD',
    text: '약방 영약탕과 푹 잔 잠 덕분에 기력이 몰라보게 돌아왔다!',
    apply: () => ({ healthDelta: 10 }),
  },
  {
    id: 'mn_rs_2', activity: 'REST', tone: 'GOOD',
    text: '처마 밑에서 차를 마시며 지난 수련을 차분히 되돌아보았다.',
    apply: () => ({ statsDelta: { wil: 1 }, healthDelta: 5 }),
  },
  {
    id: 'mn_rs_3', activity: 'REST', tone: 'NORMAL',
    text: '따뜻한 물에 몸을 담그니 묵은 피로가 싹 풀렸다.',
    apply: () => ({ healthDelta: 7 }),
  },
  {
    id: 'mn_rs_4', activity: 'REST', condition: (s) => !!s.spouse?.alive, tone: 'GOOD',
    text: '동반자가 정성껏 끓여 준 보양식을 함께 나누었다.',
    apply: () => ({ healthDelta: 10, repDelta: { virtue: 2 } }),
  },
  {
    id: 'mn_rs_5', activity: 'REST', tone: 'NORMAL',
    text: '쉬는 틈틈이 옛 병서를 넘기며 마음을 다스렸다.',
    apply: () => ({ statsDelta: { ins: 1 } }),
  },
  {
    id: 'mn_rs_6', activity: 'REST', tone: 'NORMAL',
    text: '돌아가신 스승의 얼굴이 꿈에 나타나 초심을 되새겼다.',
    apply: () => ({ repDelta: { ascetic: 3 } }),
  },

  // 9. 타류 대련 (6종)
  {
    id: 'mn_sp_1', activity: 'SPAR', tone: 'GOOD',
    text: '이웃 도장 사범과의 교류에서 기세를 압도했다!',
    apply: (_s, sh) => ({ fameDelta: 8, skillExpBonus: Math.round(35 * sh) }),
  },
  {
    id: 'mn_sp_2', activity: 'SPAR', tone: 'GOOD',
    text: '상대의 변칙 발놀림에서 새로운 수비 요령을 터득했다.',
    apply: () => ({ statsDelta: { ins: 2 } }),
  },
  {
    id: 'mn_sp_3', activity: 'SPAR', tone: 'GOOD',
    text: '대련 후 함께 술잔을 나누며 강호 인맥을 넓혔다.',
    apply: () => ({ repDelta: { virtue: 3 }, fameDelta: 5 }),
  },
  {
    id: 'mn_sp_4', activity: 'SPAR', tone: 'GOOD',
    text: '구경꾼들이 박수를 치며 도장 이름을 연호했다.',
    apply: () => ({ fameDelta: 10 }),
  },
  {
    id: 'mn_sp_5', activity: 'SPAR', tone: 'WARN',
    text: '목검에 정강이를 세게 맞아 시퍼런 멍이 들었다.',
    apply: () => ({ healthDelta: -4 }),
  },
  {
    id: 'mn_sp_6', activity: 'SPAR', tone: 'NORMAL',
    text: '강한 상대를 만나 승부욕이 불타올랐다.',
    apply: () => ({ statsDelta: { str: 1, wil: 1 } }),
  },

  // 10. 계절 공통 일상 (21종)
  { id: 'mn_se_sp1', season: 'SPRING', tone: 'GOOD', text: '마당 담벼락에 꽃이 만발해 행인들이 도장을 기웃거린다.', apply: () => ({ fameDelta: 4 }) },
  { id: 'mn_se_sp2', season: 'SPRING', tone: 'NORMAL', text: '장터 씨름판을 구경하며 하체 중심 잡는 법을 눈여겨봤다.', apply: () => ({ statsDelta: { str: 1 } }) },
  { id: 'mn_se_sp3', season: 'SPRING', tone: 'GOOD', text: '처마 밑에 제비가 둥지를 틀었다. 길한 징조다.', apply: () => ({ healthDelta: 3 }) },
  { id: 'mn_se_sp4', season: 'SPRING', tone: 'NORMAL', text: '봄비가 그친 뒤 마당 배수로를 정비했다.', apply: () => ({ statsDelta: { vit: 1 } }) },
  { id: 'mn_se_sp5', season: 'SPRING', tone: 'WARN', text: '변덕스러운 꽃샘추위에 가벼운 감기가 스쳤다.', apply: () => ({ healthDelta: -3 }) },

  { id: 'mn_se_su1', season: 'SUMMER', tone: 'GOOD', text: '시원한 소나기가 마당의 먼지를 깨끗이 씻어 냈다.', apply: () => ({ healthDelta: 3 }) },
  { id: 'mn_se_su2', season: 'SUMMER', tone: 'WARN', text: '찌는 듯한 무더위에 땀을 너무 많이 쏟았다.', apply: () => ({ healthDelta: -4 }) },
  { id: 'mn_se_su3', season: 'SUMMER', tone: 'GOOD', text: '매미 소리 요란한 밤, 달빛 아래 칼을 휘두르며 감각을 익혔다.', apply: () => ({ skillExpBonus: 20 }) },
  { id: 'mn_se_su4', season: 'SUMMER', tone: 'GOOD', text: '우물물에 띄운 수박을 제자들과 나누어 먹었다.', apply: () => ({ loyaltyDelta: 4 }) },
  { id: 'mn_se_su5', season: 'SUMMER', condition: (s) => s.facilities.yard < 4, tone: 'WARN', text: '장맛비에 지붕 일부가 새어 서둘러 보수했다.', apply: () => ({ moneyDelta: -6 }) },

  { id: 'mn_se_au1', season: 'AUTUMN', tone: 'GOOD', text: '이웃 농가에서 풍년 감사 떡을 보내왔다.', apply: () => ({ healthDelta: 4, repDelta: { virtue: 2 } }) },
  { id: 'mn_se_au2', season: 'AUTUMN', tone: 'GOOD', text: '청명한 가을 하늘 아래 기합이 한층 맑게 울린다.', apply: () => ({ skillExpBonus: 24 }) },
  { id: 'mn_se_au3', season: 'AUTUMN', tone: 'NORMAL', text: '마당 가득 쌓인 낙엽을 쓸며 하체 보법을 연습했다.', apply: () => ({ statsDelta: { agi: 1 } }) },
  { id: 'mn_se_au4', season: 'AUTUMN', tone: 'GOOD', text: '가을 장터에서 남는 목검과 약초를 제값에 팔았다.', apply: () => ({ moneyDelta: 16, repDelta: { commerce: 2 } }) },
  { id: 'mn_se_au5', season: 'AUTUMN', tone: 'NORMAL', text: '남쪽으로 날아가는 기러기 떼를 보며 세월을 되돌아봤다.', apply: () => ({ statsDelta: { wil: 1 } }) },

  { id: 'mn_se_wi1', season: 'WINTER', tone: 'GOOD', text: '폭설로 쌓인 마당 눈을 제자들과 함께 치우며 단련했다.', apply: () => ({ statsDelta: { vit: 1 }, loyaltyDelta: 3 }) },
  { id: 'mn_se_wi2', season: 'WINTER', tone: 'GOOD', text: '화롯불에 군밤을 구워 먹으며 도장 이야기를 나누었다.', apply: () => ({ loyaltyDelta: 4, healthDelta: 2 }) },
  { id: 'mn_se_wi3', season: 'WINTER', tone: 'NORMAL', text: '꽁꽁 언 우물 얼음을 도끼로 깨며 팔힘을 썼다.', apply: () => ({ statsDelta: { str: 1 } }) },
  { id: 'mn_se_wi4', season: 'WINTER', condition: (s) => s.age >= 50, tone: 'WARN', text: '매서운 겨울바람에 늙은 무릎과 어깨가 시큰거린다.', apply: () => ({ healthDelta: -4 }) },
  { id: 'mn_se_wi5', season: 'WINTER', tone: 'GOOD', text: '눈 쌓인 고요한 밤, 깊은 묵상으로 통찰이 맑아졌다.', apply: () => ({ statsDelta: { ins: 2, qi: 1 } }) },
  { id: 'mn_se_wi6', season: 'WINTER', tone: 'GOOD', text: '새해를 앞두고 이웃 주민들이 도장에 인사를 왔다.', apply: () => ({ fameDelta: 5, repDelta: { virtue: 2 } }) },

  // 11. 중년 · 원로 · 천하제일 우승자 경력 맞춤 일상 (6종)
  {
    id: 'mn_vet_1', activity: 'TRAIN', condition: (s) => (s.flags.tournamentWins || 0) >= 1, tone: 'GOOD',
    text: '천하제일 우승자의 검기를 엿보려 타지 무인들이 담장 너머로 숨죽여 지켜본다.',
    apply: (_s, sh) => ({ fameDelta: 8, skillExpBonus: Math.round(28 * sh) }),
  },
  {
    id: 'mn_vet_2', activity: 'TEACH', condition: (s) => s.age >= 50 && s.disciples.some((d) => !d.dead), tone: 'GOOD',
    text: '백발이 되어도 흐트러지지 않는 자세에 문하생들이 깊이 고개를 숙였다.',
    apply: () => ({ loyaltyDelta: 7, fameDelta: 6 }),
  },
  {
    id: 'mn_vet_3', activity: 'MIND', condition: (s) => s.age >= 55, tone: 'GOOD',
    text: '지난 수십 년의 승부와 인연이 잔잔히 떠오르며 마음의 티끌이 사라졌다.',
    apply: () => ({ statsDelta: { ins: 2, wil: 2 }, healthDelta: 3 }),
  },
  {
    id: 'mn_vet_4', activity: 'SPAR', condition: (s) => (s.flags.tournamentWins || 0) >= 1, tone: 'GOOD',
    text: '대련을 청해 온 타류 사범이 일합 만에 검을 거두고 정중히 예를 표했다.',
    apply: (_s, sh) => ({ fameDelta: 10, skillExpBonus: Math.round(30 * sh) }),
  },
  {
    id: 'mn_vet_5', activity: 'REST', condition: (s) => s.age >= 55, tone: 'NORMAL',
    text: '툇마루에 앉아 마당에서 땀 흘리는 제자들을 바라보며 잔잔한 미소를 지었다.',
    apply: () => ({ healthDelta: 8, loyaltyDelta: 3 }),
  },
  {
    id: 'mn_vet_6', activity: 'TRAIN', condition: (s) => s.age >= 35 && s.age < 55, tone: 'GOOD',
    text: '젊은 시절의 객기는 빠지고, 한 칼 한 칼에 중년의 노련한 무게가 실렸다.',
    apply: (_s, sh) => ({ statsDelta: { ins: 1, wil: 1 }, skillExpBonus: Math.round(34 * sh) }),
  },
];

export function pickMinorEvent(
  state: GameState,
  activity?: ScheduleActivityId
): MinorEventDef | null {
  const candidates = MINOR_EVENTS.filter((e) => {
    if (activity && e.activity !== activity) return false;
    if (!activity && e.season !== state.season) return false;
    if (e.condition && !e.condition(state)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  // 아직 안 본 이벤트를 우선 가중치
  const seen = new Set(state.flags.minorEventIdsSeen);
  const unseen = candidates.filter((c) => !seen.has(c.id));
  const pool = unseen.length > 0 && Math.random() < 0.72 ? unseen : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}
