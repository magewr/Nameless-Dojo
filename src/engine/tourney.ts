import {
  BattleConfig,
  CountryId,
  Disciple,
  EnemyAiType,
  GameState,
  Gender,
  Stats,
  TourneyFighter,
  TourneyMatch,
  TourneyState,
  WeaponGroup,
} from '../types/game';
import {
  buildMasterSkill,
  evaluateTournamentFameAdjustment,
  getOpponentForRound,
  getTournamentName,
  TOURNAMENT_ROUNDS,
} from '../data/tournament';
import { ALL_WEAPONS_CATALOG } from '../data/weapons';
import { MASTERY_WALL_LEVEL } from '../data/booksAndSkills';
import { josa } from '../utils/korean';
import { addLog } from './log';

// ───────────────────────── 천하제일 무술대회 — 실제 토너먼트 ─────────────────────────
// 강호의 고수 명부는 일생 내내 이어진다. 대회마다 나이를 먹고, 전성기를 지나고, 은퇴하고, 새 얼굴이 나온다.
// 본선 16강은 실제 대진표다. 주인공이 싸우지 않는 경기도 강도와 운으로 승부가 갈리고, 이변이 일어난다.

export const ROUND_LABEL = ['16강', '8강', '4강', '결승'];
const QUAL_LABEL = ['256강 예선', '128강 예선', '64강 예선', '32강 예선'];
const SEED_SCALES = [0.62, 0.9, 1.22, 1.58, 1.95, 2.35, 2.85, 3.35];

// ───────── 이름 짓기 ─────────
const NAMES: Record<CountryId, { sur: string[]; given: string[]; sects: string[]; epithets: string[] }> = {
  KOREA: {
    sur: ['김', '이', '박', '최', '정', '강', '윤', '장', '임', '한', '서', '권', '황', '송', '홍', '백', '남궁', '제갈'],
    given: ['무영', '태산', '청운', '도현', '진혁', '월하', '서린', '한결', '승무', '단비', '석주', '휘', '경천', '설화', '지헌', '우재', '명', '하람'],
    sects: ['호남 활보문', '영남 장창문', '관서 쌍수도장', '해동검문', '지리 청학검', '금강 선무원', '송도 상무관', '탐라 바람검', '북관 호랑문', '한양 무예청'],
    epithets: ['일검(一劍)', '쾌도(快刀)', '철권(鐵拳)', '무영(無影)', '청풍(淸風)', '귀창(鬼槍)', '설검(雪劍)', '맹호(猛虎)'],
  },
  CHINA: {
    sur: ['장', '왕', '이', '조', '유', '진', '양', '황', '주', '오', '임', '하', '구양', '모용', '사마', '상관', '독고'],
    given: ['천호', '운비', '소청', '무기', '경천', '설연', '패도', '청하', '자룡', '백운', '현', '비연', '철심', '일소', '창해'],
    sects: ['화산파', '무당파', '아미파', '공동파', '곤륜파', '점창파', '개방', '사천 당문', '하북 팽가', '남궁세가', '진원 표국', '태극 진가구'],
    epithets: ['검마(劍魔)', '신창(神槍)', '철장(鐵掌)', '비연(飛燕)', '일지(一指)', '패왕(霸王)', '독수(毒手)', '취권(醉拳)'],
  },
  JAPAN: {
    sur: ['야규', '미야모토', '사사키', '쓰카하라', '이토', '오노', '가토', '다케다', '도도', '나카니시', '지바', '사이토', '모리', '야마오카', '아라키'],
    given: ['주베에', '무사시', '고지로', '덴젠', '이치로', '사쿄', '도모에', '하야테', '겐신', '마타에몬', '레이', '아야메', '한베에', '소지로'],
    sects: ['신카게류', '일도류 나카니시파', '지겐류', '호조인류', '야규 신카게', '기타신 일도류', '덴신쇼덴 가토리', '이천일류', '무가이류', '니텐 이치류'],
    epithets: ['검귀(劍鬼)', '일섬(一閃)', '이도(二刀)', '귀신(鬼神)', '무념(無念)', '월영(月影)', '풍신(風神)', '수라(修羅)'],
  },
};

