import { Disciple, GameState, Season } from '../../types/game';
import {
  addEcho,
  addFame,
  addHealth,
  addMoney,
  addRep,
  addStats,
  byCountry,
  chance,
  cur,
  echoMilestone,
  giveWeapon,
  H,
  JourneyEventDef,
  journeyBattle,
  N,
  P,
  rand,
  remember,
  roadScale,
  say,
  takeEcho,
  trainEquipped,
} from '../../engine/journeyCore';
import { fighterPower, makePersonName, randomSectName, takenNames } from '../../engine/tourney';
import { adjustRelation } from '../../engine/sectLogic';
import { metSects } from '../sects';
import { rumorsFor } from '../journeyRegions';
import { getMaxDisciples } from '../../engine/gameLogic';
import { createDiscipleEntity } from '../events';
import { josa } from '../../utils/korean';

// 도장에서 일어나는 생성형 사건들. 같은 틀이라도 사람·장소·시절·상태에 따라 매번 다른 이야기가 된다.
// 선택지마다 성공 확률이 있고, 어떤 선택은 몇 해 뒤 메아리로 돌아온다.

const alive = (s: GameState) => s.disciples.filter((d) => !d.dead && !d.isChild);
const hasRoom = (s: GameState) => s.disciples.filter((d) => !d.dead).length < getMaxDisciples(s.facilities);
const pct = (p: number) => `${Math.round(Math.max(0.05, Math.min(0.95, p)) * 100)}%`;
const clampP = (p: number) => Math.max(0.05, Math.min(0.95, p));
const bestDisciple = (s: GameState): Disciple | undefined =>
  [...alive(s)].sort((a, b) => b.stats.str + b.stats.agi + b.stats.ins - (a.stats.str + a.stats.agi + a.stats.ins))[0];
const findDisc = (s: GameState, id: unknown) => s.disciples.find((d) => d.id === id);
// 충성은 0~100을 넘지 않는다
const mapDisc = (s: GameState, id: unknown, f: (d: Disciple) => Disciple): GameState => ({
  ...s,
  disciples: s.disciples.map((d) => {
    if (d.id !== id) return d;
    const n = f(d);
    return { ...n, loyalty: Math.max(0, Math.min(100, n.loyalty)) };
  }),
});
const town = (s: GameState) => rand(byCountry(s, ['읍내', '장터', '나루터 마을', '윗마을'], ['현성', '저잣거리', '나루 마을', '성 밖 마을'], ['성하 마을', '역참 마을', '항구 마을', '절 아랫마을']));

// ───────── 1. 도전장 — 강호 명부의 실제 고수가 찾아온다 ─────────
const challenge: JourneyEventDef = {
  key: 'home_challenge',
  kind: 'HOME',
  weightBy: (s) => (s.age >= 66 ? 0.4 : 1), // 노년에는 드물게
  cond: (s) => s.turn >= 10 && s.fame >= 80,
  build: (s) => {
    const taken = takenNames(s);
    // 명부의 고수라도 내 제자·배우자·숙적과 이름이 같으면 고르지 않는다 (「도전장 — 개방의 조자룡」이 죽은 제자처럼 읽힌다)
    const roster = (s.tourneyRoster || []).filter((f) => !f.retired && s.year - f.bornYear < 65 && !taken.has(f.name));
    const f = roster.length ? rand(roster) : null;
    const name = f?.name || makePersonName(s.country, taken);
    const sect = f?.sect || randomSectName(s.country);
    const power = f ? fighterPower(f, s.year) : roadScale(s, 0.9 + Math.random() * 0.4);
    const record = f && f.titles > 0 ? `천하대회 우승 ${f.titles}회의 ` : f && (f.bestRound ?? -1) >= 2 ? '지난 천하대회 4강의 ' : '';
    const why = rand([
      `${s.sectName}의 칼이 요즘 소문이 자자하다기에`,
      '제 검이 어디까지 왔는지 알고 싶어',
      '사부의 유언이 「천하의 고수 열 명과 겨뤄 보라」였기에',
      `지난번 ${town(s)}에서 그대의 제자가 우리 사형을 모욕했다기에`,
    ]);
    return {
      title: `도전장 — ${sect}의 ${name}`,
      category: 'DUEL',
      sceneActor: 'RIVAL',
      narration: `${record}${sect} ${name}이 보낸 도전장이 대문에 꽂혀 있다.`,
      script: [
        N(`아침, 대문에 단검으로 꽂아 둔 도전장 한 장. ${record}${sect}의 ${name}.`),
        P(name, `${why}, 정식으로 한 수 청합니다. 사흘 뒤 정오, 그대의 마당에서.`, '서찰을 내밀며'),
      ],
      options: [
        { id: 'accept', label: '받는다', hint: `비무 · 상대 강도 ${'★'.repeat(Math.max(1, Math.min(5, Math.round(power * 1.4))))}` },
        ...(alive(s).length ? [{ id: 'disciple', label: `수제자 ${josa(bestDisciple(s)!.name, '을를')} 내보낸다`, hint: '제자가 이기면 크게 자란다' }] : []),
        { id: 'decline', label: '정중히 사양한다', hint: '명성 -8' },
      ],
      meta: { name, sect, power, fid: f?.id || '' },
    };
  },
  resolve: (s, opt, c) => {
    const name = String(c.data?.name);
    if (opt === 'decline') return say(addFame(s, -8), [['나레이션', `「다음에 뵙지요」라는 답장을 보냈다. 저잣거리에서 「${s.sectName}이 꽁무니를 뺐다」는 말이 돌았다.`]]);
    if (opt === 'disciple') {
      const d = bestDisciple(s);
      if (!d) return s;
      const pd = (d.stats.str + d.stats.agi + d.stats.ins) / 3;
      const p = clampP(0.5 + (pd - (14 + Number(c.data?.power) * 21)) * 0.025);
      const won = chance(p);
      let n = mapDisc(s, d.id, (x) => ({ ...x, loyalty: Math.min(100, x.loyalty + (won ? 8 : 3)), stats: { ...x.stats, ins: x.stats.ins + (won ? 3 : 2), str: x.stats.str + 1 } }));
      n = addFame(n, won ? 25 : -5);
      return say(n, [
        ['나레이션', won ? `${d.name}의 칼끝이 ${name}의 목 앞에서 멎었다. 마당을 둘러싼 구경꾼들이 함성을 질렀다. (명성 +25)` : `${josa(d.name, '이가')} 세 합 만에 무릎을 꿇었다. 그래도 끝까지 칼을 놓지 않았다.`],
        [name, won ? `스승이 아니라 제자에게 졌군… 이 도장, 무섭소.` : '좋은 제자를 두셨소. 몇 해 뒤가 기대되오.'],
      ]);
    }
    return journeyBattle(s, c, opt, {
      title: `도전장 — ${name}`,
      subtitle: `${c.data?.sect}의 정식 비무`,
      name,
      enemyTitle: String(c.data?.sect),
      age: 30 + Math.floor(Math.random() * 15),
      ai: rand(['DUELIST', 'AGGRESSIVE', 'HEAVY', 'RUSHDOWN'] as const),
      scale: Math.max(0.8, Number(c.data?.power) || 1.5),
      weapon: 'BLADE',
      skills: byCountry(s, ['sk_kr_06', 'sk_kr_02', 'sk_kr_01'], ['sk_cn_05', 'sk_cn_03', 'sk_cn_02'], ['sk_jp_01', 'sk_jp_03', 'sk_jp_06']),
      rewardFame: 18,
    });
  },
  onBattle: (s, _opt, won, c) =>
    say(won ? addRep(s, { ascetic: 4 }) : addFame(s, -10), [[String(c.data?.name), won ? '…졌소. 이 마당의 흙맛, 잊지 않겠소.' : '오늘은 내가 이겼지만, 그대 칼에는 아직 깊이가 남아 있소.']]),
};

