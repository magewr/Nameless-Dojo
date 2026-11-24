import { Disciple, GameState } from '../../types/game';
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
  isDone,
  JourneyEventDef,
  markDone,
  N,
  P,
  rand,
  remember,
  say,
  trainEquipped,
} from '../../engine/journeyCore';
import { josa } from '../../utils/korean';

// 노년(55세 이후)의 사건 ① 몸 · 가족 · 지나온 날.
// 노년의 사건은 "지금 이 사람의 삶"에서만 나온다 — 실제 배우자, 실제 제자, 실제로 베었던 사람, 실제 숙적.
// 같은 틀이 되풀이되지 않도록 대부분 일생에 한 번이고, 되풀이되는 것은 매번 다른 사람·다른 장면을 고른다.

// ───────── 공용 도구 ─────────
export const aliveDisc = (s: GameState) => s.disciples.filter((d) => !d.dead && !d.isChild);
export const heirOf = (s: GameState): Disciple | undefined => s.disciples.find((d) => !d.dead && d.role === 'HEIR');
export const kinOf = (s: GameState) => s.disciples.filter((d) => !d.dead && d.isChild);
export const mem = (s: GameState, key: string): string | undefined => s.flags.storyMemory?.[key];
export const memTurn = (s: GameState, key: string): number => {
  const v = Number(mem(s, key));
  return Number.isFinite(v) ? v : -999;
};
export const spouseWord = (s: GameState) => (s.gender === 'FEMALE' ? '남편' : '아내');
export const parentWord = (s: GameState) => (s.country === 'CHINA' ? '어머니' : '아버지');
export const mapDisc = (s: GameState, id: string, f: (d: Disciple) => Disciple): GameState => ({
  ...s,
  disciples: s.disciples.map((d) => {
    if (d.id !== id) return d;
    const n = f(d);
    return { ...n, loyalty: Math.max(0, Math.min(100, n.loyalty)) };
  }),
});
export function milestone(s: GameState, key: string, text: string): GameState {
  const m = { key, year: s.year, season: s.season, age: s.age, text };
  return { ...s, milestones: [...(s.milestones || []), m].slice(-120) };
}
export function addStatus(s: GameState, id: 'LIGHT_INJURY' | 'HEAVY_INJURY', label: string, turns: number): GameState {
  const prev = s.statuses.find((x) => x.id === id);
  return { ...s, statuses: [...s.statuses.filter((x) => x.id !== id), { id, label, turnsRemaining: Math.max(turns, prev?.turnsRemaining || 0) }] };
}
// 사람 이름 목록을 「가, 나, 다」로
export const nameList = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')}, ${names[names.length - 1]}`);
// 이름을 부를 때 (일본 이름에는 「아/야」를 붙이지 않는다)
export const callName = (s: GameState, name: string) => (s.country === 'JAPAN' ? name : josa(name, '아야'));
export const magistrate = (s: GameState) => byCountry(s, '사또', '지현(知縣)', '다이칸(代官)');
const oldest = (list: Disciple[]) => [...list].sort((a, b) => a.joinedYear - b.joinedYear)[0];
const bestOf = (list: Disciple[]) => [...list].sort((a, b) => b.stats.str + b.stats.agi + b.stats.ins - (a.stats.str + a.stats.agi + a.stats.ins))[0];

// ═════════════════════════ 1. 몸 ═════════════════════════

// 손 떨림 — 숨길 것인가. 숨기면 몇 해 뒤 제자들 앞에서 드러난다.
const tremor: JourneyEventDef = {
  key: 'elder_tremor',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.4,
  trigger: { age: [58, 90] },
  build: (s) => ({
    title: '찻잔이 떨린다',
    category: 'LIFE',
    narration: '새벽 찻잔 위로 잔물결이 인다. 바람은 없다. 손이 떨리고 있었다.',
    script: [
      N('새벽, 찻잔을 들던 손끝에서 차가 찰랑 넘쳤다. 다시 들어 본다. 찻물 위로 잔물결이 인다.'),
      H(s, '……칼자루를 쥔 손이다. 이 손이.', '오른손을 오래 내려다보며'),
      N('마당 쪽에서 제자들이 목검을 맞부딪치는 소리가 들린다.'),
    ],
    options: [
      { id: 'hide', label: '아무에게도 말하지 않고 수련량을 늘린다', hint: '근력 유지 · 건강 -4 · 비밀은 언젠가 드러난다' },
      { id: 'doctor', label: `의원에게 보인다 (30${cur(s)})`, hint: '건강 +6 · 정신 +1', disabled: s.money < 30, disabledReason: '돈이 부족하다' },
      { id: 'tell', label: `${heirOf(s) ? '후계자' : '가장 오래된 제자'}에게 털어놓는다`, hint: '제자의 충성↑ · 시범은 제자에게' },
    ],
  }),
  resolve: (s, opt) => {
    let n = remember(s, 'tremor', opt === 'hide' ? 'HIDDEN' : opt === 'doctor' ? 'TREATED' : 'SHARED');
    n = remember(n, 'tremor_turn', String(s.turn));
    if (opt === 'hide') {
      n = addHealth(addStats(n, { wil: 1 }), -4);
      return say(n, [['나레이션', '그날부터 남들보다 한 시진 먼저 일어나 홀로 칼을 쥐었다. 떨림은 칼을 쥐고 있을 때만 멎었다.']]);
    }
    if (opt === 'doctor') {
      n = addStats(addHealth(addMoney(n, -30), 6), { wil: 1 });
      return say(n, [
        [byCountry(s, '읍내 의원', '약방 의원', '마을 의원'), '나이가 드시면 다 오는 겁니다. 술을 줄이시고, 아침마다 손을 더운물에 담그십시오. 칼은…… 무리하지 마시고요.'],
        ['나레이션', '약첩을 받아 들고 돌아오는 길, 무리하지 말라는 말이 오래 귀에 남았다. (건강 +6)'],
      ]);
    }
    const d = heirOf(s) || oldest(aliveDisc(s));
    if (!d) return say(n, [['나레이션', '털어놓을 제자가 없었다. 빈 마당에 대고 혼잣말을 했다.']]);
    n = mapDisc(n, d.id, (x) => ({ ...x, loyalty: x.loyalty + 10, stats: { ...x.stats, wil: x.stats.wil + 2 } }));
    return say(n, [
      [d.name, '……알고 있었습니다. 지난달부터 시범을 짧게 끊으셨지요. 앞으로 시범은 제가 하겠습니다. 스승님은 옆에서 고쳐만 주십시오.'],
      ['나레이션', `${josa(d.name, '이가')} 아무렇지 않은 얼굴로 목검을 들고 마당으로 나갔다. (${d.name} 충성 +10)`],
    ]);
  },
};

// 숨겼던 떨림이 제자들 앞에서 드러난다 (2~5년 뒤)
const tremorRevealed: JourneyEventDef = {
  key: 'elder_tremor_revealed',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 3,
  cond: (s) => mem(s, 'tremor') === 'HIDDEN' && s.turn - memTurn(s, 'tremor_turn') >= 8 && aliveDisc(s).length >= 2,
  build: (s) => {
    const d = bestOf(aliveDisc(s));
    return {
      title: '시범 도중 떨어진 칼',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: '신입 제자들 앞에서 시범을 보이던 중, 손에서 칼이 미끄러졌다.',
      script: [
        N('새로 들어온 제자들 앞에서 「' + (s.skills[0]?.customName || s.skills[0]?.name || '기본 횡베기') + '」를 보이던 참이었다.'),
        N('칼끝이 정점에 닿는 순간 손가락이 제멋대로 풀렸다. 칼이 마당 흙바닥에 꽂혔다. 아무도 숨을 쉬지 않았다.'),
        P(d.name, '……', '굳은 얼굴로 스승을 본다'),
      ],
      options: [
        { id: 'laugh', label: '칼을 주워 들고 「이것이 늙는다는 것이다」 하고 웃는다', hint: '구도·인덕 · 제자들이 오히려 다가선다' },
        { id: 'again', label: '말없이 칼을 주워 다시 처음부터 보인다', hint: '정신 시험 · 성공하면 위엄, 실패하면 체면이 깎인다' },
        { id: 'leave', label: '시범을 멈추고 방으로 들어간다', hint: '명성 -10 · 그날 밤 제자가 찾아온다' },
      ],
      meta: { discId: d.id },
    };
  },
  resolve: (s, opt, c) => {
    const d = s.disciples.find((x) => x.id === c.data?.discId);
    let n = remember(s, 'tremor', 'REVEALED');
    if (opt === 'laugh') {
      n = addRep(n, { ascetic: 8, virtue: 6 });
      n = { ...n, disciples: n.disciples.map((x) => (x.dead ? x : { ...x, loyalty: Math.min(100, x.loyalty + 4) })) };
      return say(n, [
        [s.name, '잘 보아 두어라. 칼은 언젠가 손을 떠난다. 그 전에 너희 손에 옮겨 놓아야 한다.'],
        ['나레이션', '그날 밤, 제자들이 번갈아 와서 스승의 손을 더운물에 담가 주었다. (문하생 전원 충성 +4)'],
      ]);
    }
    if (opt === 'again') {
      const ok = chance(Math.min(0.85, 0.35 + s.stats.wil * 0.006));
      if (ok) return say(addFame(addStats(n, { wil: 2 }), 12), [['나레이션', '두 번째 칼은 처음보다 느렸고, 처음보다 무거웠다. 끝까지 본 신입 하나가 울먹였다. (정신 +2, 명성 +12)']]);
      return say(addFame(addHealth(n, -5), -12), [['나레이션', '두 번째도 칼끝이 흔들렸다. 제자들이 눈을 피했다. 그 침묵이 칼에 베인 것보다 아팠다. (명성 -12)']]);
    }
    n = addFame(n, -10);
    if (!d) return say(n, [['나레이션', '방문을 닫았다. 마당이 오래도록 조용했다.']]);
    n = mapDisc(n, d.id, (x) => ({ ...x, loyalty: x.loyalty + 8 }));
    return say(n, [
      ['나레이션', `그날 밤 ${josa(d.name, '이가')} 문밖에 무릎을 꿇고 앉아 있었다.`],
      [d.name, '스승님의 칼이 떨어진 것이 아니라, 저희가 받으라고 내려놓으신 것으로 알겠습니다.'],
    ]);
  },
};

