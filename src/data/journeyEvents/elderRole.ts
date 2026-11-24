import { GameState } from '../../types/game';
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
  journeyBattle,
  N,
  P,
  rand,
  remember,
  roadScale,
  say,
  trainEquipped,
} from '../../engine/journeyCore';
import { makePersonName, randomSectName } from '../../engine/tourney';
import { getMaxDisciples } from '../../engine/gameLogic';
import { createDiscipleEntity } from '../events';
import { josa } from '../../utils/korean';
import { aliveDisc, callName, heirOf, magistrate, mapDisc, mem, memTurn, milestone, nameList } from './elder';

// 노년(55세 이후)의 사건 ② 물려주기 · 원로의 자리 · 남길 것 · 저물어 가는 시대.
// 칼을 쥔 사람에서 칼을 넘겨주는 사람으로 — 양위한 뒤에는 도장 일을 후계자가 맡고, 나는 지켜보거나 조언하거나 끼어든다.

const hasRoom = (s: GameState) => s.disciples.filter((d) => !d.dead).length < getMaxDisciples(s.facilities);
const isRetired = (s: GameState) => {
  const a = s.flags.abdicated;
  return !!a && s.disciples.some((d) => d.id === a.heirId && !d.dead);
};
const heirPower = (s: GameState) => {
  const h = heirOf(s);
  return h ? (h.stats.str + h.stats.agi + h.stats.ins + h.stats.wil) / 4 : 0;
};
const clampP = (p: number) => Math.max(0.08, Math.min(0.92, p));
const pct = (p: number) => `${Math.round(clampP(p) * 100)}%`;
const usedList = (s: GameState, key: string) => (mem(s, key) || '').split(',').filter(Boolean);
const pushUsed = (s: GameState, key: string, v: string) => remember(s, key, [...usedList(s, key), v].slice(-30).join(','));

// ═════════════════════════ 1. 양위(讓位) ═════════════════════════

const abdication: JourneyEventDef = {
  key: 'elder_abdication',
  kind: 'HOME',
  elder: true,
  cooldown: 12,
  weight: 1.8,
  trigger: { age: [62, 95] },
  cond: (s) => {
    const h = heirOf(s);
    return !!h && h.age >= 22 && !s.flags.abdicated && mem(s, 'abdication') !== 'NEVER';
  },
  weightBy: (s) => (mem(s, 'abdication_nudge') === 'YES' ? 3 : 1) * (s.age >= 72 ? 1.8 : 1),
  build: (s) => {
    const h = heirOf(s)!;
    const asked = mem(s, 'abdication') === 'LATER';
    return {
      title: asked ? '다시 꺼낸 양위 이야기' : '현판을 물려줄 때',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: asked ? `몇 해 전 미뤄 두었던 이야기를 원로들이 다시 꺼냈다.` : `${josa(h.name, '이가')} 도장 일을 맡아 처리하는 날이 스승보다 많아졌다.`,
      script: [
        N(`문하생들이 장부를 들고 오면 먼저 ${h.name}에게 가는 날이 늘었다. 마당의 구령도 이제 ${h.name}의 목소리다.`),
        N(`${s.age}세. 현판 아래 서서 「${s.sectName}」 네 글자를 올려다본다.`),
        ...(asked ? [P(h.name, '스승님, 저는 아직 멀었습니다. 서두르지 마십시오.', '고개를 숙인 채')] : []),
      ],
      options: [
        { id: 'abdicate', label: `종주의 자리를 ${h.name}에게 물려주고 원로로 물러난다`, hint: '도장 일(문파 분쟁·제자 말썽)은 후계자가 맡는다 · 원로로서의 사건이 열린다' },
        { id: 'later', label: '「아직은 내가 서 있어야 한다」', hint: '몇 해 뒤 다시 묻는다' },
        { id: 'never', label: '「숨이 붙어 있는 한 현판은 내 것이다」', hint: '다시 묻지 않는다 · 정신 +2' },
      ],
      meta: { heirId: h.id },
    };
  },
  resolve: (s, opt, c) => {
    const h = s.disciples.find((d) => d.id === c.data?.heirId);
    if (!h || h.dead) return s;
    if (opt === 'later') return say(remember(s, 'abdication', 'LATER'), [['나레이션', `${josa(h.name, '은는')} 아무 말 없이 고개를 숙였다. 서운한 기색은 보이지 않았다.`]]);
    if (opt === 'never') return say(addStats(remember(s, 'abdication', 'NEVER'), { wil: 2 }), [['나레이션', '그 말이 문하에 퍼졌다. 늙은 종주가 아직 칼을 놓지 않았다는 것을, 다들 반은 걱정하고 반은 자랑스러워했다.']]);
    let n: GameState = { ...s, flags: { ...s.flags, abdicated: { year: s.year, heirId: h.id, heirName: h.name } } };
    n = remember(n, 'abdication', 'DONE');
    n = remember(n, 'abdication_turn', String(s.turn));
    n = mapDisc(n, h.id, (d) => ({ ...d, loyalty: d.loyalty + 15, stats: { ...d.stats, wil: d.stats.wil + 3, ins: d.stats.ins + 2 } }));
    n = milestone(n, 'ABDICATED', `${h.name}에게 종주의 자리를 물려주고 원로로 물러났다`);
    n = addFame(n, 12);
    return say(n, [
      ['나레이션', '양위식 날, 현판 아래서 종주의 검을 두 손으로 넘겨주었다. 받는 손이 떨렸다.'],
      [h.name, '……이 검의 무게를 잊지 않겠습니다.'],
      ['나레이션', `그날부터 마당의 일은 ${h.name}의 몫이 되었다. 원로가 된 스승은 마루에 앉아 그 모습을 보았다. (명성 +12)`],
    ]);
  },
};

// 후계자가 조언을 구한다 (양위 뒤 · 되풀이: 매번 다른 고민)
const CONSULTS = [
  {
    k: 'tuition',
    title: '흉년의 월사금',
    ask: '올해 흉년이라 월사금을 못 내는 집이 절반입니다. 받지 말아야 할지, 원칙을 지켜야 할지……',
    a: { label: '「받지 마라. 사람이 남아야 도장이 남는다」', rep: { virtue: 8 } as const, money: -40, line: '월사금 장부에 붓으로 줄을 그었다. 그해 겨울, 한 명도 도장을 떠나지 않았다.' },
    b: { label: '「원칙은 원칙이다. 대신 쌀로 받아라」', rep: { commerce: 6 } as const, money: 30, line: '쌀가마가 곳간에 쌓였다. 도장 살림은 버텼고, 말이 조금 돌았다.' },
  },
  {
    k: 'expel',
    title: '파문할 것인가',
    ask: '술 먹고 장터에서 칼을 뽑은 놈이 있습니다. 파문하면 도장 체면은 서겠지만…… 그 녀석, 갈 데가 없습니다.',
    a: { label: '「한 번은 품어라. 두 번째는 없다고 일러라」', rep: { virtue: 5 } as const, money: 0, line: '그 녀석은 그날 밤 마당에서 목검을 천 번 휘둘렀다.' },
    b: { label: '「도장의 이름이 한 사람보다 무겁다」', rep: { ruthless: 4 } as const, money: 0, line: '파문장이 대문에 붙었다. 문하생들의 등이 한층 곧아졌다.' },
  },
  {
    k: 'noble',
    title: '세도가 자제의 입문',
    ask: '세도가 집안 도령이 입문하겠다고 합니다. 월사금을 열 배로 내겠답니다. 그런데 버릇이……',
    a: { label: '「돈보다 마당의 공기가 먼저다. 돌려보내라」', rep: { ascetic: 6 } as const, money: 0, line: '도령은 씩씩거리며 돌아갔다. 문하생들이 속으로 박수를 쳤다.' },
    b: { label: '「받아라. 버릇은 마당이 고친다」', rep: { commerce: 6 } as const, money: 80, line: '도령은 사흘 내내 물을 길었다. 나흘째부터 아무 말 없이 물을 길었다.' },
  },
  {
    k: 'realsword',
    title: '진검 수련',
    ask: '요즘 도장들은 상급 제자에게 진검을 쥐여 수련시킨다 합니다. 우리도 그래야 뒤처지지 않을 것 같습니다.',
    a: { label: '「목검으로 못 베는 것은 진검으로도 못 벤다」', rep: { ascetic: 5 } as const, money: 0, line: '진검은 사당에 그대로 걸렸다. 대신 목검 수련이 한 시진 늘었다.' },
    b: { label: '「날의 무게를 알아야 한다. 단, 네가 곁에 서라」', rep: { ruthless: 3 } as const, money: -20, line: '첫 진검 수련 날, 다친 사람은 없었다. 다들 한마디도 하지 않았다.' },
  },
  {
    k: 'women',
    title: '여제자를 받을 것인가',
    ask: '대장장이 딸이 문 앞에서 사흘째 무릎을 꿇고 있습니다. 고을 어른들은 말도 안 된다고 하는데……',
    a: { label: '「칼이 사내만 알아본다더냐. 받아라」', rep: { virtue: 6 } as const, money: 0, line: '대장장이 딸은 석 달 만에 동기들을 모두 이겼다. 고을 어른들은 입을 다물었다.' },
    b: { label: '「고을과 척지지 마라. 다른 도장을 소개해 주어라」', rep: { commerce: 4 } as const, money: 0, line: '소개장을 써 주었다. 그 아이가 떠나는 뒷모습을 한동안 보았다.' },
  },
  {
    k: 'branch',
    title: '분원(分院)을 낼 것인가',
    ask: '이웃 고을에서 우리 도장 분원을 내 달라는 청이 왔습니다. 사범 하나를 보내야 하는데…… 마당이 휑해질 겁니다.',
    a: { label: '「씨앗은 멀리 뿌려야 숲이 된다」', rep: { virtue: 3 } as const, money: -60, line: '사범 하나가 봇짐을 지고 고개를 넘었다. 몇 해 뒤, 그 고을에도 같은 구령이 울렸다.' },
    b: { label: '「뿌리가 먼저다. 아직 이르다」', rep: { ascetic: 3 } as const, money: 0, line: '청은 정중히 사양했다. 마당은 그대로 북적였다.' },
  },
];

