import { josa } from '../../utils/korean';
import { GameState } from '../../types/game';
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
  remember,
  roadScale,
  say,
  spendDays,
  takeEcho,
  trainEquipped,
} from '../../engine/journeyCore';
import { createDiscipleEntity } from '../events';
import { getMaxDisciples } from '../../engine/gameLogic';
import { adjustRelation } from '../../engine/sectLogic';
import { getSects, metSects } from '../sects';
import { regionsForCountry } from '../journeyRegions';

// 길 위의 인연 — 나비효과의 씨앗. 그리고 몇 해 뒤 도장으로 돌아오는 메아리.

const hasRoom = (s: GameState) => s.disciples.filter((d) => !d.dead).length < getMaxDisciples(s.facilities);

function addDisciple(s: GameState, opts: Parameters<typeof createDiscipleEntity>[1], tweak?: (d: ReturnType<typeof createDiscipleEntity>) => ReturnType<typeof createDiscipleEntity>): { state: GameState; name: string } {
  let d = createDiscipleEntity(s, opts);
  d = { ...d, joinedYear: s.year, temperamentKnown: true };
  if (tweak) d = tweak(d);
  return { state: { ...s, disciples: [...s.disciples, d], flags: { ...s.flags, hasHadFirstDisciple: true } }, name: d.name };
}

