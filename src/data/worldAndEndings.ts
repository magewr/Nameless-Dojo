import { CountryId, GameState, ReputationAxes, RivalState, Season, Spouse } from '../types/game';
import { josa } from '../utils/korean';
import { buildChronicle, ChronicleEntry } from './chronicleBuilder';
import { extractLineageFacts } from './lineageFacts';

export interface CountryMeta {
  id: CountryId;
  name: string;
  eraLabel: string;
  currency: string;
  bonusText: string;
  atmosphere: string;
  accentColor: string;
  prologueTitle: string;
  prologueParagraphs: string[];
  masterQuote: string;
  heroMonologue: string;
  discipleNames: string[];
  childNames: string[];
  rivalTemplate: Omit<RivalState, 'age'>;
  spouses: Omit<Spouse, 'age' | 'marriedYear' | 'alive'>[];
}

export const COUNTRIES: Record<CountryId, CountryMeta> = {
  KOREA: {
    id: 'KOREA',
    name: '조선 (朝鮮)',
    eraLabel: '영조 26년 (1750년)',
    currency: '냥',
    bonusText: '정신력(WIL) +2 · 명상/기공 효율↑ · 고대 비급 출현율↑',
    atmosphere: '초가와 흙마당에서 시작해 기와 무관으로 부흥하는 선비와 무인의 나라',
    accentColor: '#2c4c6e',
    prologueTitle: '빗물 새는 처마 밑에서',
    prologueParagraphs: [
      '아버지는 평생 큰소리 한 번 못 쳐 본 사람이었다. 남들이 한성 무과에 붙어 관복을 입을 때, 아버지는 읍내 변두리에서 이름조차 없는 낡은 도장을 지켰다. 가르치는 거라곤 가로로 베는 법 하나, 세로로 내리치는 법 하나뿐이었다.',
      '겨울을 넘기지 못할 거라던 의원의 말대로, 아버지는 꽃샘추위가 가시던 새벽에 눈을 감았다. 장례를 치르고 나니 남은 것은 밀린 쌀값 스무 냥, 비가 줄줄 새는 연무장, 그리고 벽에 걸린 낡은 목검 두 자루뿐이었다.',
    ],
    masterQuote: '“……그래도 베는 법 두 개는 잊지 마라. 가로로 한 번, 세로로 한 번. 남들은 비웃어도…… 그 두 번을 평생 똑바로 긋는 놈은 세상에 드물단다.”',
    heroMonologue: '“횡베기 하나, 종베기 하나. 여기서 끝낼 수는 없지. 이름이 없다면…… 내가 만들면 그만이다.”',
    discipleNames: ['김철수', '박진호', '최연화', '이강산', '정하늘', '한도윤', '윤소희', '강태풍', '서민재', '조은별', '배무영', '송지우'],
    childNames: ['이서진', '이하람', '이도겸', '이연서'],
    rivalTemplate: {
      id: 'rival_kr',
      name: '윤서진',
      title: '몰락 무반가의 냉철한 검객',
      act: 0,
      winsAgainstPlayer: 0,
      lossesAgainstPlayer: 0,
      friendship: 10,
      alive: true,
    },
    spouses: [
      { id: 'sp_kr_1', name: '허연', gender: 'FEMALE', occupation: '동네 의녀', bonusType: 'CLINIC', bonusDesc: '도장 전원 건강 회복 +25%, 역병 피해 경감' },
      { id: 'sp_kr_2', name: '정해', gender: 'FEMALE', occupation: '보부상 서기', bonusType: 'COMMERCE', bonusDesc: '월사금·의뢰 수익 +25%, 만물객 10% 할인' },
      { id: 'sp_kr_3', name: '강무', gender: 'MALE', occupation: '떠돌이 무인', bonusType: 'COMBAT', bonusDesc: '제자 수련 효율 +20%, 도장 수비력↑' },
      { id: 'sp_kr_4', name: '이서윤', gender: 'FEMALE', occupation: '몰락 양반 여식', bonusType: 'SCHOLAR', bonusDesc: '서적 연구 속도↑, 노년 유파 전서 집필 보정' },
      { id: 'sp_kr_5', name: '클라라', gender: 'FEMALE', occupation: '표류 이방인 통역', bonusType: 'WESTERN', bonusDesc: '서양·이계 금서 연구 효율 대폭 상승' },
      { id: 'sp_kr_6', name: '윤재현', gender: 'MALE', occupation: '동네 의원', bonusType: 'CLINIC', bonusDesc: '도장 전원 건강 회복 +25%, 역병·산후열 경감' },
      { id: 'sp_kr_7', name: '한석진', gender: 'MALE', occupation: '낙방 선비', bonusType: 'SCHOLAR', bonusDesc: '서적 연구 속도↑, 노년 유파 전서 집필 보정' },
    ],
  },
  CHINA: {
    id: 'CHINA',
    name: '청나라 (大淸)',
    eraLabel: '건륭 15년 (1750년)',
    currency: '은자',
    bonusText: '문하생 유입↑ · 상업/표국 수익 +15% · 동서양 서적 다양성↑',
    atmosphere: '붉은 기둥과 현판이 즐비한 강건성세 강남의 표국과 강호 무관',
    accentColor: '#8e2a25',
    prologueTitle: '벗겨진 현판 아래서',
    prologueParagraphs: [
      '장터 건너편의 대무관은 매일 아침 수십 명의 기합 소리로 땅이 울렸다. 반면 어머니가 홀로 지켜 온 이 작은 마당에는 잡초만 무릎까지 자랐다. 강호에 내세울 문파 이름도, 대단한 비급도 없이 그저 횡베기와 종베기 두 초식이 전부였다.',
      '역병이 성안을 휩쓸고 지나간 뒤, 어머니는 열흘을 앓다 끝내 일어나지 못했다. 대문 위 글씨조차 다 바랜 빈 현판 아래, 녹슨 유엽도 한 자루와 빚 스무 은자가 남겨졌다.',
    ],
    masterQuote: '“칼을 놓지 못하겠거든…… 남의 초식을 부끄러워하지 말고 훔쳐다 네 것으로 만들거라. 살아남는 무술이 곧 정통이야.”',
    heroMonologue: '“이 빈 현판에 언젠가 중원 천하가 기억할 이름을 새겨 넣겠다.”',
    discipleNames: ['진소룡', '임청하', '왕대산', '소옥란', '장무기', '곽정우', '황영아', '조자룡', '백운비', '매초풍', '유비홍', '당소월'],
    childNames: ['진천명', '진설화', '진무극', '진청운'],
    rivalTemplate: {
      id: 'rival_cn',
      name: '심무명',
      title: '강남 명문 표국의 천재 권사',
      act: 0,
      winsAgainstPlayer: 0,
      lossesAgainstPlayer: 0,
      friendship: 15,
      alive: true,
    },
    spouses: [
      { id: 'sp_cn_1', name: '린수', gender: 'FEMALE', occupation: '강남 약방 의녀', bonusType: 'CLINIC', bonusDesc: '도장 전원 건강 회복 +25%, 역병 피해 경감' },
      { id: 'sp_cn_2', name: '쑤메이', gender: 'FEMALE', occupation: '광저우 상단 서기', bonusType: 'COMMERCE', bonusDesc: '월사금·의뢰 수익 +25%, 만물객 10% 할인' },
      { id: 'sp_cn_3', name: '진영', gender: 'MALE', occupation: '강호 표사', bonusType: 'COMBAT', bonusDesc: '제자 수련 효율 +20%, 도장 수비력↑' },
      { id: 'sp_cn_4', name: '조운', gender: 'MALE', occupation: '한림원 낙방 서생', bonusType: 'SCHOLAR', bonusDesc: '서적 연구 속도↑, 노년 유파 전서 집필 보정' },
      { id: 'sp_cn_5', name: '헨리', gender: 'MALE', occupation: '광저우 유럽 통역관', bonusType: 'WESTERN', bonusDesc: '서양·이계 금서 연구 효율 대폭 상승' },
      { id: 'sp_cn_6', name: '백연화', gender: 'FEMALE', occupation: '강남 여협객', bonusType: 'COMBAT', bonusDesc: '제자 수련 효율 +20%, 도장 수비력↑' },
    ],
  },
  JAPAN: {
    id: 'JAPAN',
    name: '일본 (江戶)',
    eraLabel: '간엔 3년 (1750년)',
    currency: '료',
    bonusText: '도장깨기 명성 +20% · 검술 연마 효율 +10% · 서양/이계 서적 확률↑',
    atmosphere: '죽도와 목검이 부딪치는 에도 중기, 타류시합과 유파 생존 경쟁의 시대',
    accentColor: '#374736',
    prologueTitle: '썩은 삼나무 마루 위에서',
    prologueParagraphs: [
      '에도의 명문 도장들이 죽도와 호구로 문하생을 쓸어 담을 때, 이 작은 목조 도장엔 파리만 날렸다. 아버지가 물려받은 검술은 유파 이름조차 실전된 무명의 잡검. 가로 베기와 세로 내려베기, 단 두 동작이 전부였다.',
      '초봄의 열병이 아버지의 목숨을 앗아간 다음 날, 집주인은 밀린 세 스무 료를 독촉하며 당장 간판부터 떼어 가려 했다.',
    ],
    masterQuote: '“검이란 본디 단순한 것이다. 허나 세상은 화려한 이름을 원하더구나. 아비처럼 버티지만 말고…… 세상의 모든 검을 먹어 치워 네 유파를 세우거라.”',
    heroMonologue: '“유파도 없고, 제자도 없고, 돈도 없다. 남은 건 이 두 번의 칼질뿐. ……밑바닥에서부터 다시 쌓아 올리지.”',
    discipleNames: ['사토 켄지', '타카하시 유키', '야마다 신지', '미야모토 렌', '아오이 카나', '후지타 고로', '나카무라 하루', '이토 다이스케', '사쿠라 미오', '와타나베 료'],
    childNames: ['타케시', '하루카', '료타', '유메'],
    rivalTemplate: {
      id: 'rival_jp',
      name: '쿠로다 겐지',
      title: '에도 명문 검술 도장의 적자',
      act: 0,
      winsAgainstPlayer: 0,
      lossesAgainstPlayer: 0,
      friendship: 5,
      alive: true,
    },
    spouses: [
      { id: 'sp_jp_1', name: '카에데', gender: 'FEMALE', occupation: '에도 난학 의녀', bonusType: 'CLINIC', bonusDesc: '도장 전원 건강 회복 +25%, 역병 피해 경감' },
      { id: 'sp_jp_2', name: '쇼타로', gender: 'MALE', occupation: '오사카 쌀 상인', bonusType: 'COMMERCE', bonusDesc: '월사금·의뢰 수익 +25%, 만물객 10% 할인' },
      { id: 'sp_jp_3', name: '료마', gender: 'MALE', occupation: '방랑 무사', bonusType: 'COMBAT', bonusDesc: '제자 수련 효율 +20%, 도장 수비력↑' },
      { id: 'sp_jp_4', name: '아야메', gender: 'FEMALE', occupation: '몰락 공가 여식', bonusType: 'SCHOLAR', bonusDesc: '서적 연구 속도↑, 노년 유파 전서 집필 보정' },
      { id: 'sp_jp_5', name: '빌럼', gender: 'MALE', occupation: '데지마 네덜란드 통역', bonusType: 'WESTERN', bonusDesc: '서양·이계 금서 연구 효율 대폭 상승' },
      { id: 'sp_jp_6', name: '하루카', gender: 'FEMALE', occupation: '교토 상단 서기', bonusType: 'COMMERCE', bonusDesc: '월사금·의뢰 수익 +25%, 만물객 10% 할인' },
    ],
  },
};