const heirConsult: JourneyEventDef = {
  key: 'elder_heir_consult',
  kind: 'HOME',
  elder: true,
  cooldown: 8,
  weight: 1.6,
  cond: (s) => isRetired(s) && CONSULTS.some((x) => !usedList(s, 'consults').includes(x.k)),
  build: (s) => {
    const h = heirOf(s)!;
    const c = rand(CONSULTS.filter((x) => !usedList(s, 'consults').includes(x.k)));
    const p = clampP(0.35 + heirPower(s) * 0.008);
    return {
      title: `종주의 고민 — ${c.title}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `종주 ${josa(h.name, '이가')} 밤늦게 원로의 방문을 두드린다.`,
      script: [N(`종주 ${josa(h.name, '이가')} 밤늦게 찻잔을 들고 원로의 방에 들어와 앉는다.`), P(h.name, c.ask, '찻잔만 만지작거리며')],
      options: [
        { id: 'a', label: c.a.label },
        { id: 'b', label: c.b.label },
        { id: 'self', label: '「이제 네 도장이다. 네가 정해라」', hint: `종주가 스스로 정한다 · 잘 풀릴 가능성 ${pct(p)} · 종주가 자란다` },
      ],
      meta: { k: c.k, p },
    };
  },
  resolve: (s, opt, c) => {
    const h = heirOf(s);
    const def = CONSULTS.find((x) => x.k === c.data?.k);
    if (!h || !def) return s;
    let n = pushUsed(s, 'consults', def.k);
    if (opt === 'self') {
      const ok = chance(Number(c.data?.p) || 0.5);
      const pick = chance(0.5) ? def.a : def.b;
      n = mapDisc(n, h.id, (d) => ({ ...d, loyalty: d.loyalty + 6, stats: { ...d.stats, wil: d.stats.wil + 2, ins: d.stats.ins + (ok ? 3 : 1) } }));
      n = addMoney(addRep(n, pick.rep), pick.money);
      return say(ok ? addFame(n, 8) : addFame(n, -6), [
        ['나레이션', `${josa(h.name, '은는')} 사흘을 고민한 끝에 스스로 정했다. ${pick.line}`],
        ['나레이션', ok ? `일이 잘 풀렸다. ${josa(h.name, '은는')} 그 뒤로 원로의 방을 찾는 날이 조금 줄었다. 서운하고, 기뻤다.` : `일이 꼬였다. ${josa(h.name, '이가')} 수습하느라 한 철을 고생했다. 그래도 끝까지 도와 달라는 말은 하지 않았다.`],
      ]);
    }
    const pick = opt === 'a' ? def.a : def.b;
    n = mapDisc(addMoney(addRep(n, pick.rep), pick.money), h.id, (d) => ({ ...d, stats: { ...d.stats, ins: d.stats.ins + 1 } }));
    return say(n, [[h.name, '……예, 그리하겠습니다.'], ['나레이션', pick.line]]);
  },
};

// 종주가 도전을 받는다 — 지켜볼 것인가, 나설 것인가
const heirChallenged: JourneyEventDef = {
  key: 'elder_heir_challenged',
  kind: 'HOME',
  elder: true,
  cooldown: 12,
  weight: 1.3,
  cond: (s) => isRetired(s),
  build: (s) => {
    const h = heirOf(s)!;
    const name = makePersonName(s.country);
    const sect = randomSectName(s.country);
    const p = clampP(0.3 + heirPower(s) * 0.009 - (s.year - (s.flags.abdicated?.year || s.year) < 2 ? 0.08 : 0));
    return {
      title: `새 종주에게 온 도전장 — ${sect}의 ${name}`,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: `「늙은 호랑이가 물러났다」는 소문을 들은 ${sect}의 ${josa(name, '이가')} 새 종주 ${h.name}에게 도전장을 보냈다.`,
      script: [
        N(`「늙은 호랑이가 굴에서 물러났다더라」 — 그 소문을 듣고 ${sect}의 ${josa(name, '이가')} 찾아왔다. 노린 것은 새 종주 ${h.name}이다.`),
        P(name, `원로께서는 마루에 앉아 구경이나 하시지요. 오늘은 젊은 사람들끼리의 일이니.`, '비웃으며'),
      ],
      options: [
        { id: 'watch', label: '마루에 앉아 끝까지 지켜본다', hint: `종주의 승산 ${pct(p)} · 이기면 종주의 이름이 선다` },
        { id: 'advise', label: '전날 밤 종주를 불러 상대의 버릇 하나를 일러 준다', hint: `승산 ${pct(p + 0.15)} · 통찰 시험` },
        { id: 'step', label: '「내 도장 마당에서 감히」 — 직접 나선다', hint: '비무 · 이겨도 종주의 체면이 깎인다' },
      ],
      meta: { name, sect, p },
    };
  },
  resolve: (s, opt, c) => {
    const h = heirOf(s);
    const name = String(c.data?.name);
    if (!h) return s;
    if (opt === 'step') {
      return journeyBattle(s, c, opt, {
        title: `원로의 일합 — ${name}`,
        subtitle: '물러난 종주가 다시 칼을 쥐었다',
        name,
        enemyTitle: String(c.data?.sect),
        age: 28 + Math.floor(Math.random() * 8),
        ai: rand(['AGGRESSIVE', 'RUSHDOWN', 'DUELIST'] as const),
        scale: roadScale(s, 0.85),
        weapon: 'BLADE',
        skills: byCountry(s, ['sk_kr_06', 'sk_kr_02', 'sk_kr_01'], ['sk_cn_05', 'sk_cn_03', 'sk_cn_02'], ['sk_jp_01', 'sk_jp_03', 'sk_jp_06']),
        rewardFame: 12,
      });
    }
    let p = Number(c.data?.p) || 0.5;
    if (opt === 'advise') p += 0.15 * Math.min(1, s.stats.ins / 70);
    const won = chance(clampP(p));
    let n = mapDisc(s, h.id, (d) => ({ ...d, stats: { ...d.stats, ins: d.stats.ins + 2, str: d.stats.str + (won ? 2 : 1) }, loyalty: d.loyalty + (opt === 'watch' ? 4 : 2) }));
    n = addFame(n, won ? 20 : -12);
    if (won) n = milestone(n, 'HEIR_DEFENDED', `종주가 된 ${josa(h.name, '이가')} 첫 도전을 홀로 물리쳤다`);
    return say(n, [
      ['나레이션', won ? `${josa(h.name, '은는')} 스물 몇 합 만에 ${name}의 칼을 떨어뜨렸다.${opt === 'advise' ? ' 일러 준 그 버릇이 정확히 나왔다.' : ''}` : `${josa(h.name, '이가')} 무릎을 꿇었다. ${josa(name, '이가')} 대문을 나서며 마루 쪽을 힐끗 보았다.`],
      [h.name, won ? '……스승님이 보고 계셔서, 질 수가 없었습니다.' : '면목 없습니다. 다음엔…… 다음엔 이기겠습니다.'],
    ]);
  },
  onBattle: (s, _opt, won, c) => {
    const h = heirOf(s);
    let n = s;
    if (h) n = mapDisc(n, h.id, (d) => ({ ...d, loyalty: d.loyalty - 8 }));
    return say(n, [
      ['나레이션', won ? `${josa(String(c.data?.name), '은는')} 늙은이의 칼에 혼비백산해 달아났다.` : '늙은 몸은 마음을 따라가지 못했다.'],
      ...(h ? ([[h.name, '스승님이 나서시면…… 저는 영영 종주가 되지 못합니다.']] as Array<[string, string]>) : []),
    ]);
  },
};

// 문하가 둘로 갈린다 — 원로를 따르는 쪽과 종주를 따르는 쪽
const factions: JourneyEventDef = {
  key: 'elder_factions',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.4,
  cond: (s) => isRetired(s) && aliveDisc(s).length >= 4 && s.turn - memTurn(s, 'abdication_turn') >= 4,
  build: (s) => {
    const h = heirOf(s)!;
    const old = aliveDisc(s).filter((d) => d.id !== h.id).sort((a, b) => a.joinedYear - b.joinedYear)[0];
    return {
      title: '원로파와 종주파',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `고참 제자들이 원로의 방에 모여든다. 앞장선 것은 ${old.name}이다.`,
      script: [
        P(old.name, `종주께서 법도를 너무 바꾸십니다. 저희는 스승님께 배운 대로 하고 싶습니다. 스승님이 한 말씀만 해 주시면……`, '목소리를 낮추며'),
        N(`문밖에서 젊은 제자들이 이쪽을 엿보고 있다. 마당이 둘로 갈라지고 있었다.`),
      ],
      options: [
        { id: 'heir', label: `모두를 마당에 불러 「이제 종주는 ${h.name}이다」라고 못 박는다`, hint: '종주의 권위가 선다 · 고참 일부의 충성↓' },
        { id: 'both', label: '양쪽을 불러 술상을 차린다', hint: '인덕 · 갈등이 누그러진다' },
        { id: 'side', label: `고참들의 말을 들어 ${josa(h.name, '을를')} 불러 꾸짖는다`, hint: '종주의 권위가 무너진다' },
      ],
      meta: { oldId: old.id },
    };
  },
  resolve: (s, opt, c) => {
    const h = heirOf(s);
    if (!h) return s;
    const oldId = String(c.data?.oldId || '');
    if (opt === 'heir') {
      let n = mapDisc(s, h.id, (d) => ({ ...d, loyalty: d.loyalty + 10, stats: { ...d.stats, wil: d.stats.wil + 2 } }));
      n = mapDisc(n, oldId, (d) => ({ ...d, loyalty: d.loyalty - 10 }));
      return say(n, [[s.name, `나는 이제 손님이다. 내 말을 듣고 싶거든 종주를 통해서 들어라.`], ['나레이션', '마당이 조용해졌다. 그날 저녁 종주는 원로의 방 앞에서 오래 절을 했다.']]);
    }
    if (opt === 'both') {
      const n = { ...addRep(addMoney(s, -30), { virtue: 5 }), disciples: s.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 3) })) };
      return say(n, [['나레이션', '술이 세 순배 돌자 고참들이 젊은 종주 시절의 원로 이야기를 꺼냈다. 원로도 젊을 때 법도를 다 뒤집었었다는 이야기에 다들 웃었다.']]);
    }
    const n = mapDisc(addRep(s, { ruthless: 4 }), h.id, (d) => ({ ...d, loyalty: d.loyalty - 18 }));
    return say(n, [['나레이션', `${josa(h.name, '은는')} 고개를 숙이고 꾸중을 들었다. 그 뒤로 마당에서 종주의 구령이 반 박자씩 늦었다.`]]);
  },
};

// 물려준 후계자를 먼저 잃었다 — 원로가 다시 현판 아래 선다
const heirLost: JourneyEventDef = {
  key: 'elder_heir_lost',
  kind: 'HOME',
  elder: true,
  weight: 8,
  cond: (s) => !!s.flags.abdicated && !s.disciples.some((d) => d.id === s.flags.abdicated!.heirId && !d.dead),
  build: (s) => {
    const name = s.flags.abdicated!.heirName;
    return {
      title: '다시 현판 아래',
      category: 'LIFE',
      narration: `자리를 물려준 ${josa(name, '이가')} 먼저 갔다. 원로는 다시 종주의 검을 들었다.`,
      script: [N(`종주의 자리를 물려받았던 ${josa(name, '이가')} 스승보다 먼저 세상을 떠났다.`), N('사당에 올려 두었던 종주의 검을 다시 내렸다. 칼집에 아직 그 아이의 손때가 남아 있다.')],
      options: [{ id: 'ok', label: '「한 번만 더 서 있자」 — 다시 도장을 맡는다', hint: '도장 일이 다시 내 몫이 된다' }],
    };
  },
  resolve: (s) => {
    const name = s.flags.abdicated?.heirName || '후계자';
    let n: GameState = { ...s, flags: { ...s.flags, abdicated: null } };
    n = remember(n, 'abdication', 'LATER');
    n = milestone(n, 'RETURNED_TO_LEAD', `물려준 ${josa(name, '을를')} 먼저 보내고 다시 종주의 자리에 섰다`);
    return say(addHealth(n, -6), [['나레이션', '마당에 나가 구령을 붙였다. 목소리가 갈라졌다. 제자들이 더 크게 따라 했다.']]);
  },
};

// 비전(祕傳) 전수 — 가장 깊이 익힌 초식을 후계자에게
const secret: JourneyEventDef = {
  key: 'elder_secret',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.5,
  trigger: { age: [63, 99] },
  cond: (s) => !!heirOf(s) && !heirOf(s)!.isChild && s.skills.some((k) => !k.isPassive && k.masteryLevel >= 7),
  build: (s) => {
    const h = heirOf(s)!;
    const sk = [...s.skills].filter((k) => !k.isPassive).sort((a, b) => b.masteryLevel - a.masteryLevel || b.power - a.power)[0];
    const nm = sk.customName || sk.name;
    return {
      title: `비전 전수 — 「${nm}」`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `밤, 문을 걸어 잠그고 ${h.name}만 불렀다.`,
      script: [
        N(`밤, 연무장 문을 걸어 잠그고 ${h.name} 하나만 불렀다. 등잔 하나만 켰다.`),
        H(s, `「${nm}」. ${sk.masteryLevel >= 10 ? '평생을 걸어 벽을 넘은 초식이다.' : '평생 가장 오래 붙들고 있던 초식이다.'} 책에는 쓰지 않은 것이 있다. 그걸 오늘 넘긴다.`, '목검을 쥐며'),
      ],
      options: [
        { id: 'all', label: '사흘 밤을 새워 모든 것을 넘긴다', hint: '후계자가 이 초식을 익힌다 · 건강 -8' },
        { id: 'half', label: '「나머지 반은 네가 찾아라」 — 핵심만 짚어 준다', hint: '후계자 통찰↑ · 언젠가 스스로 깨친다' },
      ],
      meta: { heirId: h.id, skillId: sk.id },
    };
  },
  resolve: (s, opt, c) => {
    const h = s.disciples.find((d) => d.id === c.data?.heirId);
    const sk = s.skills.find((k) => k.id === c.data?.skillId);
    if (!h || h.dead || !sk) return s;
    const nm = sk.customName || sk.name;
    let n = remember(s, 'secret_passed', nm);
    n = milestone(n, 'SECRET_PASSED', `${h.name}에게 비전 ${josa(`「${nm}」`, '을를')} 전했다`);
    if (opt === 'all') {
      n = addHealth(n, -8);
      n = mapDisc(n, h.id, (d) => ({
        ...d,
        loyalty: d.loyalty + 10,
        skills: d.skills.some((x) => x.id === sk.id) ? d.skills.map((x) => (x.id === sk.id ? { ...x, masteryLevel: Math.max(x.masteryLevel, Math.min(8, sk.masteryLevel - 1)) } : x)) : [...d.skills, { ...sk, masteryLevel: Math.min(8, sk.masteryLevel - 2), masteryExp: 0, imprintedTraits: [] }],
      }));
      return say(n, [['나레이션', `사흘째 새벽, ${josa(h.name, '이가')} 처음으로 그 초식을 끝까지 이어 그었다. 스승은 그걸 보고서야 자리에 누웠다.`]]);
    }
    n = mapDisc(n, h.id, (d) => ({ ...d, loyalty: d.loyalty + 6, stats: { ...d.stats, ins: d.stats.ins + 5, wil: d.stats.wil + 2 } }));
    return say(n, [[h.name, '나머지 반은…… 언제쯤 찾을 수 있겠습니까?'], [s.name, '내가 찾는 데 사십 년 걸렸다. 너는 서른 해면 될 게다.']]);
  },
};

// 칼을 물려주다
const swordHandover: JourneyEventDef = {
  key: 'elder_sword_handover',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [68, 99] },
  cond: (s) => !!heirOf(s) && !heirOf(s)!.isChild && s.weapons.length >= 2,
  build: (s) => {
    const h = heirOf(s)!;
    const w = [...s.weapons].sort((a, b) => (b.winsCount || 0) - (a.winsCount || 0))[0];
    const wn = w.customName || w.name;
    return {
      title: `${josa(`「${wn}」`, '을를')} 넘기다`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `평생을 함께한 「${wn}」. 이 칼로 거둔 승리가 ${w.winsCount || 0}번이다.`,
      script: [N(`칼집에서 ${josa(`「${wn}」`, '을를')} 뽑아 마지막으로 날을 본다. ${w.winsCount || 0}번의 승리, 그만큼의 흠집.`), H(s, `${callName(s, h.name)}, 이리 오너라.`)],
      options: [
        { id: 'give', label: `${h.name}에게 넘긴다`, hint: '후계자 근력·충성↑ · 나는 다른 칼을 쥔다' },
        { id: 'keep', label: '「이 칼은 나와 함께 묻어라」', hint: '정신 +2 · 유언으로 남는다' },
      ],
      meta: { heirId: h.id, wid: w.id },
    };
  },
  resolve: (s, opt, c) => {
    const h = s.disciples.find((d) => d.id === c.data?.heirId);
    const w = s.weapons.find((x) => x.id === c.data?.wid);
    if (!h || h.dead || !w) return s;
    const wn = w.customName || w.name;
    if (opt === 'keep') return say(addStats(remember(s, 'buried_sword', wn), { wil: 2 }), [['나레이션', `${josa(`「${wn}」`, '은는')} 다시 칼집에 들어갔다. 제자들은 그 칼이 스승과 함께 묻힐 것을 알았다.`]]);
    const rest = s.weapons.filter((x) => x.id !== w.id);
    const nextEq = s.equippedWeaponId === w.id ? [...rest].sort((a, b) => b.attack - a.attack)[0]?.id || s.equippedWeaponId : s.equippedWeaponId;
    let n: GameState = { ...s, weapons: rest, equippedWeaponId: nextEq };
    n = mapDisc(n, h.id, (d) => ({ ...d, weaponId: w.id, loyalty: d.loyalty + 10, stats: { ...d.stats, str: d.stats.str + 3 } }));
    n = milestone(n, 'SWORD_HANDED', `평생의 칼 ${josa(`「${wn}」`, '을를')} ${h.name}에게 넘겼다`);
    return say(n, [[h.name, '……무겁습니다.'], [s.name, '처음엔 다 그렇다. 사십 년쯤 쥐고 있으면 가벼워진다.']]);
  },
};

// ═════════════════════════ 2. 관문제자(關門弟子) — 마지막 제자 ═════════════════════════

const lastDisciple: JourneyEventDef = {
  key: 'elder_last_disciple',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.5,
  trigger: { age: [62, 80] },
  cond: (s) => hasRoom(s),
  build: (s) => {
    const kid = makePersonName(s.country);
    const how = rand([
      { k: 'beggar', text: `장터 거지 아이가 사흘째 도장 담 밑에서 잔다. 제자들이 쫓아내도 다시 온다. 오늘은 마당 구석에서 나뭇가지로 스승의 초식을 따라 하고 있었다. 한 동작도 틀리지 않았다.` },
      { k: 'orphan', text: `이웃 마을이 홍수에 쓸렸다. 진흙투성이 아이 하나가 도장 대문을 붙들고 서 있다. 부모를 잃었다고 했다.` },
      { k: 'stubborn', text: `「제자로 받아 주실 때까지 안 갑니다」 — 열 살쯤 된 아이가 눈 오는 마당에 무릎을 꿇고 하룻밤을 샜다.` },
    ]);
    return {
      title: '마지막 제자',
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: how.text,
      script: [N(how.text), P(kid, '……가르쳐 주세요.', '고개를 들며'), N('나이 예순을 넘겨 새 제자를 직접 키운다는 것은, 그 아이가 다 자라는 것을 못 볼 수도 있다는 뜻이다.')],
      options: [
        { id: 'take', label: '「네가 내 마지막 제자다」 — 관문제자로 받아 직접 키운다', hint: '어린 제자 입문 · 스승이 직접 가르친다' },
        { id: 'heir', label: '받아서 후계자·사범에게 맡긴다', hint: '평범한 입문' },
        { id: 'no', label: '「늦었다. 다른 도장으로 가거라」', hint: '노잣돈 10' },
      ],
      meta: { kid, k: how.k },
    };
  },
  resolve: (s, opt, c) => {
    const kid = String(c.data?.kid);
    if (opt === 'no') return say(addMoney(s, -10), [['나레이션', `노잣돈을 쥐여 보냈다. 아이는 몇 번이고 돌아보며 고개를 넘었다.`]]);
    const d = { ...createDiscipleEntity(s, { name: kid, isGenius: opt === 'take' ? chance(0.6) : chance(0.2), archetype: opt === 'take' ? '관문제자(마지막 제자)' : '거둔 아이' }), age: 11, joinedYear: s.year, loyalty: 95, temperamentKnown: true };
    let n: GameState = { ...s, disciples: [...s.disciples, d] };
    if (opt === 'take') {
      n = remember(n, 'last_disciple', d.id);
      n = remember(n, 'last_disciple_turn', String(s.turn));
      n = milestone(n, 'LAST_DISCIPLE', `${s.age}세에 ${josa(kid, '을를')} 관문제자로 거두었다`);
      return say(addRep(n, { virtue: 6 }), [['나레이션', `그날부터 새벽마다 늙은 스승과 어린 제자가 단둘이 마당에 섰다. 다른 제자들은 그 시간에는 마당에 나오지 않았다.`]]);
    }
    return say(addRep(n, { virtue: 4 }), [['나레이션', `${josa(kid, '은는')} 사범들 손에서 자라기 시작했다. 가끔 마루 쪽을 힐끔거렸다.`]]);
  },
};

const lastDiscipleTest: JourneyEventDef = {
  key: 'elder_last_disciple_test',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 2.5,
  cond: (s) => {
    const id = mem(s, 'last_disciple');
    return !!id && s.disciples.some((d) => d.id === id && !d.dead) && s.turn - memTurn(s, 'last_disciple_turn') >= 12;
  },
  build: (s) => {
    const d = s.disciples.find((x) => x.id === mem(s, 'last_disciple'))!;
    const yrs = Math.round((s.turn - memTurn(s, 'last_disciple_turn')) / 4);
    return {
      title: `${d.name}의 시험`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: `관문제자 ${josa(d.name, '을를')} 거둔 지 ${yrs}년. 이제 그 칼을 볼 때가 되었다.`,
      script: [N(`${yrs}년 전 담 밑에서 떨던 아이가 ${d.age}세가 되었다. 키가 스승의 어깨를 넘었다.`), H(s, '오늘은 내가 상대해 주마. 목검을 들어라.', mem(s, 'cane') === 'YES' ? '지팡이를 내려놓으며' : '소매를 걷으며')],
      options: [
        { id: 'fight', label: '직접 목검을 맞댄다', hint: '건강 -4 · 제자의 실력을 확인한다' },
        { id: 'watch', label: '고참 제자와 겨루게 하고 지켜본다', hint: '안전하게' },
      ],
      meta: { discId: d.id },
    };
  },
  resolve: (s, opt, c) => {
    const d = s.disciples.find((x) => x.id === c.data?.discId);
    if (!d || d.dead) return s;
    const power = (d.stats.str + d.stats.agi + d.stats.ins) / 3;
    const good = power >= 32 || d.isGenius;
    let n = remember(s, 'last_disciple_result', good ? 'BRILLIANT' : 'PLAIN');
    if (opt === 'fight') n = addHealth(n, -4);
    n = mapDisc(n, d.id, (x) => ({ ...x, loyalty: x.loyalty + 5, stats: { ...x.stats, ins: x.stats.ins + 3, str: x.stats.str + 2 } }));
    if (good)
      return say(milestone(n, 'LAST_DISCIPLE_BLOOM', `관문제자 ${josa(d.name, '이가')} 스승의 칼을 받아 냈다`), [
        ['나레이션', opt === 'fight' ? `세 합째, ${d.name}의 목검이 스승의 목검을 쳐 냈다. 마당이 얼어붙었다.` : `${josa(d.name, '은는')} 고참을 다섯 합 만에 몰아붙였다. 지켜보던 스승이 처음으로 소리 내어 웃었다.`],
        [s.name, '……됐다. 이제 눈을 감아도 되겠다.'],
      ]);
    return say(n, [
      ['나레이션', `${d.name}의 칼은 빠르지 않았다. 대신 한 번도 물러서지 않았다.`],
      [s.name, '재주는 없어도 된다. 그 다리만 있으면 된다.'],
    ]);
  },
};

// ═════════════════════════ 3. 남길 것 ═════════════════════════

const portrait: JourneyEventDef = {
  key: 'elder_portrait',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [60, 99], fame: [220, 99999] },
  build: (s) => ({
    title: '화공(畫工)이 찾아오다',
    category: 'LIFE',
    narration: `${byCountry(s, '도화서 출신', '강남 출신', '가노파 문하')}의 화공이 초상을 그리겠다며 찾아왔다.`,
    script: [N(`${byCountry(s, '도화서 출신', '강남 출신', '가노파 문하')}의 화공이 화구를 짊어지고 찾아왔다.`), P('화공', `【${s.sectName}】의 창시자 어른 모습을 남겨 두고 싶다는 문하의 청이 있었습니다. 어떤 모습으로 그려 드릴까요?`, '붓을 고르며')],
    options: [
      { id: 'sword', label: '칼을 뽑아 든 모습으로', hint: '명성 +10 · 살기 +3' },
      { id: 'tea', label: '마루에서 차를 마시는 모습으로', hint: '구도 +6' },
      { id: 'all', label: '제자들과 함께 마당에 선 모습으로', hint: '문하생 전원 충성 +4 · 인덕 +4' },
    ],
  }),
  resolve: (s, opt) => {
    const n = remember(s, 'portrait', opt.toUpperCase());
    if (opt === 'sword') return say(addRep(addFame(n, 10), { ruthless: 3 }), [['나레이션', '완성된 그림 속의 무인은 실제보다 스무 살은 젊어 보였다. 제자들은 그게 더 닮았다고 했다.']]);
    if (opt === 'tea') return say(addRep(n, { ascetic: 6 }), [['나레이션', '그림 속에서 찻김이 피어올랐다. 칼은 그림 구석 벽에 기대어 있었다.']]);
    const m = { ...addRep(n, { virtue: 4 }), disciples: n.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 4) })) };
    const cnt = aliveDisc(s).length;
    return say(m, [['나레이션', cnt >= 5 ? `그림에 들어갈 자리를 두고 제자들이 사흘을 다퉜다. 결국 모두 들어갔다. ${cnt}명.` : `제자 ${cnt}명이 스승 양옆에 섰다. 화공이 「한 분만 더 계시면 균형이 맞겠는데」 하자, 다들 마당의 빈자리를 보았다.`]]);
  },
};

const will: JourneyEventDef = {
  key: 'elder_will',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.5,
  trigger: { age: [72, 99] },
  build: (s) => {
    const h = heirOf(s);
    return {
      title: '유언장',
      category: 'LIFE',
      narration: '먹을 갈고 한지를 펼쳤다. 첫 줄이 쉽게 써지지 않는다.',
      script: [N('먹을 갈고 한지를 펼쳤다. 「遺言」 두 글자를 쓰고 나서 붓이 한참 멎었다.'), N(`남길 것은 도장, ${s.money}${cur(s)}의 재물, 비급 ${s.books.length}권, 그리고 칼 ${s.weapons.length}자루.`)],
      options: [
        { id: 'school', label: `${h ? `도장은 ${h.name}에게, ` : ''}재물은 고을 아이들 글방에`, hint: '인덕 +12 · 재물 -절반' },
        { id: 'dojo', label: '모든 것을 도장에 — 유파가 백 년을 가도록', hint: '명성 +8 · 상무 +6' },
        { id: 'books', label: '비급은 모두 공개해 누구나 배우게 하라', hint: '인덕 +8 · 구도 +8 · 유파의 이름이 멀리 간다' },
      ],
    };
  },
  resolve: (s, opt) => {
    let n = remember(s, 'will', opt.toUpperCase());
    n = milestone(n, 'WILL_WRITTEN', opt === 'school' ? '재물을 고을 아이들의 글방에 남긴다는 유언을 썼다' : opt === 'dojo' ? '모든 것을 도장에 남긴다는 유언을 썼다' : '유파의 비급을 세상에 공개하라는 유언을 썼다');
    if (opt === 'school') return say(addRep(addMoney(n, -Math.floor(s.money / 2)), { virtue: 12 }), [['나레이션', '유언장을 쓰자마자 절반을 미리 보냈다. 「죽은 뒤에 주면 생색이 안 난다」고 웃었다.']]);
    if (opt === 'dojo') return say(addRep(addFame(n, 8), { commerce: 6 }), [['나레이션', '유언장은 사당 궤짝에 넣고 자물쇠를 채웠다. 열쇠는 후계자에게.']]);
    return say(addRep(n, { virtue: 8, ascetic: 8 }), [['나레이션', '문하의 고참들이 펄쩍 뛰었다. 「유파의 비전을 남에게 주다니요!」 스승은 「칼은 쥐는 사람 몫이다」라고만 했다.']]);
  },
};

const EPITAPHS = {
  sword: (s: GameState) => `「여기, 한 자루 칼로 일생을 산 사람이 눕다 — 【${s.sectName}】 ${s.name}」`,
  people: (s: GameState) => `「칼보다 사람을 많이 남긴 이, 【${s.sectName}】 ${s.name}」`,
  none: () => '「이름 없는 도장의 칼잡이」',
};

const epitaph: JourneyEventDef = {
  key: 'elder_epitaph',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 1.5,
  trigger: { age: [75, 99] },
  build: (s) => ({
    title: '스스로 짓는 묘비명',
    category: 'LIFE',
    narration: '제자들이 비석 자리를 보고 왔다며 묘비명을 여쭙는다.',
    script: [P(heirOf(s)?.name || '고참 제자', '송구하오나…… 비석에 무엇을 새기면 좋을지, 미리 여쭙고 싶습니다.', '바닥만 보며'), H(s, '허허, 내 비석 글을 내가 짓는구나.', '웃으며 붓을 든다')],
    options: [
      { id: 'sword', label: EPITAPHS.sword(s), hint: '살기·명성' },
      { id: 'people', label: EPITAPHS.people(s), hint: '인덕' },
      { id: 'none', label: EPITAPHS.none(), hint: '구도 — 처음 그 도장의 이름으로' },
    ],
  }),
  resolve: (s, opt) => {
    const text = opt === 'sword' ? EPITAPHS.sword(s) : opt === 'people' ? EPITAPHS.people(s) : EPITAPHS.none();
    let n = remember(s, 'epitaph', text);
    n = milestone(n, 'EPITAPH', `스스로 묘비명을 지었다 — ${text}`);
    if (opt === 'sword') n = addFame(addRep(n, { ruthless: 3 }), 6);
    else if (opt === 'people') n = addRep(n, { virtue: 8 });
    else n = addRep(n, { ascetic: 10 });
    return say(n, [['나레이션', `붓을 내려놓았다. ${text} 제자가 그 종이를 두 손으로 받아 품에 넣었다.`]]);
  },
};

// ═════════════════════════ 4. 고을의 어른 ═════════════════════════

const DISPUTES = [
  { k: 'water', title: '논물 싸움', text: '가뭄에 윗마을과 아랫마을이 논물을 두고 낫을 들었다. 양쪽 다 「도장 어른 말씀이면 따르겠다」고 한다.', fair: '물꼬를 하루씩 번갈아 트라고 정했다.', bold: '윗마을 보를 직접 허물어 물길을 나눴다.' },
  { k: 'stone', title: '경계석', text: '두 집안이 밭 경계석이 한 뼘 옮겨졌다며 삼대째 원수가 되기 직전이다.', fair: '옛 지적도를 관아에서 떼어 와 경계석을 제자리에 박았다.', bold: '경계석을 뽑아 버리고 그 한 뼘에 두 집이 같이 콩을 심으라 했다.' },
  { k: 'marriage', title: '깨진 혼사', text: '약혼한 두 집안이 예단 문제로 파혼하겠다며 서로 멱살을 잡았다. 정작 신랑 신부는 울고 있다.', fair: '양가 어른을 불러 예단을 반씩 줄이게 했다.', bold: '「혼인은 아이들 일이다」 하고 신랑 신부 손을 잡혀 앞세웠다.' },
  { k: 'inherit', title: '형제의 유산 다툼', text: '돌아가신 부친의 논 다섯 마지기를 두고 형제가 관아에 고발장을 냈다. 고을이 둘로 갈렸다.', fair: '부친의 장부를 펴 놓고 누가 얼마나 일했는지 하나하나 따져 나눴다.', bold: '형제를 마당에 마주 세우고 「너희 아비가 이걸 보면 뭐라 하겠느냐」 한마디만 했다.' },
  { k: 'market', title: '장터 자릿다툼', text: '장날마다 좋은 자리를 두고 떡장수와 엿장수가 싸운다. 오늘은 함지박이 날아다녔다.', fair: '제비를 뽑아 장날마다 자리를 돌게 했다.', bold: '두 사람 자리를 붙여 놓고 떡에 엿을 발라 팔게 했다.' },
];

const mediator: JourneyEventDef = {
  key: 'elder_mediator',
  kind: 'HOME',
  elder: true,
  cooldown: 10,
  trigger: { age: [58, 99] },
  cond: (s) => (s.reputation.virtue >= 10 || s.fame >= 150) && DISPUTES.some((d) => !usedList(s, 'disputes').includes(d.k)),
  build: (s) => {
    const d = rand(DISPUTES.filter((x) => !usedList(s, 'disputes').includes(x.k)));
    const p = clampP(0.4 + s.stats.ins * 0.004 + s.reputation.virtue * 0.003);
    return {
      title: `어른의 판결 — ${d.title}`,
      category: 'LIFE',
      narration: d.text,
      script: [N(d.text), P('고을 사람', '도장 어른, 한 말씀만 해 주십시오. 관아에 가면 둘 다 거덜 납니다.', '갓을 벗어 들고')],
      options: [
        { id: 'fair', label: '하나하나 따져 공평하게 가른다', hint: `잘 풀릴 가능성 ${pct(p)} · 인덕` },
        { id: 'bold', label: '단칼에 정한다', hint: `잘 풀릴 가능성 ${pct(p - 0.1)} · 명성` },
        { id: 'refuse', label: '「칼잡이가 낄 일이 아니다」', hint: '아무 일도 없다' },
      ],
      meta: { k: d.k, p },
    };
  },
  resolve: (s, opt, c) => {
    const d = DISPUTES.find((x) => x.k === c.data?.k);
    if (!d) return s;
    let n = pushUsed(s, 'disputes', d.k);
    if (opt === 'refuse') return say(n, [['나레이션', '두 사람은 결국 관아로 갔다. 소송은 삼 년을 끌었다고 한다.']]);
    const ok = chance(clampP(Number(c.data?.p) - (opt === 'bold' ? 0.1 : 0)));
    n = remember(n, 'village_elder', String((Number(mem(n, 'village_elder')) || 0) + (ok ? 1 : 0)));
    if (ok) {
      n = opt === 'fair' ? addFame(addRep(n, { virtue: 8 }), 6) : addFame(addRep(n, { virtue: 4 }), 12);
      return say(n, [['나레이션', `${opt === 'fair' ? d.fair : d.bold} 양쪽이 머리를 숙였다. 그 뒤로 고을에서 다툼이 나면 「도장 어른께 가 보자」는 말이 먼저 나왔다.`]]);
    }
    n = addFame(n, -6);
    return say(n, [['나레이션', `${opt === 'fair' ? d.fair : d.bold} 그런데 한쪽이 끝내 승복하지 않았다. 「칼잡이가 뭘 안다고」 소리가 담 너머로 들려왔다.`]]);
  },
};

const magistrateAsk: JourneyEventDef = {
  key: 'elder_magistrate',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [60, 99], fame: [180, 99999] },
  build: (s) => ({
    title: `${magistrate(s)}의 부탁`,
    category: 'HISTORICAL',
    narration: `${josa(magistrate(s), '이가')} 아전을 보내 정중히 청을 넣었다.`,
    script: [P('아전', `${magistrate(s)} 나리께서 고을 ${byCountry(s, '포졸', '아역(衙役)', '아시가루')}들의 무예가 형편없다며, 어른께서 한 철만 가르쳐 주십사 하십니다. 녹봉도 넉넉히 드린다 하옵고요.`, '허리를 굽히며')],
    options: [
      { id: 'teach', label: '한 철 동안 관아 마당에 나간다', hint: `재화 +90 · 명성 +12 · 건강 -4` },
      { id: 'send', label: '제자를 대신 보낸다', hint: '재화 +50 · 제자 경험' },
      { id: 'no', label: '「관아의 칼과 도장의 칼은 다르다」', hint: '구도 +5' },
    ],
  }),
  resolve: (s, opt) => {
    if (opt === 'teach') return say(addHealth(addFame(addMoney(s, 90), 12), -4), [['나레이션', `첫날 ${byCountry(s, '포졸', '아역', '아시가루')}들은 늙은이라고 비웃었다. 사흘째부터 아무도 웃지 않았다. (재화 +90, 명성 +12)`]]);
    if (opt === 'send') {
      const d = aliveDisc(s)[0];
      const n = d ? mapDisc(addMoney(s, 50), d.id, (x) => ({ ...x, stats: { ...x.stats, wil: x.stats.wil + 2 } })) : addMoney(s, 50);
      return say(n, [['나레이션', `${d ? josa(d.name, '이가') : '제자가'} 관아로 나갔다. 돌아온 날 「사람 가르치는 게 칼 휘두르는 것보다 어렵다」고 투덜댔다.`]]);
    }
    return say(addRep(s, { ascetic: 5 }), [['나레이션', '아전이 난감한 얼굴로 돌아갔다.']]);
  },
};

// 옛날이야기 — 실제로 겪은 일을 아이들에게 (되풀이: 매번 다른 생애의 한 장면)
const STORY_KEYS = /TOURNAMENT_WIN|GRANDMASTER_WIN|FIRST_DISCIPLE|MARRIED|TRANSCENDENCE|ECHO_|HEIR_NAMED|FIRST_CRAFT|SECT_NAMED|DISCIPLE_DIED|HEIRLOOM|GRUDGE|REAL_DUEL|REBELLION|MAGIC_PUBLIC|LAST_DISCIPLE|HWANGAP/;
const storyTime: JourneyEventDef = {
  key: 'elder_story',
  kind: 'HOME',
  elder: true,
  cooldown: 10,
  trigger: { age: [60, 99] },
  cond: (s) => (s.milestones || []).some((m) => STORY_KEYS.test(m.key) && s.year - m.year >= 10 && !usedList(s, 'told').includes(`${m.key}${m.year}`)),
  build: (s) => {
    const cands = (s.milestones || []).filter((m) => STORY_KEYS.test(m.key) && s.year - m.year >= 10 && !usedList(s, 'told').includes(`${m.key}${m.year}`));
    const m = rand(cands);
    const g = mem(s, 'grandchild');
    const who = g && s.turn - memTurn(s, 'grandchild_turn') >= 16 ? `손주 ${josa(g, '과와')} 동네 아이들` : '동네 아이들';
    return {
      title: `옛날이야기 — ${m.year}년의 일`,
      category: 'FAMILY',
      narration: `${josa(who, '이가')} 마루 끝에 쪼르르 앉아 이야기를 조른다.`,
      script: [
        P('아이들', '할아버지, 옛날이야기! 칼 이야기!', '무릎에 매달리며'),
        N(`${m.year}년, ${m.age}세. ${m.text}. 벌써 ${s.year - m.year}년 전 일이다.`),
      ],
      options: [
        { id: 'true', label: '있었던 그대로 들려준다', hint: '구도 +3 · 통찰 +1' },
        { id: 'grand', label: '조금 부풀려 들려준다', hint: '명성 +5 · 아이들이 소문을 낸다' },
        { id: 'lesson', label: '이야기 끝에 교훈 한 줄을 붙인다', hint: '인덕 +4' },
      ],
      meta: { told: `${m.key}${m.year}`, text: m.text, year: m.year },
    };
  },
  resolve: (s, opt, c) => {
    const n = pushUsed(s, 'told', String(c.data?.told));
    const text = String(c.data?.text || '');
    if (opt === 'grand') return say(addFame(n, 5), [['나레이션', `이야기 속에서 칼은 세 배 길어지고 적은 열 배 많아졌다. 다음 날 장터 아이들이 그 이야기를 저희끼리 흉내 냈다.`]]);
    if (opt === 'lesson') return say(addRep(n, { virtue: 4 }), [['나레이션', `「…그래서 말이다, ${text.includes('잃') ? '사람은 있을 때 잘해야 하는 게다' : text.includes('우승') || text.includes('꺾') ? '이긴 날일수록 고개를 숙여야 하는 게다' : '무엇이든 끝까지 해 봐야 아는 게다'}.」 아이들은 하품을 했다.`]]);
    return say(addStats(addRep(n, { ascetic: 3 }), { ins: 1 }), [['나레이션', `있었던 그대로 이야기했다. 이야기하다 보니 그날의 냄새까지 떠올랐다. 그때는 몰랐던 것이 이제야 보였다.`]]);
  },
};

// 전설을 베러 온 젊은이 (되풀이: 매번 다른 사람)
const CHALLENGERS = [
  { k: 'prodigy', who: '열일곱 살 천재', line: '노선배의 칼이 정말 전설만 한지, 제 눈으로 봐야겠습니다.', age: 17 },
  { k: 'ronin', who: '떠돌이 낭인', line: '늙은 전설 하나 꺾으면 내 이름값이 오르겠지. 나와라, 영감.', age: 33 },
  { k: 'fallen', who: '몰락한 무가의 자제', line: '제 할아버지가 젊은 날 어르신께 졌다고 들었습니다. 집안의 빚을 갚으러 왔습니다.', age: 24 },
  { k: 'woman', who: '남장한 여검객', line: '천하 고수라는 분이 여인의 칼은 받지 않으시렵니까?', age: 22 },
  { k: 'foreign', who: '바다 건너온 검객', line: '이 나라에서 가장 오래 산 칼을 찾아왔소. 한 수 청하오.', age: 30 },
];
const youngChallenger: JourneyEventDef = {
  key: 'elder_young_challenger',
  kind: 'HOME',
  elder: true,
  cooldown: 12,
  trigger: { age: [62, 99], fame: [120, 99999] },
  cond: (s) => CHALLENGERS.some((c) => !usedList(s, 'challengers').includes(c.k)),
  build: (s) => {
    const ch = rand(CHALLENGERS.filter((c) => !usedList(s, 'challengers').includes(c.k)));
    const name = makePersonName(s.country);
    const h = heirOf(s);
    const words = clampP(0.25 + s.stats.wil * 0.004 + s.stats.ins * 0.003);
    return {
      title: `전설을 베러 온 ${ch.who}`,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: `${ch.who} ${josa(name, '이가')} 대문 앞에서 이름을 외친다.`,
      script: [P(name, ch.line, '칼자루에 손을 얹으며'), N(`${s.age}세의 몸이다. 무릎이 먼저 대답한다.`)],
      options: [
        { id: 'fight', label: mem(s, 'cane') === 'YES' ? '지팡이를 내려놓고 목검을 든다' : '천천히 일어나 목검을 든다', hint: '비무 · 늙은 몸으로' },
        { id: 'words', label: '마루에 앉은 채 한마디로 기를 꺾는다', hint: `정신·통찰 시험 ${pct(words)}` },
        ...(h && !h.isChild ? [{ id: 'heir', label: `「내 칼은 ${h.name}에게 있다」 — 후계자를 내보낸다`, hint: '후계자가 자란다' }] : []),
      ],
      meta: { k: ch.k, name, age: ch.age, words },
    };
  },
  resolve: (s, opt, c) => {
    const name = String(c.data?.name);
    let n = pushUsed(s, 'challengers', String(c.data?.k));
    if (opt === 'fight')
      return journeyBattle(n, c, opt, {
        title: `노검객의 일합 — ${name}`,
        subtitle: '젊은 칼과 늙은 칼',
        name,
        enemyTitle: '전설을 베러 온 자',
        age: Number(c.data?.age) || 25,
        ai: rand(['RUSHDOWN', 'AGGRESSIVE', 'DUELIST'] as const),
        scale: roadScale(s, 0.8),
        weapon: 'BLADE',
        skills: byCountry(s, ['sk_kr_06', 'sk_kr_02', 'sk_kr_01'], ['sk_cn_05', 'sk_cn_03', 'sk_cn_02'], ['sk_jp_01', 'sk_jp_03', 'sk_jp_06']),
        rewardFame: 15,
      });
    if (opt === 'words') {
      const ok = chance(Number(c.data?.words) || 0.4);
      if (ok) return say(addFame(addStats(n, { wil: 1 }), 10), [[s.name, `자네 왼발이 반 치 들려 있네. 그 발로 오늘 몇 번이나 물러설 생각인가.`], ['나레이션', `${josa(name, '은는')} 제 발을 내려다보고, 한참 있다가 칼을 거두었다. (명성 +10)`]]);
      return say(addFame(n, -8), [['나레이션', `${josa(name, '은는')} 코웃음을 쳤다. 「말로 싸우는 걸 보니 칼은 녹슬었군.」 그 말이 장터까지 퍼졌다. (명성 -8)`]]);
    }
    const h = heirOf(n);
    if (!h) return n;
    const won = chance(clampP(0.35 + heirPower(n) * 0.008));
    n = mapDisc(n, h.id, (d) => ({ ...d, stats: { ...d.stats, ins: d.stats.ins + 2, str: d.stats.str + 1 }, loyalty: d.loyalty + 3 }));
    return say(addFame(n, won ? 12 : -6), [['나레이션', won ? `${josa(h.name, '이가')} 칼을 받아 냈다. ${josa(name, '은는')} 「스승도 아니고 제자에게……」 하며 돌아갔다.` : `${josa(h.name, '이가')} 밀렸다. ${josa(name, '은는')} 「다음엔 원로가 직접 나오시오」 하고 갔다.`]]);
  },
  onBattle: (s, _opt, won, c) => {
    const name = String(c.data?.name);
    let n = s;
    let extra = '';
    if (won && hasRoom(n) && chance(0.4)) {
      const d = { ...createDiscipleEntity(n, { name, archetype: '전설에 도전했던 젊은이' }), age: Number(c.data?.age) || 22, joinedYear: n.year, loyalty: 80 };
      n = { ...n, disciples: [...n.disciples, d] };
      extra = ` 사흘 뒤, ${josa(name, '이가')} 짐을 싸 들고 다시 찾아왔다. 「제자로 받아 주십시오.」`;
    }
    return say(won ? addHealth(n, -4) : addHealth(addFame(n, -8), -8), [['나레이션', won ? `젊은 칼은 빨랐다. 늙은 칼은 그보다 반 박자 먼저 그 자리에 가 있었다.${extra}` : '숨이 먼저 찼다. 칼끝이 목에 닿았을 때, 젊은이는 고개를 숙여 예를 갖췄다. 그게 더 아팠다.']]);
  },
};

// 노고수들의 찻자리 — 같은 시대를 산 사람들 (되풀이: 매번 다른 이야기)
const TEA_TOPICS = [
  { k: 'youth', title: '노고수들의 찻자리 — 그때 그 승부', label: '젊은 날의 승부를 이야기한다', line: '서로 「그때 내가 봐줬다」고 우기다가 다 같이 웃었다.', stat: { ins: 2 } },
  { k: 'kids', title: '노고수들의 찻자리 — 요즘 젊은 것들', label: '요즘 젊은 것들 이야기를 한다', line: '「요즘 애들은 허리가 약해」 — 오백 년 전에도 했을 말을 하며 찻잔을 비웠다.', stat: { wil: 1 } },
  { k: 'death', title: '노고수들의 찻자리 — 누가 먼저 가나', label: '누가 먼저 갈지 이야기한다', line: '제일 젊은 축이 「제가 마지막에 남아 다 묻어 드리지요」 해서 한 대씩 맞았다.', stat: { wil: 2 } },
  { k: 'secret', title: '노고수들의 찻자리 — 숨겨 둔 한 수', label: '평생 숨겨 온 초식 하나씩을 털어놓는다', line: '다들 반만 털어놓았다. 그래도 남은 반이 무엇인지는 서로 알 것 같았다.', stat: { ins: 3 } },
];
const elderTea: JourneyEventDef = {
  key: 'elder_tea',
  kind: 'HOME',
  elder: true,
  cooldown: 12,
  trigger: { age: [62, 99] },
  cond: (s) => TEA_TOPICS.some((t) => !usedList(s, 'tea').includes(t.k)) && (s.tourneyRoster || []).some((f) => f.kind === 'NPC' && s.year - f.bornYear >= 55 && !(mem(s, 'deceased') || '').includes(f.id)),
  build: (s) => {
    const peers = (s.tourneyRoster || []).filter((f) => f.kind === 'NPC' && s.year - f.bornYear >= 55 && !(mem(s, 'deceased') || '').includes(f.id)).slice(0, 3);
    const names = peers.map((f) => `${f.sect}의 ${f.name}`);
    const topics = TEA_TOPICS.filter((t) => !usedList(s, 'tea').includes(t.k));
    // 그날 자리의 화제는 하나 — 고른 이야기 한 갈래로 간다
    const topic = rand(topics);
    return {
      title: topic.title,
      category: 'LIFE',
      narration: `${nameList(names)}…… 같은 시대를 칼로 산 노인들이 찻자리에 모였다.`,
      script: [N(`${nameList(names)}. 젊은 날 서로를 베겠다고 이를 갈던 이들이 이제 한 상에 둘러앉아 찻잔을 든다.`), P(peers[0]?.name || '노고수', '이제 우리 칼 소리보다 무릎 소리가 더 크구먼.', '허리를 두드리며')],
      options: [
        { id: topic.k, label: topic.label },
        { id: 'listen', label: '말없이 듣기만 한다', hint: '통찰 +1' },
      ],
      meta: { k: topic.k },
    };
  },
  resolve: (s, opt, c) => {
    const t = TEA_TOPICS.find((x) => x.k === c.data?.k);
    if (!t) return s;
    if (opt === 'listen') return say(addStats(pushUsed(s, 'tea', t.k), { ins: 1 }), [['나레이션', '노인들 이야기를 들으며 찻잔만 비웠다. 다들 같은 시대를 산 사람이라, 들어 보니 다 내 이야기였다.']]);
    return say(addHealth(addStats(pushUsed(s, 'tea', t.k), t.stat), 3), [['나레이션', t.line]]);
  },
};

// 길 건너 새 도장 — 젊은 경쟁자, 몇 해 뒤 그 결말
const youngDojo: JourneyEventDef = {
  key: 'elder_young_dojo',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [58, 90] },
  build: (s) => {
    const master = makePersonName(s.country);
    return {
      title: '길 건너의 새 도장',
      category: 'LIFE',
      narration: `길 건너에 번쩍이는 새 도장이 섰다. 젊은 관장 ${josa(master, '은는')} 「석 달 만에 고수를 만들어 드립니다」를 내걸었다.`,
      script: [N(`길 건너에 새 도장이 섰다. 현판이 우리 것보다 두 배는 크다. 「석 달 만에 고수를 만들어 드립니다」.`), P('문하생', '스승님, 신입 둘이 저쪽으로 옮겼습니다. 저쪽은 첫날부터 진검을 쥐여 준답니다!', '분해하며')],
      options: [
        { id: 'visit', label: '떡을 들고 찾아가 덕담을 건넨다', hint: '인덕 · 그 관장과 인연이 된다' },
        { id: 'ignore', label: '「석 달짜리 칼은 석 달이면 부러진다」', hint: '구도 · 지켜본다' },
        { id: 'compete', label: '우리도 월사금을 내리고 시범을 늘린다', hint: '재화 -40 · 명성 +8' },
      ],
      meta: { master },
    };
  },
  resolve: (s, opt, c) => {
    let n = remember(remember(s, 'young_dojo', String(c.data?.master)), 'young_dojo_turn', String(s.turn));
    n = remember(n, 'young_dojo_way', opt.toUpperCase());
    if (opt === 'visit') return say(addRep(n, { virtue: 6 }), [['나레이션', `젊은 관장은 떡 보따리를 받고 어쩔 줄 몰라 했다. 「선배님이 이렇게……」 꾸벅 절하는 목덜미가 아직 어렸다.`]]);
    if (opt === 'compete') return say(addFame(addMoney(n, -40), 8), [['나레이션', '마당에서 매일 시범을 보였다. 떠났던 신입 하나가 돌아왔다.']]);
    return say(addRep(n, { ascetic: 5 }), [['나레이션', '길 건너에서 들려오는 기합 소리를 들으며 차를 마셨다.']]);
  },
};
const youngDojoLater: JourneyEventDef = {
  key: 'elder_young_dojo_later',
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 2.5,
  cond: (s) => !!mem(s, 'young_dojo') && s.turn - memTurn(s, 'young_dojo_turn') >= 10,
  build: (s) => {
    const master = mem(s, 'young_dojo')!;
    const visited = mem(s, 'young_dojo_way') === 'VISIT';
    return {
      title: visited ? `${master}의 고백` : '닫힌 길 건너 대문',
      category: 'LIFE',
      narration: visited ? `길 건너 도장의 ${josa(master, '이가')} 술병을 들고 찾아왔다.` : `길 건너 도장이 문을 닫았다. 진검 수련 중에 제자가 크게 다쳤다고 한다.`,
      script: visited
        ? [P(master, '선배님…… 석 달 만에 고수를 만든다는 건 거짓말이었습니다. 제자 하나가 진검에 손목을 잃었습니다. 어떻게 해야 합니까.', '고개를 떨군 채')]
        : [N('길 건너 대문에 「휴관」 두 글자가 붙었다. 진검 수련 중에 제자 하나가 손목을 잃었다는 소문이다.'), P('문하생', '그쪽 제자들이 갈 데가 없다고 합니다……', '조심스럽게')],
      options: [
        { id: 'take', label: '그쪽 제자들을 받아 준다', hint: '인덕 · 문하생이 늘 수 있다' },
        { id: 'teach', label: visited ? '「처음부터 다시 하게. 내가 봐 주지」' : '젊은 관장을 불러 처음부터 다시 가르친다', hint: '명성·인덕' },
      ],
      meta: { master },
    };
  },
  resolve: (s, opt, c) => {
    const master = String(c.data?.master);
    if (opt === 'take') {
      let n = addRep(s, { virtue: 8 });
      let extra = '';
      if (hasRoom(n)) {
        const d = { ...createDiscipleEntity(n, { archetype: '길 건너 도장에서 온 제자' }), joinedYear: n.year };
        n = { ...n, disciples: [...n.disciples, d] };
        extra = ` 그중 ${josa(d.name, '이가')} 우리 문하에 남았다.`;
      }
      return say(n, [['나레이션', `갈 곳 없는 제자들에게 마당을 열었다.${extra}`]]);
    }
    return say(milestone(addFame(addRep(s, { virtue: 6 }), 10), 'MENTORED_RIVAL', `길 건너 도장의 젊은 관장 ${josa(master, '을를')} 다시 가르쳤다`), [['나레이션', `${josa(master, '은는')} 석 달 동안 아침마다 길을 건너와 목검을 잡았다. 그 도장은 이듬해 다시 문을 열었다. 현판이 작아져 있었다.`]]);
  },
};

// 마지막 유람
const lastTrip: JourneyEventDef = {
  key: 'elder_last_trip',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [68, 90], health: [45, 100] },
  build: (s) => ({
    title: '마지막 유람',
    category: 'LIFE',
    narration: '몸이 허락할 때 한 번 더 길을 나서고 싶다.',
    script: [N(`${s.flags.journeyCount ? `젊은 날 ${s.flags.journeyCount}번 무사수행을 떠났다.` : '평생 도장 밖으로 멀리 나가 본 적이 없다.'} 이번이 마지막 길이 될 것이다.`)],
    options: [
      { id: 'first', label: s.flags.journeyCount ? '첫 무사수행 길을 다시 걷는다' : '젊을 때 가 보고 싶던 명산에 오른다', hint: '통찰 +3 · 건강 -6' },
      { id: 'home', label: '태어난 고향 마을에 다녀온다', hint: '정신 +3 · 건강 +2' },
      { id: 'sea', label: '바다를 보러 간다', hint: '영력 +3 · 건강 -3' },
    ],
  }),
  resolve: (s, opt) => {
    let n = remember(s, 'last_trip', opt.toUpperCase());
    n = milestone(n, 'LAST_TRIP', opt === 'first' ? '마지막으로 젊은 날의 길을 다시 걸었다' : opt === 'home' ? '마지막으로 고향 마을에 다녀왔다' : '마지막으로 바다를 보고 왔다');
    if (opt === 'first') return say(addHealth(addStats(n, { ins: 3 }), -6), [['나레이션', '그 주막은 없어졌고, 그 다리는 새로 놓였다. 그래도 고갯마루에서 보는 하늘은 똑같았다.']]);
    if (opt === 'home') return say(addHealth(addStats(n, { wil: 3 }), 2), [['나레이션', '아무도 알아보지 못했다. 동구 밖 느티나무만 그대로였다. 그 아래서 한참 앉았다 왔다.']]);
    return say(addHealth(addStats(n, { qi: 3 }), -3), [['나레이션', '평생 칼끝만 보던 눈으로 수평선을 보았다. 끝이 없는 것도 있구나 싶었다.']]);
  },
};

// ═════════════════════════ 5. 저물어 가는 칼의 시대 ═════════════════════════

const eraGuns: JourneyEventDef = {
  key: 'elder_era_guns',
  kind: 'HOME',
  elder: true,
  once: true,
  trigger: { age: [64, 99] },
  build: (s) => ({
    title: '총을 멘 젊은이',
    category: 'HISTORICAL',
    narration: `${byCountry(s, '포수', '향용(鄕勇)', '철포대 아시가루')} 차림의 젊은이가 장터에서 화승총을 자랑한다.`,
    script: [
      N(`장터 한가운데서 ${byCountry(s, '포수', '향용', '철포대')} 차림의 젊은이가 화승총을 들어 보인다. 백 보 밖 박이 산산조각 났다.`),
      P('젊은 포수', `칼 같은 건 이제 옛날 물건이지요. 십 년 배운 칼보다 사흘 배운 총이 빠르니까.`, '어깨를 으쓱이며'),
      N('뒤따라온 제자들이 스승의 얼굴을 살핀다.'),
    ],
    options: [
      { id: 'agree', label: '「맞는 말이다」 — 순순히 인정한다', hint: '구도 +8 · 제자들이 생각에 잠긴다' },
      { id: 'answer', label: '「총은 사람을 죽이지만, 칼은 사람을 만든다」', hint: '문하생 전원 충성 +3 · 명성 +4' },
      { id: 'learn', label: '총을 직접 쏘아 본다', hint: '통찰 +2 · 시대를 안다' },
    ],
  }),
  resolve: (s, opt) => {
    const n = remember(s, 'era_guns', opt.toUpperCase());
    if (opt === 'agree') return say(addRep(n, { ascetic: 8 }), [['나레이션', '돌아오는 길에 제자 하나가 물었다. 「그럼 저희는 왜 칼을 배웁니까?」 스승은 한참 걷다가 「그걸 찾으려고」라고 답했다.']]);
    if (opt === 'answer') return say(addFame({ ...n, disciples: n.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 3) })) }, 4), [['나레이션', '젊은 포수가 대꾸를 못 했다. 제자들이 그 말을 마당 기둥에 새겼다.']]);
    return say(addStats(n, { ins: 2 }), [['나레이션', '귀가 멍하고 어깨가 얼얼했다. 칼끝이 닿지 않는 거리에서 사람이 쓰러지는 시대. 그걸 알고 나니 오히려 마음이 가라앉았다.']]);
  },
};

interface EraDef {
  key: string;
  country: GameState['country'];
  years: [number, number];
  title: string;
  narration: string;
  lines: Array<[string, string]>;
  options: Array<{ id: string; label: string; hint?: string }>;
  outcome: (s: GameState, opt: string) => GameState;
}

const ERA_DEFS: EraDef[] = [
  {
    key: 'elder_era_kr_1791',
    country: 'KOREA',
    years: [1791, 1794],
    title: '서학(西學) 책을 숨긴 제자',
    narration: '진산의 선비가 신주를 불살랐다는 사건 이후, 천주학을 믿는 자를 잡아들이라는 영이 내렸다.',
    lines: [
      ['나레이션', '진산 사건 이후 천주학쟁이를 잡아들인다는 소문이 흉흉하다. 그런데 오늘 아침, 제자의 이불 밑에서 한문으로 된 서학 책이 나왔다.'],
      ['문하생', '스승님…… 저는 그저 그 책에 사람은 모두 귀하다는 말이 있어서……'],
    ],
    options: [
      { id: 'hide', label: '책을 아궁이에 넣고 아무 일 없던 것으로 한다', hint: '제자를 지킨다 · 인덕 +6' },
      { id: 'protect', label: '「믿음은 네 것이다. 대신 마당 밖에서는 입을 닫아라」', hint: '인덕 +10 · 위험을 안는다' },
      { id: 'report', label: '관아에 고하기 전에 스스로 내보낸다', hint: '도장을 지킨다 · 살기 +4' },
    ],
    outcome: (s, opt) =>
      opt === 'report'
        ? say(addRep(s, { ruthless: 4, commerce: 2 }), [['나레이션', '제자는 울면서 떠났다. 그해 겨울, 그 고을에서 몇 사람이 잡혀갔다는 소식이 들렸다.']])
        : opt === 'protect'
        ? say(addRep(s, { virtue: 10 }), [['나레이션', '제자는 그 뒤로 누구보다 먼저 일어나 마당을 쓸었다. 관아의 포졸이 몇 번 도장 앞을 기웃거리다 갔다.']])
        : say(addRep(s, { virtue: 6 }), [['나레이션', '책은 재가 되었다. 제자는 그날 밤 아궁이 앞에서 오래 앉아 있었다.']]),
  },
  {
    key: 'elder_era_kr_1795',
    country: 'KOREA',
    years: [1795, 1797],
    title: '화성 행차의 무예 시범',
    narration: '임금께서 화성으로 행차하시며 장용영의 무예 시범을 보신다 한다. 원로 무인들도 불렀다.',
    lines: [
      ['나레이션', '임금께서 화성에 행차하시어 장용영 군사들의 무예를 보신다 한다. 민간의 원로 무인 몇을 함께 부른다는 전갈이 왔다.'],
      ['장용영 초관', '어른의 칼은 『무예도보통지』에 없는 칼이라 들었습니다. 전하께 보여 드리시겠습니까?'],
    ],
    options: [
      { id: 'go', label: '늙은 몸을 이끌고 화성까지 간다', hint: '명성 +30 · 건강 -8' },
      { id: 'disciple', label: '수제자를 대신 보낸다', hint: '명성 +12 · 제자가 자란다' },
      { id: 'no', label: '「민간의 칼은 민간에 있어야 한다」', hint: '구도 +6' },
    ],
    outcome: (s, opt) => {
      if (opt === 'go') return say(milestone(addHealth(addFame(s, 30), -8), 'ROYAL_DEMO', '화성 행차 때 임금 앞에서 무예를 시연했다'), [['나레이션', '시연이 끝나자 용상 쪽에서 한 마디가 내려왔다고 한다. 무슨 말이었는지는 끝내 아무에게도 말하지 않았다. (명성 +30)']]);
      if (opt === 'disciple') {
        const d = aliveDisc(s)[0];
        const n = d ? mapDisc(s, d.id, (x) => ({ ...x, stats: { ...x.stats, wil: x.stats.wil + 3 }, loyalty: x.loyalty + 6 })) : s;
        return say(addFame(n, 12), [['나레이션', `${d ? josa(d.name, '이가') : '제자가'} 상기된 얼굴로 돌아와 사흘 밤낮을 그날 이야기만 했다.`]]);
      }
      return say(addRep(s, { ascetic: 6 }), [['나레이션', '전갈을 가져온 군관이 고개를 갸웃하며 돌아갔다.']]);
    },
  },
  {
    key: 'elder_era_kr_1800',
    country: 'KOREA',
    years: [1800, 1801],
    title: '국상(國喪)',
    narration: '임금께서 승하하셨다. 온 나라가 흰 옷을 입었다.',
    lines: [
      ['나레이션', '여름, 임금께서 승하하셨다는 소식이 왔다. 장터의 풍악이 멎고 온 고을이 흰 옷을 입었다.'],
      ['나레이션', '국상 중에는 잔치도, 큰 소리도 삼가야 한다. 마당의 기합 소리를 어찌할지 제자들이 묻는다.'],
    ],
    options: [
      { id: 'silent', label: '석 달 동안 소리 없이 수련한다', hint: '구도 +6 · 통찰 +2' },
      { id: 'as', label: '「칼은 쉬지 않는다」 평소대로 한다', hint: '숙련↑ · 고을의 눈총' },
    ],
    outcome: (s, opt) =>
      opt === 'silent'
        ? say(addStats(addRep(s, { ascetic: 6 }), { ins: 2 }), [['나레이션', '기합 없는 수련은 이상하게 더 고됐다. 발소리, 숨소리, 칼이 공기를 가르는 소리만 마당에 남았다.']])
        : say(addFame(trainEquipped(s, 60), -6), [['나레이션', '담 너머로 「국상 중에 저 무슨 짓이냐」는 소리가 들렸다.']]),
  },
  {
    key: 'elder_era_cn_1793',
    country: 'CHINA',
    years: [1793, 1795],
    title: '붉은 머리 오랑캐의 사절',
    narration: '영길리(英吉利)의 사절단이 황제를 알현하러 왔다는 소문이 강남까지 퍼졌다.',
    lines: [
      ['나레이션', '영길리의 사절이 기묘한 선물을 잔뜩 싣고 열하까지 갔다는 소문이다. 하늘을 재는 기계, 백 보 밖을 꿰뚫는 총.'],
      ['문하생', '사부님, 그 오랑캐들 총 한 자루가 우리 칼 백 자루보다 낫다던데요?'],
    ],
    options: [
      { id: 'proud', label: '「천조(天朝)에 없는 것은 없다」', hint: '명성 +4' },
      { id: 'worry', label: '「언젠가 그 총이 이 마당까지 올 게다」', hint: '통찰 +3 · 구도' },
    ],
    outcome: (s, opt) =>
      opt === 'proud'
        ? say(addFame(s, 4), [['나레이션', '제자들은 고개를 끄덕였다. 스승도 그렇게 믿고 싶었다.']])
        : say(addRep(addStats(s, { ins: 3 }), { ascetic: 4 }), [['나레이션', '그날 밤 오래 잠들지 못했다. 칼이 닿지 않는 거리에서 오는 것들에 대해 생각했다.']]),
  },
  {
    key: 'elder_era_cn_1796',
    country: 'CHINA',
    years: [1796, 1798],
    title: '황제의 양위',
    narration: '건륭제께서 재위 육십 년을 채우고 태자에게 자리를 넘기셨다. 스스로 태상황이 되셨다.',
    lines: [
      ['나레이션', '건륭 황제께서 할아버지의 재위 햇수를 넘지 않겠다며 육십 년을 채우고 제위를 넘기셨다. 그래도 정사는 태상황께서 여전히 쥐고 계시다는 말이 돈다.'],
      ['문하생', '천자께서도 자리를 물려주시는데……'],
    ],
    options: [
      { id: 'think', label: '「나도 물려줄 때가 되었는지 모르겠구나」', hint: '양위를 생각하게 된다' },
      { id: 'laugh', label: '「물려주고도 쥐고 있으면 그게 무슨 양위냐」', hint: '정신 +2' },
    ],
    outcome: (s, opt) =>
      opt === 'think'
        ? say(remember(s, 'abdication_nudge', 'YES'), [['나레이션', '그 말을 들은 제자들이 서로 눈짓을 했다. 마당의 구령을 누가 붙이고 있는지, 스승도 문득 돌아보았다.']])
        : say(addStats(s, { wil: 2 }), [['나레이션', '제자들이 웃음을 삼켰다. 소문은 그 말 그대로 장터에 퍼졌다.']]),
  },
  {
    key: 'elder_era_cn_1799',
    country: 'CHINA',
    years: [1799, 1801],
    title: '화신(和珅)의 몰락',
    narration: '태상황께서 붕어하시자마자, 천하의 재물을 긁어모았다던 권신 화신이 자진의 명을 받았다.',
    lines: [
      ['나레이션', '태상황께서 붕어하시고 보름 만에 권신 화신이 자진의 명을 받았다. 그 집에서 나온 은이 나라 몇 해 세입이라 한다.'],
      ['나레이션', '고을에서도 그 줄에 붙어 자릿세를 뜯던 서리들이 줄줄이 끌려갔다. 도장에 뜯어 가던 돈도 이제 끝이다.'],
    ],
    options: [
      { id: 'feast', label: '제자들과 국수를 삶아 먹는다', hint: '건강 +4 · 재화 +40 (뜯기던 돈)' },
      { id: 'warn', label: '「높이 오른 자는 반드시 떨어진다」 제자들에게 이른다', hint: '구도 +5 · 인덕 +3' },
    ],
    outcome: (s, opt) =>
      opt === 'feast'
        ? say(addMoney(addHealth(s, 4), 40), [['나레이션', '국수 한 그릇에 제자들이 떠들썩했다. 이 집 저 집에서 국수 삶는 냄새가 났다.']])
        : say(addRep(s, { ascetic: 5, virtue: 3 }), [['나레이션', '제자들은 그 말을 오래 기억했다. 몇은 그 말을 평생 간직했다.']]),
  },
  {
    key: 'elder_era_jp_1788',
    country: 'JAPAN',
    years: [1788, 1793],
    title: '간세이(寬政)의 문무 장려',
    narration: '새 로주(老中) 마쓰다이라 사다노부가 무사들에게 문무를 다시 닦으라 엄명했다.',
    lines: [
      ['나레이션', '새 로주께서 사치를 금하고 무사들에게 문무를 다시 닦으라 엄명하셨다. 번(藩)마다 검술 사범을 찾느라 난리다.'],
      ['번의 용인(用人)', '귀 유파의 노사범께 번사 자제들의 검술을 맡기고 싶습니다. 녹은 넉넉히 드리지요.'],
    ],
    options: [
      { id: 'accept', label: '번의 사범직을 맡는다', hint: '재화 +120 · 명성 +15 · 건강 -5' },
      { id: 'disciple', label: '고참 제자를 추천한다', hint: '제자가 출세한다 · 명성 +8' },
      { id: 'no', label: '「녹을 먹는 칼은 무디다」', hint: '구도 +6' },
    ],
    outcome: (s, opt) => {
      if (opt === 'accept') return say(addHealth(addFame(addMoney(s, 120), 15), -5), [['나레이션', '번사 자제들은 처음엔 늙은 사범을 얕보았다. 한 달 뒤 그들의 손바닥에는 물집이 잡혀 있었다.']]);
      if (opt === 'disciple') {
        const d = aliveDisc(s)[0];
        return say(addFame(s, 8), [['나레이션', `${d ? josa(d.name, '이가') : '고참 제자가'} 번의 사범이 되어 떠났다. 떠나는 날 대문 앞에서 세 번 절했다.`]]);
      }
      return say(addRep(s, { ascetic: 6 }), [['나레이션', '용인은 그 말을 번에 그대로 전하지는 못했을 것이다.']]);
    },
  },
  {
    key: 'elder_era_jp_1792',
    country: 'JAPAN',
    years: [1792, 1795],
    title: '북쪽 바다의 이국선',
    narration: '에조치 네무로에 러시아의 배가 와서 통상을 청했다는 소문이 돈다.',
    lines: [
      ['나레이션', '북쪽 에조치 바다에 붉은 털의 오로샤(러시아) 배가 나타나 통상을 청했다고 한다. 해안 방비를 강화하라는 영이 번마다 내려왔다.'],
      ['문하생', '선생님, 바닷가 번에서 해안 경비대를 가르칠 검술가를 찾는다 합니다.'],
    ],
    options: [
      { id: 'go', label: '「칼이 아직 쓸모 있는 곳이라면」 제자들을 보낸다', hint: '명성 +10 · 제자들이 세상을 본다' },
      { id: 'stay', label: '「바다는 바다 사람들에게 맡겨라」', hint: '구도 +4' },
    ],
    outcome: (s, opt) =>
      opt === 'go'
        ? say(addFame(s, 10), [['나레이션', '제자들이 바닷가 번으로 떠났다. 편지에는 「여기 사람들은 칼보다 대포 이야기만 합니다」라고 적혀 있었다.']])
        : say(addRep(s, { ascetic: 4 }), [['나레이션', '마당은 고요했다. 바다 소식은 그 뒤로도 가끔씩 들려왔다.']]),
  },
];

const ERA_EVENTS: JourneyEventDef[] = ERA_DEFS.map((e) => ({
  key: e.key,
  kind: 'HOME',
  elder: true,
  once: true,
  weight: 2,
  countries: [e.country],
  trigger: { age: [55, 99] },
  cond: (s) => s.country === e.country && s.year >= e.years[0] && s.year <= e.years[1],
  build: () => ({
    title: e.title,
    category: 'HISTORICAL',
    narration: e.narration,
    script: e.lines.map(([sp, t]) => (sp === '나레이션' ? N(t) : P(sp, t))),
    options: e.options,
  }),
  resolve: (s, opt) => e.outcome(s, opt),
}));

export const ELDER_ROLE_EVENTS: JourneyEventDef[] = [
  abdication,
  heirConsult,
  heirChallenged,
  factions,
  heirLost,
  secret,
  swordHandover,
  lastDisciple,
  lastDiscipleTest,
  portrait,
  will,
  epitaph,
  mediator,
  magistrateAsk,
  storyTime,
  youngChallenger,
  elderTea,
  youngDojo,
  youngDojoLater,
  lastTrip,
  eraGuns,
  ...ERA_EVENTS,
];

// 쓰지 않는 도구 경고 방지
void H;
