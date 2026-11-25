import {
  AwakeningType,
  CountryId,
  GameState,
  GraduatedDisciple,
  LifeMilestone,
  ReputationAxes,
  Skill,
  Spouse,
  Weapon,
} from '../types/game';
import { BOOK_SKILL_TEMPLATES } from './booksAndSkills';

// 사후 연대기의 재료. 한 일생(GameState)에서 "후대에 남을 사실"만 뽑아낸 요약이다.
// 연대기 생성기는 GameState를 직접 보지 않고 이 값만 본다.

export type ChronicleAxis = 'VIRTUE' | 'RUTHLESS' | 'COMMERCE' | 'ASCETIC' | 'ARCANE';
export type ScaleTier = 'SMALL' | 'MEDIUM' | 'GRAND';
// NONE: 배운 이가 아무도 없음 · SCATTERED: 후계 지명 없이 제자들이 흩어짐 · DEGRADED: 후계자가 극의를 잇지 못함
// INTACT: 온전히 계승 · FLOURISH: 계승 + 제자의 변이 초식으로 가지가 늘어남
export type SuccessionState = 'NONE' | 'SCATTERED' | 'DEGRADED' | 'INTACT' | 'FLOURISH';
export type MagicLevel = 'NONE' | 'HIDDEN' | 'PUBLIC';
export type DeathKind = 'NATURAL' | 'ILLNESS' | 'DUEL' | 'FORBIDDEN' | 'ESCORT' | 'DISASTER';

export const AXIS_LABEL: Record<ChronicleAxis, string> = {
  VIRTUE: '인덕',
  RUTHLESS: '살기',
  COMMERCE: '상무',
  ASCETIC: '구도',
  ARCANE: '마도',
};

export interface LineageFacts {
  country: CountryId;
  founder: string;
  sect: string;
  finalTitle: string;
  deathYear: number;
  deathAge: number;
  deathKind: DeathKind;
  seed: number;

  scale: ScaleTier;
  axis: ChronicleAxis;
  secondAxis: ChronicleAxis | null;
  magic: MagicLevel;
  isAltHistory: boolean; // 공개된 이적 + 대문파 + 마도 축 → 대체역사 루트
  succession: SuccessionState;
  isOneTrick: boolean;

  heir: { name: string; isChild: boolean } | null;
  aliveDiscipleCount: number;
  firstDiscipleName: string | null;

  skillName: string;
  skillLineage: string | null; // "횡베기 + 종베기"
  forbiddenSkillName: string | null;

  heirloom: Weapon | null; // 정식으로 가보 지정한 병기만
  carriedWeapon: Weapon | null; // 가보가 없을 때 마지막까지 쥐고 있던 병기

  rival: { name: string; met: boolean; farewell: 'DRINK' | 'DUEL' | 'NONE'; wins: number; losses: number };
  betrayer: GraduatedDisciple | null;
  grandmaster: GraduatedDisciple | null;
  mutator: { name: string; skillName: string } | null;
  fallenDisciple: string | null;
  fallenCount: number;

  spouse: Spouse | null;
  memory: Record<string, string>;
  tournamentWins: number;
  awakening: AwakeningType | null;
  forbiddenCasts: number;
  wroteManual: boolean;

  milestones: LifeMilestone[];
}

// 세평 축마다 쌓을 기회가 크게 다르다. 인덕은 올려 주는 선택지가 57곳(합계 873)인데 살기는 11곳(합계 180)뿐이라,
// 수치를 그대로 비교하면 거의 모든 일생이 인덕으로 끝난다. 그래서 "얻을 수 있는 양에 견주어 얼마나 쌓았는가"로 비교한다.
// opportunity = 인덕을 1로 둔 그 축의 획득 기회. 같은 점수면 앞에 오는 축이 이긴다.
//
// 2026-11 재보정 (scripts/endingBench.ts — 플레이 성향 6가지 × 90인생):
//   예전 값(구도 0.49 · 상무 0.27 · 살기 0.38 · 이단 0.16 + 술법 공개 시 이계 강제)으로는
//   무작위로 고르는 플레이어의 68%가 「산문의 등불」이었고, 인덕을 노려도 절반은 구도, 살기를 노려도 12%만 살기로 끝났다.
//   수련만 해도 구도가 저절로 쌓이는 데 비해 구도의 기회값이 너무 작았고(구도 과대평가),
//   살기는 선택으로 쌓을 기회가 적어 기회값이 너무 컸다(살기 과소평가).
//   함께 고친 것: 진검 승리의 자동 살기 +12→+4(무사수행은 0), 빚 독촉에 살기 없는 갚을 길, 술법 사용 이단 +12→+6.
//   지금 값에서: 무작위 플레이어 인덕 28% · 구도 24% · 상무 14% · 살기 17% · 이계 17%,
//   한 축을 노린 플레이어는 인덕 91% · 구도 86% · 상무 100% · 이계 86% · 살기 68%가 그 축의 엔딩을 받는다.
//   이벤트 보상이나 수련·호위의 세평 몫을 손보면 `npm run test:ending`으로 다시 확인한다.
const AXIS_ORDER: Array<{ axis: ChronicleAxis; key: keyof ReputationAxes; opportunity: number }> = [
  { axis: 'VIRTUE', key: 'virtue', opportunity: 1 },
  { axis: 'ASCETIC', key: 'ascetic', opportunity: 0.75 },
  { axis: 'COMMERCE', key: 'commerce', opportunity: 0.6 },
  { axis: 'RUTHLESS', key: 'ruthless', opportunity: 0.17 },
  { axis: 'ARCANE', key: 'arcane', opportunity: 0.45 },
];
// 보조 축으로 인정하는 최소 원점수. 한두 번의 선택으로 "겸비"가 붙지 않게 한다.
const SECOND_AXIS_MIN_RAW = 30;