// 흐려지는 눈 — 비급 글씨가 번진다
const eyes: JourneyEventDef = {
  key: 'elder_eyes',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [62, 90] },
  build: (s) => {
    const glasses = byCountry(s, '애체(靉靆)', '안경(眼鏡)', '안경(眼鏡)');
    const book = s.books.find((b) => b.decoded) || s.books[0];
    return {
      title: '번지는 글씨',
      category: 'LIFE',
      narration: `${book ? `『${book.title}』의` : '비급의'} 작은 글씨가 등잔불 아래서 번져 보인다.`,
      script: [
        N(`등잔을 끌어당겨도 ${book ? `『${book.title}』` : '비급'}의 글씨가 물에 젖은 듯 번진다. 팔을 쭉 뻗어 멀리 두니 그제야 겨우 읽힌다.`),
        H(s, '젊을 때는 상대 칼끝의 흠집까지 보였는데.', '눈을 비비며'),
      ],
      options: [
        { id: 'glasses', label: `장에서 ${glasses}을 맞춘다 (60${cur(s)})`, hint: '통찰 +2 · 책을 계속 읽을 수 있다', disabled: s.money < 60, disabledReason: '돈이 부족하다' },
        { id: 'reader', label: '제자에게 소리 내어 읽게 한다', hint: '그 제자의 통찰↑ · 사제 사이가 깊어진다' },
        { id: 'inner', label: '「눈이 아니라 마음으로 본다」 — 눈을 감고 수련한다', hint: '정신 +2 · 영력 +2 · 구도' },
      ],
    };
  },
  resolve: (s, opt) => {
    if (opt === 'glasses') {
      const g = byCountry(s, '애체', '안경', '안경');
      return say(remember(addStats(addMoney(s, -60), { ins: 2 }), 'glasses', 'YES'), [
        ['나레이션', `동그란 ${josa(g, '을를')} 코에 걸자 글씨가 다시 또렷해졌다. 제자들이 키득거렸다. 한동안 「${g} 사부」로 불렸다. (통찰 +2)`],
      ]);
    }
    if (opt === 'reader') {
      const d = bestOf(aliveDisc(s).filter((x) => x.stats.ins >= 15)) || bestOf(aliveDisc(s));
      if (!d) return say(s, [['나레이션', '읽어 줄 사람이 없었다. 책을 덮고 기억에 기대어 초식을 되새겼다.']]);
      const n = mapDisc(s, d.id, (x) => ({ ...x, loyalty: x.loyalty + 6, stats: { ...x.stats, ins: x.stats.ins + 4 } }));
      return say(remember(n, 'reader', d.name), [
        ['나레이션', `밤마다 ${josa(d.name, '이가')} 등잔 아래서 비급을 소리 내어 읽었다. 스승은 눈을 감고 듣다가, 가끔 「거기, 다시」 하고 말했다.`],
        ['나레이션', `${josa(d.name, '은는')} 읽으면서 스승보다 먼저 그 뜻을 깨치는 때가 늘었다. (${d.name} 통찰 +4)`],
      ]);
    }
    return say(addRep(addStats(s, { wil: 2, qi: 2 }), { ascetic: 6 }), [['나레이션', '눈을 감고 목검을 들었다. 바람 소리, 발소리, 마루의 삐걱임이 하나씩 자리를 잡았다. (정신 +2, 영력 +2)']]);
  },
};

// 무릎과 지팡이 — 제자가 목인장으로 지팡이를 깎아 왔다
const cane: JourneyEventDef = {
  key: 'elder_cane',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [64, 90] },
  cond: (s) => aliveDisc(s).length > 0,
  build: (s) => {
    const d = oldest(aliveDisc(s));
    return {
      title: '목인장으로 깎은 지팡이',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `${josa(d.name, '이가')} 뒷짐을 지고 와서 매끈한 지팡이 하나를 내민다.`,
      script: [
        N('계단을 내려설 때마다 무릎이 먼저 소리를 낸 지 몇 달째다.'),
        P(d.name, '연무장 구석에 쓰러져 있던 낡은 목인장 말입니다. 스승님이 젊을 때 수천 번 치셨다던. 버리기 아까워서…… 깎아 봤습니다.', '쑥스럽게 지팡이를 내밀며'),
        N('손잡이 자리에 칼자국이 고스란히 남아 있다.'),
      ],
      options: [
        { id: 'take', label: '받아서 짚는다', hint: '건강 +6 · 제자의 충성↑' },
        { id: 'refuse', label: '「아직은 두 다리로 걷는다」 하고 벽에 세워 둔다', hint: '정신 +2 · 무릎이 버틸지는 모른다' },
      ],
      meta: { discId: d.id },
    };
  },
  resolve: (s, opt, c) => {
    const id = String(c.data?.discId || '');
    if (opt === 'take') {
      const n = mapDisc(addHealth(remember(s, 'cane', 'YES'), 6), id, (x) => ({ ...x, loyalty: x.loyalty + 8 }));
      return say(n, [['나레이션', '지팡이 끝이 마당 돌에 닿을 때마다 탁, 탁 소리가 났다. 제자들은 그 소리로 스승이 오는 줄 알았다. (건강 +6)']]);
    }
    return say(addStats(remember(s, 'cane', 'NO'), { wil: 2 }), [['나레이션', '지팡이는 벽에 기대 선 채로 겨울을 났다. 제자는 서운한 기색을 감추었다. (정신 +2)']]);
  },
};

// 빙판에 넘어지다 — 지팡이를 마다했거나 몸이 약해졌을 때
const fall: JourneyEventDef = {
  key: 'elder_fall',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.6,
  trigger: { age: [66, 95], seasons: ['WINTER'] },
  cond: (s) => mem(s, 'cane') === 'NO' || s.health < 55,
  build: (s) => ({
    title: '얼어붙은 섬돌',
    category: 'LIFE',
    narration: '새벽, 얼어붙은 섬돌에서 발이 미끄러졌다.',
    script: [
      N('새벽에 마당으로 내려서던 발이 얼음 낀 섬돌 위에서 허공을 밟았다.'),
      N('몸이 먼저 기억했다. 젊을 때라면 반 바퀴 굴러 일어섰을 것이다. 지금은 엉덩이부터 돌바닥에 떨어졌다.'),
      H(s, '……허, 허허.', '바닥에 누운 채 하늘을 보며'),
    ],
    options: [
      { id: 'call', label: '제자들을 부른다', hint: '중상 1계절 · 건강 -8' },
      { id: 'self', label: '혼자 일어나려 애쓴다', hint: '정신 시험 · 실패하면 더 크게 다친다' },
    ],
  }),
  resolve: (s, opt) => {
    if (opt === 'call') {
      let n = addStatus(addHealth(s, -8), 'HEAVY_INJURY', '빙판 낙상', 1);
      if (mem(s, 'cane') === 'NO') n = remember(n, 'cane', 'YES');
      return say(n, [
        ['나레이션', '제자 셋이 맨발로 뛰어나와 스승을 들어 옮겼다. 한 철을 꼬박 누워 지냈다.'],
        ...(mem(s, 'cane') === 'NO' ? ([['나레이션', '자리를 털고 일어나던 날, 벽에 세워 두었던 그 지팡이를 말없이 집어 들었다.']] as Array<[string, string]>) : []),
      ]);
    }
    const ok = chance(Math.min(0.7, 0.2 + s.stats.wil * 0.005));
    if (ok) return say(addStats(addHealth(s, -4), { wil: 2 }), [['나레이션', '한참을 누워 숨을 고르다 기둥을 붙잡고 일어났다. 아무도 모르게 방으로 돌아갔다. (정신 +2)']]);
    return say(addStatus(addHealth(s, -16), 'HEAVY_INJURY', '빙판 낙상', 2), [['나레이션', '일어나려다 다시 미끄러졌다. 아침에 물 길러 나온 제자가 발견했을 때 입술이 파랬다. (건강 -16, 중상 2계절)']]);
  },
};

