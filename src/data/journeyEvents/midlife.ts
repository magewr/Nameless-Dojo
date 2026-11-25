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
  FreshVariant,
  H,
  JCtx,
  JourneyEventBody,
  JourneyEventDef,
  journeyBattle,
  N,
  P,
  pickFresh,
  rand,
  remember,
  roadScale,
  say,
  trainEquipped,
} from '../../engine/journeyCore';
import { getMaxDisciples } from '../../engine/gameLogic';
import { createDiscipleEntity } from '../events';
import { josa } from '../../utils/korean';

// ───────────────────────── 중년의 도장 ─────────────────────────
// 스물다섯에서 쉰다섯 사이, 도장 살림과 사람 사이에서 벌어지는 생성형 사건들.
// 예전에는 이 나이대의 우연한 사건이 열두어 가지 틀(도전장·의뢰·병기상…)에 몰려, 마흔 줄에는 셋 가운데 둘이 「이미 본 사건」이었다.
// 틀마다 장면(변주)을 여럿 두고 pickFresh로 최근에 본 장면을 피해 고른다 — 고른 장면은 meta.vkey로 엔진이 기억한다.
// 장면에 화자(speaker)를 두면 대문으로 그 사람이 걸어 들어온다 (DojoSimView.resolveVisitorWalk의 낱말 규칙 — 영감·아낙·의원·선비…).
// 화자도 사람 대사도 없는 장면은 홀로 겪는 한때로 연출된다 (storyScripts.isSoloEvent).

// ───────── 공통 도구 ─────────
const alive = (s: GameState) => s.disciples.filter((d) => !d.dead && !d.isChild);
const kin = (s: GameState) => s.disciples.filter((d) => !d.dead && d.isChild && !d.adopted); // 거둔 아이는 친자녀가 아니다
const notHeir = (s: GameState) => alive(s).filter((d) => d.role !== 'HEIR');
const hasRoom = (s: GameState) => s.disciples.filter((d) => !d.dead).length < getMaxDisciples(s.facilities);
const clampP = (p: number) => Math.max(0.05, Math.min(0.95, p));
const pct = (p: number) => `${Math.round(clampP(p) * 100)}%`;
const cap = (n: number) => Math.max(0, Math.min(100, n));
const findDisc = (s: GameState, id: unknown) => s.disciples.find((d) => d.id === id && !d.dead);
const bestOf = (s: GameState): Disciple | undefined =>
  [...alive(s)].sort((a, b) => b.stats.str + b.stats.agi + b.stats.ins - (a.stats.str + a.stats.agi + a.stats.ins))[0];

type Tune = Partial<Record<keyof Disciple['stats'] | 'loyalty', number>>;
const STAT_KEYS = ['str', 'agi', 'vit', 'wil', 'ins', 'qi'] as const;
function tune(d: Disciple, t: Tune): Disciple {
  const stats = { ...d.stats };
  STAT_KEYS.forEach((k) => {
    if (t[k]) stats[k] = Math.max(1, stats[k] + (t[k] || 0));
  });
  return { ...d, stats, loyalty: cap(d.loyalty + (t.loyalty || 0)) };
}
const tuneDisc = (s: GameState, id: unknown, t: Tune): GameState => ({ ...s, disciples: s.disciples.map((d) => (d.id === id ? tune(d, t) : d)) });
const tuneAll = (s: GameState, t: Tune): GameState => ({ ...s, disciples: s.disciples.map((d) => (d.dead ? d : tune(d, t))) });
const depart = (s: GameState, id: unknown, reason: string): GameState => ({
  ...s,
  disciples: s.disciples.map((d) => (d.id === id ? { ...d, dead: true, leftReason: reason } : d)),
});
const narr = (s: GameState, text: string) => say(s, [['나레이션', text]]);
const coin = (s: GameState, n: number) => `${n}${cur(s)}`;
const short = (s: GameState, n: number) => ({ disabled: s.money < n, disabledReason: '돈이 부족하다' });
const brew = (s: GameState) => byCountry(s, '막걸리', '황주', '탁주');
const zeni = (s: GameState) => byCountry(s, '엽전', '동전', '동전');
// 제자 기록에는 대개 성별이 비어 있다 — 비어 있으면 초상화가 쓰는 것과 같은 여성 이름 사전으로 가린다 (PixelPortrait.FEMALE_NAMES의 제자 이름)
const FEMALE_DISCIPLE_NAMES = new Set(['최연화', '정하늘', '윤소희', '조은별', '송지우', '임청하', '소옥란', '황영아', '매초풍', '당소월', '타카하시 유키', '아오이 카나', '나카무라 하루', '사쿠라 미오']);
const isFemaleDisc = (d: Disciple) => (d.gender ? d.gender === 'FEMALE' : FEMALE_DISCIPLE_NAMES.has(d.name));
const kidWord = (d: Disciple) => (isFemaleDisc(d) ? '딸' : '아들');
const parentWord = (s: GameState) => (s.gender === 'FEMALE' ? '어머니' : '아버지');
// 스물넷 전에는 아직 도장 살림이 덜 붙었고, 예순 넘어서는 노년의 사건이 그 자리를 채운다
const midWeight = (s: GameState) => (s.age >= 60 ? 0.3 : s.age < 24 ? 0.6 : 1);

// ───────── 장면 묶음 → 사건 틀 ─────────
type Scene = FreshVariant & {
  build: (s: GameState) => JourneyEventBody;
  resolve: (s: GameState, opt: string, c: JCtx) => GameState;
  onBattle?: (s: GameState, opt: string, won: boolean, c: JCtx) => GameState;
};

function homeTemplate(
  key: string,
  scenes: Scene[],
  opts: { cond?: (s: GameState) => boolean; weight?: number; cooldown?: number; weightBy?: (s: GameState) => number } = {}
): JourneyEventDef {
  const usable = (s: GameState) => scenes.filter((sc) => !sc.when || sc.when(s));
  const sceneOf = (c: JCtx) => scenes.find((sc) => sc.id === c.data?.vkey) || scenes[0];
  return {
    key,
    kind: 'HOME',
    weight: opts.weight,
    cooldown: opts.cooldown,
    weightBy: opts.weightBy ?? midWeight,
    // 이번 계절·형편에 맞는 장면이 하나도 없으면 이 틀은 나오지 않는다
    cond: (s) => (!opts.cond || opts.cond(s)) && usable(s).length > 0,
    build: (s) => {
      const sc = pickFresh(s, key, usable(s));
      const body = sc.build(s);
      return { ...body, meta: { ...(body.meta || {}), vkey: sc.id } };
    },
    resolve: (s, opt, c) => sceneOf(c).resolve(s, opt, c),
    onBattle: (s, opt, won, c) => {
      const sc = sceneOf(c);
      return sc.onBattle ? sc.onBattle(s, opt, won, c) : s;
    },
  };
}

// ═════════ 1. 도장 손볼 곳 — 계절이 남기고 간 흠 ═════════
interface RepairDef {
  id: string;
  when?: (s: GameState) => boolean;
  cost: number;
  title: string;
  scene: string;
  voice: (s: GameState) => [string, string];
  hired: string;
  diy: (s: GameState, together: boolean) => string;
  relapse: string;
}
const someone = (s: GameState) => (alive(s).length ? rand(alive(s)).name : '');
const REPAIRS: RepairDef[] = [
  {
    id: 'rain_wall',
    when: (s) => s.season === 'SUMMER',
    cost: 40,
    title: '장맛비에 무너진 흙담',
    scene: '사흘 밤낮 퍼부은 장맛비에 도장 흙담 한쪽이 폭삭 주저앉았다. 무너진 틈으로 옆집 장독대가 훤히 들여다보인다.',
    voice: () => ['옆집 영감', '허허, 담이 이래서야 도둑놈이 대문으로 들어오는 수고도 없겠구먼.'],
    hired: '미장이들이 사흘 만에 담을 반듯하게 다시 올렸다. 옆집 영감이 담 너머로 고개를 끄덕였다.',
    diy: (_s, together) =>
      together
        ? '진흙을 이기고 돌을 날라 담을 다시 쌓았다. 흙투성이가 된 제자들이 다 쌓은 담을 제 것인 양 두드려 보았다.'
        : '혼자 진흙을 이기고 돌을 날랐다. 허리가 끊어질 듯했지만 담은 다시 섰다.',
    relapse: '거적으로 막아 둔 자리가 다음 비에 또 무너졌다. 결국 일꾼을 불러 다시 쌓아야 했다.',
  },
  {
    id: 'snow_rafter',
    when: (s) => s.season === 'WINTER' && alive(s).length > 0,
    cost: 50,
    title: '눈 무게에 부러진 서까래',
    scene: '밤새 쌓인 눈을 못 이기고 숙사 처마의 서까래 하나가 뚝 부러졌다. 놀란 제자들이 이불을 뒤집어쓴 채 마당으로 뛰쳐나와 떨고 있다.',
    voice: (s) => [someone(s), '스승님! 지붕이 내려앉는 줄 알고 다들 뛰쳐나왔습니다!'],
    hired: '목수가 새 서까래를 걸고 지붕의 눈을 쓸어내렸다. 그날 밤부터 제자들이 다리를 뻗고 잤다.',
    diy: (s, together) =>
      together
        ? `눈을 쓸어내리고 뒷산에서 베어 온 통나무로 서까래를 갈았다. 언 손을 녹여 가며 일을 마친 밤, 제자들과 나눠 마신 ${brew(s)} 맛이 남달랐다.`
        : '혼자 지붕에 올라 눈을 쓸고 서까래를 갈았다. 손끝이 얼어 사흘을 고생했다.',
    relapse: '버팀목을 받쳐 둔 처마가 다음 눈에 기어이 내려앉았다. 목수를 불러 다시 올려야 했다.',
  },
  {
    id: 'wind_tiles',
    when: (s) => s.season === 'AUTUMN',
    cost: 45,
    title: '큰바람에 날아간 기와',
    scene: '밤사이 큰바람이 휩쓸고 지나가며 본채 기와 수십 장을 날려 버렸다. 마당 여기저기 깨진 기왓장이 흩어져 있다.',
    voice: (s) =>
      alive(s).length
        ? [someone(s), '스승님, 비라도 들면 대청이 다 젖겠습니다. 어떻게 할까요?']
        : ['옆집 영감', '어젯밤 바람이 보통이 아니었지. 동네에서 그 집 지붕이 제일 많이 벗겨졌구려.'],
    hired: '기와장이가 올라가 새 기와를 얹었다. 지붕 선이 전보다 반듯해졌다.',
    diy: (_s, together) =>
      together
        ? '사다리를 걸고 지붕에 올라, 제자들이 올려 주는 기와를 한 장 한 장 얹었다. 높은 데서 내려다본 고을이 낯설도록 넓었다.'
        : '사다리를 걸고 혼자 지붕에 올라 기와를 한 장 한 장 얹었다. 높은 데서 내려다본 고을이 낯설도록 넓었다.',
    relapse: '기와 대신 덮어 둔 거적이 첫비에 날아갔다. 대청마루가 흠뻑 젖어 결국 기와장이를 불렀다.',
  },
  {
    id: 'thaw_yard',
    when: (s) => s.season === 'SPRING',
    cost: 30,
    title: '봄볕에 꺼진 연무장',
    scene: '언 땅이 녹으면서 연무장 바닥이 군데군데 푹 꺼졌다. 발을 디딜 때마다 진흙이 신발을 삼킨다.',
    voice: (s) =>
      alive(s).length
        ? [someone(s), '스승님, 이래서는 발놀림 수련을 할 수가 없습니다.']
        : ['옆집 영감', '봄마다 그 마당이 늪이 되는구먼. 모래를 깔아야 하오, 모래를.'],
    hired: '강가 모래를 몇 수레 사다 깔고 다졌다. 연무장 바닥이 북처럼 단단해졌다.',
    diy: (_s, together) =>
      together
        ? '제자들과 강가에서 모래를 퍼다 나르고, 온종일 발로 밟아 다졌다. 그것도 수련이라면 수련이었다.'
        : '강가에서 모래를 퍼다 나르고 온종일 발로 밟아 다졌다. 그것도 수련이라면 수련이었다.',
    relapse: '흙을 대충 덮어 둔 자리에서 발목을 접질렸다. 결국 모래를 사다 깔아야 했다.',
  },
  {
    id: 'rot_pillar',
    cost: 60,
    title: '속이 빈 대청 기둥',
    scene: '대청 기둥을 무심코 두드려 보니 속이 텅 빈 소리가 난다. 나무좀이 속을 다 갉아 먹었다.',
    voice: () => ['늙은 목수', '이대로 두면 몇 해 안에 대청이 기웁니다. 지금 갈아 끼우는 게 싸게 먹혀요.'],
    hired: '목수가 대청을 들어 올리고 새 기둥을 끼웠다. 대들보가 「끙」 하고 제자리를 잡는 소리가 났다.',
    diy: (_s, together) =>
      together
        ? '목수에게 요령만 배워 제자들과 기둥 밑동을 갈아 끼웠다. 기둥에 손바닥을 대자 도장이 한결 단단하게 느껴졌다.'
        : '목수에게 요령만 배워 기둥 밑동을 손수 갈아 끼웠다. 기둥에 손바닥을 대자 도장이 한결 단단하게 느껴졌다.',
    relapse: '쐐기를 박아 둔 기둥이 한 해를 못 가 삐걱거렸다. 결국 목수를 불러 갈아 끼웠다.',
  },
];
const repairScene = (r: RepairDef): Scene => ({
  id: r.id,
  when: r.when,
  build: (s) => {
    const [who, line] = r.voice(s);
    const together = alive(s).length > 0;
    const mat = Math.round(r.cost * 0.3);
    return {
      title: r.title,
      category: 'LIFE',
      speaker: who,
      narration: r.scene,
      script: [N(r.scene), P(who, line)],
      options: [
        { id: 'hire', label: `일꾼을 사서 제대로 고친다 (${coin(s, r.cost)})`, hint: '상무 +3 · 말끔하게 고친다', ...short(s, r.cost) },
        together
          ? { id: 'diy', label: '제자들과 팔을 걷어붙인다', hint: `재료값 ${coin(s, mat)} · 건강 -5 · 체력 +1 · 제자 충성 +3` }
          : { id: 'diy', label: '손수 고친다', hint: `재료값 ${coin(s, mat)} · 건강 -6 · 체력 +1 · 구도 +3` },
        { id: 'patch', label: '임시로 막아 두고 버틴다', hint: '돈은 아끼지만 다시 탈이 날 수도' },
      ],
    };
  },
  resolve: (s, opt) => {
    if (opt === 'hire') return narr(addRep(addMoney(s, -r.cost), { commerce: 3 }), `${r.hired} (상무 +3)`);
    if (opt === 'diy') {
      const together = alive(s).length > 0;
      let n = addStats(addHealth(addMoney(s, -Math.round(r.cost * 0.3)), together ? -5 : -6), { vit: 1 });
      n = together ? tuneAll(n, { loyalty: 3 }) : addRep(n, { ascetic: 3 });
      return narr(n, `${r.diy(s, together)} (체력 +1${together ? ' · 제자 충성 +3' : ' · 구도 +3'})`);
    }
    if (chance(0.4)) return narr(addHealth(addMoney(s, -Math.round(r.cost * 0.6)), -3), r.relapse);
    return narr(s, '거적과 새끼줄로 대충 막아 두었다. 다행히 한 철은 그럭저럭 버텼다.');
  },
});
const repair = homeTemplate('mid_repair', REPAIRS.map(repairScene), { cond: (s) => s.turn >= 6 });

