import { ActiveEvent, BattleConfig, Disciple, GameState, GraduatedDisciple, LogEntry, SectState } from '../types/game';
import { getDifficultyConfig, getDifficultyId } from '../data/difficulty';
import { createBattleConfig } from '../data/events';
import {
  ALLY_PERK,
  createInitialSects,
  getRelationTarget,
  getSectMeetFame,
  getSects,
  getSectStance,
  sectTag,
  worstSect,
} from '../data/sects';
import { getLoyaltyCeiling, isTroublemaker, rollTemperament, shownTemperament, TEMPERAMENTS } from '../data/temperament';
import { COUNTRIES } from '../data/worldAndEndings';
import { josa } from '../utils/korean';
import { addLog } from './log';

// 타 문파와의 관계 · 문하생 기질에 얽힌 규칙.
// - settleDisciplesAndSects: 계절이 바뀔 때의 정산 (충성 상한, 흑심의 진척, 관계의 표류, 동맹 혜택)
// - sendSectGift / requestSectSpar / talkToDisciple / expelDisciple: 화면에서 직접 하는 행동
// - resolveSectEvent: 문파·말썽·반란 이벤트의 선택지 처리
// - applySectBattleFollowup: 그 이벤트에서 벌어진 전투의 뒷일

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const statSum = (d: Disciple) => d.stats.str + d.stats.agi + d.stats.vit + d.stats.wil + d.stats.ins + d.stats.qi;

// 이벤트 전투의 기본 강도 (gameLogic의 resolveEventOption과 같은 곡선)
export function getEnemyScale(state: GameState): number {
  const base = Math.min(3.15, 0.72 + Math.sqrt(Math.max(1, state.turn)) * 0.165 + Math.sqrt(Math.max(0, state.fame)) * 0.028);
  return Math.min(4.2, base * getDifficultyConfig(state).enemyScaleMult);
}

// ---------------------------------------------------------------- 관계 조작

export function adjustRelation(state: GameState, sectId: string | undefined, delta: number, text: string): GameState {
  const sects = getSects(state);
  if (!sectId || !sects.some((s) => s.id === sectId)) return state;
  let brokeName = '';
  const nextSects = sects.map((s) => {
    if (s.id !== sectId) return s;
    const relation = clamp(Math.round(s.relation + delta), -100, 100);
    const stamp = { year: state.year, season: state.season };
    const history = [{ ...stamp, text, delta: relation - s.relation }, ...s.history];
    let allied = s.allied;
    if (allied && relation < 15) {
      allied = false;
      brokeName = s.name;
      history.unshift({ ...stamp, text: '믿음이 무너져 동맹이 깨졌다', delta: 0 });
    }
    return { ...s, relation, met: true, allied, history: history.slice(0, 6) };
  });
  const next = { ...state, sects: nextSects };
  return brokeName ? addLog(next, `${sectTag(brokeName, '과와')}의 동맹이 깨졌다.`, 'WARN') : next;
}

function adjustPower(state: GameState, sectId: string | undefined, delta: number): GameState {
  if (!sectId) return state;
  return { ...state, sects: getSects(state).map((s) => (s.id === sectId ? { ...s, power: clamp(s.power + delta, 10, 100) } : s)) };
}

const findSect = (state: GameState, id: unknown): SectState | undefined => getSects(state).find((s) => s.id === id);

// 숙적과의 인연이 변하면 그 문파와의 관계도 함께 움직인다.
export function syncRivalSect(state: GameState, delta: number, text: string): GameState {
  return adjustRelation(state, 'sect_rival', delta, text);
}

// ---------------------------------------------------------------- 구버전 세이브 보정

export function ensureSectsAndTemperaments(state: GameState): GameState {
  const diff = getDifficultyId(state);
  const needsSects = !state.sects;
  const needsTemper = state.disciples.some((d) => !d.temperament);
  if (!needsSects && !needsTemper) return state;
  return {
    ...state,
    sects: state.sects || createInitialSects(state.country, state.rival.name, diff),
    disciples: needsTemper
      ? state.disciples.map((d) => (d.temperament ? d : { ...d, ...rollTemperament(diff, d.archetype, { isChild: d.isChild, isGenius: d.isGenius }) }))
      : state.disciples,
  };
}

// ---------------------------------------------------------------- 제자가 도장을 떠날 때

function departDisciple(state: GameState, d: Disciple, fate: GraduatedDisciple['fate'], joinedSectName?: string): GameState {
  const topSk = [...d.skills].sort((a, b) => b.masteryLevel - a.masteryLevel)[0];
  return {
    ...state,
    disciples: state.disciples.filter((x) => x.id !== d.id),
    graduatedDisciples: [
      ...(state.graduatedDisciples || []),
      {
        id: d.id,
        name: d.name,
        archetype: d.archetype,
        graduatedYear: state.year,
        graduatedAge: d.age,
        loyaltyAtExit: d.loyalty,
        powerScore: statSum(d),
        fate,
        topSkillName: topSk?.customName || topSk?.name || '횡베기',
        joinedSectName,
      },
    ],
  };
}

const mapDisciple = (state: GameState, id: unknown, fn: (d: Disciple) => Disciple): GameState => ({
  ...state,
  disciples: state.disciples.map((d) => (d.id === id ? fn(d) : d)),
});

const bumpOthers = (state: GameState, exceptId: unknown, delta: number): GameState => ({
  ...state,
  disciples: state.disciples.map((d) => (d.dead || d.id === exceptId ? d : { ...d, loyalty: clamp(d.loyalty + delta, 0, 100) })),
});

// ---------------------------------------------------------------- 계절 정산

