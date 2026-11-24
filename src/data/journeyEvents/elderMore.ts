import { GameState, GraduatedDisciple } from '../../types/game';
import {
  addFame,
  addHealth,
  addMoney,
  addRep,
  addStats,
  byCountry,
  chance,
  cur,
  H,
  JourneyEventDef,
  N,
  P,
  rand,
  remember,
  say,
  trainEquipped,
} from '../../engine/journeyCore';
import { adjustRelation } from '../../engine/sectLogic';
import { metSects } from '../sects';
import { josa } from '../../utils/korean';
import { addStatus, aliveDisc, callName, heirOf, mapDisc, mem, memTurn, milestone } from './elder';

// 노년(55세 이후)의 사건 ③ 되풀이되지만 매번 다른 사람·다른 장면인 것들.
// 하산한 제자들의 편지, 제자들의 혼례, 어린 제자들의 물음, 계절의 장면, 회고록, 옛 원수와의 화해.

const usedList = (s: GameState, key: string) => (mem(s, key) || '').split(',').filter(Boolean);
const pushUsed = (s: GameState, key: string, v: string) => remember(s, key, [...usedList(s, key), v].slice(-60).join(','));
const seasonWord = (s: GameState) => (s.season === 'SPRING' ? '봄' : s.season === 'SUMMER' ? '여름' : s.season === 'AUTUMN' ? '가을' : '겨울');

// ═════════════════════════ 하산한 제자의 편지 ═════════════════════════
// 실제로 하산한 제자 한 사람마다 한 번. 그 제자가 어떻게 살았는지(대성·출세·평범·배신)에 따라 편지가 다르다.

const letterTarget = (s: GameState): GraduatedDisciple | undefined =>
  (s.graduatedDisciples || []).filter((g) => s.year - g.graduatedYear >= 6 && !usedList(s, 'letters').includes(g.id)).sort((a, b) => a.graduatedYear - b.graduatedYear)[0];

const letter: JourneyEventDef = {
  key: 'elder_letter',
  kind: 'HOME',
  elder: true,
  cooldown: 7,
  weight: 1.3,
  trigger: { age: [57, 99] },
  cond: (s) => !!letterTarget(s),
  build: (s) => {
    const g = letterTarget(s)!;
    const yrs = s.year - g.graduatedYear;
    const age = g.graduatedAge + yrs;
    const body =
      g.fate === 'GRANDMASTER'
        ? `「사부님, ${g.joinedSectName ? `${g.joinedSectName}의 ` : ''}문하를 맡은 지 몇 해가 되었습니다. 제자들에게 「${g.topSkillName}」을 가르칠 때마다 사부님 목소리가 귓가에 들립니다. 올가을 제자들을 데리고 한번 찾아뵙겠습니다.」`
        : g.fate === 'SUCCESSFUL'
        ? `「사부님, 장사가 자리를 잡아 이제 식솔이 스물입니다. 가끔 시비가 붙으면 아직도 몸이 먼저 나갑니다. 마누라가 질색을 합니다. 곶감 한 접 보냅니다.」`
        : g.fate === 'RIVAL_BETRAYER'
        ? `「……세월이 흘러 저도 제자를 둡니다. 그놈들이 저를 떠날 때마다 그날의 사부님 얼굴이 떠오릅니다. 용서를 바라지는 않습니다. 다만 알려 드리고 싶었습니다.」`
        : `「사부님, 저는 여전히 장터에서 국밥을 팝니다. 아들놈이 목검을 들고 설치길래 사부님께 배운 기본 베기를 가르쳐 줬습니다. 사부님 흉내를 냈더니 애가 웃더군요.」`;
    return {
      title: `${g.name}의 편지`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `${yrs}년 전 하산한 ${josa(g.name, '이가')} 편지를 보내왔다. 그도 이제 ${age}세다.`,
      script: [N(`${yrs}년 전 하산한 ${g.name}에게서 편지가 왔다. 그도 이제 ${age}세다. 서툴던 글씨가 단정해졌다.`), N(body)],
      options:
        g.fate === 'RIVAL_BETRAYER'
          ? [
              { id: 'forgive', label: '「다 지난 일이다」 짧은 답장을 쓴다', hint: '인덕 +8 · 구도 +4' },
              { id: 'silent', label: '편지를 접어 서랍에 넣는다', hint: '정신 +1' },
            ]
          : [
              { id: 'reply', label: '긴 답장을 쓴다', hint: '건강 +3 · 정신 +1' },
              { id: 'invite', label: '「한번 들러라. 마당은 그대로다」', hint: g.fate === 'GRANDMASTER' ? '명성 +15 · 문하생들이 보고 배운다' : '인덕 +4' },
            ],
      meta: { gid: g.id, fate: g.fate, name: g.name },
    };
  },
  resolve: (s, opt, c) => {
    const name = String(c.data?.name);
    let n = pushUsed(s, 'letters', String(c.data?.gid));
    if (opt === 'forgive') {
      n = milestone(addRep(n, { virtue: 8, ascetic: 4 }), 'FORGAVE_BETRAYER', `등을 돌렸던 제자 ${josa(name, '을를')} 용서하는 답장을 보냈다`);
      return say(n, [['나레이션', '「다 지난 일이다. 네 제자들에게는 잘해 주어라.」 붓을 내려놓고 한참 창밖을 보았다.']]);
    }
    if (opt === 'silent') return say(addStats(n, { wil: 1 }), [['나레이션', '편지는 서랍 맨 아래에 들어갔다. 버리지는 않았다.']]);
    if (opt === 'reply') return say(addStats(addHealth(n, 3), { wil: 1 }), [['나레이션', `답장이 석 장을 넘어갔다. 「밥은 잘 먹느냐」로 시작해서 「밥 잘 먹어라」로 끝났다.`]]);
    if (c.data?.fate === 'GRANDMASTER') {
      n = { ...addFame(n, 15), disciples: n.disciples.map((d) => (d.dead ? d : { ...d, stats: { ...d.stats, ins: d.stats.ins + 1 } })) };
      const brought = rand(['열둘', '일곱', '스물', '다섯']);
      const scene = rand([
        '손자뻘 제자들이 원로에게 큰절을 올렸다. 마당이 비좁았다.',
        `제자들 앞에서 ${josa(name, '이가')} 「이분이 내 사부님이시다」 하고 소개하는데 목소리가 떨렸다.`,
        '저녁에 두 도장 제자들이 섞여 목검을 맞댔다. 원로와 옛 제자는 마루에서 그걸 지켜보며 누구 제자가 나은지 내기를 했다.',
      ]);
      return say(n, [['나레이션', `${s.season === 'AUTUMN' || s.season === 'SUMMER' ? '이듬해 봄' : '가을'}, ${josa(name, '이가')} 제자 ${brought}을 데리고 왔다. ${scene} (명성 +15)`]]);
    }
    return say(addRep(n, { virtue: 4 }), [['나레이션', `${josa(name, '이가')} 정말로 왔다. 처마 밑에서 둘이 옛날 이야기를 하다가, 저녁을 먹고, 하룻밤 자고 갔다.`]]);
  },
};