// 의원의 권고 — 진검을 놓으시라
const physician: JourneyEventDef = {
  key: 'elder_physician',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.5,
  trigger: { age: [60, 95] },
  cond: (s) => s.health < 62,
  build: (s) => ({
    title: '의원의 권고',
    category: 'LIFE',
    narration: '맥을 짚던 의원이 한참 말이 없다.',
    script: [
      N('맥을 짚던 의원이 손을 거두고 한참 말이 없다.'),
      P(byCountry(s, '읍내 의원', '약방 의원', '마을 의원'), '심장이 예전 같지 않습니다. 비무는 몰라도…… 진검은 이제 놓으셔야 합니다. 한 번 크게 피를 쏟으면 다시 못 일어나십니다.', '조심스럽게'),
    ],
    options: [
      { id: 'vow', label: '「이제 진검은 뽑지 않겠다」 제자들 앞에서 맹세한다', hint: '진검 결투를 청해 오면 정중히 사양할 명분 · 인덕·구도' },
      { id: 'ignore', label: '「칼잡이가 칼을 놓으면 무엇이 남는가」', hint: '살기 +5 · 정신 +2' },
    ],
  }),
  resolve: (s, opt) => {
    if (opt === 'vow') {
      let n = remember(addRep(s, { virtue: 6, ascetic: 8 }), 'swordVow', 'YES');
      n = milestone(n, 'ELDER_SWORD_VOW', '의원의 권고를 받아들여 「다시는 진검을 뽑지 않겠다」고 맹세했다');
      return say(n, [['나레이션', '진검을 칼집째 사당에 올려 두었다. 그 앞을 지날 때마다 손이 한 번씩 멈칫했다.']]);
    }
    return say(addStats(addRep(s, { ruthless: 5 }), { wil: 2 }), [['나레이션', '의원이 혀를 차며 약첩만 두고 갔다.']]);
  },
};