export const SEASON_META: Record<Season, { label: string; next: Season; flavor: string; bonusHint: string }> = {
  SPRING: {
    label: '봄',
    next: 'SUMMER',
    flavor: '담벼락 밑에 새싹이 올라왔다. 새 얼굴들이 도장 대문을 기웃거릴 철이다.',
    bonusHint: '봄: 문하생 지원 증가 · 인연 이벤트↑',
  },
  SUMMER: {
    label: '여름',
    next: 'AUTUMN',
    flavor: '소나기 뒤 마당에서 뜨거운 흙김이 피어오른다. 땀을 쏟는 자만이 여름을 제 것으로 만든다.',
    bonusHint: '여름: 신체 수련 효율 +15% · 도장깨기 활발',
  },
  AUTUMN: {
    label: '가을',
    next: 'WINTER',
    flavor: '서늘한 아침 공기가 폐부 깊숙이 차오른다. 수확과 비무의 계절이다.',
    bonusHint: '가을: 의뢰·월사금 보너스 · 무술 대회 시즌',
  },
  WINTER: {
    label: '겨울',
    next: 'SPRING',
    flavor: '우물물이 얼어붙은 겨울밤. 화롯가에 등불을 돋우고 낡은 비급을 펼치기 좋다.',
    bonusHint: '겨울: 서적 연구·조합 +20% · 노년 건강 체크',
  },
};