const STYLE_POOL: Record<CountryId, Array<{ ai: EnemyAiType; weapon: WeaponGroup; skills: string[] }>> = {
  KOREA: [
    { ai: 'DUELIST', weapon: 'BLADE', skills: ['sk_kr_06', 'sk_kr_02', 'sk_kr_01'] },
    { ai: 'HEAVY', weapon: 'POLEARM', skills: ['sk_kr_05', 'sk_kr_07', 'sk_kr_02'] },
    { ai: 'RUSHDOWN', weapon: 'UNARMED', skills: ['sk_kr_03', 'sk_kr_04', 'sk_kr_01'] },
    { ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_cross_slash', 'sk_kr_06', 'sk_jp_01'] },
    { ai: 'AGGRESSIVE', weapon: 'BLADE', skills: ['sig_mountain_split', 'sk_kr_02', 'base_h_slash'] },
  ],
  CHINA: [
    { ai: 'DUELIST', weapon: 'BLADE', skills: ['sk_cn_03', 'sk_cn_05', 'sig_formless_qi'] },
    { ai: 'HEAVY', weapon: 'POLEARM', skills: ['sk_cn_06', 'sk_cn_05', 'sk_cn_01'] },
    { ai: 'RUSHDOWN', weapon: 'UNARMED', skills: ['sk_cn_02', 'sk_cn_01', 'sk_cn_04'] },
    { ai: 'RANGED', weapon: 'THROWN', skills: ['sk_cn_07', 'sk_cn_04', 'sk_cn_06'] },
    { ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_crimson_slash', 'sk_cn_06', 'sk_cn_03'] },
  ],
  JAPAN: [
    { ai: 'DUELIST', weapon: 'BLADE', skills: ['sk_jp_01', 'sk_jp_03', 'sk_jp_04'] },
    { ai: 'HEAVY', weapon: 'BLADE', skills: ['sk_jp_06', 'sk_jp_03', 'sk_jp_02'] },
    { ai: 'HEAVY', weapon: 'POLEARM', skills: ['sk_jp_05', 'sk_jp_01', 'sk_jp_02'] },
    { ai: 'RUSHDOWN', weapon: 'THROWN', skills: ['sk_jp_07', 'sk_jp_08', 'sk_jp_03'] },
    { ai: 'DUELIST', weapon: 'BLADE', skills: ['sig_issen', 'sig_behead', 'sk_jp_01'] },
  ],
};

// 나라에 맞는 사람 이름 하나 (사건 생성기도 쓴다)
export function makePersonName(country: CountryId, avoid?: Set<string>): string {
  const pool = NAMES[country];
  let name = '';
  for (let i = 0; i < 12; i++) {
    name = country === 'JAPAN' ? `${pick(pool.sur)} ${pick(pool.given)}` : `${pick(pool.sur)}${pick(pool.given)}`;
    if (!avoid || !avoid.has(name)) break;
  }
  return name;
}

// 이 일생에 이미 등장한 사람들의 이름 — 새로 만든 인물이 죽은 제자·배우자·숙적과 같은 이름이면
// (「현상금 방 — 장무기」처럼) 죽은 제자가 살아 돌아온 듯 헷갈린다.
export function takenNames(state: GameState): Set<string> {
  const out = new Set<string>();
  state.disciples.forEach((d) => out.add(d.name));
  if (state.spouse) out.add(state.spouse.name);
  if (state.rival?.name) out.add(state.rival.name);
  return out;
}

export function randomSectName(country: CountryId): string {
  return pick(NAMES[country].sects);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function newFighter(country: CountryId, year: number, age: number, potential: number, used: Set<string>): TourneyFighter {
  const pool = NAMES[country];
  let name = '';
  for (let i = 0; i < 20; i++) {
    name = country === 'JAPAN' ? `${pick(pool.sur)} ${pick(pool.given)}` : `${pick(pool.sur)}${pick(pool.given)}`;
    if (!used.has(name)) break;
  }
  used.add(name);
  const style = pick(STYLE_POOL[country]);
  const gender: Gender = Math.random() < 0.18 ? 'FEMALE' : 'MALE';
  return {
    id: uid('tf'),
    name,
    sect: pick(pool.sects),
    country,
    gender,
    bornYear: year - age,
    ai: style.ai,
    weapon: style.weapon,
    skills: style.skills,
    potential,
    peakAge: 36 + Math.floor(Math.random() * 14),
    titles: 0,
    kind: 'NPC',
    epithet: Math.random() < 0.5 ? pick(pool.epithets) : undefined,
  };
}

// 나이에 따른 강도 — 전성기까지 오르고, 전성기 5년 뒤부터 해마다 3%씩 꺾인다.
export function fighterPower(f: TourneyFighter, year: number): number {
  const age = year - f.bornYear;
  let curve: number;
  if (age < f.peakAge) curve = 0.62 + 0.38 * Math.max(0, Math.min(1, (age - 16) / Math.max(1, f.peakAge - 16)));
  else if (age <= f.peakAge + 5) curve = 1;
  else curve = Math.max(0.4, 1 - (age - f.peakAge - 5) * 0.03);
  return Math.max(0.5, f.potential * curve + Math.min(0.3, f.titles * 0.05));
}

// 처음 강호에 들어설 때의 명부 — 기존 대회의 이름난 고수들이 첫 세대가 된다.
function seedRoster(state: GameState): TourneyFighter[] {
  const used = new Set<string>();
  const out: TourneyFighter[] = [];
  for (let r = 1; r <= 8; r++) {
    const e = getOpponentForRound(state.country, r);
    used.add(e.name);
    out.push({
      id: uid('tf'),
      name: e.name.replace(/^천하(4검|제일) · /, ''),
      sect: e.sect,
      country: state.country,
      gender: e.gender || 'MALE',
      bornYear: state.year - e.age,
      ai: e.ai,
      weapon: e.weapon,
      skills: e.skills,
      potential: SEED_SCALES[r - 1] * (e.age > 45 ? 1.05 : 1.0),
      peakAge: Math.max(38, e.age - 4),
      titles: r === 8 ? 2 : r === 7 ? 1 : 0,
      kind: 'NPC',
      epithet: r === 8 ? '천하제일' : r === 7 ? '천하4검' : undefined,
    });
  }
  // 새 얼굴들
  for (let i = 0; i < 12; i++) {
    out.push(newFighter(state.country, state.year, 18 + Math.floor(Math.random() * 22), 1.0 + Math.random() * 2.4, used));
  }
  return out;
}

// 대회 사이의 세월 — 은퇴와 새 얼굴
function refreshRoster(state: GameState, roster: TourneyFighter[]): TourneyFighter[] {
  const used = new Set([...roster.map((f) => f.name), ...takenNames(state)]);
  let list = roster.map((f) => {
    if (f.retired) return f;
    const age = state.year - f.bornYear;
    const retire = age >= 72 || (age >= 60 && Math.random() < (age - 58) * 0.05);
    return retire ? { ...f, retired: true } : f;
  });
  const active = list.filter((f) => !f.retired).length;
  const newcomers = Math.max(2, 20 - active) + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < newcomers; i++) {
    // 드물게 한 세대에 하나 나오는 괴물 신인
    const prodigy = Math.random() < 0.16;
    list.push(newFighter(state.country, state.year, 17 + Math.floor(Math.random() * 10), prodigy ? 3.8 + Math.random() * 0.8 : 1.2 + Math.random() * 2.7, used));
  }
  // 명부가 끝없이 길어지지 않게, 은퇴자는 최근 우승자만 남긴다.
  list = list.filter((f) => !f.retired || f.titles > 0).slice(-60);
  return list;
}

// ───────── 주인공·숙적·제자의 강도 ─────────
function statsToScale(st: Stats): number {
  const avg = (st.str + st.agi + st.vit + st.wil + st.ins + st.qi) / 6;
  return Math.max(0.5, (avg - 14) / 16);
}

export function heroPowerEstimate(state: GameState): number {
  const topLv = Math.max(...state.skills.map((s) => s.masteryLevel));
  return statsToScale(state.stats) * (0.85 + topLv * 0.025) * (state.skills.some((s) => s.masteryLevel >= 10) ? 1.25 : 1);
}

function disciplePower(d: Disciple): number {
  const topLv = d.skills.length ? Math.max(...d.skills.map((s) => s.masteryLevel)) : 1;
  return statsToScale(d.stats) * (0.85 + topLv * 0.025);
}

function rivalFighter(state: GameState): TourneyFighter | null {
  const r = state.rival;
  if (!r.alive || r.age > 70) return null;
  const potential = Math.min(3.6, 1.4 + r.act * 0.45 + r.winsAgainstPlayer * 0.05);
  return {
    id: 'rival',
    name: r.name,
    sect: r.title,
    country: state.country,
    gender: 'MALE',
    bornYear: state.year - r.age,
    ai: 'DUELIST',
    weapon: 'BLADE',
    skills: getOpponentForRound(state.country, 7).skills,
    potential,
    peakAge: 45,
    titles: 0,
    kind: 'RIVAL',
  };
}

function discipleFighter(state: GameState, d: Disciple): TourneyFighter {
  return {
    id: `disc_${d.id}`,
    name: d.name,
    sect: state.sectName,
    country: state.country,
    gender: d.gender || 'MALE',
    bornYear: state.year - d.age,
    ai: 'DUELIST',
    weapon: d.talentWeapon && d.talentWeapon !== 'CATALYST' && d.talentWeapon !== 'ANY' ? d.talentWeapon : 'BLADE',
    skills: d.skills.filter((s) => !s.isPassive).map((s) => s.id).slice(0, 4),
    potential: disciplePower(d),
    peakAge: 40,
    titles: 0,
    kind: 'DISCIPLE',
    discipleId: d.id,
  };
}

// ───────── 대진표 ─────────
// 16강 표준 시드 배치 — 1번과 2번 시드는 결승에서야 만난다.
const SEED_POS = [0, 15, 7, 8, 4, 11, 3, 12, 2, 13, 5, 10, 6, 9, 1, 14];

function buildBracket(entrants: Array<{ id: string; power: number }>): string[] {
  const sorted = [...entrants].sort((a, b) => b.power - a.power);
  const slots: string[] = new Array(16).fill('');
  sorted.slice(0, 16).forEach((e, i) => {
    slots[SEED_POS.indexOf(i)] = e.id;
  });
  return slots;
}

function roundMatches(slotsOrWinners: string[], round: number): TourneyMatch[] {
  const out: TourneyMatch[] = [];
  for (let i = 0; i < slotsOrWinners.length; i += 2) {
    out.push({ id: `m${round}_${i / 2}`, round, slot: i / 2, a: slotsOrWinners[i], b: slotsOrWinners[i + 1] });
  }
  return out;
}

export function fighterName(t: TourneyState, id: string, heroName: string): string {
  if (id === 'HERO') return heroName;
  const f = t.entrants.find((e) => e.id === id);
  if (!f) return '???';
  return f.epithet ? `${f.epithet} ${f.name}` : f.name;
}

export function fighterOf(t: TourneyState, id: string): TourneyFighter | undefined {
  return t.entrants.find((e) => e.id === id);
}

function winProb(pa: number, pb: number): number {
  return 1 / (1 + Math.exp(-(pa - pb) * 2.4));
}

// ───────── 대회 시작 ─────────

export function startTourney(state: GameState, mode: 'ENTER' | 'WATCH'): GameState {
  const roster = state.tourneyRoster && state.tourneyRoster.length > 0 ? refreshRoster(state, state.tourneyRoster) : seedRoster(state);
  const history = state.flags.tourneyHistory || [];
  const lastChamp = history[history.length - 1];
  const heroIsChamp = !!lastChamp && lastChamp.champion === state.name;
  const seeded = mode === 'ENTER' && (heroIsChamp || state.fame >= 1500);
  const t: TourneyState = {
    year: state.year,
    name: getTournamentName(state.country),
    mode,
    stage: mode === 'ENTER' && !seeded ? 'QUALIFIER' : 'BRACKET',
    qualifierWins: 0,
    seeded,
    entrants: [],
    powers: {},
    matches: [],
    round: 0,
    heroOut: mode === 'WATCH',
    heroBest: -1,
    news: [],
  };
  let next: GameState = { ...state, tourneyRoster: roster, tourney: t };
  if (seeded) {
    t.news.push(heroIsChamp ? `디펜딩 챔피언 ${state.name}, 예선 없이 본선에 오른다.` : `대문파 【${state.sectName}】의 ${josa(state.name, '은는')} 예선을 면제받았다.`);
  }
  if (t.stage === 'BRACKET') next = buildMainDraw(next, mode === 'ENTER');
  else next = { ...next, pendingBattle: qualifierBattle(next, 0), phase: 'BATTLE' };
  return addLog(next, `🏆 제${Math.max(1, Math.floor((state.year - 1750) / 4))}회 ${t.name}이 막을 올렸다! ${mode === 'ENTER' ? '256강 예선부터 출전한다.' : '객석에서 대진을 지켜본다.'}`, 'GOOD');
}

// 본선 16인을 뽑는다: 디펜딩 챔피언, 숙적, 예선을 뚫은 제자들, 그리고 명부의 강자들.
function buildMainDraw(state: GameState, heroIn: boolean): GameState {
  const t = { ...state.tourney! };
  const roster = (state.tourneyRoster || []).filter((f) => !f.retired);
  const year = state.year;
  const picks: TourneyFighter[] = [];
  const history = state.flags.tourneyHistory || [];
  const lastChamp = history[history.length - 1];
  const champ = lastChamp ? roster.find((f) => f.name === lastChamp.champion) : undefined;
  if (champ) picks.push(champ);
  const rival = rivalFighter(state);
  if (rival) picks.push(rival);
  // 제자들도 예선에 나간다 — 강할수록 본선에 오른다
  const discs = state.disciples
    .filter((d) => !d.dead && !d.isChild && d.age >= 16)
    .map((d) => ({ d, p: disciplePower(d) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
  const news: string[] = [];
  discs.forEach(({ d, p }) => {
    if (Math.random() < Math.max(0.03, Math.min(0.92, (p - 0.9) / 1.3))) {
      picks.push(discipleFighter(state, d));
      news.push(`【${state.sectName}】의 제자 ${josa(d.name, '이가')} 예선을 뚫고 본선에 올랐다!`);
    }
  });
  const slotsLeft = 16 - (heroIn ? 1 : 0) - picks.length;
  const rest = roster
    .filter((f) => !picks.some((p) => p.id === f.id))
    .map((f) => ({ f, score: fighterPower(f, year) + Math.random() * 0.7 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, slotsLeft))
    .map((x) => x.f);
  const entrants = [...picks, ...rest].slice(0, heroIn ? 15 : 16);
  const powers: Record<string, number> = {};
  entrants.forEach((f) => (powers[f.id] = f.kind === 'DISCIPLE' || f.kind === 'RIVAL' ? f.potential : fighterPower(f, year)));
  if (heroIn) powers.HERO = heroPowerEstimate(state);
  const slots = buildBracket([...entrants.map((f) => ({ id: f.id, power: powers[f.id] })), ...(heroIn ? [{ id: 'HERO', power: powers.HERO }] : [])]);
  t.entrants = entrants;
  t.powers = powers;
  t.matches = roundMatches(slots, 0);
  t.round = 0;
  t.stage = 'BRACKET';
  if (heroIn) t.heroBest = 0;
  const favorite = entrants.reduce((a, b) => (powers[a.id] >= powers[b.id] ? a : b));
  t.news = [...t.news, ...news, `본선 16강 대진이 확정되었다. 우승 후보 1순위는 ${fighterName(t, favorite.id, state.name)}(${favorite.sect}).`];
  if (rival) t.news.push(`숙적 ${josa(rival.name, '이가')} 본선에 이름을 올렸다.`);
  return { ...state, tourney: t };
}

// ───────── 경기 ─────────

function qualifierBattle(state: GameState, k: number): BattleConfig {
  const rDef = TOURNAMENT_ROUNDS[k];
  const used = new Set<string>();
  const f = newFighter(state.country, state.year, 20 + Math.floor(Math.random() * 18), rDef.fixedScale, used);
  return fighterBattle(state, f, rDef.fixedScale, k + 1, `${QUAL_LABEL[k]}`, `tourney2|Q|${k}`);
}

function fighterBattle(state: GameState, f: TourneyFighter, power: number, roundNo: number, label: string, follow: string): BattleConfig {
  const rDef = TOURNAMENT_ROUNDS[Math.max(0, Math.min(7, roundNo - 1))];
  const name = getTournamentName(state.country);
  const disc = f.discipleId ? state.disciples.find((d) => d.id === f.discipleId) : undefined;
  const stats: Stats = disc
    ? { ...disc.stats }
    : {
        str: Math.round(16 + power * 22),
        agi: Math.round(16 + power * 21),
        vit: Math.round(16 + power * 22),
        wil: Math.round(16 + power * 22),
        ins: Math.round(16 + power * 23),
        qi: Math.round(16 + power * 22),
      };
  const level = Math.min(MASTERY_WALL_LEVEL, Math.max(2, Math.round(power * 2.7)));
  const skills = disc ? disc.skills.filter((s) => !s.isPassive).slice(0, 4).map((s) => ({ ...s, masteryLevel: Math.min(MASTERY_WALL_LEVEL, s.masteryLevel) })) : f.skills.map((sid) => buildMasterSkill(sid, level, roundNo >= 6));
  const prize = roundNo === 8 ? ALL_WEAPONS_CATALOG.find((w) => w.grade === 'TREASURE' && !state.weapons.some((ow) => ow.id === w.id)) : undefined;
  return {
    id: `tourney2_${follow.replace(/\|/g, '_')}_${state.year}`,
    title: `${name} · ${label}`,
    subtitle: `${f.sect}의 ${f.epithet ? `${f.epithet} ` : ''}${f.name}${f.titles > 0 ? ` — 우승 ${f.titles}회` : ''}${f.kind === 'DISCIPLE' ? ' — 나의 제자!' : f.kind === 'RIVAL' ? ' — 숙적!' : ''}`,
    isRealDuel: false,
    isTournament: true,
    tournamentRound: roundNo,
    tournamentName: name,
    enemyName: f.name,
    enemyTitle: f.sect,
    enemyAge: state.year - f.bornYear,
    enemyAi: f.ai,
    enemyHp: disc ? Math.round(110 + disc.stats.vit * 6) : Math.round(150 + power * 270),
    enemyStats: stats,
    enemyWeaponGroup: f.weapon,
    enemySkills: skills.length ? skills : [buildMasterSkill('base_h_slash', level)],
    rewardMoney: rDef.winMoney,
    rewardFame: rDef.winFame,
    rewardWeaponId: prize?.id,
    canUseDisciple: f.kind !== 'DISCIPLE',
    isRivalBattle: f.kind === 'RIVAL',
    eventFollowupId: follow,
  };
}

export function currentRoundMatches(t: TourneyState): TourneyMatch[] {
  return t.matches.filter((m) => m.round === t.round);
}

export function heroMatch(t: TourneyState): TourneyMatch | undefined {
  return currentRoundMatches(t).find((m) => !m.winner && (m.a === 'HERO' || m.b === 'HERO'));
}

export function startHeroMatch(state: GameState): GameState {
  const t = state.tourney;
  if (!t) return state;
  const m = heroMatch(t);
  if (!m) return state;
  const oppId = m.a === 'HERO' ? m.b : m.a;
  const f = fighterOf(t, oppId);
  if (!f) return state;
  return { ...state, pendingBattle: fighterBattle(state, f, t.powers[oppId] || 1.5, 5 + t.round, ROUND_LABEL[t.round], `tourney2|M|${m.id}`), phase: 'BATTLE' };
}

// NPC끼리의 경기를 관전한다. 결과는 실제 비무로 정해진다.
export function watchMatch(state: GameState, matchId: string): GameState {
  const t = state.tourney;
  const m = t?.matches.find((x) => x.id === matchId);
  if (!t || !m || m.winner || m.a === 'HERO' || m.b === 'HERO') return state;
  const fa = fighterOf(t, m.a);
  const fb = fighterOf(t, m.b);
  if (!fa || !fb) return state;
  const base = fighterBattle(state, fb, t.powers[fb.id] || 1.5, 5 + t.round, `${ROUND_LABEL[t.round]} 관전`, `tourney2|W|${m.id}`);
  const pa = t.powers[fa.id] || 1.5;
  const lvA = Math.min(MASTERY_WALL_LEVEL, Math.max(2, Math.round(pa * 2.7)));
  const disc = fa.discipleId ? state.disciples.find((d) => d.id === fa.discipleId) : undefined;
  return {
    ...state,
    phase: 'BATTLE',
    pendingBattle: {
      ...base,
      title: `[객석] ${t.name} · ${ROUND_LABEL[t.round]}`,
      subtitle: `${fighterName(t, fa.id, state.name)} vs ${fighterName(t, fb.id, state.name)}`,
      spectatorMode: true,
      canUseDisciple: false,
      rewardMoney: 0,
      rewardFame: 0,
      rewardWeaponId: undefined,
      isRivalBattle: false,
      spectatorLeft: {
        name: fa.name,
        sectName: fa.sect,
        age: state.year - fa.bornYear,
        hp: disc ? Math.round(110 + disc.stats.vit * 6) : Math.round(135 + pa * 255),
        stats: disc
          ? { ...disc.stats }
          : { str: Math.round(14 + pa * 21), agi: Math.round(14 + pa * 20), vit: Math.round(14 + pa * 21), wil: Math.round(14 + pa * 21), ins: Math.round(14 + pa * 22), qi: Math.round(14 + pa * 21) },
        skills: disc ? disc.skills.filter((s) => !s.isPassive).slice(0, 4) : fa.skills.map((sid) => buildMasterSkill(sid, lvA, t.round >= 1)),
        country: fa.country,
        gender: fa.gender,
      },
    },
  };
}

function decide(state: GameState, t: TourneyState, m: TourneyMatch, winner: string): TourneyState {
  const pa = t.powers[m.a] || 1;
  const pb = t.powers[m.b] || 1;
  const pWin = winner === m.a ? winProb(pa, pb) : winProb(pb, pa);
  const upset = pWin < 0.35;
  const loser = winner === m.a ? m.b : m.a;
  const wn = fighterName(t, winner, state.name);
  const ln = fighterName(t, loser, state.name);
  const news = [...t.news];
  if (upset) news.push(`☆ 이변! ${ROUND_LABEL[m.round]}에서 ${josa(wn, '이가')} ${josa(ln, '을를')} 꺾었다.`);
  const wf = fighterOf(t, winner);
  if (wf?.kind === 'DISCIPLE') news.push(`【${state.sectName}】의 제자 ${josa(wf.name, '이가')} ${ROUND_LABEL[m.round]}을 통과했다!`);
  const lf = fighterOf(t, loser);
  if (lf?.kind === 'DISCIPLE' && winner !== 'HERO') news.push(`제자 ${josa(lf.name, '이가')} ${ROUND_LABEL[m.round]}에서 ${wn}에게 졌다.`);
  return { ...t, matches: t.matches.map((x) => (x.id === m.id ? { ...x, winner, upset } : x)), news: news.slice(-14) };
}

// 이번 회전의 남은 NPC 경기를 강도와 운으로 판정한다. 주인공 경기는 직접 치러야 한다.
export function simulatePendingMatches(state: GameState): GameState {
  let t = state.tourney;
  if (!t || t.stage !== 'BRACKET') return state;
  currentRoundMatches(t)
    .filter((m) => !m.winner && m.a !== 'HERO' && m.b !== 'HERO')
    .forEach((m) => {
      const pa = (t!.powers[m.a] || 1) + (Math.random() - 0.5) * 0.25;
      const pb = (t!.powers[m.b] || 1) + (Math.random() - 0.5) * 0.25;
      const winner = Math.random() < winProb(pa, pb) ? m.a : m.b;
      t = decide(state, t!, m, winner);
    });
  return advanceIfDone({ ...state, tourney: t });
}

function advanceIfDone(state: GameState): GameState {
  const t = state.tourney;
  if (!t) return state;
  const ms = currentRoundMatches(t);
  if (ms.some((m) => !m.winner)) return state;
  if (t.round >= 3) return concludeTourney(state);
  const winners = ms.sort((a, b) => a.slot - b.slot).map((m) => m.winner!);
  const nextRound = t.round + 1;
  const heroStill = winners.includes('HERO');
  const nt: TourneyState = {
    ...t,
    round: nextRound,
    matches: [...t.matches, ...roundMatches(winners, nextRound)],
    heroBest: heroStill ? nextRound : t.heroBest,
    news: [...t.news, `── ${ROUND_LABEL[nextRound]} 대진: ${roundMatches(winners, nextRound).map((m) => `${fighterName(t, m.a, state.name)} vs ${fighterName(t, m.b, state.name)}`).join(' / ')}`].slice(-14),
  };
  return { ...state, tourney: nt };
}

// 주인공 경기의 결과 (applyBattleOutcome이 넘겨준다)
export function applyTourneyBattle(state: GameState, battle: BattleConfig, victory: boolean): GameState {
  const t = state.tourney;
  if (!t) return state;
  const [, kind, id] = (battle.eventFollowupId || '').split('|');
  if (kind === 'Q') {
    const k = Number(id);
    if (victory) {
      const wins = k + 1;
      const nt = { ...t, qualifierWins: wins, news: [...t.news, `${QUAL_LABEL[k]} 통과 — ${battle.enemyName}을(를) 꺾었다.`] };
      let next: GameState = { ...state, tourney: nt };
      if (wins >= 4) {
        next = buildMainDraw(next, true);
        return addLog(next, `🏆 예선 네 판을 모두 이기고 본선 16강에 올랐다!`, 'MAGIC');
      }
      return next;
    }
    // 예선 탈락 — 대진표는 그대로 진행되고 객석에서 본다
    let next: GameState = { ...state, tourney: { ...t, heroOut: true, heroBest: -1, news: [...t.news, `${QUAL_LABEL[k]}에서 ${battle.enemyName}에게 져 탈락했다. 남은 대회는 객석에서 지켜본다.`] } };
    next = buildMainDraw(next, false);
    return next;
  }
  const m = t.matches.find((x) => x.id === id);
  if (!m) return state;
  if (kind === 'W') {
    // 관전한 경기: 왼쪽(a)이 이기면 victory
    const nt = decide(state, { ...t, matches: t.matches.map((x) => (x.id === m.id ? { ...x, watched: true } : x)) }, m, victory ? m.a : m.b);
    return advanceIfDone({ ...state, tourney: nt });
  }
  // 주인공 경기
  const opp = m.a === 'HERO' ? m.b : m.a;
  let nt = decide(state, t, m, victory ? 'HERO' : opp);
  if (!victory) nt = { ...nt, heroOut: true };
  let next: GameState = { ...state, tourney: nt };
  const f = fighterOf(t, opp);
  if (f?.kind === 'DISCIPLE' && f.discipleId) {
    // 스승과 제자의 대결 — 누가 이기든 제자는 크게 배운다
    next = {
      ...next,
      disciples: next.disciples.map((d) => (d.id === f.discipleId ? { ...d, loyalty: Math.min(100, d.loyalty + (victory ? 6 : 12)) } : d)),
    };
    if (!victory) next = addLog({ ...next, fame: next.fame + 40 }, `청출어람! 제자 ${josa(f.name, '이가')} 천하대회 무대에서 스승을 꺾었다. 도장의 이름이 더 높아졌다. (명성 +40)`, 'MAGIC');
  }
  return advanceIfDone(next);
}

// 결승까지 끝났다
function concludeTourney(state: GameState): GameState {
  const t = state.tourney!;
  const final = t.matches.find((m) => m.round === 3)!;
  const champ = final.winner!;
  const runner = champ === final.a ? final.b : final.a;
  const champName = fighterName(t, champ, state.name);
  const champF = fighterOf(t, champ);
  let next: GameState = { ...state };
  const heroResult = champ === 'HERO' ? '우승' : t.heroBest >= 0 ? `${ROUND_LABEL[Math.min(3, t.heroBest)]}${t.heroBest === 3 ? ' 준우승' : ''}` : t.mode === 'WATCH' ? '관전' : '예선 탈락';
  // 명부에 기록
  next.tourneyRoster = (state.tourneyRoster || []).map((f) => {
    if (f.id === champ) return { ...f, titles: f.titles + 1, bestRound: 4, epithet: f.epithet || '천하제일' };
    const reached = t.matches.filter((m) => m.a === f.id || m.b === f.id).reduce((a, m) => Math.max(a, m.round), -1);
    return reached >= 0 ? { ...f, bestRound: Math.max(f.bestRound ?? -1, reached) } : f;
  });
  const rec = { year: t.year, champion: champ === 'HERO' ? state.name : champF?.name || champName, championSect: champ === 'HERO' ? state.sectName : champF?.sect || '', runnerUp: fighterName(t, runner, state.name), heroResult };
  next.flags = { ...next.flags, tourneyHistory: [...(next.flags.tourneyHistory || []), rec] };
  if (champ === 'HERO') {
    const adj = evaluateTournamentFameAdjustment(state.fame, 8, true);
    next.fame = Math.max(0, next.fame + adj.bonusFame);
    next.flags = { ...next.flags, tournamentWins: (next.flags.tournamentWins || 0) + 1 };
    next.reputation = { ...next.reputation, virtue: next.reputation.virtue + 18, commerce: next.reputation.commerce + 12 };
    next = addLog(next, `🏆 ★ 천하제패!! 【${state.sectName}】의 ${josa(state.name, '이가')} ${t.name}을 제패했다! ${adj.summaryLine}`, 'MAGIC');
  } else if (champF?.kind === 'DISCIPLE') {
    next.fame += 120;
    next.flags = { ...next.flags, tournamentWins: (next.flags.tournamentWins || 0) + 1 };
    next.disciples = next.disciples.map((d) => (d.id === champF.discipleId ? { ...d, loyalty: Math.min(100, d.loyalty + 15) } : d));
    next = addLog(next, `🏆 ★ 【${state.sectName}】의 제자 ${josa(champF.name, '이가')} 천하제일에 올랐다! 도장의 이름이 천하에 울려 퍼진다. (명성 +120)`, 'MAGIC');
  } else if (champF?.kind === 'RIVAL') {
    next.rival = { ...next.rival, friendship: next.rival.friendship - 3 };
    next = addLog(next, `숙적 ${josa(champF.name, '이가')} 천하제일의 자리에 올랐다. ${heroResult === '관전' ? '' : `(나의 성적: ${heroResult})`}`, 'RUMOR');
  } else {
    next = addLog(next, `${t.name} 우승은 ${champF?.sect || ''}의 ${champName}. (나의 성적: ${heroResult})`, 'RUMOR');
  }
  return { ...next, tourney: { ...t, stage: 'DONE', championId: champ, news: [...t.news, `🏆 우승 — ${champName}${champF ? ` (${champF.sect})` : ''}`].slice(-14) } };
}

// 대회를 닫고 도장으로 돌아간다. 객석에서 끝까지 본 사람은 고수들의 검리를 얻는다.
export function closeTourney(state: GameState): GameState {
  const t = state.tourney;
  if (!t) return state;
  let next: GameState = { ...state, tourney: null };
  const watched = t.matches.filter((m) => m.watched).length;
  if (t.heroOut) {
    const ins = 2 + Math.min(4, watched * 2);
    next = { ...next, stats: { ...next.stats, ins: next.stats.ins + ins, qi: next.stats.qi + Math.min(4, watched + 1) } };
    next = addLog(next, `객석에서 천하 고수들의 비무를 지켜보며 검리를 헤아렸다. (통찰 +${ins})`, 'NORMAL');
  }
  return next;
}

// 봇·테스트용: 화면 없이 대회를 끝까지 치른다
export function runTourneyHeadless(state: GameState, fight: (s: GameState) => GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.tourney && guard++ < 40 && s.phase !== 'ENDING') {
    if (s.phase === 'BATTLE' && s.pendingBattle) {
      s = fight(s);
      continue;
    }
    const t = s.tourney;
    if (t.stage === 'QUALIFIER') {
      s = { ...s, pendingBattle: qualifierBattle(s, t.qualifierWins), phase: 'BATTLE' };
      continue;
    }
    if (t.stage === 'DONE') {
      s = closeTourney(s);
      break;
    }
    if (heroMatch(t) && !t.heroOut) {
      s = startHeroMatch(s);
      continue;
    }
    s = simulatePendingMatches(s);
  }
  return s;
}

export function nextQualifier(state: GameState): GameState {
  const t = state.tourney;
  if (!t || t.stage !== 'QUALIFIER') return state;
  return { ...state, pendingBattle: qualifierBattle(state, t.qualifierWins), phase: 'BATTLE' };
}

