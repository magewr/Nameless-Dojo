import { GameState } from '../types/game';
import { getDifficultyConfig } from './difficulty';

// 무기 강화 비용 (난이도 지출 배수 반영)
export function getWeaponUpgradeCost(upgradeLevel: number, state?: Pick<GameState, 'difficulty'>): number {
  const base = 60 + upgradeLevel * 90 + upgradeLevel * upgradeLevel * 55;
  const mult = state ? getDifficultyConfig(state).expenseMult : 1.0;
  return Math.round(base * mult);
}

// 시설 증축 비용 (난이도 지출 배수 반영)
export function getFacilityUpgradeCost(baseCost: number, state?: Pick<GameState, 'difficulty'>): number {
  const mult = state ? getDifficultyConfig(state).expenseMult : 1.0;
  return Math.round(baseCost * mult);
}

// 상점·만물객 물가 (난이도 지출 배수 반영 — 지나친 체감 억제 위해 완만 적용)
export function getShopPrice(basePrice: number, state?: Pick<GameState, 'difficulty'>): number {
  const mult = state ? 1 + (getDifficultyConfig(state).expenseMult - 1) * 0.75 : 1.0;
  return Math.round(basePrice * mult);
}

// ★ 질병·열병·탕약 단일 진실 — 난이도에 따라 약값↑ & 탕약 실패율↑! ★
export function getFeverMedicineMeta(state: GameState): { cost: number; cureChance: number } {
  const diff = getDifficultyConfig(state);
  const cost = Math.round((70 + Math.min(220, state.fame * 0.16)) * diff.expenseMult);
  const clinicBonus = (state.facilities.clinic - 1) * 0.07;
  const vitBonus = Math.min(0.09, Math.floor(state.stats.vit / 10) * 0.015);
  const spouseBonus = state.spouse?.alive && state.spouse.bonusType === 'CLINIC' ? 0.08 : 0;
  const agePenalty = state.age >= 60 ? 0.14 : state.age >= 50 ? 0.07 : 0;
  const cureChance = Math.max(0.28, Math.min(0.9, 0.66 + clinicBonus + vitBonus + spouseBonus - agePenalty - diff.medicinePenalty));
  return { cost, cureChance };
}

export function getDiscipleIllnessMeta(state: GameState): { cost: number; payCureChance: number; careCureChance: number } {
  const diff = getDifficultyConfig(state);
  const cost = Math.round((85 + Math.min(240, state.fame * 0.18)) * diff.expenseMult);
  const clinicBonus = (state.facilities.clinic - 1) * 0.06;
  const spouseBonus = state.spouse?.alive && state.spouse.bonusType === 'CLINIC' ? 0.08 : 0;
  const payCureChance = Math.max(0.38, Math.min(0.91, 0.72 + clinicBonus + spouseBonus - diff.medicinePenalty));
  const careCureChance = Math.max(
    0.35,
    Math.min(0.82, 0.64 + (state.stats.qi >= 35 ? 0.08 : 0) + (state.facilities.clinic >= 3 ? 0.06 : 0) - diff.medicinePenalty * 0.8)
  );
  return { cost, payCureChance, careCureChance };
}

export function getPlagueMedicineMeta(state: GameState): { cost: number; cureChance: number } {
  const diff = getDifficultyConfig(state);
  const aliveCount = state.disciples.filter((d) => !d.dead).length;
  const cost = Math.round((130 + aliveCount * 22) * diff.expenseMult);
  const clinicBonus = (state.facilities.clinic - 1) * 0.07;
  const spouseBonus = state.spouse?.alive && state.spouse.bonusType === 'CLINIC' ? 0.1 : 0;
  const cureChance = Math.max(0.32, Math.min(0.91, 0.68 + clinicBonus + spouseBonus - diff.medicinePenalty));
  return { cost, cureChance };
}

export function getHerbPeddlerMeta(state: GameState): { cost: number; successChance: number } {
  const diff = getDifficultyConfig(state);
  const cost = Math.round((95 + Math.min(185, state.fame * 0.14)) * diff.expenseMult);
  const baseSuccess = state.facilities.clinic >= 3 || state.stats.ins >= 45 ? 0.9 : 0.78;
  const successChance = Math.max(0.55, baseSuccess - diff.medicinePenalty * 0.6);
  return { cost, successChance };
}

// 후반 문파 투자(금전 싱크) 비용
export function getDojoInvestmentCosts(state: GameState): { tonic: number; banquet: number; charity: number } {
  const diff = getDifficultyConfig(state);
  const aliveCount = state.disciples.filter((d) => !d.dead).length;
  return {
    tonic: Math.round((160 + Math.min(260, state.fame * 0.2)) * diff.expenseMult),
    banquet: Math.round((200 + aliveCount * 24) * diff.expenseMult),
    charity: Math.round((320 + Math.min(420, state.fame * 0.26)) * diff.expenseMult),
  };
}
