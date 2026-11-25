import { josa } from '../../utils/korean';
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
  giveBook,
  giveWeapon,
  H,
  highlight,
  journeyBattle,
  N,
  P,
  pickBook,
  pickFresh,
  rand,
  roadScale,
  say,
  spendDays,
  trainEquipped,
} from '../../engine/journeyCore';
import type { FreshVariant, JCtx, JourneyEventBody, JourneyEventDef, JourneyTrigger } from '../../engine/journeyCore';
import { rumorsFor } from '../journeyRegions';

// 길 위의 새 인연과 장소 — 무사수행을 스무 번 떠나도 길마다 다른 얼굴을 만나게.
// 사건 하나에 장면(변주) 여럿을 두고, pickFresh로 이번 생에 덜 본 장면을 고른다.
// 고른 장면의 id는 meta.vkey로 남고, 사건이 끝나면 엔진이 「언제 봤는지」를 적어 둔다.
// 장소 표지(label)는 장면을 고르기 전에 지도에 뜨므로, 어느 장면이 나와도 어울리는 이름을 쓴다.

// ───────── 장면 틀 ─────────
type Scene = FreshVariant & {
  build: (s: GameState, c: JCtx) => JourneyEventBody;
  resolve: (s: GameState, opt: string, c: JCtx) => GameState;
  onBattle?: (s: GameState, opt: string, won: boolean, c: JCtx) => GameState;
};

function sceneEvent(d: {
  key: string;
  kind: 'PEOPLE' | 'TREASURE';
  label: (s: GameState) => string;
  once?: boolean;
  weight?: number;
  trigger?: JourneyTrigger;
  scenes: Scene[];
}): JourneyEventDef {
  const find = (c: JCtx) => d.scenes.find((x) => x.id === String(c.data?.vkey ?? '')) || d.scenes[0];
  return {
    key: d.key,
    kind: d.kind,
    label: (s) => d.label(s),
    once: d.once,
    weight: d.weight,
    trigger: d.trigger,
    build: (s, c) => {
      const v = pickFresh(s, d.key, d.scenes);
      const body = v.build(s, c);
      return { ...body, meta: { ...(body.meta || {}), vkey: v.id } };
    },
    resolve: (s, opt, c) => find(c).resolve(s, opt, c),
    onBattle: (s, opt, won, c) => {
      const v = find(c);
      return v.onBattle ? v.onBattle(s, opt, won, c) : s;
    },
  };
}

// ───────── 공용 도구 ─────────
const clampP = (p: number) => Math.max(0.05, Math.min(0.95, p));
const pct = (p: number) => `${Math.round(clampP(p) * 100)}%`;
const LOW = '노자가 부족하다';
const costly = (s: GameState, n: number) => ({ disabled: s.money < n, disabledReason: LOW });

// 길에서 만난 이가 주인공을 부르는 말 — 나이·성별·나라에 맞게
const sir = (s: GameState): string =>
  s.age >= 58
    ? byCountry(s, '어르신', '노선배', '어르신')
    : s.gender === 'FEMALE'
    ? byCountry(s, s.age < 30 ? '아씨' : '마님', '여협', '무사님')
    : byCountry(s, '나리', '대협', '무사님');

const injure = (s: GameState, label: string): GameState => ({
  ...s,
  statuses: [...s.statuses.filter((x) => x.id !== 'LIGHT_INJURY'), { id: 'LIGHT_INJURY' as const, label, turnsRemaining: 2 }],
});

// 이 나라에서 흔히 도는 비급 가운데 아직 없는 것 (rareOnly면 귀한 것만)
const localBook = (s: GameState, rareOnly = false) =>
  pickBook(s, (b) => b.countryBias === s.country && (rareOnly ? b.rarity === 'RARE' : b.rarity === 'COMMON' || b.rarity === 'RARE'));
// 그 나라 군영·무가에서 흔히 쓰던 칼
const oldBlade = (s: GameState) => byCountry(s, 'wp_bl_04', 'wp_bl_05', 'wp_bl_06');
const brew = (s: GameState) => byCountry(s, '막걸리', '황주(黃酒)', '탁주');
const zeni = (s: GameState) => byCountry(s, '엽전', '동전', '동전');

const bladeSkills = (s: GameState) => byCountry(s, ['base_h_slash', 'sk_kr_01', 'sk_kr_02'], ['base_h_slash', 'sk_cn_01', 'sk_cn_02'], ['base_h_slash', 'sk_jp_03', 'sk_jp_01']);
const clubSkills = (s: GameState) => byCountry(s, ['sk_kr_07', 'base_v_slash', 'sk_kr_03'], ['sk_cn_06', 'sk_cn_02', 'base_h_slash'], ['sk_jp_05', 'base_v_slash', 'sk_jp_01']);
const spearSkills = (s: GameState) => byCountry(s, ['sk_kr_05', 'sk_kr_07', 'sk_kr_03'], ['sk_cn_06', 'sk_cn_04', 'sk_cn_03'], ['sk_jp_05', 'sk_jp_01', 'base_v_slash']);
const fistSkills = (s: GameState) => byCountry(s, ['sk_kr_04', 'sk_kr_03', 'sk_cn_01'], ['sk_cn_01', 'sk_cn_05', 'sk_cn_02'], ['sk_jp_04', 'sk_we_04', 'sk_cn_01']);
const swordSkills = (s: GameState) => byCountry(s, ['sk_kr_06', 'sk_kr_02', 'base_v_slash'], ['sk_cn_04', 'sk_cn_05', 'base_h_slash'], ['sk_jp_03', 'sk_jp_06', 'sk_jp_01']);

// ═════════════════════════ 길 위의 사람들 ═════════════════════════