export function settleDisciplesAndSects(state: GameState, isNewYear: boolean): GameState {
  let next = ensureSectsAndTemperaments(state);
  const cfg = getDifficultyConfig(next);
  const logs: Array<[string, LogEntry['type']]> = [];

  // 1) 문하생: 기질 파악 · 충성 상한 · 흑심의 진척
  const runaways: Disciple[] = [];
  next.disciples = next.disciples.map((d) => {
    if (d.dead) return d;
    let nd = d;
    if (!d.temperamentKnown && (next.year - d.joinedYear >= 1 || next.stats.ins >= 60)) {
      nd = { ...nd, temperamentKnown: true };
      const shown = shownTemperament(nd);
      if (shown && TEMPERAMENTS[shown].trouble) {
        logs.push([`문하생 ${d.name}의 기질이 눈에 들어온다 — 【${TEMPERAMENTS[shown].label}】. ${TEMPERAMENTS[shown].risk}.`, 'WARN']);
      }
    }
    const hiddenSchemer = d.temperament === 'SCHEMER' && !d.exposed;
    // 말썽꾼은 돌보지 않으면 마음이 뜬다. (흑심은 드러나기 전까지 충직한 척한다)
    const drift = hiddenSchemer ? 1 : isTroublemaker(d) ? (cfg.id === 'EASY' ? -1 : -2) : 1;
    const { cap } = getLoyaltyCeiling(nd, next);
    let loyalty = nd.loyalty + drift;
    if (loyalty > cap) {
      const excess = loyalty - cap;
      loyalty = excess > 6 ? cap + Math.floor(excess / 2) : cap;
    }
    loyalty = clamp(loyalty, 0, 100);

    let plot = nd.plot;
    if (d.temperament === 'SCHEMER' && cfg.plotRate > 0 && d.role !== 'HEIR' && d.age >= 18) {
      const weakMaster = next.age >= 60 || next.health < 40 ? 1.4 : 1;
      const grow = cfg.plotRate * (0.6 + d.ambition / 100) * weakMaster * (d.watched ? 0.35 : 1);
      plot = Math.min(100, (plot || 0) + grow);
    }
    nd = { ...nd, loyalty, plot };
    // 마음이 완전히 떠난 제자는 밤을 틈타 도장을 나간다. (자녀·후계자·반란을 꾸미는 자는 제외)
    if (loyalty <= 12 && !d.isChild && d.role !== 'HEIR' && d.temperament !== 'SCHEMER') runaways.push(nd);
    return nd;
  });

  for (const r of runaways) {
    const refuge = worstSect(next, -15);
    next = departDisciple(next, r, 'RIVAL_BETRAYER', refuge?.name);
    if (refuge) next = adjustPower(next, refuge.id, 3);
    logs.push([
      `문하생 ${josa(r.name, '이가')} 밤을 틈타 짐을 싸서 도장을 떠났다.${refuge ? ` ${sectTag(refuge.name)} 쪽으로 갔다는 말이 돈다.` : ''}`,
      'WARN',
    ]);
  }

  // 2) 문파: 서로를 의식하기 시작 · 세평에 따른 표류 · 동맹 혜택 · 악소문
  let money = next.money;
  let fame = next.fame;
  let ins = next.stats.ins;
  next.sects = getSects(next).map((s) => {
    let ns = s;
    if (!s.met) {
      const meets = s.kind === 'RIVAL' ? next.rival.act >= 1 : next.fame >= getSectMeetFame(s, next.country);
      if (meets) {
        ns = { ...ns, met: true };
        logs.push([`강호에 이름이 알려지면서 ${sectTag(s.name, '이가')} 우리 도장을 눈여겨보기 시작했다.`, 'RUMOR']);
      }
      return ns;
    }
    if (isNewYear) {
      const gap = getRelationTarget(s, next) - s.relation;
      const step = clamp(Math.round(gap * 0.25), -6, 6);
      let relation = clamp(s.relation + step, -100, 100);
      let allied = s.allied;
      const history = [...s.history];
      if (Math.abs(step) >= 4) {
        // 해마다 같은 방향으로 흐를 때는 한 줄로 모아, 실제 있었던 사건이 밀려나지 않게 한다.
        const text = step > 0 ? '세평이 좋아져 대하는 눈이 누그러졌다' : '세평이 거슬려 대하는 눈이 차가워졌다';
        if (history[0]?.text === text) history[0] = { ...history[0], year: next.year, season: next.season, delta: history[0].delta + step };
        else history.unshift({ year: next.year, season: next.season, text, delta: step });
      }
      if (allied && relation < 15) {
        allied = false;
        relation = Math.min(relation, 10);
        history.unshift({ year: next.year, season: next.season, text: '믿음이 식어 동맹이 깨졌다', delta: 0 });
        logs.push([`${sectTag(s.name, '과와')}의 동맹이 깨졌다.`, 'WARN']);
      }
      ns = { ...ns, relation, allied, power: Math.min(95, s.power + 1), history: history.slice(0, 6) };
    }
    if (ns.allied) {
      if (ns.kind === 'MERCHANT') money += Math.round((12 + ns.power * 0.3) * cfg.incomeMult);
      else if (ns.kind === 'ORTHODOX') fame += 3;
      else if (ns.kind === 'SPLINTER') fame += 2;
      else if (ns.kind === 'RIVAL' && isNewYear) ins += 1;
    } else if (getSectStance(ns) === 'HOSTILE' && Math.random() < 0.22) {
      const loss = 3 + Math.floor(ns.power / 25);
      fame = Math.max(0, fame - loss);
      logs.push([`${sectTag(ns.name, '이가')} 저잣거리에 우리 도장의 악소문을 퍼뜨렸다. (명성 -${loss})`, 'WARN']);
    }
    return ns;
  });
  next = { ...next, money, fame, stats: { ...next.stats, ins } };

  logs.forEach(([text, type]) => {
    next = addLog(next, text, type);
  });
  return next;
}

// ---------------------------------------------------------------- 화면에서 직접 하는 행동

export function getSectGiftCost(state: GameState, sect: SectState): number {
  const cfg = getDifficultyConfig(state);
  return Math.round((28 + sect.power * 0.5 + Math.min(120, state.fame * 0.05)) * (sect.relation <= -15 ? 1.5 : 1) * cfg.expenseMult);
}

export function canDoDiplomacy(state: GameState): boolean {
  return state.flags.diplomacyTurn !== state.turn;
}

export function sendSectGift(state: GameState, sectId: string): GameState {
  const sect = findSect(state, sectId);
  if (!sect || !sect.met || !canDoDiplomacy(state)) return state;
  const cost = getSectGiftCost(state, sect);
  if (state.money < cost) return state;
  const gain = sect.relation <= -50 ? 7 : 11;
  let next: GameState = {
    ...state,
    money: state.money - cost,
    flags: { ...state.flags, diplomacyTurn: state.turn },
  };
  next = adjustRelation(next, sectId, gain, '예물을 보내 성의를 보였다');
  return addLog(next, `${sectTag(sect.name)}에 예물(-${cost}${COUNTRIES[state.country].currency})을 보냈다. (관계 +${gain})`, 'GOOD');
}

const SECT_FIGHT_STYLE: Record<SectState['kind'], { ai: BattleConfig['enemyAi']; skills: string[] }> = {
  RIVAL: { ai: 'DUELIST', skills: ['sk_kr_02', 'sk_jp_03', 'base_h_slash'] },
  ORTHODOX: { ai: 'DUELIST', skills: ['sk_kr_02', 'sk_cn_03', 'sk_jp_03'] },
  OUTLAW: { ai: 'RUSHDOWN', skills: ['sk_jp_03', 'sk_jp_06', 'sk_cn_07'] },
  MERCHANT: { ai: 'HEAVY', skills: ['sk_kr_01', 'sk_cn_01', 'sk_jp_03'] },
  SPLINTER: { ai: 'AGGRESSIVE', skills: ['sig_cross_slash', 'sk_jp_02', 'sk_kr_06'] },
};

function sectBattle(
  state: GameState,
  sect: SectState,
  o: { id: string; title: string; subtitle: string; real: boolean; scale: number; followup: string; useLeader?: boolean; rewardMoney?: number; rewardFame?: number; canUseDisciple?: boolean }
): BattleConfig {
  const style = SECT_FIGHT_STYLE[sect.kind];
  const powerFactor = 0.8 + sect.power / 250;
  const cfg = createBattleConfig(
    o.id,
    o.title,
    o.subtitle,
    o.real,
    o.useLeader ? sect.leader : sect.champion,
    `${sect.name.replace(/\(.*?\)/g, '')} ${o.useLeader ? sect.leaderTitle : '대표 무사'}`,
    o.useLeader ? 48 : 30,
    style.ai,
    Math.max(0.8, o.scale * powerFactor),
    'BLADE',
    style.skills,
    { rewardMoney: o.rewardMoney ?? Math.round(30 + o.scale * 22), rewardFame: o.rewardFame ?? Math.round(18 + o.scale * 12), eventFollowupId: o.followup }
  );
  return o.canUseDisciple === false ? { ...cfg, canUseDisciple: false } : cfg;
}