// ═════════ 2. 물 다툼 — 우물·물꼬·빨래터·수채 ═════════
const water = homeTemplate(
  'mid_water',
  [
    {
      id: 'well',
      when: (s) => s.season === 'SUMMER' || s.season === 'AUTUMN',
      build: (s) => ({
        title: '마을 우물이 마른 날',
        category: 'LIFE',
        speaker: '물동이 인 아낙',
        narration: '가뭄이 길어져 마을 공동 우물이 바닥을 드러냈다. 아직 물이 차 있는 건 도장 마당의 우물뿐이다.',
        script: [
          N('가뭄이 길어져 마을 공동 우물이 바닥을 드러냈다. 아직 물이 차 있는 건 도장 마당의 우물뿐이다. 아낙들이 물동이를 이고 대문 앞에 줄을 섰다.'),
          P('물동이 인 아낙', '사범님, 염치없지만 물 좀 길어 가게 해 주세요. 아이들 밥 지을 물도 없어요.', '물동이를 내려놓으며'),
        ],
        options: [
          { id: 'open', label: '대문을 활짝 열고 마음껏 길어 가게 한다', hint: '인덕 +6 · 명성 +6 · 우물이 바닥날 수도' },
          { id: 'ration', label: '한 집에 하루 두 동이씩 차례를 정해 준다', hint: '인덕 +3 · 상무 +2' },
          { id: 'sell', label: `한 동이에 ${zeni(s)} 한 닢씩 받고 퍼 준다`, hint: `+${coin(s, 20)} · 상무 +3 · 살기 +3` },
          { id: 'refuse', label: '도장 식솔 먹을 물도 빠듯하다며 돌려보낸다', hint: '인덕 -4' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'open') {
          const n = addFame(addRep(s, { virtue: 6 }), 6);
          return chance(0.35)
            ? narr(addHealth(n, -3), '사흘 만에 도장 우물도 바닥을 보였다. 한 철 내내 강물을 길어다 먹었지만, 물 얻어 간 집들이 번갈아 반찬을 보내왔다. (인덕 +6, 명성 +6, 건강 -3)')
            : narr(n, '아낙들이 물동이를 이고 줄지어 드나들었다. 가뭄이 끝날 때까지 도장 대문은 닫히지 않았다. (인덕 +6, 명성 +6)');
        }
        if (opt === 'sell') return narr(addRep(addMoney(s, 20), { commerce: 3, ruthless: 3 }), `대문 앞에 ${zeni(s)} 받을 그릇을 놓았다. 물동이마다 ${zeni(s)} 한 닢. 가뭄이 끝날 무렵 그릇은 묵직해졌고, 아낙들은 도장 앞을 지날 때마다 고개를 돌렸다. (+${coin(s, 20)}, 상무 +3, 살기 +3)`);
        if (opt === 'ration') return narr(addRep(s, { virtue: 3, commerce: 2 }), '대문에 차례표를 붙였다. 아무도 더 가져가지 않았고, 아무도 빈 동이로 돌아가지 않았다. (인덕 +3, 상무 +2)');
        return narr(addRep(s, { virtue: -4 }), '대문을 닫았다. 담 너머로 빈 물동이 부딪는 소리가 오래 들렸다. (인덕 -4)');
      },
    },
    {
      id: 'paddy',
      when: (s) => s.season === 'SPRING' || s.season === 'SUMMER',
      build: (s) => {
        const headman = byCountry(s, '아랫마을 이장', '아랫마을 촌장', '아랫마을 촌장');
        const ditch = byCountry(s, '봇도랑', '수로', '용수로');
        const p = clampP(0.35 + s.stats.ins * 0.005 + s.fame * 0.0003);
        return {
          title: '물꼬를 두고 맞선 두 마을',
          category: 'LIFE',
          speaker: headman,
          narration: `가뭄 끝에 윗마을과 아랫마을 장정들이 삽과 괭이를 들고 ${ditch} 앞에서 맞섰다.`,
          script: [
            N(`가뭄 끝에 윗마을과 아랫마을 장정들이 삽과 괭이를 들고 ${ditch} 앞에서 맞섰다. ${josa(headman, '이가')} 숨을 몰아쉬며 도장으로 뛰어왔다.`),
            P(headman, '윗마을 놈들이 물을 몽땅 막아 버렸소! 사범님이 나서 주시면 저쪽도 함부로 못 할 거요.', '숨을 헐떡이며'),
          ],
          options: [
            { id: 'mediate', label: '양쪽 어른들을 불러 물을 번갈아 대게 한다', hint: `통찰 판정 약 ${pct(p)} · 성공 시 인덕 +5 · 명성 +8` },
            { id: 'side', label: '아랫마을 편에 서서 물막이 앞을 막아선다', hint: '살기 +4 · 명성 +4 · 윗마을의 원망' },
            { id: 'stay', label: '농사일은 농사꾼끼리 풀 일이라며 빠진다', hint: '구도 +2' },
          ],
          meta: { p },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'mediate') {
          return chance(Number(c.data?.p) || 0.4)
            ? narr(addFame(addRep(s, { virtue: 5 }), 8), '하루는 윗마을, 하루는 아랫마을. 칼 찬 사람이 물꼬 앞에 버티고 서 있으니 아무도 삽을 휘두르지 못했다. (인덕 +5, 명성 +8)')
            : narr(addFame(s, -3), '양쪽 다 「도장이 저쪽 편을 든다」며 투덜거렸다. 물싸움은 비가 오고서야 끝났다. (명성 -3)');
        }
        if (opt === 'side') return narr(addFame(addRep(s, { ruthless: 4 }), 4), '칼자루에 손을 얹고 물막이 앞에 서자 윗마을 장정들이 슬금슬금 물러났다. 아랫마을에서는 술을 보내왔고, 윗마을에서는 이를 갈았다. (살기 +4, 명성 +4)');
        return narr(addRep(s, { ascetic: 2 }), '대문을 닫고 수련을 계속했다. 담 너머로 고함 소리가 한나절 이어졌다. (구도 +2)');
      },
    },
    {
      id: 'stream',
      when: (s) => alive(s).length > 0,
      build: () => ({
        title: '빨래터 아낙들의 항의',
        category: 'LIFE',
        speaker: '빨래터 아낙',
        narration: '빨래터 아낙들이 방망이를 든 채 몰려왔다.',
        script: [
          N('빨래터 아낙들이 방망이를 든 채 몰려왔다. 제자들이 개울 위쪽에서 땀을 씻는 바람에 빨랫물이 흐려진다는 것이다.'),
          P('빨래터 아낙', '사범님 댁 젊은이들이 웃통 벗고 첨벙대는 통에 빨래를 두 번씩 한답니다!', '방망이를 휘두르며', 'ANGRY'),
        ],
        options: [
          { id: 'apologize', label: '정중히 사과하고 제자들을 개울 아래쪽으로 보낸다', hint: '인덕 +4' },
          { id: 'rule', label: '빨래하는 아침나절엔 개울에 못 가게 규칙을 세운다', hint: '구도 +3 · 인덕 +2' },
          { id: 'laugh', label: '「물은 흐르는 것」이라며 웃어넘긴다', hint: '명성 -3' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'apologize') return narr(addRep(s, { virtue: 4 }), '제자들을 불러 세워 아낙들 앞에서 고개를 숙이게 했다. 이튿날 빨래터에서 누룽지 한 보따리가 건너왔다. (인덕 +4)');
        if (opt === 'rule') return narr(addRep(s, { ascetic: 3, virtue: 2 }), '「해가 장대 높이에 오르기 전엔 개울에 얼씬도 말 것.」 대문에 붙은 규칙을 보고 아낙들이 깔깔 웃었다. (구도 +3, 인덕 +2)');
        return narr(addFame(s, -3), '아낙들의 입은 칼보다 빨랐다. 사흘 만에 「그 도장 사람들은 체면도 없다」는 말이 장터에 돌았다. (명성 -3)');
      },
    },
    {
      id: 'drain',
      build: (s) => {
        const p = clampP(0.35 + s.stats.ins * 0.006);
        return {
          title: '수챗물 시비',
          category: 'LIFE',
          speaker: '옆집 영감',
          narration: '옆집 영감이 지팡이를 짚고 찾아왔다.',
          script: [
            N('옆집 영감이 지팡이를 짚고 찾아왔다. 도장 수챗물이 담 밑으로 스며들어 자기 집 마당이 질척인다는 것이다.'),
            P('옆집 영감', '식구가 많으니 버리는 물도 많은 게지. 이 늙은이 마당이 논바닥이 됐소!', '지팡이로 땅을 치며', 'ANGRY'),
          ],
          options: [
            { id: 'dig', label: '도랑을 새로 파서 물길을 돌린다', hint: '건강 -3 · 인덕 +3' },
            { id: 'pay', label: `미안하다며 술값을 쥐여 드린다 (${coin(s, 15)})`, hint: '상무 +2', ...short(s, 15) },
            { id: 'argue', label: '물은 낮은 데로 흐르는 법이라고 버틴다', hint: `통찰 판정 약 ${pct(p)}` },
          { id: 'threaten', label: '칼자루를 두드리며 「담이 무너지기 싫으면 돌아가시오」 을러댄다', hint: '살기 +4 · 인덕 -2' },
          ],
          meta: { p },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'dig') return narr(addRep(addHealth(s, -3), { virtue: 3 }), `한나절 땀을 흘려 도랑을 새로 냈다. 해 질 녘, 영감이 ${brew(s)} 한 사발을 들고 담을 넘어왔다. (인덕 +3)`);
        if (opt === 'threaten') return narr(addRep(s, { ruthless: 4, virtue: -2 }), '영감이 지팡이를 떨어뜨렸다. 그 뒤로 수챗물 이야기는 다시 나오지 않았다. 담 너머에서 들리던 영감의 헛기침 소리도 끊겼다. (살기 +4, 인덕 -2)');
        if (opt === 'pay') return narr(addRep(addMoney(s, -15), { commerce: 2 }), '술값 몇 푼에 영감의 노기가 금세 풀렸다. 다음 장마 때 또 올 것 같기는 하다. (상무 +2)');
        return chance(Number(c.data?.p) || 0.4)
          ? narr(addStats(s, { ins: 1 }), `「영감 댁 마당이 원래 우리보다 낮소.」 ${byCountry(s, '이장', '촌장', '촌장')}까지 불러 땅 높이를 재 보고서야 영감이 입을 다물었다. (통찰 +1)`)
          : narr(addFame(addRep(s, { virtue: -2 }), -2), '말싸움이 길어졌다. 고을에 「도장이 노인을 이겨 먹으려 한다」는 말이 돌았다. (인덕 -2, 명성 -2)');
      },
    },
  ],
  { cond: (s) => s.turn >= 8 }
);

// ═════════ 3. 중매쟁이 — 제자의 혼처 ═════════
const MATCH = '중매쟁이 할머니';
const fem = isFemaleDisc;
const partnerOf = (d: Disciple) => (fem(d) ? '신랑감' : '색싯감');
const callOf = (d: Disciple) => `${d.name} ${fem(d) ? '아가씨' : '총각'}`;
const adults = (s: GameState) => alive(s).filter((d) => d.age >= 18);
const matchAsk = (s: GameState, d: Disciple, onYes: (n: GameState) => GameState): GameState =>
  chance(0.55)
    ? onYes(s)
    : narr(tuneDisc(s, d.id, { loyalty: 5 }), `${josa(d.name, '은는')} 한참 생각하더니 「아직은 칼이 먼저입니다」 하고 고개를 저었다. 중매쟁이 할머니가 혀를 차며 돌아갔다. (제자 충성 +5)`);
const matchRefuse = (s: GameState, d: Disciple, loyalty: number, ascetic: number): GameState =>
  narr(addRep(tuneDisc(s, d.id, { loyalty }), { ascetic }), `${josa(d.name, '은는')} 말없이 고개를 숙였다. 그날 밤 연무장에서 늦게까지 목검 소리가 났다. (구도 +${ascetic}, 제자 충성 ${loyalty})`);
const plainWedding = (s: GameState, d: Disciple): GameState =>
  narr(addRep(tuneDisc(s, d.id, { loyalty: 8 }), { virtue: 2 }), `${josa(d.name, '은는')} 얼굴을 붉히며 「스승님만 허락하시면…」 하고 말끝을 흐렸다. 날을 잡아 조촐하게 혼례를 치렀다. (인덕 +2, 제자 충성 +8)`);
const matchBuild = (s: GameState, d: Disciple, title: string, opener: string, line: string, dir: string, options: JourneyEventBody['options']): JourneyEventBody => ({
  title,
  category: 'LIFE',
  speaker: MATCH,
  narration: `중매쟁이 할머니가 ${d.name}의 혼처를 들고 찾아왔다.`,
  script: [N(opener), P(MATCH, line, dir)],
  options,
  meta: { did: d.id },
});
const askOpt = (d: Disciple) => ({ id: 'ask', label: `${d.name}의 뜻부터 묻는다`, hint: '제자 충성 +5 이상' });
const matchmaker = homeTemplate(
  'mid_matchmaker',
  [
    {
      id: 'rich',
      build: (s) => {
        const d = rand(adults(s));
        const shop = byCountry(s, '읍내 객주', '성안 비단 가게', '오사카 포목상');
        return matchBuild(
          s,
          d,
          `${d.name}에게 들어온 부잣집 혼처`,
          '중매쟁이 할머니가 마루 끝에 엉덩이를 붙이자마자 부채질을 하며 입을 연다.',
          `${callOf(d)} 혼처로 ${shop} 집 ${partnerOf(d)}이 났지 뭐요. 다만 그 댁에서는 혼인하면 칼을 놓고 장사를 배우라는 조건이라…`,
          '부채를 접으며',
          [
            { id: 'support', label: '좋은 자리다, 밀어 주마', hint: '제자가 하산할 수도 · 인덕 +3' },
            askOpt(d),
            { id: 'refuse', label: '칼을 놓으라는 혼처라면 안 된다', hint: '구도 +3 · 제자 충성 -6' },
          ]
        );
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        const yes = (n: GameState): GameState => {
          const inlaw = fem(d) ? '시댁' : '처가';
          if (d.role !== 'HEIR' && chance(0.55)) {
            return narr(addFame(addRep(depart(n, d.id, `혼인하여 ${inlaw} 장사를 이음`), { virtue: 3 }), 3), `${josa(d.name, '은는')} 혼례를 올리고 ${inlaw} 가게에 들어앉았다. 떠나는 날, 마당 한가운데서 오래 절을 올렸다. (인덕 +3 · ${d.name} 하산)`);
          }
          return narr(addMoney(addRep(tuneDisc(n, d.id, { loyalty: 10 }), { virtue: 3 }), 40), `${inlaw}에서 칼을 계속 잡게 해 주기로 한발 물러섰다. 혼례 날, 사돈댁에서 도장에 예물을 보내왔다. (+${coin(s, 40)} · 인덕 +3 · 제자 충성 +10)`);
        };
        if (opt === 'support') return yes(s);
        if (opt === 'ask') return matchAsk(s, d, yes);
        return matchRefuse(s, d, -6, 3);
      },
    },
    {
      id: 'poor',
      build: (s) => {
        const d = rand(adults(s));
        return matchBuild(
          s,
          d,
          `${d.name}의 가난한 혼처`,
          '중매쟁이 할머니가 이번에는 어쩐지 목소리를 낮춘다.',
          `건넛마을 ${byCountry(s, '소작농', '소작농', '소작인')} 집 ${partnerOf(d)}인데, 사람 하나는 진국이에요. 다만 혼수 마련할 형편이 못 돼서…`,
          '한숨을 쉬며',
          [
            { id: 'support', label: `혼수를 보태 준다 (${coin(s, 30)})`, hint: '인덕 +5 · 제자 충성 +14', ...short(s, 30) },
            askOpt(d),
            { id: 'refuse', label: '아직 혼인할 때가 아니다', hint: '구도 +3 · 제자 충성 -6' },
          ]
        );
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'support') {
          return narr(addRep(tuneDisc(addMoney(s, -30), d.id, { loyalty: 14 }), { virtue: 5 }), `조촐한 혼례였다. ${fem(d) ? '신부' : '신랑'} 쪽 혼주 자리에는 스승이 앉았다. ${josa(d.name, '은는')} 그날 처음으로 스승 앞에서 울었다. (인덕 +5, 제자 충성 +14)`);
        }
        if (opt === 'ask') return matchAsk(s, d, (n) => plainWedding(n, d));
        return matchRefuse(s, d, -6, 3);
      },
    },
    {
      id: 'official',
      build: (s) => {
        const d = rand(adults(s));
        return matchBuild(
          s,
          d,
          `관아 집안에서 온 ${d.name}의 혼담`,
          '중매쟁이 할머니가 이번에는 꽤 으스대는 얼굴이다.',
          `${byCountry(s, '이방', '현청 서리', '다이칸소 관리')} 어른 댁 ${partnerOf(d)}이에요. 이 혼사만 되면 관아에 든든한 끈이 생기는 거지요.`,
          '눈을 찡긋하며',
          [
            { id: 'support', label: '좋은 인연이다, 혼담을 넣어 준다', hint: '상무 +4 · 명성 +5 · 제자 충성 +8' },
            askOpt(d),
            { id: 'refuse', label: '관아에 줄을 대려고 제자를 팔 수는 없다', hint: '구도 +4 · 제자 충성 -3' },
          ]
        );
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        const yes = (n: GameState) =>
          narr(addFame(addRep(tuneDisc(n, d.id, { loyalty: 8 }), { commerce: 4 }), 5), '혼사가 성사되었다. 그 뒤로 관아 일로 도장에 트집 잡는 일이 눈에 띄게 줄었다. (상무 +4, 명성 +5, 제자 충성 +8)');
        if (opt === 'support') return yes(s);
        if (opt === 'ask') return matchAsk(s, d, yes);
        return matchRefuse(s, d, -3, 4);
      },
    },
    {
      id: 'martial',
      build: (s) => {
        const d = rand(adults(s));
        return matchBuild(
          s,
          d,
          `무가에서 온 ${d.name}의 혼담`,
          '중매쟁이 할머니가 무릎을 탁 치며 들어선다.',
          `${byCountry(s, '몰락한 무관 집안', '몰락한 무관 집안', '몰락한 무가(武家)')} ${partnerOf(d)}인데, 그 집 ${fem(d) ? '도령' : '아가씨'}도 어려서부터 활을 쏘았대요. 칼 쓰는 집끼리 맺어지면 좀 좋아요?`,
          '손뼉을 치며',
          [
            { id: 'support', label: '좋다, 무가의 인연을 맺어 주마', hint: '제자 충성 +10 · 제자 근력 +1 · 정신 +2' },
            askOpt(d),
            { id: 'refuse', label: '아직 혼인할 때가 아니다', hint: '구도 +3 · 제자 충성 -6' },
          ]
        );
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        const yes = (n: GameState) =>
          narr(tuneDisc(n, d.id, { loyalty: 10, str: 1, wil: 2 }), '혼례 날, 신랑 신부가 맞절을 마치고 마당에서 활을 한 대씩 쏘았다. 두 화살 모두 과녁 한가운데에 꽂혔다. (제자 충성 +10, 근력 +1, 정신 +2)');
        if (opt === 'support') return yes(s);
        if (opt === 'ask') return matchAsk(s, d, yes);
        return matchRefuse(s, d, -6, 3);
      },
    },
  ],
  { cond: (s) => s.turn >= 10 && adults(s).length > 0 }
);

// ═════════ 4. 화공과 명필 — 도장이 그림과 글씨가 되는 날 ═════════
const artist = homeTemplate(
  'mid_artist',
  [
    {
      id: 'portrait',
      build: (s) => ({
        title: '붓통을 멘 떠돌이 화공',
        category: 'LIFE',
        speaker: '떠돌이 화공',
        narration: '붓통을 멘 떠돌이 화공이 마루 끝에 걸터앉아 도장주의 얼굴을 한참 들여다본다.',
        script: [
          N('붓통을 멘 떠돌이 화공이 마루 끝에 걸터앉아 도장주의 얼굴을 한참 들여다본다.'),
          P('떠돌이 화공', `칼 쓰는 분 얼굴은 그리기가 어렵지요. 눈빛을 종이에 가둬야 하니까. ${coin(s, 30)}만 주시면 한 폭 남겨 드리리다.`, '붓을 꺼내 들며'),
        ],
        options: [
          { id: 'sit', label: `초상을 맡긴다 (${coin(s, 30)})`, hint: '명성 +6 · 정신 +1', ...short(s, 30) },
          { id: 'lodge', label: '그림값 대신 사흘 묵어 가게 해 준다', hint: '인덕 +3 · 무엇을 그려 줄지는 화공 마음' },
          {
            id: 'doorgod',
            label: `대문에 붙일 ${byCountry(s, '문배(門排) 그림', '문신(門神) 그림', '쇼키(鍾馗) 그림')}을 청한다 (${coin(s, 10)})`,
            hint: '이단 +3 · 정신 +1',
            ...short(s, 10),
          },
          { id: 'decline', label: '얼굴 그림 따위는 필요 없다며 돌려보낸다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'sit') {
          const n = addStats(addFame(addMoney(s, -30), 6), { wil: 1 });
          return narr(n, `사흘 뒤 받아 든 초상 속 사람은 생각보다 늙어 있었고, 생각보다 단단해 보였다. ${alive(s).length ? '제자들이 대청에 걸자고 졸랐다.' : '한참을 들여다보다 벽에 걸었다.'} (명성 +6, 정신 +1)`);
        }
        if (opt === 'doorgod') {
          return narr(
            addStats(addRep(addMoney(s, -10), { arcane: 3 }), { wil: 1 }),
            `화공이 붉은 먹으로 ${byCountry(s, '칼 든 장수', '칼 든 장수', '칼 든 쇼키')}를 그려 대문에 붙였다. 부릅뜬 눈이 밤에도 번득이는 것 같았다. 그날부터 이상하게 동네 개들이 도장 앞에서 짖지 않았다. (이단 +3, 정신 +1)`
          );
        }
        if (opt === 'lodge') {
          const n = addRep(s, { virtue: 3 });
          return chance(0.6)
            ? narr(addFame(n, 5), '떠나는 날 아침, 화공은 도장 마당을 그린 그림 한 폭을 마루에 두고 갔다. 장터에 걸린 그 그림을 보고 도장을 찾아온 사람도 있었다. (인덕 +3, 명성 +5)')
            : narr(addStats(n, { ins: 1 }), `화공은 사흘 내내 술만 마시다 떠났다. 그래도 밤마다 들려준 ${byCountry(s, '팔도', '천하 각지', '여러 지방')} 이야기가 쏠쏠했다. (인덕 +3, 통찰 +1)`);
        }
        return narr(s, '화공은 어깨를 으쓱하고 붓통을 다시 멨다.');
      },
    },
    {
      id: 'screen',
      when: (s) => alive(s).length > 0,
      build: (s) => ({
        title: '수련도(修練圖) 병풍',
        category: 'LIFE',
        speaker: '병풍 화공',
        narration: '어느 화공이 연무장 담에 기대어 제자들의 수련을 그리고 있다.',
        script: [
          N('어느 화공이 연무장 담에 기대어 제자들의 수련을 그리고 있다. 수련도를 병풍으로 꾸며 부잣집에 팔겠다는 것이다.'),
          P('병풍 화공', '그림값의 얼마는 도장에 드리지요. 다만 한 가지 — 가장 멋진 초식을 딱 한 번만 천천히 보여 주시오.', '먹을 갈며'),
        ],
        options: [
          { id: 'allow', label: '마음껏 그리게 한다', hint: `+${coin(s, 20)} · 명성 +6 · 상무 +2` },
          { id: 'pose', label: '직접 초식을 펼쳐 보인다', hint: '명성 +10 · 초식이 새어 나갈 수도' },
          { id: 'decline', label: '도장의 수련은 구경거리가 아니다', hint: '구도 +3' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'allow') return narr(addRep(addFame(addMoney(s, 20), 6), { commerce: 2 }), '병풍은 이웃 고을 부잣집 사랑방에 놓였다고 한다. 그 앞에서 「저 도장에 가 보고 싶다」고 말한 젊은이가 있었다는 소문이다. (명성 +6, 상무 +2)');
        if (opt === 'pose') {
          return chance(0.3)
            ? narr(addFame(s, 6), '병풍 속 초식을 보고 흉내 낸 이웃 도장이 생겼다. 흉내는 흉내일 뿐이지만 기분이 개운치 않았다. (명성 +6)')
            : narr(addFame(s, 10), '병풍 한가운데 칼을 뻗은 사람이 그려졌다. 소문을 들은 구경꾼들이 도장 앞을 기웃거렸다. (명성 +10)');
        }
        return narr(addRep(s, { ascetic: 3 }), '화공이 아쉬운 얼굴로 그리던 종이를 말았다. 제자들은 은근히 서운한 눈치였다. (구도 +3)');
      },
    },
    {
      id: 'calligrapher',
      build: (s) => ({
        title: '명필 선비의 일필휘지',
        category: 'LIFE',
        speaker: '나그네 선비',
        narration: '지나가던 선비 하나가 대문 위 현판을 올려다보며 혀를 찬다.',
        script: [
          N('지나가던 선비 하나가 대문 위 현판을 올려다보며 혀를 찬다.'),
          P('나그네 선비', '글씨가 칼을 못 따라가는구려. 먹과 종이만 내주시면 새로 써 드리지요. 값은… 술 한 동이면 족하오.', '수염을 쓰다듬으며'),
        ],
        options: [
          { id: 'accept', label: `술 한 동이를 받아 와 대접한다 (${coin(s, 15)})`, hint: '명성 +10 · 정신 +1', ...short(s, 15) },
          { id: 'self', label: '「내 도장 현판은 내 손으로 쓴다」며 사양한다', hint: '구도 +4 · 통찰 +1' },
          { id: 'decline', label: '지금 글씨가 좋다며 돌려보낸다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'accept') return narr(addStats(addFame(addMoney(s, -15), 10), { wil: 1 }), '선비는 술 반 동이를 비우더니 단숨에 현판 글씨를 써 내렸다. 획 하나하나가 칼자국처럼 곧았다. 새 현판이 걸린 날, 지나던 사람들이 발을 멈추고 올려다보았다. (명성 +10, 정신 +1)');
        if (opt === 'self') return narr(addStats(addRep(s, { ascetic: 4 }), { ins: 1 }), '선비가 껄껄 웃으며 「그 마음이면 글씨는 절로 따라오겠구려」 하고 떠났다. 그날 밤 먹을 갈아 현판 글씨를 몇 번이고 다시 써 보았다. (구도 +4, 통찰 +1)');
        return narr(s, '선비는 「아깝구려」 한마디를 남기고 갔다.');
      },
    },
    {
      // 홀로 현판을 올려다보는 한때 — 화자가 없다
      id: 'faded',
      build: (s) => ({
        title: '비바람에 바랜 현판',
        category: 'LIFE',
        narration: '비바람에 바랜 현판 글씨가 이제는 가까이 가야 겨우 읽힌다. 도장을 처음 열던 날 손수 써서 건 현판이다.',
        script: [
          N('비바람에 바랜 현판 글씨가 이제는 가까이 가야 겨우 읽힌다. 도장을 처음 열던 날 손수 써서 건 현판이다.'),
          H(s, '그날은 손이 떨려 획이 삐뚤었지. 그래도 저 글씨 아래서 많은 것이 자랐구나.', '현판을 올려다보며'),
        ],
        options: [
          { id: 'repaint', label: '먹을 갈아 손수 덧칠한다', hint: alive(s).length ? '정신 +2 · 제자 충성 +2' : '정신 +2' },
          { id: 'carve', label: `각수(刻手)를 불러 새로 새긴다 (${coin(s, 30)})`, hint: '명성 +6 · 상무 +2', ...short(s, 30) },
          { id: 'keep', label: '바랜 대로 둔다 — 세월도 도장의 일부다', hint: '구도 +5' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'repaint') {
          const n = tuneAll(addStats(s, { wil: 2 }), { loyalty: 2 });
          return alive(s).length
            ? narr(n, '제자들이 사다리를 붙들고, 스승이 그 위에서 획을 덧그었다. 다 칠하고 내려오니 다들 먹물투성이였다. (정신 +2, 제자 충성 +2)')
            : narr(n, '사다리에 올라 한 획 한 획 덧그었다. 처음 쓰던 날의 떨림이 손끝에 되살아났다. (정신 +2)');
        }
        if (opt === 'carve') return narr(addRep(addFame(addMoney(s, -30), 6), { commerce: 2 }), '각수가 새긴 현판은 반듯하고 깊었다. 대문이 한결 위엄 있어 보였다. (명성 +6, 상무 +2)');
        return narr(addRep(s, { ascetic: 5 }), '바랜 글씨 그대로 두었다. 오래된 도장이라는 것을 현판이 먼저 말해 주었다. (구도 +5)');
      },
    },
  ],
  { cond: (s) => s.turn >= 10 && s.fame >= 50, weight: 0.9 }
);

// ═════════ 5. 도장에 깃든 짐승 — 홀로 겪는 한때 ═════════
const creature = homeTemplate(
  'mid_creature',
  [
    {
      id: 'dog',
      when: (s) => !s.flags.storyMemory?.dojo_dog,
      build: (s) => ({
        title: '대문 밑의 누렁이',
        category: 'LIFE',
        narration: '비쩍 마른 누렁이 한 마리가 며칠째 대문 밑에 엎드려 있다. 쫓아도 저만치 갔다가 다시 돌아온다.',
        script: [N('비쩍 마른 누렁이 한 마리가 며칠째 대문 밑에 엎드려 있다. 쫓아도 저만치 갔다가 다시 돌아온다.'), H(s, '너도 갈 데가 없는 게로구나.', '쪼그려 앉으며')],
        options: [
          { id: 'keep', label: '거두어 도장 개로 삼는다', hint: '인덕 +2 · 정신 +1' },
          { id: 'feed', label: '밥만 한 그릇씩 챙겨 준다', hint: '인덕 +1' },
          { id: 'chase', label: '도장에 짐승은 들이지 않는다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'keep') return narr(addStats(addRep(remember(s, 'dojo_dog', String(s.year)), { virtue: 2 }), { wil: 1 }), '누렁이는 그날부터 대문 옆에 자리를 잡았다. 낯선 사람이 오면 누구보다 먼저 알았다. (인덕 +2, 정신 +1)');
        if (opt === 'feed') return narr(addRep(s, { virtue: 1 }), '누렁이는 밥때마다 나타났다가 어디론가 사라지곤 했다. (인덕 +1)');
        return narr(s, '돌멩이를 던지는 시늉을 하자 누렁이가 꼬리를 말고 사라졌다. 이튿날 아침, 대문 밑이 이상하게 허전했다.');
      },
    },
    {
      id: 'cat',
      when: (s) => !s.flags.storyMemory?.dojo_cat,
      build: (s) => ({
        title: '장서각에 눌러앉은 고양이',
        category: 'LIFE',
        narration: '장서각 서가 꼭대기에 얼룩고양이 한 마리가 자리를 잡았다. 그 뒤로 비급을 갉던 쥐가 싹 사라졌다.',
        script: [N('장서각 서가 꼭대기에 얼룩고양이 한 마리가 자리를 잡았다. 그 뒤로 비급을 갉던 쥐가 싹 사라졌다.'), H(s, '책 지키는 데는 사람보다 낫구나.', '서가를 올려다보며')],
        options: [
          { id: 'keep', label: '장서각 지기로 삼는다', hint: '통찰 +1 · 인덕 +1' },
          { id: 'feed', label: '생선 대가리를 챙겨 준다', hint: '인덕 +1' },
          { id: 'chase', label: '비급에 털이 붙는다며 내쫓는다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'keep') return narr(addRep(addStats(remember(s, 'dojo_cat', String(s.year)), { ins: 1 }), { virtue: 1 }), '얼룩이는 장서각 문지방을 베고 낮잠을 잤다. 비급을 펼칠 때마다 무릎에 올라와 앉았는데, 이상하게 글이 더 잘 읽혔다. (통찰 +1, 인덕 +1)');
        if (opt === 'feed') return narr(addRep(s, { virtue: 1 }), '얼룩이는 생선 대가리를 물고 서가 위로 사라졌다. 쥐는 여전히 얼씬도 하지 않았다. (인덕 +1)');
        return narr(s, '고양이를 내쫓은 지 한 달 만에 비급 한 귀퉁이가 쥐에게 갉혔다.');
      },
    },
    {
      id: 'crane',
      build: (s) => ({
        title: '다리 다친 학',
        category: 'LIFE',
        narration: '연무장 끝 논두렁에 다리를 다친 학 한 마리가 주저앉아 있다. 날개를 퍼덕이다가 이내 고개를 떨군다.',
        script: [N('연무장 끝 논두렁에 다리를 다친 학 한 마리가 주저앉아 있다. 날개를 퍼덕이다가 이내 고개를 떨군다.'), H(s, '학은 천 년을 산다는데, 너는 여기서 멈출 셈이냐.', '다가가며')],
        options: [
          { id: 'tend', label: '부목을 대고 한 철 돌본다', hint: '구도 +4 · 인덕 +2 · 정신 +1' },
          { id: 'leave', label: '자연의 일은 자연에 맡긴다', hint: '구도 +2' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'tend') return narr(addStats(addRep(s, { ascetic: 4, virtue: 2 }), { wil: 1 }), '학은 한 철 동안 마당을 절뚝이며 오갔다. 어느 맑은 아침, 연무장 위를 세 바퀴 돌더니 하늘 높이 날아갔다. 그 날갯짓에서 초식 하나를 보았다. (구도 +4, 인덕 +2, 정신 +1)');
        return narr(addRep(s, { ascetic: 2 }), '이튿날 논두렁은 비어 있었다. 날아갔는지, 다른 무엇이 되었는지는 알 수 없다. (구도 +2)');
      },
    },
    {
      id: 'swallow',
      when: (s) => s.season === 'SPRING' || s.season === 'SUMMER',
      build: (s) => ({
        title: '처마 밑 제비 둥지',
        category: 'LIFE',
        narration: '처마 밑에 제비가 둥지를 틀었다. 새끼들이 노란 부리를 벌리고 울어 댄다.',
        script: [
          N('처마 밑에 제비가 둥지를 틀었다. 새끼들이 노란 부리를 벌리고 울어 댄다. 기합 소리가 날 때마다 어미 제비가 놀라 날아오른다.'),
          H(s, '제비가 깃드는 집에는 복이 든다더니.', '처마를 올려다보며'),
        ],
        options: [
          { id: 'quiet', label: '새끼들이 날 때까지 처마 쪽 수련을 쉰다', hint: '인덕 +2 · 구도 +2' },
          { id: 'move', label: '둥지를 헛간 처마로 옮겨 단다' },
          { id: 'ignore', label: '아랑곳하지 않고 수련을 계속한다', hint: '장착 초식 숙련 +10' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'quiet') return narr(addRep(s, { virtue: 2, ascetic: 2 }), '새끼들이 다 자라 날아갈 때까지 처마 밑은 조용했다. 그 덕에 기합 소리가 오히려 단정해졌다. (인덕 +2, 구도 +2)');
        if (opt === 'move') return narr(s, '어미 제비는 한참을 맴돌다가 겨우 새 둥지를 찾아 들어갔다. 마음 한구석이 찜찜했다.');
        return narr(trainEquipped(s, 10), '기합 소리와 제비 울음이 한 철 내내 뒤섞였다. 새끼들도 결국 다 자라 날아갔다. (장착 초식 숙련 +10)');
      },
    },
    {
      id: 'magpie',
      when: (s) => s.country !== 'JAPAN',
      build: (s) => {
        const bird = byCountry(s, '까치', '희작(喜鵲)', '까치');
        return {
          title: '아침 까치',
          category: 'LIFE',
          narration: `아침부터 감나무 가지에서 ${josa(bird, '이가')} 요란하게 운다. 까치가 울면 반가운 손님이 온다고들 한다.`,
          script: [N(`아침부터 감나무 가지에서 ${josa(bird, '이가')} 요란하게 운다. 까치가 울면 반가운 손님이 온다고들 한다.`), H(s, '오늘은 누가 오려나.', '대문 쪽을 내다보며')],
          options: [
            { id: 'wait', label: '대문을 활짝 열어 둔다', hint: '반가운 소식이 올지도' },
            { id: 'ignore', label: '미신이다 — 수련이나 하자', hint: '구도 +2' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'wait') {
          return chance(0.5)
            ? narr(addMoney(s, 20), `해 질 녘, 예전에 도와준 ${byCountry(s, '보부상', '행상', '행상')}이 지나는 길이라며 돈 꾸러미를 두고 갔다. (+${coin(s, 20)})`)
            : narr(addHealth(s, 2), '손님은 오지 않았다. 대신 저녁상에 까치밥으로 남겨 두었던 홍시가 올라왔다. (건강 +2)');
        }
        return narr(addRep(s, { ascetic: 2 }), '까치 소리를 등 뒤로 하고 목검을 들었다. 그날따라 칼끝이 가벼웠다. (구도 +2)');
      },
    },
    {
      id: 'fox',
      when: (s) => s.country === 'JAPAN' && s.season !== 'SUMMER',
      build: (s) => ({
        title: '서리 위의 여우 발자국',
        category: 'LIFE',
        narration: '새벽 서리 위로 여우 한 마리가 마당을 가로질러 간다. 이나리(稲荷) 신의 심부름꾼이라는 말이 떠오른다.',
        script: [N('새벽 서리 위로 여우 한 마리가 마당을 가로질러 간다. 이나리(稲荷) 신의 심부름꾼이라는 말이 떠오른다.'), H(s, '…좋은 징조인가, 나쁜 징조인가.', '숨을 죽이며')],
        options: [
          { id: 'offer', label: '유부 한 접시를 담장 위에 놓아둔다', hint: '이단 +1 · 인덕 +1' },
          { id: 'ignore', label: '짐승은 짐승일 뿐이다', hint: '구도 +2' },
        ],
      }),
      resolve: (s, opt) =>
        opt === 'offer'
          ? narr(addRep(s, { arcane: 1, virtue: 1 }), '이튿날 아침 접시는 깨끗이 비어 있었다. 그해 쌀독이 유난히 오래갔다. (이단 +1, 인덕 +1)')
          : narr(addRep(s, { ascetic: 2 }), '여우는 담 밑 구멍으로 사라졌다. 발자국만 해가 뜰 때까지 서리 위에 남아 있었다. (구도 +2)'),
    },
  ],
  { cond: (s) => s.turn >= 4, weight: 0.85 }
);

// ═════════ 6. 곳간 도둑 — 굶주림이 대문을 넘을 때 ═════════
const thief = homeTemplate(
  'mid_thief',
  [
    {
      id: 'rice_jar',
      build: () => ({
        title: '쌀독에 팔을 넣은 아이',
        category: 'LIFE',
        speaker: '도둑 꼬마',
        narration: '새벽녘 부엌에서 덜그럭 소리가 났다.',
        script: [N('새벽녘 부엌에서 덜그럭 소리가 났다. 가 보니 깡마른 아이 하나가 쌀독에 팔을 넣은 채 얼어붙어 있다.'), P('도둑 꼬마', '…동생이 사흘을 굶었어요. 한 됫박만…', '울먹이며')],
        options: [
          { id: 'forgive', label: '쌀을 자루에 담아 들려 보낸다', hint: '인덕 +5' },
          { id: 'work', label: '사흘 동안 마당을 쓸게 하고 쌀을 준다', hint: '구도 +2 · 인덕 +2 · 쓸 만한 아이일지도' },
          { id: 'magistrate', label: '도둑은 도둑이다 — 관아에 넘긴다', hint: '상무 +2 · 인덕 -5' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'forgive') return narr(addRep(addMoney(s, -8), { virtue: 5 }), '아이는 쌀자루를 끌어안고 몇 번이나 뒤돌아 절을 하며 사라졌다. (인덕 +5)');
        if (opt === 'work') {
          let n = addRep(s, { ascetic: 2, virtue: 2 });
          if (hasRoom(n) && chance(0.3)) {
            const d = { ...createDiscipleEntity(n, { archetype: '쌀독을 뒤지던 아이' }), age: 12 + Math.floor(Math.random() * 3), tuition: 0 };
            n = { ...n, disciples: [...n.disciples, d] };
            return narr(n, `사흘 내내 마당을 쓰는 손이 야무졌다. 나흘째 아침에도 ${josa(d.name, '이가')} 빗자루를 들고 나타났다. 그대로 막내 제자가 되었다. (구도 +2, 인덕 +2)`);
          }
          return narr(n, '아이는 사흘 동안 마당을 반들반들하게 쓸고, 쌀자루를 메고 돌아갔다. (구도 +2, 인덕 +2)');
        }
        return narr(addRep(s, { commerce: 2, virtue: -5 }), '포졸이 아이의 손목을 묶어 데려갔다. 그날 부엌 쌀독이 유난히 무거워 보였다. (상무 +2, 인덕 -5)');
      },
    },
    {
      id: 'offering',
      build: (s) => {
        const food = byCountry(s, '시루떡', '만두', '경단');
        return {
          title: byCountry(s, '사당의 시루떡이 사라진 밤', '사당의 만두가 사라진 밤', '사당의 경단이 사라진 밤'),
          category: 'LIFE',
          speaker: '도둑 꼬마',
          narration: `사당에 올려 둔 ${josa(food, '이가')} 감쪽같이 사라졌다.`,
          script: [
            N(`사당에 올려 둔 ${josa(food, '이가')} 감쪽같이 사라졌다. 범인은 담장 밑 개구멍에서 입가에 부스러기를 묻힌 채 잡혔다.`),
            P('도둑 꼬마', '…조상님은 어차피 안 드시잖아요.', '입을 쓱 닦으며'),
          ],
          options: [
            { id: 'forgive', label: '「조상님도 웃으시겠다」며 남은 것까지 싸 준다', hint: '인덕 +4' },
            { id: 'work', label: '사당 마당을 쓸게 한다', hint: '구도 +2' },
            { id: 'scold', label: '호되게 꾸짖어 돌려보낸다', hint: '구도 +1' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'forgive') return narr(addRep(s, { virtue: 4 }), '아이는 보따리를 받아 들고 눈이 휘둥그레졌다. 그 뒤로 명절마다 누가 두고 갔는지 모를 산나물 한 줌이 대문 앞에 놓였다. (인덕 +4)');
        if (opt === 'work') return narr(addRep(s, { ascetic: 2 }), '아이는 투덜거리며 사당 마당을 쓸었다. 다 쓸고 나서는 사당 앞에 넙죽 절까지 하고 갔다. (구도 +2)');
        return narr(addRep(s, { ascetic: 1 }), '호통 한 번에 아이가 개구멍으로 줄행랑을 쳤다. 개구멍이 조금 더 넓어져 있었다. (구도 +1)');
      },
    },
    {
      id: 'old_man',
      build: (s) => ({
        title: '곡식 자루를 끌던 노인',
        category: 'LIFE',
        speaker: '굶주린 노인',
        narration: '곳간 문이 반쯤 열려 있다.',
        script: [
          N('곳간 문이 반쯤 열려 있고, 등이 굽은 노인 하나가 곡식 자루를 끌고 나가다 문지방에 걸려 넘어져 있다.'),
          P('굶주린 노인', '…며느리가 해산을 했는데 먹일 게 없어서… 이 늙은 것이 염치를 버렸소.', '고개를 들지 못하며'),
        ],
        options: [
          { id: 'forgive', label: `자루째 들려 보낸다 (곡식 ${coin(s, 15)}어치)`, hint: '인덕 +5' },
          { id: 'work', label: '도장 허드렛일을 거들어 갚으시라 한다', hint: '인덕 +3 · 상무 +2' },
          { id: 'triple', label: '노인의 아들을 불러 곡식값을 세 배로 물리고, 못 내면 품으로 받아 낸다', hint: `+${coin(s, 25)} · 살기 +4 · 인덕 -2` },
          { id: 'magistrate', label: '도둑은 도둑이다 — 관아에 넘긴다', hint: '상무 +2 · 인덕 -7' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'forgive') return narr(addRep(addMoney(s, -15), { virtue: 5 }), '노인은 자루를 지고 몇 걸음 가다 돌아서서 땅에 이마를 댔다. 이듬해 봄, 노인의 아들이 품삯도 받지 않고 도장 지붕을 고쳐 주고 갔다. (인덕 +5)');
        if (opt === 'triple') return narr(addRep(addMoney(s, 25), { ruthless: 4, virtue: -2 }), `노인의 아들이 ${zeni(s)}을 꿔 와 세 배 값을 치렀다. 모자란 몫은 한 달 동안 도장 장작을 패서 갚았다. 아들은 끝내 눈을 마주치지 않았다. (+${coin(s, 25)}, 살기 +4, 인덕 -2)`);
        if (opt === 'work') return narr(addRep(s, { virtue: 3, commerce: 2 }), '노인은 한 달 동안 도장 장작을 패고 물을 길었다. 일을 마치는 날, 곡식 자루를 메고 가는 노인의 허리가 조금 펴져 있었다. (인덕 +3, 상무 +2)');
        return narr(addRep(s, { commerce: 2, virtue: -7 }), '포졸들이 노인을 끌고 갔다. 며칠 뒤, 그 집 며느리가 젖먹이를 업고 관아 앞에서 울고 있더라는 말이 들렸다. (상무 +2, 인덕 -7)');
      },
    },
    {
      id: 'chicken',
      build: (s) => ({
        title: '닭서리 하다 붙들린 아이들',
        category: 'LIFE',
        speaker: '동네 꼬마',
        narration: '한밤중 닭장이 요란하다.',
        script: [
          N(`한밤중 닭장이 요란하다. 동네 꼬마 셋이 닭 한 마리를 품에 안고 담을 넘으려다 ${alive(s).length ? '제자들에게' : '덜미를'} 붙들렸다.`),
          P('동네 꼬마', '잘못했어요! 그냥… 그냥 한번 해 본 거예요!', '닭을 꼭 끌어안은 채'),
        ],
        options: [
          { id: 'forgive', label: '닭은 돌려받고 군고구마를 먹여 보낸다', hint: '인덕 +3' },
          { id: 'parents', label: `부모들을 불러 닭값을 받는다 (+${coin(s, 10)})`, hint: '상무 +2' },
          { id: 'scare', label: '목검을 들고 혼쭐을 낸다', hint: '살기 +2 · 다시는 안 올 것이다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'forgive') return narr(addRep(s, { virtue: 3 }), '아이들은 군고구마를 받아 들고 입이 귀에 걸렸다. 그 뒤로 닭장 근처에 얼씬하는 아이는 없었다 — 대신 대문 근처를 자주 얼쩡거렸다. (인덕 +3)');
        if (opt === 'parents') return narr(addRep(addMoney(s, 10), { commerce: 2 }), '부모들이 아이들 귀를 잡아끌고 와 닭값을 치렀다. 아이들의 원망 어린 눈빛이 오래 남았다. (상무 +2)');
        return narr(addRep(s, { ruthless: 2 }), '목검이 허공을 가르는 소리에 아이들이 닭을 내던지고 혼비백산 달아났다. 셋 가운데 하나는 그날 밤 오줌을 쌌다는 소문이다. (살기 +2)');
      },
    },
  ],
  { cond: (s) => s.turn >= 6 }
);

// ═════════ 7. 떠돌이 의원 — 몸을 돌보는 사람들 ═════════
const physician = homeTemplate(
  'mid_physician',
  [
    {
      id: 'acupuncture',
      build: (s) => ({
        title: '침통을 든 떠돌이 의원',
        category: 'LIFE',
        speaker: '떠돌이 의원',
        narration: '침통을 허리에 찬 떠돌이 의원이 하룻밤 묵어 가기를 청한다.',
        script: [
          N('침통을 허리에 찬 떠돌이 의원이 하룻밤 묵어 가기를 청하며 도장주의 굽은 어깨를 흘끗 본다.'),
          P('떠돌이 의원', `어깨를 보아하니 칼을 오래 쓰셨구려. 굳은 데를 침 몇 대로 풀어 드리리다. ${coin(s, 25)}만 내시오.`, '침통을 열며'),
        ],
        options: [
          { id: 'treat', label: `침을 맞는다 (${coin(s, 25)})`, hint: '건강 회복 · 성공 확률 약 75%', ...short(s, 25) },
          ...(alive(s).length ? [{ id: 'disciples', label: `제자들 몸도 봐 달라 한다 (${coin(s, 35)})`, hint: '제자 충성 +3 · 제자들 체력 +1', ...short(s, 35) }] : []),
          { id: 'ghost', label: `의원이 숨겨 둔 「넋 나간 사람을 불러들인다」는 침법을 청한다 (${coin(s, 15)})`, hint: '이단 +4 · 통찰 +1', ...short(s, 15) },
          { id: 'decline', label: '침이라면 질색이라며 사양한다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'treat') {
          const n = addMoney(s, -25);
          return chance(0.75)
            ? narr(addHealth(n, 14), '침 몇 대에 어깨가 거짓말처럼 풀렸다. 칼을 들어 보니 몇 해 전의 팔이 돌아온 듯했다. (건강 +14)')
            : narr(addHealth(n, -2), '침 맞은 자리가 퉁퉁 부어 사흘을 고생했다. 의원은 이미 떠나고 없었다. (건강 -2)');
        }
        if (opt === 'ghost') return narr(addStats(addRep(addMoney(s, -15), { arcane: 4 }), { ins: 1 }), '의원이 침통 밑바닥에서 은침 열세 개를 꺼냈다. 「귀문십삼침(鬼門十三鍼)이오. 넋이 나간 사람을 불러들인다는 침자리지. 믿든 말든.」 밤이 깊도록 혈자리를 외웠다. (이단 +4, 통찰 +1)');
        if (opt === 'disciples') return narr(tuneAll(addMoney(s, -35), { loyalty: 3, vit: 1 }), '의원이 제자들을 줄 세워 하나하나 맥을 짚고 침을 놓았다. 「스승님이 우리 몸까지 챙기신다」며 제자들이 감격했다. (제자 충성 +3, 체력 +1)');
        return narr(s, '의원은 서운한 기색 없이 하룻밤을 묵고 새벽같이 떠났다.');
      },
    },
    {
      id: 'bonesetter',
      when: (s) => alive(s).length > 0,
      build: (s) => {
        const d = rand(alive(s));
        const p = clampP(0.45 + s.stats.ins * 0.005);
        return {
          title: '뼈 잘 맞추는 접골 의원',
          category: 'LIFE',
          speaker: '접골 의원',
          narration: `${josa(d.name, '이가')} 발목을 삐었다는 소문을 듣고, 접골 잘하기로 이름난 의원이 찾아왔다.`,
          script: [
            N(`${josa(d.name, '이가')} 발목을 삐었다는 소문을 듣고, 접골 잘하기로 이름난 의원이 찾아왔다.`),
            P('접골 의원', '삔 데를 그냥 두면 평생 절뚝입니다. 뼈 맞추는 요령, 사범님도 배워 두시면 두고두고 쓸 거요.', '소매를 걷으며'),
          ],
          options: [
            { id: 'treat', label: `치료를 맡긴다 (${coin(s, 20)})`, hint: '제자 충성 +5 · 제자 체력 +1', ...short(s, 20) },
            { id: 'learn', label: `접골 요령까지 배운다 (${coin(s, 40)})`, hint: '통찰 +2 · 건강 +4 · 제자 충성 +3', ...short(s, 40) },
            { id: 'self', label: '도장에 전하는 비방으로 직접 고친다', hint: `성공 확률 약 ${pct(p)}` },
          ],
          meta: { did: d.id, p },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'treat') return narr(tuneDisc(addMoney(s, -20), d.id, { loyalty: 5, vit: 1 }), `의원이 발목을 잡고 「뚝」 소리를 내자 ${josa(d.name, '이가')} 비명을 질렀다. 이레 뒤에는 멀쩡히 뛰어다녔다. (제자 충성 +5)`);
        if (opt === 'learn') return narr(tuneDisc(addHealth(addStats(addMoney(s, -40), { ins: 2 }), 4), d.id, { loyalty: 3 }), '의원에게 이틀 동안 뼈 맞추는 법을 배웠다. 내 몸에 묵은 결림도 덤으로 풀었다. (통찰 +2, 건강 +4)');
        return chance(Number(c.data?.p) || 0.5)
          ? narr(tuneDisc(addStats(s, { ins: 1 }), d.id, { loyalty: 4 }), `비방대로 발목을 맞추고 부목을 댔다. ${josa(d.name, '은는')} 스승의 손을 믿고 이를 악물었다. 발목은 반듯하게 붙었다. (통찰 +1, 제자 충성 +4)`)
          : narr(tuneDisc(s, d.id, { agi: -2 }), '발목이 비뚜름하게 붙었다. 한동안 발놀림이 둔했다. (제자 민첩 -2)');
      },
    },
    {
      id: 'quack',
      build: (s) => {
        const p = clampP(0.35 + s.stats.ins * 0.006);
        return {
          title: '만병통치 고약 장수',
          category: 'LIFE',
          sceneActor: 'MERCHANT',
          speaker: '고약 장수',
          narration: '북을 둥둥 치며 들어선 사내가 마당에 보따리를 펼친다. 검은 고약 덩어리가 수북하다.',
          script: [
            N('북을 둥둥 치며 들어선 사내가 마당에 보따리를 펼친다. 검은 고약 덩어리가 수북하다.'),
            P('고약 장수', `칼에 베인 데, 멍든 데, 삭신 쑤시는 데 — 이 고약 한 덩이면 다 낫소! 단돈 ${coin(s, 20)}!`, '북을 치며'),
          ],
          options: [
            { id: 'buy', label: `한 덩이 산다 (${coin(s, 20)})`, hint: '진짜일까?', ...short(s, 20) },
            { id: 'expose', label: '고약 덩이를 쪼개 속을 보인다', hint: `통찰 판정 약 ${pct(p)} · 성공 시 인덕 +4 · 명성 +5` },
            { id: 'decline', label: '돌려보낸다' },
          ],
          meta: { p },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'buy') {
          const n = addMoney(s, -20);
          return chance(0.3) ? narr(addHealth(n, 8), '뜻밖에 잘 듣는다. 묵은 멍이 사흘 만에 빠졌다. (건강 +8)') : narr(n, '사흘을 발라도 아무 변화가 없었다. 숯가루에 기름을 갠 것이었다.');
        }
        if (opt === 'expose') {
          return chance(Number(c.data?.p) || 0.4)
            ? narr(addFame(addRep(s, { virtue: 4 }), 5), '쪼갠 고약 속에서 숯가루와 돼지기름이 드러났다. 구경꾼들이 장수의 북을 빼앗아 던졌다. (인덕 +4, 명성 +5)')
            : narr(s, '쪼갠 속까지 그럴듯했다. 장수가 「거 보시오!」 하고 의기양양하게 외치는 통에 고약이 더 잘 팔렸다.');
        }
        return narr(s, '장수는 북을 메고 옆 동네로 갔다. 멀리서 북소리가 한참 들렸다.');
      },
    },
    {
      id: 'herb_woman',
      build: (s) => ({
        title: '약초 바구니를 진 의녀',
        category: 'LIFE',
        speaker: '떠돌이 의녀',
        narration: '약초 바구니를 등에 진 떠돌이 의녀가 하룻밤 묵어 가기를 청한다.',
        script: [
          N('약초 바구니를 등에 진 떠돌이 의녀가 하룻밤 묵어 가기를 청한다. 바구니에서 쌉싸름한 풀 냄새가 난다.'),
          P('떠돌이 의녀', '산에서 캔 것들이에요. 하룻밤 재워 주시면 약값은 받지 않고 진맥해 드릴게요.', '바구니를 내려놓으며'),
        ],
        options: [
          { id: 'lodge', label: '방을 내주고 진맥을 받는다', hint: '건강 +10 · 인덕 +2' },
          { id: 'herbs', label: `약초를 넉넉히 사 둔다 (${coin(s, 25)})`, hint: alive(s).length ? '건강 +6 · 제자 충성 +2' : '건강 +6', ...short(s, 25) },
          { id: 'decline', label: '방이 없다며 정중히 사양한다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'lodge') return narr(addRep(addHealth(s, 10), { virtue: 2 }), '의녀는 맥을 짚더니 「속에 열이 쌓였어요. 화를 좀 덜 내세요」라고 했다. 이튿날 아침 머리맡에 약봉지 세 개가 놓여 있었다. (건강 +10, 인덕 +2)');
        if (opt === 'herbs') {
          const n = tuneAll(addHealth(addMoney(s, -25), 6), { loyalty: 2 });
          return alive(s).length
            ? narr(n, '한 철 내내 도장 부엌에서 약초 달이는 냄새가 났다. 제자들 잔기침이 싹 들어갔다. (건강 +6, 제자 충성 +2)')
            : narr(n, '한 철 내내 부엌에서 약초 달이는 냄새가 났다. 묵은 잔기침이 싹 들어갔다. (건강 +6)');
        }
        return narr(s, '의녀는 고개를 끄덕이고 다음 마을로 향했다.');
      },
    },
    {
      id: 'moxa',
      when: (s) => s.country === 'JAPAN',
      build: (s) => ({
        title: '쑥뜸을 뜨는 노인',
        category: 'LIFE',
        speaker: '뜸 뜨는 노인',
        narration: '쑥 뭉치를 한 보따리 진 노인이 찾아왔다.',
        script: [
          N('쑥 뭉치를 한 보따리 진 노인이 찾아왔다. 무릎 아래 삼리(三里) 혈에 뜸을 뜨면 먼 길에도 다리가 지치지 않는다고 한다.'),
          P('뜸 뜨는 노인', '바쇼 선생도 먼 길 떠나기 전에 이 자리에 뜸을 떴다오. 칼 쓰는 사람 다리는 더 귀하지.', '쑥 뭉치를 비비며'),
        ],
        options: [
          { id: 'treat', label: `뜸을 뜬다 (${coin(s, 15)})`, hint: '건강 +8 · 체력 +1', ...short(s, 15) },
          ...(alive(s).length ? [{ id: 'disciples', label: `제자들 다리에도 떠 달라 한다 (${coin(s, 25)})`, hint: '제자 충성 +2 · 제자들 체력 +1', ...short(s, 25) }] : []),
          { id: 'decline', label: '뜸자리 흉터가 싫다며 사양한다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'treat') return narr(addStats(addHealth(addMoney(s, -15), 8), { vit: 1 }), '뜨거운 김이 무릎에서 발끝까지 내려갔다. 이튿날 아침, 연무장을 몇 바퀴 돌아도 다리가 가벼웠다. (건강 +8, 체력 +1)');
        if (opt === 'disciples') return narr(tuneAll(addMoney(s, -25), { loyalty: 2, vit: 1 }), '제자들이 줄지어 앉아 무릎에 뜸을 떴다. 뜨겁다고 비명을 지르면서도 서로 놀려 대느라 바빴다. (제자 충성 +2, 체력 +1)');
        return narr(s, '노인은 「다리 아플 때 생각날 거요」 하고 웃으며 떠났다.');
      },
    },
  ],
  { cond: (s) => s.turn >= 6 }
);

// ═════════ 8. 떠돌이 수행자 — 시주를 청하는 사람들 ═════════
const ZEN = [
  '「칼끝에 마음을 두면 칼에 베이고, 마음에 칼을 두면 마음이 베이오.」',
  '「이긴 자는 이긴 것을 지키느라 지고, 진 자는 진 것을 놓아 이기오.」',
  '「마당을 쓰는 비는 먼지를 미워하지 않소.」',
  '「칼집이 칼보다 오래가는 까닭을 아시오? 아무것도 베지 않기 때문이오.」',
];
const mendicant = homeTemplate(
  'mid_mendicant',
  [
    {
      id: 'monk',
      build: (s) => ({
        title: '목탁 소리의 탁발승',
        category: 'LIFE',
        speaker: '탁발하는 노승',
        narration: '대문 앞에서 목탁 소리가 난다.',
        script: [N('대문 앞에서 목탁 소리가 난다. 누더기 가사를 걸친 노승이 바리때를 내밀고 서 있다.'), P('탁발하는 노승', '나무아미타불. 이 집 마당에는 살기와 정성이 함께 서려 있구려.', '합장하며')],
        options: [
          { id: 'alms', label: `쌀 한 됫박과 ${byCountry(s, '엽전', '동전', '동전')} 몇 닢을 시주한다 (${coin(s, 10)})`, hint: '인덕 +3 · 구도 +2', ...short(s, 10) },
          { id: 'ask', label: '마루에 모셔 한 말씀을 청한다', hint: '구도 +5 · 정신 +1' },
          { id: 'decline', label: '그냥 돌려보낸다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'alms') return narr(addRep(addMoney(s, -10), { virtue: 3, ascetic: 2 }), '노승은 바리때를 받아 들고 대문을 향해 한참 염불을 외고 갔다. (인덕 +3, 구도 +2)');
        if (opt === 'ask') return narr(addStats(addRep(s, { ascetic: 5 }), { wil: 1 }), `노승은 차 한 잔을 다 비우고 한마디만 남겼다. ${rand(ZEN)} 그 말이 며칠 동안 귓가를 맴돌았다. (구도 +5, 정신 +1)`);
        return narr(s, '노승은 합장 한 번 하고 다음 집으로 걸음을 옮겼다. 목탁 소리가 골목 끝까지 이어졌다.');
      },
    },
    {
      id: 'komuso',
      when: (s) => s.country === 'JAPAN',
      build: (s) => {
        const p = clampP(0.4 + s.stats.ins * 0.006);
        return {
          title: '퉁소 부는 허무승(虛無僧)',
          category: 'LIFE',
          speaker: '나그네 허무승',
          narration: '얼굴을 통째로 가리는 깊은 삿갓을 쓴 허무승이 대문 앞에서 퉁소를 분다.',
          script: [
            N('얼굴을 통째로 가리는 깊은 삿갓을 쓴 허무승이 대문 앞에서 퉁소를 분다. 허무승 차림은 몸을 숨긴 낭인들이 즐겨 쓴다는 소문도 있다.'),
            P('나그네 허무승', '…한 곡 들어 주신 값이면 족하오.', '퉁소를 내리며'),
          ],
          options: [
            { id: 'alms', label: `시주한다 (${coin(s, 10)})`, hint: '인덕 +3', ...short(s, 10) },
            { id: 'probe', label: '퉁소 소리 너머의 기척을 떠본다', hint: `통찰 판정 약 ${pct(p)}` },
            { id: 'decline', label: '그냥 돌려보낸다' },
          ],
          meta: { p },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'alms') return narr(addRep(addMoney(s, -10), { virtue: 3 }), '허무승은 삿갓을 깊이 숙이고, 한 곡을 더 불고 떠났다. (인덕 +3)');
        if (opt === 'probe') {
          return chance(Number(c.data?.p) || 0.4)
            ? narr(addRep(addStats(s, { ins: 2 }), { ascetic: 2 }), '숨 쉬는 박자가 칼 쓰는 사람의 것이었다. 「…어느 번(藩)에 계셨소?」 허무승은 대답 대신 퉁소를 거두고 깊이 고개를 숙인 뒤 떠났다. (통찰 +2, 구도 +2)')
            : narr(s, '퉁소 소리만 들렸다. 정체가 무엇이든, 그는 그 소리 속에 잘 숨어 있었다.');
        }
        return narr(s, '퉁소 소리가 골목을 돌아 멀어졌다.');
      },
    },
    {
      id: 'taoist',
      when: (s) => s.country === 'CHINA',
      build: (s) => ({
        title: '부적 파는 떠돌이 도사',
        category: 'LIFE',
        speaker: '떠돌이 도사',
        narration: '누런 도포에 복숭아나무 칼을 멘 도사가 대문 방향을 손가락으로 재며 혀를 찬다.',
        script: [
          N('누런 도포에 복숭아나무 칼을 멘 도사가 대문 방향을 손가락으로 재며 혀를 찬다.'),
          P('떠돌이 도사', `이 집 대문이 귀문(鬼門)을 바라보고 있구려. 부적 한 장이면 액운이 비켜 가오. ${coin(s, 12)}만 내시오.`, '부적을 펼치며'),
        ],
        options: [
          { id: 'buy', label: `부적을 산다 (${coin(s, 12)})`, hint: '이단 +2 · 제자들이 안심한다', ...short(s, 12) },
          { id: 'debate', label: '「도(道)란 무엇이오」 하고 되묻는다', hint: '구도 +4 · 통찰 +1' },
          { id: 'decline', label: '부적보다 칼을 믿는다며 돌려보낸다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'buy') return narr(tuneAll(addRep(addMoney(s, -12), { arcane: 2 }), { loyalty: 1 }), '부적을 대문에 붙이자 식구들이 괜히 안심하는 눈치다. 밤마다 들리던 이상한 소리도 그쳤다 — 원래 바람 소리였지만. (이단 +2)');
        if (opt === 'debate') return narr(addStats(addRep(s, { ascetic: 4 }), { ins: 1 }), '도사는 노자 몇 구절로 버티다가 결국 「그대가 나보다 도에 가깝소」 하고 웃으며 부적 한 장을 거저 주고 떠났다. (구도 +4, 통찰 +1)');
        return narr(s, '도사는 「후회할 거요」 하고 소매를 털며 떠났다. 후회할 일은 생기지 않았다.');
      },
    },
    {
      id: 'pilgrim',
      build: (s) => {
        const route = byCountry(s, '팔도 명산', '오악(五嶽)', '시코쿠 여든여덟 절');
        return {
          title: '명산을 도는 순례 노인',
          category: 'LIFE',
          speaker: '순례하는 노인',
          narration: '짚신을 몇 켤레나 허리에 꿴 노인이 하룻밤 처마를 빌리자고 청한다.',
          script: [
            N('짚신을 몇 켤레나 허리에 꿴 노인이 하룻밤 처마를 빌리자고 청한다.'),
            P('순례하는 노인', `${josa(route, '을를')} 다 밟고 죽는 게 소원이오. 하룻밤 처마만 빌려 주시오.`, '지팡이에 기대며'),
          ],
          options: [
            { id: 'lodge', label: '방을 내어 하룻밤 재운다', hint: '인덕 +3 · 통찰 +1' },
            { id: 'listen', label: '밤새 길 이야기를 청해 듣는다', hint: '통찰 +2 · 구도 +2' },
            { id: 'breath', label: '노인이 명산에서 만났다는 신선의 숨법을 청해 배운다', hint: '이단 +3 · 영력 +1' },
            { id: 'decline', label: '그냥 돌려보낸다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'lodge') return narr(addStats(addRep(s, { virtue: 3 }), { ins: 1 }), '노인은 새벽같이 떠나며 짚신 한 켤레를 대문에 걸어 두었다. 「언젠가 먼 길 떠날 때 신으시오.」 (인덕 +3, 통찰 +1)');
        if (opt === 'breath') return narr(addStats(addRep(s, { arcane: 3 }), { qi: 1 }), '노인은 들이쉰 숨을 아홉 번에 나눠 삼키고 한 번에 내쉬는 법을 보여 주었다. 「구름 위에 사는 이가 가르쳐 준 거요. 그이는 밥을 안 먹더이다.」 밤새 따라 하니 배꼽 아래가 화롯불처럼 뜨거워졌다. (이단 +3, 영력 +1)');
        if (opt === 'listen') return narr(addRep(addStats(s, { ins: 2 }), { ascetic: 2 }), '노인의 이야기 속 산들은 하나같이 높고 멀었다. 밤이 깊도록 그 길을 따라 걸었다. 담장 안이 조금 좁게 느껴졌다. (통찰 +2, 구도 +2)');
        return narr(s, '노인은 개의치 않는다는 듯 지팡이를 고쳐 쥐고 다음 마을로 향했다.');
      },
    },
    {
      id: 'mudang',
      when: (s) => s.country === 'KOREA',
      build: (s) => ({
        title: '굿을 권하는 무당',
        category: 'LIFE',
        speaker: '무당 아낙',
        narration: '방울 소리와 함께 오방색 옷을 걸친 무당이 대문을 들어선다.',
        script: [
          N('방울 소리와 함께 오방색 옷을 걸친 무당이 대문을 들어선다. 도장 터에 원혼이 서렸다는 것이다.'),
          P('무당 아낙', '칼 쓰는 집엔 칼에 맺힌 넋이 따라붙는 법이에요. 굿 한 판이면 풀립니다. 복채는 마음 가는 대로…', '방울을 흔들며'),
        ],
        options: [
          { id: 'gut', label: `굿판을 허락한다 (${coin(s, 30)})`, hint: alive(s).length ? '이단 +4 · 제자 충성 +2' : '이단 +4', ...short(s, 30) },
          { id: 'small', label: `복채만 쥐여 보낸다 (${coin(s, 5)})`, hint: '인덕 +1', ...short(s, 5) },
          { id: 'drive', label: '혹세무민이라며 내쫓는다', hint: '구도 +3' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'gut') {
          const n = tuneAll(addRep(addMoney(s, -30), { arcane: 4 }), { loyalty: 2 });
          return narr(n, `꽹과리 소리가 밤새 이어졌다. 작두 위에 올라선 무당이 「억울하게 간 칼잡이 하나가 이제야 떠난다」고 외쳤다. ${alive(s).length ? '이튿날 제자들 얼굴이 이상하게 밝았다. (이단 +4, 제자 충성 +2)' : '이튿날 아침 마당이 이상하게 환했다. (이단 +4)'}`);
        }
        if (opt === 'small') return narr(addRep(addMoney(s, -5), { virtue: 1 }), '무당은 복채를 받아 들고 「사범님 앞길에 칼바람은 비켜 가겠네」 하고 덕담 한마디를 남겼다. (인덕 +1)');
        return narr(addRep(s, { ascetic: 3 }), '무당이 방울을 흔들며 「두고 보라」는 말을 남기고 갔다. 아무 일도 일어나지 않았다. (구도 +3)');
      },
    },
  ],
  { cond: (s) => s.turn >= 4 }
);

// ═════════ 9. 관아의 부탁 — 고을 일에 칼을 빌려 달라는 사람들 ═════════
const clerkOf = (s: GameState) => byCountry(s, '관아 아전', '현청 관리', '다이칸소 관리');
const lordOf = (s: GameState) => byCountry(s, '원님', '지현 나리', '다이칸 나리');
const copsOf = (s: GameState) => byCountry(s, '포졸', '포쾌(捕快)', '도신(同心)');
const office = homeTemplate(
  'mid_office',
  [
    {
      id: 'police',
      build: (s) => {
        const clerk = clerkOf(s);
        const b = bestOf(s);
        return {
          title: byCountry(s, '포졸 조련 부탁', '포쾌(捕快) 조련 부탁', '도신(同心) 조련 부탁'),
          category: 'LIFE',
          speaker: clerk,
          narration: `${josa(clerk, '이가')} 관아의 부탁을 들고 왔다.`,
          script: [
            N(`${josa(clerk, '이가')} 관아의 부탁을 들고 왔다. 요즘 도둑이 부쩍 늘었는데 ${copsOf(s)}들 칼솜씨가 영 형편없다는 것이다.`),
            P(clerk, `한 철만 맡아 주시면 사례는 섭섭지 않게 하겠소. ${lordOf(s)}께서 특별히 부탁하셨소.`, '두 손을 모으며'),
          ],
          options: [
            { id: 'accept', label: '직접 맡아 조련한다', hint: `+${coin(s, 50)} · 상무 +4 · 명성 +5 · 건강 -4` },
            { id: 'harsh', label: '칼 막는 법 대신 사람을 꺾고 쓰러뜨리는 손속만 가르친다', hint: `+${coin(s, 50)} · 살기 +5 · 건강 -4` },
            ...(b ? [{ id: 'send', label: `수제자 ${josa(b.name, '을를')} 보낸다`, hint: `+${coin(s, 30)} · 제자가 경험을 쌓는다` }] : []),
            { id: 'decline', label: '관아 일에는 끼지 않는다', hint: '구도 +2' },
          ],
          meta: { did: b?.id || '' },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'accept') return narr(addHealth(addFame(addRep(addMoney(s, 50), { commerce: 4 }), 5), -4), `한 철 내내 ${copsOf(s)}들을 굴렸다. 처음엔 투덜대던 자들이 끝날 무렵엔 「사범님」 하며 따랐다. (상무 +4, 명성 +5, 건강 -4)`);
        if (opt === 'harsh') return narr(addHealth(addRep(addMoney(s, 50), { ruthless: 5 }), -4), `한 철 동안 ${copsOf(s)}들에게 팔을 꺾고 목을 조르고 무릎을 꿇리는 법만 가르쳤다. 그해 겨울, 고을 옥사가 유난히 붐볐다는 말이 들렸다. (살기 +5, 건강 -4)`);
        if (opt === 'send') {
          const d = findDisc(s, c.data?.did);
          if (!d) return s;
          return narr(tuneDisc(addMoney(s, 30), d.id, { str: 1, wil: 1, loyalty: 4 }), `${josa(d.name, '이가')} 한 철 동안 관아 마당에서 ${copsOf(s)}들을 가르쳤다. 돌아온 ${d.name}의 어깨가 한결 넓어 보였다. (제자 충성 +4)`);
        }
        return narr(addRep(s, { ascetic: 2 }), `「도장의 칼은 관아의 칼이 아니오.」 ${josa(clerkOf(s), '이가')} 입맛을 다시며 돌아갔다. (구도 +2)`);
      },
    },
    {
      id: 'exam',
      build: (s) => {
        const clerk = clerkOf(s);
        return {
          title: byCountry(s, '무과 초시의 채점 보좌', '무동시(武童試)의 감독 보좌', '번교(藩校) 무예 시험의 입회'),
          category: 'LIFE',
          speaker: clerk,
          narration: '고을에서 무예 시험이 열린다.',
          script: [
            N(`고을에서 무예 시험이 열린다. ${josa(clerk, '이가')} 찾아와, 활과 칼을 볼 줄 아는 이가 채점을 거들어 달라고 청한다.`),
            P(clerk, `그런데… 응시자 가운데 ${byCountry(s, '이방 어른', '서리 어른', '부교 어른')} 조카가 있소. 그 점은 알아서 헤아려 주시면 좋겠고.`, '목소리를 낮추며'),
          ],
          options: [
            { id: 'fair', label: '누구든 실력대로 매긴다', hint: '인덕 +4 · 구도 +2 · 명성 +5' },
            { id: 'favor', label: '조카의 점수를 슬쩍 올려 준다', hint: `+${coin(s, 60)} · 상무 +4 · 인덕 -5` },
            { id: 'decline', label: '시험 일에는 끼지 않는다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'fair') return narr(addFame(addRep(s, { virtue: 4, ascetic: 2 }), 5), '조카는 낙방했다. 한동안 관아 사람들이 눈을 흘겼지만, 그해 붙은 젊은이 하나가 찾아와 큰절을 올렸다. (인덕 +4, 구도 +2, 명성 +5)');
        if (opt === 'favor') return narr(addRep(addMoney(s, 60), { commerce: 4, virtue: -5 }), '조카는 턱걸이로 붙었다. 대신 그 자리에 붙었어야 할 누군가가 떨어졌다. 그 얼굴은 떠올리지 않기로 했다. (상무 +4, 인덕 -5)');
        return narr(s, `${josa(clerkOf(s), '은는')} 「아쉽구려」 하고 다른 사람을 찾아갔다.`);
      },
    },
    {
      id: 'census',
      when: (s) => alive(s).length > 0,
      build: (s) => {
        const clerk = clerkOf(s);
        return {
          title: byCountry(s, '호구(戶口) 조사', '보갑(保甲) 명부 조사', '닌베쓰아라타메(人別改)'),
          category: 'LIFE',
          speaker: clerk,
          narration: `${josa(clerk, '이가')} 장부를 들고 와서 도장 식솔과 문하생 머릿수를 적어 가겠다고 한다.`,
          script: [
            N(`${josa(clerk, '이가')} 장부를 들고 와서 도장 식솔과 문하생 머릿수를 적어 가겠다고 한다. 머릿수대로 ${byCountry(s, '군포와 부역', '부역과 세은', '부역과 연공')}이 매겨진다.`),
            P(clerk, '숨기면 경을 칩니다. …물론 술값이라도 챙겨 주시면 붓이 좀 느려지긴 하지요.', '붓끝을 핥으며'),
          ],
          options: [
            { id: 'honest', label: '있는 그대로 적어 준다', hint: `-${coin(s, 20)} · 인덕 +3 · 구도 +1` },
            { id: 'bribe', label: `술값을 쥐여 준다 (${coin(s, 15)})`, hint: '상무 +3 · 인덕 -2', ...short(s, 15) },
            { id: 'hide', label: '문하생 절반을 뒷산으로 보내 숨긴다', hint: '들키면 벌금 · 상무 +2' },
          ],
        };
      },
      resolve: (s, opt) => {
        const clerk = clerkOf(s);
        if (opt === 'honest') return narr(addRep(addMoney(s, -20), { virtue: 3, ascetic: 1 }), '장부에 적힌 머릿수대로 세금이 나왔다. 아깝지만 떳떳했다. (인덕 +3, 구도 +1)');
        if (opt === 'bribe') return narr(addRep(addMoney(s, -15), { commerce: 3, virtue: -2 }), '붓이 정말로 느려졌다. 장부에 적힌 머릿수는 반으로 줄었다. (상무 +3, 인덕 -2)');
        return chance(0.35)
          ? narr(addFame(addMoney(s, -50), -6), `뒷산에서 누군가 재채기를 했다. ${josa(clerk, '이가')} 씩 웃으며 벌금을 두 배로 매겼다. (벌금 ${coin(s, 50)}, 명성 -6)`)
          : narr(addRep(s, { commerce: 2 }), `${josa(clerk, '은는')} 고개를 갸웃하면서도 적힌 대로 장부를 덮었다. (상무 +2)`);
      },
    },
    {
      id: 'procession',
      build: (s) => {
        const clerk = clerkOf(s);
        return {
          title: byCountry(s, '원님 행차 길목의 경비', '지현 행차 길목의 경비', '다이칸 행차 길목의 경비'),
          category: 'LIFE',
          speaker: clerk,
          narration: `${josa(clerk, '이가')} 다급하게 찾아왔다.`,
          script: [
            N(`${josa(clerk, '이가')} 다급하게 찾아왔다. 내일 ${lordOf(s)} 행차 길목에 무뢰배들이 행패를 부리려 한다는 첩보가 들어왔다는 것이다.`),
            P(clerk, `${copsOf(s)}만으로는 영 미덥지 않아서… 사범님이 길목 하나만 맡아 주시오.`, '이마의 땀을 훔치며'),
          ],
          options: [
            { id: 'guard', label: '직접 길목을 지킨다', hint: '비무 · 이기면 사례와 명성' },
            ...(alive(s).length >= 2 ? [{ id: 'send', label: '제자들을 풀어 길목을 지키게 한다', hint: `+${coin(s, 20)} · 명성 +4 · 제자 충성 +3` }] : []),
            { id: 'decline', label: '관아 일은 관아가 한다' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'guard') {
          return journeyBattle(s, c, opt, {
            title: '행차 길목의 무뢰배',
            subtitle: '관아의 부탁',
            name: '무뢰배 두목',
            enemyTitle: '왈패',
            age: 31,
            ai: 'AGGRESSIVE',
            scale: roadScale(s, 0.85),
            weapon: 'UNARMED',
            skills: ['sk_kr_03', 'sk_cn_01', 'base_h_slash'],
            rewardMoney: 35,
            rewardFame: 10,
          });
        }
        if (opt === 'send') return narr(tuneAll(addFame(addMoney(s, 20), 4), { loyalty: 3 }), '제자들이 길목마다 버티고 서자 무뢰배들은 나타나지도 않았다. 행차는 무사히 지나갔다. (명성 +4, 제자 충성 +3)');
        return narr(s, `${josa(clerkOf(s), '은는')} 낙담한 얼굴로 돌아갔다. 이튿날 행차 길목에서 소란이 있었다는 말이 들렸다.`);
      },
      onBattle: (s, _opt, won) =>
        won
          ? narr(addRep(s, { virtue: 3 }), '무뢰배 두목을 길바닥에 메다꽂자 나머지는 흩어졌다. 행차는 아무 일 없이 지나갔다. (인덕 +3)')
          : narr(addFame(addHealth(s, -6), -4), `두목의 주먹이 생각보다 매웠다. ${copsOf(s)}들이 몰려와서야 겨우 놈들을 쫓아냈다. (건강 -6, 명성 -4)`),
    },
  ],
  { cond: (s) => s.turn >= 10 && s.fame >= 60 }
);

// ═════════ 10. 제자의 부모 — 대문 밖에서 온 사람들 ═════════
// 부모는 대문으로 들어온다 — 화자 이름에 제자 이름을 넣으면 그 제자가 안채에서 걸어 나오는 것처럼 보이므로 넣지 않는다.
const discParent = homeTemplate(
  'mid_disc_parent',
  [
    {
      id: 'thanks',
      build: (s) => {
        const d = rand(alive(s));
        return {
          title: `${d.name}의 어머니가 이고 온 보따리`,
          category: 'LIFE',
          speaker: '시골 아낙',
          narration: `${d.name}의 어머니가 머리에 보따리를 이고 찾아왔다.`,
          script: [
            N(`${d.name}의 어머니가 머리에 보따리를 이고 찾아왔다. 햇곡식과 말린 나물이다.`),
            P('시골 아낙', `우리 ${kidWord(d)}이 사람 구실을 하게 된 건 다 사범님 덕이에요. 변변찮지만 받아 주세요.`, '보따리를 내려놓으며'),
          ],
          options: [
            { id: 'accept', label: '고맙게 받는다', hint: '건강 +3 · 제자 충성 +6' },
            { id: 'return', label: `오히려 노잣돈을 쥐여 보낸다 (${coin(s, 10)})`, hint: '인덕 +4 · 제자 충성 +8', ...short(s, 10) },
            { id: 'show', label: `${d.name}의 수련을 보여 드린다`, hint: '제자 충성 +5 · 제자 정신 +1' },
          ],
          meta: { did: d.id },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'accept') return narr(tuneDisc(addHealth(s, 3), d.id, { loyalty: 6 }), `그날 저녁상에 햇곡식으로 지은 밥이 올랐다. ${josa(d.name, '은는')} 괜히 어깨를 으쓱했다. (건강 +3, 제자 충성 +6)`);
        if (opt === 'return') return narr(tuneDisc(addRep(addMoney(s, -10), { virtue: 4 }), d.id, { loyalty: 8 }), `어머니는 한사코 사양하다 결국 노잣돈을 받아 들고 몇 번이나 뒤돌아보았다. ${josa(d.name, '은는')} 그날 밤 늦게까지 마당을 쓸었다. (인덕 +4, 제자 충성 +8)`);
        return narr(tuneDisc(s, d.id, { loyalty: 5, wil: 1 }), `${josa(d.name, '이가')} 어머니 앞에서 초식을 펼쳤다. 어머니는 끝날 때까지 치맛자락으로 눈가를 훔쳤다. (제자 충성 +5)`);
      },
    },
    {
      id: 'take_back',
      when: (s) => notHeir(s).length > 0,
      build: (s) => {
        const d = rand(notHeir(s));
        const p = clampP(0.35 + s.fame * 0.0004 + s.stats.ins * 0.004 + (d.isGenius ? 0.15 : 0));
        return {
          title: `${josa(d.name, '을를')} 데리러 온 아버지`,
          category: 'LIFE',
          speaker: '늙은 농부',
          narration: `${d.name}의 아버지가 지게를 진 채 대문을 들어섰다.`,
          script: [
            N(`${d.name}의 아버지가 지게를 진 채 대문을 들어섰다. ${josa(kidWord(d), '을를')} 집으로 데려가겠다는 것이다.`),
            P('늙은 농부', '농사일에 손이 모자랍니다. 이제 칼은 그만하고 집에 가서 땅을 파야지요.', '지게를 내려놓으며'),
          ],
          options: [
            { id: 'persuade', label: `${d.name}의 재능을 들어 설득한다`, hint: `성공 확률 약 ${pct(p)} · 실패하면 제자가 떠난다` },
            { id: 'pay', label: `일꾼 삯을 대신 내준다 (${coin(s, 40)})`, hint: '제자 충성 +12', ...short(s, 40) },
            { id: 'let_go', label: '부모의 뜻을 따르게 한다', hint: '제자가 떠난다 · 인덕 +4' },
          ],
          meta: { did: d.id, p },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'persuade') {
          return chance(Number(c.data?.p) || 0.4)
            ? narr(tuneDisc(s, d.id, { loyalty: 8 }), '「이 아이 칼끝에는 남다른 데가 있습니다.」 한참을 듣던 아버지가 지게를 고쳐 메고 혼자 돌아갔다. (제자 충성 +8)')
            : narr(depart(s, d.id, '부모의 뜻으로 귀향'), `아버지는 끝내 고개를 저었다. ${josa(d.name, '은는')} 목검을 벽에 세워 두고 아버지의 지게 뒤를 따라갔다. (${d.name} 귀향)`);
        }
        if (opt === 'pay') return narr(tuneDisc(addMoney(s, -40), d.id, { loyalty: 12 }), '아버지는 돈 꾸러미를 받아 들고 한참 말이 없더니, 「사람 하나 잘 만들어 주시오」 하고 돌아갔다. (제자 충성 +12)');
        return narr(addRep(depart(s, d.id, '부모의 뜻으로 귀향'), { virtue: 4 }), `${josa(d.name, '은는')} 마당 한가운데서 큰절을 올리고 아버지를 따라갔다. 떠나는 등에 대고 「칼은 놓아도 배운 것은 놓지 마라」 하고 일렀다. (인덕 +4 · ${d.name} 귀향)`);
      },
    },
    {
      id: 'complaint',
      build: (s) => {
        const d = rand(alive(s));
        const shop = byCountry(s, '포목전 주인', '비단 가게 주인', '포목점 주인');
        const p = clampP(0.35 + s.stats.ins * 0.006);
        return {
          title: `${d.name} 아버지의 항의`,
          category: 'LIFE',
          speaker: `성난 ${shop}`,
          narration: `${d.name}의 아버지가 씩씩거리며 들이닥쳤다.`,
          script: [
            N(`${d.name}의 아버지가 씩씩거리며 들이닥쳤다. ${kidWord(d)} 종아리에 시퍼런 멍이 들었다는 것이다.`),
            P(`성난 ${shop}`, '귀한 자식 맡겼더니 몽둥이찜질이오? 월사금 내고 매 맞히는 데가 세상 어디 있소!', '삿대질하며', 'ANGRY'),
          ],
          options: [
            { id: 'explain', label: '수련의 이치를 차근차근 설명한다', hint: `통찰 판정 약 ${pct(p)}` },
            { id: 'apologize', label: '사과하고 수련을 조금 늦춘다', hint: '인덕 +2 · 제자 충성 +3' },
            { id: 'firm', label: '「도장의 법도」라며 물러서지 않는다', hint: '구도 +3 · 제자를 데려갈 수도' },
          ],
          meta: { did: d.id, p },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'explain') {
          return chance(Number(c.data?.p) || 0.4)
            ? narr(addStats(addFame(s, 3), { ins: 1 }), `「멍은 열흘이면 빠지지만, 몸에 밴 것은 평생 갑니다.」 아버지는 한참 ${kidWord(d)}의 종아리를 내려다보다 헛기침을 하고 돌아갔다. (명성 +3, 통찰 +1)`)
            : narr(addFame(s, -3), '말이 길어질수록 아버지 얼굴이 붉어졌다. 그날 저녁 장터에 「그 도장은 애들을 팬다」는 말이 돌았다. (명성 -3)');
        }
        if (opt === 'apologize') return narr(tuneDisc(addRep(s, { virtue: 2 }), d.id, { loyalty: 3 }), `아버지는 그제야 노기를 풀었다. ${josa(d.name, '은는')} 스승이 자기 때문에 고개를 숙인 것이 마음에 걸리는 눈치였다. (인덕 +2, 제자 충성 +3)`);
        const n = addRep(s, { ascetic: 3 });
        if (d.role !== 'HEIR' && chance(0.25)) {
          return narr(depart(n, d.id, '부모가 데려감'), `아버지는 ${josa(kidWord(d), '을를')} 끌고 가 버렸다. 마당 한구석에 ${d.name}의 목검만 남았다. (구도 +3 · ${d.name} 떠남)`);
        }
        return narr(tuneDisc(n, d.id, { loyalty: 2 }), '아버지는 씩씩거리며 돌아갔다. 정작 제자는 그날 더 이를 악물고 수련했다. (구도 +3)');
      },
    },
    {
      id: 'barter',
      build: (s) => {
        const d = rand(alive(s));
        return {
          title: '월사금 대신 안고 온 씨암탉',
          category: 'LIFE',
          speaker: '시골 아낙',
          narration: `${d.name}의 어머니가 씨암탉 두 마리를 안고 왔다.`,
          script: [
            N(`${d.name}의 어머니가 씨암탉 두 마리를 안고 왔다. 올해 농사를 망쳐 월사금 대신 이것밖에 없다는 것이다.`),
            P('시골 아낙', '면목이 없어요. 닭이라도 받아 주시면…', '닭을 내밀며'),
          ],
          options: [
            { id: 'accept', label: '닭을 받는다', hint: '건강 +4' },
            { id: 'waive', label: '올해 월사금은 받지 않는다며 닭도 돌려준다', hint: '인덕 +5 · 제자 충성 +8' },
            { id: 'work', label: `${josa(d.name, '이가')} 도장 일을 더 맡아 갚게 한다`, hint: '상무 +2 · 제자 충성 -2' },
          ],
          meta: { did: d.id },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'accept') return narr(addHealth(s, 4), `그날 저녁 밥상에 ${josa(byCountry(s, '닭백숙', '닭탕', '닭 전골'), '이가')} 올랐다. 한 마리는 알을 낳으라고 남겨 두었다. (건강 +4)`);
        if (opt === 'waive') return narr(tuneDisc(addRep(s, { virtue: 5 }), d.id, { loyalty: 8 }), `어머니가 닭을 도로 안고 몇 번이고 허리를 굽혔다. ${josa(d.name, '은는')} 그 뒤로 누구보다 일찍 일어나 마당을 쓸었다. (인덕 +5, 제자 충성 +8)`);
        return narr(tuneDisc(addRep(s, { commerce: 2 }), d.id, { loyalty: -2 }), `${josa(d.name, '은는')} 한 철 동안 장작 패기와 물 긷기를 도맡았다. 불평은 없었지만 눈빛이 조금 어두워졌다. (상무 +2, 제자 충성 -2)`);
      },
    },
  ],
  { cond: (s) => s.turn >= 8 && alive(s).length > 0 }
);

// ═════════ 11. 제자의 밤 — 스승이 모르던 얼굴 ═════════
const discNight = homeTemplate(
  'mid_disc_night',
  [
    {
      id: 'forbidden_form',
      build: (s) => {
        const d = rand(alive(s));
        return {
          title: `${d.name}의 한밤 수련`,
          category: 'FAMILY',
          sceneActor: 'DISCIPLE',
          speaker: d.name,
          narration: '자정이 넘었는데 연무장에서 바람 소리가 난다.',
          script: [
            N(`자정이 넘었는데 연무장에서 바람 소리가 난다. ${josa(d.name, '이가')} 아직 가르치지 않은 초식을 흉내 내고 있다. 발목이 위태롭게 꺾인다.`),
            P(d.name, '스승님! …몰래 보고 따라 해 봤습니다. 빨리 늘고 싶어서요.', '목검을 등 뒤로 감추며'),
          ],
          options: [
            { id: 'correct', label: '그 자리에서 자세를 바로잡아 준다', hint: '제자 민첩 +2 · 통찰 +1 · 충성 +6' },
            { id: 'scold', label: '순서를 건너뛰면 몸이 망가진다고 호되게 꾸짖는다', hint: '구도 +2 · 제자 충성 -4' },
            { id: 'watch', label: '모른 척 지켜본다', hint: '홀로 깨칠 수도, 다칠 수도' },
          ],
          meta: { did: d.id },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'correct') return narr(tuneDisc(s, d.id, { agi: 2, ins: 1, loyalty: 6 }), `달빛 아래서 발 디딤 하나를 고쳐 주었다. 그 한 가지로 초식 전체가 살아났다. ${josa(d.name, '은는')} 새벽까지 그 동작만 되풀이했다. (제자 민첩 +2, 통찰 +1)`);
        if (opt === 'scold') return narr(tuneDisc(addRep(s, { ascetic: 2 }), d.id, { loyalty: -4 }), `${josa(d.name, '은는')} 고개를 푹 숙였다. 이튿날부터 기본 베기만 천 번씩 했다. (구도 +2, 제자 충성 -4)`);
        return chance(0.45)
          ? narr(tuneDisc(s, d.id, { ins: 3, agi: 1 }), '사흘 밤을 그러더니, 나흘째 밤에는 발목이 꺾이지 않았다. 스스로 길을 찾은 것이다. (제자 통찰 +3, 민첩 +1)')
          : narr(tuneDisc(s, d.id, { vit: -2, loyalty: 1 }), '닷새째 되던 밤, 쿵 하는 소리가 났다. 발목을 접질려 한 달을 절뚝였다. (제자 체력 -2)');
      },
    },
    {
      id: 'sneak_out',
      build: (s) => {
        const d = rand(alive(s));
        const hut = byCountry(s, '초가', '토담집', '나가야(長屋)');
        return {
          title: `밤마다 담을 넘는 ${d.name}`,
          category: 'FAMILY',
          sceneActor: 'DISCIPLE',
          speaker: d.name,
          narration: `밤마다 ${josa(d.name, '이가')} 담을 넘어 나간다는 말에 뒤를 밟았다.`,
          script: [
            N(`밤마다 ${josa(d.name, '이가')} 담을 넘어 나간다는 말에 뒤를 밟았다. 닿은 곳은 장터 뒷골목의 다 쓰러져 가는 ${hut} — ${josa(d.name, '은는')} 병든 노파에게 약을 달여 드리고 있었다.`),
            P(d.name, '…어릴 적 저를 거둬 주신 분입니다. 말씀드리면 수련 빼먹는다고 혼날까 봐…', '약사발을 든 채'),
          ],
          options: [
            { id: 'help', label: `약값을 보태 준다 (${coin(s, 20)})`, hint: '인덕 +4 · 제자 충성 +12', ...short(s, 20) },
            { id: 'permit', label: '떳떳하게 다녀오라며 외출을 허락한다', hint: '인덕 +2 · 제자 충성 +8' },
            { id: 'rule', label: '그래도 법도는 법도 — 말없이 나간 것은 벌한다', hint: '구도 +3 · 제자 충성 -3' },
            { id: 'flog', label: '모두가 보는 앞에서 종아리를 친다 — 회초리가 부러질 때까지', hint: '살기 +4 · 제자 충성 -6' },
          ],
          meta: { did: d.id },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'help') return narr(tuneDisc(addRep(addMoney(s, -20), { virtue: 4 }), d.id, { loyalty: 12 }), `약값 꾸러미를 건네자 ${josa(d.name, '은는')} 말없이 무릎을 꿇었다. 노파는 그해를 무사히 넘겼다. (인덕 +4, 제자 충성 +12)`);
        if (opt === 'flog') return narr(tuneDisc(addRep(s, { ruthless: 4 }), d.id, { loyalty: -6 }), `제자들을 모두 마당에 세워 놓고 ${d.name}의 종아리를 쳤다. 회초리가 부러질 때까지. ${josa(d.name, '은는')} 신음 한 번 내지 않았다. 그 뒤로 밤에 담을 넘는 제자는 없었다. (살기 +4, 제자 충성 -6)`);
        if (opt === 'permit') return narr(tuneDisc(addRep(s, { virtue: 2 }), d.id, { loyalty: 8 }), `그 뒤로 ${josa(d.name, '은는')} 해 질 녘마다 대문으로 당당히 나갔다가 자정 전에 돌아왔다. 담장 위 기왓장이 더는 깨지지 않았다. (인덕 +2, 제자 충성 +8)`);
        return narr(tuneDisc(addRep(s, { ascetic: 3 }), d.id, { loyalty: -3 }), `사흘 동안 물동이를 들고 서 있게 했다. ${josa(d.name, '은는')} 한마디 변명도 하지 않았다. (구도 +3, 제자 충성 -3)`);
      },
    },
    {
      id: 'copying',
      build: (s) => {
        const d = rand(alive(s));
        return {
          title: '장서각의 늦은 등잔불',
          category: 'FAMILY',
          sceneActor: 'DISCIPLE',
          speaker: d.name,
          narration: '밤늦도록 장서각에 등잔불이 켜져 있다.',
          script: [
            N(`밤늦도록 장서각에 등잔불이 켜져 있다. ${josa(d.name, '이가')} 비급을 펼쳐 놓고 한 자 한 자 베껴 쓰고 있다.`),
            P(d.name, '스승님… 낮에는 외울 틈이 없어서, 제 손으로 베껴 두고 싶었습니다.', '붓을 내려놓으며'),
          ],
          options: [
            { id: 'allow', label: '먹과 종이를 더 내준다', hint: '제자 통찰 +2 · 충성 +6' },
            { id: 'confiscate', label: '비급은 장서각 밖으로 나가선 안 된다 — 베낀 것을 거둔다', hint: '구도 +3 · 제자 충성 -5' },
            { id: 'inspect', label: '베낀 종이를 한 장씩 넘겨 본다', hint: '혹시 모를 일이다' },
          ],
          meta: { did: d.id },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'allow') return narr(tuneDisc(s, d.id, { ins: 2, loyalty: 6 }), `그 뒤로 한동안 ${josa(d.name, '은는')} 장서각에서 살다시피 했다. 베낀 책 귀퉁이마다 제 나름의 풀이가 빼곡했다. (제자 통찰 +2, 충성 +6)`);
        if (opt === 'confiscate') return narr(tuneDisc(addRep(s, { ascetic: 3 }), d.id, { loyalty: -5 }), '베낀 종이를 거두어 아궁이에 넣었다. 불길을 바라보는 제자의 얼굴이 하얗게 질렸다. (구도 +3, 제자 충성 -5)');
        // 흑심을 품은 제자라면, 베낀 종이에서 꼬리가 잡힌다
        if (d.temperament === 'SCHEMER' && !d.exposed) {
          const n = { ...s, disciples: s.disciples.map((x) => (x.id === d.id ? { ...x, exposed: true, temperamentKnown: true, plot: Math.max(0, (x.plot || 0) - 30) } : x)) };
          return narr(n, `종이 끝마다 낯선 표식이 찍혀 있다. 누군가에게 넘기려고 베낀 것이다. ${josa(d.name, '은는')} 얼굴이 하얗게 질려 아무 말도 하지 못했다. (${d.name}의 흑심이 드러났다)`);
        }
        return narr(tuneDisc(addStats(s, { ins: 1 }), d.id, { loyalty: 3 }), '글씨가 반듯했다. 행간에 제 나름의 풀이까지 적어 두었다. 생각보다 깊이 읽고 있었다. (통찰 +1, 제자 충성 +3)');
      },
    },
    {
      id: 'hidden_injury',
      build: (s) => {
        const d = rand(alive(s));
        return {
          title: `${d.name}의 소매 속 붕대`,
          category: 'FAMILY',
          sceneActor: 'DISCIPLE',
          speaker: d.name,
          narration: '수련복 소매 밑으로 붕대가 비친다.',
          script: [
            N(`수련복 소매 밑으로 붕대가 비친다. ${josa(d.name, '이가')} 며칠째 손목을 감싼 채 아무렇지 않은 척 목검을 휘두르고 있었다.`),
            P(d.name, '괜찮습니다! 이 정도로 쉬면 뒤처집니다.', '손목을 등 뒤로 숨기며'),
          ],
          options: [
            { id: 'rest', label: '목검을 빼앗고 한 철 쉬게 한다', hint: '제자 충성 +4 · 제자 체력 +1' },
            { id: 'treat', label: `직접 약을 바르고 침을 놓아 준다 (${coin(s, 10)})`, hint: '제자 충성 +8', ...short(s, 10) },
            { id: 'praise', label: '그 근성을 칭찬하고 계속하게 둔다', hint: '제자 충성 +3 · 덧날 수도' },
          ],
          meta: { did: d.id },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'rest') return narr(tuneDisc(s, d.id, { loyalty: 4, vit: 1 }), `${josa(d.name, '은는')} 한 철 동안 목검 대신 빗자루를 들었다. 손목이 다 나은 날, 누구보다 먼저 연무장에 나왔다. (제자 충성 +4)`);
        if (opt === 'treat') return narr(tuneDisc(addMoney(s, -10), d.id, { loyalty: 8 }), '약을 바르고 손목을 단단히 싸매 주었다. 제자는 그 손을 한참 내려다보았다. (제자 충성 +8)');
        return chance(0.4)
          ? narr(tuneDisc(s, d.id, { loyalty: 3, agi: -2 }), '손목은 결국 덧났다. 한동안 칼을 제대로 쥐지 못했다. (제자 충성 +3, 민첩 -2)')
          : narr(tuneDisc(s, d.id, { loyalty: 3, wil: 2 }), '이를 악물고 버틴 손목은 그럭저럭 아물었다. 그 근성만큼은 누구도 따라오지 못했다. (제자 충성 +3, 정신 +2)');
      },
    },
  ],
  { cond: (s) => s.turn >= 8 && alive(s).length > 0 }
);

// ═════════ 12. 병기 손질 — 부러지고 이 빠지고 무너지는 것들 ═════════
const gear = homeTemplate(
  'mid_gear',
  [
    {
      id: 'wooden_snap',
      when: (s) => alive(s).length > 0,
      build: (s) => {
        const d = rand(alive(s));
        const wood = byCountry(s, '박달나무', '대추나무', '떡갈나무');
        return {
          title: '두 동강 난 목검',
          category: 'LIFE',
          speaker: d.name,
          narration: `대련 중에 ${josa(d.name, '이가')} 쥔 목검이 두 동강 났다.`,
          script: [
            N(`대련 중에 ${josa(d.name, '이가')} 쥔 ${wood} 목검이 「딱」 소리와 함께 두 동강 났다.`),
            P(d.name, '스승님께서 주신 목검인데… 죄송합니다!', '부러진 목검을 두 손으로 받쳐 들며'),
          ],
          options: [
            { id: 'carve', label: '새 목검을 손수 깎아 준다', hint: '제자 충성 +8 · 통찰 +1' },
            { id: 'buy', label: `장에서 새것을 사 준다 (${coin(s, 8)})`, hint: '제자 충성 +2', ...short(s, 8) },
            { id: 'lesson', label: '「목검이 부러진 건 힘이 잘못 실린 탓」이라 가르친다', hint: '제자 통찰 +2 · 구도 +2' },
          ],
          meta: { did: d.id, wood },
        };
      },
      resolve: (s, opt, c) => {
        const d = findDisc(s, c.data?.did);
        if (!d) return s;
        if (opt === 'carve') return narr(tuneDisc(addStats(s, { ins: 1 }), d.id, { loyalty: 8 }), `사흘 밤 동안 ${josa(String(c.data?.wood || '나무'), '을를')} 깎았다. 손잡이에 이름 한 자를 새겨 건네자, ${josa(d.name, '은는')} 그 목검을 끌어안고 잤다. (통찰 +1, 제자 충성 +8)`);
        if (opt === 'buy') return narr(tuneDisc(addMoney(s, -8), d.id, { loyalty: 2 }), '장에서 사 온 목검은 가볍고 반듯했다. 제자는 고맙다며 웃었지만, 부러진 목검 토막을 끝내 버리지 못했다. (제자 충성 +2)');
        return narr(tuneDisc(addRep(s, { ascetic: 2 }), d.id, { ins: 2 }), `부러진 단면을 보여 주며 힘이 어디서 꺾였는지 짚어 주었다. ${josa(d.name, '은는')} 그날부터 목검을 쥐는 손이 달라졌다. (구도 +2, 제자 통찰 +2)`);
      },
    },
    {
      id: 'blade_chip',
      build: (s) => ({
        title: '이 빠진 칼날',
        category: 'LIFE',
        speaker: '대장장이',
        narration: '진검 수련 중 칼날에 쌀알만 한 이가 빠졌다.',
        script: [
          N('진검 수련 중 칼날에 쌀알만 한 이가 빠졌다. 단골 대장장이가 숫돌을 들고 왔다.'),
          P('대장장이', '날을 세우려면 사흘은 걸리오. 갈아 내면 칼이 조금 얇아지고, 덧대면 무게가 달라지지요. 어찌하시겠소?', '칼날을 햇빛에 비춰 보며'),
        ],
        options: [
          { id: 'grind', label: `갈아서 날을 세운다 (${coin(s, 15)})`, hint: '장착 초식 숙련 +20', ...short(s, 15) },
          { id: 'reforge', label: `아예 다시 벼린다 (${coin(s, 40)})`, hint: '장착 초식 숙련 +45 · 상무 +1', ...short(s, 40) },
          { id: 'self', label: '숫돌만 빌려 손수 간다', hint: '정신 +1 · 구도 +3' },
          {
            id: 'test',
            label: byCountry(
              s,
              '날을 세운 뒤 형방에 엽전을 찔러 주고, 형장에서 죄인의 시신으로 날을 시험한다',
              '날을 세운 뒤 망나니에게 은자를 쥐여 주고, 처형된 죄인의 시신으로 날을 시험한다',
              '날을 세운 뒤 야마다 아사에몬(山田浅右衛門)에게 시험 베기(試し斬り)를 맡긴다'
            ),
            hint: `-${coin(s, 15)} · 장착 초식 숙련 +25 · 살기 +5`,
            ...short(s, 15),
          },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'grind') return narr(trainEquipped(addMoney(s, -15), 20), '얇아진 칼날이 손에 가볍게 감겼다. 몇 번 휘두르자 손목이 새 무게에 익었다. (장착 초식 숙련 +20)');
        if (opt === 'test') {
          return narr(
            addRep(trainEquipped(addMoney(s, -15), 25), { ruthless: 5 }),
            byCountry(
              s,
              '형장 뒤 거적 아래서 날을 시험했다. 이 빠졌던 자리에도 아무 걸림이 없었다. 돌아오는 길, 손에 남은 감각이 오래 가시지 않았다. (장착 초식 숙련 +25, 살기 +5)',
              '형장 뒤 거적 아래서 날을 시험했다. 이 빠졌던 자리에도 아무 걸림이 없었다. 돌아오는 길, 손에 남은 감각이 오래 가시지 않았다. (장착 초식 숙련 +25, 살기 +5)',
              '아사에몬이 흙단 위의 시신에 칼을 내리치더니 날을 살폈다. 「잘 드오. 이 빠졌던 자리도 걸리지 않소.」 칼 슴베에 시험 결과를 적은 글귀가 새겨져 돌아왔다. 칼이 한결 무겁게 느껴졌다. (장착 초식 숙련 +25, 살기 +5)'
            )
          );
        }
        if (opt === 'reforge') return narr(addRep(trainEquipped(addMoney(s, -40), 45), { commerce: 1 }), '다시 벼린 칼은 무게 중심이 손잡이 쪽으로 반 치 옮겨 와 있었다. 초식이 한결 빨라졌다. (장착 초식 숙련 +45)');
        return narr(addRep(addStats(s, { wil: 1 }), { ascetic: 3 }), '사흘 밤을 숫돌 앞에 앉았다. 칼을 가는 소리가 마음을 가는 소리 같았다. (정신 +1, 구도 +3)');
      },
    },
    {
      id: 'rack',
      when: (s) => alive(s).length > 0,
      build: (s) => {
        const d = rand(alive(s));
        return {
          title: '무너진 병기대',
          category: 'LIFE',
          speaker: d.name,
          narration: '낡은 병기대가 와르르 무너지며 창과 칼이 쏟아졌다.',
          script: [
            N(`낡은 병기대가 와르르 무너지며 창과 칼이 쏟아졌다. 마침 지나던 ${d.name}의 팔뚝이 길게 긁혔다.`),
            P(d.name, '괜찮습니다, 스승님! 긁힌 것뿐입니다.', '팔을 감싸 쥐며'),
          ],
          options: [
            { id: 'rebuild', label: `튼튼한 병기대를 새로 짠다 (${coin(s, 20)})`, hint: '상무 +2 · 제자 전원 충성 +2', ...short(s, 20) },
            { id: 'tend', label: `${d.name}의 상처부터 돌본다`, hint: '인덕 +2 · 제자 충성 +6' },
            { id: 'drill', label: '병기 정리를 소홀히 한 벌로 전원 기합을 준다', hint: '구도 +3 · 제자 전원 충성 -1' },
          ],
          meta: { did: d.id },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'rebuild') return narr(tuneAll(addRep(addMoney(s, -20), { commerce: 2 }), { loyalty: 2 }), '목수와 함께 참나무로 병기대를 새로 짰다. 창과 칼이 제자리를 찾자 연무장이 한결 정돈되어 보였다. (상무 +2, 제자 충성 +2)');
        if (opt === 'tend') {
          const d = findDisc(s, c.data?.did);
          if (!d) return s;
          return narr(tuneDisc(addRep(s, { virtue: 2 }), d.id, { loyalty: 6 }), `상처를 씻고 약을 발라 싸매 주었다. ${josa(d.name, '은는')} 괜찮다면서도 감은 팔을 자꾸 쳐다보았다. (인덕 +2, 제자 충성 +6)`);
        }
        return narr(tuneAll(addRep(s, { ascetic: 3 }), { loyalty: -1 }), '해가 질 때까지 모두 병기를 닦고 다시 걸었다. 그 뒤로 병기대에 칼 한 자루 비뚤게 걸리는 일이 없었다. (구도 +3)');
      },
    },
    {
      // 홀로 다락에서 옛 칼을 꺼내 보는 한때 — 화자가 없다
      id: 'old_blade',
      build: (s) => {
        const b = bestOf(s);
        return {
          title: '함 속의 옛 칼',
          category: 'LIFE',
          narration: '다락을 정리하다 낡은 칼 한 자루가 든 함을 찾았다.',
          script: [
            N('다락을 정리하다 낡은 칼 한 자루가 든 함을 찾았다. 칼을 처음 배우던 시절에 쓰던 칼이다. 칼집의 칠이 다 벗겨졌다.'),
            H(s, '이걸 들고 마당을 처음 돌던 날이 엊그제 같은데.', '칼집을 쓰다듬으며'),
          ],
          options: [
            { id: 'polish', label: '밤새 기름을 먹이며 닦는다', hint: '정신 +2 · 구도 +3' },
            ...(b ? [{ id: 'gift', label: `수제자 ${b.name}에게 물려준다`, hint: '인덕 +2 · 제자 충성 +10' }] : []),
            { id: 'hang', label: '대청 벽에 걸어 둔다', hint: alive(s).length ? '명성 +3 · 제자 충성 +1' : '명성 +3' },
          ],
          meta: { did: b?.id || '' },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'polish') return narr(addRep(addStats(s, { wil: 2 }), { ascetic: 3 }), '밤새 칼날에 기름을 먹이고 칼집을 닦았다. 날에 비친 얼굴은 낯설었지만, 칼을 쥔 손의 감각은 그대로였다. (정신 +2, 구도 +3)');
        if (opt === 'gift') {
          const b = findDisc(s, c.data?.did);
          if (!b) return s;
          return narr(tuneDisc(addRep(s, { virtue: 2 }), b.id, { loyalty: 10 }), `${josa(b.name, '은는')} 칼을 두 손으로 받아 들고 한참 말을 잇지 못했다. (인덕 +2, 제자 충성 +10)`);
        }
        const n = tuneAll(addFame(s, 3), { loyalty: 1 });
        return alive(s).length
          ? narr(n, '대청에 걸린 옛 칼 앞에서 제자들이 오가며 고개를 숙이기 시작했다. 누가 시킨 것도 아닌데. (명성 +3)')
          : narr(n, '대청에 걸린 옛 칼이 찾아오는 손님들의 눈길을 끌었다. (명성 +3)');
      },
    },
  ],
  { cond: (s) => s.turn >= 6 }
);

// ═════════ 13. 배우자와의 하루 ═════════
const spouseOf = (s: GameState) => s.spouse!;
const spouseIsFemale = (s: GameState) => (s.spouse?.gender || (s.gender === 'FEMALE' ? 'MALE' : 'FEMALE')) === 'FEMALE';
const FAVORS: Record<string, { scene: (name: string) => string; line: (s: GameState) => string; hint: (s: GameState) => string; apply: (s: GameState) => GameState; text: (s: GameState) => string }> = {
  CLINIC: {
    scene: (name) => `${josa(name, '이가')} 약재를 썰던 작두를 내려놓고 부른다.`,
    line: () => '약재 썰 일손이 모자라요. 하루만 거들어 줘요.',
    hint: () => '통찰 +1 · 건강 +3 · 인덕 +2',
    apply: (s) => addRep(addHealth(addStats(s, { ins: 1 }), 3), { virtue: 2 }),
    text: () => '종일 약재를 썰었다. 풀마다 이름과 쓰임이 있었다. 칼 쓰는 손이 다른 데도 쓰였다. (통찰 +1, 건강 +3, 인덕 +2)',
  },
  COMMERCE: {
    scene: (name) => `${josa(name, '이가')} 수레에 짐을 싣다 말고 부른다.`,
    line: () => '건너 마을 장에 물건을 대러 가는데, 그 고개에 요즘 왈패가 나온대요. 같이 가 줘요.',
    hint: (s) => `+${coin(s, 25)} · 상무 +3`,
    apply: (s) => addRep(addMoney(s, 25), { commerce: 3 }),
    text: () => '칼 찬 사람이 수레 옆에 서 있으니 왈패는커녕 흥정까지 수월했다. (상무 +3)',
  },
  SCHOLAR: {
    scene: (name) => `${josa(name, '이가')} 서책 보따리를 들고 부른다.`,
    line: () => '글방 아이들이 무예 이야기를 듣고 싶대요. 한 시진만 와 줘요.',
    hint: () => '인덕 +3 · 명성 +3',
    apply: (s) => addFame(addRep(s, { virtue: 3 }), 3),
    text: () => '아이들 앞에서 칼 이야기를 했다. 베는 이야기보다 지키는 이야기에 아이들 눈이 더 반짝였다. (인덕 +3, 명성 +3)',
  },
  WESTERN: {
    scene: (name) => `${josa(name, '이가')} 낯선 글자가 빽빽한 책을 펼쳐 들고 부른다.`,
    line: () => '이 양서(洋書)에 칼 쓰는 그림이 있는데, 당신이 보면 무슨 뜻인지 알 것 같아서요.',
    hint: () => '통찰 +2 · 이단 +2',
    apply: (s) => addRep(addStats(s, { ins: 2 }), { arcane: 2 }),
    text: () => '그림 속 서양 검객은 칼끝으로만 찔렀다. 둘이서 밤새 그 자세를 흉내 내며 웃었다. (통찰 +2, 이단 +2)',
  },
  COMBAT: {
    scene: (name) => `${josa(name, '이가')} 목검 두 자루를 들고 마당에 섰다.`,
    line: () => '요즘 몸이 근질근질해요. 오랜만에 한 판 붙어요. 봐주지 말고요.',
    hint: () => '장착 초식 숙련 +30 · 근력 +1',
    apply: (s) => addStats(trainEquipped(s, 30), { str: 1 }),
    text: () => '봐주지 말라더니 정말로 봐주지 않았다. 어깨에 멍이 들었지만 오랜만에 땀이 개운했다. (장착 초식 숙련 +30, 근력 +1)',
  },
  LOYALTY: {
    scene: (name) => `${josa(name, '이가')} 새로 지은 옷 보따리를 안고 부른다.`,
    line: (s) => (alive(s).length ? '제자들 수련복을 새로 지었어요. 당신이 직접 나눠 줘요. 그래야 더 좋아하죠.' : '당신 수련복을 새로 지었어요. 한번 입어 봐요.'),
    hint: (s) => (alive(s).length ? '제자 충성 +4' : '정신 +1 · 건강 +2'),
    apply: (s) => (alive(s).length ? tuneAll(s, { loyalty: 4 }) : addHealth(addStats(s, { wil: 1 }), 2)),
    text: (s) => (alive(s).length ? '스승 손으로 건네받은 새 옷에 제자들이 어쩔 줄 몰라 했다. (제자 충성 +4)' : '새 옷은 몸에 꼭 맞았다. 언제 치수를 쟀는지 모를 일이다. (정신 +1, 건강 +2)'),
  },
};
const favorOf = (s: GameState) => FAVORS[spouseOf(s).bonusType] || FAVORS.LOYALTY;
const spouseDay = homeTemplate(
  'mid_spouse',
  [
    {
      id: 'quarrel',
      build: (s) => {
        const sp = spouseOf(s);
        return {
          title: '살림을 두고 벌어진 말다툼',
          category: 'FAMILY',
          sceneActor: 'SPOUSE',
          speaker: sp.name,
          narration: `저녁상을 물리자마자 ${josa(sp.name, '이가')} 장부를 펼쳐 들었다.`,
          script: [
            N(`저녁상을 물리자마자 ${josa(sp.name, '이가')} 장부를 펼쳐 들었다.`),
            P(sp.name, `당신 눈에는 ${alive(s).length ? '제자들' : '칼'}만 보이지요? 집안 살림이 어떻게 돌아가는지 한 번이라도 물어본 적 있어요?`, '장부를 탁 내려놓으며', 'ANGRY'),
          ],
          options: [
            { id: 'listen', label: '밤늦도록 이야기를 들어 준다', hint: '정신 +1 · 건강 +4 · 인덕 +2' },
            { id: 'ledger', label: '장부를 같이 들여다본다', hint: `+${coin(s, 15)} · 상무 +3` },
            { id: 'argue', label: '도장이 먼저라고 맞선다', hint: '구도 +2 · 건강 -3' },
          ],
        };
      },
      resolve: (s, opt) => {
        const sp = spouseOf(s);
        if (opt === 'listen') return narr(addRep(addHealth(addStats(s, { wil: 1 }), 4), { virtue: 2 }), `${josa(sp.name, '은는')} 한참을 쏟아 놓더니 제풀에 웃음을 터뜨렸다. 「말하고 나니 별것 아니네요.」 (정신 +1, 건강 +4, 인덕 +2)`);
        if (opt === 'ledger') return narr(addRep(addMoney(s, 15), { commerce: 3 }), '둘이 머리를 맞대고 장부를 맞춰 보니 새는 구멍이 두어 군데 보였다. 다음 달부터 곳간에 쌀이 한 말씩 더 남았다. (상무 +3)');
        return narr(addRep(addHealth(s, -3), { ascetic: 2 }), `그날 밤은 각방이었다. 문틈으로 ${sp.name}의 한숨 소리가 새어 나왔다. (구도 +2, 건강 -3)`);
      },
    },
    {
      id: 'inlaws',
      build: (s) => {
        const sp = spouseOf(s);
        const inlaw = s.gender === 'FEMALE' ? '시댁' : '처가';
        const elder = s.gender === 'FEMALE' ? '시아버님' : '장인어른';
        return {
          title: `${inlaw} 어른의 생신`,
          category: 'FAMILY',
          sceneActor: 'SPOUSE',
          speaker: sp.name,
          narration: `${elder}의 생신이 다가왔다.`,
          script: [
            N(`${elder}의 생신이 다가왔다. ${josa(sp.name, '이가')} 몇 달 전부터 손꼽아 기다리던 날이다.`),
            P(sp.name, '이번만큼은 도장 핑계 대지 말고 같이 가요. 아버지가 당신 얼굴 한번 보고 싶다 하셨어요.', '소매를 잡으며'),
          ],
          options: [
            { id: 'go', label: `선물을 사 들고 함께 간다 (${coin(s, 25)})`, hint: '건강 +5 · 인덕 +4 · 명성 +3', ...short(s, 25) },
            { id: 'gift', label: `선물만 들려 보낸다 (${coin(s, 15)})`, hint: '서운해할 것이다', ...short(s, 15) },
            { id: 'stay', label: '도장을 비울 수 없다', hint: '구도 +3 · 건강 -2' },
          ],
        };
      },
      resolve: (s, opt) => {
        const sp = spouseOf(s);
        const inlaw = s.gender === 'FEMALE' ? '시댁' : '처가';
        const elder = s.gender === 'FEMALE' ? '시아버님' : '장인어른';
        const child = s.gender === 'FEMALE' ? '며느리' : '사위';
        if (opt === 'go') return narr(addFame(addRep(addHealth(addMoney(s, -25), 5), { virtue: 4 }), 3), `사흘 동안 ${inlaw}에서 잘 먹고 잘 쉬었다. ${josa(elder, '이가')} ${child} 칼솜씨 자랑을 동네방네 하셨다. (건강 +5, 인덕 +4, 명성 +3)`);
        if (opt === 'gift') return narr(addMoney(s, -15), `${josa(sp.name, '은는')} 선물 보따리를 받아 들고 아무 말 없이 길을 나섰다. 돌아와서도 한동안 말수가 적었다.`);
        return narr(addRep(addHealth(s, -2), { ascetic: 3 }), '혼자 남은 도장은 유난히 조용했다. 수련은 잘되었지만 밥맛이 없었다. (구도 +3, 건강 -2)');
      },
    },
    {
      id: 'cold',
      build: (s) => {
        const sp = spouseOf(s);
        return {
          title: `몸져누운 ${sp.name}`,
          category: 'FAMILY',
          sceneActor: 'SPOUSE',
          speaker: sp.name,
          narration: `감기 몸살로 ${josa(sp.name, '이가')} 사흘째 일어나지 못한다.`,
          script: [
            N(`감기 몸살로 ${josa(sp.name, '이가')} 사흘째 일어나지 못한다. 이마에 얹은 물수건이 금세 데워진다.`),
            P(sp.name, alive(s).length ? '괜찮아요… 제자들 끼니나 챙기세요.' : '괜찮아요… 당신 끼니나 챙겨요.', '이불 속에서'),
          ],
          options: [
            { id: 'nurse', label: '도장 일을 미루고 곁을 지킨다', hint: '인덕 +3 · 정신 +1' },
            { id: 'doctor', label: `의원을 부른다 (${coin(s, 20)})`, hint: '빨리 낫는다', ...short(s, 20) },
            ...(alive(s).length ? [{ id: 'disciples', label: '제자들에게 살림을 맡기고 수련을 이어 간다', hint: '제자 충성 +2 · 상무 +1' }] : []),
          ],
        };
      },
      resolve: (s, opt) => {
        const sp = spouseOf(s);
        const word = spouseIsFemale(s) ? '아내' : '남편';
        if (opt === 'nurse') return narr(addStats(addRep(s, { virtue: 3 }), { wil: 1 }), `사흘 밤을 곁에서 지냈다. 나흘째 아침, ${josa(sp.name, '이가')} 죽 그릇을 비우며 웃었다. (인덕 +3, 정신 +1)`);
        if (opt === 'doctor') return narr(addMoney(s, -20), `의원의 약 두 첩에 열이 내렸다. ${josa(sp.name, '은는')} 「돈 아깝게」 하면서도 싫지 않은 얼굴이었다.`);
        return narr(tuneAll(addRep(s, { commerce: 1 }), { loyalty: 2 }), `제자들이 끓인 죽은 짜고 설익었다. 그래도 ${josa(word, '은는')} 맛있다며 한 그릇을 다 비웠다. (제자 충성 +2, 상무 +1)`);
      },
    },
    {
      id: 'favor',
      build: (s) => {
        const sp = spouseOf(s);
        const f = favorOf(s);
        return {
          title: `${sp.name}의 부탁`,
          category: 'FAMILY',
          sceneActor: 'SPOUSE',
          speaker: sp.name,
          narration: f.scene(sp.name),
          script: [N(f.scene(sp.name)), P(sp.name, f.line(s))],
          options: [
            { id: 'help', label: '기꺼이 돕는다', hint: f.hint(s) },
            { id: 'later', label: '다음에 하자며 미룬다', hint: '서운해할 것이다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'help') {
          const f = favorOf(s);
          return narr(f.apply(s), f.text(s));
        }
        return narr(s, `${josa(spouseOf(s).name, '은는')} 「늘 다음이지요」 하고 돌아섰다.`);
      },
    },
    {
      id: 'moon',
      build: (s) => {
        const sp = spouseOf(s);
        const gift = spouseIsFemale(s) ? byCountry(s, '은비녀', '옥비녀', '빗(櫛)') : byCountry(s, '새 갓끈', '옥 허리띠 장식', '새 담뱃대');
        return {
          title: '달 밝은 밤의 툇마루',
          category: 'FAMILY',
          sceneActor: 'SPOUSE',
          speaker: sp.name,
          narration: `모두 잠든 밤, ${josa(sp.name, '이가')} 툇마루에 앉아 달을 보고 있다.`,
          script: [N(`모두 잠든 밤, ${josa(sp.name, '이가')} 툇마루에 앉아 달을 보고 있다.`), P(sp.name, '우리 처음 만난 날도 이렇게 달이 밝았지요.', '달을 올려다보며')],
          options: [
            { id: 'sit', label: '곁에 앉는다', hint: '건강 +6 · 정신 +1' },
            { id: 'gift', label: `장에서 사 둔 ${josa(gift, '을를')} 꺼내 건넨다 (${coin(s, 15)})`, hint: '건강 +4 · 인덕 +2', ...short(s, 15) },
            { id: 'train', label: '달빛 아래 칼을 휘두르러 나간다', hint: '장착 초식 숙련 +20' },
          ],
          meta: { gift },
        };
      },
      resolve: (s, opt, c) => {
        const sp = spouseOf(s);
        if (opt === 'sit') return narr(addStats(addHealth(s, 6), { wil: 1 }), '말없이 한참을 나란히 앉아 있었다. 그것으로 충분했다. (건강 +6, 정신 +1)');
        if (opt === 'gift') return narr(addRep(addHealth(addMoney(s, -15), 4), { virtue: 2 }), `${josa(sp.name, '은는')} ${josa(String(c.data?.gift || '선물'), '을를')} 달빛에 비춰 보며 오래 웃었다. (건강 +4, 인덕 +2)`);
        return narr(trainEquipped(s, 20), '칼을 휘두르는 동안 등 뒤에서 한숨 소리가 났다. 돌아보니 툇마루는 비어 있었다. (장착 초식 숙련 +20)');
      },
    },
  ],
  { cond: (s) => !!s.spouse?.alive && s.turn >= 6, cooldown: 8 }
);

// ═════════ 14. 자식과의 일 ═════════
const childDay = homeTemplate(
  'mid_child',
  [
    {
      id: 'first_sword',
      build: (s) => {
        const c = rand(kin(s));
        const pw = parentWord(s);
        return {
          title: `목검을 끌고 다니는 ${c.name}`,
          category: 'FAMILY',
          sceneActor: 'DISCIPLE',
          speaker: c.name,
          narration: `마당 구석에서 ${josa(c.name, '이가')} 제 키만 한 목검을 질질 끌고 다닌다.`,
          script: [
            N(`마당 구석에서 ${josa(c.name, '이가')} 제 키만 한 목검을 질질 끌며 ${alive(s).length ? '제자들' : pw} 흉내를 내고 있다.`),
            P(c.name, `${pw}! 나도 칼 배울래요!`, '목검을 치켜들며'),
          ],
          options: [
            { id: 'teach', label: '손을 잡고 첫 자세를 잡아 준다', hint: '아이 근력·민첩 +1 · 충성 +6' },
            { id: 'carve', label: '손에 맞는 작은 목검을 깎아 준다', hint: '아이 충성 +8 · 인덕 +1' },
            { id: 'later', label: '「글부터 배워라」 하고 목검을 거둔다', hint: '아이 통찰 +2' },
          ],
          meta: { cid: c.id },
        };
      },
      resolve: (s, opt, ctx) => {
        const c = findDisc(s, ctx.data?.cid);
        if (!c) return s;
        if (opt === 'teach') return narr(tuneDisc(s, c.id, { str: 1, agi: 1, loyalty: 6 }), `작은 손을 감싸 쥐고 발을 벌려 세웠다. ${josa(c.name, '은는')} 한나절 내내 그 자세 그대로 버텼다. (아이 근력·민첩 +1)`);
        if (opt === 'carve') return narr(tuneDisc(addRep(s, { virtue: 1 }), c.id, { loyalty: 8 }), `밤새 깎은 작은 목검을 머리맡에 두었다. 이튿날 아침, ${josa(c.name, '이가')} 그것을 끌어안고 마당을 몇 바퀴나 돌았다. (아이 충성 +8)`);
        return narr(tuneDisc(s, c.id, { ins: 2 }), `${josa(c.name, '은는')} 입을 삐죽거리며 서당에 갔다. 그래도 저녁마다 담장 너머로 연무장을 훔쳐보았다. (아이 통찰 +2)`);
      },
    },
    {
      id: 'scholar',
      build: (s) => {
        const c = rand(kin(s));
        return {
          title: `${c.name}의 글재주`,
          category: 'LIFE',
          speaker: '훈장 선비',
          narration: `서당 훈장이 찾아와 ${c.name}의 글재주를 칭찬한다.`,
          script: [
            N(`서당 훈장이 찾아와 ${c.name}의 글재주가 남다르니 ${byCountry(s, '과거 공부', '과거 공부', '글공부')}를 시켜 보라고 권한다.`),
            P('훈장 선비', '천자문을 석 달 만에 떼었습니다. 칼만 쥐여 두기에는 아까운 머리입니다.', '수염을 쓰다듬으며'),
          ],
          options: [
            { id: 'study', label: `글공부를 밀어 준다 (${coin(s, 20)})`, hint: '아이 통찰 +3 · 인덕 +1', ...short(s, 20) },
            { id: 'sword', label: '그래도 무가의 자식은 칼이다', hint: '아이 근력 +2 · 구도 +1' },
            { id: 'choose', label: '아이에게 직접 고르게 한다', hint: '아이 충성 +6 · 인덕 +2' },
          ],
          meta: { cid: c.id },
        };
      },
      resolve: (s, opt, ctx) => {
        const c = findDisc(s, ctx.data?.cid);
        if (!c) return s;
        if (opt === 'study') return narr(tuneDisc(addRep(addMoney(s, -20), { virtue: 1 }), c.id, { ins: 3 }), `${josa(c.name, '은는')} 책 보따리를 메고 서당과 연무장을 오갔다. 붓 쥐는 손이 칼 쥐는 손보다 먼저 야물어졌다. (아이 통찰 +3)`);
        if (opt === 'sword') return narr(tuneDisc(addRep(s, { ascetic: 1 }), c.id, { str: 2 }), '훈장은 혀를 차며 돌아갔다. 아이는 그날부터 서당 대신 연무장으로 나왔다. (아이 근력 +2)');
        return narr(tuneDisc(addRep(s, { virtue: 2 }), c.id, { loyalty: 6 }), `${josa(c.name, '은는')} 한참 고민하더니 「둘 다요!」 하고 외쳤다. 훈장과 함께 웃고 말았다. (아이 충성 +6, 인덕 +2)`);
      },
    },
    {
      id: 'fight',
      build: (s) => {
        const c = rand(kin(s));
        return {
          title: `코피를 흘리며 들어온 ${c.name}`,
          category: 'FAMILY',
          sceneActor: 'DISCIPLE',
          speaker: c.name,
          narration: `${josa(c.name, '이가')} 코피를 흘리며 들어왔다.`,
          script: [
            N(`${josa(c.name, '이가')} 코피를 흘리며 들어왔다. 동네 아이들이 「칼잡이 집 자식」이라고 놀려 주먹다짐을 했다는 것이다.`),
            P(c.name, '…쟤들이 먼저 그랬어요!', '소매로 코를 훔치며'),
          ],
          options: [
            { id: 'comfort', label: '안아 주며 참는 법을 일러 준다', hint: '아이 정신 +2 · 인덕 +2' },
            { id: 'dodge', label: '맞지 않는 법만 가르쳐 준다', hint: '아이 민첩 +2 · 충성 +4' },
            { id: 'visit', label: '그 아이네 집에 찾아가 담판을 짓는다', hint: '성공 확률 약 50%' },
          ],
          meta: { cid: c.id },
        };
      },
      resolve: (s, opt, ctx) => {
        const c = findDisc(s, ctx.data?.cid);
        if (!c) return s;
        if (opt === 'comfort') return narr(tuneDisc(addRep(s, { virtue: 2 }), c.id, { wil: 2 }), `「칼 쓰는 사람이 먼저 주먹을 쓰면 지는 거란다.」 ${josa(c.name, '은는')} 훌쩍이다가 고개를 끄덕였다. (아이 정신 +2, 인덕 +2)`);
        if (opt === 'dodge') return narr(tuneDisc(s, c.id, { agi: 2, loyalty: 4 }), '피하는 법, 흘리는 법, 거리를 재는 법. 사흘 뒤, 아이는 한 대도 맞지 않고 돌아왔다 — 물론 한 대도 때리지 않고. (아이 민첩 +2)');
        return chance(0.5)
          ? narr(addRep(addFame(s, 2), { virtue: 1 }), '그 집 부모가 오히려 사과하며 아이들끼리 화해를 시켰다. 이튿날 두 아이가 같이 연을 날리고 있었다. (명성 +2)')
          : narr(addRep(s, { virtue: -2 }), '말이 오가다 어른 싸움이 되었다. 그 뒤로 그 집과는 데면데면해졌다. (인덕 -2)');
      },
    },
    {
      id: 'fever',
      build: (s) => {
        const c = rand(kin(s));
        const pw = parentWord(s);
        const p = clampP(0.4 + s.stats.qi * 0.008);
        return {
          title: `열이 끓는 ${c.name}`,
          category: 'FAMILY',
          sceneActor: 'DISCIPLE',
          speaker: c.name,
          narration: `밤새 ${c.name}의 이마가 불덩이다.`,
          script: [N(`밤새 ${c.name}의 이마가 불덩이다. 헛소리를 하며 ${josa(pw, '을를')} 찾는다.`), P(c.name, `${pw}… 물…`, '가쁜 숨을 몰아쉬며')],
          options: [
            { id: 'vigil', label: '밤새 곁을 지킨다', hint: '건강 -4 · 정신 +1 · 아이 충성 +6' },
            { id: 'doctor', label: `의원을 부른다 (${coin(s, 20)})`, hint: '아이 충성 +3', ...short(s, 20) },
            { id: 'qi', label: '손바닥에 내공을 실어 열을 내린다', hint: `영력 판정 약 ${pct(p)} · 건강 -6` },
          ],
          meta: { cid: c.id, p },
        };
      },
      resolve: (s, opt, ctx) => {
        const c = findDisc(s, ctx.data?.cid);
        if (!c) return s;
        if (opt === 'vigil') return narr(tuneDisc(addStats(addHealth(s, -4), { wil: 1 }), c.id, { loyalty: 6 }), `물수건을 수십 번 갈았다. 새벽녘, ${josa(c.name, '이가')} 땀을 흠뻑 흘리고 곤히 잠들었다. (건강 -4, 정신 +1)`);
        if (opt === 'doctor') return narr(tuneDisc(addMoney(s, -20), c.id, { loyalty: 3 }), '의원의 탕약 한 첩에 열이 내렸다. (아이 충성 +3)');
        return chance(Number(ctx.data?.p) || 0.5)
          ? narr(tuneDisc(addRep(addHealth(s, -6), { ascetic: 2 }), c.id, { loyalty: 5 }), '손바닥이 뜨거워지는가 싶더니 아이의 숨이 고르게 가라앉았다. 새벽까지 그 손을 떼지 않았다. (건강 -6, 구도 +2)')
          : narr(addMoney(addHealth(s, -6), -20), `내공이 아이 몸 안에서 겉돌았다. 결국 새벽에 의원을 불렀다. (건강 -6, 의원비 ${coin(s, 20)})`);
      },
    },
    {
      id: 'question',
      build: (s) => {
        const c = rand(kin(s));
        const pw = parentWord(s);
        return {
          title: `${c.name}의 물음`,
          category: 'FAMILY',
          sceneActor: 'DISCIPLE',
          speaker: c.name,
          narration: `저녁상 앞에서 ${josa(c.name, '이가')} 수저를 내려놓고 빤히 쳐다본다.`,
          script: [N(`저녁상 앞에서 ${josa(c.name, '이가')} 수저를 내려놓고 빤히 쳐다본다.`), P(c.name, `${josa(pw, '은는')} 사람을 베어 본 적 있어요?`, '고개를 갸웃하며')],
          options: [
            { id: 'truth', label: '있는 그대로 말해 준다', hint: '거짓말은 하지 않는다' },
            { id: 'lesson', label: '칼을 왜 배우는지 이야기해 준다', hint: '아이 통찰·정신 +1 · 인덕 +2' },
            { id: 'deflect', label: '밥이나 먹으라며 웃어넘긴다' },
          ],
          meta: { cid: c.id },
        };
      },
      resolve: (s, opt, ctx) => {
        const c = findDisc(s, ctx.data?.cid);
        if (!c) return s;
        if (opt === 'truth') {
          return s.reputation.ruthless >= 40
            ? narr(tuneDisc(s, c.id, { wil: 2 }), `「있다.」 한마디에 밥상이 조용해졌다. ${josa(c.name, '은는')} 그날 밤 오래 잠들지 못했다. 그래도 거짓말은 하지 않았다. (아이 정신 +2)`)
            : narr(addRep(s, { ascetic: 2 }), `「없다. 베지 않으려고 배우는 거란다.」 ${josa(c.name, '이가')} 고개를 갸웃하더니 다시 수저를 들었다. (구도 +2)`);
        }
        if (opt === 'lesson') return narr(tuneDisc(addRep(s, { virtue: 2 }), c.id, { ins: 1, wil: 1 }), '칼은 베는 법보다 멈추는 법을 먼저 배운다는 이야기를 했다. 아이는 반쯤 졸면서도 끝까지 들었다. (인덕 +2)');
        return narr(s, `${josa(c.name, '은는')} 입을 삐죽였다. 그 물음은 언젠가 다시 돌아올 것이다.`);
      },
    },
  ],
  { cond: (s) => kin(s).length > 0, cooldown: 8 }
);

// ═════════ 15. 홀로 있는 한때 — 대문을 두드리는 사람 없이 ═════════
const quiet = homeTemplate(
  'mid_quiet',
  [
    {
      id: 'grey_hair',
      when: (s) => s.age >= 36,
      build: (s) => ({
        title: '세숫물에 비친 흰 머리칼',
        category: 'LIFE',
        narration: '아침 세숫물에 비친 얼굴, 귀밑에 흰 머리칼 몇 가닥이 섞여 있다.',
        script: [N('아침 세숫물에 비친 얼굴, 귀밑에 흰 머리칼 몇 가닥이 섞여 있다.'), H(s, '벌써 이렇게 되었나…', '물그릇을 들여다보며')],
        options: [
          { id: 'train', label: '마당에 나가 젊을 때처럼 휘둘러 본다', hint: '장착 초식 숙련 +25 · 건강 -3' },
          { id: 'write', label: '그동안 깨친 것을 적어 두기 시작한다', hint: '통찰 +2 · 구도 +3' },
          { id: 'laugh', label: '「흰머리도 칼자국만큼 벌었지」 하고 웃어넘긴다', hint: '정신 +1 · 건강 +2' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'train') return narr(addHealth(trainEquipped(s, 25), -3), '젊을 때처럼 마당을 몇 바퀴 돌며 칼을 휘둘렀다. 숨은 가빴지만 칼끝은 예전보다 정확했다. (장착 초식 숙련 +25, 건강 -3)');
        if (opt === 'write') return narr(addRep(addStats(s, { ins: 2 }), { ascetic: 3 }), '붓을 들어 첫 장에 「아직 늦지 않았다」라고 적었다. 그 아래로 수십 년의 칼이 한 줄씩 내려앉았다. (통찰 +2, 구도 +3)');
        return narr(addHealth(addStats(s, { wil: 1 }), 2), '물그릇을 엎고 크게 웃었다. 지나가던 이웃이 무슨 좋은 일이 있느냐고 물었다. (정신 +1, 건강 +2)');
      },
    },
    {
      id: 'first_snow',
      when: (s) => s.season === 'WINTER',
      build: (s) => ({
        title: '첫눈 내린 새벽 마당',
        category: 'LIFE',
        narration: '아무도 밟지 않은 마당에 첫눈이 소복하다. 처마 끝 고드름에 새벽빛이 걸렸다.',
        script: [N('아무도 밟지 않은 마당에 첫눈이 소복하다. 처마 끝 고드름에 새벽빛이 걸렸다.'), H(s, '이 위에 첫 발자국을 낼 사람은 나로구나.', '숨을 내쉬며')],
        options: [
          { id: 'kata', label: '맨발로 눈 위에서 형(形)을 펼친다', hint: '체력 +1 · 장착 초식 숙련 +20 · 건강 -2' },
          { id: 'sit', label: '툇마루에 앉아 눈 내리는 소리를 듣는다', hint: '구도 +4 · 정신 +1' },
          { id: 'sweep', label: '모두 깨기 전에 마당을 쓴다', hint: '인덕 +2 · 정신 +1' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'kata') return narr(addHealth(addStats(trainEquipped(s, 20), { vit: 1 }), -2), '맨발이 얼어붙을 듯했지만 형을 끝까지 펼쳤다. 눈 위에 남은 발자국이 그대로 초식도가 되었다. (체력 +1, 장착 초식 숙련 +20)');
        if (opt === 'sit') return narr(addStats(addRep(s, { ascetic: 4 }), { wil: 1 }), '눈 내리는 소리는 생각보다 컸다. 그 소리를 듣고 있으니 칼 소리가 들리지 않았다. (구도 +4, 정신 +1)');
        const n = addStats(addRep(s, { virtue: 2 }), { wil: 1 });
        return alive(s).length
          ? narr(n, '제자들이 깨어 나왔을 때 마당은 이미 말끔했다. 아무도 누가 쓸었는지 묻지 않았다. (인덕 +2, 정신 +1)')
          : narr(n, '혼자 마당을 다 쓸고 나니 이마에 땀이 맺혔다. 깨끗한 마당이 하루를 기다리고 있었다. (인덕 +2, 정신 +1)');
      },
    },
    {
      id: 'moon_drink',
      when: (s) => s.season === 'AUTUMN',
      build: (s) => ({
        title: '달 아래 홀로 기울이는 술잔',
        category: 'LIFE',
        narration: '보름달이 연무장을 하얗게 비춘다. 술 한 병을 들고 마루 끝에 나앉았다.',
        script: [N('보름달이 연무장을 하얗게 비춘다. 술 한 병을 들고 마루 끝에 나앉았다.'), H(s, '달은 저 혼자 밝은데, 칼은 누구를 위해 갈았던가.', '잔을 들며')],
        options: [
          { id: 'drink', label: '한 잔 더 기울인다', hint: '건강 +3 · 정신 +1' },
          { id: 'poem', label: '시 한 수를 읊는다', hint: '통찰 +1 · 구도 +2' },
          { id: 'shadow', label: '달그림자를 베어 본다', hint: '장착 초식 숙련 +20' },
          { id: 'moon_qi', label: '옛 도가(道家) 책에서 본 대로 달빛을 들이마시는 토납(吐納)을 해 본다', hint: '이단 +3 · 영력 +1' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'drink') return narr(addStats(addHealth(s, 3), { wil: 1 }), '술이 달았다. 달이 기울 때까지 잔을 비웠다. (건강 +3, 정신 +1)');
        if (opt === 'moon_qi') return narr(addStats(addRep(s, { arcane: 3 }), { qi: 1 }), '달을 향해 입을 벌리고 숨을 천천히 들이마셨다. 서늘한 기운이 목구멍을 타고 내려가 단전에 고였다. 술기운인지 달기운인지는 알 수 없었다. (이단 +3, 영력 +1)');
        if (opt === 'poem') return narr(addRep(addStats(s, { ins: 1 }), { ascetic: 2 }), '서툰 시였지만 읊고 나니 가슴이 시원했다. 달은 아무 평도 하지 않았다. (통찰 +1, 구도 +2)');
        return narr(trainEquipped(s, 20), '마당에 드리운 제 그림자를 상대로 칼을 겨누었다. 그림자는 끝까지 한 치도 물러서지 않았다. (장착 초식 숙련 +20)');
      },
    },
    {
      // 프롤로그에서 역병으로 떠난 부모가 첫 스승이었다 (조선·일본은 아버지, 청은 어머니)
      id: 'parent_day',
      build: (s) => {
        const pt = byCountry(s, '아버지', '어머니', '아버지');
        return {
          title: `${pt}의 기일`,
          category: 'LIFE',
          narration: `오늘은 처음 칼을 쥐여 준 ${pt}의 기일이다.`,
          script: [N(`오늘은 처음 칼을 쥐여 준 ${pt}의 기일이다. 정화수 한 그릇을 떠 놓고 홀로 앉았다.`), H(s, `${pt}, 저는 아직 그 칼끝을 다 따라가지 못했습니다.`, '정화수 앞에서')],
          options: [
            { id: 'basics', label: '처음 배운 초식을 천 번 긋는다', hint: '장착 초식 숙련 +30 · 구도 +3' },
            { id: 'rite', label: `조촐하게 제사상을 차린다 (${coin(s, 10)})`, hint: '정신 +2 · 인덕 +2', ...short(s, 10) },
            { id: 'letters', label: '생전에 남긴 글을 다시 읽는다', hint: '통찰 +1 · 건강 +2' },
            { id: 'summon', label: `정화수 앞에서 ${pt}의 넋을 불러 본다`, hint: '이단 +3 · 정신 +1' },
          ],
          meta: { pt },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'basics') return narr(addRep(trainEquipped(s, 30), { ascetic: 3 }), '해가 질 때까지 첫 초식을 천 번 그었다. 천 번째 칼이 처음으로 그때 본 칼과 겹쳤다. (장착 초식 숙련 +30, 구도 +3)');
        if (opt === 'summon') {
          return narr(
            addStats(addRep(s, { arcane: 3 }), { wil: 1 }),
            `자정 무렵, 바람 한 점 없는데 정화수 위로 잔물결이 일었다. 물결이 잦아들 때까지 무릎을 꿇고 있었다. ${String(c.data?.pt || '아버지')}께서 다녀가셨는지는 묻지 않기로 했다. (이단 +3, 정신 +1)`
          );
        }
        if (opt === 'rite') {
          const n = addRep(addStats(addMoney(s, -10), { wil: 2 }), { virtue: 2 });
          return alive(s).length
            ? narr(n, '제자들이 말없이 뒤에 서서 함께 절을 올렸다. (정신 +2, 인덕 +2)')
            : narr(n, '홀로 술을 따르고 절을 올렸다. 향 연기가 곧게 올라갔다. (정신 +2, 인덕 +2)');
        }
        return narr(addHealth(addStats(s, { ins: 1 }), 2), `낡은 종이에 적힌 ${String(c.data?.pt || '아버지')}의 글씨는 칼자국처럼 곧았다. 「칼보다 사람이 먼저다.」 그 한 줄을 오래 들여다보았다. (통찰 +1, 건강 +2)`);
      },
    },
    {
      id: 'rain_day',
      when: (s) => s.season === 'SUMMER',
      build: (s) => ({
        title: '장대비에 쉬는 연무장',
        category: 'LIFE',
        narration: '장대비가 쏟아져 수련을 쉬었다. 처마 끝 낙숫물 소리만 빈 연무장을 채운다.',
        script: [N('장대비가 쏟아져 수련을 쉬었다. 처마 끝 낙숫물 소리만 빈 연무장을 채운다.'), H(s, '비가 오면 칼도 쉬어야지. 칼을 쥔 사람만 쉬는 법을 모르니.', '처마 밑에 서서')],
        options: [
          { id: 'sharpen', label: '칼을 꺼내 천천히 간다', hint: '장착 초식 숙련 +15 · 정신 +1' },
          { id: 'read', label: '밀어 두었던 책을 읽는다', hint: '통찰 +2' },
          { id: 'nap', label: '모처럼 낮잠을 잔다', hint: '건강 +6' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'sharpen') return narr(addStats(trainEquipped(s, 15), { wil: 1 }), '숫돌에 물을 끼얹어 가며 칼을 갈았다. 빗소리와 숫돌 소리가 한 박자로 맞아 들었다. (장착 초식 숙련 +15, 정신 +1)');
        if (opt === 'read') return narr(addStats(s, { ins: 2 }), '빗소리를 벗 삼아 책장을 넘겼다. 한 줄이 마음에 걸려 몇 번이나 되읽었다. (통찰 +2)');
        return narr(addHealth(s, 6), '얼마 만의 낮잠인지 모른다. 깨어 보니 비가 그쳐 있었다. (건강 +6)');
      },
    },
    {
      id: 'spring_walk',
      when: (s) => s.season === 'SPRING',
      build: (s) => {
        const flower = byCountry(s, '진달래', '복사꽃', '벚꽃');
        return {
          title: `${flower} 핀 뒷산`,
          category: 'LIFE',
          narration: `뒷산에 ${josa(flower, '이가')} 한창이다. 수련을 마치고 혼자 산길을 올랐다.`,
          script: [N(`뒷산에 ${josa(flower, '이가')} 한창이다. 수련을 마치고 혼자 산길을 올랐다.`), H(s, '꽃은 피는 데 한 철, 지는 데 한나절이구나.', '꽃가지를 올려다보며')],
          options: [
            { id: 'climb', label: '꼭대기까지 단숨에 오른다', hint: '체력 +1 · 건강 +3' },
            { id: 'sit', label: '꽃그늘에 앉아 숨을 고른다', hint: '구도 +3 · 정신 +1' },
            { id: 'pick', label: '꽃가지 하나를 꺾어 와 대청에 꽂는다', hint: '인덕 +1 · 건강 +2' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'climb') return narr(addHealth(addStats(s, { vit: 1 }), 3), '단숨에 꼭대기에 올랐다. 고을이 손바닥만 하게 내려다보였다. 도장 지붕이 생각보다 작았다. (체력 +1, 건강 +3)');
        if (opt === 'sit') return narr(addStats(addRep(s, { ascetic: 3 }), { wil: 1 }), '꽃잎이 어깨에 내려앉았다 떨어지는 동안 꼼짝하지 않았다. 바람이 지나가는 길이 보이는 것 같았다. (구도 +3, 정신 +1)');
        const n = addHealth(addRep(s, { virtue: 1 }), 2);
        return alive(s).length
          ? narr(n, '대청에 꽂힌 꽃가지를 보고 제자들이 「스승님도 꽃을 다 꺾으시네」 하며 수군거렸다. (인덕 +1, 건강 +2)')
          : narr(n, '대청에 꽂아 둔 꽃가지 덕에 집 안이 한결 환해졌다. (인덕 +1, 건강 +2)');
      },
    },
  ],
  { cond: (s) => s.turn >= 8, weight: 0.85 }
);

// ═════════ 16. 이웃의 잔치와 초상 ═════════
const NAME_CHARS = ['굳셀 강(剛)', '곧을 직(直)', '밝을 명(明)', '어질 인(仁)', '편안할 안(安)', '빛날 희(熙)'];
const neighborRite = homeTemplate(
  'mid_neighbor_rite',
  [
    {
      id: 'wedding',
      build: (s) => ({
        title: '이웃집 혼례',
        category: 'LIFE',
        speaker: '혼주 영감',
        narration: '이웃집 딸이 시집을 간다.',
        script: [
          N('이웃집 딸이 시집을 간다. 혼주가 옷매무새를 고치고 도장까지 찾아와 잔치에 와 달라고 청한다.'),
          P('혼주 영감', '사범님이 상석에 앉아 주시면 사돈댁 보기에도 체면이 서지요. 꼭 좀 와 주시오.', '허리를 굽히며'),
        ],
        options: [
          { id: 'attend', label: `축의금을 들고 간다 (${coin(s, 15)})`, hint: '인덕 +3 · 명성 +5 · 건강 +2', ...short(s, 15) },
          ...(alive(s).length ? [{ id: 'dance', label: '제자들과 축하 검무를 춘다', hint: '명성 +8 · 제자 충성 +2' }] : []),
          { id: 'decline', label: '수련을 핑계로 빠진다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'attend') return narr(addHealth(addFame(addRep(addMoney(s, -15), { virtue: 3 }), 5), 2), '상석에 앉아 국수 한 그릇을 받았다. 혼주가 사돈에게 「우리 동네 사범님」이라며 몇 번이나 소개했다. (인덕 +3, 명성 +5)');
        if (opt === 'dance') return narr(tuneAll(addFame(s, 8), { loyalty: 2 }), '제자들이 칼을 들고 마당에 서자 잔칫집이 술렁였다. 검무가 끝나자 신부 쪽 할머니가 「잡귀가 다 달아나겠다」며 손뼉을 쳤다. (명성 +8, 제자 충성 +2)');
        return narr(s, '담 너머로 잔치 소리가 밤늦도록 들렸다. 혼주는 그 뒤로 인사가 조금 짧아졌다.');
      },
    },
    {
      id: 'funeral',
      build: (s) => {
        const bier = byCountry(s, '상여', '상여', '관');
        return {
          title: '이웃 영감의 초상',
          category: 'LIFE',
          speaker: '상복 입은 농부',
          narration: '담 너머 이웃 영감이 세상을 떴다.',
          script: [
            N(`담 너머 이웃 영감이 세상을 떴다. 상복을 입은 맏아들이 찾아와, ${josa(bier, '을를')} 멜 장정이 모자란다며 고개를 숙인다.`),
            P('상복 입은 농부', '아버님이 생전에 사범님 댁 기합 소리를 들으며 잠드는 게 낙이라 하셨습니다. 마지막 길에 어깨를 좀 빌려 주십시오.', '고개를 숙이며'),
          ],
          options: [
            { id: 'carry', label: `${alive(s).length ? '제자들과 ' : ''}${josa(bier, '을를')} 멘다`, hint: '인덕 +5 · 명성 +4 · 건강 -2' },
            { id: 'condole', label: `부조만 한다 (${coin(s, 10)})`, hint: '인덕 +2', ...short(s, 10) },
            { id: 'decline', label: '초상집 일에는 끼지 않는다' },
          ],
          meta: { bier },
        };
      },
      resolve: (s, opt, c) => {
        const bier = String(c.data?.bier || '상여');
        if (opt === 'carry') {
          const beat = byCountry(s, '앞소리꾼의 요령 소리에 맞춰', '징과 나팔 소리에 맞춰', '스님의 독경 소리에 맞춰');
          return narr(addHealth(addFame(addRep(s, { virtue: 5 }), 4), -2), `${beat} 발을 맞췄다. 산길을 오르는 내내 ${josa(bier, '이가')} 한 번도 기울지 않았다. 고을 사람들이 「역시 칼 쓰는 사람들 어깨는 다르다」고 했다. (인덕 +5, 명성 +4)`);
        }
        if (opt === 'condole') return narr(addRep(addMoney(s, -10), { virtue: 2 }), '부조를 건네고 영전 앞에 절을 올렸다. (인덕 +2)');
        return narr(s, `그날 하루 도장 대문을 닫아 두었다. ${byCountry(s, '곡소리', '곡소리', '독경 소리')}가 담을 넘어왔다.`);
      },
    },
    {
      id: 'baby',
      build: (s) => {
        const rite = byCountry(s, '백일', '만월(滿月)', '첫 참배');
        return {
          title: byCountry(s, '이웃집 백일잔치', '이웃집 만월(滿月) 잔치', '이웃집 아기의 첫 참배'),
          category: 'LIFE',
          speaker: '이웃집 아낙',
          narration: `이웃집 아기가 ${josa(rite, '을를')} 맞았다.`,
          script: [
            N(`이웃집 아기가 ${josa(rite, '을를')} 맞았다. 아기 어머니가 떡 접시를 들고 와서 조심스레 청한다.`),
            P('이웃집 아낙', '칼 찬 어른께 이름을 받으면 아이가 잡귀를 안 탄대요. 이름 한 자만 지어 주실 수 있을까요?', '떡 접시를 내밀며'),
          ],
          options: [
            { id: 'name', label: '정성껏 이름 한 자를 지어 준다', hint: '인덕 +4 · 통찰 +1' },
            { id: 'gift', label: `실타래와 쌀을 보낸다 (${coin(s, 10)})`, hint: '인덕 +2', ...short(s, 10) },
            { id: 'decline', label: '이름 짓는 재주는 없다며 사양한다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'name') {
          const ch = rand(NAME_CHARS);
          return narr(addStats(addRep(remember(s, 'named_baby', String(s.year)), { virtue: 4 }), { ins: 1 }), `밤새 옥편을 뒤져 「${ch}」 한 글자를 골라 주었다. 아기 어머니가 그 글자를 몇 번이고 소리 내어 불렀다. (인덕 +4, 통찰 +1)`);
        }
        if (opt === 'gift') return narr(addRep(addMoney(s, -10), { virtue: 2 }), '실타래는 오래 살라는 뜻, 쌀은 배곯지 말라는 뜻이다. 아기 어머니가 고개를 깊이 숙였다. (인덕 +2)');
        return narr(s, '아낙은 서운한 기색을 감추고 떡 접시만 두고 갔다.');
      },
    },
    {
      id: 'sixty',
      build: (s) => {
        const p = clampP(0.4 + s.stats.str * 0.006);
        return {
          title: byCountry(s, '이웃 노인의 환갑잔치', '이웃 노인의 육순 수연(壽宴)', '이웃 노인의 환갑(還暦) 잔치'),
          category: 'LIFE',
          speaker: '이웃집 영감',
          narration: '이웃 노인이 환갑을 맞아 마당에 차일을 쳤다.',
          script: [
            N('이웃 노인이 환갑을 맞아 마당에 차일을 쳤다. 노인이 직접 지팡이를 짚고 도장까지 와서 소매를 끈다.'),
            P('이웃집 영감', '내 환갑에 사범님 얼굴 한번 보는 게 소원이었소! 오늘만큼은 칼 내려놓고 한잔하시오.', '소매를 끌며'),
          ],
          options: [
            { id: 'attend', label: `잔치에 간다 (${coin(s, 15)})`, hint: '인덕 +3 · 건강 +3', ...short(s, 15) },
            { id: 'wrestle', label: '잔치 마당의 팔씨름판에 낀다', hint: `이길 확률 약 ${pct(p)} · 명성` },
            { id: 'decline', label: '정중히 사양한다' },
          ],
          meta: { p },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'attend') return narr(addHealth(addRep(addMoney(s, -15), { virtue: 3 }), 3), '노인이 잔을 채워 주며 젊은 날 이야기를 끝도 없이 늘어놓았다. 그 이야기의 절반은 칼 이야기였다. (인덕 +3, 건강 +3)');
        if (opt === 'wrestle') {
          return chance(Number(c.data?.p) || 0.5)
            ? narr(addStats(addFame(s, 6), { str: 1 }), '고을 장사들의 팔을 차례로 넘겼다. 노인이 손뼉을 치며 「우리 동네 사범님이 최고다!」 하고 외쳤다. (명성 +6, 근력 +1)')
            : narr(addFame(s, -1), '대장간 아들에게 팔목이 꺾였다. 노인이 배를 잡고 웃었다. 그것도 잔치 선물이었다. (명성 -1)');
        }
        return narr(s, '노인은 서운해하면서도 떡 한 접시를 싸서 보냈다.');
      },
    },
  ],
  { cond: (s) => s.turn >= 6 }
);

// ═════════ 17. 도장 살림 — 장부와 쌀독 ═════════
const ledger = homeTemplate(
  'mid_ledger',
  [
    {
      id: 'rice_scam',
      when: (s) => alive(s).length > 0,
      build: (s) => {
        const d = rand(alive(s));
        return {
          title: '바닥이 두꺼운 쌀됫박',
          category: 'LIFE',
          speaker: d.name,
          narration: `${josa(d.name, '이가')} 쌀가게에서 받아 온 됫박을 엎어 보이며 씩씩거린다.`,
          script: [
            N(`${josa(d.name, '이가')} 쌀가게에서 받아 온 됫박을 엎어 보이며 씩씩거린다. 됫박 바닥이 손가락 한 마디만큼 두껍다.`),
            P(d.name, '스승님, 몇 해 동안 이 됫박에 속아 온 겁니다!', '됫박을 탁 내려놓으며', 'ANGRY'),
          ],
          options: [
            { id: 'confront', label: '쌀가게에 찾아가 따진다', hint: `+${coin(s, 40)} · 상무 +3` },
            { id: 'report', label: '관아에 고발한다', hint: '인덕 +3 · 명성 +3' },
            { id: 'switch', label: '말없이 다른 가게와 거래를 튼다', hint: '상무 +2' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'confront') return narr(addRep(addMoney(s, 40), { commerce: 3 }), '쌀가게 주인은 됫박을 보자 얼굴이 하얘지더니 묵은 셈을 쳐서 돌려주었다. 그 뒤로 그 가게 됫박 바닥이 얇아졌다. (상무 +3)');
        if (opt === 'report') return narr(addFame(addRep(s, { virtue: 3 }), 3), '관아에서 그 가게 됫박을 모두 거두어 갔다. 같이 속아 온 고을 아낙들이 도장에 떡을 돌렸다. (인덕 +3, 명성 +3)');
        return narr(addRep(s, { commerce: 2 }), '건너 마을 쌀가게와 거래를 텄다. 같은 값에 쌀이 반 되씩 더 들어왔다. (상무 +2)');
      },
    },
    {
      id: 'gye',
      build: (s) => {
        const gye = byCountry(s, '계(契)', '합회(合會)', '다노모시코(頼母子講)');
        return {
          title: `${gye}의 권유`,
          category: 'LIFE',
          speaker: '계주 아낙',
          narration: `고을 아낙들이 꾸리는 ${gye}의 계주가 찾아왔다.`,
          script: [
            N(`고을 아낙들이 꾸리는 ${gye}의 계주가 찾아와 도장도 한 몫 들라고 권한다. 다달이 조금씩 붓다가 차례가 오면 목돈을 타는 것이다.`),
            P('계주 아낙', '사범님 댁이 들어오면 다른 집들도 마음 놓고 들어올 거예요. 칼 찬 집이 끼어 있으면 곗돈 떼먹을 사람도 없을 테고요.', '장부를 펼치며'),
          ],
          options: [
            { id: 'join', label: `한 몫 든다 (${coin(s, 30)})`, hint: '운에 맡긴다 · 상무 +3', ...short(s, 30) },
            { id: 'guard', label: '돈은 안 넣고 곗돈 지킴이만 맡는다', hint: '인덕 +3 · 명성 +3' },
            { id: 'decline', label: '돈 모임에는 끼지 않는다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'join') {
          const n = addRep(addMoney(s, -30), { commerce: 3 });
          return chance(0.75)
            ? narr(addMoney(n, 65), `몇 달 뒤 차례가 돌아와 곗돈 ${josa(coin(s, 65), '을를')} 탔다. 계원들이 「사범님 댁에 복이 붙었다」며 웃었다. (상무 +3)`)
            : narr(addFame(n, -2), '계주가 곗돈을 몽땅 들고 야반도주했다. 계원들의 원성이 엉뚱하게 도장으로 쏟아졌다. (상무 +3, 명성 -2)');
        }
        if (opt === 'guard') return narr(addFame(addRep(s, { virtue: 3 }), 3), '곗날마다 칼을 차고 앉아 있기만 했다. 그해 곗돈은 한 푼도 새지 않았다. (인덕 +3, 명성 +3)');
        return narr(s, '계주는 「아쉽네요」 하며 장부를 덮었다.');
      },
    },
    {
      // 홀로 장부를 넘겨 보는 한때 — 화자가 없다
      id: 'credit',
      build: (s) => ({
        title: '장부 속 받지 못한 외상값',
        category: 'LIFE',
        narration: '한 해 장부를 정리하다 보니, 고을 사람들에게 받지 못한 외상값이 꽤 쌓여 있다.',
        script: [
          N('한 해 장부를 정리하다 보니, 고을 사람들에게 받지 못한 외상값이 꽤 쌓여 있다. 월사금 외상, 시연 사례 외상, 약값 외상…'),
          H(s, '다 받아 내면 곳간이 넉넉해지겠지만…', '주판을 내려놓으며'),
        ],
        options: [
          { id: 'collect', label: '집집마다 찾아가 받아 낸다', hint: `+${coin(s, 45)} · 상무 +4 · 인덕 -2` },
          { id: 'strip', label: '칼을 찬 채 집집마다 받아 내고, 못 내는 집은 세간을 들어낸다', hint: `+${coin(s, 60)} · 살기 +5 · 인덕 -3` },
          { id: 'half', label: '형편이 되는 집에서만 받는다', hint: `+${coin(s, 20)} · 상무 +2 · 인덕 +2` },
          { id: 'burn', label: '장부를 불살라 외상을 모두 없던 일로 한다', hint: '인덕 +5 · 명성 +5' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'collect') return narr(addRep(addMoney(s, 45), { commerce: 4, virtue: -2 }), '집집마다 문을 두드렸다. 돈은 들어왔지만, 몇몇 집은 그 뒤로 길에서 마주쳐도 고개를 돌렸다. (상무 +4, 인덕 -2)');
        if (opt === 'strip') return narr(addRep(addMoney(s, 60), { ruthless: 5, virtue: -3 }), `칼을 찬 채 대문마다 버티고 섰다. 돈이 없는 집에서는 솥단지와 놋그릇을 들고 나왔다. 그해 겨울, 고을 사람들은 도장 앞을 돌아서 다녔다. (+${coin(s, 60)}, 살기 +5, 인덕 -3)`);
        if (opt === 'half') return narr(addRep(addMoney(s, 20), { commerce: 2, virtue: 2 }), '형편이 되는 집에서만 받고 나머지는 「다음에」로 남겼다. 다음은 오지 않았지만 아무도 원망하지 않았다. (상무 +2, 인덕 +2)');
        return narr(addFame(addRep(s, { virtue: 5 }), 5), '마당 한가운데서 외상 장부를 불살랐다. 연기가 다 걷히기도 전에 소문이 고을을 한 바퀴 돌았다. 옛날 풍훤(馮諼)이 빚 문서를 불살라 주인의 인심을 샀다는 이야기가 장터에서 다시 오르내렸다. (인덕 +5, 명성 +5)');
      },
    },
    {
      // 홀로 빈 쌀독을 들여다보는 한때 — 화자가 없다
      id: 'price_spike',
      build: (s) => ({
        title: '열흘 새 두 배가 된 쌀값',
        category: 'LIFE',
        narration: '흉년이 든다는 소문에 쌀값이 열흘 새 두 배로 뛰었다.',
        script: [
          N('흉년이 든다는 소문에 쌀값이 열흘 새 두 배로 뛰었다. 장터마다 쌀을 사재기하려는 사람들로 북새통이다.'),
          H(s, '곳간에는 한 철 먹을 쌀밖에 없는데.', '쌀독을 들여다보며'),
        ],
        options: [
          { id: 'buy', label: `더 오르기 전에 사 둔다 (${coin(s, 40)})`, hint: '운에 맡긴다 · 상무 +3', ...short(s, 40) },
          { id: 'thin', label: alive(s).length ? '제자들과 죽을 쑤어 먹으며 버틴다' : '죽을 쑤어 먹으며 버틴다', hint: '건강 -4 · 구도 +3' },
          { id: 'share', label: `곳간을 열어 이웃과 나눈다 (${coin(s, 10)}어치)`, hint: '인덕 +6 · 명성 +4' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt === 'buy') {
          const n = addMoney(s, -40);
          return chance(0.6)
            ? narr(addRep(addMoney(n, 25), { commerce: 3 }), '쌀값은 그 뒤로도 한참을 올랐다. 미리 사 둔 쌀로 한 철을 넉넉히 나고, 남는 것은 되팔았다. (상무 +3)')
            : narr(addRep(n, { commerce: 1 }), '소문은 헛소문이었다. 쌀값이 도로 내려앉았고, 비싸게 산 쌀만 곳간에 쌓였다. (상무 +1)');
        }
        if (opt === 'thin') {
          const n = tuneAll(addRep(addHealth(s, -4), { ascetic: 3 }), { loyalty: -1 });
          return alive(s).length
            ? narr(n, '한 철 내내 묽은 죽을 먹었다. 제자들 볼이 홀쭉해졌지만 아무도 투덜대지 않았다 — 겉으로는. (건강 -4, 구도 +3)')
            : narr(n, '한 철 내내 묽은 죽으로 버텼다. 배는 고팠지만 정신은 맑았다. (건강 -4, 구도 +3)');
        }
        return narr(addFame(addRep(addMoney(s, -10), { virtue: 6 }), 4), '곳간 문을 열고 이웃들에게 쌀을 한 바가지씩 퍼 주었다. 쌀값이 다시 내리자 그 집들이 쌀을 갚으러 왔다 — 이자로 떡까지 얹어서. (인덕 +6, 명성 +4)');
      },
    },
  ],
  { cond: (s) => s.turn >= 8 }
);

export const MIDLIFE_EVENTS: JourneyEventDef[] = [
  repair,
  water,
  matchmaker,
  artist,
  creature,
  thief,
  physician,
  mendicant,
  office,
  discParent,
  discNight,
  gear,
  spouseDay,
  childDay,
  quiet,
  neighborRite,
  ledger,
];
