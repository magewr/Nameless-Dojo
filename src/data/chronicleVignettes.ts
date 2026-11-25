import { LineageFacts, seededUnit } from './lineageFacts';

// 사후 연대기의 "개인 삽화".
// 뼈대 5장면이 나라와 세평이 정하는 큰 흐름이라면, 삽화는 이번 일생에만 있었던 일이 후대에 남긴 자국이다.
// 조건이 맞는 것 가운데 최대 3개가 뼈대 사이에 끼워진다.

export type VignettePosition = 'EARLY' | 'MID' | 'LATE'; // 계승 직후 / 19세기 말 / 현대

export interface VignetteDef {
  id: string;
  tier: 1 | 2 | 3; // 1 = 가장 개인적이고 드문 사건 (우선 채택)
  position: VignettePosition;
  image: string | ((f: LineageFacts) => string);
  when: (f: LineageFacts) => boolean;
  headline: string | ((f: LineageFacts) => string);
  body: string | ((f: LineageFacts) => string);
  tokens?: (f: LineageFacts) => Record<string, string>;
  yearLabel?: (f: LineageFacts) => string;
  causeKey?: string; // 생전 사건 기록(LifeMilestone.key)의 접두어
  causeFallback?: string; // 기록이 없는 구버전 세이브에서 연도 없이 보여 줄 원인
  standalone?: boolean; // 유파가 끊긴(단절) 일생에서도 성립하는 이야기인가
}

const IMG = (name: string) => `/assets/px_chr_v_${name}.jpg`;
const yearIn = (f: LineageFacts, salt: string, from: number, to: number) => Math.round(from + seededUnit(f.seed, salt) * (to - from));