// ═════════════════════════ 제자의 혼례 · 제자의 아이 ═════════════════════════

const discWedding: JourneyEventDef = {
  key: 'elder_disc_wedding',
  kind: 'HOME',
  elder: true,
  cooldown: 8,
  trigger: { age: [56, 99] },
  cond: (s) => aliveDisc(s).some((d) => d.age >= 23 && d.age <= 36 && !usedList(s, 'weddings').includes(d.id)),
  build: (s) => {
    const d = rand(aliveDisc(s).filter((x) => x.age >= 23 && x.age <= 36 && !usedList(s, 'weddings').includes(x.id)));
    const bride = byCountry(s, ['방앗간 집 딸', '훈장 댁 막내', '나루터 주막 딸', '이웃 도장의 여제자'], ['찻집 딸', '약방 집 딸', '이웃 무관의 누이', '수놓는 집 딸'], ['두부 가게 딸', '역참 여관 딸', '이웃 도장의 여제자', '절 아랫마을 농가 딸']);
    const partner = d.gender === 'FEMALE' ? rand(byCountry(s, ['대장간 아들', '포목점 셋째', '이웃 도장 사범'], ['표국의 젊은 표사', '서원 서생', '찻집 아들'], ['나무꾼 아들', '역참 마부', '이웃 도장 사범'])) : rand(bride);
    return {
      title: `${d.name}의 혼례`,
      category: 'FAMILY',
      sceneActor: 'DISCIPLE',
      narration: `${josa(d.name, '이가')} ${josa(partner, '과와')} 혼례를 올린다. 주례를 서 달라고 청한다.`,
      script: [P(d.name, `스승님…… ${josa(partner, '과와')} 혼례를 올리게 되었습니다. 부모님이 안 계셔서, 스승님이 주례를 서 주셨으면 합니다.`, '두 손을 모으고'), N('부모 자리에 앉아 달라는 말이다.')],
      options: [
        { id: 'host', label: '도장 마당에서 혼례를 치러 준다', hint: `재화 -40 · ${d.name} 충성 크게↑` },
        { id: 'officiate', label: '주례만 서 준다', hint: `${d.name} 충성↑` },
        { id: 'gift', label: '어릴 적 쓰던 목검을 혼수로 내준다', hint: `${d.name} 충성↑ · 정신 +1` },
      ],
      meta: { discId: d.id, partner },
    };
  },
  resolve: (s, opt, c) => {
    const id = String(c.data?.discId || '');
    const d = s.disciples.find((x) => x.id === id);
    let n = pushUsed(s, 'weddings', id);
    n = remember(n, `wed_${id}`, String(s.turn));
    if (!d || d.dead) return n;
    if (opt === 'host') {
      n = mapDisc(addMoney(n, -40), id, (x) => ({ ...x, loyalty: x.loyalty + 15 }));
      return say(n, [['나레이션', `차일 아래 혼례상이 차려졌다. 문하생들이 목검을 들고 양쪽으로 늘어서 길을 만들었다. ${josa(d.name, '이가')} 그 길을 지나며 울었다.`]]);
    }
    if (opt === 'gift') {
      n = mapDisc(addStats(n, { wil: 1 }), id, (x) => ({ ...x, loyalty: x.loyalty + 8 }));
      return say(n, [['나레이션', '손때 묻은 목검을 내밀었다. 「칼보다 이 사람을 먼저 지켜라.」 신랑 신부가 함께 절을 했다.']]);
    }
    n = mapDisc(n, id, (x) => ({ ...x, loyalty: x.loyalty + 8 }));
    return say(n, [[s.name, '칼은 혼자 쥐는 것이지만, 살림은 둘이 쥐는 것이다. ……이상, 주례사 끝.'], ['나레이션', '하객들이 웃었다. 짧은 주례사였다.']]);
  },
};

