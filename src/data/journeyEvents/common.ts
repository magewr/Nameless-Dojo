import { hasBatchim, josa } from '../../utils/korean';
import { GameState, SceneDialogueLine } from '../../types/game';
import {
  addFame,
  addHealth,
  addMoney,
  addRep,
  addStats,
  byCountry,
  chance,
  cur,
  type FreshVariant,
  gainInsight,
  giveBook,
  giveWeapon,
  H,
  highlight,
  JourneyEventDef,
  journeyBattle,
  N,
  P,
  pickBook,
  pickFresh,
  rand,
  remember,
  roadScale,
  say,
  spendDays,
  trainEquipped,
} from '../../engine/journeyCore';
import { JourneyRegion, JourneyTerrain, rumorsFor } from '../journeyRegions';

// 주막 · 사찰 · 대오의 장소 · 보물 · 길 위의 돌발 사건
// 주막·사찰·보물·매복은 한 생에 수십 번 만나는 사건이다. 사건마다 여러 장면(변주)을 두고,
// 최근에 본 장면은 피해서 고른다(pickFresh). 고른 장면은 meta.vkey로 넘겨 결말에서 다시 찾는다.
// 장면이 바뀌어도 선택지의 효과(날수·비용·보상)는 같다 — 플레이어가 익힌 규칙은 그대로 두고 풍경만 바꾼다.

const innName = (s: GameState) => byCountry(s, '주막', '객잔', '하타고(旅籠)');
const keeper = (s: GameState) => byCountry(s, '주모', '객잔 주인', '여관 안주인');
const shrinePlace = (s: GameState) => byCountry(s, '산사', '도관', '신사');
const priest = (s: GameState) => byCountry(s, '노승', '늙은 도사', '신관');
const coin = (s: GameState, n: number) => `${n}${cur(s)}`;

// 길에서 주인공을 부르는 말 — 나이·성별에 맞춘다
const guestCall = (s: GameState) =>
  s.age >= 58 ? '어르신' : s.gender === 'FEMALE' ? byCountry(s, '무사님', '여협', '무사님') : byCountry(s, '무사 양반', '대협', '무사님');
// 아이가 주인공을 부르는 말 (girl: 말하는 아이가 여자아이인가)
const kidCall = (s: GameState, girl = false) =>
  s.gender === 'FEMALE' ? (s.age >= 55 ? '할머니' : s.age >= 40 ? '아주머니' : girl ? '언니' : '누나') : s.age >= 55 ? '할아버지' : '아저씨';

// 받침에 맞춘 서술: 「6냥이오 / 6은자요」 「산군이다 / 무리다」 「무명검이라는 / 무명류라는」
const io = (w: string) => `${w}${hasBatchim(w) ? '이오' : '요'}`;
const ida = (w: string) => `${w}${hasBatchim(w) ? '이다' : '다'}`;
const irago = (w: string) => `${w}${hasBatchim(w) ? '이라는' : '라는'}`;

// 지금 걷고 있는 구간의 지형 (도장에서 열린 사건이면 null)
function terrainOf(s: GameState, r: JourneyRegion | null): JourneyTerrain | null {
  const legId = s.journey?.legId;
  if (!r || !legId) return null;
  return r.legs.find((l) => l.id === legId)?.terrain ?? null;
}
// 지형이 맞는 장면만 (지형 제한이 없는 장면은 늘 남는다)
function byTerrain<T extends { terrain?: JourneyTerrain[] }>(list: T[], t: JourneyTerrain | null): T[] {
  const fit = list.filter((v) => !v.terrain || (t !== null && v.terrain.includes(t)));
  return fit.length ? fit : list;
}
// 결말에서 meta.vkey로 고른 장면을 다시 찾는다. 예전 세이브처럼 vkey가 없으면 지금 상황에 맞는 첫 장면.
function sceneOf<T extends FreshVariant>(list: T[], vkey: unknown, s: GameState): T {
  const id = vkey === undefined || vkey === null ? '' : String(vkey);
  return list.find((v) => v.id === id) || list.find((v) => !v.when || v.when(s)) || list[0];
}
const injure = (s: GameState, label: string): GameState => ({
  ...s,
  statuses: [...s.statuses.filter((x) => x.id !== 'LIGHT_INJURY'), { id: 'LIGHT_INJURY' as const, label, turnsRemaining: 2 }],
});

// ───────── 주막 / 객잔 / 하타고 ─────────
// 들를 때마다 다른 장면. 기본 선택지(묵는다 · 소문을 캔다 · 돌아간다 · 지나간다)는 늘 같고,
// 몇몇 장면에는 그 장면에서만 할 수 있는 작은 선택지가 하나 붙는다.
interface InnScene extends FreshVariant {
  title: (s: GameState) => string;
  scene: (s: GameState) => string;
  host?: (s: GameState) => string; // 맞이하는 사람 (기본: 주모·객잔 주인·여관 안주인)
  greet: (s: GameState) => string; // 방값(6)을 알리는 맞이
  greetFirst?: boolean; // 맞이를 소문보다 먼저 (주인이 소문까지 전하는 장면)
  talker: (s: GameState) => string; // 소문을 흘리는 사람
  talkDir: string;
  extraLines?: (s: GameState) => SceneDialogueLine[];
  rest: (s: GameState) => string; // 하룻밤 묵은 뒤 (건강 +14 앞)
  extra?: { id: string; label: (s: GameState) => string; hint: (s: GameState) => string; cost?: number };
}

const teller = (s: GameState) => byCountry(s, '전기수(傳奇叟)', '설서인(說書人)', '강담사(講談師)');
const veteran = (s: GameState) => byCountry(s, '늙은 군졸', '외팔이 노병', '늙은 낭인');

