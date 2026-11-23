import { DifficultyId, Disciple, GameState, Temperament } from '../types/game';
import { DIFFICULTY_CONFIGS } from './difficulty';

// 문하생의 기질.
// 올곧은 기질은 돌봐 주는 만큼 충성이 오르지만, 말썽꾼 기질은 "바라는 것"이 채워지지 않으면
// 충성이 상한에 막혀 더 오르지 않고, 낮은 충성은 말썽 이벤트로 이어진다.

export interface TemperamentMeta {
  label: string;
  hanja: string;
  trouble: boolean;
  desc: string;
  wants: string; // 무엇을 주면 마음을 붙이는가
  risk: string; // 내버려 두면 무슨 일을 벌이는가
  badge: string; // tailwind 색 조합
}

export const TEMPERAMENTS: Record<Temperament, TemperamentMeta> = {
  UPRIGHT: {
    label: '강직',
    hanja: '剛直',
    trouble: false,
    desc: '옳다고 믿는 길을 굽히지 않는다. 스승이 바르면 끝까지 따른다.',
    wants: '스승의 인덕이 살기보다 높을 것',
    risk: '스승의 살기·이단이 짙어지면 실망한다',
    badge: 'text-emerald-200 border-emerald-500/70 bg-emerald-950/60',
  },
  DILIGENT: {
    label: '성실',
    hanja: '誠實',
    trouble: false,
    desc: '시키지 않아도 새벽 마당을 쓴다. 수련 성과가 남보다 빠르다.',
    wants: '꾸준한 지도',
    risk: '없음',
    badge: 'text-sky-200 border-sky-500/70 bg-sky-950/60',
  },
  GENTLE: {
    label: '온순',
    hanja: '溫順',
    trouble: false,
    desc: '싸움을 싫어하고 동문을 잘 챙긴다. 도장의 분위기를 누그러뜨린다.',
    wants: '피를 덜 보는 도장',
    risk: '스승의 살기가 짙어지면 겁을 먹는다',
    badge: 'text-teal-200 border-teal-500/70 bg-teal-950/60',
  },
  HOTBLOOD: {
    label: '다혈질',
    hanja: '多血',
    trouble: true,
    desc: '주먹이 말보다 먼저 나간다. 도장 이름이 걸리면 물불을 가리지 않는다.',
    wants: '현판을 지키는 스승, 싸울 기회(호위)',
    risk: '저잣거리에서 타 문파 문하생과 싸움을 벌인다',
    badge: 'text-orange-200 border-orange-500/70 bg-orange-950/60',
  },
  ARROGANT: {
    label: '오만',
    hanja: '傲慢',
    trouble: true,
    desc: '제 재주를 믿고 남을 낮춰 본다. 대접받지 못하면 금세 틀어진다.',
    wants: '직책(사범·후계자), 이름 높은 도장',
    risk: '후배와 마을 사람에게 행패를 부려 민심을 잃는다',
    badge: 'text-fuchsia-200 border-fuchsia-500/70 bg-fuchsia-950/60',
  },
  GREEDY: {
    label: '탐욕',
    hanja: '貪慾',
    trouble: true,
    desc: '무예보다 은자에 눈이 밝다. 돈이 도는 곳에 붙여 두면 쓸모가 있다.',
    wants: '돈벌이가 되는 일(호위), 넉넉한 도장 금고',
    risk: '금고에 손을 대거나 상인들에게 보호비를 뜯는다',
    badge: 'text-amber-200 border-amber-500/70 bg-amber-950/60',
  },
  LAZY: {
    label: '나태',
    hanja: '懶怠',
    trouble: true,
    desc: '재주는 있으나 땀 흘리기를 싫어한다. 수련 성과가 남보다 더디다.',
    wants: '편한 숙소, 덜 고된 수련',
    risk: '수련을 빼먹고 노름판에서 빚을 진다',
    badge: 'text-stone-200 border-stone-500/70 bg-stone-900/70',
  },
  SCHEMER: {
    label: '흑심',
    hanja: '黑心',
    trouble: true,
    desc: '겉으로는 누구보다 공손하나 속으로는 현판을 노린다.',
    wants: '후계자 자리 — 그것 말고는 무엇으로도 채워지지 않는다',
    risk: '불만 품은 동문을 모아 반란을 일으킨다',
    badge: 'text-rose-200 border-rose-500/80 bg-rose-950/70',
  },
};

const GOOD: Temperament[] = ['UPRIGHT', 'DILIGENT', 'GENTLE'];
const TROUBLE: Temperament[] = ['HOTBLOOD', 'ARROGANT', 'GREEDY', 'LAZY'];

// 출신에 따라 어느 쪽 말썽을 부리기 쉬운가
const ARCHETYPE_BIAS: Array<[RegExp, Temperament[]]> = [
  [/명문가|후예/, ['ARROGANT', 'ARROGANT', 'LAZY']],
  [/낭인|무사/, ['HOTBLOOD', 'HOTBLOOD', 'ARROGANT']],
  [/고아/, ['GREEDY', 'HOTBLOOD']],
  [/인부/, ['HOTBLOOD', 'LAZY', 'GREEDY']],
  [/학동/, ['LAZY', 'ARROGANT']],
  [/농부/, ['LAZY', 'HOTBLOOD']],
];

