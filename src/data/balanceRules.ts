import { GameState } from '../types/game';

// 무기 강화 비용 (Lv.0→+1: 60 / +2: 205 / +3: 460 / +4: 825 / +5: 1,300)
export function getWeaponUpgradeCost(upgradeLevel: number): number {
  return 60 + upgradeLevel * 90 + upgradeLevel * upgradeLevel * 55;
}

// ★ 질병·열병·탕약 단일 진실 — 1750년대 탕약은 만병통치약이 아니며 실패·악화 위험 존재! ★
export function getFeverMedicineMeta(state: GameState): { cost: number; cureChance: number } {
  const cost = Math.round(70 + Math.min(220, state.fame * 0.16));
  const clinicBonus = (state.facilities.clinic - 1) * 0.07;
  const vitBonus = Math.min(0.09, Math.floor(state.stats.vit / 10) * 0.015);
  const spouseBonus = state.spouse?.alive && state.spouse.bonusType === 'CLINIC' ? 0.08 : 0;
  const agePenalty = state.age >= 60 ? 0.14 : state.age >= 50 ? 0.07 : 0;
  const cureChance = Math.max(0.42, Math.min(0.9, 0.66 + clinicBonus + vitBonus + spouseBonus - agePenalty));
  return { cost, cureChance };
}

export function getDiscipleIllnessMeta(state: GameState): { cost: number; payCureChance: number; careCureChance: number } {
  const cost = Math.round(85 + Math.min(240, state.fame * 0.18));
  const clinicBonus = (state.facilities.clinic - 1) * 0.06;
  const spouseBonus = state.spouse?.alive && state.spouse.bonusType === 'CLINIC' ? 0.08 : 0;
  const payCureChance = Math.max(0.55, Math.min(0.91, 0.72 + clinicBonus + spouseBonus));
  const careCureChance = Math.max(
    0.5,
    Math.min(0.82, 0.64 + (state.stats.qi >= 35 ? 0.08 : 0) + (state.facilities.clinic >= 3 ? 0.06 : 0))
  );
  return { cost, payCureChance, careCureChance };
}

export function getPlagueMedicineMeta(state: GameState): { cost: number; cureChance: number } {
  const aliveCount = state.disciples.filter((d) => !d.dead).length;
  const cost = 130 + aliveCount * 22;
  const clinicBonus = (state.facilities.clinic - 1) * 0.07;
  const spouseBonus = state.spouse?.alive && state.spouse.bonusType === 'CLINIC' ? 0.1 : 0;
  const cureChance = Math.max(0.5, Math.min(0.91, 0.68 + clinicBonus + spouseBonus));
  return { cost, cureChance };
}

export function getHerbPeddlerMeta(state: GameState): { cost: number; successChance: number } {
  const cost = Math.round(95 + Math.min(185, state.fame * 0.14));
  const successChance = state.facilities.clinic >= 3 || state.stats.ins >= 45 ? 0.9 : 0.78;
  return { cost, successChance };
}

// 후반 문파 투자(금전 싱크) 비용
export function getDojoInvestmentCosts(state: GameState): { tonic: number; banquet: number; charity: number } {
  const aliveCount = state.disciples.filter((d) => !d.dead).length;
  return {
    tonic: Math.round(160 + Math.min(260, state.fame * 0.2)),
    banquet: Math.round(200 + aliveCount * 24),
    charity: Math.round(320 + Math.min(420, state.fame * 0.26)),
  };
}
