import { Stats } from '../types/game';

// ★ 목검 비무(比武)와 진검결투(眞劍決鬪)의 규칙 차이 — 관전 화면(AutoBattleView)과 결과 즉시 보기(autoBattleSim)가 함께 쓴다.
//
// 목검: 날이 없는 나무칼이라 한 대 한 대가 가볍다. 몸이 무너지기 전에 "졌다"를 인정하고 물러나는 것이 비무의 예법이라,
//       체력이 바닥나기 전에 항복(기권)으로 승부가 난다. 후유증은 멍과 타박상 정도.
// 진검: 쇠날은 한 번 제대로 들어가면 끝이다. 깨끗하게 들어간 일격이 치명상(致命傷)으로 이어질 수 있고,
//       물러설 곳이 없으니 항복도 없다. 이겨도 몸에 칼자국이 남는다.

/** 목검/진검 피해 배율 */
export const SPAR_DAMAGE_MULT = 0.55;
export const REAL_DAMAGE_MULT = 1.35;

export function bladeDamageMult(isRealDuel: boolean): number {
  return isRealDuel ? REAL_DAMAGE_MULT : SPAR_DAMAGE_MULT;
}

/**
 * 목검 비무에서 항복하는 체력 비율(30~40%). 정신력(WIL)이 굳셀수록 조금 더 오래 버틴다.
 * 진검결투에는 항복이 없다(0).
 */
export function yieldThreshold(stats: Stats, isRealDuel: boolean): number {
  if (isRealDuel) return 0;
  return Math.max(0.3, Math.min(0.4, 0.41 - stats.wil * 0.0011));
}

/**
 * 진검결투에서 막히지 않고 깨끗하게 들어간 일격이 치명상이 될 확률.
 * 통찰(INS)이 앞서면 조금 더 급소를 노리고, 반격(되받아 벤 칼)은 상대가 무방비라 더 위험하다.
 */
export function fatalBlowChance(atk: Stats, def: Stats, isRealDuel: boolean, isCounter: boolean): number {
  if (!isRealDuel) return 0;
  // 실력 차이는 조금만 반영한다 — 진검 앞에서는 고수도 한 번 방심하면 끝이다.
  const gap = (atk.ins - def.ins) * 0.0005;
  return Math.max(0.05, Math.min(0.15, 0.08 + gap + (isCounter ? 0.04 : 0)));
}

/** 치명상 한 칼이 앗아가는 체력. 최대 체력의 절반 안팎, 체질(VIT)이 좋으면 조금 덜 깊게 들어간다. */
export function fatalBlowDamage(defMaxHp: number, def: Stats): number {
  const depth = 0.5 + Math.random() * 0.25;
  const toughness = 1 - Math.min(0.22, def.vit * 0.0022);
  return Math.round(defMaxHp * depth * toughness);
}

export type DuelEnding = 'KO' | 'SURRENDER' | 'FATAL' | 'TIMEOUT';

/** 항복 판정: 체력이 기준 아래로 떨어진 쪽이 무릎을 꿇는다. 둘 다면 더 많이 깎인 쪽. */
export function checkSurrender(
  pHpRatio: number,
  eHpRatio: number,
  pThreshold: number,
  eThreshold: number
): 'P' | 'E' | null {
  const pYield = pThreshold > 0 && pHpRatio <= pThreshold;
  const eYield = eThreshold > 0 && eHpRatio <= eThreshold;
  if (pYield && eYield) return pHpRatio - pThreshold <= eHpRatio - eThreshold ? 'P' : 'E';
  if (pYield) return 'P';
  if (eYield) return 'E';
  return null;
}
