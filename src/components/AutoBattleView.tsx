import React, { useEffect, useRef, useState } from 'react';
import { BattleConfig, BattleTactic, Disciple, GameState, Skill, Stats, Weapon } from '../types/game';
import { BattleOutcomePayload } from '../engine/gameLogic';
import { simulateAutoBattleQuick } from '../engine/autoBattleSim';
import { sound } from '../engine/sound';
import {
  getEnemyFightGridSrc,
  getGridSpriteSheet,
  getHeroFightGridSrc,
  getKoFallenIndex,
  getVfxGridSheet,
  loadRawImage,
  preloadAllGameArt,
} from '../pixel/spriteLoader';
import { detectNpcGender, PixelPortrait } from './PixelPortrait';
import { HANJA_GLOSSARY, InGameTooltip } from './InGameUI';
import { TOURNAMENT_ROUNDS } from '../data/tournament';
import { FastForward, Flame, Play, Shield, Skull, Snowflake, Swords, Trophy, User, Users, Zap } from 'lucide-react';

interface Props {
  state: GameState;
  battle: BattleConfig;
  onChangeTactic: (t: BattleTactic) => void;
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
  gravity?: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale?: number;
}

interface AfterimageGhost {
  x: number;
  y: number;
  frameIdx: number;
  sheetSrc: string;
  flipX: number;
  tint: string;
  life: number;
  maxLife: number;
}

interface ActiveVfxSprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vfxIdx: number; // grid_vfx_martial_8f 인덱스 (0~7)
  scale: number;
  flipX: number;
  rotation: number;
  life: number;
  maxLife: number;
  tintRing?: string;
}

interface SlashLineEffect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  life: number;
  maxLife: number;
}

interface ShockRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface MagicPillarFx {
  x: number;
  kind: 'FIRE' | 'LIGHTNING' | 'ICE' | 'SHADOW' | 'QI';
  color: string;
  life: number;
  maxLife: number;
}

interface DarkSlashSequence {
  active: boolean;
  startAt: number;
  targetX: number;
  targetY: number;
  attackerSheet: string;
  attackerFlip: number;
  color: string;
  title: string;
  scars: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    atMs: number;
    width: number;
    isFinisherLine?: boolean;
    played: boolean;
  }>;
  ghostSpots: Array<{ x: number; y: number; frameIdx: number; flip: number; atMs: number }>;
  finisherDone: boolean;
}

interface ProjectileWave {
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  vfxIdx: number;
  color: string;
  scale: number;
  fromPlayer: boolean;
  skill: Skill;
  dmg: number;
  hit: boolean;
  life: number;
}

interface FighterAction {
  skill: Skill;
  formNumber: number; // 몇 식 (1식, 2식...)
  isCounterRiposte?: boolean;
  counterChain?: number; // 연환 반격 공방 횟수 (1합, 2합, 3합...)
  startAt: number;
  stepInMs: number;
  windupMs: number;
  strikeMs: number;
  combo2Ms: number; // 0이면 단타, >0이면 2연격(Frame 4 하단 역베기!)
  recoveryMs: number;
  stepInDone: boolean;
  hit1Done: boolean;
  hit2Done: boolean;
}

interface FighterRuntime {
  name: string;
  sectTitle: string;
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
  passiveBonus?: { qiRegen: number; dmgReduce: number; allDmg: number; parry: number; maxHp: number };
  cooldowns: Record<string, number>;
  blockingUntil: number;
  invulnUntil: number;
  stunUntil: number;
  groggyUntil: number;
  hurtFlashUntil: number;
  hurtPoseUntil: number;
  lungeOffset: number;
  counterBuffUntil: number;
  pendingCounter?: { skill: Skill; formNum: number; triggerAt: number; chain: number };
  shoutText: string;
  shoutSub: string;
  shoutUntil: number;
  shoutIsCounter: boolean;
  moving: boolean;
  action: FighterAction | null;
  hasMindEye?: boolean;
  hasOneArmSaint?: boolean;
  hasImmovable?: boolean;
}

const CANVAS_W = 900;
const CANVAS_H = 420;
const GROUND_Y = 368;

// 적 유파명 자동 생성 (외침용)
function getEnemySectName(battle: BattleConfig, country: GameState['country']): string {
  if (battle.isRivalBattle) {
    return country === 'CHINA' ? '천산검문' : country === 'JAPAN' ? '일도류' : '백운검파';
  }
  if (battle.title.includes('관군') || battle.title.includes('포도청')) return '관군무예';
  if (battle.title.includes('흑사회') || battle.title.includes('산적') || battle.title.includes('도적')) return '흑풍도';
  if (battle.title.includes('자객') || battle.title.includes('닌자')) return '암영류';
  return country === 'CHINA' ? '철혈무관' : country === 'JAPAN' ? '적사류' : '청풍도장';
}

// 스킬의 레벨(Lv.1~10) + 형태 + 속성 + 연마 각인 특성(imprintedTraits)에 따른 시각 연출 프로파일!
interface SkillVfxProfile {
  tier: 1 | 2 | 3 | 4; // 1: 입문(1~2), 2: 숙달(3~5), 3: 대성(6~8), 4: 극의(9~10)
  vfxIdx: number; // grid_vfx_martial_8f (0~7)
  color: string;
  scale: number;
  particles: number;
  afterimages: number;
  hitstopMs: number;
  isMultiHit: boolean;
  isRangedWave: boolean;
  isArmorBreak: boolean;
  isSwift: boolean;
  isExecute: boolean;
  isApexCutin: boolean;
  traitCallout: string;
}

function getSkillVfxProfile(sk: Skill, isCounterRiposte = false): SkillVfxProfile {
  const lv = sk.masteryLevel || 1;
  const tier: 1 | 2 | 3 | 4 = lv >= 9 ? 4 : lv >= 6 ? 3 : lv >= 3 ? 2 : 1;
  const traits = sk.imprintedTraits || [];

  const isMultiHit =
    !isCounterRiposte &&
    (traits.some((t) => (t.effect.multiHit || 0) >= 2) || (sk.form === 'SLASH' && lv >= 6));
  const isRangedWave =
    sk.form === 'PROJECTILE' ||
    sk.range === 'FAR' ||
    traits.some((t) => Boolean(t.effect.rangeExtend));
  const isArmorBreak =
    sk.telegraph === 'RED' ||
    traits.some((t) => Boolean(t.effect.unblockable) || (t.effect.postureMult || 1) >= 1.35);
  const isSwift = traits.some((t) => (t.effect.windupMult || 1) <= 0.85) || sk.form === 'STEP';
  const isExecute = traits.some((t) => (t.effect.executeThreshold || 0) > 0);
  const isApexCutin = tier >= 3 || Boolean(sk.isForbidden) || sk.origin.includes('FANTASY') || isCounterRiposte;

  const nm = sk.customName || sk.name;
  let vfxIdx = 0; // 기본 수평 은백 검기
  let color = '#f8fafc';

  if (sk.element === 'FIRE') {
    vfxIdx = 4;
    color = '#ff5722';
  } else if (sk.element === 'LIGHTNING') {
    vfxIdx = 5;
    color = '#c084fc';
  } else if (sk.element === 'ICE') {
    vfxIdx = 6;
    color = '#38bdf8';
  } else if (isCounterRiposte || sk.form === 'THRUST' || traits.some((t) => (t.effect.armorPierce || 0) >= 0.4)) {
    vfxIdx = 2; // 청백 관통 일섬 빔
    color = isCounterRiposte ? '#fde047' : '#67e8f9';
  } else if (sk.form === 'STRIKE' || sk.element === 'QI' || isArmorBreak) {
    vfxIdx = 3; // 황금 기공 충격파 링
    color = '#facc15';
  } else if (nm.includes('종') || nm.includes('낙') || nm.includes('양단') || nm.includes('벽력')) {
    vfxIdx = 1; // 황금 수직 낙하참
    color = '#fde68a';
  } else if (sk.element === 'SHADOW') {
    vfxIdx = 5;
    color = '#a855f7';
  } else if (sk.element === 'WIND') {
    vfxIdx = 0;
    color = '#5eead4';
  }

  // 레벨(숙련도)에 따라 같은 기술도 이펙트 크기·잔상·타격감이 극적으로 진화!
  const scale = tier === 4 ? 1.52 : tier === 3 ? 1.24 : tier === 2 ? 0.98 : 0.74;
  const particles = tier === 4 ? 36 : tier === 3 ? 24 : tier === 2 ? 15 : 8;
  const afterimages = (isSwift ? 2 : 0) + (tier >= 4 ? 3 : tier >= 3 ? 2 : tier >= 2 ? 1 : 0);
  const hitstopMs = isCounterRiposte ? 170 : tier === 4 ? 145 : tier === 3 ? 95 : tier === 2 ? 60 : 30;
  const latestTrait = traits[traits.length - 1];
  const traitCallout = latestTrait ? latestTrait.label : '';

  return {
    tier,
    vfxIdx,
    color,
    scale,
    particles,
    afterimages,
    hitstopMs,
    isMultiHit,
    isRangedWave,
    isArmorBreak,
    isSwift,
    isExecute,
    isApexCutin,
    traitCallout,
  };
}