export function requestSectSpar(state: GameState, sectId: string): GameState {
  const sect = findSect(state, sectId);
  if (!sect || !sect.met || !canDoDiplomacy(state) || sect.relation < -15) return state;
  return {
    ...state,
    flags: { ...state.flags, diplomacyTurn: state.turn },
    phase: 'BATTLE',
    pendingBattle: sectBattle(state, sect, {
      id: `spar_sect_${state.turn}`,
      title: `교류 비무 — ${sect.name.replace(/\(.*?\)/g, '')}`,
      subtitle: '이기든 지든 서로를 알아 가는 한 합',
      real: false,
      scale: getEnemyScale(state) * 0.92,
      followup: `sect_spar|${sect.id}`,
      rewardMoney: 0,
      rewardFame: 12,
    }),
  };
}

export function canTalkToDisciple(state: GameState): boolean {
  return state.flags.talkTurn !== state.turn;
}

export function talkToDisciple(state: GameState, discipleId: string): GameState {
  const d = state.disciples.find((x) => x.id === discipleId && !x.dead);
  if (!d || !canTalkToDisciple(state)) return state;
  let next: GameState = { ...state, flags: { ...state.flags, talkTurn: state.turn } };
  let exposedNow = false;
  if (d.temperament === 'SCHEMER' && !d.exposed) {
    const chance = clamp(0.15 + state.stats.ins / 200 + (d.plot || 0) / 250, 0.15, 0.8);
    exposedNow = Math.random() < chance;
  }
  next = mapDisciple(next, d.id, (x) => ({
    ...x,
    loyalty: exposedNow ? x.loyalty : clamp(x.loyalty + 6, 0, 100),
    temperamentKnown: true,
    exposed: x.exposed || exposedNow,
  }));
  if (exposedNow) {
    return addLog(next, `${josa(d.name, '과와')} 마주 앉아 차를 나누다, 공손한 말씨 뒤에 감춘 흑심을 읽어 냈다!`, 'DANGER');
  }
  const shown = shownTemperament({ ...d, temperamentKnown: true });
  const meta = shown ? TEMPERAMENTS[shown] : null;
  return addLog(
    next,
    `${josa(d.name, '과와')} 마주 앉아 속내를 들었다. (충성 +6)${meta ? ` 기질은 【${meta.label}】 — 바라는 것: ${meta.wants}.` : ''}`,
    'GOOD'
  );
}

export function expelDisciple(state: GameState, discipleId: string): GameState {
  const d = state.disciples.find((x) => x.id === discipleId && !x.dead);
  if (!d || d.isChild) return state;
  const shown = shownTemperament(d);
  const justified = (shown && TEMPERAMENTS[shown].trouble) || d.loyalty < 40;
  const bitter = d.loyalty < 55 || isTroublemaker(d);
  const refuge = bitter ? worstSect(state, -15) : null;
  let next = departDisciple(state, d, bitter ? 'RIVAL_BETRAYER' : 'ORDINARY', refuge?.name);
  if (refuge) next = adjustPower(next, refuge.id, 3);
  if (justified) {
    next = { ...next, authority: next.authority + 5 };
    return addLog(next, `문하생 ${josa(d.name, '을를')} 파문했다. 남은 문하생들이 옷깃을 여민다. (권위 +5)`, 'WARN');
  }
  next = bumpOthers(next, d.id, -6);
  next = { ...next, reputation: { ...next.reputation, virtue: Math.max(0, next.reputation.virtue - 4) } };
  return addLog(next, `허물없는 문하생 ${josa(d.name, '을를')} 내쳤다. 남은 문하생들이 술렁인다. (문하생 충성 -6, 인덕 -4)`, 'WARN');
}

// ---------------------------------------------------------------- 반란의 뒷일

// 반란 무리가 도장을 떠난다. 갈 곳이 있으면 그 문파에 붙고, 없으면 새 분파를 세운다.
function rebelsDepart(state: GameState, leaderId: string, followerIds: string[], backerId: string | undefined, hostile: boolean): GameState {
  let next = state;
  const leader = next.disciples.find((d) => d.id === leaderId);
  if (!leader) return next;
  const backer = findSect(next, backerId);
  const splinters = getSects(next).filter((s) => s.kind === 'SPLINTER').length;
  const followers = next.disciples.filter((d) => followerIds.includes(d.id) && !d.dead);
  const baseName = next.sectName.replace(/\(.*?\)/g, '');
  let homeName: string;

  if (backer) {
    homeName = backer.name;
    next = adjustPower(next, backer.id, 4 + followers.length * 2);
    next = adjustRelation(next, backer.id, -10, `등을 돌린 ${leader.name} 무리를 거두어 갔다`);
  } else if (splinters < 2) {
    homeName = `${leader.name} 일문(一門)`;
    const splinter: SectState = {
      id: `sect_splinter_${next.turn}`,
      name: homeName,
      kind: 'SPLINTER',
      leaderTitle: '문주',
      leader: leader.name,
      champion: `${leader.name}의 심복`,
      style: `【${baseName}】에서 갈라져 나간 무리. 옛 스승의 현판을 넘본다.`,
      relation: hostile ? -70 : -35,
      power: clamp(26 + followers.length * 5 + Math.round(statSum(leader) / 12), 25, 75),
      met: true,
      history: [{ year: next.year, season: next.season, text: hostile ? '스승을 꺾고 문하생을 이끌고 나갔다' : '스승이 터 준 길로 갈라져 나갔다', delta: 0 }],
    };
    next = { ...next, sects: [...getSects(next), splinter] };
  } else {
    homeName = '';
  }

  next = departDisciple(next, leader, 'RIVAL_BETRAYER', homeName || undefined);
  for (const f of followers) next = departDisciple(next, f, 'RIVAL_BETRAYER', homeName || undefined);
  return next;
}

function countRebellion(state: GameState): GameState {
  return { ...state, flags: { ...state.flags, rebellions: (state.flags.rebellions || 0) + 1 } };
}

// 반란을 눌렀을 때: 우두머리는 떠나거나 죽고, 따르던 자들은 무릎을 꿇는다.
function rebellionCrushed(state: GameState, leaderId: string, followerIds: string[], leaderDies: boolean): GameState {
  let next = state;
  const leader = next.disciples.find((d) => d.id === leaderId);
  if (leader) {
    next = leaderDies
      ? mapDisciple(next, leaderId, (d) => ({ ...d, dead: true, leftReason: '반란을 일으켰다가 스승의 칼에 쓰러짐' }))
      : departDisciple(next, leader, 'RIVAL_BETRAYER', worstSect(next, -15)?.name);
  }
  next = {
    ...next,
    disciples: next.disciples.map((d) => (followerIds.includes(d.id) && !d.dead ? { ...d, loyalty: Math.max(d.loyalty, 48) } : d)),
  };
  return next;
}

// ---------------------------------------------------------------- 이벤트 선택지 처리

const isDramaEvent = (id: string) => /^(trouble_|sect_|rebellion_)/.test(id);