// ───────── 2. 의뢰 — 고을 사람들의 부탁, 능력치로 판가름 ─────────
const COMMISSIONS = [
  { k: 'thief', title: '장터 소매치기 패거리', who: '장터 상인', ask: '소매치기 패거리가 장날마다 판을 칩니다. 잡아만 주시면 사례하겠소.', stat: 'agi' as const, reward: 50, fail: '놓쳤다. 패거리는 지붕 위로 사라졌다.' },
  { k: 'missing', title: '사라진 아이', who: '울먹이는 아낙', ask: '아이가 사흘째 돌아오지 않습니다. 산 쪽으로 갔다는데…', stat: 'ins' as const, reward: 20, fail: '사흘을 헤맸지만 끝내 찾지 못했다. 아낙의 울음소리가 귀에 남았다.' },
  { k: 'caravan', title: '상단의 호위', who: '상단 행수', ask: '고개 너머까지 짐을 옮기는데, 요즘 그 고개에 도적이 나온다 하오.', stat: 'str' as const, reward: 90, fail: '도적에게 짐 한 수레를 빼앗겼다. 행수가 사례를 깎았다.' },
  { k: 'tutor', title: '사또 자제의 무예 지도', who: '관아 이방', ask: '사또 나리의 도령께 무예를 좀 가르쳐 주십사… 성미가 보통이 아니시오.', stat: 'wil' as const, reward: 70, fail: '도령이 사흘 만에 울며 뛰쳐나갔다. 사또의 눈총을 받았다.' },
  { k: 'temple', title: '사찰 보물 경비', who: '절의 주지', ask: '부처님 사리를 노리는 도둑이 있다는 소문이… 사흘 밤만 지켜 주시오.', stat: 'vit' as const, reward: 40, fail: '사흘째 밤, 깜빡 조는 사이 도둑이 들었다. 다행히 사리는 무사했지만 체면을 구겼다.' },
];
const commission: JourneyEventDef = {
  key: 'home_commission',
  kind: 'HOME',
  weightBy: (s) => (s.age >= 66 ? 0.5 : 1), // 노년에는 드물게
  cond: (s) => s.turn >= 5,
  build: (s) => {
    // 사또·이방은 조선의 말 — 나라에 맞게 바꾼다
    const c0 = rand(COMMISSIONS);
    const loc = (t: string) => (s.country === 'KOREA' ? t : t.replace(/사또/g, byCountry(s, '사또', '지현', '다이칸')).replace(/관아 이방/g, byCountry(s, '관아 이방', '현청 서리', '다이칸소 하급 관리')));
    const c = { ...c0, title: loc(c0.title), who: loc(c0.who), ask: loc(c0.ask), fail: loc(c0.fail) };
    const p = clampP(0.35 + (s.stats[c.stat] - 25) * 0.009);
    const d = bestDisciple(s);
    const pd = d ? clampP(0.3 + (d.stats[c.stat] - 25) * 0.009) : 0;
    return {
      title: `의뢰 — ${c.title}`,
      category: 'LIFE',
      narration: `${josa(c.who, '이가')} 도장을 찾아왔다.`,
      script: [N(`${town(s)}의 ${josa(c.who, '이가')} 도장 마루에 걸터앉아 한숨을 쉰다.`), P(c.who, c.ask)],
      options: [
        { id: 'do', label: '직접 나선다', hint: `성공 확률 약 ${pct(p)} · 사례 ${c.reward}${cur(s)}` },
        ...(d ? [{ id: 'send', label: `${d.name}에게 맡긴다`, hint: `성공 확률 약 ${pct(pd)} · 제자가 경험을 쌓는다` }] : []),
        { id: 'refuse', label: '도장 일이 바쁘다며 사양한다' },
      ],
      meta: { k: c.k, p, pd, did: d?.id || '' },
    };
  },
  resolve: (s, opt, c) => {
    const raw = COMMISSIONS.find((x) => x.k === c.data?.k) || COMMISSIONS[0];
    const loc = (t: string) => (s.country === 'KOREA' ? t : t.replace(/사또/g, byCountry(s, '사또', '지현', '다이칸')).replace(/관아 이방/g, byCountry(s, '관아 이방', '현청 서리', '다이칸소 하급 관리')));
    const def = { ...raw, who: loc(raw.who), fail: loc(raw.fail) };
    if (opt === 'refuse') return say(addRep(s, { virtue: -2 }), [['나레이션', `${josa(def.who, '이가')} 힘없이 돌아갔다.`]]);
    const isSend = opt === 'send';
    const ok = chance(Number(isSend ? c.data?.pd : c.data?.p));
    let n = s;
    if (isSend) n = mapDisc(n, c.data?.did, (d) => ({ ...d, loyalty: Math.min(100, d.loyalty + (ok ? 6 : 1)), stats: { ...d.stats, [def.stat]: d.stats[def.stat] + 2 } }));
    else n = addStats(n, { [def.stat]: 1 });
    if (ok) {
      n = addRep(addFame(addMoney(n, def.reward), 10), { virtue: 5 });
      if (def.k === 'missing') n = remember(n, 'missing_child', 'FOUND');
      if (def.k === 'tutor' && chance(0.4)) n = addEcho(n, { key: 'magistrate_son', minYears: 6, maxYears: 12, channel: 'HOME', bornText: loc('사또의 성미 고약한 도령에게 무예를 가르쳤다') });
      return say(n, [['나레이션', `${isSend ? `${josa(findDisc(n, c.data?.did)?.name || '제자', '이가')}` : '내가'} 해냈다. ${josa(def.who, '이가')} 사례로 ${def.reward}${cur(n)}을 내놓았다. (명성 +10)`]]);
    }
    return say(addFame(n, -4), [['나레이션', def.fail]]);
  },
};