const discBaby: JourneyEventDef = {
  key: 'elder_disc_baby',
  kind: 'HOME',
  elder: true,
  cooldown: 10,
  cond: (s) => aliveDisc(s).some((d) => usedList(s, 'weddings').includes(d.id) && s.turn - memTurn(s, `wed_${d.id}`) >= 6 && !usedList(s, 'babies').includes(d.id)),
  build: (s) => {
    const d = rand(aliveDisc(s).filter((x) => usedList(s, 'weddings').includes(x.id) && s.turn - memTurn(s, `wed_${x.id}`) >= 6 && !usedList(s, 'babies').includes(x.id)));
    return {
      title: `${d.name}의 아이`,
      category: 'FAMILY',
      sceneActor: 'DISCIPLE',
      narration: `${josa(d.name, '이가')} 돌쟁이 아이를 안고 왔다. 돌잡이 상을 도장에서 차리고 싶단다.`,
      script: [N(`${josa(d.name, '이가')} 돌쟁이 아이를 안고 왔다. 돌잡이 상에 실타래, 붓, 엽전…… 그리고 작은 목검이 놓였다.`), P(d.name, '스승님 앞에서 잡게 하고 싶었습니다.', '쑥스럽게')],
      options: [
        { id: 'watch', label: '아이가 무엇을 잡는지 지켜본다', hint: '운에 맡긴다' },
        { id: 'nudge', label: '슬쩍 목검을 아이 쪽으로 민다', hint: '살기 +1 · 다들 웃는다' },
      ],
      meta: { discId: d.id },
    };
  },
  resolve: (s, opt, c) => {
    const id = String(c.data?.discId || '');
    const n = mapDisc(pushUsed(s, 'babies', id), id, (x) => ({ ...x, loyalty: x.loyalty + 5 }));
    if (opt === 'nudge') return say(addRep(n, { ruthless: 1 }), [['나레이션', '아이는 목검을 집어 들고 곧장 원로의 이마를 때렸다. 마당이 웃음바다가 되었다.']]);
    const got = rand(['붓', '실타래', '엽전', '목검']);
    return say(addHealth(n, 3), [['나레이션', got === '목검' ? '아이가 망설임 없이 목검을 쥐었다. 아비가 환호했고, 원로는 모른 척 고개를 돌려 웃었다.' : `아이는 ${josa(got, '을를')} 쥐었다. 「칼잡이 집안에서 ${got}이라니」 하고 아비가 웃었다. 원로는 그게 더 좋았다.`]]);
  },
};

// ═════════════════════════ 어린 제자들의 물음 ═════════════════════════

const QUESTIONS = [
  {
    k: 'why',
    q: '스승님은 왜 칼을 배우셨습니까?',
    a: [
      { id: 'poor', label: '「먹고살려고」 — 있는 그대로', line: '아이들이 실망한 얼굴을 했다. 그래도 그날 밤 한 녀석이 찾아와 「저도 그래서 왔습니다」 하고 웃었다.', rep: { virtue: 3 } },
      { id: 'grand', label: '「지키고 싶은 것이 있어서」', line: '아이들이 고개를 끄덕였다. 무엇을 지키고 싶었는지는 묻지 않았다.', rep: { ascetic: 3 } },
    ],
  },
  {
    k: 'strong',
    q: '스승님, 강하다는 건 뭡니까?',
    a: [
      { id: 'stand', label: '「넘어져도 일어나는 것」', line: '그 말이 아이들 사이에서 구호가 되었다. 목검에 맞고 넘어질 때마다 서로 「일어나!」 하고 외쳤다.', rep: { virtue: 2 } },
      { id: 'notdraw', label: '「뽑지 않아도 되는 것」', line: '아이들은 잘 모르겠다는 얼굴이었다. 십 년쯤 지나면 알 것이다.', rep: { ascetic: 4 } },
    ],
  },
  {
    k: 'death',
    q: '스승님은 죽는 게 무섭지 않으십니까?',
    a: [
      { id: 'yes', label: '「무섭다. 그러니 오늘 칼을 쥐는 거다」', line: '아이들이 숨을 죽였다. 스승도 무섭다는 것이 오히려 아이들을 안심시켰다.', rep: { virtue: 2 } },
      { id: 'no', label: '「칼을 처음 쥔 날 이미 반쯤 죽었다」', line: '아이들이 서로 얼굴을 쳐다보았다. 무슨 말인지 몰라도 멋있다고 생각한 모양이다.', rep: { ruthless: 2 } },
    ],
  },
  {
    k: 'master',
    q: '스승님의 스승님은 어떤 분이셨습니까?',
    a: [
      { id: 'parent', label: '부모 이야기를 들려준다', line: '빚 스무 냥과 목검 두 자루 이야기를 했다. 아이들이 처음으로 이 도장의 시작을 알았다.', rep: { virtue: 3 } },
      { id: 'rival', label: '「내 스승은 내 숙적이었다」', line: '아이들이 웅성거렸다. 숙적 이야기가 밤늦게까지 이어졌다.', rep: { ascetic: 2 } },
    ],
  },
  {
    k: 'regret',
    q: '스승님은 후회되는 일이 있으십니까?',
    a: [
      { id: 'some', label: '하나만 털어놓는다', line: '아무도 모르던 이야기를 하나 했다. 말하고 나니 어깨가 가벼웠다.', rep: { ascetic: 3 } },
      { id: 'none', label: '「후회할 시간에 한 번 더 휘둘렀다」', line: '아이들이 깔깔 웃었다. 반은 거짓말이었다.', rep: { ruthless: 1 } },
    ],
  },
];

const question: JourneyEventDef = {
  key: 'elder_question',
  kind: 'HOME',
  elder: true,
  cooldown: 9,
  trigger: { age: [58, 99] },
  cond: (s) => s.disciples.some((d) => !d.dead && d.age <= 20) && QUESTIONS.some((q) => !usedList(s, 'questions').includes(q.k)),
  build: (s) => {
    const q = rand(QUESTIONS.filter((x) => !usedList(s, 'questions').includes(x.k)));
    const kid = rand(s.disciples.filter((d) => !d.dead && d.age <= 20));
    return {
      title: `어린 제자의 물음 — 「${q.q}」`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `수련을 마친 저녁, 막내 ${josa(kid.name, '이가')} 원로의 옆에 쪼그려 앉아 묻는다.`,
      script: [P(kid.name, q.q, '무릎을 끌어안고'), N('다른 아이들도 슬금슬금 모여든다.')],
      options: q.a.map((a) => ({ id: a.id, label: a.label })),
      meta: { k: q.k, kidId: kid.id },
    };
  },
  resolve: (s, opt, c) => {
    const q = QUESTIONS.find((x) => x.k === c.data?.k);
    const a = q?.a.find((x) => x.id === opt);
    if (!q || !a) return s;
    const n = mapDisc(addRep(pushUsed(s, 'questions', q.k), a.rep), String(c.data?.kidId || ''), (x) => ({ ...x, loyalty: x.loyalty + 4, stats: { ...x.stats, wil: x.stats.wil + 1 } }));
    return say(n, [['나레이션', a.line]]);
  },
};