const INN_SCENES: InnScene[] = [
  {
    id: 'market',
    title: (s) => `장날의 ${innName(s)}`,
    scene: (s) =>
      byCountry(
        s,
        '장날이라 주막 마당이 장꾼들로 북적인다. 소금 짐, 옹기 짐, 짚신 꾸러미가 처마 밑까지 쌓였다.',
        '장날이라 객잔 아래층이 장꾼들로 미어터진다. 짐수레가 문 앞을 막았고, 점원이 수건을 어깨에 걸고 뛰어다닌다.',
        '장이 선 날이라 하타고 앞이 떠들썩하다. 짐말이 길게 늘어섰고, 손님을 끄는 하녀들의 목소리가 높다.'
      ),
    greet: (s) =>
      byCountry(
        s,
        `오늘은 방이 다 찼수, ${guestCall(s)}. 봉놋방 구석이라도 괜찮으면 ${io(coin(s, 6))}.`,
        `${guestCall(s)}, 장날이라 독방은 없소. 여럿이 자는 통방 한 자리가 ${io(coin(s, 6))}.`,
        `오늘은 손님이 많아 합방이 되겠습니다만… 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: (s) => byCountry(s, '장돌뱅이', '장꾼', '짐말꾼'),
    talkDir: '짐을 내려놓으며',
    rest: (s) =>
      byCountry(
        s,
        '장꾼들 틈 봉놋방 구석에서 새우잠을 잤다. 코 고는 소리가 요란했지만, 그래도 지붕 밑이다.',
        '장꾼들 틈 통방에서 새우잠을 잤다. 밤새 주판 튕기는 소리가 났지만, 그래도 지붕 밑이다.',
        '장사꾼들과 한방에서 새우잠을 잤다. 밤새 셈하는 소리가 났지만, 그래도 지붕 밑이다.'
      ),
  },
  {
    id: 'rain',
    title: (s) => `빗속의 ${innName(s)}`,
    scene: (s) =>
      `비가 억수로 쏟아지는 밤이다. 흠뻑 젖은 길손들이 ${byCountry(s, '아궁이 앞에', '화로 둘레에', '이로리(囲炉裏) 둘레에')} 모여 김이 오르는 옷을 말린다.`,
    greet: (s) =>
      byCountry(
        s,
        `비 맞은 생쥐 꼴이구려, ${guestCall(s)}. 어서 들어와 불 쬐시우. 방값은 ${io(coin(s, 6))}.`,
        `${guestCall(s)}, 어서 들어오시오! 이 빗속에 어딜 더 가시겠소. 방 하나에 ${io(coin(s, 6))}.`,
        `어머, 흠뻑 젖으셨네요. 발 씻을 물부터 드릴게요. 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: () => '젖은 길손',
    talkDir: '젖은 삿갓을 털며',
    rest: (s) =>
      byCountry(
        s,
        '젖은 옷을 아궁이 앞에 걸어 두고 뜨끈한 구들에 누웠다. 지붕을 두드리는 빗소리가 자장가 같았다.',
        '젖은 옷을 화로 곁에 걸어 두고 두꺼운 이불을 덮었다. 지붕을 두드리는 빗소리가 자장가 같았다.',
        '젖은 옷을 이로리 곁에 걸어 두고 이불을 덮었다. 지붕을 두드리는 빗소리가 자장가 같았다.'
      ),
  },
  {
    id: 'empty',
    title: (s) => `손님 끊긴 ${innName(s)}`,
    scene: (s) =>
      byCountry(
        s,
        '마당에 낙엽만 구른다. 늙은 주모 혼자 부뚜막에 앉아 졸다가 인기척에 눈을 뜬다.',
        '탁자마다 먼지가 앉았다. 늙은 주인 혼자 주판을 튕기다 인기척에 고개를 든다.',
        '현관에 짚신 한 켤레 없다. 늙은 안주인 혼자 마루를 닦다가 인기척에 허리를 편다.'
      ),
    host: (s) => byCountry(s, '늙은 주모', '늙은 객잔 주인', '늙은 안주인'),
    greetFirst: true,
    greet: (s) =>
      byCountry(
        s,
        `아들놈이 부역에 끌려가고 나니 손님도 끊겼구려. 그래도 구들은 뜨끈하우. 방값은 ${io(coin(s, 6))}.`,
        `아들이 관병으로 끌려간 뒤로 이 꼴이오. 그래도 이불은 깨끗하오. 방값은 ${io(coin(s, 6))}.`,
        `손님들이 다 새 길로 다니셔서요… 그래도 목욕물은 데워 둘게요. 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: (s) => byCountry(s, '늙은 주모', '늙은 객잔 주인', '늙은 안주인'),
    talkDir: '한숨을 쉬며',
    rest: (s) =>
      byCountry(
        s,
        '주모가 아껴 둔 장작을 아낌없이 지펴 주었다. 텅 빈 주막의 구들이 유난히 뜨거웠다.',
        '주인이 아껴 둔 숯을 아낌없이 넣어 주었다. 텅 빈 객잔의 이불이 유난히 따뜻했다.',
        '안주인이 데워 준 목욕물에 몸을 담갔다. 텅 빈 하타고의 밤이 유난히 고요했다.'
      ),
    extra: { id: 'chores', label: () => '장작을 패고 물을 길어 밥값을 대신한다 (1일)', hint: () => '건강 +8 · 인덕 +2' },
  },
  {
    id: 'gamble',
    title: (s) => byCountry(s, '투전판이 벌어진 주막', '골패 소리 요란한 객잔', '정반(丁半) 노름이 벌어진 하타고'),
    scene: (s) =>
      byCountry(
        s,
        '구석방에서 투전목 넘기는 소리와 고함이 번갈아 터진다. 패를 쥔 사내들의 눈이 벌겋다.',
        '안쪽 탁자에서 골패 섞는 소리가 자갈 구르듯 요란하다. 땀에 전 은자가 탁자 위를 오간다.',
        '안쪽 방에서 「정이냐, 반이냐!」 하는 외침과 함께 주사위 통이 엎어진다. 사내들이 빙 둘러앉았다.'
      ),
    greet: (s) =>
      byCountry(
        s,
        `노름판은 신경 쓰지 마시우, ${guestCall(s)}. 방은 저쪽 끝이라 조용하우. 방값은 ${io(coin(s, 6))}.`,
        `저 패거리는 신경 쓰지 마시오. 방은 위층이라 조용하오. 방값은 ${io(coin(s, 6))}.`,
        `시끄러우시죠? 저 사람들, 밤새 저래요. 안쪽 방은 조용합니다. 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: (s) => byCountry(s, '개평꾼', '구경꾼', '노름꾼'),
    talkDir: '판을 기웃거리며',
    rest: () => '밤새 판 엎어지는 소리가 들렸지만, 길에서 지친 몸은 금세 곯아떨어졌다.',
    extra: { id: 'wager', label: (s) => `판에 끼어 한 판 걸어 본다 (${coin(s, 10)})`, hint: () => '이기면 판돈의 두 배, 지면 그만', cost: 10 },
  },
  {
    id: 'teller',
    title: (s) => `${josa(teller(s), '이가')} 온 ${innName(s)}`,
    scene: (s) =>
      byCountry(
        s,
        '마루 끝에 앉은 전기수가 이야기책을 펼쳐 들고 대목마다 목소리를 바꾼다. 길손들이 숨을 죽인다.',
        '설서인이 탁자 위에 성목(醒木)을 탁 내리치며 강호 협객 이야기를 풀어 놓는다. 손님들이 찻잔을 든 채 굳었다.',
        '강담사가 부채로 책상을 탁탁 치며 옛 검호의 결투를 읊는다. 듣는 이들이 무릎을 당겨 앉는다.'
      ),
    // 이름이 난 도장이면, 이야기 속 검객이 바로 자신이다
    extraLines: (s) =>
      s.fame >= 400
        ? [
            P(byCountry(s, '전기수', '설서인', '강담사'), `…그날 밤, ${s.sectName}의 칼이 달빛을 갈랐으니!`, '목소리를 높이며'),
            N('가만히 들어 보니 이야기 속 검객은 다름 아닌 자신이다. 아무도 알아보지 못한다.'),
          ]
        : [],
    greet: (s) =>
      byCountry(
        s,
        `이야기 들으려면 막걸리 한 사발은 시키셔야 하우. 방값은 ${io(coin(s, 6))}.`,
        `이야기 값은 찻값에 들었소. 방값은 ${io(coin(s, 6))}.`,
        `강담은 따로 값을 안 받아요. 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: () => '길손',
    talkDir: '이야기가 쉬는 틈에',
    rest: () => '이야기꾼의 목소리가 자장가처럼 멀어졌다. 꿈속에서 누군가와 칼을 맞대었다.',
    extra: {
      id: 'treat',
      label: (s) => `이야기꾼에게 술 한 상을 내고 옛 검객 이야기를 청한다 (${coin(s, 5)})`,
      hint: () => '통찰 +1 · 정신 +1',
      cost: 5,
    },
  },
  {
    id: 'caravan',
    title: (s) => byCountry(s, '보부상 패가 든 주막', '표국 수레가 멈춘 객잔', '상인 행렬이 묵는 하타고'),
    scene: (s) =>
      byCountry(
        s,
        '마당에 등짐과 봇짐이 산더미다. 보부상 패의 접장이 물미작대기를 세워 두고 패거리의 셈을 맞춘다.',
        '마당에 표국 깃발을 꽂은 수레 여섯 대가 늘어섰다. 표사(鏢師)들이 번갈아 짐을 지킨다.',
        '오사카로 가는 상인 행렬이 하타고를 통째로 빌렸다. 짐 상자마다 상가(商家)의 문장이 찍혀 있다.'
      ),
    greet: (s) =>
      byCountry(
        s,
        `보부상 패가 방을 다 차지해서 말이우. 그래도 한 칸은 남겨 뒀지. 방값은 ${io(coin(s, 6))}.`,
        `표국 손님들이 위층을 다 쓰시오. 아래층 방이 하나 남았소. 방값은 ${io(coin(s, 6))}.`,
        `오늘은 상가 분들이 다 빌리셨는데… 다락방이라도 괜찮으시면 ${coin(s, 6)}입니다.`
      ),
    talker: (s) => byCountry(s, '보부상 접장', '젊은 표사', '상가의 지배인'),
    talkDir: '셈판을 덮으며',
    rest: () => '밤새 짐 지키는 이들의 발소리가 들렸다. 남이 지켜 주는 밤은 오랜만이었다.',
    extra: { id: 'guard', label: () => '밤새 짐 지키는 일을 거든다 (1일)', hint: (s) => `상무 +3 · +${coin(s, 12)} · 건강 -4` },
  },
  {
    id: 'official',
    title: (s) => byCountry(s, '술 취한 아전의 행패', '아역(衙役)의 행패', '술 취한 하급 무사의 행패'),
    scene: (s) =>
      byCountry(
        s,
        '술 취한 아전이 주모의 팔을 붙잡고 외상 술을 더 내놓으라며 상을 엎는다. 길손들은 고개만 숙이고 있다.',
        '허리에 쇠사슬을 찬 아역이 「세금」이라며 주인의 돈궤를 뒤진다. 손님들은 못 본 척 국수만 먹는다.',
        '얼굴이 벌건 하급 무사가 칼집으로 상을 두드리며 술을 더 내오라 고함친다. 하녀가 울상이다.'
      ),
    greet: (s) =>
      byCountry(
        s,
        `아이고, ${guestCall(s)}… 저 양반은 신경 쓰지 마시우. 방값은 ${io(coin(s, 6))}.`,
        `손님, 못 본 걸로 해 주시오… 방값은 ${io(coin(s, 6))}.`,
        `죄송해요, 시끄럽죠… 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: () => '길손',
    talkDir: '고개를 숙인 채 속삭이며',
    rest: (s) =>
      byCountry(
        s,
        '밤늦게야 소란이 가라앉았다. 얇은 벽 너머로 주모가 훌쩍이는 소리가 들렸다.',
        '밤늦게야 소란이 가라앉았다. 얇은 벽 너머로 주인이 한숨 쉬는 소리가 들렸다.',
        '밤늦게야 소란이 가라앉았다. 얇은 장지문 너머로 하녀가 훌쩍이는 소리가 들렸다.'
      ),
    extra: {
      id: 'rebuke',
      label: (s) => `${byCountry(s, '아전', '아역', '하급 무사')}의 손목을 잡아 조용히 타이른다`,
      hint: () => '인덕 +3',
    },
  },
  {
    id: 'feast',
    title: (s) => `잔칫날의 ${innName(s)}`,
    scene: (s) =>
      byCountry(
        s,
        '마당에 차일을 치고 혼례 잔치가 한창이다. 신랑 쪽 사람들이 주막을 통째로 빌려 국수를 삶는다.',
        '붉은 등롱이 줄지어 걸렸다. 객잔 아래층에서 혼례 잔치가 벌어져 폭죽 연기가 자욱하다.',
        '신랑 집안이 하타고 큰방을 빌려 혼례 잔치를 연다. 축하 노래 「다카사고(高砂)」 가락이 흘러나온다.'
      ),
    greet: (s) =>
      byCountry(
        s,
        `오늘은 잔칫날이라 국수는 그냥 드리우! 방값은 ${io(coin(s, 6))}.`,
        `경사스러운 날이오! 국수 한 그릇은 잔칫집에서 내는 거요. 방값은 ${io(coin(s, 6))}.`,
        `경사스러운 날이라 좀 소란하실 거예요. 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: (s) => byCountry(s, '잔칫집 하인', '잔치 손님', '잔치 손님'),
    talkDir: '술잔을 들고 다가와',
    rest: (s) =>
      byCountry(
        s,
        '잔치 국수를 두 그릇이나 얻어먹고 일찍 누웠다. 밤새 장구 소리가 났다.',
        '잔치 국수를 두 그릇이나 얻어먹고 일찍 누웠다. 밤새 폭죽 소리가 났다.',
        '잔치 음식을 나눠 받고 일찍 누웠다. 밤새 노랫소리가 났다.'
      ),
    extra: { id: 'bless', label: (s) => `신랑 신부에게 축의를 건넨다 (${coin(s, 5)})`, hint: () => '인덕 +2 · 명성 +3', cost: 5 },
  },
  {
    id: 'sick',
    title: (s) => `${keeper(s)}의 아픈 아이`,
    scene: (s) =>
      byCountry(
        s,
        '주모가 정신이 없다. 안방에서 아이가 열에 들떠 앓는 소리가 들린다. 국은 불어 터졌고 손님상은 엉망이다.',
        '객잔 주인이 안절부절못한다. 뒷방에서 아이가 경기를 일으켰다 한다. 의원은 강 건너에 산다.',
        '안주인의 얼굴이 하얗다. 어린 딸이 사흘째 열이 내리지 않는다고 한다. 의원은 고개 너머에 있다.'
      ),
    greet: (s) =>
      byCountry(
        s,
        `미안하우, ${guestCall(s)}… 애가 아파서 대접이 변변찮을 거우. 방값은 ${io(coin(s, 6))}.`,
        `손님, 오늘은 대접이 시원찮을 거요… 방값은 ${io(coin(s, 6))}.`,
        `죄송해요, 오늘은 제대로 모시지 못할 것 같아요… 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: () => '길손',
    talkDir: '혀를 차며',
    rest: () => '밤새 아이 앓는 소리에 잠을 설쳤다. 그래도 지붕 밑에서 몸은 쉬었다.',
    extra: { id: 'care', label: () => '밤새 아이 곁을 지키며 내공으로 열을 다스린다 (1일)', hint: () => '인덕 +4 · 건강 -3' },
  },
  {
    id: 'veteran',
    title: (s) => `${veteran(s)}의 술잔`,
    scene: (s) =>
      byCountry(
        s,
        '구석 자리에서 한쪽 눈이 먼 늙은 군졸이 홀로 탁주를 따른다. 팔뚝에 칼자국이 지렁이처럼 기어간다.',
        '구석 탁자에서 왼팔이 없는 늙은 병사가 홀로 백주를 마신다. 낡은 녹영(綠營) 군복을 아직 걸치고 있다.',
        '구석에서 늙은 낭인이 홀로 술을 데운다. 섬기던 가문이 끊긴 지 서른 해라 한다.'
      ),
    greet: (s) =>
      byCountry(
        s,
        `저 영감은 북방 수자리에서 돌아온 뒤로 늘 저 자리라우. 방값은 ${io(coin(s, 6))}.`,
        `저 노인은 서쪽 변방 싸움에서 팔을 잃었다오. 방값은 ${io(coin(s, 6))}.`,
        `저 어르신은 매일 저 자리에 계세요. 하룻밤 ${coin(s, 6)}입니다.`
      ),
    talker: (s) => veteran(s),
    talkDir: '술잔을 내려놓으며',
    rest: (s) =>
      byCountry(
        s,
        '잠들기 전, 늙은 군졸이 흥얼거리던 군가가 오래 귓가에 남았다.',
        '잠들기 전, 외팔이 노병이 흥얼거리던 군가가 오래 귓가에 남았다.',
        '잠들기 전, 늙은 낭인이 읊조리던 옛 노래가 오래 귓가에 남았다.'
      ),
    extra: { id: 'drink', label: (s) => `술 한 잔 따르고 옛 싸움 이야기를 청한다 (${coin(s, 3)})`, hint: () => '장착 초식 숙련 · 통찰 +1', cost: 3 },
  },
];

// 「소문을 캔다」가 찾아내는 길 앞쪽의 장소 — 가리키는 곳에 맞는 귀띔
const INN_LEADS: Array<{ key: string; line: (s: GameState) => string }> = [
  { key: 'tr_swordgrave', line: () => '…저 고개 너머에 옛날 검객들이 칼을 묻었다는 언덕이 있다네. 아무도 안 가 봤지만.' },
  { key: 'tr_ruin', line: (s) => `…저 산모퉁이를 돌면 ${josa(byCountry(s, '무너진 절터', '허물어진 도관', '버려진 사당'), '이가')} 있는데, 아직 아무도 안 뒤졌다더군.` },
  { key: 'tr_carving', line: () => '…저 앞 골짜기 동굴 벽에 칼자국이 빼곡하다는 얘기, 들어 봤나? 미친 검객이 십 년을 살았다나.' },
];
const LISTEN_EMPTY = [
  '술잔이 몇 순배 돌았지만 쓸 만한 이야기는 없었다. 세상 돌아가는 사정만 귀에 담았다. (통찰 +1)',
  '밤늦도록 귀를 기울였지만 이 길에 얽힌 이야기는 없었다. 대신 세상인심이 어디로 흐르는지는 알았다. (통찰 +1)',
  '소문이란 열에 아홉은 헛것이다. 그래도 사람들이 무엇을 두려워하는지는 알 수 있었다. (통찰 +1)',
];

const inn: JourneyEventDef = {
  key: 'inn',
  kind: 'INN',
  label: (s) => innName(s),
  once: false,
  build: (s) => {
    const v = pickFresh(s, 'inn', INN_SCENES);
    const rumors = rumorsFor(s.country, s.year);
    const rumor = rumors.length ? rand(rumors) : '요즘은 별일 없다오.';
    const talk = P(v.talker(s), rumor, v.talkDir);
    const greet = P(v.host ? v.host(s) : keeper(s), v.greet(s));
    const extra = v.extra;
    return {
      title: v.title(s),
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: v.scene(s),
      script: [N(v.scene(s)), ...(v.extraLines ? v.extraLines(s) : []), ...(v.greetFirst ? [greet, talk] : [talk, greet])],
      options: [
        { id: 'rest', label: `하룻밤 묵는다 (${coin(s, 6)}, 1일)`, hint: '건강 회복', disabled: s.money < 6, disabledReason: '노자가 부족하다' },
        { id: 'listen', label: `술 한 잔 사며 소문을 캔다 (${coin(s, 4)}, 1일)`, hint: '이 길에 숨은 것을 알게 될지도', disabled: s.money < 4, disabledReason: '노자가 부족하다' },
        ...(extra
          ? [{ id: extra.id, label: extra.label(s), hint: extra.hint(s), ...(extra.cost ? { disabled: s.money < extra.cost, disabledReason: '노자가 부족하다' } : {}) }]
          : []),
        { id: 'home', label: '여기서 발길을 돌려 도장으로 돌아간다', hint: '무사수행을 일찍 끝낸다' },
        { id: 'leave', label: '그냥 지나간다' },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    const v = sceneOf(INN_SCENES, c.data?.vkey, s);
    if (opt === 'rest') {
      let n = spendDays(addMoney(s, -6), 1);
      n = addHealth(n, 14);
      return say(n, [['나레이션', `${v.rest(s)} (건강 +14)`]]);
    }
    if (opt === 'listen') {
      let n = spendDays(addMoney(s, -4), 1);
      n = addStats(n, { ins: 1 });
      const talker = v.talker(s);
      if (chance(0.5) && n.journey) {
        const j = n.journey;
        const lead = rand(INN_LEADS);
        const x = Math.min(j.legLength - 120, j.heroX + 300 + Math.random() * 400);
        n = {
          ...n,
          journey: {
            ...j,
            pois: [...j.pois, { id: `poi_lead_${n.turn}_${Math.random().toString(36).slice(2, 5)}`, kind: 'TREASURE', eventKey: lead.key, x, label: '소문의 장소' }],
          },
        };
        return say(n, [
          [talker, lead.line(n)],
          ['나레이션', '이 길 앞쪽에 「소문의 장소」가 생겼다. (통찰 +1)'],
        ]);
      }
      const rumors = rumorsFor(n.country, n.year);
      return say(n, [
        [talker, rumors.length ? rand(rumors) : '요즘은 조용하다네.'],
        ['나레이션', rand(LISTEN_EMPTY)],
      ]);
    }
    if (opt === 'home' && s.journey) {
      return { ...s, journey: { ...s.journey, day: s.journey.maxDays } };
    }
    // ── 장면마다 하나씩 붙는 작은 선택지 ──
    if (opt === 'chores') {
      const n = addRep(addHealth(spendDays(s, 1), 8), { virtue: 2 });
      return say(n, [
        [
          '나레이션',
          byCountry(
            s,
            '반나절 장작을 패고 물독을 가득 채웠다. 주모가 고봉밥에 국을 두 그릇이나 내왔다. (건강 +8, 인덕 +2)',
            '반나절 장작을 패고 물항아리를 가득 채웠다. 주인이 아껴 둔 고기만두를 한 바구니 쪄 내왔다. (건강 +8, 인덕 +2)',
            '반나절 장작을 패고 물통을 가득 채웠다. 안주인이 따뜻한 밥에 된장국을 차려 내왔다. (건강 +8, 인덕 +2)'
          ),
        ],
      ]);
    }
    if (opt === 'wager') {
      if (chance(0.45)) {
        return say(addMoney(s, 10), [
          [
            '나레이션',
            `${byCountry(s, '패가 붙었다!', '패가 맞아떨어졌다!', '「반!」 — 맞혔다!')} 판돈이 두 배가 되어 돌아왔다. 사내들의 눈초리가 따갑다. (+${coin(s, 10)})`,
          ],
        ]);
      }
      return say(addMoney(s, -10), [
        ['나레이션', `${byCountry(s, '패가 비켜 갔다.', '패가 어긋났다.', '「정!」 — 빗나갔다.')} 판돈만 날리고 일어섰다. 누군가 혀를 찼다. (-${coin(s, 10)})`],
      ]);
    }
    if (opt === 'treat') {
      const famous = s.fame >= 400;
      let n = addStats(addMoney(s, -5), { ins: 1, wil: 1 });
      if (famous) n = addFame(n, 3);
      const who = byCountry(s, '전기수', '설서인', '강담사');
      return say(n, [
        famous
          ? [who, `…허허, 이거 큰일 났소. 이야기 속 ${s.sectName}의 검객이 바로 앞에 앉아 계셨구려!`]
          : [who, '옛날에 천하제일이라는 검객이 있었소. 마지막 승부에서 그이는 칼을 거두었지. 이긴 자의 이름은 아무도 모르는데, 그이 이름은 아직 이렇게 남았소.'],
        [
          '나레이션',
          famous
            ? '이야기꾼은 그 자리에서 이야기 한 대목을 새로 지었다. 다음 장터부터 이야기가 한 대목 늘었다고 한다. (통찰 +1, 정신 +1, 명성 +3)'
            : '이긴 자보다 진 자의 이야기가 오래 남는 법이라 했다. 술잔을 비우며 오래 생각했다. (통찰 +1, 정신 +1)',
        ],
      ]);
    }
    if (opt === 'guard') {
      const n = addRep(addHealth(addMoney(spendDays(s, 1), 12), -4), { commerce: 3 });
      return say(n, [
        [
          '나레이션',
          `${byCountry(
            s,
            '보부상들과 번갈아 밤을 새웠다. 새벽에 접장이 엽전 꾸러미를 내밀며 「우리 패 길에서 또 만나세」 했다.',
            '표사들과 번갈아 밤을 새웠다. 새벽에 표두(鏢頭)가 은자를 쥐여 주며 표국에 빈자리가 있다고 귀띔했다.',
            '지배인과 번갈아 밤을 새웠다. 새벽에 수고비를 종이에 싸서 공손히 내밀었다.'
          )} (+${coin(s, 12)}, 상무 +3, 건강 -4)`,
        ],
      ]);
    }
    if (opt === 'rebuke') {
      const who = byCountry(s, '아전', '아역', '하급 무사');
      const ok = chance(0.65);
      let n = addRep(s, { virtue: 3 });
      if (ok) n = addFame(n, 3);
      return say(n, [
        [
          '나레이션',
          ok
            ? `손목을 잡힌 ${josa(who, '은는')} 상대가 예사롭지 않음을 알아보고 슬그머니 물러갔다. 길손들이 술잔을 들어 보였다. (인덕 +3, 명성 +3)`
            : `${josa(who, '은는')} 욕을 퍼부으며 나갔다. 내일 무슨 앙갚음을 할지는 모를 일이다. (인덕 +3)`,
        ],
      ]);
    }
    if (opt === 'bless') {
      const n = addHealth(addFame(addRep(addMoney(s, -5), { virtue: 2 }), 3), 4);
      return say(n, [
        ['나레이션', '칼 찬 손님의 축의에 신랑 아버지가 술잔을 들고 달려왔다. 덕담을 청하기에 「오래 함께 걸으시오」라 했다. (인덕 +2, 명성 +3, 건강 +4)'],
      ]);
    }
    if (opt === 'care') {
      const host = keeper(s);
      const n = addHealth(addRep(spendDays(s, 1), { virtue: 4 }), -3);
      return say(n, [
        [
          '나레이션',
          chance(0.6)
            ? `밤새 아이의 손바닥에 기를 불어넣었다. 새벽녘 아이의 이마가 식었다. ${josa(host, '이가')} 부엌 바닥에 엎드려 절했다. (인덕 +4, 건강 -3)`
            : `밤새 곁을 지켰지만 열은 쉬이 내리지 않았다. 동틀 무렵 의원이 와서 아이를 맡겼다. ${josa(host, '은는')} 문밖까지 따라 나와 고개를 숙였다. (인덕 +4, 건강 -3)`,
        ],
      ]);
    }
    if (opt === 'drink') {
      const n = addStats(trainEquipped(addMoney(s, -3), 20), { ins: 1 });
      return say(n, [
        [
          veteran(s),
          byCountry(
            s,
            '전장에선 멋진 초식 쓰다 죽은 놈이 제일 많았소. 산 놈들은 다 못생긴 칼을 썼지. 짧게, 빨리, 두 번.',
            '싸움터에선 화려한 초식이 쓸모없소. 살아남은 놈들은 다 같은 칼을 썼지. 짧게, 빨리, 두 번.',
            '진짜 칼싸움은 세 합을 넘기지 않소. 넘기면 둘 다 죽지. 짧게, 빨리, 두 번.'
          ),
        ],
        ['나레이션', '그날 밤 마당에서 노병의 말대로 칼끝을 줄여 보았다. 군더더기 하나가 떨어져 나갔다. (장착 초식 숙련 +20, 통찰 +1)'],
      ]);
    }
    return s;
  },
};

// ───────── 사찰 · 도관 · 신사 ─────────
interface ShrineScene extends FreshVariant {
  title: (s: GameState) => string;
  scene: (s: GameState) => string;
  speaker: (s: GameState) => string;
  line: (s: GameState) => string;
  dir: (s: GameState) => string;
  pray: (s: GameState) => string; // 하루 머문 뒤 (선문답을 듣지 못했을 때)
  koan?: (s: GameState) => string; // 이 장면의 선문답 (없으면 나라별 기본)
  koanBy?: (s: GameState) => string; // 선문답을 던지는 이 (없으면 speaker)
  donate?: (s: GameState) => string;
  extra?: { id: string; label: (s: GameState) => string; hint: string; cost?: number };
}

const SHRINE_KOAN = (s: GameState) =>
  byCountry(
    s,
    '「칼이 먼저인가, 베려는 마음이 먼저인가?」',
    '「물은 그릇을 다투지 않는다. 그대의 검은 무엇을 다투는가?」',
    '「베지 않는 칼이야말로 가장 잘 드는 칼이오.」'
  );
const SHRINE_DONATE = (s: GameState) =>
  byCountry(
    s,
    `시주함에 ${josa(coin(s, 20), '을를')} 넣었다. 노승이 말없이 합장했다.`,
    `향촉값으로 ${josa(coin(s, 20), '을를')} 올렸다. 늙은 도사가 말없이 읍(揖)했다.`,
    `새전함에 ${josa(coin(s, 20), '을를')} 넣었다. 신관이 말없이 고개를 숙였다.`
  );

const SHRINE_SCENES: ShrineScene[] = [
  {
    id: 'still',
    title: (s) => `${shrinePlace(s)}의 고요`,
    scene: (s) =>
      byCountry(
        s,
        '이끼 낀 돌계단 끝, 바람이 처마의 풍경을 흔든다. 세상의 소리가 한 겹 멀어진다.',
        '이끼 낀 돌계단 끝, 바람이 처마의 풍경을 흔든다. 향 연기가 곧게 하늘로 오른다.',
        '이끼 낀 돌계단 끝, 바람이 신전 앞 방울 줄을 흔든다. 삼나무 숲이 세상의 소리를 한 겹 걸러 낸다.'
      ),
    speaker: priest,
    line: () => '칼을 찬 손님이시구려. 칼은 문밖에 두고 들어오시오. 마음은… 가지고 들어오셔도 좋소.',
    dir: () => '빗자루를 멈추고',
    pray: (s) => byCountry(s, '새벽 예불 소리에 눈을 떴다. 머리가 맑다.', '새벽 독경 소리에 눈을 떴다. 머리가 맑다.', '새벽 북소리에 눈을 떴다. 머리가 맑다.'),
  },
  {
    id: 'bell',
    when: (s) => s.country !== 'JAPAN',
    title: (s) => `저녁 종이 울리는 ${shrinePlace(s)}`,
    scene: (s) =>
      byCountry(
        s,
        '해 질 녘, 산사의 범종이 울린다. 종소리가 골짜기를 따라 길게 번져 가다 산 너머로 사라진다.',
        '해 질 녘, 도관의 종루에서 저녁 종이 울린다. 종소리가 그치자 북소리가 그 뒤를 잇는다.',
        '해 질 녘, 신사 곁 절에서 저녁 종이 울린다. 종소리가 삼나무 숲을 따라 길게 번져 간다.'
      ),
    speaker: (s) => byCountry(s, '종을 치던 노승', '종루의 도사', '신관'),
    line: (s) =>
      byCountry(
        s,
        '저 종소리가 닿는 데까지가 다 부처님 집이오. 오늘은 손님도 그 안에 계시는구려.',
        '종은 쳐야 울리지요. 칼도 그렇지 않소?',
        '종은 쳐야 울리지요. 칼도 그렇지 않소?'
      ),
    dir: () => '당목을 내려놓으며',
    pray: () => '종소리가 잦아든 뒤에도 귀에 남은 울림을 따라 밤새 숨을 골랐다.',
    koan: (s) =>
      byCountry(
        s,
        '「종은 스스로 울지 않소. 그대의 칼은 무엇이 쳐서 우는가?」',
        '「소리는 종에 있소, 당목에 있소, 듣는 귀에 있소?」',
        '「종은 스스로 울지 않소. 그대의 칼은 무엇이 쳐서 우는가?」'
      ),
  },
  {
    id: 'rain',
    title: (s) => `비 오는 밤의 ${shrinePlace(s)}`,
    scene: (s) =>
      byCountry(
        s,
        '빗줄기가 법당 처마를 두드린다. 노승과 단둘이 마루에 앉아 비를 본다.',
        '빗소리에 갇힌 전각. 늙은 도사가 화로에 찻물을 올린다.',
        '빗발이 배전(拜殿) 지붕을 두드린다. 신관이 처마 밑에 자리를 내준다.'
      ),
    speaker: priest,
    line: () => '비가 그치기를 기다리는 것도 수행이라오. 서두를 일이 무에 있겠소.',
    dir: () => '찻잔을 건네며',
    pray: () => '빗소리를 들으며 밤을 새웠다. 처마 끝 낙숫물의 박자가 어느새 숨과 맞아 있었다.',
    koan: () => '「빗방울은 같은 자리에 두 번 떨어지지 않소. 그대의 칼은 어떻소?」',
  },
  {
    id: 'novice',
    title: (s) => byCountry(s, '산사의 동자승', '도관의 어린 도동(道童)', '신사의 어린 무녀(巫女)'),
    scene: (s) =>
      byCountry(
        s,
        '빡빡머리 동자승이 마당을 쓸다 말고 칼을 흘끔흘끔 본다.',
        '머리를 틀어 올린 어린 도동이 물동이를 이고 가다 칼을 보고 멈춰 선다.',
        '붉은 하카마를 입은 어린 무녀가 비질을 멈추고 칼을 신기한 듯 바라본다.'
      ),
    speaker: (s) => byCountry(s, '동자승', '어린 도동', '어린 무녀'),
    line: (s) =>
      byCountry(
        s,
        `스님이 칼은 사람 죽이는 물건이랬는데… 그럼 ${kidCall(s)}는 나쁜 사람이에요?`,
        `사부님이 칼은 흉한 물건이랬는데… 그럼 ${kidCall(s)}는 나쁜 사람이에요?`,
        `칼은 무서운 거라고 배웠는데… ${kidCall(s, true)}는 무서운 사람이에요?`
      ),
    dir: () => '고개를 갸웃하며',
    pray: (s) =>
      byCountry(
        s,
        '동자승과 함께 저녁 공양을 들고 잤다. 아이의 물음이 오래 귀에 남았다.',
        '도동과 함께 저녁을 먹고 잤다. 아이의 물음이 오래 귀에 남았다.',
        '어린 무녀가 차려 준 저녁을 먹고 잤다. 아이의 물음이 오래 귀에 남았다.'
      ),
    koan: () => '「칼이 나쁜 거예요, 칼 든 사람이 나쁜 거예요?」',
  },
  {
    id: 'pilgrim',
    title: (s) => byCountry(s, '산사의 백일기도', '향을 사르는 아낙', '백 번 참배하는 여인'),
    scene: (s) =>
      byCountry(
        s,
        '한 아낙이 돌계단 하나에 절 한 번씩, 무릎으로 산사를 오른다. 앓아누운 아들을 위한 백일기도라 한다.',
        '한 아낙이 향 다발을 머리 위로 받쳐 들고 대전 앞에 엎드려 운다. 병든 지아비의 목숨을 빌고 있다.',
        '맨발의 여인이 도리이와 배전 사이를 오가며 백 번 참배를 하고 있다. 발바닥이 터져 피가 배어난다.'
      ),
    speaker: (s) => byCountry(s, '기도하는 아낙', '향을 사르는 아낙', '참배하는 여인'),
    line: (s) => byCountry(s, '부처님이 들어주시겠지요… 들어주셔야지요.', '신선님, 제 목숨을 대신 가져가셔도 좋습니다…', '…아흔하나, 아흔둘…'),
    dir: (s) => byCountry(s, '이마를 땅에 대며', '이마를 땅에 대며', '숨을 몰아쉬며'),
    pray: (s) =>
      `${byCountry(s, '아낙', '아낙', '여인')}의 기도 소리를 들으며 하룻밤을 묵었다. 남을 위해 비는 마음이 무엇인지 오래 생각했다.`,
    koanBy: priest,
    koan: () => '「남을 위해 꿇는 무릎이 가장 단단한 법이오.」',
    extra: { id: 'alms', label: (s) => `약값에 보태라며 노자를 덜어 준다 (${coin(s, 10)})`, hint: '인덕 +4', cost: 10 },
  },
  {
    id: 'tapdori',
    when: (s) => s.country === 'KOREA',
    title: () => '석탑을 도는 등불',
    scene: () => '소원을 비는 이들이 등을 들고 석탑 둘레를 돈다. 천천히, 끝없이. 등불이 원을 그린다.',
    speaker: () => '탑돌이하는 노파',
    line: (s) => `${guestCall(s)}도 한 바퀴 도시우. 칼 든 사람 소원일수록 간절한 법이라우.`,
    dir: () => '등 하나를 건네며',
    pray: () => '등을 들고 사람들 틈에 섞여 밤늦도록 탑을 돌았다. 걸음이 저절로 고요해졌다.',
    koanBy: () => '노승',
    koan: () => '「돌고 돌아도 탑은 제자리요. 그대는 어디까지 왔소?」',
  },
  {
    id: 'fortune',
    when: (s) => s.country !== 'KOREA',
    title: (s) => byCountry(s, '점괘를 뽑는 산사', '첨통(籤筒)을 흔드는 대전', '오미쿠지가 묶인 신목(神木)'),
    scene: (s) =>
      byCountry(
        s,
        '법당 앞에서 사람들이 점괘를 뽑으며 웃고 한숨 쉰다.',
        '향 연기 자욱한 대전. 첨통을 흔드는 소리가 끊이지 않는다. 대나무 첨 하나가 떨어질 때마다 탄식과 환호가 오간다.',
        '배전 옆 신목 가지에 흰 오미쿠지가 꽃처럼 묶여 있다. 참배객들이 종이를 펼쳐 보고 웃거나 한숨을 쉰다.'
      ),
    speaker: (s) => byCountry(s, '노승', '첨을 풀어 주는 도사', '신관'),
    line: (s) =>
      byCountry(
        s,
        '한 번 뽑아 보시오. 칼의 앞날이 궁금하지 않소?',
        '한 번 흔들어 보시오. 하늘이 그대 칼의 앞날을 일러 줄지도 모르오.',
        '하나 뽑아 보시지요. 길 떠나는 분께는 길흉을 일러 드립니다.'
      ),
    dir: () => '빙그레 웃으며',
    pray: (s) =>
      `${byCountry(s, '법당 앞에서', '향 연기 속에서', '경내에서')} 하루를 보냈다. 남들이 운을 묻는 소리를 들으며, 내 칼의 운은 묻지 않기로 했다.`,
    extra: {
      id: 'fortune',
      label: (s) => `${byCountry(s, '점괘를 뽑아 본다', '첨을 뽑아 본다', '오미쿠지를 뽑아 본다')} (${coin(s, 2)})`,
      hint: '길흉에 따라 마음이 달라진다',
      cost: 2,
    },
  },
  {
    id: 'sansin',
    title: (s) => byCountry(s, '산신각의 제물', '산신묘(山神廟)의 촛불', '산신(山神)의 작은 사당'),
    scene: (s) =>
      byCountry(
        s,
        '산사 뒤 작은 산신각. 호랑이를 거느린 산신 그림 앞에 누군가 막걸리 한 사발과 북어 한 마리를 올려 두었다.',
        '길가의 작은 산신묘. 꺼질 듯한 촛불 앞에 늙은 사냥꾼이 무릎을 꿇었다.',
        '삼나무 숲속 작은 사당. 사냥꾼들이 산에 들기 전 소금과 술을 올리는 곳이다.'
      ),
    speaker: () => '늙은 사냥꾼',
    line: (s) =>
      byCountry(
        s,
        `산에 드는 사람은 산신께 먼저 인사를 여쭙는 법이오. ${guestCall(s)}도 한 잔 올리시우.`,
        '산에 들기 전엔 꼭 여기 절하오. 산신이 노하면 범이 내려오니까.',
        '산신께 인사드리고 가시오. 그래야 산이 길을 열어 줍니다.'
      ),
    dir: () => '절을 마치고 일어서며',
    pray: () => '산신 앞에서 하룻밤을 지냈다. 밤새 산이 숨 쉬는 소리를 들었다.',
    koan: () => '「산은 이기려 드는 놈부터 잡아먹는다오.」',
    donate: (s) => `${josa(coin(s, 20), '을를')} 제물 값으로 올렸다. 늙은 사냥꾼이 「산신께서 기억하실 거요」 하고 웃었다.`,
  },
  {
    id: 'matsuri',
    when: (s) => s.country === 'JAPAN' && (s.season === 'SUMMER' || s.season === 'AUTUMN'),
    title: () => '마쓰리가 열린 신사',
    scene: () => '경내에 등롱이 줄지어 걸리고, 북소리와 피리 소리에 맞춰 미코시(神輿)가 흔들린다. 노점에서 경단 굽는 냄새가 난다.',
    speaker: () => '마을 젊은이',
    line: (s) =>
      s.age >= 58 ? '어르신, 이리 앉으시지요! 경단 하나 드시고 구경하십시오.' : '무사님도 미코시 한번 메 보시겠습니까? 어깨가 단단해 보이시는데!',
    dir: () => '머리띠를 고쳐 매며',
    pray: () => '마쓰리 북소리 속에서 밤을 보냈다. 들뜬 사람들 틈에서 오히려 마음이 가라앉았다.',
    koanBy: () => '신관',
  },
  {
    id: 'zen',
    title: (s) => byCountry(s, '선방(禪房)의 좌선', '정좌(靜坐)하는 도사들', '야마부시(山伏)의 폭포 수행'),
    scene: (s) =>
      byCountry(
        s,
        '선방 문이 열려 있다. 스님들이 벽을 보고 앉아 미동도 없다. 죽비 소리만 가끔 울린다.',
        '도관 뒤뜰 너럭바위 위에 도사들이 줄지어 정좌했다. 숨소리조차 들리지 않는다.',
        '신사 뒤 폭포 아래에서 야마부시들이 소라고둥을 불며 찬물을 맞는다.'
      ),
    speaker: (s) => byCountry(s, '죽비를 든 스님', '정좌하던 도사', '야마부시'),
    line: (s) =>
      byCountry(
        s,
        '앉고 싶으면 앉으시오. 다만 칼 생각은 문밖에 두고.',
        '앉으시오. 앉아서 아무것도 하지 않는 것이 가장 어렵소.',
        '들어오시오! 물이 찰수록 마음은 뜨거워지는 법이오.'
      ),
    dir: (s) => byCountry(s, '죽비를 쥔 채', '눈을 감은 채', '물살 속에서'),
    pray: (s) =>
      byCountry(
        s,
        '하루를 벽 앞에 앉아 있었다. 다리가 저리다 못해 사라졌을 때, 비로소 숨이 보였다.',
        '하루를 바위 위에 앉아 있었다. 바람이 몸을 지나가는 것이 느껴졌다.',
        '하루를 폭포 아래 서 있었다. 이가 덜덜 떨리다가 어느 순간 멎었다.'
      ),
    koan: (s) =>
      byCountry(
        s,
        '「앉은 자리가 칼끝이오. 그대는 지금 어디 앉아 있소?」',
        '「비우지 않은 그릇에는 아무것도 담기지 않소.」',
        '「물을 이기려 들면 물에 진다. 물이 되면 물이 길을 낸다.」'
      ),
  },
];

const shrine: JourneyEventDef = {
  key: 'shrine',
  kind: 'SHRINE',
  label: (s) => byCountry(s, '산사(山寺)', '도관(道觀)', '신사(神社)'),
  once: false,
  build: (s) => {
    const v = pickFresh(s, 'shrine', SHRINE_SCENES);
    const extra = v.extra;
    return {
      title: v.title(s),
      category: 'LIFE',
      narration: v.scene(s),
      script: [N(v.scene(s)), P(v.speaker(s), v.line(s), v.dir(s))],
      options: [
        { id: 'pray', label: '하루 머물며 마음을 가라앉힌다 (1일)', hint: '건강·정신 회복, 선문답을 들을지도' },
        ...(extra
          ? [{ id: extra.id, label: extra.label(s), hint: extra.hint, ...(extra.cost ? { disabled: s.money < extra.cost, disabledReason: '노자가 부족하다' } : {}) }]
          : []),
        {
          id: 'donate',
          label: `${byCountry(s, '시주한다', '향촉값을 올린다', '새전(賽錢)을 바친다')} (${coin(s, 20)})`,
          hint: '인덕',
          disabled: s.money < 20,
          disabledReason: '노자가 부족하다',
        },
        { id: 'leave', label: byCountry(s, '합장하고 지나간다', '읍(揖)하고 지나간다', '고개 숙여 예를 올리고 지나간다') },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    const v = sceneOf(SHRINE_SCENES, c.data?.vkey, s);
    if (opt === 'pray') {
      let n = spendDays(s, 1);
      n = addHealth(addStats(n, { wil: 1 }), 6);
      if (chance(0.3)) {
        const g = gainInsight(n, 6, `${shrinePlace(n)}의 선문답`);
        return say(g.state, [
          [v.koanBy ? v.koanBy(n) : v.speaker(n), v.koan ? v.koan(n) : SHRINE_KOAN(n)],
          ['나레이션', `밤새 그 말을 곱씹었다. ${g.text}`],
        ]);
      }
      return say(n, [['나레이션', `${v.pray(n)} (정신 +1, 건강 +6)`]]);
    }
    if (opt === 'donate') {
      let n = addMoney(s, -20);
      n = addFame(addRep(n, { virtue: 6 }), 5);
      return say(n, [['나레이션', `${v.donate ? v.donate(s) : SHRINE_DONATE(s)} (인덕 +6, 명성 +5)`]]);
    }
    if (opt === 'alms') {
      const n = addRep(addMoney(s, -10), { virtue: 4 });
      return say(n, [
        [
          '나레이션',
          byCountry(
            s,
            '아낙이 몇 번이고 절을 했다. 그 절은 부처님께 하던 절과 똑같았다. (인덕 +4)',
            '아낙이 몇 번이고 머리를 조아렸다. 신선께 하던 절과 똑같은 절이었다. (인덕 +4)',
            '여인은 받은 돈을 꼭 쥐고 고개를 숙이더니, 남은 참배를 마저 이어 갔다. (인덕 +4)'
          ),
        ],
      ]);
    }
    if (opt === 'fortune') {
      let n = addMoney(s, -2);
      const r = Math.random();
      if (r < 0.25) {
        n = addStats(n, { wil: 1, ins: 1 });
        return say(n, [
          ['나레이션', `${byCountry(s, '「대길(大吉)」', '「상상첨(上上籤)」', '「대길(大吉)」')} — 「구하는 것은 이미 손안에 있다.」 (정신 +1, 통찰 +1)`],
        ]);
      }
      n = addStats(n, { wil: 1 });
      if (r < 0.75) {
        return say(n, [['나레이션', `${byCountry(s, '「길(吉)」', '「중첨(中籤)」', '「길(吉)」')} — 「서두르지 말라. 물은 낮은 데로 흐른다.」 (정신 +1)`]]);
      }
      return say(n, [
        [
          '나레이션',
          byCountry(
            s,
            '「흉(凶)」 — 노승이 웃으며 「나쁜 괘는 여기 두고 가시오」 했다. 마음이 오히려 가벼워졌다. (정신 +1)',
            '「하하첨(下下籤)」 — 도사가 웃으며 「나쁜 첨은 여기 두고 가시오」 했다. 마음이 오히려 가벼워졌다. (정신 +1)',
            '「흉(凶)」 — 신관이 일러 준 대로 신목 가지에 묶어 두고 왔다. 나쁜 운은 두고 가는 것이라 했다. (정신 +1)'
          ),
        ],
      ]);
    }
    return s;
  },
};

// ───────── 보물 · 비급 ─────────
// 폐사: 불상 · 석탑 · 장경각
interface RuinScene extends FreshVariant {
  title: (s: GameState) => string;
  lines: (s: GameState) => string[];
  robbers: string;
  found: (s: GameState, book: string) => string;
  coins: (s: GameState) => string;
  nothing: string;
}
const RUIN_SCENES: RuinScene[] = [
  {
    id: 'statue',
    title: (s) => byCountry(s, '무너진 산사 — 목 없는 불상', '허물어진 도관 — 금칠 벗겨진 신상', '버려진 사당 — 쓰러진 목불(木佛)'),
    lines: (s) =>
      byCountry(
        s,
        ['지붕이 반쯤 내려앉은 법당. 목이 떨어진 불상이 어둠 속에서 이쪽을 본다.', '불상의 배 안쪽이 비어 있다. 옛사람들은 귀한 경전을 불상 속에 넣어 두곤 했다.'],
        ['지붕에 구멍이 뚫린 전각. 금칠이 벗겨진 신상(神像)이 비스듬히 기울어 있다.', '흙으로 빚은 신상의 등에 작은 문이 달려 있다. 옛 도사들은 비전을 신상 뱃속에 모셔 두곤 했다.'],
        ['기둥이 썩어 기울어진 사당. 넘어진 목불이 낙엽에 반쯤 묻혀 있다.', '목불의 등판이 갈라져 있다. 옛사람들은 불상을 깎을 때 속을 비우고 경문을 넣었다.']
      ),
    robbers: '먼저 와 있던 도굴꾼들이 칼을 뽑았다!',
    found: (s, b) => `${byCountry(s, '불상', '신상', '목불')} 뱃속에서 기름 먹인 보자기를 꺼냈다. 안에는 ${b}! (해독 20% 진행)`,
    coins: (s) => `${byCountry(s, '불단', '제단', '불단')} 밑에서 옛 시주 돈 꾸러미가 나왔다.`,
    nothing: '이틀을 뒤졌으나 먼지와 쥐똥뿐이었다.',
  },
  {
    id: 'pagoda',
    title: (s) => byCountry(s, '무너진 산사 — 쓰러진 석탑', '허물어진 도관 — 기울어진 전탑(塼塔)', '버려진 사당 — 이끼 덮인 오륜탑(五輪塔)'),
    lines: (s) =>
      byCountry(
        s,
        ['절터 한가운데 석탑이 무너져 탑신석이 풀숲에 나뒹군다.', '기단 틈으로 작은 공간이 보인다. 탑을 세울 때는 사리와 함께 귀한 것을 넣어 두곤 했다.'],
        ['벽돌을 쌓아 올린 탑이 한쪽으로 기울었다. 무너진 층 사이로 어두운 공간이 드러나 있다.', '옛 도사들은 탑을 쌓을 때 경전과 비급을 함께 봉안했다고 한다.'],
        ['사당 뒤 무덤터에 이끼 덮인 오륜탑이 줄지어 섰다. 그중 하나가 쓰러져 받침돌이 드러났다.', '받침돌 가운데 구멍이 패어 있다. 옛 무사들은 아끼던 것을 탑 밑에 묻게 했다.']
      ),
    robbers: '탑을 허물던 자들이 연장을 내던지고 칼을 뽑았다!',
    found: (s, b) => `${byCountry(s, '기단석', '무너진 층', '받침돌')} 아래 작은 함이 있었다. 사리 대신 책 한 권. ${b}! (해독 20% 진행)`,
    coins: () => '탑 밑에 누군가 묻어 둔 돈 항아리가 나왔다.',
    nothing: '돌을 들어내다 이틀이 갔다. 나온 것은 지네 몇 마리뿐이었다.',
  },
  {
    id: 'library',
    title: (s) => byCountry(s, '무너진 산사 — 불탄 장경각', '허물어진 도관 — 그슬린 장경루(藏經樓)', '버려진 사당 — 타다 남은 경장(經藏)'),
    lines: (s) =>
      byCountry(
        s,
        ['불에 그슬린 장경각. 경판을 얹던 시렁이 숯이 되어 무너져 있다.', '재 속에 타다 만 궤짝 하나가 보인다. 불길이 바닥까지는 닿지 못한 모양이다.'],
        ['검게 그슬린 장경루. 타다 남은 경권(經卷)이 바람에 날려 마당을 구른다.', '무너진 서가 밑에 쇠 장식이 달린 궤짝 하나가 깔려 있다.'],
        ['지붕이 타서 하늘이 보이는 경장. 돌아가는 서가가 반쯤 타다 멈춰 있다.', '서가 밑칸은 불길을 피했다. 칸마다 두루마리가 그대로 꽂혀 있다.']
      ),
    robbers: '재를 뒤지던 자들이 몸을 일으킨다. 손에 칼이 들려 있다!',
    found: (_s, b) => `재 속 궤짝 바닥에 불길이 닿지 않은 책 한 권이 있었다. ${b}! (해독 20% 진행)`,
    coins: () => '궤짝 바닥에 은 몇 덩이가 깔려 있었다.',
    nothing: '재만 한 짐 뒤집어쓰고 이틀을 보냈다.',
  },
];

const trRuin: JourneyEventDef = {
  key: 'tr_ruin',
  kind: 'TREASURE',
  label: (s) => byCountry(s, '무너진 산사', '허물어진 도관', '버려진 사당'),
  once: false,
  build: (s) => {
    const v = pickFresh(s, 'tr_ruin', RUIN_SCENES);
    const lines = v.lines(s);
    return {
      title: v.title(s),
      category: 'LIFE',
      narration: lines[0],
      script: lines.map((t) => N(t)),
      options: [
        { id: 'search', label: '샅샅이 뒤진다 (2일)', hint: '통찰이 높을수록 잘 찾는다' },
        { id: 'leave', label: '죽은 이들의 자리를 어지럽히지 않는다' },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    if (opt !== 'search') return s;
    const v = sceneOf(RUIN_SCENES, c.data?.vkey, s);
    let n = spendDays(s, 2);
    if (chance(0.22)) {
      return journeyBattle(say(n, [['나레이션', v.robbers]]), c, 'robbers', {
        stakes: 'HOSTILE',
        title: '폐사의 도굴꾼',
        subtitle: '먼저 온 자들이 길을 막는다',
        name: '도굴꾼 두목',
        enemyTitle: '폐허를 터는 자',
        age: 36,
        ai: 'AGGRESSIVE',
        scale: roadScale(n, 0.85),
        weapon: 'BLADE',
        skills: ['base_h_slash', 'sk_kr_01', 'sk_cn_01'],
        rewardMoney: 30,
        rewardFame: 10,
      });
    }
    if (chance(0.45 + n.stats.ins * 0.004)) {
      const id = pickBook(n, (b) => b.countryBias === n.country && (b.rarity === 'RARE' || b.rarity === 'COMMON'));
      if (id) {
        const g = giveBook(n, id, 20);
        n = highlight(g.state, `폐사에서 ${josa(g.title || '', '을를')} 찾았다`);
        return say(n, [['나레이션', v.found(n, g.title || '')]]);
      }
      n = addMoney(n, 40);
      return say(n, [['나레이션', `${v.coins(n)} (+${coin(n, 40)})`]]);
    }
    return say(n, [['나레이션', v.nothing]]);
  },
  onBattle: (s, _opt, won) => {
    if (!won) return s;
    const id = pickBook(s, (b) => b.countryBias === s.country && b.rarity !== 'LEGEND');
    if (!id) return s;
    const g = giveBook(s, id, 20);
    return highlight(g.state, `도굴꾼을 물리치고 ${josa(g.title || '', '을를')} 지켰다`);
  },
};

// 검총: 언덕 · 결투 골짜기 · 옛 싸움터
interface GraveScene extends FreshVariant {
  title: (s: GameState) => string;
  narration: (s: GameState) => string;
  script: (s: GameState) => SceneDialogueLine[];
  tend: string; // 넋을 기린 뒤
  tendAfter: string; // 깨달음 앞에 붙는 말
  pull: string; // 칼을 뽑을 때
}
const GRAVE_SCENES: GraveScene[] = [
  {
    id: 'hill',
    title: () => '검총(劍塚) — 이름 없는 검객들의 무덤',
    narration: () => '바람 부는 언덕 위, 돌무더기마다 녹슨 칼이 꽂혀 있다. 이긴 자도 진 자도 여기서는 다 같은 흙이다.',
    script: (s) => [
      N('바람 부는 언덕. 돌무더기마다 녹슨 칼이 꽂혀 있고, 낡은 천 조각이 칼자루에서 펄럭인다.'),
      H(s, '이름 없는 검객들… 나도 언젠가 여기 누울지 모르겠구나.', '무릎을 꿇으며'),
    ],
    tend: '돌을 다시 쌓고 칼마다 술을 부었다. 바람이 멎었다.',
    tendAfter: '칼자국 하나하나가 누군가의 마지막 초식이었다.',
    pull: '돌무더기 깊숙이 박힌 칼을 뽑자, 녹 아래에서 서늘한 날이 드러났다.',
  },
  {
    id: 'duel',
    title: () => '검총(劍塚) — 결투 골짜기의 비석',
    narration: () => '골짜기 끝 평평한 마당에 비석 두 개가 마주 서 있다. 그 사이 맨땅에 칼 수십 자루가 꽂혀 있다.',
    script: (s) => [
      N('골짜기 끝, 비석 두 개가 마주 서 있다. 비석 사이 맨땅에 칼 수십 자루가 꽂혀 있다.'),
      N('이곳에서 결투로 쓰러진 이의 칼은 뽑지 않는 것이 이 골짜기의 법이라 한다.'),
      H(s, '이긴 자의 이름도, 진 자의 이름도 비석에는 없구나.', '비석을 쓸어 보며'),
    ],
    tend: '두 비석 사이를 쓸고 칼마다 술을 부었다. 골짜기의 바람이 잦아들었다.',
    tendAfter: '칼마다 마지막으로 맞선 상대가 있었다. 그 상대의 칼도 여기 어딘가 꽂혀 있을 것이다.',
    pull: '「뽑지 않는 것이 법」이라던 칼 가운데 하나를 뽑아 들었다. 녹 아래에서 서늘한 날이 드러났다.',
  },
  {
    id: 'field',
    title: (s) => byCountry(s, '검총(劍塚) — 임진년 싸움터', '검총(劍塚) — 명나라 마지막 싸움터', '검총(劍塚) — 고전장(古戰場)의 칼무덤'),
    narration: (s) =>
      byCountry(
        s,
        '억새밭 사이로 녹슨 칼과 부러진 창날이 삐죽삐죽하다. 이백 년 전 의병들이 왜군을 막다 쓰러진 자리라 한다.',
        '갈대밭 사이로 녹슨 칼과 화살촉이 흩어져 있다. 명나라가 무너질 때 의병들이 마지막까지 버틴 자리라 한다.',
        '참억새 사이로 녹슨 칼과 갑옷 조각이 드러나 있다. 전국(戰國) 시대에 두 가문의 군세가 맞붙었던 들판이라 한다.'
      ),
    script: (s) => [
      N(
        byCountry(
          s,
          '억새밭 사이로 녹슨 칼과 부러진 창날이 삐죽삐죽하다. 이백 년 전 의병들이 왜군을 막다 쓰러진 자리라 한다.',
          '갈대밭 사이로 녹슨 칼과 화살촉이 흩어져 있다. 명나라가 무너질 때 의병들이 마지막까지 버틴 자리라 한다.',
          '참억새 사이로 녹슨 칼과 갑옷 조각이 드러나 있다. 전국(戰國) 시대에 두 가문의 군세가 맞붙었던 들판이라 한다.'
        )
      ),
      H(s, '이 많은 칼이 모두 누군가를 지키려 뽑혔겠지.', '풀숲을 헤치며'),
    ],
    tend: '풀숲을 베어 길을 내고 흩어진 뼈를 모아 묻었다. 해가 질 때까지 돌을 쌓았다.',
    tendAfter: '이름 없는 이들의 마지막 싸움이 손끝에 전해졌다.',
    pull: '풀뿌리에 엉킨 칼을 뽑아 들었다. 묵은 녹 아래에서 날이 아직 살아 있다.',
  },
];

const trSwordgrave: JourneyEventDef = {
  key: 'tr_swordgrave',
  kind: 'TREASURE',
  label: () => '검총(劍塚)',
  once: false,
  build: (s) => {
    const v = pickFresh(s, 'tr_swordgrave', GRAVE_SCENES);
    return {
      title: v.title(s),
      category: 'HISTORICAL',
      illustration: '/assets/px_chr_v_sword_grave.jpg',
      narration: v.narration(s),
      script: v.script(s),
      options: [
        { id: 'pay', label: '하루를 들여 무덤을 정리하고 넋을 기린다 (1일)', hint: '정신·깨달음' },
        { id: 'take', label: '쓸 만한 칼을 하나 뽑는다 (1일)', hint: '명검일 수도, 원한이 서린 칼일 수도' },
        { id: 'leave', label: '묵례하고 떠난다' },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    const v = sceneOf(GRAVE_SCENES, c.data?.vkey, s);
    if (opt === 'pay') {
      let n = spendDays(s, 1);
      n = addRep(addStats(n, { wil: 2 }), { virtue: 4, ascetic: 4 });
      const g = gainInsight(n, 8, '검총');
      return say(g.state, [
        ['나레이션', v.tend],
        ['나레이션', `${v.tendAfter} ${g.text}`],
      ]);
    }
    if (opt === 'take') {
      let n = spendDays(s, 1);
      const id = rand(byCountry(n, ['wp_bl_04', 'wp_bl_07', 'wp_bl_11'], ['wp_bl_05', 'wp_bl_08', 'wp_pl_06'], ['wp_bl_06', 'wp_bl_09', 'wp_bl_12']));
      const g = giveWeapon(n, id);
      n = addRep(g.state, { ruthless: 6 });
      if (!g.name) return say(n, [['나레이션', '녹이 슬어 쓸 만한 칼이 없었다.']]);
      n = highlight(n, `검총에서 ${josa(`「${g.name}」`, '을를')} 뽑았다`);
      const cursed = id === 'wp_bl_12' || id === 'wp_bl_11';
      return say(n, [
        ['나레이션', `${v.pull} 「${g.name}」!`],
        ['나레이션', cursed ? '칼을 쥔 손끝이 저리다. 이 칼은 피를 기억하고 있다. (살기 +6)' : '죽은 이에게 미안한 마음이 든다. (살기 +6)'],
      ]);
    }
    return s;
  },
};

// 석벽의 검흔: 동굴 · 폭포 곁 바위벽 · 여덟 글자
interface CarvingScene extends FreshVariant {
  title: string;
  narration: string;
  lines: string[];
  studyLabel: string;
  place: string; // 깨달음의 자리
  mark: string; // 하이라이트
  study: string;
  end: string;
}
const CARVING_SCENES: CarvingScene[] = [
  {
    id: 'cave',
    title: '석벽에 새겨진 검흔(劍痕)',
    narration: '절벽 아래 동굴 벽에 칼자국이 가득하다. 누군가 이곳에서 수십 년을 홀로 수련한 흔적이다.',
    lines: [
      '동굴 안쪽 벽에 칼자국이 빽빽하다. 처음엔 어지러운 낙서 같았으나, 자세히 보니 한 줄기 흐름이 있다.',
      '맨 끝의 칼자국 하나만 유독 깊다. 마치 벽을 베어 넘으려다 멈춘 것처럼.',
    ],
    studyLabel: '이틀 동안 칼자국을 따라 그어 본다 (2일)',
    place: '석벽의 검흔',
    mark: '동굴 석벽의 검흔을 따라 그었다',
    study: '칼자국을 따라 이틀을 휘둘렀다. 옛사람의 검로가 손목에 스며든다.',
    end: '마지막 깊은 칼자국 앞에서 오래 멈춰 섰다. 그도 이 벽 앞에서 멈췄던 것이다.',
  },
  {
    id: 'falls',
    title: '폭포 곁 바위벽의 검흔',
    narration: '폭포 옆 바위벽에 칼자국이 가득하다. 물보라에 닳아 둥글어졌지만 흐름만은 또렷하다.',
    lines: [
      '쏟아지는 폭포 옆, 젖은 바위벽에 칼자국이 겹겹이 패어 있다.',
      '물보라에 닳아 모서리는 둥글어졌지만, 한 줄기 흐름은 또렷하다. 물과 함께 베려 한 칼이다.',
    ],
    studyLabel: '이틀 동안 폭포 소리에 맞춰 칼자국을 따라 그어 본다 (2일)',
    place: '폭포 곁 바위벽',
    mark: '폭포 곁 바위벽의 검흔을 따라 그었다',
    study: '폭포 소리에 맞춰 이틀을 휘둘렀다. 물이 떨어지는 박자에 칼끝이 실린다.',
    end: '물살이 가장 센 자리에서 칼자국 하나가 끊겨 있다. 그도 거기서 멈췄던 것이다.',
  },
  {
    id: 'verse',
    title: '바위에 새겨진 여덟 글자',
    narration: '산길 큰 바위에 누군가 칼끝으로 여덟 글자를 새겼다. 획 하나하나가 초식이다.',
    lines: [
      '산길 큰 바위에 누군가 칼끝으로 여덟 글자를 새겼다. 「身隨劍走 劍隨心行」 — 몸은 칼을 따르고, 칼은 마음을 따른다.',
      '글자를 따라 획을 그어 보면, 획의 순서가 곧 초식의 순서다.',
    ],
    studyLabel: '이틀 동안 글자의 획을 칼로 따라 써 본다 (2일)',
    place: '여덟 글자의 바위',
    mark: '바위에 새겨진 여덟 글자를 칼로 따라 썼다',
    study: '여덟 글자를 이틀 동안 칼로 써 내려갔다. 획이 이어질수록 초식이 이어진다.',
    end: '마지막 글자의 마지막 획만은 아무리 그어도 따라 그을 수가 없었다.',
  },
];

const trCarving: JourneyEventDef = {
  key: 'tr_carving',
  kind: 'TREASURE',
  label: () => '석벽의 검흔',
  once: false,
  build: (s) => {
    const v = pickFresh(s, 'tr_carving', CARVING_SCENES);
    return {
      title: v.title,
      category: 'LIFE',
      narration: v.narration,
      script: v.lines.map((t) => N(t)),
      options: [
        { id: 'study', label: v.studyLabel, hint: '장착 초식 숙련·깨달음' },
        { id: 'leave', label: '지나간다' },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    if (opt !== 'study') return s;
    const v = sceneOf(CARVING_SCENES, c.data?.vkey, s);
    let n = spendDays(s, 2);
    n = trainEquipped(n, 70);
    const g = gainInsight(n, 8, v.place);
    return say(highlight(g.state, v.mark), [
      ['나레이션', `${v.study} (장착 초식 숙련 +70)`],
      ['나레이션', `${v.end} ${g.text}`],
    ]);
  },
};

// 난파선: 모래톱의 배 · 폭풍 뒤 궤짝 · 썰물의 배
interface WreckScene extends FreshVariant {
  title: (s: GameState) => string;
  narration: string;
  script: (s: GameState) => SceneDialogueLine[];
  searchLabel: string;
  book: (title: string) => string;
  blade: (name: string) => string;
  coins: string;
  sealed: string; // 관아가 봉한 것
}
const WRECK_SCENES: WreckScene[] = [
  {
    id: 'ship',
    title: () => '모래톱에 얹힌 이국의 배',
    narration: '갯바위에 걸린 큰 배. 돛대가 부러졌고, 뱃머리에 낯선 글자가 새겨져 있다.',
    script: (s) => [
      N('갯바위에 걸린 거대한 배. 부러진 돛대 아래로 낯선 글자가 새겨진 궤짝들이 흩어져 있다.'),
      P(
        byCountry(s, '어부', '어민', '어부'),
        byCountry(
          s,
          '양인(洋人) 배라오. 사람은 다 죽었는지 아무도 없소. 관아에 알리면 골치 아프니 다들 모른 척하지요.',
          '양인(洋人) 배요. 사람은 다 죽었는지 아무도 없소. 관아에 알리면 귀찮아지니 다들 모른 척하지요.',
          '이국선이오. 사람은 다 죽었는지 아무도 없소. 반쇼에 알리면 골치 아프니 다들 모른 척하지요.'
        )
      ),
    ],
    searchLabel: '선실을 뒤진다 (2일)',
    book: (b) => `젖은 궤짝 안 기름종이에 싸인 책 한 권. ${b}! 그림 속 사람들이 낯선 자세로 칼을 겨누고 있다.`,
    blade: (w) => `선장실 벽에 걸린 가느다란 칼. 「${w}」!`,
    coins: '은화 몇 닢을 건졌다.',
    sealed: '배',
  },
  {
    id: 'crates',
    title: () => '폭풍 뒤 해변에 밀려온 궤짝',
    narration: '간밤의 폭풍이 지나간 해변에 낯선 궤짝들이 밀려와 있다. 바다 저편 어딘가에서 배 한 척이 부서졌을 것이다.',
    script: (s) => [
      N('폭풍이 지나간 아침, 모래밭에 낯선 글자가 찍힌 궤짝들이 흩어져 있다.'),
      P(byCountry(s, '갯마을 아이', '어촌 아이', '어촌 아이'), `${kidCall(s)}, 그거 열지 마요. 양인 귀신 붙은 거래요.`, '멀찍이 서서'),
    ],
    searchLabel: '궤짝을 하나하나 뜯어 본다 (2일)',
    book: (b) => `소금물에 절은 궤짝 하나에 밀랍 먹인 책이 들어 있었다. ${b}!`,
    blade: (w) => `기다란 궤짝 안, 기름 먹인 천에 싸인 칼. 「${w}」!`,
    coins: '궤짝 바닥에서 은화 몇 닢이 굴러 나왔다.',
    sealed: '궤짝',
  },
  {
    id: 'tide',
    title: (s) => byCountry(s, '썰물에 드러난 이양선(異樣船)', '썰물에 드러난 양선(洋船)', '썰물에 드러난 이국선(異國船)'),
    narration: '썰물이 빠지자 갯벌 한가운데 반쯤 잠긴 배의 뼈대가 드러났다. 물이 다시 차기 전에 다녀와야 한다.',
    script: () => [
      N('썰물이 빠지자 갯벌 한가운데 반쯤 잠긴 배의 뼈대가 드러났다. 물이 다시 차기 전에 다녀와야 한다.'),
      P('늙은 어부', '물때를 잘 보시오. 저기 갔다가 물에 갇힌 사람이 한둘이 아니오.', '그물을 깁다 말고'),
    ],
    searchLabel: '물이 차기 전에 선실을 뒤진다 (2일)',
    book: (b) => `물 빠진 선실 선반에 쇠상자가 걸려 있었다. 안에는 ${b}!`,
    blade: (w) => `뻘에 박힌 선실 문짝 뒤에서 녹슬지 않은 칼 한 자루를 찾았다. 「${w}」!`,
    coins: '뻘 속에서 은화 몇 닢을 건졌다.',
    sealed: '배',
  },
];

const trWreck: JourneyEventDef = {
  key: 'tr_wreck',
  kind: 'TREASURE',
  label: () => '난파선',
  once: false,
  cond: (_s, r) => r.legs.some((l) => l.terrain === 'COAST'),
  build: (s) => {
    const v = pickFresh(s, 'tr_wreck', WRECK_SCENES);
    return {
      title: v.title(s),
      category: 'FANTASY',
      narration: v.narration,
      script: v.script(s),
      options: [
        { id: 'search', label: v.searchLabel, hint: '서양 서적·병기' },
        { id: 'report', label: `${byCountry(s, '관아에', '관아에', '반쇼(番所)에')} 알린다 (1일)`, hint: '명성·조정의 신임' },
        { id: 'leave', label: '모른 척한다' },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    const v = sceneOf(WRECK_SCENES, c.data?.vkey, s);
    if (opt === 'search') {
      let n = spendDays(s, 2);
      if (chance(0.5)) {
        const id = pickBook(n, (b) => b.rarity === 'WESTERN');
        if (id) {
          const g = giveBook(n, id, 10);
          n = addRep(g.state, { arcane: 3 });
          return say(highlight(n, `난파선에서 ${josa(g.title || '', '을를')} 건졌다`), [['나레이션', v.book(g.title || '')]]);
        }
      }
      const g = giveWeapon(n, rand(['wp_we_01', 'wp_we_02', 'wp_we_05']));
      if (g.name) return say(highlight(g.state, `난파선에서 ${josa(`「${g.name}」`, '을를')} 건졌다`), [['나레이션', v.blade(g.name)]]);
      return say(addMoney(n, 30), [['나레이션', `${v.coins} (+${coin(n, 30)})`]]);
    }
    if (opt === 'report') {
      let n = spendDays(s, 1);
      n = addFame(addRep(n, { virtue: 3 }), 12);
      const obj = josa(v.sealed, '을를');
      return say(n, [
        [
          '나레이션',
          byCountry(
            s,
            `관아에 알리자 아전들이 몰려와 ${obj} 봉했다. 고을 원님이 이름을 물었다. (명성 +12)`,
            `관아에 알리자 아역들이 몰려와 ${obj} 봉했다. 지현(知縣)이 이름을 적어 갔다. (명성 +12)`,
            `반쇼에 알리자 관리들이 몰려와 ${obj} 봉했다. 부교소에서 이름을 적어 갔다. (명성 +12)`
          ),
        ],
      ]);
    }
    return s;
  },
};

// 봉인된 상자: 고목 뿌리 · 마른 우물 · 서낭당 돌무지
interface SealedScene extends FreshVariant {
  title: (s: GameState) => string;
  lines: (s: GameState) => string[];
  buryLabel: (s: GameState) => string;
  buryText: (s: GameState) => string;
  openText: string;
}
const SEALED_SCENES: SealedScene[] = [
  {
    id: 'roots',
    title: () => '부적으로 봉인된 상자',
    lines: () => [
      '고목 뿌리 사이, 겹겹이 부적이 붙은 검은 상자. 피로 쓴 글씨: 「열지 말 것」.',
      '상자에 손을 대자 손끝이 차갑게 저려 온다. 안에서 무언가가 기다리고 있다.',
    ],
    buryLabel: () => '더 깊이 묻고 돌을 얹는다',
    buryText: () => '상자를 더 깊이 묻고 큰 돌을 얹었다. 손끝의 냉기가 가셨다.',
    openText: '부적이 저절로 타올랐다. 상자 안에는 이 세상의 것이 아닌 책 한 권.',
  },
  {
    id: 'well',
    title: () => '마른 우물 속 쇠사슬 상자',
    lines: () => [
      '사람이 떠난 마을의 마른 우물. 두레박줄 대신 쇠사슬이 드리워져 있다.',
      '사슬을 끌어 올리자 부적이 겹겹이 붙은 검은 상자가 올라온다. 피로 쓴 글씨: 「열지 말 것」.',
    ],
    buryLabel: () => '사슬째 우물 바닥에 도로 떨어뜨린다',
    buryText: () => '사슬을 놓자 상자가 어둠 속으로 떨어졌다. 한참 뒤에야 바닥에 닿는 소리가 났다. 손끝의 냉기가 가셨다.',
    openText: '사슬이 저절로 삭아 끊어졌다. 상자 안에서 물비린내와 함께 이 세상의 것이 아닌 책 한 권이 나왔다.',
  },
  {
    id: 'altar',
    title: (s) => byCountry(s, '서낭당 돌무지 밑의 상자', '토지묘(土地廟) 제단 밑의 상자', '호코라(祠) 밑에 묻힌 상자'),
    lines: (s) => [
      byCountry(
        s,
        '고갯마루 서낭당. 무너진 돌무지 틈으로 부적이 감긴 상자 모서리가 비죽 나와 있다.',
        '길가 토지묘의 제단이 내려앉았다. 그 밑에 부적으로 칭칭 감긴 상자가 깔려 있다.',
        '숲속 작은 호코라가 쓰러졌다. 그 밑 흙 속에서 부적이 겹겹이 붙은 상자가 드러났다.'
      ),
      '상자에 손을 대자 손끝이 차갑게 저려 온다. 누군가 이것을 신의 발밑에 눌러 두었던 것이다.',
    ],
    buryLabel: (s) => byCountry(s, '돌무지를 다시 쌓아 도로 눌러 둔다', '제단을 다시 세워 도로 눌러 둔다', '사당을 다시 세워 도로 눌러 둔다'),
    buryText: (s) =>
      `${byCountry(s, '돌을 하나하나 다시 쌓아', '무너진 제단을 다시 세워', '쓰러진 사당을 다시 세워')} 상자를 눌러 두었다. 손끝의 냉기가 가셨다.`,
    openText: '부적이 한 장씩 저절로 떨어져 나갔다. 상자 안에는 이 세상의 것이 아닌 책 한 권.',
  },
];

const trSealed: JourneyEventDef = {
  key: 'tr_sealed',
  kind: 'TREASURE',
  label: () => '봉인된 상자',
  // 일생에 세 번까지 (예전에는 한 번뿐이고 가중치도 낮아 금서를 만날 길이 거의 없었다)
  once: false,
  weight: 0.9,
  cond: (s) => Number(s.flags.storyMemory?.sealed_boxes || 0) < 3,
  build: (s) => {
    const v = pickFresh(s, 'tr_sealed', SEALED_SCENES);
    const lines = v.lines(s);
    return {
      title: v.title(s),
      category: 'FANTASY',
      illustration: '/assets/px_chr_v_sealed_box.jpg',
      narration: lines[0],
      script: lines.map((t) => N(t)),
      options: [
        { id: 'open', label: '봉인을 뜯는다', hint: '이계의 금서 — 이단 +12' },
        { id: 'bury', label: v.buryLabel(s), hint: '구도' },
        { id: 'leave', label: '못 본 척한다' },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    const v = sceneOf(SEALED_SCENES, c.data?.vkey, s);
    if (opt === 'open') {
      const id = pickBook(s, (b) => b.rarity === 'GRIMOIRE');
      let n = addRep(remember(s, 'sealed_boxes', String(Number(s.flags.storyMemory?.sealed_boxes || 0) + 1)), { arcane: 12 });
      if (id) {
        const g = giveBook(n, id, 0);
        n = highlight(g.state, `봉인된 상자에서 ${josa(g.title || '', '을를')} 꺼냈다`);
        return say(n, [
          ['나레이션', v.openText],
          ['나레이션', `${g.title} — 펼치자 글자가 꿈틀거렸다. (이단 +12)`],
        ]);
      }
      return say(n, [['나레이션', '상자는 비어 있었다. 그런데 그날 밤부터 이상한 꿈을 꾼다. (이단 +12)']]);
    }
    if (opt === 'bury') {
      const n = addRep(addStats(s, { wil: 2 }), { ascetic: 6 });
      return say(n, [['나레이션', `${v.buryText(s)} (정신 +2, 구도 +6)`]]);
    }
    return s;
  },
};

// ───────── 길 위의 돌발 사건 ─────────
// 도적: 덤불 · 고갯마루 · 여울목 · 야습 · 미끼 · 다리 통행세 (지형에 맞는 장면만)
interface BanditScene extends FreshVariant {
  terrain?: JourneyTerrain[];
  title: (name: string) => string;
  narration: string;
  scene: string;
  line: (s: GameState) => string;
  dir: string;
  flee: string;
  fleeText: string;
  paid: (loss: string) => string; // loss: 「15냥을」처럼 조사까지 붙은 말
}
const BANDIT_SCENES: BanditScene[] = [
  {
    id: 'thicket',
    title: (n) => `매복 — ${n}`,
    narration: '덤불이 갈라지며 칼 든 사내들이 길을 막아선다.',
    scene: '덤불이 갈라지더니 칼 든 사내들이 앞뒤로 길을 막아섰다.',
    line: (s) =>
      byCountry(s, '이 길은 우리 산채 길이여. 봇짐 내려놓고 가면 목숨은 붙여 주지.', '녹림의 길에는 녹림의 법이 있다. 통행세를 내라.', '노자를 두고 가라. 칼은… 뭐, 두고 가도 좋고.'),
    dir: '칼등으로 어깨를 두드리며',
    flee: '산길로 돌아서 피한다 (2일)',
    fleeText: '가시덤불을 헤치며 산길로 돌았다. 이틀을 잃고 팔다리가 긁혔다.',
    paid: (x) => `노자 ${x} 내주었다. 두목이 비웃으며 길을 비켰다.`,
  },
  {
    id: 'pass',
    terrain: ['MOUNTAIN', 'PASS', 'FOREST'],
    title: (n) => `고갯마루의 매복 — ${n}`,
    narration: '고갯마루에 돌무더기가 쌓여 길이 막혀 있다.',
    scene: '고갯마루에 누가 돌무더기를 쌓아 길을 막아 놓았다. 돌을 치우려 허리를 숙이는 순간, 바위 뒤에서 사내들이 일어선다.',
    line: (s) => byCountry(s, '허리 펴지 말고 그대로 봇짐이나 내려놓으시지.', '고개를 넘으려면 고갯값을 내야지.', '여기서부터는 우리 고개다. 짐을 두고 넘어가라.'),
    dir: '바위 위에서 내려다보며',
    flee: '왔던 길로 내려가 다른 고개로 돌아간다 (2일)',
    fleeText: '비탈을 미끄러지듯 내려와 다른 고개로 돌아갔다. 이틀을 잃고 발목이 시큰거린다.',
    paid: (x) => `노자 ${x} 바위 위로 던져 주었다. 사내들이 돌무더기 한쪽을 치워 주었다.`,
  },
  {
    id: 'ford',
    terrain: ['RIVER', 'COAST'],
    title: (n) => `여울목의 매복 — ${n}`,
    narration: '여울을 건너려는데 맞은편 둑에 칼 든 사내들이 늘어선다.',
    scene: '여울을 건너려 바짓가랑이를 걷는데, 맞은편 둑에 칼 든 사내들이 늘어선다. 등 뒤 갈대밭에서도 인기척이 난다.',
    line: (s) => byCountry(s, '물 건너는 값은 따로 받는 거 몰랐나?', '이 물길은 우리가 지킨다. 건너려면 뱃삯을 내라.', '물을 건너려면 건너는 값을 내야지. 물에 빠지기 싫으면.'),
    dir: '물가에 서서 히죽거리며',
    flee: '물길을 따라 하류로 멀리 돌아간다 (2일)',
    fleeText: '하류로 반나절을 내려가 얕은 여울을 찾았다. 젖은 몸으로 이틀을 걸었다.',
    paid: (x) => `노자 ${x} 둑 위로 던졌다. 사내들이 길을 터 주며 낄낄거렸다.`,
  },
  {
    id: 'night',
    title: (n) => `야습 — ${n}`,
    narration: '모닥불이 사위어 갈 무렵, 어둠 속에서 횃불이 일제히 켜진다.',
    scene: '모닥불이 사위어 갈 무렵, 어둠 속에서 횃불 여러 개가 한꺼번에 켜진다. 잠든 줄 알았던 숲이 일어선다.',
    line: (s) =>
      byCountry(s, '자는 척은 그만하시고, 봇짐 이리 주시지.', '불빛 하나로 우리를 불러들였으니, 손님 대접을 받아야겠소.', '불은 멀리서도 잘 보이지. 짐을 두고 어둠 속으로 꺼져라.'),
    dir: '횃불을 치켜들며',
    flee: '불을 걷어차고 어둠 속으로 몸을 뺀다 (2일)',
    fleeText: '어둠을 틈타 숲으로 몸을 뺐다. 밤새 길 아닌 길을 헤매다 이틀을 잃었다.',
    paid: (x) => `노자 ${x} 어둠 속에 던졌다. 횃불들이 하나둘 멀어졌다.`,
  },
  {
    id: 'lure',
    terrain: ['ROAD', 'FOREST', 'PASS', 'TOWN', 'MOUNTAIN'],
    title: (n) => `길가의 미끼 — ${n}`,
    narration: '길가에 쓰러져 신음하던 사내가 칼을 들고 일어선다.',
    scene: '길가에 쓰러진 사내가 신음한다. 다가가 일으키려는 순간, 사내의 소매에서 칼날이 번뜩이고 수풀이 일어선다.',
    line: (s) => byCountry(s, '착한 사람은 꼭 이렇게 걸린다니까.', '협객이라면 쓰러진 사람을 그냥 못 지나치지. 고맙게도.', '사람 좋은 것도 병이야. 짐 내려놔.'),
    dir: '흙을 털고 일어서며',
    flee: '덤불로 뛰어들어 길을 버린다 (2일)',
    fleeText: '덤불로 뛰어들어 길을 버렸다. 이틀을 돌아 큰길로 나왔다. 가시에 긁힌 자국이 쓰라리다.',
    paid: (x) => `노자 ${x} 바닥에 내려놓았다. 다친 척하던 사내가 그것을 주워 들고 넙죽 절하는 시늉을 했다.`,
  },
  {
    id: 'toll',
    terrain: ['RIVER', 'ROAD', 'TOWN'],
    title: (n) => `다리 위의 통행세 — ${n}`,
    narration: '외나무다리 앞에 장대를 가로질러 놓고 사내들이 통행세를 받는다.',
    scene: '외나무다리 앞에 장대를 가로질러 놓고 사내들이 통행세를 받고 있다. 나라에서 둔 사람들은 아니다.',
    line: (s) => byCountry(s, '다리 하나 건너는 데 목숨까지 걸 건 없잖소?', '이 다리는 우리 형제들이 놓았소. 건너려면 값을 치르시오.', '이 다리를 건너는 값이다. 싫으면 헤엄을 치든가.'),
    dir: '장대를 툭툭 치며',
    flee: '다리를 버리고 상류의 얕은 곳을 찾아 돈다 (2일)',
    fleeText: '상류로 올라가 얕은 곳을 건넜다. 차가운 물살에 이틀을 잃었다.',
    paid: (x) => `통행세로 노자 ${x} 내주었다. 장대가 올라갔다.`,
  },
];

const ambBandit: JourneyEventDef = {
  key: 'amb_bandit',
  kind: 'AMBUSH',
  build: (s, c) => {
    const name = c.region?.bandit.name || '도적';
    const v = pickFresh(s, 'amb_bandit', byTerrain(BANDIT_SCENES, terrainOf(s, c.region)));
    return {
      title: v.title(name),
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: v.narration,
      script: [N(v.scene), P(c.region?.bandit.name || '도적 두목', v.line(s), v.dir, 'ANGRY')],
      options: [
        { id: 'fight', label: '칼을 뽑는다', hint: '⚠ 진검승부 · 지면 노자를 빼앗기고 수행을 접는다, 목숨도 장담 못 한다' },
        { id: 'pay', label: `노자를 내준다 (${coin(s, Math.max(10, Math.round(s.money * 0.15)))})` },
        { id: 'flee', label: v.flee, hint: '건강 -6' },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    if (opt === 'fight') {
      return journeyBattle(s, c, opt, {
        stakes: 'HOSTILE',
        title: `매복 — ${c.region?.bandit.name || '도적'}`,
        subtitle: c.region?.bandit.title || '길을 막은 도적',
        name: c.region?.bandit.name || '도적 두목',
        enemyTitle: c.region?.bandit.title || '도적',
        age: 34,
        ai: 'AGGRESSIVE',
        scale: roadScale(s, 0.8 + (c.region?.danger || 0.5) * 0.3),
        weapon: 'BLADE',
        skills: byCountry(s, ['base_h_slash', 'sk_kr_01', 'sk_kr_02'], ['base_h_slash', 'sk_cn_01', 'sk_cn_02'], ['base_h_slash', 'sk_jp_03', 'sk_jp_01']),
        rewardMoney: 25,
        rewardFame: 12,
      });
    }
    const v = sceneOf(BANDIT_SCENES, c.data?.vkey, s);
    if (opt === 'pay') {
      const loss = Math.max(10, Math.round(s.money * 0.15));
      return say(addMoney(s, -loss), [['나레이션', v.paid(josa(coin(s, loss), '을를'))]]);
    }
    const n = addHealth(spendDays(s, 2), -6);
    return say(n, [['나레이션', `${v.fleeText} (건강 -6)`]]);
  },
  onBattle: (s, _opt, won, c) => {
    if (won) return highlight(s, `${josa(c.region?.bandit.name || '도적', '을를')} 물리쳤다`);
    const loss = Math.max(10, Math.round(s.money * 0.25));
    return highlight(addMoney(s, -loss), `도적에게 져서 노자 ${josa(coin(s, loss), '을를')} 빼앗겼다`);
  },
};

// 맹수: 짐승의 종류(범·곰·무리·멧돼지 · 태호의 물도둑)에 맞는 장면만
type BeastKind = 'CAT' | 'BEAR' | 'PACK' | 'BOAR' | 'WATER' | 'OTHER';
const beastKind = (name: string): BeastKind =>
  /수적|물도둑/.test(name) ? 'WATER' : /산군|호랑이|범/.test(name) ? 'CAT' : /곰/.test(name) ? 'BEAR' : /늑대|들개/.test(name) ? 'PACK' : /멧돼지/.test(name) ? 'BOAR' : 'OTHER';
interface BeastScene extends FreshVariant {
  kinds: BeastKind[];
  title: (name: string) => string;
  narration: string;
  lines: (name: string, title: string) => string[];
  back: string;
  backText: string;
}
const BEAST_SCENES: BeastScene[] = [
  {
    id: 'silence',
    kinds: ['CAT', 'BEAR', 'PACK', 'BOAR', 'OTHER'],
    title: (n) => `맹수 — ${n}`,
    narration: '숲이 갑자기 조용해졌다. 새들이 일제히 날아오른다.',
    lines: (n, t) => ['숲이 갑자기 조용해졌다. 새들이 일제히 날아오르고, 풀숲 너머에서 낮은 숨소리가 들린다.', `${t}, ${ida(n)}.`],
    back: '눈을 마주친 채 천천히 물러난다 (2일)',
    backText: '짐승과 눈을 맞춘 채 한 걸음씩 물러났다. 등에 식은땀이 흘렀다. 이틀을 돌아갔다.',
  },
  {
    id: 'stalk',
    kinds: ['CAT'],
    title: (n) => `뒤를 밟는 기척 — ${n}`,
    narration: '반나절째 무언가가 따라오고 있다. 돌아보면 아무것도 없다.',
    lines: (n, t) => [
      '해 질 녘, 등 뒤에서 마른 가지 부러지는 소리가 난다. 돌아보면 아무것도 없다. 다시 걸으면 또 소리가 난다.',
      `반나절째 따라오던 것이 마침내 모습을 드러냈다. ${t}, ${ida(n)}.`,
    ],
    back: '등을 보이지 않고 뒷걸음질로 물러난다 (2일)',
    backText: '한 번도 등을 보이지 않고 뒷걸음질로 물러났다. 짐승은 끝내 따라오지 않았다. 이틀을 돌아갔다.',
  },
  {
    id: 'carcass',
    kinds: ['CAT', 'BEAR', 'PACK'],
    title: (n) => `먹이 곁의 맹수 — ${n}`,
    narration: '길섶에 사슴이 반쯤 뜯긴 채 쓰러져 있다. 피가 아직 굳지 않았다.',
    lines: (n) => [
      '길섶에 사슴 한 마리가 반쯤 뜯긴 채 쓰러져 있다. 피가 아직 굳지 않았다.',
      `먹이의 주인이 멀리 갔을 리 없다. 덤불 너머에서 ${josa(n, '이가')} 이빨을 드러낸다.`,
    ],
    back: '먹이에서 멀찍이 떨어져 길을 돌아간다 (2일)',
    backText: '먹이를 건드리지 않고 멀찍이 돌아갔다. 등 뒤에서 뼈 씹는 소리가 오래 들렸다. 이틀을 돌아갔다.',
  },
  {
    id: 'cubs',
    kinds: ['CAT', 'BEAR', 'BOAR'],
    title: (n) => `새끼를 지키는 어미 — ${n}`,
    narration: '덤불 속에서 새끼 두 마리가 굴러 나왔다. 그리고 등 뒤에서 땅이 울린다.',
    lines: (n) => [
      '덤불 속에서 새끼 두 마리가 굴러 나왔다. 귀엽다고 생각한 순간, 등 뒤에서 땅이 울린다.',
      `어미다. ${ida(n)}. 새끼와 사람 사이에 선 짐승은 물러서지 않는다.`,
    ],
    back: '새끼에게서 천천히 멀어진다 (2일)',
    backText: '새끼 쪽으로는 눈길도 주지 않고 천천히 멀어졌다. 어미는 한참을 노려보다 덤불로 사라졌다. 이틀을 돌아갔다.',
  },
  {
    id: 'howl',
    kinds: ['PACK'],
    title: (n) => `사방의 울음 — ${n}`,
    narration: '해가 지자 사방에서 울음소리가 번진다. 하나, 둘… 일곱.',
    lines: (n) => ['해가 지자 사방에서 울음이 번진다. 하나, 둘… 일곱. 울음이 점점 좁혀 온다.', `${ida(n)}. 무리는 지친 놈부터 노린다.`],
    back: '불을 피우고 바위를 등진 채 밤을 버틴다 (2일)',
    backText: '불을 피우고 바위를 등진 채 밤을 새웠다. 새벽이 되자 울음이 멀어졌다. 이틀이 갔다.',
  },
  {
    id: 'circle',
    kinds: ['PACK'],
    title: (n) => `포위 — ${n}`,
    narration: '사방 풀숲이 일제히 흔들린다. 어느새 둘러싸였다.',
    lines: (n) => ['사방 풀숲이 일제히 흔들린다. 낮은 으르렁거림이 앞에서, 옆에서, 뒤에서 들린다.', `${ida(n)}. 어느새 둘러싸였다.`],
    back: '한쪽을 정해 천천히 포위를 뚫고 물러난다 (2일)',
    backText: '돌을 던지고 고함을 지르며 한쪽을 뚫었다. 무리는 한참을 따라오다 흩어졌다. 이틀을 돌아갔다.',
  },
  {
    id: 'charge',
    kinds: ['BOAR'],
    title: (n) => `돌진 — ${n}`,
    narration: '땅을 파헤친 자국이 길 위로 이어진다.',
    lines: (n, t) => ['땅을 파헤친 자국이 길 위로 이어진다. 갑자기 덤불이 터지듯 갈라지며 시커먼 덩어리가 달려든다.', `${t}, ${ida(n)}.`],
    back: '나무 위로 뛰어올라 지나가길 기다린다 (2일)',
    backText: '나무 위로 뛰어올랐다. 짐승은 밑동을 몇 번 들이받더니 씩씩대며 사라졌다. 내려와 길을 돌아가는 데 이틀이 걸렸다.',
  },
  {
    id: 'eyes',
    kinds: ['CAT', 'BEAR', 'BOAR', 'OTHER'],
    title: (n) => `어둠 속의 눈 — ${n}`,
    narration: '밤길. 풀숲 너머에서 불빛 두 개가 깜박이지도 않고 이쪽을 본다.',
    lines: (n, t) => ['밤길. 풀숲 너머에서 불빛 두 개가 깜박이지도 않고 이쪽을 본다.', `달빛에 윤곽이 드러난다. ${t}, ${ida(n)}.`],
    back: '횃불을 높이 들고 천천히 길을 되돌린다 (2일)',
    backText: '횃불을 높이 든 채 길을 되돌렸다. 불빛 두 개는 한참 따라오다 사라졌다. 이틀을 돌아갔다.',
  },
  {
    id: 'reeds',
    kinds: ['WATER'],
    title: (n) => `갈대숲의 거룻배 — ${n}`,
    narration: '갈대숲 사이로 거룻배 몇 척이 소리 없이 미끄러져 나온다.',
    lines: (n, t) => ['호숫가 둑길. 갈대숲 사이로 거룻배 몇 척이 소리 없이 미끄러져 나온다.', `노를 젓던 사내들이 갈고리를 치켜든다. ${t}, ${ida(n)}.`],
    back: '둑길을 버리고 산 쪽으로 멀리 돌아간다 (2일)',
    backText: '둑길을 버리고 산 쪽으로 멀리 돌아갔다. 갈대숲에서 휘파람 소리가 한참 따라왔다. 이틀을 돌아갔다.',
  },
  {
    id: 'mist',
    kinds: ['WATER'],
    title: (n) => `물안개 속의 습격 — ${n}`,
    narration: '물안개 낀 둑길. 안개 속에서 노 젓는 소리가 가까워진다.',
    lines: (n) => ['물안개가 둑길을 덮었다. 안개 속에서 노 젓는 소리가 점점 가까워진다.', `둑 아래 배에서 사내들이 뛰어오른다. ${ida(n)}!`],
    back: '안개를 틈타 둑 아래 논길로 몸을 숨긴다 (2일)',
    backText: '안개 속에서 논두렁으로 몸을 숨겼다. 노 젓는 소리가 멀어질 때까지 진흙 속에 엎드려 있었다. 이틀을 돌아갔다.',
  },
  {
    id: 'ferryman',
    kinds: ['WATER'],
    title: (n) => `나룻배의 사공 — ${n}`,
    narration: '호수 한가운데서 사공이 노를 멈추고 씩 웃는다.',
    lines: (n) => ['호수를 건너는 나룻배를 얻어 탔다. 호수 한가운데에서 사공이 노를 멈추고 씩 웃는다.', `갈대숲에서 거룻배들이 다가온다. 사공도 한패다. ${ida(n)}!`],
    back: '배에서 뛰어내려 갈대숲까지 헤엄쳐 빠져나간다 (2일)',
    backText: '물로 뛰어들어 갈대숲까지 헤엄쳤다. 젖은 몸으로 이틀을 돌아갔다.',
  },
];

const ambBeast: JourneyEventDef = {
  key: 'amb_beast',
  kind: 'AMBUSH',
  build: (s, c) => {
    const name = c.region?.beast.name || '산짐승';
    const kind = beastKind(name);
    const fit = BEAST_SCENES.filter((v) => v.kinds.includes(kind));
    const v = pickFresh(s, 'amb_beast', fit.length ? fit : BEAST_SCENES.filter((x) => x.kinds.includes('OTHER')));
    return {
      title: v.title(name),
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: v.narration,
      script: v.lines(name, c.region?.beast.title || '굶주린 짐승').map((t) => N(t)),
      options: [
        {
          id: 'fight',
          label: '맞선다',
          hint: kind === 'WATER' ? '⚠ 진검승부 · 물도둑은 봐주지 않는다, 지면 수행을 접는다' : '⚠ 진검승부 · 짐승은 봐주지 않는다, 지면 수행을 접는다',
        },
        { id: 'back', label: v.back },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    if (opt === 'fight') {
      return journeyBattle(s, c, opt, {
        stakes: 'HOSTILE',
        title: `맹수 — ${c.region?.beast.name || '산짐승'}`,
        subtitle: c.region?.beast.title || '굶주린 짐승',
        name: c.region?.beast.name || '산짐승',
        enemyTitle: c.region?.beast.title || '맹수',
        age: 9,
        ai: 'HEAVY',
        scale: roadScale(s, 0.9),
        weapon: 'UNARMED',
        skills: ['sk_kr_03', 'sk_cn_01', 'sk_we_04'],
        rewardMoney: 15,
        rewardFame: 20,
      });
    }
    const v = sceneOf(BEAST_SCENES, c.data?.vkey, s);
    return say(spendDays(s, 2), [['나레이션', v.backText]]);
  },
  onBattle: (s, _opt, won, c) => {
    if (won) {
      const tiger = (c.region?.beast.name || '').includes('산군');
      const n = addFame(s, tiger ? 30 : 10);
      return highlight(n, tiger ? '호랑이를 잡아 마을의 은인이 되었다' : `${josa(c.region?.beast.name || '맹수', '을를')} 물리쳤다`);
    }
    const n = { ...addHealth(s, -18), statuses: [...s.statuses.filter((x) => x.id !== 'LIGHT_INJURY'), { id: 'LIGHT_INJURY' as const, label: '맹수에게 입은 상처', turnsRemaining: 2 }] };
    return highlight(n, `${c.region?.beast.name || '맹수'}에게 크게 다쳤다`);
  },
};

// 날씨: 계절마다 서너 가지, 지형에 따라 더 (낙석은 산·고개, 언 강은 강, 큰바람은 바닷가)
interface WeatherScene extends FreshVariant {
  terrain?: JourneyTerrain[];
  title: string;
  scene: string;
  waitLabel: string;
  waitText: string;
  pushLabel?: string;
  pushHint: string;
  pushText: string;
  hp: number; // 밀고 나갈 때 잃는 건강
  hurtP: number; // 몸살·부상 확률
  hurt: string; // 상태 이름
}
const inSeason = (season: GameState['season']) => (s: GameState) => s.season === season;
const WEATHER_SCENES: WeatherScene[] = [
  // 봄
  {
    id: 'sp_hail',
    when: inSeason('SPRING'),
    title: '꽃샘 우박',
    scene: '맑던 하늘에서 갑자기 우박이 쏟아진다. 콩알만 한 얼음이 머리를 두드린다.',
    waitLabel: '바위 밑에서 지나가길 기다린다 (3일)',
    waitText: '바위 밑에서 사흘을 버텼다. 하늘이 개자 다시 길을 나섰다.',
    pushHint: '건강 -10, 몸살이 날 수도',
    pushText: '이를 악물고 밀고 나갔다. 몸이 상했지만 다리는 단단해졌다.',
    hp: 10,
    hurtP: 0.35,
    hurt: '길에서 얻은 몸살',
  },
  {
    id: 'sp_thaw',
    when: inSeason('SPRING'),
    title: '해빙 진창',
    scene: '얼었던 길이 녹아 진창이 되었다. 한 걸음마다 발이 정강이까지 빠진다.',
    waitLabel: '길이 마를 때까지 근처 헛간에서 쉰다 (3일)',
    waitText: '헛간에서 사흘을 쉬었다. 봄볕에 길이 꾸덕꾸덕 말랐다.',
    pushHint: '건강 -8, 발목을 접질릴 수도',
    pushText: '진흙을 헤치며 걸었다. 신 한 짝을 잃었지만 다리는 단단해졌다.',
    hp: 8,
    hurtP: 0.3,
    hurt: '진창에서 접질린 발목',
  },
  {
    id: 'sp_dust',
    when: inSeason('SPRING'),
    title: '흙비 바람',
    scene: '서쪽 하늘이 누렇게 물들더니 흙먼지 바람이 몰아친다. 눈을 뜰 수가 없다.',
    waitLabel: '천으로 입을 막고 바위틈에서 기다린다 (3일)',
    waitText: '바위틈에서 사흘을 버텼다. 바람이 자자 온 세상이 누런 가루를 뒤집어쓰고 있었다.',
    pushHint: '건강 -10, 기침이 오래갈 수도',
    pushText: '천으로 입을 막고 걸었다. 목이 칼칼하지만 걸음은 멈추지 않았다.',
    hp: 10,
    hurtP: 0.35,
    hurt: '흙먼지에 상한 목',
  },
  // 여름
  {
    id: 'su_rain',
    when: inSeason('SUMMER'),
    title: '장마 폭우',
    scene: '하늘이 뚫린 듯 비가 쏟아진다. 개울이 순식간에 불어 길을 삼켰다.',
    waitLabel: '바위 밑에서 지나가길 기다린다 (3일)',
    waitText: '바위 밑에서 사흘을 버텼다. 물이 빠지자 다시 길을 나섰다.',
    pushHint: '건강 -10, 몸살이 날 수도',
    pushText: '불어난 개울을 헤치고 밀고 나갔다. 몸이 상했지만 다리는 단단해졌다.',
    hp: 10,
    hurtP: 0.35,
    hurt: '길에서 얻은 몸살',
  },
  {
    id: 'su_thunder',
    when: inSeason('SUMMER'),
    title: '마른하늘의 뇌우',
    scene: '마른하늘에 천둥이 울리더니, 벼락이 산등성이 고목을 둘로 쪼갠다. 칼 찬 사람이 서 있을 하늘이 아니다.',
    waitLabel: '칼을 풀어 멀리 두고 바위 밑에 웅크린다 (3일)',
    waitText: '칼을 풀어 멀찍이 두고 바위 밑에 웅크렸다. 사흘 내내 하늘이 울었다.',
    pushHint: '건강 -12, 몸이 상할 수도',
    pushText: '번개 사이를 달려 고개를 넘었다. 머리카락이 곤두서는 길이었다.',
    hp: 12,
    hurtP: 0.3,
    hurt: '벼락 곁에서 놀란 몸',
  },
  {
    id: 'su_heat',
    when: inSeason('SUMMER'),
    title: '불볕더위',
    scene: '땡볕에 길이 달아오른다. 우물 하나 보이지 않고, 매미 소리만 머리를 짓누른다.',
    waitLabel: '낮에는 그늘에서 쉬고 해 진 뒤에만 걷는다 (3일)',
    waitText: '낮에는 그늘에서 자고 밤에만 걸었다. 사흘이 더 걸렸다.',
    pushHint: '건강 -8, 더위를 먹을 수도',
    pushText: '땀을 비 오듯 쏟으며 한낮에도 걸었다. 입술이 갈라졌지만 다리는 단단해졌다.',
    hp: 8,
    hurtP: 0.4,
    hurt: '더위 먹은 몸',
  },
  {
    id: 'su_gale',
    when: inSeason('SUMMER'),
    terrain: ['COAST'],
    title: '바다에서 몰려온 큰바람',
    scene: '바닷바람이 미친 듯 불어온다. 초가지붕이 날아가고, 파도가 길까지 넘어온다.',
    waitLabel: '갯마을 헛간에 들어 바람이 자기를 기다린다 (3일)',
    waitText: '갯마을 헛간에서 사흘을 버텼다. 바람이 자자 해변에 부서진 배 조각이 가득했다.',
    pushHint: '건강 -12, 다칠 수도',
    pushText: '바람에 몸을 숙이고 갯길을 걸었다. 날아온 널빤지에 어깨를 맞았지만 걸음은 멈추지 않았다.',
    hp: 12,
    hurtP: 0.45,
    hurt: '큰바람에 다친 어깨',
  },
  // 가을
  {
    id: 'au_fog',
    when: inSeason('AUTUMN'),
    title: '산 안개',
    scene: '한 치 앞도 보이지 않는 안개가 산을 덮었다. 길이 사라졌다.',
    waitLabel: '안개가 걷히길 기다린다 (3일)',
    waitText: '사흘 동안 안개 속에 앉아 있었다. 안개가 걷히자 바로 발 앞이 낭떠러지였다.',
    pushHint: '건강 -10, 길을 잃고 다칠 수도',
    pushText: '더듬더듬 길을 찾아 나아갔다. 몇 번을 굴렀지만 다리는 단단해졌다.',
    hp: 10,
    hurtP: 0.35,
    hurt: '안개 속에서 구른 몸',
  },
  {
    id: 'au_gale',
    when: inSeason('AUTUMN'),
    title: '돌풍',
    scene: '마른 가랑잎과 모래를 휘감은 돌풍이 길을 쓸고 간다. 몸이 휘청거린다.',
    waitLabel: '바위 밑에서 바람이 자기를 기다린다 (3일)',
    waitText: '바위 밑에서 사흘을 버텼다. 바람이 자자 산이 반쯤 벌거숭이가 되어 있었다.',
    pushHint: '건강 -10, 몸살이 날 수도',
    pushText: '바람을 거슬러 한 걸음씩 나아갔다. 바람에 기대는 법을 몸이 배웠다.',
    hp: 10,
    hurtP: 0.35,
    hurt: '찬 바람에 얻은 몸살',
  },
  {
    id: 'au_rockfall',
    when: inSeason('AUTUMN'),
    terrain: ['MOUNTAIN', 'PASS'],
    title: '낙석',
    scene: '밤새 내린 비에 젖은 비탈에서 돌이 굴러 내린다. 머리만 한 돌이 길 위로 튀어 오른다.',
    waitLabel: '돌이 멎을 때까지 비탈 아래서 기다린다 (3일)',
    waitText: '비탈 아래 바위틈에서 사흘을 기다렸다. 돌 구르는 소리가 멎자 조심조심 길을 지났다.',
    pushHint: '건강 -14, 크게 다칠 수도',
    pushText: '돌이 구르는 틈을 노려 비탈을 달렸다. 튀어 오른 돌에 어깨를 맞았다.',
    hp: 14,
    hurtP: 0.45,
    hurt: '낙석에 다친 어깨',
  },
  {
    id: 'au_coldrain',
    when: inSeason('AUTUMN'),
    title: '가을 찬비',
    scene: '뼛속까지 스미는 찬비가 사흘째 그치지 않는다. 옷이 마를 틈이 없다.',
    waitLabel: '처마 밑을 찾아 비가 그치길 기다린다 (3일)',
    waitText: '빈 원두막 처마 밑에서 사흘을 보냈다. 비가 그치자 산이 붉게 물들어 있었다.',
    pushHint: '건강 -10, 고뿔이 들 수도',
    pushText: '젖은 옷으로 걷고 또 걸었다. 이가 딱딱 부딪혔지만 다리는 단단해졌다.',
    hp: 10,
    hurtP: 0.4,
    hurt: '찬비에 든 고뿔',
  },
  // 겨울
  {
    id: 'wi_blizzard',
    when: inSeason('WINTER'),
    title: '눈보라',
    scene: '눈보라가 몰아친다. 발자국이 금세 덮이고 손끝이 얼어붙는다.',
    waitLabel: '눈을 파고 들어가 지나가길 기다린다 (3일)',
    waitText: '눈을 파고 들어가 사흘을 버텼다. 눈굴 안은 생각보다 따뜻했다.',
    pushHint: '건강 -10, 몸살이 날 수도',
    pushText: '이를 악물고 밀고 나갔다. 몸이 상했지만 다리는 단단해졌다.',
    hp: 10,
    hurtP: 0.35,
    hurt: '눈보라에 언 손발',
  },
  {
    id: 'wi_ice',
    when: inSeason('WINTER'),
    title: '빙판길',
    scene: '얼어붙은 비탈길이 거울 같다. 한 걸음 디딜 때마다 미끄러진다.',
    waitLabel: '재를 얻어 뿌려 가며 한 걸음씩 간다 (3일)',
    waitText: '아궁이 재를 얻어 뿌려 가며 한 걸음씩 내려갔다. 사흘이 걸렸다.',
    pushHint: '건강 -10, 발목을 삘 수도',
    pushText: '미끄러지고 구르며 비탈을 내려왔다. 엉덩이가 멍투성이지만 중심 잡는 법은 늘었다.',
    hp: 10,
    hurtP: 0.45,
    hurt: '빙판에서 삔 발목',
  },
  {
    id: 'wi_cold',
    when: inSeason('WINTER'),
    title: '혹한',
    scene: '숨을 쉬면 콧속이 얼어붙는다. 물통의 물이 돌처럼 얼었다.',
    waitLabel: '민가에 들어 불을 얻어 쬐며 기다린다 (3일)',
    waitText: '산골 민가에서 사흘 동안 불을 얻어 쬐었다. 주인은 말없이 감자를 구워 주었다.',
    pushHint: '건강 -12, 동상을 입을 수도',
    pushText: '얼어붙은 길을 쉬지 않고 걸었다. 발가락 감각이 없어졌다가 돌아왔다.',
    hp: 12,
    hurtP: 0.4,
    hurt: '혹한에 언 발가락',
  },
  {
    id: 'wi_river',
    when: inSeason('WINTER'),
    terrain: ['RIVER'],
    title: '언 강',
    scene: '강이 얼어붙었다. 건너편까지 얼음이 이어졌지만, 그 두께는 아무도 모른다.',
    waitLabel: '다리를 찾아 강을 따라 걷는다 (3일)',
    waitText: '강을 따라 사흘을 걸어 나무다리를 찾았다.',
    pushLabel: '얼음 위로 건넌다',
    pushHint: '건강 -10, 얼음이 꺼질 수도',
    pushText: '얼음 위를 미끄러지듯 건넜다. 마지막 몇 걸음에서 얼음이 꺼져 허벅지까지 빠졌다.',
    hp: 10,
    hurtP: 0.45,
    hurt: '얼음물에 든 몸살',
  },
];

const ambWeather: JourneyEventDef = {
  key: 'amb_weather',
  kind: 'AMBUSH',
  build: (s, c) => {
    const v = pickFresh(s, 'amb_weather', byTerrain(WEATHER_SCENES, terrainOf(s, c.region)));
    return {
      title: v.title,
      category: 'LIFE',
      narration: v.scene,
      script: [N(v.scene)],
      options: [
        { id: 'wait', label: v.waitLabel },
        { id: 'push', label: v.pushLabel || '그대로 밀고 나간다', hint: v.pushHint },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    const v = sceneOf(WEATHER_SCENES, c.data?.vkey, s);
    if (opt === 'wait') return say(spendDays(s, 3), [['나레이션', v.waitText]]);
    let n = addHealth(s, -v.hp);
    if (chance(v.hurtP)) n = injure(n, v.hurt);
    return say(addStats(n, { vit: 1 }), [['나레이션', `${v.pushText} (건강 -${v.hp}, 체력 +1)`]]);
  },
};

// 검문: 조선(호패 · 용모파기 · 나루 · 역참), 일본(세키쇼 · 반쇼 · 오캇피키 · 나루) — 청은 검문 사건이 없다
interface CheckScene extends FreshVariant {
  terrain?: JourneyTerrain[];
  title: string;
  narration: string;
  scene: (s: GameState) => string;
  officer: string;
  line: string;
  fame: (sect: string) => string; // sect: 「도장 이름」이라는/라는 (조사까지)
  bribe: string;
  wait: string;
}
const isKorea = (s: GameState) => s.country === 'KOREA';
const isJapan = (s: GameState) => s.country === 'JAPAN';
const CHECK_SCENES: CheckScene[] = [
  {
    id: 'kr_hopae',
    when: isKorea,
    title: '관아 검문',
    narration: '포졸들이 길을 막고 호패를 보자 한다.',
    scene: () => '포졸들이 창을 엇갈려 길을 막는다.',
    officer: '포교',
    line: '칼 찬 자는 따로 신원을 확인해야 하오. 어디 소속이오?',
    fame: (x) => `${x} 말에 포교가 고개를 끄덕이며 길을 열었다.`,
    bribe: '엽전이 소매로 사라지자 창이 거두어졌다.',
    wait: '이틀 동안 이것저것 캐물은 끝에 겨우 풀려났다.',
  },
  {
    id: 'kr_wanted',
    when: isKorea,
    title: '용모파기(容貌疤記) 대조',
    narration: '포졸이 방(榜)을 펼쳐 들고 오가는 이들의 얼굴을 대조한다.',
    scene: () => '포졸이 방을 펼쳐 들고 얼굴을 하나하나 대조한다. 칼 쓰는 도적을 쫓는 중이라 한다.',
    officer: '포졸',
    line: '눈매가 매섭고, 칼을 찼고… 어째 닮은 것도 같은데. 어디서 오는 길이오?',
    fame: (x) => `${x} 말에 포졸이 방을 접었다. 「그 도장 분이시라면야…」`,
    bribe: '엽전 몇 닢에 포졸의 눈이 갑자기 흐려졌다. 「안 닮았네, 안 닮았어.」',
    wait: '관아까지 끌려가 이틀을 붙잡혀 있다가, 진짜 도적이 잡혔다는 기별에 풀려났다.',
  },
  {
    id: 'kr_ferry',
    when: isKorea,
    terrain: ['RIVER', 'COAST'],
    title: '나루터 검문',
    narration: '나루터 별장(別將)이 배에 오르는 이들의 봇짐을 하나하나 풀어 본다.',
    scene: () => '나루터. 별장이 배에 오르는 이들의 봇짐을 하나하나 풀어 본다.',
    officer: '나루 별장',
    line: '칼 찬 손님은 배에 태우기 전에 따로 적어 둬야 하오. 성명과 소속을 대시오.',
    fame: (x) => `${x} 말에 별장이 장부에 이름을 적더니 맨 먼저 배에 태워 주었다.`,
    bribe: '엽전이 소매로 들어가자 봇짐은 풀어 보지도 않았다.',
    wait: '이틀 동안 봇짐을 풀었다 쌌다 한 끝에 겨우 배에 올랐다.',
  },
  {
    id: 'kr_station',
    when: isKorea,
    title: '역참 앞 검문',
    narration: '역참 앞에서 역졸들이 칼 찬 나그네를 불러 세운다.',
    scene: () => '파발마가 먼지를 일으키며 지나간 뒤, 역졸들이 칼 찬 나그네를 불러 세운다.',
    officer: '역졸',
    line: '요즘 역마를 노리는 놈들이 있어서 말이오. 칼 찬 사람은 다 묻소. 어디로 가오?',
    fame: (x) => `${x} 말에 역졸이 머리를 긁적이며 「찰방 나리께 말씀 올려 두겠소」 하고 길을 열었다.`,
    bribe: '엽전 몇 닢이 오가자 역졸은 딴 데를 보았다.',
    wait: '이틀 동안 찰방(察訪)의 물음에 답한 끝에 겨우 풀려났다.',
  },
  {
    id: 'jp_sekisho',
    when: isJapan,
    title: '세키쇼(關所) 검문',
    narration: '관문 앞에서 관리가 통행증을 보자 한다. 「들어오는 총포, 나가는 여인」을 엄히 살핀다.',
    scene: (s) => `${s.journey?.regionId === 'JP_TOKAIDO' ? '하코네 관문.' : '고갯길 관문.'} 관리가 뒷짐을 지고 줄 선 이들을 훑어본다.`,
    officer: '관문 관리',
    line: '칼 찬 자는 따로 신원을 확인해야 하오. 어디 소속이오?',
    fame: (x) => `${x} 말에 관리가 고개를 끄덕이며 길을 열었다.`,
    bribe: '종이에 싼 돈이 소매로 사라지자 창이 거두어졌다.',
    wait: '이틀 동안 이것저것 캐물은 끝에 겨우 풀려났다.',
  },
  {
    id: 'jp_bansho',
    when: isJapan,
    title: '번(藩) 경계의 반쇼(番所)',
    narration: '번 경계의 반쇼. 다른 번에서 온 칼잡이는 칼 길이까지 적어 둔다.',
    scene: () => '번 경계를 지키는 반쇼. 아시가루(足輕) 둘이 창을 세우고, 반쇼 무사가 장부를 펼친다.',
    officer: '반쇼 무사',
    line: '어느 번 소속이오? 칼은 몇 치요? 낭인이라면 사정이 달라지오.',
    fame: (x) => `${x} 말에 반쇼 무사가 붓을 멈추고 고개를 숙였다. 「귀 도장의 이름은 들었소.」`,
    bribe: '종이에 싼 돈을 건네자 장부 위의 붓이 빨라졌다.',
    wait: '이틀 동안 칼 길이, 고향, 스승의 이름까지 적고서야 풀려났다.',
  },
  {
    id: 'jp_okappiki',
    when: isJapan,
    title: '오캇피키(岡っ引)의 심문',
    narration: '짓테(十手)를 허리에 찬 오캇피키가 길을 막는다. 칼 쓰는 낭인을 찾는 중이라 한다.',
    scene: () => '짓테를 허리에 찬 오캇피키가 길을 막아선다. 뒤에 졸개 둘이 따라붙었다.',
    officer: '오캇피키',
    line: '요 앞 마을에서 칼부림이 났소. 칼 찬 나그네는 죄다 물어봐야 하오. 어제 어디 있었소?',
    fame: (x) => `${x} 말에 오캇피키가 짓테를 거두었다. 「그 도장 분이 그럴 리가 없지요.」`,
    bribe: '종이에 싼 돈이 오캇피키의 품으로 들어가자 「수고하십시오」 소리가 나왔다.',
    wait: '이틀 동안 마을 반쇼에 붙들려 있다가, 진범이 잡히고서야 풀려났다.',
  },
  {
    id: 'jp_ferry',
    when: isJapan,
    terrain: ['RIVER', 'COAST'],
    title: '나루터 반쇼',
    narration: '강 나루터 반쇼에서 뱃삯과 함께 통행증(手形)을 보자 한다.',
    scene: () => '강가 나루터. 반쇼 관리가 배에 오르는 이들의 통행증을 하나하나 들여다본다.',
    officer: '나루터 관리',
    line: '데가타(手形)를 보이시오. 칼 찬 분은 따로 적어야 하오.',
    fame: (x) => `${x} 말에 관리가 데가타도 보지 않고 배에 태웠다.`,
    bribe: '종이에 싼 돈이 오가자 데가타 검사가 끝났다.',
    wait: '이틀 동안 강가에서 순서를 기다린 끝에 겨우 배에 올랐다.',
  },
];

const ambCheckpoint: JourneyEventDef = {
  key: 'amb_checkpoint',
  kind: 'AMBUSH',
  cond: (s) => s.country === 'JAPAN' || s.country === 'KOREA',
  build: (s, c) => {
    const v = pickFresh(s, 'amb_checkpoint', byTerrain(CHECK_SCENES, terrainOf(s, c.region)));
    return {
      title: v.title,
      category: 'LIFE',
      sceneActor: 'ENEMY',
      narration: v.narration,
      script: [N(v.scene(s)), P(v.officer, v.line)],
      options: [
        { id: 'fame', label: '도장의 이름을 댄다', hint: s.fame >= 300 ? '명성이 있어 통할 것이다' : '아직 이름이 알려지지 않았다', disabled: s.fame < 300, disabledReason: '명성 300 이상' },
        { id: 'bribe', label: `찔러 준다 (${coin(s, 15)})`, disabled: s.money < 15, disabledReason: '노자가 부족하다' },
        { id: 'wait', label: '순순히 조사를 받는다 (2일)' },
      ],
      meta: { vkey: v.id },
    };
  },
  resolve: (s, opt, c) => {
    const v = sceneOf(CHECK_SCENES, c.data?.vkey, s);
    if (opt === 'fame') return say(addFame(s, 3), [['나레이션', v.fame(irago(`「${s.sectName}」`))]]);
    if (opt === 'bribe') return say(addRep(addMoney(s, -15), { commerce: 3 }), [['나레이션', v.bribe]]);
    return say(spendDays(s, 2), [['나레이션', v.wait]]);
  },
};

export const COMMON_EVENTS: JourneyEventDef[] = [
  inn,
  shrine,

  // ───────── 대오(大悟)의 장소 ─────────
  ...(
    [
      ['vista_jiri', '천왕봉 일출', '운해(雲海)가 발아래 깔렸다. 동쪽 끝에서 붉은 해가 솟는다. 산 전체가 숨을 멈춘 듯하다.', '구름은 칼끝을 피하지 않는다. 그저 갈라졌다가 다시 하나가 된다.'],
      ['vista_geumgang', '구룡폭포', '아홉 마리 용이 산다는 못 위로 천 길 물줄기가 쏟아진다. 물보라가 무지개를 만든다.', '물은 바위를 이기려 하지 않는다. 그런데도 바위가 패인다.'],
      ['vista_huashan', '장공잔도', '천 길 낭떠러지에 박힌 판자 한 장. 발밑으로 구름이 흐르고, 등 뒤로는 절벽이 숨 쉰다.', '한 걸음 헛디디면 끝이다. 그런데 이상하게도, 칼을 쥘 때보다 마음이 고요하다.'],
      ['vista_wudang', '무당산 금정', '구름 위 구리 전각이 햇빛을 받아 금빛으로 탄다. 바람이 사방에서 불어와 한 점으로 모인다.', '태극은 처음과 끝이 없다. 초식도 그러해야 하지 않겠는가.'],
      ['vista_kurama', '구라마산의 밤', '천 년 묵은 삼나무 뿌리가 땅 위로 드러나 길을 막는다. 달빛 아래, 누군가 나뭇가지 위에서 지켜보는 기척이 있다.', '보이지 않는 상대와 백 번을 겨뤘다. 백 번째에야 그것이 내 그림자임을 알았다.'],
      ['vista_sakurajima', '사쿠라지마 분연', '바다 한가운데 화산이 잿빛 연기를 하늘로 밀어 올린다. 땅이 낮게 울린다.', '산은 참지 않는다. 터질 때 터진다. 첫 칼에 모든 것을 거는 이들이 왜 이 땅에서 났는지 알 것 같다.'],
    ] as const
  ).map(
    ([key, title, scene, thought]): JourneyEventDef => ({
      key,
      kind: 'VISTA',
      label: () => title,
      once: true,
      build: (s) => ({
        title: `대오(大悟)의 자리 — ${title}`,
        category: 'HISTORICAL',
        illustration: `/assets/px_jr_${key}.jpg`,
        narration: scene,
        script: [N(scene), H(s, thought, '숨을 고르며')],
        options: [
          {
            id: 'gaze',
            label: '사흘을 머물며 바라본다 (3일)',
            hint: s.skills.some((sk) => sk.masteryLevel === 9 && sk.masteryExp >= 800)
              ? '벽에 닿은 초식의 깨달음이 크게 쌓인다 — 벽이 무너질 수도 있다'
              : '벽에 닿은 초식이 없다. 마음만 맑아질 것이다',
          },
          { id: 'leave', label: '눈에만 담고 떠난다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt !== 'gaze') return s;
        let n = spendDays(s, 3);
        n = addStats(n, { wil: 2, ins: 2 });
        const g = gainInsight(n, 25 + Math.floor(Math.random() * 16), title);
        n = highlight(g.state, g.transcended ? `${title}에서 극의에 이르렀다` : `${title}에서 사흘을 머물렀다`);
        return say(n, [
          ['나레이션', `사흘 밤낮을 ${title} 앞에 앉아 있었다. (정신 +2, 통찰 +2)`],
          ['나레이션', g.text],
        ]);
      },
    })
  ),

  trRuin,
  trSwordgrave,
  trCarving,
  trWreck,
  trSealed,

  ambBandit,
  ambBeast,
  ambWeather,
  ambCheckpoint,
];
