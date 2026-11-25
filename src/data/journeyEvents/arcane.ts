import { josa } from '../../utils/korean';
import { CountryId, GameState, Skill } from '../../types/game';
import { ALL_BOOKS_CATALOG, BOOK_SKILL_TEMPLATES } from '../booksAndSkills';
import { getBookDecodeTarget } from '../../engine/gameLogic';
import {
  addFame,
  addHealth,
  addMoney,
  addRep,
  addStats,
  byCountry,
  chance,
  cur,
  gainInsight,
  giveBook,
  H,
  highlight,
  JourneyEventDef,
  journeyBattle,
  N,
  P,
  rand,
  remember,
  roadScale,
  say,
  spendDays,
} from '../../engine/journeyCore';

// 이계(異界)의 길.
// 예전에는 술법을 얻는 길이 만물객의 비싼 금서와 일생에 한 번 나올까 말까 한 「봉인된 상자」뿐이어서,
// 일부러 노려도 손에 넣기 어려웠고 보통의 일생에서는 아예 열리지 않았다. 길 위와 도장에 술법을 만날 자리를 둔다.
//   1) 나라마다 한 명씩 있는 이계의 은자 — 은거 고수 자리에 나온다 (일생에 한 번)
//   2) 별똥별이 떨어진 자리 — 보물 자리 (일생 두 번까지)
//   3) 바닷가·장터의 서양 연금술사 — 사람 자리 (일생 두 번까지)
//   4) 도장에 하룻밤 묵어 가는 떠돌이 술사 — 도장 생성형

const FANTASY_IDS = ['sk_fn_01', 'sk_fn_02', 'sk_fn_03', 'sk_fn_04', 'sk_fn_05', 'sk_fn_06', 'sk_fn_07'];
// 이 정도 영력이면 금서를 읽지 않고도 스승에게서 곧바로 술법을 받아 낼 수 있다 (금서 해독은 영력 34~42 + 달인 경지)
const QI_DIRECT = 28;

const memNum = (s: GameState, k: string) => Number(s.flags.storyMemory?.[k] || 0);
const bump = (s: GameState, k: string) => remember(s, k, String(memNum(s, k) + 1));

function unownedSpell(s: GameState, prefer: string[] = []): string | null {
  const owned = new Set(s.skills.map((k) => k.id));
  const pool = prefer.filter((id) => !owned.has(id));
  if (pool.length) return rand(pool);
  const rest = FANTASY_IDS.filter((id) => !owned.has(id));
  return rest.length ? rand(rest) : null;
}

const spellName = (id: string) => BOOK_SKILL_TEMPLATES[id]?.name || '술법';
// 「이름」을/를 — 낫표 뒤에 목적격 조사를 붙인다
const quoteObj = (name: string) => `「${name}」${josa(name, '을를').slice(name.length)}`;

// 술법을 곧바로 익힌다. 짝이 되는 금서는 「다 읽은 책」으로 서가에 꽂아 둔다 (도감·업적이 금서를 알아보도록).
export function learnSpell(s: GameState, skillId: string): { state: GameState; name: string | null } {
  const tpl = BOOK_SKILL_TEMPLATES[skillId];
  if (!tpl || s.skills.some((k) => k.id === skillId)) return { state: s, name: null };
  const learned: Skill = { ...tpl, masteryLevel: 1, masteryExp: 0, imprintedTraits: [] };
  const bookId = skillId.replace('sk_fn_', 'bk_fn_');
  const tplBook = ALL_BOOKS_CATALOG.find((b) => b.id === bookId);
  const books = tplBook && !s.books.some((b) => b.id === bookId)
    ? [...s.books, { ...tplBook, decodeProgress: getBookDecodeTarget({ ...tplBook, decodeProgress: 0, decoded: false }), decoded: true }]
    : s.books;
  return { state: { ...s, skills: [...s.skills, learned], books }, name: tpl.name };
}