// ═════════════════════════ 계절의 장면 ═════════════════════════

const SCENES: Record<string, Array<{ k: string; title: string | ((s: GameState) => string); text: string | ((s: GameState) => string); options: Array<{ id: string; label: string; hint?: string }>; out: Record<string, (s: GameState) => GameState> }>> = {
  SPRING: [
    {
      k: 'plum',
      title: '매화가 피었다',
      text: '마당 귀퉁이 늙은 매화나무에 꽃이 피었다. 도장을 연 해에 심은 나무다.',
      options: [{ id: 'paint', label: '먹을 갈아 매화를 친다', hint: '정신 +2' }, { id: 'yard', label: '꽃 아래서 제자들과 차를 마신다', hint: '건강 +4' }],
      out: {
        paint: (s) => say(addStats(s, { wil: 2 }), [['나레이션', '칼 쥐던 손이라 획이 굵었다. 제자들은 그 그림을 도장 벽에 걸었다.']]),
        yard: (s) => say(addHealth(s, 4), [['나레이션', '꽃잎이 찻잔에 떨어졌다. 아무도 건져 내지 않았다.']]),
      },
    },
    {
      k: 'swallow',
      title: '돌아온 제비',
      text: '처마 밑에 제비가 돌아왔다. 올해로 몇 번째 봄인지 세다가 그만두었다.',
      options: [{ id: 'count', label: '도장에서 맞은 봄을 손가락으로 세어 본다', hint: '통찰 +1' }, { id: 'nest', label: '제비집 아래 받침을 달아 준다', hint: '인덕 +2' }],
      out: {
        count: (s) => say(addStats(s, { ins: 1 }), [['나레이션', `${s.age - (s.startAge || 20)}번째 봄이었다. 손가락이 모자랐다.`]]),
        nest: (s) => say(addRep(s, { virtue: 2 }), [['나레이션', '사다리를 붙잡은 제자가 「원로님, 내려오세요!」 하고 사색이 되었다.']]),
      },
    },
  ],
  SUMMER: [
    {
      k: 'monsoon',
      title: '장마',
      text: '장마가 열흘째다. 연무장 바닥이 질척하고 관절이 쑤신다.',
      options: [{ id: 'inside', label: '안채에서 제자들에게 이론을 가르친다', hint: '문하생 통찰↑' }, { id: 'rain', label: '빗속에서 칼을 쥔다 — 젊을 때처럼', hint: '숙련↑ · 건강 -5' }],
      out: {
        inside: (s) => say({ ...s, disciples: s.disciples.map((d) => (d.dead ? d : { ...d, stats: { ...d.stats, ins: d.stats.ins + 1 } })) }, [['나레이션', '빗소리를 배경으로 칼 이야기를 했다. 아이들 몇은 졸았다.']]),
        rain: (s) => say(addHealth(trainEquipped(s, 50), -5), [['나레이션', '빗줄기를 베었다. 젊을 때는 빗방울을 둘로 갈랐다. 지금은 빗줄기 사이로 칼이 지나갔다.']]),
      },
    },
    {
      k: 'well',
      title: '우물가의 수박',
      text: '제자들이 우물에 담가 둔 수박을 건져 왔다. 한낮의 연무장이 조용하다.',
      options: [{ id: 'cut', label: '목검으로 수박을 갈라 보인다', hint: '명성 +2 · 아이들이 환호한다' }, { id: 'nap', label: '수박 한 쪽 먹고 낮잠을 잔다', hint: '건강 +5' }],
      out: {
        cut: (s) => say(addFame(s, 2), [['나레이션', '목검이 지나간 자리로 수박이 정확히 반으로 갈라졌다. 아이들이 한 달 내내 그 이야기를 했다.']]),
        nap: (s) => say(addHealth(s, 5), [['나레이션', '매미 소리가 자장가였다.']]),
      },
    },
  ],
  AUTUMN: [
    {
      k: 'persimmon',
      title: '감 따는 날',
      text: '마당 감나무에 감이 주렁주렁 열렸다. 제자들이 장대를 들고 나섰다.',
      options: [{ id: 'leave', label: '「새들 몫은 남겨 두어라」', hint: '인덕 +3' }, { id: 'climb', label: '「내가 따마」 — 직접 나무에 오른다', hint: '⚠ 건강 시험' }],
      out: {
        leave: (s) => say(addRep(s, { virtue: 3 }), [['나레이션', '꼭대기 몇 알이 남았다. 겨울 내내 까치가 와서 쪼았다.']]),
        climb: (s) => (chance(0.6) ? say(addStats(s, { agi: 1 }), [['나레이션', '두 가지 만에 꼭대기에 올랐다. 제자들이 박수를 쳤고, 내려올 때는 제자 셋이 받쳤다.']]) : say(addStatus(addHealth(s, -10), 'LIGHT_INJURY', '감나무 낙상', 1), [['나레이션', '세 번째 가지가 부러졌다. 다행히 제자들이 받았다. 그래도 허리를 삐끗했다.']])),
      },
    },
    {
      k: 'harvest',
      title: (s) => byCountry(s, '추석 차례상', '중추절의 월병', '오봉(お盆)의 등불'),
      text: (s) => byCountry(s, '추석이다. 갈 곳 없는 제자들이 도장에 남아 차례상을 차렸다.', '중추절이다. 고향에 못 간 제자들이 도장 마당에서 월병을 나누고 달을 올려다본다.', '오봉이다. 고향에 못 간 제자들이 도장 문 앞에 조상을 맞는 등불을 걸었다.'),
      options: [{ id: 'together', label: '모두를 한 상에 앉힌다', hint: '문하생 전원 충성 +3' }, { id: 'names', label: '먼저 떠난 이들의 이름을 지방에 적는다', hint: '정신 +2' }],
      out: {
        together: (s) => say({ ...s, disciples: s.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 3) })) }, [['나레이션', byCountry(s, '송편 모양이 다 달랐다. 원로는 제일 못생긴 것을 집었다.', '월병 하나를 여덟 조각으로 나눴다. 제일 작은 조각은 원로 몫이 되었다.', '제자들이 빚은 단고가 다 찌그러져 있었다. 원로는 제일 찌그러진 것을 집었다.')]]),
        names: (s) => say(addStats(s, { wil: 2 }), [['나레이션', `지방에 이름을 적다 보니 종이가 모자랐다. ${s.disciples.filter((d) => d.dead).length ? `먼저 간 제자 ${s.disciples.filter((d) => d.dead).length}명.` : ''}`]]),
      },
    },
  ],
  WINTER: [
    {
      k: 'snow',
      title: '첫눈',
      text: '밤사이 첫눈이 왔다. 마당이 하얗다. 아직 아무도 밟지 않았다.',
      options: [{ id: 'first', label: '제일 먼저 나가 눈 위에 초식의 발자국을 남긴다', hint: '통찰 +1 · 제자들이 따라 밟는다' }, { id: 'watch', label: '창으로 아이들이 뛰어나가는 것을 본다', hint: '건강 +3' }],
      out: {
        first: (s) => say(addStats(s, { ins: 1 }), [['나레이션', '눈 위에 발자국으로 그린 보법이 남았다. 아이들이 그 발자국을 하나도 틀리지 않고 따라 밟았다.']]),
        watch: (s) => say(addHealth(s, 3), [['나레이션', '눈싸움이 수련보다 격렬했다.']]),
      },
    },
    {
      k: 'brazier',
      title: '화롯가',
      text: '긴 겨울밤, 화로에 밤을 구우며 제자들이 원로 곁에 모였다.',
      options: [{ id: 'ghost', label: '무서운 이야기를 해 준다', hint: '아이들이 좋아한다' }, { id: 'sleep', label: '「자거라, 내일 새벽 수련이다」', hint: '숙련↑' }],
      out: {
        ghost: (s) => say(addHealth(s, 2), [['나레이션', '산속 도깨비 이야기에 제일 큰 녀석이 제일 크게 비명을 질렀다.']]),
        sleep: (s) => say(trainEquipped(s, 30), [['나레이션', '투덜대며 흩어진 아이들이 다음 날 새벽 하나도 빠지지 않고 마당에 섰다.']]),
      },
    },
  ],
};