// ───────── 1. 나루터 ─────────
const ferryman = (s: GameState) => byCountry(s, '뱃사공 영감', '늙은 사공 영감', '센도(船頭) 영감');
const ferry = sceneEvent({
  key: 'r_ferry',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '나루터', '나루', '와타시바(渡し場)'),
  trigger: { terrain: ['RIVER', 'COAST', 'TOWN', 'ROAD'] },
  scenes: [
    {
      id: 'flood',
      build: (s) => {
        const scene = '사흘 내린 비에 강물이 누렇게 불었다. 나룻배는 말뚝에 묶여 있고, 건너편으로 가려는 장꾼들이 발만 구른다.';
        return {
          title: '물이 불은 나루',
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(ferryman(s), '이 물에 배 띄우면 물귀신 밥 되오. 물 빠질 때까지 기다리시오. 정 급하면… 웃돈이라도 얹든가.', '담뱃대를 털며'),
            P('장꾼', '모레가 장날인데 큰일이네, 큰일이야…', '발을 동동 구르며'),
          ],
          options: [
            { id: 'wait', label: '물이 빠질 때까지 기다린다 (2일)', hint: '건강 +6' },
            { id: 'pay', label: `웃돈을 얹어 배를 띄우게 한다 (20${cur(s)})`, hint: '배가 크게 흔들릴 것이다', ...costly(s, 20) },
            { id: 'row', label: '사공 대신 노를 잡는다', hint: `근력 판정 약 ${pct(0.3 + s.stats.str * 0.006)} · 인덕 +4` },
            { id: 'seize', label: '사공의 멱살을 잡고 당장 배를 띄우라 윽박지른다', hint: '살기 +4' },
            { id: 'leave', label: '건너기를 그만두고 지나친다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'wait') return say(addHealth(spendDays(s, 2), 6), [['나레이션', `${byCountry(s, '나루 주막 툇마루', '나루 객잔 처마 밑', '나루 찻집 평상')}에서 이틀을 쉬었다. 사흘째 아침, 물빛이 맑아졌다. (건강 +6)`]]);
        if (opt === 'pay') {
          const n = addMoney(s, -20);
          if (!chance(0.4)) return say(n, [['나레이션', '사공은 웃돈만큼 힘껏 노를 저었다. 흙탕물을 가르며 무사히 건넜다.']]);
          if (chance(clampP(0.35 + s.stats.agi * 0.006))) {
            return say(highlight(addFame(addRep(n, { virtue: 4 }), 6), '불어난 강에서 물에 빠진 아이를 건졌다'), [
              ['나레이션', '강 한가운데서 배가 기우뚱했다. 아이 하나가 물에 빠졌다!'],
              ['나레이션', '뱃전에 몸을 걸고 아이의 뒷덜미를 낚아챘다. 장꾼들이 손뼉을 쳤다. (인덕 +4, 명성 +6)'],
            ]);
          }
          return say(addHealth(addRep(n, { virtue: 4 }), -6), [
            ['나레이션', '강 한가운데서 배가 기우뚱했다. 아이 하나가 물에 빠졌다!'],
            ['나레이션', '흙탕물에 뛰어들어 아이를 건져 냈다. 물을 한 사발은 마셨다. (인덕 +4, 건강 -6)'],
          ]);
        }
        if (opt === 'row') {
          if (chance(clampP(0.3 + s.stats.str * 0.006))) {
            return say(addFame(addRep(addStats(s, { str: 1 }), { virtue: 4 }), 4), [
              ['나레이션', '노를 잡고 물살을 비스듬히 갈랐다. 사공이 혀를 내둘렀다.'],
              [ferryman(s), '허, 칼만 쓰는 분인 줄 알았더니! 뱃삯은 됐소.'],
              ['나레이션', '(근력 +1, 인덕 +4, 명성 +4)'],
            ]);
          }
          return say(addRep(addHealth(spendDays(s, 1), -8), { virtue: 2 }), [
            ['나레이션', '물살에 떠밀려 한참 아래 모래톱에 배를 댔다. 다친 사람은 없었지만, 하루를 걸어 되돌아와야 했다. (건강 -8, 인덕 +2)'],
          ]);
        }
        if (opt === 'seize') {
          return say(addRep(s, { ruthless: 4 }), [
            [ferryman(s), '…알았소, 알았으니 이 손 좀 놓으시오! 물귀신이 되거든 당신 탓이오!'],
            ['나레이션', '사공이 사색이 되어 노를 잡았다. 흙탕물 한가운데서 배가 몇 번이고 기우뚱했지만 끝내 건넜다. 뭍에 내리자 장꾼들이 멀찍이 비켜섰다. (살기 +4)'],
          ]);
        }
        return s;
      },
    },
    {
      id: 'toll',
      build: (s) => {
        const scene = '나루 어귀에 몽둥이를 든 왈패들이 진을 치고 뱃삯을 세 배로 받는다. 늙은 사공은 말 한마디 못 하고 고개만 숙이고 있다.';
        return {
          title: '나루를 막은 왈패들',
          category: 'DUEL',
          sceneActor: 'ENEMY',
          narration: scene,
          script: [
            N(scene),
            P('나루 왈패 두목', `여기 나루는 우리가 지켜. 지켜 주는 값이 뱃삯에 붙는 게지. 칼 찼다고 다를 거 없소, ${sir(s)}.`, '몽둥이로 손바닥을 치며', 'ANGRY'),
            P(ferryman(s), '…그냥 내시오. 저것들한테 대들었다간 밤에 배에 불이 나오.', '목소리를 낮추며'),
          ],
          options: [
            { id: 'fight', label: '두목에게 몽둥이를 내려놓으라 한다', hint: '진검승부 · 이기면 인덕 +5' },
            { id: 'shame', label: '도장의 이름을 대며 꾸짖는다', hint: `명성 판정 약 ${pct(0.2 + s.fame * 0.0008)}` },
            { id: 'pay', label: `세 배 뱃삯을 낸다 (15${cur(s)})`, ...costly(s, 15) },
            { id: 'cut', label: '두목에게 「앞으로 내 몫도 떼어 두라」 을러댄다', hint: '노자 +15 · 살기 +5 · 인덕 -2' },
            { id: 'ford', label: '상류의 얕은 여울까지 돌아간다 (2일)' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'fight') {
          return journeyBattle(s, c, opt, {
            stakes: 'MERCY',
            title: '나루터의 왈패 두목',
            subtitle: '나루를 차지한 자들',
            name: '나루 왈패 두목',
            enemyTitle: '나루터 무뢰배',
            age: 33,
            ai: 'AGGRESSIVE',
            scale: roadScale(s, 0.8),
            weapon: 'POLEARM',
            skills: clubSkills(s),
            rewardMoney: 20,
            rewardFame: 10,
          });
        }
        if (opt === 'shame') {
          if (chance(clampP(0.2 + s.fame * 0.0008))) {
            return say(addRep(addFame(s, 4), { virtue: 3 }), [
              ['나레이션', `「${s.sectName}」의 이름을 대자 두목의 낯빛이 변했다. 왈패들이 슬금슬금 몽둥이를 거두었다. (명성 +4, 인덕 +3)`],
            ]);
          }
          const paid = Math.min(15, s.money);
          return say(addMoney(addFame(s, -3), -paid), [
            ['나레이션', `두목이 코웃음을 쳤다. 「그런 도장 처음 듣소.」 결국 뱃삯을 세 배로 냈다. (명성 -3, 노자 -${paid})`],
          ]);
        }
        if (opt === 'cut') {
          return say(addRep(addMoney(s, 15), { ruthless: 5, virtue: -2 }), [
            ['나루 왈패 두목', '…허, 칼잡이가 셈도 할 줄 아는구려. 받으시오.'],
            ['나레이션', `두목이 칼자루에 얹힌 손을 흘끗 보더니 ${zeni(s)} 꾸러미를 던졌다. 늙은 사공은 끝내 고개를 들지 않았다. (노자 +15, 살기 +5, 인덕 -2)`],
          ]);
        }
        if (opt === 'pay') return say(addMoney(s, -15), [['나레이션', '뱃삯을 세 배로 냈다. 왈패들이 낄낄거렸다. 사공은 끝내 눈을 마주치지 못했다.']]);
        if (opt === 'ford') return say(spendDays(s, 2), [['나레이션', '왈패들을 등지고 상류로 거슬러 올라가, 바짓가랑이를 걷고 여울을 건넜다. 이틀이 걸렸다.']]);
        return s;
      },
      onBattle: (s, _opt, won) => {
        if (!won) return say(s, [['나레이션', '몽둥이가 정강이를 후려쳤다. 왈패들의 웃음소리를 뒤로하고 물러났다.']]);
        return say(highlight(addRep(s, { virtue: 5 }), '나루를 차지한 왈패들을 쫓아냈다'), [
          ['나레이션', '두목의 몽둥이가 강물에 떨어졌다. 왈패들이 흩어지자 장꾼들이 환호했다.'],
          [ferryman(s), '허허… 오늘은 뱃삯 안 받겠소. 아니, 앞으로도 안 받겠소!'],
          ['나레이션', '(인덕 +5)'],
        ]);
      },
    },
    {
      id: 'old_boatman',
      build: (s) => {
        const scene = '물살이 잔잔한 저녁 나루. 백발의 사공이 노를 저으며 묻지도 않은 옛이야기를 꺼낸다.';
        return {
          title: '노사공의 옛이야기',
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(ferryman(s), '삼십 년 전에도 칼 찬 손님을 건네준 적이 있지. 배가 한가운데 왔을 때 그 양반이 칼을 뽑아 물을 한 번 그었는데… 물이 갈라진 채로 한참 안 붙더라니까.', '노를 저으며'),
            H(s, '물이… 갈라진 채로 있었다고요?', '귀를 기울이며'),
          ],
          options: [
            { id: 'listen', label: '이야기를 끝까지 듣는다', hint: '깨달음 · 통찰 +1' },
            { id: 'ask', label: `그 검객이 어디로 갔는지 묻는다 (술값 5${cur(s)})`, hint: '길 앞에 무언가 남아 있을지도', ...costly(s, 5) },
            { id: 'leave', label: '웃어넘기고 강 건너를 바라본다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'listen') {
          const g = gainInsight(addStats(s, { ins: 1 }), 6, '나룻배 위');
          return say(g.state, [
            [ferryman(s), '그 양반 말이, 물을 베는 게 아니라 물이 비켜서게 하는 거라더군. 무슨 소린지 원.'],
            ['나레이션', `뱃전에 앉아 물살을 오래 바라보았다. (통찰 +1) ${g.text}`],
          ]);
        }
        if (opt === 'ask') {
          const before = s.journey?.pois.length || 0;
          const n = addPoiAhead(addMoney(s, -5), 'TREASURE', 'tr_stele', '사공이 일러 준 비석');
          if ((n.journey?.pois.length || 0) > before) {
            return say(n, [
              [ferryman(s), '건너편 언덕 너머에 이끼 낀 비석이 하나 있소. 그 양반이 거기다 뭘 새기고 갔다는 말이 있지.'],
              ['나레이션', '이 근방에 「사공이 일러 준 비석」이 생겼다.'],
            ]);
          }
          return say(n, [
            [ferryman(s), '그 양반이 묵었다는 언덕 말이오? 거긴 당신이 방금 지나온 길이오. 허허.'],
            ['나레이션', '되돌아가기엔 이미 늦었다. 술값만 냈다.'],
          ]);
        }
        return s;
      },
    },
    {
      id: 'ice',
      when: (s) => s.season === 'WINTER',
      build: (s) => {
        const scene = '나룻배는 얼음에 갇혀 있다. 사람들이 얼음 위로 조심조심 강을 건넌다. 발밑에서 쩍, 하고 낮은 소리가 울린다.';
        return {
          title: '얼어붙은 강',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(ferryman(s), '한가운데는 얼음이 얇소! 가장자리로, 가장자리로만 밟으시오!', '손을 휘저으며')],
          options: [
            { id: 'cross', label: '얼음 위로 건넌다', hint: `민첩 판정 약 ${pct(0.45 + s.stats.agi * 0.005)} · 빠지면 몸살` },
            { id: 'help', label: '짐 진 아낙을 부축해 함께 건넌다', hint: '건강 -3 · 인덕 +4' },
            { id: 'detour', label: '다리가 있는 하류로 돌아간다 (2일)' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'cross') {
          if (chance(clampP(0.45 + s.stats.agi * 0.005))) {
            return say(addStats(s, { agi: 1 }), [['나레이션', '얼음 결을 읽으며 미끄러지듯 건넜다. 뒤따르던 이들이 그 발자국만 골라 밟았다. (민첩 +1)']]);
          }
          return say(injure(addHealth(s, -10), '얼음물에 빠져 얻은 몸살'), [['나레이션', '쩍! 얼음이 꺼졌다. 허리까지 빠졌다가 겨우 기어 나왔다. (건강 -10, 몸살)']]);
        }
        if (opt === 'help') {
          return say(addRep(addHealth(s, -3), { virtue: 4 }), [
            ['나레이션', '아낙의 짐을 대신 지고 한 발 한 발 건넜다. 건너편에서 아낙이 언 손으로 군밤 몇 알을 쥐여 주었다. (인덕 +4, 건강 -3)'],
          ]);
        }
        if (opt === 'detour') return say(spendDays(s, 2), [['나레이션', '얼음을 믿지 않기로 했다. 이틀을 걸어 하류의 나무다리를 건넜다.']]);
        return s;
      },
    },
    {
      id: 'night_boat',
      build: (s) => {
        const scene = '해가 지자 갈대숲에서 거룻배 한 척이 슬그머니 나온다. 뱃바닥에 거적 덮인 짐이 가득하다.';
        return {
          title: '밤에만 뜨는 배',
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(
              '거룻배 사공',
              byCountry(
                s,
                '…국경 너머 물건이오. 묻지 마시오. 입만 다물어 주면 뱃삯은 안 받겠소.',
                '…사염(私鹽)이오. 관염(官鹽)이 아니란 말이지. 입만 다물어 주면 뱃삯은 안 받겠소.',
                '…누케니(抜け荷)요. 번(藩)에만 말 안 하면 공짜로 건네주지.'
              ),
              '목소리를 낮추며'
            ),
          ],
          options: [
            { id: 'ride', label: '입을 다물고 얻어 탄다', hint: '상무 +4' },
            { id: 'report', label: '나루 관헌에게 알린다 (1일)', hint: '인덕 +3 · 명성 +5' },
            { id: 'leave', label: '못 본 척 지나친다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'ride') {
          const n = addRep(s, { commerce: 4 });
          if (chance(0.25)) {
            return say(addFame(n, -3), [['나레이션', '강 한가운데서 관헌의 횃불이 비쳤다. 사공이 뇌물을 쥐여 주고 겨우 빠져나왔다. 같은 배를 탄 이상 한패로 보였을 것이다. (상무 +4, 명성 -3)']]);
          }
          return say(n, [['나레이션', '배는 소리 없이 강을 건넜다. 내릴 때 사공이 고개만 까딱했다. (상무 +4)']]);
        }
        if (opt === 'report') {
          return say(addFame(addRep(spendDays(s, 1), { virtue: 3 }), 5), [
            ['나레이션', '관헌들이 갈대숲을 뒤져 짐을 압수했다. 나루 사람 몇은 눈을 흘겼다. (인덕 +3, 명성 +5)'],
          ]);
        }
        return s;
      },
    },
  ],
});

// ───────── 2. 장꾼 행렬 ─────────
const peddlers = sceneEvent({
  key: 'r_peddlers',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '보부상 행렬', '객상(客商) 무리', '행상인 일행'),
  trigger: { terrain: ['ROAD', 'PASS', 'TOWN', 'FOREST', 'COAST'] },
  scenes: [
    {
      id: 'escort',
      build: (s) => {
        const scene = '등짐을 진 장꾼 열댓이 고갯마루 아래에서 머뭇거린다. 요즘 이 고개에 도적이 든다는 소문이다.';
        return {
          title: '고개를 넘는 장꾼들',
          category: 'LIFE',
          sceneActor: 'MERCHANT',
          narration: scene,
          script: [
            N(scene),
            P(
              byCountry(s, '보부상 접장', '객상 우두머리', '행상 우두머리'),
              `${sir(s)}, 칼 차신 걸 보니 무예 하시는 분 같은데… 고개 넘을 때까지만 같이 가 주시겠소? 노자 ${josa(`25${cur(s)}`, '은는')} 드리리다.`,
              byCountry(s, '패랭이를 고쳐 쓰며', '삿갓을 고쳐 쓰며', '삿갓을 고쳐 쓰며')
            ),
          ],
          options: [
            { id: 'escort', label: '함께 고개를 넘는다 (2일)', hint: '노자 +25 · 상무 +5 · 도적을 만날 수도 있다' },
            { id: 'free', label: '보수 없이 동행해 준다 (2일)', hint: '인덕 +5 · 명성 +4' },
            { id: 'gouge', label: '호위값을 세 배로 부르고, 싫으면 알아서들 넘으라 한다 (2일)', hint: '노자 +45 · 살기 +4 · 명성 -3' },
            { id: 'leave', label: '제 갈 길을 간다' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'escort') {
          const n = spendDays(s, 2);
          if (chance(0.25)) {
            return journeyBattle(say(n, [['나레이션', '고갯마루 바위 뒤에서 복면한 사내들이 뛰어나왔다!']]), c, opt, {
              stakes: 'MERCY',
              title: '고갯마루의 도적',
              subtitle: '장꾼 행렬을 노리는 자들',
              name: '고갯마루 도적',
              enemyTitle: '복면 도적',
              age: 30,
              ai: 'AGGRESSIVE',
              scale: roadScale(s, 0.8),
              weapon: 'BLADE',
              skills: bladeSkills(s),
              rewardFame: 10,
            });
          }
          return say(addRep(addMoney(n, 25), { commerce: 5 }), [
            ['나레이션', '장꾼들 틈에 섞여 고개를 넘었다. 도적 그림자도 보이지 않았다. 우두머리가 약속한 노자를 셈해 주었다. (노자 +25, 상무 +5)'],
          ]);
        }
        if (opt === 'gouge') {
          return say(addFame(addRep(addMoney(spendDays(s, 2), 45), { ruthless: 4 }), -3), [
            ['나레이션', `장꾼들은 이를 갈며 ${zeni(s)}을 모았다. 고개를 넘는 이틀 동안 아무도 말을 걸지 않았다. 다음 장터에는 「칼 찬 날강도」 이야기가 먼저 가 있을 것이다. (노자 +45, 살기 +4, 명성 -3)`],
          ]);
        }
        if (opt === 'free') {
          return say(addFame(addRep(spendDays(s, 2), { virtue: 5 }), 4), [
            ['나레이션', `고개를 넘자 우두머리가 ${josa(byCountry(s, '패랭이', '삿갓', '삿갓'), '을를')} 벗고 허리를 숙였다. 「이 은혜는 장터마다 소문내리다.」 (인덕 +5, 명성 +4)`],
          ]);
        }
        return s;
      },
      onBattle: (s, _opt, won) => {
        if (!won) return say(s, [['나레이션', '장꾼들은 짐을 버리고 사방으로 흩어졌다. 면목이 없었다.']]);
        return say(highlight(addRep(addMoney(s, 25), { commerce: 5 }), '고갯마루에서 장꾼 행렬을 지켰다'), [
          ['나레이션', '도적들이 달아났다. 장꾼들이 약속한 노자에 술값까지 얹어 주었다. (노자 +25, 상무 +5)'],
        ]);
      },
    },
    {
      id: 'mule',
      build: (s) => {
        const scene = '짐을 가득 실은 노새가 길 한복판에 주저앉았다. 앞다리를 전다. 늙은 장꾼이 노새 목을 끌어안고 한숨만 쉰다.';
        return {
          title: '주저앉은 노새',
          category: 'LIFE',
          sceneActor: 'MERCHANT',
          narration: scene,
          script: [N(scene), P('늙은 장꾼 영감', '이놈이 쓰러지면 나도 끝이오. 짐이 서른 근인데…', '노새 목을 쓰다듬으며')],
          options: [
            { id: 'carry', label: '짐을 나눠 지고 다음 마을까지 간다 (1일)', hint: '건강 -5 · 근력 +1 · 인덕 +4' },
            { id: 'treat', label: '노새의 다리를 살펴 준다', hint: `통찰 판정 약 ${pct(0.35 + s.stats.ins * 0.006)} · 인덕 +3` },
            { id: 'leave', label: '갈 길이 바쁘다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'carry') {
          return say(addMoney(addRep(addStats(addHealth(spendDays(s, 1), -5), { str: 1 }), { virtue: 4 }), 6), [
            ['나레이션', '서른 근 짐을 나눠 지고 하루를 걸었다. 다음 마을에 닿자 영감이 엽전 몇 닢과 곶감 한 줄을 내밀었다. (건강 -5, 근력 +1, 인덕 +4, 노자 +6)'],
          ]);
        }
        if (opt === 'treat') {
          if (chance(clampP(0.35 + s.stats.ins * 0.006))) {
            return say(addStats(addRep(s, { virtue: 3 }), { ins: 1 }), [['나레이션', '발굽에 박힌 사금파리를 뽑아내고 천으로 동여매 주었다. 노새가 힝 하고 일어섰다. (인덕 +3, 통찰 +1)']]);
          }
          return say(addRep(s, { virtue: 1 }), [['나레이션', '다리를 이리저리 살폈지만 어디가 탈인지 알 수 없었다. 영감은 그래도 고맙다며 고개를 숙였다. (인덕 +1)']]);
        }
        return s;
      },
    },
    {
      id: 'scale',
      build: () => {
        const scene = '장꾼 하나가 시골 아낙에게 소금을 달아 주는데, 저울추 밑에 무언가를 붙여 놓았다. 아낙은 모르는 눈치다.';
        return {
          title: '속임 저울',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('장꾼', '자, 소금 두 근! 이 장터에서 우리 저울만큼 정직한 저울은 없지요!', '능청스럽게'), P('시골 아낙', '…지난 장보다 적어 보이는데.', '고개를 갸웃하며')],
          options: [
            { id: 'expose', label: '저울추를 들어 보이며 꾸짖는다', hint: '인덕 +5 · 명성 +3' },
            { id: 'hush', label: '장꾼을 따로 불러 입막음 값을 받는다', hint: '노자 +20 · 살기 +3 · 상무 +3' },
            { id: 'leave', label: '남의 장사에 끼지 않는다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'expose') {
          return say(addFame(addRep(s, { virtue: 5 }), 3), [
            ['나레이션', '저울추 밑에 붙은 납 조각을 떼어 들어 보이자 장꾼의 얼굴이 시뻘게졌다. 아낙들이 몰려와 소금을 다시 달았다. (인덕 +5, 명성 +3)'],
          ]);
        }
        if (opt === 'hush') {
          return say(addRep(addMoney(s, 20), { ruthless: 3, commerce: 3 }), [
            ['나레이션', '「…알아서 하겠수.」 장꾼이 엽전 꾸러미를 소매에 찔러 넣어 주었다. 아낙은 끝내 모른 채 돌아갔다. (노자 +20, 살기 +3, 상무 +3)'],
          ]);
        }
        return s;
      },
    },
    {
      id: 'campfire',
      build: (s) => {
        const rumors = rumorsFor(s.country, s.year);
        const scene = '해 질 녘, 길가 공터에 장꾼들이 모닥불을 피웠다. 어느 고을 쌀값이 올랐다느니, 어느 포구에 배가 들었다느니 이야기가 끝이 없다.';
        return {
          title: '모닥불가의 장꾼들',
          category: 'LIFE',
          sceneActor: 'MERCHANT',
          narration: scene,
          script: [N(scene), P('젊은 장꾼', rumors.length ? rand(rumors) : '요즘은 어디나 쌀값이 오른다오.', '불을 쑤시며')],
          options: [
            { id: 'listen', label: '시세 이야기를 귀담아듣는다', hint: '상무 +4 · 통찰 +1' },
            { id: 'share', label: '육포를 꺼내 나눠 먹는다', hint: '인덕 +3 · 건강 +4' },
            { id: 'leave', label: '불만 쬐고 일찍 눕는다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'listen') {
          return say(addStats(addRep(s, { commerce: 4 }), { ins: 1 }), [
            ['나레이션', '무명이 어디서 나고 어디서 귀한지, 어느 길목에 세금이 붙는지. 칼 쓰는 일과는 다른 세상의 셈법이었다. (상무 +4, 통찰 +1)'],
          ]);
        }
        if (opt === 'share') {
          return say(addHealth(addRep(s, { virtue: 3 }), 4), [
            ['나레이션', `육포를 나누자 장꾼들이 ${brew(s)} 호리병을 돌렸다. 오랜만에 배불리 웃었다. (인덕 +3, 건강 +4)`],
          ]);
        }
        return s;
      },
    },
    {
      id: 'guild',
      when: (s) => s.fame >= 150,
      build: (s) => {
        const head = byCountry(s, '보부상단 접장', '상방(商幇)의 거상', '오미(近江)의 거상');
        const scene = '비단 휘장을 친 큰 상단 행렬이 멈춰 섰다. 우두머리가 사람을 보내 지나가던 무인을 불러 세운다.';
        return {
          title: `${byCountry(s, '보부상단', '상방(商幇)', '오미 상인')}의 제안`,
          category: 'LIFE',
          sceneActor: 'MERCHANT',
          narration: scene,
          script: [N(scene), P(head, `${s.sectName}의 이름은 들었소. 사흘만 우리 상단 호위를 맡아 주시오. 셈은 넉넉히 치르리다.`, '부채를 접으며')],
          options: [
            { id: 'job', label: '사흘만 호위를 맡는다 (3일)', hint: '노자 +45 · 상무 +6' },
            { id: 'decline', label: '칼은 팔지 않는다며 사양한다', hint: '구도 +3' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'job') {
          return say(addRep(addMoney(spendDays(s, 3), 45), { commerce: 6 }), [
            ['나레이션', '사흘 동안 상단의 맨 앞에서 걸었다. 칼을 뽑을 일은 없었다. 우두머리가 셈을 치르며 다음 철에도 와 달라 했다. (노자 +45, 상무 +6)'],
          ]);
        }
        if (opt === 'decline') {
          return say(addRep(s, { ascetic: 3 }), [['나레이션', '「무사수행 중이라서요.」 우두머리는 아쉬운 얼굴로 명첩 한 장을 건넸다. (구도 +3)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 3. 길 위의 스님·수행자 ─────────
const monk = (s: GameState) => byCountry(s, '탁발승 대사', '운수승 대사', '탁발승 대사');
const pilgrim = sceneEvent({
  key: 'r_pilgrim',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '길 위의 스님', '길 위의 승려', '길 위의 수행자'),
  scenes: [
    {
      id: 'alms',
      build: (s) => {
        const scene = '목탁 소리가 길을 따라온다. 누더기 장삼의 스님이 발우를 들고 말없이 서 있다.';
        return {
          title: '발우를 내민 탁발승',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(monk(s), '나무아미타불… 시주하시면 가시는 길이 평안하실 것이오.', '합장하며')],
          options: [
            { id: 'give', label: `노자를 시주한다 (8${cur(s)})`, hint: '인덕 +3 · 구도 +2', ...costly(s, 8) },
            { id: 'meal', label: '길가에 앉아 주먹밥을 나눈다', hint: '구도 +3 · 정신 +1' },
            { id: 'leave', label: '합장만 하고 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'give') {
          const n = addRep(addMoney(s, -8), { virtue: 3, ascetic: 2 });
          if (chance(0.35)) {
            const g = gainInsight(n, 5, '탁발승의 한마디');
            const words = rand(['칼을 쥔 손보다, 칼을 놓는 손이 더 무거운 법이오.', '길은 발밑에만 있소. 앞을 너무 오래 보지 마시오.', '이긴 이도 진 이도 저녁이면 같은 밥을 먹지요.']);
            return say(g.state, [
              [monk(s), words],
              ['나레이션', `그 말이 이상하게 오래 남았다. (인덕 +3, 구도 +2) ${g.text}`],
            ]);
          }
          return say(n, [['나레이션', '스님이 발우를 거두고 고개를 숙였다. 목탁 소리가 멀어졌다. (인덕 +3, 구도 +2)']]);
        }
        if (opt === 'meal') {
          return say(addStats(addRep(s, { ascetic: 3 }), { wil: 1 }), [
            ['나레이션', '말없이 주먹밥을 나누어 먹었다. 스님은 밥알 하나 남기지 않았다. 그 모습이 수련 같았다. (구도 +3, 정신 +1)'],
          ]);
        }
        return s;
      },
    },
    {
      id: 'old_pilgrim',
      build: (s) => {
        const scene = `${byCountry(s, '금강산 절에 불공 드리러 가는', '태산(泰山)에 향을 올리러 가는', '구마노(熊野) 참배 길의')} 노파가 길가 돌에 걸터앉아 있다. 짚신이 해져 발에서 피가 배어난다.`;
        return {
          title: '발이 부르튼 순례자',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('순례 길의 노파', '죽기 전에 한 번은 가 봐야지요. 먼저 간 영감 넋을 빌어 줘야 하니께…', '부르튼 발을 감싸며')],
          options: [
            { id: 'carry', label: '노파를 업고 다음 마을까지 간다 (1일)', hint: '건강 -4 · 인덕 +6 · 명성 +3' },
            { id: 'straw', label: `새 짚신과 약값을 쥐여 준다 (10${cur(s)})`, hint: '인덕 +4', ...costly(s, 10) },
            { id: 'leave', label: '갈 길을 간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'carry') {
          return say(addFame(addRep(addHealth(spendDays(s, 1), -4), { virtue: 6 }), 3), [
            ['나레이션', '노파는 깃털처럼 가벼웠다. 등 뒤에서 「우리 아들도 살았으면 이만할 텐데」 하는 혼잣말이 들렸다. (건강 -4, 인덕 +6, 명성 +3)'],
          ]);
        }
        if (opt === 'straw') {
          return say(addRep(addMoney(s, -10), { virtue: 4 }), [
            ['순례 길의 노파', byCountry(s, '부처님이 다 보고 계셔요.', '낭랑(娘娘)께서 다 보고 계실 거요.', '곤겐(権現)님이 다 보고 계셔요.')],
            ['나레이션', '새 짚신을 신겨 드리자 노파가 손을 꼭 잡았다. (인덕 +4)'],
          ]);
        }
        return s;
      },
    },
    {
      id: 'disguised',
      build: (s) => {
        const who = byCountry(s, '삿갓을 깊이 눌러쓴 승려', '삿갓을 깊이 눌러쓴 운수승', '바구니 삿갓(天蓋)을 쓴 고무소(虛無僧)');
        const scene = `${josa(who, '이가')} 길을 막듯 서 있다. 장삼 자락 아래로 칼자루 끝이 비친다.`;
        return {
          title: '삿갓 아래의 칼',
          category: 'LIFE',
          sceneActor: 'RIVAL',
          narration: scene,
          script: [
            N(scene),
            P(
              '삿갓 쓴 검객',
              byCountry(
                s,
                '…스님 행색이 길 다니기 편해서 말이오. 칼 냄새를 맡고 멈춘 거요?',
                '…빈승(貧僧)의 소매를 보셨소? 보셨으면 한 합 청하리다.',
                '…퉁소는 퉁소일 뿐이오. 칼은 칼이고. 한 합 겨뤄 보시겠소?'
              ),
              '삿갓 너머로'
            ),
          ],
          options: [
            { id: 'spar', label: '칼집째로 한 합 겨룬다', hint: '목검 시합 · 깨달음' },
            { id: 'talk', label: '모른 척 말을 건넨다', hint: '구도 +3 · 통찰 +1' },
            { id: 'leave', label: '길을 비켜 지나간다' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'spar') {
          return journeyBattle(s, c, opt, {
            stakes: 'SPAR',
            title: '삿갓 쓴 검객',
            subtitle: '승복 아래 숨긴 칼',
            name: '삿갓 쓴 검객',
            enemyTitle: byCountry(s, '떠도는 파계승', '이름을 숨긴 협객', '고무소 차림의 낭인'),
            age: 41,
            ai: 'DUELIST',
            scale: roadScale(s, 0.95),
            weapon: 'BLADE',
            skills: swordSkills(s),
            rewardFame: 10,
          });
        }
        if (opt === 'talk') {
          return say(addStats(addRep(s, { ascetic: 3 }), { ins: 1 }), [
            ['삿갓 쓴 검객', '…원수를 찾아 이십 년을 걸었소. 찾으면 무엇이 남을지는 아직 모르겠소.'],
            ['나레이션', `그는 끝내 얼굴을 보이지 않았다. ${byCountry(s, '목탁도 없이 걸음 소리만 멀어졌다.', '목탁도 없이 걸음 소리만 멀어졌다.', '멀리서 퉁소 소리가 들렸다.')} (구도 +3, 통찰 +1)`],
          ]);
        }
        return s;
      },
      onBattle: (s, _opt, won) => {
        if (!won) {
          return say(s, [
            ['삿갓 쓴 검객', '칼은 좋은데, 마음이 칼보다 반걸음 앞서 가는구려.'],
            ['나레이션', '칼집이 손목을 때렸다. 그는 인사도 없이 사라졌다.'],
          ]);
        }
        const g = gainInsight(addStats(s, { ins: 1 }), 6, '삿갓 쓴 검객과의 한 합');
        return say(g.state, [
          ['삿갓 쓴 검객', '…졌소. 쫓기는 몸이라 이름은 못 대오. 대신 이것만 기억하시오. 칼집째 휘두르는 칼이 가장 정직하다는 걸.'],
          ['나레이션', `그는 삿갓을 고쳐 쓰고 숲으로 사라졌다. (통찰 +1) ${g.text}`],
        ]);
      },
    },
    {
      id: 'silent',
      build: () => {
        const scene = '길가 바위에 앉은 스님이 말 대신 나뭇가지로 흙바닥에 글을 쓴다. 「劍從何來」 — 칼은 어디서 오는가.';
        return {
          title: '묵언 수행승의 물음',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), N('스님은 대답을 기다리듯 나뭇가지를 거꾸로 내밀었다.')],
          options: [
            { id: 'answer', label: '나뭇가지를 받아 답을 쓴다', hint: '구도 +4 · 깨달음' },
            { id: 'bow', label: '합장하고 물러난다', hint: '정신 +1 · 구도 +2' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'answer') {
          const word = rand(['「心」', '「無」', '「手」', '「彼」']);
          const g = gainInsight(addRep(s, { ascetic: 4 }), 7, '묵언승의 물음');
          return say(g.state, [
            ['나레이션', `흙바닥에 ${word} 한 글자를 썼다. 스님은 한참 들여다보더니 발로 지우고, 그 자리에 같은 글자를 다시 썼다.`],
            ['나레이션', `무슨 뜻인지는 길을 걸으며 생각하기로 했다. (구도 +4) ${g.text}`],
          ]);
        }
        if (opt === 'bow') {
          return say(addRep(addStats(s, { wil: 1 }), { ascetic: 2 }), [['나레이션', '합장하고 물러났다. 등 뒤에서 나뭇가지가 흙을 긁는 소리가 오래 이어졌다. (정신 +1, 구도 +2)']]);
        }
        return s;
      },
    },
    {
      id: 'charm',
      build: (s) => {
        const scene = byCountry(
          s,
          '오색 천을 두른 무녀가 방울을 흔들며 산길을 오른다. 무인을 보더니 걸음을 멈추고 눈을 가늘게 뜬다.',
          '누런 도포를 걸친 떠돌이 도사가 길가에 좌판을 폈다. 붉은 글씨의 부적이 바람에 팔랑인다.',
          '소라고둥 소리가 산을 울린다. 방울 달린 지팡이를 짚은 야마부시(山伏)가 무인을 보더니 걸음을 멈춘다.'
        );
        return {
          title: byCountry(s, '산신 기도 가는 무녀', '떠돌이 도사의 부적', '야마부시의 부적'),
          category: 'FANTASY',
          narration: scene,
          script: [
            N(scene),
            P(
              byCountry(s, '방울 든 무녀 할머니', '떠돌이 도사', '야마부시 도사'),
              byCountry(
                s,
                '칼에 원혼이 붙어 따라오는구먼. 부적 한 장 지니고 가시오. 값은 마음대로 주고.',
                '얼굴에 살기(殺氣)가 서렸소. 부적 한 장이면 막을 수 있지. 값은 마음 가는 대로.',
                '산의 기운이 그대를 따라오고 있소. 이 부적이 길을 지켜 줄 것이오. 값은 마음대로.'
              ),
              '부적을 내밀며'
            ),
          ],
          options: [
            { id: 'take', label: `부적을 받고 값을 치른다 (6${cur(s)})`, hint: '이단 +3 · 정신 +1', ...costly(s, 6) },
            {
              id: 'learn',
              label: byCountry(s, '무녀에게 부적 그리는 법을 청한다 (1일)', '도사에게 부적 쓰는 법을 청한다 (1일)', '야마부시에게 구자(九字)를 청한다 (1일)'),
              hint: '이단 +4 · 영력 +1',
            },
            { id: 'decline', label: '「제 칼은 제가 지킵니다」 사양한다', hint: '구도 +3' },
            { id: 'leave', label: '눈을 피하고 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'take') {
          return say(addStats(addRep(addMoney(s, -6), { arcane: 3 }), { wil: 1 }), [['나레이션', '부적을 품에 넣었다. 그날 밤, 오랜만에 꿈 없이 깊이 잤다. (이단 +3, 정신 +1)']]);
        }
        if (opt === 'learn') {
          return say(addStats(addRep(spendDays(s, 1), { arcane: 4 }), { qi: 1 }), [
            [
              '나레이션',
              byCountry(
                s,
                '무녀가 경면주사(鏡面朱砂)를 개어 부적의 획을 긋는 순서를 일러 주었다. 붓끝에 숨을 실어야 획이 산다고 했다. 밤새 따라 그렸다. (이단 +4, 영력 +1)',
                '도사가 주사로 부적 머리에 「칙령(勅令)」 두 자를 쓰는 법부터 일러 주었다. 붓을 떼기 전에 숨을 멈추라 했다. 밤새 따라 썼다. (이단 +4, 영력 +1)',
                '야마부시가 「린·뵤·토·샤·카이·진·레쓰·자이·젠」 아홉 글자에 맞춰 허공에 칼금을 긋는 법을 가르쳐 주었다. 밤새 따라 그었다. 손끝이 저렸다. (이단 +4, 영력 +1)'
              ),
            ],
          ]);
        }
        if (opt === 'decline') {
          return say(addRep(s, { ascetic: 3 }), [['나레이션', '「고집도 칼만큼 단단하시구려.」 혀 차는 소리를 뒤로하고 걸었다. (구도 +3)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 4. 쫓기는 사람들 ─────────
const runaway = sceneEvent({
  key: 'r_runaway',
  kind: 'PEOPLE',
  label: () => '덤불 속 인기척',
  scenes: [
    {
      id: 'servant',
      build: (s) => {
        const scene = `덤불 속에 ${byCountry(s, '노비 차림의', '가노(家奴) 차림의', '봉공인(奉公人) 차림의')} 젊은이가 숨어 있다. 등에 매 자국이 벌겋다. 멀리서 사냥개 짖는 소리가 다가온다.`;
        return {
          title: `도망친 ${byCountry(s, '노비', '가노(家奴)', '봉공인(奉公人)')}`,
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('도망친 청년', `${sir(s)}, 제발… 못 본 걸로 해 주십시오. 이번에 잡히면 맞아 죽습니다.`, '떨며')],
          options: [
            { id: 'hide', label: '숨겨 주고 쫓는 자들을 엉뚱한 길로 보낸다 (1일)', hint: '인덕 +6 · 들킬 수도 있다' },
            { id: 'money', label: `노자를 쥐여 주며 산길을 일러 준다 (10${cur(s)})`, hint: '인덕 +4', ...costly(s, 10) },
            { id: 'hand', label: '쫓아온 자들에게 넘긴다', hint: '노자 +20 · 살기 +6' },
            { id: 'leave', label: '모른 척 지나간다' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        const chaser = byCountry(s, '추노꾼', '가노를 쫓는 장정', '쫓아온 하인');
        if (opt === 'hide') {
          const n = addRep(spendDays(s, 1), { virtue: 6 });
          if (chance(0.3)) {
            return journeyBattle(say(n, [['나레이션', `${josa(chaser, '이가')} 덤불을 헤치고 들이닥쳤다. 「거기 숨긴 놈 내놓으시오!」`]]), c, opt, {
              stakes: 'MERCY',
              title: `덤불 앞의 ${chaser}`,
              subtitle: '도망친 이를 쫓는 자',
              name: byCountry(s, '추노꾼 두목', '장정 우두머리', '하인 우두머리'),
              enemyTitle: chaser,
              age: 35,
              ai: 'AGGRESSIVE',
              scale: roadScale(s, 0.8),
              weapon: 'BLADE',
              skills: bladeSkills(s),
              rewardFame: 8,
            });
          }
          return say(n, [
            ['나레이션', '사냥개를 앞세운 자들에게 엉뚱한 고갯길을 가리켰다. 짖는 소리가 멀어지자 청년이 덤불에서 기어 나와 넙죽 엎드렸다.'],
            ['도망친 청년', '이 목숨, 언젠가 꼭…'],
            ['나레이션', '(인덕 +6)'],
          ]);
        }
        if (opt === 'money') {
          return say(addRep(addMoney(s, -10), { virtue: 4 }), [['나레이션', '노자를 쥐여 주고 사냥개가 냄새를 못 맡을 물길을 일러 주었다. 청년은 몇 번이고 뒤를 돌아보며 사라졌다. (인덕 +4)']]);
        }
        if (opt === 'hand') {
          return say(addRep(addMoney(s, 20), { ruthless: 6 }), [
            ['나레이션', `${josa(chaser, '이가')} 청년의 뒷덜미를 잡아 끌고 갔다. 손에 쥔 엽전이 이상하게 무거웠다. (노자 +20, 살기 +6)`],
          ]);
        }
        return s;
      },
      onBattle: (s, _opt, won) => {
        if (!won) return say(s, [['나레이션', '쫓던 자들이 청년을 끌고 갔다. 뒤돌아보던 눈빛이 오래 남았다.']]);
        return say(highlight(s, '쫓기던 이를 숨겨 주고 추격자를 물리쳤다'), [
          ['나레이션', '쫓던 자들이 욕설을 퍼부으며 물러갔다. 덤불에서 나온 청년이 땅에 이마를 찧었다.'],
          ['도망친 청년', '이 목숨, 언젠가 꼭…'],
        ]);
      },
    },
    {
      id: 'bride',
      build: (s) => {
        const scene = '길 저편에 가마가 엎어져 있고, 붉은 치마의 처녀가 맨발로 달려온다. 뒤에서 사내들이 고함을 지른다.';
        return {
          title: '가마에서 뛰어내린 처녀',
          category: 'DUEL',
          narration: scene,
          script: [
            N(scene),
            P('도망친 낭자', `살려 주세요! 아비 노름빚에 ${byCountry(s, '부잣집 소실로', '부잣집 첩으로', '유곽으로')} 팔려 가는 길이에요!`, '숨을 몰아쉬며'),
            P('빚쟁이 왈패', '이봐, 남의 일에 끼지 마쇼. 빚 문서가 여기 있으니께.', '문서를 흔들며', 'ANGRY'),
          ],
          options: [
            { id: 'pay', label: `빚을 대신 갚는다 (60${cur(s)})`, hint: '인덕 +6 · 명성 +5', ...costly(s, 60) },
            { id: 'fight', label: '왈패들을 막아선다', hint: '진검승부 · 이기면 인덕 +5' },
            { id: 'leave', label: '남의 집 빚일이다. 지나간다' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'pay') {
          return say(highlight(addFame(addRep(addMoney(s, -60), { virtue: 6 }), 5), '팔려 가던 처녀의 빚 문서를 찢었다'), [
            ['나레이션', '빚 문서를 받아 그 자리에서 찢었다. 처녀가 흙바닥에 엎드려 울었다. (인덕 +6, 명성 +5)'],
          ]);
        }
        if (opt === 'fight') {
          return journeyBattle(s, c, opt, {
            stakes: 'MERCY',
            title: '빚 문서를 든 왈패',
            subtitle: '팔려 가는 처녀를 지키다',
            name: '빚쟁이 왈패 두목',
            enemyTitle: '노름빚 수금꾼',
            age: 37,
            ai: 'AGGRESSIVE',
            scale: roadScale(s, 0.8),
            weapon: 'POLEARM',
            skills: clubSkills(s),
            rewardFame: 10,
          });
        }
        return s;
      },
      onBattle: (s, _opt, won) => {
        if (!won) return say(s, [['나레이션', '왈패들이 처녀를 다시 가마에 태웠다. 울음소리가 길 끝까지 따라왔다.']]);
        return say(highlight(addRep(s, { virtue: 5 }), '팔려 가던 처녀를 왈패들에게서 빼냈다'), [
          ['나레이션', '왈패들이 빚 문서를 떨어뜨리고 달아났다. 처녀는 문서를 갈기갈기 찢어 개울에 띄워 보냈다. (인덕 +5)'],
        ]);
      },
    },
    {
      id: 'deserter',
      build: (s) => {
        const scene = '굶주린 사내가 군복을 벗어 땅에 묻고 있다. 무인을 보자 흠칫 놀라 무릎을 꿇는다.';
        return {
          title: `도망친 ${byCountry(s, '군졸', '녹영병(綠營兵)', '아시가루(足輕)')}`,
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(
              '도망친 병졸 사내',
              byCountry(
                s,
                '군포는 군포대로 뜯기고, 변방 수자리는 끝이 없고… 집에 늙은 어미가 굶고 있습니다.',
                '석 달째 녹봉이 안 나왔소. 대장은 군량을 팔아먹고… 고향에 처자가 있소.',
                '번(藩)의 부역에 끌려간 지 일 년이오. 논이 묵고 있소. 한 번만 눈감아 주시오.'
              ),
              '두 손을 비비며'
            ),
          ],
          options: [
            { id: 'feed', label: '먹을 것을 나눠 주고 보낸다', hint: '인덕 +3' },
            { id: 'report', label: '관아에 알린다', hint: '노자 +15 · 살기 +4' },
            { id: 'advise', label: '돌아가 자수하라 타이른다', hint: '구도 +2 · 정신 +1' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'feed') return say(addRep(s, { virtue: 3 }), [['나레이션', '주먹밥 두 덩이를 내주었다. 사내는 절을 세 번 하고 산을 넘어갔다. (인덕 +3)']]);
        if (opt === 'report') {
          return say(addRep(addMoney(s, 15), { ruthless: 4 }), [['나레이션', '관아에서 포상금을 받았다. 그 사내가 어찌 되었는지는 묻지 않았다. (노자 +15, 살기 +4)']]);
        }
        if (opt === 'advise') {
          const back = chance(0.5);
          return say(addStats(addRep(s, { ascetic: 2 }), { wil: 1 }), [
            [
              '나레이션',
              back
                ? '사내는 한참 울더니 묻었던 군복을 다시 파냈다. 「…돌아가서 매를 맞겠습니다.」 (구도 +2, 정신 +1)'
                : '사내는 고개를 저으며 숲으로 달아났다. 법도와 사람 사이의 거리를 오래 생각했다. (구도 +2, 정신 +1)',
            ],
          ]);
        }
        return s;
      },
    },
    {
      id: 'farmers',
      build: (s) => {
        const scene = '새벽안개 속에 봇짐을 진 일가족이 숨죽여 걷는다. 소작료를 못 내 밤에 마을을 떴다고 한다. 막내는 아직 젖먹이다.';
        return {
          title: '야반도주한 일가',
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(
              '도주한 농부',
              byCountry(
                s,
                '마름이 빚을 핑계로 큰딸을 데려간다기에… 어쩔 수 없었습니다.',
                '지주가 소작료를 두 배로 올렸소. 버틸 수가 없었소.',
                '연공(年貢)을 못 바쳤소. 마을에 남으면 촌장까지 경을 칩니다.'
              ),
              '아이를 고쳐 업으며'
            ),
          ],
          options: [
            { id: 'money', label: `노자를 보탠다 (15${cur(s)})`, hint: '인덕 +5', ...costly(s, 15) },
            { id: 'guide', label: '산 너머 마을까지 길을 안내한다 (1일)', hint: '인덕 +4 · 명성 +3' },
            { id: 'leave', label: '갈 길을 간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'money') return say(addRep(addMoney(s, -15), { virtue: 5 }), [['나레이션', '엽전 꾸러미를 아낙 손에 쥐여 주었다. 등에 업힌 젖먹이가 손가락을 꼭 쥐었다. (인덕 +5)']]);
        if (opt === 'guide') {
          return say(addFame(addRep(spendDays(s, 1), { virtue: 4 }), 3), [['나레이션', '하루를 걸어 산 너머 화전 마을까지 데려다주었다. 촌장이 빈 움막 한 채를 내주었다. (인덕 +4, 명성 +3)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 5. 길을 메운 행렬 ─────────
const procession = sceneEvent({
  key: 'r_procession',
  kind: 'PEOPLE',
  label: () => '길을 메운 행렬',
  scenes: [
    {
      id: 'wedding',
      build: (s) => {
        const scene = byCountry(
          s,
          '청사초롱을 앞세운 신부 가마가 시댁으로 간다. 잔칫떡을 인 아낙들이 길손들에게 떡을 나누고, 아이들이 졸졸 따라간다.',
          '붉은 꽃가마가 징과 태평소 소리에 맞춰 흔들린다. 혼주가 길손들에게 사탕과 술을 돌린다.',
          '흰 옷의 신부가 가마에 오르고, 등불 든 행렬이 천천히 지나간다. 혼주가 길손들에게 술을 권한다.'
        );
        return {
          title: byCountry(s, '신부 가마 행렬', '꽃가마 행렬', '시집가는 행렬'),
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('혼주 영감', `${sir(s)}도 한 잔 드시오! 오늘 같은 날 칼 찬 손님이면 잡귀도 얼씬 못 하지!`, '술병을 내밀며')],
          options: [
            { id: 'gift', label: `축의를 건넨다 (10${cur(s)})`, hint: '인덕 +3 · 명성 +3 · 건강 +4', ...costly(s, 10) },
            { id: 'dance', label: '잔치 마당에서 검무로 흥을 돋운다', hint: '명성 +8 · 인덕 +2' },
            { id: 'extort', label: '「잡귀 쫓는 값은 따로 받소」 혼주에게 손을 내민다', hint: '노자 +12 · 살기 +3 · 명성 -2' },
            { id: 'leave', label: '한 잔만 받고 길을 간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'gift') {
          return say(addHealth(addFame(addRep(addMoney(s, -10), { virtue: 3 }), 3), 4), [['나레이션', '축의를 건네자 혼주가 떡과 전을 한 보따리 싸 주었다. (인덕 +3, 명성 +3, 건강 +4)']]);
        }
        if (opt === 'extort') {
          return say(addFame(addRep(addMoney(s, 12), { ruthless: 3 }), -2), [
            ['혼주 영감', '…허허, 그, 그렇지요. 잡귀 쫓는 값이 따로 있지요.'],
            ['나레이션', `혼주의 웃음이 굳었다. 잔칫날 칼 찬 손님과 시비를 벌일 수는 없었다. 손에 ${zeni(s)} 꾸러미가 쥐여졌다. 잔치 마당의 장단이 한동안 맞지 않았다. (노자 +12, 살기 +3, 명성 -2)`],
          ]);
        }
        if (opt === 'dance') {
          return say(addRep(addFame(s, 8), { virtue: 2 }), [['나레이션', '칼날에 등불이 감겼다 풀렸다. 구경꾼들의 탄성 속에 가마 안의 신부도 살짝 발을 걷었다. (명성 +8, 인덕 +2)']]);
        }
        return s;
      },
    },
    {
      id: 'funeral',
      build: (s) => {
        const scene = byCountry(
          s,
          '만장을 든 상여 행렬이 고갯길에서 멈춰 섰다. 상여꾼 하나가 발목을 접질려 상여가 기우뚱하다.',
          '흰 상복의 행렬이 언덕길에서 멈춰 섰다. 관을 멘 장정 하나가 쓰러져 관이 기울었다.',
          '흰 옷의 장례 행렬이 산길에서 멈춰 섰다. 관을 멘 사내 하나가 발을 다쳐 관이 기울었다.'
        );
        return {
          title: byCountry(s, '멈춰 선 상여', '멈춰 선 출빈(出殯) 행렬', '멈춰 선 장례 행렬'),
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('상주', `${sir(s)}… 염치없지만 ${byCountry(s, '산소', '묘지', '묘지')}까지만 어깨를 빌려주시겠습니까. 해 지기 전에 모셔야 합니다.`, '눈이 퉁퉁 부은 채')],
          options: [
            { id: 'carry', label: byCountry(s, '상여를 함께 멘다 (1일)', '관을 함께 멘다 (1일)', '관을 함께 멘다 (1일)'), hint: '건강 -4 · 인덕 +6 · 정신 +1' },
            { id: 'bow', label: '길을 비켜서서 고개를 숙인다', hint: '구도 +2' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'carry') {
          return say(addStats(addRep(addHealth(spendDays(s, 1), -4), { virtue: 6 }), { wil: 1 }), [
            [
              '나레이션',
              byCountry(
                s,
                '「어허 넘차, 어허 넘차」 앞소리꾼의 소리에 발을 맞췄다. 산소에 닿자 상주가 맨땅에 엎드려 절했다. (건강 -4, 인덕 +6, 정신 +1)',
                '장정들과 발을 맞춰 언덕 위 묘지까지 관을 모셨다. 상주가 맨땅에 엎드려 절했다. (건강 -4, 인덕 +6, 정신 +1)',
                '사내들과 발을 맞춰 절 뒤 묘지까지 관을 모셨다. 상주가 맨땅에 엎드려 절했다. (건강 -4, 인덕 +6, 정신 +1)'
              ),
            ],
          ]);
        }
        if (opt === 'bow') return say(addRep(s, { ascetic: 2 }), [['나레이션', '길가에 비켜서서 고개를 숙였다. 흰 행렬이 바람 소리처럼 지나갔다. (구도 +2)']]);
        return s;
      },
    },
    {
      id: 'magistrate',
      build: (s) => {
        const scene = byCountry(
          s,
          '「물렀거라!」 사령들의 외침에 길 가던 이들이 모두 엎드린다. 그런데 어린아이 하나가 영문을 모르고 길 한복판에 서 있다.',
          '「길을 비켜라!」 징 소리에 길 가던 이들이 모두 엎드린다. 그런데 어린아이 하나가 영문을 모르고 길 한복판에 서 있다.',
          '「물러나라, 물러나라!」 앞잡이의 외침에 모두 길가에 엎드린다. 그런데 어린아이 하나가 영문을 모르고 길 한복판에 서 있다.'
        );
        return {
          title: byCountry(s, '원님 행차', '현령 행차', '부교(奉行) 행렬'),
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(byCountry(s, '행차 앞 사령', '행차 앞 아역(衙役)', '행렬 앞잡이 하인'), '이놈! 어디 감히 행차 앞을 막느냐!', '몽둥이를 치켜들며', 'ANGRY')],
          options: [
            { id: 'shield', label: '아이를 감싸 안고 대신 엎드린다', hint: '인덕 +5 · 건강 -3' },
            { id: 'speak', label: '앞을 막아서며 아이는 모르고 그랬다 아뢴다', hint: `명성 판정 약 ${pct(0.25 + s.fame * 0.0008)}` },
            { id: 'kneel', label: '모른 척 엎드려 행차가 지나가길 기다린다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'shield') {
          return say(addRep(addHealth(s, -3), { virtue: 5 }), [['나레이션', '몽둥이가 등을 한 번 스쳤다. 아이 어미가 달려와 아이를 끌어안고 울었다. (인덕 +5, 건강 -3)']]);
        }
        if (opt === 'speak') {
          const lord = byCountry(s, '원님', '현령', '부교');
          if (chance(clampP(0.25 + s.fame * 0.0008))) {
            return say(addFame(addRep(s, { virtue: 3 }), 6), [['나레이션', `가마의 발이 걷히고 ${josa(lord, '이가')} 무인을 내려다보았다. 「…아이를 놓아주어라.」 (명성 +6, 인덕 +3)`]]);
          }
          return say(addRep(addFame(spendDays(s, 1), -4), { virtue: 2 }), [['나레이션', '행차를 막은 죄로 하루를 관아 마당에 꿇어앉아 있었다. 그래도 아이는 무사했다. (명성 -4, 인덕 +2)']]);
        }
        if (opt === 'kneel') return say(s, [['나레이션', '엎드린 채 몽둥이 소리를 들었다. 아이 울음소리가 행렬을 따라 멀어졌다.']]);
        return s;
      },
    },
    {
      id: 'fox',
      w: 0.6,
      build: (s) => {
        const scene = '해가 쨍한데 빗방울이 떨어진다. 숲 속 길로 등불 행렬이 지나가는데, 발소리가 하나도 들리지 않는다.';
        return {
          title: byCountry(s, '여우비 속의 혼례', '여우비 속의 혼례', '여우의 시집가기(狐の嫁入り)'),
          category: 'FANTASY',
          narration: scene,
          script: [
            N(scene),
            N(
              byCountry(
                s,
                '어릴 적 할머니가 그랬다. 여우비 오는 날엔 여우가 시집을 간다고. 그 행렬은 따라가면 안 된다고.',
                '어릴 적 들었다. 해 뜬 날 비가 오면 산에 사는 것들이 혼례를 치른다고. 그 행렬은 따라가면 안 된다고.',
                '어릴 적 들었다. 해 뜬 날 비가 오면 여우가 시집을 간다고. 그 행렬은 보면 안 된다고.'
              )
            ),
          ],
          options: [
            { id: 'follow', label: '행렬을 따라가 본다', hint: '이단 +6 · 무슨 일이 생길지 모른다' },
            { id: 'bow', label: '길을 비키고 고개를 숙인다', hint: '구도 +3 · 정신 +1' },
            { id: 'leave', label: '눈을 감고 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'follow') {
          let n = addRep(s, { arcane: 6 });
          if (chance(0.4)) {
            n = addStats(n, { qi: 1 });
            return say(highlight(n, '여우비 속의 혼례 행렬을 따라갔다'), [
              ['나레이션', '행렬은 큰 바위 앞에서 연기처럼 흩어졌다. 바위 밑에만 젖지 않은 마른 땅이 동그랗게 남아 있었다.'],
              ['나레이션', '그날 밤, 몸속의 기가 이상하게 맑았다. (이단 +6, 영력 +1)'],
            ]);
          }
          n = spendDays(n, 1);
          return say(highlight(n, '여우비 속의 혼례 행렬을 따라갔다'), [['나레이션', '행렬을 따라가다 정신을 차리니 해가 지고 있었다. 하루가 통째로 사라졌다. (이단 +6)']]);
        }
        if (opt === 'bow') {
          return say(addStats(addRep(s, { ascetic: 3 }), { wil: 1 }), [
            ['나레이션', '고개를 숙이고 있자, 행렬 끝의 누군가가 걸음을 멈추고 고개를 끄덕이는 기척이 있었다. 비가 그쳤다. (구도 +3, 정신 +1)'],
          ]);
        }
        return s;
      },
    },
  ],
});

// ───────── 6. 늙은 병사 ─────────
const oldSoldier = sceneEvent({
  key: 'r_old_soldier',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '늙은 군졸', '늙은 병사', '늙은 아시가루'),
  scenes: [
    {
      id: 'war_story',
      build: (s) => {
        const scene = byCountry(
          s,
          '주막 앞 평상에 팔뚝이 칼자국투성이인 노인이 앉아 있다. 압록강 변 진(鎭)에서 삼십 년 수자리를 섰다 한다.',
          '찻집 앞 의자에 한쪽 귀가 없는 노병이 앉아 있다. 젊어서 금천(金川)의 돌탑을 오르던 이야기를 하고 있다.',
          '찻집 툇마루에 허리 굽은 노무사가 앉아 있다. 평생 성문을 지켰는데, 칼을 뽑은 건 딱 한 번이라 한다.'
        );
        return {
          title: byCountry(s, '변방에서 돌아온 노병', '금천(金川) 원정의 노병', '평생 성문을 지킨 노병'),
          category: 'HISTORICAL',
          narration: scene,
          script: [
            N(scene),
            P(
              '노병 영감',
              byCountry(
                s,
                '강 건너온 도적놈들은 칼을 겨누지 않아. 말 위에서 휘두르지. 그러니 발 아래를 봐야 해, 발 아래를.',
                '돌탑 위에서 화살이 비처럼 쏟아졌지. 살아남은 놈들은 하나같이 칼보다 방패를 먼저 들었어.',
                '불난 밤이었소. 도둑 하나가 성문 쪽으로 뛰어왔지. 칼을 뽑는 데 사십 년, 베는 데는 한순간이더이다.'
              ),
              '술잔을 기울이며'
            ),
          ],
          options: [
            { id: 'listen', label: `술 한 사발 사며 이야기를 듣는다 (4${cur(s)})`, hint: '깨달음 · 통찰 +1', ...costly(s, 4) },
            { id: 'kill', label: `술을 사며 사람을 가장 빨리 쓰러뜨리는 법만 캐묻는다 (4${cur(s)})`, hint: '살기 +4 · 통찰 +1', ...costly(s, 4) },
            { id: 'leave', label: '인사만 하고 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'kill') {
          return say(addStats(addRep(addMoney(s, -4), { ruthless: 4 }), { ins: 1 }), [
            [
              '노병 영감',
              byCountry(
                s,
                '…목은 갑옷이 막지. 오금을 끊어. 사람은 다리부터 무너지는 법이야. 그다음은 쉽고.',
                '…방패 든 놈은 발등을 찍어. 고개를 숙이는 순간 끝이야.',
                '…칼은 뽑는 데서 끝나야 하오. 두 번째 칼이 필요한 싸움은 이미 진 싸움이지.'
              ),
            ],
            ['나레이션', '노병의 눈이 잠시 서늘해졌다. 술잔이 빌 때까지 그 말을 몸에 새겼다. (살기 +4, 통찰 +1)'],
          ]);
        }
        if (opt !== 'listen') return s;
        const g = gainInsight(addStats(addMoney(s, -4), { ins: 1 }), 6, '노병의 이야기');
        return say(g.state, [
          [
            '노병 영감',
            byCountry(
              s,
              '칼끝만 보는 놈은 오래 못 가. 늙어 보니 싸움은 다 발이더라.',
              '이긴 싸움에서도 사람은 죽어. 그걸 아는 놈만 오래 살지.',
              '그 한순간을 위해 평생을 닦는 거요. 우스운 일이지요.'
            ),
          ],
          ['나레이션', `노병의 술잔이 빌 때까지 듣고 있었다. (통찰 +1) ${g.text}`],
        ]);
      },
    },
    {
      id: 'one_arm',
      build: (s) => {
        const scene = '장터 어귀에 한쪽 소매가 빈 걸인이 앉아 있다. 남은 손 하나로 낡은 창 자루를 쥐고 있다. 옛날에 군졸이었다고 한다.';
        return {
          title: '외팔이 노병',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('외팔이 걸인 영감', `${sir(s)}, 칼 찬 분이니 아시겠지요. 이 창 자루가 한때는 한 고을을 지켰소이다.`, '창 자루를 쓰다듬으며')],
          options: [
            { id: 'give', label: `노자를 나눈다 (10${cur(s)})`, hint: '인덕 +4', ...costly(s, 10) },
            { id: 'learn', label: '한 팔로 창 쓰는 법을 청한다 (1일)', hint: '장착 초식 숙련 · 통찰 +1' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'give') return say(addRep(addMoney(s, -10), { virtue: 4 }), [['나레이션', '걸인이 창 자루로 땅을 두 번 짚었다. 옛 군영의 예법이었다. (인덕 +4)']]);
        if (opt === 'learn') {
          return say(addStats(trainEquipped(spendDays(s, 1), 45), { ins: 1 }), [
            ['외팔이 걸인 영감', '팔로 돌리는 게 아니오. 허리가 돌면 자루는 따라오지.'],
            ['나레이션', '하루를 따라 해 보니 손목이 한결 가벼워졌다. (장착 초식 숙련 +45, 통찰 +1)'],
          ]);
        }
        return s;
      },
    },
    {
      id: 'drill',
      build: (s) => {
        const scene = '마을 공터에서 늙은 병사가 청년들에게 죽창 쓰는 법을 가르친다. 지나가는 무인을 보자 껄껄 웃으며 손짓한다.';
        return {
          title: '공터의 창술 조련',
          category: 'LIFE',
          sceneActor: 'RIVAL',
          narration: scene,
          script: [N(scene), P('창 든 노병 영감', `거기 칼 찬 ${sir(s)}! 우리 애들한테 진짜 싸움을 한번 보여 주겠소? 이 늙은이하고 한 합.`, '죽창을 땅에 짚으며')],
          options: [
            { id: 'spar', label: '노병과 한 합 겨룬다', hint: '목검 시합' },
            { id: 'teach', label: '청년들에게 칼 막는 법을 가르친다 (1일)', hint: '인덕 +4 · 명성 +5' },
            { id: 'leave', label: '손을 저어 사양한다' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'spar') {
          return journeyBattle(s, c, opt, {
            stakes: 'SPAR',
            title: '마을 공터의 노병',
            subtitle: '죽창 한 자루의 노련함',
            name: '창 든 노병',
            enemyTitle: byCountry(s, '훈련도감 출신 노병', '녹영 출신 노병', '아시가루 출신 노병'),
            age: 64,
            ai: 'OLD_MASTER',
            scale: roadScale(s, 0.85),
            weapon: 'POLEARM',
            skills: spearSkills(s),
            rewardFame: 6,
          });
        }
        if (opt === 'teach') {
          return say(addFame(addRep(spendDays(s, 1), { virtue: 4 }), 5), [
            ['나레이션', `하루 동안 청년들에게 칼날을 흘려보내는 발놀림을 가르쳤다. 저녁에 노병이 ${brew(s)}를 한 동이 내왔다. (인덕 +4, 명성 +5)`],
          ]);
        }
        return s;
      },
      onBattle: (s, _opt, won) => {
        if (won) {
          return say(trainEquipped(s, 30), [
            ['창 든 노병 영감', '허허, 내 창이 녹슬었구먼! 얘들아, 봤지? 저게 진짜다.'],
            ['나레이션', '청년들이 우르르 몰려와 칼 쥐는 법을 물었다. 가르치며 내 칼도 한 번 더 다듬었다. (장착 초식 숙련 +30)'],
          ]);
        }
        return say(addStats(s, { ins: 1 }), [
          ['창 든 노병 영감', '칼이 빠르면 뭐 하나, 창은 길어. 거리를 내주지 마시오.'],
          ['나레이션', '늙은이의 창끝에 세 번이나 가슴을 짚였다. 거리라는 것을 다시 생각했다. (통찰 +1)'],
        ]);
      },
    },
    {
      id: 'never_drew',
      build: (s) => {
        const scene = byCountry(
          s,
          '나무 그늘에서 늙은 포수가 낡은 조총을 닦고 있다. 사십 년을 군영에 있었지만 사람을 향해 쏜 적은 한 번도 없다고 한다.',
          '성벽 아래에서 늙은 병사가 녹슨 창을 닦고 있다. 사십 년을 군영에 있었지만 창으로 사람을 찔러 본 적은 한 번도 없다고 한다.',
          '찻집 처마 아래에서 늙은 무사가 칼을 손질하고 있다. 평생 칼을 차고 다녔지만 한 번도 뽑아 본 적이 없다고 한다.'
        );
        const elder = byCountry(s, '늙은 포수 영감', '늙은 병사 영감', '늙은 무사 영감');
        return {
          title: byCountry(s, '쏘아 본 적 없는 총', '찔러 본 적 없는 창', '뽑아 본 적 없는 칼'),
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(
              elder,
              byCountry(
                s,
                '그런데 말이오, 한 번도 쏘지 않은 총도 총이오? 평생 메고만 다닌 이 쇠붙이가 날 지킨 거요, 내가 이걸 지킨 거요?',
                '그런데 말이오, 한 번도 쓰지 않은 창도 창이오? 평생 들고만 다닌 이 쇠붙이가 날 지킨 거요, 내가 이걸 지킨 거요?',
                '그런데 말이오, 한 번도 뽑지 않은 칼도 칼이오? 평생 차고만 다닌 이 쇠붙이가 날 지킨 거요, 내가 이걸 지킨 거요?'
              ),
              '손질하던 손을 멈추고'
            ),
          ],
          options: [
            { id: 'answer', label: '「쓰지 않아도 되는 세상을 지킨 것」이라 답한다', hint: '구도 +4 · 정신 +1' },
            { id: 'drink', label: '대답 대신 술잔을 채워 준다', hint: '인덕 +2 · 건강 +3' },
          ],
          meta: { elder },
        };
      },
      resolve: (s, opt, c) => {
        const elder = String(c.data?.elder || '늙은 병사 영감');
        if (opt === 'answer') {
          return say(addStats(addRep(s, { ascetic: 4 }), { wil: 1 }), [
            [elder, '…허허, 그거 듣기 좋은 말이구려. 오늘 밤은 편히 자겠소.'],
            ['나레이션', '칼을 뽑지 않는 날들도 수련이었을까. 길을 걸으며 오래 생각했다. (구도 +4, 정신 +1)'],
          ]);
        }
        if (opt === 'drink') return say(addHealth(addRep(s, { virtue: 2 }), 3), [['나레이션', '둘이서 말없이 술병을 비웠다. 노인은 쇠붙이를 무릎에 올려놓은 채 졸았다. (인덕 +2, 건강 +3)']]);
        return s;
      },
    },
  ],
});

// ───────── 7. 이야기꾼 ─────────
const teller = (s: GameState) => byCountry(s, '전기수 영감', '설서인 영감', '강담사 영감');
const tellerPlace = (s: GameState) => byCountry(s, '장터 담벼락 아래', '찻집 한가운데', '요세(寄席) 무대 위');
const storyteller = sceneEvent({
  key: 'r_storyteller',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '전기수(傳奇叟)', '설서인(說書人)', '강담사(講談師)'),
  trigger: { terrain: ['TOWN', 'ROAD', 'TEMPLE', 'COAST'] },
  scenes: [
    {
      id: 'about_you',
      when: (s) => s.fame >= 250,
      build: (s) => {
        const scene = `${tellerPlace(s)}에서 ${josa(teller(s), '이가')} 부채를 탁 치며 목청을 돋운다. 그런데 이야기 속 주인공의 이름이… 「${s.sectName}의 ${s.name}」이다.`;
        return {
          title: '이야기 속의 나',
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(teller(s), `…그때 ${s.name}, 맨손으로 범의 아가리를 찢고 이르기를, 「내 칼은 사람을 베지 않는다!」 하였것다!`, '부채를 활짝 펼치며'),
            N('구경꾼들이 와아, 함성을 지른다. 범을 맨손으로 찢은 기억은 없다.'),
          ],
          options: [
            { id: 'correct', label: '나서서 「그런 일은 없었소」 바로잡는다', hint: '구도 +5 · 명성 -3' },
            { id: 'enjoy', label: '구석에서 끝까지 듣는다', hint: '명성 +6' },
            { id: 'tip', label: `엽전을 던져 주고 조용히 떠난다 (5${cur(s)})`, hint: '명성 +4 · 상무 +2', ...costly(s, 5) },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'correct') {
          return say(addFame(addRep(s, { ascetic: 5 }), -3), [
            [teller(s), '…정말이오? 그럼 오늘부터 범은 빼겠소. 대신 곰으로 하지.'],
            ['나레이션', '구경꾼들이 실망한 얼굴로 흩어졌다. 이상하게 마음이 가벼웠다. (구도 +5, 명성 -3)'],
          ]);
        }
        if (opt === 'enjoy') return say(addFame(s, 6), [['나레이션', '이야기 속의 나는 백 명을 베고 천 명을 살렸다. 끝날 무렵엔 나도 조금 믿고 싶어졌다. (명성 +6)']]);
        if (opt === 'tip') {
          return say(addRep(addFame(addMoney(s, -5), 4), { commerce: 2 }), [['나레이션', '엽전 꾸러미가 부채 위로 떨어지자 이야기꾼이 눈을 동그랗게 떴다. 다음 장터부터 이야기가 더 길어질 것이다. (명성 +4, 상무 +2)']]);
        }
        return s;
      },
    },
    {
      id: 'legend',
      build: (s) => {
        const part = byCountry(
          s,
          '임경업 장군이 압록강 가에서 청나라 군사를 홀로 막아 선 대목',
          '무송이 맨주먹으로 경양강(景陽岡)의 범을 때려잡는 대목',
          '미야모토 무사시가 노를 깎은 목검으로 사사키 고지로를 꺾는 대목'
        );
        const scene = `${tellerPlace(s)}에서 ${josa(teller(s), '이가')} 옛 영웅 이야기를 풀어놓는다. ${part}이다.`;
        return {
          title: byCountry(s, '「임경업전」 한 대목', '「무송 타호(武松打虎)」 한 대목', '「간류지마 결투」 한 대목'),
          category: 'HISTORICAL',
          narration: scene,
          script: [
            N(scene),
            P(
              teller(s),
              byCountry(
                s,
                '장군이 칼을 들어 강 건너를 가리키니, 오랑캐 말들이 일제히 앞발을 들고 울더라!',
                '무송이 주먹을 들어 범의 이마를 내리치니, 한 번, 두 번, 열 번… 경양강이 쩌렁쩌렁 울렸것다!',
                '고지로가 칼집을 바다에 내던지자 무사시가 이르기를, 「고지로, 너는 졌다! 이길 자가 어찌 칼집을 버리느냐!」'
              ),
              '부채로 탁자를 치며'
            ),
          ],
          options: [
            { id: 'listen', label: '끝까지 듣는다', hint: '정신 +1 · 깨달음' },
            { id: 'ask', label: '이야기꾼에게 진짜 검법을 묻는다', hint: '통찰 +1 · 낡은 책을 얻을지도' },
            { id: 'eerie', label: `판이 끝난 뒤 「칼에 서린 요기(妖氣)」 대목을 따로 청한다 (4${cur(s)})`, hint: '이단 +3 · 영력 +1', ...costly(s, 4) },
            { id: 'leave', label: '자리를 뜬다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'listen') {
          const g = gainInsight(addStats(s, { wil: 1 }), 5, '옛 영웅 이야기');
          return say(g.state, [
            [
              '나레이션',
              byCountry(
                s,
                '이야기 속 장군의 칼은 늘 사람을 지키는 쪽을 향해 있었다.',
                '범을 때려잡은 건 주먹이 아니라 물러서지 않은 발이었다.',
                '이기는 자는 칼집을 버리지 않는다. 돌아갈 곳을 버리지 않는다는 뜻일까.'
              ),
            ],
            ['나레이션', `(정신 +1) ${g.text}`],
          ]);
        }
        if (opt === 'eerie') {
          return say(addStats(addRep(addMoney(s, -4), { arcane: 3 }), { qi: 1 }), [
            [
              teller(s),
              byCountry(
                s,
                '장터에선 못 하는 얘기요. 임 장군의 칼은 밤마다 칼집 안에서 혼자 울었다오. 부적을 칭칭 감아 두어야 겨우 잠잠했다지.',
                '찻집에선 못 하는 얘기요. 무송이 범을 잡던 그 밤, 경양강 바위에서 피가 배어 나왔다는 말이 있소. 범이 아니라 산의 정령을 친 거라고들 하지.',
                '무대에선 못 하는 얘기요. 고지로의 장검은 바다에 가라앉은 뒤에도 달밤이면 물 위로 빛을 낸다 하오. 칼에도 넋이 깃드는 법이라오.'
              ),
            ],
            ['나레이션', '농담처럼 들렸다. 그런데 그날 밤, 머리맡에 둔 칼집 속에서 무언가 낮게 우는 소리를 들은 것 같았다. (이단 +3, 영력 +1)'],
          ]);
        }
        if (opt === 'ask') {
          let n = addStats(s, { ins: 1 });
          const id = chance(0.3) ? pickBook(n, (b) => b.countryBias === n.country && b.rarity === 'COMMON') : null;
          if (id) {
            const g = giveBook(n, id, 10);
            n = highlight(g.state, `이야기꾼에게서 ${josa(g.title || '', '을를')} 얻었다`);
            return say(n, [
              [teller(s), '허허, 이야기꾼한테 검법을 묻는 무인은 처음이오. 옛날 어느 손님이 술값 대신 놓고 간 책인데, 내겐 쓸모없으니 가져가시오.'],
              ['나레이션', `${josa(g.title || '', '을를')} 얻었다! (해독 10% 진행, 통찰 +1)`],
            ]);
          }
          return say(n, [
            [teller(s), '검법이라… 이야기 속 칼은 늘 이기지요. 당신 칼은 어떻소?'],
            ['나레이션', '되묻는 말에 바로 대답하지 못했다. (통찰 +1)'],
          ]);
        }
        return s;
      },
    },
    {
      id: 'heckler',
      build: (s) => {
        const scene = `${tellerPlace(s)}에서 ${josa(teller(s), '이가')} 한창 이야기를 풀어놓는데, 술 취한 왈패 하나가 「재미없다!」며 판을 걷어차려 한다.`;
        return {
          title: '판을 엎으려는 왈패',
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P('술 취한 왈패', '에이, 맨날 그 소리! 돈 내놔, 돈! 재미없으면 돈 돌려줘야지!', '비틀거리며', 'ANGRY'),
            P(teller(s), '아이고, 이러시면…', '부채로 머리를 가리며'),
          ],
          options: [
            { id: 'stop', label: '왈패의 손목을 잡아 비튼다', hint: '인덕 +4 · 명성 +4' },
            { id: 'pay', label: `왈패에게 술값을 쥐여 내보낸다 (6${cur(s)})`, hint: '상무 +2', ...costly(s, 6) },
            { id: 'split', label: '왈패와 한통속이 되어 판돈을 나눠 챙긴다', hint: '노자 +10 · 살기 +4 · 명성 -3' },
            { id: 'leave', label: '휘말리기 싫다. 자리를 뜬다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'stop') {
          return say(addFame(addRep(s, { virtue: 4 }), 4), [
            ['나레이션', '손목을 잡아 비틀자 왈패가 무릎을 꿇었다. 구경꾼들이 손뼉을 쳤고, 이야기꾼은 그 자리에서 「협객이 나타났것다!」 하고 새 대목을 지어냈다. (인덕 +4, 명성 +4)'],
          ]);
        }
        if (opt === 'split') {
          return say(addFame(addRep(addMoney(s, 10), { ruthless: 4 }), -3), [
            ['술 취한 왈패', '어이쿠, 말이 통하는 분이구려!'],
            ['나레이션', `이야기꾼의 판돈 그릇을 걷어차 엎었다. 구경꾼들이 슬금슬금 흩어지고, 왈패가 ${zeni(s)}을 반으로 갈라 건넸다. ${josa(teller(s), '은는')} 부채로 얼굴을 가린 채 떨고 있었다. (노자 +10, 살기 +4, 명성 -3)`],
          ]);
        }
        if (opt === 'pay') return say(addRep(addMoney(s, -6), { commerce: 2 }), [['나레이션', `엽전 몇 닢에 왈패는 실실 웃으며 ${byCountry(s, '주막', '술집', '술집')}으로 사라졌다. 이야기가 다시 이어졌다. (상무 +2)`]]);
        return s;
      },
    },
    {
      id: 'sad',
      build: (s) => {
        const part = byCountry(s, '심청이 인당수에 몸을 던지는', '맹강녀가 남편의 뼈를 찾아 만리장성 앞에서 우는', '마흔일곱 낭인이 주군의 원수를 갚고 할복하러 가는');
        const scene = `${tellerPlace(s)}에서 ${josa(teller(s), '이가')} ${part} 대목을 읊는다. 구경꾼들이 소매로 눈물을 찍어 낸다.`;
        return {
          title: byCountry(s, '「심청전」에 우는 장터', '「맹강녀」에 우는 찻집', '「추신구라(忠臣藏)」에 우는 객석'),
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(
              teller(s),
              byCountry(s, '…아버지, 눈을 뜨시오! 이 불효녀는 가옵니다!', '…울음소리에 성이 무너지고, 그 아래 뼈가 드러났것다!', '…눈 덮인 새벽, 마흔일곱의 발자국이 센가쿠지로 이어졌다!'),
              '목이 메어'
            ),
          ],
          options: [
            { id: 'listen', label: '함께 듣는다', hint: '정신 +1 · 인덕 +2' },
            { id: 'more', label: `다음 대목을 청한다 (5${cur(s)})`, hint: '정신 +2', ...costly(s, 5) },
            { id: 'leave', label: '자리를 뜬다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'listen') {
          return say(addRep(addStats(s, { wil: 1 }), { virtue: 2 }), [
            [
              '나레이션',
              byCountry(
                s,
                '눈먼 아비를 위해 몸을 던진 딸 이야기에 장터가 숙연해졌다. (정신 +1, 인덕 +2)',
                '남편을 찾아 천 리를 걸은 여인 이야기에 찻집이 숙연해졌다. (정신 +1, 인덕 +2)',
                '의리를 위해 목숨을 버린 낭인들 이야기에 객석이 숙연해졌다. (정신 +1, 인덕 +2)'
              ),
            ],
          ]);
        }
        if (opt === 'more') {
          return say(addStats(addMoney(s, -5), { wil: 2 }), [['나레이션', '이야기꾼이 남은 대목을 다 풀어놓았을 때는 달이 높이 떠 있었다. 슬픈 이야기인데 이상하게 힘이 났다. (정신 +2)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 8. 유랑 놀이패 ─────────
const troupeName = (s: GameState) => byCountry(s, '남사당패', '잡기단', '유랑 극단');
const troupe = sceneEvent({
  key: 'r_troupe',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '남사당패', '잡기단(雜技團)', '유랑 극단'),
  weight: 0.9,
  trigger: { terrain: ['TOWN', 'ROAD', 'COAST', 'TEMPLE'] },
  scenes: [
    {
      id: 'rope',
      build: (s) => {
        const scene = `${troupeName(s)}의 줄타기 판이 벌어졌다. 그런데 외줄을 묶은 말뚝 하나가 흔들흔들 뽑히려 한다. 줄 위의 광대는 모른다.`;
        return {
          title: byCountry(s, '어름사니의 외줄', '줄꾼의 외줄', '줄타기 광대의 외줄'),
          category: 'LIFE',
          narration: scene,
          script: [N(scene), N('구경꾼들이 숨을 들이켠다. 말뚝이 빠지면 광대는 맨땅으로 떨어진다.')],
          options: [
            { id: 'catch', label: '말뚝 쪽으로 몸을 날린다', hint: `민첩 판정 약 ${pct(0.4 + s.stats.agi * 0.006)} · 인덕 +3` },
            { id: 'leave', label: '지켜본다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'catch') {
          if (chance(clampP(0.4 + s.stats.agi * 0.006))) {
            return say(highlight(addFame(addRep(s, { virtue: 3 }), 10), '놀이판에서 떨어지려던 줄광대를 구했다'), [
              ['나레이션', '말뚝이 빠지는 순간 줄을 움켜쥐고 버텼다. 광대가 줄 위에서 공중제비를 돌아 내려와 큰절을 했다. 판이 뒤집어질 듯 환호가 터졌다. (명성 +10, 인덕 +3)'],
            ]);
          }
          return say(addRep(addHealth(s, -8), { virtue: 3 }), [['나레이션', '줄을 잡았지만 광대와 함께 맨땅에 나뒹굴었다. 둘 다 크게 다치진 않았다. 광대가 먼지를 털며 웃었다. (건강 -8, 인덕 +3)']]);
        }
        return say(s, [['나레이션', '광대가 떨어지기 직전, 줄을 박차고 뛰어올라 허공에서 몸을 뒤집었다. …처음부터 묘기였을까.']]);
      },
    },
    {
      id: 'strong',
      build: (s) => {
        const scene = '웃통을 벗은 차력사가 맷돌을 머리 위로 들어 올렸다가 내려놓는다. 「이 맷돌 드는 사람한테 엽전 스무 닢!」';
        return {
          title: '차력사의 도전',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('차력사 사내', `거기 칼 찬 ${sir(s)}! 칼 말고 힘은 어떠시오? 팔씨름도 좋소!`, '팔뚝을 두드리며')],
          options: [
            { id: 'wrestle', label: '팔씨름으로 겨룬다', hint: `근력 판정 약 ${pct(0.3 + s.stats.str * 0.007)} · 이기면 노자 +20` },
            { id: 'spar', label: '맨손 겨루기를 청한다', hint: '목검 시합' },
            { id: 'crush', label: '팔씨름에서 손목뼈가 우는 소리가 나도록 꺾어 버린다', hint: `근력 판정 약 ${pct(0.45 + s.stats.str * 0.007)} · 살기 +4 · 이기면 노자 +20` },
            { id: 'leave', label: '웃으며 지나간다' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'wrestle') {
          if (chance(clampP(0.3 + s.stats.str * 0.007))) {
            return say(addFame(addMoney(addStats(s, { str: 1 }), 20), 4), [['나레이션', '차력사의 손등이 탁자에 닿았다. 구경꾼들이 엽전을 던졌다. (노자 +20, 명성 +4, 근력 +1)']]);
          }
          return say(addFame(s, -2), [['나레이션', '팔이 넘어갔다. 차력사가 껄껄 웃으며 어깨를 두드렸다. (명성 -2)']]);
        }
        if (opt === 'crush') {
          if (chance(clampP(0.45 + s.stats.str * 0.007))) {
            return say(addFame(addRep(addMoney(s, 20), { ruthless: 4 }), -2), [
              ['나레이션', '우드득. 차력사의 얼굴이 하얗게 질렸다. 판돈을 챙기는 동안 구경꾼들은 박수 대신 숨을 죽였다. 그 팔로 한동안 맷돌은 못 들 것이다. (노자 +20, 살기 +4, 명성 -2)'],
            ]);
          }
          return say(addHealth(addRep(s, { ruthless: 2 }), -4), [['나레이션', '힘으로 꺾으려다 되레 손목이 꺾일 뻔했다. 차력사가 이를 드러내며 웃었다. 「손속이 고약하시구려.」 (살기 +2, 건강 -4)']]);
        }
        if (opt === 'spar') {
          return journeyBattle(s, c, opt, {
            stakes: 'SPAR',
            title: '장터의 차력사',
            subtitle: '맨손 겨루기',
            name: '차력사 사내',
            enemyTitle: byCountry(s, '남사당패 차력사', '잡기단 역사(力士)', '유랑 극단 장사'),
            age: 29,
            ai: 'HEAVY',
            scale: roadScale(s, 0.85),
            weapon: 'UNARMED',
            skills: fistSkills(s),
            rewardFame: 8,
          });
        }
        return s;
      },
      onBattle: (s, _opt, won) => {
        if (won) return say(addHealth(s, 3), [['차력사 사내', '졌소! 오늘 술은 내가 사지!'], ['나레이션', '모래판에 등을 대고 누운 차력사가 호탕하게 웃었다. (건강 +3)']]);
        return say(s, [['나레이션', '맷돌 같은 주먹에 한 대 맞고 나니 하늘이 노랬다.']]);
      },
    },
    {
      id: 'actor',
      build: (s) => {
        const scene = `${troupeName(s)}의 판이 벌어질 참인데, ${byCountry(s, '주연 광대', '주연 광대', '주연 배우')}가 열병으로 쓰러졌다. 구경꾼들은 이미 모여들었다.`;
        return {
          title: byCountry(s, '쓰러진 광대', '쓰러진 광대', '쓰러진 배우'),
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('놀이패 우두머리', `${sir(s)}, 칼 쓰시는 분이면 검무 한 판 어떻소? 판이 깨지면 우리 식구 열둘이 굶소.`, '두 손을 모으며')],
          options: [
            { id: 'perform', label: '판에 서서 검무를 춘다 (1일)', hint: '명성 +10 · 노자 +20 · 상무 +3' },
            { id: 'nurse', label: `쓰러진 이의 약값을 대 준다 (10${cur(s)})`, hint: '인덕 +4', ...costly(s, 10) },
            { id: 'leave', label: '사양하고 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'perform') {
          return say(addRep(addMoney(addFame(spendDays(s, 1), 10), 20), { commerce: 3 }), [
            ['나레이션', '횃불 아래 칼을 뽑았다. 처음엔 어색했으나 장단이 붙자 칼이 저절로 춤을 췄다. 우두머리가 판돈의 절반을 내밀었다. (명성 +10, 노자 +20, 상무 +3)'],
          ]);
        }
        if (opt === 'nurse') {
          return say(addRep(addMoney(s, -10), { virtue: 4 }), [['나레이션', '의원을 불러 약을 지어 주었다. 판은 하루 미뤄졌지만, 놀이패 식구들이 손을 흔들어 배웅했다. (인덕 +4)']]);
        }
        return s;
      },
    },
    {
      id: 'knife',
      build: (s) => {
        const scene = '판자 앞에 선 아이 머리 위로 칼이 날아가 꽂힌다. 칼을 던지는 사내의 손목 놀림이 예사롭지 않다.';
        return {
          title: '비도(飛刀) 묘기',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('비도꾼 사내', '손님, 다음 판에 판자 앞에 서 보시겠소? 칼 찬 분이니 겁은 없으실 테고.', '칼을 손끝에서 돌리며')],
          options: [
            { id: 'learn', label: `손목 쓰는 법을 청한다 (5${cur(s)})`, hint: '민첩 +1 · 장착 초식 숙련', ...costly(s, 5) },
            { id: 'stand', label: '판자 앞에 선다', hint: '정신 +1 · 명성 +5' },
            { id: 'trick', label: `칼이 꽂히기 직전 방향이 꺾이는 것을 보았다 — 비결을 캐묻는다 (5${cur(s)})`, hint: '이단 +4 · 영력 +1', ...costly(s, 5) },
            { id: 'leave', label: '구경만 한다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'learn') {
          return say(trainEquipped(addStats(addMoney(s, -5), { agi: 1 }), 30), [
            ['비도꾼 사내', '팔로 던지면 칼이 흔들리오. 손목은 문고리 돌리듯.'],
            ['나레이션', '반나절을 따라 해 보니 칼끝이 조금 덜 떨렸다. (민첩 +1, 장착 초식 숙련 +30)'],
          ]);
        }
        if (opt === 'trick') {
          return say(addStats(addRep(addMoney(s, -5), { arcane: 4 }), { qi: 1 }), [
            ['비도꾼 사내', '…눈이 밝으시구려. 손목이 아니오. 칼이 손을 떠날 때 숨을 칼에 실어 보내는 거요. 할아비한테 배운 도가(道家)의 수법이라 판에서는 말 안 하지.'],
            ['나레이션', '그날 밤 내내 숨을 칼끝에 싣는 연습을 했다. 열 번에 한 번쯤, 던진 돌멩이가 끝에서 살짝 휘었다. (이단 +4, 영력 +1)'],
          ]);
        }
        if (opt === 'stand') {
          return say(addFame(addStats(s, { wil: 1 }), 5), [['나레이션', '칼 세 자루가 귀밑, 겨드랑이, 다리 사이에 꽂혔다. 눈 한 번 깜박이지 않자 구경꾼들이 와 하고 소리쳤다. (정신 +1, 명성 +5)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 9. 사냥꾼 ─────────
const hunterName = (s: GameState) => byCountry(s, '산포수 사내', '사냥꾼 사내', '사냥꾼 사내');
const hunter = sceneEvent({
  key: 'r_hunter',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '산포수', '사냥꾼', '사냥꾼(猟師)'),
  trigger: { terrain: ['FOREST', 'MOUNTAIN', 'PASS', 'RIVER'] },
  scenes: [
    {
      id: 'trap',
      build: () => {
        const scene = '올무에 걸린 어미 사슴이 버둥거린다. 덤불 뒤에서 새끼 사슴이 오도 가도 못하고 울고 있다.';
        return {
          title: '올무에 걸린 어미 사슴',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'free', label: '올무를 풀어 준다', hint: '인덕 +3 · 구도 +3' },
            { id: 'kill', label: '어미 사슴의 숨통을 끊어 고기와 가죽을 챙긴다', hint: '노자 +12 · 건강 +4 · 살기 +4' },
            { id: 'leave', label: '사냥꾼의 몫이다. 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'kill') {
          return say(addHealth(addRep(addMoney(s, 12), { ruthless: 4 }), 4), [
            ['나레이션', '칼끝 한 번에 어미 사슴이 늘어졌다. 고기는 그날 저녁이 되었고, 가죽은 다음 장터에서 값을 받았다. 새끼 사슴의 울음이 고개 너머까지 따라왔다. (노자 +12, 건강 +4, 살기 +4)'],
          ]);
        }
        if (opt !== 'free') return s;
        const n = addRep(s, { virtue: 3, ascetic: 3 });
        if (chance(0.3)) {
          return say(n, [
            ['나레이션', '올무를 풀자 사슴이 새끼를 데리고 숲으로 뛰었다.'],
            [hunterName(s), '어허, 그거 내 올무인데! …에잇, 새끼 딸린 걸 잡을 생각은 없었소. 됐소.'],
            ['나레이션', '(인덕 +3, 구도 +3)'],
          ]);
        }
        return say(n, [['나레이션', '올무를 풀자 사슴이 새끼를 데리고 숲으로 뛰었다. 두어 번 돌아보더니 사라졌다. (인덕 +3, 구도 +3)']]);
      },
    },
    {
      id: 'tracks',
      build: (s, c) => {
        const beast = c.region?.beast.name || '산짐승';
        const who = byCountry(s, '산포수', '사냥꾼', '사냥꾼');
        const scene = `${josa(who, '이가')} 눈을 가늘게 뜨고 흙바닥의 발자국을 짚는다. 마을 소를 물어 간 ${beast}의 흔적이라 한다.`;
        return {
          title: '발자국을 쫓는 사냥꾼',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(hunterName(s), `${sir(s)}, 칼 솜씨 좀 빌립시다. 혼자 쫓기엔 놈이 너무 크오.`, byCountry(s, '화승총을 둘러메며', '활을 둘러메며', '화승총을 둘러메며'))],
          options: [
            { id: 'join', label: '함께 쫓는다 (2일)', hint: '⚠ 맹수와 맞닥뜨릴 수 있다 · 민첩 +1 · 통찰 +1' },
            { id: 'advice', label: '짐승이 다닐 만한 길목만 일러 준다', hint: '통찰 +1' },
            { id: 'leave', label: '갈 길이 바쁘다' },
          ],
          meta: { beast, beastTitle: c.region?.beast.title || '마을 소를 물어 간 짐승' },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'join') {
          const beast = String(c.data?.beast || '산짐승');
          const n = addStats(spendDays(s, 2), { agi: 1, ins: 1 });
          if (chance(0.45)) {
            return journeyBattle(say(n, [['나레이션', `이튿날 새벽, 바위 그늘에서 ${josa(beast, '이가')} 몸을 일으켰다!`]]), c, opt, {
              stakes: 'HOSTILE',
              title: `사냥 — ${beast}`,
              subtitle: String(c.data?.beastTitle || '마을 소를 물어 간 짐승'),
              name: beast,
              enemyTitle: String(c.data?.beastTitle || '맹수'),
              age: 9,
              ai: 'HEAVY',
              scale: roadScale(s, 0.9),
              weapon: 'UNARMED',
              skills: ['sk_kr_03', 'sk_cn_01', 'sk_we_04'],
              rewardMoney: 15,
              rewardFame: 15,
            });
          }
          return say(n, [
            ['나레이션', '이틀을 쫓았으나 발자국은 개울에서 끊겼다.'],
            [hunterName(s), '영물이오, 저놈은. 오늘은 놓아줍시다.'],
            ['나레이션', '짐승의 길을 읽는 법만은 몸에 남았다. (민첩 +1, 통찰 +1)'],
          ]);
        }
        if (opt === 'advice') {
          return say(addStats(s, { ins: 1 }), [['나레이션', '바람 방향과 물 마시는 자리를 일러 주자 사냥꾼이 고개를 끄덕였다. 「칼잡이가 짐승 길도 아는구려.」 (통찰 +1)']]);
        }
        return s;
      },
      onBattle: (s, _opt, won, c) => {
        const beast = String(c.data?.beast || '산짐승');
        if (!won) return say(s, [['나레이션', `${byCountry(s, '사냥꾼의 총소리에', '사냥꾼의 화살에', '사냥꾼의 총소리에')} 짐승이 달아났다. 피투성이가 된 채 사냥꾼의 부축을 받아 산을 내려왔다.`]]);
        return say(highlight(addRep(addFame(s, 10), { virtue: 3 }), `사냥꾼과 함께 ${josa(beast, '을를')} 잡았다`), [
          ['나레이션', '짐승이 쓰러지자 사냥꾼이 달려와 숨통을 확인했다.'],
          [hunterName(s), '마을 사람들이 잔치를 하겠소! 가죽은 당신 몫이오.'],
          ['나레이션', '(명성 +10, 인덕 +3)'],
        ]);
      },
    },
    {
      id: 'injured',
      build: (s) => {
        const scene = '벼랑 아래에서 신음 소리가 들린다. 사냥꾼 하나가 다리가 꺾인 채 쓰러져 있다. 화살이 사방에 흩어져 있다.';
        return {
          title: '벼랑 아래의 사냥꾼',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(hunterName(s), '…발을 헛디뎠소. 마을까지 반나절인데, 이 다리로는…', '이를 악물며')],
          options: [
            { id: 'carry', label: '업고 마을까지 간다 (1일)', hint: '건강 -6 · 인덕 +6' },
            { id: 'splint', label: '부목을 대 주고 마을에 사람을 부르러 간다', hint: '인덕 +3 · 통찰 +1' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'carry') {
          return say(addHealth(addRep(addHealth(spendDays(s, 1), -6), { virtue: 6 }), 8), [
            ['나레이션', '사냥꾼을 업고 하루를 걸었다. 마을 사람들이 몰려나왔다. (건강 -6, 인덕 +6)'],
            ['나레이션', '사냥꾼의 늙은 어미가 아껴 둔 웅담 한 조각을 내왔다. 먹고 나니 기운이 돌았다. (건강 +8)'],
          ]);
        }
        if (opt === 'splint') {
          return say(addStats(addRep(s, { virtue: 3 }), { ins: 1 }), [['나레이션', '나뭇가지로 부목을 대고 칡넝쿨로 묶었다. 마을로 달려가 장정들을 불러왔다. (인덕 +3, 통찰 +1)']]);
        }
        return s;
      },
    },
    {
      id: 'stall',
      build: (s) => {
        const scene = `고갯마루 쉼터에 사냥꾼이 좌판을 폈다. 녹용, 곰 기름, 말린 꿩, 그리고 웬 ${byCountry(s, '호랑이', '호랑이', '곰')} 발톱 목걸이까지.`;
        return {
          title: '사냥꾼의 좌판',
          category: 'LIFE',
          sceneActor: 'MERCHANT',
          narration: scene,
          script: [N(scene), P(hunterName(s), `녹용 한 첩이면 겨우내 고뿔 한 번 안 걸리오. 35${cur(s)}만 내시오.`, '녹용을 흔들며')],
          options: [
            { id: 'buy', label: `녹용을 산다 (35${cur(s)})`, hint: '건강 +12 · 체력 +1', ...costly(s, 35) },
            { id: 'trade', label: '칼 다루는 법과 짐승 읽는 법을 바꾼다', hint: '통찰 +1 · 인덕 +2' },
            { id: 'leave', label: '구경만 하고 간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'buy') return say(addStats(addHealth(addMoney(s, -35), 12), { vit: 1 }), [['나레이션', '녹용을 달여 먹자 뱃속이 뜨끈해졌다. (건강 +12, 체력 +1)']]);
        if (opt === 'trade') {
          return say(addRep(addStats(s, { ins: 1 }), { virtue: 2 }), [['나레이션', '사냥꾼에게 칼 쥐는 법을 일러 주고, 그에게서 발자국 깊이로 짐승의 무게를 재는 법을 배웠다. (통찰 +1, 인덕 +2)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 10. 파발·역참 ─────────
const courierNoun = (s: GameState) => byCountry(s, '파발꾼', '역졸', '히캬쿠(飛脚)');
const courier = sceneEvent({
  key: 'r_courier',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '파발꾼', '역참의 역졸', '히캬쿠(飛脚)'),
  trigger: { terrain: ['ROAD', 'PASS', 'TOWN', 'RIVER', 'FOREST'] },
  scenes: [
    {
      id: 'exhausted',
      build: (s) => {
        const scene = `길가에 ${josa(courierNoun(s), '이가')} 쓰러져 있다. 다리가 풀려 일어서지 못하는데, 품에 든 급보만은 꼭 쥐고 있다.`;
        return {
          title: `쓰러진 ${courierNoun(s)}`,
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(`쓰러진 ${courierNoun(s)}`, `${sir(s)}… 이 서찰을 다음 역참까지만… 해 지기 전에 닿아야 하오.`, '숨을 몰아쉬며')],
          options: [
            { id: 'deliver', label: '대신 달려 준다 (2일)', hint: '명성 +8 · 인덕 +4 · 체력 +1' },
            { id: 'help', label: '물과 주먹밥을 먹이고 부축해 일으킨다', hint: '인덕 +3' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'deliver') {
          return say(addStats(addFame(addRep(spendDays(s, 2), { virtue: 4 }), 8), { vit: 1 }), [
            ['나레이션', '서찰을 품고 이틀 길을 하루 반에 달렸다. 역참의 관리가 날짜를 확인하더니 눈이 휘둥그레졌다. (명성 +8, 인덕 +4, 체력 +1)'],
          ]);
        }
        if (opt === 'help') {
          return say(addRep(s, { virtue: 3 }), [['나레이션', `물을 먹이고 주먹밥을 쥐여 주자 ${josa(courierNoun(s), '이가')} 다시 일어섰다. 비틀거리며 달려가는 뒷모습에 고개를 끄덕였다. (인덕 +3)`]]);
        }
        return s;
      },
    },
    {
      id: 'attacked',
      build: (s) => {
        const scene = `${josa(courierNoun(s), '이가')} 피를 흘리며 쓰러져 있다. 서찰 통이 비어 있다. 숲 속으로 발자국이 어지럽게 이어진다.`;
        return {
          title: `습격당한 ${courierNoun(s)}`,
          category: 'DUEL',
          narration: scene,
          script: [N(scene), P(`다친 ${courierNoun(s)}`, '서… 서찰을 빼앗겼소. 저놈들, 관아 문서를 노린 거요…', '피 묻은 손으로 숲을 가리키며')],
          options: [
            { id: 'chase', label: '발자국을 쫓는다', hint: '⚠ 진검승부 · 이기면 명성 +12' },
            { id: 'carry', label: '다친 이를 역참까지 데려간다 (1일)', hint: '인덕 +5' },
            { id: 'leave', label: '관아 일에 끼지 않는다' },
          ],
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'chase') {
          return journeyBattle(s, c, opt, {
            stakes: 'HOSTILE',
            title: '서찰을 빼앗은 자',
            subtitle: '관아 문서를 노린 자객',
            name: '복면의 자객',
            enemyTitle: '문서를 노리는 자',
            age: 32,
            ai: 'RUSHDOWN',
            scale: roadScale(s, 0.95),
            weapon: 'BLADE',
            skills: ['sk_cn_07', 'sk_jp_07', 'base_h_slash'],
            rewardMoney: 30,
            rewardFame: 12,
          });
        }
        if (opt === 'carry') return say(addRep(spendDays(s, 1), { virtue: 5 }), [['나레이션', '다친 이를 업고 역참까지 갔다. 역참 사람들이 의원을 불렀다. (인덕 +5)']]);
        return s;
      },
      onBattle: (s, _opt, won) => {
        if (!won) return say(s, [['나레이션', '자객은 서찰을 품은 채 숲으로 사라졌다.']]);
        return say(highlight(addRep(s, { virtue: 3 }), '빼앗긴 관아 서찰을 되찾았다'), [['나레이션', '자객의 품에서 서찰 통을 되찾았다. 역참 관리가 포상금을 내리며 이름을 적어 갔다. (인덕 +3)']]);
      },
    },
    {
      id: 'letter',
      build: (s) => {
        const scene = `비단 끈으로 묶은 서찰 하나가 길 위에 떨어져 있다. 겉봉에 큰 상단의 인장이 찍혀 있다. 급히 달려간 ${josa(courierNoun(s), '이가')} 흘린 모양이다.`;
        return {
          title: '길에 떨어진 서찰',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'return', label: '다음 역참에 맡긴다 (1일)', hint: '인덕 +3 · 명성 +3' },
            { id: 'read', label: '뜯어 읽어 본다', hint: '상무 +5 · 노자 +20' },
            { id: 'ransom', label: '서찰을 쥐고 상단에 값을 부른다 (1일)', hint: '노자 +35 · 살기 +5 · 명성 -3' },
            { id: 'leave', label: '그대로 둔다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'return') {
          return say(addFame(addRep(spendDays(s, 1), { virtue: 3 }), 3), [
            ['나레이션', '역참에 서찰을 맡기자 이튿날 상단 사람이 찾아와 고개를 숙였다. 「이 서찰이 없어졌으면 큰일 날 뻔했습니다.」 (인덕 +3, 명성 +3)'],
          ]);
        }
        if (opt === 'ransom') {
          return say(addFame(addRep(addMoney(spendDays(s, 1), 35), { ruthless: 5 }), -3), [
            ['상단 서기', '…길에서 주운 걸로 장사를 하시는구려. 받으시오.'],
            ['나레이션', '상단 사람이 이를 갈며 은자를 세어 내놓았다. 서찰을 건네자 그는 땅에 침을 뱉고 돌아섰다. (노자 +35, 살기 +5, 명성 -3)'],
          ]);
        }
        if (opt === 'read') {
          return say(addRep(addMoney(s, 20), { commerce: 5 }), [
            ['나레이션', '「가을 쌀을 모조리 사들일 것」 — 상단의 매점 계획이었다. 다음 장터에서 그 셈을 써먹었다. 남의 서찰을 뜯은 손이 찜찜했다. (상무 +5, 노자 +20)'],
          ]);
        }
        return s;
      },
    },
    {
      id: 'race',
      build: (s) => {
        const scene = '역참 마당에서 발 빠른 사내들이 다음 역참까지 누가 먼저 닿나 내기를 건다. 판돈이 제법 쌓였다.';
        return {
          title: '역참의 내기 달리기',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('역참 사내', `칼 찬 ${sir(s)}도 한번 뛰어 보시려우? 판돈은 10${cur(s)}!`, '종아리를 두드리며')],
          options: [
            { id: 'race', label: `내기에 끼어 달린다 (10${cur(s)})`, hint: `체력 판정 약 ${pct(0.3 + (s.stats.vit + s.stats.agi) * 0.004)} · 이기면 노자 +30`, ...costly(s, 10) },
            { id: 'leave', label: '구경만 한다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt !== 'race') return s;
        const n = addMoney(s, -10);
        if (chance(clampP(0.3 + (s.stats.vit + s.stats.agi) * 0.004))) {
          return say(addStats(addFame(addMoney(n, 30), 4), { vit: 1 }), [['나레이션', '마지막 고개에서 앞선 사내를 따라잡았다. 역참 사람들이 판돈을 모아 주었다. (노자 +30, 명성 +4, 체력 +1)']]);
        }
        return say(addHealth(n, -4), [['나레이션', '숨이 턱까지 찼다. 역참 사내들은 역시 역참 사내들이었다. (노자 -10, 건강 -4)']]);
      },
    },
  ],
});

// ───────── 11. 노름판 ─────────
const gamble = sceneEvent({
  key: 'r_gamble',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '투전판', '도박판', '초한(丁半) 노름판'),
  weight: 0.8,
  trigger: { terrain: ['TOWN', 'ROAD', 'COAST', 'RIVER'] },
  scenes: [
    {
      id: 'dice',
      build: (s) => {
        const scene = byCountry(
          s,
          '주막 뒷방에서 투전판이 벌어졌다. 물주가 패를 돌리는 손놀림이 지나치게 매끄럽다.',
          '객잔 뒤뜰에서 주사위 판이 벌어졌다. 판주의 사발이 바닥에 닿는 소리가 매번 조금씩 다르다.',
          '여관 뒷방에서 초한 노름이 한창이다. 사발을 엎는 판주의 손목이 수상하다.'
        );
        return {
          title: byCountry(s, '투전판의 속임수', '주사위 판의 속임수', '초한 노름판의 속임수'),
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(byCountry(s, '투전판 물주', '도박판 판주', '노름판 판주'), '자자, 손님도 한판 거시오! 오늘은 운이 손님 편이오!', '손바닥을 비비며')],
          options: [
            { id: 'bet', label: `한판 건다 (10${cur(s)})`, hint: '이기면 판돈의 세 배', ...costly(s, 10) },
            { id: 'expose', label: '속임수를 들춘다', hint: `통찰 판정 약 ${pct(0.3 + s.stats.ins * 0.006)} · 인덕 +3` },
            { id: 'sweep', label: `${byCountry(s, '물주', '판주', '판주')}의 손목을 비틀고 판돈을 통째로 쓸어 담는다`, hint: '노자 +25 · 살기 +5 · 명성 -2' },
            { id: 'leave', label: '노름판에는 끼지 않는다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'bet') {
          const n = addMoney(s, -10);
          if (chance(0.4)) return say(addMoney(n, 30), [['나레이션', '판이 끝나자 엽전이 수북했다. 물주의 눈빛이 싸늘해지기 전에 서둘러 일어섰다. (노자 +20)']]);
          return say(n, [['나레이션', `두 판 만에 판돈이 사라졌다. ${byCountry(s, '물주', '판주', '판주')}가 웃었다. (노자 -10)`]]);
        }
        if (opt === 'sweep') {
          return say(addFame(addRep(addMoney(s, 25), { ruthless: 5 }), -2), [
            ['나레이션', `${byCountry(s, '물주', '판주', '판주')}의 손목에서 뼈 소리가 났다. ${zeni(s)}을 쓸어 담는 동안 노름꾼 누구도 일어서지 못했다. (노자 +25, 살기 +5, 명성 -2)`],
          ]);
        }
        if (opt === 'expose') {
          if (chance(clampP(0.3 + s.stats.ins * 0.006))) {
            return say(addFame(addRep(addMoney(s, 20), { virtue: 3 }), 4), [
              ['나레이션', `${byCountry(s, '물주', '판주', '판주')}의 소매를 잡아 털자 숨긴 ${byCountry(s, '패', '주사위', '주사위')}가 우수수 떨어졌다. 털린 사람들이 판돈을 나눠 가지며 한몫을 떼어 주었다. (노자 +20, 인덕 +3, 명성 +4)`],
            ]);
          }
          return say(addFame(s, -3), [['나레이션', '소매를 잡았지만 아무것도 나오지 않았다. 노름꾼들에게 떠밀려 쫓겨났다. (명성 -3)']]);
        }
        return s;
      },
    },
    {
      id: 'fight_bet',
      build: (s) => {
        const scene = byCountry(
          s,
          '장터 한구석에 사람들이 빙 둘러섰다. 볏이 찢긴 수탉 두 마리가 서로를 노려본다.',
          '찻집 탁자 위 질항아리 속에서 귀뚜라미 두 마리가 더듬이를 맞대고 있다. 구경꾼들이 은자를 건다.',
          '신사 뒤뜰에 사람들이 빙 둘러섰다. 싸움닭 두 마리가 깃털을 곤두세운다.'
        );
        return {
          title: byCountry(s, '닭싸움 내기판', '귀뚜라미 싸움 내기판', '투계(鬪鷄) 내기판'),
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('내기꾼 사내', '어느 쪽에 거시겠소? 붉은 놈이 사흘째 무패요!', '목소리를 높이며')],
          options: [
            { id: 'bet', label: `소문난 쪽에 건다 (10${cur(s)})`, hint: '반반 · 이기면 판돈의 두 배', ...costly(s, 10) },
            { id: 'read', label: `둘의 움직임을 지켜보고 건다 (10${cur(s)})`, hint: `통찰 판정 약 ${pct(0.45 + s.stats.ins * 0.004)} · 이기면 판돈의 두 배`, ...costly(s, 10) },
            { id: 'leave', label: '구경만 한다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'bet' || opt === 'read') {
          const n = addMoney(s, -10);
          const won = opt === 'read' ? chance(clampP(0.45 + s.stats.ins * 0.004)) : chance(0.5);
          if (won) {
            return opt === 'read'
              ? say(addStats(addMoney(n, 20), { ins: 1 }), [['나레이션', '덜 움직이는 쪽이 이겼다. 칼싸움도 그렇다. (노자 +10, 통찰 +1)']])
              : say(addMoney(n, 20), [['나레이션', '소문난 놈이 이겼다. 엽전이 두 배가 되어 돌아왔다. (노자 +10)']]);
          }
          return say(n, [['나레이션', '눈으로 본 것과 판은 달랐다. 엽전이 남의 주머니로 갔다. (노자 -10)']]);
        }
        return s;
      },
    },
    {
      id: 'sword_bet',
      build: (s) => {
        const scene = '노름판에 넋이 나간 무사가 마지막 판돈으로 허리의 칼을 풀어 놓았다. 손이 떨린다.';
        return {
          title: '칼을 판돈으로 건 무사',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('빈털터리 무사', '…이번 판만 이기면 다 찾을 수 있소. 이 칼은 아버님께서 물려주신…', '칼집을 쓰다듬으며')],
          options: [
            { id: 'redeem', label: `판돈을 대신 갚고 칼을 돌려준다 (40${cur(s)})`, hint: '인덕 +5 · 깨달음', ...costly(s, 40) },
            { id: 'win', label: `맞은편에 앉아 그 칼을 따 낸다 (20${cur(s)})`, hint: `통찰 판정 약 ${pct(0.35 + s.stats.ins * 0.005)} · 칼을 얻는다 · 살기 +3`, ...costly(s, 20) },
            { id: 'leave', label: '자리를 뜬다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'redeem') {
          const g = gainInsight(addRep(addMoney(s, -40), { virtue: 5 }), 5, '무사의 칼');
          return say(g.state, [
            ['빈털터리 무사', '…이 은혜를 무엇으로 갚겠소. 가진 게 없으니 아버님께 배운 말 한 줄을 드리리다. 「칼은 손이 아니라 허리가 뽑는다.」'],
            ['나레이션', `(인덕 +5) ${g.text}`],
          ]);
        }
        if (opt === 'win') {
          const n = addMoney(s, -20);
          if (chance(clampP(0.35 + s.stats.ins * 0.005))) {
            const w = giveWeapon(n, oldBlade(n));
            const m = addRep(w.state, { ruthless: 3 });
            if (w.name) {
              return say(highlight(m, `노름판에서 「${w.name}」을(를) 따 냈다`), [
                ['나레이션', `판이 끝났다. 무사가 떨리는 손으로 칼을 내밀었다. 「${w.name}」. 그의 눈을 똑바로 보지 못했다. (살기 +3)`],
              ]);
            }
            return say(addMoney(m, 40), [['나레이션', '판을 따 냈지만 이미 같은 칼이 있었다. 칼은 돌려주고 판돈만 챙겼다. (노자 +20, 살기 +3)']]);
          }
          return say(n, [['나레이션', '패가 등을 돌렸다. 무사는 칼을 껴안고 엎드려 울었다. 나는 판돈만 잃었다. (노자 -20)']]);
        }
        return s;
      },
    },
    {
      id: 'debtor',
      build: (s) => {
        const scene = '노름판 뒷마당에서 왈패들이 한 사내를 두들겨 팬다. 사내의 어린 아들이 바짓가랑이를 붙잡고 운다.';
        return {
          title: '노름빚에 매 맞는 사내',
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P('빚 받는 왈패', `빚 30${cur(s)} 갚을 때까지 매일 이렇게 맞는 거여!`, '주먹을 털며', 'ANGRY'),
            P('어린 아들 소년', '아버지 때리지 마요!', '울며'),
          ],
          options: [
            { id: 'pay', label: `빚을 대신 갚는다 (30${cur(s)})`, hint: '인덕 +5', ...costly(s, 30) },
            { id: 'drive', label: '왈패들을 쫓아낸다', hint: '인덕 +3 · 살기 +2' },
            { id: 'scold', label: '사내에게 노름을 끊으라 호통친다', hint: '구도 +2' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'pay') {
          return say(addRep(addMoney(s, -30), { virtue: 5 }), [
            ['나레이션', '빚을 갚아 주자 왈패들이 침을 뱉고 돌아갔다.'],
            ['매 맞던 사내', '다시는… 다시는 노름판에 안 가겠소.'],
            ['나레이션', '그 말을 믿을지는 저 아이에게 달렸다. (인덕 +5)'],
          ]);
        }
        if (opt === 'drive') {
          return say(addRep(s, { virtue: 3, ruthless: 2 }), [['나레이션', '칼집으로 두목의 정강이를 후려치자 왈패들이 흩어졌다. 빚은 그대로지만, 오늘 밤은 아이가 아비를 부축해 집에 갈 수 있다. (인덕 +3, 살기 +2)']]);
        }
        if (opt === 'scold') {
          return say(addRep(s, { ascetic: 2 }), [['나레이션', '「네 손에 쥘 것은 노름 패가 아니라 저 아이의 손이다!」 사내가 고개를 떨궜다. 왈패들도 머쓱해져 물러났다. (구도 +2)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 12. 길가에 쓰러진 사람 ─────────
const sickTraveler = sceneEvent({
  key: 'r_sick_traveler',
  kind: 'PEOPLE',
  label: () => '길가에 쓰러진 사람',
  scenes: [
    {
      id: 'fever',
      build: (s) => {
        const scene = '길가 정자에 나그네 하나가 누워 끙끙 앓는다. 이마가 불덩이다.';
        return {
          title: '열병 걸린 나그네',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('앓는 나그네', '물… 물 좀…', '입술이 갈라진 채')],
          options: [
            { id: 'nurse', label: '하루 곁에서 간호한다 (1일)', hint: '인덕 +6 · 옮을 수도 있다' },
            { id: 'medicine', label: `약값을 쥐여 주고 마을에 알린다 (12${cur(s)})`, hint: '인덕 +4', ...costly(s, 12) },
            { id: 'qi', label: '혈자리에 손을 얹고 기를 밀어 넣어 열을 끌어내 본다', hint: '이단 +3 · 영력 +1' },
            { id: 'rob', label: '앓는 나그네의 봇짐을 뒤져 쓸 만한 것을 챙긴다', hint: '노자 +15 · 살기 +5' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'nurse') {
          const n = addRep(spendDays(s, 1), { virtue: 6 });
          if (chance(0.25)) return say(addHealth(n, -8), [['나레이션', '밤새 찬 수건을 갈아 주었다. 새벽에 열이 내렸다. 대신 내 몸이 으슬으슬하다. (인덕 +6, 건강 -8)']]);
          return say(n, [['나레이션', '밤새 찬 수건을 갈아 주었다. 새벽에 나그네가 눈을 뜨고 「어머니…」 하고 중얼거렸다. (인덕 +6)']]);
        }
        if (opt === 'qi') {
          const n = addStats(addRep(s, { arcane: 3 }), { qi: 1 });
          return chance(0.5)
            ? say(n, [['나레이션', '이마와 손목 혈자리에 손바닥을 얹고 기를 밀어 넣었다. 손바닥이 불에 덴 듯 뜨거워지더니, 새벽녘 나그네의 열이 거짓말처럼 내렸다. 기가 통한 걸까, 운이 좋았던 걸까. (이단 +3, 영력 +1)']])
            : say(n, [['나레이션', '기를 밀어 넣을수록 손바닥만 뜨거워졌다. 열은 내리지 않았다. 마을에 사람을 보내 의원을 불렀다. (이단 +3, 영력 +1)']]);
        }
        if (opt === 'rob') {
          return say(addRep(addMoney(s, 15), { ruthless: 5 }), [
            ['나레이션', `봇짐 속에 ${zeni(s)} 꾸러미와 마른 육포가 들어 있었다. 나그네는 눈을 뜨지 못했다. 돌아서는 등 뒤로 「물…」 하는 소리가 들렸다. (노자 +15, 살기 +5)`],
          ]);
        }
        if (opt === 'medicine') return say(addRep(addMoney(s, -12), { virtue: 4 }), [['나레이션', '마을 약방에 약값을 맡기고 사람을 보내 달라 일렀다. (인덕 +4)']]);
        return s;
      },
    },
    {
      id: 'snake',
      when: (s) => s.season !== 'WINTER',
      build: () => {
        const scene = '나뭇짐을 진 사내가 종아리를 움켜쥐고 쓰러져 있다. 이빨 자국 두 개 주위가 시퍼렇게 부어오른다.';
        return {
          title: '독사에 물린 나무꾼',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('나무꾼 사내', '살무사요… 다리가… 다리가 안 움직이오.', '식은땀을 흘리며')],
          options: [
            { id: 'cut', label: '상처를 째고 독을 빨아낸다', hint: '건강 -5 · 인덕 +6' },
            { id: 'carry', label: '다리를 동여매고 업어서 마을로 뛴다 (1일)', hint: '건강 -3 · 인덕 +5' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'cut') {
          return say(addRep(addHealth(s, -5), { virtue: 6 }), [['나레이션', '칼끝으로 상처를 열십자로 째고 검은 피를 빨아 뱉었다. 입안이 얼얼했다. 나무꾼의 다리에 핏기가 돌아왔다. (건강 -5, 인덕 +6)']]);
        }
        if (opt === 'carry') {
          return say(addRep(addHealth(spendDays(s, 1), -3), { virtue: 5 }), [['나레이션', '허벅지를 동여매고 업어서 달렸다. 마을 의원이 「조금만 늦었어도…」 하며 혀를 찼다. (건강 -3, 인덕 +5)']]);
        }
        return s;
      },
    },
    {
      id: 'labor',
      build: () => {
        const scene = '배가 부른 아낙이 길가 나무에 기대어 신음한다. 친정에 가던 길이라는데, 산기가 시작되었다.';
        return {
          title: '길에서 산기가 든 아낙',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('만삭의 아낙', '아이고… 마을까지 못 가겠어요… 산파 좀…', '배를 감싸 쥐며')],
          options: [
            { id: 'fetch', label: '산파를 업어 온다 (1일)', hint: '인덕 +6 · 명성 +4' },
            { id: 'guard', label: '바람막이를 치고 곁을 지킨다', hint: '인덕 +4 · 정신 +1' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'fetch') {
          return say(highlight(addFame(addRep(spendDays(s, 1), { virtue: 6 }), 4), '길에서 해산하는 아낙에게 산파를 업어 왔다'), [
            ['나레이션', '산파를 업고 산길을 달렸다. 해 질 녘, 나무 아래에서 우렁찬 울음소리가 터졌다. 아낙이 아이 이름에 내 이름 한 자를 넣겠다고 했다. (인덕 +6, 명성 +4)'],
          ]);
        }
        if (opt === 'guard') {
          return say(addStats(addRep(s, { virtue: 4 }), { wil: 1 }), [['나레이션', '겉옷을 벗어 바람막이를 치고 등을 돌린 채 곁을 지켰다. 지나던 아낙들이 달려와 아이를 받았다. 칼을 쥘 때보다 손이 더 떨렸다. (인덕 +4, 정신 +1)']]);
        }
        return s;
      },
    },
    {
      id: 'heat',
      when: (s) => s.season === 'SUMMER',
      build: () => {
        const scene = '뙤약볕 아래 짐을 진 노인이 비틀거리다 쓰러졌다. 얼굴이 시뻘겋고 숨이 가쁘다.';
        return {
          title: '더위 먹은 노인',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('쓰러진 노인', '…괜찮소, 괜찮아… 잠깐 어지러워서…', '헐떡이며')],
          options: [
            { id: 'shade', label: '그늘로 옮기고 물을 먹인다', hint: '인덕 +3 · 통찰 +1' },
            { id: 'carry', label: '짐을 대신 지고 마을까지 모셔다 드린다 (1일)', hint: '인덕 +5 · 건강 -3' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'shade') {
          return say(addStats(addRep(s, { virtue: 3 }), { ins: 1 }), [['나레이션', '나무 그늘에 눕히고 물에 적신 수건으로 목덜미를 식혔다. 노인의 숨이 고르게 돌아왔다. (인덕 +3, 통찰 +1)']]);
        }
        if (opt === 'carry') {
          return say(addRep(addHealth(spendDays(s, 1), -3), { virtue: 5 }), [['나레이션', `노인의 짐을 지고 마을까지 걸었다. 노인의 며느리가 시원한 ${josa(byCountry(s, '오미자 물', '녹두탕(綠豆湯)', '보리차'), '을를')} 내왔다. (인덕 +5, 건강 -3)`]]);
        }
        return s;
      },
    },
    {
      id: 'frost',
      when: (s) => s.season === 'WINTER',
      build: () => {
        const scene = '눈 덮인 길가에 아이 하나가 웅크리고 있다. 맨발이 새파랗다. 심부름 갔다가 길을 잃었다고 한다.';
        return {
          title: '눈 속에 웅크린 아이',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('얼어붙은 소년', '추워요… 집이… 어딘지 모르겠어요…', '이를 딱딱 부딪치며')],
          options: [
            { id: 'warm', label: '품에 안아 녹이며 마을을 찾아간다 (1일)', hint: '인덕 +6 · 건강 -4' },
            { id: 'fire', label: '불을 피워 몸을 녹이고 길을 묻는다', hint: '인덕 +4' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'warm') {
          return say(addRep(addHealth(spendDays(s, 1), -4), { virtue: 6 }), [['나레이션', '아이를 품에 안고 눈길을 헤맸다. 해 질 녘, 아이를 찾아 헤매던 어미와 마주쳤다. 어미는 아이를 받아 안고 말을 잇지 못했다. (인덕 +6, 건강 -4)']]);
        }
        if (opt === 'fire') {
          return say(addRep(s, { virtue: 4 }), [['나레이션', '마른 솔가지로 불을 피워 아이의 발을 녹였다. 기운을 차린 아이가 산 아래 연기 오르는 마을을 가리켰다. (인덕 +4)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 13. 시인·묵객 ─────────
const poet = sceneEvent({
  key: 'r_poet',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '정자의 선비들', '정자의 문인들', '하이카이(俳諧) 시인'),
  scenes: [
    {
      id: 'contest',
      build: (s) => {
        const scene = byCountry(
          s,
          '강가 정자에 갓 쓴 선비들이 모여 시회를 열고 있다. 칼 찬 무인을 보더니 수군거린다.',
          '강가 정자에 문인들이 모여 시를 짓고 있다. 칼 찬 무인을 보더니 부채 너머로 웃는다.',
          '강가 찻집 이층에 하이카이 시인들이 모여 구회를 열고 있다. 칼 찬 무인을 보더니 붓을 내민다.'
        );
        return {
          title: byCountry(s, '정자의 시회(詩會)', '정자의 시회(詩會)', '찻집의 구회(句會)'),
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(
              byCountry(s, '젊은 선비 서생', '젊은 문인', '하이카이 문인'),
              byCountry(s, '무인께서도 한 수 지어 보시겠소? 칼로 시를 쓸 수는 없겠지만. 하하.', '검객께서도 한 수 지어 보시겠소? 칼끝으로 쓰는 시도 있다던데. 하하.', '무사님도 한 구 읊어 보시지요. 오, 칠, 오. 열일곱 자면 됩니다.'),
              '부채를 흔들며'
            ),
          ],
          options: [
            { id: 'compose', label: '붓을 받아 시를 짓는다', hint: `통찰 판정 약 ${pct(0.3 + s.stats.ins * 0.006)} · 명성 +8` },
            { id: 'blade', label: '말없이 칼을 뽑아 댓잎 하나를 벤다', hint: '명성 +6 · 살기 +2' },
            {
              id: 'cow',
              label: `비웃은 ${byCountry(s, '서생', '문인', '시인')}의 멱살을 잡아 ${byCountry(s, '정자', '정자', '찻집 이층')} 난간 밖으로 들어 올린다`,
              hint: '살기 +4',
            },
            { id: 'leave', label: '못 들은 척 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'compose') {
          if (chance(clampP(0.3 + s.stats.ins * 0.006))) {
            const verse = byCountry(
              s,
              '「칼은 칼집에서 늙고 / 달은 강물에서 젊다」 — 정자가 조용해졌다. 늙은 선비 하나가 무릎을 쳤다.',
              '「검기(劍氣)는 서리 되어 지고 / 달빛만 칼집에 남네」 — 정자가 조용해졌다. 늙은 문인 하나가 무릎을 쳤다.',
              '「칼집 속 / 녹슬지 않는 / 가을의 달」 — 시인들이 붓을 내려놓았다.'
            );
            return say(addRep(addStats(addFame(s, 8), { ins: 1 }), { virtue: 2 }), [['나레이션', `${verse} (명성 +8, 통찰 +1, 인덕 +2)`]]);
          }
          return say(addFame(s, -3), [['나레이션', '붓끝이 떨렸다. 쓴 글자를 보고 젊은 축들이 킥킥거렸다. 칼보다 붓이 무거웠다. (명성 -3)']]);
        }
        if (opt === 'cow') {
          return say(addRep(s, { ruthless: 4 }), [
            [
              '나레이션',
              `${byCountry(s, '서생', '문인', '시인')}의 발이 허공에서 버둥거렸다. ${byCountry(s, '정자가', '정자가', '찻집 이층이')} 쥐 죽은 듯 조용해졌다. 내려놓자 아무도 다시는 웃지 않았다. ${byCountry(s, '시회', '시회', '구회')}는 그걸로 끝났다. (살기 +4)`,
            ],
          ]);
        }
        if (opt === 'blade') {
          return say(addRep(addFame(s, 6), { ruthless: 2 }), [['나레이션', '칼이 한 번 번쩍했다. 댓잎이 난간에 내려앉고서야 반으로 갈라졌다. 웃음소리가 뚝 그쳤다. (명성 +6, 살기 +2)']]);
        }
        return s;
      },
    },
    {
      id: 'painter',
      build: (s) => {
        const who = byCountry(s, '화공', '화사(畫師)', '에시(絵師)');
        const scene = `바위 위에서 ${josa(who, '이가')} 산수를 그리고 있다. 지나가는 무인을 보더니 붓을 멈추고 다가온다.`;
        return {
          title: '산수화 속의 무인',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(who, '그림에 사람이 하나 빠졌는데, 칼 찬 그 모습이 딱이오. 반나절만 저 바위 위에 서 주시겠소?', '붓을 든 채')],
          options: [
            { id: 'pose', label: '바위 위에 선다 (1일)', hint: '명성 +6 · 정신 +1' },
            { id: 'decline', label: '사양한다', hint: '구도 +2' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'pose') {
          return say(addStats(addFame(spendDays(s, 1), 6), { wil: 1 }), [['나레이션', '반나절을 바위 위에 칼을 짚고 서 있었다. 움직이지 않는 것도 수련이었다. 그림 속의 나는 실제보다 조금 더 쓸쓸해 보였다. (명성 +6, 정신 +1)']]);
        }
        if (opt === 'decline') return say(addRep(s, { ascetic: 2 }), [['나레이션', `「그림에 남을 만한 사람이 아니오.」 ${josa(byCountry(s, '화공', '화사', '에시'), '은는')} 아쉬운 듯 빈자리를 구름으로 채웠다. (구도 +2)`]]);
        return s;
      },
    },
    {
      id: 'brush',
      build: () => {
        const scene = '정자 마루에서 늙은 서예가가 큰 붓으로 한 획을 긋는다. 획 하나에 숨 한 번. 그 붓놀림이 칼의 궤적을 닮았다.';
        return {
          title: '붓과 칼',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('늙은 서예가 노인', '글씨는 손으로 쓰는 게 아니오. 붓이 종이에 닿기 전에 이미 끝나 있어야 하지. 칼도 그렇지 않소?', '먹을 갈며')],
          options: [
            { id: 'watch', label: '한 획 한 획을 지켜본다', hint: '깨달음 · 통찰 +1' },
            { id: 'write', label: '붓을 빌려 한 획을 그어 본다', hint: '정신 +1 · 구도 +3' },
            { id: 'leave', label: '인사하고 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'watch') {
          const g = gainInsight(addStats(s, { ins: 1 }), 6, '서예가의 붓끝');
          return say(g.state, [['나레이션', `멈춤, 누름, 삐침. 붓끝이 지나간 자리에 칼끝이 지나갈 길이 보였다. (통찰 +1) ${g.text}`]]);
        }
        if (opt === 'write') {
          return say(addRep(addStats(s, { wil: 1 }), { ascetic: 3 }), [['나레이션', '「一」 한 획을 그었다. 노인이 말없이 고개를 저었다. 다시 그었다. 열 번째 획에서 노인이 처음으로 고개를 끄덕였다. (정신 +1, 구도 +3)']]);
        }
        return s;
      },
    },
    {
      id: 'drunk_poet',
      build: (s) => {
        const scene = `${byCountry(s, '주막', '객잔', '여관')} 앞 평상에서 시인 하나가 술병을 끌어안고 달을 보고 있다. 술값이 없어 ${byCountry(s, '주모', '객잔 주인', '여관 안주인')}에게 시를 팔겠다고 우기는 중이다.`;
        return {
          title: '달에 취한 시인',
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P('취한 시인 문인', `이 시 한 수면 술 석 잔 값은 되고도 남소! 안 그렇소, 거기 칼 찬 ${sir(s)}?`, '술병을 흔들며')],
          options: [
            { id: 'buy', label: `그 시를 산다 (8${cur(s)})`, hint: '정신 +1 · 인덕 +2', ...costly(s, 8) },
            { id: 'drink', label: '함께 마신다', hint: '건강 +3 · 통찰 +1' },
            { id: 'leave', label: '웃으며 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'buy') {
          return say(addRep(addStats(addMoney(s, -8), { wil: 1 }), { virtue: 2 }), [['나레이션', '술값을 치르고 시를 받았다. 「칼 찬 손님 / 달은 베지 못하고 / 술잔에 담네」. 품에 넣어 두었다. (정신 +1, 인덕 +2)']]);
        }
        if (opt === 'drink') {
          return say(addStats(addHealth(s, 3), { ins: 1 }), [['나레이션', '시인과 달을 두고 술잔을 기울였다. 시인은 칼을, 나는 시를 끝내 알아듣지 못했지만 밤은 좋았다. (건강 +3, 통찰 +1)']]);
        }
        return s;
      },
    },
  ],
});

// ───────── 14. 점쟁이 ─────────
const fortune = sceneEvent({
  key: 'r_fortune',
  kind: 'PEOPLE',
  label: (s) => byCountry(s, '점쟁이', '산명(算命) 선생', '쓰지우라(辻占) 점쟁이'),
  weight: 0.8,
  trigger: { terrain: ['TOWN', 'ROAD', 'TEMPLE', 'COAST'] },
  scenes: [
    {
      id: 'blind',
      build: (s) => {
        const seer = byCountry(s, '눈먼 판수 영감', '눈먼 산명 노인', '눈먼 역자(易者) 노인');
        const scene = '길가 거적 위에 눈먼 점쟁이가 앉아 있다. 지나가는 발소리만 듣고 무인을 불러 세운다.';
        return {
          title: byCountry(s, '눈먼 판수', '눈먼 산명 선생', '눈먼 역자(易者)'),
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P(
              seer,
              `${s.age >= 55 ? '칼을 오래 찬 걸음이로구먼.' : '칼 찬 걸음이로구먼.'} 빚 문서 한 장으로 시작한 도장이 ${s.fame >= 300 ? '이제 제법 이름이 났고…' : '아직 갈 길이 멀고…'} 맞소?`,
              '허공을 더듬으며'
            ),
          ],
          options: [
            { id: 'listen', label: `점괘를 듣는다 (5${cur(s)})`, hint: '이단 +2 · 정신 +1', ...costly(s, 5) },
            { id: 'learn', label: `괘 세우는 법을 청해 배운다 (1일, 10${cur(s)})`, hint: '이단 +4 · 통찰 +1', ...costly(s, 10) },
            { id: 'leave', label: '대꾸하지 않고 지나간다' },
          ],
          meta: { seer },
        };
      },
      resolve: (s, opt, c) => {
        if (opt === 'learn') {
          const teacher = String(c.data?.seer || '눈먼 점쟁이');
          return say(addStats(addRep(addMoney(spendDays(s, 1), -10), { arcane: 4 }), { ins: 1 }), [
            [
              teacher,
              byCountry(
                s,
                '산가지 여덟 개면 괘가 서오. 눈으로 보지 말고 손끝으로 들으시오.',
                '동전 세 닢을 여섯 번 던지면 육효(六爻)가 서오. 괘는 보는 게 아니라 듣는 것이오.',
                '서죽(筮竹) 쉰 개 가운데 하나는 늘 빼 두는 법이오. 그 하나가 하늘의 몫이지.'
              ),
            ],
            ['나레이션', '하루를 꼬박 거적 위에 앉아 괘 세우는 법을 배웠다. 칼의 수를 읽는 것과 이상하게 닮아 있었다. (이단 +4, 통찰 +1)'],
          ]);
        }
        if (opt !== 'listen') return s;
        const seer = String(c.data?.seer || '눈먼 점쟁이');
        const line = rand([
          '그대 칼이 가장 크게 울리는 날은, 그대가 칼을 내려놓는 날이오.',
          '물가에서 만나는 사람을 조심하시오. 반가운 얼굴일수록.',
          '그대 문하에 그대보다 큰 그릇이 하나 있소. 알아보는 것도 스승의 재주요.',
          '북쪽에서 오는 손님은 반가워도 문을 반만 여시오.',
          '그대는 오래 사오. 오래 산다는 건 많이 보낸다는 뜻이오.',
        ]);
        return say(addStats(addRep(addMoney(s, -5), { arcane: 2 }), { wil: 1 }), [
          [seer, line],
          ['나레이션', '소름이 돋았다. 믿지 않기로 했다. 그런데도 그 말이 오래 귀에 남았다. (이단 +2, 정신 +1)'],
        ]);
      },
    },
    {
      id: 'warning',
      build: (s) => {
        const scene = '장터 어귀의 점쟁이가 무인의 얼굴을 보자마자 낯빛이 굳는다. 「사흘 안에 칼끝에서 피를 보겠소.」';
        return {
          title: '피를 보는 점괘',
          category: 'FANTASY',
          narration: scene,
          script: [N(scene), P('장터 점쟁이 영감', `액막이 부적 한 장이면 피할 수 있소. 값은 단돈 10${cur(s)}.`, '부적을 내밀며')],
          options: [
            { id: 'charm', label: `액막이 부적을 산다 (10${cur(s)})`, hint: '이단 +3 · 이 길의 남은 매복이 사라진다', ...costly(s, 10) },
            { id: 'laugh', label: '웃어넘긴다', hint: '정신 +1' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'charm') {
          return say(clearAmbushes(addRep(addMoney(s, -10), { arcane: 3 })), [['나레이션', '부적을 봇짐에 매달았다. 이상하게도 그 뒤로 이 길은 조용했다. 우연이겠지만. (이단 +3, 이 일대의 매복이 사라졌다)']]);
        }
        if (opt === 'laugh') return say(addStats(s, { wil: 1 }), [['나레이션', '「칼끝에서 피 보는 게 무인의 일이오.」 점쟁이가 혀를 찼다. (정신 +1)']]);
        return s;
      },
    },
    {
      id: 'fraud',
      build: (s) => {
        const scene = '점쟁이가 울고 있는 아낙에게 「집안에 귀신이 붙었다」며 액막이 값으로 쌀 열 섬을 내라 한다. 점괘를 짚는 손놀림이 엉성하다.';
        return {
          title: '액막이 값을 뜯는 점쟁이',
          category: 'LIFE',
          narration: scene,
          script: [
            N(scene),
            P('울던 아낙', '남편이 몸져누운 게 정말 귀신 탓일까요…', '훌쩍이며'),
            P('가짜 점쟁이', byCountry(s, '쯧쯧, 이 집 바깥양반이 산소 자리를 잘못 썼어. 액막이 안 하면 줄초상 나!', '쯧쯧, 이 집 조상 묘의 풍수가 틀어졌어. 액막이 안 하면 줄초상 나!', '쯧쯧, 이 집 우물가에 여우 넋이 들러붙었어. 액막이 안 하면 줄초상 나!'), '방울을 흔들며'),
          ],
          options: [
            { id: 'expose', label: '점쟁이의 거짓을 들춘다', hint: `통찰 판정 약 ${pct(0.35 + s.stats.ins * 0.006)} · 인덕 +4` },
            { id: 'collude', label: '「나도 귀신이 보인다」며 점쟁이 편을 들고 몫을 받는다', hint: '노자 +15 · 살기 +4 · 인덕 -3' },
            { id: 'leave', label: '남의 집 일이다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'collude') {
          return say(addRep(addMoney(s, 15), { ruthless: 4, virtue: -3 }), [
            ['나레이션', `칼 찬 무인까지 귀신을 봤다 하자 아낙이 사색이 되어 액막이 값을 내놓았다. 골목 모퉁이에서 점쟁이가 ${zeni(s)}을 세어 건넸다. 「손님, 우리 동업합시다.」 (노자 +15, 살기 +4, 인덕 -3)`],
          ]);
        }
        if (opt !== 'expose') return s;
        if (chance(clampP(0.35 + s.stats.ins * 0.006))) {
          return say(addFame(addRep(s, { virtue: 4 }), 4), [
            ['나레이션', '점쟁이의 산가지 통을 엎자 같은 숫자만 적힌 산가지가 쏟아졌다. 들통난 점쟁이가 줄행랑을 쳤다. 아낙에게는 의원부터 찾아가 보라 일렀다. (인덕 +4, 명성 +4)'],
          ]);
        }
        return say(addFame(s, -2), [['나레이션', '말솜씨로는 점쟁이를 당할 수 없었다. 「이 무인한테도 귀신이 붙었네!」 구경꾼들이 웃었다. (명성 -2)']]);
      },
    },
    {
      id: 'lots',
      build: (s) => {
        const scene = byCountry(
          s,
          '장터 한구석의 점쟁이가 토정비결 책을 펼쳐 놓고 생년월일을 묻는다.',
          '도관 앞에서 늙은 도사가 첨통을 내밀며 산가지 하나를 뽑으라 한다.',
          '신사 앞에서 무녀가 오미쿠지 통을 내민다.'
        );
        return {
          title: byCountry(s, '「토정비결」 한 장', '첨통(籤筒)의 산가지', '오미쿠지(御神籤) 한 장'),
          category: 'LIFE',
          narration: scene,
          script: [N(scene), P(byCountry(s, '점쟁이 영감', '첨통 든 도사', '신사의 무녀 아씨'), '한 해 운수를 보고 가시지요.', '웃으며')],
          options: [
            { id: 'draw', label: `점괘를 뽑는다 (2${cur(s)})`, hint: '운에 맡긴다', ...costly(s, 2) },
            { id: 'leave', label: '운은 칼로 여는 것이다. 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt !== 'draw') return s;
        const n = addMoney(s, -2);
        if (chance(0.55)) {
          return say(addHealth(addStats(n, { wil: 1 }), 3), [
            ['나레이션', `「${byCountry(s, '길(吉)', '상상첨(上上籤)', '대길(大吉)')}」 — 「먼 길에서 귀인을 만나리라.」 괜히 발걸음이 가벼워졌다. (정신 +1, 건강 +3)`],
          ]);
        }
        return say(addRep(n, { ascetic: 2 }), [
          [
            '나레이션',
            `「흉(凶)」 — 「칼을 칼집에 두라.」 ${byCountry(s, '점괘 종이를 접어 개울에 띄워 보냈다.', '산가지를 첨통에 도로 꽂았다.', '오미쿠지를 신사 나뭇가지에 묶었다.')} 흉도 마음먹기 나름이다. (구도 +2)`,
          ],
        ]);
      },
    },
  ],
});

// ═════════════════════════ 길 위의 장소 ═════════════════════════

// ───────── 옛 수련자의 토굴 ─────────
const hermitCave = sceneEvent({
  key: 'tr_hermit_cave',
  kind: 'TREASURE',
  label: () => '옛 토굴',
  once: false,
  trigger: { terrain: ['MOUNTAIN', 'FOREST', 'PASS', 'RIVER', 'TEMPLE'] },
  scenes: [
    {
      id: 'bones',
      build: () => {
        const scene = '덩굴에 가린 토굴 안, 가부좌를 튼 채 백골이 된 사람이 있다. 무릎 위에 손때 묻은 책 한 권이 놓여 있다.';
        return {
          title: '가부좌한 유골',
          category: 'HISTORICAL',
          narration: scene,
          script: [N(scene), N('얼마나 오래 앉아 있었을까. 백골의 손은 아직도 무릎 위의 책을 누르고 있다.')],
          options: [
            { id: 'bury', label: '유골을 수습해 묻어 주고 책을 읽는다 (1일)', hint: '구도 +4 · 인덕 +2 · 깨달음' },
            { id: 'take', label: '책만 챙긴다', hint: '비급일지도 모른다' },
            { id: 'leave', label: '합장하고 물러난다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'bury') {
          const g = gainInsight(addRep(spendDays(s, 1), { ascetic: 4, virtue: 2 }), 8, '토굴의 수련 일지');
          return say(g.state, [
            ['나레이션', '유골을 토굴 앞 양지바른 곳에 묻었다. 책은 수련 일지였다. 마지막 장에는 한 줄뿐이었다. 「오늘, 벽이 나를 보았다.」'],
            ['나레이션', `(구도 +4, 인덕 +2) ${g.text}`],
          ]);
        }
        if (opt === 'take') {
          const id = localBook(s);
          if (id) {
            const g = giveBook(s, id, 30);
            return say(highlight(g.state, `옛 토굴에서 ${josa(g.title || '', '을를')} 찾았다`), [['나레이션', `일지 사이에 얇은 비급이 끼워져 있었다. ${g.title}! (해독 30% 진행)`]]);
          }
          return say(trainEquipped(s, 40), [['나레이션', '일지에는 수련의 날들만 빼곡했다. 적힌 초식 몇 개를 따라 그어 보았다. (장착 초식 숙련 +40)']]);
        }
        return s;
      },
    },
    {
      id: 'wall',
      build: () => {
        const scene = '좁은 토굴 벽에 손톱으로 긁은 금이 빼곡하다. 날을 세던 금이 수천 개, 그리고 맨 끝에 한 줄. 「삼십 년 벽을 보았으나 벽은 나를 보지 않았다.」';
        return {
          title: '토굴 벽의 마지막 글',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'sit', label: '하루 벽을 마주하고 앉는다 (1일)', hint: '깨달음 · 정신 +1 · 구도 +3' },
            { id: 'pattern', label: '금들이 늘어선 모양을 따라 숨을 돌려 본다 (1일)', hint: '이단 +4 · 영력 +1' },
            { id: 'leave', label: '토굴을 나선다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'pattern') {
          return say(addStats(addRep(spendDays(s, 1), { arcane: 4 }), { qi: 1 }), [
            ['나레이션', '날을 센 금인 줄 알았던 것들이, 물러서서 보니 일곱 무더기로 모여 북두(北斗)의 모양을 이루고 있었다. 그 순서대로 숨을 돌리자 단전이 뜨거워졌다. 옛 수련자는 벽만 본 것이 아니었다. (이단 +4, 영력 +1)'],
          ]);
        }
        if (opt !== 'sit') return s;
        const g = gainInsight(addRep(addStats(spendDays(s, 1), { wil: 1 }), { ascetic: 3 }), 10, '토굴의 벽');
        return say(g.state, [
          ['나레이션', '벽 앞에 앉았다. 해가 들고, 해가 졌다. 벽은 그냥 벽이었다. 그런데 일어설 때, 무언가가 조금 달라져 있었다.'],
          ['나레이션', `(정신 +1, 구도 +3) ${g.text}`],
        ]);
      },
    },
    {
      id: 'jar',
      build: () => {
        const scene = '무너진 토굴 바닥에 주둥이를 기름종이로 봉한 항아리 하나가 묻혀 있다.';
        return {
          title: '토굴 바닥의 항아리',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'open', label: '봉을 뜯는다', hint: '무엇이 들었을지 모른다' },
            { id: 'leave', label: '그대로 둔다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt !== 'open') return s;
        const roll = Math.random();
        if (roll < 0.4) {
          const id = localBook(s);
          if (id) {
            const g = giveBook(s, id, 20);
            return say(highlight(g.state, `토굴의 항아리에서 ${josa(g.title || '', '을를')} 꺼냈다`), [['나레이션', `기름 먹인 보자기 속에 책 한 권. ${g.title}! (해독 20% 진행)`]]);
          }
        }
        if (roll < 0.75) return say(addMoney(s, 40), [['나레이션', `옛 엽전 꾸러미가 나왔다. 꿰미가 삭아 엽전이 우수수 쏟아졌다. (노자 +40)`]]);
        return say(addHealth(s, -6), [['나레이션', '봉을 뜯자 지네 떼가 기어 나와 손등을 물었다. 항아리는 비어 있었다. (건강 -6)']]);
      },
    },
  ],
});

// ───────── 폭포 ─────────
const waterfall = sceneEvent({
  key: 'tr_waterfall',
  kind: 'TREASURE',
  label: () => '폭포',
  once: false,
  trigger: { terrain: ['RIVER', 'MOUNTAIN', 'FOREST', 'TEMPLE', 'PASS'] },
  scenes: [
    {
      id: 'behind',
      build: () => {
        const scene = '폭포수가 떨어지는 바위 뒤로 검은 틈이 보인다. 물 장막 너머에 동굴이 있다.';
        return {
          title: '물 장막 뒤의 동굴',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'enter', label: '물줄기를 뚫고 들어간다', hint: '건강 -4 · 무엇이 있을지 모른다' },
            { id: 'leave', label: '물소리만 듣고 떠난다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt !== 'enter') return s;
        const n = addHealth(s, -4);
        const roll = Math.random();
        if (roll < 0.4) {
          const id = localBook(n, true);
          if (id) {
            const g = giveBook(n, id, 15);
            return say(highlight(g.state, `폭포 뒤 동굴에서 ${josa(g.title || '', '을를')} 찾았다`), [
              ['나레이션', `동굴 안쪽 마른 바위 선반에 기름 먹인 보따리가 있었다. ${g.title}! (해독 15% 진행, 건강 -4)`],
            ]);
          }
        }
        if (roll < 0.7) {
          const w = giveWeapon(n, oldBlade(n));
          if (w.name) {
            return say(highlight(w.state, `폭포 뒤 동굴에서 「${w.name}」을(를) 찾았다`), [['나레이션', `바위틈에 칼 한 자루가 꽂혀 있었다. 물기 하나 없이 서늘하다. 「${w.name}」! (건강 -4)`]]);
          }
        }
        return say(n, [['나레이션', '박쥐 떼가 쏟아져 나왔다. 동굴은 텅 비어 있었다. 흠뻑 젖은 몸만 남았다. (건강 -4)']]);
      },
    },
    {
      id: 'train',
      build: () => {
        const scene = '천 길 물줄기가 떨어지는 소(沼) 한가운데 평평한 바위가 있다. 바위 위가 반들반들하다. 누군가 오래 이 물을 맞았다.';
        return {
          title: '폭포수 아래의 바위',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'train', label: '이틀 동안 폭포수를 맞는다 (2일)', hint: '건강 -8 · 체력 +2 · 정신 +1' },
            { id: 'meditate', label: '소 가에 앉아 물소리를 듣는다', hint: '구도 +3 · 깨달음' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'train') {
          return say(addStats(addHealth(spendDays(s, 2), -8), { vit: 2, wil: 1 }), [['나레이션', '물줄기가 어깨를 내리쳤다. 첫날은 서 있기도 힘들었고, 이튿날엔 물소리가 들리지 않았다. (건강 -8, 체력 +2, 정신 +1)']]);
        }
        if (opt === 'meditate') {
          const g = gainInsight(addRep(s, { ascetic: 3 }), 6, '폭포 소리');
          return say(g.state, [['나레이션', `물은 한 번도 같은 소리를 내지 않았다. 그런데도 폭포는 늘 폭포였다. (구도 +3) ${g.text}`]]);
        }
        return s;
      },
    },
    {
      id: 'pool',
      build: () => {
        const scene = '폭포 아래 깊은 소의 바닥에서 무언가가 햇빛을 받아 반짝인다.';
        return {
          title: '소(沼) 바닥에서 빛나는 것',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'dive', label: '잠수한다', hint: '건강 -6 · 무엇이 있을지 모른다' },
            { id: 'dragon', label: '용이 산다는 소(沼)의 전설대로 물가에서 밤새 기를 고른다 (1일)', hint: '이단 +3 · 영력 +1 · 정신 +1' },
            { id: 'leave', label: '물이 너무 차다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'dragon') {
          return say(addStats(addRep(spendDays(s, 1), { arcane: 3 }), { qi: 1, wil: 1 }), [
            ['나레이션', '자정 무렵, 바람도 없는데 소의 수면이 크게 한 번 일렁였다. 깊은 데서 무언가가 이쪽을 올려다보는 기척이 있었다. 새벽까지 숨을 고르며 자리를 지켰다. (이단 +3, 영력 +1, 정신 +1)'],
          ]);
        }
        if (opt !== 'dive') return s;
        const n = addHealth(s, -6);
        const roll = Math.random();
        if (roll < 0.5) {
          return say(addMoney(n, 45), [['나레이션', `물이끼 낀 ${byCountry(n, '은덩이', '은원보(銀元寶)', '은화 꾸러미')}를 건져 올렸다. 누가 언제 빠뜨렸을까. (노자 +45, 건강 -6)`]]);
        }
        if (roll < 0.75) {
          const w = giveWeapon(n, 'wp_th_01');
          if (w.name) return say(highlight(w.state, `폭포 아래 소에서 「${w.name}」을(를) 건졌다`), [['나레이션', `녹슬지 않은 비도 한 묶음이 바위틈에 걸려 있었다. 「${w.name}」! (건강 -6)`]]);
        }
        return say(n, [['나레이션', '숨이 턱에 차도록 내려가 보니, 햇빛에 반짝이던 것은 운모 조각이었다. (건강 -6)']]);
      },
    },
  ],
});

// ───────── 옛 싸움터 ─────────
const fieldName = (s: GameState) => byCountry(s, '임진년 왜란 때 무너진 산성 터', '명나라 말 청군이 넘어온 관문 터', '전국 시대에 불탄 성터');
const battlefield = sceneEvent({
  key: 'tr_battlefield',
  kind: 'TREASURE',
  label: () => '옛 싸움터',
  once: false,
  trigger: { terrain: ['PASS', 'MOUNTAIN', 'ROAD', 'FOREST', 'COAST', 'RIVER'] },
  scenes: [
    {
      id: 'arrows',
      build: (s) => {
        const scene = `${fieldName(s)}다. 풀숲을 헤치면 녹슨 화살촉과 깨진 투구 조각이 발에 걸린다.`;
        return {
          title: '녹슨 화살촉의 들판',
          category: 'HISTORICAL',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'gather', label: '쇠붙이를 모아 대장간에 판다 (1일)', hint: '노자 +25 · 상무 +3' },
            { id: 'pray', label: '술을 붓고 넋을 기린다', hint: '인덕 +3 · 구도 +3 · 정신 +1' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'gather') {
          return say(addRep(addMoney(spendDays(s, 1), 25), { commerce: 3 }), [['나레이션', '하루 종일 쇠붙이를 주워 대장간에 넘겼다. 대장장이가 요즘은 이걸로 호미를 만든다고 했다. (노자 +25, 상무 +3)']]);
        }
        if (opt === 'pray') {
          return say(addStats(addRep(s, { virtue: 3, ascetic: 3 }), { wil: 1 }), [['나레이션', '술 한 병을 들판에 고루 뿌렸다. 바람이 풀숲을 쓸고 지나갔다. 이긴 쪽도 진 쪽도 여기서는 같은 흙이다. (인덕 +3, 구도 +3, 정신 +1)']]);
        }
        return s;
      },
    },
    {
      id: 'general',
      build: (s) => {
        const scene = `${fieldName(s)} 한쪽, 봉분이 반쯤 무너진 무덤 앞에 비석 대신 녹슨 칼 한 자루가 꽂혀 있다. 이 싸움에서 죽은 장수의 무덤이라 전해진다.`;
        return {
          title: '이름 모를 장수의 무덤',
          category: 'HISTORICAL',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'honor', label: '술을 붓고 절한다', hint: '깨달음 · 정신 +1' },
            { id: 'dig', label: '무덤을 헤쳐 함께 묻힌 칼을 꺼낸다', hint: '병기를 얻는다 · 살기 +6' },
            { id: 'leave', label: '묵례하고 떠난다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'honor') {
          const g = gainInsight(addStats(s, { wil: 1 }), 6, '장수의 무덤');
          return say(g.state, [['나레이션', `칼자루를 쓰다듬자 녹이 손바닥에 묻어났다. 그는 무엇을 지키다 여기 누웠을까. (정신 +1) ${g.text}`]]);
        }
        if (opt === 'dig') {
          const w = giveWeapon(s, byCountry(s, rand(['wp_bl_04', 'wp_pl_02']), 'wp_bl_05', 'wp_bl_06'));
          const n = addRep(w.state, { ruthless: 6 });
          if (w.name) {
            return say(highlight(n, `옛 장수의 무덤에서 「${w.name}」을(를) 꺼냈다`), [
              ['나레이션', `썩은 관 속 갑옷 곁에 기름 먹인 천으로 싼 병기가 있었다. 「${w.name}」. 무덤을 다시 덮는 손이 무거웠다. (살기 +6)`],
            ]);
          }
          return say(addMoney(n, 30), [['나레이션', '부장품은 이미 누군가 털어 간 뒤였다. 깨진 금장식 몇 조각만 건졌다. (노자 +30, 살기 +6)']]);
        }
        return s;
      },
    },
    {
      id: 'night',
      w: 0.7,
      build: () => {
        const scene = '마을 사람들은 이 들판에서 밤을 새우지 말라 한다. 밤마다 말발굽 소리와 함성이 들린다는 것이다.';
        return {
          title: '밤마다 함성이 들리는 들판',
          category: 'FANTASY',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'stay', label: '들판에서 밤을 지샌다', hint: '이단 +5 · 정신 +2' },
            { id: 'leave', label: '해 지기 전에 지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt !== 'stay') return s;
        let n = addStats(addRep(s, { arcane: 5 }), { wil: 2 });
        const qi = chance(0.35);
        if (qi) n = addStats(n, { qi: 1 });
        return say(highlight(n, '함성이 들린다는 옛 싸움터에서 밤을 지샜다'), [
          ['나레이션', '자정 무렵, 정말로 함성이 들렸다. 일어나 칼을 뽑았다. 아무도 없었다. 새벽까지 칼을 쥔 채 서 있었다.'],
          ['나레이션', `동이 트자 풀잎마다 이슬이 붉게 빛났다. (이단 +5, 정신 +2${qi ? ', 영력 +1' : ''})`],
        ]);
      },
    },
    {
      id: 'fort',
      build: (s) => {
        const scene = byCountry(
          s,
          '허물어진 성벽이 산등성이를 따라 뱀처럼 이어진다. 성가퀴 사이로 옛 군사들이 내려다보던 골짜기가 보인다.',
          '무너진 관문 성벽이 고갯길을 가로막고 있다. 돌 틈마다 불에 그을린 자국이 남아 있다.',
          '돌로 쌓은 성의 석축만 남아 있다. 망루가 섰던 자리에서 내려다보면 길목 셋이 한눈에 들어온다.'
        );
        return {
          title: '무너진 성벽 위에서',
          category: 'HISTORICAL',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'walk', label: '성벽을 따라 걸으며 옛 싸움을 그려 본다 (1일)', hint: '통찰 +2 · 장착 초식 숙련' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt !== 'walk') return s;
        return say(trainEquipped(addStats(spendDays(s, 1), { ins: 2 }), 40), [
          ['나레이션', '어디로 적이 올랐고 어디서 막았을까. 성벽이 무너진 자리가 곧 뚫린 자리였다. 한 사람의 칼에도 그런 자리가 있다. (통찰 +2, 장착 초식 숙련 +40)'],
        ]);
      },
    },
  ],
});

// ───────── 이끼 낀 비석 ─────────
const stele = sceneEvent({
  key: 'tr_stele',
  kind: 'TREASURE',
  label: () => '이끼 낀 비석',
  once: false,
  scenes: [
    {
      id: 'verse',
      build: () => {
        const scene = '이끼 낀 비석의 앞면은 닳아 읽을 수 없다. 그런데 뒷면에, 칼끝으로 새긴 듯한 가는 글씨가 남아 있다. 검결(劍訣)이다.';
        return {
          title: '비석 뒷면의 검결(劍訣)',
          category: 'HISTORICAL',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'study', label: '이틀 동안 검결을 따라 그어 본다 (2일)', hint: '장착 초식 숙련 · 깨달음' },
            { id: 'rubbing', label: '검결 아래 줄지은 낯선 부호를 탁본해 간다', hint: '이단 +3 · 통찰 +1' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'rubbing') {
          return say(addStats(addRep(s, { arcane: 3 }), { ins: 1 }), [
            ['나레이션', '검결 아래 줄지은 부호는 한자도 범자(梵字)도 아니었다. 종이에 먹을 먹여 탁본을 떴다. 밤마다 들여다보면 부호가 조금씩 자리를 바꾸는 것 같았다. (이단 +3, 통찰 +1)'],
          ]);
        }
        if (opt !== 'study') return s;
        const g = gainInsight(trainEquipped(spendDays(s, 2), 60), 6, '비석의 검결');
        return say(highlight(g.state, '비석 뒷면의 검결을 따라 그었다'), [
          ['나레이션', '「起如風 止如山」 — 일어날 때는 바람처럼, 멈출 때는 산처럼. 이틀을 따라 그었다. (장착 초식 숙련 +60)'],
          ['나레이션', g.text],
        ]);
      },
    },
    {
      id: 'merit',
      build: (s) => {
        const scene = byCountry(
          s,
          '길가에 효자비가 서 있다. 병든 어미를 위해 한겨울 얼음을 깨고 잉어를 잡았다는 이야기가 새겨져 있다.',
          '마을 어귀에 돌로 된 패방이 우뚝하다. 남편을 잃고 평생 시부모를 모신 여인을 기린 것이다.',
          '길가 작은 비석 앞에 들꽃이 놓여 있다. 흉년에 연공을 덜어 달라 직소(直訴)했다가 처형된 촌장을 기린 것이다.'
        );
        return {
          title: byCountry(s, '효자비(孝子碑)', '정절 패방(貞節牌坊)', '의민(義民) 공양비'),
          category: 'HISTORICAL',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'read', label: '비문을 끝까지 읽는다', hint: '인덕 +3 · 정신 +1' },
            { id: 'clean', label: '이끼를 걷어 내고 비석을 닦는다 (1일)', hint: '인덕 +4 · 구도 +2' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'read') {
          return say(addStats(addRep(s, { virtue: 3 }), { wil: 1 }), [
            [
              '나레이션',
              byCountry(
                s,
                '칼 한 번 잡아 보지 않은 사람의 이름이 돌에 남아 있었다. 무엇이 사람을 돌에 새기게 하는가. (인덕 +3, 정신 +1)',
                '평생 한 집을 지킨 사람의 이름이 돌에 남아 있었다. 지키는 일은 칼로만 하는 것이 아니었다. (인덕 +3, 정신 +1)',
                '마을을 위해 목을 내놓은 사람의 이름이 돌에 남아 있었다. 칼을 찬 자들은 그때 무엇을 했을까. (인덕 +3, 정신 +1)'
              ),
            ],
          ]);
        }
        if (opt === 'clean') {
          return say(addRep(spendDays(s, 1), { virtue: 4, ascetic: 2 }), [['나레이션', '하루를 들여 이끼를 걷고 비석을 닦았다. 지나가던 마을 노인이 고맙다며 허리를 숙였다. (인덕 +4, 구도 +2)']]);
        }
        return s;
      },
    },
    {
      id: 'buried',
      build: () => {
        const scene = '흙더미에 반쯤 묻힌 비석 머리에 「劍」 한 글자가 보인다.';
        return {
          title: '반쯤 묻힌 비석',
          category: 'HISTORICAL',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'dig', label: '하루를 들여 파낸다 (1일)', hint: '깨달음 · 명성 +4 · 무언가 더 묻혀 있을지도' },
            { id: 'leave', label: '지나간다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt !== 'dig') return s;
        const g = gainInsight(addFame(spendDays(s, 1), 4), 5, '옛 무인의 공적비');
        const lines: Array<[string, string]> = [['나레이션', '비석은 옛 무인의 공적비였다. 「칼 한 자루로 도적 떼를 막아 이 마을을 지켰다.」 마을 사람들이 몰려와 구경했다. (명성 +4)']];
        let n = g.state;
        const id = chance(0.3) ? localBook(n) : null;
        if (id) {
          const b = giveBook(n, id, 25);
          n = highlight(b.state, `묻힌 비석 아래 석함에서 ${josa(b.title || '', '을를')} 꺼냈다`);
          lines.push(['나레이션', `비석 밑에 작은 석함이 있었다. 안에는 ${b.title}! (해독 25% 진행)`]);
        }
        lines.push(['나레이션', g.text]);
        return say(n, lines);
      },
    },
  ],
});

// ───────── 벼랑의 약초 ─────────
const herbCliff = sceneEvent({
  key: 'tr_herb_cliff',
  kind: 'TREASURE',
  label: () => '벼랑의 약초',
  once: false,
  trigger: { terrain: ['MOUNTAIN', 'PASS', 'FOREST', 'RIVER', 'TEMPLE'] },
  scenes: [
    {
      id: 'ginseng',
      when: (s) => s.country !== 'JAPAN',
      build: (s) => {
        const scene = '아찔한 벼랑 중턱, 바위틈에 빨간 열매를 단 풀 한 포기가 흔들린다. 산삼이다.';
        return {
          title: '벼랑 끝의 산삼',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'climb', label: '벼랑을 탄다', hint: `민첩 판정 약 ${pct(0.4 + s.stats.agi * 0.006)} · 건강 +16 · 체력 +1 · 영력 +1` },
            { id: 'leave', label: '목숨이 먼저다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt !== 'climb') return s;
        if (chance(clampP(0.4 + s.stats.agi * 0.006))) {
          return say(highlight(addStats(addHealth(s, 16), { vit: 1, qi: 1 }), '벼랑 끝에서 산삼을 캤다'), [
            ['나레이션', `${byCountry(s, '「심 봤다!」 저도 모르게 소리가 터져 나왔다. ', '', '')}뿌리째 캐어 씹자 온몸에 열이 돌았다. (건강 +16, 체력 +1, 영력 +1)`],
          ]);
        }
        return say(addHealth(s, -8), [['나레이션', '발 디딘 바위가 무너졌다. 넝쿨을 잡고 겨우 버텼다. 산삼은 바람에 흔들릴 뿐이었다. (건강 -8)']]);
      },
    },
    {
      id: 'lingzhi',
      build: () => {
        const scene = '벼락 맞은 고목 밑동에 붉게 윤이 나는 영지버섯이 층층이 돋았다.';
        return {
          title: '고목에 돋은 영지(靈芝)',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'take', label: '조심스럽게 따서 달여 먹는다', hint: '건강 +10 · 영력 +1' },
            { id: 'sell', label: '따서 장에 내다 판다', hint: '노자 +35 · 상무 +2' },
            { id: 'raw', label: '벼락 맞은 고목의 영지를 날로 씹어 기운을 시험한다', hint: '이단 +3 · 영력 +2 · 건강 -4' },
            { id: 'leave', label: '그대로 둔다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'take') return say(addStats(addHealth(s, 10), { qi: 1 }), [['나레이션', '영지를 달인 물은 썼다. 그런데 그 쓴맛이 혀끝에서 오래 맴돌며 몸을 데웠다. (건강 +10, 영력 +1)']]);
        if (opt === 'raw') {
          return say(addHealth(addStats(addRep(s, { arcane: 3 }), { qi: 2 }), -4), [
            ['나레이션', '날것의 영지는 쇠처럼 썼다. 삼키자 등줄기를 따라 찌릿한 기운이 번지고, 손끝에서 파란 불티가 튀는 것 같았다. 벼락이 남긴 기운이라 했던가. 한나절 속이 뒤집혔다. (이단 +3, 영력 +2, 건강 -4)'],
          ]);
        }
        if (opt === 'sell') return say(addRep(addMoney(s, 35), { commerce: 2 }), [['나레이션', '약방 주인이 영지를 보더니 두말없이 값을 쳐 주었다. (노자 +35, 상무 +2)']]);
        return s;
      },
    },
    {
      id: 'honey',
      build: () => {
        const scene = '절벽 바위틈에 커다란 벌집이 매달려 있다. 바위를 타고 꿀이 흘러내린다. 석청(石淸)이다.';
        return {
          title: '절벽의 석청(石淸)',
          category: 'LIFE',
          narration: scene,
          script: [N(scene)],
          options: [
            { id: 'take', label: '연기를 피우고 벌집을 딴다', hint: '건강 -4 · 노자 +30' },
            { id: 'taste', label: '흘러내린 꿀만 조금 받아 먹는다', hint: '건강 +5' },
            { id: 'leave', label: '벌집은 건드리지 않는다' },
          ],
        };
      },
      resolve: (s, opt) => {
        if (opt === 'take') return say(addMoney(addHealth(s, -4), 30), [['나레이션', '연기를 피웠지만 벌 몇 마리에게 쏘였다. 석청 한 덩이는 장터에서 금값이었다. (건강 -4, 노자 +30)']]);
        if (opt === 'taste') return say(addHealth(s, 5), [['나레이션', '바위를 타고 흐르는 꿀을 손바닥에 받아 핥았다. 산의 단맛이었다. (건강 +5)']]);
        return s;
      },
    },
  ],
});

export const ROAD_MORE_EVENTS: JourneyEventDef[] = [
  ferry,
  peddlers,
  pilgrim,
  runaway,
  procession,
  oldSoldier,
  storyteller,
  troupe,
  hunter,
  courier,
  gamble,
  sickTraveler,
  poet,
  fortune,
  hermitCave,
  waterfall,
  battlefield,
  stele,
  herbCliff,
];