const pickFrom = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export function rollTemperament(
  difficulty: DifficultyId,
  archetype: string,
  opts?: { isChild?: boolean; isGenius?: boolean }
): Pick<Disciple, 'temperament' | 'mask' | 'plot' | 'temperamentKnown'> {
  const cfg = DIFFICULTY_CONFIGS[difficulty];
  // 친자녀는 흑심을 품지 않고, 말썽꾼일 확률도 절반이다.
  const troubleRate = cfg.troubleDiscipleRate * (opts?.isChild ? 0.5 : 1);
  if (Math.random() >= troubleRate) {
    return { temperament: pickFrom(GOOD), temperamentKnown: !!opts?.isChild };
  }
  // 천재는 야심이 커서 흑심을 품기 쉽다.
  if (!opts?.isChild && Math.random() < cfg.schemerRate * (opts?.isGenius ? 1.6 : 1)) {
    return { temperament: 'SCHEMER', mask: pickFrom(GOOD), plot: 0, temperamentKnown: false };
  }
  const bias = ARCHETYPE_BIAS.find(([re]) => re.test(archetype))?.[1];
  const temperament = bias && Math.random() < 0.65 ? pickFrom(bias) : pickFrom(TROUBLE);
  return { temperament, temperamentKnown: !!opts?.isChild };
}

// 스승의 눈에 보이는 기질. 흑심은 드러나기 전까지 가면을 쓴다.
export function shownTemperament(d: Disciple): Temperament | null {
  if (!d.temperament || !d.temperamentKnown) return null;
  if (d.temperament === 'SCHEMER' && !d.exposed) return d.mask || 'DILIGENT';
  return d.temperament;
}

export function isTroublemaker(d: Disciple): boolean {
  return !!d.temperament && TEMPERAMENTS[d.temperament].trouble;
}

export interface LoyaltyCeiling {
  cap: number;
  notes: Array<{ text: string; delta: number }>; // 상한을 올리고 내리는 사정
}

// 지금 형편에서 이 제자의 충성이 오를 수 있는 끝.
export function getLoyaltyCeiling(d: Disciple, state: GameState): LoyaltyCeiling {
  const rep = state.reputation;
  const notes: LoyaltyCeiling['notes'] = [];
  let cap = 100;
  const add = (delta: number, text: string) => {
    cap += delta;
    notes.push({ text, delta });
  };
  const hasPost = d.role === 'INSTRUCTOR' || d.role === 'HEIR';

  switch (d.temperament) {
    case 'UPRIGHT':
      if (rep.ruthless > rep.virtue + 20) add(-30, '스승의 살기가 인덕을 크게 넘어섰다');
      if (rep.arcane >= 60) add(-12, '이단의 소문이 짙다');
      break;
    case 'GENTLE':
      if (rep.ruthless >= 80) add(-25, '도장에 피 냄새가 짙다');
      break;
    case 'HOTBLOOD':
      add(-28, `타고난 기질 (${TEMPERAMENTS.HOTBLOOD.label})`);
      if (state.signboardStolen) add(-20, '현판을 빼앗긴 채다');
      if (d.role === 'ESCORT') add(16, '호위로 나가 싸울 기회가 있다');
      if (rep.ruthless >= 40) add(8, '스승의 칼이 매섭다');
      break;
    case 'ARROGANT':
      add(-42, `타고난 기질 (${TEMPERAMENTS.ARROGANT.label})`);
      if (hasPost) add(26, d.role === 'HEIR' ? '후계자로 대접받는다' : '사범으로 대접받는다');
      if (state.fame >= 600) add(12, '천하에 이름난 도장이다');
      else if (state.fame < 120) add(-8, '도장의 이름이 초라하다');
      break;
    case 'GREEDY':
      add(-40, `타고난 기질 (${TEMPERAMENTS.GREEDY.label})`);
      if (d.role === 'ESCORT') add(20, '호위 일로 제 몫을 챙긴다');
      if (state.money >= 400) add(12, '도장 금고가 넉넉하다');
      else if (state.money < 40) add(-12, '도장 금고가 비었다');
      if (state.debt > 0) add(-8, '도장이 빚을 지고 있다');
      break;
    case 'LAZY':
      add(-34, `타고난 기질 (${TEMPERAMENTS.LAZY.label})`);
      if (state.facilities.dorm >= 3) add(16, '숙소가 편안하다');
      else if (state.facilities.dorm >= 2) add(8, '숙소가 지낼 만하다');
      if (state.seasonPlan.activities.includes('TEACH')) add(-8, '수련이 고되다');
      break;
    case 'SCHEMER':
      // 드러나기 전에는 누구보다 충직해 보인다.
      if (d.exposed) {
        add(-60, '현판을 노리는 흑심');
        if (d.role === 'HEIR') add(45, '바라던 후계자 자리를 얻었다');
      }
      break;
    default:
      break;
  }

  // 야심이 큰데 서른이 되도록 직책이 없으면 어떤 기질이든 마음이 뜬다.
  if (d.ambition >= 60 && !hasPost && d.age >= 24 && d.temperament !== 'SCHEMER') add(-10, '야심에 비해 맡은 자리가 없다');

  return { cap: Math.max(20, Math.min(100, cap)), notes };
}

// 계절마다 수련 성과에 곱하는 값
export function getTrainingMult(d: Disciple): number {
  if (d.temperament === 'DILIGENT') return 1.18;
  if (d.temperament === 'LAZY') return 0.7;
  return 1;
}