const seasonScene: JourneyEventDef = {
  key: 'elder_season',
  kind: 'HOME',
  elder: true,
  cooldown: 5,
  trigger: { age: [58, 99] },
  cond: (s) => (SCENES[s.season] || []).some((x) => !usedList(s, 'scenes').includes(x.k)),
  build: (s) => {
    const sc = rand((SCENES[s.season] || []).filter((x) => !usedList(s, 'scenes').includes(x.k)));
    return {
      title: typeof sc.title === 'function' ? sc.title(s) : sc.title,
      category: 'LIFE',
      narration: typeof sc.text === 'function' ? sc.text(s) : sc.text,
      script: [N(typeof sc.text === 'function' ? sc.text(s) : sc.text)],
      options: sc.options,
      meta: { k: sc.k, season: s.season },
    };
  },
  resolve: (s, opt, c) => {
    const sc = (SCENES[String(c.data?.season)] || []).find((x) => x.k === c.data?.k);
    const n = pushUsed(s, 'scenes', String(c.data?.k));
    return sc?.out[opt] ? sc.out[opt](n) : n;
  },
};

// ═════════════════════════ 회고록 ═════════════════════════

const MEMOIR = [
  { ch: 1, title: '회고록 첫째 권 — 빚 스무 냥', about: (s: GameState) => `빚 스무 냥, 비 새는 연무장, 목검 두 자루. ${s.startAge || 20}세의 겨울부터 쓰기 시작했다.` },
  { ch: 2, title: '회고록 둘째 권 — 칼의 시절', about: (s: GameState) => `${s.flags.realDuelWins ? `진검으로 ${s.flags.realDuelWins}번 이겼고, ` : ''}비무로 ${s.flags.sparringWins}번 이겼다. 그 칼들을 한 판씩 적는다.` },
  { ch: 3, title: '회고록 셋째 권 — 사람들', about: (s: GameState) => `가르친 제자 ${s.disciples.length + (s.graduatedDisciples || []).length}명. 이름을 하나씩 적다 보니 한 권이 되었다.` },
];
const memoir: JourneyEventDef = {
  key: 'elder_memoir',
  kind: 'HOME',
  elder: true,
  cooldown: 10,
  trigger: { age: [64, 99] },
  cond: (s) => (Number(mem(s, 'memoir')) || 0) < MEMOIR.length,
  build: (s) => {
    const ch = MEMOIR[Number(mem(s, 'memoir')) || 0];
    return {
      title: ch.title,
      category: 'LIFE',
      narration: ch.about(s),
      script: [N(ch.about(s)), N(ch.ch === 1 ? '겨울밤마다 등잔 아래서 한 장씩 적는다.' : '붓이 자꾸 멈춘다. 적고 싶지 않은 일도 있다.')],
      options: [
        { id: 'honest', label: '부끄러운 일까지 빠짐없이 적는다', hint: '구도 +4 · 정신 +1' },
        { id: 'proud', label: '자랑할 만한 일만 골라 적는다', hint: '명성 +5' },
      ],
      meta: { ch: ch.ch },
    };
  },
  resolve: (s, opt, c) => {
    const ch = Number(c.data?.ch) || 1;
    let n = remember(s, 'memoir', String(ch));
    if (ch === MEMOIR.length) n = milestone(n, 'MEMOIR', `세 권의 회고록을 마쳤다 (${opt === 'honest' ? '부끄러운 일까지 모두 적었다' : '자랑스러운 일만 골라 적었다'})`);
    if (opt === 'honest') return say(addStats(addRep(n, { ascetic: 4 }), { wil: 1 }), [['나레이션', ch === MEMOIR.length ? '마지막 장에 「이 책을 읽는 이는 나처럼 살지 말고, 나보다 잘 살아라」라고 적었다.' : '부끄러운 일을 적는 데 붓이 더 오래 걸렸다.']]);
    return say(addFame(n, 5), [['나레이션', ch === MEMOIR.length ? '세 권이 다 찼다. 제자들이 베껴 쓰겠다며 줄을 섰다.' : '다 적고 보니 꽤 대단한 사람 같았다. 혼자 웃었다.']]);
  },
};