// 규모 기준. 무사수행·천하대회 대진표·생성형 사건이 들어온 뒤 한 일생을 끝까지 산 도장의 사망 시 명성은
// 대개 3,500~5,600이다(플레이테스트 봇 330회 기준, 예전에는 2,500~3,700). 일찍 죽거나 지옥 난이도면 수백~1,500에 머문다.
const SCALE_GRAND = { fame: 4300, disciples: 12 };
const SCALE_MEDIUM = { fame: 700, disciples: 3 };
const FLOURISH_SHARE = 0.28;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 같은 일생이면 언제나 같은 값이 나오는 0~1 난수. Math.random을 쓰지 않아 엔딩을 다시 열어도 연대기가 바뀌지 않는다.
export function seededUnit(seed: number, salt: string): number {
  return (hashString(`${seed}:${salt}`) % 100000) / 100000;
}

function classifyDeath(cause: string | null): DeathKind {
  const c = cause || '';
  if (c.includes('진검결투')) return 'DUEL';
  if (c.includes('주화입마')) return 'FORBIDDEN';
  if (c.includes('호위')) return 'ESCORT';
  if (c.includes('천재지변')) return 'DISASTER';
  if (c.includes('천수')) return 'NATURAL';
  return c ? 'ILLNESS' : 'NATURAL';
}

function pickTopSkill(skills: Skill[]): Skill | undefined {
  return [...skills].sort((a, b) => b.masteryLevel - a.masteryLevel || b.power - a.power)[0];
}

function strongest(list: GraduatedDisciple[], fate: GraduatedDisciple['fate']): GraduatedDisciple | null {
  return list.filter((g) => g.fate === fate).sort((a, b) => b.powerScore - a.powerScore)[0] || null;
}

