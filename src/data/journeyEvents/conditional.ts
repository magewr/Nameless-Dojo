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
  pickFresh,
  rand,
  roadScale,
  say,
  spendDays,
  trainEquipped,
} from '../../engine/journeyCore';
import { freshFactor } from '../../engine/fresh';
import { createDiscipleEntity } from '../events';
import { getMaxDisciples } from '../../engine/gameLogic';
import { makePersonName, takenNames } from '../../engine/tourney';
import { josa } from '../../utils/korean';

// 주인공의 상태·이력에 따라 발동하는 길 위의 사건.
// 명성·나이·세평·주머니·몸 상태, 극의와 우승 경력, 숙적과 가족, 그리고 지난 무사수행에서 내린 선택이 방아쇠다.

const hasRoom = (s: GameState) => s.disciples.filter((d) => !d.dead).length < getMaxDisciples(s.facilities);
// 자주 만나는 사건일수록 장면을 여러 벌 두고, 최근에 본 장면은 피한다 (engine/fresh). 고른 장면은 meta.vkey에.
const elderCall = (s: GameState) => (s.age >= 58 ? '어르신' : '선배님');

export const CONDITIONAL_EVENTS: JourneyEventDef[] = [
  // ───────── 명성이 높으면 — 길에서 알아본다 ─────────
  {
    key: 'c_recognized',
    kind: 'PEOPLE',
    trigger: { fame: [800, 999999], terrain: ['TOWN', 'ROAD'] },
    label: () => '수군거리는 길손들',
    build: (s) => {
      const v = pickFresh(s, 'c_recognized', [
        {
          id: 'inn',
          title: '알아보는 사람들',
          scene: `주막에 들어서자 웅성거림이 멎었다. 「저 사람… ${s.sectName}의 ${s.name} 아닌가?」`,
          line: `${elderCall(s)}! 한 수만 가르쳐 주십시오! 아니면… 한 합만이라도!`,
          dir: '무릎을 꿇으며',
        },
        {
          id: 'market',
          title: '장터를 멈춰 세운 이름',
          scene: `장터를 지나는데 누군가 「${josa(s.name, '이가')} 왔다!」 하고 외쳤다. 순식간에 사람들이 빙 둘러섰다.`,
          line: `정말 그분이시군요! 제 칼 좀 봐 주십시오. 십 년을 혼자 휘둘렀습니다!`,
          dir: '사람들을 헤치고 나오며',
        },
        {
          id: 'ferry',
          title: '나룻배 위의 수군거림',
          scene: `나룻배에 오르자 뱃사공이 노를 멈추고 이쪽을 뚫어지게 본다. 「혹시… ${s.sectName}의?」 배 안의 젊은이 하나가 벌떡 일어섰다.`,
          line: `배에서 내리시면 저와 한 합만 겨뤄 주십시오, ${elderCall(s)}. 평생의 소원입니다!`,
          dir: '배가 흔들리는 것도 모르고',
        },
        {
          id: 'kids',
          title: `「${s.name} 놀이」를 하는 아이들`,
          scene: `고갯길 ${byCountry(s, '주막', '객잔', '찻집')} 앞에서 아이들이 막대기를 들고 「${s.name} 놀이」를 하고 있다. 그 소리를 듣고 안에서 젊은 무사 하나가 뛰어나왔다.`,
          line: `아이들 놀이 속 그 이름을 이 길에서 뵐 줄이야! ${elderCall(s)}, 가르침을 청합니다!`,
          dir: '숨을 헐떡이며',
        },
      ]);
      return {
      title: v.title,
      category: 'LIFE',
      narration: v.scene,
      script: [N(v.scene), P('젊은 무사', v.line, v.dir)],
      meta: { vkey: v.id },
      options: [
        { id: 'teach', label: '마당에서 젊은이들에게 한 수 가르친다 (1일)', hint: '명성·구도' },
        { id: 'spar', label: '가장 센 녀석과 한 합 겨뤄 준다', hint: '목검 시합' },
        { id: 'hide', label: '삿갓을 눌러쓰고 조용히 밥만 먹는다' },
      ],
      };
    },
    resolve: (s, opt, c) => {
      if (opt === 'hide') return say(s, [['나레이션', '이름이 알려지면 조용히 밥 먹기도 어렵다.']]);
      if (opt === 'teach') return say(addRep(addFame(spendDays(s, 1), 15), { ascetic: 6, virtue: 4 }), [['나레이션', '젊은이들이 해가 질 때까지 마당을 떠나지 않았다. (명성 +15)']]);
      return journeyBattle(s, c, opt, { stakes: 'SPAR', title: '주막 마당의 한 합', subtitle: '선배에게 도전하는 젊은 무사', name: makePersonName(s.country, takenNames(s)), enemyTitle: '무사수행 중인 젊은이', age: 22, ai: 'RUSHDOWN', scale: roadScale(s, 0.85), weapon: 'BLADE', skills: byCountry(s, ['sk_kr_01', 'sk_kr_06', 'base_h_slash'], ['sk_cn_01', 'sk_cn_05', 'base_h_slash'], ['sk_jp_03', 'sk_jp_01', 'base_h_slash']), rewardFame: 15 });
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
    build: (st) => {
      const v = pickFresh(st, 'c_bounty_hunter', [
        { id: 'reeds', title: '현상금 사냥꾼', who: '쇠사슬 낫의 사냥꾼', scene: '갈대밭 길. 아까부터 같은 발소리가 따라온다.', line: '당신 목에 걸린 값이 꽤 되더군. 원한 산 데가 한두 군데가 아니라서.', dir: '쇠사슬 낫을 풀며' },
        { id: 'bridge', title: '다리 끝의 현상금 사냥꾼', who: '삿갓 쓴 표창잡이', scene: '돌다리 끝에 삿갓 쓴 사내가 비스듬히 기대서 있다. 손가락 사이에서 표창 세 개가 번갈아 돈다.', line: '다리는 하나, 돌아갈 길은 없소. 당신 목값이면 일 년은 놀고먹겠더군.', dir: '삿갓 끝을 들어 올리며' },
        { id: 'inn', title: '문살 틈으로 날아든 비수', who: '외눈의 현상금 사냥꾼', scene: `${byCountry(st, '주막', '객잔', '여관')} 방에서 잠들려던 참이었다. 문살 틈으로 비수 한 자루가 날아들어 베개 옆에 꽂혔다.`, line: `피하는 솜씨는 소문대로군. 마당으로 나오시지. 방 안에서 피 보면 ${josa(byCountry(st, '주모', '객잔 주인', '안주인'), '이가')} 싫어하니까.`, dir: '어둠 속에서 외눈을 번득이며' },
        { id: 'poster', title: byCountry(st, '고을 어귀의 용모파기(容貌疤記)', '성문에 나붙은 화영도형(畫影圖形)', '고찰장(高札場)의 닌소가키(人相書)'), who: '방을 떼어 든 사냥꾼', scene: `${byCountry(st, '고을 어귀 장승 옆에', '성문 옆 벽에', '고을 어귀 고찰장에')} 내 얼굴을 그린 방이 붙어 있다. 그 앞에서 누군가 방을 떼어 접으며 기다리고 있었다.`, line: '그림이 실물만 못하구먼. 그래도 값은 그림값이 아니라 목값이니 상관없지.', dir: '방을 품에 넣으며' },
      ]);
      return {
      title: v.title,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: `피 묻은 칼 소문은 멀리 간다. 누군가 그대의 목에 값을 매겼다. ${v.scene}`,
      script: [N(v.scene), P('현상금 사냥꾼', v.line, v.dir, 'ANGRY')],
      meta: { vkey: v.id, who: v.who },
      options: [
        { id: 'fight', label: '맞선다', hint: '⚠ 진검승부' },
        { id: 'pay', label: `더 큰 돈으로 산다 (80${cur(st)})`, hint: st.money < 80 ? '주머니가 모자라다' : '돈으로 끝낸다' },
      ],
      };
    },
    resolve: (s, opt, c) => {
      if (opt === 'pay') {
        if (s.money < 80) return say(addHealth(s, -12), [['나레이션', '주머니가 모자랐다. 사냥꾼은 코웃음을 치며 팔에 칼자국 하나를 남기고 사라졌다.']]);
        return say(addMoney(s, -80), [['현상금 사냥꾼', '돈이면 다 되지. 다음엔 다른 놈이 올 거요.']]);
      }
      return journeyBattle(s, c, opt, { title: '현상금 사냥꾼', subtitle: '살기의 대가', name: String(c.data?.who || '쇠사슬 낫의 사냥꾼'), enemyTitle: '현상금 사냥꾼', age: 36, ai: 'RANGED', scale: roadScale(s, 1.1), weapon: 'THROWN', skills: ['sk_cn_07', 'sk_jp_07', 'sk_cn_02'], realDuel: true, rewardMoney: 60, rewardFame: 10 });
    },
  },
  // ───────── 인덕이 높으면 — 마을이 숨겨 준다 ─────────
  {
    key: 'c_village_shelter',
    kind: 'PEOPLE',
    trigger: { minRep: { virtue: 60 }, terrain: ['TOWN', 'FOREST', 'ROAD'] },
    label: () => '손짓하는 마을 사람',
    build: (s) => {
      const v = pickFresh(s, 'c_village_shelter', [
        { id: 'farmer', title: '은혜를 아는 마을', who: '마을 노인', scene: '밭일하던 노인이 낫을 내려놓고 다가온다.', line: '무사님 소문 들었습니다요. 이 앞 고개에 패거리가 숨어 있으니, 오늘은 우리 집에서 주무시고 샛길로 가십시오.' },
        { id: 'well', title: '우물가의 귀띔', who: '우물가 아낙', scene: '우물가에서 물동이를 이던 아낙이 주위를 살피더니 종종걸음으로 다가온다.', line: '의로운 분이시지요? 고개 너머에 험한 패거리가 진을 쳤어요. 오늘은 저희 집 헛간에서라도 쉬어 가세요.' },
        { id: 'teacher', title: '서당 훈장의 청', who: '서당 훈장', scene: `${byCountry(s, '서당', '사숙(私塾)', '데라코야(寺子屋)')} 문 앞에서 훈장이 아이들을 들여보내고 이쪽을 부른다.`, line: '소문으로 듣던 분이 맞으시구려. 이 앞길은 오늘 밤 위험하오. 서당 마루가 넓으니 묵어 가시고, 새벽에 아이 하나를 딸려 샛길로 보내 드리리다.' },
        { id: 'woodcutter', title: '나무꾼의 샛길', who: '늙은 나무꾼', scene: '지게를 진 나무꾼이 길가 바위에 지게를 받쳐 놓고 손짓한다.', line: '고개에 패거리가 진을 쳤수. 내 나무하러 다니는 샛길이 있으니, 오늘은 우리 움막에서 자고 새벽에 같이 넘읍시다.' },
      ]);
      return {
      title: v.title,
      category: 'LIFE',
      narration: `낯선 마을 사람이 손짓한다. 이 길 앞에 패거리가 숨어 있다는 것이다.`,
      script: [N(v.scene), P(v.who, v.line, '목소리를 낮추며')],
      meta: { vkey: v.id },
      options: [
        { id: 'stay', label: '하룻밤 신세를 진다 (1일)', hint: '이 구간의 매복을 피한다 · 건강' },
        { id: 'thank', label: '고맙다며 그냥 간다' },
      ],
      };
    },
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
    build: (s) => {
      const hasChild = s.disciples.some((d) => d.isChild && !d.dead);
      const seasonNews: Record<GameState['season'], string> = {
        SPRING: '마당 매화가 피었어요. 당신이 심은 그 나무요.',
        SUMMER: '장마에 지붕이 새서 제자들과 기와를 새로 얹었어요.',
        AUTUMN: '뒤뜰 감이 붉게 익었어요. 당신 몫은 곶감으로 말려 둘게요.',
        WINTER: '눈이 무릎까지 쌓였어요. 제자들이 새벽마다 마당을 쓸어요.',
      };
      const v = pickFresh(s, 'c_letter', [
        { id: 'nights', title: '집에서 온 편지', body: '도장은 무탈합니다. 아이들도 제자들도 잘 지내요. 다만… 밤이 길어요. 몸 성히 돌아오세요.' },
        { id: 'child', when: () => hasChild, title: '편지 속의 서툰 글씨', body: '아이가 처음으로 목검을 쥐었어요. 당신 흉내를 낸다고 마당을 뛰어다녀요. 편지 끝에 아이가 쓴 글씨도 있어요.' },
        { id: 'disciples', title: '제자들 소식이 담긴 편지', body: '제자들이 아침마다 당신 방 쪽으로 인사를 하고 수련을 시작해요. 다들 당신을 기다려요.' },
        { id: 'season', title: '계절이 담긴 편지', body: `${seasonNews[s.season]} 돌아오실 때쯤이면 또 달라져 있겠지요.` },
        { id: 'worry', title: '걱정이 묻어나는 편지', body: '요즘 길에 도적이 많다는 소문이 들려요. 칼보다 몸을 먼저 아끼세요. 이름은 나중에 얻어도 돼요.' },
      ]);
      return {
      title: v.title,
      category: 'FAMILY',
      sceneActor: 'SPOUSE',
      narration: `역참에 ${s.spouse?.name || '집'}에게서 온 편지가 기다리고 있었다.`,
      script: [N(`역졸이 편지 한 통을 건넨다. ${s.spouse?.name || '집'}의 글씨다.`), P(s.spouse?.name || '반려', v.body)],
      meta: { vkey: v.id },
      options: [
        { id: 'home', label: '길을 접고 집으로 돌아간다', hint: '무사수행을 마친다' },
        { id: 'reply', label: '답장을 쓰고 길을 이어 간다', hint: '정신' },
      ],
      };
    },
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
    build: (s) => {
      const r = s.rival.name;
      const warm = s.rival.friendship >= 50;
      const v = pickFresh(s, 'c_rival_inn', [
        { id: 'tavern', title: `길 위의 숙적 — ${r}`, scene: `객줏집 구석, 낯익은 등이 보인다. ${r}.`, warm: '하하, 여기서 다 보는군! 앉게, 오늘은 칼 얘기 말고 술 얘기나 하세.', cold: '…너도 무사수행이냐. 하필 같은 길이군.' },
        { id: 'ferry', title: `나루터에서 마주친 ${r}`, scene: `나룻배를 기다리는 줄 맨 앞에 ${josa(r, '이가')} 서 있다. 배는 한 척, 다음 배는 해 질 녘이다.`, warm: '배가 올 때까지 시간이 남는군. 저 주막에서 한잔하며 기다리세.', cold: '…같은 배를 타게 생겼군. 강 한가운데서 칼 뽑을 생각은 말게.' },
        { id: 'pass', title: `고갯마루의 ${r}`, scene: `고갯마루 ${byCountry(s, '주막 툇마루', '찻집 의자', '찻집 평상')}에 ${josa(r, '이가')} 다리를 뻗고 앉아 있다. 숨을 고르던 눈이 이쪽에서 멈춘다.`, warm: `고개 하나 넘는 데도 늙는구먼. 앉게, ${byCountry(s, '막걸리', '황주', '탁주')}가 아직 차네.`, cold: '숨이 가쁜 걸 보니 요즘 수련을 게을리했군. 그 꼴로 나를 이기겠다고?' },
        { id: 'rain', title: `처마 밑의 ${r}`, scene: `소나기를 피해 뛰어든 길가 사당 처마 밑, 먼저 와 있던 사람이 돌아본다. ${r}.`, warm: '비가 그칠 때까지는 휴전일세. 마침 술이 한 병 있네.', cold: '…비만 아니었으면 마주칠 일도 없었을 텐데.' },
      ]);
      return {
      title: v.title,
      category: 'RIVAL',
      sceneActor: 'RIVAL',
      narration: v.scene,
      script: [N(v.scene), P(r, warm ? v.warm : v.cold, warm ? '잔을 들며' : '눈을 가늘게 뜨며')],
      meta: { vkey: v.id },
      options: [
        { id: 'drink', label: '마주 앉아 술을 나눈다', hint: '숙적과의 우정' },
        { id: 'spar', label: '「여기서 만난 것도 인연」 — 한 합 청한다', hint: '진검승부' },
        { id: 'avoid', label: '모른 척 다른 자리에 앉는다' },
      ],
      };
    },
    resolve: (s, opt, c) => {
      if (opt === 'avoid') return s;
      if (opt === 'drink') return say({ ...addStats(s, { wil: 1 }), rival: { ...s.rival, friendship: Math.min(100, s.rival.friendship + 8) } }, [[s.rival.name, '…너 같은 놈이 있어서 내가 칼을 못 놓는다.'], ['나레이션', '새벽까지 술잔이 오갔다. (숙적과의 우정 +8)']]);
      return journeyBattle(s, c, opt, { stakes: 'MERCY', title: `길 위의 한 합 — ${s.rival.name}`, subtitle: '길 위에서 만난 숙적', name: s.rival.name, enemyTitle: s.rival.title, age: s.rival.age, ai: 'DUELIST', scale: roadScale(s, 1.05 + s.rival.act * 0.05), weapon: 'BLADE', skills: byCountry(s, ['sk_kr_06', 'sk_kr_02', 'sig_cross_slash'], ['sk_cn_05', 'sk_cn_03', 'sig_crimson_slash'], ['sk_jp_01', 'sk_jp_03', 'sig_issen']), rewardFame: 25 });
    },
    onBattle: (s, _opt, won) => say({ ...s, rival: { ...s.rival, friendship: Math.min(100, s.rival.friendship + 3), ...(won ? { lossesAgainstPlayer: s.rival.lossesAgainstPlayer + 1 } : { winsAgainstPlayer: s.rival.winsAgainstPlayer + 1 }) } }, [[s.rival.name, won ? '…길 위에서도 지는군. 다음 대회에서 보자.' : '길 위라서 봐준 건 아니다. 다음 대회에서 보자.']]),
  },
  // ───────── 천하제일 — 우승 경력 ─────────
  {
    key: 'c_champion',
    kind: 'PEOPLE',
    trigger: { champion: true },
    label: () => '천하제일을 찾는 이',
    build: (s) => {
      const v = pickFresh(s, 'c_champion', [
        { id: 'north', who: '북방에서 온 거한', title: '천하제일에게 도전하러 온 자', line: '천하제일이라는 칼이 어떤 맛인지 보러 천 리를 왔소.', dir: '칼을 비스듬히 들며' },
        { id: 'sea', who: '바다 건너온 검객', title: '바다 건너온 도전장', line: '배를 세 번 갈아타고 왔소. 천하제일의 칼을 보지 않고는 돌아갈 수 없소.', dir: '소금기 밴 칼집을 풀며' },
        { id: 'mountain', who: '산에서 내려온 여검객', title: '산에서 내려온 여검객', line: '스승님 유언이 「천하제일을 만나 보라」였어요. 오늘 그 유언을 지키겠어요.', dir: '등에 멘 장검을 뽑으며' },
        { id: 'boy', who: '열여섯 살 소년 검객', title: '천하제일을 꺾겠다는 소년', line: '천하제일을 꺾으면 제가 천하제일이지요? 겨뤄 주십시오!', dir: '키보다 긴 칼을 고쳐 쥐며' },
        { id: 'old', who: '백발의 노검객', title: '백발의 도전자', line: '젊어서는 대회에 나갈 돈이 없었소. 죽기 전에 천하제일과 한 번은 겨뤄 보고 싶었소.', dir: '굽은 허리를 천천히 펴며' },
      ]);
      return {
      title: v.title,
      category: 'DUEL',
      sceneActor: 'RIVAL',
      narration: `「천하제일 ${josa(s.name, '이가')} 이 길을 지난다」는 소문을 듣고 먼 데서 온 고수가 길을 막는다.`,
      script: [P(v.who, v.line, v.dir)],
      meta: { vkey: v.id, who: v.who },
      options: [
        { id: 'accept', label: '받아 준다', hint: '진검승부 · 천하제일의 이름을 건다' },
        { id: 'decline', label: '「대회에서 보자」며 지나간다', hint: '명성 -10' },
      ],
      };
    },
    resolve: (s, opt, c) =>
      opt === 'decline'
        ? say(addFame(s, -10), [['나레이션', '등 뒤에서 「천하제일이 피했다」는 소리가 들렸다.']])
        : journeyBattle(s, c, opt, { stakes: 'MERCY', title: '천하제일에 도전하는 자', subtitle: '천 리를 온 고수', name: String(c.data?.who || '천 리를 온 고수'), enemyTitle: '도전자', age: 34, ai: 'DUELIST', scale: Math.max(2.6, roadScale(s, 1.2)), weapon: 'BLADE', skills: ['sig_cross_slash', 'sk_jp_03', 'sk_cn_03', 'sk_kr_06'], rewardFame: 35 }),
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
    build: (s) => {
      // 앞장서는 제자도 매번 다르게 — 최근에 배웅을 맡았던 제자는 뒤로
      const pool = s.disciples.filter((d) => !d.dead && !d.isChild);
      const weighted = pool.map((d) => ({ d, w: freshFactor(s, `c_send_off:d_${d.id}`) * (0.5 + Math.random()) }));
      const lead = weighted.sort((a, b) => b.w - a.w)[0]?.d;
      const youngest = [...pool].sort((a, b) => a.age - b.age)[0];
      const v = pickFresh(s, 'c_send_off', [
        { id: 'gate', title: '마을 어귀의 배웅', scene: '마을 어귀까지 제자들이 따라 나왔다.', line: '스승님 안 계신 동안 도장은 저희가 지키겠습니다. 몸 성히 다녀오십시오!', dir: '목소리를 높여' },
        { id: 'riceball', title: '주먹밥 보따리', scene: `동트기 전, ${josa(lead?.name || '수제자', '이가')} 밤새 싼 주먹밥 보따리를 들고 고개 아래까지 뛰어왔다.`, line: '길에서 끼니 거르지 마십시오. 사흘 치는 됩니다. 모자라면… 그건 제가 덜 싼 탓입니다.', dir: '숨을 몰아쉬며' },
        { id: 'rain', when: () => s.season !== 'WINTER', title: '빗속의 배웅', scene: '떠나는 아침부터 비가 내린다. 제자들이 도롱이를 들고 우르르 따라 나왔다.', line: '하필 오늘 비라니요. 이 도롱이라도 걸치고 가십시오. 도장 걱정은 마시고요!', dir: '도롱이를 어깨에 걸쳐 주며' },
        { id: 'snow', when: () => s.season === 'WINTER', title: '눈길의 배웅', scene: '밤새 내린 눈을 제자들이 새벽부터 쓸어 고개 아래까지 길을 내 놓았다.', line: '여기까지는 저희가 길을 냈습니다. 여기서부터는 스승님 길입니다. 몸 성히 다녀오십시오!', dir: '빗자루를 짚고 서서' },
        { id: 'youngest', when: () => pool.length >= 2, title: '따라오는 막내', scene: `제자들과 인사를 나누고 한참을 걸었는데, 막내 ${josa(youngest?.name || '제자', '이가')} 몰래 뒤를 따라오고 있었다.`, line: '저도 데려가 주시면 안 됩니까…? 아, 아닙니다. 도장 지키겠습니다. 꼭 돌아오셔야 합니다!', dir: '울먹이며' },
      ]);
      const who = v.id === 'youngest' ? youngest : lead;
      return {
      title: v.title,
      category: 'FAMILY',
      sceneActor: 'DISCIPLE',
      narration: v.scene,
      script: [N(v.scene), P(who?.name || '수제자', v.line, v.dir)],
      meta: { vkey: v.id, vkeys: who ? [`d_${who.id}`] : [] },
      options: [
        { id: 'word', label: '한마디 당부를 남긴다', hint: '문하생 충성' },
        { id: 'go', label: '손만 흔들고 돌아서 걷는다' },
      ],
      };
    },
    resolve: (s, opt) => (opt === 'word' ? say({ ...s, disciples: s.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 3) })) }, [['나레이션', '「서로 다투지 말고, 아침 수련은 거르지 마라.」 제자들이 일제히 고개를 숙였다. (충성 +3)']]) : s),
  },
  {
    key: 'c_homesick',
    kind: 'PEOPLE',
    trigger: { day: [68, 90] },
    label: () => '고향 쪽 하늘',
    build: (s) => {
      const v = pickFresh(s, 'c_homesick', [
        { id: 'sunset', title: '길 위의 저녁', a: '노을이 진다. 저 산 너머, 도장이 있는 쪽 하늘이 붉다.', b: '제자들은 아침 수련을 거르지 않았을까. 마당의 목인장은 그대로일까.' },
        { id: 'moon', title: '같은 달 아래', a: '보름달이 떴다. 도장 마당에도 지금 같은 달이 떠 있겠지.', b: '달빛 아래서 목검을 휘두르던 제자들의 그림자가 눈에 선하다.' },
        { id: 'rain', when: () => s.season !== 'WINTER', title: '낯선 처마의 빗소리', a: `${byCountry(s, '주막', '객잔', '여관')} 처마 끝 낙숫물 소리가 도장 마루에서 듣던 것과 똑같다.`, b: '비 오는 날이면 제자들은 마루에 둘러앉아 칼을 손질했다. 지금도 그러고 있을까.' },
        { id: 'smoke', title: '저녁연기', a: `마을마다 저녁 짓는 연기가 오른다. 문득 도장 부엌의 ${byCountry(s, '된장국', '좁쌀죽', '된장국(미소시루)')} 냄새가 그립다.`, b: '길에서 먹는 밥이 아무리 배불러도, 그 냄새만은 채워지지 않는다.' },
      ]);
      return {
      title: v.title,
      category: 'LIFE',
      narration: v.a,
      script: [N(v.a), N(v.b)],
      meta: { vkey: v.id },
      options: [
        { id: 'home', label: '내일 아침 귀로에 오른다', hint: '무사수행을 마친다' },
        { id: 'stay', label: '남은 날을 끝까지 걷는다', hint: '정신' },
      ],
      };
    },
    resolve: (s, opt) => {
      if (opt === 'home' && s.journey) return say({ ...s, journey: { ...s.journey, day: s.journey.maxDays } }, [['나레이션', '봇짐을 고쳐 메고 고향 쪽으로 돌아섰다.']]);
      return say(addStats(trainEquipped(s, 15), { wil: 1 }), [['나레이션', '노을을 등지고 다시 걸었다. 길이 끝날 때까지가 수행이다.']]);
    },
  },
];