// ═════════════════════════ 옛 원수와의 화해 ═════════════════════════

const peaceElder: JourneyEventDef = {
  key: 'elder_old_enemy',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.5,
  trigger: { age: [62, 99] },
  cond: (s) => metSects(s).some((x) => x.relation <= -25 && x.kind !== 'OUTLAW'),
  build: (s) => {
    const sect = [...metSects(s).filter((x) => x.relation <= -25 && x.kind !== 'OUTLAW')].sort((a, b) => a.relation - b.relation)[0];
    return {
      title: `${sect.name}의 늙은 ${sect.leaderTitle}`,
      category: 'LIFE',
      sceneActor: 'RIVAL',
      narration: `원수처럼 지내 온 ${sect.name}의 ${sect.leaderTitle} ${josa(sect.leader, '이가')} 홀로 지팡이를 짚고 찾아왔다.`,
      script: [
        N(`원수처럼 지내 온 ${sect.name}. 그 ${sect.leaderTitle} ${josa(sect.leader, '이가')} 수행원도 없이 지팡이를 짚고 대문 앞에 섰다.`),
        P(sect.leader, '우리 둘 다 이제 얼마 안 남았소. 우리 대에서 시작한 일, 우리 대에서 끝냅시다. 아이들한테까지 물려주지 말고.', '지팡이에 두 손을 얹으며'),
      ],
      options: [
        { id: 'accept', label: '마주 앉아 술잔을 나눈다', hint: '관계 크게 개선 · 인덕 +8' },
        { id: 'refuse', label: '「피는 피로만 씻긴다」', hint: '관계 악화 · 살기 +5' },
      ],
      meta: { sectId: sect.id, leader: sect.leader },
    };
  },
  resolve: (s, opt, c) => {
    const sid = String(c.data?.sectId || '');
    if (opt === 'refuse') return say(addRep(adjustRelation(s, sid, -10, '늙은 장문인의 화해 청을 물리쳤다'), { ruthless: 5 }), [['나레이션', '노인은 아무 말 없이 돌아섰다. 지팡이 소리가 오래 들렸다.']]);
    let n = adjustRelation(s, sid, 45, '두 원로가 마주 앉아 묵은 원한을 풀었다');
    n = milestone(addRep(n, { virtue: 8 }), 'ENEMY_RECONCILED', `원수로 지내던 문파의 원로 ${josa(String(c.data?.leader), '과와')} 화해했다`);
    return say(n, [['나레이션', '술이 몇 순배 돌자 노인이 먼저 웃었다. 「그때 그 비무, 사실 내가 졌던 거요.」 「알고 있었소.」']]);
  },
};

// ═════════════════════════ 담 너머의 아이, 어른이 되어 ═════════════════════════

const kidGrown: JourneyEventDef = {
  key: 'elder_kid_grown',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 2,
  cond: (s) => !!mem(s, 'taught_kids') && s.year - Number(mem(s, 'taught_kids')) >= 15,
  build: (s) => {
    const yrs = s.year - Number(mem(s, 'taught_kids'));
    const who = rand(byCountry(s, ['읍내 포교', '서당 훈장', '장터 객주'], ['현청 포두', '사숙 선생', '표국 국주'], ['마치부교쇼 도신', '데라코야 선생', '도매상 주인']));
    return {
      title: '담장 위의 그 아이',
      category: 'LIFE',
      narration: `${who} 차림의 어른이 찾아와 큰절을 한다. ${yrs}년 전, 보름날마다 마당에서 목검을 휘두르던 동네 아이였다.`,
      script: [
        N(`${who} 차림의 어른이 대문 앞에서 큰절을 한다.`),
        P(who, `기억하실는지요. ${yrs}년 전, 담장 위로 머리만 내밀던 꼬마들 중 하나입니다. 보름날마다 공짜로 가르쳐 주셨지요. 그때 배운 걸로 평생 버텼습니다.`, '눈시울이 붉어져'),
      ],
      options: [
        { id: 'remember', label: '「코 흘리던 그 녀석이구나」', hint: '건강 +4 · 인덕 +4' },
        { id: 'ask', label: '「요즘 고을 아이들은 어떠냐」 묻는다', hint: `그가 도장을 돕는다 · 재화 +40` },
      ],
      meta: { who },
    };
  },
  resolve: (s, opt, c) => {
    const who = String(c.data?.who);
    const n = milestone(s, 'KID_GROWN', `담 너머에서 보던 동네 아이가 ${josa(who, '이가')} 되어 찾아왔다`);
    if (opt === 'remember') return say(addRep(addHealth(n, 4), { virtue: 4 }), [['나레이션', '사실 누군지 하나도 기억나지 않았다. 그래도 코 흘리던 녀석은 늘 있었으니 틀린 말은 아니었다.']]);
    return say(addMoney(n, 40), [['나레이션', `${josa(who, '은는')} 그 뒤로 해마다 쌀 몇 가마를 보내왔다. 「보름날 수업료」라고 적혀 있었다.`]]);
  },
};