export function extractLineageFacts(state: GameState): LineageFacts {
  const alive = state.disciples.filter((d) => !d.dead);
  const fallen = state.disciples.filter((d) => d.dead);
  const graduates = state.graduatedDisciples || [];
  const heirD = alive.find((d) => d.role === 'HEIR') || null;
  const topSkill = pickTopSkill(state.skills);
  const rep = state.reputation;

  // 마법: 사람들 앞에서 드러냈으면 PUBLIC, 익히기만 했거나 몰래 썼으면 HIDDEN
  const knowsMagic = state.skills.some((s) => s.origin.includes('FANTASY') && s.masteryLevel >= 3);
  const magic: MagicLevel = state.flags.usedMagicPublicly ? 'PUBLIC' : knowsMagic || state.flags.magicCastCount > 0 ? 'HIDDEN' : 'NONE';

  // 규모
  const scale: ScaleTier =
    state.fame >= SCALE_GRAND.fame && alive.length >= SCALE_GRAND.disciples
      ? 'GRAND'
      : state.fame >= SCALE_MEDIUM.fame && alive.length >= SCALE_MEDIUM.disciples
      ? 'MEDIUM'
      : 'SMALL';

  // 세평 축: 획득 기회로 보정한 점수가 높은 순. 마법을 쓴 적이 없으면 마도 축은 후보에서 뺀다.
  const ranked = AXIS_ORDER.filter((a) => a.axis !== 'ARCANE' || magic !== 'NONE')
    .map((a, i) => ({ axis: a.axis, raw: rep[a.key], val: rep[a.key] / a.opportunity, i }))
    .sort((a, b) => b.val - a.val || a.i - b.i);
  // 예전에는 술법을 한 번 드러내고 이단 50만 넘으면 무조건 이계로 기억했다. 술법을 배울 길이 넓어진 지금은
  // 그 규칙이 다른 모든 길을 삼킨다 — 이계도 다른 축과 같은 잣대로 겨룬다.
  const axis = ranked[0].axis;
  const runnerUp = ranked.find((r) => r.axis !== axis);
  const topVal = ranked.find((r) => r.axis === axis)?.val || 0;
  const secondAxis = runnerUp && runnerUp.raw >= SECOND_AXIS_MIN_RAW && runnerUp.val >= topVal * 0.6 ? runnerUp.axis : null;

  // 계승 상태
  // 청출어람: 변이 초식을 낸 제자가 한둘이 아니라 문하의 큰 줄기를 이룰 때만 (3명 이상이면서 생존 제자의 28% 이상)
  const mutatorCount = alive.filter((d) => d.skills.some((s) => s.isMutated)).length;
  const hasMutation = mutatorCount >= 3 && mutatorCount >= alive.length * FLOURISH_SHARE;
  const loyalGraduates = graduates.filter((g) => g.fate !== 'RIVAL_BETRAYER');
  let succession: SuccessionState;
  if (heirD) {
    succession = heirD.skills.some((s) => s.isDegraded) ? 'DEGRADED' : hasMutation ? 'FLOURISH' : 'INTACT';
  } else if (alive.length > 0 || loyalGraduates.length > 0) {
    succession = 'SCATTERED';
  } else {
    succession = 'NONE';
  }

  // 외길: 달인 이상(Lv.6+)에 오른 초식이 단 하나뿐이고 그것이 Lv.8 이상
  const highSkills = state.skills.filter((s) => s.masteryLevel >= 6);
  const isOneTrick = !!topSkill && topSkill.masteryLevel >= 8 && highSkills.length === 1;

  const mutatorD = alive.find((d) => d.skills.some((s) => s.isMutated));
  const mutatedSkill = mutatorD?.skills.find((s) => s.isMutated);
  const forbidden = state.skills.find((s) => s.isForbidden);

  const skillLineage = topSkill?.parents
    ? topSkill.parents
        .map((pid) => {
          const own = state.skills.find((x) => x.id === pid);
          return own?.customName || own?.name || BOOK_SKILL_TEMPLATES[pid]?.name || null;
        })
        .filter(Boolean)
        .join(' + ') || null
    : null;

  const firstDisciple = [...state.disciples].filter((d) => !d.isChild).sort((a, b) => a.joinedYear - b.joinedYear)[0];

  return {
    country: state.country,
    founder: state.name,
    sect: state.sectName,
    finalTitle: state.currentTitle,
    deathYear: state.year,
    deathAge: state.age,
    deathKind: classifyDeath(state.deathCause),
    seed: hashString(`${state.name}|${state.sectName}|${state.year}|${state.turn}|${state.fame}`),

    scale,
    axis,
    secondAxis,
    magic,
    isAltHistory: axis === 'ARCANE' && magic === 'PUBLIC' && scale === 'GRAND',
    succession,
    isOneTrick,

    heir: heirD ? { name: heirD.name, isChild: !!heirD.isChild } : null,
    aliveDiscipleCount: alive.length,
    firstDiscipleName: firstDisciple?.name || null,

    skillName: topSkill?.customName || topSkill?.name || '횡베기',
    skillLineage,
    forbiddenSkillName: forbidden ? forbidden.customName || forbidden.name : null,

    heirloom: state.weapons.find((w) => w.isHeirloom) || null,
    carriedWeapon: state.weapons.find((w) => w.id === state.equippedWeaponId) || null,

    rival: {
      name: state.rival.name,
      met: state.rival.act >= 1,
      farewell: state.rival.lastFarewellType || 'NONE',
      wins: state.rival.lossesAgainstPlayer,
      losses: state.rival.winsAgainstPlayer,
    },
    betrayer: strongest(graduates, 'RIVAL_BETRAYER'),
    grandmaster: strongest(graduates, 'GRANDMASTER'),
    mutator: mutatorD && mutatedSkill ? { name: mutatorD.name, skillName: mutatedSkill.customName || mutatedSkill.name } : null,
    fallenDisciple: fallen[0]?.name || null,
    fallenCount: fallen.length,

    spouse: state.spouse,
    memory: state.flags.storyMemory || {},
    tournamentWins: state.flags.tournamentWins || 0,
    awakening: state.awakenings[0] || null,
    forbiddenCasts: state.flags.forbiddenCastCount || 0,
    wroteManual: !!state.flags.wroteManual,

    milestones: state.milestones || [],
  };
}

// 원인 표시용: 접두어가 맞는 생전 사건을 찾는다. 기본은 가장 이른 것, latest면 가장 나중 것.
// 구버전 세이브처럼 기록이 없으면 null.
export function findMilestone(facts: LineageFacts, keyPrefix: string, latest = false): LifeMilestone | null {
  const matches = facts.milestones.filter((m) => m.key.startsWith(keyPrefix));
  return (latest ? matches[matches.length - 1] : matches[0]) || null;
}