// ───────── 3. 제자의 사연 ─────────
const DSTORIES = ['love', 'parent', 'scout', 'doubt', 'debt', 'talent', 'rivalry', 'homesick'] as const;
const discipleStory: JourneyEventDef = {
  key: 'home_disciple_story',
  kind: 'HOME',
  cond: (s) => alive(s).length >= 1 && s.turn >= 6,
  build: (s) => {
    const d = rand(alive(s));
    let k: (typeof DSTORIES)[number] = rand([...DSTORIES]);
    if (k === 'rivalry' && alive(s).length < 2) k = 'doubt';
    if (k === 'scout' && metSects(s).length === 0) k = 'parent';
    if ((d.temperament === 'LAZY' || d.temperament === 'GREEDY') && chance(0.5)) k = 'debt';
    const other = rand(alive(s).filter((x) => x.id !== d.id)) as Disciple | undefined;
    const sect = metSects(s).length ? rand(metSects(s)) : null;
    const lines: Record<string, { title: string; script: ReturnType<typeof N>[]; options: Array<{ id: string; label: string; hint?: string; disabled?: boolean; disabledReason?: string }> }> = {
      love: {
        title: `${d.name}의 정혼 이야기`,
        script: [N(`${josa(d.name, '이가')} 쭈뼛거리며 다가온다. 귀까지 빨갛다.`), P(d.name, `스승님… 장터 ${byCountry(s, '포목전', '비단 가게', '찻집')} 집 딸과 혼인을 하고 싶습니다. 그런데 장인어른 될 분이 「칼잡이에게 딸을 못 준다」고…`)],
        options: [
          { id: 'bless', label: '직접 찾아가 혼담을 넣어 준다', hint: '충성 크게 상승' },
          { id: 'focus', label: '「수련이 먼저다」라고 타이른다', hint: '수련 성과 · 충성 하락' },
        ],
      },
      parent: {
        title: `${d.name}의 고향 소식`,
        script: [N(`${josa(d.name, '이가')} 편지를 쥐고 마당 구석에 앉아 있다.`), P(d.name, '고향의 어머니가 위독하시답니다. 약값이…', '목이 메어')],
        options: [
          { id: 'pay', label: `약값을 대 준다 (50${cur(s)})`, disabled: s.money < 50, disabledReason: '돈이 부족하다' },
          { id: 'leave', label: '한 철 고향에 다녀오게 한다', hint: '제자가 한 계절 빠진다' },
        ],
      },
      scout: {
        title: `${sect?.name || '타 문파'}의 스카우트`,
        script: [N(`${sect?.name || '어느 문파'}의 사람이 ${d.name}에게 몰래 접근했다는 말이 들린다.`), P(d.name, `스승님, 솔직히 말씀드리겠습니다. ${sect?.name || '그 문파'}에서 사범 자리를 주겠다 합니다.`, '고개를 숙이며')],
        options: [
          { id: 'keep', label: '「네가 필요하다」며 붙잡는다', hint: '충성 상승 · 그 문파와 관계 악화' },
          { id: 'let', label: '좋은 기회라며 보내 준다', hint: '제자를 잃지만 그 문파와 가까워진다' },
        ],
      },
      doubt: {
        title: `${d.name}의 회의`,
        script: [N(`밤늦게 ${josa(d.name, '이가')} 목검을 내려놓고 멍하니 달을 보고 있다.`), P(d.name, '스승님, 칼을 배워서 뭐가 됩니까. 사람을 베는 기술 아닙니까.')],
        options: [
          { id: 'talk', label: '밤새 무도(武道)를 이야기한다', hint: `정신 판정 약 ${pct(0.4 + s.stats.wil * 0.006)}` },
          { id: 'spar', label: '말없이 목검을 들고 한 합 겨뤄 준다', hint: '제자 능력치 상승' },
        ],
      },
      debt: {
        title: `${d.name}의 노름빚`,
        script: [N(`험상궂은 사내 둘이 대문 앞에서 ${d.name}의 이름을 부른다.`), P('빚쟁이', `${d.name}이 투전판에서 진 빚 80${cur(s)}. 오늘 못 받으면 저놈 손가락을 받아 가겠소.`, '팔짱을 끼며', 'ANGRY')],
        options: [
          { id: 'pay', label: `대신 갚아 준다 (80${cur(s)})`, disabled: s.money < 80, disabledReason: '돈이 부족하다' },
          { id: 'chase', label: '빚쟁이들을 쫓아낸다', hint: '살기 · 투전판과 원한' },
          { id: 'expel', label: `${josa(d.name, '을를')} 파문한다` },
        ],
      },
      talent: {
        title: `${d.name}의 숨은 재능`,
        script: [N(`새벽 수련 중, ${d.name}의 목검 끝에서 묘한 기운이 일었다. 본인도 놀란 얼굴이다.`), P(d.name, '스승님, 방금… 뭔가가 손끝에서 빠져나갔습니다.')],
        options: [
          { id: 'nurture', label: '한 철 동안 따로 붙잡고 가르친다', hint: '제자 크게 성장 · 나의 연마 시간 감소' },
          { id: 'watch', label: '스스로 깨닫게 둔다', hint: '50% 확률로 홀로 깨친다' },
        ],
      },
      rivalry: {
        title: `${josa(d.name, '과와')} ${other?.name || '사형'}의 경쟁`,
        script: [N(`${josa(d.name, '과와')} ${josa(other?.name || '사형', '이가')} 마당 한가운데서 서로를 노려본다.`), P(other?.name || '사형', `누가 수제자인지 오늘 결판을 내자!`, '목검을 들며', 'ANGRY')],
        options: [
          { id: 'let_fight', label: '마음껏 겨루게 둔다', hint: '둘 다 성장, 진 쪽은 충성 하락' },
          { id: 'stop', label: '둘 다 벌을 세운다', hint: '충성 소폭 하락, 기강' },
        ],
      },
      homesick: {
        title: `${d.name}의 향수`,
        script: [N(`명절 무렵. ${josa(d.name, '이가')} 고향 쪽 하늘을 오래 바라본다.`), P(d.name, '…아무것도 아닙니다, 스승님.')],
        options: [
          { id: 'feast', label: `제자들을 모아 명절상을 차린다 (30${cur(s)})`, disabled: s.money < 30, disabledReason: '돈이 부족하다', hint: '모든 제자 충성 상승' },
          { id: 'pat', label: '어깨를 두드려 주고 지나간다' },
        ],
      },
    };
    const L = lines[k];
    return { title: L.title, category: 'FAMILY', sceneActor: 'DISCIPLE', narration: L.script[0].text, script: L.script, options: L.options, meta: { k, did: d.id, oid: other?.id || '', sid: sect?.id || '' } };
  },
  resolve: (s, opt, c) => {
    const d = findDisc(s, c.data?.did);
    if (!d) return s;
    const k = String(c.data?.k);
    const L = (delta: number, extra?: Partial<Disciple>) => mapDisc(s, d.id, (x) => ({ ...x, loyalty: Math.max(0, Math.min(100, x.loyalty + delta)), ...extra }));
    switch (`${k}:${opt}`) {
      case 'love:bless': {
        const ok = chance(clampP(0.45 + s.fame * 0.0004 + s.reputation.virtue * 0.004));
        const n = L(ok ? 18 : 8);
        return say(ok ? addRep(n, { virtue: 5 }) : n, [['나레이션', ok ? `「${s.sectName}의 도장주가 직접 왔다」는 말에 장인이 버선발로 나왔다. 가을에 혼례를 올리기로 했다.` : `장인 될 사람은 끝내 고개를 저었다. 그래도 ${josa(d.name, '은는')} 스승이 함께 가 준 것만으로 눈물을 글썽였다.`]]);
      }
      case 'love:focus':
        return say(trainEquipped(L(-10), 0), [['나레이션', `${josa(d.name, '은는')} 고개를 숙였다. 그날부터 말없이 목검만 휘둘렀다. (충성 -10)`]]);
      case 'parent:pay':
        return say(addMoney(L(15), -50), [[d.name, '이 은혜… 평생 잊지 않겠습니다.']]);
      case 'parent:leave':
        return say(L(8, { stats: { ...d.stats, wil: d.stats.wil + 2 } }), [['나레이션', `${josa(d.name, '이가')} 고향에 다녀왔다. 어머니의 임종을 지켰다고 한다. 돌아온 눈빛이 깊어졌다.`]]);
      case 'scout:keep': {
        const n = adjustRelation(L(12), String(c.data?.sid), -8, '데려가려던 제자를 붙잡았다');
        return say(n, [[d.name, '…스승님이 그렇게까지 말씀하시니. 남겠습니다.']]);
      }
      case 'scout:let': {
        let n = adjustRelation(s, String(c.data?.sid), 15, '제자를 사범으로 보내 주었다');
        n = { ...n, disciples: n.disciples.map((x) => (x.id === d.id ? { ...x, dead: true, leftReason: '타 문파 사범으로 떠남' } : x)) };
        return say(addFame(n, 15), [['나레이션', `${josa(d.name, '이가')} 큰절을 올리고 떠났다. 그 문파에 ${s.sectName}의 칼이 하나 심겼다.`]]);
      }
      case 'doubt:talk': {
        const ok = chance(clampP(0.4 + s.stats.wil * 0.006));
        return say(ok ? L(14, { stats: { ...d.stats, wil: d.stats.wil + 3 } }) : L(-6), [['나레이션', ok ? `「칼은 베기 위해서가 아니라 베지 않기 위해 배우는 것」 — 새벽녘, ${d.name}의 얼굴이 맑아졌다.` : `말이 길어질수록 ${d.name}의 표정은 굳어 갔다. 대답을 찾지 못한 채 날이 밝았다.`]]);
      }
      case 'doubt:spar':
        return say(L(6, { stats: { ...d.stats, str: d.stats.str + 2, agi: d.stats.agi + 2 } }), [['나레이션', `목검이 몇 번 부딪히자 ${josa(d.name, '이가')} 웃음을 터뜨렸다. 말보다 칼이 빨랐다.`]]);
      case 'debt:pay':
        return say(addMoney(L(d.temperament === 'GREEDY' ? 2 : 10), -80), [[d.name, '다시는… 다시는 투전판에 안 가겠습니다.']]);
      case 'debt:chase': {
        let n = addRep(L(4), { ruthless: 8 });
        if (chance(0.4)) n = addEcho(n, { key: 'gambling_den', minYears: 1, maxYears: 3, channel: 'HOME', bornText: '노름빚을 받으러 온 사내들을 칼로 쫓아냈다' });
        return say(n, [['나레이션', '칼집째로 두어 번 휘두르자 빚쟁이들이 혼비백산 달아났다. 투전판 사람들이 이를 갈았다는 소문이다.']]);
      }
      case 'debt:expel': {
        const n = { ...s, disciples: s.disciples.map((x) => (x.id === d.id ? { ...x, dead: true, leftReason: '노름빚으로 파문' } : x)) };
        return say(addRep(n, { ascetic: 6 }), [['나레이션', `${d.name}의 이름을 문하생 명부에서 지웠다. 마당이 한동안 조용했다.`]]);
      }
      case 'talent:nurture': {
        const n = L(10, { isGenius: true, stats: { ...d.stats, ins: d.stats.ins + 5, qi: d.stats.qi + 5 } });
        return say(n, [['나레이션', `한 철 내내 ${josa(d.name, '을를')} 따로 가르쳤다. 손끝의 기운이 또렷해졌다. (재능 각성)`]]);
      }
      case 'talent:watch':
        return chance(0.5)
          ? say(L(4, { isGenius: true }), [['나레이션', `${josa(d.name, '은는')} 홀로 그 기운을 붙잡았다. 스승 없이 깨친 것이라 더 단단하다.`]])
          : say(L(-2), [['나레이션', '그 기운은 다시 나타나지 않았다. 아까운 일이다.']]);
      case 'rivalry:let_fight': {
        const o = findDisc(s, c.data?.oid);
        const dWins = chance(0.5);
        let n = mapDisc(s, d.id, (x) => ({ ...x, stats: { ...x.stats, str: x.stats.str + 2 }, loyalty: x.loyalty + (dWins ? 4 : -6) }));
        if (o) n = mapDisc(n, o.id, (x) => ({ ...x, stats: { ...x.stats, str: x.stats.str + 2 }, loyalty: x.loyalty + (dWins ? -6 : 4) }));
        return say(n, [['나레이션', `${josa(dWins ? d.name : o?.name || '사형', '이가')} 이겼다. 진 쪽은 밤새 혼자 목검을 휘둘렀다.`]]);
      }
      case 'rivalry:stop': {
        const o = findDisc(s, c.data?.oid);
        let n = L(-3);
        if (o) n = mapDisc(n, o.id, (x) => ({ ...x, loyalty: x.loyalty - 3 }));
        return say(addRep(n, { ascetic: 3 }), [['나레이션', '둘은 해가 질 때까지 마당에서 물동이를 들고 서 있었다.']]);
      }
      case 'homesick:feast': {
        const n = { ...addMoney(s, -30), disciples: s.disciples.map((x) => (x.dead ? x : { ...x, loyalty: Math.min(100, x.loyalty + 6) })) };
        return say(n, [['나레이션', '명절상 앞에 둘러앉은 제자들이 오랜만에 소리 내어 웃었다. (모든 제자 충성 +6)']]);
      }
      default:
        return say(L(1), [['나레이션', `${josa(d.name, '이가')} 고개를 끄덕였다.`]]);
    }
  },
};

