import React, { useEffect, useRef, useState } from 'react';
import { BattleConfig, Disciple, GameState, Skill, Stats, Weapon } from '../types/game';
import { BattleOutcomePayload } from '../engine/gameLogic';
import { sound } from '../engine/sound';
import { ELEMENT_LABEL, FORM_LABEL, MASTERY_NAMES } from '../data/booksAndSkills';
import { getSpriteSheet, loadRawImage, preloadAllGameArt } from '../pixel/spriteLoader';
import { PixelPortrait } from './PixelPortrait';
import { Shield, Wind, Skull, Play, User, Users, Sparkles, CheckCircle2, Flame, Snowflake, Zap, Swords } from 'lucide-react';

interface Props {
  state: GameState;
  battle: BattleConfig;
  onFinish: (outcome: BattleOutcomePayload) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  scale?: number;
}

interface SlashArc {
  x: number;
  y: number;
  facing: number;
  color: string;
  life: number;
  maxLife: number;
  heavy: boolean;
}

interface FighterRuntime {
  name: string;
  age: number;
  x: number;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  posture: number;
  maxPosture: number;
  stats: Stats;
  weapon?: Weapon;
  skills: Skill[];
  passives: string[];
  cooldowns: Record<string, number>;
  dodgeCd: number;
  blocking: boolean;
  blockStartAt: number;
  invulnUntil: number;
  stunUntil: number;
  groggyUntil: number;
  hurtFlashUntil: number;
  lungeOffset: number;
  counterBuffUntil: number;
  shieldHp: number;
  burnUntil: number;
  slowUntil: number;
  action: null | {
    skill: Skill;
    startAt: number;
    windupMs: number;
    recoveryMs: number;
    hitDone: boolean;
  };
  oneArm?: boolean;
  blind?: boolean;
  limp?: boolean;
  hasMindEye?: boolean;
  hasOneArmSaint?: boolean;
  hasImmovable?: boolean;
}

// 4단계 인터랙티브 실전 전투 튜토리얼!
// 1: 전진 이동 → 2: 횡베기 명중 → 3: 황색 전조 저스트 간파 → 4: 적색 전조 구르기 회피 → 0: 자유 실전
type TutorialStep = 0 | 1 | 2 | 3 | 4;

const TUTORIAL_INFO: Record<Exclude<TutorialStep, 0>, { title: string; guide: string; highlight: 'MOVE' | 'ATTACK' | 'BLOCK' | 'DODGE' }> = {
  1: { title: '튜토리얼 1/4 · 거리 재기', guide: '먼저 [전진 (D)]을 눌러 왈패 가까이 다가가세요!', highlight: 'MOVE' },
  2: { title: '튜토리얼 2/4 · 초식 타격', guide: '사거리 안에 들어왔습니다! [1] 횡베기를 눌러 첫 타격을 먹이세요!', highlight: 'ATTACK' },
  3: { title: '튜토리얼 3/4 · 저스트 간파(看破)', guide: '적이 황색 전조로 공격합니다! 게이지가 끝날 때 [막기 (Shift)]를 눌러 간파하세요!', highlight: 'BLOCK' },
  4: { title: '튜토리얼 4/4 · 적색 강공 회피', guide: '적색 전조는 막을 수 없습니다! [구르기 (Space)]로 완벽하게 피하세요!', highlight: 'DODGE' },
};

const CANVAS_W = 900;
const CANVAS_H = 420;