export const AutoBattleView: React.FC<Props> = ({ state, battle, onChangeTactic, onFinish }) => {
  const [stage, setStage] = useState<'SETUP' | 'WATCH' | 'RESULT'>('SETUP');
  const [fighterType, setFighterType] = useState<'HERO' | 'DISCIPLE'>('HERO');
  const [selectedDiscipleId, setSelectedDiscipleId] = useState<string>('');
  const [speedMult, setSpeedMult] = useState<1 | 2>(1);
  const [hudTick, setHudTick] = useState(0);
  const [commentary, setCommentary] = useState('두 무인이 서로의 거리를 재며 기세를 겨룬다…');
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [resultOutcome, setResultOutcome] = useState<BattleOutcomePayload | null>(null);
  const [isPortrait, setIsPortrait] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false));

  useEffect(() => {
    const onResize = () => setIsPortrait(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const viewW = isPortrait ? 520 : CANVAS_W;
  const viewH = isPortrait ? 400 : CANVAS_H;
  const battleCamXRef = useRef(450);

  const pushLog = (msg: string) => {
    setCommentary(msg);
    setBattleLog((prev) => [...prev.slice(-4), msg]);
  };

  const speedRef = useRef<1 | 2>(1);
  useEffect(() => { speedRef.current = speedMult; }, [speedMult]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<FighterRuntime | null>(null);
  const enemyRef = useRef<FighterRuntime | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatsRef = useRef<FloatingText[]>([]);
  const ghostsRef = useRef<AfterimageGhost[]>([]);
  const vfxSpritesRef = useRef<ActiveVfxSprite[]>([]);
  const slashLinesRef = useRef<SlashLineEffect[]>([]);
  const ringsRef = useRef<ShockRing[]>([]);
  const magicFxRef = useRef<MagicPillarFx[]>([]);
  const darkSlashRef = useRef<DarkSlashSequence | null>(null);
  const wavesRef = useRef<ProjectileWave[]>([]);

  const metaRef = useRef({
    hitstopUntil: 0,
    timeSlowUntil: 0,
    timeSlowColor: '#fde047',
    parryFlashUntil: 0,
    inkFlashUntil: 0,
    shakeUntil: 0,
    shakePower: 8,
    cutinSect: '',
    cutinSkill: '',
    cutinTrait: '',
    cutinColor: '#fde68a',
    cutinUntil: 0,
    usedMagic: false,
    usedForbidden: false,
    justParries: 0,
    recoilHealthLoss: 0,
    recoilLifespanYears: 0,
    pThinkAt: 0,
    eThinkAt: 0,
    finished: false,
  });

  useEffect(() => {
    preloadAllGameArt();
  }, []);

  const aliveDisciples = state.disciples.filter((d) => !d.dead);
  const cleanSectName = battle.spectatorMode && battle.spectatorLeft
    ? battle.spectatorLeft.sectName
    : state.sectName.replace(/\(.*?\)/g, '').trim() || '무명류';
  const enemySectName = battle.isTournament && battle.enemyTitle ? battle.enemyTitle : getEnemySectName(battle, state.country);

  // ★ 객석 관전 모드(8강→4강→결승)는 셋업 화면 없이 즉시 절정 고수 대결을 자동 개막! ★
  useEffect(() => {
    if (battle.spectatorMode && battle.spectatorLeft && stage === 'SETUP') {
      beginWatch('HERO');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle.id]);

  const beginWatch = (type: 'HERO' | 'DISCIPLE', dId?: string) => {
    sound.playDrum();
    setFighterType(type);
    if (dId) setSelectedDiscipleId(dId);

    let pStats: Stats;
    let pName: string;
    let pAge: number;
    let pSkills: Skill[];
    let pPassives: string[];
    const pWeapon = state.weapons.find((w) => w.id === state.equippedWeaponId);

    if (battle.spectatorMode && battle.spectatorLeft) {
      const sl = battle.spectatorLeft;
      pStats = { ...sl.stats };
      pName = sl.name;
      pAge = sl.age;
      pSkills = sl.skills;
      pPassives = [];
    } else if (type === 'DISCIPLE' && dId) {
      const d = state.disciples.find((x) => x.id === dId) as Disciple;
      pStats = { ...d.stats };
      pName = d.name;
      pAge = d.age;
      pSkills = d.skills.filter((s) => !s.isPassive).slice(0, 5);
      pPassives = d.skills.filter((s) => s.isPassive).map((s) => s.id);
    } else {
      pStats = { ...state.stats };
      if (state.disabilities.includes('ONE_ARM')) pStats.str = Math.round(pStats.str * 0.8);
      if (state.disabilities.includes('LIMP')) pStats.agi = Math.round(pStats.agi * 0.75);
      pName = state.name;
      pAge = state.age;
      pSkills = state.equippedActiveIds
        .map((id) => state.skills.find((s) => s.id === id))
        .filter((s): s is Skill => !!s);
      if (pSkills.length === 0) pSkills = state.skills.slice(0, 2);
      pPassives = state.equippedPassiveIds;
    }

    const equippedPassiveSkills =
      battle.spectatorMode
        ? []
        : pPassives
            .map((id) => state.skills.find((s) => s.id === id))
            .filter((s): s is Skill => Boolean(s));
    const pPassiveBonus = equippedPassiveSkills.reduce(
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

    const pMaxHp =
      battle.spectatorMode && battle.spectatorLeft
        ? battle.spectatorLeft.hp
        : Math.round((110 + pStats.vit * 6) * (1 + Math.min(0.5, pPassiveBonus.maxHp)));
    playerRef.current = {
      name: pName,
      sectTitle: cleanSectName,
      age: pAge,
      x: 240,
      hp: pMaxHp,
      maxHp: pMaxHp,
      qi: Math.round((45 + pStats.wil * 2 + pStats.qi * 1.5) * (1 + Math.min(0.4, pPassiveBonus.qiRegen * 0.4))),
      maxQi: Math.round((45 + pStats.wil * 2 + pStats.qi * 1.5) * (1 + Math.min(0.4, pPassiveBonus.qiRegen * 0.4))),
      posture: Math.round(80 + pStats.vit * 2 + pStats.str * 1.5),
      maxPosture: Math.round(80 + pStats.vit * 2 + pStats.str * 1.5),
      stats: pStats,
      weapon: pWeapon,
      skills: pSkills,
      passives: pPassives,
      passiveBonus: pPassiveBonus,
      cooldowns: {},
      blockingUntil: 0,
      invulnUntil: 0,
      stunUntil: 0,
      groggyUntil: 0,
      hurtFlashUntil: 0,
      hurtPoseUntil: 0,
      lungeOffset: 0,
      counterBuffUntil: 0,
      shoutText: '',
      shoutSub: '',
      shoutUntil: 0,
      shoutIsCounter: false,
      moving: false,
      hasMindEye: type === 'HERO' && state.awakenings.includes('MIND_EYE'),
      hasOneArmSaint: type === 'HERO' && state.awakenings.includes('ONE_ARM_SAINT'),
      hasImmovable: type === 'HERO' && state.awakenings.includes('IMMOVABLE'),
      action: null,
    };

    enemyRef.current = {
      name: battle.enemyName,
      sectTitle: enemySectName,
      age: battle.enemyAge,
      x: 650,
      hp: battle.enemyHp,
      maxHp: battle.enemyHp,
      qi: 100,
      maxQi: 100,
      posture: Math.round(70 + battle.enemyStats.vit * 2),
      maxPosture: Math.round(70 + battle.enemyStats.vit * 2),
      stats: battle.enemyStats,
      skills: battle.enemySkills,
      passives: [],
      cooldowns: {},
      blockingUntil: 0,
      invulnUntil: 0,
      stunUntil: 0,
      groggyUntil: 0,
      hurtFlashUntil: 0,
      hurtPoseUntil: 0,
      lungeOffset: 0,
      counterBuffUntil: 0,
      shoutText: '',
      shoutSub: '',
      shoutUntil: 0,
      shoutIsCounter: false,
      moving: false,
      action: null,
    };

    particlesRef.current = [];
    floatsRef.current = [];
    ghostsRef.current = [];
    vfxSpritesRef.current = [];
    slashLinesRef.current = [];
    ringsRef.current = [];
    magicFxRef.current = [];
    darkSlashRef.current = null;
    wavesRef.current = [];

    metaRef.current = {
      hitstopUntil: 0,
      timeSlowUntil: 0,
      timeSlowColor: '#fde047',
      parryFlashUntil: 0,
      inkFlashUntil: 0,
      shakeUntil: 0,
      shakePower: 8,
      cutinSect: '',
      cutinSkill: '',
      cutinTrait: '',
      cutinColor: '#fde68a',
      cutinUntil: 0,
      usedMagic: false,
      usedForbidden: false,
      justParries: 0,
      recoilHealthLoss: 0,
      recoilLifespanYears: 0,
      pThinkAt: performance.now() + 480,
      eThinkAt: performance.now() + 760,
      finished: false,
    };

    setBattleLog([`【${cleanSectName}】 ${pName} vs 【${enemySectName}】 ${battle.enemyName} — 일합 개시!`]);
    setCommentary(`【${cleanSectName}】 ${pName} vs 【${enemySectName}】 ${battle.enemyName} — 일합 개시!`);
    battleCamXRef.current = 445;
    setStage('WATCH');
  };

  const handleInstantResolve = () => {
    if (battle.spectatorMode) {
      metaRef.current.finished = true;
      setResultOutcome({
        victory: Math.random() < 0.5,
        fighterType: 'HERO',
        usedMagic: false,
        usedForbidden: false,
        justParriesCount: 0,
        recoilHealthLoss: 0,
        recoilLifespanYears: 0,
        hpRemainingRatio: 1,
      });
      setStage('RESULT');
      return;
    }
    const quick = simulateAutoBattleQuick(
      state,
      battle,
      fighterType,
      state.battleTactic,
      fighterType === 'DISCIPLE' ? selectedDiscipleId : undefined
    );
    metaRef.current.finished = true;
    if (quick.victory) sound.playLevelUp();
    setResultOutcome(quick);
    setStage('RESULT');
  };

  useEffect(() => {
    if (stage !== 'WATCH') return;
    let rafId = 0;
    let lastTime = performance.now();
    let lastHud = 0;

    const equippedGroup = state.weapons.find((w) => w.id === state.equippedWeaponId)?.group;
    const activeDisc = fighterType === 'DISCIPLE' ? state.disciples.find((d) => d.id === selectedDiscipleId) : null;
    const heroGender = battle.spectatorMode && battle.spectatorLeft
      ? battle.spectatorLeft.gender
      : activeDisc
      ? (activeDisc.gender || (detectNpcGender(`${activeDisc.name} ${activeDisc.archetype}`) === 'FEMALE' ? 'FEMALE' : 'MALE'))
      : state.gender;
    const heroCountry = battle.spectatorMode && battle.spectatorLeft
      ? battle.spectatorLeft.country
      : state.country;
    const heroAge = battle.spectatorMode && battle.spectatorLeft
      ? battle.spectatorLeft.age
      : activeDisc?.age || playerRef.current?.age || state.age;
    const heroInfo = getHeroFightGridSrc(heroCountry, heroGender, heroAge, activeDisc ? undefined : equippedGroup);
    const heroGridSrc = heroInfo.src;
    const heroNativeDir = heroInfo.nativeDir;
    const enemyGridSrc = getEnemyFightGridSrc(battle.enemyName, battle.enemyTitle, battle.enemyWeaponGroup);

    const spawnParticles = (x: number, y: number, color: string, count: number, spread = 6.5, gravity = 0.16) => {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.8 + Math.random() * spread;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.6,
          life: 0.28 + Math.random() * 0.34,
          maxLife: 0.62,
          color,
          size: 3 + Math.floor(Math.random() * 3) * 2,
          gravity,
        });
      }
    };

    const spawnDust = (x: number, facing: number) => {
      for (let i = 0; i < 6; i++) {
        particlesRef.current.push({
          x: x - facing * (12 + Math.random() * 18),
          y: GROUND_Y - 4 - Math.random() * 10,
          vx: -facing * (1.2 + Math.random() * 2.5),
          vy: -0.6 - Math.random() * 1.4,
          life: 0.25 + Math.random() * 0.2,
          maxLife: 0.45,
          color: '#d6c3a5',
          size: 5,
          gravity: -0.02,
        });
      }
    };

    const spawnGhostTrail = (f: FighterRuntime, opp: FighterRuntime, isP: boolean, frameIdx: number, count: number, tint: string) => {
      const sheetSrc = isP ? heroGridSrc : enemyGridSrc;
      const nativeDir = isP ? heroNativeDir : -1;
      const wantDir = opp.x >= f.x ? 1 : -1;
      const flipX = nativeDir === wantDir ? 1 : -1;
      const dir = wantDir;
      for (let i = 0; i < count; i++) {
        ghostsRef.current.push({
          x: f.x - dir * (18 + i * 22),
          y: GROUND_Y,
          frameIdx,
          sheetSrc,
          flipX,
          tint,
          life: 0.22 + i * 0.06,
          maxLife: 0.28 + i * 0.06,
        });
      }
    };

    const getReach = (sk: Skill, prof: SkillVfxProfile) => {
      if (prof.isRangedWave) return 560;
      return sk.range === 'FAR' ? 520 : sk.range === 'MID' ? 245 : 168;
    };

    const computeDamage = (atk: FighterRuntime, def: FighterRuntime, sk: Skill, atkIsP: boolean, now: number, isCounterRiposte: boolean) => {
      const wAtk = atk.weapon ? atk.weapon.attack + atk.weapon.upgradeLevel * 4 : 12;
      const noPenalty = sk.imprintedTraits.some((t) => t.effect.noWeaponPenalty);
      const aff =
        !atk.weapon || sk.weapon === 'ANY' || sk.masteryLevel >= 8 || noPenalty
          ? 1.15
          : atk.weapon.group === sk.weapon
          ? atk.weapon.elementAffinity === sk.element
            ? 1.35
            : 1.15
          : 0.85;
      const traitDmgMult = sk.imprintedTraits.reduce((acc, t) => acc * (t.effect.damageMult || 1), 1);
      const base = sk.power * (1 + sk.masteryLevel * 0.13) * aff * traitDmgMult;
      const statAdd =
        sk.element !== 'PHYSICAL'
          ? atk.stats.wil * 0.65 + atk.stats.qi * 1.05 + wAtk * 0.6
          : atk.stats.str * 0.75 + wAtk * 0.85;
      const tacticAtk = atkIsP ? (state.battleTactic === 'AGGRESSIVE' ? 1.12 : state.battleTactic === 'COUNTER' ? 0.92 : 1.0) : 1.0;
      const counterTraitMult = sk.imprintedTraits.reduce((m, t) => Math.max(m, t.effect.counterMult || 1.55), 1.55);
      const execThreshold = sk.imprintedTraits.reduce((m, t) => Math.max(m, t.effect.executeThreshold || 0), 0);
      const execMult = execThreshold > 0 && def.hp / def.maxHp <= execThreshold ? 1.6 : 1.0;
      const mult = Math.min(
        2.75,
        tacticAtk *
          (1 + (atk.passiveBonus?.allDmg || 0)) *
          (isCounterRiposte || now < atk.counterBuffUntil ? counterTraitMult : 1.0) *
          (now < def.groggyUntil ? 1.38 : 1.0) *
          (atk.hasOneArmSaint ? 1.25 : 1.0) *
          execMult
      );
      // 방어자 호신강기 피해 경감 + 운기 심법 각인 피해 경감!
      const armorPierce = sk.imprintedTraits.reduce((m, t) => Math.max(m, t.effect.armorPierce || 0), 0);
      const rawDefReduce = Math.min(0.5, Math.max(0, (def.stats.vit + def.stats.qi - 55) * 0.0023) + (def.passiveBonus?.dmgReduce || 0));
      const elemBypass = sk.element !== 'PHYSICAL' ? 0.6 : 1.0;
      const defReduce = rawDefReduce * elemBypass * (1 - armorPierce * 0.65);
      return Math.max(8, Math.round((base + statAdd) * mult * (1 - defReduce) * 0.6));
    };

    const applyImpact = (
      atk: FighterRuntime,
      def: FighterRuntime,
      sk: Skill,
      atkIsP: boolean,
      now: number,
      prof: SkillVfxProfile,
      isCounterRiposte: boolean,
      hitScale = 1.0,
      isSecondHit = false,
      counterChain = 0
    ) => {
      const facing = def.x >= atk.x ? 1 : -1;
      const chainBonus = isCounterRiposte && counterChain > 1 ? 1 + Math.min(4, counterChain - 1) * 0.14 : 1.0;
      const dmg = Math.max(6, Math.round(computeDamage(atk, def, sk, atkIsP, now, isCounterRiposte) * hitScale * chainBonus));

      def.hp = Math.max(0, def.hp - dmg);
      def.hurtFlashUntil = now + 150;
      def.hurtPoseUntil = now + (isCounterRiposte ? 380 : 260);
      const knock = (isCounterRiposte ? 34 : prof.isArmorBreak ? 28 : 16) * (isSecondHit ? 0.7 : 1);
      def.x = Math.max(92, Math.min(CANVAS_W - 92, def.x + facing * knock));

      const postureDmg = Math.round((sk.postureDamage || 16) * (prof.isArmorBreak ? 1.8 : 1.0));
      def.posture = Math.max(0, def.posture - postureDmg);
      if (def.posture <= 0) {
        def.groggyUntil = now + 1350;
        def.posture = def.maxPosture;
        floatsRef.current.push({ x: def.x, y: 145, text: '체세 붕괴!', color: '#fb923c', life: 0.9, maxLife: 0.9, scale: 1.25 });
      }

      // 히트스톱 & 쉐이크 & 먹물 일섬 암전!
      metaRef.current.hitstopUntil = Math.max(metaRef.current.hitstopUntil, now + prof.hitstopMs);
      metaRef.current.shakeUntil = now + (prof.tier >= 3 || isCounterRiposte ? 210 : 125);
      metaRef.current.shakePower = isCounterRiposte ? 14 : prof.tier >= 4 ? 13 : prof.tier >= 3 ? 10 : 6;
      if (prof.tier >= 4 || isCounterRiposte || prof.isExecute) {
        metaRef.current.inkFlashUntil = now + 130;
      }

      // 32비트 VFX 스프라이트 + 참격선 + 충격파 링! (맨손 무술가/권법은 검기 대신 충격파 링으로 개연성 100%!)
      const attackerIsUnarmed =
        (atkIsP ? heroGridSrc.includes('unarmed') : enemyGridSrc.includes('unarmed')) ||
        sk.weapon === 'UNARMED' ||
        sk.form === 'STRIKE' ||
        sk.form === 'GRAPPLE';
      const resolvedVfx1 = attackerIsUnarmed && (prof.vfxIdx === 0 || prof.vfxIdx === 1) ? 3 : prof.vfxIdx;
      const secondVfxIdx = attackerIsUnarmed ? 3 : resolvedVfx1 === 0 ? 1 : resolvedVfx1;
      vfxSpritesRef.current.push({
        x: def.x - facing * 14,
        y: 258 + (isSecondHit ? 10 : 0),
        vx: facing * 28,
        vy: 0,
        vfxIdx: isSecondHit ? secondVfxIdx : resolvedVfx1,
        scale: prof.scale * (isSecondHit ? 0.92 : 1.0),
        flipX: facing,
        rotation: 0,
        life: 0.28 + prof.tier * 0.04,
        maxLife: 0.28 + prof.tier * 0.04,
      });

      // 고레벨/카운터/처형 전용 대각선 일섬선(Iai Slash Line)
      if (prof.tier >= 3 || isCounterRiposte || prof.isExecute) {
        slashLinesRef.current.push({
          x1: def.x - facing * 115,
          y1: isSecondHit ? 315 : 195,
          x2: def.x + facing * 125,
          y2: isSecondHit ? 205 : 305,
          color: prof.isExecute ? '#ef4444' : isCounterRiposte ? '#fde047' : prof.color,
          width: prof.tier >= 4 || isCounterRiposte ? 7 : 4,
          life: 0.24,
          maxLife: 0.24,
        });
      }

      if (prof.isArmorBreak || prof.tier >= 3 || isCounterRiposte) {
        ringsRef.current.push({
          x: def.x,
          y: 260,
          radius: 16,
          maxRadius: prof.tier >= 4 || isCounterRiposte ? 135 : 95,
          color: isCounterRiposte ? '#fde047' : prof.color,
          life: 0.28,
          maxLife: 0.28,
        });
      }

      // ★ 마법 · 속성 연계 전용 캔버스 이펙트 (화염 기둥 / 천뢰 낙하 / 빙결 창 / 고대 마법진 / 강기 파동!) ★
      if (sk.element === 'FIRE' || sk.element === 'LIGHTNING' || sk.element === 'ICE' || sk.element === 'SHADOW' || sk.isForbidden || (sk.element === 'QI' && prof.tier >= 3)) {
        const kind: MagicPillarFx['kind'] =
          sk.isForbidden || sk.element === 'SHADOW'
            ? 'SHADOW'
            : sk.element === 'FIRE'
            ? 'FIRE'
            : sk.element === 'LIGHTNING'
            ? 'LIGHTNING'
            : sk.element === 'ICE'
            ? 'ICE'
            : 'QI';
        magicFxRef.current.push({
          x: def.x,
          kind,
          color: prof.color,
          life: 0.55,
          maxLife: 0.55,
        });
      }

      // ★ 극의 필살 반격 「암전 일섬 연참(9연참 검흔 + 잔상 교차 + 납도 정적 → 폭발!)」 — 오직 대고수 경지(Lv.8+ & 통찰55+ / 3합연환 / Lv.9각인)에서만 해금! ★
      const isSupremeCounterMaster =
        sk.masteryLevel >= 8 &&
        (atk.stats.ins >= 55 || counterChain >= 3 || sk.imprintedTraits.some((t) => t.tier >= 9));

      if (isCounterRiposte && isSupremeCounterMaster) {
        // 주인공이 적의 등 뒤로 순간 교차 통과!
        atk.x = Math.max(92, Math.min(CANVAS_W - 92, def.x + facing * 125));
        const timings = [140, 205, 265, 320, 370, 415, 455, 495, 565];
        const scars = timings.map((atMs, i) => {
          const isFinalCut = i === timings.length - 1;
          const ang = isFinalCut ? -0.42 * facing : -1.05 + i * 0.34 + (Math.random() - 0.5) * 0.28;
          const len = isFinalCut ? 340 : 125 + Math.random() * 65;
          const cy = isFinalCut ? 245 : 205 + (i % 4) * 26;
          return {
            x1: def.x - Math.cos(ang) * len,
            y1: cy - Math.sin(ang) * len * (isFinalCut ? 0.42 : 0.62),
            x2: def.x + Math.cos(ang) * len,
            y2: cy + Math.sin(ang) * len * (isFinalCut ? 0.42 : 0.62),
            atMs,
            width: isFinalCut ? 18 : 8 + (i % 3) * 2,
            isFinisherLine: isFinalCut,
            played: false,
          };
        });
        const atkSheet = atkIsP ? heroGridSrc : enemyGridSrc;
        const atkNat = atkIsP ? heroNativeDir : -1;
        darkSlashRef.current = {
          active: true,
          startAt: now,
          targetX: def.x,
          targetY: 255,
          attackerSheet: atkSheet,
          attackerFlip: atkNat === facing ? 1 : -1,
          color: prof.color === '#f8fafc' ? '#fde047' : prof.color,
          title: `${atk.sectTitle} 극의 절명 반격 · 【${sk.customName || sk.name}】`,
          scars,
          ghostSpots: [
            { x: def.x - facing * 105, y: GROUND_Y, frameIdx: 1, flip: atkNat === facing ? 1 : -1, atMs: 140 },
            { x: def.x + facing * 15, y: GROUND_Y - 26, frameIdx: 3, flip: atkNat === facing ? 1 : -1, atMs: 280 },
            { x: def.x + facing * 120, y: GROUND_Y, frameIdx: 6, flip: atkNat === facing ? -1 : 1, atMs: 440 },
          ],
          finisherDone: false,
        };
        metaRef.current.hitstopUntil = Math.max(metaRef.current.hitstopUntil, now + 840);
      }

      if (isCounterRiposte) sound.playCounterImpact();
      else if (sk.origin.includes('FANTASY')) sound.playMagic(sk.element);
      else sound.playHit(prof.tier >= 3 || prof.isArmorBreak);

      spawnParticles(def.x, 255, sk.element === 'PHYSICAL' && !isCounterRiposte ? '#fca5a5' : prof.color, prof.particles);

      const dmgLabel = isCounterRiposte ? `반격 -${dmg}!` : isSecondHit ? `연격 -${dmg}` : `-${dmg}`;
      floatsRef.current.push({
        x: def.x + (isSecondHit ? facing * 20 : 0),
        y: isSecondHit ? 158 : 185,
        text: dmgLabel,
        color: isCounterRiposte ? '#fde047' : prof.tier >= 3 ? prof.color : '#fca5a5',
        life: 0.9,
        maxLife: 0.9,
        scale: isCounterRiposte ? 1.4 : prof.tier >= 3 ? 1.2 : 1.0,
      });

      const nm = sk.customName || sk.name;
      pushLog(
        isCounterRiposte
          ? `★ 【${atk.sectTitle}】 반격 · ${nm} 작렬!! (${dmg} 치명 피해)`
          : `${atk.name}, 「${nm}」 ${isSecondHit ? '2연격 ' : ''}명중! (${dmg} 피해)`
      );
    };

    const launchSkill = (
      f: FighterRuntime,
      opp: FighterRuntime,
      sk: Skill,
      formNumber: number,
      isP: boolean,
      now: number,
      isCounterRiposte = false,
      counterChain = 0
    ) => {
      const prof = getSkillVfxProfile(sk, isCounterRiposte);
      const haste = f.passives.includes('sk_fn_04') ? 0.78 : 1.0;
      const traitWindup = sk.imprintedTraits.reduce((acc, t) => acc * (t.effect.windupMult || 1), 1);
      const traitCd = sk.imprintedTraits.reduce((acc, t) => acc * (t.effect.cooldownMult || 1), 1);
      const spd = Math.max(0.62, Math.min(1.25, 1.32 - f.stats.agi * 0.006)) * haste * traitWindup;

      const stepInMs = isCounterRiposte ? 55 : Math.max(85, Math.round(135 * spd));
      const windupMs = isCounterRiposte ? 95 : Math.max(130, Math.round(sk.windupMs * 0.78 * spd));
      const strikeMs = 150;
      const combo2Ms = prof.isMultiHit ? 175 : 0;
      const recoveryMs = Math.max(170, Math.round(sk.recoveryMs * 0.72 * spd));
      const cd = Math.max(820, Math.round(sk.cooldownMs * spd * traitCd));

      if (!isCounterRiposte) {
        f.qi = Math.max(0, f.qi - sk.qiCost);
        f.cooldowns[sk.id] = now + cd;
      }
      f.blockingUntil = 0;

      // ★ 문파명 + N식 + 기술명 외침 (연환 반격 시 몇 합인지 함께 외침!) ★
      const skillLabel = sk.customName || sk.name;
      const callout = isCounterRiposte
        ? counterChain >= 2
          ? `${f.sectTitle} ${counterChain}합 재반격 · ${skillLabel}!`
          : `${f.sectTitle} 반격 · ${skillLabel}!`
        : `${f.sectTitle} ${formNumber}식 · ${skillLabel}!`;
      f.shoutText = callout;
      f.shoutSub = prof.traitCallout || (sk.masteryLevel >= 6 ? `Lv.${sk.masteryLevel} 극의` : '');
      f.shoutUntil = now + (isCounterRiposte ? 1050 : 880);
      f.shoutIsCounter = isCounterRiposte;

      sound.playUnsheathe();
      if (isP) {
        if (sk.origin.includes('FANTASY')) metaRef.current.usedMagic = true;
        if (sk.isForbidden) {
          metaRef.current.usedForbidden = true;
          if (sk.selfRecoil?.hpPercent) f.hp = Math.max(1, f.hp - Math.round(f.maxHp * sk.selfRecoil.hpPercent));
          if (sk.selfRecoil?.healthLoss) metaRef.current.recoilHealthLoss += sk.selfRecoil.healthLoss;
          if (sk.selfRecoil?.lifespanYears) metaRef.current.recoilLifespanYears += sk.selfRecoil.lifespanYears;
        }
      }

      if (prof.isApexCutin) {
        metaRef.current.cutinSect = isCounterRiposte ? `★ 간파 반격 · ${f.sectTitle}` : `${f.sectTitle} 제${formNumber}식`;
        metaRef.current.cutinSkill = `【${skillLabel}】`;
        metaRef.current.cutinTrait = prof.traitCallout;
        metaRef.current.cutinColor = isCounterRiposte ? '#fde047' : prof.color;
        metaRef.current.cutinUntil = now + (isCounterRiposte ? 760 : 680);
        // ★ 극한 필살기(Lv.9~10 / 금기 / 절정 오의) 발동 시 순간 타임 슬로우(Time Dilation)! ★
        if (prof.tier >= 4 || sk.isForbidden || sk.origin.includes('FANTASY')) {
          metaRef.current.timeSlowUntil = now + 460;
          metaRef.current.timeSlowColor = prof.color;
        }
      }

      if (sk.form === 'STEP') {
        f.invulnUntil = now + 380;
        const dir = opp.x >= f.x ? 1 : -1;
        spawnGhostTrail(f, opp, isP, 1, 3, '#67e8f9');
        f.x = Math.max(95, Math.min(CANVAS_W - 95, f.x + dir * 135));
        sound.playDash();
        if (sk.power <= 0) return;
      }

      f.action = {
        skill: sk,
        formNumber,
        isCounterRiposte,
        counterChain,
        startAt: now,
        stepInMs,
        windupMs,
        strikeMs,
        combo2Ms,
        recoveryMs,
        stepInDone: false,
        hit1Done: false,
        hit2Done: false,
      };
    };

    const resolveStrike = (atk: FighterRuntime, def: FighterRuntime, act: FighterAction, atkIsP: boolean, now: number, isSecondHit = false) => {
      const sk = act.skill;
      const prof = getSkillVfxProfile(sk, Boolean(act.isCounterRiposte));
      const dist = Math.abs(atk.x - def.x);
      const facing = def.x >= atk.x ? 1 : -1;

      atk.lungeOffset = facing * (act.isCounterRiposte ? 48 : isSecondHit ? 28 : 38);
      spawnDust(atk.x, facing);
      if (prof.afterimages > 0) {
        spawnGhostTrail(
          atk,
          def,
          atkIsP,
          act.isCounterRiposte ? 6 : isSecondHit ? 4 : 3,
          prof.afterimages,
          act.isCounterRiposte ? '#fde047' : prof.isSwift ? '#67e8f9' : prof.color
        );
      }

      if (sk.origin.includes('FANTASY')) sound.playMagic(sk.element);
      else sound.playSlash(prof.tier >= 3 || prof.isArmorBreak);

      // 원거리 검기 파동(PROJECTILE 또는 rangeExtend 각인)은 실제 투사체가 날아감!
      if (prof.isRangedWave && !isSecondHit && dist > 150) {
        const dmg = computeDamage(atk, def, sk, atkIsP, now, Boolean(act.isCounterRiposte));
        wavesRef.current.push({
          x: atk.x + facing * 64,
          y: 256,
          vx: facing * 560,
          facing,
          vfxIdx: prof.vfxIdx,
          color: prof.color,
          scale: prof.scale,
          fromPlayer: atkIsP,
          skill: sk,
          dmg,
          hit: false,
          life: 0.9,
        });
        return;
      }

      // 근접 검기 스윙 VFX (반격 일섬은 간파 직후 파고드므로 최소 사거리 188px 보장!)
      const effectiveReach = act.isCounterRiposte ? Math.max(188, getReach(sk, prof)) : getReach(sk, prof);
      if (dist > effectiveReach) {
        vfxSpritesRef.current.push({
          x: atk.x + facing * 75,
          y: 255,
          vx: facing * 40,
          vy: 0,
          vfxIdx: prof.vfxIdx,
          scale: prof.scale * 0.85,
          flipX: facing,
          rotation: 0,
          life: 0.22,
          maxLife: 0.22,
        });
        return;
      }

      // ★ 가속 정교 연환 공방(Progressive Precision Counter Chain, 최대 8합!) ★
      // 1~2합은 맞칼 기세로 반격의 반격이 활발하게 터지고, 3~7합으로 깊어질수록 통찰·민첩·정신·영력·반격기 숙련도의 정교한 능력치 격차로 결판!
      const curChain = act.counterChain || 0;
      const isUnblockable = sk.imprintedTraits.some((t) => t.effect.unblockable);
      const grandmasterCanDeflectCounter = Boolean(act.isCounterRiposte) && def.stats.ins >= 65;
      if (!isSecondHit && curChain < 8) {
        const defParrySkills = def.skills.filter(
          (s) => s.form === 'PARRY' || s.imprintedTraits.some((t) => Boolean(t.effect.counterMult) || Boolean(t.effect.parryWindowBonus))
        );
        const atkParrySkills = atk.skills.filter(
          (s) => s.form === 'PARRY' || s.imprintedTraits.some((t) => Boolean(t.effect.counterMult) || Boolean(t.effect.parryWindowBonus))
        );
        const parryCount = defParrySkills.length;
        const bestParryLv = parryCount > 0 ? Math.max(...defParrySkills.map((s) => s.masteryLevel || 1)) : Math.max(1, Math.round(def.stats.ins / 12));
        const atkBestLv = atkParrySkills.length > 0 ? Math.max(...atkParrySkills.map((s) => s.masteryLevel || 1)) : Math.max(1, sk.masteryLevel || 1);
        const parryTraitBonus = Math.min(
          0.14,
          defParrySkills.reduce(
            (acc, s) => acc + s.imprintedTraits.reduce((a, t) => a + (t.effect.parryWindowBonus ? 0.06 : t.effect.counterMult ? 0.03 : 0), 0),
            0
          )
        );
        const parrySkillBonus = parryCount >= 3 ? 0.22 : parryCount === 2 ? 0.16 : parryCount === 1 ? 0.1 : 0;
        const tacticParryBonus = !atkIsP ? (state.battleTactic === 'COUNTER' ? 0.14 : state.battleTactic === 'AGGRESSIVE' ? -0.05 : 0) : 0;

        let parryChance: number;
        if (curChain === 0) {
          // 1합 진입 판정
          const insGap = (def.stats.ins - atk.stats.ins) * 0.0028;
          const parryLvBonus = parryCount > 0 ? bestParryLv * 0.013 : 0;
          parryChance = Math.max(
            0.06,
            Math.min(
              0.76,
              0.13 +
                def.stats.ins * 0.0038 +
                insGap +
                tacticParryBonus +
                parrySkillBonus +
                parryLvBonus +
                parryTraitBonus +
                (def.passiveBonus?.parry || 0) +
                (def.hasMindEye ? 0.18 : 0)
            )
          );
        } else {
          // 2합 이상 연환 공방: 초반(1~2합)은 맞칼 기세로 빈번하게 주고받고, 깊어질수록 정교한 다중 능력치 격차 증폭!
          const clashMomentum =
            curChain === 1 ? 0.28 : curChain === 2 ? 0.14 : curChain === 3 ? 0.0 : -(curChain - 3) * 0.15;
          const precisionScale = 1 + (curChain - 1) * 0.55;
          const insDiff = (def.stats.ins - atk.stats.ins) * 0.0035 * precisionScale;
          const agiDiff = curChain >= 2 ? (def.stats.agi - atk.stats.agi) * 0.0022 * (curChain - 1) : 0;
          const mindDiff =
            curChain >= 4 ? (def.stats.wil + def.stats.qi - (atk.stats.wil + atk.stats.qi)) * 0.0018 * (curChain - 3) : 0;
          const lvDiff = (bestParryLv - atkBestLv) * 0.014 * precisionScale;
          const parryAdv = parrySkillBonus * (curChain >= 2 ? 1.25 : 1.0);
          parryChance = Math.max(
            0.05,
            Math.min(
              0.84,
              0.24 +
                def.stats.ins * 0.0026 +
                clashMomentum +
                insDiff +
                agiDiff +
                mindDiff +
                lvDiff +
                parryAdv +
                parryTraitBonus +
                (def.passiveBonus?.parry || 0) +
                (!atkIsP && state.battleTactic === 'COUNTER' ? 0.08 : 0) +
                (def.hasMindEye ? 0.12 : 0)
            )
          );
        }
        const dodgeChance = Math.max(0.06, Math.min(0.62, 0.1 + def.stats.agi * 0.0046 + (def.stats.agi - atk.stats.agi) * 0.002));

        const blocksPrevented = (sk.telegraph === 'RED' || isUnblockable) && !grandmasterCanDeflectCounter;

        // 적색 방어불가 강공 → 패링 불가! 오직 민첩 회피만 가능 (반격 위주 고수 상대 핵심 전략!)
        if (blocksPrevented && Math.random() < dodgeChance) {
          def.invulnUntil = now + 260;
          spawnGhostTrail(def, atk, !atkIsP, 1, 2, '#38bdf8');
          def.x = Math.max(92, Math.min(CANVAS_W - 92, def.x + facing * 78));
          sound.playDash();
          floatsRef.current.push({ x: def.x, y: 176, text: '허공 보법 회피!', color: '#38bdf8', life: 0.78, maxLife: 0.78 });
          pushLog(`${def.name}, ${sk.customName || sk.name}의 강공을 종이 한 장 차이로 회피!`);
          return;
        }

        // ★ 간파(看破) 성공 → 연환 재반격(Counter Chain + 1)!! ★
        const effectiveParry = grandmasterCanDeflectCounter && (sk.telegraph === 'RED' || isUnblockable) ? parryChance * 0.72 : parryChance;
        if (!blocksPrevented && Math.random() < effectiveParry) {
          const nextChain = curChain + 1;
          def.blockingUntil = now + 220;
          def.action = null;
          atk.action = null;
          atk.hurtPoseUntil = now + 180;
          atk.posture = Math.max(0, atk.posture - (34 + nextChain * 6));
          def.qi = Math.min(def.maxQi, def.qi + 16);
          def.counterBuffUntil = now + 2200;

          sound.playParry(true, nextChain);
          // 연환 공방이 깊어질수록 템포가 가속되며 카앙-카앙-카카앙!! 리듬감 극대화!
          const fastHitstop = Math.max(95, 200 - nextChain * 22);
          metaRef.current.hitstopUntil = now + fastHitstop;
          metaRef.current.parryFlashUntil = now + Math.max(160, 290 - nextChain * 25);
          metaRef.current.shakeUntil = now + 180;
          metaRef.current.shakePower = Math.min(18, 9 + nextChain * 2);
          if (!atkIsP) metaRef.current.justParries += 1;

          const clashX = Math.round((atk.x + def.x) / 2);
          vfxSpritesRef.current.push({
            x: clashX,
            y: 252,
            vx: 0,
            vy: 0,
            vfxIdx: 7,
            scale: 1.25 + nextChain * 0.12,
            flipX: 1,
            rotation: 0,
            life: 0.34,
            maxLife: 0.34,
          });
          ringsRef.current.push({ x: clashX, y: 252, radius: 14, maxRadius: 100 + nextChain * 18, color: nextChain >= 3 ? '#fb923c' : '#fde047', life: 0.26, maxLife: 0.26 });
          spawnParticles(clashX, 252, nextChain >= 3 ? '#fb923c' : '#fde047', 20 + nextChain * 5, 8);

          const chainPopup =
            nextChain === 1
              ? '看破!'
              : nextChain === 2
              ? '재반격! (2합)'
              : nextChain === 3
              ? '연환 간파!! (3합)'
              : nextChain === 4
              ? '초절정 공방!! (4합)'
              : `천하극의 공방!!! (${nextChain}합)`;
          floatsRef.current.push({ x: def.x, y: 148, text: chainPopup, color: nextChain >= 4 ? '#f43f5e' : nextChain >= 3 ? '#fb923c' : '#fde047', life: 0.9, maxLife: 0.9, scale: Math.min(1.8, 1.35 + nextChain * 0.08) });

          // 반격 초식을 번갈아 꺼내며 가속 연환 반격 예약!
          const counterSkill = parryCount > 0 ? defParrySkills[(nextChain - 1) % parryCount] : def.skills[0];
          const counterIdx = Math.max(1, def.skills.findIndex((s) => s.id === counterSkill?.id) + 1);
          const triggerGap = Math.max(75, 155 - nextChain * 18);
          if (counterSkill && (parryCount > 0 || nextChain >= 1 || (!atkIsP && state.battleTactic === 'COUNTER'))) {
            def.pendingCounter = { skill: counterSkill, formNum: counterIdx, triggerAt: now + triggerGap, chain: nextChain };
            pushLog(
              nextChain >= 2
                ? `⚔ [${nextChain}합 연환 공방!] ${def.name}, 반격을 다시 흘려내며 재반격!!`
                : `★ ${def.name}, 적의 초식을 찰나에 흘려내며 반격 태세 돌입!`
            );
          } else {
            pushLog(`★ ${def.name}, 통찰의 경지로 공격을 완벽히 간파(看破)했다!`);
          }

          if (atk.posture <= 0) {
            atk.groggyUntil = now + 1350;
            atk.posture = atk.maxPosture;
          }
          return;
        }
      }

      // 명중 처리! (2연타 기술이면 1타 62% + 2타 52%)
      const scale = prof.isMultiHit ? (isSecondHit ? 0.52 : 0.62) : 1.0;
      applyImpact(atk, def, sk, atkIsP, now, prof, Boolean(act.isCounterRiposte), scale, isSecondHit, curChain);
    };

    const tick = (now: number) => {
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const timeScale =
        now < metaRef.current.hitstopUntil
          ? 0.08
          : now < metaRef.current.timeSlowUntil
          ? 0.24
          : 1.0;
      const dt = rawDt * timeScale * speedRef.current;

      // 초다이나믹 암전 일섬 연참(9연참 + 납도 정적 + 대폭발!) 효과음 타이밍 구동
      if (darkSlashRef.current?.active) {
        const ds = darkSlashRef.current;
        const el = now - ds.startAt;
        ds.scars.forEach((sc) => {
          if (!sc.played && el >= sc.atMs) {
            sc.played = true;
            sound.playSlash(Boolean(sc.isFinisherLine));
          }
        });
        if (!ds.finisherDone && el >= 780) {
          ds.finisherDone = true;
          sound.playCounterImpact();
          metaRef.current.shakeUntil = now + 260;
          metaRef.current.shakePower = 18;
        }
        if (el >= 1020) {
          darkSlashRef.current = null;
        }
      }

      const p = playerRef.current;
      const e = enemyRef.current;
      if (!p || !e) return;

      if (!metaRef.current.finished) {
        p.lungeOffset *= 0.8;
        e.lungeOffset *= 0.8;
        p.qi = Math.min(p.maxQi, p.qi + (8.5 + p.stats.wil * 0.16) * (1 + (p.passiveBonus?.qiRegen || 0)) * dt);
        e.qi = Math.min(e.maxQi, e.qi + 10.5 * dt);

        // 예약된 연환 카운터 반격 즉시 실행!
        const checkPendingCounter = (f: FighterRuntime, opp: FighterRuntime, isP: boolean) => {
          if (f.pendingCounter && now >= f.pendingCounter.triggerAt && !f.action && now >= metaRef.current.hitstopUntil - 40) {
            const pc = f.pendingCounter;
            f.pendingCounter = undefined;
            const dir = opp.x >= f.x ? 1 : -1;
            f.x = Math.max(92, Math.min(CANVAS_W - 92, opp.x - dir * 130));
            launchSkill(f, opp, pc.skill, pc.formNum, isP, now, true, pc.chain);
          }
        };
        checkPendingCounter(p, e, true);
        checkPendingCounter(e, p, false);

        // 양측 완전 자동 보법 & 초식 선택 AI
        const runAi = (f: FighterRuntime, opp: FighterRuntime, isP: boolean, thinkKey: 'pThinkAt' | 'eThinkAt') => {
          f.moving = false;
          if (f.action || f.pendingCounter || now < f.stunUntil || now < f.groggyUntil || now < f.hurtPoseUntil) return;

          const dist = Math.abs(opp.x - f.x);
          const dir = opp.x >= f.x ? 1 : -1;
          const pref = isP && state.battleTactic === 'COUNTER' ? 195 : 162;

          if (dist > pref + 16) {
            f.x += dir * (155 + f.stats.agi) * dt;
            f.moving = true;
          } else if (dist < 108) {
            f.x -= dir * 95 * dt;
            f.moving = true;
          }

          if (now >= metaRef.current[thinkKey]) {
            const ready = f.skills
              .map((s, idx) => ({ s, formNum: idx + 1 }))
              .filter(({ s }) => (f.cooldowns[s.id] || 0) <= now && f.qi >= s.qiCost && (s.power > 0 || s.form === 'STEP'));
            // 카운터 전용 스킬(form === 'PARRY'이면서 다른 공격기가 있으면)은 적 공격에 반응하도록 가급적 아끼되, 공격기가 그것뿐이면 사용
            const offensive = ready.filter(({ s }) => s.form !== 'PARRY');
            const pool = offensive.length > 0 ? offensive : ready;

            if (pool.length > 0 && dist <= 290) {
              const pick =
                Math.random() < 0.65
                  ? [...pool].sort((a, b) => b.s.power - a.s.power)[0]
                  : pool[Math.floor(Math.random() * pool.length)];
              launchSkill(f, opp, pick.s, pick.formNum, isP, now, false);
              const pace = isP && state.battleTactic === 'AGGRESSIVE' ? 920 : 1220;
              metaRef.current[thinkKey] = now + pace / speedRef.current;
            } else {
              metaRef.current[thinkKey] = now + 320;
            }
          }
        };

        runAi(p, e, true, 'pThinkAt');
        runAi(e, p, false, 'eThinkAt');

        p.x = Math.max(92, Math.min(CANVAS_W - 92, p.x));
        e.x = Math.max(92, Math.min(CANVAS_W - 92, e.x));

        // 8프레임 공격 시퀀스 타임라인 진행 (스텝인 → 치켜듦 → 1타 베기 → [2타 역베기] → 회수)
        const updateAct = (f: FighterRuntime, opp: FighterRuntime, isP: boolean) => {
          const act = f.action;
          if (!act) return;
          const elapsed = (now - act.startAt) * speedRef.current;
          const facing = opp.x >= f.x ? 1 : -1;

          // Step-in 전진 스텝(Frame 1)
          if (!act.stepInDone && elapsed >= act.stepInMs * 0.4) {
            act.stepInDone = true;
            if (Math.abs(opp.x - f.x) > 125) {
              f.x = Math.max(92, Math.min(CANVAS_W - 92, f.x + facing * (act.isCounterRiposte ? 42 : 24)));
              spawnDust(f.x, facing);
            }
          }

          // 1타 판정 (Frame 3 또는 카운터/찌르기 Frame 6)
          if (!act.hit1Done && elapsed >= act.stepInMs + act.windupMs) {
            act.hit1Done = true;
            resolveStrike(f, opp, act, isP, now, false);
          }

          // 2연격 판정 (Frame 4 하단 역베기!)
          if (act.combo2Ms > 0 && act.hit1Done && !act.hit2Done && elapsed >= act.stepInMs + act.windupMs + act.strikeMs) {
            act.hit2Done = true;
            if (opp.hp > 0) resolveStrike(f, opp, act, isP, now, true);
          }

          const totalDur = act.stepInMs + act.windupMs + act.strikeMs + act.combo2Ms + act.recoveryMs;
          if (elapsed >= totalDur) {
            f.action = null;
          }
        };
        updateAct(p, e, true);
        updateAct(e, p, false);

        // 비행 검기/원거리 파동 업데이트 & 충돌
        wavesRef.current = wavesRef.current.filter((wv) => {
          wv.x += wv.vx * dt;
          wv.life -= dt;
          if (Math.random() < 0.65) {
            particlesRef.current.push({
              x: wv.x,
              y: wv.y + (Math.random() - 0.5) * 32,
              vx: -wv.facing * 1.5,
              vy: (Math.random() - 0.5) * 1.5,
              life: 0.22,
              maxLife: 0.22,
              color: wv.color,
              size: 4,
              gravity: 0,
            });
          }
          const target = wv.fromPlayer ? e : p;
          const attacker = wv.fromPlayer ? p : e;
          if (!wv.hit && Math.abs(wv.x - target.x) < 48) {
            wv.hit = true;
            const prof = getSkillVfxProfile(wv.skill, false);
            applyImpact(attacker, target, wv.skill, wv.fromPlayer, now, prof, false, 1.0, false);
            return false;
          }
          return wv.life > 0 && wv.x > -60 && wv.x < CANVAS_W + 60;
        });

        if (p.hp <= 0 || e.hp <= 0) {
          metaRef.current.finished = true;
          const victory = e.hp <= 0;
          if (victory) sound.playLevelUp();
          const finalPayload: BattleOutcomePayload = {
            victory,
            fighterType,
            discipleId: fighterType === 'DISCIPLE' ? selectedDiscipleId : undefined,
            usedMagic: metaRef.current.usedMagic,
            usedForbidden: metaRef.current.usedForbidden,
            justParriesCount: metaRef.current.justParries,
            recoilHealthLoss: metaRef.current.recoilHealthLoss,
            recoilLifespanYears: metaRef.current.recoilLifespanYears,
            hpRemainingRatio: p.hp / p.maxHp,
          };
          setCommentary(victory ? `승부 결정! 【${p.sectTitle}】 ${p.name}의 승리!` : `승부 결정! ${e.name}에게 쓰러졌다…`);
          setTimeout(() => {
            setResultOutcome(finalPayload);
            setStage('RESULT');
          }, 1150);
        }
      }

      // 이펙트 파티클/잔상/VFX 수명 갱신
      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += pt.gravity ?? 0.16;
        pt.life -= dt;
        return pt.life > 0;
      });
      floatsRef.current = floatsRef.current.filter((fl) => {
        fl.y -= 28 * dt;
        fl.life -= dt;
        return fl.life > 0;
      });
      ghostsRef.current = ghostsRef.current.filter((g) => {
        g.life -= dt;
        return g.life > 0;
      });
      vfxSpritesRef.current = vfxSpritesRef.current.filter((v) => {
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        v.life -= dt;
        return v.life > 0;
      });
      slashLinesRef.current = slashLinesRef.current.filter((sl) => {
        sl.life -= dt;
        return sl.life > 0;
      });
      ringsRef.current = ringsRef.current.filter((rg) => {
        rg.life -= dt;
        rg.radius = rg.maxRadius * (1 - rg.life / rg.maxLife);
        return rg.life > 0;
      });
      magicFxRef.current = magicFxRef.current.filter((mf) => {
        mf.life -= dt;
        return mf.life > 0;
      });

          // ★ 32비트 8프레임 그리드 시트 + 모바일 세로 다이나믹 팔로우 카메라 + 가산합성 VFX 렌더링 ★
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.save();

          // 모바일 세로 화면(viewW=520)에서는 두 무인의 중점을 부드럽게 추적하는 다이나믹 격투 카메라!
          const midX = (p.x + e.x) / 2;
          const minCam = viewW / 2;
          const maxCam = CANVAS_W - viewW / 2;
          const targetCamX = viewW < CANVAS_W ? Math.max(minCam, Math.min(maxCam, midX)) : CANVAS_W / 2;
          battleCamXRef.current += (targetCamX - battleCamXRef.current) * Math.min(1, rawDt * 8);
          const camLeft = viewW < CANVAS_W ? Math.round(battleCamXRef.current - viewW / 2) : 0;
          const camTop = viewH < CANVAS_H ? Math.round((CANVAS_H - viewH) * 0.65) : 0;

          if (now < metaRef.current.shakeUntil) {
            const sp = metaRef.current.shakePower;
            ctx.translate((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp * 0.7);
          }

          ctx.save();
          ctx.translate(-camLeft, -camTop);

          // 배경 무대
          const bgImg = loadRawImage(battle.isRealDuel ? '/assets/px_battle_duel_stage.jpg' : '/assets/px_battle_stage.jpg');
          if (bgImg) ctx.drawImage(bgImg, 0, 0, CANVAS_W, CANVAS_H);
          else { ctx.fillStyle = '#1a120d'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }

          // 오의·극의·카운터 발동 시 먹물 암전 (Ink Dimming)
          if (now < metaRef.current.inkFlashUntil) {
            ctx.fillStyle = 'rgba(10, 6, 4, 0.52)';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          } else if (now < metaRef.current.cutinUntil) {
            ctx.fillStyle = 'rgba(10, 6, 4, 0.25)';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          }

          // 고속 잔상(Afterimage Ghost) 렌더링 (Foot-Anchor 피벗 적용!)
          ghostsRef.current.forEach((g) => {
            const sheet = getGridSpriteSheet(g.sheetSrc, 4, 2);
            if (!sheet || sheet.frames.length < 8) return;
            const sp = sheet.frames[g.frameIdx % sheet.frames.length];
            const ratio = 176 / Math.max(1, sheet.refHeight);
            const dw = Math.round(sp.width * ratio);
            const dh = Math.round(sp.height * ratio);
            const ax = Math.round(sp.anchorX * ratio);
            ctx.save();
            ctx.globalAlpha = (g.life / g.maxLife) * 0.45;
            ctx.translate(Math.round(g.x), g.y);
            ctx.scale(g.flipX, 1);
            ctx.drawImage(sp.ghostCanvas || sp.canvas, -ax, -dh + 6, dw, dh);
            ctx.restore();
          });

          // 8프레임 무술 포즈 결정기 (초식 형태별 정밀 분기: SLASH / THRUST / STRIKE·GRAPPLE / STEP / PARRY!)
          const resolvePoseFrame = (f: FighterRuntime): number => {
            if (now < f.hurtPoseUntil) return 7; // [7] 피격 밀림
            if (now < f.blockingUntil || f.pendingCounter) return 5; // [5] 패링/흘리기 방어
            if (f.action) {
              const act = f.action;
              const el = (now - act.startAt) * speedRef.current;
              const form = act.skill.form;
              if (el < act.stepInMs) return 1; // [1] 저자세 스텝인
              if (el < act.stepInMs + act.windupMs) {
                if (act.isCounterRiposte) return 5;
                if (form === 'STRIKE' || form === 'GRAPPLE' || form === 'STEP') return 1; // 체당·보법은 저자세 응축!
                return 2; // [2] 상단 치켜듦
              }
              if (el < act.stepInMs + act.windupMs + act.strikeMs) {
                if (act.isCounterRiposte || form === 'THRUST' || form === 'STRIKE' || form === 'GRAPPLE') return 6; // [6] 일섬 반격·관통·발경 돌진!
                if (form === 'STEP') return 4; // 보법은 하단 섬격!
                return 3; // [3] 전방 전력 베기!
              }
              if (act.combo2Ms > 0 && el < act.stepInMs + act.windupMs + act.strikeMs + act.combo2Ms) {
                return 4; // [4] 하단 역베기 2연격!
              }
              return act.isCounterRiposte || form === 'THRUST' ? 6 : 4;
            }
            if (f.moving) return Math.floor(now / 150) % 2 === 0 ? 1 : 0; // 전진 보법
            return 0; // [0] 전투 대기 자세
          };

          const drawFighter = (f: FighterRuntime, sheetSrc: string, nativeDir: 1 | -1, wantDir: 1 | -1, isHeroSide: boolean) => {
            const drawX = Math.round(f.x + f.lungeOffset);

            // ★ 패배(HP <= 0) 시 실제 바닥에 쓰러진 KO 스프라이트(grid_ko_fallen_4x2.jpg) 렌더링! ★
            if (f.hp <= 0) {
              const koSheet = getGridSpriteSheet('/assets/grid_ko_fallen_4x2.jpg', 4, 2);
              ctx.fillStyle = 'rgba(10, 8, 5, 0.55)';
              ctx.beginPath();
              ctx.ellipse(drawX, GROUND_Y + 2, 76, 14, 0, 0, Math.PI * 2);
              ctx.fill();
              if (koSheet && koSheet.frames.length >= 8) {
                const koIdx = getKoFallenIndex({
                  isHero: isHeroSide,
                  country: heroCountry,
                  gender: heroGender,
                  age: f.age,
                  enemySrc: isHeroSide ? undefined : sheetSrc,
                });
                const sp = koSheet.frames[koIdx];
                // KO 8종(무릎 꿇은 자세 / 완전히 누운 자세) 모두 자연스러운 크기로 바닥에 착지!
                const ratio = Math.min(168 / Math.max(1, sp.width), 104 / Math.max(1, sp.height));
                const dw = Math.round(sp.width * ratio);
                const dh = Math.round(sp.height * ratio);
                // grid_ko_fallen_4x2에서 0번만 우향, 1~7번은 좌향
                const koNativeRight = koIdx === 0;
                const flipKo = isHeroSide ? (koNativeRight ? 1 : -1) : (koNativeRight ? -1 : 1);
                ctx.save();
                ctx.translate(drawX, GROUND_Y + 6);
                ctx.scale(flipKo, 1);
                ctx.drawImage(sp.canvas, -dw / 2, -dh, dw, dh);
                ctx.restore();
              }
              return;
            }

            const sheet = getGridSpriteSheet(sheetSrc, 4, 2);

            // 그림자
            ctx.fillStyle = 'rgba(10, 8, 5, 0.48)';
            ctx.beginPath();
            ctx.ellipse(drawX, GROUND_Y, 56, 13, 0, 0, Math.PI * 2);
            ctx.fill();

            // 절대고수(검마 혈영 / 백운검선) 전용 상시 발밑 기세 오라!
            if (!isHeroSide && (sheetSrc.includes('gm_demon') || sheetSrc.includes('gm_sage'))) {
              ctx.save();
              ctx.globalAlpha = 0.48 + Math.sin(now / 170) * 0.16;
              ctx.strokeStyle = sheetSrc.includes('gm_demon') ? '#ef4444' : '#7dd3fc';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.ellipse(drawX, GROUND_Y - 1, 56 + Math.sin(now / 130) * 8, 13, 0, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }

            // 기 모으기 오라 (Windup 중 레벨 3 이상이면 발밑에 기공 파동 링!)
            if (f.action && !f.action.hit1Done && f.action.skill.masteryLevel >= 3) {
              const prof = getSkillVfxProfile(f.action.skill, Boolean(f.action.isCounterRiposte));
              ctx.save();
              ctx.globalAlpha = 0.55;
              ctx.strokeStyle = prof.color;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.ellipse(drawX, GROUND_Y - 2, 42 + Math.sin(now / 45) * 10, 12, 0, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }

            if (!sheet || sheet.frames.length < 8) return;
            const fIdx = resolvePoseFrame(f);
            const sp = sheet.frames[fIdx];
            const ratio = 176 / Math.max(1, sheet.refHeight);
            const dw = Math.round(sp.width * ratio);
            const dh = Math.round(sp.height * ratio);
            const ax = Math.round(sp.anchorX * ratio);
            const flipX = nativeDir === wantDir ? 1 : -1;
            const breathY = fIdx === 0 ? Math.sin(now / 260) * 2 : 0;

            ctx.save();
            ctx.translate(drawX, GROUND_Y - breathY);
            ctx.scale(flipX, 1);
            ctx.drawImage(now < f.hurtFlashUntil ? sp.flashCanvas : sp.canvas, -ax, -dh + 6, dw, dh);
            ctx.restore();

            // ★ 캐릭터 머리 위 무협 기술 외침 말풍선! ★
            if (now < f.shoutUntil && f.shoutText) {
              const bx = Math.max(130, Math.min(CANVAS_W - 130, drawX));
              const by = GROUND_Y - 196;
              ctx.save();
              ctx.font = 'bold 13px NeoDunggeunmo, monospace';
              const tw = ctx.measureText(f.shoutText).width;
              const pw = Math.max(116, tw + 22);
              const ph = f.shoutSub ? 38 : 26;
              ctx.fillStyle = f.shoutIsCounter ? 'rgba(92, 18, 16, 0.94)' : 'rgba(20, 13, 8, 0.92)';
              ctx.fillRect(Math.round(bx - pw / 2), Math.round(by - ph), Math.round(pw), ph);
              ctx.strokeStyle = f.shoutIsCounter ? '#fde047' : '#d4a359';
              ctx.lineWidth = 2;
              ctx.strokeRect(Math.round(bx - pw / 2), Math.round(by - ph), Math.round(pw), ph);
              // 말풍선 꼬리
              ctx.fillStyle = f.shoutIsCounter ? '#fde047' : '#d4a359';
              ctx.fillRect(Math.round(bx - 3), Math.round(by), 6, 5);

              ctx.textAlign = 'center';
              ctx.fillStyle = f.shoutIsCounter ? '#fde047' : '#fff7d6';
              ctx.fillText(f.shoutText, bx, by - (f.shoutSub ? 20 : 8));
              if (f.shoutSub) {
                ctx.font = '10px NeoDunggeunmo, monospace';
                ctx.fillStyle = '#93c5fd';
                ctx.fillText(f.shoutSub, bx, by - 6);
              }
              ctx.restore();
            }
          };

          drawFighter(p, heroGridSrc, heroNativeDir, e.x >= p.x ? 1 : -1, true);
          drawFighter(e, enemyGridSrc, -1, p.x >= e.x ? 1 : -1, false);

          // ★ 마법 · 속성 전용 시네마틱 이펙트 (화염 기둥 / 천뢰 낙하 / 빙결 창 / 고대 마법진 / 강기 파동!) ★
          magicFxRef.current.forEach((mf) => {
            const pRatio = mf.life / mf.maxLife;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            if (mf.kind === 'FIRE') {
              const grad = ctx.createLinearGradient(mf.x, GROUND_Y, mf.x, 70);
              grad.addColorStop(0, `rgba(255, 190, 40, ${pRatio * 0.9})`);
              grad.addColorStop(0.5, `rgba(255, 70, 20, ${pRatio * 0.75})`);
              grad.addColorStop(1, 'rgba(180, 20, 0, 0)');
              ctx.fillStyle = grad;
              const pw = 66 + (1 - pRatio) * 44;
              ctx.fillRect(Math.round(mf.x - pw / 2), 70, Math.round(pw), GROUND_Y - 70);
            } else if (mf.kind === 'LIGHTNING') {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 7 * pRatio;
              ctx.beginPath();
              let lx = mf.x;
              ctx.moveTo(lx, 0);
              for (let ly = 40; ly <= GROUND_Y; ly += 42) {
                lx = mf.x + (Math.random() - 0.5) * 46;
                ctx.lineTo(lx, ly);
              }
              ctx.stroke();
              ctx.strokeStyle = '#c084fc';
              ctx.lineWidth = 14 * pRatio;
              ctx.stroke();
            } else if (mf.kind === 'ICE') {
              for (let k = -2; k <= 2; k++) {
                const sx = mf.x + k * 24;
                const sh = (95 - Math.abs(k) * 18) * Math.min(1, (1 - pRatio) * 3.5);
                ctx.fillStyle = `rgba(125, 211, 252, ${pRatio * 0.85})`;
                ctx.beginPath();
                ctx.moveTo(sx - 12, GROUND_Y);
                ctx.lineTo(sx, GROUND_Y - sh);
                ctx.lineTo(sx + 12, GROUND_Y);
                ctx.closePath();
                ctx.fill();
              }
            } else if (mf.kind === 'SHADOW') {
              ctx.globalAlpha = pRatio * 0.85;
              ctx.translate(mf.x, 255);
              ctx.rotate((1 - pRatio) * 3.2);
              ctx.strokeStyle = '#d946ef';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(0, 0, 74, 0, Math.PI * 2);
              ctx.stroke();
              ctx.strokeRect(-48, -48, 96, 96);
              ctx.rotate(Math.PI / 4);
              ctx.strokeRect(-48, -48, 96, 96);
            } else if (mf.kind === 'QI') {
              ctx.globalAlpha = pRatio * 0.7;
              ctx.strokeStyle = '#fde047';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(mf.x, 255, 35 + (1 - pRatio) * 125, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
          });

          // ★ 가산합성(Additive Blend) 32비트 무술 VFX 스프라이트 + 비행 검기 파동! ★
          const vfxSheet = getVfxGridSheet('/assets/grid_vfx_martial_8f.jpg', 4, 2);
          if (vfxSheet && vfxSheet.frames.length === 8) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            vfxSpritesRef.current.forEach((v) => {
              const cell = vfxSheet.frames[v.vfxIdx % 8];
              const alpha = Math.min(1, (v.life / v.maxLife) * 1.4);
              const size = Math.round(170 * v.scale);
              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.translate(Math.round(v.x), Math.round(v.y));
              ctx.rotate(v.rotation);
              ctx.scale(v.flipX, 1);
              ctx.drawImage(cell, -size / 2, -size / 2, size, size);
              ctx.restore();
            });

            wavesRef.current.forEach((wv) => {
              const cell = vfxSheet.frames[wv.vfxIdx % 8];
              const size = Math.round(145 * wv.scale);
              ctx.save();
              ctx.translate(Math.round(wv.x), Math.round(wv.y));
              ctx.scale(wv.facing, 1);
              ctx.drawImage(cell, -size / 2, -size / 2, size, size);
              ctx.restore();
            });
            ctx.restore();
          }

          // 일섬선 & 충격파 링
          slashLinesRef.current.forEach((sl) => {
            ctx.save();
            ctx.globalAlpha = sl.life / sl.maxLife;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = sl.width + 3;
            ctx.beginPath();
            ctx.moveTo(sl.x1, sl.y1);
            ctx.lineTo(sl.x2, sl.y2);
            ctx.stroke();
            ctx.strokeStyle = sl.color;
            ctx.lineWidth = sl.width;
            ctx.stroke();
            ctx.restore();
          });

          ringsRef.current.forEach((rg) => {
            ctx.save();
            ctx.globalAlpha = (rg.life / rg.maxLife) * 0.85;
            ctx.strokeStyle = rg.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(rg.x, rg.y, rg.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          });

          // 픽셀 파티클
          particlesRef.current.forEach((pt) => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
            ctx.fillStyle = pt.color;
            ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
            ctx.restore();
          });

          // 데미지·상태 팝업 텍스트 (월드 좌표 종료!)
          floatsRef.current.forEach((fl) => {
            ctx.font = `bold ${Math.round(17 * (fl.scale || 1))}px NeoDunggeunmo, monospace`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#120a06';
            ctx.fillText(fl.text, Math.round(fl.x) + 2, Math.round(fl.y) + 2);
            ctx.fillStyle = fl.color;
            ctx.fillText(fl.text, Math.round(fl.x), Math.round(fl.y));
          });

          ctx.restore(); // 월드 카메라 변환 해제 → 화면 기준 오버레이(타임슬로우·암전연참·컷인·간파) 중앙 정렬!

          // ★ 극한 필살기 타임 슬로우 기류 집중선 (Speed Lines + 수묵 비네팅) ★
          if (now < metaRef.current.timeSlowUntil) {
            ctx.save();
            ctx.fillStyle = 'rgba(8, 5, 4, 0.34)';
            ctx.fillRect(0, 0, viewW, viewH);
            ctx.strokeStyle = metaRef.current.timeSlowColor;
            ctx.globalAlpha = 0.42;
            ctx.lineWidth = 2;
            const cx = viewW / 2;
            const cy = viewH / 2;
            for (let i = 0; i < 18; i++) {
              const a = (i / 18) * Math.PI * 2 + (now / 400);
              ctx.beginPath();
              ctx.moveTo(cx + Math.cos(a) * (viewW * 0.28), cy + Math.sin(a) * (viewH * 0.28));
              ctx.lineTo(cx + Math.cos(a) * (viewW * 0.65), cy + Math.sin(a) * (viewH * 0.65));
              ctx.stroke();
            }
            ctx.restore();
          }

          // ★ 극의 절명 반격 「초다이나믹 암전 일섬 연참 (눈빛 섬광 → 9연 테이퍼드 검흔 & 잔상 교차 → 납도 정적 → 폭발!!)」 ★
          if (darkSlashRef.current?.active) {
            const ds = darkSlashRef.current;
            const el = now - ds.startAt;
            ctx.save();

            // 양끝이 날카롭게 뾰족한 다이아몬드/테이퍼드 검흔 드로잉 헬퍼!
            const drawTaperedSlash = (x1: number, y1: number, x2: number, y2: number, halfW: number, glowCol: string, alpha = 1) => {
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const dx = x2 - x1;
              const dy = y2 - y1;
              const dist = Math.hypot(dx, dy) || 1;
              const nx = (-dy / dist) * halfW;
              const ny = (dx / dist) * halfW;
              ctx.save();
              ctx.globalAlpha = alpha;
              // 외곽 광원 글로우
              ctx.fillStyle = glowCol;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.quadraticCurveTo(mx + nx * 1.45, my + ny * 1.45, x2, y2);
              ctx.quadraticCurveTo(mx - nx * 1.45, my - ny * 1.45, x1, y1);
              ctx.fill();
              // 순백 강철 코어
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.quadraticCurveTo(mx + nx * 0.55, my + ny * 0.55, x2, y2);
              ctx.quadraticCurveTo(mx - nx * 0.55, my - ny * 0.55, x1, y1);
              ctx.fill();
              ctx.restore();
            };

            if (el < 780) {
              // 1) 칠흑 수묵 암전 + 상하 시네마틱 레터박스
              ctx.fillStyle = el < 680 ? 'rgba(3, 1, 4, 0.94)' : 'rgba(18, 2, 4, 0.92)';
              ctx.fillRect(0, 0, viewW, viewH);

              // 2) Phase 1 (0~140ms): 수평 칼날/눈빛 섬광!
              if (el < 170) {
                const p = el / 170;
                const span = viewW * (0.3 + p * 0.8);
                drawTaperedSlash(viewW / 2 - span / 2, viewH * 0.48, viewW / 2 + span / 2, viewH * 0.48, 8 * (1 - p * 0.5), '#fde047', 1 - p * 0.3);
              }

              // 3) 암전 속 시전자 청백/황금 실루엣 잔상 3체 교차!
              const gSheet = getGridSpriteSheet(ds.attackerSheet, 4, 2);
              if (gSheet && gSheet.frames.length >= 8) {
                ds.ghostSpots.forEach((gs) => {
                  if (el < gs.atMs) return;
                  const age = el - gs.atMs;
                  const fade = Math.max(0.14, 0.52 - age / 900);
                  const sp = gSheet.frames[gs.frameIdx % 8];
                  const ratio = 176 / Math.max(1, gSheet.refHeight);
                  const dw = Math.round(sp.width * ratio);
                  const dh = Math.round(sp.height * ratio);
                  const ax = Math.round(sp.anchorX * ratio);
                  ctx.save();
                  ctx.globalAlpha = fade;
                  ctx.translate(Math.round(gs.x - camLeft), Math.round(gs.y - camTop));
                  ctx.scale(gs.flip, 1);
                  ctx.drawImage(sp.ghostCanvas || sp.canvas, -ax, -dh + 6, dw, dh);
                  ctx.restore();
                });
              }

              // 4) Phase 2~3: 가속 9연참 테이퍼드 검흔 + 교차 불꽃!
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ds.scars.forEach((sc) => {
                if (el < sc.atMs) return;
                const since = el - sc.atMs;
                const prog = Math.min(1, since / 65);
                const x1 = sc.x1 - camLeft;
                const y1 = sc.y1 - camTop;
                const x2 = x1 + (sc.x2 - sc.x1) * prog;
                const y2 = y1 + (sc.y2 - sc.y1) * prog;
                const pulse = el >= 680 ? 1.15 : 1.0;
                const col = sc.isFinisherLine ? '#ef4444' : ds.color;
                drawTaperedSlash(x1, y1, x2, y2, (sc.width / 2) * pulse, col, sc.isFinisherLine ? 1 : 0.92);
              });
              ctx.restore();

              // 5) 시네마틱 상하 레터박스 + 먹물 오의명
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, viewW, 38);
              ctx.fillRect(0, viewH - 34, viewW, 34);
              ctx.fillStyle = ds.color;
              ctx.fillRect(0, 38, viewW, 2);
              ctx.fillRect(0, viewH - 35, viewW, 2);

              ctx.textAlign = 'center';
              ctx.font = 'bold 17px "Noto Serif KR", NeoDunggeunmo, serif';
              ctx.fillStyle = '#fde68a';
              ctx.fillText(ds.title, viewW / 2, 26);

              if (el >= 680) {
                ctx.font = 'bold 12px NeoDunggeunmo, monospace';
                ctx.fillStyle = '#fca5a5';
                ctx.fillText('— 納 刀 (납 도) —', viewW / 2, viewH - 13);
              }
            } else {
              // Phase 4 (780~1020ms): 백색·진홍 시간 파열 플래시 → 적 쓰러짐!
              const fade = Math.max(0, 1 - (el - 780) / 240);
              ctx.fillStyle = `rgba(255, 245, 235, ${fade * 0.92})`;
              ctx.fillRect(0, 0, viewW, viewH);
            }
            ctx.restore();
          }

          // ★ 오의 · 고숙련 · 카운터 반격 먹물 캘리그래피 컷인 배너! ★
          if (now < metaRef.current.cutinUntil) {
            ctx.save();
            ctx.fillStyle = 'rgba(16, 9, 5, 0.88)';
            ctx.fillRect(0, 18, viewW, 56);
            ctx.fillStyle = metaRef.current.cutinColor;
            ctx.fillRect(0, 18, viewW, 3);
            ctx.fillRect(0, 72, viewW, 3);

            ctx.textAlign = 'center';
            ctx.font = 'bold 12px NeoDunggeunmo, monospace';
            ctx.fillStyle = '#e6d8be';
            ctx.fillText(
              metaRef.current.cutinTrait
                ? `${metaRef.current.cutinSect} · ${metaRef.current.cutinTrait}`
                : metaRef.current.cutinSect,
              viewW / 2,
              36
            );

            ctx.font = 'bold 24px "Noto Serif KR", NeoDunggeunmo, serif';
            ctx.fillStyle = metaRef.current.cutinColor;
            ctx.fillText(metaRef.current.cutinSkill, viewW / 2, 65);
            ctx.restore();
          }

          // 간파(看破) 순간 백색 플래시 + 붉은 붓글씨 인장
          if (now < metaRef.current.parryFlashUntil) {
            ctx.fillStyle = 'rgba(255, 248, 215, 0.3)';
            ctx.fillRect(0, 0, viewW, viewH);
            ctx.font = 'bold 70px "Noto Serif KR", NeoDunggeunmo, serif';
            ctx.fillStyle = '#b52b27';
            ctx.textAlign = 'center';
            ctx.fillText('看破', viewW / 2, Math.round(viewH * 0.42));
          }

          ctx.restore();
        }
      }

      if (now - lastHud > 85) {
        lastHud = now;
        setHudTick((v) => v + 1);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stage, battle, fighterType, selectedDiscipleId, state.battleTactic, state.gender, state.country, state.age, viewW, viewH]);

  const p = playerRef.current;
  const e = enemyRef.current;

  if (stage === 'SETUP') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-[#120c09]">
        <div className="rpg-window max-w-xl w-full p-4 sm:p-5 space-y-4 animate-ink max-h-[92vh] overflow-y-auto">
          <div className="flex items-start justify-between border-b-2 border-[#6b4728] pb-3 gap-3">
            <div className="space-y-1 min-w-0">
              <InGameTooltip {...(battle.isRealDuel ? HANJA_GLOSSARY.DUEL_REAL : HANJA_GLOSSARY.DUEL_SPAR)}>
                <span className={`text-xs px-2 py-0.5 inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 ${battle.isRealDuel ? 'seal-badge' : 'bg-[#2c4c6e] text-white border border-[#93c5fd]'}`}>
                  {battle.isRealDuel ? <><Skull className="w-3.5 h-3.5" /> 진검결투</> : '비무 · 대련'}
                </span>
              </InGameTooltip>
              <h2 className="text-base sm:text-xl font-bold text-[#fde68a] truncate">{battle.title}</h2>
              <p className="text-xs text-[#c7b394]">{battle.subtitle}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right text-xs">
                <div className="font-bold text-rose-400">{battle.enemyName}</div>
                <div className="text-[11px] text-[#c7b394]">{enemySectName} · HP {battle.enemyHp}</div>
              </div>
              <PixelPortrait role={battle.isRivalBattle ? 'RIVAL' : 'ENEMY'} country={state.country} age={battle.enemyAge} variantHint={battle.enemyName} size={50} />
            </div>
          </div>

          {battle.isTournament && battle.tournamentRound && (
            <div className="bg-[#24180f] border border-[#d4a359] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-[#fde68a] flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> 대진 진행 현황
                </span>
                <span className="text-amber-300">
                  기대 명성 기준: {TOURNAMENT_ROUNDS[battle.tournamentRound - 1]?.expectedFame} (현재 {state.fame})
                </span>
              </div>
              <div className="grid grid-cols-8 gap-0.5 text-center text-[9px] sm:text-[10px]">
                {TOURNAMENT_ROUNDS.map((r) => {
                  const cur = r.round === battle.tournamentRound;
                  const done = r.round < (battle.tournamentRound || 1);
                  return (
                    <div
                      key={r.round}
                      className={`py-1 border font-bold ${
                        cur
                          ? 'bg-[#b52b27] border-[#fde047] text-white'
                          : done
                          ? 'bg-[#2a3b24] border-emerald-500/60 text-emerald-200'
                          : 'bg-[#120c08] border-[#4a3423] text-[#8f7c66]'
                      }`}
                    >
                      {r.label.replace('전', '')}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {battle.isRealDuel && (
            <div className="bg-[#4a1212] border border-[#ef4444] p-2.5 text-xs text-[#fecaca]">
              ⚠ 진검결투: 패배 시 즉사 또는 영구 장애(외팔·실명) 위험!
            </div>
          )}

          {/* 나와 상대방의 6대 능력치 한눈에 비교 보드! */}
          <div className="bg-[#1b120c] border border-[#6b4728] p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[#fde68a]">{state.name} ({state.age}세)</span>
              <span className="text-[#c7b394] text-[10px]">6대 능력치 비교</span>
              <span className="text-rose-300">{battle.enemyName} ({battle.enemyAge}세)</span>
            </div>
            <div className="grid grid-cols-6 gap-1 text-center text-[10px]">
              {([
                ['근력', state.stats.str, battle.enemyStats.str],
                ['민첩', state.stats.agi, battle.enemyStats.agi],
                ['체력', state.stats.vit, battle.enemyStats.vit],
                ['정신', state.stats.wil, battle.enemyStats.wil],
                ['통찰', state.stats.ins, battle.enemyStats.ins],
                ['영력', state.stats.qi, battle.enemyStats.qi],
              ] as const).map(([lbl, myV, enV]) => (
                <div key={lbl} className="bg-[#120c08] border border-[#4a3423] py-1 px-0.5">
                  <div className="text-[9px] text-[#c7b394]">{lbl}</div>
                  <div className={`font-bold ${myV >= enV ? 'text-emerald-300' : 'text-amber-300'}`}>{myV}</div>
                  <div className="text-[9px] text-rose-400/90 border-t border-[#322217] mt-0.5 pt-0.5">{enV}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 전투 방침 3택 1 */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#fde68a]">비무 방침</div>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {([
                { id: 'AGGRESSIVE', label: '⚔ 적극 공세', sub: '공격력·속도↑' },
                { id: 'BALANCED', label: '⚖ 균형', sub: '표준 대응' },
                { id: 'COUNTER', label: '🛡 간파 반격', sub: '흘리기·반격↑' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { sound.playClick(); onChangeTactic(t.id); }}
                  className={`p-2 text-center border-2 cursor-pointer ${
                    state.battleTactic === t.id ? 'bg-[#4a2b1a] border-[#fde047] text-[#fde68a]' : 'bg-[#1b120c] border-[#5c432c] text-[#d6cbb8]'
                  }`}
                >
                  <div className="text-[11px] sm:text-xs font-bold whitespace-nowrap">{t.label}</div>
                  <div className="text-[10px] text-[#c7b394] leading-tight mt-0.5">{t.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 출전자 선택 */}
          <div className="space-y-2">
            <button onClick={() => beginWatch('HERO')} className="w-full seal-badge py-3 px-3 sm:px-4 flex items-center justify-between cursor-pointer gap-2">
              <span className="flex items-center gap-1.5 font-bold text-xs sm:text-sm truncate">
                <User className="w-4 h-4 shrink-0" /> 도장주 직접 출전 ({state.name}, {state.age}세)
              </span>
              <span className="text-xs shrink-0">HP {Math.round(110 + state.stats.vit * 6)}</span>
            </button>

            {battle.canUseDisciple && aliveDisciples.length > 0 && (
              <div className="bg-[#1b120c] border border-[#6b4728] p-2.5 space-y-2">
                <div className="text-xs font-bold text-[#fde68a] flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> 문하생 · 자녀 대리 출전
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {aliveDisciples.map((d) => (
                    <button key={d.id} onClick={() => beginWatch('DISCIPLE', d.id)} className="rpg-btn text-left p-2 text-xs cursor-pointer">
                      <div className="font-bold text-[#fde68a] truncate">{d.name} ({d.age})</div>
                      <div className="text-[10px] text-[#c7b394]">⚔{d.stats.str} ⚡{d.stats.agi} 👁{d.stats.ins}</div>
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
    <div className="fixed inset-0 flex flex-col justify-between bg-[#120c09] text-[#f5ecd9] p-2 sm:p-3 select-none overflow-hidden" data-tick={hudTick}>
      {/* 상단 HUD + 관전 배속 */}
      <div className="max-w-4xl w-full mx-auto space-y-1.5">
        <div className="grid grid-cols-2 gap-2 rpg-window p-2">
          <div className="space-y-1 min-w-0">
            <div className="flex justify-between gap-1 text-[11px] sm:text-sm">
              <span className="font-bold text-[#fde68a] truncate">{p?.name} ({p?.age})</span>
              <span className="text-rose-300 text-[10px] sm:text-xs shrink-0">{Math.ceil(p?.hp || 0)}/{p?.maxHp}</span>
            </div>
            <div className="h-3 bg-[#120c08] border border-[#8c6239]">
              <div className="h-full bg-[#c93b2b] transition-all duration-100" style={{ width: `${Math.max(0, ((p?.hp || 0) / (p?.maxHp || 1)) * 100)}%` }} />
            </div>
            <div className="h-1.5 bg-[#120c08] border border-[#6b4728]">
              <div className="h-full bg-blue-500" style={{ width: `${((p?.qi || 0) / (p?.maxQi || 1)) * 100}%` }} />
            </div>
            {p && (
              <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-[#c7b394] whitespace-nowrap overflow-hidden">
                <span>⚔{p.stats.str}</span>
                <span>⚡{p.stats.agi}</span>
                <span>👁{p.stats.ins}</span>
                <span>💧{p.stats.qi}</span>
              </div>
            )}
          </div>

          <div className="space-y-1 text-right min-w-0">
            <div className="flex justify-between gap-1 text-[11px] sm:text-sm">
              <span className="text-rose-300 text-[10px] sm:text-xs shrink-0">{Math.ceil(e?.hp || 0)}/{e?.maxHp}</span>
              <span className="font-bold text-rose-300 truncate">{e?.name} ({e?.age})</span>
            </div>
            <div className="h-3 bg-[#120c08] border border-[#8c6239]">
              <div className="h-full bg-[#b91c1c] ml-auto transition-all duration-100" style={{ width: `${Math.max(0, ((e?.hp || 0) / (e?.maxHp || 1)) * 100)}%` }} />
            </div>
            <div className="h-1.5 bg-[#120c08] border border-[#6b4728]">
              <div className="h-full bg-amber-500 ml-auto" style={{ width: `${((e?.posture || 0) / (e?.maxPosture || 1)) * 100}%` }} />
            </div>
            {e && (
              <div className="flex items-center justify-end gap-1.5 text-[9px] sm:text-[10px] text-rose-200/80 whitespace-nowrap overflow-hidden">
                <span>⚔{e.stats.str}</span>
                <span>⚡{e.stats.agi}</span>
                <span>👁{e.stats.ins}</span>
                <span>💧{e.stats.qi}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs px-1">
          <span className="text-[#e6d8be] truncate min-w-0">▸ {commentary}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setSpeedMult(speedMult === 1 ? 2 : 1)} className="rpg-btn px-2 py-1 text-[11px] font-bold cursor-pointer">
              {speedMult}x
            </button>
            <button onClick={handleInstantResolve} className="rpg-btn px-2 py-1 text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap">
              <FastForward className="w-3 h-3" /> 결과 즉시
            </button>
          </div>
        </div>
      </div>

      {/* 중앙 32비트 8프레임 그리드 무술 자동전투 무대 (모바일 세로에서는 520×400 대형 팔로우 카메라로 1.7배 확대!) */}
      <div
        className={`max-w-4xl w-full mx-auto relative border-4 border-[#8c6239] bg-[#1a130e] flex items-center justify-center overflow-hidden shadow-2xl ${
          isPortrait ? 'aspect-[520/400] flex-1 max-h-[54vh]' : 'aspect-[900/420] my-auto max-h-[60vh]'
        }`}
      >
        <canvas ref={canvasRef} width={viewW} height={viewH} className="pixel-canvas w-full h-full block" />
        {stage === 'RESULT' && resultOutcome && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-3 sm:p-4 animate-ink">
            <div className="rpg-window max-w-md w-full p-4 sm:p-6 text-center space-y-3">
              <h3 className={`text-2xl sm:text-3xl font-bold ${battle.spectatorMode ? 'text-[#fde68a]' : resultOutcome.victory ? 'text-[#fde68a]' : 'text-rose-400'}`}>
                {battle.spectatorMode
                  ? '★ 절정 비무 종료 ★'
                  : resultOutcome.victory
                  ? '★ 승 리 (勝利) ★'
                  : '패 배 (敗北)'}
              </h3>
              <p className="text-xs sm:text-sm text-[#e6d8be]">
                {battle.spectatorMode
                  ? `${resultOutcome.victory ? p?.name : e?.name}의 승리! 두 절정 고수의 초식에서 깊은 깨달음을 얻었다.`
                  : resultOutcome.victory
                  ? `【${p?.sectTitle}】 ${p?.name}의 무술이 상대를 제압했다! (간파 ${resultOutcome.justParriesCount}회)`
                  : battle.isRealDuel
                  ? '진검결투에서 쓰러졌다… 운명의 판정이 기다린다.'
                  : battle.isTournament
                  ? `${battle.title}에서 아쉽게 패배했다.`
                  : '아쉬운 패배였다. 초식을 더 갈고닦자.'}
              </p>
              <button onClick={() => onFinish(resultOutcome)} className="w-full seal-badge py-2.5 sm:py-3 font-bold text-sm cursor-pointer flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> {battle.spectatorMode ? '다음 무대로 ▶' : '결과 확인 ▶'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 모바일 세로 전용 실시간 공방 중계 로그 + 하단 장착 초식 덱 */}
      <div className="max-w-4xl w-full mx-auto space-y-1.5">
        {isPortrait && battleLog.length > 0 && (
          <div className="rpg-window p-2 bg-[#1a110b]/95 space-y-0.5 text-[11px] max-h-20 overflow-hidden">
            {battleLog.slice(-3).map((line, i) => (
              <div key={i} className={`truncate ${i === battleLog.slice(-3).length - 1 ? 'text-[#fde68a] font-bold' : 'text-[#c7b394]'}`}>
                ▸ {line}
              </div>
            ))}
          </div>
        )}

        <div className="rpg-window p-1.5 sm:p-2 flex items-center justify-center gap-1.5 flex-wrap text-[11px]">
        {(p?.skills || []).map((sk, idx) => {
          const Icon = sk.element === 'FIRE' ? Flame : sk.element === 'ICE' ? Snowflake : sk.element === 'LIGHTNING' ? Zap : sk.form === 'PARRY' ? Shield : Swords;
          const isCasting = p?.action?.skill.id === sk.id;
          const latestTrait = sk.imprintedTraits[sk.imprintedTraits.length - 1];
          return (
            <div
              key={sk.id}
              className={`px-2 py-1 border flex items-center gap-1 transition-all ${
                isCasting ? 'bg-[#4a2b1a] border-[#fde047] scale-105' : 'bg-[#1b120c] border-[#6b4728]'
              }`}
            >
              <span className="text-[10px] text-amber-400 font-bold">{idx + 1}식</span>
              <Icon className="w-3 h-3 text-[#fde68a] shrink-0" />
              <span className="font-bold text-[#fde68a] whitespace-nowrap">{sk.customName || sk.name}</span>
              <span className="text-[10px] text-[#c7b394]">Lv.{sk.masteryLevel}</span>
              {sk.form === 'PARRY' && <span className="text-[9px] px-1 bg-amber-900/80 text-amber-200">반격</span>}
              {latestTrait && <span className="hidden sm:inline text-[9px] px-1 bg-[#362417] text-sky-300">{latestTrait.label}</span>}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};
