import { josa } from '../../utils/korean';
import { GameState } from '../../types/game';
import {
  addEcho,
  addFame,
  addHealth,
  addMoney,
  addRep,
  addStats,
  chance,
  cur,
  echoMilestone,
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
  rand,
  roadScale,
  say,
  spendDays,
  takeEcho,
} from '../../engine/journeyCore';
import { createDiscipleEntity } from '../events';
import { getMaxDisciples } from '../../engine/gameLogic';

// 시대 사건 — 연도와 지역이 맞을 때만, 일생에 한 번. 큰 선택은 몇 해 뒤 도장으로 되돌아온다.

const hasRoom = (s: GameState) => s.disciples.filter((d) => !d.dead).length < getMaxDisciples(s.facilities);

function orphan(s: GameState, archetype: string): { state: GameState; name: string | null } {
  if (!hasRoom(s)) return { state: s, name: null };
  const d = { ...createDiscipleEntity(s, { isGenius: chance(0.5), isChild: true, adopted: true, childTalent: 'DILIGENT', archetype, temperament: 'DILIGENT' }), joinedYear: s.year, temperamentKnown: true };
  return { state: { ...s, disciples: [...s.disciples, d], flags: { ...s.flags, hasHadFirstDisciple: true } }, name: d.name };
}

// 특정 해에 정확히 맞춰 돌아오는 메아리 (예: 1790년 『무예도보통지』)
function dueAtYear(s: GameState, year: number): { minYears: number; maxYears: number } {
  const y = Math.max(0.25, year - s.year);
  return { minYears: y, maxYears: y };
}