export const RealtimeBattle: React.FC<Props> = ({ state, battle, onFinish }) => {
  const [stage, setStage] = useState<'SELECT' | 'FIGHT' | 'RESULT'>('SELECT');
  const [fighterType, setFighterType] = useState<'HERO' | 'DISCIPLE'>('HERO');
  const [selectedDiscipleId, setSelectedDiscipleId] = useState<string>('');
  const [autoControl, setAutoControl] = useState(false);
  const [hudTick, setHudTick] = useState(0);
  const [tutStep, setTutStep] = useState<TutorialStep>(battle.isTutorial ? 1 : 0);
  const [resultOutcome, setResultOutcome] = useState<BattleOutcomePayload | null>(null);

  const tutStepRef = useRef<TutorialStep>(battle.isTutorial ? 1 : 0);
  useEffect(() => {
    tutStepRef.current = tutStep;
  }, [tutStep]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const playerRef = useRef<FighterRuntime | null>(null);
  const enemyRef = useRef<FighterRuntime | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatsRef = useRef<FloatingText[]>([]);
  const arcsRef = useRef<SlashArc[]>([]);
  const metaRef = useRef({
    hitstopUntil: 0,
    parryFlashUntil: 0,
    shakeUntil: 0,
    cutinText: '',
    cutinUntil: 0,
    usedMagic: false,
    usedForbidden: false,
    justParries: 0,
    recoilHealthLoss: 0,
    recoilLifespanYears: 0,
    aiNextThinkAt: 0,
    finished: false,
    autoControl: false,
  });

  useEffect(() => {
    preloadAllGameArt();
  }, []);

  useEffect(() => {
    metaRef.current.autoControl = autoControl;
  }, [autoControl]);

  const aliveDisciples = state.disciples.filter((d) => !d.dead);

  const startFight = (type: 'HERO' | 'DISCIPLE', dId?: string) => {
    sound.playDrum();
    setFighterType(type);
    if (dId) setSelectedDiscipleId(dId);

    let pStats: Stats;
    let pName: string;
    let pAge: number;
    let pSkills: Skill[];
    let pPassives: string[];
    let pWeapon: Weapon | undefined;

    if (type === 'DISCIPLE' && dId) {
      const d = state.disciples.find((x) => x.id === dId) as Disciple;
      pStats = d.stats;
      pName = d.name;
      pAge = d.age;
      pSkills = d.skills.filter((s) => !s.isPassive).slice(0, 5);
      pPassives = d.skills.filter((s) => s.isPassive).map((s) => s.id);
      pWeapon = state.weapons.find((w) => w.id === state.equippedWeaponId);
    } else {
      pStats = { ...state.stats };
      if (state.disabilities.includes('ONE_ARM')) pStats.str = Math.round(pStats.str * 0.8);
      if (state.disabilities.includes('LIMP')) pStats.agi = Math.round(pStats.agi * 0.75);
      if (state.statuses.some((s) => s.id === 'HEAVY_INJURY')) {
        pStats.str = Math.round(pStats.str * 0.7);
        pStats.agi = Math.round(pStats.agi * 0.7);
      }
      pName = state.name;
      pAge = state.age;
      pSkills = state.equippedActiveIds
        .map((id) => state.skills.find((s) => s.id === id))
        .filter((s): s is Skill => !!s);
      if (pSkills.length === 0) pSkills = state.skills.slice(0, 2);
      pPassives = state.equippedPassiveIds;
      pWeapon = state.weapons.find((w) => w.id === state.equippedWeaponId);
    }

    const pMaxHp = Math.round(110 + pStats.vit * 6);
    const startHpRatio =
      type === 'HERO' && state.statuses.some((s) => s.id === 'HEAVY_INJURY') ? 0.72 : 1.0;

    playerRef.current = {
      name: pName,
      age: pAge,
      x: 240,
      hp: Math.round(pMaxHp * startHpRatio),
      maxHp: pMaxHp,
      qi: Math.round(45 + pStats.wil * 2 + pStats.qi * 1.5),
      maxQi: Math.round(45 + pStats.wil * 2 + pStats.qi * 1.5),
      posture: Math.round(80 + pStats.vit * 2 + pStats.str * 1.5),
      maxPosture: Math.round(80 + pStats.vit * 2 + pStats.str * 1.5),
      stats: pStats,
      weapon: pWeapon,
      skills: pSkills,
      passives: pPassives,
      cooldowns: {},
      dodgeCd: 0,
      blocking: false,
      blockStartAt: 0,
      invulnUntil: 0,
      stunUntil: 0,
      groggyUntil: 0,
      hurtFlashUntil: 0,
      lungeOffset: 0,
      counterBuffUntil: 0,
      shieldHp: 0,
      burnUntil: 0,
      slowUntil: 0,
      oneArm: type === 'HERO' && state.disabilities.includes('ONE_ARM'),
      blind: type === 'HERO' && state.disabilities.includes('BLIND'),
      limp: type === 'HERO' && state.disabilities.includes('LIMP'),
      hasMindEye: type === 'HERO' && state.awakenings.includes('MIND_EYE'),
      hasOneArmSaint: type === 'HERO' && state.awakenings.includes('ONE_ARM_SAINT'),
      hasImmovable: type === 'HERO' && state.awakenings.includes('IMMOVABLE'),
      action: null,
    };

    const eMaxHp = battle.enemyHp;
    enemyRef.current = {
      name: battle.enemyName,
      age: battle.enemyAge,
      x: 650,
      hp: eMaxHp,
      maxHp: eMaxHp,
      qi: 100,
      maxQi: 100,
      posture: Math.round(70 + battle.enemyStats.vit * 2),
      maxPosture: Math.round(70 + battle.enemyStats.vit * 2),
      stats: battle.enemyStats,
      skills: battle.enemySkills,
      passives: [],
      cooldowns: {},
      dodgeCd: 0,
      blocking: false,
      blockStartAt: 0,
      invulnUntil: 0,
      stunUntil: 0,
      groggyUntil: 0,
      hurtFlashUntil: 0,
      lungeOffset: 0,
      counterBuffUntil: 0,
      shieldHp: 0,
      burnUntil: 0,
      slowUntil: 0,
      action: null,
    };

    particlesRef.current = [];
    floatsRef.current = [];
    arcsRef.current = [];
    metaRef.current = {
      hitstopUntil: 0,
      parryFlashUntil: 0,
      shakeUntil: 0,
      cutinText: '',
      cutinUntil: 0,
      usedMagic: false,
      usedForbidden: false,
      justParries: 0,
      recoilHealthLoss: 0,
      recoilLifespanYears: 0,
      aiNextThinkAt: performance.now() + 900,
      finished: false,
      autoControl: type === 'DISCIPLE' ? autoControl : false,
    };

    setTutStep(battle.isTutorial ? 1 : 0);
    setStage('FIGHT');
  };

  const spawnParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5.5;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.5,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
        color,
        size: 4 + Math.floor(Math.random() * 3) * 2,
      });
    }
  };

  const triggerSkill = (fighter: FighterRuntime, target: FighterRuntime, skill: Skill, isPlayer: boolean) => {
    const now = performance.now();
    if (fighter.action || now < fighter.stunUntil || now < fighter.groggyUntil) return;
    if ((fighter.cooldowns[skill.id] || 0) > now) return;
    if (fighter.qi < skill.qiCost) {
      if (isPlayer) floatsRef.current.push({ x: fighter.x, y: 175, text: '기력 부족', color: '#94a3b8', life: 0.7 });
      return;
    }

    const hasteMult = fighter.passives.includes('sk_fn_04') ? 0.78 : 1.0;
    const speedMult = Math.max(0.65, Math.min(1.3, 1.35 - fighter.stats.agi * 0.006)) * hasteMult;
    const weaponSpd = fighter.weapon ? 1 - fighter.weapon.speedBonus : 1.0;
    const oneArmBonus = fighter.hasOneArmSaint ? 0.75 : 1.0;

    const playerIns = playerRef.current?.stats.ins || 20;
    const enemyTelegraphBoost = !isPlayer
      ? Math.round(playerIns * 3.5 + (playerRef.current?.hasMindEye ? 240 : 0)) + (tutStepRef.current >= 3 ? 650 : 0)
      : 0;

    const windupMs = Math.max(90, Math.round(skill.windupMs * speedMult * weaponSpd * oneArmBonus)) + enemyTelegraphBoost;
    const cdMs = Math.max(850, Math.round(skill.cooldownMs * speedMult));

    fighter.qi -= skill.qiCost;
    fighter.cooldowns[skill.id] = now + cdMs;
    fighter.blocking = false;

    if (isPlayer && (skill.origin.includes('FANTASY') || skill.isForbidden || skill.masteryLevel >= 6)) {
      metaRef.current.cutinText = `【${skill.customName || skill.name}】`;
      metaRef.current.cutinUntil = now + 700;
    }

    if (isPlayer) {
      if (skill.origin.includes('FANTASY')) metaRef.current.usedMagic = true;
      if (skill.isForbidden) {
        metaRef.current.usedForbidden = true;
        if (skill.selfRecoil?.hpPercent) {
          const selfDmg = Math.round(fighter.maxHp * skill.selfRecoil.hpPercent);
          fighter.hp = Math.max(1, fighter.hp - selfDmg);
          floatsRef.current.push({ x: fighter.x, y: 165, text: `반동 -${selfDmg}`, color: '#ef4444', life: 0.9 });
        }
        if (skill.selfRecoil?.healthLoss) metaRef.current.recoilHealthLoss += skill.selfRecoil.healthLoss;
        if (skill.selfRecoil?.lifespanYears) metaRef.current.recoilLifespanYears += skill.selfRecoil.lifespanYears;
      }
    }

    if (skill.form === 'STEP') {
      fighter.invulnUntil = now + 420;
      const dir = target.x >= fighter.x ? 1 : -1;
      if (skill.id === 'sk_fn_06' || skill.id === 'sig_void_step') {
        fighter.x = Math.max(100, Math.min(CANVAS_W - 100, target.x + dir * 70));
        fighter.counterBuffUntil = now + 2200;
        sound.playMagic('SHADOW');
        spawnParticles(fighter.x, 265, '#c084fc', 16);
      } else {
        fighter.x = Math.max(100, Math.min(CANVAS_W - 100, fighter.x + dir * 130));
        sound.playSlash(false);
        spawnParticles(fighter.x, 285, '#e2e8f0', 10);
      }
      if (skill.power <= 0) {
        floatsRef.current.push({ x: fighter.x, y: 185, text: skill.customName || skill.name, color: '#38bdf8', life: 0.8 });
        return;
      }
    }

    if (skill.form === 'PARRY') {
      fighter.blocking = true;
      fighter.blockStartAt = now;
      if (skill.statusEffect?.type === 'SHIELD') {
        fighter.shieldHp = Math.round(fighter.maxHp * skill.statusEffect.value);
        sound.playMagic('QI');
        spawnParticles(fighter.x, 255, '#38bdf8', 16);
      } else {
        sound.playParry(false);
      }
      floatsRef.current.push({ x: fighter.x, y: 185, text: `${skill.customName || skill.name}!`, color: '#60a5fa', life: 0.8 });
      fighter.action = { skill, startAt: now, windupMs: 120, recoveryMs: 650, hitDone: true };
      return;
    }

    fighter.action = {
      skill,
      startAt: now,
      windupMs,
      recoveryMs: Math.round(skill.recoveryMs * speedMult),
      hitDone: false,
    };
  };

  const triggerBasicBlock = (active: boolean) => {
    const p = playerRef.current;
    if (!p) return;
    if (active && !p.blocking) {
      p.blocking = true;
      p.blockStartAt = performance.now();
    } else if (!active) {
      p.blocking = false;
    }
  };

  const triggerBasicDodge = () => {
    const p = playerRef.current;
    const e = enemyRef.current;
    if (!p || !e) return;
    const now = performance.now();
    if (now < p.dodgeCd || now < p.stunUntil || now < p.groggyUntil) return;
    p.dodgeCd = now + (p.limp ? 4200 : 2000);
    p.invulnUntil = now + Math.min(420, 260 + p.stats.agi * 1.4) + (tutStepRef.current === 4 ? 320 : 0);
    p.action = null;
    p.blocking = false;
    const away = p.x <= e.x ? -1 : 1;
    p.x = Math.max(95, Math.min(CANVAS_W - 95, p.x + away * (p.limp ? 65 : 135)));
    sound.playSlash(false);
    spawnParticles(p.x, 300, '#cbd5e1', 10);
    floatsRef.current.push({ x: p.x, y: 195, text: '회피!', color: '#38bdf8', life: 0.65 });

    // 튜토리얼 4단계 완료 체크 (적색 전조 중에 구르기 사용 시 통과!)
    if (tutStepRef.current === 4 && e.action && !e.action.hitDone) {
      e.action = null;
      sound.playLevelUp();
      floatsRef.current.push({ x: CANVAS_W / 2, y: 140, text: '완벽한 회피! 이제 실전이다!', color: '#fde047', life: 1.4, scale: 1.3 });
      setTutStep(0);
    }
  };

  useEffect(() => {
    if (stage !== 'FIGHT') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (metaRef.current.autoControl) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.left = true;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.right = true;
      if (e.key === 'Shift') triggerBasicBlock(true);
      if (e.code === 'Space') {
        e.preventDefault();
        triggerBasicDodge();
      }
      const slotMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, q: 0, w: 1, e: 2, r: 3, f: 4 };
      if (k in slotMap && playerRef.current && enemyRef.current) {
        const sk = playerRef.current.skills[slotMap[k]];
        if (sk) triggerSkill(playerRef.current, enemyRef.current, sk, true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.left = false;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.right = false;
      if (e.key === 'Shift') triggerBasicBlock(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== 'FIGHT') return;
    let rafId = 0;
    let lastTime = performance.now();
    let lastHud = 0;

    const getSkillReachPx = (sk: Skill) => (sk.range === 'FAR' ? 540 : sk.range === 'MID' ? 235 : 150);

    const resolveHit = (attacker: FighterRuntime, defender: FighterRuntime, sk: Skill, attackerIsPlayer: boolean) => {
      const now = performance.now();
      const dist = Math.abs(attacker.x - defender.x);
      const reach = getSkillReachPx(sk);
      const facing = defender.x >= attacker.x ? 1 : -1;
      attacker.lungeOffset = facing * 34;

      const elemColor =
        sk.element === 'FIRE'
          ? '#ff4d24'
          : sk.element === 'ICE'
          ? '#38bdf8'
          : sk.element === 'LIGHTNING'
          ? '#c084fc'
          : sk.element === 'QI'
          ? '#facc15'
          : '#fffbeb';

      arcsRef.current.push({
        x: attacker.x + facing * 62,
        y: 255,
        facing,
        color: elemColor,
        life: 0.28,
        maxLife: 0.28,
        heavy: sk.telegraph === 'RED',
      });

      if (sk.origin.includes('FANTASY')) sound.playMagic(sk.element);
      else sound.playSlash(sk.telegraph === 'RED');

      if (dist > reach) {
        floatsRef.current.push({ x: attacker.x + facing * 60, y: 195, text: '허공!', color: '#cbd5e1', life: 0.55 });
        return;
      }

      const ignoreEvade = sk.imprintedTraits.some((t) => t.effect.ignoreEvade);
      if (now < defender.invulnUntil && !ignoreEvade) {
        floatsRef.current.push({ x: defender.x, y: 180, text: '완전 회피!', color: '#38bdf8', life: 0.75 });
        if (!attackerIsPlayer && tutStepRef.current === 4) {
          sound.playLevelUp();
          setTutStep(0);
        }
        return;
      }

      const tutParryBonus = !attackerIsPlayer && tutStepRef.current === 3 ? 550 : 0;
      const defenderParryWindow = 140 + defender.stats.ins * 2.8 + (defender.hasMindEye ? 150 : 0) + tutParryBonus;
      const isJustParry = defender.blocking && now - defender.blockStartAt <= defenderParryWindow;

      if (defender.blocking && sk.telegraph !== 'RED') {
        if (isJustParry) {
          sound.playParry(true);
          metaRef.current.hitstopUntil = now + 260;
          metaRef.current.parryFlashUntil = now + 380;
          metaRef.current.shakeUntil = now + 220;
          if (!attackerIsPlayer) metaRef.current.justParries += 1;
          attacker.posture = Math.max(0, attacker.posture - 42);
          defender.qi = Math.min(defender.maxQi, defender.qi + 22);
          defender.counterBuffUntil = now + 2200;
          spawnParticles(defender.x, 250, '#fde047', 22);
          floatsRef.current.push({ x: defender.x, y: 150, text: '看破! 저스트 간파!', color: '#fde047', life: 1.15, scale: 1.35 });

          // 튜토리얼 3단계 통과 → 4단계(적색 회피) 진입!
          if (!attackerIsPlayer && tutStepRef.current === 3) {
            sound.playLevelUp();
            setTutStep(4);
          }

          if (defender.action?.skill.form === 'PARRY' && defender.action.skill.power > 0) {
            const counterDmg = Math.round(defender.action.skill.power * 1.4 + defender.stats.ins * 0.5);
            attacker.hp = Math.max(0, attacker.hp - counterDmg);
            floatsRef.current.push({ x: attacker.x, y: 180, text: `반격 -${counterDmg}`, color: '#ef4444', life: 0.9 });
          }
          if (attacker.posture <= 0) {
            attacker.groggyUntil = now + 1800;
            attacker.posture = attacker.maxPosture;
            floatsRef.current.push({ x: attacker.x, y: 140, text: '체세 붕괴!', color: '#ef4444', life: 1.1 });
          }
          return;
        } else {
          sound.playParry(false);
          const posCost = defender.hasImmovable ? 0 : Math.round((sk.postureDamage || 22) * 0.85);
          defender.posture = Math.max(0, defender.posture - posCost);
          spawnParticles(defender.x, 255, '#cbd5e1', 8);
          floatsRef.current.push({ x: defender.x, y: 185, text: '방어!', color: '#93c5fd', life: 0.6 });
          return;
        }
      }

      if (defender.blocking && sk.telegraph === 'RED') {
        defender.posture = 0;
        defender.groggyUntil = now + 1300;
        defender.blocking = false;
        floatsRef.current.push({ x: defender.x, y: 150, text: '방어 분쇄!', color: '#ef4444', life: 0.95 });
      }

      // 피해 계산
      const weaponAtk = attacker.weapon ? attacker.weapon.attack + attacker.weapon.upgradeLevel * 4 : 12;
      const affinity =
        !attacker.weapon || sk.weapon === 'ANY' || sk.imprintedTraits.some((t) => t.effect.noWeaponPenalty) || sk.masteryLevel >= 8
          ? 1.15
          : attacker.weapon.group === sk.weapon
          ? attacker.weapon.elementAffinity === sk.element
            ? 1.35
            : 1.15
          : 0.8;

      const base = sk.power * (1 + sk.masteryLevel * 0.13) * affinity;
      const statAdd =
        sk.element !== 'PHYSICAL' || sk.form === 'PROJECTILE'
          ? attacker.stats.wil * 0.65 + attacker.stats.qi * 1.05 + weaponAtk * 0.6
          : sk.form === 'THRUST'
          ? attacker.stats.agi * 0.75 + weaponAtk * 0.85
          : attacker.stats.str * 0.75 + weaponAtk * 0.85;

      let mult = 1.0;
      if (now < attacker.counterBuffUntil) mult *= 1.55;
      if (now < defender.groggyUntil) mult *= 1.5;
      if (attacker.passives.includes('sk_cn_09') && sk.element === 'QI') mult *= 1.25;
      if (defender.passives.includes('sk_cn_09')) mult *= 0.85;
      if (attacker.hasOneArmSaint && sk.weapon === 'BLADE') mult *= 1.35;

      let dmg = Math.max(6, Math.round((base + statAdd) * mult * 0.65));
      if (tutStepRef.current > 0 && !attackerIsPlayer) {
        dmg = Math.min(dmg, 8); // 튜토리얼 중 플레이어가 억울하게 죽지 않도록 보호
      }

      if (defender.shieldHp > 0) {
        const absorbed = Math.min(defender.shieldHp, dmg);
        defender.shieldHp -= absorbed;
        dmg -= absorbed;
      }

      defender.hp = Math.max(tutStepRef.current > 0 ? 30 : 0, defender.hp - dmg);
      defender.posture = Math.max(0, defender.posture - Math.round((sk.postureDamage || 18) * 0.7));
      defender.hurtFlashUntil = now + 150;
      defender.x = Math.max(90, Math.min(CANVAS_W - 90, defender.x + facing * 18));

      // 튜토리얼 2단계 통과 (플레이어 첫 명중!) → 3단계(간파) 진입
      if (attackerIsPlayer && tutStepRef.current === 2) {
        sound.playLevelUp();
        setTutStep(3);
      }

      if (defender.action && !defender.action.hitDone && (sk.windupMs <= 260 || sk.telegraph === 'RED')) {
        defender.action = null;
        floatsRef.current.push({ x: defender.x, y: 165, text: '초식 차단!', color: '#fb923c', life: 0.8 });
      }

      if (sk.statusEffect && Math.random() < sk.statusEffect.chance) {
        if (sk.statusEffect.type === 'BURN' || sk.statusEffect.type === 'POISON' || sk.statusEffect.type === 'BLEED') {
          defender.burnUntil = now + sk.statusEffect.durationMs;
        } else if (sk.statusEffect.type === 'STUN' || sk.statusEffect.type === 'FREEZE' || sk.statusEffect.type === 'SHOCK') {
          defender.stunUntil = now + sk.statusEffect.durationMs;
        } else if (sk.statusEffect.type === 'SLOW') {
          defender.slowUntil = now + sk.statusEffect.durationMs;
        }
      }

      sound.playHit(mult > 1.3 || sk.telegraph === 'RED');
      metaRef.current.shakeUntil = now + 150;
      spawnParticles(defender.x, 245, sk.element === 'PHYSICAL' ? '#ef4444' : elemColor, 16);
      floatsRef.current.push({
        x: defender.x,
        y: 175,
        text: `-${dmg}`,
        color: sk.element === 'PHYSICAL' ? '#fca5a5' : elemColor,
        life: 0.85,
        scale: mult > 1.3 ? 1.3 : 1.05,
      });
    };

    const tick = (now: number) => {
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const p = playerRef.current;
      const e = enemyRef.current;
      if (!p || !e) return;

      const inHitstop = now < metaRef.current.hitstopUntil;
      const dt = inHitstop ? rawDt * 0.12 : rawDt;

      if (!metaRef.current.finished) {
        p.lungeOffset *= 0.82;
        e.lungeOffset *= 0.82;

        const pQiRegen = (7 + p.stats.wil * 0.16) * (p.passives.includes('sk_kr_08') ? 1.35 : 1.0);
        p.qi = Math.min(p.maxQi, p.qi + pQiRegen * dt);
        e.qi = Math.min(e.maxQi, e.qi + 9 * dt);
        if (!p.blocking) p.posture = Math.min(p.maxPosture, p.posture + 10 * dt);
        if (!e.blocking) e.posture = Math.min(e.maxPosture, e.posture + 8 * dt);

        if (now < p.burnUntil) p.hp = Math.max(1, p.hp - 7 * dt);
        if (now < e.burnUntil) e.hp = Math.max(0, e.hp - 9 * dt);

        if (!p.action && now >= p.stunUntil && now >= p.groggyUntil && !p.blocking) {
          const moveSpd = (185 + p.stats.agi * 1.4) * (p.limp ? 0.5 : 1.0) * (now < p.slowUntil ? 0.6 : 1.0);
          if (keysRef.current.left) p.x -= moveSpd * dt;
          if (keysRef.current.right) p.x += moveSpd * dt;
        }

        // 튜토리얼 단계별 진행 제어
        const tStep = tutStepRef.current;
        if (tStep === 1 && Math.abs(e.x - p.x) <= 215) {
          sound.playLevelUp();
          setTutStep(2);
        } else if (tStep === 3 && !e.action && now >= metaRef.current.aiNextThinkAt) {
          // 튜토리얼 3단계: 적이 연습용 황색 전조 공격만 천천히 반복!
          if (Math.abs(e.x - p.x) > 180) e.x -= 140 * dt;
          else {
            const yellowSk: Skill = { ...e.skills[0], telegraph: 'YELLOW', windupMs: 520, cooldownMs: 1800 };
            triggerSkill(e, p, yellowSk, false);
            metaRef.current.aiNextThinkAt = now + 2600;
          }
        } else if (tStep === 4 && !e.action && now >= metaRef.current.aiNextThinkAt) {
          // 튜토리얼 4단계: 적이 연습용 적색 강공만 천천히 반복!
          if (Math.abs(e.x - p.x) > 190) e.x -= 140 * dt;
          else {
            const redSk: Skill = { ...e.skills[0], name: '강타 내려치기', telegraph: 'RED', windupMs: 650, cooldownMs: 2200 };
            triggerSkill(e, p, redSk, false);
            metaRef.current.aiNextThinkAt = now + 2800;
          }
        } else if (tStep === 0) {
          // 자유 실전 AI
          if (metaRef.current.autoControl && !p.action && now >= p.stunUntil && now >= p.groggyUntil) {
            const dist = Math.abs(e.x - p.x);
            const dir = e.x >= p.x ? 1 : -1;
            if (e.action && !e.action.hitDone) {
              if (e.action.skill.telegraph === 'RED') triggerBasicDodge();
              else triggerBasicBlock(true);
            } else {
              p.blocking = false;
              if (dist > 175) p.x += dir * 165 * dt;
              const ready = p.skills.find((s) => (p.cooldowns[s.id] || 0) <= now && p.qi >= s.qiCost);
              if (ready && dist <= getSkillReachPx(ready)) triggerSkill(p, e, ready, true);
            }
          }

          const eSlow = p.passives.includes('sk_fn_07') ? 0.7 : 1.0;
          if (!e.action && now >= e.stunUntil && now >= e.groggyUntil) {
            const dist = Math.abs(p.x - e.x);
            const dir = p.x >= e.x ? 1 : -1;
            const prefDist = battle.enemyAi === 'RANGED' ? 340 : 165;
            if (dist > prefDist + 20) e.x += dir * (135 + e.stats.agi) * eSlow * dt;
            else if (dist < prefDist - 40 && battle.enemyAi === 'RANGED') e.x -= dir * 110 * eSlow * dt;

            if (now >= metaRef.current.aiNextThinkAt) {
              const ready = e.skills.filter((s) => (e.cooldowns[s.id] || 0) <= now && e.qi >= s.qiCost);
              if (ready.length > 0 && dist <= 265) {
                const pick = ready[Math.floor(Math.random() * ready.length)];
                triggerSkill(e, p, pick, false);
                metaRef.current.aiNextThinkAt = now + (battle.enemyAi === 'RUSHDOWN' ? 1150 : 1550);
              } else {
                metaRef.current.aiNextThinkAt = now + 500;
              }
            }
          }
        }

        p.x = Math.max(90, Math.min(CANVAS_W - 90, p.x));
        e.x = Math.max(90, Math.min(CANVAS_W - 90, e.x));

        const updateAction = (f: FighterRuntime, opp: FighterRuntime, isP: boolean) => {
          if (!f.action) return;
          const elapsed = now - f.action.startAt;
          if (!f.action.hitDone && elapsed >= f.action.windupMs) {
            f.action.hitDone = true;
            resolveHit(f, opp, f.action.skill, isP);
          }
          if (elapsed >= f.action.windupMs + f.action.recoveryMs) {
            f.action = null;
            if (f.blocking) f.blocking = false;
          }
        };
        updateAction(p, e, true);
        updateAction(e, p, false);

        if (tStep === 0 && (p.hp <= 0 || e.hp <= 0)) {
          metaRef.current.finished = true;
          const victory = e.hp <= 0;
          if (victory) sound.playLevelUp();
          setResultOutcome({
            victory,
            fighterType,
            discipleId: fighterType === 'DISCIPLE' ? selectedDiscipleId : undefined,
            usedMagic: metaRef.current.usedMagic,
            usedForbidden: metaRef.current.usedForbidden,
            justParriesCount: metaRef.current.justParries,
            recoilHealthLoss: metaRef.current.recoilHealthLoss,
            recoilLifespanYears: metaRef.current.recoilLifespanYears,
            hpRemainingRatio: p.hp / p.maxHp,
          });
          setStage('RESULT');
        }
      }

      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.16;
        pt.life -= dt;
        return pt.life > 0;
      });
      floatsRef.current = floatsRef.current.filter((fl) => {
        fl.y -= 28 * dt;
        fl.life -= dt;
        return fl.life > 0;
      });
      arcsRef.current = arcsRef.current.filter((ac) => {
        ac.life -= dt;
        return ac.life > 0;
      });

      drawStage(now, p, e);

      if (now - lastHud > 75) {
        lastHud = now;
        setHudTick((v) => v + 1);
      }
      rafId = requestAnimationFrame(tick);
    };

    const drawFighterSprite = (
      ctx: CanvasRenderingContext2D,
      f: FighterRuntime,
      sheetSrc: string,
      nativeFacing: 1 | -1,
      desiredFacing: 1 | -1,
      isPlayer: boolean,
      now: number
    ) => {
      const sheet = getSpriteSheet(sheetSrc, 4);
      const drawX = Math.round(f.x + f.lungeOffset);
      const groundY = 368;

      // 그림자
      ctx.fillStyle = 'rgba(10, 8, 5, 0.48)';
      ctx.beginPath();
      ctx.ellipse(drawX, groundY, 54, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      if (!sheet || sheet.frames.length < 4) return;

      // 실제 4포즈 스프라이트 시트 프레임 선택!
      // 0: 대기 자세 / 1: 칼 치켜든 선딜 / 2: 전방 강하게 베기 / 3: 칼 세워 방어!
      let frameIdx = 0;
      if (f.action) {
        frameIdx = f.action.hitDone ? 2 : 1;
      } else if (f.blocking) {
        frameIdx = 3;
      }

      const sp = sheet.frames[frameIdx];
      // Frame 0 높이(refHeight) 기준으로 고정 스케일링 → 포즈 바뀌어도 캐릭터 덩치 유지!
      const scaleRatio = 172 / Math.max(1, sheet.refHeight);
      const targetW = Math.round(sp.width * scaleRatio);
      const targetH = Math.round(sp.height * scaleRatio);

      const breath = frameIdx === 0 ? Math.sin(now / 260) * 2 : 0;
      const hurtShake = now < f.groggyUntil || now < f.stunUntil ? Math.sin(now * 0.06) * 5 : 0;
      const flipX = nativeFacing === desiredFacing ? 1 : -1;

      ctx.save();
      if (!isPlayer && playerRef.current?.blind) ctx.globalAlpha = 0.2;
      if (now < f.invulnUntil) ctx.globalAlpha = 0.48;

      // 타격 순간 잔상(Afterimage)
      if (frameIdx === 2 && Math.abs(f.lungeOffset) > 6) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.translate(drawX - f.lungeOffset * 0.85, groundY - breath);
        ctx.scale(flipX, 1);
        ctx.drawImage(sp.canvas, -targetW / 2, -targetH + 6, targetW, targetH);
        ctx.restore();
      }

      ctx.translate(drawX + hurtShake, groundY - breath);
      ctx.scale(flipX, 1);

      const useFlash = now < f.hurtFlashUntil;
      ctx.drawImage(useFlash ? sp.flashCanvas : sp.canvas, -targetW / 2, -targetH + 6, targetW, targetH);
      ctx.restore();

      if (f.blocking) {
        ctx.save();
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(drawX + desiredFacing * 32, groundY - 88, 52, desiredFacing > 0 ? -1.0 : Math.PI - 1.0, desiredFacing > 0 ? 1.0 : Math.PI + 1.0);
        ctx.stroke();
        ctx.restore();
      }

      if (f.shieldHp > 0) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(drawX, groundY - 92, 78, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const drawStage = (now: number, p: FighterRuntime, e: FighterRuntime) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      ctx.save();
      if (now < metaRef.current.shakeUntil) {
        ctx.translate(Math.round((Math.random() - 0.5) * 12), Math.round((Math.random() - 0.5) * 9));
      }

      // 32비트 픽셀아트 격투 배경 (비무 vs 진검결투 붉은 노을!)
      const bgImg = loadRawImage(battle.isRealDuel ? '/assets/px_battle_duel_stage.jpg' : '/assets/px_battle_stage.jpg');
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);
      } else {
        ctx.fillStyle = '#241a13';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      if (p.blind) {
        ctx.fillStyle = 'rgba(8, 6, 12, 0.78)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      const heroFightSrc =
        p.age >= 55
          ? '/assets/sheet_fight_old.jpg'
          : state.gender === 'FEMALE'
          ? '/assets/sheet_fight_female.jpg'
          : '/assets/sheet_fight_hero.jpg';

      drawFighterSprite(ctx, p, heroFightSrc, 1, e.x >= p.x ? 1 : -1, true, now);
      drawFighterSprite(ctx, e, '/assets/sheet_fight_enemy.jpg', -1, p.x >= e.x ? 1 : -1, false, now);

      // 전조 바
      [
        { f: p, isP: true },
        { f: e, isP: false },
      ].forEach(({ f, isP }) => {
        if (f.action && !f.action.hitDone && f.action.skill.telegraph !== 'NONE') {
          const ratio = Math.min(1, (now - f.action.startAt) / Math.max(1, f.action.windupMs));
          const tele = f.action.skill.telegraph;
          const col = tele === 'RED' ? '#ef4444' : tele === 'BLUE' ? '#3b82f6' : '#f59e0b';
          const lbl = isP ? f.action.skill.customName || f.action.skill.name : tele === 'RED' ? '적색! 지금 구르기!' : '황색! 지금 막기/간파!';
          ctx.fillStyle = 'rgba(15, 10, 8, 0.9)';
          ctx.fillRect(Math.round(f.x - 66), 146, 132, 18);
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(f.x - 62), 150, Math.round(124 * ratio), 10);
          if (ratio > 0.65) {
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 2;
            ctx.strokeRect(Math.round(f.x - 66), 146, 132, 18);
          }
          ctx.font = 'bold 13px NeoDunggeunmo, monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#140d09';
          ctx.fillText(lbl, Math.round(f.x) + 1, 139);
          ctx.fillStyle = col;
          ctx.fillText(lbl, Math.round(f.x), 138);
        }
      });

      // 검기 궤적
      arcsRef.current.forEach((ac) => {
        ctx.save();
        ctx.globalAlpha = ac.life / ac.maxLife;
        ctx.strokeStyle = ac.color;
        ctx.lineWidth = ac.heavy ? 14 : 7;
        ctx.beginPath();
        ctx.arc(ac.x, ac.y, ac.heavy ? 88 : 64, ac.facing > 0 ? -1.1 : Math.PI - 1.1, ac.facing > 0 ? 1.1 : Math.PI + 1.1);
        ctx.stroke();
        ctx.restore();
      });

      // 픽셀 파티클
      particlesRef.current.forEach((pt) => {
        ctx.fillStyle = pt.color;
        ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
      });

      // 오의 컷인
      if (now < metaRef.current.cutinUntil) {
        ctx.fillStyle = 'rgba(18, 10, 6, 0.88)';
        ctx.fillRect(0, 52, CANVAS_W, 46);
        ctx.fillStyle = '#f2c96b';
        ctx.fillRect(0, 52, CANVAS_W, 3);
        ctx.fillRect(0, 95, CANVAS_W, 3);
        ctx.font = 'bold 26px NeoDunggeunmo, monospace';
        ctx.fillStyle = '#fde68a';
        ctx.textAlign = 'center';
        ctx.fillText(metaRef.current.cutinText, CANVAS_W / 2, 84);
      }

      // 저스트 간파 플래시
      if (now < metaRef.current.parryFlashUntil) {
        ctx.fillStyle = 'rgba(255, 248, 215, 0.38)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.font = 'bold 72px "Noto Serif KR", NeoDunggeunmo, serif';
        ctx.fillStyle = '#b52b27';
        ctx.textAlign = 'center';
        ctx.fillText('看破', CANVAS_W / 2, 130);
      }

      // 플로팅 텍스트
      floatsRef.current.forEach((fl) => {
        ctx.font = `bold ${Math.round(17 * (fl.scale || 1))}px NeoDunggeunmo, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#120a06';
        ctx.fillText(fl.text, Math.round(fl.x) + 2, Math.round(fl.y) + 2);
        ctx.fillStyle = fl.color;
        ctx.fillText(fl.text, Math.round(fl.x), Math.round(fl.y));
      });

      ctx.restore();
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stage, battle, fighterType, selectedDiscipleId, state.gender]);

  const p = playerRef.current;
  const e = enemyRef.current;
  const nowMs = performance.now();
  const activeTut = tutStep !== 0 ? TUTORIAL_INFO[tutStep] : null;

  if (stage === 'SELECT') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4 bg-[#120c09]">
        <div className="rpg-window max-w-xl w-full p-5 sm:p-6 space-y-4 animate-ink max-h-[92vh] overflow-y-auto">
          <div className="flex items-start justify-between border-b-2 border-[#6b4728] pb-3 gap-3">
            <div className="space-y-1">
              <span className={`text-xs px-2 py-0.5 inline-flex items-center gap-1 ${battle.isRealDuel ? 'seal-badge' : 'bg-[#2c4c6e] text-white border border-[#93c5fd]'}`}>
                {battle.isRealDuel ? <><Skull className="w-3.5 h-3.5" /> 진검결투 (사생결단)</> : '도장 비무 · 시합'}
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-[#fde68a]">{battle.title}</h2>
              <p className="text-xs text-[#d6cbb8]">{battle.subtitle}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right text-xs">
                <div className="font-bold text-rose-400">{battle.enemyName}</div>
                <div className="text-[#c7b394]">{battle.enemyAge}세 · HP {battle.enemyHp}</div>
              </div>
              <PixelPortrait role={battle.isRivalBattle ? 'RIVAL' : 'ENEMY'} country={state.country} age={battle.enemyAge} size={56} />
            </div>
          </div>

          {battle.isRealDuel && (
            <div className="bg-[#4a1212] border-2 border-[#ef4444] p-3 text-xs text-[#fecaca]">
              ⚠ 진검결투 경고: 패배 시 즉사(즉시 사후 엔딩) 또는 영구 장애(외팔·실명)를 입습니다.
            </div>
          )}

          {battle.isTutorial && (
            <div className="bg-[#1e3a5f]/50 border-2 border-[#60a5fa] p-3 text-xs text-[#dbeafe]">
              ★ <b>첫 실전 튜토리얼</b>: 이동 → 횡베기 타격 → 황색 간파(看破) → 적색 회피 4단계를 몸으로 직접 익히며 진행합니다!
            </div>
          )}

          <div className="space-y-2.5">
            <button
              onClick={() => startFight('HERO')}
              className="w-full seal-badge py-3.5 px-4 flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2 font-bold">
                <User className="w-4 h-4" /> 도장주 직접 출전 ({state.name}, {state.age}세)
              </span>
              <span className="text-xs">HP {Math.round(110 + state.stats.vit * 6)}</span>
            </button>

            {battle.canUseDisciple && aliveDisciples.length > 0 && (
              <div className="bg-[#1b120c] border border-[#6b4728] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5 text-[#fde68a]">
                    <Users className="w-4 h-4" /> 문하생·자녀 대리 출전
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={autoControl} onChange={(ev) => setAutoControl(ev.target.checked)} />
                    사범 관전 (자동)
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                  {aliveDisciples.map((d) => (
                    <button key={d.id} onClick={() => startFight('DISCIPLE', d.id)} className="rpg-btn text-left p-2 text-xs cursor-pointer">
                      <div className="font-bold text-[#fde68a]">{d.name} {d.isChild ? '(자녀)' : ''} · {d.age}세</div>
                      <div className="text-[11px] text-[#d6cbb8]">STR {d.stats.str} / AGI {d.stats.agi} / 초식 {d.skills.length}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col justify-between bg-[#120c09] text-[#f5ecd9] p-2 sm:p-3 select-none overflow-hidden">
      {/* 상단 32비트 격투 HUD */}
      <div className="max-w-4xl w-full mx-auto grid grid-cols-2 gap-2.5 rpg-window p-2.5">
        <div className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:justify-between text-xs sm:text-sm leading-tight">
            <span className="font-bold text-[#fde68a] truncate">{p?.name} ({p?.age}세)</span>
            <span className="text-[11px] text-rose-300">HP {Math.ceil(p?.hp || 0)}/{p?.maxHp}</span>
          </div>
          <div className="h-3 bg-[#120c08] border border-[#8c6239]">
            <div className="h-full bg-[#c93b2b]" style={{ width: `${Math.max(0, ((p?.hp || 0) / (p?.maxHp || 1)) * 100)}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="h-2 bg-[#120c08] border border-[#8c6239]">
              <div className="h-full bg-amber-500" style={{ width: `${((p?.posture || 0) / (p?.maxPosture || 1)) * 100}%` }} />
            </div>
            <div className="h-2 bg-[#120c08] border border-[#8c6239]">
              <div className="h-full bg-blue-500" style={{ width: `${((p?.qi || 0) / (p?.maxQi || 1)) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="space-y-1 text-right">
          <div className="flex flex-col-reverse sm:flex-row sm:justify-between text-xs sm:text-sm leading-tight">
            <span className="text-[11px] text-rose-300">HP {Math.ceil(e?.hp || 0)}/{e?.maxHp}</span>
            <span className="font-bold text-rose-300 truncate">{e?.name} ({e?.age}세)</span>
          </div>
          <div className="h-3 bg-[#120c08] border border-[#8c6239]">
            <div className="h-full bg-[#b91c1c] ml-auto" style={{ width: `${Math.max(0, ((e?.hp || 0) / (e?.maxHp || 1)) * 100)}%` }} />
          </div>
          <div className="h-2 bg-[#120c08] border border-[#8c6239]">
            <div className="h-full bg-amber-500 ml-auto" style={{ width: `${((e?.posture || 0) / (e?.maxPosture || 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* 인터랙티브 4단계 전투 튜토리얼 배너 */}
      {activeTut && (
        <div className="max-w-4xl w-full mx-auto mt-1.5 bg-[#1e3a5f] border-2 border-[#fde047] px-3 py-2 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#fde047] shrink-0" />
            <div>
              <span className="font-bold text-[#fde047] mr-2">{activeTut.title}</span>
              <span className="text-white">{activeTut.guide}</span>
            </div>
          </div>
          <button onClick={() => setTutStep(0)} className="rpg-btn px-2 py-1 text-[11px] shrink-0 cursor-pointer">
            건너뛰기
          </button>
        </div>
      )}

      {/* 중앙 32비트 픽셀 격투 무대 */}
      <div className="max-w-4xl w-full mx-auto my-auto relative border-4 border-[#8c6239] bg-[#1a130e] aspect-[900/420] max-h-[56vh] flex items-center justify-center overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="pixel-canvas w-full h-full block" />
        {stage === 'RESULT' && resultOutcome && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-4 animate-ink">
            <div className="rpg-window max-w-md w-full p-6 text-center space-y-4">
              <h3 className={`text-3xl font-bold ${resultOutcome.victory ? 'text-[#fde68a]' : 'text-rose-400'}`}>
                {resultOutcome.victory ? '★ 승 리 (勝利) ★' : '패 배 (敗北)'}
              </h3>
              <p className="text-sm text-[#e6d8be]">
                {resultOutcome.victory
                  ? `${p?.name}의 초식이 상대를 꺾었다! (저스트 간파 ${resultOutcome.justParriesCount}회)`
                  : battle.isRealDuel
                  ? '진검결투에서 쓰러졌다… 운명의 판정이 기다린다.'
                  : '패배했다. 몸을 추스르고 다시 단련하자.'}
              </p>
              <button
                onClick={() => onFinish(resultOutcome)}
                className="w-full seal-badge py-3 font-bold cursor-pointer flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> 도장으로 돌아가기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 하단 격투 컨트롤러 (튜토리얼 단계별 버튼 강조!) */}
      <div className="max-w-4xl w-full mx-auto space-y-2 rpg-window p-2.5" data-tick={hudTick}>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onPointerDown={() => { keysRef.current.left = true; }}
            onPointerUp={() => { keysRef.current.left = false; }}
            onPointerLeave={() => { keysRef.current.left = false; }}
            className="rpg-btn py-2.5 text-xs sm:text-sm font-bold cursor-pointer"
          >
            ◀ 후퇴<span className="hidden sm:inline"> (A)</span>
          </button>
          <button
            onPointerDown={() => { keysRef.current.right = true; }}
            onPointerUp={() => { keysRef.current.right = false; }}
            onPointerLeave={() => { keysRef.current.right = false; }}
            className={`rpg-btn py-2.5 text-xs sm:text-sm font-bold cursor-pointer ${
              activeTut?.highlight === 'MOVE' ? 'ring-2 ring-[#fde047] animate-pulse' : ''
            }`}
          >
            전진<span className="hidden sm:inline"> (D)</span> ▶
          </button>
          <button
            onPointerDown={() => triggerBasicBlock(true)}
            onPointerUp={() => triggerBasicBlock(false)}
            onPointerLeave={() => triggerBasicBlock(false)}
            className={`py-2.5 border-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1 cursor-pointer ${
              p?.blocking ? 'bg-blue-600 border-blue-200' : 'bg-[#1e3a5f] border-[#60a5fa]'
            } ${activeTut?.highlight === 'BLOCK' ? 'ring-2 ring-[#fde047] animate-pulse' : ''}`}
          >
            <Shield className="w-4 h-4 shrink-0" /> 막기<span className="hidden sm:inline">/간파 (Shift)</span>
          </button>
          <button
            onClick={triggerBasicDodge}
            disabled={(p?.dodgeCd || 0) > nowMs}
            className={`rpg-btn py-2.5 disabled:opacity-45 text-xs sm:text-sm font-bold flex items-center justify-center gap-1 cursor-pointer ${
              activeTut?.highlight === 'DODGE' ? 'ring-2 ring-[#fde047] animate-pulse' : ''
            }`}
          >
            <Wind className="w-4 h-4 shrink-0" /> 구르기<span className="hidden sm:inline"> (Space)</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {(p?.skills || []).map((sk, idx) => {
            const cdRemain = Math.max(0, (p?.cooldowns[sk.id] || 0) - nowMs);
            const noQi = (p?.qi || 0) < sk.qiCost;
            const isMagic = sk.origin.includes('FANTASY');
            const ElemIcon =
              sk.element === 'FIRE' ? Flame : sk.element === 'ICE' ? Snowflake : sk.element === 'LIGHTNING' ? Zap : Swords;
            return (
              <button
                key={sk.id}
                onClick={() => p && e && triggerSkill(p, e, sk, true)}
                disabled={cdRemain > 0 || noQi || metaRef.current.autoControl}
                className={`relative px-2.5 py-2 border-2 text-left cursor-pointer disabled:opacity-45 ${
                  sk.isForbidden
                    ? 'bg-[#4f1010] border-red-400'
                    : isMagic
                    ? 'bg-[#361459] border-fuchsia-400'
                    : 'bg-[#38271b] border-[#c9974c]'
                } ${idx === 0 && activeTut?.highlight === 'ATTACK' ? 'ring-2 ring-[#fde047] animate-pulse' : ''}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs truncate flex items-center gap-1 text-[#fde68a]">
                    <ElemIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{sk.customName || sk.name}</span>
                  </span>
                  <span className="text-[10px] text-[#93c5fd] shrink-0">[{idx + 1}]</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#c7b394] mt-1">
                  <span>Lv.{sk.masteryLevel}</span>
                  <span>{sk.qiCost > 0 ? `💧${sk.qiCost}` : '⚡무료'}</span>
                </div>
                {cdRemain > 0 && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center font-bold text-sm">
                    {(cdRemain / 1000).toFixed(1)}s
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