export const VIGNETTES: VignetteDef[] = [
  // ----------------------------------------------------------------- 라이벌
  {
    id: 'rival_drink',
    tier: 1,
    position: 'MID',
    image: IMG('rival_drink'),
    when: (f) => f.rival.farewell === 'DRINK',
    headline: '두 가문의 겨울 연무',
    body: '창시자가 숙적 {RIVAL|과와} 술잔을 나눈 그 겨울밤을 기려, 두 유파의 후손들은 해마다 첫눈이 내린 뒤 한자리에 모여 연무를 올린다. 승패는 가리지 않는다. 끝나면 두 종가가 마주 앉아 술 한 잔씩을 비우는데, 잔은 두 사람이 그 밤에 쓰던 것이라 전한다.',
    causeKey: 'RIVAL_DRINK',
    causeFallback: '황혼의 겨울밤, 숙적과 칼 대신 술잔을 나눈 선택',
  },
  {
    id: 'rival_duel',
    tier: 1,
    position: 'MID',
    image: IMG('rival_duel'),
    when: (f) => f.rival.farewell === 'DUEL',
    headline: '끝나지 않은 한 합',
    body: '백발의 두 검객이 겨룬 최후의 한 합은 목격자의 입에서 입으로 전해지다 노래와 연극이 되고, 마침내 영화가 되었다. 작품마다 이긴 쪽이 다르다. 창시자와 {RIVAL}의 후손들은 어느 결말이 사실이냐고 묻는 이들에게 똑같이 답한다. 그것을 가리려던 싸움이 아니었다고.',
    causeKey: 'RIVAL_DUEL',
    causeFallback: '황혼에 숙적과 겨룬 최후의 한 합',
  },

  // ----------------------------------------------------------------- 제자
  {
    id: 'betrayer_branch',
    tier: 1,
    position: 'EARLY',
    image: IMG('betrayer'),
    when: (f) => !!f.betrayer,
    headline: '등을 돌린 제자의 간판',
    body: (f) =>
      '스승에게 등을 돌리고 떠났던 {NAME|은는} 이웃 고을에 제 도장을 세우고 {GSKILL|을를} 제 이름으로 가르쳤다. 두 도장의 제자들은 장터에서 마주칠 때마다 주먹다짐을 벌였다. ' +
      (f.axis === 'VIRTUE' || f.axis === 'ASCETIC'
        ? '화해는 손자 대에 이르러서였다. 두 집안은 지금도 한 해씩 번갈아 상대 창시자의 제사에 술을 올린다.'
        : '두 계보는 끝내 화해하지 않았고, 오늘날에도 서로를 방계라 부른다.'),
    tokens: (f) => ({ NAME: f.betrayer!.name, GSKILL: `「${f.betrayer!.topSkillName}」` }),
    causeKey: 'GRADUATE_RIVAL_BETRAYER',
    causeFallback: '마음이 떠난 제자를 그대로 하산시킨 일',
  },
  {
    id: 'grandmaster_branch',
    tier: 2,
    position: 'MID',
    image: IMG('grandmaster'),
    when: (f) => !!f.grandmaster,
    headline: '스승보다 멀리 간 제자',
    body: '하산한 제자 {NAME|은는} 스승의 이름이 닿지 않는 먼 땅에서 일가를 이루었다. 그가 세운 도장은 본가와 따로 대를 이었으나, 정월이면 반드시 본가에 사람을 보내 {GSKILL}의 시범을 올리게 했다. 그 관습은 본가가 어려웠던 시절에도, 분가가 더 커진 뒤에도 끊기지 않았다.',
    tokens: (f) => ({ NAME: f.grandmaster!.name, GSKILL: `「${f.grandmaster!.topSkillName}」` }),
    causeKey: 'GRADUATE_GRANDMASTER',
    causeFallback: '아끼던 제자를 붙잡지 않고 세상으로 내보낸 일',
  },
  {
    id: 'mutation_school',
    tier: 2,
    position: 'EARLY',
    image: IMG('mutation'),
    when: (f) => !!f.mutator,
    headline: '스승의 칼에서 돋은 다른 가지',
    body: '제자 {NAME|이가} 스승의 초식을 비틀어 만든 {MSKILL|은는} 처음에는 이단 취급을 받았다. 그러나 한 세대가 지나자 그것을 배우러 오는 이가 본래의 초식을 배우러 오는 이보다 많아졌다. 유파의 족보는 이때부터 줄기가 둘로 그려진다.',
    tokens: (f) => ({ NAME: f.mutator!.name, MSKILL: `「${f.mutator!.skillName}」` }),
    causeKey: 'MUTATION',
    causeFallback: '천재 제자의 변이 초식을 문하에 그대로 둔 일',
  },
  {
    id: 'fallen_memorial',
    tier: 3,
    position: 'EARLY',
    image: IMG('memorial'),
    when: (f) => !!f.fallenDisciple,
    headline: '이름을 새긴 돌',
    body: '스승보다 먼저 간 제자 {NAME}의 이름은 연무장 뒤편의 작은 돌에 새겨졌다. 그 뒤로 {SECT|은는} 문하에서 목숨을 잃은 이가 나올 때마다 그 옆에 돌을 하나씩 세웠다. 새로 입문한 이가 맨 처음 하는 일은 그 돌들을 닦는 것이다.',
    tokens: (f) => ({ NAME: f.fallenDisciple! }),
    causeKey: 'DISCIPLE_DIED',
    causeFallback: '문하생을 먼저 떠나보낸 일',
  },
  {
    id: 'child_house',
    tier: 2,
    position: 'EARLY',
    image: IMG('family_rite'),
    when: (f) => !!f.heir?.isChild,
    headline: '무가(武家)의 족보',
    body: '혈육 {HEIR}에게로 이어진 {SECT|은는} 문파이기 전에 한 집안이 되었다. 족보의 이름 옆에는 벼슬 대신 그 사람이 평생 가장 깊이 익힌 초식의 이름이 적힌다. 대를 이을 자식이 칼에 뜻이 없던 때가 세 번 있었고, 그때마다 집안은 사위와 며느리, 양자에게 {SKILL|을를} 맡겼다.',
    causeKey: 'HEIR_NAMED',
    causeFallback: '친자식을 2대 종주로 세운 선택',
  },

  // ----------------------------------------------------------------- 인과 기억 (storyMemory)
  {
    id: 'orphan_school',
    tier: 1,
    position: 'EARLY',
    image: (f) => (f.country === 'KOREA' ? IMG('orphan_school_kr') : IMG('orphan_school')),
    when: (f) => f.memory.orphan === 'ACCEPTED',
    headline: '도장에 딸린 글방',
    body: '빗속의 고아를 거둔 뒤로 {SECT}에는 문 앞에 선 아이는 돌려보내지 않는다는 불문율이 생겼다. 후대 종주들은 연무장 한쪽에 글방을 내어 갈 곳 없는 아이들에게 글과 셈을 먼저 가르쳤다. 그 글방에서 자란 이들이 훗날 도장이 문 닫을 위기에 처할 때마다 가장 먼저 달려왔다.',
    causeKey: 'MEMORY_ORPHAN_ACCEPTED',
    causeFallback: '빗속에 떨던 고아를 도장에 거둔 선택',
  },
  {
    id: 'orphan_gate',
    tier: 1,
    position: 'EARLY',
    image: IMG('orphan_gate'),
    when: (f) => f.memory.orphan === 'REJECTED',
    headline: '대문 밖의 아이',
    body: '창시자가 빗속에 세워 두고 돌아섰던 아이는 살아남아 다른 고을의 이름난 무인이 되었다고 한다. 그의 문하는 대대로 {SECT}의 대문 앞을 지날 때 걸음을 멈추지 않는 것을 법도로 삼았다. 유파의 가훈집에는 창시자의 필체로 “그날 문을 열었어야 했다”는 한 줄이 남아 있다.',
    causeKey: 'MEMORY_ORPHAN_REJECTED',
    causeFallback: '빗속의 고아를 대문 밖에 두고 돌아선 선택',
  },
  {
    id: 'mother_roof',
    tier: 3,
    position: 'EARLY',
    image: IMG('roof'),
    when: (f) => f.memory.mother === 'HELPED',
    headline: '지붕을 고치러 오는 사람들',
    body: '병든 어머니를 업고 왔던 아이는 평생 그 일을 잊지 않았다. 그의 자손들은 장마가 지기 전이면 말없이 찾아와 도장의 지붕을 손보고 갔다. 까닭을 아는 이가 다 세상을 떠난 뒤에도 그 마을에서는 도장 지붕은 우리가 인다는 것이 그냥 당연한 일로 남았다.',
    causeKey: 'MEMORY_MOTHER_HELPED',
    causeFallback: '병든 어머니를 업고 온 아이를 도운 일',
  },
  {
    id: 'smith_forge',
    tier: 3,
    position: 'EARLY',
    image: IMG('forge'),
    when: (f) => f.memory.smith === 'WARM',
    headline: '칼을 벼리는 집',
    body: '창시자와 연을 맺은 읍내 대장간은 대를 이어 {SECT}의 칼을 벼렸다. 칼이 팔리지 않는 시대가 오자 대장간은 낫과 호미를 만들어 버텼으나, 유파의 새 종주가 찰 칼 한 자루만은 값을 받지 않고 지었다.',
    causeKey: 'MEMORY_SMITH_WARM',
    causeFallback: '읍내 대장장이와 맺은 따뜻한 인연',
  },

  // ----------------------------------------------------------------- 노년의 선택 (원로로서 남긴 것)
  {
    id: 'elder_epitaph',
    tier: 2,
    position: 'LATE',
    image: IMG('epitaph'),
    when: (f) => !!f.memory.epitaph,
    headline: '스스로 지은 묘비명',
    body: (f) =>
      `창시자의 무덤 앞 비석에는 생전에 스스로 지었다는 글귀가 새겨져 있다. ${f.memory.epitaph} 비석을 다시 세울 때마다 후손들은 글자 하나 바꾸지 않았고, 지금은 이 글귀를 외워 오는 것이 {SECT}의 입문 시험이 되었다.`,
    causeKey: 'EPITAPH',
    causeFallback: '여든 가까이 되어 스스로 묘비명을 지은 일',
    standalone: true,
  },
  {
    id: 'elder_abdication',
    tier: 2,
    position: 'EARLY',
    image: IMG('abdication'),
    when: (f) => f.memory.abdication === 'DONE' && !!f.heir,
    headline: '살아서 물려준 현판',
    body: '창시자는 숨이 붙어 있을 때 현판을 내려 {HEIR}에게 넘기고 스스로 원로의 자리로 물러났다. 그 뒤로 {SECT}의 종주는 대대로 살아서 자리를 물려주는 것을 법도로 삼았다. 물러난 원로는 마루에 앉아 새 종주의 첫 도전을 지켜보는데, 그 날만큼은 끝까지 아무 말도 하지 않는 것이 예법이다.',
    causeKey: 'ABDICATED',
    causeFallback: '살아 있을 때 후계자에게 종주의 자리를 물려준 선택',
  },
  {
    id: 'elder_last_disciple',
    tier: 2,
    position: 'EARLY',
    image: IMG('last_disciple'),
    when: (f) => !!f.memory.last_disciple && f.memory.last_disciple_result === 'BRILLIANT',
    headline: '관문제자(關門弟子)',
    body: '창시자가 예순을 넘겨 직접 거둔 마지막 제자는 스승이 세상을 떠난 뒤 {SECT}의 칼을 가장 멀리까지 가지고 갔다. 그 뒤로 유파의 종주들은 늙어서 마지막 제자 한 명을 따로 거두어 직접 가르치는 전통을 지켰다. 그 제자는 언제나 문하의 막내로 불린다. 나이가 들어도.',
    causeKey: 'LAST_DISCIPLE',
    causeFallback: '예순을 넘겨 관문제자를 직접 거둔 일',
  },
  {
    id: 'elder_open_books',
    tier: 2,
    position: 'MID',
    image: IMG('open_books'),
    when: (f) => f.memory.will === 'BOOKS',
    headline: '누구나 읽을 수 있는 비급',
    body: '창시자의 유언에 따라 {SECT}의 비급은 문하 밖에도 공개되었다. 고참들은 유파가 흩어질 것이라며 반대했지만, 그 비급을 베껴 읽은 이들이 저마다의 도장을 열면서 오히려 {SKILL|은는} 원래의 유파보다 훨씬 멀리 퍼졌다. 지금 그 초식을 쓰는 이들 대부분은 {SECT}의 이름을 모른다.',
    causeKey: 'WILL_WRITTEN',
    causeFallback: '유파의 비급을 세상에 공개하라는 유언',
    standalone: true,
  },
  {
    id: 'elder_school',
    tier: 3,
    position: 'MID',
    image: IMG('village_school'),
    when: (f) => f.memory.will === 'SCHOOL',
    headline: '도장 옆의 글방',
    body: '창시자가 유언으로 남긴 재물은 고을 아이들의 글방이 되었다. 글방은 도장보다 오래 살아남았다. 칼을 배우러 온 아이보다 글을 배우러 온 아이가 많았고, 그 아이들이 자라 도장이 어려울 때마다 쌀을 보냈다.',
    causeKey: 'WILL_WRITTEN',
    causeFallback: '재물을 고을 아이들의 글방에 남긴 유언',
    standalone: true,
  },
  {
    id: 'elder_memoir',
    tier: 3,
    position: 'LATE',
    image: IMG('memoir'),
    when: (f) => Number(f.memory.memoir || 0) >= 3,
    headline: '세 권의 회고록',
    body: '창시자가 말년에 남긴 세 권의 회고록은 대를 이어 필사되었다. 첫째 권은 빚 스무 냥 이야기로 시작한다. 연구자들은 셋째 권, 제자들의 이름이 끝없이 이어지는 대목을 가장 귀하게 여긴다. 그 이름들 가운데 몇은 다른 어떤 기록에도 남아 있지 않다.',
    causeKey: 'MEMOIR',
    causeFallback: '말년에 세 권의 회고록을 쓴 일',
    standalone: true,
  },

  // ----------------------------------------------------------------- 몸과 금기
  {
    id: 'awakening_legend',
    tier: 1,
    position: 'MID',
    image: IMG('awakening'),
    when: (f) => !!f.awakening,
    headline: (f) => (f.awakening === 'ONE_ARM_SAINT' ? '외팔 검성의 전설' : f.awakening === 'MIND_EYE' ? '눈먼 검객의 전설' : '물러서지 않는 노검객의 전설'),
    body: (f) =>
      f.awakening === 'ONE_ARM_SAINT'
        ? '한 팔을 잃고도 검을 놓지 않았던 창시자의 이야기는 유파보다 더 멀리 퍼졌다. 전쟁에서 팔다리를 잃고 돌아온 이들이 그 이야기를 듣고 도장을 찾아왔고, {SECT|은는} 그들을 위한 형(形)을 따로 만들어 가르쳤다. 그 형은 지금도 유파의 정식 교과에 들어 있다.'
        : f.awakening === 'MIND_EYE'
        ? '빛을 잃은 뒤 오히려 간파의 극에 닿았다는 창시자의 이야기는 유파보다 더 멀리 퍼졌다. {SECT|은는} 대대로 눈을 가리고 긋는 수련을 교과에 두었고, 앞을 보지 못하는 이를 문하에 받기를 꺼리지 않은 드문 도장이 되었다.'
        : '저는 다리로 한 걸음도 물러서지 않았다는 창시자의 이야기는 유파보다 더 멀리 퍼졌다. {SECT}에는 지금도 제자리에 서서 한 발도 떼지 않고 겨루는 대련법이 전한다. 몸이 성치 않은 이들이 그것을 배우러 먼 길을 찾아온다.',
    causeKey: 'AWAKENING_',
    causeFallback: '몸의 상처를 딛고 오른 각성의 경지',
  },
  {
    id: 'forbidden_sealed',
    tier: 1,
    position: 'EARLY',
    image: IMG('sealed_box'),
    when: (f) => !!f.forbiddenSkillName && (f.forbiddenCasts > 0 || f.deathKind === 'FORBIDDEN'),
    headline: '검은 함',
    body: '창시자가 남긴 금기 초식 {FSKILL}의 비급은 검은 옻칠 함에 담겨 봉인되었다. 역대 종주는 자리에 오르는 날 단 한 번 그 함 앞에 서서 열지 않겠다고 맹세한다. 기록에 따르면 맹세를 어긴 종주가 둘 있었다. 두 사람 모두 그해를 넘기지 못했다.',
    tokens: (f) => ({ FSKILL: `「${f.forbiddenSkillName}」` }),
    causeKey: 'FORBIDDEN_FIRST',
    causeFallback: '금기 초식을 실전에 꺼내 쓴 선택',
  },
  {
    id: 'hidden_rumor',
    standalone: true,
    tier: 2,
    position: 'MID',
    image: IMG('snow_circle'),
    when: (f) => f.magic === 'HIDDEN' && f.axis !== 'ARCANE',
    headline: '눈이 쌓이지 않는 마당',
    body: '창시자가 남몰래 익혔다는 기이한 술법의 이야기는 문하에서도 쉬쉬하는 것이 되었다. 그러나 옛 도장 터의 마당 한가운데에는 한겨울에도 눈이 쌓이지 않는 둥근 자리가 있다. 지질 조사는 두 번 있었고, 두 번 모두 원인을 찾지 못했다.',
    causeFallback: '이계의 금서를 풀어 남몰래 익힌 술법',
  },
  {
    id: 'duel_grave',
    standalone: true,
    tier: 2,
    position: 'EARLY',
    image: IMG('sword_grave'),
    when: (f) => f.deathKind === 'DUEL',
    headline: '칼을 꽂은 자리',
    body: '창시자가 쓰러진 자리에 사람들은 비석 대신 그가 쥐고 있던 칼을 꽂았다. 세월이 흘러 칼은 삭아 없어졌으나 그 자리에는 돌무더기가 쌓였다. 큰 승부를 앞둔 무인들은 지금도 그곳에 들러 돌 하나를 얹고 간다.',
    causeKey: 'DEATH',
    causeFallback: '진검결투에서 물러서지 않은 마지막',
  },
  {
    id: 'one_trick',
    tier: 2,
    position: 'MID',
    image: IMG('thousand_cuts'),
    when: (f) => f.isOneTrick,
    headline: '하루 천 번',
    body: '총과 대포가 칼을 밀어내던 시대에도 유파의 후손들은 마당에 서서 날마다 {SKILL} 하나만을 천 번씩 그었다. 어느 서양 사진가가 남긴 흑백 사진 속 늙은 사범의 눈빛은 한 세기를 건너와 보는 이의 숨을 멎게 한다.',
    causeKey: 'FIRST_CRAFT',
    causeFallback: '평생 단 하나의 초식만을 끝까지 파고든 수련',
  },

  // ----------------------------------------------------------------- 반려
  {
    id: 'spouse_diary',
    tier: 3,
    position: 'EARLY',
    image: IMG('diary'),
    when: (f) => !!f.spouse && (f.spouse.bonusType === 'SCHOLAR' || f.spouse.bonusType === 'WESTERN'),
    headline: '붓으로 남긴 절반',
    body: '창시자의 반려 {SPOUSE|은는} 칼을 들지 않았으나 도장에서 일어난 일을 날마다 적었다. 누가 입문했고 누가 떠났는지, 어느 초식이 어느 겨울에 완성되었는지. 오늘날 {SECT}의 초기 역사가 전설이 아닌 사실로 남은 것은 그 일기 서른두 권 덕이다.',
    tokens: (f) => ({ SPOUSE: f.spouse!.name }),
    causeKey: 'MARRIED',
    causeFallback: '글을 아는 반려와 올린 혼례',
  },
  {
    id: 'spouse_clinic',
    tier: 3,
    position: 'EARLY',
    image: IMG('clinic'),
    when: (f) => !!f.spouse && f.spouse.bonusType === 'CLINIC',
    headline: '도장 옆 의원',
    body: '창시자의 반려 {SPOUSE|이가} 도장 곁에 낸 작은 의원은 도장보다 먼저 고을 사람들의 발길을 끌었다. 다친 제자를 고치던 솜씨가 접골과 침술의 가전(家傳)이 되었고, 후대에는 무예를 배우러 온 이보다 뼈를 맞추러 온 이가 많은 해도 있었다.',
    tokens: (f) => ({ SPOUSE: f.spouse!.name }),
    causeKey: 'MARRIED',
    causeFallback: '의술을 아는 반려와 올린 혼례',
  },

  // ----------------------------------------------------------------- 기록과 유물
  {
    id: 'manual_recorded',
    tier: 3,
    position: 'MID',
    image: IMG('manual'),
    when: (f) => f.wroteManual,
    headline: '나라의 병서에 오른 이름',
    body: '창시자의 무예가 나라의 병서에 실린 덕에, {SECT}의 초식은 유파가 가장 어려웠던 시절에도 책 속에서 살아남았다. 끊어진 동작을 되살리려는 후손들은 번번이 그 책의 판화 앞으로 돌아갔다. 그림 속 무인의 자세 아래에는 유파의 이름이 또렷하다.',
    causeKey: 'WROTE_MANUAL',
    causeFallback: '유파의 무예를 나라의 병서에 올린 일',
  },
  {
    id: 'heirloom_museum',
    tier: 2,
    position: 'LATE',
    image: IMG('museum'),
    when: (f) => !!f.heirloom,
    headline: '유리장 속의 가보',
    body: (f) =>
      `창시자의 가보 {HEIRLOOM|은는} 지금 박물관의 유리장 안에 누워 있다. 설명문에는 ${
        (f.heirloom!.winsCount || 0) > 0 ? `실전에서 ${f.heirloom!.winsCount}차례 쓰인 흔적이 날에 남아 있다고` : '날에 실전의 흔적이 남아 있다고'
      } 적혀 있다. ${
        f.scale === 'SMALL'
          ? '해마다 창시자의 기일 무렵이면 누군가 유리장 앞에 흰 꽃 한 송이를 놓고 간다.'
          : '해마다 창시자의 기일에는 유파의 종가가 흰 장갑을 끼고 찾아와, 직원이 지켜보는 가운데 칼집에서 꺼내 기름을 먹인다.'
      }`,
    tokens: (f) => ({ HEIRLOOM: `「${f.heirloom!.customName || f.heirloom!.name}」` }),
    yearLabel: (f) => `${yearIn(f, 'museum', 1978, 2012)}년`,
    causeKey: 'HEIRLOOM',
    causeFallback: '한 자루의 병기를 유파의 가보로 삼은 일',
  },
  {
    id: 'tournament_legacy',
    tier: 2,
    position: 'LATE',
    image: IMG('tournament'),
    when: (f) => f.tournamentWins >= 1,
    headline: '우승기에 붙은 이름',
    body: (f) =>
      `창시자가 ${f.tournamentWins >= 2 ? `${f.tournamentWins}차례` : '한 차례'} 정상에 올랐던 무술 대회는 형식을 바꿔 가며 오늘날까지 이어진다. 우승자에게 주어지는 깃발에는 {FOUNDER}의 이름이 붙어 있다. 결승전에 앞서 두 선수가 횡베기와 종베기를 한 번씩 긋는 의식은 중계 화면에서 가장 조용한 삼십 초다.`,
    yearLabel: (f) => `${yearIn(f, 'tournament', 1988, 2020)}년`,
    causeKey: 'TOURNAMENT_WIN',
    causeFallback: '천하 무술 대회 우승',
  },
];

const TIER_WEIGHT: Record<1 | 2 | 3, number> = { 1: 3, 2: 2, 3: 1 };
export const MAX_VIGNETTES = 3;

// 조건이 맞는 삽화 가운데 최대 3개를 고른다. 드문 사건일수록 잘 뽑히되, 같은 일생이면 언제나 같은 결과가 나온다.
export function pickVignettes(facts: LineageFacts): VignetteDef[] {
  const order: VignettePosition[] = ['EARLY', 'MID', 'LATE'];
  return VIGNETTES.filter((v) => v.when(facts) && (facts.succession !== 'NONE' || v.standalone))
    .map((v) => ({ v, score: TIER_WEIGHT[v.tier] + seededUnit(facts.seed, v.id) * 1.4 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VIGNETTES)
    .map((x) => x.v)
    .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position));
}