// 잠 없는 새벽 — 홀로 연습하는 제자를 본다 (되풀이: 매번 다른 제자, 다른 계절)
const dawn: JourneyEventDef = {
  key: 'elder_dawn',
  kind: 'HOME',
  elder: true,
  cooldown: 14,
  trigger: { age: [57, 95] },
  cond: (s) => aliveDisc(s).length > 0,
  build: (s) => {
    const seen = (mem(s, 'dawn_seen') || '').split(',');
    const pool = aliveDisc(s).filter((d) => !seen.includes(d.id));
    const d = rand(pool.length ? pool : aliveDisc(s));
    const scene =
      s.season === 'WINTER'
        ? '눈 쌓인 마당에 발자국이 하나 나 있다. 끝에 누군가 서서 입김을 뿜으며 칼을 내리치고 있다.'
        : s.season === 'SUMMER'
        ? '해 뜨기 전 서늘한 마당, 우물가에서 누군가 웃통을 벗고 칼을 휘두르고 있다.'
        : s.season === 'AUTUMN'
        ? '낙엽 쌓인 마당 한쪽에서 누군가 떨어지는 잎을 칼끝으로 쫓고 있다.'
        : '안개 낀 마당 구석, 누군가 같은 초식을 백 번째 되풀이하고 있다.';
    return {
      title: `새벽 마당의 ${d.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: '늙으면 잠이 준다더니, 첫닭이 울기도 전에 눈이 떠졌다.',
      script: [N('늙으면 잠이 준다더니, 첫닭이 울기도 전에 눈이 떠졌다. 문을 여니——'), N(scene), N(`${d.name}이다. 스승이 보고 있는 줄은 모른다.`)],
      options: [
        { id: 'tip', label: '다가가 한 가지만 고쳐 준다', hint: `${d.name}의 능력치↑` },
        { id: 'watch', label: '모른 척 끝까지 지켜보다 돌아간다', hint: '통찰 +1 · 그 제자를 더 잘 알게 된다' },
      ],
      meta: { discId: d.id },
    };
  },
  resolve: (s, opt, c) => {
    const id = String(c.data?.discId || '');
    const d = s.disciples.find((x) => x.id === id);
    let n = remember(s, 'dawn_seen', [...(mem(s, 'dawn_seen') || '').split(',').filter(Boolean), id].slice(-12).join(','));
    if (!d) return n;
    if (opt === 'tip') {
      n = mapDisc(n, id, (x) => ({ ...x, loyalty: x.loyalty + 5, stats: { ...x.stats, str: x.stats.str + 2, agi: x.stats.agi + 2, ins: x.stats.ins + 1 } }));
      return say(n, [
        [s.name, '어깨가 먼저 나간다. 칼이 먼저 가고, 몸은 따라가는 것이다.'],
        [d.name, '스, 스승님! 언제부터……'],
        ['나레이션', `그 한마디로 ${d.name}의 칼이 달라졌다. (${d.name} 근력·민첩 +2)`],
      ]);
    }
    n = mapDisc(addStats(n, { ins: 1 }), id, (x) => ({ ...x, temperamentKnown: true }));
    return say(n, [['나레이션', `해가 뜰 때까지 지켜보았다. ${josa(d.name, '이가')} 어떤 사람인지, 그 칼을 보고 조금 더 알게 되었다.`]]);
  },
};

// 제자 이름을 헷갈리다 — 먼저 떠난 제자의 이름으로 부른다
const nameSlip: JourneyEventDef = {
  key: 'elder_name_slip',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.3,
  trigger: { age: [70, 99] },
  cond: (s) => aliveDisc(s).length > 0 && (s.disciples.some((d) => d.dead) || (s.graduatedDisciples || []).length > 0),
  build: (s) => {
    const gone = s.disciples.filter((d) => d.dead && !d.isChild);
    const grads = s.graduatedDisciples || [];
    const pastName = gone.length ? rand(gone).name : rand(grads).name;
    const pastDead = gone.some((d) => d.name === pastName);
    const d = rand(aliveDisc(s));
    return {
      title: '다른 이름으로 부르다',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `${josa(d.name, '을를')} 부른다는 것이, 입에서 다른 이름이 나왔다.`,
      script: [
        H(s, `${callName(s, pastName)}, 물 한 사발 떠 오너라.`, '마루에 앉아 무심코'),
        N(`대답이 없다. 고개를 드니 ${josa(d.name, '이가')} 머뭇거리며 서 있다. ${josa(pastName, '은는')} ${pastDead ? '이미 세상을 떠난 제자' : '오래전에 하산한 제자'}다.`),
      ],
      options: [
        { id: 'story', label: `${pastName}의 이야기를 들려준다`, hint: '그 제자의 충성↑ · 유파의 기억이 이어진다' },
        { id: 'laugh', label: '「늙으면 다 이렇다」 웃어넘긴다', hint: '건강 +2' },
      ],
      meta: { discId: d.id, pastName, pastDead: pastDead ? 1 : 0 },
    };
  },
  resolve: (s, opt, c) => {
    const id = String(c.data?.discId || '');
    const pastName = String(c.data?.pastName || '');
    const d = s.disciples.find((x) => x.id === id);
    if (opt === 'laugh') return say(addHealth(s, 2), [['나레이션', `${d ? josa(d.name, '이가') : '제자가'} 따라 웃으며 물을 떠 왔다. 웃음 끝이 조금 쓸쓸했다.`]]);
    let n = d ? mapDisc(s, id, (x) => ({ ...x, loyalty: x.loyalty + 8 })) : s;
    n = remember(n, 'told_of', pastName);
    return say(n, [
      [s.name, Number(c.data?.pastDead) ? `${josa(pastName, '은는')} 너만 할 때 들어왔다. 칼은 너보다 서툴렀지. 그런데 겁이 없었다. ……너무 없었다.` : `${josa(pastName, '은는')} 지금쯤 어디서 제 살림을 꾸리고 있을 게다. 너처럼 물을 떠 오라 하면 꼭 두 사발씩 떠 왔지.`],
      ['나레이션', `해가 질 때까지 이야기가 이어졌다. ${d ? josa(d.name, '은는') : '제자는'} 처음 듣는 사형의 이야기를 하나도 흘리지 않았다.`],
    ]);
  },
};

// ═════════════════════════ 2. 배우자 · 자식 · 손주 ═════════════════════════

const SPOUSE_SCENES = [
  {
    k: 'garden',
    title: '텃밭의 오이',
    body: (s: GameState, sp: string) => [
      N(`${josa(sp, '이가')} 뒤뜰 텃밭에서 굽은 오이를 하나 따서 내민다.`),
      P(sp, '칼은 그렇게 곧게 휘두르면서, 오이 지지대 하나를 똑바로 못 세우시오?', '흙 묻은 손으로 웃으며'),
    ],
  },
  {
    k: 'wedding',
    title: '혼례 날의 이야기',
    body: (s: GameState, sp: string) => [
      N(`저녁상을 물리고 ${josa(sp, '이가')} 문득 혼례 날 이야기를 꺼낸다. ${s.spouse ? `${s.spouse.marriedYear}년, ` : ''}벌써 수십 해 전이다.`),
      P(sp, '그날 비무 약속이 있다고 혼례상 앞에서 칼을 차고 있었던 것, 기억하시오?', '눈을 흘기며'),
    ],
  },
  {
    k: 'market',
    title: '함께 간 장날',
    body: (s: GameState, sp: string) => [
      N(`모처럼 ${josa(sp, '과와')} 장에 나섰다. 아는 얼굴들이 꾸벅꾸벅 절을 한다.`),
      P(sp, '젊을 때는 장에 같이 가자 해도 칼 갈아야 한다더니.', '팔짱을 끼며'),
    ],
  },
  {
    k: 'quarrel',
    title: '부부 싸움',
    body: (s: GameState, sp: string) => [
      N(`${josa(sp, '이가')} 아침부터 말이 없다. 어제 제자들 앞에서 ${sp}의 말을 자른 것이 화근이었다.`),
      P(sp, '평생 도장 일이 먼저였지요. 이제 늙어서까지 그러실 거요?', '돌아앉으며'),
    ],
  },
  {
    k: 'moon',
    title: '마루의 달',
    body: (s: GameState, sp: string) => [N(`보름달이 마루까지 들어왔다. ${josa(sp, '이가')} 말없이 옆에 와서 앉는다.`), P(sp, '우리 둘 다 많이 늙었구려.', '달을 올려다보며')],
  },
  {
    k: 'remedy',
    title: '쓰디쓴 탕약',
    body: (s: GameState, sp: string) => [
      N(`${josa(sp, '이가')} 김이 나는 탕약 사발을 들고 버티고 서 있다.`),
      P(sp, '의원이 하루 세 번이랬소. 칼은 하루에 천 번씩 휘두르면서 약 세 번은 못 드시오?', '팔짱을 끼고'),
    ],
  },
];

const spouseDaily: JourneyEventDef = {
  key: 'elder_spouse_days',
  kind: 'HOME',
  elder: true,
  cooldown: 10,
  weight: 1.2,
  trigger: { age: [55, 99], spouse: true },
  cond: (s) => SPOUSE_SCENES.some((x) => !(mem(s, 'spouse_scenes') || '').includes(x.k)),
  build: (s) => {
    const sp = s.spouse!.name;
    const done = mem(s, 'spouse_scenes') || '';
    const sc = rand(SPOUSE_SCENES.filter((x) => !done.includes(x.k)));
    const isQuarrel = sc.k === 'quarrel';
    return {
      title: sc.title,
      category: 'FAMILY',
      sceneActor: 'SPOUSE',
      narration: `${spouseWord(s)} ${josa(sp, '과와')} 보낸 어느 하루.`,
      script: sc.body(s, sp),
      options: isQuarrel
        ? [
            { id: 'apologize', label: '먼저 사과한다', hint: '건강 +6 · 인덕 +4' },
            { id: 'stubborn', label: '「도장주가 제자 앞에서 물러설 수 없소」', hint: '정신 +1 · 한동안 집안이 냉랭하다' },
          ]
        : [
            { id: 'warm', label: '못 이기는 척 웃는다', hint: '건강 +6' },
            { id: 'tease', label: '맞받아 놀린다', hint: '건강 +4 · 정신 +1' },
          ],
      meta: { scene: sc.k },
    };
  },
  resolve: (s, opt, c) => {
    const sp = s.spouse?.name || spouseWord(s);
    let n = remember(s, 'spouse_scenes', `${mem(s, 'spouse_scenes') || ''},${c.data?.scene}`);
    if (opt === 'apologize') return say(addRep(addHealth(n, 6), { virtue: 4 }), [[s.name, '……내가 잘못했소.'], [sp, '진작 그러실 것이지.'], ['나레이션', `${josa(sp, '이가')} 돌아앉은 채로 웃음을 참았다.`]]);
    if (opt === 'stubborn') {
      n = remember(n, 'spouse_cold', String(s.turn));
      return say(addStats(n, { wil: 1 }), [['나레이션', `며칠 동안 밥상에 반찬이 한 가지씩 줄었다.`]]);
    }
    if (opt === 'tease') return say(addStats(addHealth(n, 4), { wil: 1 }), [['나레이션', `${josa(sp, '이가')} 등짝을 한 대 때렸다. 둘 다 한참 웃었다.`]]);
    return say(addHealth(n, 6), [['나레이션', `${sp} 옆에서는 도장주도, 고수도 아닌 그냥 늙은이였다. 그게 편했다. (건강 +6)`]]);
  },
};

// 배우자의 병 — 결과에 따라 회복하거나, 몇 해 뒤 이별로 이어진다
const spouseIll: JourneyEventDef = {
  key: 'elder_spouse_ill',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.4,
  trigger: { age: [58, 99], spouse: true },
  cond: (s) => !!s.spouse && s.spouse.age >= 60,
  build: (s) => {
    const sp = s.spouse!.name;
    return {
      title: `${spouseWord(s)}의 기침`,
      category: 'FAMILY',
      sceneActor: 'SPOUSE',
      narration: `${sp}의 기침이 한 달째 멎지 않는다. 밤에는 피가 섞여 나왔다.`,
      script: [
        N(`${sp}의 기침이 한 달째 멎지 않는다. 어젯밤에는 손수건에 붉은 것이 묻어 나왔다.`),
        P(sp, '괜찮소. 늙으면 다 이런 거요. 도장 일이나 보시오.', '손수건을 감추며'),
      ],
      options: [
        { id: 'famous', label: `이름난 의원을 모셔 온다 (150${cur(s)})`, hint: '회복 가능성이 높다', disabled: s.money < 150, disabledReason: '돈이 부족하다' },
        { id: 'herb', label: '직접 산에 올라 약초를 캔다', hint: '건강 -6 · 정성은 통할지도' },
        { id: 'stay', label: '도장 일을 줄이고 곁을 지킨다', hint: '이번 한 해 명성 -10 · 회복은 하늘에 맡긴다' },
      ],
    };
  },
  resolve: (s, opt) => {
    const sp = s.spouse?.name || spouseWord(s);
    let n = s;
    let p = 0.35;
    if (opt === 'famous') {
      n = addMoney(n, -150);
      p = 0.7;
    } else if (opt === 'herb') {
      n = addHealth(n, -6);
      p = 0.5;
    } else {
      n = addFame(n, -10);
      p = 0.4;
    }
    const recovered = chance(p);
    n = remember(n, 'spouse_ill', recovered ? 'RECOVERED' : 'FRAIL');
    n = remember(n, 'spouse_ill_turn', String(s.turn));
    if (opt === 'stay') n = remember(n, 'spouse_stayed', 'YES');
    if (recovered)
      return say(n, [
        ['나레이션', `봄이 오자 ${sp}의 기침이 잦아들었다. 어느 아침, 부엌에서 그릇 부딪는 소리가 다시 났다.`],
        [sp, '왜 그렇게 보시오. 귀신 본 사람처럼.'],
      ]);
    return say(n, [['나레이션', `기침은 잦아들었지만 ${josa(sp, '은는')} 예전처럼 일어나지 못했다. 마루에 앉아 마당을 내다보는 날이 늘었다.`]]);
  },
};

// 배우자와의 이별 — 병을 앓았거나 아주 나이가 들었을 때
const spouseFarewell: JourneyEventDef = {
  key: 'elder_spouse_farewell',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 2.5,
  trigger: { age: [60, 99], spouse: true },
  cond: (s) =>
    !!s.spouse &&
    ((mem(s, 'spouse_ill') === 'FRAIL' && s.turn - memTurn(s, 'spouse_ill_turn') >= 4) ||
      (s.spouse.age >= 76 && chance(0.25)) ||
      (mem(s, 'spouse_ill') === 'RECOVERED' && s.spouse.age >= 72 && s.turn - memTurn(s, 'spouse_ill_turn') >= 20 && chance(0.3))),
  build: (s) => {
    const sp = s.spouse!.name;
    const years = s.year - s.spouse!.marriedYear;
    return {
      title: `${sp}, 먼 길을 떠나다`,
      category: 'FAMILY',
      sceneActor: 'SPOUSE',
      narration: `${years}년을 함께한 ${spouseWord(s)} ${josa(sp, '이가')} 자리에서 일어나지 못한다.`,
      script: [
        N(`${years}년을 함께한 ${spouseWord(s)} ${josa(sp, '이가')} 사흘째 미음도 넘기지 못한다.`),
        P(sp, '……평생 칼 소리 들으며 살았소. 그 소리가 싫지 않았소.', '손을 더듬어 찾으며'),
        P(sp, '내가 먼저 가거든…… 밥은 거르지 마시오.'),
      ],
      options: [
        { id: 'hold', label: '손을 잡고 마지막 밤을 지킨다', hint: '건강 -10 · 정신 +3' },
        { id: 'promise', label: '「도장은 걱정 마시오」 하고 약속한다', hint: '건강 -10 · 명성 +10 · 후계·제자들이 결속한다' },
      ],
    };
  },
  resolve: (s, opt) => {
    const sp = s.spouse?.name || spouseWord(s);
    let n: GameState = { ...s, spouse: s.spouse ? { ...s.spouse, alive: false } : null };
    n = remember(n, 'spouse_died_turn', String(s.turn));
    n = milestone(n, 'SPOUSE_DIED', `${spouseWord(s)} ${josa(sp, '이가')} 세상을 떠났다`);
    n = addHealth(n, -10);
    if (opt === 'promise') {
      n = addFame(n, 10);
      n = { ...n, disciples: n.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 5) })) };
      return say(n, [
        ['나레이션', `새벽녘, ${josa(sp, '은는')} 쥐고 있던 손을 놓았다.`],
        ['나레이션', '장례 날, 제자들이 상여를 메고 고개를 넘었다. 도장 사람들이 모두 흰 옷을 입었다.'],
      ]);
    }
    return say(addStats(n, { wil: 3 }), [
      ['나레이션', `밤새 손을 놓지 않았다. 새벽녘, 그 손이 먼저 식었다.`],
      [s.name, '……밥은 거르지 않겠소.'],
    ]);
  },
};

// 홀로 된 뒤 — 빈자리
const widowed: JourneyEventDef = {
  key: 'elder_widowed',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 2,
  cond: (s) => !!s.spouse && !s.spouse.alive && s.turn - memTurn(s, 'spouse_died_turn') >= 3 && s.turn - memTurn(s, 'spouse_died_turn') <= 16,
  build: (s) => {
    const sp = s.spouse!.name;
    return {
      title: '빈자리',
      category: 'FAMILY',
      narration: `${josa(sp, '이가')} 떠난 뒤 처음 맞는 ${s.season === 'WINTER' ? '겨울' : s.season === 'SPRING' ? '봄' : s.season === 'SUMMER' ? '여름' : '가을'}이다.`,
      script: [
        N(`부엌에서 그릇 소리가 나지 않는다. 텃밭은 잡초가 무릎까지 자랐다.`),
        N(`제자가 밥상을 들고 들어온다. 반찬이 하나같이 짜다. ${josa(sp, '이가')} 하던 맛을 흉내 내려 애쓴 것이다.`),
      ],
      options: [
        { id: 'eat', label: '말없이 한 그릇을 다 비운다', hint: '건강 +5 · 약속을 지킨다' },
        { id: 'grave', label: '무덤에 가서 하루를 보낸다', hint: '정신 +2 · 구도 +5' },
        { id: 'work', label: '도장 일에 더 매달린다', hint: '숙련↑ · 건강 -4' },
      ],
    };
  },
  resolve: (s, opt) => {
    const sp = s.spouse?.name || spouseWord(s);
    if (opt === 'eat') return say(addHealth(s, 5), [['나레이션', `밥알 하나 남기지 않았다. 「밥은 거르지 마시오.」 ${sp}의 마지막 말이 그릇 바닥에 있었다.`]]);
    if (opt === 'grave') return say(addRep(addStats(s, { wil: 2 }), { ascetic: 5 }), [['나레이션', `무덤가 풀을 뽑고, 도장 이야기를 했다. 제자 누가 어떻게 컸는지, 마당 감나무에 감이 몇 개 열렸는지.`]]);
    return say(addHealth(trainEquipped(s, 60), -4), [['나레이션', '칼을 쥐고 있는 동안에는 빈자리가 보이지 않았다. 칼을 내려놓으면 다시 보였다.']]);
  },
};

// 손주가 태어나다 — 장성한 자식이 있을 때
const grandchild: JourneyEventDef = {
  key: 'elder_grandchild',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.6,
  trigger: { age: [55, 90] },
  cond: (s) => kinOf(s).some((d) => d.age >= 24),
  build: (s) => {
    const kid = kinOf(s).filter((d) => d.age >= 24).sort((a, b) => b.age - a.age)[0];
    const gname = rand(byCountry(s, ['복동', '아름', '돌쇠', '단비', '바우', '연이'], ['소보', '아령', '철우', '춘화', '소호', '연연'], ['다로', '하나', '긴지', '오하루', '고타', '스즈']));
    return {
      title: '첫 손주',
      category: 'FAMILY',
      sceneActor: 'DISCIPLE',
      narration: `${josa(kid.name, '이가')} 강보에 싸인 아이를 안고 마당에 들어선다.`,
      script: [
        N(`${josa(kid.name, '이가')} 강보에 싸인 아이를 안고 조심조심 마당에 들어선다.`),
        P(kid.name, `${s.gender === 'FEMALE' ? '어머니' : '아버지'}, 손주입니다. 이름은…… ${s.gender === 'FEMALE' ? '어머니' : '아버지'}께서 지어 주십시오.`, '아이를 내밀며'),
        N('손바닥만 한 얼굴이 칼 쥐던 손 위에서 꼼지락거린다.'),
      ],
      options: [
        { id: 'sword', label: '칼 「검(劍)」 자를 넣어 짓는다', hint: '무가의 핏줄 · 살기 +2' },
        { id: 'peace', label: '「평(平)」 — 칼 없는 세상에서 살라고', hint: '인덕 +6 · 구도 +4' },
        { id: 'simple', label: `「${gname}」 — 그냥 순하고 흔한 이름으로`, hint: '건강 +4' },
      ],
      meta: { kidId: kid.id, gname },
    };
  },
  resolve: (s, opt, c) => {
    const base = String(c.data?.gname || '아이');
    const name = opt === 'sword' ? byCountry(s, '검이', '검아', '겐타') : opt === 'peace' ? byCountry(s, '평이', '평아', '헤이타') : base;
    let n = remember(s, 'grandchild', name);
    n = remember(n, 'grandchild_turn', String(s.turn));
    n = milestone(n, 'GRANDCHILD', `첫 손주 「${name}」가 태어났다`);
    if (opt === 'sword') n = addRep(n, { ruthless: 2 });
    else if (opt === 'peace') n = addRep(n, { virtue: 6, ascetic: 4 });
    else n = addHealth(n, 4);
    const kid = s.disciples.find((d) => d.id === c.data?.kidId);
    return say(n, [['나레이션', `「${name}」. ${kid ? josa(kid.name, '이가') : '자식이'} 그 이름을 세 번 불러 보더니 웃었다. 그날 도장 마당에 처음으로 아기 울음소리가 울렸다.`]]);
  },
};

// 손주에게 목검을 깎아 주다 (몇 해 뒤)
const grandchildSword: JourneyEventDef = {
  key: 'elder_grandchild_sword',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 2,
  cond: (s) => !!mem(s, 'grandchild') && s.turn - memTurn(s, 'grandchild_turn') >= 14,
  build: (s) => {
    const g = mem(s, 'grandchild')!;
    return {
      title: `${g}의 목검`,
      category: 'FAMILY',
      narration: `네 살배기 ${josa(g, '이가')} 부지깽이를 칼처럼 휘두르며 마당을 뛰어다닌다.`,
      script: [
        N(`네 살배기 ${josa(g, '이가')} 부지깽이를 칼처럼 휘두르며 제자들 사이를 뛰어다닌다. 제자들이 일부러 「으악」 하고 쓰러져 준다.`),
        P(g, `할${s.gender === 'FEMALE' ? '머니' : '아버지'}! 나도 진짜 칼!`, '바짓가랑이를 붙잡고'),
      ],
      options: [
        { id: 'carve', label: '밤새 작은 목검을 깎아 준다', hint: '건강 -2 · 정신 +2 · 손주와의 추억' },
        { id: 'no', label: '「칼은 장난감이 아니다」 하고 붓을 쥐여 준다', hint: '인덕 +4 · 아이는 글을 익힌다' },
      ],
    };
  },
  resolve: (s, opt) => {
    const g = mem(s, 'grandchild') || '손주';
    if (opt === 'carve') {
      const n = remember(addStats(addHealth(s, -2), { wil: 2 }), 'grandchild_path', 'SWORD');
      return say(n, [['나레이션', `손바닥만 한 목검. 손잡이에 「${g}」 두 글자를 새겼다. 아이는 그 칼을 안고 잠들었다.`]]);
    }
    return say(remember(addRep(s, { virtue: 4 }), 'grandchild_path', 'BRUSH'), [['나레이션', `${josa(g, '은는')} 입을 삐죽 내밀었지만, 그날 저녁 먹물로 얼굴까지 까맣게 칠한 채 제 이름을 써 왔다.`]]);
  },
};

// 손주의 질문 — 사람을 베어 봤어요?
const grandchildQuestion: JourneyEventDef = {
  key: 'elder_grandchild_question',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 2,
  cond: (s) => !!mem(s, 'grandchild') && s.turn - memTurn(s, 'grandchild_turn') >= 26,
  build: (s) => {
    const g = mem(s, 'grandchild')!;
    const killed = (s.flags.realDuelKills || 0) > 0;
    return {
      title: '아이의 물음',
      category: 'FAMILY',
      narration: `툇마루에서 ${josa(g, '이가')} 다리를 흔들며 묻는다.`,
      script: [P(g, `할${s.gender === 'FEMALE' ? '머니' : '아버지'}는 진짜로 사람 베어 봤어요? 장터 애들이 그러던데.`, '눈을 반짝이며')],
      options: killed
        ? [
            { id: 'truth', label: '「그래. 그리고 그 사람 얼굴을 아직 기억한다」', hint: '살기 -6 · 구도 +6' },
            { id: 'deny', label: '「그런 소문은 믿지 마라」', hint: '아이는 믿지 않는 눈치다' },
          ]
        : [
            { id: 'never', label: `「한 번도 없다. 그게 ${s.gender === 'FEMALE' ? '할미' : '할아비'}가 가장 잘한 일이다」`, hint: '인덕 +8' },
            { id: 'boast', label: '「베지 않고 이기는 게 진짜 칼이다」', hint: '명성 +4 · 구도 +4' },
          ],
    };
  },
  resolve: (s, opt) => {
    const g = mem(s, 'grandchild') || '아이';
    if (opt === 'truth')
      return say(addRep(s, { ruthless: -6, ascetic: 6 }), [
        [s.name, `칼을 뽑는 건 한순간이다. 그런데 그 뒤로는 평생을 그 사람과 함께 산다. 그러니 ${callName(s, g)}, 칼은 배우되 뽑지는 마라.`],
        ['나레이션', `${josa(g, '은는')} 무슨 말인지 모르는 얼굴로 고개를 끄덕였다.`],
      ]);
    if (opt === 'deny') return say(s, [['나레이션', `${josa(g, '은는')} 「에이」 하고 뛰어갔다. 그 뒷모습을 한참 보았다.`]]);
    if (opt === 'never') return say(addRep(s, { virtue: 8 }), [['나레이션', `${josa(g, '은는')} 실망한 얼굴이었다. 십 년쯤 지나면 그 말을 이해할 것이다.`]]);
    return say(addFame(addRep(s, { ascetic: 4 }), 4), [['나레이션', `${josa(g, '이가')} 그 말을 장터 아이들에게 그대로 옮겼다. 아이들 사이에서 그 말이 유행이 되었다.`]]);
  },
};

// ═════════════════════════ 3. 지나온 날 ═════════════════════════

// 꿈에 나타난 베어 죽인 자 — 원한이 남아 있다면 유족을 찾아갈 수도 있다
const killDream: JourneyEventDef = {
  key: 'elder_kill_dream',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.6,
  trigger: { age: [58, 99] },
  cond: (s) => (s.flags.realDuelKills || 0) > 0,
  build: (s) => {
    const grudge = (s.flags.bloodGrudges || []).find((g) => !g.resolved);
    const who = grudge?.victimName || '그날 베었던 사내';
    const rite = byCountry(s, '절에 천도재(薦度齋)를 올린다', '도관에 법회를 청한다', '절에 공양(供養)을 올린다');
    return {
      title: '꿈에 온 사람',
      category: 'LIFE',
      narration: `${who}의 얼굴이 꿈에 나왔다. 수십 해 만이다.`,
      script: [
        N(`꿈속에서 ${josa(who, '이가')} 그날 그 자리에 서 있었다. 칼을 쥐고, 피를 흘리며, 아무 말 없이.`),
        N('깨어 보니 이불이 식은땀에 젖어 있다. 진검으로 사람을 벤 것이 몇 번이었던가.'),
      ],
      options: [
        { id: 'rite', label: `${rite} (50${cur(s)})`, hint: '살기 -10 · 구도 +6', disabled: s.money < 50, disabledReason: '돈이 부족하다' },
        ...(grudge ? [{ id: 'family', label: `${who}의 유족을 찾아가 무릎을 꿇는다`, hint: '원한이 풀릴 수도, 더 깊어질 수도 있다' }] : []),
        { id: 'bear', label: '「칼잡이의 업이다」 하고 다시 눕는다', hint: '정신 +2' },
      ],
      meta: { grudgeId: grudge?.id || '' },
    };
  },
  resolve: (s, opt, c) => {
    if (opt === 'rite') return say(addRep(addMoney(s, -50), { ruthless: -10, ascetic: 6 }), [['나레이션', '향이 다 탈 때까지 자리를 지켰다. 그 뒤로 그 얼굴은 꿈에 오지 않았다.']]);
    if (opt === 'family') {
      const gid = String(c.data?.grudgeId || '');
      const ok = chance(0.55 + Math.min(0.25, s.reputation.virtue * 0.003));
      if (ok) {
        const n = { ...s, flags: { ...s.flags, bloodGrudges: (s.flags.bloodGrudges || []).map((g) => (g.id === gid ? { ...g, resolved: true } : g)) } };
        return say(milestone(addRep(n, { ruthless: -15, virtue: 10 }), 'GRUDGE_FORGIVEN', '진검으로 벤 자의 유족을 찾아가 용서를 빌었고, 원한이 풀렸다'), [
          ['나레이션', '마당에 무릎을 꿇은 늙은 무인을, 유족은 한참 내려다보았다.'],
          ['유족', '……일어나시오. 그 사람도 칼을 들고 나간 사람이었소. 이제 그만 놓읍시다.'],
        ]);
      }
      return say(addHealth(addRep(s, { virtue: 4 }), -6), [['나레이션', '대문은 열리지 않았다. 문틈으로 「돌아가시오」 한마디만 새어 나왔다. 원한은 그대로였다.']]);
    }
    return say(addStats(s, { wil: 2 }), [['나레이션', '돌아누웠다. 잠은 다시 오지 않았다.']]);
  },
};

// 숙적의 기일 — 숙적이 먼저 세상을 떠났다면
const rivalGrave: JourneyEventDef = {
  key: 'elder_rival_grave',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.8,
  trigger: { age: [56, 99] },
  cond: (s) => !s.rival.alive && !!s.rival.name,
  build: (s) => {
    const r = s.rival.name;
    const tally = `${s.rival.lossesAgainstPlayer}승 ${s.rival.winsAgainstPlayer}패`;
    return {
      title: `${r}의 기일`,
      category: 'RIVAL',
      sceneActor: 'RIVAL',
      narration: `오늘이 ${r}의 기일이다. 평생의 맞수와의 전적은 ${tally}.`,
      script: [
        N(`오늘이 ${r}의 기일이다. 평생 맞붙은 전적은 ${tally}. 끝내 결판을 내지 못한 셈이다.`),
        N(`무덤 앞에 낯선 젊은이가 먼저 와 있었다. ${r}의 마지막 제자라고 했다.`),
        P(`${r}의 제자`, `스승님이 늘 말씀하셨습니다. 「그 사람이 없었으면 나는 평범한 칼잡이로 끝났을 거다」라고.`, '고개를 숙이며'),
      ],
      options: [
        { id: 'drink', label: '무덤에 술을 따르고 옛이야기를 들려준다', hint: '건강 +4 · 정신 +2' },
        { id: 'spar', label: '「네 스승의 칼을 보여 다오」 — 목검으로 한 합 받아 준다', hint: '통찰 +3 · 그 제자가 인연이 된다' },
        { id: 'bow', label: '말없이 절만 하고 돌아선다', hint: '구도 +5' },
      ],
    };
  },
  resolve: (s, opt) => {
    const r = s.rival.name;
    if (opt === 'drink') return say(addStats(addHealth(s, 4), { wil: 2 }), [['나레이션', `${josa(r, '이가')} 처음 도장에 쳐들어왔던 날부터 이야기했다. 젊은 제자가 웃다가 울었다.`]]);
    if (opt === 'spar') return say(remember(addStats(s, { ins: 3 }), 'rival_heir_met', 'YES'), [['나레이션', `첫 합에 알았다. ${r}의 칼버릇이 그대로였다. 목검을 맞댄 채, 한동안 둘 다 움직이지 않았다. (통찰 +3)`]]);
    return say(addRep(s, { ascetic: 5 }), [['나레이션', '절을 두 번 했다. 한 번은 맞수에게, 한 번은 그와 함께 늙어 간 세월에게.']]);
  },
};

// 첫 제자의 흰머리 — 가장 오래된 제자와 마주 앉다
const firstDisciple: JourneyEventDef = {
  key: 'elder_first_disciple',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [58, 99] },
  cond: (s) => aliveDisc(s).some((d) => d.age >= 40 && s.year - d.joinedYear >= 15),
  build: (s) => {
    const d = oldest(aliveDisc(s).filter((x) => x.age >= 40));
    const yrs = s.year - d.joinedYear;
    return {
      title: `${d.name}의 흰머리`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `${josa(d.name, '이가')} 문하에 든 지 ${yrs}년. 그 상투에도 흰머리가 섞였다.`,
      script: [
        N(`${d.joinedYear}년에 입문한 ${josa(d.name, '이가')} 마당에서 신입들을 가르치고 있다. 그 상투에 흰머리가 희끗하다.`),
        H(s, `${callName(s, d.name)}, 너도 늙는구나.`, '마루에서 내려다보며'),
        P(d.name, `스승님이 먼저 늙으셨으니 저도 따라가야지요.`, '웃으며 올려다보며'),
      ],
      options: [
        { id: 'drink', label: '마주 앉아 술 한잔 나눈다', hint: '충성↑ · 건강 +3' },
        { id: 'title', label: '사범(師範)의 칭호와 함께 도장 운영의 일부를 맡긴다', hint: '그 제자가 사범이 된다 · 정신 +2' },
      ],
      meta: { discId: d.id },
    };
  },
  resolve: (s, opt, c) => {
    const id = String(c.data?.discId || '');
    const d = s.disciples.find((x) => x.id === id);
    if (!d) return s;
    if (opt === 'title') {
      const n = mapDisc(addStats(s, { wil: 2 }), id, (x) => ({ ...x, role: x.role === 'HEIR' ? 'HEIR' : 'INSTRUCTOR', loyalty: x.loyalty + 10 }));
      return say(n, [['나레이션', `${josa(d.name, '은는')} 「사범」 두 글자가 쓰인 현판을 받아 들고 한참을 서 있었다. (${d.name} 충성 +10)`]]);
    }
    return say(mapDisc(addHealth(s, 3), id, (x) => ({ ...x, loyalty: x.loyalty + 8 })), [
      [d.name, '처음 입문하던 날 기억하십니까? 월사금 대신 장작 한 짐을 지고 왔었지요.'],
      ['나레이션', '술병이 둘 비었다. 그날 밤 마당의 목검 소리는 두 사람 웃음소리에 묻혔다.'],
    ]);
  },
};

// 부모의 산소 — 도장을 물려준 부모에게 고하다
const parentsGrave: JourneyEventDef = {
  key: 'elder_parent_grave',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [55, 99] },
  build: (s) => {
    const pw = parentWord(s);
    return {
      title: `${pw}의 산소`,
      category: 'FAMILY',
      narration: `${pw}가 이 도장을 남기고 떠난 지 어언 ${s.age - (s.startAge || 20)}년. 산소의 비석이 기울었다.`,
      script: [
        N(`스무 냥 빚과 비 새는 연무장, 목검 두 자루. ${pw}가 남긴 것은 그것뿐이었다. 그로부터 ${s.age - (s.startAge || 20)}년.`),
        N(`산소에 오르니 비석이 비스듬히 기울어 있다. 이끼가 이름을 반쯤 덮었다.`),
        H(s, `${pw}, 【${s.sectName}】는 이제 ${s.fame >= 600 ? '천하가 아는 이름이 되었습니다' : s.fame >= 250 ? '이 고을에서 모르는 사람이 없습니다' : '아직 작지만 문은 닫지 않았습니다'}.`, '이끼를 걷어 내며'),
      ],
      options: [
        { id: 'stone', label: `새 비석을 세운다 (80${cur(s)})`, hint: '인덕 +8 · 명성 +6', disabled: s.money < 80, disabledReason: '돈이 부족하다' },
        { id: 'talk', label: '해 질 때까지 앉아 그간의 일을 고한다', hint: '정신 +2 · 건강 +3' },
      ],
    };
  },
  resolve: (s, opt) => {
    if (opt === 'stone') return say(addFame(addRep(addMoney(s, -80), { virtue: 8 }), 6), [['나레이션', `새 비석 뒷면에 한 줄을 더 새겼다. 「이 사람이 남긴 목검 두 자루에서 【${s.sectName}】가 시작되었다.」`]]);
    return say(addHealth(addStats(s, { wil: 2 }), 3), [['나레이션', '제자 이야기, 숙적 이야기, 빚 갚던 이야기. 다 하고 나니 해가 졌다. 내려오는 길이 가벼웠다.']]);
  },
};

// 옛 고수의 부고 — 강호 명부의 실제 인물이 세상을 떠난다 (되풀이: 매번 다른 사람)
const obituary: JourneyEventDef = {
  key: 'elder_obituary',
  kind: 'HOME',
  elder: true,
  cooldown: 12,
  trigger: { age: [58, 99] },
  cond: (s) => (s.tourneyRoster || []).some((f) => f.kind !== 'DISCIPLE' && f.kind !== 'RIVAL' && s.year - f.bornYear >= 62 && !(mem(s, 'deceased') || '').includes(f.id)),
  build: (s) => {
    const cands = (s.tourneyRoster || []).filter((f) => f.kind !== 'DISCIPLE' && f.kind !== 'RIVAL' && s.year - f.bornYear >= 62 && !(mem(s, 'deceased') || '').includes(f.id));
    const f = [...cands].sort((a, b) => b.titles - a.titles || a.bornYear - b.bornYear)[0];
    const met = (s.flags.tourneyHistory || []).some((h) => JSON.stringify(h).includes(f.name));
    return {
      title: `부고 — ${f.sect}의 ${f.name}`,
      category: 'LIFE',
      narration: `${f.sect}의 ${josa(f.name, '이가')} 향년 ${s.year - f.bornYear}세로 세상을 떠났다는 부고가 왔다.`,
      script: [
        N(`${f.sect}에서 부고가 왔다. ${f.name}, 향년 ${s.year - f.bornYear}세.${f.titles > 0 ? ` 천하대회를 ${f.titles}번 제패한 고수였다.` : ''}`),
        N(met ? '천하대회 비무대에서 칼을 맞대 본 사람이다. 그 칼버릇이 아직 손끝에 남아 있다.' : '직접 겨뤄 본 적은 없지만, 젊은 날 그 이름을 들으며 칼을 갈았다.'),
      ],
      options: [
        { id: 'go', label: `조문을 간다 (20${cur(s)})`, hint: '명성 +8 · 강호의 원로들과 얼굴을 익힌다', disabled: s.money < 20, disabledReason: '돈이 부족하다' },
        { id: 'elegy', label: '제문(祭文)을 지어 보낸다', hint: '인덕 +4 · 통찰 +1' },
        { id: 'cup', label: '마루에서 술 한 잔을 따라 놓는다', hint: '정신 +1' },
      ],
      meta: { fid: f.id },
    };
  },
  resolve: (s, opt, c) => {
    const fid = String(c.data?.fid || '');
    const roster = (s.tourneyRoster || []).map((f) => (f.id === fid ? { ...f, retired: true } : f));
    let n: GameState = remember({ ...s, tourneyRoster: roster }, 'deceased', `${mem(s, 'deceased') || ''},${fid}`);
    const peers = (mem(s, 'deceased') || '').split(',').filter(Boolean).length + 1;
    const tail = peers >= 3 ? ` 올해만 벌써 같은 시대를 산 고수 ${peers}명을 떠나보냈다.` : '';
    if (opt === 'go') return say(addFame(addMoney(n, -20), 8), [['나레이션', `빈소에는 백발의 고수들이 모여 있었다. 서로의 얼굴에서 서로의 나이를 읽었다.${tail}`]]);
    if (opt === 'elegy') return say(addStats(addRep(n, { virtue: 4 }), { ins: 1 }), [['나레이션', `「칼은 녹슬어도 그 칼이 그은 선은 남는다.」 제문 끝에 그렇게 적었다.${tail}`]]);
    n = addStats(n, { wil: 1 });
    return say(n, [['나레이션', `잔이 비지 않았다. 다음 날 아침에도 그대로였다.${tail}`]]);
  },
};

// ═════════════════════════ 4. 생의 고비 — 환갑 · 고희 · 팔순 ═════════════════════════

function guestsOf(s: GameState): string[] {
  const g: string[] = [];
  if (s.spouse?.alive) g.push(`${spouseWord(s)} ${s.spouse.name}`);
  kinOf(s).forEach((k) => g.push(k.name));
  const h = heirOf(s);
  if (h && !h.isChild) g.push(`후계자 ${h.name}`);
  (s.graduatedDisciples || [])
    .filter((x) => x.fate === 'GRANDMASTER' || x.fate === 'SUCCESSFUL')
    .slice(0, 2)
    .forEach((x) => g.push(`하산한 제자 ${x.name}`));
  return g;
}

const hwangap: JourneyEventDef = {
  key: 'elder_hwangap',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 6,
  trigger: { age: [60, 61] },
  build: (s) => {
    const feast = byCountry(s, '환갑(還甲) 잔치', '육순 생신(六十大壽)', '환력(還暦) 축하연');
    const guests = guestsOf(s);
    return {
      title: feast,
      category: 'FAMILY',
      narration: `예순, 육십갑자가 한 바퀴 돌았다. 제자들이 몰래 ${feast}를 준비했다.`,
      script: [
        N(`예순. 태어난 해의 간지가 돌아왔다. 아침에 마당에 나가 보니 차일이 쳐져 있고 상이 차려져 있다.`),
        ...(s.country === 'JAPAN' ? [N('제자들이 붉은 두루마기를 내민다. 다시 태어난 아이처럼, 붉은 옷을 입는 것이 환력의 법도란다.')] : []),
        N(guests.length ? `${nameList(guests)}…… 얼굴들이 모여 있다.` : `제자들만 모였다. 그래도 마당이 가득 찼다.`),
        P('문하생 일동', '스승님, 만수무강하십시오!', '일제히 절하며'),
      ],
      options: [
        { id: 'demo', label: '답례로 직접 검무(劍舞)를 춘다', hint: '명성 +15 · 건강 -4' },
        { id: 'speech', label: '술잔을 들고 짧게 한마디 한다', hint: '문하생 전원 충성 +5' },
        { id: 'quiet', label: '잔치는 짧게 끝내고 그 돈을 고을 노인들에게 쓴다', hint: '인덕 +12' },
      ],
    };
  },
  resolve: (s, opt) => {
    let n = milestone(s, 'HWANGAP', '예순을 맞아 제자들이 환갑 잔치를 열어 주었다');
    if (opt === 'demo') return say(addHealth(addFame(n, 15), -4), [['나레이션', '칼끝이 예전만큼 빠르지 않았다. 대신 한 동작도 흐트러지지 않았다. 구경 온 고을 사람들이 숨을 죽였다. (명성 +15)']]);
    if (opt === 'speech') {
      n = { ...n, disciples: n.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 5) })) };
      return say(n, [[s.name, '예순이 되니 알겠다. 내가 가르친 게 아니라, 너희가 나를 여기까지 데려왔다.'], ['나레이션', '마당이 조용해졌다가, 누군가 훌쩍이는 소리에 다들 웃었다.']]);
    }
    return say(addRep(n, { virtue: 12 }), [['나레이션', '잔칫상을 고을 정자로 옮겼다. 그날 고을 노인들이 다 같이 배불리 먹었다. (인덕 +12)']]);
  },
};

const gohui: JourneyEventDef = {
  key: 'elder_gohui',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 6,
  trigger: { age: [70, 71] },
  build: (s) => {
    const gone: string[] = [];
    if (s.spouse && !s.spouse.alive) gone.push(`${spouseWord(s)} ${s.spouse.name}`);
    if (!s.rival.alive && s.rival.name) gone.push(`숙적 ${s.rival.name}`);
    s.disciples.filter((d) => d.dead && !d.isChild).slice(-2).forEach((d) => gone.push(`제자 ${d.name}`));
    const guests = guestsOf(s);
    return {
      title: '고희(古稀)',
      category: 'FAMILY',
      narration: '사람이 일흔을 사는 일은 예로부터 드물다 했다.',
      script: [
        N('「人生七十古來稀」 — 사람이 일흔을 사는 일은 예로부터 드물다 했다.'),
        N(guests.length ? `잔칫상 둘레에 ${nameList(guests)}…… 얼굴들이 앉았다.` : '잔칫상 둘레에 제자들이 앉았다.'),
        ...(gone.length ? [N(`빈자리도 보인다. ${nameList(gone)}. 상 끝에 수저를 한 벌씩 더 놓았다.`)] : []),
      ],
      options: [
        { id: 'toast', label: '떠난 이들에게 먼저 잔을 올린다', hint: '정신 +3 · 구도 +5' },
        { id: 'teach', label: '「오늘은 내가 가르칠 차례다」 — 마지막으로 전 초식을 시연한다', hint: '모든 제자 숙련↑ · 건강 -6' },
      ],
    };
  },
  resolve: (s, opt) => {
    let n = milestone(s, 'GOHUI', '일흔을 맞아 고희연을 열었다');
    if (opt === 'toast') return say(addRep(addStats(n, { wil: 3 }), { ascetic: 5 }), [['나레이션', '첫 잔은 빈자리에 부었다. 술이 땅에 스며드는 동안 아무도 말하지 않았다.']]);
    n = addHealth(n, -6);
    n = { ...n, disciples: n.disciples.map((d) => (d.dead ? d : { ...d, stats: { ...d.stats, ins: d.stats.ins + 2, str: d.stats.str + 1 } })) };
    return say(n, [['나레이션', '일흔의 칼이 처음부터 끝까지 이어졌다. 끝나고 나니 숨이 턱에 찼다. 제자들은 그날 본 것을 평생 되새겼다. (문하생 전원 통찰 +2)']]);
  },
};

const palsun: JourneyEventDef = {
  key: 'elder_palsun',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 6,
  trigger: { age: [80, 81] },
  build: (s) => ({
    title: byCountry(s, '팔순(八旬)', '팔순 생신(八十大壽)', '산수(傘壽)'),
    category: 'FAMILY',
    narration: '여든. 이제 고을에서 가장 나이 많은 사람이 되었다.',
    script: [
      N('여든. 고을에서 이보다 나이 많은 사람이 없다. 어릴 적 같이 뛰놀던 이들은 모두 먼저 갔다.'),
      N(`${josa(magistrate(s), '이가')} 지팡이와 쌀 한 섬을 보내왔다. 고을의 최고령 노인에게 내리는 것이란다.`),
    ],
    options: [
      { id: 'thank', label: '고을 사람들을 불러 함께 나눈다', hint: '인덕 +10 · 명성 +10' },
      { id: 'yard', label: '아침에 마당에 나가 평소처럼 칼을 쥔다', hint: '정신 +3' },
    ],
  }),
  resolve: (s, opt) => {
    const n = milestone(s, 'PALSUN', '여든을 넘겨 고을 최고령 노인이 되었다');
    if (opt === 'thank') return say(addFame(addRep(n, { virtue: 10 }), 10), [['나레이션', '쌀 한 섬으로 떡을 쪄 온 고을에 돌렸다. 「도장 할아버지 떡」이라 불렸다.']]);
    return say(addStats(n, { wil: 3 }), [['나레이션', '여든의 첫날도 칼을 쥐었다. 서른 번 휘두르고 쉬었다. 그래도 쥐었다.']]);
  },
};

export const ELDER_LIFE_EVENTS: JourneyEventDef[] = [
  tremor,
  tremorRevealed,
  eyes,
  cane,
  fall,
  physician,
  dawn,
  nameSlip,
  spouseDaily,
  spouseIll,
  spouseFarewell,
  widowed,
  grandchild,
  grandchildSword,
  grandchildQuestion,
  killDream,
  rivalGrave,
  firstDisciple,
  parentsGrave,
  obituary,
  hwangap,
  gohui,
  palsun,
];

// 같은 이름의 사건이 다른 파일과 겹치지 않는지 확인하는 용도
export const ELDER_LIFE_KEYS = ELDER_LIFE_EVENTS.map((e) => e.key);
export { isDone, markDone };