export const HISTORY_EVENTS: JourneyEventDef[] = [
  // ═════════════ 조선 ═════════════
  {
    key: 'h_kr_gyunyeok',
    kind: 'HISTORY',
    countries: ['KOREA'],
    years: [1750, 1752],
    once: true,
    label: () => '군포를 피해 달아난 장정',
    build: (st) => ({
      title: '균역법 — 달아난 장정',
      category: 'HISTORICAL',
      narration: '군포가 한 필로 줄었다지만, 밀린 군포는 그대로다. 관아에 쫓기는 장정 하나가 헛간에 숨어 있다.',
      script: [
        N('1750년, 균역법으로 군포가 두 필에서 한 필로 줄었다. 그러나 밀린 군포까지 사라진 것은 아니었다.'),
        N('헛간 짚더미 속에 장정 하나가 숨어 있다. 팔뚝이 굵고, 손바닥에 창 굳은살이 박였다.'),
        P('도망 장정', '죽은 아비 몫, 젖먹이 아들 몫까지 군포를 매겼소. 백골징포, 황구첨정… 살 수가 없어 달아났소.', '떨리는 목소리로'),
      ],
      options: [
        { id: 'hide', label: `포졸을 따돌려 주고 노자를 쥐여 보낸다 (10${cur(st)})`, disabled: st.money < 10, disabledReason: '노자가 부족하다' },
        { id: 'report', label: '관아에 넘긴다', hint: '포상금' },
        { id: 'leave', label: '모른 척한다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'hide') {
        let n = addRep(addMoney(s, -10), { virtue: 8 });
        n = addEcho(n, { key: 'gyunyeok_soldier', minYears: 22, maxYears: 30, channel: 'HOME', bornText: '군포에 쫓기던 장정을 숨겨 주었다' });
        return say(n, [['도망 장정', '이 창 쓰는 손으로… 언젠가 나라를 지키는 군사가 되겠소. 도망자가 아니라.'], ['나레이션', '장정은 새벽에 북쪽으로 떠났다. (인덕 +8)']]);
      }
      if (opt === 'report') return say(addRep(addMoney(s, 25), { ruthless: 6 }), [['나레이션', `포상금 25${cur(s)}. 끌려가는 장정이 뒤를 돌아보았다.`]]);
      return s;
    },
  },
  {
    key: 'h_kr_imo',
    kind: 'HISTORY',
    countries: ['KOREA'],
    years: [1762, 1763],
    trigger: { periods: [{ year: 1762, seasons: ['SUMMER', 'AUTUMN', 'WINTER'] }, { year: 1763, seasons: ['SPRING'] }] },
    once: true,
    label: () => '쫓기는 익위사 무관',
    build: () => ({
      title: '임오년 여름 — 쫓기는 무관',
      category: 'HISTORICAL',
      narration: '세자 저하가 뒤주에 갇혀 돌아가셨다는 그해 여름. 세자익위사의 무관 하나가 피 묻은 보퉁이를 안고 산으로 숨어들었다.',
      script: [
        N('임오년 여름. 세자 저하가 뒤주에 갇혀 여드레 만에 돌아가셨다. 아무도 그 일을 입에 담지 못한다.'),
        N('산길 바위 뒤에서 피 묻은 관복의 무관 하나가 칼을 겨눈다. 세자익위사 — 세자를 호위하던 무관이다.'),
        P('익위사 무관', '…저하께서 대리청정 중에 무예 열여덟 가지를 손수 엮으셨소. 『무예신보』. 이 초고만은 불타게 둘 수 없소.', '보퉁이를 끌어안으며'),
        P('익위사 무관', '나는 잡혀도 좋소. 이 책만 살아남으면.'),
      ],
      options: [
        { id: 'shelter', label: '무관과 초고를 함께 숨겨 준다', hint: '⚠ 역적 연루의 위험. 그러나 이 책은 살아남는다' },
        { id: 'report', label: '관아에 넘긴다', hint: '거금의 포상' },
        { id: 'leave', label: '보지 못한 것으로 한다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'shelter') {
        const g = giveBook(s, 'bk_kr_01', 50);
        let n = addRep(g.state, { virtue: 12 });
        n = addEcho(n, { key: 'muye_manual', ...dueAtYear(n, 1790), channel: 'HOME', bornText: '임오년 여름, 쫓기던 익위사 무관과 『무예신보』 초고를 숨겨 주었다' });
        return say(highlight(n, '임오년, 『무예신보』 초고를 지켜 냈다'), [
          ['익위사 무관', '이 사본을 가지시오. 원본은 내가 지키겠소. 언젠가… 저하의 뜻을 이을 분이 오실 거요.'],
          ['나레이션', `『무예신보초』를 받았다. (해독 50% 진행, 인덕 +12)`],
        ]);
      }
      if (opt === 'report') return say(addRep(addMoney(s, 120), { ruthless: 18 }), [['나레이션', `포상금 120${cur(s)}. 그해 여름의 일은 그렇게 끝났다. (살기 +18)`]]);
      return s;
    },
  },
  {
    key: 'h_kr_tongsinsa',
    kind: 'HISTORY',
    countries: ['KOREA'],
    regions: ['KR_JIRI'],
    years: [1764, 1765],
    once: true,
    label: () => '통신사 행렬의 짐꾼',
    build: (s) => ({
      title: '통신사가 가져온 뿌리',
      category: 'HISTORICAL',
      narration: '일본에서 돌아온 통신사 행렬의 짐꾼이 붉은 뿌리를 팔고 있다.',
      script: [
        N('1763년 일본으로 떠났던 통신사가 돌아왔다. 짐꾼 하나가 붉은 뿌리를 늘어놓고 판다.'),
        P('짐꾼', `대마도 사람들은 이걸 고구마라 합디다. 흉년에도 자라고, 쪄 먹으면 배가 든든하오. 종자 한 바구니 ${15}${cur(s)}!`),
      ],
      options: [
        { id: 'buy', label: `종자를 사서 도장 뒷밭에 심는다 (15${cur(s)})`, disabled: s.money < 15, disabledReason: '노자가 부족하다' },
        { id: 'leave', label: '이상한 뿌리다. 지나간다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'buy') return s;
      let n = addMoney(s, -15);
      n = addEcho(n, { key: 'sweet_potato', minYears: 4, maxYears: 10, channel: 'HOME', bornText: '통신사가 들여온 고구마 종자를 사서 심었다' });
      return say(n, [['나레이션', '짐 보퉁이에 고구마 종자를 넣었다. 돌아가면 뒷밭에 심어 볼 생각이다.']]);
    },
  },
  {
    key: 'h_kr_catholic',
    kind: 'HISTORY',
    countries: ['KOREA'],
    years: [1791, 1801],
    once: true,
    label: () => '산골의 서학 교인들',
    build: () => ({
      title: '산으로 숨은 서학 교인들',
      category: 'HISTORICAL',
      narration: '깊은 골짜기 움막에 사람들이 모여 낮게 무언가를 외운다. 벽에 나무 십자가가 걸려 있다.',
      script: [
        N('신해년, 진산의 선비가 제사를 폐하고 신주를 불살랐다 하여 목이 잘렸다. 서학 교인들이 산으로 숨어든다.'),
        N('골짜기 움막에 사람들이 모여 낮게 무언가를 외운다. 아이 하나가 겁먹은 눈으로 칼을 본다.'),
        P('교인 노인', '우리를 잡으러 온 분이 아니라면… 이 아이만이라도 데려가 주시오. 이 아이는 한문도, 서양 셈법도 압니다.', '아이의 등을 떠밀며'),
      ],
      options: [
        { id: 'take', label: '아이를 데려가고, 움막은 못 본 것으로 한다', hint: '⚠ 훗날 관아의 의심' },
        { id: 'report', label: '관아에 알린다', hint: '포상금' },
        { id: 'leave', label: '조용히 떠난다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'take') {
        const o = orphan(s, '서학 교인의 아이');
        let n = addRep(o.state, { virtue: 10, arcane: 4 });
        n = addEcho(n, { key: 'catholic_inquiry', ...dueAtYear(n, Math.max(1801, n.year + 1)), channel: 'HOME', bornText: '산골에 숨은 서학 교인의 아이를 거두었다' });
        return say(n, [['나레이션', o.name ? `아이 ${josa(o.name, '이가')} 손을 꼭 잡고 따라왔다. (문하생 입문, 인덕 +10)` : '도장에 자리가 없어 아이를 믿을 만한 마을에 맡겼다. (인덕 +10)']]);
      }
      if (opt === 'report') return say(addRep(addMoney(s, 60), { ruthless: 14 }), [['나레이션', `포상금 60${cur(s)}. 그날 밤 골짜기에서 횃불이 꺼지지 않았다. (살기 +14)`]]);
      return s;
    },
  },
  {
    key: 'h_kr_hwaseong',
    kind: 'HISTORY',
    countries: ['KOREA'],
    regions: ['KR_GWANSEO'],
    years: [1794, 1796],
    trigger: { legs: ['gs_market'] },
    once: true,
    label: () => '화성 축성 공사장',
    build: () => ({
      title: '수원 화성 — 장용영 교관의 시험',
      category: 'HISTORICAL',
      narration: '거중기가 돌을 들어 올린다. 새 성곽 아래, 장용영 군사들이 『무예도보통지』의 자세로 창을 찌른다.',
      script: [
        N('거중기가 거대한 돌을 들어 올린다. 새 성곽 아래, 장용영 군사들이 일제히 창을 찌른다.'),
        P('장용영 교관', '칼 찬 민간인이 성역(城役)을 기웃거리다니. 상감께서는 재주 있는 자라면 신분을 묻지 않으신다. 한 수 보이겠는가?', '창을 세우며'),
      ],
      options: [
        { id: 'duel', label: '장용영 교관과 겨룬다', hint: '목검 시합 · 이기면 조정의 눈에 든다' },
        { id: 'leave', label: '공사 구경만 하고 떠난다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt !== 'duel') return s;
      return journeyBattle(s, c, opt, {
        stakes: 'SPAR', title: '장용영 교관',
        subtitle: '정조의 친위 군영',
        name: '장용영 교관',
        enemyTitle: '무예도보통지 24기의 달인',
        age: 38,
        ai: 'DUELIST',
        scale: roadScale(s, 1.1),
        weapon: 'POLEARM',
        skills: ['sk_kr_05', 'sk_kr_02', 'sk_kr_07'],
        rewardFame: 40,
      });
    },
    onBattle: (s, _opt, won) => {
      if (!won) return say(addFame(s, 5), [['장용영 교관', '민간에 이런 칼이 있었다니. 졌어도 부끄러워할 것 없네.']]);
      const n = { ...addFame(s, 30), flags: { ...s.flags, royalAlliance: true } };
      return say(highlight(n, '장용영 교관을 꺾고 조정의 눈에 들었다'), [['장용영 교관', '이 일은 위에 아뢰겠네. 자네 도장 이름이 무엇인가?'], ['나레이션', '조정이 도장을 후원하게 되었다.']]);
    },
  },
  {
    key: 'h_kr_hong',
    kind: 'HISTORY',
    countries: ['KOREA'],
    regions: ['KR_GWANSEO'],
    years: [1811, 1812],
    trigger: { periods: [{ year: 1811, seasons: ['WINTER'] }, { year: 1812, seasons: ['SPRING'] }] },
    once: true,
    label: () => '난리 난 정주 고을',
    build: () => ({
      title: '홍경래의 난 — 정주',
      category: 'HISTORICAL',
      narration: '가산 다복동에서 일어난 봉기군이 정주성을 차지했다. 성 밖에는 관군이 진을 치고, 그 사이로 피난민이 흘러간다.',
      script: [
        N('1811년 겨울, 가산 다복동. 평안도 사람은 과거에 붙어도 벼슬을 못 한다는 울분이 마침내 터졌다.'),
        N('봉기군이 정주성을 차지했다. 성 밖에는 관군이 진을 쳤고, 그 사이로 피난민 행렬이 끝없이 흐른다.'),
        P('봉기군 장수', '칼을 쓸 줄 아는구먼. 관서 놈들이 사람 대접 받는 세상을 만들려 하오. 우리 군사들을 가르쳐 주시오!', '성벽 위에서'),
        P('관군 초관', '역도들을 토벌한다. 의병으로 나서면 공을 인정하마!', '말 위에서'),
      ],
      options: [
        { id: 'rebel', label: '봉기군의 무예 교두가 된다', hint: '⚠ 역적 — 훗날 관아의 추적' },
        { id: 'army', label: '관군 의병으로 나선다', hint: '⚠ 진검승부 · 봉기군 장수와 겨룬다' },
        { id: 'refugee', label: '피난민 행렬을 지켜 남쪽으로 이끈다 (5일)', hint: '인덕 · 고아' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'rebel') {
        let n = addRep(spendDays(s, 4), { ruthless: 15, virtue: 5 });
        n = addStats(n, { str: 2, wil: 2 });
        n = addEcho(n, { key: 'hong_traitor', minYears: 0.5, maxYears: 1.5, channel: 'HOME', bornText: '홍경래 봉기군의 무예 교두가 되었다' });
        return say(highlight(n, '홍경래 봉기군의 무예 교두가 되었다'), [['나레이션', '나흘 동안 봉기군에게 창 쓰는 법을 가르쳤다. 그들의 눈은 굶주림보다 분노로 빛났다.'], ['봉기군 장수', '이 은혜는… 우리가 이기든 지든 잊지 않겠소.']]);
      }
      if (opt === 'army') {
        return journeyBattle(s, c, opt, {
          title: '정주성 앞 — 봉기군 장수',
          subtitle: '관서의 울분',
          name: '봉기군 선봉장',
          enemyTitle: '다복동의 장사',
          age: 35,
          ai: 'HEAVY',
          scale: roadScale(s, 1.15),
          weapon: 'POLEARM',
          skills: ['sk_kr_05', 'sk_kr_07', 'base_v_slash'],
          realDuel: true,
          rewardMoney: 80,
          rewardFame: 60,
        });
      }
      const o = orphan(spendDays(s, 5), '피난길의 고아');
      const n = addFame(addRep(o.state, { virtue: 25 }), 15);
      return say(highlight(n, '정주의 피난민들을 남쪽으로 이끌었다'), [['나레이션', `닷새 동안 피난민 행렬의 앞뒤를 지켰다. ${o.name ? `부모를 잃은 아이 ${josa(o.name, '이가')} 끝까지 따라왔다.` : ''} (인덕 +25)`]]);
    },
    onBattle: (s, _opt, won) => {
      if (!won) return s;
      const n = { ...addRep(s, { ruthless: 8 }), flags: { ...s.flags, royalAlliance: true } };
      return say(highlight(n, '정주성 앞에서 봉기군 선봉장을 베었다'), [['관군 초관', '그대의 공을 조정에 올리겠소.'], ['나레이션', '조정의 후원을 얻었다. 그러나 쓰러진 장수의 마지막 눈빛이 오래 남았다.']]);
    },
  },
  {
    key: 'h_kr_cholera',
    kind: 'HISTORY',
    countries: ['KOREA'],
    years: [1821, 1822],
    trigger: { periods: [{ year: 1821, seasons: ['AUTUMN', 'WINTER'] }, { year: 1822, seasons: ['SUMMER', 'AUTUMN'] }] },
    once: true,
    label: () => '봉쇄된 마을',
    build: () => ({
      title: '괴질 — 봉쇄된 마을',
      category: 'HISTORICAL',
      narration: '마을 어귀에 새끼줄이 쳐져 있다. 「괴질. 들어오지 마시오.」 안쪽에서 곡소리가 들린다.',
      script: [
        N('1821년, 서쪽에서 괴질이 번졌다. 토하고 쏟다가 하루 만에 죽는다. 사람들은 쥐귀신의 짓이라 했다.'),
        N('마을 어귀에 새끼줄이 쳐져 있다. 안쪽에서 곡소리가 끊이지 않는다. 물 길을 사람조차 없다.'),
      ],
      options: [
        { id: 'enter', label: '들어가서 물을 끓이고 시신을 묻는다 (4일)', hint: '⚠ 역병에 걸릴 수 있다 · 인덕' },
        { id: 'leave', label: '돌아서 간다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'enter') return s;
      let n = addRep(spendDays(s, 4), { virtue: 30 });
      n = addFame(n, 20);
      if (chance(0.35)) {
        n = addHealth({ ...n, statuses: [...n.statuses.filter((x) => x.id !== 'PLAGUE'), { id: 'PLAGUE', label: '괴질', turnsRemaining: 2 }] }, -15);
        return say(highlight(n, '괴질 마을에서 사람들을 돌보다 병을 얻었다'), [['나레이션', '나흘째 되던 날, 배가 뒤틀리기 시작했다. (역병, 건강 -15, 인덕 +30)']]);
      }
      return say(highlight(n, '괴질 마을에서 나흘 동안 사람들을 돌봤다'), [['나레이션', '물을 끓여 먹이고 시신을 묻었다. 살아남은 아이들이 대문 밖까지 따라 나왔다. (인덕 +30, 명성 +20)']]);
    },
  },
  {
    key: 'h_kr_tiger',
    kind: 'HISTORY',
    countries: ['KOREA'],
    regions: ['KR_JIRI', 'KR_GWANSEO'],
    once: true,
    weightBy: (s) => (s.season === 'WINTER' ? 3 : s.season === 'AUTUMN' ? 1.5 : 0.6),
    label: () => '호환에 떠는 마을',
    build: () => ({
      title: '호환(虎患)',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      illustration: '/assets/px_jr_tiger.jpg',
      narration: '마을 사람들이 해가 지기도 전에 문을 걸어 잠근다. 지난달에만 셋이 범에게 물려 갔다.',
      script: [
        N('해가 지기도 전에 집집마다 문을 걸어 잠근다. 지난달에만 셋이 범에게 물려 갔다.'),
        P('마을 촌장', '착호갑사도 못 잡은 놈이오. 산군(山君)이라 부르지요. 무사님, 제발…', '무릎을 꿇으며'),
      ],
      options: [
        { id: 'hunt', label: '산군을 잡으러 산에 오른다 (2일)', hint: '⚠ 진검승부 · 맹수' },
        { id: 'leave', label: '갈 길이 바쁘다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt !== 'hunt') return s;
      return journeyBattle(spendDays(s, 2), c, opt, {
        stakes: 'HOSTILE', title: '산군(山君)',
        subtitle: '사람 맛을 본 호랑이',
        name: '지리산 산군',
        enemyTitle: '착호갑사도 못 잡은 범',
        age: 12,
        ai: 'RUSHDOWN',
        scale: roadScale(s, 1.2),
        weapon: 'UNARMED',
        skills: ['sk_kr_03', 'sk_kr_04', 'sk_cn_01'],
        rewardMoney: 60,
        rewardFame: 50,
      });
    },
    onBattle: (s, _opt, won) => {
      if (!won) return addHealth(s, -15);
      const n = addRep(addFame(s, 20), { virtue: 10 });
      return say(highlight(n, '사람 잡던 산군을 잡아 마을을 구했다'), [['마을 촌장', '이 은혜를 어찌… 범 가죽은 무사님 것이오!'], ['나레이션', '고을에 「범 잡은 무사」의 이야기가 퍼졌다.']]);
    },
  },

  // ═════════════ 청 ═════════════
  {
    key: 'h_cn_nanxun',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_JIANGNAN'],
    cond: (s) => [1751, 1757, 1762, 1765, 1780, 1784].includes(s.year),
    trigger: { seasons: ['SPRING'] },
    once: true,
    label: () => '남순 행렬',
    build: () => ({
      title: '건륭제 남순 — 어가 앞의 백성',
      category: 'HISTORICAL',
      illustration: '/assets/px_jr_canal_procession.jpg',
      narration: '운하를 가득 메운 용선(龍船). 강가에 엎드린 군중 사이에서 한 노파가 고소장을 들고 뛰쳐나간다.',
      script: [
        N('만세야의 남순. 운하를 용선이 가득 메웠고, 강둑에는 백성들이 이마를 땅에 댄 채 엎드려 있다.'),
        N('한 노파가 고소장을 치켜들고 행렬 앞으로 뛰쳐나간다. 어전 시위들이 칼을 뽑는다.'),
        P('어전 시위', '어가를 범하는 자는 목을 벤다! 비켜라!', '칼을 치켜들며', 'ANGRY'),
      ],
      options: [
        { id: 'shield', label: '노파 앞을 막아선다', hint: '⚠ 진검승부 · 어전 시위' },
        { id: 'perform', label: '「무예를 바치겠다」며 시선을 돌린다', hint: '목검 시합 · 이기면 어전에서 칭찬받는다' },
        { id: 'leave', label: '엎드린 채 고개를 들지 않는다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'leave') return s;
      return journeyBattle(s, c, opt, {
        stakes: opt === 'perform' ? 'SPAR' : 'HOSTILE', title: '어전 시위',
        subtitle: opt === 'shield' ? '어가 앞에서 칼을 막아서다' : '어가 앞 무예 시연',
        name: '어전 일등시위',
        enemyTitle: '만주 팔기의 정예',
        age: 33,
        ai: 'DUELIST',
        scale: roadScale(s, 1.15),
        weapon: 'BLADE',
        skills: ['sk_cn_06', 'sk_cn_05', 'sk_cn_02'],
        rewardFame: 50,
      });
    },
    onBattle: (s, opt, won) => {
      if (opt === 'shield') {
        if (!won) return say(addHealth(addFame(s, -10), -20), [['나레이션', '시위의 칼등에 맞아 쓰러졌다. 노파의 고소장은 강물에 떨어졌다.']]);
        const n = addFame(addRep(s, { virtue: 20 }), 30);
        return say(highlight(n, '남순 어가 앞에서 억울한 노파를 지켜 냈다'), [['나레이션', '용선의 휘장이 걷히고, 누군가 고소장을 가져오라 손짓했다. 노파의 억울함이 풀렸다.']]);
      }
      if (!won) return s;
      const n = { ...addMoney(addFame(s, 40), 100), flags: { ...s.flags, royalAlliance: true } };
      return say(highlight(n, '남순 어가 앞에서 무예를 바쳐 하사금을 받았다'), [['나레이션', `용선에서 내관이 내려와 비단과 은 100${cur(s)}을 하사했다. 조정이 도장의 이름을 기억한다.`]]);
    },
  },
  {
    key: 'h_cn_wanglun',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_JIANGNAN'],
    years: [1774, 1774],
    trigger: { seasons: ['AUTUMN', 'WINTER'] },
    once: true,
    label: () => '청수교 포교소',
    build: () => ({
      title: '청수교(淸水敎)의 권유',
      category: 'HISTORICAL',
      narration: '산동 임청에서 운하를 타고 내려왔다는 사내가 맑은 물 한 사발을 내민다. 「이 물을 마시면 칼도 총도 몸을 뚫지 못한다」',
      script: [
        N('1774년 가을, 산동 임청 쪽 운하에서 봉기가 일었다는 소문. 그쪽에서 내려왔다는 사내가 맑은 물 한 사발을 내민다.'),
        P('청수교 포교사', '왕륜 교주께서 무생노모의 뜻을 받으셨소. 이 물을 마시면 칼도 총도 몸을 뚫지 못하오. 그대 같은 무인이 필요하오.', '물그릇을 내밀며'),
      ],
      options: [
        { id: 'join', label: '물을 마시고 교두가 된다', hint: '⚠ 이단·살기, 관아의 추적' },
        { id: 'expose', label: '「그럼 내 칼을 받아 보라」 — 사술을 깨뜨린다', hint: '⚠ 진검승부' },
        { id: 'leave', label: '물그릇을 밀어내고 떠난다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'join') {
        let n = addRep(addMoney(s, 60), { arcane: 10, ruthless: 10 });
        n = addEcho(n, { key: 'rebel_hunt', minYears: 0.5, maxYears: 2, channel: 'HOME', bornText: '청수교 왕륜의 무리에 교두로 섰다' });
        return say(n, [['나레이션', `물은 그냥 물이었다. 그래도 사람들은 믿었다. 교두의 사례로 60${cur(s)}을 받았다.`]]);
      }
      if (opt === 'expose') {
        return journeyBattle(s, c, opt, {
          stakes: 'HOSTILE', title: '청수교 호법',
          subtitle: '칼이 뚫지 못한다는 몸',
          name: '청수교 호법',
          enemyTitle: '부적을 두른 장사',
          age: 30,
          ai: 'AGGRESSIVE',
          scale: roadScale(s, 0.95),
          weapon: 'UNARMED',
          skills: ['sk_cn_01', 'sk_cn_02', 'sk_cn_05'],
          rewardFame: 30,
        });
      }
      return s;
    },
    onBattle: (s, _opt, won) => (won ? say(addRep(s, { virtue: 8 }), [['나레이션', '칼등에 맞은 호법이 비명을 질렀다. 「물」의 사술이 깨지자 장정들이 흩어졌다.']]) : s),
  },
  {
    key: 'h_cn_macartney',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_JIANGNAN'],
    years: [1793, 1793],
    trigger: { seasons: ['AUTUMN', 'WINTER'] },
    once: true,
    label: () => '영길리 사절단 숙영지',
    build: () => ({
      title: '영길리 사절단의 사관',
      category: 'FANTASY',
      narration: '열하에서 돌아가는 영국 사절단이 운하 옆에 숙영했다. 붉은 군복의 사관이 가느다란 칼로 허공을 찌르며 연습한다.',
      script: [
        N('열하에서 황제를 만나고 돌아가는 영길리 사절단. 붉은 군복의 사관 하나가 가느다란 칼로 허공을 찌른다.'),
        P('영국 사관', '(통역을 통해) 당신 나라의 칼은 춤 같다고 들었소. 우리 칼은 찌르는 칼이오. 한번 겨뤄 보겠소?', '칼끝을 세우며'),
      ],
      options: [
        { id: 'duel', label: '겨룬다', hint: '목검 시합 · 서양 검술' },
        { id: 'leave', label: '양인과 엮이지 않는다' },
      ],
    }),
    resolve: (s, opt, c) =>
      opt === 'duel'
        ? journeyBattle(s, c, opt, {
            stakes: 'SPAR', title: '영길리 해군 사관',
            subtitle: '찌르는 칼',
            name: '해군 중위 해리스',
            enemyTitle: '매카트니 사절단 호위',
            age: 29,
            ai: 'DUELIST',
            scale: roadScale(s, 1.0),
            weapon: 'BLADE',
            skills: ['sk_we_02', 'sk_we_01', 'sk_we_06'],
            rewardFame: 30,
          })
        : s,
    onBattle: (s, _opt, won) => {
      const g = giveBook(s, 'bk_we_08', won ? 40 : 15);
      const n = addRep(g.state, { arcane: 3 });
      return say(highlight(n, '영길리 사관과 칼을 겨루었다'), [
        ['영국 사관', won ? '(통역) 놀랍군. 이 책을 기념으로 주겠소. 우리 함대의 교본이오.' : '(통역) 좋은 칼이었소. 이 책을 보면 우리를 더 잘 알게 될 거요.'],
        ['나레이션', g.title ? `${josa(g.title || '', '을를')} 얻었다.` : '사관과 악수를 나눴다.'],
      ]);
    },
  },
  {
    key: 'h_cn_whitelotus',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_HUGUANG'],
    years: [1796, 1804],
    once: true,
    label: () => '유민 마을',
    build: () => ({
      title: '백련교의 난 — 유민 마을',
      category: 'HISTORICAL',
      illustration: '/assets/px_jr_refugees.jpg',
      narration: '불탄 마을. 향용(鄕勇)들이 남은 사람들을 끌어내 교도인지 캐묻는다. 산 위에서는 백련교 깃발이 흔들린다.',
      script: [
        N('「관이 핍박하니 백성이 반란한다(官逼民反)」. 호북의 유민들이 백련교 깃발 아래 모였다.'),
        N('불탄 마을. 향용들이 남은 사람들을 끌어내 교도냐고 캐묻는다. 한 아이가 죽은 어미 곁에 앉아 있다.'),
        P('향용 대장', '칼 쓰는 놈이군. 향용으로 들어오면 은을 주마. 교도 머리 하나에 은 닷 냥이다.', '피 묻은 칼을 닦으며'),
      ],
      options: [
        { id: 'militia', label: '향용 교두가 된다', hint: '⚠ 진검승부 · 교도 무사와 싸운다' },
        { id: 'protect', label: '아이와 남은 사람들을 산 너머로 피신시킨다 (4일)', hint: '인덕 · 고아' },
        { id: 'leave', label: '이 난리에서 빠져나간다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'militia') {
        return journeyBattle(s, c, opt, {
          title: '백련교 무사',
          subtitle: '무생노모의 전사',
          name: '백련교 호법 무사',
          enemyTitle: '혼원교 계열의 고수',
          age: 37,
          ai: 'AGGRESSIVE',
          scale: roadScale(s, 1.1),
          weapon: 'POLEARM',
          skills: ['sk_cn_06', 'sk_cn_09', 'sk_cn_02'],
          realDuel: true,
          rewardMoney: 100,
          rewardFame: 40,
        });
      }
      if (opt === 'protect') {
        const o = orphan(spendDays(s, 4), '백련교 난리의 고아');
        const n = addRep(o.state, { virtue: 22 });
        return say(highlight(n, '백련교 난리 속에서 유민들을 피신시켰다'), [['나레이션', `나흘 밤을 걸어 산을 넘었다. ${o.name ? `아이 ${josa(o.name, '은는')} 끝까지 손을 놓지 않았다.` : ''} (인덕 +22)`]]);
      }
      return s;
    },
    onBattle: (s, _opt, won) => (won ? say(addRep(s, { ruthless: 10 }), [['향용 대장', '은 백 냥이다. 다음에도 부르마.'], ['나레이션', '쓰러진 교도 무사의 품에서 무생노모의 부적이 떨어졌다.']]) : s),
  },
  {
    key: 'h_cn_heshen',
    kind: 'HISTORY',
    countries: ['CHINA'],
    years: [1799, 1800],
    once: true,
    label: () => '화신 가문의 별장',
    build: () => ({
      title: '화신(和珅)의 숨겨진 은',
      category: 'HISTORICAL',
      narration: '태상황이 붕어하자마자 화신이 자결을 명받았다. 그의 별장 터에 은을 묻어 두었다는 소문이 돈다.',
      script: [
        N('1799년, 건륭 태상황이 붕어한 지 보름 만에 권신 화신이 자결을 명받았다. 그 집에서 나온 은이 나라 몇 해 세입이었다 한다.'),
        N('버려진 별장 터. 가산(假山) 바위 아래 흙이 최근에 파헤쳐졌다 다시 덮인 흔적이 있다.'),
      ],
      options: [
        { id: 'dig', label: '판다 (2일)', hint: '거금 · 관아가 은을 추적할 수 있다' },
        { id: 'report', label: '관아에 알린다', hint: '명성 · 조정의 신임' },
        { id: 'leave', label: '권력자의 은에는 손대지 않는다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'dig') {
        let n = addRep(addMoney(spendDays(s, 2), 300), { commerce: 12, ruthless: 6 });
        n = addEcho(n, { key: 'heshen_audit', minYears: 0.5, maxYears: 2, channel: 'HOME', bornText: '권신 화신의 별장 터에서 은을 파냈다' });
        return say(highlight(n, '화신의 별장 터에서 은을 파냈다'), [['나레이션', `항아리 셋. 은 300${cur(s)}! 손이 떨린다. 누가 본 건 아니겠지.`]]);
      }
      if (opt === 'report') {
        const n = { ...addFame(spendDays(s, 1), 40), flags: { ...s.flags, royalAlliance: true } };
        return say(n, [['나레이션', '관아에 알리자 대인이 직접 나와 치하했다. 조정이 도장을 기억하게 되었다.']]);
      }
      return s;
    },
  },
  {
    key: 'h_cn_tianli',
    kind: 'HISTORY',
    countries: ['CHINA'],
    years: [1813, 1814],
    trigger: { periods: [{ year: 1813, seasons: ['AUTUMN', 'WINTER'] }, { year: 1814, seasons: ['SPRING'] }] },
    once: true,
    label: () => '숨어든 천리교도',
    build: () => ({
      title: '천리교의 난 — 도망자',
      category: 'HISTORICAL',
      narration: '자금성 동화문까지 쳐들어갔던 천리교 무리. 그 생존자 하나가 헛간에 숨어 있다. 팔에 「天理」라는 문신.',
      script: [
        N('1813년 가을, 천리교 무리가 내시들의 안내로 자금성 안까지 쳐들어갔다. 반나절 만에 진압되었다.'),
        N('헛간 짚더미 아래 청년 하나가 숨어 있다. 팔에 「天理」라는 문신. 열여섯이나 되었을까.'),
        P('천리교 청년', '…교주님이 하늘의 때가 왔다 했어요. 다 거짓말이었어요.', '울먹이며'),
      ],
      options: [
        { id: 'hide', label: '문신을 지지고 머리를 깎여 승려로 보낸다', hint: '인덕 · 위험' },
        { id: 'hand', label: '관아에 넘긴다', hint: '포상금' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'hide') return say(addRep(s, { virtue: 12 }), [['나레이션', '청년은 이를 악물고 문신을 지지는 고통을 견뎠다. 새벽에 산사로 떠났다. (인덕 +12)']]);
      return say(addRep(addMoney(s, 80), { ruthless: 12 }), [['나레이션', `포상금 80${cur(s)}. 청년은 능지처참되었다고 들었다. (살기 +12)`]]);
    },
  },
  {
    key: 'h_cn_biaoju',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_JIANGNAN', 'CN_HUASHAN'],
    once: false,
    weight: 0.4,
    label: () => '표국 깃발',
    build: () => ({
      title: '표국(鏢局)의 의뢰',
      category: 'LIFE',
      narration: '「진원표국」 깃발을 단 수레들. 표두가 손짓한다. 녹림이 들끓는 고개를 넘어야 한다고.',
      script: [
        N('표국 깃발을 단 수레 행렬. 표두가 창을 짚고 손짓한다.'),
        P('표두', '저 고개에 녹림이 새로 산채를 틀었소. 표사 하나가 다쳤으니, 사흘만 함께 가 주면 은 120냥을 드리리다.', '포권하며'),
      ],
      options: [
        { id: 'escort', label: '사흘 동안 표물을 호송한다 (3일)', hint: '⚠ 진검승부 · 녹림 습격' },
        { id: 'leave', label: '갈 길이 다르다' },
      ],
    }),
    resolve: (s, opt, c) =>
      opt === 'escort'
        ? journeyBattle(spendDays(s, 3), c, opt, {
            stakes: 'HOSTILE', title: '녹림 습격',
            subtitle: '표물을 노리는 산채',
            name: '녹림 두령',
            enemyTitle: '고개의 새 산채',
            age: 40,
            ai: 'HEAVY',
            scale: roadScale(s, 1.0),
            weapon: 'POLEARM',
            skills: ['sk_cn_06', 'sk_cn_02', 'base_v_slash'],
            rewardMoney: 120,
            rewardFame: 25,
          })
        : s,
    onBattle: (s, _opt, won) => (won ? say(addRep(s, { commerce: 8 }), [['표두', '「진원표국」은 은혜를 잊지 않소. 강남 어디서든 우리 깃발을 찾으시오.']]) : say(addMoney(s, 30), [['표두', '표물은 잃었지만 목숨은 건졌소. 수고비는 드리리다.']])),
  },
  {
    key: 'h_cn_opium',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_JIANGNAN'],
    years: [1810, 1830],
    once: true,
    label: () => '연관(煙館)',
    build: () => ({
      title: '아편 밀매상의 제안',
      category: 'LIFE',
      narration: '어두운 연관(煙館). 사람들이 침상에 누워 긴 대롱을 빤다. 밀매상이 웃으며 다가온다.',
      script: [
        N('어두운 연관. 사람들이 침상에 누워 긴 대롱을 빨며 반쯤 감긴 눈으로 천장을 본다.'),
        P('밀매상', '도장을 하신다고? 제자들 시켜서 우리 물건 좀 날라 주시오. 한 번에 은 250냥. 관아는 이미 손써 놨소.', '은자를 흔들며'),
      ],
      options: [
        { id: 'take', label: '받는다', hint: '⚠ 거금 · 제자가 물들 수 있다' },
        { id: 'report', label: '관아에 고발한다', hint: '명성 · 원한' },
        { id: 'leave', label: '침을 뱉고 나온다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'take') {
        let n = addRep(addMoney(s, 250), { ruthless: 18, commerce: 10 });
        n = addEcho(n, { key: 'opium_disciple', minYears: 1.5, maxYears: 4, channel: 'HOME', bornText: '아편 밀매상의 돈을 받았다' });
        return say(n, [['나레이션', `은 250${cur(s)}. 묵직하다. 연관의 매캐한 연기가 옷에 배었다.`]]);
      }
      if (opt === 'report') return say(addRep(addFame(s, 25), { virtue: 8 }), [['나레이션', '관아가 연관을 덮쳤다. 밀매상이 끌려가며 이쪽을 노려보았다.']]);
      return s;
    },
  },

  // ═════════════ 일본 ═════════════
  {
    key: 'h_jp_meiwa',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_TOKAIDO'],
    years: [1772, 1772],
    trigger: { seasons: ['SPRING', 'SUMMER'] },
    once: true,
    label: () => '불탄 에도의 이재민',
    build: (st) => ({
      title: '메이와 대화재의 이재민',
      category: 'HISTORICAL',
      narration: '메와쿠(迷惑)한 해라 했던 메이와 9년. 에도의 절반이 탔다. 길가에 그을린 얼굴의 사람들이 줄지어 앉아 있다.',
      script: [N('1772년, 메구로 행인자카에서 시작된 불이 에도의 절반을 태웠다. 「메이와 9년, 메와쿠한 해」라고들 한다.'), N('그을린 얼굴의 사람들이 길가에 줄지어 앉아 있다. 아이들은 울 기운도 없다.')],
      options: [
        { id: 'help', label: `노자를 털어 죽을 쑤어 나눈다 (30${cur(st)}, 2일)` },
        { id: 'leave', label: '지나간다' },
      ],
    }),
    resolve: (s, opt) => (opt === 'help' ? say(addFame(addRep(spendDays(addMoney(s, -30), 2), { virtue: 18 }), 15), [['나레이션', '이틀 동안 가마솥에 죽을 쑤었다. 「검객 양반의 죽」이 에도에 소문났다. (인덕 +18)']]) : s),
  },
  {
    key: 'h_jp_tenmei',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    years: [1783, 1787],
    trigger: { seasons: ['SPRING', 'SUMMER'] },
    once: true,
    label: () => '쌀 도매상 앞의 군중',
    build: () => ({
      title: '덴메이 대기근 — 우치코와시',
      category: 'HISTORICAL',
      narration: '쌀값이 열 배로 뛰었다. 굶주린 군중이 쌀 도매상의 덧문을 부수려 한다. 상인은 문 안에서 떨고 있다.',
      script: [
        N('덴메이 흉년이 몇 해째다. 아사마산의 재가 하늘을 덮었고, 북쪽에서는 사람이 사람을 먹었다는 소문까지 돈다.'),
        N('쌀 도매상 앞에 굶주린 군중이 몰려들었다. 도끼와 쇠갈고리를 든 손들이 덧문을 두드린다.'),
        P('쌀 도매상', '무사님! 지켜 주시면 사례는 넉넉히 하겠소!', '덧문 틈으로'),
        P('군중 속 사내', '저놈은 쌀을 쌓아 두고 값만 올렸다! 무사님도 굶어 봤으면 알 거요!', '도끼를 쳐들며', 'ANGRY'),
      ],
      options: [
        { id: 'guard', label: '상인을 지킨다', hint: '진검승부 · 상무' },
        { id: 'open', label: '상인을 설득해 쌀 창고를 열게 한다 (2일)', hint: '인덕 · 마을의 은혜' },
        { id: 'join', label: '군중과 함께 덧문을 부순다', hint: '살기 · 쌀 몇 섬' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'guard') {
        return journeyBattle(s, c, opt, {
          stakes: 'MERCY', title: '우치코와시 군중의 선봉',
          subtitle: '굶주린 자의 도끼',
          name: '군중의 선봉 사내',
          enemyTitle: '굶주린 마을 장정',
          age: 32,
          ai: 'RUSHDOWN',
          scale: roadScale(s, 0.8),
          weapon: 'UNARMED',
          skills: ['sk_jp_04', 'sk_jp_05', 'base_h_slash'],
          rewardMoney: 120,
          rewardFame: 10,
        });
      }
      if (opt === 'open') {
        let n = addRep(spendDays(s, 2), { virtue: 25 });
        n = addEcho(n, { key: 'tenmei_village', minYears: 4, maxYears: 8, channel: 'HOME', bornText: '덴메이 대기근 때 쌀 창고를 열게 해 굶주린 마을을 살렸다' });
        return say(highlight(n, '덴메이 기근 때 쌀 창고를 열게 했다'), [['나레이션', '이틀을 설득한 끝에 상인이 창고를 열었다. 쌀을 받아 든 노인이 땅에 이마를 댔다. (인덕 +25)']]);
      }
      return say(addRep(addMoney(s, 40), { ruthless: 14 }), [['나레이션', `덧문이 부서지고 쌀가마가 쏟아졌다. 쌀 몇 섬을 팔아 40${cur(s)}을 챙겼다. (살기 +14)`]]);
    },
    onBattle: (s, _opt, won) => (won ? say(addRep(s, { commerce: 12, ruthless: 6 }), [['쌀 도매상', '사례금이오! 무사님 덕에 살았소.'], ['나레이션', '흩어지는 군중의 등이 너무 말라 보였다.']]) : s),
  },
  {
    key: 'h_jp_ikaku',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    years: [1790, 1795],
    once: true,
    label: () => '금서를 파는 낭인 학자',
    build: (st) => ({
      title: '간세이 이학의 금 — 금서',
      category: 'HISTORICAL',
      narration: '주자학 외의 학문을 가르치지 말라는 영이 내렸다. 쫓겨난 학자가 길가에서 몰래 책을 판다.',
      script: [N('「간세이 이학의 금」. 막부의 학문소에서 주자학 말고는 가르치지 말라는 영이 내렸다.'), P('낭인 학자', '난학(蘭學) 책, 양명학 책… 다 금서가 됐소. 불쏘시개가 되느니 칼 든 분 손에 가는 게 낫지요.', '보따리를 풀며')],
      options: [
        { id: 'buy', label: `산다 (60${cur(st)})`, hint: '이국의 서적' },
        { id: 'leave', label: '지나간다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'buy' || s.money < 60) return s;
      const id = pickBook(s, (b) => b.rarity === 'WESTERN' || (b.countryBias === 'CHINA' && b.rarity === 'RARE'));
      const g = id ? giveBook(addMoney(s, -60), id, 15) : { state: addMoney(s, -60), title: null };
      return say(addRep(g.state, { arcane: 4 }), [['나레이션', g.title ? `${josa(g.title || '', '을를')} 샀다. 학자가 「불타지 않게 해 주시오」라며 고개를 숙였다.` : '책을 샀지만 반쯤 불에 그을려 읽을 수가 없었다.']]);
    },
  },
  {
    key: 'h_jp_kodayu',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_TOKAIDO'],
    years: [1793, 1794],
    trigger: { periods: [{ year: 1793, seasons: ['AUTUMN', 'WINTER'] }, { year: 1794, seasons: ['SPRING', 'SUMMER'] }] },
    once: true,
    label: () => '난학자의 집',
    build: () => ({
      title: '로시아에서 돌아온 사람',
      category: 'FANTASY',
      narration: '에도 거리가 술렁인다. 십 년 가까이 로시아를 떠돌다 돌아온 뱃사람 다이코쿠야 고다유가 쇼군 앞에 불려 갔다고.',
      script: [
        N('1792년 가을, 로시아 사절 락스만의 배가 에조치 네무로에 표류민을 데려왔다. 그중 하나가 이세의 뱃사람 다이코쿠야 고다유.'),
        N('그가 에도로 불려 와 쇼군을 알현했다. 난학자 가쓰라가와 호슈가 그의 이야기를 받아 적고 있다는 소문이 돈다.'),
        P('난학자의 제자', '고다유 님이 가져온 그림책 중에 칼 쓰는 법이 그려진 것이 있습니다. 막부 몰래라면… 잠깐 보여 드릴 수는 있지요.', '목소리를 낮추며'),
      ],
      options: [
        { id: 'read', label: '밤에 몰래 찾아가 이국의 무예서를 본다', hint: '이국 서적 · 이단 세평' },
        { id: 'listen', label: '고다유의 이야기만 전해 듣는다', hint: '통찰' },
        { id: 'leave', label: '막부의 금령이 두려워 멀리한다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'read') {
        const id = pickBook(s, (b) => b.rarity === 'WESTERN');
        const g = id ? giveBook(spendDays(s, 1), id, 15) : { state: s, title: null };
        return say(addRep(g.state, { arcane: 6 }), [['나레이션', g.title ? `등잔불 아래서 낯선 그림들을 베꼈다. ${josa(g.title || '', '을를')} 얻었다. (이단 +6)` : '책은 이미 막부가 거둬 간 뒤였다.']]);
      }
      if (opt === 'listen') return say(addStats(spendDays(s, 1), { ins: 3 }), [['나레이션', '얼음 바다, 수천 리 눈길, 여제의 궁전… 세상이 생각보다 넓다. (통찰 +3)']]);
      return s;
    },
  },
  {
    key: 'h_jp_phaeton',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_KYUSHU'],
    years: [1808, 1809],
    trigger: { periods: [{ year: 1808, seasons: ['AUTUMN', 'WINTER'] }, { year: 1809, seasons: ['SPRING'] }] },
    once: true,
    label: () => '혼란의 나가사키 부교소',
    build: () => ({
      title: '페이튼호 사건',
      category: 'HISTORICAL',
      illustration: '/assets/px_jr_dejima.jpg',
      narration: '화란 깃발을 달고 들어온 배는 영길리 군함이었다. 인질을 잡고 물과 식량을 뜯어 간 뒤 유유히 떠났다. 그날 밤 부교가 배를 갈랐다.',
      script: [
        N('1808년 가을, 화란 깃발을 단 배가 나가사키에 들어왔다. 영길리 군함 페이튼호였다.'),
        N('배는 화란 상관원을 인질로 잡고 물과 식량을 받아 낸 뒤 떠났다. 나가사키 부교 마쓰다이라는 책임을 지고 배를 갈랐다.'),
        P('부교소 무사', '바다 너머에는 우리가 모르는 것이 있소. 칼로는 저 대포를 이길 수 없소… 이 서양 칼을 가져가 연구해 보시오.', '분한 얼굴로'),
      ],
      options: [
        { id: 'take', label: '서양 병기를 받는다', hint: '서양 병기 · 서양에 대한 경계' },
        { id: 'mourn', label: '부교의 넋을 기린다', hint: '구도' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'take') {
        const w = giveWeapon(s, 'wp_we_04');
        const n = { ...w.state, flags: { ...w.state.flags, westernFear: true } };
        return say(n, [['나레이션', w.name ? `「${w.name}」을(를) 받았다. 바다 너머의 칼은 무겁고 길었다.` : '서양 병기는 이미 다른 이가 가져갔다.']]);
      }
      return say(addRep(addStats(s, { wil: 2 }), { ascetic: 8 }), [['나레이션', '부교소 뒤뜰에서 향을 피웠다. 칼을 찬 자의 책임에 대해 오래 생각했다.']]);
    },
  },
  {
    key: 'h_jp_dojoyaburi',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_TOKAIDO'],
    years: [1765, 1830],
    once: false,
    weight: 0.4,
    label: () => '타류시합 간판',
    build: () => ({
      title: '타류시합(他流試合)',
      category: 'DUEL',
      sceneActor: 'RIVAL',
      narration: '「타류시합 사절」 간판 옆에 「단, 무사수행자는 예외」라고 덧붙여 있다. 도장 안에서 죽도 소리가 요란하다.',
      script: [N('「타류시합 사절 — 단, 무사수행자는 예외」. 간판 너머로 죽도와 방구 부딪히는 소리가 요란하다.'), P('도장 사범', '죽도와 방구로 하는 시합이오. 진검은 아니니 부담 갖지 마시오. 이기면 이름을 방명록 맨 위에 적어 드리지.', '방구 끈을 매며')],
      options: [
        { id: 'duel', label: '시합을 청한다 (1일)', hint: '목검 시합 · 명성' },
        { id: 'leave', label: '구경만 한다' },
      ],
    }),
    resolve: (s, opt, c) =>
      opt === 'duel'
        ? journeyBattle(spendDays(s, 1), c, opt, {
            stakes: 'SPAR', title: '타류시합 — 도장 사범',
            subtitle: '죽도와 방구',
            name: '나카니시파 사범',
            enemyTitle: '일도류의 계승자',
            age: 36,
            ai: 'DUELIST',
            scale: roadScale(s, 0.95),
            weapon: 'BLADE',
            skills: ['sk_jp_01', 'sk_jp_03', 'sk_jp_04'],
            rewardFame: 35,
          })
        : s,
    onBattle: (s, _opt, won) => (won ? say(highlight(addFame(s, 10), '타류시합에서 도장 사범을 이겼다'), [['도장 사범', '방명록 맨 위에 이름을 적으시오. 에도에 소문이 날 거요.']]) : say(s, [['도장 사범', '좋은 시합이었소. 다음 무사수행 때 또 들르시오.']])),
  },
  {
    key: 'h_jp_jigen',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_KYUSHU'],
    once: true,
    label: () => '지겐류 수련장',
    build: () => ({
      title: '첫 칼을 받아 보라',
      category: 'DUEL',
      narration: '「체스토!」 기합과 함께 젊은 무사들이 말뚝을 내리친다. 하루 수천 번. 말뚝에서 연기가 난다.',
      script: [N('「체스토!」 젊은 사쓰마 무사들이 하루 수천 번 말뚝을 내리친다.'), P('사쓰마 무사', '지겐류의 첫 칼을 받아 낼 수 있겠소? 막으면 칼째로 머리가 쪼개진다 했소. 피하는 수밖에 없지.', '목검을 치켜들며')],
      options: [
        { id: 'receive', label: '목검으로 첫 칼을 받아 본다', hint: '건강 -15, 정신·깨달음' },
        { id: 'leave', label: '구경만 한다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'receive') return s;
      let n = addStats(addHealth(s, -15), { wil: 4, vit: 1 });
      const g = gainInsight(n, 8, '지겐류 수련장');
      n = g.state;
      return say(highlight(n, '지겐류의 첫 칼을 받아 냈다'), [['나레이션', '막은 목검이 부러지고 어깨가 내려앉았다. 그러나 그 한 칼에 담긴 것이 무엇인지 알았다. (건강 -15, 정신 +4)'], ['나레이션', g.text]]);
    },
  },
];

// ───────── 시대 사건이 남긴 메아리 (HOME) ─────────
export const HISTORY_ECHOES: JourneyEventDef[] = [
  {
    key: 'echo_gyunyeok_soldier',
    kind: 'ECHO_HOME',
    build: () => ({
      title: '장용영 무관이 된 옛 도망자',
      category: 'HISTORICAL',
      narration: '군복 차림의 무관이 말에서 내려 도장 대문 앞에서 군례를 올린다.',
      script: [N('군복 차림의 무관이 말에서 내려 대문 앞에서 군례를 올린다. 팔뚝이 굵다.'), P('장용영 무관', '헛간 짚더미 속에 숨어 있던 장정, 기억하십니까. 이제 상감의 친위 군영에서 창을 가르칩니다.', '눈가가 붉어지며'), P('장용영 무관', '도장의 무예를 군영에 소개하고 싶습니다.')],
      options: [{ id: 'accept', label: '반갑게 맞는다' }],
    }),
    resolve: (s) => {
      const t = takeEcho(s, 'gyunyeok_soldier');
      let n = { ...addFame(t.state, 40), flags: { ...t.state.flags, royalAlliance: true } };
      if (t.echo) n = echoMilestone(n, t.echo, '그 장정이 장용영 무관이 되어 조정과 도장을 이어 주었다');
      return say(n, [['나레이션', '조정이 도장을 후원하게 되었다. (명성 +40)']]);
    },
  },
  {
    key: 'echo_muye_manual',
    kind: 'ECHO_HOME',
    build: (s) => ({
      title: '『무예도보통지』',
      category: 'HISTORICAL',
      narration: '규장각의 서리가 찾아왔다. 새로 엮는 무예서에 이 도장의 무예를 싣고 싶다 한다.',
      script: [
        N('1790년. 규장각 검서관 이덕무·박제가와 장용영 초관 백동수가 왕명으로 무예서를 엮고 있다.'),
        P('규장각 서리', `세자익위사의 노무관 한 분이 숨을 거두기 전에 유언을 남겼소. 「임오년에 나를 숨겨 준 ${s.sectName}의 무예를 꼭 실어 달라」고.`, '두루마리를 펼치며'),
        P('규장각 서리', '『무예신보』의 열여덟 기에 여섯 기를 더해 스물네 기. 그중 한 장을 그대의 유파에 할애하겠소.'),
      ],
      options: [{ id: 'accept', label: '유파의 무예를 바친다' }],
    }),
    resolve: (s) => {
      const t = takeEcho(s, 'muye_manual');
      let n = { ...addFame(t.state, 120), flags: { ...t.state.flags, wroteManual: true, royalAlliance: true } };
      n = addRep(n, { virtue: 10 });
      if (t.echo) n = echoMilestone(n, t.echo, '1790년 유파의 무예가 『무예도보통지』에 실렸다');
      return say(n, [['나레이션', '스물일곱 해 전 산길에서 내린 선택이, 나라의 병서 한 장이 되었다. (명성 +120, 유파의 무예가 병서에 기록됨)']]);
    },
  },
  {
    key: 'echo_sweet_potato',
    kind: 'ECHO_HOME',
    build: () => ({
      title: '흉년과 뒷밭의 뿌리',
      category: 'LIFE',
      narration: '가뭄이 들어 고을 전체가 굶주린다. 그런데 도장 뒷밭의 고구마 덩굴만은 시퍼렇다.',
      script: [N('가뭄이 들었다. 논이 갈라지고 고을 사람들이 풀뿌리를 캔다.'), N('도장 뒷밭, 몇 해 전 심은 고구마 덩굴만은 시퍼렇게 땅을 덮고 있다.')],
      options: [
        { id: 'share', label: '고을 사람들과 나눈다', hint: '인덕·명성' },
        { id: 'keep', label: '식솔들 몫으로 챙긴다', hint: '문하생 충성' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'sweet_potato');
      let n = t.state;
      let result = '';
      if (opt === 'share') {
        n = addFame(addRep(n, { virtue: 25 }), 40);
        result = '흉년에 도장 뒷밭의 고구마로 고을이 굶주림을 면했다';
      } else {
        n = { ...n, disciples: n.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 10) })) };
        result = '흉년에도 도장 식솔은 고구마로 굶지 않았다';
      }
      if (t.echo) n = echoMilestone(n, t.echo, result);
      return say(n, [['나레이션', `${result}.`]]);
    },
  },
  {
    key: 'echo_catholic_inquiry',
    kind: 'ECHO_HOME',
    build: (st) => ({
      title: '신유년의 수사관',
      category: 'HISTORICAL',
      sceneActor: 'ENEMY',
      narration: '포도청 종사관이 도장에 들이닥쳤다. 「서학쟁이 자식을 숨겨 키운다는 고발이 들어왔소.」',
      script: [N('1801년, 신유박해. 포도청 종사관이 포졸들을 이끌고 도장에 들이닥쳤다.'), P('포도청 종사관', '서학쟁이의 자식을 거둬 키운다는 고발이 있소. 그 아이를 내놓으시오.', '포승을 흔들며', 'ANGRY')],
      options: [
        { id: 'bribe', label: `뒷돈을 쥐여 돌려보낸다 (120${cur(st)})` },
        { id: 'stand', label: '「이 아이는 내 제자다」라고 버틴다', hint: '명성 -30, 인덕 +20' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'catholic_inquiry');
      let n = t.state;
      let result = '';
      if (opt === 'bribe') {
        n = addMoney(n, -120);
        result = '신유년 수사관에게 뒷돈을 쥐여 그 아이를 지켰다';
      } else {
        n = addRep(addFame(n, -30), { virtue: 20 });
        result = '신유년 수사관 앞에서 그 아이를 제자라 버텨 지켰다';
      }
      if (t.echo) n = echoMilestone(n, t.echo, result);
      return say(n, [['나레이션', `${result}.`]]);
    },
  },
  {
    key: 'echo_hong_traitor',
    kind: 'ECHO_HOME',
    build: () => ({
      title: '역적 연루',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '정주성이 함락되고 홍경래는 죽었다. 이제 봉기군에 가담했던 자들을 색출한다.',
      script: [N('1812년 봄, 관군이 성 밑에 굴을 파 화약으로 정주성을 무너뜨렸다. 홍경래는 전사했다.'), P('의금부 도사', '정주에서 역도들에게 창을 가르친 자가 있다던데. 이 도장이 맞는가?', '칼자루에 손을 얹으며', 'ANGRY')],
      options: [
        { id: 'fight', label: '포위를 뚫는다', hint: '⚠ 비무 · 이겨도 쫓기는 몸' },
        { id: 'pay', label: `가진 것을 털어 무마한다 (재산의 절반)` },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'fight') {
        return journeyBattle(s, c, opt, {
          title: '의금부 도사',
          subtitle: '역적 색출',
          name: '의금부 도사',
          enemyTitle: '역적을 쫓는 칼',
          age: 42,
          ai: 'DUELIST',
          scale: roadScale(s, 1.1),
          weapon: 'BLADE',
          skills: ['sk_kr_02', 'sk_kr_06', 'sk_kr_01'],
        });
      }
      const t = takeEcho(s, 'hong_traitor');
      let n = addMoney(t.state, -Math.round(t.state.money * 0.5));
      if (t.echo) n = echoMilestone(n, t.echo, '역적 연루 혐의를 재산 절반으로 무마했다');
      return say(n, [['나레이션', '재산의 절반이 의금부 도사의 소매로 사라졌다.']]);
    },
    onBattle: (s, _opt, won) => {
      const t = takeEcho(s, 'hong_traitor');
      let n = won ? addRep(addFame(t.state, -40), { ruthless: 20 }) : addMoney(t.state, -Math.round(t.state.money * 0.7));
      if (t.echo) n = echoMilestone(n, t.echo, won ? '역적을 잡으러 온 의금부 도사를 베고 이름이 더럽혀졌다' : '역적으로 몰려 재산을 몰수당했다');
      return n;
    },
  },
  {
    key: 'echo_rebel_hunt',
    kind: 'ECHO_HOME',
    build: (st) => ({
      title: '관아의 추적',
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '반란 무리에 섰던 일이 관아의 귀에 들어갔다.',
      script: [N('봉기는 진압되었다. 그리고 관아는 가담자를 하나씩 찾아내고 있다.'), P('관아 포두', '청수교 무리에서 교두 노릇을 했다지? 순순히 가자.', '쇠사슬을 들며', 'ANGRY')],
      options: [{ id: 'pay', label: `은으로 무마한다 (150${cur(st)})` }, { id: 'flee', label: '맞서 싸운다', hint: '비무' }],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'flee') return journeyBattle(s, c, opt, { title: '관아 포두', subtitle: '반란 가담자 색출', name: '관아 포두', enemyTitle: '추적자', age: 40, ai: 'AGGRESSIVE', scale: roadScale(s, 1.0), weapon: 'BLADE', skills: ['sk_cn_05', 'sk_cn_02', 'base_h_slash'] });
      const t = takeEcho(s, 'rebel_hunt');
      let n = addMoney(t.state, -150);
      if (t.echo) n = echoMilestone(n, t.echo, '관아의 추적을 은으로 무마했다');
      return n;
    },
    onBattle: (s, _opt, won) => {
      const t = takeEcho(s, 'rebel_hunt');
      let n = won ? addRep(addFame(t.state, -25), { ruthless: 12 }) : addMoney(t.state, -200);
      if (t.echo) n = echoMilestone(n, t.echo, won ? '반란 가담자를 쫓는 관아 포두를 물리쳤다' : '관아에 끌려가 벌금을 물었다');
      return n;
    },
  },
  {
    key: 'echo_heshen_audit',
    kind: 'ECHO_HOME',
    build: (st) => ({
      title: '은의 행방',
      category: 'HISTORICAL',
      sceneActor: 'ENEMY',
      narration: '화신의 재산을 추적하던 관리가 장부를 들고 도장에 찾아왔다.',
      script: [P('호부 관리', '화신의 은 일부가 사라졌소. 별장 근처에서 칼 찬 무사를 보았다는 증언이 있소만.', '장부를 넘기며')],
      options: [
        { id: 'return', label: `은을 돌려준다 (250${cur(st)})` },
        { id: 'deny', label: '모르는 일이라 버틴다', hint: '명성 -30 · 이단 소문' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'heshen_audit');
      let n = t.state;
      if (opt === 'return') n = addMoney(n, -250);
      else n = addRep(addFame(n, -30), { ruthless: 8 });
      if (t.echo) n = echoMilestone(n, t.echo, opt === 'return' ? '관리에게 화신의 은을 돌려주었다' : '화신의 은을 끝내 숨겼다는 소문이 돌았다');
      return n;
    },
  },
  {
    key: 'echo_opium_disciple',
    kind: 'ECHO_HOME',
    cond: (s) => s.disciples.some((d) => !d.dead && !d.isChild),
    build: (s) => {
      const d = s.disciples.find((x) => !x.dead && !x.isChild);
      return {
        title: '연기에 물든 제자',
        category: 'LIFE',
        sceneActor: 'DISCIPLE',
        narration: `문하생 ${d?.name || ''}의 눈이 풀려 있다. 소매에서 아편 대롱이 떨어졌다.`,
        script: [N(`문하생 ${josa(d?.name || '', '이가')} 수련 중에 비틀거린다. 소매에서 아편 대롱이 떨어졌다.`), P(d?.name || '문하생', '…스승님이 날라 준 그 물건이요. 한 번만 피워 봤는데…', '고개를 떨구며')],
        options: [
          { id: 'cure', label: `의원을 불러 끊게 한다 (100${cur(s)})` },
          { id: 'expel', label: '파문한다' },
        ],
        meta: { discipleId: d?.id || '' },
      };
    },
    resolve: (s, opt, c) => {
      const t = takeEcho(s, 'opium_disciple');
      let n = t.state;
      const id = c.data?.discipleId as string;
      if (opt === 'cure') {
        n = addMoney(n, -100);
        n = { ...n, disciples: n.disciples.map((d) => (d.id === id ? { ...d, loyalty: Math.min(100, d.loyalty + 15) } : d)) };
      } else {
        n = { ...n, disciples: n.disciples.map((d) => (d.id === id ? { ...d, dead: true, leftReason: '아편에 물들어 파문' } : d)) };
      }
      if (t.echo) n = echoMilestone(n, t.echo, opt === 'cure' ? '그 돈이 제자를 아편에 물들게 했고, 큰돈을 들여 끊게 했다' : '그 돈이 제자를 아편에 물들게 했고, 끝내 파문했다');
      return n;
    },
  },
  {
    key: 'echo_tenmei_village',
    kind: 'ECHO_HOME',
    build: () => ({
      title: '그해 쌀을 받은 마을',
      category: 'LIFE',
      narration: '시골 사람들이 쌀가마를 지고 도장을 찾아왔다.',
      script: [P('마을 노인', '덴메이 흉년에 쌀 창고를 열게 해 주신 무사님을 찾아 여기까지 왔습니다. 그때 살아난 아이들이 이렇게 컸습니다.', '땅에 이마를 대며'), P('마을 청년', '저도 그때 쌀을 받은 아이입니다. 무사님 밑에서 칼을 배우고 싶습니다.')],
      options: [{ id: 'accept', label: '쌀과 청년을 받는다' }],
    }),
    resolve: (s) => {
      const t = takeEcho(s, 'tenmei_village');
      let n = addMoney(t.state, 70);
      if (hasRoom(n)) {
        const d = { ...createDiscipleEntity(n, { archetype: '덴메이 기근에서 살아난 청년', temperament: 'DILIGENT' }), joinedYear: n.year, temperamentKnown: true, loyalty: 90 };
        n = { ...n, disciples: [...n.disciples, d] };
      }
      if (t.echo) n = echoMilestone(n, t.echo, '그때 살아난 마을이 쌀과 제자를 보내왔다');
      return n;
    },
  },
];