// ───────── 4. 시절 행사 — 나라와 계절마다 다르다 ─────────
const FEST: Record<string, Record<Season, { name: string; scene: string; game: string }>> = {
  KOREA: {
    SPRING: { name: '삼짇날 화전놀이와 편사(便射)', scene: '진달래가 핀 산자락에서 고을 활량들이 편을 갈라 활을 쏜다.', game: '활쏘기 편사에 나간다' },
    SUMMER: { name: '단오 씨름판', scene: '창포물에 머리 감은 사람들이 모래판을 둘러쌌다. 상품은 황소 한 마리!', game: '씨름판에 오른다' },
    AUTUMN: { name: '한가위 무예 겨루기', scene: '추석 장터에 무예 겨루기 판이 섰다. 이긴 자에게 쌀 한 섬.', game: '겨루기 판에 나선다' },
    WINTER: { name: '정월 대보름 석전(石戰)', scene: '두 마을 장정들이 개울을 사이에 두고 돌팔매 싸움을 벌인다. 해마다 다치는 사람이 나온다.', game: '우리 마을 편에 선다' },
  },
  CHINA: {
    SPRING: { name: '청명 연날리기', scene: '청명절 들판, 하늘 가득 연이 떠 있다. 연줄 끊기 시합이 한창이다.', game: '연줄 끊기에 끼어든다' },
    SUMMER: { name: '단오 용선 경조', scene: '북소리에 맞춰 용머리 배들이 강을 가른다. 노잡이가 하나 모자란다고 아우성이다.', game: '노를 잡는다' },
    AUTUMN: { name: '중추절 등롱 무예 시연', scene: '등롱이 걸린 광장에서 각 무관이 무예를 시연한다. 가장 화려한 곳에 제자가 몰린다.', game: '도장의 무예를 시연한다' },
    WINTER: { name: '원소절 사자춤', scene: '정월 대보름, 사자춤 무리가 서로 높이 매단 청(靑)을 따려고 다툰다.', game: '사자춤 패를 이끈다' },
  },
  JAPAN: {
    SPRING: { name: '하나미 봉납 시합', scene: '벚꽃 아래 신사 경내에서 봉납 무술 시합이 열린다.', game: '봉납 시합에 나간다' },
    SUMMER: { name: '마쓰리와 하나비', scene: '가마를 멘 사내들의 함성, 강 위로 터지는 불꽃. 노점 거리에 사람이 넘친다.', game: '가마를 멘다' },
    AUTUMN: { name: '쓰키미와 야부사메', scene: '보름달 아래, 말을 달리며 과녁을 쏘는 야부사메 시연이 열린다.', game: '과녁 앞에 선다' },
    WINTER: { name: '간게이코(寒稽古)', scene: '한겨울 새벽, 도장마다 맨발로 얼음물을 끼얹으며 수련하는 간게이코가 시작되었다.', game: '제자들과 간게이코를 한다' },
  },
};
const festival: JourneyEventDef = {
  key: 'home_festival',
  kind: 'HOME',
  cond: (s) => s.turn >= 3,
  build: (s) => {
    const f = FEST[s.country][s.season];
    const p = clampP(0.35 + (s.stats.str + s.stats.agi) * 0.004);
    return {
      title: f.name,
      category: 'LIFE',
      narration: f.scene,
      script: [N(f.scene), P('구경꾼', `${s.sectName} 도장주도 한판 하시려오? 다들 보고 싶어 하는데!`)],
      options: [
        { id: 'join', label: f.game, hint: `이길 확률 약 ${pct(p)} · 명성 · 입문자` },
        { id: 'demo', label: '제자들을 앞세워 도장 시연을 한다', hint: '제자 충성 · 입문자' },
        { id: 'watch', label: '구경만 하고 술 한잔한다', hint: '건강 회복' },
      ],
      meta: { p, fname: f.name },
    };
  },
  resolve: (s, opt, c) => {
    if (opt === 'watch') return say(addHealth(s, 6), [['나레이션', '모처럼 칼을 내려놓고 사람들 틈에서 웃었다. (건강 +6)']]);
    if (opt === 'demo') {
      let n = { ...s, disciples: s.disciples.map((d) => (d.dead ? d : { ...d, loyalty: Math.min(100, d.loyalty + 4) })) };
      n = addFame(n, 12);
      let extra = '';
      if (hasRoom(n) && chance(0.45)) {
        const d = { ...createDiscipleEntity(n, { archetype: '시연을 보고 찾아온 젊은이' }), joinedYear: n.year };
        n = { ...n, disciples: [...n.disciples, d] };
        extra = ` 시연을 본 ${josa(d.name, '이가')} 다음 날 입문을 청했다.`;
      }
      return say(n, [['나레이션', `제자들이 한 몸처럼 움직이자 박수가 쏟아졌다. (명성 +12)${extra}`]]);
    }
    const won = chance(Number(c.data?.p));
    if (s.country === 'KOREA' && s.season === 'WINTER') {
      const n = won ? addRep(addFame(addHealth(s, -6), 18), { virtue: 4 }) : addHealth(s, -14);
      return say(n, [['나레이션', won ? '날아드는 돌을 칼집으로 쳐내며 앞장서자 우리 마을이 이겼다. 이마가 깨졌지만 고을의 영웅이 되었다.' : '돌 하나가 정통으로 날아들었다. 정신을 차려 보니 누워 있었다. (건강 -14)']]);
    }
    const n = won ? addMoney(addFame(s, 22), 30) : addFame(s, -3);
    return say(n, [['나레이션', won ? `${String(c.data?.fname)}에서 이겼다! 상품과 함께 「${s.sectName}」의 이름이 고을에 퍼졌다. (명성 +22)` : '아깝게 졌다. 구경꾼들은 그래도 박수를 쳐 주었다.']]);
  },
};