// 영력이 모자라면 금서를 받아 간다 — 절반은 읽어 준 채로.
function giveSpellBook(s: GameState, skillId: string): { state: GameState; title: string | null } {
  const bookId = skillId.replace('sk_fn_', 'bk_fn_');
  const tplBook = ALL_BOOKS_CATALOG.find((b) => b.id === bookId);
  if (!tplBook) return { state: s, title: null };
  return giveBook(s, bookId, Math.round(getBookDecodeTarget({ ...tplBook, decodeProgress: 0, decoded: false }) / 2));
}

// ═════════════════════════ 1) 나라마다 한 명, 이계의 은자 ═════════════════════════
interface HermitDef {
  key: string;
  country: CountryId;
  name: string;
  title: string;
  place: string;
  age: number;
  scene: string;
  greet: string;
  teach: string; // 가르칠 때 남기는 말
  spark: string; // 처음 술법이 손끝에 맺힐 때
  prefer: string[];
  enemySkills: string[];
}

const HERMITS: HermitDef[] = [
  {
    key: 'arcane_kr_hermit',
    country: 'KOREA',
    name: '산신각의 이인(異人)',
    title: '산신각 뒤에 사는 정체 모를 사내',
    place: '산신각',
    age: 60,
    scene: '산신각 뒤 너럭바위에 홑옷 차림의 사내가 앉아 있다. 사방이 눈인데, 그가 앉은 자리만 눈이 녹아 김이 오른다.',
    greet: '칼 냄새가 나는구먼. 칼로는 닿지 않는 데가 있다는 걸 알고 왔나, 모르고 왔나?',
    teach: '주문 따위는 없네. 단전의 불을 손끝까지 끌어내는 게야. 숨과 뜻이 전부지.',
    spark: '언 손끝에 콩알만 한 불씨가 맺혔다',
    prefer: ['sk_fn_01', 'sk_fn_05'],
    enemySkills: ['sk_fn_01', 'sk_fn_05', 'base_h_slash'],
  },
  {
    key: 'arcane_cn_hermit',
    country: 'CHINA',
    name: '곤륜에서 내려온 방사(方士)',
    title: '연단로를 지키는 방사',
    place: '연단로 연기',
    age: 55,
    scene: '골짜기에 연단로(煉丹爐) 연기가 피어오른다. 도포 자락에 그을음이 묻은 방사가 화로에 부채질을 하다 고개를 든다.',
    greet: '무림의 칼잡이가 이 산중까지? 하하, 단약을 사러 온 얼굴은 아니로군.',
    teach: '천지의 기는 칼을 기다려 주지 않네. 벼락은 뜻이 먼저 닿은 자리에 떨어지지.',
    spark: '손바닥 사이로 푸른 실번개가 튀었다',
    prefer: ['sk_fn_03', 'sk_fn_04'],
    enemySkills: ['sk_fn_03', 'sk_fn_04', 'sk_cn_02'],
  },
  {
    key: 'arcane_jp_hermit',
    country: 'JAPAN',
    name: '음양사(陰陽師)',
    title: '식신을 부리는 음양사',
    place: '종이 학이 날아든 사당',
    age: 48,
    scene: '종이 학 한 마리가 길을 앞서 날아간다. 따라가 보니 작은 사당 앞에서 흰 가리기누 차림의 음양사가 부적을 접고 있다.',
    greet: '제 식신(式神)을 따라올 수 있는 분은 드뭅니다. 무사님, 칼 밖의 세상이 궁금하십니까?',
    teach: '공간도 종이처럼 접힙니다. 접는 법을 아는 사람에게만요.',
    spark: '눈앞의 공기가 종이처럼 한 겹 접혔다 펴졌다',
    prefer: ['sk_fn_06', 'sk_fn_07', 'sk_fn_02'],
    enemySkills: ['sk_fn_06', 'sk_fn_02', 'sk_jp_03'],
  },
];