// ═════════════════════════ 중풍의 전조 ═════════════════════════

const stroke: JourneyEventDef = {
  key: 'elder_stroke',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.6,
  trigger: { age: [70, 99] },
  cond: (s) => s.health < 55,
  build: (s) => ({
    title: '말이 꼬인다',
    category: 'LIFE',
    narration: '아침에 제자 이름을 부르는데 혀가 꼬였다. 왼손에 힘이 들어가지 않는다.',
    script: [N('아침에 제자를 부르는데 말이 꼬였다. 숟가락이 왼손에서 미끄러졌다.'), P(heirOf(s)?.name || '고참 제자', '스, 스승님?', '숟가락을 주우며 얼굴이 하얘져')],
    options: [
      { id: 'rest', label: '모든 것을 내려놓고 한 철 눕는다', hint: '중상 2계절 · 건강 회복에 집중' },
      { id: 'acu', label: `이름난 침술사를 부른다 (100${cur(s)})`, hint: '건강 +10', disabled: s.money < 100, disabledReason: '돈이 부족하다' },
      { id: 'deny', label: '「괜찮다. 잠을 잘못 잤을 뿐이다」', hint: '⚠ 건강 -12' },
    ],
  }),
  resolve: (s, opt) => {
    let n = remember(s, 'stroke', opt.toUpperCase());
    n = milestone(n, 'STROKE_SIGN', '중풍의 전조를 겪었다');
    if (opt === 'rest') return say(addStatus(addHealth(n, 6), 'HEAVY_INJURY', '중풍 요양', 2), [['나레이션', '한 철을 누워 지냈다. 제자들이 번갈아 팔다리를 주물렀다. 봄이 오자 왼손에 다시 힘이 들어갔다.']]);
    if (opt === 'acu') return say(addHealth(addMoney(n, -100), 10), [['나레이션', '침이 서른 대 꽂혔다. 사흘 뒤 숟가락을 다시 쥐었다.']]);
    return say(addHealth(n, -12), [['나레이션', '그날도 마당에 나갔다. 목검이 손에서 두 번 떨어졌다. 아무도 아무 말 하지 않았다.']]);
  },
};

// ═════════════════════════ 제자가 나를 넘어선 날 ═════════════════════════
const power3 = (st: { str: number; agi: number; ins: number }) => st.str + st.agi + st.ins;
const surpassed: JourneyEventDef = {
  key: 'elder_surpassed',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.8,
  trigger: { age: [60, 99] },
  cond: (s) => aliveDisc(s).some((d) => power3(d.stats) >= power3(s.stats) * 0.92),
  build: (s) => {
    const d = [...aliveDisc(s)].sort((a, b) => power3(b.stats) - power3(a.stats))[0];
    return {
      title: '제자가 스승을 넘어선 날',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `아침 대련, ${d.name}의 목검이 스승의 목검을 처음으로 쳐 냈다.`,
      script: [
        N(`아침 대련이었다. 늘 하던 대로 받아 주려던 칼이 받아지지 않았다. ${d.name}의 목검이 스승의 목검을 쳐 냈다. 처음이다.`),
        P(d.name, '……스, 스승님. 죄송합니다. 힘 조절을——', '목검을 떨어뜨리며'),
        N('마당의 제자들이 모두 움직임을 멈췄다.'),
      ],
      options: [
        { id: 'proud', label: '크게 웃으며 그 제자의 어깨를 두드린다', hint: `${d.name} 충성·정신↑ · 구도 +5` },
        { id: 'again', label: '「한 판 더」 — 다시 목검을 주워 든다', hint: '정신 시험 · 건강 -4' },
        { id: 'quiet', label: '아무 말 없이 목검을 내려놓고 마루로 올라간다', hint: '정신 +2 · 그날부터 대련은 제자들끼리' },
      ],
      meta: { discId: d.id },
    };
  },
  resolve: (s, opt, c) => {
    const id = String(c.data?.discId || '');
    const d = s.disciples.find((x) => x.id === id);
    if (!d) return s;
    let n = milestone(s, 'SURPASSED', `제자 ${josa(d.name, '이가')} 대련에서 처음으로 스승을 넘어섰다`);
    if (opt === 'proud') {
      n = mapDisc(addRep(n, { ascetic: 5 }), id, (x) => ({ ...x, loyalty: x.loyalty + 12, stats: { ...x.stats, wil: x.stats.wil + 3 } }));
      return say(n, [[s.name, '사과할 일이 아니다. 오늘을 기다리느라 내가 이렇게 오래 살았다.'], ['나레이션', `${josa(d.name, '이가')} 그 자리에서 무릎을 꿇었다.`]]);
    }
    if (opt === 'again') {
      const won = chance(Math.min(0.6, 0.2 + s.stats.wil * 0.004));
      n = addHealth(n, -4);
      return say(won ? addStats(n, { wil: 2 }) : n, [['나레이션', won ? '두 번째 판은 스승이 이겼다. 둘 다 안다. 다음 판은 또 모른다는 것을.' : '두 번째 판도 마찬가지였다. 목검을 내려놓고 오래 웃었다. 이상하게 기분이 좋았다.']]);
    }
    return say(addStats(n, { wil: 2 }), [['나레이션', `그날부터 아침 대련은 ${josa(d.name, '이가')} 받았다. 스승은 마루에서 지켜보며 가끔 「발」 「어깨」 한마디씩만 했다.`]]);
  },
};