export function resolveSectEvent(state: GameState, event: ActiveEvent, optionId: string, scale: number): GameState | null {
  const meta = event.meta || {};
  const cfg = getDifficultyConfig(state);
  const diffId = getDifficultyId(state);
  const cur = COUNTRIES[state.country].currency;
  let next: GameState = { ...state };
  if (isDramaEvent(event.id)) {
    next = {
      ...next,
      flags: {
        ...next.flags,
        lastDramaTurn: next.turn,
        troubleCount: (next.flags.troubleCount || 0) + (event.id.startsWith('trouble_') ? 1 : 0),
      },
    };
    // 말썽을 겪고 나면 그 제자의 기질은 누구의 눈에도 보인다.
    if (meta.discipleId) next = mapDisciple(next, meta.discipleId, (d) => ({ ...d, temperamentKnown: true }));
  }
  const sect = findSect(next, meta.sectId);
  const ally = findSect(next, meta.allyId);
  const dId = meta.discipleId as string | undefined;
  const d = next.disciples.find((x) => x.id === dId);
  const dName = d?.name || (meta.discipleName as string) || '문하생';
  const cost = Number(meta.cost || 0);

  switch (optionId) {
    // ------------------------------------------------ 말썽 1: 저잣거리 싸움 (다혈질)
    case 'brawl_apologize':
      next.money = Math.max(0, next.money - cost);
      next = adjustRelation(next, sect?.id, 6, `${dName}의 싸움을 스승이 직접 사과했다`);
      next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty - 8, 0, 100) }));
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 4 };
      return addLog(next, `직접 찾아가 고개를 숙이고 치료비(-${cost}${cur})를 물었다. ${josa(dName, '은는')} 분해서 입술을 깨문다. (관계 +6, ${dName} 충성 -8)`, 'NORMAL');
    case 'brawl_defend':
      next = adjustRelation(next, sect?.id, -14, `${dName}의 싸움을 두고 사과를 거절당했다`);
      next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty + 10, 0, 100) }));
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 4 };
      return addLog(next, `“내 제자는 까닭 없이 주먹을 쓰지 않는다.” 사과를 거절했다. ${josa(dName, '은는')} 스승을 다시 본다. (관계 -14, ${dName} 충성 +10)`, 'WARN');
    case 'brawl_punish':
      next = adjustRelation(next, sect?.id, -4, `${dName}의 싸움으로 감정이 상했다`);
      next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty - 12, 0, 100) }));
      next.authority += 6;
      return addLog(next, `문하생들 앞에서 ${josa(dName, '을를')} 엄히 벌하고 석 달 근신을 내렸다. (관계 -4, ${dName} 충성 -12, 권위 +6)`, 'NORMAL');

    // ------------------------------------------------ 말썽 2: 행패 (오만)
    case 'bully_compensate':
      next.money = Math.max(0, next.money - cost);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 6 };
      next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty - 10, 0, 100) }));
      return addLog(next, `피해를 물어 주고(-${cost}${cur}) ${josa(dName, '을를')} 마을 사람들 앞에서 사죄시켰다. (인덕 +6, ${dName} 충성 -10)`, 'GOOD');
    case 'bully_talk': {
      const ok = Math.random() < clamp(0.3 + next.stats.ins / 150, 0.3, 0.85);
      if (ok) {
        next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty + 8, 0, 100) }));
        return addLog(next, `밤새 타이르자 ${josa(dName, '이가')} 고개를 떨구고 스스로 사죄하러 갔다. (${dName} 충성 +8)`, 'GOOD');
      }
      next.reputation = { ...next.reputation, virtue: Math.max(0, next.reputation.virtue - 6) };
      next.fame = Math.max(0, next.fame - 6);
      return addLog(next, `밤새 타일렀으나 ${josa(dName, '은는')} 건성으로 고개만 끄덕였다. 마을의 원성은 그대로다. (인덕 -6, 명성 -6)`, 'WARN');
    }
    case 'bully_ignore':
      next.reputation = { ...next.reputation, virtue: Math.max(0, next.reputation.virtue - 12) };
      next.fame = Math.max(0, next.fame - 15);
      next = bumpOthers(next, dId, -4);
      return addLog(next, `젊은 혈기라며 넘어갔다. 마을 사람들이 침을 뱉고 돌아섰다. (인덕 -12, 명성 -15, 다른 문하생 충성 -4)`, 'WARN');

    // ------------------------------------------------ 말썽 3: 금고에 손을 댐 (탐욕)
    case 'theft_expel':
    case 'gamble_expel': {
      if (optionId === 'theft_expel') next.money = Math.max(0, next.money - cost);
      if (d) {
        const refuge = worstSect(next, -15);
        next = departDisciple(next, d, 'RIVAL_BETRAYER', refuge?.name);
        if (refuge) next = adjustPower(next, refuge.id, 3);
      }
      next.authority += 8;
      return addLog(next, `${josa(dName, '을를')} 그 자리에서 파문했다. 서늘한 눈으로 돌아보며 대문을 나선다. (권위 +8)`, 'WARN');
    }
    case 'theft_work': {
      const lost = Math.round(cost / 2);
      next.money = Math.max(0, next.money - lost);
      next = mapDisciple(next, dId, (x) => ({ ...x, role: x.role === 'HEIR' ? x.role : 'ESCORT', loyalty: clamp(x.loyalty + 4, 0, 100) }));
      return addLog(next, `${dName}에게 호위 일로 축낸 돈을 갚게 했다. 절반은 되찾았다. (-${lost}${cur}, 직책: 호위)`, 'NORMAL');
    }
    case 'theft_forgive':
      next.money = Math.max(0, next.money - cost);
      next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty + 8, 0, 100) }));
      next = bumpOthers(next, dId, -5);
      next.authority = Math.max(0, next.authority - 5);
      return addLog(next, `없던 일로 덮었다. 축난 돈(-${cost}${cur})은 돌아오지 않았고 다른 문하생들이 수군거린다. (권위 -5)`, 'WARN');

    // ------------------------------------------------ 말썽 4: 노름빚 (나태)
    case 'gamble_pay':
      next.money = Math.max(0, next.money - cost);
      next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty + 12, 0, 100) }));
      return addLog(next, `빚(-${cost}${cur})을 대신 갚아 주었다. ${josa(dName, '이가')} 무릎을 꿇고 다시는 않겠다 맹세한다. (${dName} 충성 +12)`, 'NORMAL');
    case 'gamble_labor':
      next = mapDisciple(next, dId, (x) => ({
        ...x,
        loyalty: clamp(x.loyalty - 8, 0, 100),
        stats: { ...x.stats, vit: x.stats.vit + 2, str: x.stats.str + 1 },
      }));
      next.authority += 4;
      return addLog(next, `석 달 품을 팔아 제 손으로 갚게 했다. 손바닥이 터졌으나 몸은 단단해졌다. (${dName} 충성 -8, 체력 +2, 권위 +4)`, 'NORMAL');

    // ------------------------------------------------ 말썽 5: 숙적 문파의 스카우트
    case 'poach_promote':
      next = mapDisciple(next, dId, (x) => ({ ...x, role: x.role === 'HEIR' ? x.role : 'INSTRUCTOR', loyalty: clamp(x.loyalty + 15, 0, 100) }));
      next = adjustRelation(next, sect?.id, -3, `${josa(dName, '을를')} 데려가려다 빈손으로 돌아갔다`);
      return addLog(next, `${josa(dName, '을를')} 사범으로 올려 붙잡았다. (${dName} 충성 +15)`, 'GOOD');
    case 'poach_release': {
      if (d) next = departDisciple(next, d, d.loyalty >= 55 ? 'SUCCESSFUL' : 'RIVAL_BETRAYER', sect?.name);
      next = adjustPower(next, sect?.id, 4);
      next = adjustRelation(next, sect?.id, 6, `${josa(dName, '을를')} 보내 주어 체면을 세워 주었다`);
      return addLog(next, `“네 길을 가거라.” ${josa(dName, '을를')} ${sect ? sectTag(sect.name) : '그 문파'}로 보내 주었다. (관계 +6)`, 'NORMAL');
    }
    case 'poach_protest':
      next = adjustRelation(next, sect?.id, -12, '문하생을 빼 가려 한 일로 정식 항의를 받았다');
      next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty + 4, 0, 100) }));
      next.authority += 3;
      return addLog(next, `${sect ? sectTag(sect.name) : '그 문파'}에 사람을 보내 정식으로 항의했다. (관계 -12, 권위 +3)`, 'WARN');

    // ------------------------------------------------ 말썽 6: 밀고 (흑심)
    case 'tipoff_confront': {
      const ok = Math.random() < clamp(0.35 + next.stats.ins / 160, 0.35, 0.9);
      if (ok) {
        next = mapDisciple(next, dId, (x) => ({ ...x, exposed: true, temperamentKnown: true, plot: Math.max(0, (x.plot || 0) - 30) }));
        return addLog(next, `${josa(dName, '을를')} 불러 앉혀 추궁하자 말이 꼬이기 시작했다. 흑심이 드러났다! 어찌 처분할지는 스승의 몫이다.`, 'DANGER');
      }
      next = mapDisciple(next, dId, (x) => ({ ...x, plot: Math.min(100, (x.plot || 0) + 10) }));
      next = mapDisciple(next, meta.informantId, (x) => ({ ...x, loyalty: clamp(x.loyalty - 6, 0, 100) }));
      return addLog(next, `${josa(dName, '은는')} 눈물까지 보이며 결백을 말했고, 증거는 잡지 못했다. 일러바친 제자만 난처해졌다.`, 'WARN');
    }
    case 'tipoff_watch':
      next = mapDisciple(next, dId, (x) => ({ ...x, watched: true, exposed: true, temperamentKnown: true }));
      return addLog(next, `모른 척하고 믿을 만한 제자를 ${dName} 곁에 붙였다. 이제 그 속을 알고 지켜본다.`, 'NORMAL');
    case 'tipoff_dismiss':
      next = mapDisciple(next, dId, (x) => ({ ...x, plot: Math.min(100, (x.plot || 0) + 12) }));
      next = mapDisciple(next, meta.informantId, (x) => ({ ...x, loyalty: clamp(x.loyalty - 10, 0, 100) }));
      return addLog(next, '증거 없는 밀고는 듣지 않겠다며 물리쳤다. 일러바친 제자가 입을 다문다.', 'NORMAL');

    // ------------------------------------------------ 반란
    case 'rebel_duel': {
      const leader = next.disciples.find((x) => x.id === meta.leaderId);
      if (!leader) return next;
      const followerIds = (meta.followerIds as string[]) || [];
      const real = !!meta.isReal;
      const backer = findSect(next, meta.backerId);
      const battle = createBattleConfig(
        `b_rebel_${next.turn}`,
        `반란 — ${leader.name}`,
        real ? '⚠ 패배 시 사망/영구장애' : '현판을 건 사제(師弟)의 한 합',
        real,
        leader.name,
        '등을 돌린 제자',
        leader.age,
        'AGGRESSIVE',
        clamp(statSum(leader) / 95, 1.0, 3.0) * (backer ? 1.1 : 1),
        'BLADE',
        ['sig_cross_slash', 'sk_jp_02', 'sk_kr_06'],
        { rewardMoney: 0, rewardFame: 40, eventFollowupId: `sect_rebel|${leader.id}|${followerIds.join(',')}|${backer?.id || ''}` }
      );
      return { ...next, pendingBattle: { ...battle, canUseDisciple: false }, phase: 'BATTLE' };
    }
    case 'rebel_loyal': {
      const leaderId = meta.leaderId as string;
      const followerIds = (meta.followerIds as string[]) || [];
      const rebelIds = [leaderId, ...followerIds];
      const rebels = next.disciples.filter((x) => rebelIds.includes(x.id) && !x.dead);
      const loyal = next.disciples.filter((x) => !x.dead && !rebelIds.includes(x.id) && x.age >= 15);
      const L = loyal.reduce((a, x) => a + statSum(x), 0);
      const R = rebels.reduce((a, x) => a + statSum(x), 0) * (meta.backerId ? 1.15 : 1);
      const chance = clamp(0.5 + ((L - R) / Math.max(1, L + R)) * 0.7, 0.12, 0.92);
      next = countRebellion(next);
      if (Math.random() < chance) {
        next = rebellionCrushed(next, leaderId, followerIds, false);
        next = { ...next, disciples: next.disciples.map((x) => (loyal.some((l) => l.id === x.id) ? { ...x, loyalty: clamp(x.loyalty + 6, 0, 100) } : x)) };
        next.authority += 6;
        const casualtyRate = diffId === 'HELL' ? 0.35 : diffId === 'HARD' ? 0.2 : 0;
        if (loyal.length > 0 && Math.random() < casualtyRate) {
          const vic = loyal[Math.floor(Math.random() * loyal.length)];
          next = mapDisciple(next, vic.id, (x) => ({ ...x, dead: true, leftReason: '반란을 막다 전사' }));
          return addLog(next, `☠ 충직한 제자들이 반란을 눌렀으나, 앞장섰던 ${josa(vic.name, '이가')} 칼에 쓰러졌다…`, 'DANGER');
        }
        return addLog(next, `충직한 제자들이 ${meta.leaderName} 무리를 마당에서 몰아냈다. 현판은 제자리에 걸려 있다. (권위 +6)`, 'GOOD');
      }
      next = rebelsDepart(next, leaderId, followerIds, meta.backerId as string | undefined, true);
      next.signboardStolen = true;
      next.fame = Math.max(0, next.fame - 20);
      next.money = Math.round(next.money * 0.7);
      next.authority = Math.max(0, next.authority - 15);
      return addLog(next, `☠ 충직한 제자들이 밀렸다. ${meta.leaderName} 무리가 현판과 금고의 은자를 들고 도장을 떠났다. (명성 -20, 재화 -30%)`, 'DANGER');
    }
    case 'rebel_ally': {
      next = countRebellion(next);
      next = rebellionCrushed(next, meta.leaderId as string, (meta.followerIds as string[]) || [], false);
      next = adjustRelation(next, ally?.id, -15, '반란을 눌러 달라는 청을 들어주었다');
      next.fame = Math.max(0, next.fame - 10);
      next.authority = Math.max(0, next.authority - 5);
      return addLog(next, `${ally ? sectTag(ally.name) : '우호 문파'}의 무사들이 달려와 반란을 눌렀다. 제 집안일을 남의 손으로 다스렸다는 말이 돈다. (관계 -15, 명성 -10)`, 'WARN');
    }
    case 'rebel_split': {
      next = countRebellion(next);
      next = rebelsDepart(next, meta.leaderId as string, (meta.followerIds as string[]) || [], undefined, false);
      next.authority = Math.max(0, next.authority - 10);
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 5 };
      return addLog(next, `“따를 자는 데리고 떠나라.” 길을 터 주었다. ${meta.leaderName} 무리가 새벽안개 속으로 사라졌다. (권위 -10, 인덕 +5)`, 'WARN');
    }

    // ------------------------------------------------ 문파 1: 사절
    case 'envoy_spar':
    case 'peace_duel':
    case 'aid_go':
    case 'shake_fight':
    case 'raid_fight': {
      const target = optionId === 'aid_go' ? findSect(next, meta.enemyId) : sect;
      if (!target) return next;
      const real = !!meta.isReal && (optionId === 'shake_fight' || optionId === 'raid_fight');
      const conf = {
        envoy_spar: { id: `spar_sect_${next.turn}`, title: `교류 비무 — ${target.name.replace(/\(.*?\)/g, '')}`, subtitle: '이기든 지든 서로를 알아 가는 한 합', followup: `sect_spar|${target.id}`, mult: 0.92, leader: false },
        peace_duel: { id: `spar_peace_${next.turn}`, title: `화해의 한 합 — ${target.leader}`, subtitle: '묵은 원한을 칼끝으로 씻는다', followup: `sect_peace|${target.id}`, mult: 1.0, leader: true },
        aid_go: { id: `b_aid_${next.turn}`, title: `원군 — ${target.name.replace(/\(.*?\)/g, '')}`, subtitle: `${josa(ally?.name.replace(/\(.*?\)/g, '') || '벗', '을를')} 도와 나선 싸움`, followup: `sect_aid|${ally?.id || ''}|${target.id}`, mult: 1.0, leader: false },
        shake_fight: { id: `b_shake_${next.turn}`, title: `자릿세 시비 — ${target.champion}`, subtitle: real ? '⚠ 패배 시 사망/영구장애' : '물러서면 장터가 넘어간다', followup: `sect_duel|${target.id}`, mult: 0.96, leader: false },
        raid_fight: { id: `b_raid_${next.turn}`, title: `습격 — ${target.name.replace(/\(.*?\)/g, '')}`, subtitle: real ? '⚠ 패배 시 사망/영구장애' : '대문 앞에서 막아야 한다', followup: `sect_raid|${target.id}`, mult: 1.06, leader: true },
      }[optionId];
      return {
        ...next,
        phase: 'BATTLE',
        pendingBattle: sectBattle(next, target, {
          id: conf.id,
          title: conf.title,
          subtitle: conf.subtitle,
          real,
          scale: scale * conf.mult,
          followup: conf.followup,
          useLeader: conf.leader,
          rewardMoney: optionId === 'envoy_spar' || optionId === 'peace_duel' ? 0 : undefined,
        }),
      };
    }
    case 'envoy_gift':
      next.money = Math.max(0, next.money - cost);
      next = adjustRelation(next, sect?.id, 12, '사절에게 답례품을 들려 보냈다');
      return addLog(next, `사절에게 답례품(-${cost}${cur})을 들려 보냈다. (관계 +12)`, 'GOOD');
    case 'envoy_decline':
      next = adjustRelation(next, sect?.id, -6, '교류 제안을 사양했다');
      return addLog(next, '정중히 사양하고 사절을 돌려보냈다. (관계 -6)', 'NORMAL');

    // ------------------------------------------------ 문파 2: 자릿세
    case 'shake_pay':
      next.money = Math.max(0, next.money - cost);
      next = adjustRelation(next, sect?.id, 8, '자릿세를 받아 갔다');
      next.authority = Math.max(0, next.authority - 6);
      return addLog(next, `자릿세(-${cost}${cur})를 쥐여 보냈다. 문하생들이 고개를 숙인다. (관계 +8, 권위 -6)`, 'WARN');
    case 'shake_mediate':
      next = adjustRelation(next, ally?.id, -5, '자릿세 시비의 중재를 맡아 주었다');
      next = adjustRelation(next, sect?.id, 2, `${ally?.name.replace(/\(.*?\)/g, '') || '다른 문파'}의 중재로 물러났다`);
      return addLog(next, `${ally ? sectTag(ally.name, '이가') : '우호 문파가'} 사이에 서 주자 무뢰배들이 침을 뱉고 물러갔다. 신세를 졌다. (${ally ? ally.name.replace(/\(.*?\)/g, '') : '우호 문파'} 관계 -5)`, 'GOOD');
    case 'shake_refuse':
      next = adjustRelation(next, sect?.id, -10, '자릿세 요구를 무시당했다');
      next.fame = Math.max(0, next.fame - 5);
      return addLog(next, '대문을 닫아걸고 상대하지 않았다. 담 너머로 욕설이 한참 이어졌다. (관계 -10, 명성 -5)', 'WARN');

    // ------------------------------------------------ 문파 3: 습격
    case 'raid_disciples': {
      const fighters = next.disciples.filter((x) => !x.dead && x.age >= 15);
      const strength = fighters.reduce((a, x) => a + statSum(x), 0);
      const need = (sect?.power || 50) * 9 * cfg.enemyScaleMult;
      const ok = Math.random() < clamp(0.25 + (strength / Math.max(1, need)) * 0.45, 0.2, 0.9);
      const casualtyRate = diffId === 'HELL' ? 0.4 : diffId === 'HARD' ? 0.24 : 0;
      let vicLine = '';
      if (fighters.length > 0 && Math.random() < casualtyRate) {
        const vic = fighters[Math.floor(Math.random() * fighters.length)];
        if (Math.random() < 0.5) {
          next = mapDisciple(next, vic.id, (x) => ({ ...x, dead: true, leftReason: '습격을 막다 전사' }));
          vicLine = ` ☠ ${josa(vic.name, '이가')} 대문을 지키다 쓰러졌다.`;
        } else {
          next = mapDisciple(next, vic.id, (x) => ({ ...x, stats: { ...x.stats, vit: Math.max(10, x.stats.vit - 3) } }));
          vicLine = ` ${josa(vic.name, '이가')} 깊은 상처를 입었다.`;
        }
      }
      if (ok) {
        next = adjustRelation(next, sect?.id, 6, '습격이 문하생들에게 막혀 물러났다');
        next = adjustPower(next, sect?.id, -6);
        next.fame += 12;
        next = bumpOthers(next, undefined, 4);
        return addLog(next, `문하생들과 어깨를 맞대고 습격을 막아 냈다!${vicLine} (명성 +12, 문하생 충성 +4)`, vicLine.includes('☠') ? 'DANGER' : 'GOOD');
      }
      const loot = Math.round(next.money * 0.2);
      next.money -= loot;
      next.fame = Math.max(0, next.fame - 15);
      next = adjustPower(next, sect?.id, 4);
      return addLog(next, `문하생들이 밀려 창고가 털렸다.${vicLine} (-${loot}${cur}, 명성 -15)`, 'DANGER');
    }
    case 'raid_ally':
      next = adjustRelation(next, ally?.id, -8, '습격을 받았을 때 원군을 보내 주었다');
      next = adjustRelation(next, sect?.id, 4, `${ally?.name.replace(/\(.*?\)/g, '') || '원군'}에게 쫓겨 물러났다`);
      next = adjustPower(next, sect?.id, -8);
      return addLog(next, `${ally ? sectTag(ally.name) : '우호 문파'}의 원군이 횃불을 들고 달려오자 습격자들이 담을 넘어 달아났다. 큰 신세를 졌다. (${ally ? ally.name.replace(/\(.*?\)/g, '') : '우호 문파'} 관계 -8)`, 'GOOD');
    case 'raid_tribute':
      next.money = Math.max(0, next.money - cost);
      next = adjustRelation(next, sect?.id, 15, '화해금을 받고 물러났다');
      next.authority = Math.max(0, next.authority - 10);
      next.fame = Math.max(0, next.fame - 15);
      return addLog(next, `은자(-${cost}${cur})를 내주고 습격자들을 돌려보냈다. 치욕이 남았다. (관계 +15, 명성 -15, 권위 -10)`, 'WARN');

    // ------------------------------------------------ 문파 4: 동맹
    case 'ally_accept': {
      if (!sect) return next;
      next = adjustRelation(next, sect.id, 10, '동맹의 잔을 나누었다');
      next = { ...next, sects: getSects(next).map((s) => (s.id === sect.id ? { ...s, allied: true } : s)) };
      // 정파와 흑도는 한 하늘을 이지 않는다.
      const opposite = sect.kind === 'ORTHODOX' ? 'OUTLAW' : sect.kind === 'OUTLAW' ? 'ORTHODOX' : null;
      const foe = opposite ? getSects(next).find((s) => s.kind === opposite) : null;
      if (foe) next = adjustRelation(next, foe.id, -20, `${josa(sect.name.replace(/\(.*?\)/g, ''), '과와')} 동맹을 맺은 것을 못마땅해한다`);
      next.fame += 20;
      return addLog(next, `★ ${sectTag(sect.name, '과와')} 동맹을 맺었다! ${ALLY_PERK[sect.kind]}.${foe ? ` ${sectTag(foe.name, '이가')} 이를 갈고 있다.` : ''} (명성 +20)`, 'MAGIC');
    }
    case 'ally_decline':
      next = adjustRelation(next, sect?.id, -8, '동맹 제안을 사양했다');
      return addLog(next, '어느 편에도 서지 않겠다며 동맹을 사양했다. (관계 -8)', 'NORMAL');

    // ------------------------------------------------ 문파 5: 교류
    case 'exch_disciples':
      next = adjustRelation(next, sect?.id, 5, '문하생들이 함께 수련했다');
      next = {
        ...next,
        disciples: next.disciples.map((x) =>
          x.dead ? x : { ...x, stats: { ...x.stats, str: x.stats.str + 1, agi: x.stats.agi + 1, ins: x.stats.ins + 2 }, loyalty: clamp(x.loyalty + 3, 0, 100) }
        ),
      };
      return addLog(next, `문하생들을 보내 ${sect ? sectTag(sect.name) : '그 문파'}의 무예를 보고 오게 했다. 눈이 한층 트였다. (문하생 전원 능력치↑, 관계 +5)`, 'GOOD');
    case 'exch_self':
      next = adjustRelation(next, sect?.id, 4, '도장주가 직접 찾아와 교류했다');
      if (sect?.kind === 'MERCHANT') {
        const pay = Math.round((60 + sect.power) * cfg.incomeMult);
        next.money += pay;
        next.reputation = { ...next.reputation, commerce: next.reputation.commerce + 6 };
        return addLog(next, `직접 표행에 동행해 짐을 지켜 주었다. (+${pay}${cur}, 상무 +6, 관계 +4)`, 'GOOD');
      }
      next.stats = { ...next.stats, ins: next.stats.ins + 3, wil: next.stats.wil + 2 };
      next.reputation = { ...next.reputation, ascetic: next.reputation.ascetic + 3 };
      return addLog(next, `직접 찾아가 ${josa(sect?.leader || '장문인', '과와')} 밤새 검리를 논했다. (통찰 +3, 정신 +2, 구도 +3, 관계 +4)`, 'GOOD');
    case 'exch_decline':
      next = adjustRelation(next, sect?.id, -4, '교류 제안을 사양했다');
      return addLog(next, '바쁜 철이라며 교류 제안을 사양했다. (관계 -4)', 'NORMAL');

    // ------------------------------------------------ 문파 6: 원군 요청
    case 'aid_send': {
      const fighters = next.disciples.filter((x) => !x.dead && x.age >= 15 && !x.isChild);
      next = adjustRelation(next, ally?.id, 10, '어려울 때 문하생들을 보내 주었다');
      next = adjustRelation(next, meta.enemyId as string, -10, `${ally?.name.replace(/\(.*?\)/g, '') || '상대'} 편에 문하생을 보냈다`);
      next = {
        ...next,
        disciples: next.disciples.map((x) => (fighters.some((f) => f.id === x.id) ? { ...x, stats: { ...x.stats, str: x.stats.str + 1, vit: x.stats.vit + 1 } } : x)),
      };
      const casualtyRate = diffId === 'HELL' ? 0.32 : diffId === 'HARD' ? 0.18 : 0;
      if (fighters.length > 0 && Math.random() < casualtyRate) {
        const vic = fighters[Math.floor(Math.random() * fighters.length)];
        next = mapDisciple(next, vic.id, (x) => ({ ...x, dead: true, leftReason: '원군으로 나갔다가 전사' }));
        return addLog(next, `☠ 문하생들을 원군으로 보냈다. 싸움은 이겼으나 ${josa(vic.name, '이가')} 돌아오지 못했다…`, 'DANGER');
      }
      return addLog(next, `문하생들을 원군으로 보냈다. 실전을 겪고 눈빛이 달라져 돌아왔다. (관계 +10)`, 'GOOD');
    }
    case 'aid_decline':
      next = adjustRelation(next, ally?.id, ally?.allied ? -20 : -12, '어려울 때 도움을 거절당했다');
      return addLog(next, `남의 싸움에 낄 수 없다며 청을 물리쳤다. (${ally ? ally.name.replace(/\(.*?\)/g, '') : '그 문파'} 관계 ${ally?.allied ? -20 : -12})`, 'WARN');

    // ------------------------------------------------ 문파 7: 화해
    case 'peace_pay': {
      next.money = Math.max(0, next.money - cost);
      const gain = sect ? Math.max(30, -10 - sect.relation) : 30;
      next = adjustRelation(next, sect?.id, Math.min(gain, 45), '화해의 자리에서 묵은 일을 털었다');
      return addLog(next, `화해금(-${cost}${cur})을 내고 묵은 원한을 털었다. (관계 +${Math.min(gain, 45)})`, 'GOOD');
    }
    case 'peace_refuse':
      next = adjustRelation(next, sect?.id, -5, '화해의 자리를 박차고 나갔다');
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 5 };
      return addLog(next, '“숙일 머리는 없다.” 화해의 자리를 박차고 나왔다. (관계 -5, 살기 +5)', 'WARN');

    // ------------------------------------------------ 기존 이벤트에 끼어드는 문파
    case 'breaker_ally':
      next = adjustRelation(next, ally?.id, -6, '도장깨기를 대신 상대해 주었다');
      if (sect) next = adjustRelation(next, sect.id, -2, `${ally?.name.replace(/\(.*?\)/g, '') || '다른 문파'}의 고수에게 도전자가 꺾였다`);
      return addLog(next, `때마침 들른 ${ally ? sectTag(ally.name) : '우호 문파'}의 고수가 도전자를 대신 상대해 돌려보냈다. 신세를 졌다. (${ally ? ally.name.replace(/\(.*?\)/g, '') : '우호 문파'} 관계 -6)`, 'GOOD');
    case 'real_ambush_ally':
      next = adjustRelation(next, ally?.id, -10, '살수의 야습 때 급히 달려와 주었다');
      next.fame = Math.max(0, next.fame - 5);
      return addLog(next, `급히 띄운 전갈에 ${ally ? sectTag(ally.name) : '우호 문파'}의 무사들이 달려왔다. 살수들은 어둠 속으로 흩어졌다. 큰 신세를 졌다. (${ally ? ally.name.replace(/\(.*?\)/g, '') : '우호 문파'} 관계 -10, 명성 -5)`, 'GOOD');
    case 'disaster_ally_aid':
      next.money = Math.max(0, next.money - cost);
      next = adjustRelation(next, ally?.id, -5, '재난 때 구휼미와 일손을 보내 주었다');
      next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 8 };
      return addLog(next, `${ally ? sectTag(ally.name, '이가') : '우호 문파가'} 보낸 구휼미와 일손 덕에 절반의 비용(-${cost}${cur})으로 피해를 수습했다. (인덕 +8, ${ally ? ally.name.replace(/\(.*?\)/g, '') : '우호 문파'} 관계 -5)`, 'GOOD');
    case 'disc_ill_ally': {
      next = adjustRelation(next, ally?.id, -4, '앓는 문하생에게 의원을 보내 주었다');
      const cure = Number(meta.cureChance || 0.6);
      if (Math.random() < cure) {
        next = mapDisciple(next, dId, (x) => ({ ...x, loyalty: clamp(x.loyalty + 15, 0, 100) }));
        return addLog(next, `${ally ? sectTag(ally.name) : '우호 문파'}에서 보낸 의원이 사흘 밤을 지새워 ${josa(dName, '을를')} 살려 냈다! (${dName} 충성 +15)`, 'GOOD');
      }
      if (Math.random() < 0.6) {
        next = mapDisciple(next, dId, (x) => ({ ...x, stats: { ...x.stats, vit: Math.max(10, x.stats.vit - 2) } }));
        return addLog(next, `${ally ? sectTag(ally.name) : '우호 문파'}의 의원이 손을 썼으나 ${josa(dName, '은는')} 겨우 목숨만 건졌다. (제자 체력 -2)`, 'WARN');
      }
      next = mapDisciple(next, dId, (x) => ({ ...x, dead: true, leftReason: '의원의 손으로도 살리지 못해 병사' }));
      return addLog(next, `${ally ? sectTag(ally.name) : '우호 문파'}의 의원도 고개를 저었다. ${josa(dName, '이가')} 끝내 눈을 감았다…`, 'DANGER');
    }
    case 'fest_demo_rebuke':
      next = adjustRelation(next, sect?.id, -6, '축제에서 훼방을 놓다 망신을 당했다');
      next.fame += 26;
      next.authority += 8;
      next.reputation = { ...next.reputation, ruthless: next.reputation.ruthless + 3 };
      return addLog(next, `시연을 멈추고 야유하던 무리를 한마디 호통으로 쫓아냈다. 구경꾼들이 손뼉을 친다. (명성 +26, 권위 +8)`, 'GOOD');

    default:
      return null;
  }
}

