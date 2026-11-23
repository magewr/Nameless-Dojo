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

// 같은 값이면 앞에 오는 축이 이긴다.
const AXIS_ORDER: Array<{ axis: ChronicleAxis; key: keyof ReputationAxes }> = [
  { axis: 'VIRTUE', key: 'virtue' },
  { axis: 'ASCETIC', key: 'ascetic' },
  { axis: 'COMMERCE', key: 'commerce' },
  { axis: 'RUTHLESS', key: 'ruthless' },
  { axis: 'ARCANE', key: 'arcane' },
];

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
    state.fame >= 220 && alive.length >= 4 ? 'GRAND' : state.fame >= 90 && alive.length >= 1 ? 'MEDIUM' : 'SMALL';

  // 세평 축: 값이 높은 순. 마법을 쓴 적이 없으면 마도 축은 후보에서 뺀다.
  const ranked = AXIS_ORDER.filter((a) => a.axis !== 'ARCANE' || magic !== 'NONE')
    .map((a, i) => ({ axis: a.axis, val: rep[a.key], i }))
    .sort((a, b) => b.val - a.val || a.i - b.i);
  let axis = ranked[0].axis;
  // 이적을 공개하고 마도 세평이 뚜렷하면, 다른 축이 조금 더 높아도 세상은 그 유파를 마도로 기억한다.
  if (magic === 'PUBLIC' && rep.arcane >= 50) axis = 'ARCANE';
  const runnerUp = ranked.find((r) => r.axis !== axis);
  const topVal = ranked.find((r) => r.axis === axis)?.val || 0;
  const secondAxis = runnerUp && runnerUp.val >= 50 && runnerUp.val >= topVal * 0.6 ? runnerUp.axis : null;

  // 계승 상태
  const hasMutation = alive.some((d) => d.skills.some((s) => s.isMutated));
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

// 원인 표시용: 접두어가 맞는 가장 이른 생전 사건을 찾는다. 구버전 세이브처럼 기록이 없으면 null.
export function findMilestone(facts: LineageFacts, keyPrefix: string): LifeMilestone | null {
  return facts.milestones.find((m) => m.key.startsWith(keyPrefix)) || null;
}