const HERMIT_EVENTS: JourneyEventDef[] = HERMITS.map(
  (h): JourneyEventDef => ({
    key: h.key,
    kind: 'MASTER',
    countries: [h.country],
    once: true,
    weight: 1.2,
    label: () => h.place,
    build: (s) => {
      const spell = unownedSpell(s, h.prefer);
      const direct = s.stats.qi >= QI_DIRECT;
      return {
        title: `이계의 은자 — ${h.name}`,
        category: 'FANTASY',
        sceneActor: 'RIVAL',
        speaker: h.name,
        narration: h.scene,
        script: [N(h.scene), P(h.name, h.greet), H(s, '칼 밖의 이치가 있다면, 한 자락이라도 배우고 싶습니다.', '포권하며')],
        options: [
          ...(spell
            ? [
                {
                  id: 'learn',
                  label: '술법을 배우기를 청한다 (3일)',
                  hint: direct
                    ? `「${spellName(spell)}」 습득 · 건강 -6 · 이단 +15`
                    : `영력이 모자라 금서만 받아 간다 (영력 ${QI_DIRECT} 필요, 지금 ${s.stats.qi}) · 이단 +8`,
                },
              ]
            : []),
          { id: 'duel', label: '칼로 술법을 받아 본다 (2일)', hint: spell ? `비무 · 이기면 ${quoteObj(spellName(spell))} 전수받는다` : '비무 · 칼 밖의 싸움을 겪어 본다' },
          { id: 'refuse', label: '사술(邪術)이라 여겨 정중히 물러난다', hint: '구도 +6 · 인덕 +2' },
        ],
        meta: { spell: spell || '' },
      };
    },
    resolve: (s, opt, c) => {
      const spell = String(c.data?.spell || '');
      if (opt === 'learn' && spell) {
        let n = spendDays(s, 3);
        if (n.stats.qi >= QI_DIRECT) {
          const l = learnSpell(n, spell);
          n = addRep(addHealth(l.state, -6), { arcane: 15 });
          n = highlight(n, `${h.name}에게서 ${quoteObj(l.name || '술법')} 배웠다`);
          return say(n, [
            [h.name, h.teach],
            ['나레이션', `사흘 밤낮 숨을 고르고 뜻을 모았다. 마지막 날 새벽, ${h.spark}. ${quoteObj(l.name || '술법')} 익혔다. (건강 -6, 이단 +15)`],
          ]);
        }
        const g = giveSpellBook(n, spell);
        n = addRep(g.state, { arcane: 8 });
        return say(n, [
          [h.name, '그릇이 아직 덜 찼네. 이걸 가져가서 기(氣)를 더 채운 뒤에 읽게.'],
          ['나레이션', g.title ? `${josa(g.title, '을를')} 받았다. 은자가 사흘 동안 앞부분을 풀어 주었다. (해독 절반 진행, 이단 +8)` : '은자는 고개만 저었다. (이단 +8)'],
        ]);
      }
      if (opt === 'duel') {
        const n = spendDays(s, 2);
        return journeyBattle(n, c, opt, {
          title: `이계의 은자 — ${h.name}`,
          subtitle: '칼과 술법',
          name: h.name,
          enemyTitle: h.title,
          age: h.age,
          ai: 'RANGED',
          scale: roadScale(n, 1.0),
          weapon: 'UNARMED',
          skills: h.enemySkills,
          stakes: 'SPAR',
          rewardFame: 25,
        });
      }
      if (opt === 'refuse') {
        return say(addRep(s, { ascetic: 6, virtue: 2 }), [
          [h.name, '그것도 길이지. 칼 한 자루로 끝까지 가 보게.'],
          ['나레이션', '돌아서는 등 뒤로 따뜻한 바람이 한 번 불었다. (구도 +6, 인덕 +2)'],
        ]);
      }
      return s;
    },
    onBattle: (s, _opt, won, c) => {
      const spell = String(c.data?.spell || '');
      if (won) {
        let n = addFame(addRep(s, { arcane: 10 }), 15);
        let learned = '';
        if (spell) {
          const l = learnSpell(n, spell);
          n = l.state;
          if (l.name) learned = ` 은자는 약속대로 「${l.name}」의 요체를 풀어 주었다.`;
        }
        n = highlight(n, `${josa(h.name, '과와')} 칼과 술법을 겨뤄 이겼다`);
        return say(n, [
          [h.name, '칼이 불보다 빠를 줄이야… 세상 넓은 줄 오늘 다시 배우네.'],
          ['나레이션', `불길과 바람 사이로 파고든 칼끝이 은자의 소매 앞에서 멈췄다.${learned} (이단 +10, 명성 +15)`],
        ]);
      }
      let n = addRep(addStats(s, { qi: 3, ins: 2 }), { arcane: 4 });
      const g = gainInsight(n, 8, h.place);
      n = g.state;
      return say(n, [
        [h.name, '칼로 막을 수 없는 것도 있다는 걸 알았으면 됐네.'],
        ['나레이션', `소매 끝이 그을렸다. 칼끝이 닿기 전에 모든 게 끝나 있었다. (영력 +3, 통찰 +2, 이단 +4)`],
        ['나레이션', g.text],
      ]);
    },
  })
);