// ───────── 5. 후원 제안 — 돈과 세평 사이 ─────────
const PATRONS = [
  { k: 'merchant', who: byCountryLabel('송상 대행수', '염상 대인', '오사카 대상인'), offer: 200, string: '대신 우리 상단 호위는 도장 제자들이 맡아 주시오.', rep: 'commerce' as const },
  { k: 'noble', who: byCountryLabel('세도가 집사', '권문 대인의 집사', '번의 가로'), offer: 260, string: '대감 댁 일에 가끔 칼을 빌려주시면 되오. 무슨 일인지는 묻지 마시고.', rep: 'ruthless' as const },
  { k: 'monk', who: byCountryLabel('큰절 주지', '소림 계열 방장', '본산 대승정'), offer: 120, string: '절에 행사가 있을 때 무예를 공양해 주시오.', rep: 'ascetic' as const },
];
function byCountryLabel(kr: string, cn: string, jp: string) {
  return { KOREA: kr, CHINA: cn, JAPAN: jp } as Record<string, string>;
}
const patron: JourneyEventDef = {
  key: 'home_patron',
  kind: 'HOME',
  cooldown: 24,
  cond: (s) => s.fame >= 150,
  build: (s) => {
    const pt = rand(PATRONS);
    const who = pt.who[s.country];
    return {
      title: `후원 제안 — ${who}`,
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: `${josa(who, '이가')} 비단 보따리를 들고 찾아왔다.`,
      script: [N(`${josa(who, '이가')} 비단 보따리를 마루에 내려놓는다. 은자가 반짝인다.`), P(who, `해마다 ${pt.offer}${cur(s)}을 대겠소. ${pt.string}`, '부채를 부치며')],
      options: [
        { id: 'accept', label: '받는다', hint: `+${pt.offer}${cur(s)} · 세평 변화` },
        { id: 'haggle', label: '조건을 바꾸자고 흥정한다', hint: `통찰 판정 약 ${pct(0.3 + s.stats.ins * 0.006)}` },
        { id: 'refuse', label: '도장의 칼은 팔지 않는다', hint: '구도·인덕' },
      ],
      meta: { k: pt.k, who, offer: pt.offer, rep: pt.rep },
    };
  },
  resolve: (s, opt, c) => {
    const offer = Number(c.data?.offer);
    const rep = String(c.data?.rep) as keyof GameState['reputation'];
    if (opt === 'refuse') return say(addRep(s, { ascetic: 8, virtue: 4 }), [['나레이션', `${josa(String(c.data?.who ?? ''), '이가')} 코웃음을 치며 돌아갔다. 제자들이 스승을 다시 보는 눈치다.`]]);
    if (opt === 'haggle') {
      const ok = chance(clampP(0.3 + s.stats.ins * 0.006));
      return ok
        ? say(addMoney(addRep(s, { commerce: 4 }), Math.round(offer * 0.7)), [['나레이션', `까다로운 조건은 빼고 ${Math.round(offer * 0.7)}${cur(s)}만 받기로 했다. 서로 손해 없는 장사였다.`]])
        : say(s, [['나레이션', `흥정이 길어지자 ${josa(String(c.data?.who ?? ''), '이가')} 「없던 일로 합시다」 하고 일어섰다.`]]);
    }
    let n = addMoney(s, offer);
    n = addRep(n, { [rep]: 12 } as Partial<GameState['reputation']>);
    if (c.data?.k === 'noble') n = addEcho(n, { key: 'noble_debt', minYears: 2, maxYears: 5, channel: 'HOME', bornText: '세도가의 돈을 받고 「묻지 않는 칼」을 약속했다' });
    return say(n, [['나레이션', `${offer}${cur(n)}이 들어왔다. 도장 곳간이 넉넉해졌다. 하지만 약속은 약속이다.`]]);
  },
};

// ───────── 6. 이웃 도장과의 분쟁 ─────────
const neighbor: JourneyEventDef = {
  key: 'home_neighbor',
  kind: 'HOME',
  cond: (s) => s.turn >= 8,
  build: (s) => {
    const sect = metSects(s).length ? rand(metSects(s)) : null;
    const name = sect?.name || `${makePersonName(s.country, takenNames(s)).slice(0, 2)} 도장`;
    const cause = rand([
      { k: 'land', text: '도장 뒷산 땅이 원래 자기네 것이라며 말뚝을 박아 놓았다.' },
      { k: 'poach', text: '우리 문하생에게 「월사금 반값」을 미끼로 옮겨 오라 꼬드겼다.' },
      { k: 'slander', text: `「${s.sectName}의 무예는 춤사위」라는 방을 장터에 붙였다.` },
    ]);
    return {
      title: `${josa(name, '과와')}의 분쟁`,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: `${josa(name, '이가')} ${cause.text}`,
      script: [N(`${josa(name, '이가')} ${cause.text}`), P(`${name} 사범`, '억울하면 칼로 증명하시든가.', '비웃으며', 'ANGRY')],
      options: [
        { id: 'duel', label: '공개 비무로 결판낸다', hint: '비무' },
        { id: 'talk', label: '고을 어른들 앞에서 시비를 가린다', hint: `통찰 판정 약 ${pct(0.35 + s.stats.ins * 0.005 + s.reputation.virtue * 0.003)}` },
        { id: 'ignore', label: '무시한다', hint: '명성 -10' },
      ],
      meta: { name, sid: sect?.id || '', k: cause.k },
    };
  },
  resolve: (s, opt, c) => {
    const name = String(c.data?.name);
    if (opt === 'ignore') return say(addFame(s, -10), [['나레이션', '대꾸하지 않았다. 소문은 제멋대로 부풀었다.']]);
    if (opt === 'talk') {
      const ok = chance(clampP(0.35 + s.stats.ins * 0.005 + s.reputation.virtue * 0.003));
      let n = ok ? addRep(addFame(s, 15), { virtue: 4 }) : addFame(s, -6);
      if (c.data?.sid) n = adjustRelation(n, String(c.data.sid), ok ? 4 : -6, ok ? '고을 어른들 앞에서 시비를 가렸다' : '시비가 흐지부지 끝났다');
      return say(n, [['나레이션', ok ? `고을 어른들이 ${s.sectName}의 손을 들어 주었다. ${josa(name, '은는')} 말뚝을 뽑아 갔다.` : '어른들은 이쪽저쪽 말을 다 듣더니 「알아서들 하라」며 자리를 떴다.']]);
    }
    return journeyBattle(s, c, opt, {
      title: `${name} 사범과의 공개 비무`,
      subtitle: '이웃 도장과의 분쟁',
      name: `${name} 사범`,
      enemyTitle: name,
      age: 38,
      ai: 'AGGRESSIVE',
      scale: roadScale(s, 0.95),
      weapon: 'BLADE',
      skills: byCountry(s, ['sk_kr_02', 'sk_kr_06', 'base_v_slash'], ['sk_cn_02', 'sk_cn_05', 'base_v_slash'], ['sk_jp_03', 'sk_jp_06', 'base_v_slash']),
      rewardFame: 15,
    });
  },
  onBattle: (s, _opt, won, c) => {
    let n = won ? addFame(s, 6) : addFame(s, -15);
    if (c.data?.sid) n = adjustRelation(n, String(c.data.sid), won ? -10 : -4, won ? '공개 비무에서 그 문파 사범을 꺾었다' : '공개 비무에서 그 문파 사범에게 졌다');
    return say(n, [['나레이션', won ? '구경꾼들 앞에서 결판이 났다. 그 도장은 한동안 조용할 것이다.' : '졌다. 그 도장 제자들의 웃음소리가 담장을 넘어왔다.']]);
  },
};

