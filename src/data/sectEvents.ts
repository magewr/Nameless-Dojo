import { ActiveEvent, Disciple, GameEventOption, GameState, SectState } from '../types/game';
import { josa } from '../utils/korean';
import { getDifficultyConfig, getDifficultyId } from './difficulty';
import { ALLY_PERK, bestSect, getSects, getSectStance, metSects, sectTag, worstSect } from './sects';
import { isTroublemaker } from './temperament';
import { COUNTRIES } from './worldAndEndings';

// 타 문파와의 사건 · 문하생이 일으키는 말썽 · 반란.
// 여기서는 이벤트를 "고르기만" 한다. 상태를 바꾸는 일은 engine/sectLogic의 resolveSectEvent가 맡는다.

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const short = (name: string) => name.replace(/\(.*?\)/g, '');
const statSum = (d: Disciple) => d.stats.str + d.stats.agi + d.stats.vit + d.stats.wil + d.stats.ins + d.stats.qi;

function weightedPick<T>(items: Array<{ w: number; v: T }>): T | null {
  const total = items.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.v;
  }
  return items[items.length - 1].v;
}

// ---------------------------------------------------------------- 반란

function findRebelLeader(state: GameState): Disciple | null {
  const cfg = getDifficultyConfig(state);
  if (cfg.plotRate <= 0) return null;
  const alive = state.disciples.filter((d) => !d.dead && !d.isChild && d.role !== 'HEIR');
  const schemer = alive.find((d) => d.temperament === 'SCHEMER' && (d.plot || 0) >= 100);
  if (schemer) return schemer;
  // 흑심이 아니어도, 마음이 완전히 떠난 야심가는 칼을 거꾸로 든다.
  return alive.find((d) => isTroublemaker(d) && d.temperament !== 'SCHEMER' && d.age >= 20 && d.loyalty <= 25 && d.ambition >= 50) || null;
}

function buildRebellion(state: GameState, leader: Disciple): ActiveEvent {
  const diffId = getDifficultyId(state);
  const followers = state.disciples.filter(
    (d) => !d.dead && d.id !== leader.id && !d.isChild && d.role !== 'HEIR' && (d.loyalty < 50 || d.temperament === 'SCHEMER')
  );
  const loyal = state.disciples.filter((d) => !d.dead && d.id !== leader.id && !followers.some((f) => f.id === d.id) && d.age >= 15);
  const backer = worstSect(state, -50);
  const ally = bestSect(state, 50);
  const isReal = diffId === 'HELL' || (diffId === 'HARD' && Math.random() < 0.35);
  const n = followers.length;
  const crowd = n > 0 ? `문하생 ${n}명을 등 뒤에 세우고` : '홀로';

  const options: GameEventOption[] = [
    {
      id: 'rebel_duel',
      label: isReal ? `진검을 뽑아 ${josa(leader.name, '을를')} 직접 벤다 (⚠ 진검결투)` : `목검을 들어 ${josa(leader.name, '을를')} 직접 꺾는다`,
      hint: isReal
        ? '⚠ 패배 시 사망/영구장애 · 승리 시 반란 진압, 권위 +12'
        : '승리 시 반란 진압, 권위 +12 · 패배 시 현판과 재화 30%를 잃고 무리가 떠난다',
    },
  ];
  if (loyal.length > 0) {
    const L = loyal.reduce((a, d) => a + statSum(d), 0);
    const R = [leader, ...followers].reduce((a, d) => a + statSum(d), 0) * (backer ? 1.15 : 1);
    const pct = Math.round(Math.max(0.12, Math.min(0.92, 0.5 + ((L - R) / Math.max(1, L + R)) * 0.7)) * 100);
    options.push({
      id: 'rebel_loyal',
      label: `충직한 제자 ${loyal.length}명에게 진압을 맡긴다`,
      hint: `성공 약 ${pct}% (양쪽 무력 비교)${diffId !== 'EASY' ? ' · ⚠ 제자 전사 위험' : ''} · 실패 시 현판·재화 30% 상실`,
    });
  }
  if (ally) {
    options.push({
      id: 'rebel_ally',
      label: `${sectTag(ally.name)}에 급히 구원을 청한다`,
      hint: `위험 없이 진압 · ${short(ally.name)} 관계 -15 · 명성 -10 · 권위 -5`,
    });
  }
  options.push({
    id: 'rebel_split',
    label: '“따를 자는 데리고 떠나라.” 길을 터 준다',
    hint: `피를 보지 않는다 · ${leader.name} 무리가 떠나 분파를 세운다 · 권위 -10 · 인덕 +5`,
  });

  return {
    id: `rebellion_${state.turn}`,
    title: `⚔ 반란 — 현판 아래 선 ${leader.name}`,
    category: 'DUEL',
    sceneActor: 'ENEMY',
    narration: `새벽, 연무장에 횃불이 늘어섰다. ${josa(leader.name, '이가')} ${crowd} 현판 아래 서 있다.${backer ? ` 담 너머로 ${sectTag(backer.name)}의 깃발이 어른거린다. 뒤를 봐주는 자가 있는 것이다.` : ''}`,
    speaker: leader.name,
    dialogue: `“사부님의 시대는 끝났습니다. 【${state.sectName}】의 현판은 이제 제가 맡겠습니다. 조용히 내려놓으시지요.”`,
    script: [
      { speaker: '나레이션', role: 'NARRATOR', text: `새벽 종이 울리기도 전에 연무장이 밝다. 횃불이다. ${josa(leader.name, '이가')} ${crowd} 현판 아래 서 있다.` },
      ...(backer
        ? [{ speaker: '나레이션', role: 'NARRATOR' as const, text: `담 너머로 ${sectTag(backer.name)}의 깃발이 어른거린다. 이 일의 뒤를 봐주는 자가 있다.` }]
        : []),
      { speaker: leader.name, role: 'NPC', stageDirection: '칼자루에 손을 얹은 채, 눈을 피하지 않는다', text: `사부님의 시대는 끝났습니다. 【${state.sectName}】의 현판은 이제 제가 맡겠습니다.` },
      { speaker: leader.name, role: 'NPC', text: '조용히 내려놓으시면 여생은 편히 모시겠습니다.', emote: 'ANGRY' },
    ],
    options,
    meta: { leaderId: leader.id, leaderName: leader.name, followerIds: followers.map((f) => f.id), backerId: backer?.id, allyId: ally?.id, isReal },
  };
}