// ---------------------------------------------------------------- 전투의 뒷일

export function applySectBattleFollowup(battle: BattleConfig | null, after: GameState, victory: boolean): GameState {
  const follow = battle?.eventFollowupId;
  if (!battle || !follow || !follow.startsWith('sect_')) return after;
  // 스승이 그 싸움에서 죽었다면 더 따질 것이 없다.
  if (after.phase === 'ENDING') return after;
  const [kind, a, b, c] = follow.split('|');
  let next: GameState = { ...after };
  const sect = findSect(next, a);
  const short = (s?: SectState) => s?.name.replace(/\(.*?\)/g, '') || '그 문파';

  switch (kind) {
    case 'sect_spar':
      next = adjustRelation(next, a, victory ? 10 : 6, victory ? '교류 비무에서 한 수 배웠다며 예를 갖췄다' : '교류 비무에서 이기고도 겸양을 보였다');
      return addLog(next, `${sectTag(short(sect), '과와')}의 교류 비무를 마쳤다. 승패를 떠나 서로를 알게 되었다. (관계 +${victory ? 10 : 6})`, 'GOOD');
    case 'sect_duel':
      if (victory) {
        next = adjustRelation(next, a, -4, '대표 무사가 꺾여 체면을 구겼다');
        next = adjustPower(next, a, -4);
        next.authority += 5;
        return addLog(next, `${sectTag(short(sect))}의 무사를 꺾어 돌려보냈다. 원한은 남았으나 한동안 함부로 굴지 못할 것이다. (세력↓, 권위 +5)`, 'GOOD');
      }
      next = adjustPower(next, a, 3);
      return addLog(next, `${sectTag(short(sect), '이가')} 기세를 올렸다. 장터에서 그쪽 문하생들의 어깨가 넓어졌다.`, 'WARN');
    case 'sect_raid':
      if (victory) {
        next = adjustRelation(next, a, 12, '습격이 꺾여 한동안 몸을 사린다');
        next = adjustPower(next, a, -10);
        next = bumpOthers(next, undefined, 5);
        next.authority += 8;
        return addLog(next, `${sectTag(short(sect))}의 습격을 대문 앞에서 꺾었다! 한동안 고개를 들지 못할 것이다. (세력↓↓, 문하생 충성 +5)`, 'GOOD');
      } else {
        const loot = Math.round(next.money * 0.25);
        next.money -= loot;
        next = adjustPower(next, a, 6);
        return addLog(next, `${sectTag(short(sect))}의 무리가 창고를 털어 갔다. (-${loot}${COUNTRIES[next.country].currency})`, 'DANGER');
      }
    case 'sect_aid': {
      const enemy = findSect(next, b);
      next = adjustRelation(next, a, victory ? 15 : 5, victory ? '어려울 때 직접 칼을 들어 주었다' : '졌으나 나서 준 뜻을 잊지 않는다');
      next = adjustRelation(next, b, victory ? -15 : -6, `${short(sect)} 편에 서서 칼을 들었다`);
      if (victory) next = adjustPower(next, b, -5);
      return addLog(next, `${sectTag(short(sect), '을를')} 도와 ${sectTag(short(enemy), '과와')} 맞섰다. (${short(sect)} 관계 +${victory ? 15 : 5})`, victory ? 'GOOD' : 'NORMAL');
    }
    case 'sect_peace':
      next = adjustRelation(next, a, victory ? 28 : 12, victory ? '한 합으로 묵은 원한을 씻었다' : '한 합을 겨루고 응어리가 풀렸다');
      return addLog(next, `${sectTag(short(sect))}의 ${josa(sect?.leaderTitle || '우두머리', '과와')} 한 합을 겨루고 술잔을 나누었다. (관계 +${victory ? 28 : 12})`, 'GOOD');
    case 'sect_rebel': {
      const followerIds = b ? b.split(',').filter(Boolean) : [];
      const leaderName = battle.enemyName;
      next = countRebellion(next);
      if (victory) {
        next = rebellionCrushed(next, a, followerIds, battle.isRealDuel);
        next.authority += 12;
        return addLog(
          next,
          battle.isRealDuel
            ? `반란을 일으킨 ${josa(leaderName, '을를')} 제 손으로 베었다. 따르던 자들이 칼을 버리고 무릎을 꿇는다. (권위 +12)`
            : `${josa(leaderName, '을를')} 꺾어 대문 밖으로 내쳤다. 따르던 자들이 무릎을 꿇는다. (권위 +12)`,
          'GOOD'
        );
      }
      next = rebelsDepart(next, a, followerIds, c || undefined, true);
      const loot = Math.round(next.money * 0.3);
      next.money -= loot;
      next.authority = Math.max(0, next.authority - 15);
      return addLog(next, `☠ 제자의 칼에 무릎을 꿇었다. ${leaderName} 무리가 현판과 금고의 은자(-${loot})를 들고 도장을 떠났다.`, 'DANGER');
    }
    default:
      return after;
  }
}
