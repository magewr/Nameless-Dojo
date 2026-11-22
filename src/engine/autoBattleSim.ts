import {
  BattleConfig,
  BattleTactic,
  Disciple,
  GameState,
  Skill,
  Stats,
} from '../types/game';
import { BattleOutcomePayload } from './gameLogic';

// 완전 자동전투(Full Auto-Battle) 고속 시뮬레이터 — UI 관전 '결과 즉시 보기'와 몬테카를로 테스트봇이 100% 동일 공식 사용!
export function simulateAutoBattleQuick(
  state: GameState,
  battle: BattleConfig,
  fighterType: 'HERO' | 'DISCIPLE',
  tactic: BattleTactic,
  discipleId?: string
): BattleOutcomePayload {
  let pStats: Stats;
  let pSkills: Skill[];
  let pPassives: string[];
  let pAge: number;
  let hasMindEye = false;
  let hasOneArmSaint = false;

  if (fighterType === 'DISCIPLE' && discipleId) {
    const d = state.disciples.find((x) => x.id === discipleId) as Disciple;
    pStats = { ...d.stats };
    pSkills = d.skills.filter((s) => !s.isPassive).slice(0, 5);
    pPassives = d.skills.filter((s) => s.isPassive).map((s) => s.id);
    pAge = d.age;
  } else {
    pStats = { ...state.stats };
    if (state.disabilities.includes('ONE_ARM')) pStats.str = Math.round(pStats.str * 0.8);
    if (state.disabilities.includes('LIMP')) pStats.agi = Math.round(pStats.agi * 0.75);
    pSkills = state.equippedActiveIds
      .map((id) => state.skills.find((s) => s.id === id))
      .filter((s): s is Skill => !!s);
    if (pSkills.length === 0) pSkills = state.skills.slice(0, 2);
    pPassives = state.equippedPassiveIds;
    pAge = state.age;
    hasMindEye = state.awakenings.includes('MIND_EYE');
    hasOneArmSaint = state.awakenings.includes('ONE_ARM_SAINT');
  }

  const weapon = state.weapons.find((w) => w.id === state.equippedWeaponId);
  const wAtk = weapon ? weapon.attack + weapon.upgradeLevel * 4 : 12;

  // 장착 중인 운기 심법(패시브)의 각인 보너스 합산!
  const passiveSkills = state.equippedPassiveIds
    .map((id) => state.skills.find((s) => s.id === id))
    .filter((s): s is Skill => Boolean(s));
  const pBonus = passiveSkills.reduce(
    (acc, ps) => {
      ps.imprintedTraits.forEach((tr) => {
        acc.qiRegen += tr.effect.passiveQiRegenBonus || 0;
        acc.dmgReduce += tr.effect.passiveDamageReduce || 0;
        acc.allDmg += tr.effect.passiveAllDamageBonus || 0;
        acc.parry += tr.effect.passiveParryBonus || 0;
        acc.maxHp += tr.effect.passiveMaxHpBonus || 0;
      });
      return acc;
    },
    { qiRegen: 0, dmgReduce: 0, allDmg: 0, parry: 0, maxHp: 0 }
  );

  let pHp = Math.round((110 + pStats.vit * 6) * (1 + Math.min(0.5, pBonus.maxHp)));
  const pMaxHp = pHp;
  let pQi = Math.round((45 + pStats.wil * 2 + pStats.qi * 1.5) * (1 + Math.min(0.4, pBonus.qiRegen * 0.4)));
  const pMaxQi = pQi;
  let eHp = battle.enemyHp;
  let eQi = 100;

  // 노년기 통찰(INS) + 다중 카운터(PARRY) 초식·숙련도·각인 기반 자동 저스트 간파(看破) 확률!
  const pParrySkills = pSkills.filter((s) => s.form === 'PARRY' || s.imprintedTraits.some((t) => Boolean(t.effect.counterMult) || Boolean(t.effect.parryWindowBonus)));
  const eParrySkills = battle.enemySkills.filter((s) => s.form === 'PARRY');
  const pParryCount = pParrySkills.length;
  const eParryCount = eParrySkills.length;
  const pBestParryLv = pParryCount > 0 ? Math.max(...pParrySkills.map((s) => s.masteryLevel || 1)) : 0;
  const eBestParryLv = eParryCount > 0 ? Math.max(...eParrySkills.map((s) => s.masteryLevel || 1)) : 0;
  const pParrySkillBonus = pParryCount >= 3 ? 0.22 : pParryCount === 2 ? 0.16 : pParryCount === 1 ? 0.1 : 0;
  const eParrySkillBonus = eParryCount >= 2 ? 0.16 : eParryCount === 1 ? 0.1 : 0;
  const parryTraitBonus = Math.min(
    0.14,
    pParrySkills.reduce(
      (acc, s) => acc + s.imprintedTraits.reduce((a, t) => a + (t.effect.parryWindowBonus ? 0.06 : t.effect.counterMult ? 0.03 : 0), 0),
      0
    )
  );
  const tacticParryBonus = tactic === 'COUNTER' ? 0.14 : tactic === 'AGGRESSIVE' ? -0.05 : 0;
  const tacticAtkBonus = tactic === 'AGGRESSIVE' ? 1.12 : tactic === 'COUNTER' ? 0.92 : 1.0;
  const pStatGap = (pStats.ins - battle.enemyStats.ins) * 0.0032;
  const eStatGap = (battle.enemyStats.ins - pStats.ins) * 0.0032;
  const pParryBase = Math.max(
    0.05,
    Math.min(
      0.74,
      0.12 +
        pStats.ins * 0.0036 +
        pStatGap +
        tacticParryBonus +
        pParrySkillBonus +
        pBestParryLv * 0.014 +
        parryTraitBonus +
        pBonus.parry +
        (hasMindEye ? 0.18 : 0)
    )
  );
  const pDodgeChance = Math.max(0.05, Math.min(0.64, 0.1 + pStats.agi * 0.0048 + (pSkills.some((s) => s.form === 'STEP') ? 0.12 : 0)));
  const eParryBase = Math.max(
    0.05,
    Math.min(0.74, 0.08 + battle.enemyStats.ins * 0.0036 + eStatGap + eParrySkillBonus + eBestParryLv * 0.012)
  );

  // 가속 정교 연환 공방 판정 헬퍼 (AutoBattleView와 100% 동일 공식!)
  const calcChainParry = (defIsP: boolean, chain: number): number => {
    const defSt = defIsP ? pStats : battle.enemyStats;
    const atkSt = defIsP ? battle.enemyStats : pStats;
    const defParryBonus = defIsP ? pParrySkillBonus : eParrySkillBonus;
    const defBestLv = defIsP ? (pParryCount > 0 ? pBestParryLv : Math.max(1, Math.round(defSt.ins / 12))) : (eParryCount > 0 ? eBestParryLv : Math.max(1, Math.round(defSt.ins / 12)));
    const atkBestLv = defIsP ? (eParryCount > 0 ? eBestParryLv : Math.max(1, Math.round(atkSt.ins / 12))) : (pParryCount > 0 ? pBestParryLv : Math.max(1, Math.round(atkSt.ins / 12)));
    const clashMomentum = chain === 1 ? 0.28 : chain === 2 ? 0.14 : chain === 3 ? 0.0 : -(chain - 3) * 0.15;
    const precisionScale = 1 + (chain - 1) * 0.55;
    const insDiff = (defSt.ins - atkSt.ins) * 0.0035 * precisionScale;
    const agiDiff = chain >= 2 ? (defSt.agi - atkSt.agi) * 0.0022 * (chain - 1) : 0;
    const mindDiff = chain >= 4 ? (defSt.wil + defSt.qi - (atkSt.wil + atkSt.qi)) * 0.0018 * (chain - 3) : 0;
    const lvDiff = (defBestLv - atkBestLv) * 0.014 * precisionScale;
    const parryAdv = defParryBonus * (chain >= 2 ? 1.25 : 1.0);
    const extra = defIsP ? parryTraitBonus + pBonus.parry + (tactic === 'COUNTER' ? 0.08 : 0) + (hasMindEye ? 0.12 : 0) : 0;
    return Math.max(0.05, Math.min(0.84, 0.24 + defSt.ins * 0.0026 + clashMomentum + insDiff + agiDiff + mindDiff + lvDiff + parryAdv + extra));
  };

  let usedMagic = false;
  let usedForbidden = false;
  let justParries = 0;
  let recoilHealth = 0;
  let recoilLife = 0;
  let pCounterBuff = false;

  // 최대 35라운드 공방 시뮬레이션
  for (let round = 0; round < 35 && pHp > 0 && eHp > 0; round++) {
    pQi = Math.min(pMaxQi, pQi + (14 + pStats.wil * 0.25) * (1 + pBonus.qiRegen));
    eQi = Math.min(100, eQi + 16);

    // 1. 플레이어 공격
    const usableP = pSkills.filter((s) => s.qiCost <= pQi && s.power > 0);
    const pSk = usableP.length > 0 ? usableP[round % usableP.length] : pSkills[0];
    if (pSk) {
      pQi = Math.max(0, pQi - pSk.qiCost);
      if (pSk.origin.includes('FANTASY')) usedMagic = true;
      if (pSk.isForbidden) {
        usedForbidden = true;
        if (pSk.selfRecoil?.hpPercent) pHp = Math.max(1, pHp - Math.round(pMaxHp * pSk.selfRecoil.hpPercent));
        if (pSk.selfRecoil?.healthLoss) recoilHealth += pSk.selfRecoil.healthLoss;
        if (pSk.selfRecoil?.lifespanYears) recoilLife += pSk.selfRecoil.lifespanYears;
      }

      // 연환 반격 공방(Counter Chain) 판정: 반격기 자체도 재반격 가능하며 합이 쌓일수록 어려워짐!
      // 단, 방어불가 강공(RED/unblockable)은 패링 불가, 원거리/이계 비술은 패링 난이도 대폭 상승!
      const isUnblockable = pSk.telegraph === 'RED' || pSk.imprintedTraits.some((t) => t.effect.unblockable);
      const magicParryMult = pSk.form === 'PROJECTILE' || pSk.origin.includes('FANTASY') ? 0.35 : 1.0;
      let attackerIsP = true;
      let chain = 0;
      if (!isUnblockable && Math.random() < eParryBase * magicParryMult) {
        // 적이 간파 → 연환 반격 공방 시작!
        attackerIsP = false;
        chain = 1;
        while (chain < 8) {
          const nextChance = calcChainParry(!attackerIsP, chain);
          if (Math.random() < nextChance) {
            if (!attackerIsP) justParries += 1;
            attackerIsP = !attackerIsP;
            chain += 1;
          } else {
            break;
          }
        }
      }

      if (attackerIsP) {
        const aff = !weapon || pSk.weapon === 'ANY' || pSk.masteryLevel >= 8 ? 1.15 : weapon.group === pSk.weapon ? (weapon.elementAffinity === pSk.element ? 1.35 : 1.15) : 0.85;
        const base = pSk.power * (1 + pSk.masteryLevel * 0.13) * aff;
        const statAdd =
          pSk.element !== 'PHYSICAL'
            ? pStats.wil * 0.65 + pStats.qi * 1.05 + wAtk * 0.6
            : pStats.str * 0.75 + pStats.qi * 0.32 + wAtk * 0.85;
        let mult = Math.min(2.75, tacticAtkBonus * (1 + pBonus.allDmg) * (chain > 0 ? 1.32 + chain * 0.1 : pCounterBuff ? 1.45 : 1.0) * (hasOneArmSaint ? 1.25 : 1.0));
        if (pPassives.includes('sk_cn_09') && pSk.element === 'QI') mult *= 1.2;
        const rawDefReduce = Math.min(0.45, Math.max(0, (battle.enemyStats.vit + battle.enemyStats.qi - 55) * 0.0023));
        const eDefReduce = rawDefReduce * (pSk.element !== 'PHYSICAL' ? 0.6 : 1.0);
        const dmg = Math.max(8, Math.round((base + statAdd) * mult * (1 - eDefReduce) * 0.62));
        eHp = Math.max(0, eHp - dmg);
        pCounterBuff = false;
      } else {
        // 연환 공방에서 플레이어가 뚫려 적의 반격 피격!
        const eCounterSk = battle.enemySkills[round % battle.enemySkills.length];
        const eBase = (eCounterSk?.power || 24) * (1 + (eCounterSk?.masteryLevel || 1) * 0.14);
        const eAdd = battle.enemyStats.str * 0.78 + battle.enemyStats.qi * 0.35 + 14;
        const dmg = Math.max(7, Math.round((eBase + eAdd) * (1.12 + chain * 0.08) * 0.44));
        pHp = Math.max(0, pHp - dmg);
      }
    }
    if (eHp <= 0 || pHp <= 0) break;

    // 2. 적 공격 (플레이어 간파 시에도 적이 다시 재반격할 수 있음!)
    const eSk = battle.enemySkills[round % battle.enemySkills.length];
    if (eSk) {
      if (eSk.telegraph === 'RED' && Math.random() < pDodgeChance) {
        continue;
      }
      if (eSk.telegraph !== 'RED' && Math.random() < pParryBase) {
        justParries += 1;
        pQi = Math.min(pMaxQi, pQi + 18);
        // 플레이어 반격도 적이 재반격 가능!
        let attackerIsP = true;
        let chain = 1;
        while (chain < 8) {
          const nextChance = calcChainParry(!attackerIsP, chain);
          if (Math.random() < nextChance) {
            if (!attackerIsP) justParries += 1;
            attackerIsP = !attackerIsP;
            chain += 1;
          } else {
            break;
          }
        }
        if (attackerIsP) {
          pCounterBuff = true;
          const cSk = pSkills.find((s) => s.form === 'PARRY') || pSkills[0];
          const dmg = Math.max(10, Math.round(((cSk?.power || 25) * (1 + (cSk?.masteryLevel || 1) * 0.13) + pStats.str * 0.7 + wAtk * 0.8) * (1.35 + chain * 0.1) * 0.56));
          eHp = Math.max(0, eHp - dmg);
        } else {
          const eBase = eSk.power * (1 + eSk.masteryLevel * 0.14);
          const eAdd = battle.enemyStats.str * 0.78 + battle.enemyStats.qi * 0.35 + 14;
          pHp = Math.max(0, pHp - Math.max(7, Math.round((eBase + eAdd) * (1.2 + chain * 0.1) * 0.52)));
        }
        continue;
      }
      const eBase = eSk.power * (1 + eSk.masteryLevel * 0.14);
      const eAdd = battle.enemyStats.str * 0.78 + battle.enemyStats.qi * 0.35 + 14;
      const qiGuard = Math.min(0.48, Math.max(0, (pStats.vit + pStats.qi - 50) * 0.0022) + pBonus.dmgReduce);
      const dmgMult = (pPassives.includes('sk_cn_09') ? 0.85 : 1.0) * (1 - qiGuard);
      const eDmg = Math.max(7, Math.round((eBase + eAdd) * dmgMult * 0.60));
      pHp = Math.max(0, pHp - eDmg);
    }
  }

  // 시간 종료 시 남은 HP 비율로 판정
  const victory = eHp <= 0 || (pHp > 0 && pHp / pMaxHp >= eHp / battle.enemyHp);
  return {
    victory,
    fighterType,
    discipleId,
    usedMagic,
    usedForbidden,
    justParriesCount: justParries,
    recoilHealthLoss: recoilHealth,
    recoilLifespanYears: recoilLife,
    hpRemainingRatio: pHp / pMaxHp,
  };
}