export function getLifeStage(age: number): { label: string; desc: string } {
  if (age < 20) return { label: '성장기', desc: '신체 자동 성장 · 높은 잠재력' };
  if (age < 35) return { label: '전성기', desc: '압도적 속도(AGI) · 신체 수련 효율↑' };
  if (age < 50) return { label: '완성기', desc: '신체·정신의 황금 균형 · 통찰 급상승' };
  if (age < 65) return { label: '노년기', desc: '몸은 느려지나 간파(INS)·위력(WIL/QI) 극대화' };
  return { label: '황혼기', desc: '겨울마다 수명 판정 · 후계자와 유산 정리' };
}

export function computeSectTitle(rep: ReputationAxes, fame: number): { title: string; rumor: string } {
  const entries: Array<{ key: keyof ReputationAxes; val: number }> = (
    [
      { key: 'virtue', val: rep.virtue },
      { key: 'ruthless', val: rep.ruthless },
      { key: 'commerce', val: rep.commerce },
      { key: 'ascetic', val: rep.ascetic },
      { key: 'arcane', val: rep.arcane },
    ] as Array<{ key: keyof ReputationAxes; val: number }>
  ).sort((a, b) => b.val - a.val);

  const top = entries[0];
  const second = entries[1];

  if (top.val < 35 && fame < 50) {
    return { title: '이름 없는 소도장', rumor: '아직 동네 사람들조차 이 도장이 뭘 가르치는지 잘 모른다.' };
  }

  // 복합 전설 이명 (상위 2축 모두 65+)
  if (top.val >= 65 && second.val >= 65) {
    const pair = [top.key, second.key].sort().join('+');
    if (pair === 'arcane+virtue') return { title: '구세신선문(救世神仙門)', rumor: '“하늘의 불꽃과 이적을 베풀어 백성을 지키는 살아있는 신선의 문파라더군!”' };
    if (pair === 'arcane+ruthless') return { title: '재앙의 마도(魔道)', rumor: '“칼끝에서 불벼락이 쏟아지고 아무도 살려 보내지 않는 금단의 마굴이야…”' };
    if (pair === 'ascetic+virtue') return { title: '성현무림(聖賢武林)', rumor: '“덕과 무를 모두 갖춘 참된 사표. 당대 모든 무인의 귀감이 되는 도장이다.”' };
    if (pair === 'commerce+ruthless') return { title: '혈금용병단(血金傭兵團)', rumor: '“은자만 충분히 얹어 주면 천하 누구의 목이든 따 온다는 공포의 무관이지.”' };
    if (pair === 'arcane+ascetic') return { title: '진리의 마도탑', rumor: '“인간의 한계를 넘어 천지의 이치를 칼로 베어 내려는 구도자들의 성지라네.”' };
    if (pair === 'commerce+virtue') return { title: '태평천하 표국', rumor: '“그 도장 깃발만 꽂고 가면 도적도 고개를 숙이고 굶는 백성도 없어진다더군.”' };
  }

  // 단일 축 이명
  const tier = top.val >= 115 ? 3 : top.val >= 70 ? 2 : 1;
  switch (top.key) {
    case 'virtue':
      if (tier === 3) return { title: '활인검의 성지', rumor: '“사람을 죽이는 칼이 아니라 살리는 칼을 가르치는 천하제일 협객문이야.”' };
      if (tier === 2) return { title: '협객문(俠客門)', rumor: '“돈 없는 아이도 거두고 도적을 칼등으로 잡는다는 의로운 도장이라더군.”' };
      return { title: '선한 도장', rumor: '“요즘 그 도장주, 마음씨가 꽤 곱고 예의 바르다고 칭찬이 자자해.”' };
    case 'ruthless':
      if (tier === 3) return { title: '수라검파(修羅劍派)', rumor: '“그 대문을 넘는 순간 살아서 돌아올 생각은 마라. 피의 수라들이 사는 곳이다.”' };
      if (tier === 2) return { title: '피의 도장', rumor: '“도장깨기 갔던 고수가 팔이 부러져 실려 나왔다며? 살벌한 곳이야.”' };
      return { title: '험한 도장', rumor: '“실전만 고집하는 지독한 도장이래. 잘못 건드리지 않는 게 좋아.”' };
    case 'commerce':
      if (tier === 3) return { title: '천하제일 상무문', rumor: '“무술과 상업을 하나로 묶어 웬만한 왕실 창고보다 부유한 거대 문파라네.”' };
      if (tier === 2) return { title: '황금표국(黃金鏢局)', rumor: '“우리 상단 짐은 무조건 저 집 표사에게 맡겨야 안심이 된다니까.”' };
      return { title: '부유한 무관', rumor: '“허름하던 도장이 금세 기와를 올리고 장사 수완이 대단하더군.”' };
    case 'ascetic':
      if (tier === 3) return { title: '검선의 비경(劍仙秘境)', rumor: '“명예도 돈도 마다하고 오직 칼 한 자루의 끝을 파고든 전설의 성지야.”' };
      if (tier === 2) return { title: '무광(武狂)의 굴', rumor: '“밤낮없이 칼 휘두르는 소리만 들리는 지독한 수련광들의 도장이래.”' };
      return { title: '외골수 도장', rumor: '“세상일엔 관심 없고 오직 수련만 하는 묘한 고집이 있는 도장이야.”' };
    case 'arcane':
      if (tier === 3) return { title: '신선문(神仙門)', rumor: '“사람이 불과 번개를 부린다니… 필시 천상의 비술을 전수하는 신선문이야!”' };
      if (tier === 2) return { title: '요괴 도장', rumor: '“어젯밤 저 도장 마당에서 시뻘건 불기둥이 솟았다는데, 요괴 소굴 아닌가?”' };
      return { title: '수상한 도장', rumor: '“저 도장에서는 기이한 서양 책과 정체 모를 도술을 연구한다며?”' };
  }
}

