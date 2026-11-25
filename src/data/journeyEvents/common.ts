import { josa } from '../../utils/korean';
import { GameState, Season } from '../../types/game';
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
  trainEquipped,
} from '../../engine/journeyCore';
import { rumorsFor } from '../journeyRegions';

// 주막 · 사찰 · 대오의 장소 · 보물 · 길 위의 돌발 사건

const innName = (s: GameState) => byCountry(s, '주막', '객잔', '하타고(旅籠)');
const keeper = (s: GameState) => byCountry(s, '주모', '객잔 주인', '여관 안주인');

export const COMMON_EVENTS: JourneyEventDef[] = [
  // ───────── 주막 / 객잔 / 하타고 ─────────
  {
    key: 'inn',
    kind: 'INN',
    label: (s) => innName(s),
    once: false,
    build: (s) => {
      const rumors = rumorsFor(s.country, s.year);
      const rumor = rumors.length ? rand(rumors) : '요즘은 별일 없다오.';
      return {
        title: `길가의 ${innName(s)}`,
        category: 'LIFE',
        sceneActor: 'MERCHANT',
        narration: `${innName(s)} 처마 밑에 등이 걸려 있다. 장국 냄새와 함께 길손들의 수다가 새어 나온다.`,
        script: [
          N(`${innName(s)} 처마 밑에 등이 흔들린다. 길손들이 둘러앉아 국밥을 뜨며 수군거린다.`),
          P('길손', rumor, '목소리를 낮추며'),
          P(keeper(s), `어서 오시오, 무사 양반. 하룻밤 묵어 가실라우? 방값은 6${cur(s)}이오.`),
        ],
        options: [
          { id: 'rest', label: `하룻밤 묵는다 (6${cur(s)}, 1일)`, hint: '건강 회복', disabled: s.money < 6, disabledReason: '노자가 부족하다' },
          { id: 'listen', label: `술 한 잔 사며 소문을 캔다 (4${cur(s)}, 1일)`, hint: '이 길에 숨은 것을 알게 될지도', disabled: s.money < 4, disabledReason: '노자가 부족하다' },
          { id: 'home', label: '여기서 발길을 돌려 도장으로 돌아간다', hint: '무사수행을 일찍 끝낸다' },
          { id: 'leave', label: '그냥 지나간다' },
        ],
      };
    },
    resolve: (s, opt) => {
      if (opt === 'rest') {
        let n = spendDays(addMoney(s, -6), 1);
        n = addHealth(n, 14);
        return say(n, [['나레이션', '따뜻한 구들에 몸을 누이자, 길에서 쌓인 피로가 녹아내렸다. (건강 +14)']]);
      }
      if (opt === 'listen') {
        let n = spendDays(addMoney(s, -4), 1);
        n = addStats(n, { ins: 1 });
        const lead = chance(0.5);
        if (lead && n.journey) {
          const j = n.journey;
          const x = Math.min(j.legLength - 120, j.heroX + 300 + Math.random() * 400);
          n = {
            ...n,
            journey: {
              ...j,
              pois: [...j.pois, { id: `poi_lead_${n.turn}_${Math.random().toString(36).slice(2, 5)}`, kind: 'TREASURE', eventKey: rand(['tr_ruin', 'tr_carving', 'tr_swordgrave']), x, label: '소문의 장소' }],
            },
          };
          return say(n, [
            ['길손', '…저 고개 너머에 옛날 무인이 칼을 묻었다는 곳이 있다네. 아무도 안 가 봤지만.'],
            ['나레이션', '이 길 앞쪽에 「소문의 장소」가 생겼다. (통찰 +1)'],
          ]);
        }
        const rumors = rumorsFor(n.country, n.year);
        return say(n, [
          ['길손', rumors.length ? rand(rumors) : '요즘은 조용하다네.'],
          ['나레이션', '술잔이 몇 순배 돌았지만 쓸 만한 이야기는 없었다. 세상 돌아가는 사정만 귀에 담았다. (통찰 +1)'],
        ]);
      }
      if (opt === 'home' && s.journey) {
        return { ...s, journey: { ...s.journey, day: s.journey.maxDays } };
      }
      return s;
    },
  },

  // ───────── 사찰 · 도관 · 신사 ─────────
  {
    key: 'shrine',
    kind: 'SHRINE',
    label: (s) => byCountry(s, '산사(山寺)', '도관(道觀)', '신사(神社)'),
    once: false,
    build: (s) => {
      const place = byCountry(s, '산사', '도관', '신사');
      const keeperName = byCountry(s, '노승', '늙은 도사', '신관');
      return {
        title: `${place}의 고요`,
        category: 'LIFE',
        narration: `이끼 낀 돌계단 끝에 ${place}가 있다. 풍경 소리가 바람에 흔들린다.`,
        script: [
          N(`이끼 낀 돌계단 끝, 바람이 풍경을 흔든다. 세상의 소리가 한 겹 멀어진다.`),
          P(keeperName, '칼을 찬 손님이시구려. 칼은 문밖에 두고 들어오시오. 마음은… 가지고 들어오셔도 좋소.', '빗자루를 멈추고'),
        ],
        options: [
          { id: 'pray', label: '하루 머물며 마음을 가라앉힌다 (1일)', hint: '건강·정신 회복, 선문답을 들을지도' },
          { id: 'donate', label: `시주한다 (20${cur(s)})`, hint: '인덕', disabled: s.money < 20, disabledReason: '노자가 부족하다' },
          { id: 'leave', label: '합장하고 지나간다' },
        ],
      };
    },
    resolve: (s, opt) => {
      if (opt === 'pray') {
        let n = spendDays(s, 1);
        n = addHealth(addStats(n, { wil: 1 }), 6);
        if (chance(0.3)) {
          const g = gainInsight(n, 6, '산사의 선문답');
          const q = byCountry(
            n,
            '「칼이 먼저인가, 베려는 마음이 먼저인가?」',
            '「물은 그릇을 다투지 않는다. 그대의 검은 무엇을 다투는가?」',
            '「베지 않는 칼이야말로 가장 잘 드는 칼이오.」'
          );
          return say(g.state, [
            [byCountry(n, '노승', '늙은 도사', '신관'), q],
            ['나레이션', `밤새 그 말을 곱씹었다. ${g.text}`],
          ]);
        }
        return say(n, [['나레이션', '새벽 예불 소리에 눈을 떴다. 머리가 맑다. (정신 +1, 건강 +6)']]);
      }
      if (opt === 'donate') {
        let n = addMoney(s, -20);
        n = addFame(addRep(n, { virtue: 6 }), 5);
        return say(n, [['나레이션', `시주함에 ${20}${cur(s)}을 넣었다. 노승이 말없이 합장했다. (인덕 +6, 명성 +5)`]]);
      }
      return s;
    },
  },

  // ───────── 대오(大悟)의 장소 ─────────
  ...(
    [
      ['vista_jiri', '천왕봉 일출', '운해(雲海)가 발아래 깔렸다. 동쪽 끝에서 붉은 해가 솟는다. 산 전체가 숨을 멈춘 듯하다.', '구름은 칼끝을 피하지 않는다. 그저 갈라졌다가 다시 하나가 된다.'],
      ['vista_geumgang', '구룡폭포', '아홉 마리 용이 산다는 못 위로 천 길 물줄기가 쏟아진다. 물보라가 무지개를 만든다.', '물은 바위를 이기려 하지 않는다. 그런데도 바위가 패인다.'],
      ['vista_huashan', '장공잔도', '천 길 낭떠러지에 박힌 판자 한 장. 발밑으로 구름이 흐르고, 등 뒤로는 절벽이 숨 쉰다.', '한 걸음 헛디디면 끝이다. 그런데 이상하게도, 칼을 쥘 때보다 마음이 고요하다.'],
      ['vista_wudang', '무당산 금정', '구름 위 구리 전각이 햇빛을 받아 금빛으로 탄다. 바람이 사방에서 불어와 한 점으로 모인다.', '태극은 처음과 끝이 없다. 초식도 그러해야 하지 않겠는가.'],
      ['vista_kurama', '구라마산의 밤', '천 년 묵은 삼나무 뿌리가 땅 위로 드러나 길을 막는다. 달빛 아래, 누군가 나뭇가지 위에서 지켜보는 기척이 있다.', '보이지 않는 상대와 백 번을 겨뤘다. 백 번째에야 그것이 내 그림자임을 알았다.'],
      ['vista_sakurajima', '사쿠라지마 분연', '바다 한가운데 화산이 잿빛 연기를 하늘로 밀어 올린다. 땅이 낮게 울린다.', '산은 참지 않는다. 터질 때 터진다. 첫 칼에 모든 것을 거는 이들이 왜 이 땅에서 났는지 알 것 같다.'],
    ] as const
  ).map(
    ([key, title, scene, thought]): JourneyEventDef => ({
      key,
      kind: 'VISTA',
      label: () => title,
      once: true,
      build: (s) => ({
        title: `대오(大悟)의 자리 — ${title}`,
        category: 'HISTORICAL',
        narration: scene,
        script: [N(scene), H(s, thought, '숨을 고르며')],
        options: [
          {
            id: 'gaze',
            label: '사흘을 머물며 바라본다 (3일)',
            hint: s.skills.some((sk) => sk.masteryLevel === 9 && sk.masteryExp >= 800)
              ? '벽에 닿은 초식의 깨달음이 크게 쌓인다 — 벽이 무너질 수도 있다'
              : '벽에 닿은 초식이 없다. 마음만 맑아질 것이다',
          },
          { id: 'leave', label: '눈에만 담고 떠난다' },
        ],
      }),
      resolve: (s, opt) => {
        if (opt !== 'gaze') return s;
        let n = spendDays(s, 3);
        n = addStats(n, { wil: 2, ins: 2 });
        const g = gainInsight(n, 25 + Math.floor(Math.random() * 16), title);
        n = highlight(g.state, g.transcended ? `${title}에서 극의에 이르렀다` : `${title}에서 사흘을 머물렀다`);
        return say(n, [
          ['나레이션', `사흘 밤낮을 ${title} 앞에 앉아 있었다. (정신 +2, 통찰 +2)`],
          ['나레이션', g.text],
        ]);
      },
    })
  ),

  // ───────── 보물 · 비급 ─────────
  {
    key: 'tr_ruin',
    kind: 'TREASURE',
    label: (s) => byCountry(s, '무너진 산사', '허물어진 도관', '버려진 사당'),
    once: false,
    build: (s) => ({
      title: byCountry(s, '무너진 산사', '허물어진 도관', '버려진 사당'),
      category: 'LIFE',
      narration: '지붕이 내려앉은 법당. 목이 떨어진 불상 하나가 어둠 속에서 이쪽을 보고 있다.',
      script: [
        N('지붕이 반쯤 내려앉은 법당. 목이 떨어진 불상이 어둠 속에서 이쪽을 본다.'),
        N('불상의 배 안쪽이 비어 있다. 옛사람들은 귀한 경전을 불상 속에 넣어 두곤 했다.'),
      ],
      options: [
        { id: 'search', label: '샅샅이 뒤진다 (2일)', hint: '통찰이 높을수록 잘 찾는다' },
        { id: 'leave', label: '죽은 이들의 자리를 어지럽히지 않는다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt !== 'search') return s;
      let n = spendDays(s, 2);
      if (chance(0.22)) {
        return journeyBattle(say(n, [['나레이션', '먼저 와 있던 도굴꾼들이 칼을 뽑았다!']]), c, 'robbers', {
          stakes: 'HOSTILE', title: '폐사의 도굴꾼',
          subtitle: '먼저 온 자들이 길을 막는다',
          name: '도굴꾼 두목',
          enemyTitle: '폐허를 터는 자',
          age: 36,
          ai: 'AGGRESSIVE',
          scale: roadScale(n, 0.85),
          weapon: 'BLADE',
          skills: ['base_h_slash', 'sk_kr_01', 'sk_cn_01'],
          rewardMoney: 30,
          rewardFame: 10,
        });
      }
      if (chance(0.45 + n.stats.ins * 0.004)) {
        const id = pickBook(n, (b) => b.countryBias === n.country && (b.rarity === 'RARE' || b.rarity === 'COMMON'));
        if (id) {
          const g = giveBook(n, id, 20);
          n = highlight(g.state, `폐사에서 ${josa(g.title || '', '을를')} 찾았다`);
          return say(n, [['나레이션', `불상 뱃속에서 기름 먹인 보자기를 꺼냈다. 안에는 ${g.title}! (해독 20% 진행)`]]);
        }
        n = addMoney(n, 40);
        return say(n, [['나레이션', `불단 밑에서 옛 시주 돈 꾸러미가 나왔다. (+40${cur(n)})`]]);
      }
      return say(n, [['나레이션', '이틀을 뒤졌으나 먼지와 쥐똥뿐이었다.']]);
    },
    onBattle: (s, _opt, won) => {
      if (!won) return s;
      const id = pickBook(s, (b) => b.countryBias === s.country && b.rarity !== 'LEGEND');
      if (!id) return s;
      const g = giveBook(s, id, 20);
      return highlight(g.state, `도굴꾼을 물리치고 ${josa(g.title || '', '을를')} 지켰다`);
    },
  },
  {
    key: 'tr_swordgrave',
    kind: 'TREASURE',
    label: () => '검총(劍塚)',
    once: false,
    build: (s) => ({
      title: '검총(劍塚) — 이름 없는 검객들의 무덤',
      category: 'HISTORICAL',
      illustration: '/assets/px_chr_v_sword_grave.jpg',
      narration: '바람 부는 언덕 위, 돌무더기마다 녹슨 칼이 꽂혀 있다. 이긴 자도 진 자도 여기서는 다 같은 흙이다.',
      script: [
        N('바람 부는 언덕. 돌무더기마다 녹슨 칼이 꽂혀 있고, 낡은 천 조각이 칼자루에서 펄럭인다.'),
        H(s, '이름 없는 검객들… 나도 언젠가 여기 누울지 모르겠구나.', '무릎을 꿇으며'),
      ],
      options: [
        { id: 'pay', label: '하루를 들여 무덤을 정리하고 넋을 기린다 (1일)', hint: '정신·깨달음' },
        { id: 'take', label: '쓸 만한 칼을 하나 뽑는다 (1일)', hint: '명검일 수도, 원한이 서린 칼일 수도' },
        { id: 'leave', label: '묵례하고 떠난다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'pay') {
        let n = spendDays(s, 1);
        n = addRep(addStats(n, { wil: 2 }), { virtue: 4, ascetic: 4 });
        const g = gainInsight(n, 8, '검총');
        return say(g.state, [
          ['나레이션', '돌을 다시 쌓고 칼마다 술을 부었다. 바람이 멎었다.'],
          ['나레이션', `칼자국 하나하나가 누군가의 마지막 초식이었다. ${g.text}`],
        ]);
      }
      if (opt === 'take') {
        let n = spendDays(s, 1);
        const id = rand(byCountry(n, ['wp_bl_04', 'wp_bl_07', 'wp_bl_11'], ['wp_bl_05', 'wp_bl_08', 'wp_pl_06'], ['wp_bl_06', 'wp_bl_09', 'wp_bl_12']));
        const g = giveWeapon(n, id);
        n = addRep(g.state, { ruthless: 6 });
        if (!g.name) return say(n, [['나레이션', '녹이 슬어 쓸 만한 칼이 없었다.']]);
        n = highlight(n, `검총에서 「${g.name}」을(를) 뽑았다`);
        const cursed = id === 'wp_bl_12' || id === 'wp_bl_11';
        return say(n, [
          ['나레이션', `돌무더기 깊숙이 박힌 칼을 뽑자, 녹 아래에서 서늘한 날이 드러났다. 「${g.name}」!`],
          ['나레이션', cursed ? '칼을 쥔 손끝이 저리다. 이 칼은 피를 기억하고 있다. (살기 +6)' : '죽은 이에게 미안한 마음이 든다. (살기 +6)'],
        ]);
      }
      return s;
    },
  },
  {
    key: 'tr_carving',
    kind: 'TREASURE',
    label: () => '석벽의 검흔',
    once: false,
    build: () => ({
      title: '석벽에 새겨진 검흔(劍痕)',
      category: 'LIFE',
      narration: '절벽 아래 동굴 벽에 칼자국이 가득하다. 누군가 이곳에서 수십 년을 홀로 수련한 흔적이다.',
      script: [
        N('동굴 안쪽 벽에 칼자국이 빽빽하다. 처음엔 어지러운 낙서 같았으나, 자세히 보니 한 줄기 흐름이 있다.'),
        N('맨 끝의 칼자국 하나만 유독 깊다. 마치 벽을 베어 넘으려다 멈춘 것처럼.'),
      ],
      options: [
        { id: 'study', label: '이틀 동안 칼자국을 따라 그어 본다 (2일)', hint: '장착 초식 숙련·깨달음' },
        { id: 'leave', label: '지나간다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt !== 'study') return s;
      let n = spendDays(s, 2);
      n = trainEquipped(n, 70);
      const g = gainInsight(n, 8, '석벽의 검흔');
      return say(highlight(g.state, '동굴 석벽의 검흔을 따라 그었다'), [
        ['나레이션', '칼자국을 따라 이틀을 휘둘렀다. 옛사람의 검로가 손목에 스며든다. (장착 초식 숙련 +70)'],
        ['나레이션', `마지막 깊은 칼자국 앞에서 오래 멈춰 섰다. 그도 이 벽 앞에서 멈췄던 것이다. ${g.text}`],
      ]);
    },
  },
  {
    key: 'tr_wreck',
    kind: 'TREASURE',
    label: () => '난파선',
    once: false,
    cond: (_s, r) => r.legs.some((l) => l.terrain === 'COAST'),
    build: (s) => ({
      title: '모래톱에 얹힌 이국의 배',
      category: 'FANTASY',
      narration: '갯바위에 걸린 큰 배. 돛대가 부러졌고, 뱃머리에 낯선 글자가 새겨져 있다.',
      script: [
        N('갯바위에 걸린 거대한 배. 부러진 돛대 아래로 낯선 글자가 새겨진 궤짝들이 흩어져 있다.'),
        P(byCountry(s, '어부', '어민', '어부'), '양인(洋人) 배라오. 사람은 다 죽었는지 아무도 없소. 관아에 알리면 골치 아프니 다들 모른 척하지요.'),
      ],
      options: [
        { id: 'search', label: '선실을 뒤진다 (2일)', hint: '서양 서적·병기' },
        { id: 'report', label: '관아에 알린다 (1일)', hint: '명성·조정의 신임' },
        { id: 'leave', label: '모른 척한다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'search') {
        let n = spendDays(s, 2);
        if (chance(0.5)) {
          const id = pickBook(n, (b) => b.rarity === 'WESTERN');
          if (id) {
            const g = giveBook(n, id, 10);
            n = addRep(g.state, { arcane: 3 });
            return say(highlight(n, `난파선에서 ${josa(g.title || '', '을를')} 건졌다`), [['나레이션', `젖은 궤짝 안 기름종이에 싸인 책 한 권. ${g.title}! 그림 속 사람들이 낯선 자세로 칼을 겨누고 있다.`]]);
          }
        }
        const g = giveWeapon(n, rand(['wp_we_01', 'wp_we_02', 'wp_we_05']));
        if (g.name) return say(highlight(g.state, `난파선에서 「${g.name}」을(를) 건졌다`), [['나레이션', `선장실 벽에 걸린 가느다란 칼. 「${g.name}」!`]]);
        return say(addMoney(n, 30), [['나레이션', `은화 몇 닢을 건졌다. (+30${cur(n)})`]]);
      }
      if (opt === 'report') {
        let n = spendDays(s, 1);
        n = addFame(addRep(n, { virtue: 3 }), 12);
        return say(n, [['나레이션', '관아에 알리자 아전들이 몰려와 배를 봉했다. 고을 원님이 이름을 물었다. (명성 +12)']]);
      }
      return s;
    },
  },
  {
    key: 'tr_sealed',
    kind: 'TREASURE',
    label: () => '봉인된 상자',
    // 일생에 세 번까지 (예전에는 한 번뿐이고 가중치도 낮아 금서를 만날 길이 거의 없었다)
    once: false,
    weight: 0.9,
    cond: (s) => Number(s.flags.storyMemory?.sealed_boxes || 0) < 3,
    build: () => ({
      title: '부적으로 봉인된 상자',
      category: 'FANTASY',
      illustration: '/assets/px_chr_v_sealed_box.jpg',
      narration: '고목 뿌리 사이에 검은 상자가 묻혀 있다. 누렇게 바랜 부적이 겹겹이 붙어 있고, 그 위에 피로 쓴 글씨가 있다: 「열지 말 것」.',
      script: [
        N('고목 뿌리 사이, 겹겹이 부적이 붙은 검은 상자. 피로 쓴 글씨: 「열지 말 것」.'),
        N('상자에 손을 대자 손끝이 차갑게 저려 온다. 안에서 무언가가 기다리고 있다.'),
      ],
      options: [
        { id: 'open', label: '봉인을 뜯는다', hint: '이계의 금서 — 이단 +12' },
        { id: 'bury', label: '더 깊이 묻고 돌을 얹는다', hint: '구도' },
        { id: 'leave', label: '못 본 척한다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'open') {
        const id = pickBook(s, (b) => b.rarity === 'GRIMOIRE');
        let n = addRep(remember(s, 'sealed_boxes', String(Number(s.flags.storyMemory?.sealed_boxes || 0) + 1)), { arcane: 12 });
        if (id) {
          const g = giveBook(n, id, 0);
          n = highlight(g.state, `봉인된 상자에서 ${josa(g.title || '', '을를')} 꺼냈다`);
          return say(n, [
            ['나레이션', '부적이 저절로 타올랐다. 상자 안에는 이 세상의 것이 아닌 책 한 권.'],
            ['나레이션', `${g.title} — 펼치자 글자가 꿈틀거렸다. (이단 +12)`],
          ]);
        }
        return say(n, [['나레이션', '상자는 비어 있었다. 그런데 그날 밤부터 이상한 꿈을 꾼다. (이단 +12)']]);
      }
      if (opt === 'bury') {
        const n = addRep(addStats(s, { wil: 2 }), { ascetic: 6 });
        return say(n, [['나레이션', '상자를 더 깊이 묻고 큰 돌을 얹었다. 손끝의 냉기가 가셨다. (정신 +2, 구도 +6)']]);
      }
      return s;
    },
  },

  // ───────── 길 위의 돌발 사건 ─────────
  {
    key: 'amb_bandit',
    kind: 'AMBUSH',
    build: (s, c) => ({
      title: `매복 — ${c.region?.bandit.name || '도적'}`,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '덤불이 갈라지며 칼 든 사내들이 길을 막아선다.',
      script: [
        N('덤불이 갈라지더니 칼 든 사내들이 앞뒤로 길을 막아섰다.'),
        P(c.region?.bandit.name || '도적 두목', byCountry(s, '이 길은 우리 산채 길이여. 봇짐 내려놓고 가면 목숨은 붙여 주지.', '녹림의 길에는 녹림의 법이 있다. 통행세를 내라.', '노자를 두고 가라. 칼은… 뭐, 두고 가도 좋고.'), '칼등으로 어깨를 두드리며', 'ANGRY'),
      ],
      options: [
        { id: 'fight', label: '칼을 뽑는다', hint: '⚠ 진검승부 · 지면 노자를 빼앗기고 수행을 접는다, 목숨도 장담 못 한다' },
        { id: 'pay', label: `노자를 내준다 (${Math.max(10, Math.round(s.money * 0.15))}${cur(s)})` },
        { id: 'flee', label: '산길로 돌아서 피한다 (2일)', hint: '건강 -6' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'fight') {
        return journeyBattle(s, c, opt, {
          stakes: 'HOSTILE', title: `매복 — ${c.region?.bandit.name || '도적'}`,
          subtitle: c.region?.bandit.title || '길을 막은 도적',
          name: c.region?.bandit.name || '도적 두목',
          enemyTitle: c.region?.bandit.title || '도적',
          age: 34,
          ai: 'AGGRESSIVE',
          scale: roadScale(s, 0.8 + (c.region?.danger || 0.5) * 0.3),
          weapon: 'BLADE',
          skills: byCountry(s, ['base_h_slash', 'sk_kr_01', 'sk_kr_02'], ['base_h_slash', 'sk_cn_01', 'sk_cn_02'], ['base_h_slash', 'sk_jp_03', 'sk_jp_01']),
          rewardMoney: 25,
          rewardFame: 12,
        });
      }
      if (opt === 'pay') {
        const loss = Math.max(10, Math.round(s.money * 0.15));
        return say(addMoney(s, -loss), [['나레이션', `노자 ${loss}${cur(s)}을 내주었다. 두목이 비웃으며 길을 비켰다.`]]);
      }
      const n = addHealth(spendDays(s, 2), -6);
      return say(n, [['나레이션', '가시덤불을 헤치며 산길로 돌았다. 이틀을 잃고 팔다리가 긁혔다. (건강 -6)']]);
    },
    onBattle: (s, _opt, won, c) => {
      if (won) return highlight(s, `${josa(c.region?.bandit.name || '도적', '을를')} 물리쳤다`);
      const loss = Math.max(10, Math.round(s.money * 0.25));
      return highlight(addMoney(s, -loss), `도적에게 져서 노자 ${loss}${cur(s)}을 빼앗겼다`);
    },
  },
  {
    key: 'amb_beast',
    kind: 'AMBUSH',
    build: (s, c) => ({
      title: `맹수 — ${c.region?.beast.name || '산짐승'}`,
      category: 'DUEL',
      sceneActor: 'ENEMY',
      narration: '숲이 갑자기 조용해졌다. 새들이 일제히 날아오른다.',
      script: [
        N('숲이 갑자기 조용해졌다. 새들이 일제히 날아오르고, 풀숲 너머에서 낮은 숨소리가 들린다.'),
        N(`${c.region?.beast.name || '맹수'}다. ${c.region?.beast.title || ''}`),
      ],
      options: [
        { id: 'fight', label: '맞선다', hint: '⚠ 진검승부 · 짐승은 봐주지 않는다, 지면 수행을 접는다' },
        { id: 'back', label: '눈을 마주친 채 천천히 물러난다 (2일)' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'fight') {
        return journeyBattle(s, c, opt, {
          stakes: 'HOSTILE', title: `맹수 — ${c.region?.beast.name || '산짐승'}`,
          subtitle: c.region?.beast.title || '굶주린 짐승',
          name: c.region?.beast.name || '산짐승',
          enemyTitle: c.region?.beast.title || '맹수',
          age: 9,
          ai: 'HEAVY',
          scale: roadScale(s, 0.9),
          weapon: 'UNARMED',
          skills: ['sk_kr_03', 'sk_cn_01', 'sk_we_04'],
          rewardMoney: 15,
          rewardFame: 20,
        });
      }
      return say(spendDays(s, 2), [['나레이션', '짐승과 눈을 맞춘 채 한 걸음씩 물러났다. 등에 식은땀이 흘렀다. 이틀을 돌아갔다.']]);
    },
    onBattle: (s, _opt, won, c) => {
      if (won) {
        const tiger = (c.region?.beast.name || '').includes('산군');
        const n = addFame(s, tiger ? 30 : 10);
        return highlight(n, tiger ? '호랑이를 잡아 마을의 은인이 되었다' : `${josa(c.region?.beast.name || '맹수', '을를')} 물리쳤다`);
      }
      const n = { ...addHealth(s, -18), statuses: [...s.statuses.filter((x) => x.id !== 'LIGHT_INJURY'), { id: 'LIGHT_INJURY' as const, label: '맹수에게 입은 상처', turnsRemaining: 2 }] };
      return highlight(n, `${c.region?.beast.name || '맹수'}에게 크게 다쳤다`);
    },
  },
  {
    key: 'amb_weather',
    kind: 'AMBUSH',
    build: (s) => {
      const w: Record<Season, [string, string]> = {
        SPRING: ['꽃샘 우박', '맑던 하늘에서 갑자기 우박이 쏟아진다.'],
        SUMMER: ['장마 폭우', '하늘이 뚫린 듯 비가 쏟아진다. 개울이 순식간에 불어 길을 삼켰다.'],
        AUTUMN: ['산 안개', '한 치 앞도 보이지 않는 안개가 산을 덮었다. 길이 사라졌다.'],
        WINTER: ['눈보라', '눈보라가 몰아친다. 발자국이 금세 덮이고 손끝이 얼어붙는다.'],
      };
      const [title, scene] = w[s.season];
      return {
        title,
        category: 'LIFE',
        narration: scene,
        script: [N(scene)],
        options: [
          { id: 'wait', label: '바위 밑에서 지나가길 기다린다 (3일)' },
          { id: 'push', label: '그대로 밀고 나간다', hint: '건강 -10, 몸살이 날 수도' },
        ],
      };
    },
    resolve: (s, opt) => {
      if (opt === 'wait') return say(spendDays(s, 3), [['나레이션', '바위 밑에서 사흘을 버텼다. 하늘이 개자 다시 길을 나섰다.']]);
      let n = addHealth(s, -10);
      if (chance(0.35)) n = { ...n, statuses: [...n.statuses.filter((x) => x.id !== 'LIGHT_INJURY'), { id: 'LIGHT_INJURY', label: '길에서 얻은 몸살', turnsRemaining: 2 }] };
      return say(addStats(n, { vit: 1 }), [['나레이션', '이를 악물고 밀고 나갔다. 몸이 상했지만 다리는 단단해졌다. (건강 -10, 체력 +1)']]);
    },
  },
  {
    key: 'amb_checkpoint',
    kind: 'AMBUSH',
    cond: (s) => s.country === 'JAPAN' || s.country === 'KOREA',
    build: (s) => ({
      title: byCountry(s, '관아 검문', '관병 초소', '세키쇼(關所) 검문'),
      category: 'LIFE',
      sceneActor: 'ENEMY',
      narration: byCountry(s, '포졸들이 길을 막고 호패를 보자 한다.', '관병들이 길을 막고 노인(路引)을 보자 한다.', '관문 앞에서 관리가 통행증을 보자 한다. 「들어오는 총포, 나가는 여인」을 엄히 살핀다.'),
      script: [
        N(byCountry(s, '포졸들이 창을 엇갈려 길을 막는다.', '관병들이 창을 엇갈려 길을 막는다.', '하코네 관문. 관리가 뒷짐을 지고 줄 선 이들을 훑어본다.')),
        P(byCountry(s, '포교', '관병 대장', '관문 관리'), '칼 찬 자는 따로 신원을 확인해야 하오. 어디 소속이오?'),
      ],
      options: [
        { id: 'fame', label: '도장의 이름을 댄다', hint: s.fame >= 300 ? '명성이 있어 통할 것이다' : '아직 이름이 알려지지 않았다', disabled: s.fame < 300, disabledReason: '명성 300 이상' },
        { id: 'bribe', label: `찔러 준다 (15${cur(s)})`, disabled: s.money < 15, disabledReason: '노자가 부족하다' },
        { id: 'wait', label: '순순히 조사를 받는다 (2일)' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'fame') return say(addFame(s, 3), [['나레이션', `「${s.sectName}」이라는 말에 관리가 고개를 끄덕이며 길을 열었다.`]]);
      if (opt === 'bribe') return say(addRep(addMoney(s, -15), { commerce: 3 }), [['나레이션', '엽전이 소매로 사라지자 창이 거두어졌다.']]);
      return say(spendDays(s, 2), [['나레이션', '이틀 동안 이것저것 캐물은 끝에 겨우 풀려났다.']]);
    },
  },
];
