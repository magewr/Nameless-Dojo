import { GameState } from '../../types/game';
import {
  addFame,
  addHealth,
  addMoney,
  addPoiAhead,
  addRep,
  addStats,
  byCountry,
  chance,
  clearAmbushes,
  cur,
  gainInsight,
  highlight,
  JourneyEventDef,
  journeyBattle,
  N,
  P,
  rand,
  roadScale,
  say,
  spendDays,
  trainEquipped,
} from '../../engine/journeyCore';
import { createDiscipleEntity } from '../events';
import { getMaxDisciples } from '../../engine/gameLogic';
import { makePersonName } from '../../engine/tourney';
import { josa } from '../../utils/korean';

// 주인공의 상태·이력에 따라 발동하는 길 위의 사건.
// 명성·나이·세평·주머니·몸 상태, 극의와 우승 경력, 숙적과 가족, 그리고 지난 무사수행에서 내린 선택이 방아쇠다.

const hasRoom = (s: GameState) => s.disciples.filter((d) => !d.dead).length < getMaxDisciples(s.facilities);

export const CONDITIONAL_EVENTS: JourneyEventDef[] = [
  // ───────── 명성이 높으면 — 길에서 알아본다 ─────────
  {
    key: 'c_recognized',
    kind: 'PEOPLE',
    trigger: { fame: [800, 999999], terrain: ['TOWN', 'ROAD'] },
    label: () => '수군거리는 길손들',
    build: (s) => ({
      title: '알아보는 사람들',
      category: 'LIFE',
      narration: `주막에 들어서자 웅성거림이 멎는다. 「저 사람… ${s.sectName}의 ${s.name} 아닌가?」`,
      script: [N(`주막에 들어서자 웅성거림이 멎었다. 「저 사람… ${s.sectName}의 ${s.name} 아닌가?」`), P('젊은 무사', '선배님! 한 수만 가르쳐 주십시오! 아니면… 한 합만이라도!', '무릎을 꿇으며')],
      options: [
        { id: 'teach', label: '마당에서 젊은이들에게 한 수 가르친다 (1일)', hint: '명성·구도' },
        { id: 'spar', label: '가장 센 녀석과 한 합 겨뤄 준다', hint: '목검 시합' },
        { id: 'hide', label: '삿갓을 눌러쓰고 조용히 밥만 먹는다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'hide') return say(s, [['나레이션', '이름이 알려지면 조용히 밥 먹기도 어렵다.']]);
      if (opt === 'teach') return say(addRep(addFame(spendDays(s, 1), 15), { ascetic: 6, virtue: 4 }), [['나레이션', '젊은이들이 해가 질 때까지 마당을 떠나지 않았다. (명성 +15)']]);
      return journeyBattle(s, c, opt, { stakes: 'SPAR', title: '주막 마당의 한 합', subtitle: '선배에게 도전하는 젊은 무사', name: makePersonName(s.country), enemyTitle: '무사수행 중인 젊은이', age: 22, ai: 'RUSHDOWN', scale: roadScale(s, 0.85), weapon: 'BLADE', skills: byCountry(s, ['sk_kr_01', 'sk_kr_06', 'base_h_slash'], ['sk_cn_01', 'sk_cn_05', 'base_h_slash'], ['sk_jp_03', 'sk_jp_01', 'base_h_slash']), rewardFame: 15 });
    },
    onBattle: (s, _opt, won) => say(won ? addRep(s, { ascetic: 4 }) : addFame(s, -15), [['나레이션', won ? '젊은이가 땅에 이마를 댔다. 「평생 오늘을 잊지 않겠습니다.」' : '젊은이의 칼끝이 먼저 닿았다. 주막이 술렁였다. 소문은 발이 빠르다.']]),
  },
  // ───────── 나이가 들면 — 가르침을 청하는 젊은이 ─────────
  {
    key: 'c_young_seeker',
    kind: 'PEOPLE',
    once: true,
    trigger: { age: [55, 120] },
    label: () => '따라오는 젊은이',
    build: () => ({
      title: '사흘째 따라오는 젊은이',
      category: 'FAMILY',
      sceneActor: 'DISCIPLE',
      narration: '사흘째 같은 젊은이가 멀찍이 뒤를 따라온다. 걸음이 가볍고 눈빛이 매섭다.',
      script: [N('사흘째, 같은 젊은이가 열 걸음 뒤에서 따라온다. 돌아보면 멈춰 서고, 걸으면 따라온다.'), P('젊은이', '어르신의 걸음에 빈틈이 없습니다. 저는 무사수행 중인데… 스승을 찾고 있었습니다.', '마침내 다가와 무릎을 꿇으며')],
      options: [
        { id: 'take', label: '도장으로 데려간다', hint: '재능 있는 문하생' },
        { id: 'lesson', label: '사흘 동안 길 위에서 가르쳐 보낸다 (3일)', hint: '구도·정신' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'take' && hasRoom(s)) {
        const d = { ...createDiscipleEntity(s, { isGenius: chance(0.5), archetype: '길에서 따라온 무사수행자', temperament: 'DILIGENT' }), joinedYear: s.year, temperamentKnown: true, loyalty: 80 };
        return say(highlight({ ...s, disciples: [...s.disciples, d] }, `길에서 만난 ${josa(d.name, '을를')} 제자로 받았다`), [['나레이션', `${josa(d.name, '이가')} 봇짐을 고쳐 메고 뒤를 따랐다. 이제는 열 걸음이 아니라 한 걸음 뒤에서.`]]);
      }
      return say(addRep(addStats(spendDays(s, 3), { wil: 2 }), { ascetic: 8 }), [['나레이션', '사흘 동안 걸으며 가르쳤다. 갈림길에서 젊은이가 큰절을 하고 제 길로 떠났다.']]);
    },
  },
  // ───────── 살기가 높으면 — 현상금 사냥꾼 ─────────
  {
    key: 'c_bounty_hunter',
    kind: 'PEOPLE',
    trigger: { minRep: { ruthless: 60 } },
    label: () => '뒤를 밟는 그림자',
    build: (st) => ({
      title: '현상금 사냥꾼',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '피 묻은 칼 소문은 멀리 간다. 누군가 그대의 목에 값을 매겼다.',
      script: [N('갈대밭 길. 아까부터 같은 발소리가 따라온다.'), P('현상금 사냥꾼', '당신 목에 걸린 값이 꽤 되더군. 원한 산 데가 한두 군데가 아니라서.', '쇠사슬 낫을 풀며', 'ANGRY')],
      options: [
        { id: 'fight', label: '맞선다', hint: '⚠ 진검승부' },
        { id: 'pay', label: `더 큰 돈으로 산다 (80${cur(st)})`, hint: st.money < 80 ? '주머니가 모자라다' : '돈으로 끝낸다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'pay') {
        if (s.money < 80) return say(addHealth(s, -12), [['나레이션', '주머니가 모자랐다. 사냥꾼은 코웃음을 치며 팔에 칼자국 하나를 남기고 사라졌다.']]);
        return say(addMoney(s, -80), [['현상금 사냥꾼', '돈이면 다 되지. 다음엔 다른 놈이 올 거요.']]);
      }
      return journeyBattle(s, c, opt, { title: '현상금 사냥꾼', subtitle: '살기의 대가', name: '쇠사슬 낫의 사냥꾼', enemyTitle: '현상금 사냥꾼', age: 36, ai: 'RANGED', scale: roadScale(s, 1.1), weapon: 'THROWN', skills: ['sk_cn_07', 'sk_jp_07', 'sk_cn_02'], realDuel: true, rewardMoney: 60, rewardFame: 10 });
    },
  },
  // ───────── 인덕이 높으면 — 마을이 숨겨 준다 ─────────
  {
    key: 'c_village_shelter',
    kind: 'PEOPLE',
    trigger: { minRep: { virtue: 60 }, terrain: ['TOWN', 'FOREST', 'ROAD'] },
    label: () => '손짓하는 마을 사람',
    build: () => ({
      title: '은혜를 아는 마을',
      category: 'LIFE',
      narration: '낯선 마을 사람이 손짓한다. 「혹시… 의로운 무사님? 이 길 앞에 패거리가 숨어 있습니다요.」',
      script: [N('밭일하던 노인이 낫을 내려놓고 다가온다.'), P('마을 노인', '무사님 소문 들었습니다요. 이 앞 고개에 패거리가 숨어 있으니, 오늘은 우리 집에서 주무시고 샛길로 가십시오.', '목소리를 낮추며')],
      options: [
        { id: 'stay', label: '하룻밤 신세를 진다 (1일)', hint: '이 구간의 매복을 피한다 · 건강' },
        { id: 'thank', label: '고맙다며 그냥 간다' },
      ],
    }),
    resolve: (s, opt) => (opt === 'stay' ? say(clearAmbushes(addHealth(spendDays(s, 1), 10)), [['나레이션', '따뜻한 저녁을 얻어먹고 샛길을 안내받았다. 이 구간에서는 매복을 만나지 않을 것이다. (건강 +10)']]) : s),
  },
  // ───────── 주머니가 비면 ─────────
  {
    key: 'c_broke',
    kind: 'PEOPLE',
    trigger: { money: [0, 24] },
    label: () => '바닥난 노자',
    build: (s) => ({
      title: '노자가 바닥났다',
      category: 'LIFE',
      narration: `주머니를 털어 보니 ${s.money}${cur(s)}. 오늘 저녁 밥값도 안 된다.`,
      script: [N(`주머니를 뒤집어 보았다. ${s.money}${cur(s)}. 국밥 한 그릇 값도 안 된다.`)],
      options: [
        { id: 'labor', label: '이틀 동안 짐꾼으로 품을 판다 (2일)', hint: `+30${cur(s)} · 체력` },
        { id: 'perform', label: '장터에서 무예를 보여 주고 동전을 받는다', hint: '+20 · 명성이 조금 깎인다' },
        { id: 'starve', label: '허리띠를 졸라맨다', hint: '건강 -8' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'labor') return say(addStats(addMoney(spendDays(s, 2), 30), { vit: 1 }), [['나레이션', '등짐을 지고 고개를 열 번 넘었다. 칼보다 무거운 게 쌀가마였다. (체력 +1)']]);
      if (opt === 'perform') return say(addFame(addMoney(s, 20), -3), [['나레이션', `동전이 쏟아졌다. 「${s.sectName} 도장주가 장터에서 재주를 판다」는 소문이 날지도 모르겠다.`]]);
      return addHealth(s, -8);
    },
  },
  // ───────── 몸이 상하면 — 길에서 쓰러진다 ─────────
  {
    key: 'c_collapse',
    kind: 'PEOPLE',
    trigger: { health: [0, 44] },
    label: () => '흐려지는 눈앞',
    build: () => ({
      title: '길 위에서 쓰러지다',
      category: 'LIFE',
      narration: '눈앞이 하얘지더니 다리가 풀렸다.',
      script: [N('눈앞이 하얘지더니 다리가 풀렸다. 흙냄새가 코에 닿았다.'), N('…눈을 뜨니 낯선 초가 천장. 약 달이는 냄새가 난다.'), P('약초 캐는 노파', '사흘을 내리 잤소. 몸을 그리 혹사하면 칼보다 먼저 몸이 부러지오.', '탕약 그릇을 내밀며')],
      options: [{ id: 'rest', label: '노파의 말을 듣고 며칠 더 쉰다 (모두 6일)', hint: '건강 크게 회복' }],
    }),
    resolve: (s) => say(addHealth(spendDays(s, 6), 28), [['나레이션', '엿새 만에 다시 길에 섰다. 노파는 돈을 한사코 받지 않았다. (건강 +28)']]),
  },
  // ───────── 배우자 — 집에서 온 편지 ─────────
  {
    key: 'c_letter',
    kind: 'PEOPLE',
    trigger: { spouse: true, day: [35, 90], terrain: ['TOWN', 'ROAD'] },
    label: () => '역참의 편지',
    build: (s) => ({
      title: '집에서 온 편지',
      category: 'FAMILY',
      sceneActor: 'SPOUSE',
      narration: `역참에 ${s.spouse?.name || '집'}에게서 온 편지가 기다리고 있었다.`,
      script: [N(`역졸이 편지 한 통을 건넨다. ${s.spouse?.name || '집'}의 글씨다.`), P(s.spouse?.name || '반려', `도장은 무탈합니다. 아이들도 제자들도 잘 지내요. 다만… 밤이 길어요. 몸 성히 돌아오세요.`)],
      options: [
        { id: 'home', label: '길을 접고 집으로 돌아간다', hint: '무사수행을 마친다' },
        { id: 'reply', label: '답장을 쓰고 길을 이어 간다', hint: '정신' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'home' && s.journey) return say({ ...s, journey: { ...s.journey, day: s.journey.maxDays } }, [['나레이션', '편지를 품에 넣고 발길을 돌렸다.']]);
      return say(addStats(s, { wil: 2 }), [['나레이션', '「곧 돌아가오」 — 짧은 답장을 역졸에게 맡겼다. (정신 +2)']]);
    },
  },
  // ───────── 숙적 — 같은 주막 ─────────
  {
    key: 'c_rival_inn',
    kind: 'PEOPLE',
    trigger: { rivalAct: 1, terrain: ['TOWN', 'ROAD', 'RIVER'] },
    label: (s) => `${s.rival.name}의 그림자`,
    build: (s) => ({
      title: `길 위의 숙적 — ${s.rival.name}`,
      category: 'RIVAL',
      sceneActor: 'RIVAL',
      narration: `객줏집 구석 자리에 ${s.rival.name}이(가) 혼자 술을 마시고 있다.`,
      script: [N(`객줏집 구석, 낯익은 등이 보인다. ${s.rival.name}.`), P(s.rival.name, s.rival.friendship >= 50 ? '하하, 여기서 다 보는군! 앉게, 오늘은 칼 얘기 말고 술 얘기나 하세.' : '…너도 무사수행이냐. 하필 같은 길이군.', s.rival.friendship >= 50 ? '잔을 들며' : '잔을 내려놓으며')],
      options: [
        { id: 'drink', label: '마주 앉아 술을 나눈다', hint: '숙적과의 우정' },
        { id: 'spar', label: '「여기서 만난 것도 인연」 — 한 합 청한다', hint: '진검승부' },
        { id: 'avoid', label: '모른 척 다른 자리에 앉는다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'avoid') return s;
      if (opt === 'drink') return say({ ...addStats(s, { wil: 1 }), rival: { ...s.rival, friendship: Math.min(100, s.rival.friendship + 8) } }, [[s.rival.name, '…너 같은 놈이 있어서 내가 칼을 못 놓는다.'], ['나레이션', '새벽까지 술잔이 오갔다. (숙적과의 우정 +8)']]);
      return journeyBattle(s, c, opt, { stakes: 'MERCY', title: `객줏집 마당 — ${s.rival.name}`, subtitle: '길 위에서 만난 숙적', name: s.rival.name, enemyTitle: s.rival.title, age: s.rival.age, ai: 'DUELIST', scale: roadScale(s, 1.05 + s.rival.act * 0.05), weapon: 'BLADE', skills: byCountry(s, ['sk_kr_06', 'sk_kr_02', 'sig_cross_slash'], ['sk_cn_05', 'sk_cn_03', 'sig_crimson_slash'], ['sk_jp_01', 'sk_jp_03', 'sig_issen']), rewardFame: 25 });
    },
    onBattle: (s, _opt, won) => say({ ...s, rival: { ...s.rival, friendship: Math.min(100, s.rival.friendship + 3), ...(won ? { lossesAgainstPlayer: s.rival.lossesAgainstPlayer + 1 } : { winsAgainstPlayer: s.rival.winsAgainstPlayer + 1 }) } }, [[s.rival.name, won ? '…길 위에서도 지는군. 다음 대회에서 보자.' : '길 위라서 봐준 건 아니다. 다음 대회에서 보자.']]),
  },
  // ───────── 천하제일 — 우승 경력 ─────────
  {
    key: 'c_champion',
    kind: 'PEOPLE',
    trigger: { champion: true },
    label: () => '천하제일을 찾는 이',
    build: (s) => ({
      title: '천하제일에게 도전하러 온 자',
      category: 'DUEL',
      sceneActor: 'RIVAL',
      narration: `「천하제일 ${s.name}이 이 길을 지난다」는 소문을 듣고 먼 데서 온 고수가 길을 막는다.`,
      script: [P(rand(['북방에서 온 거한', '바다 건너온 검객', '산에서 내려온 여검객']), '천하제일이라는 칼이 어떤 맛인지 보러 천 리를 왔소.', '칼을 비스듬히 들며')],
      options: [
        { id: 'accept', label: '받아 준다', hint: '진검승부 · 천하제일의 이름을 건다' },
        { id: 'decline', label: '「대회에서 보자」며 지나간다', hint: '명성 -10' },
      ],
    }),
    resolve: (s, opt, c) =>
      opt === 'decline'
        ? say(addFame(s, -10), [['나레이션', '등 뒤에서 「천하제일이 피했다」는 소리가 들렸다.']])
        : journeyBattle(s, c, opt, { stakes: 'MERCY', title: '천하제일에 도전하는 자', subtitle: '천 리를 온 고수', name: '천 리를 온 고수', enemyTitle: '도전자', age: 34, ai: 'DUELIST', scale: Math.max(2.6, roadScale(s, 1.2)), weapon: 'BLADE', skills: ['sig_cross_slash', 'sk_jp_03', 'sk_cn_03', 'sk_kr_06'], rewardFame: 35 }),
    onBattle: (s, _opt, won) => (won ? s : addFame(s, -25)),
  },
  // ───────── 극의 — 아무도 본 적 없는 경지 ─────────
  {
    key: 'c_transcend_seen',
    kind: 'PEOPLE',
    once: true,
    trigger: { transcended: true },
    label: () => '칼을 내려놓은 노검객',
    build: () => ({
      title: '처음 보는 경지',
      category: 'DUEL',
      sceneActor: 'RIVAL',
      narration: '길가 바위에 앉아 있던 백발의 검객이 그대의 걸음을 보고 벌떡 일어선다.',
      script: [N('바위에 앉아 있던 백발 검객이 일어선다. 칼집을 쥔 손이 떨린다.'), P('백발 검객', '…평생 벽 너머를 본 사람을 찾아다녔소. 그 벽, 넘었구려. 걸음에서 보이오.', '숨을 삼키며'), P('백발 검객', '한 번만… 극의를 보여 주시오. 그걸 보면 눈을 감아도 여한이 없겠소.')],
      options: [
        { id: 'show', label: '한 초식만 보여 준다', hint: '명성 · 아무도 본 적 없는 칼' },
        { id: 'refuse', label: '「보여 줄 수 있는 것이 아니오」', hint: '구도' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'refuse') return say(addRep(s, { ascetic: 12 }), [['백발 검객', '…그렇구려. 말로도 칼로도 보여 줄 수 없는 것이었구려.'], ['나레이션', '노검객은 한참을 웃더니 자기 칼을 계곡에 던졌다.']]);
      return say(highlight(addFame(s, 60), '길 위의 노검객에게 극의를 보였다'), [['나레이션', '칼이 한 번 움직였다. 바람도 소리도 없었다. 노검객은 무릎을 꿇은 채 오래 울었다.'], ['나레이션', '「세상에 그 경지를 본 사람이 하나 더 있다」 — 그 이야기는 강호에 오래 남았다. (명성 +60)']]);
    },
  },
  // ───────── 벽 앞에서 — 맹인 노인의 말 ─────────
  {
    key: 'c_wall_blind',
    kind: 'PEOPLE',
    once: true,
    trigger: { atWall: true },
    label: () => '지팡이 짚은 맹인',
    build: () => ({
      title: '벽을 본 맹인',
      category: 'LIFE',
      narration: '지팡이를 짚은 맹인 노인이 그대 앞에서 멈춘다.',
      script: [P('맹인 노인', '젊은이, 칼끝이 막혀 있구먼. 소리가 나. 벽에 부딪힌 칼은 소리가 달라.', '고개를 갸웃하며'), P('맹인 노인', '나도 젊어서 그 벽을 봤지. 눈을 잃고서야 알았어. 벽은 앞에 있는 게 아니야.')],
      options: [{ id: 'ask', label: '「그럼 어디에 있습니까?」', hint: '깨달음' }],
    }),
    resolve: (s) => {
      const g = gainInsight(s, 10, '맹인 노인의 말');
      return say(g.state, [['맹인 노인', '그건 네가 찾아야지. 허허.'], ['나레이션', g.text]]);
    },
  },
  // ───────── 지난 선택이 길 위에서 돌아온다 ─────────
  {
    key: 'c_beggar_guides',
    kind: 'PEOPLE',
    once: true,
    trigger: { done: ['p_beggar'] },
    label: () => '손짓하는 거지 아이',
    build: () => ({
      title: '거지 아이의 손짓',
      category: 'LIFE',
      narration: '누더기 차림의 아이가 소매를 잡아끈다. 「주먹밥 나리죠? 왕초가 길을 알려 드리랬어요.」',
      script: [P('거지 아이', '예전에 우리 형님한테 주먹밥 주신 나리죠? 거지들 사이엔 소문이 다 나요. 저 산 너머에 아무도 모르는 동굴이 있어요.', '씩 웃으며')],
      options: [{ id: 'follow', label: '아이를 따라간다', hint: '숨은 장소가 생긴다' }],
    }),
    resolve: (s) => say(addPoiAhead(s, 'TREASURE', rand(['tr_carving', 'tr_ruin', 'tr_swordgrave']), '거지가 알려 준 곳'), [['나레이션', '길 앞쪽에 「거지가 알려 준 곳」이 생겼다. 주먹밥 한 덩이가 이렇게 돌아왔다.']]),
  },
  {
    key: 'c_bandit_escort',
    kind: 'PEOPLE',
    once: true,
    trigger: { echoPending: 'bandit_spared' },
    label: () => '낯익은 칼자국',
    build: () => ({
      title: '살려 보낸 산적의 부하들',
      category: 'LIFE',
      narration: '고개 위에서 칼 든 사내들이 내려온다. 그런데 칼을 거꾸로 들고 있다.',
      script: [P('산적 부하', '두목이 그러더이다. 그날 목숨 살려 준 양반이 이 길을 지나면 털끝 하나 건드리지 말라고. 고개 끝까지 모시겠소.', '머리를 긁으며')],
      options: [{ id: 'ok', label: '못 이기는 척 호위를 받는다', hint: '이 구간의 매복이 사라진다' }],
    }),
    resolve: (s) => say(clearAmbushes(s), [['나레이션', '산적들이 앞서 걸으며 길을 텄다. 이 구간에서는 아무도 앞을 막지 않을 것이다.']]),
  },
  // ───────── 수행의 처음과 끝 ─────────
  {
    key: 'c_send_off',
    kind: 'PEOPLE',
    trigger: { day: [0, 10], disciples: 2 },
    label: () => '배웅 나온 제자들',
    build: (s) => ({
      title: '마을 어귀의 배웅',
      category: 'FAMILY',
      sceneActor: 'DISCIPLE',
      narration: '마을 어귀까지 제자들이 따라 나왔다.',
      script: [P(s.disciples.find((d) => !d.dead && !d.isChild)?.name || '수제자', '스승님 안 계신 동안 도장은 저희가 지키겠습니다. 몸 성히 다녀오십시오!', '목소리를 높여')],
      options: [
        { id: 'word', label: '한마디 당부를 남긴다', hint: '문하생 충성' },
        { id: 'go', label: '손만 흔들고 돌아서 걷는다' },
      ],
    }),
    resolve: (s, opt) => (opt === 'word' ? say({ ...s, disciples: s.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 3) })) }, [['나레이션', '「서로 다투지 말고, 아침 수련은 거르지 마라.」 제자들이 일제히 고개를 숙였다. (충성 +3)']]) : s),
  },
  {
    key: 'c_homesick',
    kind: 'PEOPLE',
    trigger: { day: [68, 90] },
    label: () => '고향 쪽 하늘',
    build: () => ({
      title: '길 위의 저녁',
      category: 'LIFE',
      narration: '노을이 진다. 저 산 너머가 도장 쪽이다.',
      script: [N('노을이 진다. 저 산 너머, 도장이 있는 쪽 하늘이 붉다.'), N('제자들은 아침 수련을 거르지 않았을까. 마당의 목인장은 그대로일까.')],
      options: [
        { id: 'home', label: '내일 아침 귀로에 오른다', hint: '무사수행을 마친다' },
        { id: 'stay', label: '남은 날을 끝까지 걷는다', hint: '정신' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'home' && s.journey) return say({ ...s, journey: { ...s.journey, day: s.journey.maxDays } }, [['나레이션', '봇짐을 고쳐 메고 고향 쪽으로 돌아섰다.']]);
      return say(addStats(trainEquipped(s, 15), { wil: 1 }), [['나레이션', '노을을 등지고 다시 걸었다. 길이 끝날 때까지가 수행이다.']]);
    },
  },
];