// ═════════════════════════ 귀가 어두워지다 ═════════════════════════
const hearing: JourneyEventDef = {
  key: 'elder_hearing',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [70, 99] },
  cond: (s) => aliveDisc(s).length > 0,
  build: (s) => {
    const d = rand(aliveDisc(s));
    return {
      title: '귀가 어두워지다',
      category: 'LIFE',
      narration: '제자들이 웃는데 왜 웃는지 들리지 않았다.',
      script: [
        P(d.name, '스승님, 오늘 저녁은 무엇으로 할까요?', '큰 소리로'),
        H(s, '응? 무슨 칼? 오늘은 칼 안 간다.', '고개를 갸웃하며'),
        N('제자들이 웃음을 참느라 어깨를 떨었다. 그제야 알았다. 요즘 자꾸 되묻게 되는 이유를.'),
      ],
      options: [
        { id: 'laugh', label: '같이 웃는다', hint: '건강 +3 · 문하생들과 가까워진다' },
        { id: 'eyes', label: '「귀가 어두우면 눈으로 듣는다」 — 입 모양과 몸짓을 읽기 시작한다', hint: '통찰 +3' },
      ],
    };
  },
  resolve: (s, opt) => {
    if (opt === 'eyes') return say(addStats(s, { ins: 3 }), [['나레이션', '그 뒤로 상대의 어깨가 움직이기 전에 무엇을 할지 먼저 보였다. 귀를 잃고 눈을 얻었다.']]);
    return say({ ...addHealth(s, 3), disciples: s.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 2) })) }, [['나레이션', '그 뒤로 제자들은 스승에게 말할 때 손짓을 섞었다. 마당이 조금 더 시끌벅적해졌다.']]);
  },
};

// ═════════════════════════ 천하대회 심판으로 초빙되다 ═════════════════════════
const judge: JourneyEventDef = {
  key: 'elder_judge',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 3,
  trigger: { age: [64, 99], seasons: ['SUMMER'] },
  cond: (s) => s.year >= 1754 && (s.year - 1750) % 4 === 0 && (s.fame >= 400 || (s.flags.tournamentWins || 0) > 0),
  build: (s) => ({
    title: '천하대회의 심판석',
    category: 'HISTORICAL',
    narration: '올가을 천하대회의 심판을 맡아 달라는 초청장이 왔다.',
    script: [N(`올가을 천하제일 대회의 심판을 맡아 달라는 초청장이 왔다.${(s.flags.tournamentWins || 0) > 0 ? ` 우승자 출신 원로는 심판석에 앉는 것이 관례란다.` : ''}`), N('비무대 아래가 아니라 위, 그것도 가장 높은 자리다.')],
    options: [
      { id: 'accept', label: '수락한다', hint: '명성 +20 · 통찰 +3 · 올해는 출전하지 않는다' },
      { id: 'compete', label: '「아직 심판석에 앉을 나이가 아니다」 — 출전하겠다고 답한다', hint: '정신 +2' },
    ],
  }),
  resolve: (s, opt) => {
    if (opt === 'compete') return say(addStats(remember(s, 'judge', 'DECLINED'), { wil: 2 }), [['나레이션', '초청장을 돌려보냈다. 대회 집행관이 혀를 내둘렀다고 한다.']]);
    const n = milestone(addStats(addFame(remember(s, 'judge', String(s.year)), 20), { ins: 3 }), 'TOURNEY_JUDGE', `${s.year}년 천하대회의 심판석에 앉았다`);
    return say(n, [['나레이션', '가을, 심판석에서 내려다본 비무대는 생각보다 작았다. 젊은 칼들이 그 위에서 평생을 걸었다. 한 사람 한 사람의 칼이 다 보였다.']]);
  },
};

// ═════════════════════════ 젊은 날의 꿈 ═════════════════════════
const dreamYouth: JourneyEventDef = {
  key: 'elder_dream_youth',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [68, 99] },
  build: (s) => {
    const parent = s.country === 'CHINA' ? '어머니' : '아버지';
    return {
      title: '스무 살의 꿈',
      category: 'LIFE',
      narration: '꿈속에서 스무 살이었다. 비 새는 연무장, 목검 두 자루.',
      script: [
        N('꿈속에서 스무 살이었다. 비가 새는 연무장에 목검 두 자루가 기대어 있었다.'),
        P(parent, '……도장을 부탁한다.', '병상에서 손을 뻗으며'),
        N(`깨어 보니 새벽이었다. 그 뒤로 ${s.age - (s.startAge || 20)}년. 마당에서 제자들 기합 소리가 들려온다.`),
      ],
      options: [
        { id: 'answer', label: `「${parent}, 지켰습니다」 — 허공에 대고 답한다`, hint: '정신 +3 · 건강 +3' },
        { id: 'yard', label: '자리에서 일어나 그 목검을 찾아 마당에 나간다', hint: '숙련↑ · 제자들이 본다' },
      ],
    };
  },
  resolve: (s, opt) => {
    if (opt === 'answer') return say(addHealth(addStats(s, { wil: 3 }), 3), [['나레이션', '누가 들었을 리 없다. 그래도 대답을 하고 나니 가슴이 가벼웠다.']]);
    return say(trainEquipped(s, 40), [['나레이션', '사당 구석에서 낡은 목검 하나를 찾아냈다. 손잡이가 닳아 반들거렸다. 그걸로 기본 베기를 백 번 했다. 제자들이 하나둘 옆에 와서 같이 휘둘렀다.']]);
  },
};

// 공용 도구가 쓰이지 않을 때 경고 방지
void H;
void callName;

export const ELDER_MORE_EVENTS: JourneyEventDef[] = [letter, discWedding, discBaby, question, seasonScene, memoir, peaceElder, kidGrown, stroke, surpassed, hearing, judge, dreamYouth];