// ═════════════════════════ 2) 별똥별이 떨어진 자리 ═════════════════════════
const meteor: JourneyEventDef = {
  key: 'tr_meteor',
  kind: 'TREASURE',
  once: false,
  weight: 0.6,
  label: () => '그을린 구덩이',
  cond: (s) => memNum(s, 'meteors') < 2,
  build: () => ({
    title: '별똥별이 떨어진 자리',
    category: 'FANTASY',
    narration: '나무가 부채꼴로 쓰러진 숲 한가운데, 땅이 움푹 꺼져 있다. 구덩이 바닥의 검은 돌이 아직 따뜻하다.',
    script: [
      N('지난밤 하늘을 가르던 빛이 여기 떨어졌다. 나무들이 부채꼴로 쓰러져 있고, 구덩이 바닥에서 검은 돌이 희미하게 김을 낸다.'),
      N('가까이 가자 단전이 저절로 울린다. 돌이 숨을 쉬는 것 같다.'),
    ],
    options: [
      { id: 'attune', label: '돌에 손을 얹고 기를 맞춰 본다 (1일)', hint: '영력 +4 · 이단 +8 · 무언가 들릴지도 모른다' },
      { id: 'mine', label: '운철(隕鐵)을 캐 간다 (1일)', hint: '재화 · 상무 +4' },
      { id: 'leave', label: '불길한 기운이라 피해 간다' },
    ],
  }),
  resolve: (s, opt) => {
    if (opt === 'attune') {
      let n = bump(addRep(addStats(spendDays(s, 1), { qi: 4 }), { arcane: 8 }), 'meteors');
      const spell = chance(0.4) ? unownedSpell(n) : null;
      if (spell) {
        const g = giveSpellBook(n, spell);
        n = g.state;
        if (g.title) {
          n = highlight(n, '별똥별의 돌에서 술법의 소리를 들었다');
          return say(n, [
            ['나레이션', '눈을 감자 돌 속에서 낯선 글자들이 떠올랐다. 밤새 그것을 받아 적었다.'],
            ['나레이션', `받아 적은 것을 엮으니 한 권의 금서가 되었다 — ${g.title}. (해독 절반 진행, 영력 +4, 이단 +8)`],
          ]);
        }
      }
      return say(n, [['나레이션', '돌의 맥박과 숨을 맞추자 몸속의 기가 한 바퀴 크게 돌았다. 무언가 들릴 듯하다가 말았다. (영력 +4, 이단 +8)']]);
    }
    if (opt === 'mine') {
      const gain = 70 + Math.round(Math.random() * 60);
      const n = bump(addRep(addMoney(spendDays(s, 1), gain), { commerce: 4 }), 'meteors');
      return say(n, [['나레이션', `망치로 쪼아 낸 운철 덩이는 보기보다 무거웠다. 대장장이들이 서로 사겠다고 나설 물건이다. (+${gain}${cur(n)}, 상무 +4)`]]);
    }
    return s;
  },
};