// ───────── 7. 선비들의 비웃음 ─────────
const scholars: JourneyEventDef = {
  key: 'home_scholars',
  kind: 'HOME',
  cond: (s) => s.country !== 'JAPAN' || s.year >= 1787,
  build: (s) => ({
    title: byCountry(s, '서원 유생들의 비웃음', '서원 학자들의 조롱', '주자학 유학자의 훈계'),
    category: 'LIFE',
    narration: '도포 자락을 날리는 선비들이 도장 앞을 지나며 혀를 찬다.',
    script: [N('도포 차림의 선비 몇이 도장 앞을 지나다 걸음을 멈춘다.'), P('젊은 선비', `${byCountry(s, '군자는 붓을 들지 칼을 들지 않소.', '문(文)이 있어야 나라가 서오. 칼은 오랑캐나 쓰는 것이지.', '무사도 이제 학문을 해야 하오. 칼만 휘두르는 건 시대에 뒤처진 짓이오.')} 쯧쯧.`, '부채를 탁 접으며')],
    options: [
      { id: 'debate', label: '「문무겸전」을 들어 논쟁한다', hint: `통찰 판정 약 ${pct(0.3 + s.stats.ins * 0.006)}` },
      { id: 'bow', label: '허허 웃으며 고개를 숙인다', hint: '구도' },
      { id: 'scare', label: '말없이 칼집으로 대문 기둥을 친다', hint: '살기' },
    ],
  }),
  resolve: (s, opt) => {
    if (opt === 'bow') return say(addRep(addStats(s, { wil: 1 }), { ascetic: 5 }), [['나레이션', '선비들이 머쓱해하며 지나갔다. 마음은 고요했다.']]);
    if (opt === 'scare') return say(addRep(s, { ruthless: 6 }), [['나레이션', '쾅! 기둥에 금이 갔다. 선비들이 도포 자락을 붙잡고 줄행랑을 쳤다.']]);
    const ok = chance(clampP(0.3 + s.stats.ins * 0.006));
    return say(ok ? addRep(addFame(addStats(s, { ins: 2 }), 12), { virtue: 4 }) : addFame(s, -5), [['나레이션', ok ? '「무예도 예(禮)의 하나」라는 말에 선비들이 말문이 막혔다. 그중 하나는 이튿날 다시 찾아와 활을 배우고 싶다 했다.' : '선비들의 말재간을 당해 낼 수 없었다. 진 기분이 오래 갔다.']]);
  },
};

// ───────── 8. 옛 친구의 부탁 — 빌려준 돈은 돌아올까 ─────────
const oldFriend: JourneyEventDef = {
  key: 'home_old_friend',
  kind: 'HOME',
  cond: (s) => s.turn >= 10 && !(s.flags.echoes || []).some((e) => e.key === 'loan_friend'),
  build: (s) => {
    const name = makePersonName(s.country, takenNames(s));
    return {
      title: `어릴 적 동무 ${name}`,
      category: 'LIFE',
      narration: `어릴 적 같은 서당에 다니던 ${josa(name, '이가')} 남루한 차림으로 찾아왔다.`,
      script: [N(`어릴 적 같은 서당에 다니던 ${josa(name, '이가')} 남루한 차림으로 찾아왔다.`), P(name, `장사를 하다 망했네… 100${cur(s)}만 빌려주게. ${byCountry(s, '송도', '광주', '오사카')}에 가서 다시 일어서겠네. 꼭 갚지.`, '머리를 긁으며')],
      options: [
        { id: 'lend', label: `빌려준다 (100${cur(s)})`, disabled: s.money < 100, disabledReason: '돈이 부족하다' },
        { id: 'meal', label: '돈 대신 밥과 노자를 챙겨 준다', hint: '인덕' },
        { id: 'no', label: '거절한다' },
      ],
      meta: { name },
    };
  },
  resolve: (s, opt, c) => {
    const name = String(c.data?.name);
    if (opt === 'lend') {
      const n = addEcho(addMoney(s, -100), { key: 'loan_friend', minYears: 2, maxYears: 6, channel: 'HOME', bornText: `망해서 찾아온 어릴 적 동무 ${name}에게 100${cur(s)}을 빌려주었다`, data: { name, honest: chance(0.55) ? 1 : 0 } });
      return say(n, [[name, '자네 은혜, 꼭 갚겠네!'], ['나레이션', '떠나는 뒷모습이 가벼워 보였다. 돈이 돌아올지는 모르겠다.']]);
    }
    if (opt === 'meal') return say(addRep(addMoney(s, -10), { virtue: 5 }), [['나레이션', '국밥 한 그릇에 노자 몇 푼. 동무는 고개를 숙이고 떠났다.']]);
    return say(s, [['나레이션', `${name}의 얼굴이 굳었다. 그 뒤로 다시는 찾아오지 않았다.`]]);
  },
};
const echoLoan: JourneyEventDef = {
  key: 'echo_loan_friend',
  kind: 'ECHO_HOME',
  build: (s) => {
    const echo = (s.flags.echoes || []).find((e) => e.key === 'loan_friend');
    const name = String(echo?.data?.name || '옛 동무');
    const honest = !!echo?.data?.honest;
    return {
      title: honest ? `돌아온 ${name}` : `${name}의 소식`,
      category: 'LIFE',
      narration: honest ? `비단옷을 입은 ${josa(name, '이가')} 수레를 끌고 찾아왔다.` : `${name}에 대한 소문이 들려왔다.`,
      script: honest
        ? [N(`비단옷 차림의 ${josa(name, '이가')} 수레를 끌고 대문을 들어선다.`), P(name, '자네 덕에 일어섰네! 원금에 이자까지, 그리고 이건 내 마음일세.', '활짝 웃으며')]
        : [N(`장꾼에게서 ${name}의 소식을 들었다.`), P('장꾼', `그 양반? 빌린 돈으로 투전판에서 날리고 어디론가 사라졌다던데요.`)],
      options: [{ id: 'ok', label: honest ? '반갑게 맞는다' : '쓴웃음을 짓는다' }],
      meta: { name, honest: honest ? 1 : 0 },
    };
  },
  resolve: (s, _opt, c) => {
    const t = takeEcho(s, 'loan_friend');
    let n = t.state;
    const honest = !!c.data?.honest;
    if (honest) n = addMoney(n, 260);
    if (t.echo) n = echoMilestone(n, t.echo, honest ? '그 동무가 크게 성공해 세 배로 갚았다' : '그 돈은 투전판으로 사라졌다');
    return say(n, [['나레이션', honest ? `원금과 이자, 그리고 선물까지 260${cur(n)}. 사람을 믿은 보람이 있었다.` : '사람을 믿은 값이라 생각하기로 했다.']]);
  },
};