export const PEOPLE_EVENTS: JourneyEventDef[] = [
  {
    key: 'p_beggar',
    kind: 'PEOPLE',
    once: true,
    label: () => '길가의 거지',
    build: (s) => ({
      title: '굶주린 거지',
      category: 'LIFE',
      narration: '길가에 거적을 쓴 거지가 웅크리고 있다. 눈만은 이상하게 맑다.',
      script: [
        N('길가에 거적을 쓴 거지 하나가 웅크리고 있다. 사흘은 굶은 얼굴인데, 눈만은 이상하게 맑다.'),
        P('거지', '나리… 찬밥 한 덩이면 됩니다요. 이 은혜는 꼭… 꼭 갚겠습니다요.', '두 손을 모으며'),
      ],
      options: [
        { id: 'give', label: `주먹밥과 노자를 나눠 준다 (5${cur(s)})`, disabled: s.money < 5, disabledReason: '노자가 부족하다' },
        { id: 'leave', label: '못 본 척 지나간다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'give') return s;
      let n = addRep(addMoney(s, -5), { virtue: 4 });
      n = addEcho(n, { key: 'beggar_king', minYears: 7, maxYears: 14, channel: 'HOME', bornText: '길가의 굶주린 거지에게 주먹밥을 나눠 주었다' });
      return say(n, [
        ['거지', '나리 얼굴, 잊지 않겠습니다요.'],
        ['나레이션', '거지는 주먹밥을 품에 넣고 절뚝이며 사라졌다. 별일 아닌 일이었다. (인덕 +4)'],
      ]);
    },
  },
  {
    key: 'p_scholar',
    kind: 'PEOPLE',
    once: true,
    label: () => '쫓기는 서생',
    build: (s) => ({
      title: '쫓기는 서생',
      category: 'LIFE',
      narration: '헐레벌떡 달려온 젊은 서생이 소매를 붙잡는다. 멀리서 횃불과 고함이 다가온다.',
      script: [
        N('헐레벌떡 달려온 젊은 서생이 소매를 붙잡는다. 멀리서 횃불과 고함 소리가 다가온다.'),
        P('젊은 서생', byCountry(s, '상소 한 장 올렸다고 잡으러 옵니다! 제발 숨겨 주십시오!', '현령의 비리를 적은 글 때문에 쫓깁니다. 살려 주시오!', '번(藩)의 장부를 들춰 봤다고 쫓깁니다. 부탁이오!'), '숨을 헐떡이며', '!'),
      ],
      options: [
        { id: 'hide', label: '숲으로 숨기고 추격자를 따돌린다 (1일)', hint: '훗날 인연이 될지도' },
        { id: 'hand', label: '추격자들에게 넘긴다', hint: `포상금 30${cur(s)}` },
        { id: 'leave', label: '관여하지 않는다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'hide') {
        let n = addRep(spendDays(s, 1), { virtue: 8 });
        n = addEcho(n, { key: 'scholar_official', minYears: 9, maxYears: 17, channel: 'HOME', bornText: '쫓기던 젊은 서생을 숨겨 주었다' });
        return say(n, [
          ['나레이션', '서생을 바위틈에 숨기고, 횃불 든 사내들에게 엉뚱한 길을 일러 주었다.'],
          ['젊은 서생', '성함만이라도… 아니, 도장 이름만이라도 알려 주십시오. 반드시 갚겠습니다.'],
        ]);
      }
      if (opt === 'hand') {
        const n = addRep(addMoney(s, 30), { ruthless: 8 });
        return say(n, [['나레이션', `포상금 30${cur(s)}을 받았다. 끌려가는 서생의 눈빛이 오래 남았다. (살기 +8)`]]);
      }
      return s;
    },
  },
  {
    key: 'p_prodigy',
    kind: 'PEOPLE',
    label: () => '나뭇가지 든 아이',
    once: true,
    build: (s) => ({
      title: '나뭇가지로 검을 휘두르는 아이',
      category: 'FAMILY',
      sceneActor: 'DISCIPLE',
      narration: '개울가에서 열 살 남짓한 아이가 나뭇가지로 허공을 벤다. 자세가 엉망인데, 칼끝만은 한 번도 흔들리지 않는다.',
      script: [
        N('개울가에서 열 살 남짓한 아이가 나뭇가지로 허공을 베고 있다.'),
        N('자세는 엉망이다. 그런데 칼끝이 한 번도 흔들리지 않는다. 열 번, 백 번을 베도.'),
        P('아이', '아저씨 칼 진짜예요? 나도 칼 배우고 싶은데, 아무도 안 가르쳐 줘요. 부모님도 없고요.', '눈을 반짝이며'),
      ],
      options: [
        { id: 'take', label: '도장으로 데려간다', hint: hasRoom(s) ? '천재 문하생' : '도장에 자리가 없다', disabled: !hasRoom(s), disabledReason: '문하생 정원이 찼다' },
        { id: 'advice', label: '자세 하나만 고쳐 주고 떠난다', hint: '이 아이는 혼자 자랄 것이다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'take') {
        const a = addDisciple(s, { isGenius: true, isChild: true, childTalent: 'PRODIGY', archetype: '길에서 거둔 아이', temperament: 'DILIGENT' });
        return say(highlight(a.state, `개울가의 아이 ${josa(a.name, '을를')} 거두었다`), [
          ['나레이션', `아이의 이름은 ${a.name}. 나뭇가지를 꼭 쥔 채 뒤를 따라왔다. (천재 문하생 입문)`],
        ]);
      }
      const name = rand(byCountry(s, ['한서진', '백무영', '윤설'], ['소천', '임비홍', '하련'], ['다카무라 진', '스오 렌', '아마기 쇼']));
      let n = addEcho(s, { key: 'prodigy_rival', minYears: 14, maxYears: 20, channel: 'HOME', bornText: `개울가의 아이에게 칼 쥐는 법 하나만 일러 주고 떠났다`, data: { name } });
      n = addRep(n, { ascetic: 3 });
      return say(n, [
        [n.name, '팔꿈치를 붙여라. 칼은 어깨가 아니라 허리로 든다.'],
        ['나레이션', `아이가 한 번 베어 보더니 눈이 커졌다. 돌아보지 않고 걸었다. 등 뒤로 나뭇가지 소리가 오래 따라왔다.`],
      ]);
    },
  },
  {
    key: 'p_bandit_boss',
    kind: 'PEOPLE',
    once: true,
    label: (_s, r) => r.bandit.name,
    cond: (_s, r) => r.danger >= 0.45,
    build: (s, c) => ({
      title: `${c.region?.bandit.name || '산채 두목'}과의 대면`,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '산채 앞을 지나는데 두목이 직접 칼을 들고 나왔다. 수하들이 뒤에서 횃불을 든다.',
      script: [
        N('산채 앞. 두목이 직접 칼을 들고 내려왔다. 수하들이 뒤에서 횃불을 든다.'),
        P(c.region?.bandit.name || '산채 두목', '칼 좀 쓴다는 놈이 우리 산을 지난다길래. 나랑 한판 붙고 가라. 네가 이기면 길을 내주지.', '침을 뱉으며', 'ANGRY'),
      ],
      options: [
        { id: 'subdue', label: '칼등으로 제압한다 (목숨은 거두지 않는다)', hint: '⚠ 진검승부 · 살려 둔 자는 언젠가 돌아온다' },
        { id: 'kill', label: '진검으로 벤다', hint: '⚠ 진검승부 · 벤 자에게도 가족이 있다' },
        { id: 'toll', label: `통행세를 낸다 (40${cur(s)})`, disabled: s.money < 40, disabledReason: '노자가 부족하다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'toll') return say(addMoney(s, -40), [['나레이션', '두목이 엽전을 세더니 코웃음을 치며 길을 비켰다.']]);
      return journeyBattle(s, c, opt, {
        title: `${c.region?.bandit.name || '산채 두목'}`,
        subtitle: opt === 'kill' ? '진검 — 둘 중 하나는 산을 내려가지 못한다' : '칼등으로 제압한다',
        name: c.region?.bandit.name || '산채 두목',
        enemyTitle: c.region?.bandit.title || '산채 두목',
        age: 41,
        ai: 'HEAVY',
        scale: roadScale(s, 1.0),
        weapon: 'BLADE',
        skills: byCountry(s, ['sk_kr_06', 'sk_kr_02', 'base_v_slash'], ['sk_cn_06', 'sk_cn_02', 'base_v_slash'], ['sk_jp_06', 'sk_jp_03', 'base_v_slash']),
        realDuel: opt === 'kill',
        rewardMoney: 60,
        rewardFame: 25,
      });
    },
    onBattle: (s, opt, won, c) => {
      if (!won) return s;
      const name = c.region?.bandit.name || '산채 두목';
      if (opt === 'kill') {
        let n = addRep(s, { ruthless: 10 });
        n = addEcho(n, { key: 'bandit_son', minYears: 12, maxYears: 18, channel: 'HOME', bornText: `${josa(name, '을를')} 진검으로 베었다`, data: { father: name } });
        return say(highlight(n, `${josa(name, '을를')} 베었다`), [
          ['나레이션', `${josa(name, '이가')} 쓰러졌다. 산채 안쪽에서 아이 울음소리가 들렸다.`],
        ]);
      }
      let n = addRep(s, { virtue: 6 });
      n = addEcho(n, { key: 'bandit_spared', minYears: 5, maxYears: 9, channel: 'HOME', bornText: `${josa(name, '을를')} 제압하고 목숨은 살려 보냈다`, data: { name } });
      return say(highlight(n, `${josa(name, '을를')} 제압하고 살려 보냈다`), [
        [name, '…왜 안 베냐.'],
        [s.name, '베면 끝이지만, 살려 두면 네가 어떤 놈이 될지 궁금해서.'],
      ]);
    },
  },
  {
    key: 'p_wounded',
    kind: 'PEOPLE',
    once: true,
    label: () => '다친 검객',
    build: (s) => ({
      title: '피 흘리는 검객',
      category: 'LIFE',
      narration: '나무 아래 젊은 검객이 옆구리를 움켜쥐고 앉아 있다. 칼날에 베인 상처다.',
      script: [
        N('나무 아래, 젊은 검객이 옆구리를 움켜쥐고 앉아 있다. 소매에 수놓인 문양은 어느 문파의 것이다.'),
        P('젊은 검객', '…신경 쓰지 마시오. 사문의 일이오. 지나가시오.', '이를 악물며'),
      ],
      options: [
        { id: 'treat', label: `상처를 꿰매고 약을 나눈다 (10${cur(s)}, 1일)`, disabled: s.money < 10, disabledReason: '노자가 부족하다' },
        { id: 'leave', label: '말대로 지나간다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'treat') return s;
      let n = addRep(spendDays(addMoney(s, -10), 1), { virtue: 6 });
      n = addEcho(n, { key: 'wounded_leader', minYears: 6, maxYears: 11, channel: 'HOME', bornText: '길에서 피 흘리던 젊은 검객의 상처를 꿰매 주었다' });
      return say(n, [
        ['젊은 검객', '…사문의 배신자에게 당했소. 이 빚은 사문의 이름으로 갚겠소.'],
        ['나레이션', '검객은 하룻밤을 앓고 새벽에 말없이 떠났다. 머리맡에 문파 문양이 새겨진 단추 하나가 놓여 있었다.'],
      ]);
    },
  },
  {
    key: 'p_dying',
    kind: 'PEOPLE',
    once: true,
    label: () => '숨이 꺼져 가는 노무인',
    build: () => ({
      title: '마지막 초식',
      category: 'LIFE',
      narration: '길가 정자에 늙은 무인이 기대어 있다. 숨결이 가늘다. 곁에 이 빠진 칼 한 자루.',
      script: [
        N('정자 기둥에 늙은 무인이 기대어 있다. 숨결이 가늘다. 곁에 이 빠진 칼 한 자루.'),
        P('늙은 무인', '…칼 찬 사람이구먼. 잘됐어. 아무에게도 못 넘긴 초식이 하나 있어. 그냥 가져가… 내 무덤은… 고향 산에…', '손을 떨며'),
      ],
      options: [
        { id: 'listen', label: '곁을 지키며 마지막 초식을 받는다 (1일)', hint: '장착 초식 숙련, 그리고 약속 하나' },
        { id: 'leave', label: '의원을 불러 주고 떠난다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'listen') return addRep(s, { virtue: 2 });
      let n = trainEquipped(spendDays(s, 1), 90);
      const regions = regionsForCountry(n.country).filter((r) => r.id !== n.journey?.regionId);
      const home = rand(regions.length ? regions : regionsForCountry(n.country));
      n = addEcho(n, { key: 'dying_grave', minYears: 0.25, maxYears: 2, channel: 'ROAD', bornText: '길가 정자에서 죽어 가던 노무인의 마지막 초식을 받았다', regionId: home.id });
      return say(highlight(n, '죽어 가는 노무인의 마지막 초식을 받았다'), [
        ['나레이션', '노인은 숨이 끊어지기 전까지 손가락으로 허공에 검로를 그렸다. 그 선을 따라 칼을 움직였다. (장착 초식 숙련 +90)'],
        ['늙은 무인', `…${home.name}… 거기 내 칼을… 묻어 줘…`],
        ['나레이션', `노인을 정자 뒤에 묻었다. 언젠가 ${home.name}에 가면 그의 고향 산을 찾아야겠다.`],
      ]);
    },
  },
  {
    key: 'p_mapseller',
    kind: 'PEOPLE',
    once: true,
    label: () => '지도 파는 노인',
    build: (s) => ({
      title: '보물 지도를 파는 노인',
      category: 'LIFE',
      sceneActor: 'MERCHANT',
      narration: '장터 구석에서 노인이 누런 종이 한 장을 펼쳐 보인다. 산과 물길, 그리고 붉은 점 하나.',
      script: [
        N('장터 구석, 노인이 누렇게 바랜 종이를 펼친다. 산줄기와 물길, 그리고 붉은 점 하나.'),
        P('지도 노인', `옛 무인이 비급을 묻은 자리라오. 사십 냥… 아니 ${40}${cur(s)}만 주시오. 내가 젊었으면 직접 갔지.`, '은밀하게'),
      ],
      options: [
        { id: 'buy', label: `산다 (40${cur(s)})`, hint: '다음 무사수행에서 찾아갈 수 있다', disabled: s.money < 40, disabledReason: '노자가 부족하다' },
        { id: 'leave', label: '사기꾼이다. 지나간다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'buy') return s;
      const regions = regionsForCountry(s.country).filter((r) => r.id !== s.journey?.regionId);
      const target = rand(regions.length ? regions : regionsForCountry(s.country));
      const real = chance(0.6);
      let n = addMoney(s, -40);
      n = addEcho(n, { key: 'treasure_map', minYears: 0.25, maxYears: 1.5, channel: 'ROAD', bornText: '장터에서 낡은 보물 지도를 샀다', regionId: target.id, data: { real: real ? 1 : 0 } });
      return say(n, [['나레이션', `지도 뒷면에 「${target.name}」이라고 적혀 있다. 진짜일까? 언젠가 ${target.name}으로 무사수행을 떠나면 알게 될 것이다.`]]);
    },
  },
  {
    key: 'p_herbalist',
    kind: 'PEOPLE',
    once: true,
    label: () => '약초꾼',
    build: (s) => ({
      title: '절벽의 약초꾼',
      category: 'LIFE',
      narration: '밧줄 하나에 매달린 약초꾼이 절벽에서 무언가를 캐고 있다. 밧줄이 바위에 쓸려 반쯤 끊어졌다.',
      script: [
        N('밧줄 하나에 몸을 맡긴 약초꾼이 절벽 틈의 풀을 캐고 있다. 밧줄이 바위에 쓸려 반쯤 끊어져 있다.'),
        P('약초꾼', '거기 무사 양반! 밧줄 좀… 밧줄 좀 잡아 주시오!', '매달린 채', '!'),
      ],
      options: [
        { id: 'help', label: '밧줄을 붙잡아 끌어올린다 (1일)', hint: '약초꾼과의 인연' },
        { id: 'buy', label: `끌어올린 뒤 귀한 약초를 산다 (30${cur(s)})`, hint: '건강 +20', disabled: s.money < 30, disabledReason: '노자가 부족하다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'buy') {
        const n = addHealth(addMoney(s, -30), 20);
        return say(n, [['나레이션', '절벽 틈에서 캔 영지를 달여 마셨다. 뼛속까지 따뜻해진다. (건강 +20)']]);
      }
      let n = addRep(spendDays(s, 1), { virtue: 5 });
      n = addHealth(n, 8);
      n = addEcho(n, { key: 'herbalist_doctor', minYears: 9, maxYears: 14, channel: 'HOME', bornText: '절벽에 매달린 약초꾼을 끌어올렸다' });
      return say(n, [
        ['약초꾼', '이 목숨 빚은… 의술로 갚겠소. 나 같은 놈도 언젠가는 의원이 될 거요.'],
        ['나레이션', '약초꾼이 달여 준 탕약 한 사발을 마셨다. (건강 +8, 인덕 +5)'],
      ]);
    },
  },
  {
    key: 'p_sect',
    kind: 'PEOPLE',
    label: () => '타 문파 무리',
    cond: (s) => metSects(s).length > 0,
    build: (s) => {
      const sect = rand(metSects(s));
      return {
        title: `${sect.name} 제자들의 시비`,
        category: 'DUEL',
        sceneActor: 'ENEMY',
        narration: `주막 앞에서 ${sect.name} 제자들이 길을 막는다.`,
        script: [
          N(`주막 앞, ${sect.name}의 문양을 단 제자들이 길을 막는다.`),
          P(`${sect.name} 대제자`, `${s.sectName}? 들어 본 적 없는 이름인데. 우리 사형께 인사라도 하고 지나가시지.`, '팔짱을 끼며', 'ANGRY'),
        ],
        options: [
          { id: 'teach', label: '버릇을 가르친다', hint: `진검승부 · ${sect.name}과의 관계 악화` },
          { id: 'bow', label: '웃으며 포권하고 지나간다', hint: `${sect.name}과의 관계 개선` },
        ],
        meta: { sectId: sect.id },
      };
    },
    resolve: (s, opt, c) => {
      const sect = getSects(s).find((x) => x.id === c.data?.sectId) || metSects(s)[0];
      if (!sect) return s;
      if (opt === 'teach') {
        return journeyBattle(s, { ...c, data: { ...(c.data || {}), sectId: sect.id } }, opt, {
          stakes: 'MERCY', title: `${sect.name} 대제자`,
          subtitle: '길 위의 시비',
          name: `${sect.name} 대제자`,
          enemyTitle: sect.champion,
          age: 27,
          ai: 'AGGRESSIVE',
          scale: roadScale(s, 0.9),
          weapon: 'BLADE',
          skills: ['base_h_slash', 'sk_kr_01', 'sk_cn_01'],
          rewardFame: 20,
        });
      }
      const n = adjustRelation(addRep(s, { virtue: 3 }), sect.id, 6, `길에서 ${sect.name} 제자들에게 먼저 예를 갖추었다`);
      return say(n, [['나레이션', `웃으며 포권하자 대제자가 머쓱하게 길을 비켰다. (${sect.name}과의 관계 +6)`]]);
    },
    onBattle: (s, _opt, won, c) => {
      const sectId = c.data?.sectId as string | undefined;
      if (won) return adjustRelation(addFame(s, 10), sectId, -12, '길에서 그 문파의 대제자를 꺾어 망신을 주었다');
      return adjustRelation(addFame(s, -10), sectId, -4, '길에서 그 문파 제자에게 지고 말았다');
    },
  },
  {
    key: 'p_wanderer',
    kind: 'PEOPLE',
    once: true,
    label: () => '무사수행 중인 검객',
    build: (s) => ({
      title: '같은 길을 걷는 검객',
      category: 'RIVAL',
      sceneActor: 'RIVAL',
      narration: '모닥불 건너편에 또래의 검객이 앉아 있다. 그도 무사수행 중이라 한다.',
      script: [
        N('모닥불 건너편에 검객 하나가 앉아 있다. 칼집이 닳은 걸 보니 꽤 오래 걸은 사람이다.'),
        P('떠돌이 검객', '당신도 수행 중이오? 이것도 인연인데, 내일 아침 한 합 어떻소. 지는 쪽이 술을 사기로.', '술병을 흔들며'),
      ],
      options: [
        { id: 'spar', label: '새벽에 한 합 겨룬다 (1일)', hint: '목검 시합' },
        { id: 'talk', label: '밤새 무예 이야기를 나눈다 (1일)', hint: '길동무가 생긴다' },
        { id: 'leave', label: '일찍 잠자리에 든다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'spar') {
        return journeyBattle(spendDays(s, 1), c, opt, {
          stakes: 'SPAR', title: '새벽 공터의 한 합',
          subtitle: '같은 길을 걷는 검객',
          name: '떠돌이 검객',
          enemyTitle: '무사수행 중인 검객',
          age: s.age + 2,
          ai: 'DUELIST',
          scale: roadScale(s, 1.0),
          weapon: 'BLADE',
          skills: byCountry(s, ['sk_kr_06', 'sk_kr_02', 'sk_jp_03'], ['sk_cn_05', 'sk_cn_03', 'sk_jp_03'], ['sk_jp_01', 'sk_jp_03', 'sk_jp_04']),
          rewardFame: 15,
        });
      }
      if (opt === 'talk') {
        let n = addStats(spendDays(s, 1), { ins: 2 });
        n = addEcho(n, { key: 'wanderer_friend', minYears: 4, maxYears: 8, channel: 'HOME', bornText: '모닥불가에서 떠돌이 검객과 밤새 무예를 이야기했다' });
        return say(n, [
          ['떠돌이 검객', '언젠가 내 칼이 완성되면, 당신 도장에 제일 먼저 보여 주러 가겠소.'],
          ['나레이션', '새벽까지 서로의 검리를 주고받았다. (통찰 +2)'],
        ]);
      }
      return s;
    },
    onBattle: (s, _opt, won) => {
      let n = trainEquipped(s, 40);
      n = addEcho(n, { key: 'wanderer_friend', minYears: 4, maxYears: 8, channel: 'HOME', bornText: '새벽 공터에서 떠돌이 검객과 한 합을 겨루었다' });
      return say(n, [
        ['떠돌이 검객', won ? '하하, 술은 내가 사지! 언젠가 다시 붙읍시다.' : '이 술은 당신이 사는 거요! 다음엔 더 세져서 오시오.'],
        ['나레이션', '술잔을 기울이며 서로의 칼에 대해 밤새 떠들었다. (장착 초식 숙련 +40)'],
      ]);
    },
  },

  // ───────── 길 위로 돌아오는 메아리 (ROAD) ─────────
  {
    key: 'echo_dying_grave',
    kind: 'ECHO',
    label: () => '노무인의 고향 산',
    build: () => ({
      title: '약속한 무덤',
      category: 'LIFE',
      narration: '노무인이 말했던 고향 산이다. 산중턱에 이름 없는 봉분 하나와 오래된 비석.',
      script: [
        N('언젠가 길가 정자에서 숨을 거둔 노무인. 그가 말한 고향 산이 바로 여기다.'),
        N('산중턱, 이끼 낀 비석 아래 작은 돌함이 묻혀 있다.'),
      ],
      options: [
        { id: 'open', label: '약속대로 그의 칼을 묻고 돌함을 연다 (1일)' },
        { id: 'leave', label: '절만 올리고 떠난다' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'dying_grave');
      let n = t.state;
      if (opt !== 'open' || !t.echo) return n;
      n = spendDays(n, 1);
      const id = pickBook(n, (b) => b.countryBias === n.country && b.rarity === 'LEGEND') || pickBook(n, (b) => b.countryBias === n.country);
      if (id) {
        const g = giveBook(n, id, 30);
        n = echoMilestone(g.state, t.echo, `그의 고향 산에서 ${josa(g.title || '', '을를')} 얻었다`);
        return say(highlight(n, `노무인의 무덤에서 ${josa(g.title || '', '을를')} 얻었다`), [
          ['나레이션', `돌함 안에는 기름종이에 싸인 책 한 권. ${g.title}. 첫 장에 삐뚤삐뚤한 글씨: 「이것을 찾아온 이에게」.`],
        ]);
      }
      return say(addStats(n, { wil: 3 }), [['나레이션', '돌함은 비어 있었다. 그래도 약속은 지켰다. (정신 +3)']]);
    },
  },
  {
    key: 'echo_treasure_map',
    kind: 'ECHO',
    label: () => '지도의 붉은 점',
    build: () => ({
      title: '지도의 붉은 점',
      category: 'LIFE',
      narration: '장터에서 산 낡은 지도. 산줄기와 물길이 꼭 맞아떨어진다. 붉은 점은 바로 저 바위 아래다.',
      script: [N('장터에서 산 낡은 지도의 산줄기가 눈앞의 풍경과 꼭 맞아떨어진다.'), N('붉은 점이 가리키는 바위 아래, 흙이 묘하게 무르다.')],
      options: [
        { id: 'dig', label: '파 본다 (2일)' },
        { id: 'leave', label: '그만둔다' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'treasure_map');
      let n = t.state;
      if (opt !== 'dig' || !t.echo) return n;
      n = spendDays(n, 2);
      if (!t.echo.data?.real) {
        n = echoMilestone(n, t.echo, '지도의 자리를 파 보았으나 빈 항아리뿐이었다');
        return say(n, [['나레이션', '이틀을 팠다. 나온 건 깨진 항아리와… 「속았지?」라고 적힌 쪽지.']]);
      }
      if (chance(0.5)) {
        const w = giveWeapon(n, rand(['wp_bl_11', 'wp_pl_07', 'wp_un_05', 'wp_th_05']));
        if (w.name) {
          n = echoMilestone(w.state, t.echo, `지도의 자리에서 「${w.name}」을(를) 파냈다`);
          return say(highlight(n, `보물 지도의 자리에서 「${w.name}」을(를) 찾았다`), [['나레이션', `흙 속에서 기름 먹인 천에 싸인 병기가 나왔다. 「${w.name}」!`]]);
        }
      }
      const id = pickBook(n, (b) => b.rarity === 'LEGEND');
      if (id) {
        const g = giveBook(n, id, 25);
        n = echoMilestone(g.state, t.echo, `지도의 자리에서 ${josa(g.title || '', '을를')} 파냈다`);
        return say(highlight(n, `보물 지도의 자리에서 ${josa(g.title || '', '을를')} 찾았다`), [['나레이션', `돌함 속 비단 보자기. ${g.title}!`]]);
      }
      return say(addMoney(n, 200), [['나레이션', `은괴가 든 항아리! (+200${cur(n)})`]]);
    },
  },

  // ───────── 도장으로 돌아오는 메아리 (HOME) ─────────
  {
    key: 'echo_beggar_king',
    kind: 'ECHO_HOME',
    build: (s) => ({
      title: '거지 왕초의 방문',
      category: 'LIFE',
      narration: '누더기를 걸친 사내 셋이 도장 대문 앞에 엎드린다. 가운데 사내가 고개를 든다. 그 맑은 눈.',
      script: [
        N('누더기 차림의 사내들이 도장 대문 앞에 줄지어 엎드렸다. 가운데 사내가 고개를 든다.'),
        P('거지 왕초', `나리, 기억 못 하시겠지요. 그때 길가에서 주먹밥을 얻어먹은 놈입니다요. 이제 이 고을 거지들은 다 제 말을 듣습니다요.`, '씩 웃으며'),
        P('거지 왕초', '거지 눈과 귀는 어디에나 있지요. 앞으로 도장에 해코지하려는 놈들이 있으면, 저희가 먼저 알려 드리겠습니다요.'),
      ],
      options: [
        { id: 'feast', label: `잔칫상을 차려 대접한다 (30${cur(s)})`, disabled: s.money < 30, disabledReason: '돈이 부족하다' },
        { id: 'thank', label: '고맙다고 인사만 한다' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'beggar_king');
      let n = remember(t.state, 'beggar', 'KING');
      n = addRep(n, { virtue: 8 });
      if (opt === 'feast') {
        n = addMoney(n, -30);
        if (hasRoom(n)) {
          const a = addDisciple(n, { archetype: '거지 왕초가 맡긴 아이', temperament: 'DILIGENT' });
          n = a.state;
        }
      } else {
        n = addMoney(n, 60);
      }
      if (t.echo) n = echoMilestone(n, t.echo, '거지 왕초가 도장의 눈과 귀가 되었다');
      return say(n, [
        ['거지 왕초', opt === 'feast' ? '이 아이, 제가 거둔 놈인데 칼에 소질이 있습니다요. 나리께 맡기겠습니다요.' : '받으십쇼. 장터 외상값 떼먹던 놈들 것을 저희가 받아 왔습니다요.'],
        ['나레이션', opt === 'feast' ? '거지 왕초가 맡긴 아이가 문하생이 되었다. 이제 고을의 소문이 도장으로 먼저 흘러든다.' : `외상값 60${cur(n)}을 받았다. 이제 고을의 소문이 도장으로 먼저 흘러든다.`],
      ]);
    },
  },
  {
    key: 'echo_scholar_official',
    kind: 'ECHO_HOME',
    build: (s) => ({
      title: '관복을 입은 옛 서생',
      category: 'HISTORICAL',
      narration: '가마 한 채가 도장 앞에 멈춘다. 관복을 입은 사내가 내려 대문 앞에서 절을 한다.',
      script: [
        N('가마 한 채가 도장 앞에 멈췄다. 관복 차림의 사내가 내리더니, 대문 앞에서 큰절을 올린다.'),
        P('옛 서생', `기억하십니까. 그날 숲에서 쫓기던 서생입니다. 이제는 ${byCountry(s, '홍문관', '한림원', '번의 가로')}에서 일합니다.`, '눈시울을 붉히며'),
        P('옛 서생', '그날의 은혜, 무엇으로 갚으면 되겠습니까?'),
      ],
      options: [
        { id: 'court', label: '조정에 도장의 이름을 올려 달라 한다', hint: '조정 후원' },
        { id: 'money', label: '도장 살림이 어렵다고 털어놓는다', hint: `150${cur(s)}` },
        { id: 'decline', label: '그저 잘 살아 주어 고맙다고 한다', hint: '인덕·구도' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'scholar_official');
      let n = t.state;
      let result = '';
      if (opt === 'court') {
        n = { ...addFame(n, 50), flags: { ...n.flags, royalAlliance: true } };
        result = '조정이 도장을 후원하게 되었다';
      } else if (opt === 'money') {
        n = addMoney(n, 150);
        result = `도장 살림에 ${150}${cur(n)}이 보태졌다`;
      } else {
        n = addRep(n, { virtue: 20, ascetic: 10 });
        result = '서로 아무것도 주고받지 않고 술 한 잔만 나눴다';
      }
      if (t.echo) n = echoMilestone(n, t.echo, result);
      return say(n, [['나레이션', `${result}. 가마가 떠난 뒤에도 그 서생의 젊은 얼굴이 떠올랐다.`]]);
    },
  },
  {
    key: 'echo_prodigy_rival',
    kind: 'ECHO_HOME',
    build: (s) => {
      const echo = (s.flags.echoes || []).find((e) => e.key === 'prodigy_rival');
      const name = (echo?.data?.name as string) || '이름 모를 검객';
      return {
        title: `개울가의 아이 — ${name}`,
        category: 'RIVAL',
        sceneActor: 'RIVAL',
        narration: `한 검객이 도장 마당으로 들어선다. 칼끝이 한 번도 흔들리지 않는다. 어디선가 본 적이 있다.`,
        script: [
          N('검객 하나가 도장 마당으로 걸어 들어온다. 칼을 뽑아 드는데, 칼끝이 한 치도 흔들리지 않는다.'),
          P(name, '기억하시오? 개울가에서 나뭇가지를 휘두르던 아이. 팔꿈치를 붙이라 했지. 그 한마디로 여기까지 왔소.', '담담하게'),
          P(name, '그날 날 데려가지 않은 걸 후회하게 해 드리겠소. 한 합 청하오.', '칼을 들며', 'ANGRY'),
        ],
        options: [
          { id: 'duel', label: '받아 준다', hint: '비무 · 혼자 자란 천재' },
          { id: 'refuse', label: '거절한다', hint: '명성 -20' },
        ],
        meta: { name },
      };
    },
    resolve: (s, opt, c) => {
      if (opt === 'refuse') {
        const t = takeEcho(s, 'prodigy_rival');
        let n = addFame(t.state, -20);
        if (t.echo) n = echoMilestone(n, t.echo, `혼자 자란 검객 ${c.data?.name || ''}의 도전을 피했다`);
        return say(n, [[String(c.data?.name || '검객'), '…그때처럼 등을 보이시는군.']]);
      }
      return journeyBattle(s, c, opt, {
        title: `${c.data?.name || '검객'}의 도전`,
        subtitle: '개울가에서 혼자 자란 천재',
        name: String(c.data?.name || '검객'),
        enemyTitle: '혼자 자란 천재 검객',
        age: 25,
        ai: 'DUELIST',
        scale: roadScale(s, 1.25),
        weapon: 'BLADE',
        skills: byCountry(s, ['sk_kr_06', 'sk_kr_02', 'sk_jp_03', 'base_h_slash'], ['sk_cn_05', 'sk_cn_03', 'sk_jp_03', 'base_h_slash'], ['sk_jp_01', 'sk_jp_03', 'sk_jp_06', 'base_h_slash']),
        rewardFame: 50,
      });
    },
    onBattle: (s, _opt, won, c) => {
      const t = takeEcho(s, 'prodigy_rival');
      let n = t.state;
      const name = String(c.data?.name || '검객');
      if (won) {
        if (hasRoom(n)) {
          const a = addDisciple(n, { name, isGenius: true, archetype: '개울가에서 혼자 자란 천재', temperament: 'UPRIGHT' }, (d) => ({
            ...d,
            age: 25,
            isChild: false,
            stats: { str: 48, agi: 55, vit: 42, wil: 40, ins: 52, qi: 30 },
          }));
          n = a.state;
        }
        if (t.echo) n = echoMilestone(n, t.echo, `혼자 자란 천재 ${josa(name, '이가')} 찾아와 겨룬 끝에 제자가 되었다`);
        return say(n, [[name, '…졌소. 그날 배우지 못한 것을, 이제라도 배우게 해 주시오.'], ['나레이션', `${josa(name, '이가')} 무릎을 꿇었다. 혼자 자란 천재가 문하에 들었다.`]]);
      }
      if (t.echo) n = echoMilestone(n, t.echo, `혼자 자란 천재 ${name}에게 패했다`);
      return say(addFame(n, -30), [[name, '그날 나를 데려갔다면, 이 칼은 당신 것이었을 거요.'], ['나레이션', '그는 뒤돌아보지 않고 떠났다. 대문 밖으로 그때처럼 나뭇가지 소리가 오래 따라왔다.']]);
    },
  },
  {
    key: 'echo_bandit_spared',
    kind: 'ECHO_HOME',
    build: (s) => {
      const echo = (s.flags.echoes || []).find((e) => e.key === 'bandit_spared');
      const name = (echo?.data?.name as string) || '옛 산채 두목';
      const good = s.fame >= 400 || s.reputation.virtue >= 40;
      return {
        title: good ? `의적이 된 ${name}` : `${name}의 귀환`,
        category: good ? 'LIFE' : 'DUEL',
        sceneActor: good ? 'RIVAL' : 'ENEMY',
        narration: good ? '수레 가득 쌀가마를 실은 사내들이 도장 앞에 섰다.' : '밤중에 횃불이 도장 담장을 둘러쌌다.',
        script: good
          ? [N('쌀가마를 실은 수레가 도장 앞에 섰다. 맨 앞의 사내 얼굴에 낯익은 칼자국.'), P(name, '살려 두면 내가 어떤 놈이 될지 궁금하다 했지? 이렇게 됐소. 탐관오리 곳간만 털지.', '씩 웃으며'), P(name, '이건 그날 목숨값이오. 그리고 앞으로 이 도장 근처엔 도적 하나 얼씬 못 하게 하겠소.')]
          : [N('밤중에 횃불이 도장 담장을 둘러쌌다. 낯익은 목소리가 대문 너머에서 외친다.'), P(name, '그날 날 살려 보낸 게 실수였다! 네 도장 곳간을 털어 가마!', '횃불을 치켜들며', 'ANGRY')],
        options: good
          ? [{ id: 'accept', label: '쌀을 받는다' }, { id: 'refuse', label: '도적질한 쌀은 받지 않는다', hint: '구도' }]
          : [{ id: 'defend', label: '문을 열고 나간다', hint: '비무' }, { id: 'pay', label: `재물을 내준다 (100${cur(s)})` }],
        meta: { name, good: good ? 1 : 0 },
      };
    },
    resolve: (s, opt, c) => {
      const name = String(c.data?.name || '옛 산채 두목');
      if (opt === 'defend') {
        return journeyBattle(s, c, opt, {
          title: `${name}의 습격`,
          subtitle: '살려 보낸 자가 돌아왔다',
          name,
          enemyTitle: '산채 두목',
          age: 48,
          ai: 'HEAVY',
          scale: roadScale(s, 1.05),
          weapon: 'BLADE',
          skills: ['sk_kr_06', 'sk_cn_06', 'base_v_slash'],
          rewardMoney: 50,
          rewardFame: 30,
        });
      }
      const t = takeEcho(s, 'bandit_spared');
      let n = t.state;
      let result = '';
      if (opt === 'accept') {
        n = addMoney(addRep(n, { virtue: 5 }), 90);
        result = `살려 보낸 ${josa(name, '이가')} 의적이 되어 쌀가마를 보내왔다`;
      } else if (opt === 'refuse') {
        n = addRep(n, { ascetic: 10 });
        result = `의적이 된 ${name}의 쌀을 돌려보냈다`;
      } else {
        n = addMoney(n, -100);
        result = `살려 보낸 ${josa(name, '이가')} 패거리를 이끌고 돌아와 재물을 빼앗아 갔다`;
      }
      if (t.echo) n = echoMilestone(n, t.echo, result);
      return say(n, [['나레이션', `${result}.`]]);
    },
    onBattle: (s, _opt, won, c) => {
      const t = takeEcho(s, 'bandit_spared');
      let n = t.state;
      const name = String(c.data?.name || '옛 산채 두목');
      const result = won ? `돌아온 ${josa(name, '을를')} 다시 꺾었다` : `돌아온 ${name}에게 곳간을 털렸다`;
      if (!won) n = addMoney(n, -120);
      if (t.echo) n = echoMilestone(n, t.echo, result);
      return say(n, [['나레이션', `${result}.`]]);
    },
  },
  {
    key: 'echo_bandit_son',
    kind: 'ECHO_HOME',
    build: (s) => {
      const echo = (s.flags.echoes || []).find((e) => e.key === 'bandit_son');
      const father = (echo?.data?.father as string) || '산채 두목';
      return {
        title: '원수의 아들',
        category: 'DUEL',
        sceneActor: 'ENEMY',
        narration: '스무 살 남짓한 청년이 도장 마당 한가운데 칼을 꽂고 무릎을 꿇었다.',
        script: [
          N('스무 살 남짓한 청년이 마당 한가운데 칼을 꽂고 무릎을 꿇었다.'),
          P('청년', `${echo?.bornYear || '그해'}년, 산채에서 당신이 벤 ${father}. 내 아버지요. 그날 나는 문틈으로 보고 있었소.`, '고개를 들며', 'ANGRY'),
          P('청년', '진검으로 겨뤄 주시오. 그것 말고는 바라는 게 없소.'),
        ],
        options: [
          { id: 'accept', label: '진검을 받아 준다', hint: '⚠ 진검결투' },
          { id: 'kneel', label: '그의 앞에 무릎을 꿇는다', hint: '명성 -15, 인덕 +20' },
          { id: 'refuse', label: '돌려보낸다', hint: '명성 -10 · 언젠가 다시 올 것이다' },
        ],
        meta: { father },
      };
    },
    resolve: (s, opt, c) => {
      if (opt === 'accept') {
        return journeyBattle(s, c, opt, {
          title: '원수의 아들',
          subtitle: '아버지의 원수를 찾아온 청년',
          name: '원수의 아들',
          enemyTitle: `${c.data?.father || '산채 두목'}의 아들`,
          age: 21,
          ai: 'RUSHDOWN',
          scale: roadScale(s, 1.1),
          weapon: 'BLADE',
          skills: ['sk_kr_06', 'sk_jp_03', 'base_h_slash', 'sk_cn_05'],
          realDuel: true,
          rewardFame: 20,
        });
      }
      if (opt === 'kneel') {
        const t = takeEcho(s, 'bandit_son');
        let n = addRep(addFame(t.state, -15), { virtue: 20 });
        if (t.echo) n = echoMilestone(n, t.echo, '그 아들이 찾아왔고, 그 앞에 무릎을 꿇었다');
        return say(n, [['청년', '…이러면 내가 칼을 뽑을 수가 없잖소.'], ['나레이션', '청년은 칼을 뽑아 들고 한참을 서 있다가, 그대로 돌아섰다.']]);
      }
      // 돌려보내면 몇 해 뒤 다시 온다
      const t = takeEcho(s, 'bandit_son');
      let n = addFame(t.state, -10);
      if (t.echo) {
        n = { ...n, flags: { ...n.flags, journeyDone: (n.flags.journeyDone || []).filter((k) => k !== 'echoed_bandit_son') } };
        n = addEcho(n, { key: 'bandit_son', minYears: 3, maxYears: 6, channel: 'HOME', bornText: t.echo.bornText, data: t.echo.data });
      }
      return say(n, [['청년', '다시 오겠소. 당신이 칼을 들 수 있을 때까지.']]);
    },
    onBattle: (s, _opt, won) => {
      const t = takeEcho(s, 'bandit_son');
      let n = t.state;
      if (t.echo) n = echoMilestone(n, t.echo, won ? '그 아들이 진검을 들고 찾아왔고, 그마저 베었다' : '그 아들의 진검에 쓰러졌다');
      return won ? addRep(n, { ruthless: 10 }) : n;
    },
  },
  {
    key: 'echo_wounded_leader',
    kind: 'ECHO_HOME',
    build: () => ({
      title: '문파의 장문인이 된 검객',
      category: 'LIFE',
      sceneActor: 'RIVAL',
      narration: '깃발을 든 제자들을 거느린 장문인이 도장을 찾아왔다. 옆구리에 오래된 흉터가 있다.',
      script: [
        N('문파 깃발을 든 제자들이 대문 앞에 늘어섰다. 장문인이 앞으로 나와 포권한다.'),
        P('장문인', '그날 길가에서 내 상처를 꿰매 준 분. 사문의 배신자를 처단하고 이제 문파를 이끌고 있소. 약속대로 사문의 이름으로 빚을 갚으러 왔소.', '옆구리를 짚으며'),
      ],
      options: [{ id: 'ally', label: '손을 맞잡는다' }],
    }),
    resolve: (s) => {
      const t = takeEcho(s, 'wounded_leader');
      let n = addFame(t.state, 30);
      const target = [...getSects(n)].filter((x) => x.kind !== 'RIVAL').sort((a, b) => b.relation - a.relation)[0];
      let result = '그가 이끄는 문파가 도장의 벗이 되었다';
      if (target) {
        n = adjustRelation(n, target.id, 35, '옛 은혜를 갚으러 장문인이 직접 찾아왔다');
        n = { ...n, sects: getSects(n).map((x) => (x.id === target.id ? { ...x, met: true } : x)) };
        result = `그가 이끄는 ${josa(target.name, '이가')} 도장의 벗이 되었다`;
      }
      if (t.echo) n = echoMilestone(n, t.echo, result);
      return say(n, [['나레이션', `${result}. (명성 +30)`]]);
    },
  },
  {
    key: 'echo_herbalist_doctor',
    kind: 'ECHO_HOME',
    build: () => ({
      title: '명의가 된 약초꾼',
      category: 'LIFE',
      narration: '약상자를 멘 의원이 도장을 찾아왔다. 손목에 밧줄 자국 같은 흉터가 있다.',
      script: [
        N('약상자를 멘 의원 하나가 도장을 찾아왔다. 손목에 밧줄에 쓸린 흉터가 있다.'),
        P('의원', '절벽에 매달렸던 그 약초꾼이오. 의술로 갚겠다 했지요. 맥 좀 짚어 봅시다.', '소매를 걷으며'),
      ],
      options: [{ id: 'heal', label: '맥을 맡긴다' }],
    }),
    resolve: (s) => {
      const t = takeEcho(s, 'herbalist_doctor');
      let n = addHealth({ ...t.state, statuses: [], maxLifespanPenalty: Math.max(0, t.state.maxLifespanPenalty - 1) }, 30);
      if (t.echo) n = echoMilestone(n, t.echo, '그 약초꾼이 명의가 되어 찾아와 병을 고쳐 주었다');
      return say(n, [['의원', '쌓인 내상이 많구려. 이 침과 탕약이면 몇 해는 더 사실 거요.'], ['나레이션', '모든 병과 상처가 씻은 듯 나았다. (건강 +30, 잃은 수명 1년 회복)']]);
    },
  },
  {
    key: 'echo_wanderer_friend',
    kind: 'ECHO_HOME',
    build: () => ({
      title: '옛 길동무',
      category: 'RIVAL',
      sceneActor: 'RIVAL',
      narration: '닳은 칼집의 검객이 술병을 들고 대문을 두드린다.',
      script: [
        N('닳은 칼집을 찬 검객이 술병을 흔들며 대문을 두드린다. 모닥불가에서 밤을 새웠던 그 사람이다.'),
        P('옛 길동무', '약속대로 왔소! 내 칼이 드디어 완성됐지. 보여 주고, 술 한잔하고… 그리고 부탁이 하나 있소.', '활짝 웃으며'),
        P('옛 길동무', '떠도는 것도 이제 지쳤소. 당신 도장에서 사범 노릇 좀 하게 해 주겠소?'),
      ],
      options: [
        { id: 'hire', label: '사범으로 맞아들인다', hint: '실력 있는 사범 문하생' },
        { id: 'gift', label: '술만 나누고 보낸다', hint: '그가 칼 한 자루를 두고 간다' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'wanderer_friend');
      let n = t.state;
      let result = '';
      if (opt === 'hire' && hasRoom(n)) {
        const a = addDisciple(n, { archetype: '떠돌이 검객', temperament: 'UPRIGHT' }, (d) => ({
          ...d,
          age: Math.max(30, s.age),
          isChild: false,
          role: 'INSTRUCTOR',
          loyalty: 85,
          stats: { str: 55, agi: 55, vit: 50, wil: 45, ins: 50, qi: 30 },
        }));
        n = a.state;
        result = `옛 길동무 ${josa(a.name, '이가')} 도장의 사범이 되었다`;
      } else {
        const w = giveWeapon(n, rand(['wp_bl_07', 'wp_bl_09', 'wp_bl_10']));
        n = w.state;
        result = w.name ? `옛 길동무가 「${w.name}」을(를) 두고 떠났다` : '옛 길동무와 밤새 술을 마셨다';
      }
      if (t.echo) n = echoMilestone(n, t.echo, result);
      return say(n, [['나레이션', `${result}.`]]);
    },
  },
];