// ---------------------------------------------------------------- 말썽

function buildTipoff(state: GameState, schemer: Disciple, informant: Disciple): ActiveEvent {
  const insPct = Math.round(Math.max(0.35, Math.min(0.9, 0.35 + state.stats.ins / 160)) * 100);
  return {
    id: `trouble_tipoff_${state.turn}`,
    title: `밤에 찾아온 밀고 — ${informant.name}`,
    category: 'LIFE',
    sceneActor: 'DISCIPLE',
    narration: `등불을 끄려는데 ${josa(informant.name, '이가')} 문밖에 무릎을 꿇었다. 한참을 망설이다 입을 연다.`,
    speaker: informant.name,
    dialogue: `“사부님…… ${josa(schemer.name, '이가')} 밤마다 뒤뜰에 동문들을 불러 모읍니다. ‘스승도 늙는다’는 말을 제 귀로 들었습니다.”`,
    options: [
      { id: 'tipoff_confront', label: `날이 밝는 대로 ${josa(schemer.name, '을를')} 불러 추궁한다 (통찰 판정)`, hint: `성공 약 ${insPct}%: 흑심이 드러난다 · 실패 시 경계만 키운다` },
      { id: 'tipoff_watch', label: '모른 척하고 믿을 만한 제자를 곁에 붙인다', hint: '속내를 알고 지켜본다 · 흑심의 진척이 크게 느려진다' },
      { id: 'tipoff_dismiss', label: '“증거 없이 동문을 헐뜯지 마라.” 돌려보낸다', hint: `${informant.name} 충성 -10 · 흑심은 더 빨리 자란다` },
    ],
    meta: { discipleId: schemer.id, discipleName: schemer.name, informantId: informant.id },
  };
}