// ───────── 9. 관아 현상금 ─────────
const wanted: JourneyEventDef = {
  key: 'home_wanted',
  kind: 'HOME',
  weightBy: (s) => (s.age >= 70 ? 0.1 : s.age >= 60 ? 0.3 : 1), // 노년에는 드물게
  cond: (s) => s.turn >= 6,
  build: (s) => {
    const name = makePersonName(s.country, takenNames(s));
    const crime = rand(['역참 습격', '관곡 탈취', '살인 강도', '사찰 방화']);
    const bounty = 60 + Math.floor(Math.random() * 80);
    return {
      title: `현상금 방 — ${name}`,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: `장터 벽에 방이 붙었다. 「${crime}범 ${name}. 생포하거나 목을 가져오는 자에게 ${bounty}${cur(s)}.」`,
      script: [N(`장터 벽에 새 방이 붙었다. 「${crime}범 ${name}. 생포하거나 목을 가져오는 자에게 ${bounty}${cur(s)}.」`), P('포졸', '놈이 뒷산 동굴에 숨어 있다는 제보가 있소만, 우리 힘으로는 엄두가 안 나오.')],
      options: [
        { id: 'hunt', label: '잡으러 간다', hint: `비무 · 현상금 ${bounty}${cur(s)}` },
        { id: 'leave', label: '관아 일은 관아가 한다' },
      ],
      meta: { name, bounty, crime },
    };
  },
  resolve: (s, opt, c) =>
    opt === 'hunt'
      ? journeyBattle(s, c, opt, {
          title: `현상범 ${c.data?.name}`,
          subtitle: `${c.data?.crime}범`,
          name: String(c.data?.name),
          enemyTitle: '현상범',
          age: 33,
          ai: 'RUSHDOWN',
          scale: roadScale(s, 1.0),
          weapon: 'BLADE',
          skills: byCountry(s, ['sk_kr_01', 'sk_kr_06', 'base_h_slash'], ['sk_cn_02', 'sk_cn_07', 'base_h_slash'], ['sk_jp_03', 'sk_jp_07', 'base_h_slash']),
          rewardMoney: Number(c.data?.bounty),
          rewardFame: 12,
        })
      : s,
  onBattle: (s, _opt, won, c) => say(won ? addRep(s, { virtue: 4 }) : addHealth(s, -8), [['나레이션', won ? `${josa(String(c.data?.name ?? ''), '을를')} 포박해 관아에 넘겼다. 사또가 직접 나와 치하했다.` : '놈은 동굴 뒤쪽 구멍으로 달아났다. 팔에 칼자국 하나를 남기고.']]),
};

// ───────── 10. 떠돌이 병기상 ─────────
const peddler: JourneyEventDef = {
  key: 'home_peddler',
  kind: 'HOME',
  cond: (s) => s.turn >= 6 && s.money >= 120,
  build: (s) => {
    const pool = byCountry(s, ['wp_bl_04', 'wp_bl_07', 'wp_pl_02', 'wp_un_03', 'wp_th_01'], ['wp_bl_05', 'wp_bl_08', 'wp_pl_06', 'wp_un_03', 'wp_th_03'], ['wp_bl_06', 'wp_bl_09', 'wp_pl_04', 'wp_un_02', 'wp_th_01']).filter((id) => !s.weapons.some((w) => w.id === id));
    const id = pool.length ? rand(pool) : 'wp_bl_02';
    const fake = chance(0.25);
    const price = 90 + Math.floor(Math.random() * 90);
    return {
      title: '떠돌이 병기상',
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: '등짐 가득 칼을 진 장사꾼이 마당에 짐을 풀었다.',
      script: [N('등짐 가득 병기를 진 장사꾼이 마당에 보따리를 펼친다.'), P('병기상', `이건 명장이 직접 벼린 물건이오. ${price}${cur(s)}. 오늘만 이 값이오!`, '칼을 쓱 뽑으며')],
      options: [
        { id: 'buy', label: `산다 (${price}${cur(s)})`, disabled: s.money < price, disabledReason: '돈이 부족하다', hint: '진품일까?' },
        { id: 'inspect', label: '먼저 꼼꼼히 살펴본다', hint: `통찰 판정 약 ${pct(0.3 + s.stats.ins * 0.007)} — 가짜를 가려낸다` },
        { id: 'leave', label: '돌려보낸다' },
      ],
      meta: { id, fake: fake ? 1 : 0, price },
    };
  },
  resolve: (s, opt, c) => {
    if (opt === 'leave') return s;
    const fake = !!c.data?.fake;
    const price = Number(c.data?.price);
    if (opt === 'inspect') {
      const ok = chance(clampP(0.3 + s.stats.ins * 0.007));
      if (fake && ok) return say(addStats(s, { ins: 1 }), [['나레이션', '칼날의 무늬가 그려 넣은 것이었다. 장사꾼이 얼굴을 붉히며 보따리를 쌌다.']]);
      if (!fake && ok) {
        const g = giveWeapon(addMoney(s, -Math.round(price * 0.85)), String(c.data?.id));
        return say(g.state, [['나레이션', g.name ? `진품이다. 값을 조금 깎아 「${g.name}」을(를) 샀다.` : '좋은 물건이었지만 이미 가진 것과 같았다.']]);
      }
      return say(s, [['나레이션', '한참을 들여다봤지만 진짜인지 가짜인지 모르겠다. 사지 않기로 했다.']]);
    }
    if (fake) return say(addMoney(s, -price), [['나레이션', `며칠 뒤 칼날이 숫돌에 닿자마자 이가 빠졌다. 가짜였다. (${price}${cur(s)} 날림)`]]);
    const g = giveWeapon(addMoney(s, -price), String(c.data?.id));
    return say(g.state, [['나레이션', g.name ? `「${g.name}」을(를) 샀다. 손에 착 감긴다.` : '이미 가진 물건이었다.']]);
  },
};

// ───────── 11. 담 너머 구경꾼 아이들 ─────────
const kids: JourneyEventDef = {
  key: 'home_kids',
  kind: 'HOME',
  weightBy: (s) => (s.age >= 62 ? 0.5 : 1), // 노년에는 드물게
  cond: (s) => s.turn >= 4,
  build: () => ({
    title: '담 너머의 눈동자들',
    category: 'FAMILY',
    sceneActor: 'DISCIPLE',
    narration: '수련 시간마다 담장 위로 동네 아이들 머리가 줄줄이 올라온다.',
    script: [N('수련 시간마다 담장 위로 동네 아이들 머리가 쏙쏙 올라온다. 목검 휘두르는 흉내를 낸다.'), P('동네 꼬마', '아저씨! 우리도 가르쳐 주면 안 돼요? 돈은 없지만…', '담장에 매달려')],
    options: [
      { id: 'teach', label: '보름날마다 마당을 열어 공짜로 가르친다', hint: '인덕·명성 · 재능 있는 아이가 있을지도' },
      { id: 'shoo', label: '「위험하다」며 쫓아 보낸다' },
    ],
  }),
  resolve: (s, opt) => {
    if (opt === 'shoo') return say(s, [['나레이션', '아이들이 우르르 흩어졌다. 다음 날에도 담장 위에 머리가 올라왔다.']]);
    let n = addFame(addRep(s, { virtue: 8 }), 8);
    // 수십 년 뒤, 그 아이들 가운데 하나가 어른이 되어 찾아온다 (노년 사건)
    if (!s.flags.storyMemory?.taught_kids) n = remember(n, 'taught_kids', String(s.year));
    let extra = '';
    if (hasRoom(n) && chance(0.3)) {
      const d = { ...createDiscipleEntity(n, { isChild: true, isGenius: chance(0.4), childTalent: 'DILIGENT', archetype: '담장을 넘던 동네 아이' }), joinedYear: n.year, temperamentKnown: true };
      n = { ...n, disciples: [...n.disciples, d] };
      extra = ` 그중 ${josa(d.name, '이가')} 유난히 눈에 띄어 정식 제자로 받았다.`;
    }
    return say(n, [['나레이션', `보름날이면 마당이 아이들로 북적였다. 고을 사람들의 눈빛이 달라졌다. (인덕 +8, 명성 +8)${extra}`]]);
  },
};