// ═════════════════════════ 3) 서양 연금술사 ═════════════════════════
const alchemist: JourneyEventDef = {
  key: 'p_alchemist',
  kind: 'PEOPLE',
  once: false,
  weight: 0.7,
  label: () => '이국의 행상',
  cond: (s, r) => memNum(s, 'alchemist') < 2 && r.legs.some((l) => l.terrain === 'COAST' || l.terrain === 'TOWN') && !!unownedSpell(s),
  build: (s) => {
    const spell = unownedSpell(s)!;
    const bookId = spell.replace('sk_fn_', 'bk_fn_');
    const book = ALL_BOOKS_CATALOG.find((b) => b.id === bookId);
    const price = Math.round((book?.price || 450) * 0.6);
    const who = byCountry(s, '표류해 온 양인(洋人)', '광저우에서 흘러온 양인 연금술사', '데지마를 빠져나온 난학(蘭學)의 연금술사');
    return {
      title: '서양 연금술사의 보따리',
      category: 'FANTASY',
      speaker: who,
      narration: `장터 한구석에 ${josa(who, '이가')} 유리병과 낡은 책을 늘어놓고 있다.`,
      script: [
        N(`장터 한구석에 ${josa(who, '이가')} 앉아 있다. 코가 높고 눈빛이 낯설다. 유리병 속 액체가 저 혼자 끓고 있다.`),
        P(who, `이 책, 우리 나라 말로도 못 읽소. 그런데 당신 눈, 이걸 읽을 눈이오. ${price}${cur(s)}에 주겠소.`, '서툰 말로', '?'),
      ],
      options: [
        {
          id: 'buy',
          label: `${josa(book?.title || '금서', '을를')} 산다 (${price}${cur(s)})`,
          hint: '이계의 금서 · 이단 +6',
          disabled: s.money < price,
          disabledReason: '노자가 부족하다',
        },
        { id: 'ask', label: '책 대신 그가 본 것들을 묻는다 (1일)', hint: '통찰 +2 · 이단 +3' },
        { id: 'leave', label: '사기꾼이라 여기고 지나친다' },
      ],
      meta: { spell, price },
    };
  },
  resolve: (s, opt, c) => {
    if (opt === 'buy') {
      const price = Number(c.data?.price) || 270;
      const g = giveBook(addMoney(s, -price), String(c.data?.spell).replace('sk_fn_', 'bk_fn_'), 0);
      let n = bump(addRep(g.state, { arcane: 6 }), 'alchemist');
      n = highlight(n, '서양 연금술사에게서 금서를 샀다');
      return say(n, [['나레이션', `${g.title || '금서'}. 책장 사이에서 쇳가루와 약초 냄새가 났다. (-${price}${cur(n)}, 이단 +6)`]]);
    }
    if (opt === 'ask') {
      const n = bump(addRep(addStats(spendDays(s, 1), { ins: 2 }), { arcane: 3 }), 'alchemist');
      return say(n, [['나레이션', '그는 납을 금으로 바꾸려다 손가락 둘을 잃었다고 했다. 그래도 불꽃을 손에 쥐는 법은 알았다고. 믿기 어려운 이야기들이 밤늦도록 이어졌다. (통찰 +2, 이단 +3)']]);
    }
    return s;
  },
};