function buildTrouble(state: GameState, d: Disciple): ActiveEvent | null {
  const cfg = getDifficultyConfig(state);
  const cur = COUNTRIES[state.country].currency;
  const base = { discipleId: d.id, discipleName: d.name };
  const need = (cost: number): Pick<GameEventOption, 'disabled' | 'disabledReason'> =>
    state.money < cost ? { disabled: true, disabledReason: '재화 부족' } : {};
  // 같은 기질이라도 벌이는 일은 그때그때 다르다.
  const alt = Math.random() < 0.5;

  if (d.temperament === 'HOTBLOOD') {
    // 싸움 상대: 아직 동맹이 아닌 문파 가운데 사이가 나쁜 쪽일수록 걸리기 쉽다.
    const pool = getSects(state).filter((s) => !s.allied);
    const foe = weightedPick(pool.map((s) => ({ w: (s.met ? 2 : 0.6) + Math.max(0, -s.relation) / 40, v: s })));
    if (!foe) return null;
    const cost = Math.round((15 + Math.min(60, state.fame * 0.02)) * cfg.expenseMult);
    return {
      id: `trouble_brawl_${state.turn}`,
      title: `저잣거리의 주먹다짐 — ${d.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: alt
        ? `나루터가 시끄럽다. ${josa(d.name, '이가')} 길을 막던 ${sectTag(foe.name)} 사람의 짐수레를 걷어차 강물에 처박았다고 한다. 저쪽에서는 벌써 사람이 와서 사과와 짐값을 요구하고 있다.`
        : `${josa(d.name, '이가')} 터진 입술로 돌아왔다. 장터에서 ${sectTag(foe.name)} 문하생 셋과 시비가 붙어 둘을 때려눕혔다고 한다. 저쪽에서는 벌써 사람이 와서 사과를 요구하고 있다.`,
      speaker: d.name,
      dialogue: alt
        ? '“저쪽이 먼저 길을 막고 사부님 함자를 함부로 불렀습니다. 수레는…… 발이 미끄러졌습니다.”'
        : '“먼저 우리 현판을 두고 ‘이름 없는 잡검’이라 했습니다. 그 말을 듣고 어찌 그냥 지나칩니까!”',
      options: [
        { id: 'brawl_apologize', label: `직접 찾아가 사과하고 치료비를 낸다 (-${cost}${cur})`, hint: `${short(foe.name)} 관계 +6 · ${d.name} 충성 -8 · 인덕 +4`, ...need(cost) },
        { id: 'brawl_defend', label: '“내 제자는 까닭 없이 주먹을 쓰지 않는다.” 사과를 거절한다', hint: `${short(foe.name)} 관계 -14 · ${d.name} 충성 +10 · 살기 +4` },
        { id: 'brawl_punish', label: '문하생들 앞에서 엄히 벌하고 근신시킨다', hint: `${short(foe.name)} 관계 -4 · ${d.name} 충성 -12 · 권위 +6` },
      ],
      meta: { ...base, sectId: foe.id, cost },
    };
  }

  if (d.temperament === 'ARROGANT') {
    const cost = Math.round((20 + Math.min(70, state.fame * 0.025)) * cfg.expenseMult);
    const insPct = Math.round(Math.max(0.3, Math.min(0.85, 0.3 + state.stats.ins / 150)) * 100);
    return {
      id: `trouble_bully_${state.turn}`,
      title: alt ? `다리를 저는 막내 — ${d.name}` : `대문 앞에 몰려온 마을 사람들 — ${d.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: alt
        ? `새벽 수련에 막내 문하생이 다리를 절며 나왔다. ${josa(d.name, '이가')} ‘가르침’이라며 밤늦도록 물동이를 지우고 목검으로 종아리를 쳤다는 것이다. 막내의 부모가 대문 앞에 와 있다.`
        : `마을 사람 여남은이 대문 앞에 몰려왔다. ${josa(d.name, '이가')} 주막에서 【${state.sectName}】 문하를 내세워 외상술을 마시고, 말리던 후배의 뺨까지 쳤다는 것이다.`,
      speaker: d.name,
      dialogue: alt
        ? '“재주 없는 놈은 맞으면서 배우는 법입니다. 사부님께서 손대기 번거로우실 테니 제가 대신했을 뿐입니다.”'
        : '“제 재주가 저들과 같습니까? 값을 치를 만한 사람에게 대접을 받았을 뿐입니다.”',
      options: [
        { id: 'bully_compensate', label: `피해를 물어 주고 마을 사람들 앞에서 사죄시킨다 (-${cost}${cur})`, hint: `인덕 +6 · ${d.name} 충성 -10`, ...need(cost) },
        { id: 'bully_talk', label: '따로 불러 밤새 타이른다 (통찰 판정)', hint: `성공 약 ${insPct}%: ${d.name} 충성 +8 · 실패 시 인덕 -6, 명성 -6` },
        { id: 'bully_ignore', label: '“젊은 혈기다.” 넘어간다', hint: '인덕 -12 · 명성 -15 · 다른 문하생 충성 -4' },
      ],
      meta: { ...base, cost },
    };
  }

  if (d.temperament === 'GREEDY') {
    const cost = Math.max(8, Math.round(Math.min(state.money * 0.15, 40 + state.fame * 0.05)));
    return {
      id: `trouble_theft_${state.turn}`,
      title: alt ? `장터에서 걷힌 ‘보호비’ — ${d.name}` : `비어 있는 금고 — ${d.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: alt
        ? `장터 상인 셋이 굳은 얼굴로 찾아왔다. ${josa(d.name, '이가')} ‘【${state.sectName}】 보호비’라며 다달이 돈을 걷어 갔다는 것이다. 스승은 그런 돈을 받은 적이 없다. 걷어 간 돈이 ${cost}${cur}, 도장 이름으로 걷었으니 도장이 물어 줘야 한다.`
        : `금고의 은자가 ${cost}${cur} 빈다. 장부를 맞춰 보니 지난달부터 조금씩 새어 나갔다. 열쇠를 만질 수 있던 것은 ${d.name}뿐이다.`,
      speaker: d.name,
      dialogue: alt ? '“도장 살림에 보태려던 겁니다. ……아직 보태지 못했을 뿐이지요.”' : '“……고향 집에 보냈습니다. 갚으려 했습니다. 정말입니다.”',
      options: [
        { id: 'theft_work', label: '호위 일을 시켜 제 손으로 갚게 한다', hint: `절반 회수(-${Math.round(cost / 2)}${cur}) · 직책이 호위로 바뀐다 · ${d.name} 충성 +4` },
        { id: 'theft_expel', label: '그 자리에서 파문한다', hint: `-${cost}${cur} · ${d.name} 추방 · 권위 +8 · 훗날 원한으로 돌아올 수 있다` },
        { id: 'theft_forgive', label: '없던 일로 덮는다', hint: `-${cost}${cur} · ${d.name} 충성 +8 · 다른 문하생 충성 -5 · 권위 -5` },
      ],
      meta: { ...base, cost },
    };
  }

  if (d.temperament === 'LAZY') {
    const cost = Math.round((25 + Math.min(50, state.fame * 0.02) + d.age) * cfg.expenseMult);
    return {
      id: `trouble_gamble_${state.turn}`,
      title: alt ? `주막의 외상 장부 — ${d.name}` : `노름빚을 지고 온 제자 — ${d.name}`,
      category: 'LIFE',
      sceneActor: 'DISCIPLE',
      narration: alt
        ? `주막 주인이 외상 장부를 들고 왔다. ${josa(d.name, '이가')} 수련 시간마다 뒷문으로 빠져나가 마신 술값이 ${cost}${cur}. 도장 이름을 대고 마셨으니 도장에서 받아 가겠다고 한다.`
        : `아침 수련에 ${josa(d.name, '이가')} 보이지 않더니, 낮에는 빚쟁이가 대문을 두드렸다. 투전판에서 진 빚이 ${cost}${cur}. 갚지 않으면 도장 현판에 빚 문서를 붙이겠다고 한다.`,
      speaker: d.name,
      dialogue: alt
        ? '“수련은 몸이 풀려야 잘 되는 법 아닙니까. 몸은 술이 들어가야 풀리고요…… 죄송합니다.”'
        : '“한 판만 더 하면 다 찾을 수 있었습니다…… 사부님, 이번 한 번만 살려 주십시오.”',
      options: [
        { id: 'gamble_pay', label: `빚을 대신 갚아 준다 (-${cost}${cur})`, hint: `${d.name} 충성 +12`, ...need(cost) },
        { id: 'gamble_labor', label: '석 달 품을 팔아 제 손으로 갚게 한다', hint: `${d.name} 충성 -8 · 체력 +2, 근력 +1 · 권위 +4` },
        { id: 'gamble_expel', label: '“도장에 게으름뱅이는 필요 없다.” 파문한다', hint: `${d.name} 추방 · 권위 +8 · 훗날 원한으로 돌아올 수 있다` },
      ],
      meta: { ...base, cost },
    };
  }
  return null;
}

function buildPoach(state: GameState, d: Disciple, sect: SectState): ActiveEvent {
  return {
    id: `trouble_poach_${state.turn}`,
    title: `${short(sect.name)}의 손짓 — ${d.name}`,
    category: 'LIFE',
    sceneActor: 'DISCIPLE',
    narration: `${sectTag(sect.name)}에서 ${d.name}에게 사람을 보냈다. 사범 자리와 지금의 곱절 되는 녹을 약속했다고 한다. ${josa(d.name, '은는')} 숨기지 않고 스승 앞에 편지를 내놓았다.`,
    speaker: d.name,
    dialogue: '“솔직히 흔들립니다. 여기서는 제가 언제까지 수련생으로 남아야 합니까?”',
    options: [
      { id: 'poach_promote', label: '사범 자리를 주어 붙잡는다', hint: `${d.name} 사범 승격(급여 발생) · 충성 +15 · ${short(sect.name)} 관계 -3` },
      { id: 'poach_release', label: '“네 길을 가거라.” 보내 준다', hint: `${d.name} 이적 · ${short(sect.name)} 관계 +6, 세력↑` },
      { id: 'poach_protest', label: `${sectTag(sect.name)}에 정식으로 항의한다`, hint: `${short(sect.name)} 관계 -12 · ${d.name} 충성 +4 · 권위 +3` },
    ],
    meta: { discipleId: d.id, discipleName: d.name, sectId: sect.id },
  };
}

// ---------------------------------------------------------------- 문파 사건

function buildEnvoy(state: GameState, s: SectState): ActiveEvent {
  const cfg = getDifficultyConfig(state);
  const cur = COUNTRIES[state.country].currency;
  const cost = Math.round((25 + s.power * 0.4) * cfg.expenseMult);
  const line =
    s.kind === 'MERCHANT'
      ? `“${s.leaderTitle}께서 【${state.sectName}】의 이름을 들으셨습니다. 짐을 맡길 만한 곳인지, 먼저 얼굴이나 익히자 하십니다.”`
      : s.kind === 'RIVAL'
      ? `“${s.leaderTitle}께서 안부를 전하십니다. 두 문파의 문하생들이 한 번쯤 칼을 맞대 보는 것이 어떻겠느냐 하십니다.”`
      : `“${s.leaderTitle}께서 【${state.sectName}】의 검을 궁금해하십니다. 교류 비무로 서로의 길을 보이자 하십니다.”`;
  return {
    id: `sect_envoy_${state.turn}`,
    title: `${short(s.name)}의 사절`,
    category: 'LIFE',
    sceneActor: 'RIVAL',
    narration: `${sectTag(s.name)}의 사절이 예물 상자를 들고 대문 앞에 섰다. ${s.style}`,
    speaker: `${short(s.name)} 사절`,
    dialogue: line,
    options: [
      { id: 'envoy_spar', label: `교류 비무를 받아들인다 (상대: ${s.champion})`, hint: '승리 시 관계 +10 · 패배해도 관계 +6 · 현판은 걸지 않는다' },
      { id: 'envoy_gift', label: `답례품을 들려 보낸다 (-${cost}${cur})`, hint: '관계 +12', ...(state.money < cost ? { disabled: true, disabledReason: '재화 부족' } : {}) },
      { id: 'envoy_decline', label: '정중히 사양한다', hint: '관계 -6' },
    ],
    meta: { sectId: s.id, cost },
  };
}

function buildShakedown(state: GameState, s: SectState): ActiveEvent {
  const cfg = getDifficultyConfig(state);
  const cur = COUNTRIES[state.country].currency;
  const cost = Math.round((30 + Math.min(150, state.fame * 0.08)) * cfg.expenseMult);
  const isReal = cfg.realDuelUpgradeChance > 0 && Math.random() < cfg.realDuelUpgradeChance * 0.6;
  const mediator = metSects(state).find((o) => o.id !== s.id && o.relation >= 25 && (o.kind === 'MERCHANT' || o.kind === 'ORTHODOX'));
  const options: GameEventOption[] = [
    {
      id: 'shake_fight',
      label: isReal ? `진검을 뽑아 ${josa(s.champion, '을를')} 상대한다 (⚠ 진검결투)` : `${josa(s.champion, '을를')} 꺾어 돌려보낸다 (비무)`,
      hint: isReal ? '⚠ 패배 시 사망/영구장애 · 승리 시 그쪽 세력↓, 권위 +5' : '승리 시 그쪽 세력↓, 권위 +5 · 패배 시 현판 강탈',
    },
    { id: 'shake_pay', label: `자릿세를 낸다 (-${cost}${cur})`, hint: '관계 +8 · 권위 -6', ...(state.money < cost ? { disabled: true, disabledReason: '재화 부족' } : {}) },
  ];
  if (mediator) {
    options.push({ id: 'shake_mediate', label: `${sectTag(mediator.name)}에 중재를 청한다`, hint: `돈도 피도 들지 않는다 · ${short(mediator.name)} 관계 -5 (신세)` });
  }
  options.push({ id: 'shake_refuse', label: '대문을 닫아걸고 상대하지 않는다', hint: '관계 -10 · 명성 -5' });
  return {
    id: `sect_shakedown_${state.turn}`,
    title: `${short(s.name)}의 자릿세 요구`,
    category: 'DUEL',
    sceneActor: 'ENEMY',
    narration: `${sectTag(s.name)}의 무뢰배 여럿이 대문을 발로 차고 들어왔다. 맨 앞에 선 ${josa(s.champion, '이가')} 마당에 침을 뱉는다.`,
    speaker: s.champion,
    dialogue: `“이 장터에서 도장 간판을 걸려면 ${s.leaderTitle}님께 자릿세를 내는 게 법도다. 다달이 ${cost}${cur}. 싫으면 이 간판은 오늘로 내려간다.”`,
    options,
    meta: { sectId: s.id, allyId: mediator?.id, cost, isReal },
  };
}

function buildRaid(state: GameState, s: SectState): ActiveEvent {
  const cfg = getDifficultyConfig(state);
  const cur = COUNTRIES[state.country].currency;
  const cost = Math.round((80 + Math.min(400, state.fame * 0.12)) * cfg.expenseMult);
  const isReal = cfg.realDuelUpgradeChance > 0 && Math.random() < cfg.realDuelUpgradeChance;
  const ally = metSects(state).find((o) => o.id !== s.id && o.relation >= 40);
  const fighters = state.disciples.filter((d) => !d.dead && d.age >= 15).length;
  const options: GameEventOption[] = [
    {
      id: 'raid_fight',
      label: isReal ? `진검을 뽑아 ${s.leaderTitle} ${josa(s.leader, '과와')} 맞선다 (⚠ 진검결투)` : `대문 앞에서 ${s.leaderTitle} ${josa(s.leader, '을를')} 직접 막아선다`,
      hint: isReal ? '⚠ 패배 시 사망/영구장애 · 승리 시 그쪽 세력↓↓, 관계 +12' : '승리 시 그쪽 세력↓↓, 관계 +12 · 패배 시 현판과 재화 25% 상실',
    },
  ];
  if (fighters > 0) {
    options.push({
      id: 'raid_disciples',
      label: `문하생 ${fighters}명과 어깨를 맞대고 막아 낸다`,
      hint: `문하생 무력에 따라 성패가 갈린다${cfg.id !== 'EASY' ? ' · ⚠ 제자 사상 위험' : ''} · 실패 시 재화 20% 상실`,
    });
  }
  if (ally) {
    options.push({ id: 'raid_ally', label: `${sectTag(ally.name)}에 급히 원군을 청한다`, hint: `위험 없이 격퇴 · ${short(ally.name)} 관계 -8 (큰 신세)` });
  }
  options.push({ id: 'raid_tribute', label: `은자를 내주고 돌려보낸다 (-${cost}${cur})`, hint: '관계 +15 · 명성 -15 · 권위 -10', ...(state.money < cost ? { disabled: true, disabledReason: '재화 부족' } : {}) });
  return {
    id: `sect_raid_${state.turn}`,
    title: `⚔ ${short(s.name)}의 습격`,
    category: 'DUEL',
    sceneActor: 'ENEMY',
    narration: `한밤중에 대문 빗장이 부러졌다. 횃불을 든 ${sectTag(s.name)}의 무리가 마당으로 쏟아져 들어온다. 쌓이고 쌓인 원한이 오늘 밤 터진 것이다.`,
    speaker: `${s.leaderTitle} ${s.leader}`,
    dialogue: `“【${state.sectName}】, 그동안 눈에 거슬렸다. 오늘 이 간판을 내리고 창고를 비우겠다.”`,
    options,
    meta: { sectId: s.id, allyId: ally?.id, cost, isReal },
  };
}

function buildAlliance(state: GameState, s: SectState): ActiveEvent {
  const opposite = s.kind === 'ORTHODOX' ? 'OUTLAW' : s.kind === 'OUTLAW' ? 'ORTHODOX' : null;
  const foe = opposite ? getSects(state).find((o) => o.kind === opposite) : null;
  return {
    id: `sect_alliance_${state.turn}`,
    title: `${short(s.name)}의 동맹 제안`,
    category: 'LIFE',
    sceneActor: 'RIVAL',
    narration: `${sectTag(s.name)}의 ${s.leaderTitle} ${josa(s.leader, '이가')} 직접 술 한 병을 들고 찾아왔다. 그동안 쌓은 신의를 맹약으로 굳히자는 것이다.`,
    speaker: `${s.leaderTitle} ${s.leader}`,
    dialogue: `“【${state.sectName}】과 우리는 이미 남이 아니오. 어려울 때 서로 칼을 빌려주는 사이가 됩시다.”`,
    options: [
      {
        id: 'ally_accept',
        label: '잔을 받아 동맹을 맺는다',
        hint: `${ALLY_PERK[s.kind]} · 위기 때 원군 · 명성 +20${foe ? ` · ${short(foe.name)} 관계 -20` : ''}`,
      },
      { id: 'ally_decline', label: '“어느 편에도 서지 않는 것이 내 길이오.” 사양한다', hint: '관계 -8' },
    ],
    meta: { sectId: s.id },
  };
}

function buildExchange(state: GameState, s: SectState): ActiveEvent {
  const hasDisciples = state.disciples.some((d) => !d.dead);
  const isMerchant = s.kind === 'MERCHANT';
  const options: GameEventOption[] = [];
  if (hasDisciples) options.push({ id: 'exch_disciples', label: '문하생들을 보내 함께 수련하게 한다', hint: '문하생 전원 근력·민첩 +1, 통찰 +2, 충성 +3 · 관계 +5' });
  options.push({
    id: 'exch_self',
    label: isMerchant ? '직접 표행에 동행해 짐을 지켜 준다' : `직접 찾아가 ${josa(s.leader, '과와')} 검리를 논한다`,
    hint: isMerchant ? '재화↑ · 상무 +6 · 관계 +4' : '통찰 +3 · 정신 +2 · 구도 +3 · 관계 +4',
  });
  options.push({ id: 'exch_decline', label: '바쁜 철이라며 사양한다', hint: '관계 -4' });
  return {
    id: `sect_exchange_${state.turn}`,
    title: `${short(s.name)}의 교류 제안`,
    category: 'LIFE',
    sceneActor: isMerchant ? 'MERCHANT' : 'RIVAL',
    narration: isMerchant
      ? `${sectTag(s.name)}에서 사람이 왔다. 큰 짐이 움직이는데 믿고 맡길 손이 모자란다고 한다.`
      : `${sectTag(s.name)}에서 사람이 왔다. 두 문파의 문하생들이 한 철 함께 수련하면 어떻겠느냐는 것이다.`,
    speaker: `${short(s.name)} 사절`,
    dialogue: isMerchant
      ? `“${s.leaderTitle}께서 【${state.sectName}】이라면 믿을 수 있다 하셨습니다. 삯은 섭섭지 않게 쳐 드리겠습니다.”`
      : `“${s.leaderTitle}께서 ‘남의 칼을 보아야 제 칼이 보인다’ 하셨습니다. 문하생들을 보내 주시겠습니까?”`,
    options,
    meta: { sectId: s.id },
  };
}

function buildAid(state: GameState, ally: SectState, enemy: SectState): ActiveEvent {
  const diffId = getDifficultyId(state);
  const fighters = state.disciples.filter((d) => !d.dead && d.age >= 15 && !d.isChild).length;
  const options: GameEventOption[] = [
    { id: 'aid_go', label: `직접 칼을 들고 나선다 (상대: ${enemy.champion})`, hint: `승리 시 ${short(ally.name)} 관계 +15, ${short(enemy.name)} 관계 -15 · 패배해도 ${short(ally.name)} 관계 +5` },
  ];
  if (fighters >= 2) {
    options.push({ id: 'aid_send', label: '문하생들을 원군으로 보낸다', hint: `${short(ally.name)} 관계 +10 · ${short(enemy.name)} 관계 -10 · 문하생 실전 경험${diffId !== 'EASY' ? ' · ⚠ 전사 위험' : ''}` });
  }
  options.push({ id: 'aid_decline', label: '“남의 싸움에 낄 수는 없소.” 물리친다', hint: `${short(ally.name)} 관계 ${ally.allied ? -20 : -12}` });
  return {
    id: `sect_aid_${state.turn}`,
    title: `${short(ally.name)}의 원군 요청`,
    category: 'DUEL',
    sceneActor: 'RIVAL',
    narration: `${sectTag(ally.name)}에서 숨이 턱에 닿은 전령이 달려왔다. ${sectTag(enemy.name, '과와')} 시비가 붙어 오늘 밤 큰 싸움이 벌어진다는 것이다.`,
    speaker: `${short(ally.name)} 전령`,
    dialogue: `“${ally.leaderTitle}께서 【${state.sectName}】에 손을 빌려 달라 하셨습니다. 이 은혜는 잊지 않겠다고…… 꼭 전하라 하셨습니다!”`,
    options,
    meta: { allyId: ally.id, enemyId: enemy.id, sectId: enemy.id },
  };
}

function buildPeace(state: GameState, s: SectState): ActiveEvent {
  const cfg = getDifficultyConfig(state);
  const cur = COUNTRIES[state.country].currency;
  const cost = Math.round((60 + s.power) * cfg.expenseMult);
  const mediator = metSects(state).find((o) => o.id !== s.id && o.kind === 'MERCHANT' && o.relation >= 0);
  const host = mediator ? `${sectTag(mediator.name)}의 ${mediator.leaderTitle} ${mediator.leader}` : '고을의 원로';
  return {
    id: `sect_peace_${state.turn}`,
    title: `화해의 자리 — ${short(s.name)}`,
    category: 'LIFE',
    sceneActor: 'MERCHANT',
    narration: `${josa(host, '이가')} 주막 뒷방에 자리를 마련했다. 맞은편에는 ${sectTag(s.name)}의 ${s.leaderTitle} ${josa(s.leader, '이가')} 팔짱을 끼고 앉아 있다. 싸움이 길어져 양쪽 다 지쳤다는 것이다.`,
    speaker: mediator ? `${mediator.leaderTitle} ${mediator.leader}` : '고을 원로',
    dialogue: '“두 분 다 이쯤에서 칼을 거두시지요. 싸움에 장사가 안 되고, 장사가 안 되면 고을이 굶습니다.”',
    options: [
      { id: 'peace_pay', label: `화해금을 내고 묵은 일을 턴다 (-${cost}${cur})`, hint: '관계 +30 이상 (냉랭한 수준까지 회복)', ...(state.money < cost ? { disabled: true, disabledReason: '재화 부족' } : {}) },
      { id: 'peace_duel', label: `“말보다 한 합이 빠르오.” ${s.leaderTitle}과 겨뤄 원한을 씻는다 (비무)`, hint: '승리 시 관계 +28 · 패배해도 관계 +12 · 현판은 걸지 않는다' },
      { id: 'peace_refuse', label: '“숙일 머리는 없다.” 자리를 박차고 나온다', hint: '관계 -5 · 살기 +5' },
    ],
    meta: { sectId: s.id, cost },
  };
}

function pickSectEvent(state: GameState): ActiveEvent | null {
  const diffId = getDifficultyId(state);
  const sects = metSects(state);
  if (sects.length === 0) return null;
  const outlawAllied = sects.some((s) => s.kind === 'OUTLAW' && s.allied);
  const cands: Array<{ w: number; v: () => ActiveEvent }> = [];

  for (const s of sects) {
    const stance = getSectStance(s);
    const fresh = s.history.length === 0;
    if (fresh) {
      // 첫 만남: 흑도는 자릿세부터 요구하고, 나머지는 사절을 보낸다.
      if (s.kind === 'OUTLAW') cands.push({ w: 4, v: () => buildShakedown(state, s) });
      else if (s.relation > -30) cands.push({ w: s.kind === 'RIVAL' ? 2.5 : 4, v: () => buildEnvoy(state, s) });
      continue;
    }
    if (stance === 'HOSTILE') {
      const w = (diffId === 'HELL' ? 4 : diffId === 'HARD' ? 3 : 1.2) * (outlawAllied ? 0.3 : 1);
      cands.push({ w, v: () => buildRaid(state, s) });
    }
    if (s.kind === 'OUTLAW' && s.relation <= -15) cands.push({ w: 2, v: () => buildShakedown(state, s) });
    if (s.relation <= -35) cands.push({ w: 1.2, v: () => buildPeace(state, s) });
    if (s.relation >= 50 && !s.allied) cands.push({ w: 3.5, v: () => buildAlliance(state, s) });
    if (s.relation >= 25) cands.push({ w: 2, v: () => buildExchange(state, s) });
    if (s.relation >= 35) {
      const enemy = sects.filter((o) => o.id !== s.id && !o.allied && o.relation <= 0).sort((a, b) => a.relation - b.relation)[0];
      if (enemy) cands.push({ w: 1.5, v: () => buildAid(state, s, enemy) });
    }
    if (stance === 'NEUTRAL' && s.kind !== 'OUTLAW') cands.push({ w: 0.8, v: () => buildEnvoy(state, s) });
  }
  const chosen = weightedPick(cands);
  return chosen ? chosen() : null;
}

// ---------------------------------------------------------------- 진입점

// 같은 종류의 문파 사건·말썽이 촘촘히 되풀이되지 않게 (계절 수, 노년에는 1.5배)
const DRAMA_GAP: Record<string, number> = {
  trouble_brawl: 5,
  trouble_bully: 5,
  trouble_theft: 5,
  trouble_gamble: 5,
  trouble_tipoff: 6,
  trouble_poach: 6,
  sect_envoy: 6,
  sect_exchange: 6,
  sect_alliance: 6,
  sect_aid: 6,
  sect_peace: 6,
  sect_shakedown: 6,
};
function dramaCooling(state: GameState, ev: ActiveEvent | null): boolean {
  if (!ev) return false;
  const base = ev.id.replace(/_\d+$/, '');
  const gap = DRAMA_GAP[base];
  const last = state.flags.homeEventLast?.[`@${base}`];
  if (!gap || last === undefined) return false;
  return state.turn - last < Math.round(gap * (state.age >= 55 ? 1.5 : 1));
}

export function pickDramaEvent(state: GameState): ActiveEvent | null {
  const ev = pickDramaEventRaw(state);
  // 반란은 간격과 상관없이 터진다
  if (ev && !ev.id.startsWith('rebellion') && dramaCooling(state, ev)) return null;
  return ev;
}

function pickDramaEventRaw(state: GameState): ActiveEvent | null {
  if (state.turn < 8 || !state.sects) return null;
  // 양위하고 물러났다면 문하의 말썽과 문파 사이의 일은 대부분 종주가 맡는다
  const baseCfg = getDifficultyConfig(state);
  const retired = !!state.flags.abdicated && state.disciples.some((d) => d.id === state.flags.abdicated!.heirId && !d.dead);
  const cfg = retired ? { ...baseCfg, troubleEventRate: baseCfg.troubleEventRate * 0.4, sectEventRate: baseCfg.sectEventRate * 0.5 } : baseCfg;
  const gap = state.turn - (state.flags.lastDramaTurn ?? -99);

  // 반란은 다른 무엇보다 먼저 터진다. (직전 턴에 다른 사건이 있었으면 한 철 미룬다)
  const leader = findRebelLeader(state);
  if (leader && gap >= 1) return buildRebellion(state, leader);

  if (gap < cfg.dramaGap) return null;

  const alive = state.disciples.filter((d) => !d.dead);

  // 밀고: 흑심이 절반쯤 익으면 곁의 충직한 제자가 눈치챈다.
  const schemer = alive.find((d) => d.temperament === 'SCHEMER' && !d.exposed && (d.plot || 0) >= 45 && d.role !== 'HEIR');
  if (schemer) {
    const informant = alive.filter((d) => d.id !== schemer.id && !isTroublemaker(d) && d.age >= 15).sort((a, b) => b.loyalty - a.loyalty)[0];
    if (informant && Math.random() < 0.45) return buildTipoff(state, schemer, informant);
  }

  // 말썽: 말썽꾼이 많고 충성이 낮을수록 잦다.
  const troublemakers = alive.filter((d) => isTroublemaker(d) && d.temperament !== 'SCHEMER' && d.age >= 15);
  if (troublemakers.length > 0) {
    const weighted = troublemakers.map((d) => ({ w: 0.35 + (100 - d.loyalty) / 100, v: d }));
    const pressure = weighted.reduce((a, x) => a + x.w, 0);
    if (Math.random() < cfg.troubleEventRate * Math.min(1.5, 0.5 + pressure * 0.35)) {
      const culprit = weightedPick(weighted);
      const ev = culprit ? buildTrouble(state, culprit) : null;
      if (ev) return ev;
    }
  }

  // 스카우트: 숙적의 문파가 마음이 뜬 제자를 넘본다.
  const rivalSect = metSects(state).find((s) => s.kind === 'RIVAL' && s.relation < 25);
  if (rivalSect && Math.random() < cfg.troubleEventRate * 0.4) {
    const targets = alive.filter((d) => !d.isChild && d.role === 'STUDENT' && d.age >= 18 && (d.loyalty < 60 || d.ambition >= 60));
    if (targets.length > 0) return buildPoach(state, pick(targets), rivalSect);
  }

  if (Math.random() < cfg.sectEventRate) return pickSectEvent(state);
  return null;
}
