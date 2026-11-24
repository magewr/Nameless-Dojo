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
  highlight,
  JourneyEventDef,
  journeyBattle,
  N,
  P,
  rand,
  roadScale,
  say,
  spendDays,
  takeEcho,
  trainEquipped,
} from '../../engine/journeyCore';

// 계절과 시기가 정해진 길 위의 사건. 그 계절, 그 해, 그 길이 아니면 만날 수 없다.
// 시기는 실제 제도·사건에 맞췄다: 식년시는 자·묘·오·유년(3년마다) 봄, 강남 향시는 같은 해 가을,
// 동지사는 해마다 겨울, 다이묘 행렬은 봄·여름, 오카게마이리는 1771년, 시마바라 대변은 1792년 봄, 아사마산 분화는 1783년 여름.

const pct = (p: number) => `${Math.round(Math.max(0.05, Math.min(0.95, p)) * 100)}%`;
const clampP = (p: number) => Math.max(0.05, Math.min(0.95, p));
// 1750년(경오년)이 식년이다 — 1750 % 3 = 1
const SIKNYEON = { every: 3, rem: 1 };

export const SEASONAL_EVENTS: JourneyEventDef[] = [
  // ═════════ 조선 ═════════
  {
    key: 's_kr_gwageo',
    kind: 'PEOPLE',
    countries: ['KOREA'],
    once: true,
    trigger: { seasons: ['SPRING'], yearCycle: SIKNYEON, terrain: ['ROAD', 'TOWN', 'PASS'] },
    label: () => '과거길의 선비',
    build: (s) => ({
      title: '식년 과거길 — 노자를 잃은 선비',
      category: 'LIFE',
      narration: '식년(式年) 봄, 한양으로 향하는 과거길. 짚신이 해진 선비 하나가 길가에 주저앉아 있다.',
      script: [
        N(`${s.year}년은 식년이다. 삼 년에 한 번 서는 과거를 보러 팔도의 선비들이 한양으로 몰린다.`),
        N('길가에 주저앉은 젊은 선비. 봇짐 끈이 칼에 잘려 있다.'),
        P('젊은 선비', '노자를 몽땅 털렸소… 이번에 못 보면 또 삼 년이오. 어머님이 그때까지 사실지…', '고개를 떨구며'),
      ],
      options: [
        { id: 'give', label: `노자를 보태 준다 (30${cur(s)})`, disabled: s.money < 30, disabledReason: '노자가 부족하다', hint: '훗날 인연이 될지도' },
        { id: 'escort', label: '도둑을 쫓아가 노자를 되찾는다 (1일)', hint: `민첩 판정 약 ${pct(0.35 + s.stats.agi * 0.007)}` },
        { id: 'leave', label: '갈 길이 바쁘다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'leave') return s;
      let n = s;
      let ok = true;
      if (opt === 'give') n = addMoney(n, -30);
      else {
        n = spendDays(n, 1);
        ok = chance(clampP(0.35 + s.stats.agi * 0.007));
        if (ok) n = addFame(n, 5);
      }
      if (!ok) return say(n, [['나레이션', '반나절을 쫓았지만 도둑은 장터 인파 속으로 사라졌다. 선비는 그래도 고맙다며 걸어서 가겠다고 했다.']]);
      n = addRep(n, { virtue: 6 });
      n = addEcho(n, { key: 'gwageo_pass', minYears: 3, maxYears: 7, channel: 'HOME', bornText: `${s.year}년 식년 과거길에서 노자를 잃은 선비를 도왔다` });
      return say(n, [['젊은 선비', '급제하면… 반드시 찾아뵙겠소!'], ['나레이션', '선비는 몇 번이나 뒤돌아 절하며 한양 쪽으로 걸어갔다.']]);
    },
  },
  {
    key: 'echo_gwageo_pass',
    kind: 'ECHO_HOME',
    build: () => ({
      title: '어사화를 꽂은 선비',
      category: 'HISTORICAL',
      narration: '머리에 어사화를 꽂은 젊은 관원이 도장을 찾아왔다.',
      script: [N('어사화를 꽂은 관원이 대문 앞에서 갓을 벗는다. 과거길에서 노자를 잃었던 그 선비다.'), P('젊은 관원', '그해에는 떨어졌지만, 그 노자로 버틴 덕에 이번에 급제했습니다. 고을 수령으로 나갑니다. 무예 교관이 필요한데…', '웃으며')],
      options: [
        { id: 'teach', label: '제자 하나를 교관으로 보내 준다', hint: '명성·관아의 신임' },
        { id: 'wine', label: '술이나 한잔하자고 붙잡는다', hint: '인덕' },
      ],
    }),
    resolve: (s, opt) => {
      const t = takeEcho(s, 'gwageo_pass');
      let n = opt === 'teach' ? addFame(t.state, 45) : addRep(t.state, { virtue: 12 });
      if (t.echo) n = echoMilestone(n, t.echo, opt === 'teach' ? '그 선비가 급제해 수령이 되었고, 도장 제자가 관아 교관이 되었다' : '그 선비가 급제해 술 한 동이를 들고 찾아왔다');
      return say(n, [['나레이션', opt === 'teach' ? '관아가 도장을 보는 눈이 달라졌다. (명성 +45)' : '밤늦도록 과거길 이야기를 나눴다.']]);
    },
  },
  {
    key: 's_kr_bori',
    kind: 'PEOPLE',
    countries: ['KOREA'],
    trigger: { seasons: ['SPRING'], terrain: ['TOWN', 'ROAD', 'FOREST'] },
    label: () => '보릿고개 마을',
    build: (s) => ({
      title: '보릿고개 — 환곡 아전',
      category: 'HISTORICAL',
      narration: '묵은 곡식은 떨어지고 보리는 아직 안 익은 춘궁기. 관아 아전이 환곡 이자를 받으러 왔다.',
      script: [
        N('보릿고개. 묵은 곡식은 바닥났고 보리는 아직 푸르다. 아이들이 칡뿌리를 씹는다.'),
        P('관아 아전', '빌려 간 환곡에 이자 열에 하나… 아니 열에 셋이다! 못 내면 소를 끌고 간다!', '장부를 흔들며', 'ANGRY'),
        P('늙은 농부', '열에 하나라고 했잖소… 소마저 끌려가면 올해 농사는 끝이오.'),
      ],
      options: [
        { id: 'expose', label: '아전의 장부를 빼앗아 조작을 밝힌다', hint: `통찰 판정 약 ${pct(0.35 + s.stats.ins * 0.006)} · 살기·인덕` },
        { id: 'pay', label: `차액을 대신 내준다 (40${cur(s)})`, disabled: s.money < 40, disabledReason: '노자가 부족하다', hint: '인덕' },
        { id: 'leave', label: '관아 일에 끼지 않는다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'pay') return say(addRep(addMoney(s, -40), { virtue: 12 }), [['나레이션', '소는 외양간에 남았다. 농부가 보리가 익으면 첫 수확을 보내겠다고 했다. (인덕 +12)']]);
      if (opt === 'expose') {
        const ok = chance(clampP(0.35 + s.stats.ins * 0.006));
        return ok
          ? say(addFame(addRep(s, { virtue: 10, ruthless: 4 }), 12), [['나레이션', '장부에 덧칠한 먹 자국이 드러났다. 아전이 얼굴이 하얘져서 달아났다. 마을 사람들이 둘러서서 절을 했다.']])
          : say(addRep(s, { ruthless: 6 }), [['나레이션', '장부를 빼앗았지만 조작을 찾지 못했다. 아전이 「관아 일을 방해했다」며 이를 갈았다.']]);
      }
      return s;
    },
  },
  {
    key: 's_kr_dongjisa',
    kind: 'HISTORY',
    countries: ['KOREA'],
    regions: ['KR_GWANSEO'],
    trigger: { seasons: ['WINTER'] },
    once: false,
    label: () => '동지사 행렬',
    build: (s) => ({
      title: '동지사(冬至使) 행렬',
      category: 'HISTORICAL',
      narration: '해마다 동지 무렵 연경으로 떠나는 사신 행렬. 방물 수레와 역관, 마부, 장사치까지 수백 명이 의주대로를 메운다.',
      script: [
        N('동지 무렵이면 연경(북경)으로 가는 동지사가 의주대로를 지난다. 사신 셋에 역관과 군관, 마부와 장사치까지 수백 명.'),
        P('행렬 군관', '압록강 건너 책문까지 도적이 들끓는다. 칼 좀 쓰는 사람이면 군관 대우로 데려가지.', '말 위에서'),
        P('역관', '…무사 양반, 인삼 몇 근만 몰래 실어 주면 책문후시(柵門後市)에서 은으로 바꿔 드리리다.', '소매를 잡아끌며'),
      ],
      options: [
        { id: 'guard', label: '책문까지 호위한다 (4일)', hint: `품삯 60${cur(s)} · 도적을 만날 수도` },
        { id: 'smuggle', label: '역관의 밀무역에 끼어든다', hint: '큰돈 · 적발되면 낭패' },
        { id: 'watch', label: '행렬을 구경만 한다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'watch') return say(addStats(s, { ins: 1 }), [['나레이션', '청나라로 가는 사람들의 얼굴에 설렘과 두려움이 반반이었다. (통찰 +1)']]);
      if (opt === 'smuggle') {
        if (chance(0.25)) return say(addFame(addMoney(s, -60), -20), [['나레이션', '압록강 검문에서 인삼 꾸러미가 걸렸다. 벌금을 물고 이름에 먹칠을 했다.']]);
        return say(addRep(addMoney(s, 120), { commerce: 10, ruthless: 3 }), [['나레이션', `책문후시의 청나라 상인이 은자로 값을 쳐 주었다. (+120${cur(s)})`]]);
      }
      const n = addMoney(spendDays(s, 4), 60);
      if (chance(0.35)) {
        return journeyBattle(n, c, opt, {
          stakes: 'HOSTILE', title: '책문 가는 길의 마적',
          subtitle: '사신 행렬을 노리는 도적',
          name: '압록강 마적 두목',
          enemyTitle: '국경의 마적',
          age: 38,
          ai: 'HEAVY',
          scale: roadScale(s, 1.0),
          weapon: 'POLEARM',
          skills: ['sk_cn_06', 'sk_kr_05', 'base_v_slash'],
          rewardFame: 25,
        });
      }
      return say(highlight(n, '동지사 행렬을 책문까지 호위했다'), [['나레이션', `무사히 책문까지 갔다. 군관이 품삯 60${cur(s)}을 쥐여 주었다.`]]);
    },
    onBattle: (s, _opt, won) => say(won ? addRep(s, { virtue: 4 }) : addHealth(s, -10), [['행렬 군관', won ? '자네 덕에 방물 수레가 무사했네. 위에 말해 두지.' : '수레 하나를 빼앗겼지만… 목숨은 건졌으니 됐네.']]),
  },
  {
    key: 's_kr_amhaeng',
    kind: 'PEOPLE',
    countries: ['KOREA'],
    once: true,
    trigger: { minRep: { virtue: 25 }, terrain: ['TOWN', 'ROAD'] },
    label: () => '남루한 선비',
    build: () => ({
      title: '암행어사',
      category: 'HISTORICAL',
      narration: '주막 구석의 남루한 선비가 자꾸 이쪽을 본다. 소매 속에 둥근 무언가가 비친다 — 마패다.',
      script: [
        N('주막 구석, 해진 도포의 선비가 국밥을 먹으며 자꾸 이쪽을 살핀다. 소매 끝에 둥근 마패가 비친다.'),
        P('남루한 선비', '…그대가 길에서 의로운 일을 한다는 소문을 들었소. 이 고을 사또가 백성의 피를 빨고 있소. 내일 출두하려는데, 사또가 거느린 포교들이 만만치 않소.', '목소리를 낮추며'),
      ],
      options: [
        { id: 'help', label: '출두에 함께한다', hint: '⚠ 진검승부 · 명성·인덕' },
        { id: 'leave', label: '나랏일에 휘말리지 않는다' },
      ],
    }),
    resolve: (s, opt, c) =>
      opt === 'help'
        ? journeyBattle(s, c, opt, { stakes: 'HOSTILE', title: '암행어사 출두요!', subtitle: '탐관오리의 포교 대장', name: '사또의 포교 대장', enemyTitle: '탐관오리의 칼', age: 40, ai: 'AGGRESSIVE', scale: roadScale(s, 1.0), weapon: 'BLADE', skills: ['sk_kr_02', 'sk_kr_01', 'sk_kr_06'], rewardFame: 30 })
        : s,
    onBattle: (s, _opt, won) =>
      won
        ? say(highlight(addRep(addFame(s, 25), { virtue: 12 }), '암행어사의 출두를 도왔다'), [['나레이션', '「암행어사 출두요!」 역졸들의 고함과 함께 동헌 마당이 뒤집혔다. 곳간에서 쌓아 둔 곡식이 쏟아져 나왔다.']])
        : say(s, [['나레이션', '포교 대장에게 밀렸지만, 그 사이 어사가 동헌을 장악했다.']]),
  },
  {
    key: 's_kr_harvest',
    kind: 'PEOPLE',
    countries: ['KOREA'],
    trigger: { seasons: ['AUTUMN'], terrain: ['ROAD', 'FOREST', 'TOWN'] },
    label: () => '추수 마당',
    build: (s) => ({
      title: '추수 마당의 다툼',
      category: 'LIFE',
      narration: '타작마당에서 마름과 소작인들이 멱살을 잡고 있다. 도조(賭租)를 반이나 내라는 것이다.',
      script: [N('타작마당. 볏단을 사이에 두고 마름과 소작인들이 멱살잡이 중이다.'), P('마름', '올해부터 도조는 반이다! 싫으면 땅을 내놓든가!', '지팡이를 휘두르며', 'ANGRY'), P('소작인', '흉년에 반을 떼면 겨울을 어찌 나라고…')],
      options: [
        { id: 'mediate', label: '양쪽 사정을 듣고 중재한다', hint: `통찰 판정 약 ${pct(0.35 + s.stats.ins * 0.006 + s.reputation.virtue * 0.002)}` },
        { id: 'scare', label: '마름의 지팡이를 칼집으로 쳐 낸다', hint: '살기·인덕' },
        { id: 'work', label: '하루 타작을 거들고 밥을 얻어먹는다 (1일)', hint: '건강·체력' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'work') return say(addStats(addHealth(spendDays(s, 1), 8), { vit: 1, str: 1 }), [['나레이션', '도리깨질을 하루 하니 온몸이 뻐근하다. 햅쌀밥이 꿀맛이었다. (건강 +8, 체력·근력 +1)']]);
      if (opt === 'scare') return say(addRep(s, { ruthless: 5, virtue: 5 }), [['나레이션', '지팡이가 볏단 위로 날아갔다. 마름은 「두고 보자」며 물러났다. 이 겨울이 어떻게 될지는 모르겠다.']]);
      const ok = chance(clampP(0.35 + s.stats.ins * 0.006 + s.reputation.virtue * 0.002));
      return say(ok ? addRep(addFame(s, 8), { virtue: 8 }) : s, [['나레이션', ok ? '「흉년이니 올해만 삼분의 일로」 — 마름도 마지못해 고개를 끄덕였다.' : '양쪽 다 제 말만 했다. 해가 질 때까지 결론이 나지 않았다.']]);
    },
  },

  // ═════════ 청 ═════════
  {
    key: 's_cn_xiangshi',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_JIANGNAN'],
    once: true,
    trigger: { seasons: ['AUTUMN'], yearCycle: SIKNYEON },
    label: () => '향시를 보러 가는 수험생들',
    build: () => ({
      title: '강남 향시(鄉試) — 대리 시험꾼',
      category: 'HISTORICAL',
      narration: '자·묘·오·유년 가을, 강남 공원(貢院)에 만 명이 넘는 수험생이 몰린다. 그 틈에 「대리 시험」을 파는 자들이 있다.',
      script: [
        N('향시가 열리는 가을. 강남 공원의 만 칸 넘는 독방에 수험생들이 갇혀 사흘씩 글을 쓴다.'),
        P('수상한 사내', '은자 이백이면 장원 실력자가 대신 들어가 써 주지. 무사 양반은 그냥 문지기 눈만 좀 돌려 주면 되오.', '은자를 흔들며'),
        P('늙은 수험생', '나는 서른 해째 떨어졌소… 저런 놈들 때문에.', '한숨을 쉬며'),
      ],
      options: [
        { id: 'expose', label: '관아에 고발하고 대리 시험꾼을 붙잡는다', hint: '⚠ 진검승부 · 명성·인덕' },
        { id: 'take', label: '눈을 돌려 주고 돈을 받는다', hint: '+80은자 · 살기·상무' },
        { id: 'leave', label: '모른 척한다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'take') return say(addRep(addMoney(s, 80), { ruthless: 8, commerce: 6 }), [['나레이션', '은자 여든이 소매로 들어왔다. 늙은 수험생의 한숨이 귓가에 남았다.']]);
      if (opt === 'expose')
        return journeyBattle(s, c, opt, { stakes: 'HOSTILE', title: '대리 시험 조직의 칼잡이', subtitle: '과거의 공정을 지키다', name: '시험꾼 패거리 호위', enemyTitle: '부정 시험 조직', age: 33, ai: 'RUSHDOWN', scale: roadScale(s, 0.9), weapon: 'BLADE', skills: ['sk_cn_02', 'sk_cn_05', 'base_h_slash'], rewardFame: 25 });
      return s;
    },
    onBattle: (s, _opt, won) => (won ? say(addRep(s, { virtue: 10 }), [['나레이션', '시험꾼들이 줄줄이 묶여 갔다. 그해 강남 방(榜)에는 늙은 수험생의 이름도 있었다고 한다.']]) : s),
  },
  {
    key: 's_cn_flood',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_HUGUANG', 'CN_JIANGNAN'],
    trigger: { seasons: ['SUMMER'], terrain: ['RIVER', 'TOWN', 'FOREST'] },
    label: () => '무너진 제방',
    build: () => ({
      title: '장강의 여름 — 무너진 제방',
      category: 'HISTORICAL',
      narration: '여름 큰물에 제방이 터졌다. 구휼미 수레가 왔지만, 현의 서리들이 절반을 빼돌리고 있다.',
      script: [N('여름 장마에 강물이 제방을 넘었다. 지붕 위에 올라앉은 사람들이 손을 흔든다.'), N('구휼미 수레가 도착했지만, 현의 서리들이 쌀가마를 뒷골목으로 빼돌리는 것이 보인다.')],
      options: [
        { id: 'dike', label: '마을 장정들과 제방을 쌓는다 (4일)', hint: '체력·인덕' },
        { id: 'grain', label: '빼돌린 구휼미를 되찾는다', hint: '⚠ 진검승부 · 인덕·명성' },
        { id: 'leave', label: '물이 빠지기 전에 다른 길로 간다 (2일)' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'leave') return spendDays(s, 2);
      if (opt === 'dike') return say(addRep(addStats(addHealth(spendDays(s, 4), -6), { vit: 2, str: 1 }), { virtue: 14 }), [['나레이션', '나흘 밤낮으로 흙가마를 날랐다. 물길이 돌아섰다. (체력 +2, 근력 +1, 인덕 +14)']]);
      return journeyBattle(s, c, opt, { stakes: 'HOSTILE', title: '현의 서리와 왈패', subtitle: '구휼미를 빼돌리는 자들', name: '서리의 왈패 두목', enemyTitle: '관아에 붙어사는 무뢰배', age: 35, ai: 'AGGRESSIVE', scale: roadScale(s, 0.85), weapon: 'POLEARM', skills: ['sk_cn_06', 'sk_cn_02', 'base_h_slash'], rewardFame: 20 });
    },
    onBattle: (s, _opt, won) => (won ? say(addRep(s, { virtue: 12 }), [['나레이션', '쌀가마가 지붕 위 사람들에게 돌아갔다.']]) : s),
  },
  {
    key: 's_cn_qingming',
    kind: 'PEOPLE',
    countries: ['CHINA'],
    trigger: { seasons: ['SPRING'], terrain: ['FOREST', 'MOUNTAIN', 'PASS'] },
    label: () => '청명 성묘',
    build: () => ({
      title: '청명절의 산소',
      category: 'LIFE',
      narration: '청명절, 가족들이 산소를 돌보는 날. 그런데 한 무덤이 파헤쳐져 있고, 도굴꾼들이 다음 무덤을 파고 있다.',
      script: [N('청명절. 집집마다 지전을 태우며 산소를 돌본다.'), P('울먹이는 과부', '남편 무덤이… 관이 열려 있소. 저기, 저놈들이!', '손가락질하며', '!')],
      options: [
        { id: 'fight', label: '도굴꾼들을 쫓는다', hint: '⚠ 진검승부' },
        { id: 'rebury', label: '무덤을 다시 덮어 준다 (1일)', hint: '인덕' },
      ],
    }),
    resolve: (s, opt, c) =>
      opt === 'fight'
        ? journeyBattle(s, c, opt, { stakes: 'HOSTILE', title: '청명절의 도굴꾼', subtitle: '산소를 파헤치는 자들', name: '도굴꾼 우두머리', enemyTitle: '무덤 도둑', age: 41, ai: 'AGGRESSIVE', scale: roadScale(s, 0.75), weapon: 'BLADE', skills: ['base_h_slash', 'sk_cn_01', 'sk_cn_02'], rewardMoney: 30, rewardFame: 10 })
        : say(addRep(spendDays(s, 1), { virtue: 8 }), [['나레이션', '흙을 다시 덮고 지전을 함께 태웠다. 과부가 오래 절을 했다.']]),
    onBattle: (s, _opt, won) => say(won ? addRep(s, { virtue: 6 }) : s, [['나레이션', won ? '도굴꾼들이 훔친 부장품을 버리고 달아났다.' : '놈들은 산 너머로 사라졌다.']]),
  },
  {
    key: 's_cn_canal_ice',
    kind: 'HISTORY',
    countries: ['CHINA'],
    regions: ['CN_JIANGNAN'],
    trigger: { seasons: ['WINTER'], terrain: ['RIVER', 'ROAD', 'TOWN'] },
    label: () => '얼어붙은 조운선',
    build: (st) => ({
      title: '얼어붙은 조운(漕運) 선단',
      category: 'HISTORICAL',
      narration: '북경으로 쌀을 나르던 조운선들이 얼음에 갇혔다. 품삯을 못 받은 섬부(縴夫)들이 몽둥이를 들었다.',
      script: [N('대운하가 얼어붙어 조운선 수십 척이 갇혔다. 배를 끌던 섬부들이 석 달째 품삯을 못 받았다.'), P('섬부 우두머리', '감독관 놈이 우리 품삯을 노름판에 날렸다! 오늘 저놈 배를 불태운다!', '횃불을 들며', 'ANGRY')],
      options: [
        { id: 'mediate', label: '감독관을 끌어내 품삯을 내게 한다', hint: `위엄 판정 약 ${pct(0.3 + st.stats.wil * 0.004 + st.fame * 0.0002)}` },
        { id: 'leave', label: '관과 민의 싸움에 끼지 않는다' },
      ],
    }),
    resolve: (st, opt) => {
      if (opt !== 'mediate') return st;
      const ok = chance(clampP(0.3 + st.stats.wil * 0.004 + st.fame * 0.0002));
      return ok
        ? say(addFame(addRep(st, { virtue: 10 }), 12), [['나레이션', '감독관이 숨겨 둔 은궤를 열었다. 섬부들이 횃불을 내렸다.']])
        : say(addRep(addHealth(st, -8), { virtue: 4 }), [['나레이션', '말이 통하지 않았다. 횃불이 배에 옮겨붙고, 말리다 팔을 데었다.']]);
    },
  },
  {
    key: 's_cn_miaohui',
    kind: 'PEOPLE',
    countries: ['CHINA'],
    trigger: { seasons: ['SPRING', 'AUTUMN'], terrain: ['TOWN', 'TEMPLE'] },
    label: () => '묘회(廟會)',
    build: (s) => ({
      title: '묘회의 매예인(賣藝人)',
      category: 'LIFE',
      narration: '사당 앞 묘회. 웃통을 벗은 매예인이 돌을 이마로 깨며 소리친다. 「나를 쓰러뜨리면 은 열 냥!」',
      script: [N('사당 앞에 장이 섰다. 탕후루, 경극 무대, 사자춤.'), P('매예인', '자, 누구든 나를 한 걸음만 물러서게 하면 은 열 냥! 못 하면 동전 한 닢!', '가슴을 치며')],
      options: [
        { id: 'try', label: '맞붙어 본다', hint: `근력 판정 약 ${pct(0.3 + s.stats.str * 0.007)}` },
        { id: 'coin', label: '동전을 던져 주고 구경한다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'coin') return say(addHealth(addMoney(s, -1), 4), [['나레이션', '모처럼 웃었다. (건강 +4)']]);
      const ok = chance(clampP(0.3 + s.stats.str * 0.007));
      return say(ok ? addFame(addMoney(s, 10), 6) : addMoney(s, -1), [['나레이션', ok ? '매예인이 세 걸음이나 밀려났다. 구경꾼들의 환호! (+10)' : '바위처럼 꿈쩍도 않는다. 동전 한 닢을 내고 웃으며 물러났다.']]);
    },
  },

  // ═════════ 일본 ═════════
  {
    key: 's_jp_sankin',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_TOKAIDO'],
    trigger: { seasons: ['SPRING', 'SUMMER'], terrain: ['ROAD', 'TOWN', 'PASS'] },
    label: () => '다이묘 행렬',
    build: () => ({
      title: '산킨코타이 — 「시타니! 시타니!」',
      category: 'HISTORICAL',
      narration: '「시타니—! 시타니—!」 창을 세운 다이묘 행렬이 다가온다. 길 가던 모두가 땅에 엎드린다. 그때 공을 쫓던 아이가 행렬 앞으로 뛰어든다.',
      script: [
        N('봄, 영지와 에도를 오가는 다이묘 행렬. 선두의 무사가 「시타니!(엎드려라)」를 외친다.'),
        N('엎드린 사람들 사이로 공 하나가 굴러가고, 아이가 그 공을 쫓아 행렬 앞으로 뛰어든다.'),
        P('행렬 무사', '무례한 놈! 행렬을 가로지른 자는 그 자리에서 벤다!', '칼에 손을 얹으며', 'ANGRY'),
      ],
      options: [
        { id: 'shield', label: '아이를 감싸고 무사를 막아선다', hint: '⚠ 진검승부 · 위험' },
        { id: 'plead', label: '엎드려 아이 대신 사죄한다', hint: `위엄 판정 약 ${pct(0.35)} · 실패하면 크게 다친다` },
        { id: 'stay', label: '고개를 들지 않는다' },
      ],
    }),
    resolve: (s, opt, c) => {
      if (opt === 'stay') return say(addRep(s, { virtue: -4 }), [['나레이션', '비명 소리가 들렸다. 고개를 들었을 때 행렬은 이미 지나가 있었다.']]);
      if (opt === 'plead') {
        const ok = chance(clampP(0.35 + s.fame * 0.0002));
        return ok
          ? say(addRep(s, { virtue: 10 }), [['나레이션', '가마 안에서 「됐다, 가자」는 목소리가 들렸다. 무사가 칼을 거두었다.']])
          : say(addHealth(addRep(s, { virtue: 10 }), -18), [['나레이션', '칼등이 등을 내리쳤다. 아이는 무사했다. (건강 -18)']]);
      }
      return journeyBattle(s, c, opt, { stakes: 'HOSTILE', title: '다이묘 행렬의 무사', subtitle: '아이를 지키다', name: '행렬 경호 무사', enemyTitle: '번(藩)의 공무사', age: 30, ai: 'DUELIST', scale: roadScale(s, 1.05), weapon: 'BLADE', skills: ['sk_jp_01', 'sk_jp_03', 'sk_jp_02'], rewardFame: 20 });
    },
    onBattle: (s, _opt, won) =>
      won
        ? say(addRep(addFame(s, 10), { virtue: 12 }), [['나레이션', '무사의 칼이 길가로 튕겨 나갔다. 가마 안에서 웃음소리가 들리더니, 행렬은 그냥 지나갔다.']])
        : say(addHealth(s, -10), [['나레이션', '무사의 칼끝이 옷깃을 갈랐다. 그래도 아이는 도망쳤다.']]),
  },
  {
    key: 's_jp_okage',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    once: true,
    trigger: { periods: [{ year: 1771, seasons: ['SPRING', 'SUMMER'] }] },
    years: [1771, 1771],
    label: () => '오카게마이리 순례자',
    build: (st) => ({
      title: '메이와 8년의 오카게마이리',
      category: 'HISTORICAL',
      narration: '이세 신궁으로 향하는 순례자들이 길을 메웠다. 주인에게 말도 없이 뛰쳐나온 하인, 국자 하나만 든 아이들… 그 수가 이백만이라 한다.',
      script: [
        N('1771년 봄. 「오카게」라 적힌 국자를 든 사람들이 끝도 없이 이세로 걸어간다. 길가 사람들이 공짜로 밥과 짚신을 내준다.'),
        P('어린 순례자', '아저씨도 이세 가요? 같이 가요! 길에서 다 먹여 준대요!', '국자를 흔들며'),
      ],
      options: [
        { id: 'join', label: '사흘 동안 순례자들과 함께 걷는다 (3일)', hint: '정신·건강' },
        { id: 'feed', label: `주먹밥을 지어 나눈다 (20${cur(st)})`, hint: '인덕', disabled: st.money < 20, disabledReason: '노자가 부족하다' },
      ],
    }),
    resolve: (st, opt) =>
      opt === 'join'
        ? say(addHealth(addStats(spendDays(st, 3), { wil: 3 }), 10), [['나레이션', '모르는 이들과 노래하며 걸었다. 칼을 찬 사실조차 잊었다. (정신 +3, 건강 +10)']])
        : say(addRep(addMoney(st, -20), { virtue: 10 }), [['나레이션', '주먹밥이 순식간에 동났다. 아이들이 「오카게데!」 하며 손을 흔들었다.']]),
  },
  {
    key: 's_jp_edo_fire',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_TOKAIDO'],
    trigger: { seasons: ['WINTER', 'SPRING'], terrain: ['TOWN'] },
    label: () => '반종이 울린다',
    build: (s) => ({
      title: '에도의 불 — 「화재와 싸움은 에도의 꽃」',
      category: 'LIFE',
      narration: '북서풍이 부는 겨울밤, 반종(半鐘)이 미친 듯이 울린다. 마을 소방대 히케시가 불길 앞 집을 부숴 불길을 끊으려 한다.',
      script: [N('겨울밤 북서풍. 반종이 연달아 울린다. 나무와 종이로 된 집들이 순식간에 타오른다.'), P('히케시 우두머리', '불을 끄는 게 아니라 끊는 거요! 저 집을 부숴야 해! 힘 좀 쓰는 사람!', '마토이 깃발을 들고')],
      options: [
        { id: 'break', label: '함께 집을 부숴 불길을 끊는다', hint: `근력 판정 약 ${pct(0.35 + s.stats.str * 0.006)}` },
        { id: 'rescue', label: '불 속에 남은 사람을 찾는다', hint: '건강 위험 · 인덕' },
        { id: 'leave', label: '불길을 피해 다른 길로 간다' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'leave') return s;
      if (opt === 'rescue') return say(addFame(addRep(addHealth(s, -14), { virtue: 14 }), 15), [['나레이션', '연기 속에서 노파 하나를 업고 나왔다. 눈썹이 다 탔다. (건강 -14, 인덕 +14)']]);
      const ok = chance(clampP(0.35 + s.stats.str * 0.006));
      return say(ok ? addFame(addStats(s, { str: 1 }), 12) : addHealth(s, -8), [['나레이션', ok ? '기둥이 넘어가자 불길이 끊겼다. 히케시들이 마토이를 흔들며 함성을 질렀다.' : '불길이 먼저 넘어왔다. 소매에 불이 붙어 겨우 껐다.']]);
    },
  },
  {
    key: 's_jp_tsukimi',
    kind: 'PEOPLE',
    countries: ['JAPAN'],
    regions: ['JP_KYOTO'],
    trigger: { seasons: ['AUTUMN'] },
    label: () => '달맞이 연회',
    build: (s) => ({
      title: '쓰키미 — 공가(公家)의 달맞이 연회',
      category: 'LIFE',
      narration: '보름달 아래 공가의 정원. 억새와 경단을 차려 놓고 와카(和歌)를 읊는 연회에 무사 하나가 초대받았다.',
      script: [N('억새와 쓰키미 경단. 연못에 달이 두 개 떴다.'), P('늙은 공가', '칼 쓰는 분께도 달은 아름답소? 한 수 읊어 보시겠소.', '부채로 입을 가리며')],
      options: [
        { id: 'poem', label: '칼에 빗대어 한 수 읊는다', hint: `통찰 판정 약 ${pct(0.3 + s.stats.ins * 0.007)}` },
        { id: 'sword', label: '말 대신 달빛 아래 검무를 보인다', hint: '명성' },
      ],
    }),
    resolve: (s, opt) => {
      if (opt === 'sword') return say(addFame(trainEquipped(s, 20), 10), [['나레이션', '칼끝이 연못의 달을 가르자 공가들이 부채를 내려놓았다.']]);
      const ok = chance(clampP(0.3 + s.stats.ins * 0.007));
      if (!ok) return say(addFame(s, -3), [['나레이션', '부채 뒤에서 킥킥거리는 소리가 들렸다.']]);
      const g = gainInsight(addFame(s, 12), 5, '달맞이 연회');
      return say(g.state, [['늙은 공가', '「베지 않은 달이 가장 밝구나」라… 무사에게서 이런 노래를 듣다니.'], ['나레이션', g.text]]);
    },
  },
  {
    key: 's_jp_shimabara',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_KYUSHU'],
    once: true,
    years: [1792, 1792],
    trigger: { seasons: ['SPRING', 'SUMMER'] },
    label: () => '무너진 마유야마',
    build: () => ({
      title: '시마바라 대변(島原大變)',
      category: 'HISTORICAL',
      narration: '운젠의 마유야마가 무너져 바다로 쏟아졌다. 해일이 건너편 히고 해안까지 덮쳤다. 「시마바라 대변, 히고 메와쿠」.',
      script: [N('1792년 봄, 운젠 화산의 지진 끝에 마유야마가 통째로 무너져 바다에 쏟아졌다. 해일이 양쪽 해안을 쓸었다.'), N('갯벌 위로 부서진 배와 지붕이 널려 있다. 사람들이 가족의 이름을 부르며 헤맨다.')],
      options: [
        { id: 'search', label: '사흘 동안 잔해를 뒤져 사람을 찾는다 (3일)', hint: '인덕·명성' },
        { id: 'leave', label: '갈 길을 간다' },
      ],
    }),
    resolve: (s, opt) => (opt === 'search' ? say(highlight(addFame(addRep(addHealth(spendDays(s, 3), -6), { virtue: 20 }), 15), '시마바라 대변의 잔해에서 사람을 찾았다'), [['나레이션', '사흘 동안 무너진 지붕 아래서 세 사람을 꺼냈다. (인덕 +20)']]) : s),
  },
  {
    key: 's_jp_asama',
    kind: 'HISTORY',
    countries: ['JAPAN'],
    regions: ['JP_TOKAIDO'],
    once: true,
    years: [1783, 1783],
    trigger: { seasons: ['SUMMER', 'AUTUMN'] },
    label: () => '잿빛 들판',
    build: () => ({
      title: '아사마산 대분화',
      category: 'HISTORICAL',
      narration: '하늘이 잿빛이다. 아사마산이 터져 재가 들판을 덮었다. 벼가 재에 눌려 쓰러지고, 우물마다 재가 떴다.',
      script: [N('1783년 여름, 아사마산이 크게 터졌다. 에도까지 재가 날렸고, 산 아래 마을은 불붙은 흙더미에 묻혔다.'), P('농부', '올해 농사는 끝이오… 쌀값이 또 오르겠지.', '재를 털며')],
      options: [
        { id: 'help', label: '이틀 동안 우물과 논의 재를 걷어 낸다 (2일)', hint: '인덕·체력' },
        { id: 'leave', label: '입을 천으로 가리고 서둘러 지나간다', hint: '건강 -5' },
      ],
    }),
    resolve: (s, opt) => (opt === 'help' ? say(addStats(addRep(spendDays(s, 2), { virtue: 12 }), { vit: 1 }), [['나레이션', '재를 걷어 낸 우물에서 다시 맑은 물이 올라왔다.']]) : addHealth(s, -5)),
  },

  // ═════════ 어느 나라든 — 계절과 지형 ═════════
  {
    key: 's_flood_child',
    kind: 'PEOPLE',
    trigger: { seasons: ['SUMMER'], terrain: ['RIVER', 'COAST'] },
    label: () => '불어난 나루',
    build: (s) => ({
      title: `${byCountry(s, '장마', '매우(梅雨)', '쓰유')} 끝의 나루`,
      category: 'LIFE',
      narration: '장마로 불어난 강. 나룻배가 뒤집혀 아이 하나가 떠내려간다.',
      script: [N('장마로 누렇게 불어난 강물. 뒤집힌 나룻배 옆으로 작은 손 하나가 떠올랐다 가라앉는다.'), P('뱃사공', '아이가! 아이가 떠내려간다!', '삿대를 내밀며', '!')],
      options: [
        { id: 'jump', label: '뛰어든다', hint: `체력·민첩 판정 약 ${pct(0.35 + (s.stats.vit + s.stats.agi) * 0.004)}` },
        { id: 'rope', label: '밧줄을 던져 건져 올린다', hint: `통찰 판정 약 ${pct(0.3 + s.stats.ins * 0.006)}` },
      ],
    }),
    resolve: (s, opt) => {
      const ok = chance(clampP(opt === 'jump' ? 0.35 + (s.stats.vit + s.stats.agi) * 0.004 : 0.3 + s.stats.ins * 0.006));
      if (ok) return say(addFame(addRep(s, { virtue: 12 }), 10), [['나레이션', '아이를 끌어안고 물가로 기어 나왔다. 어미가 아이를 안고 주저앉아 울었다. (인덕 +12)']]);
      return say(addHealth(s, opt === 'jump' ? -15 : -2), [['나레이션', opt === 'jump' ? '물살에 휩쓸려 한참을 떠내려갔다. 아이는 뱃사공이 겨우 건졌다. (건강 -15)' : '밧줄이 닿지 않았다. 다행히 뱃사공이 아이를 건져 올렸다.']]);
    },
  },
  {
    key: 's_snowbound',
    kind: 'PEOPLE',
    trigger: { seasons: ['WINTER'], terrain: ['MOUNTAIN', 'PASS', 'FOREST'] },
    label: () => '눈에 갇힌 산막',
    build: () => ({
      title: '눈에 갇힌 산막의 하룻밤',
      category: 'LIFE',
      narration: '눈보라에 길이 막혀 산막에 들었다. 먼저 와 있던 길손 셋이 화톳불을 쬐고 있다.',
      script: [N('눈보라를 피해 들어간 산막. 화톳불 가에 길손 셋 — 장사꾼, 중, 그리고 말없이 칼을 품은 사내.'), P('늙은 중', '이 눈은 사흘은 갈 것이오. 서로 이야기나 합시다. 누가 먼저 하겠소?', '불을 뒤적이며')],
      options: [
        { id: 'listen', label: '사흘 동안 그들의 이야기를 듣는다 (3일)', hint: '통찰·깨달음' },
        { id: 'watch', label: '칼을 품은 사내를 밤새 경계한다 (3일)', hint: '정신' },
      ],
    }),
    resolve: (s, opt) => {
      let n = spendDays(s, 3);
      if (opt === 'watch') {
        n = addStats(n, { wil: 2 });
        return say(chance(0.35) ? addMoney(n, 25) : n, [['나레이션', chance(0.5) ? '셋째 날 새벽, 사내가 장사꾼의 짐을 노렸다. 칼집으로 손목을 쳐 내자 그는 눈 속으로 사라졌다.' : '사내는 끝내 아무 짓도 하지 않았다. 그저 지친 낭인이었다.']]);
      }
      const g = gainInsight(addStats(n, { ins: 2 }), 6, '눈 덮인 산막');
      return say(g.state, [['늙은 중', '눈은 소리 없이 쌓여 산을 바꾸지요. 칼도 그렇지 않겠소?'], ['나레이션', g.text]]);
    },
  },
  {
    key: 's_harvest_help',
    kind: 'PEOPLE',
    trigger: { seasons: ['AUTUMN'], terrain: ['ROAD', 'TOWN', 'RIVER'] },
    label: () => '일손 모자란 들판',
    build: (s) => ({
      title: '가을걷이 일손',
      category: 'LIFE',
      narration: '누렇게 익은 들판. 장정들이 부역에 끌려가 노인과 아이들만 낫을 들고 있다.',
      script: [N('누렇게 익은 들판에 노인과 아이들뿐이다. 장정들은 관아 부역에 끌려갔다.'), P('늙은 농부', '비 오기 전에 거둬야 하는데… 칼 대신 낫 좀 들어 주시겠소? 품삯은 햅쌀로 드리리다.')],
      options: [
        { id: 'work', label: '이틀 동안 낫을 든다 (2일)', hint: `햅쌀 · +15${cur(s)} · 근력` },
        { id: 'leave', label: '갈 길을 간다' },
      ],
    }),
    resolve: (s, opt) => (opt === 'work' ? say(addRep(addStats(addMoney(addHealth(spendDays(s, 2), 6), 15), { str: 1 }), { virtue: 5 }), [['나레이션', '허리가 끊어질 듯했지만, 햅쌀밥 맛은 잊지 못할 것이다.']]) : s),
  },
];