export type { ChronicleCause, ChronicleEntry } from './chronicleBuilder';

export interface EndingReportData {
  endingTitle: string;
  endingSubtitle: string;
  routeTag: string; // 이 연대기가 무엇으로 조립되었는지 (세평 · 규모 · 계승)
  funeralParagraph: string;
  chronicle: ChronicleEntry[];
  heirSummary: string;
  rivalSummary: string;
}

// 사후 연대기 생성.
// 일생에서 후대에 남을 사실을 뽑고(extractLineageFacts), 그 사실로 연대기를 조립한다(buildChronicle).
// 난수를 쓰지 않으므로 같은 일생이면 언제 다시 열어도 같은 연대기가 나온다.
export function generatePostMortemEnding(state: GameState): EndingReportData {
  const facts = extractLineageFacts(state);
  const { deathYear, sect } = facts;
  const aliveCount = facts.aliveDiscipleCount;
  const lastWeapon = facts.heirloom || facts.carriedWeapon;
  const weaponName = lastWeapon?.customName || lastWeapon?.name;

  // 1. 장례식 문단
  let funeralParagraph = '';
  if (facts.deathKind === 'DUEL') {
    funeralParagraph = `${deathYear}년, ${state.age}세의 나이로 진검결투 끝에 쓰러졌다는 부고는 벼락처럼 퍼졌다. ${
      aliveCount > 0
        ? `제자들은 피 묻은 가보 「${weaponName || '낡은 칼'}」을 부여잡고 통곡했다.`
        : '그러나 아직 뿌리를 내리지 못한 도장은 주인을 잃자 한 계절을 버티지 못하고 문을 닫았다.'
    }`;
  } else if (facts.deathKind === 'FORBIDDEN') {
    funeralParagraph = `${deathYear}년, 인간의 한계를 넘어선 금기 초식을 다룬 대가가 찾아왔다. 장례식장에는 깊은 애도와 함께 기묘한 경외감이 감돌았고, ${
      aliveCount > 0 ? '제자들은 창시자가 마지막까지 남긴 금기 비급을 검은 함에 봉인했다.' : '남겨진 금기 비급은 누구의 손에도 넘어가지 못한 채 검은 함 속에 잠들었다.'
    }`;
  } else if (facts.scale === 'GRAND') {
    funeralParagraph = `${deathYear}년, 1750년 비가 새던 낡은 마당에서 횡베기와 종베기만으로 시작한 ${josa(state.name, '이가')}(향년 ${state.age}세) 영면에 들었다. 전국 각지에서 도복을 입은 문하생과 옛 제자 수천 명이 운집해 국장에 버금가는 장례가 치러졌다.`;
  } else if (facts.scale === 'MEDIUM') {
    funeralParagraph = `${deathYear}년, ${josa(state.name, '이가')}(향년 ${state.age}세) 가족과 제자들이 지켜보는 가운데 조용히 눈을 감았다. 낡은 현판에서 시작된 【${sect}】${josa(sect, '은는').slice(sect.length)} 이제 고을 누구나 아는 어엿한 문파로 자리 잡아 있었다.`;
  } else if (facts.succession !== 'NONE') {
    funeralParagraph = `${deathYear}년, ${josa(state.name, '이가')}(향년 ${state.age}세) 몇 안 되는 제자들이 지켜보는 가운데 눈을 감았다. 도장은 끝내 크게 일어서지 못했으나, 마당에는 스승의 걸음을 따라 디딘 발자국이 남아 있었다.`;
  } else {
    funeralParagraph = `${deathYear}년, ${josa(state.name, '은는')}(향년 ${state.age}세) 다 이루지 못한 꿈을 품고 눈을 감았다. 빚과 세월을 견디지 못한 도장 마당엔 다시 잡초가 자랐고, 서툰 글씨로 적은 수련 일지 한 권만이 대들보 틈에 남았다.`;
  }

  // 2. 계승 요약
  let heirSummary = '후계자를 세우지 못해 유파의 맥은 흩어졌다.';
  if (facts.heir) {
    const degraded = facts.succession === 'DEGRADED';
    heirSummary = facts.heir.isChild
      ? `친자녀 ${josa(facts.heir.name, '이가')} 가보 「${weaponName || '검'}」을 물려받아 2대 도장주에 올랐다.${degraded ? ' 다만 창시자의 극의를 온전히 감당하지 못해 일부 초식이 열화되었다.' : ' 혈통과 무술이 함께 이어진 무가(武家)의 탄생이었다.'}`
      : `수제자 ${josa(facts.heir.name, '이가')} 2대 종주로 추대되어 【${sect}】의 정통을 이어받았다.${
          degraded
            ? ' 다만 창시자의 극의를 온전히 감당하지 못해 일부 초식이 열화되었다.'
            : facts.succession === 'FLOURISH'
            ? ' 문하의 천재 제자들이 독자적 변이 초식을 꽃피우며 유파는 더욱 풍성해졌다.'
            : ''
        }`;
  } else if (aliveCount > 0) {
    const firstAlive = state.disciples.find((d) => !d.dead);
    heirSummary = `정식 후계자 지명은 없었으나, ${firstAlive?.name || '제자'} 등 남은 제자 ${aliveCount}명이 스승의 유지를 이어 각지에서 도장을 열었다.`;
  } else if (facts.succession === 'SCATTERED') {
    heirSummary = '도장에 남은 제자는 없었으나, 일찍이 하산해 독립한 옛 제자들이 스승에게 배운 것을 저마다의 자리에서 이어 갔다.';
  }

  // 3. 라이벌 요약
  const rivalName = facts.rival.name;
  const record = `(전적 ${facts.rival.wins}승 ${facts.rival.losses}패)`;
  let rivalSummary = `숙명적 라이벌 ${josa(rivalName, '과와')}는 끝내 깊은 인연을 맺지 못한 채 엇갈렸다.`;
  if (facts.rival.met) {
    if (facts.rival.farewell === 'DRINK') {
      rivalSummary = `평생의 숙적 ${josa(rivalName, '과와')} 황혼의 겨울밤 술잔을 나누며 화해했다. 후대 역사는 이들을 '한 시대를 양분한 두 거목'으로 기록했다. ${record}`;
    } else if (facts.rival.farewell === 'DUEL') {
      rivalSummary = `백발이 되어 ${josa(rivalName, '과와')} 펼친 최후의 한 합은 무림사에 영원히 남을 명승부로 회자된다. ${record}`;
    } else {
      rivalSummary = `평생의 라이벌 ${josa(rivalName, '과와')} 수차례 검을 맞대며 서로를 단련했다. ${record}`;
    }
  }

  // 4. 사후 200년 연대기
  const built = buildChronicle(facts);

  return {
    endingTitle: built.endingTitle,
    endingSubtitle: facts.succession === 'NONE' ? `${sect} · ${state.currentTitle}` : `${sect} · 세간의 최종 이명 「${state.currentTitle}」`,
    routeTag: built.routeTag,
    funeralParagraph,
    chronicle: built.chronicle,
    heirSummary,
    rivalSummary,
  };
}