// ───────── 12. 시절의 물결 — 그 해의 풍문이 도장 앞까지 온다 ─────────
const freshRumors = (s: GameState) => rumorsFor(s.country, s.year).filter((r) => !(s.flags.storyMemory?.heard_rumors || '').includes(r.slice(0, 24)));
const eraWave: JourneyEventDef = {
  key: 'home_era',
  kind: 'HOME',
  // 이미 들은 풍문은 다시 돌지 않는다
  cond: (s) => freshRumors(s).length > 0,
  build: (s) => {
    const rumor = rand(freshRumors(s));
    return {
      title: '저잣거리의 풍문',
      meta: { rumorIdx: rumorsFor(s.country, s.year).indexOf(rumor), rumor: rumor.slice(0, 24) },
      category: 'HISTORICAL',
      narration: rumor,
      script: [N('장에 다녀온 제자가 숨을 몰아쉬며 들어온다.'), P('문하생', rumor, '눈이 휘둥그레져'), P('문하생', '스승님, 우리도 뭔가 해야 하는 것 아닙니까?')],
      options: [
        { id: 'prepare', label: '곳간을 단속하고 제자들을 단속한다', hint: '살림 대비 · 기강' },
        { id: 'help', label: `고을 사람들을 돕는다 (30${cur(s)})`, disabled: s.money < 30, disabledReason: '돈이 부족하다', hint: '인덕·명성' },
        { id: 'calm', label: '「세상일에 흔들리지 마라」 하고 수련을 계속한다', hint: '구도' },
      ],
    };
  },
  resolve: (s0, opt, c) => {
    const heard = s0.flags.storyMemory?.heard_rumors || '';
    const s = remember(s0, 'heard_rumors', `${heard}|${String(c.data?.rumor || '')}`.slice(-1500));
    if (opt === 'prepare') return say(addMoney(addRep(s, { commerce: 3 }), 25), [['나레이션', '곳간을 정리하고 묵은 곡식을 팔았다. 난리가 와도 한 철은 버틸 것이다. (+25)']]);
    if (opt === 'help') return say(addFame(addRep(addMoney(s, -30), { virtue: 8 }), 10), [['나레이션', '제자들과 함께 쌀을 나르고 무너진 담을 고쳤다. 고을 사람들이 「그 도장 사람들」 이야기를 했다.']]);
    return say(trainEquipped(addRep(s, { ascetic: 5 }), 30), [['나레이션', '세상이 시끄러울수록 마당의 목검 소리는 더 또렷했다.']]);
  },
};

// ───────── 메아리: 사또 도령 · 세도가의 빚 · 투전판 ─────────
const echoMagistrateSon: JourneyEventDef = {
  key: 'echo_magistrate_son',
  kind: 'ECHO_HOME',
  build: (s) => ({
    title: byCountry(s, '사또 도령, 무관이 되다', '지현의 도련님, 무관이 되다', '다이칸의 도련님, 무사가 되다'),
    category: 'LIFE',
    narration: '말을 탄 젊은 무관이 도장 앞에 내렸다. 울며 뛰쳐나가던 그 도령이다.',
    script: [N('말을 탄 젊은 무관이 도장 앞에 내렸다. 몇 해 전 울며 뛰쳐나가던 그 도령이다.'), P('젊은 무관', '스승님! 그때는 철이 없었습니다. 무과에 급제했습니다. 스승님 덕입니다.', '넙죽 절하며')],
    options: [{ id: 'ok', label: '대견하게 일으켜 세운다' }],
  }),
  resolve: (s) => {
    const t = takeEcho(s, 'magistrate_son');
    let n = addFame(t.state, 35);
    if (t.echo) n = echoMilestone(n, t.echo, '그 도령이 무과에 급제해 찾아왔다');
    return say(n, [['나레이션', '관아에서 도장을 보는 눈이 달라졌다. (명성 +35)']]);
  },
};
const echoNobleDebt: JourneyEventDef = {
  key: 'echo_noble_debt',
  kind: 'ECHO_HOME',
  build: (s) => ({
    title: '「묻지 않는 칼」의 청구서',
    category: 'DUEL',
    sceneActor: 'ENEMY',
    narration: '세도가의 집사가 다시 찾아왔다. 이번엔 돈이 아니라 부탁을 들고.',
    script: [P('세도가 집사', `약속을 지키실 때가 되었소. 오늘 밤, ${byCountry(s, '어느 서생', '어느 어사', '어느 무사')}의 집에 가서… 조용히 일을 처리해 주시오.`, '눈을 가늘게 뜨며')],
    options: [
      { id: 'obey', label: '약속대로 칼을 빌려준다', hint: '⚠ 살기 크게 상승' },
      { id: 'refuse', label: '돈을 돌려주고 약속을 깬다', hint: '재물 손실 · 세도가와 원수' },
    ],
  }),
  resolve: (s, opt) => {
    const t = takeEcho(s, 'noble_debt');
    let n = t.state;
    let result = '';
    if (opt === 'obey') {
      n = addRep(addMoney(n, 120), { ruthless: 25, virtue: -10 });
      result = '세도가의 청부를 받아 칼을 빌려주었다';
    } else {
      n = addFame(addRep(addMoney(n, -Math.min(n.money, 260)), { virtue: 15 }), -20);
      result = '받은 돈을 돌려주고 세도가의 청부를 거절했다';
    }
    if (t.echo) n = echoMilestone(n, t.echo, result);
    return say(n, [['나레이션', `${result}.`]]);
  },
};
const echoGambling: JourneyEventDef = {
  key: 'echo_gambling_den',
  kind: 'ECHO_HOME',
  build: () => ({
    title: '투전판의 앙갚음',
    category: 'DUEL',
    sceneActor: 'ENEMY',
    narration: '밤중에 투전판 왈짜들이 몽둥이를 들고 몰려왔다.',
    script: [N('밤중에 투전판 왈짜들이 몽둥이를 들고 몰려왔다.'), P('투전판 왈짜', '지난번엔 잘도 칼집을 휘두르더군. 오늘은 우리 차례다!', '횃불을 치켜들며', 'ANGRY')],
    options: [{ id: 'fight', label: '나가서 상대한다', hint: '비무' }],
  }),
  resolve: (s, opt, c) =>
    journeyBattle(s, c, opt, { title: '투전판 왈짜들', subtitle: '앙갚음', name: '투전판 왈짜 두목', enemyTitle: '노름판 주먹', age: 35, ai: 'AGGRESSIVE', scale: roadScale(s, 0.8), weapon: 'UNARMED', skills: ['sk_kr_03', 'sk_cn_01', 'base_h_slash'], rewardFame: 10 }),
  onBattle: (s, _opt, won) => {
    const t = takeEcho(s, 'gambling_den');
    let n = won ? t.state : addMoney(addHealth(t.state, -10), -40);
    if (t.echo) n = echoMilestone(n, t.echo, won ? '투전판 왈짜들이 앙갚음하러 왔다가 혼쭐이 났다' : '투전판 왈짜들에게 앙갚음을 당했다');
    return n;
  },
};

export const HOME_EVENTS: JourneyEventDef[] = [
  challenge,
  commission,
  discipleStory,
  festival,
  patron,
  neighbor,
  scholars,
  oldFriend,
  wanted,
  peddler,
  kids,
  eraWave,
  echoLoan,
  echoMagistrateSon,
  echoNobleDebt,
  echoGambling,
];
