import { DifficultyId, GameState } from '../types/game';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  shortLabel: string;
  subtitle: string;
  badgeColor: string;
  // 경제
  incomeMult: number;
  expenseMult: number;
  debtInterestRate: number; // 연간 복리 이자율
  startDebt: number;
  // 전투 & 사망
  enemyScaleMult: number;
  realDuelDeathRate: number; // 진검결투 패배 시 즉사 확률 (나머지는 영구장애 생존)
  battleWearMult: number; // 전투 후 건강 마모 배수
  realDuelUpgradeChance: number; // 도장깨기/자객 등이 진검결투로 격상될 확률
  // 호위(ESCORT) 위험
  escortHeroHazardRate: number; // 계절 호위 활동 중 주인공 습격/중상 확률
  escortHeroDeathChance: number; // 습격 중 치명 급습으로 치명상/즉사 위험
  escortDiscipleCasualtyRate: number; // 계절 호위 동행 제자 부상/전사 확률
  escortPassiveDeathRate: number; // 매 계절 호위 파견 제자 1인당 전사 확률
  // 재해 · 역병 · 노화
  feverRate: number;
  discipleIllnessRate: number;
  disasterRate: number; // 자연재해·대역병·살수단 추가 발생률
  medicinePenalty: number; // 탕약 성공률 감소치
  agingWearMult: number; // 노화 건강 감소 배수
  // 문하생 기질 · 타 문파
  troubleDiscipleRate: number; // 새 문하생이 말썽꾼 기질일 확률
  schemerRate: number; // 말썽꾼 가운데 흑심을 품은 자의 비율
  troubleEventRate: number; // 계절마다 제자 말썽이 터질 기본 확률
  sectEventRate: number; // 계절마다 문파 사건이 벌어질 기본 확률
  sectHostility: number; // 타 문파의 기본 적의 (관계 초기값·목표값에서 뺀다)
  plotRate: number; // 흑심의 계절당 진척 (0이면 반란 없음)
  dramaGap: number; // 말썽·분쟁 이벤트 사이의 최소 간격 (턴)
  // 난이도 보상 (보람!)
  fameGainMult: number;
  expGainMult: number;
  summaryBullets: string[];
}

export const DIFFICULTY_CONFIGS: Record<DifficultyId, DifficultyConfig> = {
  EASY: {
    id: 'EASY',
    label: '쉬움 · 입문',
    shortLabel: '쉬움',
    subtitle: '기존 기본 밸런스 · 서사와 무공 창시를 쾌적하게 감상',
    badgeColor: 'text-emerald-300 border-emerald-500/60 bg-emerald-950/60',
    incomeMult: 1.0,
    expenseMult: 1.0,
    debtInterestRate: 0.2,
    startDebt: 20,
    enemyScaleMult: 1.0,
    realDuelDeathRate: 0.5,
    battleWearMult: 1.0,
    realDuelUpgradeChance: 0,
    escortHeroHazardRate: 0,
    escortHeroDeathChance: 0,
    escortDiscipleCasualtyRate: 0,
    escortPassiveDeathRate: 0,
    feverRate: 0.22,
    discipleIllnessRate: 0.16,
    disasterRate: 0,
    medicinePenalty: 0,
    agingWearMult: 1.0,
    troubleDiscipleRate: 0.12,
    schemerRate: 0,
    troubleEventRate: 0.07,
    sectEventRate: 0.12,
    sectHostility: 0,
    plotRate: 0,
    dramaGap: 5,
    fameGainMult: 1.0,
    expGainMult: 1.0,
    summaryBullets: [
      '표준 경제 · 탕약 성공률 · 전투 난이도',
      '호위 중 사고 없음 · 문하생 대부분 올곧음 · 타 문파도 온건',
      '1회 완주 시 【지옥】 난이도 해금',
    ],
  },
  HARD: {
    id: 'HARD',
    label: '어려움 · 험난한 강호',
    shortLabel: '어려움',
    subtitle: '잦은 진검승부 · 역병 · 자연재해 · 호위 중 사상자 발생',
    badgeColor: 'text-amber-300 border-amber-500/70 bg-amber-950/60',
    incomeMult: 0.66,
    expenseMult: 1.42,
    debtInterestRate: 0.35,
    startDebt: 38,
    enemyScaleMult: 1.25,
    realDuelDeathRate: 0.72,
    battleWearMult: 1.5,
    realDuelUpgradeChance: 0.52,
    escortHeroHazardRate: 0.25,
    escortHeroDeathChance: 0.2,
    escortDiscipleCasualtyRate: 0.16,
    escortPassiveDeathRate: 0.042,
    feverRate: 0.355,
    discipleIllnessRate: 0.25,
    disasterRate: 0.265,
    medicinePenalty: 0.18,
    agingWearMult: 1.24,
    troubleDiscipleRate: 0.4,
    schemerRate: 0.18,
    troubleEventRate: 0.19,
    sectEventRate: 0.18,
    sectHostility: 14,
    plotRate: 4,
    dramaGap: 3,
    fameGainMult: 1.25,
    expGainMult: 1.12,
    summaryBullets: [
      '수입 -34% · 유지비/약값/증축비 +42% · 빚 이자 35%',
      '호위 중 주인공·문하생 중상 및 전사 위험',
      '진검승부·자연재해·대역병 빈번 · 탕약 실패율↑',
      '말썽꾼 문하생 다수 · 타 문파와의 시비·습격 · 흑심 품은 제자',
      '보상: 명성 +25% · 수련 +12% · 절처봉생 각성',
    ],
  },
  HELL: {
    id: 'HELL',
    label: '지옥 · 수라의 시대',
    shortLabel: '지옥',
    subtitle: '살아남는 것 자체가 목표인 극한의 1750년 생존 모드',
    badgeColor: 'text-rose-300 border-rose-500/80 bg-rose-950/70',
    incomeMult: 0.56,
    expenseMult: 1.58,
    debtInterestRate: 0.45,
    startDebt: 55,
    enemyScaleMult: 1.34,
    realDuelDeathRate: 0.84,
    battleWearMult: 1.75,
    realDuelUpgradeChance: 0.72,
    escortHeroHazardRate: 0.34,
    escortHeroDeathChance: 0.26,
    escortDiscipleCasualtyRate: 0.24,
    escortPassiveDeathRate: 0.068,
    feverRate: 0.435,
    discipleIllnessRate: 0.27,
    disasterRate: 0.335,
    medicinePenalty: 0.24,
    agingWearMult: 1.38,
    troubleDiscipleRate: 0.58,
    schemerRate: 0.26,
    troubleEventRate: 0.27,
    sectEventRate: 0.24,
    sectHostility: 28,
    plotRate: 6,
    dramaGap: 2,
    fameGainMult: 1.5,
    expGainMult: 1.22,
    summaryBullets: [
      '수입 -44% · 지출 +58% · 빚 이자 45% 극한 압박',
      '대부분의 습격이 진검승부(패배 시 84% 즉사)',
      '매 계절 재해·역병·호위 전사 속출 · 탕약 실패율 대폭↑',
      '문하생 절반이 말썽꾼 · 적대 문파의 습격 · 제자의 반란',
      '보상: 명성 +50% · 수련 +22% · 지옥 전용 업적·인장',
    ],
  },
};

export function getDifficultyId(state?: Pick<GameState, 'difficulty'> | null): DifficultyId {
  return state?.difficulty || 'EASY';
}

export function getDifficultyConfig(state?: Pick<GameState, 'difficulty'> | null): DifficultyConfig {
  return DIFFICULTY_CONFIGS[getDifficultyId(state)];
}