// ═════════════════════════ 4) 도장에 하룻밤 묵어 가는 떠돌이 술사 ═════════════════════════
const wanderingSorcerer: JourneyEventDef = {
  key: 'home_sorcerer',
  kind: 'HOME',
  cooldown: 20,
  cond: (s) => s.turn >= 10 && !!unownedSpell(s) && memNum(s, 'sorcerer') < 3,
  build: (s) => {
    const who = byCountry(s, '떠돌이 술사', '떠돌이 방사(方士)', '떠돌이 음양사');
    const spell = unownedSpell(s)!;
    const fee = 120;
    const direct = s.stats.qi >= QI_DIRECT;
    return {
      title: `하룻밤 묵어 가는 ${who}`,
      category: 'FANTASY',
      speaker: who,
      narration: `해 질 녘, 지팡이에 방울을 단 ${who}가 대문을 두드린다.`,
      script: [
        N(`해 질 녘, 지팡이에 방울을 단 ${who}가 대문을 두드렸다. 비에 젖은 봇짐에서 이상한 냄새가 난다.`),
        P(who, '하룻밤만 처마를 빌립시다. 값은… 돈이 아니라 다른 걸로 치르지요.', '젖은 소매를 털며'),
      ],
      options: [
        { id: 'lodge', label: '방을 내주고 저녁을 대접한다', hint: '인덕 +4 · 무언가 남기고 갈지도' },
        {
          id: 'learn',
          label: `술법 한 수를 청한다 (${fee}${cur(s)})`,
          hint: direct ? `「${spellName(spell)}」 습득 · 이단 +12` : `영력 ${QI_DIRECT} 미만 — 금서만 받는다 · 이단 +6`,
          disabled: s.money < fee,
          disabledReason: '재화 부족',
        },
        { id: 'drive', label: '요사스럽다며 돌려보낸다', hint: '구도 +4' },
      ],
      meta: { spell, fee, who },
    };
  },
  resolve: (s, opt, c) => {
    const who = String(c.data?.who || '술사');
    const spell = String(c.data?.spell || '');
    let n = bump(s, 'sorcerer');
    if (opt === 'lodge') {
      n = addRep(n, { virtue: 4 });
      if (spell && chance(0.45)) {
        const g = giveSpellBook(n, spell);
        n = addRep(g.state, { arcane: 6 });
        if (g.title) return say(n, [['나레이션', `이튿날 아침, 손님방은 비어 있었다. 베개 위에 ${josa(g.title, '이가')} 놓여 있었다. 반쯤은 붉은 글씨로 풀이가 달려 있다. (인덕 +4, 이단 +6)`]]);
      }
      return say(n, [['나레이션', `${josa(who, '은는')} 밥 두 그릇을 비우고 새벽같이 떠났다. 마당의 우물물이 그날부터 유난히 달았다. (인덕 +4)`]]);
    }
    if (opt === 'learn' && spell) {
      const fee = Number(c.data?.fee) || 120;
      n = addMoney(n, -fee);
      if (n.stats.qi >= QI_DIRECT) {
        const l = learnSpell(n, spell);
        n = addRep(addHealth(l.state, -4), { arcane: 12 });
        return say(n, [
          [who, '칼 쥐는 손이니 금방 알아듣겠지요. 손끝이 아니라 숨끝입니다.'],
          ['나레이션', `밤새 마루에서 숨을 맞췄다. 새벽닭이 울 때 「${l.name}」의 첫 기운이 손에 잡혔다. (-${fee}${cur(n)}, 건강 -4, 이단 +12)`],
        ]);
      }
      const g = giveSpellBook(n, spell);
      n = addRep(g.state, { arcane: 6 });
      return say(n, [[who, '그릇이 아직이오. 대신 이걸 두고 가지요. 기가 차면 읽힐 겁니다.'], ['나레이션', `${g.title || '금서'} (해독 절반 진행, -${fee}${cur(n)}, 이단 +6)`]]);
    }
    return say(addRep(n, { ascetic: 4 }), [['나레이션', `${josa(who, '은는')} 어깨를 으쓱하고 빗속으로 사라졌다. (구도 +4)`]]);
  },
};

export const ARCANE_EVENTS: JourneyEventDef[] = [...HERMIT_EVENTS, meteor, alchemist, wanderingSorcerer];
